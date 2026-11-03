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

// Board levels and sessions can be limited to groups or tags (settings.who.groups / settings.who.tags). Renames and removals
// carry through them, so a limit never silently stops matching anyone.
async function limitsWith(db, scheduleId, key, name) {
  const out = [];
  for (const t of ["board_nodes", "board_items"]) {
    const rows = (await db.query(`SELECT id, settings FROM ${t} WHERE schedule_id=$1 AND settings->'who'->$2 ? $3`, [scheduleId, key, name])).rows;
    for (const r of rows) out.push({ table: t, id: r.id, settings: r.settings });
  }
  return out;
}
async function changeLimits(db, scheduleId, key, name, fn) {
  for (const r of await limitsWith(db, scheduleId, key, name)) {
    const who = { ...(r.settings.who || {}) }; who[key] = [...new Set(fn(who[key] || []))];
    await db.query(`UPDATE ${r.table} SET settings = jsonb_set(settings, '{who}', $2::jsonb) WHERE id=$1`, [r.id, JSON.stringify(who)]);
  }
}
// levels/sessions limited to ONLY this group or tag (removing it would open them to everyone)
const onlyThis = (rows, key, name) => rows.filter((r) => { const w = r.settings.who || {}, other = key === "groups" ? "tags" : "groups";
  return (w[key] || []).length === 1 && w[key][0] === name && !(w[other] || []).length; }).length;
const oldData = () => require("./db").hasOldData();

async function usage(scheduleId, name) {
  const u = (await query(`SELECT (SELECT count(*)::int FROM schedule_members WHERE schedule_id=$1 AND group_name=$2) AS members`, [scheduleId, name])).rows[0];
  u.levels = (await limitsWith({ query }, scheduleId, "groups", name)).length;
  u.programs = (await oldData()) ? (await query(`SELECT count(*)::int AS n FROM programs WHERE id IN (${programsIn}) AND $2 = ANY(age_groups)`, [scheduleId, name])).rows[0].n : 0;
  return u;
}

// New groups join this schedule's "all groups" sessions (old boards), so those stay open to everyone
async function add(sc, name) {
  return tx(async (db) => {
    const before = SC.groupsFor(sc);
    await db.query(`UPDATE schedules SET groups = array_append(groups, $2) WHERE id=$1`, [sc.id, name]);
    if (before.length && await oldData()) await db.query(
      `UPDATE programs SET age_groups = age_groups || $3::text WHERE id IN (${programsIn}) AND age_groups @> $2::text[] AND NOT ($3 = ANY(age_groups))`,
      [sc.id, before, name]);
  }).then(SC.refreshGroups);
}

async function rename(sc, from, to) {
  return tx(async (db) => {
    const presets = SC.presetsFor(sc).map((p) => ({ ...p, ages: p.ages.map((g) => (g === from ? to : g)) }));
    await db.query(`UPDATE schedules SET groups = array_replace(groups, $2, $3), presets=$4 WHERE id=$1`, [sc.id, from, to, JSON.stringify(presets)]);
    await db.query(`UPDATE schedule_members SET group_name=$3 WHERE schedule_id=$1 AND group_name=$2`, [sc.id, from, to]);
    await changeLimits(db, sc.id, "groups", from, (l) => l.map((g) => (g === from ? to : g)));
    if (await oldData()) {
      await db.query(`UPDATE programs SET age_groups = array_replace(age_groups, $2, $3) WHERE id IN (${programsIn})`, [sc.id, from, to]);
      await syncNames(db, sc);
    }
  }).then(SC.refreshGroups);
}

// Blocked if a level or session is only for this group; otherwise it's dropped from shared ones
async function remove(sc, name) {
  let only = onlyThis(await limitsWith({ query }, sc.id, "groups", name), "groups", name);
  if (await oldData()) only += (await query(`SELECT count(*)::int AS n FROM programs WHERE id IN (${programsIn}) AND age_groups = ARRAY[$2]::text[]`, [sc.id, name])).rows[0].n;
  if (only) return { blocked: only };
  await tx(async (db) => {
    await changeLimits(db, sc.id, "groups", name, (l) => l.filter((g) => g !== name));
    await db.query(`UPDATE schedule_members SET group_name=NULL WHERE schedule_id=$1 AND group_name=$2`, [sc.id, name]);
    const presets = SC.presetsFor(sc).map((p) => ({ ...p, ages: p.ages.filter((g) => g !== name) }));
    await db.query(`UPDATE schedules SET groups = array_remove(groups, $2), presets=$3 WHERE id=$1`, [sc.id, name, JSON.stringify(presets)]);
    if (await oldData()) {
      await db.query(`UPDATE programs SET age_groups = array_remove(age_groups, $2) WHERE id IN (${programsIn})`, [sc.id, name]);
      await syncNames(db, sc);
    }
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

// ---- tags (multi-valued, e.g. Catcher, Pitcher) ----
async function tagUsage(scheduleId, name) {
  const u = (await query(`SELECT (SELECT count(*)::int FROM schedule_members WHERE schedule_id=$1 AND $2 = ANY(tags)) AS members`, [scheduleId, name])).rows[0];
  u.levels = (await limitsWith({ query }, scheduleId, "tags", name)).length;
  u.programs = (await oldData()) ? (await query(`SELECT count(*)::int AS n FROM programs WHERE id IN (${programsIn}) AND $2 = ANY(required_tags)`, [scheduleId, name])).rows[0].n : 0;
  return u;
}
async function addTag(sc, name) {
  await query(`UPDATE schedules SET tags = array_append(tags, $2) WHERE id=$1 AND NOT ($2 = ANY(tags))`, [sc.id, name]);
}
async function syncNames(db, sc) {
  const R = require("./rounds");
  for (const r of (await db.query(`SELECT * FROM rounds WHERE schedule_id=$1`, [sc.id])).rows) await R.syncPrograms(db, r);
}
async function renameTag(sc, from, to) {
  return tx(async (db) => {
    await db.query(`UPDATE schedules SET tags = array_replace(tags, $2, $3) WHERE id=$1`, [sc.id, from, to]);
    await db.query(`UPDATE schedule_members SET tags = array_replace(tags, $2, $3) WHERE schedule_id=$1`, [sc.id, from, to]);
    await changeLimits(db, sc.id, "tags", from, (l) => l.map((t) => (t === from ? to : t)));
    if (await oldData()) {
      await db.query(`UPDATE programs SET required_tags = array_replace(required_tags, $2, $3) WHERE id IN (${programsIn})`, [sc.id, from, to]);
      await syncNames(db, sc);
    }
  });
}
// Blocked if a level or session is only for this tag (removing it would open it to everyone)
async function removeTag(sc, name) {
  const only = onlyThis(await limitsWith({ query }, sc.id, "tags", name), "tags", name);
  if (only) return { blocked: only };
  await tx(async (db) => {
    await db.query(`UPDATE schedules SET tags = array_remove(tags, $2) WHERE id=$1`, [sc.id, name]);
    await db.query(`UPDATE schedule_members SET tags = array_remove(tags, $2) WHERE schedule_id=$1`, [sc.id, name]);
    await changeLimits(db, sc.id, "tags", name, (l) => l.filter((t) => t !== name));
    if (await oldData()) {
      await db.query(`UPDATE programs SET required_tags = array_remove(required_tags, $2) WHERE id IN (${programsIn})`, [sc.id, name]);
      await syncNames(db, sc);
    }
  });
  return {};
}
async function setMemberTags(scheduleId, athleteId, tags) {
  await query(`UPDATE schedule_members SET tags=$3 WHERE schedule_id=$1 AND athlete_id=$2`, [scheduleId, athleteId, tags]);
}
async function bulkTag(scheduleId, athleteIds, tag, on) {
  if (on) await query(`UPDATE schedule_members SET tags = array_append(tags, $3) WHERE schedule_id=$1 AND athlete_id = ANY($2) AND NOT ($3 = ANY(tags))`, [scheduleId, athleteIds, tag]);
  else await query(`UPDATE schedule_members SET tags = array_remove(tags, $3) WHERE schedule_id=$1 AND athlete_id = ANY($2)`, [scheduleId, athleteIds, tag]);
}

module.exports = { usage, add, rename, remove, move, savePresets, tagUsage, addTag, renameTag, removeTag, setMemberTags, bulkTag };
