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
  res.send(v.setupPage({ user: req.user, flash: flashFrom(req), schedule, rounds, standalone }));
}));

router.get("/new", wrap(async (req, res) => res.send(v.newSchedulePage({ user: req.user, flash: flashFrom(req), schedules: req.sched.list }))));

router.get("/schedule", wrap(async (req, res) => {
  const sc = req.sched.sc;
  const counts = (await query(`SELECT (SELECT count(*) FROM rounds WHERE schedule_id=$1) AS items,
    (SELECT count(*) FROM schedule_members WHERE schedule_id=$1) AS members`, [sc.id])).rows[0];
  res.send(v.scheduleSettingsPage({ user: req.user, flash: flashFrom(req), sc, counts: { items: Number(counts.items), members: Number(counts.members) } }));
}));

// ---------- schedules ----------
const clean = (x, n = 24) => str(x).replace(/\s+/g, " ").slice(0, n);

router.post("/schedules", wrap(async (req, res) => {
  const name = clean(req.body.name, 40);
  if (!name) return go(res, "/admin/setup/new", { err: "Enter a name for the schedule." });
  const labels = SC.PRESET_LABELS[req.body.preset] || SC.PRESET_LABELS.training;
  const src = int(req.body.copy_groups) ? await SC.get(int(req.body.copy_groups)) : null;
  const sort = (await query(`SELECT coalesce(max(sort),0)+1 AS n FROM schedules`)).rows[0].n;
  const { rows } = await query(`INSERT INTO schedules (name, labels, sort, groups, presets) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, JSON.stringify(labels), sort, src ? src.groups : [], JSON.stringify(src ? src.presets : [])]);
  await SC.refreshGroups();
  const L = SC.labels({ labels });
  go(res, `/admin/settings/activities?s=${rows[0].id}`, { ok: `Created ${name}. Next: add its ${L.activity.many.toLowerCase()} here, then its ${L.group.many.toLowerCase()} and ${L.participant.many.toLowerCase()}.` });
}));

router.post("/schedules/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const labels = {};
  for (const k of Object.keys(SC.DEFAULT_LABELS)) {
    const one = clean(b[`${k}_one`]) || SC.DEFAULT_LABELS[k][0];
    labels[k] = [one, clean(b[`${k}_many`]) || `${one}s`];
  }
  await query(`UPDATE schedules SET name=$2, labels=$3 WHERE id=$1`, [id, clean(b.name, 40) || "Schedule", JSON.stringify(labels)]);
  // program names include the level words, so refresh them
  const R = require("../rounds");
  for (const r of (await query(`SELECT * FROM rounds WHERE schedule_id=$1`, [id])).rows) await R.syncPrograms({ query }, r);
  go(res, `/admin/setup/schedule?s=${id}`, { ok: `Saved. ${labels.top[0]} › ${labels.middle[0]} › ${labels.activity[0]} › ${labels.slot[0]}, with ${labels.participant[1].toLowerCase()} in ${labels.group[1].toLowerCase()}.` });
}));

// ---------- a board's locations + family view ----------
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
  go(res, `/admin/setup/schedule?s=${id}#family`, { ok: { full: "Families now see full names of who's going.", initial: "Families now see first names and last initials of who's going.", off: "Families no longer see who's going." }[mode] });
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
  if (calendar) bits.push(`${n(out.rounds, L.middle)} and ${n(out.sessions, L.slot)} (as drafts)`);
  go(res, `/admin/setup?s=${out.board.id}`, { ok: `Created ${name} from ${sc.name}${bits.length ? ` with ${bits.join("; ")}` : ""}.` });
}));

router.post("/schedules/:id/archive", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(`UPDATE schedules SET archived_at = CASE WHEN archived_at IS NULL THEN now() ELSE NULL END WHERE id=$1 RETURNING name, archived_at`, [id]);
  const r = rows[0];
  const { LABELS } = require("../config");
  go(res, require("./util").dest(req, `/admin/setup/schedule?s=${id}`), { ok: r.archived_at
    ? `${r.name} archived. Families can't see it anymore. Find it under "View archived ${LABELS.schedules.toLowerCase()}".`
    : `${r.name} reopened. It's active again.` });
}));

router.post("/schedules/:id/delete", wrap(async (req, res) => {
  const id = int(req.params.id);
  const used = (await query(`SELECT (SELECT count(*) FROM seasons WHERE schedule_id=$1) + (SELECT count(*) FROM rounds WHERE schedule_id=$1) AS n`, [id])).rows[0].n;
  if (Number(used)) return go(res, `/admin/setup/schedule?s=${id}`, { err: "Delete its items first. A schedule can only be deleted when it's empty." });
  if ((await SC.all()).length <= 1) return go(res, `/admin/setup/schedule?s=${id}`, { err: "Keep at least one schedule." });
  // its activities go with it (they can't be on anything, since the schedule is empty)
  const catalog = require("../catalog");
  const c = catalog.current(); c.activities = c.activities.filter((a) => a.schedule_id !== id); await catalog.save(c);
  await query(`DELETE FROM schedules WHERE id=$1`, [id]);
  res.clearCookie("rt_sched");
  await SC.refreshGroups();
  go(res, require("./util").dest(req, "/admin/settings"), { ok: "Deleted." });
}));

module.exports = router;
