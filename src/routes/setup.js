const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const { AGE_GROUPS, ACTIVITIES } = require("../config");
const v = require("../views/setup");
const { wrap, flashFrom } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

router.get("/", wrap(async (req, res) => {
  const seasons = (await query(`SELECT * FROM seasons ORDER BY starts_on DESC`)).rows;
  const rounds = (await query(
    `SELECT r.*,
       (SELECT count(*)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id
          WHERE p.round_id=r.id AND s.canceled_at IS NULL) AS scheduled,
       (SELECT count(*)::int FROM reservations x JOIN training_sessions s ON s.id=x.session_id
          JOIN programs p ON p.id=s.program_id WHERE p.round_id=r.id AND x.status='confirmed') AS claimed,
       (SELECT coalesce(sum(s.capacity),0)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id
          WHERE p.round_id=r.id AND s.canceled_at IS NULL) AS spots
     FROM rounds r ORDER BY r.starts_on`)).rows;
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
  res.send(v.setupPage({ user: req.user, flash: flashFrom(req), seasons, rounds, standalone }));
}));

module.exports = router;
