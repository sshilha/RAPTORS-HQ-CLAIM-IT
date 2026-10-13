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

const BLOCK_CHOICES = [15, 20, 30, 45, 60];
const cleanBlock = (v) => (BLOCK_CHOICES.includes(parseInt(v, 10)) ? parseInt(v, 10) : null);
// Out of the box, Cage Time runs in 30-minute blocks of 2
const BUILTIN = { "Cage Time": { capacity: 2, block: 30 } };

// Fallback capacity/coach/blocks by activity (used by imports and older data)
function defaultsFor(round, activity) {
  const d = ((round && round.activity_defaults) || {})[activity] || BUILTIN[activity] || {};
  return { capacity: d.capacity || 8, coach: d.coach || null, block: cleanBlock(d.block) };
}

function readDefaults(body) {
  const out = {};
  ACTIVITIES.forEach((a, i) => {
    const cap = parseInt(body[`cap_${i}`], 10);
    const fallback = BUILTIN[a] || {};
    out[a] = {
      capacity: cap > 0 && cap <= 200 ? cap : fallback.capacity || 8,
      coach: String(body[`coach_${i}`] || "").trim() || null,
      block: body[`block_${i}`] !== undefined ? cleanBlock(body[`block_${i}`]) : fallback.block || null,
    };
  });
  return out;
}

function normalizeDefaults(d = {}) {
  const out = {};
  for (const a of ACTIVITIES) {
    const x = d[a] || BUILTIN[a] || {};
    const cap = parseInt(x.capacity, 10);
    out[a] = { capacity: cap > 0 && cap <= 200 ? cap : 8, coach: x.coach ? String(x.coach).slice(0, 80) : null, block: cleanBlock(x.block) };
  }
  return out;
}

// ---- Per-activity limits for a round. null = unlimited. ----
function defaultLimits(n = 2) {
  return Object.fromEntries(ACTIVITIES.map((a) => [a, ALL_AGES_ACTIVITIES.includes(a) ? null : n]));
}
function limitFor(round, activity) {
  const l = round && round.activity_limits;
  if (l && Object.prototype.hasOwnProperty.call(l, activity)) return l[activity] == null ? null : Number(l[activity]);
  return ALL_AGES_ACTIVITIES.includes(activity) ? null : (round && round.priority_limit) || 2;
}
// A session is unlocked (open to any athlete) when it was unlocked by hand, or once it's within
// the round's unlock period before it starts. unlock_hours NULL = never unlocks automatically.
function isUnlocked(session, round) {
  if (session.unlocked_at) return true;
  if (round.unlock_hours == null) return false;
  return Date.now() >= new Date(session.starts_at).getTime() - round.unlock_hours * 3600 * 1000;
}
function unlocksAt(session, round) {
  if (session.unlocked_at || round.unlock_hours == null) return null;
  return new Date(new Date(session.starts_at).getTime() - round.unlock_hours * 3600 * 1000);
}
function readUnlock(body) {
  if (body.unlock_never) return null;
  const n = parseInt(body.unlock_n, 10);
  if (!(n >= 0 && n <= 60 * 24)) return 168;
  return body.unlock_unit === "hours" ? n : n * 24;
}
const unlockLabel = (h) => (h == null ? "never automatically" : h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"} before` : `${h} hour${h === 1 ? "" : "s"} before`);
function readLimits(body) {
  return Object.fromEntries(ACTIVITIES.map((a, i) => {
    if (body[`unl_${i}`]) return [a, null];
    const n = parseInt(body[`lim_${i}`], 10);
    return [a, n >= 1 && n <= 50 ? n : 1];
  }));
}
function normalizeLimits(l) {
  if (!l) return defaultLimits();
  return Object.fromEntries(ACTIVITIES.map((a) => {
    const v = l[a];
    if (v == null) return [a, Object.prototype.hasOwnProperty.call(l, a) ? null : (ALL_AGES_ACTIVITIES.includes(a) ? null : 2)];
    const n = parseInt(v, 10);
    return [a, n >= 1 && n <= 50 ? n : 2];
  }));
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
       cancel_hours, default_capacity, default_coach, block_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [round.id, programName(round.name, activity, a), activity, a, round.priority_limit, round.priority_ends_at,
     round.booking_opens_at, round.cancel_hours, opts.capacity || d.capacity, opts.coach ?? d.coach,
     opts.block !== undefined ? cleanBlock(opts.block) : d.block])).rows[0];
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

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// The time ranges a session occupies: one range, or consecutive blocks when the session is split
function blocksFor(program, start, end) {
  const b = program.block_minutes;
  const s = toMin(start), e = toMin(end);
  if (!b || e - s <= b) return [[start, end]];
  const out = [];
  for (let t = s; t < e; t += b) out.push([toTime(t), toTime(Math.min(t + b, e))]);
  return out;
}

// Put a session definition on the calendar. Returns how many sessions were created
// (0 when everything was already there).
async function schedule(db, round, program, { date, start, end, capacity, coach, location, notes }) {
  const d = defaultsFor(round, program.activity);
  let made = 0;
  for (const [bs, be] of blocksFor(program, start, end)) {
    const dup = await db.query(
      `SELECT 1 FROM training_sessions s JOIN programs p ON p.id=s.program_id
       WHERE s.canceled_at IS NULL AND NOT p.archived AND p.activity=$1 AND p.age_groups=$2::text[]
         AND s.starts_at = ($3::timestamp AT TIME ZONE 'America/Chicago')`,
      [program.activity, program.age_groups, `${date} ${bs}`]);
    if (dup.rowCount) continue;
    await db.query(
      `INSERT INTO training_sessions (program_id, starts_at, ends_at, location, coach, capacity, notes)
       VALUES ($1, ($2::timestamp AT TIME ZONE 'America/Chicago'), ($3::timestamp AT TIME ZONE 'America/Chicago'), $4,$5,$6,$7)`,
      [program.id, `${date} ${bs}`, `${date} ${be}`, location ?? round.location,
       coach || program.default_coach || d.coach, capacity || program.default_capacity || d.capacity, notes || null]);
    made++;
  }
  return made;
}

// Used by imports and copies: find/create the definition, then schedule it
async function addSession(db, round, s) {
  const program = await ensureProgram(db, round, s.activity, s.ages || s.age_groups,
    { capacity: s.capacity, coach: s.coach, ...(s.block !== undefined ? { block: s.block } : {}) });
  return schedule(db, round, program, s);
}

// Copy a round's times, sessions (with spots), and schedule into a new round, shifted by offsetDays.
// Booking dates shift by the same amount so a copied season keeps its rhythm.
async function copyRound(db, src, { name, starts_on, ends_on, season_id, offsetDays, shiftRules }) {
  // $7 decides whether booking dates shift with the round or start blank
  const shift = (col) => `CASE WHEN $7::boolean THEN ${col} + ($2::int * interval '1 day') END`;
  const round = (await db.query(
    `INSERT INTO rounds (name, starts_on, ends_on, season_id, booking_opens_at, priority_ends_at, priority_limit,
       cancel_hours, location, activity_defaults, time_slots, activity_limits, unlock_hours)
     SELECT $3, $4, $5, $6, ${shift("booking_opens_at")}, ${shift("priority_ends_at")}, priority_limit,
       cancel_hours, location, activity_defaults, time_slots, activity_limits, unlock_hours FROM rounds WHERE id=$1 RETURNING *`,
    [src.id, offsetDays, name, starts_on, ends_on, season_id, !!shiftRules])).rows[0];
  for (const p of (await db.query(`SELECT * FROM programs WHERE round_id=$1`, [src.id])).rows)
    await ensureProgram(db, round, p.activity, p.age_groups, { capacity: p.default_capacity, coach: p.default_coach, block: p.block_minutes });
  const sess = (await db.query(
    `SELECT p.activity, p.age_groups, s.capacity, s.coach, s.location, s.notes,
       to_char((s.starts_at AT TIME ZONE 'America/Chicago')::date + $2::int, 'YYYY-MM-DD') AS date,
       to_char(s.starts_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS start,
       to_char(s.ends_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS "end"
     FROM training_sessions s JOIN programs p ON p.id=s.program_id
     WHERE p.round_id=$1 AND s.canceled_at IS NULL ORDER BY s.starts_at`, [src.id, offsetDays])).rows;
  let n = 0;
  for (const x of sess) if (x.date >= starts_on && x.date <= ends_on) n += await addSession(db, round, x);
  return { round, sessions: n };
}

module.exports = {
  BLOCK_CHOICES, cleanBlock, blocksFor, defaultLimits, limitFor, isUnlocked, unlocksAt, readUnlock, unlockLabel, readLimits, normalizeLimits,
  copyRound,
  sortAges, agesLabel, typeLabel, programName, isAllAges, defaultsFor, readDefaults, normalizeDefaults,
  addSlots, ensureProgram, syncPrograms, schedule, addSession,
};
