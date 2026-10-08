const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const booking = require("../booking");
const { notify } = require("../notify");
const v = require("../views/parent");
const { wrap, flashFrom, go, int } = require("./util");

const router = express.Router();
router.use(auth.requireUser);

async function myAthlete(userId, athleteId) {
  const { rows } = await query(
    `SELECT a.* FROM athletes a JOIN parent_athletes pa ON pa.athlete_id=a.id
     WHERE pa.user_id=$1 AND a.id=$2`, [userId, athleteId]);
  return rows[0];
}

router.get("/dashboard", wrap(async (req, res) => {
  const athletes = (await query(
    `SELECT a.* FROM athletes a JOIN parent_athletes pa ON pa.athlete_id=a.id
     WHERE pa.user_id=$1 ORDER BY a.first_name`, [req.user.id])).rows;
  const reservations = await booking.parentReservations(req.user.id);
  res.send(v.dashboardPage({ user: req.user, athletes, reservations, admin: auth.isAdmin(req.user), flash: flashFrom(req) }));
}));

router.get("/athletes/:id/book", wrap(async (req, res) => {
  const athlete = await myAthlete(req.user.id, int(req.params.id));
  if (!athlete) return go(res, "/dashboard", { err: "That athlete isn't linked to your account." });
  const programs = await booking.bookingOptions(athlete);
  res.send(v.bookPage({ user: req.user, athlete, programs, admin: auth.isAdmin(req.user), flash: flashFrom(req) }));
}));

router.post("/athletes/:id/book", wrap(async (req, res) => {
  const athleteId = int(req.params.id);
  const back = `/athletes/${athleteId}/book`;
  try {
    const r = await booking.reserve({ userId: req.user.id, athleteId, sessionId: int(req.body.session_id) });
    notify(r.status, r.reservationId);
    go(res, back, { ok: r.status === "confirmed"
      ? "Reserved. A confirmation email is on its way."
      : "Session is full, so you're on the waitlist. If a spot opens, you'll move in automatically and get an email." });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, back, { err: e.message });
    if (e.code === "23505") return go(res, back, { err: "That athlete already has a spot or waitlist place for this session." });
    throw e;
  }
}));

router.post("/reservations/:id/cancel", wrap(async (req, res) => {
  const id = int(req.params.id);
  try {
    const r = await booking.cancelReservation({ userId: req.user.id, reservationId: id });
    notify("canceled", id);
    r.promoted.forEach((pid) => notify("promoted", pid));
    go(res, "/dashboard", { ok: r.wasStatus === "confirmed" ? "Reservation canceled. The spot is open for another athlete." : "Removed from the waitlist." });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, "/dashboard", { err: e.message });
    throw e;
  }
}));

module.exports = router;
