// Levels: Round -> Times -> Sessions (activity + group + spots) -> scheduled on days.
// In the database a round's "session" definitions are programs (one per activity + age group);
// each scheduled occurrence is a training_sessions row.
const { AGE_GROUPS, ALL_AGES_ACTIVITIES, metaFor } = require("./config");

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
// ---- Per-activity limits for a round. null = unlimited. ----
// A new round starts with each of its schedule's activities at that activity's default limit
function limitFor(round, activity) {
  const l = round && round.activity_limits;
  if (l && Object.prototype.hasOwnProperty.call(l, activity)) return l[activity] == null ? null : Number(l[activity]);
  // Not set on this round (e.g. an activity added later): use the activity's default from Settings
  const m = metaFor(activity, round && round.schedule_id);
  return m.name ? (m.default_limit == null ? null : m.default_limit) : (round && round.priority_limit) || 2;
}
// Does a full session take a waitlist? Session setting wins; otherwise the round's (default off)
function isUnlocked(session, round) {
  if (session.unlocked_at) return true;
  if (round.unlock_hours == null || !session.starts_at) return false; // undated items only unlock by hand
  return Date.now() >= new Date(session.starts_at).getTime() - round.unlock_hours * 3600 * 1000;
}
function unlocksAt(session, round) {
  if (session.unlocked_at || round.unlock_hours == null || !session.starts_at) return null;
  return new Date(new Date(session.starts_at).getTime() - round.unlock_hours * 3600 * 1000);
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

// The time ranges a session occupies: one range, or consecutive blocks when the session is split
// Put a session definition on the calendar. Returns how many sessions were created
// (0 when everything was already there).
// Used by imports and copies: find/create the definition, then schedule it
module.exports = {
  BLOCK_CHOICES, cleanBlock, limitFor, isUnlocked, unlocksAt, sortAges, agesLabel, typeLabel, tagsLabel, programName, isAllAges, defaultsFor, syncPrograms, };
