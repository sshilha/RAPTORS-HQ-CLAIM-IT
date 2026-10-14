// Schedules are separate sign-up instances that share people, activities, and groups.
// Each one names its own levels, e.g. Season > Round > Session, or Term > Event > Shift.
const crypto = require("crypto");
const { query } = require("./db");
const { ACTIVITIES, ACTIVE_ACTIVITIES } = require("./config");

const DEFAULT_LABELS = {
  top: ["Season", "Seasons"],
  middle: ["Round", "Rounds"],
  activity: ["Activity", "Activities"],
  slot: ["Session", "Sessions"],
};

const LEVELS = [
  ["top", "Top level", "Groups everything for a period. Complete it to archive it read-only.", "Season / Term / Year"],
  ["middle", "Sheet level", "One sign-up sheet: its own dates, booking rules, limits, and who can sign up.", "Round / Event / Week"],
  ["activity", "Type", "What people sign up for, with default spots and limits.", "Activity / Role / Item"],
  ["slot", "Slot", "One bookable time with spots, whole or split into blocks.", "Session / Shift / Slot"],
];

const MODES = {
  roster: ["Roster only", "Linked participants in the sheet's groups. Families see it under their participants."],
  family: ["Signed-in families", "Any signed-in family can sign up themselves or any of their participants. Groups don't restrict it."],
  public: ["Anyone with the link", "A public page: people enter a name and email to sign up, no account needed. Also open to signed-in families."],
};

function labels(schedule) {
  const l = (schedule && schedule.labels) || {};
  const out = {};
  for (const k of Object.keys(DEFAULT_LABELS)) {
    const v = Array.isArray(l[k]) && l[k][0] ? l[k] : DEFAULT_LABELS[k];
    out[k] = { one: v[0], many: v[1] || `${v[0]}s` };
  }
  return out;
}

// Activities this schedule offers (all of them when not narrowed)
const activitiesFor = (schedule, { activeOnly = false } = {}) => {
  const base = activeOnly ? ACTIVE_ACTIVITIES : ACTIVITIES;
  return schedule && Array.isArray(schedule.activities) && schedule.activities.length
    ? base.filter((a) => schedule.activities.includes(a)) : base.slice();
};

async function all() {
  return (await query(`SELECT * FROM schedules ORDER BY sort, id`)).rows;
}
async function get(id) {
  return (await query(`SELECT * FROM schedules WHERE id=$1`, [id])).rows[0] || null;
}
async function forRound(roundId) {
  return (await query(`SELECT sc.* FROM schedules sc JOIN rounds r ON r.schedule_id=sc.id WHERE r.id=$1`, [roundId])).rows[0] || null;
}
async function forSeason(seasonId) {
  return (await query(`SELECT sc.* FROM schedules sc JOIN seasons s ON s.schedule_id=sc.id WHERE s.id=$1`, [seasonId])).rows[0] || null;
}

// First run after upgrade: existing data becomes the "Training" schedule
async function ensureDefault() {
  let first = (await query(`SELECT * FROM schedules ORDER BY sort, id LIMIT 1`)).rows[0];
  if (!first) first = (await query(`INSERT INTO schedules (name, labels) VALUES ('Training', $1) RETURNING *`, [JSON.stringify(DEFAULT_LABELS)])).rows[0];
  await query(`UPDATE seasons SET schedule_id=$1 WHERE schedule_id IS NULL`, [first.id]);
  await query(`UPDATE rounds r SET schedule_id = COALESCE((SELECT schedule_id FROM seasons s WHERE s.id=r.season_id), $1) WHERE schedule_id IS NULL`, [first.id]);
}

const newToken = () => crypto.randomBytes(12).toString("base64url");

module.exports = { DEFAULT_LABELS, LEVELS, MODES, labels, activitiesFor, all, get, forRound, forSeason, ensureDefault, newToken };
