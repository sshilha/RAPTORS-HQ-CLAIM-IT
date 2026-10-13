// Levels: Round -> Times -> Sessions (activity + group + spots) -> scheduled on days.
// In the database a round's "session" definitions are programs (one per activity + age group);
// each scheduled occurrence is a training_sessions row.
const { AGE_GROUPS, ACTIVITIES, ALL_AGES_ACTIVITIES } = require("./config");

const sortAges = (ages) => AGE_GROUPS.filter((g) => ages.includes(g));
const agesLabel = (ages) => {
  const a = sortAges(ages);
  if (a.length === AGE_GROUPS.length) return "All ages";
  return a.length === 1 ? a[0] : `${a[0]}–${a[a.length - 1]}`;
};
const isAllAges = (activity, ages) => ALL_AGES_ACTIVITIES.includes(activity) && sortAges(ages).length === AGE_GROUPS.length;
const typeLabel = (activity, ages) => (isAllAges(activity, ages) ? activity : `${activity} ${agesLabel(ages)}`);
const programName = (roundName, activity, ages) => `${roundName} ${typeLabel(activity, ages)}`;

// Fallback capacity/coach by activity (used by imports and older data)
function defaultsFor(round, activity) {
  const d = ((round && round.activity_defaults) || {})[activity] || {};
  return { capacity: d.capacity || 8, coach: d.coach || null };
}

function readDefaults(body) {
  const out = {};
  ACTIVITIES.forEach((a, i) => {
    const cap = parseInt(body[`cap_${i}`], 10);
    out[a] = { capacity: cap > 0 && cap <= 200 ? cap : 8, coach: String(body[`coach_${i}`] || "").trim() || null };
  });
  return out;
}

function normalizeDefaults(d = {}) {
  const out = {};
  for (const a of ACTIVITIES) {
    const x = d[a] || {};
    const cap = parseInt(x.capacity, 10);
    out[a] = { capacity: cap > 0 && cap <= 200 ? cap : 8, coach: x.coach ? String(x.coach).slice(0, 80) : null };
  }
  return out;
}

// Time slots stored on the round, kept sorted and unique
function addSlots(round, slots) {
  const all = [...(round.time_slots || []), ...slots].filter((s) => s.start < s.end);
  const seen = new Set();
  return all.filter((s) => { const k = `${s.start}-${s.end}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

// Find or create the round's session definition for an activity + age group
async function ensureProgram(db, round, activity, ages, opts = {}) {
  const a = sortAges(ages);
  const found = (await db.query(
    `SELECT * FROM programs WHERE round_id=$1 AND activity=$2 AND age_groups=$3::text[]`, [round.id, activity, a])).rows[0];
  if (found) return found;
  const d = defaultsFor(round, activity);
  return (await db.query(
    `INSERT INTO programs (round_id, name, activity, age_groups, priority_limit, priority_ends_at, booking_opens_at,
       cancel_hours, default_capacity, default_coach)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [round.id, programName(round.name, activity, a), activity, a, round.priority_limit, round.priority_ends_at,
     round.booking_opens_at, round.cancel_hours, opts.capacity || d.capacity, opts.coach ?? d.coach])).rows[0];
}

async function syncPrograms(db, round) {
  const progs = (await db.query(`SELECT id, activity, age_groups FROM programs WHERE round_id=$1`, [round.id])).rows;
  for (const p of progs) {
    await db.query(
      `UPDATE programs SET name=$2, priority_limit=$3, priority_ends_at=$4, booking_opens_at=$5, cancel_hours=$6 WHERE id=$1`,
      [p.id, programName(round.name, p.activity, p.age_groups), round.priority_limit,
       round.priority_ends_at, round.booking_opens_at, round.cancel_hours]);
  }
}

// Put one occurrence of a session definition on the calendar. Returns false if it's already there.
async function schedule(db, round, program, { date, start, end, capacity, coach, location, notes }) {
  const dup = await db.query(
    `SELECT 1 FROM training_sessions s JOIN programs p ON p.id=s.program_id
     WHERE s.canceled_at IS NULL AND NOT p.archived AND p.activity=$1 AND p.age_groups=$2::text[]
       AND s.starts_at = ($3::timestamp AT TIME ZONE 'America/Chicago')`,
    [program.activity, program.age_groups, `${date} ${start}`]);
  if (dup.rowCount) return false;
  const d = defaultsFor(round, program.activity);
  await db.query(
    `INSERT INTO training_sessions (program_id, starts_at, ends_at, location, coach, capacity, notes)
     VALUES ($1, ($2::timestamp AT TIME ZONE 'America/Chicago'), ($3::timestamp AT TIME ZONE 'America/Chicago'), $4,$5,$6,$7)`,
    [program.id, `${date} ${start}`, `${date} ${end}`, location ?? round.location,
     coach || program.default_coach || d.coach, capacity || program.default_capacity || d.capacity, notes || null]);
  return true;
}

// Used by imports and copies: find/create the definition, then schedule it
async function addSession(db, round, s) {
  const program = await ensureProgram(db, round, s.activity, s.ages || s.age_groups, { capacity: s.capacity, coach: s.coach });
  return schedule(db, round, program, s);
}

// Copy a round's times, sessions (with spots), and schedule into a new round, shifted by offsetDays.
// Booking dates shift by the same amount so a copied season keeps its rhythm.
async function copyRound(db, src, { name, starts_on, ends_on, season_id, offsetDays, shiftRules }) {
  const shift = (col) => (shiftRules ? `${col} + ($2::int * interval '1 day')` : "NULL");
  const round = (await db.query(
    `INSERT INTO rounds (name, starts_on, ends_on, season_id, booking_opens_at, priority_ends_at, priority_limit,
       cancel_hours, location, activity_defaults, time_slots)
     SELECT $3, $4, $5, $6, ${shift("booking_opens_at")}, ${shift("priority_ends_at")}, priority_limit,
       cancel_hours, location, activity_defaults, time_slots FROM rounds WHERE id=$1 RETURNING *`,
    [src.id, offsetDays, name, starts_on, ends_on, season_id])).rows[0];
  for (const p of (await db.query(`SELECT * FROM programs WHERE round_id=$1`, [src.id])).rows)
    await ensureProgram(db, round, p.activity, p.age_groups, { capacity: p.default_capacity, coach: p.default_coach });
  const sess = (await db.query(
    `SELECT p.activity, p.age_groups, s.capacity, s.coach, s.location, s.notes,
       to_char((s.starts_at AT TIME ZONE 'America/Chicago')::date + $2::int, 'YYYY-MM-DD') AS date,
       to_char(s.starts_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS start,
       to_char(s.ends_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS "end"
     FROM training_sessions s JOIN programs p ON p.id=s.program_id
     WHERE p.round_id=$1 AND s.canceled_at IS NULL ORDER BY s.starts_at`, [src.id, offsetDays])).rows;
  let n = 0;
  for (const x of sess) if (x.date >= starts_on && x.date <= ends_on && (await addSession(db, round, x))) n++;
  return { round, sessions: n };
}

module.exports = {
  copyRound,
  sortAges, agesLabel, typeLabel, programName, isAllAges, defaultsFor, readDefaults, normalizeDefaults,
  addSlots, ensureProgram, syncPrograms, schedule, addSession,
};
