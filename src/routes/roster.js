const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const { TZ, ACTIVITIES } = require("../config");
const { isDate } = require("../time");
const v = require("../views/roster");
const { wrap, go, str, flashFrom } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

// Everyone signed up for every session on one day
router.get("/:date", wrap(async (req, res) => {
  const date = str(req.params.date);
  if (!isDate(date)) return go(res, "/admin/setup", { err: "That date isn't valid." });
  const sessions = (await query(
    `SELECT s.id, s.starts_at, s.ends_at, s.capacity, s.coach, s.location, s.notes, s.unlocked_at,
       p.id AS program_id, p.activity, p.age_groups, p.block_minutes, p.name AS program_name,
       rd.id AS round_id, rd.name AS round_name, rd.schedule_id, rd.unlock_hours, rd.activity_limits, rd.priority_limit,
       se.completed_at IS NOT NULL AS locked
     FROM training_sessions s JOIN programs p ON p.id=s.program_id LEFT JOIN rounds rd ON rd.id=p.round_id
     LEFT JOIN seasons se ON se.id=rd.season_id
     WHERE s.canceled_at IS NULL AND (s.starts_at AT TIME ZONE '${TZ}')::date = $1::date
     ORDER BY s.starts_at, p.activity`, [date])).rows;
  const people = sessions.length ? (await query(
    `SELECT x.id, x.session_id, x.status, x.counts_toward_limit, x.created_at, a.id AS athlete_id, a.first_name, a.last_name,
       (SELECT mm.group_name FROM schedule_members mm JOIN rounds r2 ON r2.schedule_id=mm.schedule_id JOIN programs p2 ON p2.round_id=r2.id
          JOIN training_sessions s2 ON s2.program_id=p2.id WHERE s2.id=x.session_id AND mm.athlete_id=a.id) AS age_group,
       ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id ORDER BY u.email) AS emails
     FROM reservations x JOIN athletes a ON a.id=x.athlete_id
     WHERE x.session_id = ANY($1) AND x.status<>'canceled' ORDER BY x.created_at, x.id`, [sessions.map((s) => s.id)])).rows : [];
  for (const s of sessions) {
    s.booked = people.filter((p) => p.session_id === s.id && p.status === "confirmed");
    s.waiting = people.filter((p) => p.session_id === s.id && p.status === "waitlisted");
  }
  // Nearest days with sessions, for ‹ › navigation
  const near = (await query(
    `SELECT
       (SELECT to_char(max((starts_at AT TIME ZONE '${TZ}')::date), 'YYYY-MM-DD') FROM training_sessions
          WHERE canceled_at IS NULL AND (starts_at AT TIME ZONE '${TZ}')::date < $1::date) AS prev,
       (SELECT to_char(min((starts_at AT TIME ZONE '${TZ}')::date), 'YYYY-MM-DD') FROM training_sessions
          WHERE canceled_at IS NULL AND (starts_at AT TIME ZONE '${TZ}')::date > $1::date) AS next`, [date])).rows[0];
  const athletes = (await query(`SELECT a.id, a.first_name, a.last_name,
      COALESCE(json_object_agg(m.schedule_id, coalesce(m.group_name, '')) FILTER (WHERE m.schedule_id IS NOT NULL), '{}') AS mem
    FROM athletes a LEFT JOIN schedule_members m ON m.athlete_id=a.id GROUP BY a.id ORDER BY a.last_name, a.first_name`)).rows;
  res.send(v.rosterPage({ user: req.user, flash: flashFrom(req), date, sessions, athletes, prev: near.prev, next: near.next }));
}));

module.exports = router;
