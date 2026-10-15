// Groups and group shortcuts belong to one schedule. Renames and removals cascade through that
// schedule's members and session setups only.
const { pool, query } = require("./db");
const SC = require("./schedules");

async function tx(fn) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const out = await fn(c); await c.query("COMMIT"); return out; }
  catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
const programsIn = `SELECT p.id FROM programs p JOIN rounds r ON r.id=p.round_id WHERE r.schedule_id=$1`;

async function usage(scheduleId, name) {
  return (await query(`SELECT
    (SELECT count(*)::int FROM schedule_members WHERE schedule_id=$1 AND group_name=$2) AS members,
    (SELECT count(*)::int FROM programs WHERE id IN (${programsIn}) AND $2 = ANY(age_groups)) AS programs`, [scheduleId, name])).rows[0];
}

// New groups join this schedule's "all groups" sessions, so those stay open to everyone
async function add(sc, name) {
  return tx(async (db) => {
    const before = SC.groupsFor(sc);
    await db.query(`UPDATE schedules SET groups = array_append(groups, $2) WHERE id=$1`, [sc.id, name]);
    if (before.length) await db.query(
      `UPDATE programs SET age_groups = age_groups || $3::text WHERE id IN (${programsIn}) AND age_groups @> $2::text[] AND NOT ($3 = ANY(age_groups))`,
      [sc.id, before, name]);
  }).then(SC.refreshGroups);
}

async function rename(sc, from, to) {
  return tx(async (db) => {
    const presets = SC.presetsFor(sc).map((p) => ({ ...p, ages: p.ages.map((g) => (g === from ? to : g)) }));
    await db.query(`UPDATE schedules SET groups = array_replace(groups, $2, $3), presets=$4 WHERE id=$1`, [sc.id, from, to, JSON.stringify(presets)]);
    await db.query(`UPDATE schedule_members SET group_name=$3 WHERE schedule_id=$1 AND group_name=$2`, [sc.id, from, to]);
    await db.query(`UPDATE programs SET age_groups = array_replace(age_groups, $2, $3) WHERE id IN (${programsIn})`, [sc.id, from, to]);
    const R = require("./rounds");
    for (const r of (await db.query(`SELECT * FROM rounds WHERE schedule_id=$1`, [sc.id])).rows) await R.syncPrograms(db, r);
  }).then(SC.refreshGroups);
}

// Blocked if any session setup is only for this group; otherwise it's dropped from shared ones
async function remove(sc, name) {
  const only = (await query(`SELECT count(*)::int AS n FROM programs WHERE id IN (${programsIn}) AND age_groups = ARRAY[$2]::text[]`, [sc.id, name])).rows[0].n;
  if (only) return { blocked: only };
  await tx(async (db) => {
    await db.query(`UPDATE programs SET age_groups = array_remove(age_groups, $2) WHERE id IN (${programsIn})`, [sc.id, name]);
    await db.query(`UPDATE schedule_members SET group_name=NULL WHERE schedule_id=$1 AND group_name=$2`, [sc.id, name]);
    const presets = SC.presetsFor(sc).map((p) => ({ ...p, ages: p.ages.filter((g) => g !== name) }));
    await db.query(`UPDATE schedules SET groups = array_remove(groups, $2), presets=$3 WHERE id=$1`, [sc.id, name, JSON.stringify(presets)]);
    const R = require("./rounds");
    for (const r of (await db.query(`SELECT * FROM rounds WHERE schedule_id=$1`, [sc.id])).rows) await R.syncPrograms(db, r);
  });
  await SC.refreshGroups();
  return {};
}

async function move(sc, name, dir) {
  const g = SC.groupsFor(sc).slice();
  const i = g.indexOf(name), j = i + (dir === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= g.length) return;
  [g[i], g[j]] = [g[j], g[i]];
  await query(`UPDATE schedules SET groups=$2 WHERE id=$1`, [sc.id, g]);
  await SC.refreshGroups();
}

async function savePresets(sc, presets) {
  await query(`UPDATE schedules SET presets=$2 WHERE id=$1`, [sc.id, JSON.stringify(presets)]);
}

module.exports = { usage, add, rename, remove, move, savePresets };
