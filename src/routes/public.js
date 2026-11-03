// Public sign-up sheets: /s/<token>. No account needed; people give a name and email.
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const booking = require("../booking");
const { notify } = require("../notify");
const { TZ } = require("../config");
const v = require("../views/public");
const { wrap, int, str } = require("./util");

const router = express.Router();

async function sheet(token) {
  return (await query(
    `SELECT r.*, sc.labels AS schedule_labels, sc.name AS schedule_name, se.completed_at AS season_done, sc.archived_at AS schedule_archived,
       coalesce(sc.family_names, 'initial') AS family_names, sc.event_date, sc.event_end, sc.event_location,
       sc.description AS board_description, sc.contact_name, sc.contact_info
     FROM rounds r LEFT JOIN schedules sc ON sc.id=r.schedule_id LEFT JOIN seasons se ON se.id=r.season_id
     WHERE r.share_token=$1`, [token])).rows[0];
}
const usable = (r) => r && r.signup_mode === "public" && r.published_at && !r.season_done && !r.schedule_archived;

async function slots(roundId, mode = "initial") {
  const rows = (await query(
    `SELECT s.*, p.activity, p.age_groups, p.required_tags, p.block_minutes, p.waitlist AS program_waitlist, p.booking_opens_at,
       to_char(s.starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS confirmed
     FROM training_sessions s JOIN programs p ON p.id=s.program_id
     WHERE p.round_id=$1 AND s.canceled_at IS NULL AND (s.starts_at IS NULL OR s.starts_at > now())
       AND cardinality(s.only_groups) = 0 AND cardinality(s.only_tags) = 0
     ORDER BY s.starts_at NULLS FIRST, p.activity, s.id`, [roundId])).rows;
  if (mode !== "off" && rows.length) {
    const names = (await query(
      `SELECT x.session_id, a.first_name, a.last_name, CASE WHEN (SELECT note_public FROM rounds WHERE id=$2) THEN x.note END AS note
     FROM reservations x JOIN athletes a ON a.id=x.athlete_id
       WHERE x.session_id = ANY($1) AND x.status='confirmed' ORDER BY x.created_at`, [rows.map((r) => r.id), roundId])).rows;
    for (const r of rows) r.going = names.filter((n) => n.session_id === r.id)
      .map((n) => (mode === "full" ? `${n.first_name} ${n.last_name}` : `${n.first_name} ${(n.last_name || "").slice(0, 1)}.`) + (n.note ? ` · ${n.note}` : ""));
  }
  return rows;
}

router.get("/:token", wrap(async (req, res) => {
  const r = await sheet(str(req.params.token));
  if (!usable(r)) return res.status(404).send(v.closedPage({ user: req.user }));
  res.send(v.sheetPage({ user: req.user, round: r, slots: await slots(r.id, r.family_names), flash: { ok: req.query.ok, err: req.query.err } }));
}));

async function loadSlot(r, sid) {
  return (await slots(r.id)).find((s) => s.id === sid);
}

router.get("/:token/:sid", wrap(async (req, res) => {
  const r = await sheet(str(req.params.token));
  if (!usable(r)) return res.status(404).send(v.closedPage({ user: req.user }));
  const s = await loadSlot(r, int(req.params.sid));
  if (!s) return res.redirect(`/s/${r.share_token}?err=${encodeURIComponent("That time is no longer available.")}`);
  res.send(v.formPage({ user: req.user, round: r, slot: s, values: { email: req.user ? req.user.email : "" } }));
}));

router.post("/:token/:sid", wrap(async (req, res) => {
  const r = await sheet(str(req.params.token));
  if (!usable(r)) return res.status(404).send(v.closedPage({ user: req.user }));
  const s = await loadSlot(r, int(req.params.sid));
  if (!s) return res.redirect(`/s/${r.share_token}?err=${encodeURIComponent("That time is no longer available.")}`);
  const b = req.body;
  const values = { first_name: str(b.first_name).slice(0, 40), last_name: str(b.last_name).slice(0, 40), email: auth.normalizeEmail(b.email), note: str(b.note).slice(0, 120) };
  const again = (err) => res.status(400).send(v.formPage({ user: req.user, round: r, slot: s, values, err }));
  if (str(b.website)) return again("Something went wrong. Please try again."); // bots fill the hidden field
  if (!values.first_name || !values.last_name) return again("Enter the first and last name of the person signing up.");
  if (!auth.isValidEmail(values.email)) return again("Enter a valid email address.");

  // The email becomes (or matches) an account; the named person is one of its participants
  const user = await auth.findOrCreateUser(values.email);
  let p = (await query(
    `SELECT a.id FROM athletes a JOIN parent_athletes pa ON pa.athlete_id=a.id
     WHERE pa.user_id=$1 AND lower(a.first_name)=lower($2) AND lower(a.last_name)=lower($3) LIMIT 1`,
    [user.id, values.first_name, values.last_name])).rows[0];
  if (!p) {
    p = (await query(`INSERT INTO athletes (first_name, last_name) VALUES ($1,$2) RETURNING id`, [values.first_name, values.last_name])).rows[0];
    await query(`INSERT INTO parent_athletes (user_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, p.id]);
  }
  try {
    const out = await booking.reserve({ userId: user.id, athleteId: p.id, sessionId: s.id, note: b.note });
    notify(out.status, out.reservationId);
    res.send(v.donePage({ user: req.user, round: r, slot: s, values, status: out.status }));
  } catch (e) {
    if (e instanceof booking.BookingError) return again(e.message);
    if (e.code === "23505") return again(`${values.first_name} is already signed up for this time.`);
    throw e;
  }
}));

module.exports = router;
