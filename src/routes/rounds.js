const express = require("express");
const { pool, query } = require("../db");
const auth = require("../auth");
const booking = require("../booking");
const { notify } = require("../notify");
const { AGE_GROUPS, ACTIVITIES, ALL_AGES_ACTIVITIES, TZ } = require("../config");
const R = require("../rounds");
const { isDate, isTime, isLocal, localSql } = require("../time");
const v = require("../views/rounds");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

async function tx(fn) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const out = await fn(c); await c.query("COMMIT"); return out; }
  catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}

const getRound = async (id, db = { query }) => (await db.query(`SELECT * FROM rounds WHERE id=$1`, [id])).rows[0];
const localOrNull = (s) => (isLocal(str(s)) ? str(s).replace("T", " ") : null);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------- list + create ----------
router.get("/", wrap(async (req, res) => {
  const rounds = (await query(
    `SELECT r.*,
       (SELECT count(*)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id
          WHERE p.round_id=r.id AND s.canceled_at IS NULL) AS sessions,
       (SELECT count(*)::int FROM reservations x JOIN training_sessions s ON s.id=x.session_id
          JOIN programs p ON p.id=s.program_id WHERE p.round_id=r.id AND x.status<>'canceled') AS reservations
     FROM rounds r ORDER BY r.starts_on DESC`)).rows;
  res.send(v.roundsPage({ user: req.user, flash: flashFrom(req), rounds }));
}));

router.post("/", wrap(async (req, res) => {
  const name = str(req.body.name), s = str(req.body.starts_on), e = str(req.body.ends_on);
  if (!name || !isDate(s) || !isDate(e) || e < s) return go(res, "/admin/rounds", { err: "Enter a name and a start date on or before the end date." });
  const src = int(req.body.copy_from) ? await getRound(int(req.body.copy_from)) : null;

  const id = await tx(async (db) => {
    const round = (await db.query(
      `INSERT INTO rounds (name, starts_on, ends_on, priority_limit, cancel_hours, location, activity_defaults, time_slots)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, s, e, src?.priority_limit ?? 2, src?.cancel_hours ?? 24, src ? src.location : "Turn Two Athletics",
       JSON.stringify(src?.activity_defaults || R.readDefaults({})), JSON.stringify(src?.time_slots || [])])).rows[0];
    if (src) {
      // Copy the session definitions (with their spots), then shift every scheduled session
      for (const p of (await db.query(`SELECT * FROM programs WHERE round_id=$1`, [src.id])).rows)
        await R.ensureProgram(db, round, p.activity, p.age_groups, { capacity: p.default_capacity, coach: p.default_coach });
      const sess = (await db.query(
        `SELECT p.activity, p.age_groups, s.capacity, s.coach, s.location, s.notes,
           to_char((s.starts_at AT TIME ZONE '${TZ}')::date + ($2::date - $3::date), 'YYYY-MM-DD') AS date,
           to_char(s.starts_at AT TIME ZONE '${TZ}', 'HH24:MI') AS start,
           to_char(s.ends_at AT TIME ZONE '${TZ}', 'HH24:MI') AS "end"
         FROM training_sessions s JOIN programs p ON p.id=s.program_id
         WHERE p.round_id=$1 AND s.canceled_at IS NULL ORDER BY s.starts_at`, [src.id, s, src.starts_on])).rows;
      for (const x of sess) if (x.date <= e) await R.addSession(db, round, x);
    }
    return round.id;
  });
  go(res, `/admin/rounds/${id}`, { ok: src
    ? "Round created as a copy. Adjust it, then publish."
    : "Round created. Next: add its times and sessions, then schedule them on the calendar." });
}));

// ---------- builder ----------
router.get("/:id", wrap(async (req, res) => {
  const round = await getRound(int(req.params.id));
  if (!round) return go(res, "/admin/rounds", { err: "Round not found." });
  const types = (await query(
    `SELECT p.*, (SELECT count(*)::int FROM training_sessions s WHERE s.program_id=p.id AND s.canceled_at IS NULL) AS scheduled
     FROM programs p WHERE p.round_id=$1`, [round.id])).rows
    .sort((a, b) => ACTIVITIES.indexOf(a.activity) - ACTIVITIES.indexOf(b.activity) ||
      AGE_GROUPS.indexOf(a.age_groups[0]) - AGE_GROUPS.indexOf(b.age_groups[0]));
  const sessions = (await query(
    `SELECT s.id, s.capacity, p.id AS program_id, p.activity, p.age_groups,
       to_char(s.starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS date,
       to_char(s.starts_at AT TIME ZONE '${TZ}', 'HH24:MI') AS start,
       to_char(s.ends_at AT TIME ZONE '${TZ}', 'HH24:MI') AS "end",
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS taken
     FROM training_sessions s JOIN programs p ON p.id=s.program_id
     WHERE p.round_id=$1 AND s.canceled_at IS NULL ORDER BY s.starts_at, p.activity`, [round.id])).rows;
  res.send(v.builderPage({ user: req.user, flash: flashFrom(req), round, types, sessions, last: req.query }));
}));

router.post("/:id/settings", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const name = str(b.name), s = str(b.starts_on), e = str(b.ends_on);
  if (!name || !isDate(s) || !isDate(e) || e < s) return go(res, `/admin/rounds/${id}`, { err: "Enter a name and a start date on or before the end date." });
  await tx(async (db) => {
    const round = (await db.query(
      `UPDATE rounds SET name=$2, starts_on=$3, ends_on=$4, booking_opens_at=${localSql(5)}, priority_ends_at=${localSql(6)},
         priority_limit=$7, cancel_hours=$8, location=$9 WHERE id=$1 RETURNING *`,
      [id, name, s, e, localOrNull(b.booking_opens_at), localOrNull(b.priority_ends_at),
       Math.min(Math.max(int(b.priority_limit) || 2, 1), 50), Math.min(int(b.cancel_hours) ?? 24, 336), str(b.location) || null])).rows[0];
    await R.syncPrograms(db, round);
    if (b.apply_location) await db.query(
      `UPDATE training_sessions s SET location=$2 FROM programs p WHERE p.id=s.program_id AND p.round_id=$1`, [id, round.location]);
  });
  go(res, `/admin/rounds/${id}#settings`, { ok: "Round saved." });
}));

// ---------- times ----------
router.post("/:id/slots", wrap(async (req, res) => {
  const id = int(req.params.id);
  const start = str(req.body.start_time), end = str(req.body.end_time);
  if (!isTime(start) || !isTime(end) || end <= start) return go(res, `/admin/rounds/${id}#setup`, { err: "Enter a start time and a later end time." });
  const round = await getRound(id);
  await query(`UPDATE rounds SET time_slots=$2 WHERE id=$1`, [id, JSON.stringify(R.addSlots(round, [{ start, end }]))]);
  go(res, `/admin/rounds/${id}#setup`, { ok: "Time added." });
}));

router.post("/:id/slots/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  const round = await getRound(id);
  const key = str(req.body.slot);
  const slots = (round.time_slots || []).filter((s) => `${s.start}-${s.end}` !== key);
  await query(`UPDATE rounds SET time_slots=$2 WHERE id=$1`, [id, JSON.stringify(slots)]);
  go(res, `/admin/rounds/${id}#setup`, { ok: "Time removed. Sessions already scheduled at that time stay on the calendar." });
}));

// ---------- session definitions (activity + group + spots) ----------
function readType(b) {
  const activity = ACTIVITIES.includes(b.activity) ? b.activity : null;
  let ages = [].concat(b.ages || []).filter((g) => AGE_GROUPS.includes(g));
  if (activity && !ages.length && ALL_AGES_ACTIVITIES.includes(activity)) ages = [...AGE_GROUPS];
  const spots = int(b.spots);
  return { activity, ages, spots: spots && spots <= 200 ? spots : null, coach: str(b.coach) || null };
}

router.post("/:id/types", wrap(async (req, res) => {
  const id = int(req.params.id);
  const t = readType(req.body);
  if (!t.activity || !t.ages.length || !t.spots) return go(res, `/admin/rounds/${id}#setup`, { err: "Choose an activity, at least one age group, and the number of spots." });
  const round = await getRound(id);
  const exists = (await query(`SELECT 1 FROM programs WHERE round_id=$1 AND activity=$2 AND age_groups=$3::text[]`,
    [id, t.activity, R.sortAges(t.ages)])).rowCount;
  if (exists) return go(res, `/admin/rounds/${id}#setup`, { err: `${R.typeLabel(t.activity, t.ages)} is already set up in this round. Change its spots in the list.` });
  await R.ensureProgram({ query }, round, t.activity, t.ages, { capacity: t.spots, coach: t.coach });
  go(res, `/admin/rounds/${id}#setup`, { ok: `Added ${R.typeLabel(t.activity, t.ages)}, ${t.spots} spots.` });
}));

router.post("/:id/types/:pid", wrap(async (req, res) => {
  const id = int(req.params.id), pid = int(req.params.pid);
  const spots = int(req.body.spots);
  if (!spots || spots > 200) return go(res, `/admin/rounds/${id}#setup`, { err: "Spots must be between 1 and 200." });
  const coach = str(req.body.coach) || null;
  const p = (await query(`SELECT * FROM programs WHERE id=$1 AND round_id=$2`, [pid, id])).rows[0];
  if (!p) return go(res, `/admin/rounds/${id}#setup`, { err: "Session not found." });
  await query(`UPDATE programs SET default_capacity=$2, default_coach=$3 WHERE id=$1`, [pid, spots, coach]);

  // Apply to everything already scheduled; never drop below who's already reserved
  const sess = (await query(
    `SELECT s.id, (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS taken
     FROM training_sessions s WHERE s.program_id=$1 AND s.canceled_at IS NULL`, [pid])).rows;
  let updated = 0, kept = 0, promoted = [];
  for (const s of sess) {
    const cap = Math.max(spots, s.taken);
    if (cap !== spots) kept++;
    promoted = promoted.concat(await booking.updateSessionCapacity(s.id, {
      capacity: cap, apply: (db) => db.query(`UPDATE training_sessions SET capacity=$2, coach=$3 WHERE id=$1`, [s.id, cap, coach]) }));
    updated++;
  }
  promoted.forEach((rid) => notify("promoted", rid));
  go(res, `/admin/rounds/${id}#setup`, { ok: `Saved. Updated ${plural(updated, "scheduled session")}` +
    (kept ? `; ${kept} kept higher because more athletes are already reserved` : "") +
    (promoted.length ? `; ${plural(promoted.length, "athlete")} moved off the waitlist` : "") + "." });
}));

router.post("/:id/types/:pid/delete", wrap(async (req, res) => {
  const id = int(req.params.id), pid = int(req.params.pid);
  const n = (await query(`SELECT count(*)::int AS n FROM training_sessions WHERE program_id=$1`, [pid])).rows[0].n;
  if (n) return go(res, `/admin/rounds/${id}#setup`, { err: "Remove this session from the calendar first." });
  await query(`DELETE FROM programs WHERE id=$1 AND round_id=$2`, [pid, id]);
  go(res, `/admin/rounds/${id}#setup`, { ok: "Session removed." });
}));

// ---------- schedule ----------
const parseDates = (raw) => [...new Set(String(raw || "").split(",").map((d) => d.trim()).filter(isDate))].sort();

router.post("/:id/schedule", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const round = await getRound(id);
  const dates = parseDates(b.dates);
  let start, end;
  if (b.slot && b.slot !== "custom") [start, end] = String(b.slot).split("-");
  else { start = str(b.start_time); end = str(b.end_time); }
  const typeIds = [].concat(b.types || []).map(int).filter(Boolean);
  const keep = { slot: str(b.slot), types: typeIds.join(","), d: dates[0] || "" };
  const back = (flash) => go(res, `/admin/rounds/${id}`, { ...flash, ...keep });

  if (!dates.length) return back({ err: "Select at least one day on the calendar." });
  if (!isTime(start) || !isTime(end) || end <= start) return back({ err: "Pick a time, or enter a start and later end time." });
  if (!typeIds.length) return back({ err: "Check at least one session." });

  const programs = (await query(`SELECT * FROM programs WHERE round_id=$1 AND id = ANY($2)`, [id, typeIds])).rows;
  let added = 0;
  await tx(async (db) => {
    for (const date of dates) for (const p of programs) if (await R.schedule(db, round, p, { date, start, end })) added++;
    // A custom time becomes one of the round's times for next time
    if (b.slot === "custom") await db.query(`UPDATE rounds SET time_slots=$2 WHERE id=$1`,
      [id, JSON.stringify(R.addSlots(round, [{ start, end }]))]);
  });
  const tried = dates.length * programs.length;
  if (b.slot === "custom") keep.slot = `${start}-${end}`;
  back({ ok: `Scheduled ${plural(added, "session")}` + (tried > added ? `. Skipped ${tried - added} already on the calendar.` : ".") });
}));

router.post("/:id/copy-day", wrap(async (req, res) => {
  const id = int(req.params.id);
  const from = str(req.body.copy_from);
  const targets = parseDates(req.body.dates).filter((d) => d !== from);
  if (!isDate(from) || !targets.length) return go(res, `/admin/rounds/${id}`, { err: "Pick a day to copy, then select the days to copy it to." });
  const round = await getRound(id);
  let added = 0;
  await tx(async (db) => {
    const src = (await db.query(
      `SELECT p.*, to_char(s.starts_at AT TIME ZONE '${TZ}', 'HH24:MI') AS start, to_char(s.ends_at AT TIME ZONE '${TZ}', 'HH24:MI') AS "end"
       FROM training_sessions s JOIN programs p ON p.id=s.program_id
       WHERE p.round_id=$1 AND s.canceled_at IS NULL AND (s.starts_at AT TIME ZONE '${TZ}')::date = $2::date`, [id, from])).rows;
    for (const date of targets) for (const x of src)
      if (await R.schedule(db, round, x, { date, start: x.start, end: x.end })) added++;
  });
  go(res, `/admin/rounds/${id}`, { ok: `Copied ${plural(added, "session")} to ${plural(targets.length, "day")}.`, d: targets[0] });
}));

router.post("/:id/sessions/:sid/delete", wrap(async (req, res) => {
  const id = int(req.params.id), sid = int(req.params.sid);
  const taken = (await query(`SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status<>'canceled'`, [sid])).rows[0].n;
  if (taken) return go(res, `/admin/sessions/${sid}`, { err: "This session has reservations. Cancel it instead so families are emailed." });
  const date = (await query(`SELECT to_char(starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS d FROM training_sessions WHERE id=$1`, [sid])).rows[0]?.d;
  await query(`DELETE FROM training_sessions WHERE id=$1`, [sid]);
  go(res, `/admin/rounds/${id}`, { ok: "Removed from the calendar.", d: date || "" });
}));

router.post("/:id/publish", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(
    `UPDATE rounds SET published_at = CASE WHEN published_at IS NULL THEN now() ELSE NULL END WHERE id=$1 RETURNING published_at`, [id]);
  go(res, `/admin/rounds/${id}`, { ok: rows[0]?.published_at ? "Published. Families can now see and book this round." : "Hidden from families. Existing reservations are kept." });
}));

router.post("/:id/delete", wrap(async (req, res) => {
  const id = int(req.params.id);
  const n = (await query(
    `SELECT count(*)::int AS n FROM reservations x JOIN training_sessions s ON s.id=x.session_id
     JOIN programs p ON p.id=s.program_id WHERE p.round_id=$1 AND x.status<>'canceled'`, [id])).rows[0].n;
  if (n) return go(res, `/admin/rounds/${id}`, { err: "This round has reservations, so it can't be deleted. Hide it instead." });
  await query(`DELETE FROM rounds WHERE id=$1`, [id]);
  go(res, "/admin/rounds", { ok: "Round deleted." });
}));

module.exports = router;
