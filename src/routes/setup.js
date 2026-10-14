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
  const schedules = await SC.all();
  const schedule = schedules.find((x) => x.id === int(req.query.s)) || schedules[0];
  const seasons = (await query(`SELECT * FROM seasons WHERE schedule_id=$1 ORDER BY starts_on DESC`, [schedule.id])).rows;
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
  res.send(v.setupPage({ user: req.user, flash: flashFrom(req), schedules, schedule, seasons, rounds, standalone }));
}));

// ---------- schedules ----------
const PRESETS = {
  training: { top: ["Season", "Seasons"], middle: ["Round", "Rounds"], activity: ["Activity", "Activities"], slot: ["Session", "Sessions"] },
  volunteer: { top: ["Term", "Terms"], middle: ["Event", "Events"], activity: ["Role", "Roles"], slot: ["Shift", "Shifts"] },
  weekly: { top: ["Year", "Years"], middle: ["Week", "Weeks"], activity: ["Activity", "Activities"], slot: ["Slot", "Slots"] },
};
const clean = (x, n = 24) => str(x).replace(/\s+/g, " ").slice(0, n);

router.post("/schedules", wrap(async (req, res) => {
  const name = clean(req.body.name, 40);
  if (!name) return go(res, "/admin/setup", { err: "Enter a name for the schedule." });
  const labels = PRESETS[req.body.preset] || PRESETS.training;
  const sort = (await query(`SELECT coalesce(max(sort),0)+1 AS n FROM schedules`)).rows[0].n;
  const { rows } = await query(`INSERT INTO schedules (name, labels, sort) VALUES ($1,$2,$3) RETURNING id`, [name, JSON.stringify(labels), sort]);
  go(res, `/admin/setup?s=${rows[0].id}#schedule-settings`, { ok: `Created ${name}. Rename its levels and pick what it offers below.` });
}));

router.post("/schedules/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const labels = {};
  for (const k of Object.keys(SC.DEFAULT_LABELS)) {
    const one = clean(b[`${k}_one`]) || SC.DEFAULT_LABELS[k][0];
    labels[k] = [one, clean(b[`${k}_many`]) || `${one}s`];
  }
  const acts = [].concat(b.acts || []).map((a) => str(a));
  await query(`UPDATE schedules SET name=$2, labels=$3, activities=$4 WHERE id=$1`,
    [id, clean(b.name, 40) || "Schedule", JSON.stringify(labels), acts.length ? acts : null]);
  go(res, `/admin/setup?s=${id}`, { ok: `Saved. Levels: ${labels.top[0]} › ${labels.middle[0]} › ${labels.activity[0]} › ${labels.slot[0]}.` });
}));

router.post("/schedules/:id/delete", wrap(async (req, res) => {
  const id = int(req.params.id);
  const used = (await query(`SELECT (SELECT count(*) FROM seasons WHERE schedule_id=$1) + (SELECT count(*) FROM rounds WHERE schedule_id=$1) AS n`, [id])).rows[0].n;
  if (Number(used)) return go(res, `/admin/setup?s=${id}`, { err: "Delete or move its items first. A schedule can only be deleted when it's empty." });
  if ((await SC.all()).length <= 1) return go(res, `/admin/setup?s=${id}`, { err: "Keep at least one schedule." });
  await query(`DELETE FROM schedules WHERE id=$1`, [id]);
  go(res, "/admin/setup", { ok: "Schedule deleted." });
}));

module.exports = router;
