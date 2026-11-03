// Taking attendance: admins (any board) and coaches (their boards), on a phone or computer
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const A = require("../attendance");
const v = require("../views/checkin");
const { localDate } = require("../time");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser);
router.use(wrap(async (req, res, next) => {
  req.boards = await A.boardsFor(req.user);
  if (!req.boards.length) return res.status(403).send(require("../views/layout").errorPage("Check-in is for admins and coaches.", { user: req.user }));
  next();
}));

const isDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
const today = () => localDate(new Date());

// One session with its board, for access checks and labels
async function sessionInfo(sid) {
  return (await query(
    `SELECT s.*, p.activity, p.age_groups, p.required_tags, p.section, r.name AS round_name, r.is_main, r.schedule_id,
       sc.name AS board_name, ${A.TRACKED_SQL} AS tracked
     FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id JOIN schedules sc ON sc.id=r.schedule_id
     WHERE s.id=$1`, [sid])).rows[0];
}

router.get("/", wrap(async (req, res) => {
  const day = isDate(req.query.d) ? req.query.d : today();
  const sessions = (await query(
    `SELECT s.id, s.starts_at, s.ends_at, s.title, s.capacity, p.activity, p.age_groups, p.required_tags, p.section,
       r.name AS round_name, r.is_main, sc.name AS board_name,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS claimed,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed' AND x.attended) AS here,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed' AND x.attended = false) AS noshow
     FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id JOIN schedules sc ON sc.id=r.schedule_id
     WHERE r.schedule_id = ANY($1) AND s.canceled_at IS NULL AND ${A.TRACKED_SQL}
       AND to_char(s.starts_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') = $2
     ORDER BY s.starts_at, p.activity`, [req.boards, day])).rows;
  const undated = (await query(
    `SELECT s.id, s.title, s.capacity, p.activity, p.age_groups, p.required_tags, p.section, r.name AS round_name, r.is_main, sc.name AS board_name,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS claimed,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed' AND x.attended) AS here,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed' AND x.attended = false) AS noshow
     FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id JOIN schedules sc ON sc.id=r.schedule_id
     WHERE r.schedule_id = ANY($1) AND s.canceled_at IS NULL AND s.starts_at IS NULL AND ${A.TRACKED_SQL}
     ORDER BY sc.name, s.id`, [req.boards])).rows;
  // nearby days that have tracked sessions, for the arrows
  const near = (await query(
    `SELECT DISTINCT to_char(s.starts_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS d
     FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id JOIN schedules sc ON sc.id=r.schedule_id
     WHERE r.schedule_id = ANY($1) AND s.canceled_at IS NULL AND s.starts_at IS NOT NULL AND ${A.TRACKED_SQL} ORDER BY d`, [req.boards])).rows.map((r) => r.d);
  res.send(v.dayPage({ user: req.user, flash: flashFrom(req), day, sessions, undated,
    prev: near.filter((d) => d < day).pop() || null, next: near.find((d) => d > day) || null, isToday: day === today() }));
}));

router.get("/:sid", wrap(async (req, res) => {
  const s = await sessionInfo(int(req.params.sid));
  if (!s || !(await A.canCheckIn(req.user, s.schedule_id))) return go(res, "/checkin", { err: "That isn't one of your sessions." });
  const people = (await query(
    `SELECT x.id, x.attended, x.walk_in, x.note, a.id AS athlete_id, a.first_name, a.last_name,
       (SELECT m.group_name FROM schedule_members m WHERE m.athlete_id=a.id AND m.schedule_id=$2) AS grp
     FROM reservations x JOIN athletes a ON a.id=x.athlete_id
     WHERE x.session_id=$1 AND x.status='confirmed' ORDER BY a.last_name, a.first_name`, [s.id, s.schedule_id])).rows;
  // walk-ins come from this board's people (or anyone who has claimed on it)
  const others = (await query(
    `SELECT DISTINCT a.id, a.first_name, a.last_name FROM athletes a
     WHERE (EXISTS (SELECT 1 FROM schedule_members m WHERE m.athlete_id=a.id AND m.schedule_id=$2)
         OR EXISTS (SELECT 1 FROM reservations x JOIN training_sessions t ON t.id=x.session_id JOIN programs p ON p.id=t.program_id
                    JOIN rounds r ON r.id=p.round_id WHERE x.athlete_id=a.id AND r.schedule_id=$2))
       AND NOT EXISTS (SELECT 1 FROM reservations x WHERE x.session_id=$1 AND x.athlete_id=a.id AND x.status<>'canceled')
     ORDER BY a.last_name, a.first_name`, [s.id, s.schedule_id])).rows;
  res.send(v.sessionPage({ user: req.user, flash: flashFrom(req), s, people, others }));
}));

async function guard(req, res) {
  const s = await sessionInfo(int(req.params.sid));
  if (!s || !(await A.canCheckIn(req.user, s.schedule_id))) { go(res, "/checkin", { err: "That isn't one of your sessions." }); return null; }
  return s;
}

router.post("/:sid/mark", wrap(async (req, res) => {
  const s = await guard(req, res); if (!s) return;
  const state = { here: true, noshow: false }[req.body.state];
  await query(`UPDATE reservations SET attended=$3, attended_at = CASE WHEN $3::boolean IS NULL THEN NULL ELSE now() END, attended_by=$4
    WHERE id=$1 AND session_id=$2 AND status='confirmed'`, [int(req.body.rid), s.id, state === undefined ? null : state, req.user.id]);
  go(res, `/checkin/${s.id}#r${int(req.body.rid)}`, {});
}));

router.post("/:sid/all", wrap(async (req, res) => {
  const s = await guard(req, res); if (!s) return;
  const n = (await query(`UPDATE reservations SET attended=true, attended_at=now(), attended_by=$2
    WHERE session_id=$1 AND status='confirmed' AND attended IS NULL`, [s.id, req.user.id])).rowCount;
  go(res, `/checkin/${s.id}`, { ok: n ? `Marked ${n} here.` : "Everyone was already marked." });
}));

router.post("/:sid/walkin", wrap(async (req, res) => {
  const s = await guard(req, res); if (!s) return;
  const aid = int(req.body.athlete_id);
  if (!aid) return go(res, `/checkin/${s.id}`, { err: "Pick who walked in." });
  await query(`INSERT INTO reservations (session_id, athlete_id, booked_by, status, counts_toward_limit, walk_in, attended, attended_at, attended_by)
    VALUES ($1,$2,$3,'confirmed',false,true,true,now(),$3)
    ON CONFLICT (session_id, athlete_id) WHERE status <> 'canceled' DO UPDATE SET attended=true, attended_at=now(), attended_by=$3`, [s.id, aid, req.user.id]);
  const a = (await query(`SELECT first_name, last_name FROM athletes WHERE id=$1`, [aid])).rows[0];
  go(res, `/checkin/${s.id}`, { ok: `${a.first_name} ${a.last_name} added as a walk-in and marked here.` });
}));

module.exports = router;
