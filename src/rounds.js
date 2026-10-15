// Levels: Round -> Times -> Sessions (activity + group + spots) -> scheduled on days.
// In the database a round's "session" definitions are programs (one per activity + age group);
// each scheduled occurrence is a training_sessions row.
const { AGE_GROUPS, ACTIVITIES, ALL_AGES_ACTIVITIES, ACTIVITY_META, metaFor } = require("./config");

const sortAges = (ages) => AGE_GROUPS.filter((g) => ages.includes(g));
// Groups are per schedule; labels show the range of the groups chosen ("12U–18U")
const agesLabel = (ages) => {
  const a = sortAges(ages || []);
  if (!a.length) return "Everyone";
  return a.length === 1 ? a[0] : `${a[0]}–${a[a.length - 1]}`;
};
// "All groups" activities (like Cage Time), and sessions with no group limit, show just the activity name
const isAllAges = (activity, ages) => ALL_AGES_ACTIVITIES.includes(activity) || !(ages || []).length;
// "Hitting 12U–18U", "Catching 12U–18U · Catcher only", "Cage Time"
const tagsLabel = (tags) => (tags && tags.length ? ` · ${tags.join(" or ")} only` : "");
const typeLabel = (activity, ages, tags) => (isAllAges(activity, ages) ? activity : `${activity} ${agesLabel(ages)}`) + tagsLabel(tags);
const programName = (roundName, activity, ages, tags, section, itemList) =>
  itemList ? roundName : `${roundName} ${section ? `${section} › ` : ""}${typeLabel(activity, ages, tags)}`;

const BLOCK_CHOICES = [15, 20, 30, 45, 60];
const cleanBlock = (v) => (BLOCK_CHOICES.includes(parseInt(v, 10)) ? parseInt(v, 10) : null);
// An activity's own defaults from Settings (spots, blocks, coach)
const metaDefaults = (a, sid) => { const m = metaFor(a, sid); return { capacity: m.default_spots, block: m.default_block }; };

// Fallback capacity/coach/blocks by activity (used by imports and older data)
function defaultsFor(round, activity) {
  const d = ((round && round.activity_defaults) || {})[activity] || metaDefaults(activity, round && round.schedule_id);
  return { capacity: d.capacity || 8, coach: d.coach || null, block: cleanBlock(d.block) };
}

// Defaults tables post rows as dname_k (activity name) + cap_k / coach_k / block_k
function readDefaults(body) {
  const out = {};
  for (let k = 0; body[`dname_${k}`] !== undefined; k++) {
    const a = String(body[`dname_${k}`]);
    const cap = parseInt(body[`cap_${k}`], 10);
    out[a] = { capacity: cap > 0 && cap <= 200 ? cap : 8, coach: String(body[`coach_${k}`] || "").trim() || null, block: cleanBlock(body[`block_${k}`]) };
  }
  return out;
}

function normalizeDefaults(d = {}) {
  const out = {};
  for (const [a, x0] of Object.entries(d || {})) {
    const x = x0 || {};
    const cap = parseInt(x.capacity, 10);
    out[a] = { capacity: cap > 0 && cap <= 200 ? cap : 8, coach: x.coach ? String(x.coach).slice(0, 80) : null, block: cleanBlock(x.block) };
  }
  return out;
}

// ---- Per-activity limits for a round. null = unlimited. ----
// A new round starts with each of its schedule's activities at that activity's default limit
function defaultLimits(schedule) {
  const list = require("./schedules").entriesFor(schedule);
  return Object.fromEntries(list.map((m) => [m.name, m.default_limit === undefined ? 2 : m.default_limit]));
}
function limitFor(round, activity) {
  const l = round && round.activity_limits;
  if (l && Object.prototype.hasOwnProperty.call(l, activity)) return l[activity] == null ? null : Number(l[activity]);
  // Not set on this round (e.g. an activity added later): use the activity's default from Settings
  const m = metaFor(activity, round && round.schedule_id);
  return m.name ? (m.default_limit == null ? null : m.default_limit) : (round && round.priority_limit) || 2;
}
// Does a full session take a waitlist? Session setting wins; otherwise the round's (default off)
const waitlistOn = (program, round) =>
  program.waitlist != null ? !!program.waitlist : !!(round && round.waitlist);
const readWaitlist = (v) => (v === "on" ? true : v === "off" ? false : null);

// A session is unlocked (open to any athlete) when it was unlocked by hand, or once it's within
// the round's unlock period before it starts. unlock_hours NULL = never unlocks automatically.
function isUnlocked(session, round) {
  if (session.unlocked_at) return true;
  if (round.unlock_hours == null || !session.starts_at) return false; // undated items only unlock by hand
  return Date.now() >= new Date(session.starts_at).getTime() - round.unlock_hours * 3600 * 1000;
}
function unlocksAt(session, round) {
  if (session.unlocked_at || round.unlock_hours == null || !session.starts_at) return null;
  return new Date(new Date(session.starts_at).getTime() - round.unlock_hours * 3600 * 1000);
}
function readUnlock(body) {
  if (body.unlock_never) return null;
  const n = parseInt(body.unlock_n, 10);
  if (!(n >= 0 && n <= 60 * 24)) return 168;
  return body.unlock_unit === "hours" ? n : n * 24;
}
const unlockLabel = (h) => (h == null ? "never automatically" : h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"} before` : `${h} hour${h === 1 ? "" : "s"} before`);
// Limits forms post rows as lname_k (activity name) + lim_k / unl_k; activities not shown keep their value
function readLimits(body, existing) {
  const out = { ...(existing || {}) };
  for (let k = 0; body[`lname_${k}`] !== undefined; k++) {
    const a = String(body[`lname_${k}`]);
    if (body[`unl_${k}`]) { out[a] = null; continue; }
    const n = parseInt(body[`lim_${k}`], 10);
    out[a] = n >= 1 && n <= 50 ? n : 1;
  }
  return out;
}

function normalizeLimits(l) {
  const out = {};
  for (const [a, v] of Object.entries(l || {})) {
    if (v == null) { out[a] = null; continue; }
    const n = parseInt(v, 10);
    out[a] = n >= 1 && n <= 50 ? n : 2;
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
// One program per round + activity + groups + required tags (so "Catching · Catcher only" and an
// open Catching can sit side by side)
async function ensureProgram(db, round, activity, ages, opts = {}) {
  const a = sortAges(ages);
  const tags = [...new Set(opts.tags || [])].sort();
  const section = opts.section ? String(opts.section).trim().slice(0, 40) : null;
  const found = (await db.query(
    `SELECT * FROM programs WHERE round_id=$1 AND activity=$2 AND age_groups=$3::text[]
       AND (SELECT coalesce(array_agg(t ORDER BY t), '{}') FROM unnest(required_tags) t) = $4::text[]
       AND section IS NOT DISTINCT FROM $5`, [round.id, activity, a, tags, section])).rows[0];
  if (found) return found;
  const d = defaultsFor(round, activity);
  return (await db.query(
    `INSERT INTO programs (round_id, name, activity, age_groups, priority_limit, priority_ends_at, booking_opens_at,
       cancel_hours, default_capacity, default_coach, block_minutes, waitlist, required_tags, section)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [round.id, programName(round.name, activity, a, tags, section, !!metaFor(activity, round.schedule_id).item_list), activity, a, round.priority_limit, round.priority_ends_at,
     round.booking_opens_at, round.cancel_hours, opts.capacity || d.capacity, opts.coach ?? d.coach,
     opts.block !== undefined ? cleanBlock(opts.block) : d.block, opts.waitlist ?? null, tags, section])).rows[0];
}

async function syncPrograms(db, round) {
  const progs = (await db.query(`SELECT id, activity, age_groups, required_tags, section FROM programs WHERE round_id=$1`, [round.id])).rows;
  for (const p of progs) {
    await db.query(
      `UPDATE programs SET name=$2, priority_limit=$3, priority_ends_at=$4, booking_opens_at=$5, cancel_hours=$6 WHERE id=$1`,
      [p.id, programName(round.name, p.activity, p.age_groups, p.required_tags, p.section, !!metaFor(p.activity, round.schedule_id).item_list), round.priority_limit,
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
    // "Already on the calendar" means the same activity, groups, and start time in this board
    const dup = await db.query(
      `SELECT 1 FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id
       WHERE s.canceled_at IS NULL AND NOT p.archived AND p.activity=$1 AND p.age_groups=$2::text[]
         AND s.starts_at = ($3::timestamp AT TIME ZONE 'America/Chicago') AND r.schedule_id IS NOT DISTINCT FROM $4`,
      [program.activity, program.age_groups, `${date} ${bs}`, round.schedule_id]);
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
    { capacity: s.capacity, coach: s.coach, tags: s.tags || [], section: s.section, ...(s.block !== undefined ? { block: s.block } : {}) });
  return schedule(db, round, program, s);
}

// Copy a round's times, sessions (with spots), and schedule into a new round, shifted by offsetDays.
// Booking dates shift by the same amount so a copied season keeps its rhythm.
// An item with no date (e.g. "Bring a case of water", 6 spots), or a dated item with a title
async function addItem(db, program, { title, capacity, coach, location, notes, date, start, end }) {
  const dated = date && start && end;
  return (await db.query(
    `INSERT INTO training_sessions (program_id, title, capacity, coach, location, notes, starts_at, ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,
       CASE WHEN $7::text IS NULL THEN NULL ELSE ($7::text::timestamp AT TIME ZONE 'America/Chicago') END,
       CASE WHEN $8::text IS NULL THEN NULL ELSE ($8::text::timestamp AT TIME ZONE 'America/Chicago') END) RETURNING *`,
    [program.id, title || null, capacity || program.default_capacity || 1, coach || null, location || null, notes || null,
     dated ? `${date} ${start}` : null, dated ? `${date} ${end}` : null])).rows[0];
}

async function copyRound(db, src, { name, starts_on, ends_on, season_id, offsetDays, shiftRules, schedule_id }) {
  // $7 decides whether booking dates shift with the round or start blank
  const shift = (col) => `CASE WHEN $7::boolean THEN ${col} + ($2::int * interval '1 day') END`;
  const round = (await db.query(
    `INSERT INTO rounds (name, starts_on, ends_on, season_id, booking_opens_at, priority_ends_at, priority_limit,
       cancel_hours, location, activity_defaults, time_slots, activity_limits, unlock_hours, waitlist, schedule_id, signup_mode, is_main)
     SELECT $3, $4, $5, $6, ${shift("booking_opens_at")}, ${shift("priority_ends_at")}, priority_limit,
       cancel_hours, location, activity_defaults, time_slots, activity_limits, unlock_hours, waitlist,
       COALESCE((SELECT schedule_id FROM seasons WHERE id=$6), $8, schedule_id), signup_mode, is_main FROM rounds WHERE id=$1 RETURNING *`,
    [src.id, offsetDays, name, starts_on, ends_on, season_id, !!shiftRules, schedule_id || null])).rows[0];
  for (const p of (await db.query(`SELECT * FROM programs WHERE round_id=$1`, [src.id])).rows)
    await ensureProgram(db, round, p.activity, p.age_groups, { capacity: p.default_capacity, coach: p.default_coach, block: p.block_minutes, waitlist: p.waitlist, tags: p.required_tags, section: p.section });
  const sess = (await db.query(
    `SELECT p.activity, p.age_groups, p.required_tags AS tags, p.section, s.capacity, s.coach, s.location, s.notes, s.title,
       to_char((s.starts_at AT TIME ZONE 'America/Chicago')::date + $2::int, 'YYYY-MM-DD') AS date,
       to_char(s.starts_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS start,
       to_char(s.ends_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS "end"
     FROM training_sessions s JOIN programs p ON p.id=s.program_id
     WHERE p.round_id=$1 AND s.canceled_at IS NULL ORDER BY s.starts_at NULLS LAST, s.id`, [src.id, offsetDays])).rows;
  let n = 0;
  for (const x of sess) {
    if (!x.date) { // undated item: copy as-is
      const program = await ensureProgram(db, round, x.activity, x.age_groups, { tags: x.tags || [], section: x.section });
      await addItem(db, program, { title: x.title, capacity: x.capacity, coach: x.coach, location: x.location, notes: x.notes });
      n++; continue;
    }
    if (x.date >= starts_on && x.date <= ends_on) n += await addSession(db, round, x);
  }
  return { round, sessions: n };
}

module.exports = {
  waitlistOn, readWaitlist, BLOCK_CHOICES, cleanBlock, blocksFor, defaultLimits, limitFor, isUnlocked, unlocksAt, readUnlock, unlockLabel, readLimits, normalizeLimits,
  copyRound,
  addItem, sortAges, agesLabel, typeLabel, tagsLabel, programName, isAllAges, defaultsFor, readDefaults, normalizeDefaults,
  addSlots, ensureProgram, syncPrograms, schedule, addSession,
};
