const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const booking = require("../booking");
const { notify } = require("../notify");
const { AGE_GROUPS } = require("../config");
const { isDate, isTime, isLocal, localSql } = require("../time");
const v = require("../views/admin");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const view = (req, extra) => ({ user: req.user, flash: flashFrom(req), ...extra });

// ---------- programs ----------
function parseProgram(b) {
  const ages = [].concat(b.age_groups || []).filter((g) => AGE_GROUPS.includes(g));
  const p = {
    name: str(b.name), activity: str(b.activity), age_groups: ages, description: str(b.description) || null,
    priority_limit: int(b.priority_limit) ?? 2, cancel_hours: int(b.cancel_hours) ?? 24,
    booking_opens_at: str(b.booking_opens_at), priority_ends_at: str(b.priority_ends_at),
  };
  if (!p.name || !p.activity) return { err: "Enter a program name and activity." };
  if (!ages.length) return { err: "Choose at least one age group." };
  if (p.priority_limit < 1) return { err: "Priority reservations must be at least 1." };
  for (const k of ["booking_opens_at", "priority_ends_at"]) {
    if (p[k] && !isLocal(p[k])) return { err: "Enter dates as date and time." };
    p[k] = p[k] ? p[k].replace("T", " ") : null;
  }
  return { p };
}

const programParams = (p) => [p.name, p.activity, p.age_groups, p.description, p.priority_limit,
  p.priority_ends_at, p.booking_opens_at, p.cancel_hours];

router.get("/", (req, res) => res.redirect("/admin/programs"));

router.get("/programs", wrap(async (req, res) => {
  const programs = (await query(
    `SELECT p.*, (SELECT count(*)::int FROM training_sessions s WHERE s.program_id=p.id
       AND s.canceled_at IS NULL AND s.starts_at > now()) AS upcoming
     FROM programs p ORDER BY p.archived, p.activity, p.name`)).rows;
  res.send(v.programsPage(view(req, { programs })));
}));

router.post("/programs", wrap(async (req, res) => {
  const { p, err } = parseProgram(req.body);
  if (err) return go(res, "/admin/programs", { err });
  const { rows } = await query(
    `INSERT INTO programs (name, activity, age_groups, description, priority_limit, priority_ends_at, booking_opens_at, cancel_hours)
     VALUES ($1,$2,$3,$4,$5,${localSql(6)},${localSql(7)},$8) RETURNING id`, programParams(p));
  go(res, `/admin/programs/${rows[0].id}`, { ok: "Program created. Add its sessions below." });
}));

router.get("/programs/:id", wrap(async (req, res) => {
  const program = (await query(`SELECT * FROM programs WHERE id=$1`, [int(req.params.id)])).rows[0];
  if (!program) return go(res, "/admin/programs", { err: "Program not found." });
  const sessions = (await query(
    `SELECT s.*,
       (SELECT count(*)::int FROM reservations r WHERE r.session_id=s.id AND r.status='confirmed') AS confirmed,
       (SELECT count(*)::int FROM reservations r WHERE r.session_id=s.id AND r.status='waitlisted') AS waitlisted
     FROM training_sessions s WHERE s.program_id=$1 AND s.ends_at > now() - interval '14 days'
     ORDER BY s.starts_at`, [program.id])).rows;
  res.send(v.programPage(view(req, { program, sessions })));
}));

router.post("/programs/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { p, err } = parseProgram(req.body);
  if (err) return go(res, `/admin/programs/${id}`, { err });
  await query(
    `UPDATE programs SET name=$1, activity=$2, age_groups=$3, description=$4, priority_limit=$5,
       priority_ends_at=${localSql(6)}, booking_opens_at=${localSql(7)}, cancel_hours=$8 WHERE id=$9`,
    [...programParams(p), id]);
  go(res, `/admin/programs/${id}`, { ok: "Program saved." });
}));

router.post("/programs/:id/archive", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(`UPDATE programs SET archived = NOT archived WHERE id=$1 RETURNING archived`, [id]);
  go(res, `/admin/programs/${id}`, { ok: rows[0]?.archived ? "Program archived." : "Program restored." });
}));

// ---------- sessions ----------
function parseSession(b) {
  const s = { date: str(b.date), start: str(b.start_time), end: str(b.end_time), location: str(b.location) || null,
    coach: str(b.coach) || null, capacity: int(b.capacity), notes: str(b.notes) || null };
  if (!isDate(s.date) || !isTime(s.start) || !isTime(s.end)) return { err: "Enter a date, start time, and end time." };
  if (s.end <= s.start) return { err: "End time must be after the start time." };
  if (!s.capacity || s.capacity < 1) return { err: "Capacity must be at least 1." };
  return { s };
}

router.post("/programs/:id/sessions", wrap(async (req, res) => {
  const programId = int(req.params.id);
  const back = `/admin/programs/${programId}`;
  const { s, err } = parseSession(req.body);
  if (err) return go(res, back, { err });
  const weeks = Math.min(Math.max(int(req.body.repeat_weeks) || 1, 1), 12);
  for (let w = 0; w < weeks; w++) {
    await query(
      `INSERT INTO training_sessions (program_id, starts_at, ends_at, location, coach, capacity, notes)
       VALUES ($1, ((($2::date + $3::int * 7) || ' ' || $4)::timestamp AT TIME ZONE 'America/Chicago'),
                   ((($2::date + $3::int * 7) || ' ' || $5)::timestamp AT TIME ZONE 'America/Chicago'),
               $6, $7, $8, $9)`,
      [programId, s.date, w, s.start, s.end, s.location, s.coach, s.capacity, s.notes]);
  }
  go(res, back, { ok: weeks === 1 ? "Session added." : `${weeks} weekly sessions added.` });
}));

router.get("/sessions/:id", wrap(async (req, res) => {
  const session = (await query(`SELECT * FROM training_sessions WHERE id=$1`, [int(req.params.id)])).rows[0];
  if (!session) return go(res, "/admin/programs", { err: "Session not found." });
  const program = (await query(`SELECT * FROM programs WHERE id=$1`, [session.program_id])).rows[0];
  const roster = (await query(
    `SELECT r.id, r.status, r.created_at, a.first_name, a.last_name, a.age_group,
       ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS emails
     FROM reservations r JOIN athletes a ON a.id=r.athlete_id
     WHERE r.session_id=$1 AND r.status<>'canceled' ORDER BY r.created_at, r.id`, [session.id])).rows;
  res.send(v.sessionPage(view(req, { session, program,
    confirmed: roster.filter((r) => r.status === "confirmed"),
    waitlist: roster.filter((r) => r.status === "waitlisted") })));
}));

router.post("/sessions/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const back = `/admin/sessions/${id}`;
  const { s, err } = parseSession(req.body);
  if (err) return go(res, back, { err });
  try {
    const promoted = await booking.updateSessionCapacity(id, {
      capacity: s.capacity,
      apply: (db) => db.query(
        `UPDATE training_sessions SET starts_at=${localSql(1)}, ends_at=${localSql(2)},
           location=$3, coach=$4, capacity=$5, notes=$6 WHERE id=$7`,
        [`${s.date} ${s.start}`, `${s.date} ${s.end}`, s.location, s.coach, s.capacity, s.notes, id]),
    });
    promoted.forEach((pid) => notify("promoted", pid));
    go(res, back, { ok: promoted.length ? `Session saved. ${promoted.length} moved off the waitlist.` : "Session saved." });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, back, { err: e.message });
    throw e;
  }
}));

router.post("/sessions/:id/cancel", wrap(async (req, res) => {
  const id = int(req.params.id);
  try {
    const ids = await booking.cancelSession(id, req.user.id);
    ids.forEach((rid) => notify("sessionCanceled", rid));
    go(res, `/admin/sessions/${id}`, { ok: `Session canceled. ${ids.length} ${ids.length === 1 ? "family was" : "families were"} emailed.` });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, `/admin/sessions/${id}`, { err: e.message });
    throw e;
  }
}));

router.post("/reservations/:id/cancel", wrap(async (req, res) => {
  const id = int(req.params.id);
  const sid = (await query(`SELECT session_id FROM reservations WHERE id=$1`, [id])).rows[0]?.session_id;
  try {
    const r = await booking.cancelReservation({ userId: req.user.id, reservationId: id, admin: true });
    notify("canceled", id);
    r.promoted.forEach((pid) => notify("promoted", pid));
    go(res, `/admin/sessions/${sid}`, { ok: r.promoted.length ? "Removed. The next waitlisted athlete moved in." : "Removed." });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, `/admin/sessions/${sid}`, { err: e.message });
    throw e;
  }
}));

// ---------- athletes ----------
function parseAthlete(b) {
  const a = { first: str(b.first_name), last: str(b.last_name), age: str(b.age_group), team: str(b.team) || null };
  if (!a.first || !a.last) return { err: "Enter the athlete's first and last name." };
  if (!AGE_GROUPS.includes(a.age)) return { err: "Choose an age group." };
  return { a };
}

async function linkParents(athleteId, raw) {
  const emails = String(raw || "").split(/[,;\s]+/).map(auth.normalizeEmail).filter(Boolean);
  const bad = emails.filter((e) => !auth.isValidEmail(e));
  for (const e of emails.filter(auth.isValidEmail)) {
    const u = await auth.findOrCreateUser(e);
    await query(`INSERT INTO parent_athletes (user_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.id, athleteId]);
  }
  return bad;
}

router.get("/athletes", wrap(async (req, res) => {
  const athletes = (await query(
    `SELECT a.*, ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id
       WHERE pa.athlete_id=a.id ORDER BY u.email) AS emails
     FROM athletes a ORDER BY a.age_group NULLS FIRST, a.last_name, a.first_name`)).rows;
  res.send(v.athletesPage(view(req, { athletes })));
}));

router.post("/athletes", wrap(async (req, res) => {
  const { a, err } = parseAthlete(req.body);
  if (err) return go(res, "/admin/athletes", { err });
  const { rows } = await query(
    `INSERT INTO athletes (first_name, last_name, age_group, team) VALUES ($1,$2,$3,$4) RETURNING id`,
    [a.first, a.last, a.age, a.team]);
  const bad = await linkParents(rows[0].id, req.body.parent_emails);
  go(res, "/admin/athletes", bad.length
    ? { err: `Added ${a.first}, but these emails weren't valid: ${bad.join(", ")}` }
    : { ok: `Added ${a.first} ${a.last}.` });
}));

router.get("/athletes/:id", wrap(async (req, res) => {
  const athlete = (await query(`SELECT * FROM athletes WHERE id=$1`, [int(req.params.id)])).rows[0];
  if (!athlete) return go(res, "/admin/athletes", { err: "Athlete not found." });
  const parents = (await query(
    `SELECT u.* FROM users u JOIN parent_athletes pa ON pa.user_id=u.id WHERE pa.athlete_id=$1 ORDER BY u.email`,
    [athlete.id])).rows;
  res.send(v.athletePage(view(req, { athlete, parents })));
}));

router.post("/athletes/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { a, err } = parseAthlete(req.body);
  if (err) return go(res, `/admin/athletes/${id}`, { err });
  await query(`UPDATE athletes SET first_name=$1, last_name=$2, age_group=$3, team=$4 WHERE id=$5`,
    [a.first, a.last, a.age, a.team, id]);
  go(res, `/admin/athletes/${id}`, { ok: "Athlete saved." });
}));

router.post("/athletes/:id/parents", wrap(async (req, res) => {
  const id = int(req.params.id);
  const bad = await linkParents(id, req.body.email);
  go(res, `/admin/athletes/${id}`, bad.length ? { err: "Enter a valid email." } : { ok: "Parent linked." });
}));

router.post("/athletes/:id/parents/:uid/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`DELETE FROM parent_athletes WHERE athlete_id=$1 AND user_id=$2`, [id, int(req.params.uid)]);
  go(res, `/admin/athletes/${id}`, { ok: "Parent unlinked." });
}));

router.post("/athletes/:id/delete", wrap(async (req, res) => {
  await query(`DELETE FROM athletes WHERE id=$1`, [int(req.params.id)]);
  go(res, "/admin/athletes", { ok: "Athlete deleted." });
}));

module.exports = router;
