// Schedules are separate sign-up instances (e.g. Training, Concessions). Each one has its own
// level names, participant/group words, activities, groups, group shortcuts, and members.
const { query } = require("./db");
const config = require("./config");
const { ACTIVITIES, ACTIVE_ACTIVITIES, ACTIVITY_META } = config;

const DEFAULT_LABELS = {
  top: ["Season", "Seasons"],
  middle: ["Round", "Rounds"],
  activity: ["Activity", "Activities"],
  slot: ["Session", "Sessions"],
  participant: ["Athlete", "Athletes"],
  group: ["Group", "Groups"],
};

const LEVELS = [
  ["top", "Top level", "Groups everything for a period. Complete it to archive it read-only.", "Season / Term / Year"],
  ["middle", "Sheet level", "One sign-up sheet: its own dates, booking rules, limits, and who can sign up.", "Round / Event / Week"],
  ["activity", "Type", "What people sign up for, with default spots and limits.", "Activity / Role / Item"],
  ["slot", "Slot", "One bookable time with spots, whole or split into blocks.", "Session / Shift / Slot"],
  ["participant", "Participant", "The people who use this schedule. They can be kids, parents, or anyone.", "Athlete / Volunteer / Member"],
  ["group", "Group", "How participants are sorted, so sheets can be limited to certain groups.", "12U / Team / Level"],
];

const PRESET_LABELS = {
  training: { ...DEFAULT_LABELS },
  volunteer: { top: ["Term", "Terms"], middle: ["Event", "Events"], activity: ["Role", "Roles"], slot: ["Shift", "Shifts"],
    participant: ["Volunteer", "Volunteers"], group: ["Team", "Teams"] },
  weekly: { top: ["Year", "Years"], middle: ["Week", "Weeks"], activity: ["Activity", "Activities"], slot: ["Slot", "Slots"],
    participant: ["Member", "Members"], group: ["Group", "Groups"] },
};

const MODES = {
  roster: ["Roster only", "This schedule's participants in the sheet's groups. Families see it under their participants."],
  family: ["Signed-in families", "Any signed-in family can sign up themselves or any of their participants. Groups don't restrict it."],
  public: ["Anyone with the link", "A public page: people enter a name and email to sign up, no account needed. Also open to signed-in families."],
};

// "a round" / "an event"
const an = (word) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word.toLowerCase()}`;

function labels(schedule) {
  const l = (schedule && schedule.labels) || {};
  const out = {};
  for (const k of Object.keys(DEFAULT_LABELS)) {
    const v = Array.isArray(l[k]) && l[k][0] ? l[k] : DEFAULT_LABELS[k];
    out[k] = { one: v[0], many: v[1] || `${v[0]}s` };
  }
  return out;
}

// This schedule's activities (by ownership), in Settings order
const activitiesFor = (schedule, { activeOnly = false } = {}) => {
  const base = activeOnly ? ACTIVE_ACTIVITIES : ACTIVITIES;
  if (!schedule) return base.slice();
  return base.filter((a) => (ACTIVITY_META[a] || {}).schedule_id === schedule.id);
};
const groupsFor = (schedule) => (schedule && Array.isArray(schedule.groups) ? schedule.groups : []);
const presetsFor = (schedule) => (schedule && Array.isArray(schedule.presets) ? schedule.presets.filter((p) => p.ages && p.ages.length) : []);

async function all() { return (await query(`SELECT * FROM schedules ORDER BY sort, id`)).rows; }
async function get(id) { return (await query(`SELECT * FROM schedules WHERE id=$1`, [id])).rows[0] || null; }
async function forRound(roundId) {
  return (await query(`SELECT sc.* FROM schedules sc JOIN rounds r ON r.schedule_id=sc.id WHERE r.id=$1`, [roundId])).rows[0] || null;
}
async function forSeason(seasonId) {
  return (await query(`SELECT sc.* FROM schedules sc JOIN seasons s ON s.schedule_id=sc.id WHERE s.id=$1`, [seasonId])).rows[0] || null;
}
async function forProgram(programId) {
  return (await query(`SELECT sc.* FROM schedules sc JOIN rounds r ON r.schedule_id=sc.id JOIN programs p ON p.round_id=r.id WHERE p.id=$1`, [programId])).rows[0] || null;
}

// The schedule an admin is working in: ?s=, else their last one (cookie), else the first
async function current(req, res) {
  const list = await all();
  const want = parseInt((req.query && req.query.s) || (req.body && req.body.s) || (req.cookies && req.cookies.rt_sched), 10);
  const sc = list.find((x) => x.id === want) || list[0];
  if (res && sc && String(sc.id) !== (req.cookies && req.cookies.rt_sched)) res.cookie("rt_sched", String(sc.id), { sameSite: "lax", maxAge: 365 * 864e5 });
  return { list, sc };
}

async function refreshGroups() {
  const rows = (await query(`SELECT groups FROM schedules ORDER BY sort, id`)).rows;
  config.setAllGroups(rows.flatMap((r) => r.groups || []));
}

// First run after upgrades: existing data becomes the "Training" schedule
async function ensureDefault() {
  let first = (await query(`SELECT * FROM schedules ORDER BY sort, id LIMIT 1`)).rows[0];
  if (!first) first = (await query(`INSERT INTO schedules (name, labels) VALUES ('Training', $1) RETURNING *`, [JSON.stringify(DEFAULT_LABELS)])).rows[0];
  await query(`UPDATE seasons SET schedule_id=$1 WHERE schedule_id IS NULL`, [first.id]);
  await query(`UPDATE rounds r SET schedule_id = COALESCE((SELECT schedule_id FROM seasons s WHERE s.id=r.season_id), $1) WHERE schedule_id IS NULL`, [first.id]);

  const catalog = require("./catalog");
  const c = catalog.current();
  // Groups and shortcuts used to be app-wide: they belong to the first schedule now
  if ((!first.groups || !first.groups.length) && (c.age_groups || []).length) {
    await query(`UPDATE schedules SET groups=$2, presets=$3 WHERE id=$1`, [first.id, c.age_groups, JSON.stringify(c.presets || [])]);
    c.age_groups = []; c.presets = [];
  }
  // Participant/group words used to be app-wide: copy them into schedules that don't have their own
  const al = c.app_labels || {};
  for (const sc of await all()) {
    const l = sc.labels || {};
    if (!l.participant || !l.group) {
      l.participant = l.participant || al.participant || DEFAULT_LABELS.participant;
      l.group = l.group || al.group || DEFAULT_LABELS.group;
      await query(`UPDATE schedules SET labels=$2 WHERE id=$1`, [sc.id, JSON.stringify(l)]);
    }
  }
  // Activities without an owner go to the schedule that offered them, else the first schedule
  let changed = false;
  const schedules = await all();
  for (const a of c.activities) {
    if (a.schedule_id && schedules.some((x) => x.id === a.schedule_id)) continue;
    const owner = schedules.find((x) => x.id !== first.id && Array.isArray(x.activities) && x.activities.includes(a.name));
    a.schedule_id = owner ? owner.id : first.id; changed = true;
  }
  if (changed || !(c.age_groups || []).length) await catalog.save(c);
  // People with a group become members of the first schedule
  // (one time: the old app-wide group is cleared once it's been moved into a membership)
  await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name)
    SELECT $1, a.id, a.age_group FROM athletes a WHERE a.self_user_id IS NULL AND a.age_group IS NOT NULL
    ON CONFLICT DO NOTHING`, [first.id]);
  await query(`UPDATE athletes SET age_group = NULL WHERE age_group IS NOT NULL`);
  await refreshGroups();
}

module.exports = {
  an, DEFAULT_LABELS, PRESET_LABELS, LEVELS, MODES, labels, activitiesFor, groupsFor, presetsFor,
  all, get, forRound, forSeason, forProgram, current, refreshGroups, ensureDefault,
};
