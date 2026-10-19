const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const { AGE_GROUPS, ACTIVITIES } = require("../config");
const v = require("../views/setup");
const SC = require("../schedules");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

router.get("/", wrap(async (req, res) => {
  const schedule = req.sched.sc;
  const main = await SC.ensureStructure(schedule);
  // 2-level boards: every area on the board has its place in the built-in round
  if (main && SC.depthOf(schedule) === 2) {
    const have = new Set((await query(`SELECT activity FROM programs WHERE round_id=$1`, [main.id])).rows.map((r) => r.activity));
    for (const a of SC.activitiesFor(schedule)) if (!have.has(a)) await require("../rounds").ensureProgram({ query }, main, a, [], {});
  }
  const rounds = (await query(
    `SELECT r.*,
       (SELECT count(*)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id
          WHERE p.round_id=r.id AND s.canceled_at IS NULL) AS scheduled,
       (SELECT count(*)::int FROM reservations x JOIN training_sessions s ON s.id=x.session_id
          JOIN programs p ON p.id=s.program_id WHERE p.round_id=r.id AND x.status='confirmed') AS claimed,
       (SELECT coalesce(sum(s.capacity),0)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id
          WHERE p.round_id=r.id AND s.canceled_at IS NULL) AS spots
     FROM rounds r WHERE r.schedule_id=$1 ORDER BY r.starts_on`, [schedule.id])).rows;
  const types = (await query(
    `SELECT p.*, (SELECT count(*)::int FROM training_sessions s WHERE s.program_id=p.id AND s.canceled_at IS NULL) AS scheduled
     FROM programs p WHERE p.round_id IS NOT NULL`)).rows
    .sort((a, b) => ACTIVITIES.indexOf(a.activity) - ACTIVITIES.indexOf(b.activity) ||
      AGE_GROUPS.indexOf(a.age_groups[0]) - AGE_GROUPS.indexOf(b.age_groups[0]));
  const standalone = (await query(
    `SELECT p.id, p.name, p.archived,
       (SELECT count(*)::int FROM training_sessions s WHERE s.program_id=p.id AND s.canceled_at IS NULL AND s.starts_at > now()) AS upcoming
     FROM programs p WHERE p.round_id IS NULL ORDER BY p.archived, p.name`)).rows;
  for (const r of rounds) r.types = types.filter((t) => t.round_id === r.id);
  const items = (await query(
    `SELECT s.*, p.round_id, p.activity, p.age_groups, p.required_tags, p.section,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS claimed,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='waitlisted') AS waitlisted
     FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id
     WHERE r.schedule_id=$1 AND s.canceled_at IS NULL AND ($2 OR s.starts_at IS NULL)
     ORDER BY s.starts_at NULLS FIRST, s.id`, [schedule.id, SC.depthOf(schedule) <= 2])).rows;
  for (const r of rounds) r.items = items.filter((i) => i.round_id === r.id);
  res.send(v.setupPage({ user: req.user, flash: flashFrom(req), schedule, rounds, standalone }));
}));

router.get("/new", wrap(async (req, res) => res.send(v.newSchedulePage({ user: req.user, flash: flashFrom(req) }))));

router.get(["/schedule", "/schedule/more", "/schedule/archive"], wrap(async (req, res) => {
  const sc = req.sched.sc;
  const counts = (await query(`SELECT (SELECT count(*) FROM rounds WHERE schedule_id=$1 AND NOT is_main)
      + (SELECT count(*) FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id WHERE r.schedule_id=$1) AS items,
    (SELECT count(*) FROM schedule_members WHERE schedule_id=$1) AS members`, [sc.id])).rows[0];
  if (req.path.endsWith("/more")) return res.redirect(`/admin/setup/schedule?s=${sc.id}#locations`); // merged into Setup
  const part = req.path.endsWith("/archive") ? "archive" : "structure";
  res.send(v.scheduleSettingsPage({ user: req.user, flash: flashFrom(req), sc, part, counts: { items: Number(counts.items), members: Number(counts.members) } }));
}));

// ---------- schedules ----------
const clean = (x, n = 24) => str(x).replace(/\s+/g, " ").slice(0, n);

router.post("/schedules", wrap(async (req, res) => {
  const name = clean(req.body.name, 60);
  if (!name) return go(res, "/admin/setup/new", { err: "Enter a name for the schedule." });
  const pre = SC.PRESET_LABELS[req.body.preset] || SC.PRESET_LABELS.training;
  const { depth = 3, calendar: preCal = true, claim: preClaim = "roster", restrict: preRestrict = false, ...labels } = pre;
  // the answers on the New page win over the structure's defaults
  const b0 = req.body;
  const claim = ["public", "family", "roster"].includes(b0.claim) ? b0.claim : preClaim;
  const restrict = b0.restrict ? b0.restrict === "yes" : preRestrict;
  const dated = b0.dated ? b0.dated === "yes" : preCal;
  const pickMode = !dated ? "list" : b0.pick === "both" ? "both" : b0.pick === "list" ? "dlist" : "calendar";
  const calendar = pickMode !== "list";
  const src = null; // groups are copied later from the Groups & tags step, if needed
  const sort = (await query(`SELECT coalesce(max(sort),0)+1 AS n FROM schedules`)).rows[0].n;
  const { rows } = await query(`INSERT INTO schedules (name, labels, sort, groups, presets, depth, use_calendar, pick_mode, claim_mode, restricted)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [name, JSON.stringify(labels), sort, src ? src.groups : [], JSON.stringify(src ? src.presets : []), depth, calendar, pickMode,
     claim, restrict]);
  await SC.refreshGroups();
  await SC.ensureStructure(await SC.get(rows[0].id));
  const L = SC.labels({ labels });
  go(res, depth <= 2 ? `/admin/setup?s=${rows[0].id}` : `/admin/settings/activities?s=${rows[0].id}`, { ok: depth === 1
    ? `Created ${name}. Add its ${L.slot.many.toLowerCase()} below. (Its settings are on the board's card under Settings.)`
    : depth === 2 ? `Created ${name}. Add its first ${L.activity.one.toLowerCase()} below, then its ${L.slot.many.toLowerCase()}.`
    : `Created ${name}. Step 2: add its ${L.activity.many.toLowerCase()}. Steps 3–4 (${L.group.many.toLowerCase()} and ${L.participant.many.toLowerCase()}) are only needed for roster-only claims. Then Open board to add ${depth >= 3 ? `${L.middle.many.toLowerCase()} and ` : ""}${L.slot.many.toLowerCase()}.` });
}));

// Number of levels: only while the board is empty (nothing to restructure)
router.post("/schedules/:id/depth", wrap(async (req, res) => {
  const id = int(req.params.id);
  const depth = Math.min(4, Math.max(1, int(req.body.depth) || 3));
  const used = (await query(`SELECT
      (SELECT count(*) FROM rounds WHERE schedule_id=$1 AND NOT is_main) +
      (SELECT count(*) FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id WHERE r.schedule_id=$1) AS n`, [id])).rows[0].n;
  if (Number(used)) return go(res, `/admin/setup/schedule?s=${id}`, { err: "This board already has things in it, so its levels can't change." });
  await query(`DELETE FROM rounds WHERE schedule_id=$1 AND is_main`, [id]); // rebuilt below if needed
  const c = require("../catalog").current();
  if (c.activities.some((a) => a.schedule_id === id && a.item_list)) { c.activities = c.activities.filter((a) => !(a.schedule_id === id && a.item_list)); await require("../catalog").save(c); }
  await query(`UPDATE schedules SET depth=$2 WHERE id=$1`, [id, depth]);
  await SC.ensureStructure(await SC.get(id));
  go(res, `/admin/setup/schedule?s=${id}`, { ok: `Now ${depth} level${depth === 1 ? "" : "s"}. Name them below.` });
}));

router.post("/schedules/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const prev = (await SC.get(id)).labels || {};
  const labels = { ...prev };
  for (const k of Object.keys(SC.DEFAULT_LABELS)) {
    if (b[`${k}_one`] === undefined) continue; // levels this board doesn't use keep their words
    const one = clean(b[`${k}_one`]) || SC.DEFAULT_LABELS[k][0];
    labels[k] = [one, clean(b[`${k}_many`]) || `${one}s`];
  }
  const pick = b.dated === "no" ? "list" : b.dated === "yes" ? (b.pick === "both" ? "both" : b.pick === "list" ? "dlist" : "calendar")
    : ["list", "calendar", "both"].includes(b.pick) ? b.pick : null;
  const claim = ["public", "family", "roster"].includes(b.claim) ? b.claim : null;
  const restrict = b.restrict === "yes" ? true : b.restrict === "no" ? false : null;
  await query(`UPDATE schedules SET claim_mode = COALESCE($2, claim_mode), restricted = COALESCE($3, restricted) WHERE id=$1`, [id, claim, restrict]);
  if (claim) await query(`UPDATE rounds SET signup_mode=$2 WHERE schedule_id=$1`, [id, claim]); // one answer for the whole board
  await query(`UPDATE schedules SET name=$2, labels=$3, pick_mode = COALESCE($4, pick_mode), use_calendar = COALESCE($4, pick_mode) <> 'list' WHERE id=$1`,
    [id, clean(b.name, 60) || "Claim Board", JSON.stringify(labels), pick]);
  // program names include the level words, so refresh them
  const R = require("../rounds");
  for (const r of (await query(`SELECT * FROM rounds WHERE schedule_id=$1`, [id])).rows) await R.syncPrograms({ query }, r);
  const sc2 = await SC.get(id);
  await SC.ensureStructure(sc2); // a 1-level board's built-in activity follows the level name
  const L2 = SC.labels(sc2);
  go(res, `/admin/setup/schedule?s=${id}`, { ok: `Saved. ${SC.levelKeys(sc2).map((k) => L2[k].many).join(" › ")}, with ${L2.participant.many.toLowerCase()} in ${L2.group.many.toLowerCase()}.` });
}));

// ---------- a board's locations + view (who's going) ----------
router.post("/schedules/:id/locations", wrap(async (req, res) => {
  const id = int(req.params.id);
  const name = str(req.body.name).replace(/\s+/g, " ").slice(0, 80);
  if (!name) return go(res, `/admin/setup/schedule?s=${id}#locations`, { err: "Enter a location." });
  await query(`UPDATE schedules SET locations = array_append(locations, $2) WHERE id=$1 AND NOT ($2 = ANY(locations))`, [id, name]);
  go(res, `/admin/setup/schedule?s=${id}#locations`, { ok: `Added ${name}.` });
}));

router.post("/schedules/:id/locations/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`UPDATE schedules SET locations = array_remove(locations, $2) WHERE id=$1`, [id, str(req.body.name)]);
  go(res, `/admin/setup/schedule?s=${id}#locations`, { ok: "Location removed. Anything that already uses it keeps it." });
}));

router.post("/schedules/:id/family", wrap(async (req, res) => {
  const id = int(req.params.id);
  const mode = ["full", "initial", "off"].includes(req.body.family_names) ? req.body.family_names : "initial";
  await query(`UPDATE schedules SET family_names=$2 WHERE id=$1`, [id, mode]);
  go(res, `/admin/setup/schedule?s=${id}#family`, { ok: { full: "People now see full names of who's going.", initial: "People now see first names and last initials of who's going.", off: "People no longer see who's going." }[mode] });
}));

// ---------- copy a whole board ----------
router.get("/schedules/:id/copy", wrap(async (req, res) => {
  const sc = await SC.get(int(req.params.id));
  if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const c = (await query(`SELECT
      (SELECT count(*)::int FROM schedule_members WHERE schedule_id=$1) AS members,
      (SELECT count(*)::int FROM rounds WHERE schedule_id=$1) AS rounds,
      (SELECT to_char(min(starts_on), 'YYYY-MM-DD') FROM rounds WHERE schedule_id=$1) AS first`, [sc.id])).rows[0];
  c.activities = SC.activitiesFor(sc).length;
  if (c.first) { const d = new Date(c.first + "T12:00:00"); c.firstLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }); }
  res.send(require("../views/home").copyPage({ user: req.user, flash: flashFrom(req), sc, counts: c }));
}));

router.post("/schedules/:id/copy", wrap(async (req, res) => {
  const sc = await SC.get(int(req.params.id));
  if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const b = req.body;
  const name = str(b.name).replace(/\s+/g, " ").slice(0, 40) || `${sc.name} (copy)`;
  const calendar = !!b.calendar;
  const startOn = /^\d{4}-\d{2}-\d{2}$/.test(str(b.start_on)) ? str(b.start_on) : null;
  const out = await require("../copyBoard").copyBoard(sc, { name, activities: !!b.activities, groups: !!b.groups, members: !!b.members, calendar, startOn });
  const L = SC.labels(sc);
  const bits = [];
  const n = (c, l) => `${c} ${(c === 1 ? l.one : l.many).toLowerCase()}`;
  if (out.members) bits.push(n(out.members, L.participant));
  if (calendar) bits.push(SC.depthOf(sc) >= 3 ? `${n(out.rounds, L.middle)} and ${n(out.sessions, L.slot)} (as drafts)` : `${n(out.sessions, L.slot)} (unpublished)`);
  go(res, `/admin/setup?s=${out.board.id}`, { ok: `Created ${name} from ${sc.name}${bits.length ? ` with ${bits.join("; ")}` : ""}.` });
}));

router.post("/schedules/:id/archive", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(`UPDATE schedules SET archived_at = CASE WHEN archived_at IS NULL THEN now() ELSE NULL END WHERE id=$1 RETURNING name, archived_at`, [id]);
  const r = rows[0];
  const { LABELS } = require("../config");
  go(res, require("./util").dest(req, `/admin/setup/schedule/archive?s=${id}`), { ok: r.archived_at
    ? `${r.name} archived. People can't see it anymore. Find it under "View archived ${LABELS.schedules.toLowerCase()}".`
    : `${r.name} reopened. It's active again.` });
}));

router.post("/schedules/:id/delete", wrap(async (req, res) => {
  const id = int(req.params.id);
  const used = (await query(`SELECT (SELECT count(*) FROM rounds WHERE schedule_id=$1 AND NOT is_main)
    + (SELECT count(*) FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id WHERE r.schedule_id=$1) AS n`, [id])).rows[0].n;
  if (Number(used)) return go(res, `/admin/setup/schedule/archive?s=${id}`, { err: "Delete its items first. A board can only be deleted when it's empty." });
  if ((await SC.all()).length <= 1) return go(res, `/admin/setup/schedule/archive?s=${id}`, { err: "Keep at least one board." });
  // its activities go with it (they can't be on anything, since the schedule is empty)
  const catalog = require("../catalog");
  const c = catalog.current(); c.activities = c.activities.filter((a) => a.schedule_id !== id); await catalog.save(c);
  await query(`DELETE FROM schedules WHERE id=$1`, [id]);
  res.clearCookie("rt_sched");
  await SC.refreshGroups();
  go(res, require("./util").dest(req, "/admin/settings"), { ok: "Deleted." });
}));

module.exports = router;
