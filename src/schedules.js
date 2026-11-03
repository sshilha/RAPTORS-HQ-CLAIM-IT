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
  section: ["Section", "Sections"],
  participant: ["Athlete", "Athletes"],
  group: ["Group", "Groups"],
};

const LEVEL_KEYS = { 1: ["slot"], 2: ["activity", "slot"], 3: ["middle", "activity", "slot"], 4: ["middle", "section", "activity", "slot"] };
const claimMode = (sc) => (sc && ["public", "family", "roster"].includes(sc.claim_mode) ? sc.claim_mode : "roster");
// Limits by group/tag need known people, so they don't apply to "Anyone with the link" boards
const restricts = (sc) => !!(sc && sc.restricted && claimMode(sc) !== "public");
// Which setup steps a board needs, from its answers on Name & structure
const needsPeople = (sc) => claimMode(sc) === "roster" || restricts(sc);
const pickMode = (sc) => (sc && ["list", "calendar", "both", "dlist"].includes(sc.pick_mode) ? sc.pick_mode : sc && sc.use_calendar === false ? "list" : "calendar");
const usesCalendar = (sc) => !sc || pickMode(sc) !== "list";
const depthOf = (sc) => Math.min(4, Math.max(1, parseInt((sc && sc.depth) || 3, 10) || 3));
const levelKeys = (sc) => LEVEL_KEYS[depthOf(sc)];

const PRESET_LABELS = {
  training: { ...DEFAULT_LABELS, depth: 3, claim: "roster", restrict: true },
  volunteer: { depth: 2, claim: "family", restrict: false, activity: ["Category", "Categories"], slot: ["Item", "Items"], middle: ["Round", "Rounds"],
    participant: ["Volunteer", "Volunteers"], group: ["Team", "Teams"] },
  list: { depth: 1, calendar: false, claim: "public", restrict: false, slot: ["Item", "Items"], activity: ["Item", "Items"], middle: ["Round", "Rounds"],
    participant: ["Volunteer", "Volunteers"], group: ["Team", "Teams"] },
  event: { depth: 4, claim: "family", restrict: false, middle: ["Day", "Days"], section: ["Area", "Areas"], activity: ["Station", "Stations"], slot: ["Shift", "Shifts"],
    participant: ["Volunteer", "Volunteers"], group: ["Team", "Teams"] },
  weekly: { depth: 3, claim: "family", restrict: false, middle: ["Week", "Weeks"], activity: ["Activity", "Activities"], slot: ["Slot", "Slots"],
    participant: ["Member", "Members"], group: ["Group", "Groups"] },
};

const MODES = {
  roster: ["Roster only", "This schedule's participants in the sheet's groups. They see it under My Claims."],
  family: ["Anyone signed in", "Anyone who signs in can claim for themselves or the people linked to them. Groups don't restrict it."],
  public: ["Anyone with the link", "A public page: people enter a name and email to sign up, no account needed. Also open to anyone signed in."],
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
const entriesFor = (schedule, { activeOnly = false } = {}) => ((config.CATALOG.current || {}).activities || [])
  .filter((a) => (!schedule || a.schedule_id === schedule.id) && (!activeOnly || a.active !== false));
const activitiesFor = (schedule, opts) => [...new Set(entriesFor(schedule, opts).map((a) => a.name))];
// For the browser: this schedule's activity defaults, keyed by name
const groupsFor = (schedule) => (schedule && Array.isArray(schedule.groups) ? schedule.groups : []);
const presetsFor = (schedule) => (schedule && Array.isArray(schedule.presets) ? schedule.presets.filter((p) => p.ages && p.ages.length) : []);

async function all() { return (await query(`SELECT * FROM schedules ORDER BY sort, id`)).rows; }
async function get(id) { return (await query(`SELECT * FROM schedules WHERE id=$1`, [id])).rows[0] || null; }
async function current(req, res) {
  const list = await all();
  const want = parseInt((req.query && req.query.s) || (req.body && req.body.s) || (req.cookies && req.cookies.rt_sched), 10);
  const sc = list.find((x) => x.id === want) || list[0];
  if (res && sc && String(sc.id) !== (req.cookies && req.cookies.rt_sched)) res.cookie("rt_sched", String(sc.id), { sameSite: "lax", maxAge: 365 * 864e5 });
  return { list, sc };
}

// Boards with 1-2 levels keep their rules on one built-in round; a 1-level board's items all sit
// under one built-in activity named after the level ("Tasks")

async function refreshGroups() {
  const rows = (await query(`SELECT groups FROM schedules ORDER BY sort, id`)).rows;
  config.setAllGroups(rows.flatMap((r) => r.groups || []));
}

// First run after upgrades: existing data becomes the "Training" schedule
async function ensureDefault() {
  let first = (await query(`SELECT * FROM schedules ORDER BY sort, id LIMIT 1`)).rows[0];
  if (!first) first = (await query(`INSERT INTO schedules (name, labels) VALUES ('Training', $1) RETURNING *`, [JSON.stringify(DEFAULT_LABELS)])).rows[0];
  const OLD = await require("./db").hasOldData();   // the old (pre-rebuild) tables, until they're removed
  if (OLD) {
    await query(`UPDATE seasons SET schedule_id=$1 WHERE schedule_id IS NULL`, [first.id]);
    await query(`UPDATE rounds r SET schedule_id = COALESCE((SELECT schedule_id FROM seasons s WHERE s.id=r.season_id), $1) WHERE schedule_id IS NULL`, [first.id]);
  }

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
  // Seasons were folded into Claim Boards (the board is the season now):
  // open seasons dissolve (their rounds stay in the board); completed ones become archived boards
  // (long done on every real database; the old seasons themselves stay in the old tables until Old data removes them)
  if (!c.seasons_flattened) { const c2 = catalog.current(); c2.seasons_flattened = true; await catalog.save(c2); Object.assign(c, c2); }

  // Locations and family view used to be app-wide: every existing board gets them (one time)
  if (!c.board_settings_moved) {
    await query(`UPDATE schedules SET locations=$1 WHERE cardinality(locations)=0`, [c.locations || []]);
    await query(`UPDATE schedules SET family_names=$1`, [c.family_names || "initial"]);
    c.board_settings_moved = true;
    await catalog.save(c);
  }
  // Boards made before (or during) this upgrade get answers that match how they're set up
  await query(`UPDATE schedules SET restricted = (cardinality(groups) > 0 OR cardinality(tags) > 0) WHERE restricted IS NULL`);
  if (OLD) await query(`UPDATE schedules sc SET claim_mode = COALESCE((SELECT r.signup_mode FROM rounds r WHERE r.schedule_id=sc.id
      GROUP BY r.signup_mode ORDER BY count(*) DESC LIMIT 1), 'roster') WHERE claim_mode IS NULL`);
  await query(`UPDATE schedules SET claim_mode='roster' WHERE claim_mode IS NULL`);
  await refreshGroups();
}

module.exports = {
  claimMode, restricts, needsPeople, LEVEL_KEYS, pickMode, usesCalendar, depthOf, levelKeys, an, entriesFor, DEFAULT_LABELS, PRESET_LABELS, MODES, labels, activitiesFor, groupsFor, presetsFor,
  all, get, current, refreshGroups, ensureDefault,
};
