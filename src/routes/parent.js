const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const booking = require("../booking");
const { notify } = require("../notify");
const { inputParts, isDate } = require("../time");
const v = require("../views/parent");
const { FAMILY } = require("../config");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser);

// The family's participants: themselves (if set up) first, then their kids
const myAthletes = async (userId) => (await query(
  `SELECT a.*, ARRAY(SELECT DISTINCT m.group_name FROM schedule_members m WHERE m.athlete_id=a.id AND m.group_name IS NOT NULL) AS groups,
     EXISTS (SELECT 1 FROM schedule_members m WHERE m.athlete_id=a.id) AS on_roster
   FROM athletes a JOIN parent_athletes pa ON pa.athlete_id=a.id WHERE pa.user_id=$1
   ORDER BY (a.self_user_id IS NULL), a.first_name`, [userId])).rows;

// Only send families back to their own pages
const safeBack = (req, fallback) => {
  const r = str(req.body.return_to);
  return /^\/(athletes\/\d+\/day\/\d{4}-\d{2}-\d{2}|dashboard(\?[\w=&-]*)?)$/.test(r) ? r : fallback;
};
const localDate = (ts) => inputParts(ts).date;

// Are there sheets open to signed-in families (so a parent could sign themselves up)?
const openSheetsExist = async () => (await query(
  `SELECT 1 FROM rounds r LEFT JOIN seasons se ON se.id=r.season_id
   JOIN schedules sc ON sc.id=r.schedule_id
   WHERE r.signup_mode IN ('family','public') AND r.published_at IS NOT NULL AND se.completed_at IS NULL AND sc.archived_at IS NULL
     AND r.ends_on >= CURRENT_DATE LIMIT 1`)).rowCount > 0;

router.post("/me", wrap(async (req, res) => {
  const first = str(req.body.first_name).slice(0, 40), last = str(req.body.last_name).slice(0, 40);
  if (!first || !last) return go(res, "/dashboard", { err: "Enter your first and last name." });
  let me = (await query(`SELECT id FROM athletes WHERE self_user_id=$1`, [req.user.id])).rows[0];
  if (!me) {
    me = (await query(`INSERT INTO athletes (first_name, last_name, self_user_id) VALUES ($1,$2,$3) RETURNING id`, [first, last, req.user.id])).rows[0];
    await query(`INSERT INTO parent_athletes (user_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, me.id]);
  }
  go(res, `/dashboard?a=${me.id}`, { ok: `You're set up, ${first}. Pick a day to sign up.` });
}));

router.get("/dashboard", wrap(async (req, res) => {
  const athletes = await myAthletes(req.user.id);
  const admin = auth.isAdmin(req.user);
  const canSelf = !athletes.some((a) => a.self_user_id) && (await openSheetsExist());
  if (!athletes.length) return res.send(v.dashboardPage({ user: req.user, athletes, admin, canSelf, flash: flashFrom(req) }));
  const athlete = athletes.find((a) => a.id === int(req.query.a)) || athletes[0];
  const programs = await booking.bookingOptions(athlete);
  const reservations = (await booking.parentReservations(req.user.id)).filter((r) => r.athlete_id === athlete.id);

  // Month to show: the one asked for, else this month, else the month of the next session
  let month = /^\d{4}-\d{2}$/.test(str(req.query.m)) ? str(req.query.m) : null;
  if (!month) {
    const today = inputParts(new Date()).date;
    const days = programs.flatMap((p) => p.sessions.map((s) => localDate(s.starts_at))).sort();
    month = days.some((d) => d.startsWith(today.slice(0, 7))) || !days.length ? today.slice(0, 7) : days[0].slice(0, 7);
  }
  res.send(v.dashboardPage({ user: req.user, athletes, athlete, programs, reservations, month, admin, canSelf, flash: flashFrom(req) }));
}));

router.get("/athletes/:id/book", (req, res) => res.redirect(`/dashboard?a=${int(req.params.id)}`));

router.get("/athletes/:id/day/:date", wrap(async (req, res) => {
  const athletes = await myAthletes(req.user.id);
  const athlete = athletes.find((a) => a.id === int(req.params.id));
  const date = str(req.params.date);
  if (!athlete || !isDate(date)) return go(res, "/dashboard", { err: "That page isn't available." });
  const programs = await booking.bookingOptions(athlete);
  const days = [...new Set(programs.flatMap((p) => p.sessions.map((s) => localDate(s.starts_at))))].sort();
  // Who's going: names only (never contact details), as set under Settings → Family view
  const going = {};
  const ids = programs.flatMap((p) => p.sessions.filter((s) => localDate(s.starts_at) === date).map((s) => s.id));
  if (FAMILY.names !== "off" && ids.length) {
    const rows = (await query(
      `SELECT x.session_id, a.id, a.first_name, a.last_name FROM reservations x JOIN athletes a ON a.id=x.athlete_id
       WHERE x.session_id = ANY($1) AND x.status='confirmed' ORDER BY x.created_at, x.id`, [ids])).rows;
    for (const r of rows) (going[r.session_id] = going[r.session_id] || []).push({
      id: r.id, name: FAMILY.names === "full" ? `${r.first_name} ${r.last_name}` : `${r.first_name} ${(r.last_name || "").slice(0, 1)}.`,
    });
  }
  res.send(v.dayPage({
    user: req.user, athletes, athlete, programs, date, going, showNames: FAMILY.names !== "off",
    prevDay: days.filter((d) => d < date).pop(), nextDay: days.find((d) => d > date),
    admin: auth.isAdmin(req.user), flash: flashFrom(req),
  }));
}));

router.post("/athletes/:id/book", wrap(async (req, res) => {
  const athleteId = int(req.params.id);
  const back = safeBack(req, `/dashboard?a=${athleteId}`);
  try {
    const r = await booking.reserve({ userId: req.user.id, athleteId, sessionId: int(req.body.session_id) });
    notify(r.status, r.reservationId);
    go(res, back, { ok: r.status === "confirmed"
      ? "Spot claimed! A confirmation email is on its way."
      : "That one is full, so you're on the waitlist. If a spot opens, you'll move in automatically and get an email." });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, back, { err: e.message });
    if (e.code === "23505") return go(res, back, { err: "That athlete already has a spot or waitlist place for this session." });
    throw e;
  }
}));

router.post("/reservations/:id/cancel", wrap(async (req, res) => {
  const id = int(req.params.id);
  const back = safeBack(req, "/dashboard");
  try {
    const r = await booking.cancelReservation({ userId: req.user.id, reservationId: id });
    notify("canceled", id);
    r.promoted.forEach((pid) => notify("promoted", pid));
    go(res, back, { ok: r.wasStatus === "confirmed" ? "Spot given up. It's open for someone else now." : "Removed from the waitlist." });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, back, { err: e.message });
    throw e;
  }
}));

module.exports = router;
