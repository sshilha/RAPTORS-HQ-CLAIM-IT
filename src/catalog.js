// Loading and saving the editable lists, with renames cascading through existing data.
const { pool, query } = require("./db");
const config = require("./config");

const clone = (x) => JSON.parse(JSON.stringify(x));

async function load() {
  await query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const row = (await query(`SELECT value FROM app_settings WHERE key='catalog'`)).rows[0];
  if (row) {
    const c = normalize(row.value);
    // The app was renamed to Raptors Claim It; upgrade the old default names (custom names are kept)
    let upgraded = false;
    if (["Raptors Training", "Raptors Sign-Ups", "Sign-Ups"].includes(c.app_labels.app_name)) {
      c.app_labels = { ...c.app_labels, app_name: "Raptors Claim It", app_short: "Claim It" }; upgraded = true;
    }
    // Each sign-up space is a "Claim Board" now (unless it's been renamed to something else)
    const sl = (c.app_labels.schedule || [])[0];
    if (!sl || sl === "Schedule") { c.app_labels = { ...c.app_labels, schedule: ["Claim Board", "Claim Boards"] }; upgraded = true; }
    if (upgraded) await query(`UPDATE app_settings SET value=$1, updated_at=now() WHERE key='catalog'`, [JSON.stringify(c)]);
    config.apply(c);
  }
  else {
    await query(`INSERT INTO app_settings (key, value) VALUES ('catalog', $1)`, [JSON.stringify(config.DEFAULT_CATALOG)]);
    config.apply(clone(config.DEFAULT_CATALOG));
  }
}

function normalize(c) {
  return {
    activities: (c.activities || []).map((a) => ({
      name: String(a.name), color: a.color || "#8899aa", all_ages: !!a.all_ages,
      default_spots: a.default_spots || 8, default_block: a.default_block || null,
      default_limit: a.default_limit === null || a.default_limit === undefined ? null : a.default_limit,
      aliases: a.aliases || [], active: a.active !== false, schedule_id: a.schedule_id || null,
    })),
    age_groups: c.age_groups || [], presets: c.presets || [], locations: c.locations || [],
    family_names: c.family_names || "initial",
    app_labels: c.app_labels || require("./config").DEFAULT_CATALOG.app_labels,
    board_settings_moved: !!c.board_settings_moved,
    seasons_flattened: !!c.seasons_flattened,
  };
}

async function save(next, db = { query }) {
  await db.query(`INSERT INTO app_settings (key, value, updated_at) VALUES ('catalog', $1, now())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(next)]);
  config.apply(next);
}

const current = () => clone(config.CATALOG.current);

// How much data refers to an activity / age group (used to block unsafe removals)
// How much of one schedule's data uses an activity
async function activityUsage(name, sid) {
  return (await query(`SELECT
      (SELECT count(*)::int FROM programs p JOIN rounds r ON r.id=p.round_id WHERE p.activity=$1 AND r.schedule_id=$2) AS programs,
      (SELECT count(*)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id
         WHERE p.activity=$1 AND r.schedule_id=$2) AS sessions`, [name, sid])).rows[0];
}
async function groupUsage(name) {
  return (await query(`SELECT
      (SELECT count(*)::int FROM athletes WHERE age_group=$1) AS athletes,
      (SELECT count(*)::int FROM programs WHERE $1 = ANY(age_groups)) AS programs`, [name])).rows[0];
}

async function inTx(fn) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const out = await fn(c); await c.query("COMMIT"); return out; }
  catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}

// Rename a JSON key in one schedule's rounds' limits/defaults
async function renameRoundKeys(db, from, to, sid) {
  const rounds = (await db.query(`SELECT id, activity_limits, activity_defaults FROM rounds WHERE schedule_id=$1`, [sid])).rows;
  for (const r of rounds) {
    const fix = (o) => {
      if (!o || !Object.prototype.hasOwnProperty.call(o, from)) return o;
      const out = {}; for (const [k, v] of Object.entries(o)) out[k === from ? to : k] = v; return out;
    };
    await db.query(`UPDATE rounds SET activity_limits=$2, activity_defaults=$3 WHERE id=$1`,
      [r.id, JSON.stringify(fix(r.activity_limits)), JSON.stringify(fix(r.activity_defaults))]);
  }
}

// Recompute every round program's display name (after renames)
async function renamePrograms(db) {
  const R = require("./rounds");
  const rounds = (await db.query(`SELECT * FROM rounds`)).rows;
  for (const r of rounds) await R.syncPrograms(db, r);
}

// Rename/update one schedule's activity; only that schedule's data is touched
async function renameActivity(from, to, patch) {
  const sid = patch.schedule_id;
  return inTx(async (db) => {
    const next = current();
    const a = next.activities.find((x) => x.name === from && x.schedule_id === sid);
    Object.assign(a, patch, { name: to });
    if (from !== to) {
      await db.query(`UPDATE programs SET activity=$2 WHERE activity=$1 AND round_id IN (SELECT id FROM rounds WHERE schedule_id=$3)`, [from, to, sid]);
      await renameRoundKeys(db, from, to, sid);
    }
    await save(next, db);
    if (from !== to) await renamePrograms(db);
  });
}

async function renameGroup(from, to) {
  return inTx(async (db) => {
    const next = current();
    next.age_groups = next.age_groups.map((g) => (g === from ? to : g));
    next.presets.forEach((p) => (p.ages = p.ages.map((g) => (g === from ? to : g))));
    await db.query(`UPDATE athletes SET age_group=$2 WHERE age_group=$1`, [from, to]);
    await db.query(`UPDATE programs SET age_groups=array_replace(age_groups, $1, $2) WHERE $1 = ANY(age_groups)`, [from, to]);
    await save(next, db);
    await renamePrograms(db);
  });
}

// New groups join sessions that were open to every group, so "all ages" stays true
async function addGroup(name) {
  return inTx(async (db) => {
    const next = current();
    const before = next.age_groups.slice();
    next.age_groups.push(name);
    if (before.length) await db.query(
      `UPDATE programs SET age_groups = age_groups || $2::text WHERE age_groups @> $1::text[] AND NOT ($2 = ANY(age_groups))`,
      [before, name]);
    await save(next, db);
  });
}

// Remove a group: it's dropped from sessions shared with other groups; blocked if a session is only for it
async function removeGroup(name) {
  return inTx(async (db) => {
    const only = (await db.query(`SELECT count(*)::int AS n FROM programs WHERE age_groups = ARRAY[$1]::text[]`, [name])).rows[0].n;
    if (only) return { blocked: only };
    await db.query(`UPDATE programs SET age_groups = array_remove(age_groups, $1) WHERE $1 = ANY(age_groups)`, [name]);
    const next = current();
    next.age_groups = next.age_groups.filter((g) => g !== name);
    next.presets.forEach((p) => (p.ages = p.ages.filter((g) => g !== name)));
    await save(next, db);
    await renamePrograms(db);
    return {};
  });
}

module.exports = { removeGroup, load, save, current, normalize, activityUsage, groupUsage, renameActivity, renameGroup, addGroup };
