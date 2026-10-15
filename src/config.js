// App-wide lists (activities, age groups, shortcuts, locations) live in the database and are
// edited under Admin → Settings. These exported arrays/objects are updated IN PLACE when the
// settings change, so every module that imported them sees the current values.

const DEFAULT_CATALOG = {
  activities: [
    { name: "Hitting", color: "#93c47d", all_ages: false, default_spots: 10, default_block: null, default_limit: 2, aliases: ["H"], active: true },
    { name: "Pitching", color: "#7fa7d9", all_ages: false, default_spots: 6, default_block: null, default_limit: 2, aliases: ["P"], active: true },
    { name: "Catching", color: "#f6cf55", all_ages: false, default_spots: 6, default_block: null, default_limit: 2, aliases: ["C"], active: true },
    { name: "Defense", color: "#d0503f", all_ages: false, default_spots: 12, default_block: null, default_limit: 2, aliases: ["D", "Def"], active: true },
    { name: "Cage Time", color: "#9a85cc", all_ages: true, default_spots: 2, default_block: 30, default_limit: null, aliases: [], active: true },
  ],
  age_groups: ["8U", "10U", "12U", "14U", "16U", "18U"],
  presets: [
    { name: "8U–10U", ages: ["8U", "10U"] },
    { name: "12U–18U", ages: ["12U", "14U", "16U", "18U"] },
  ],
  locations: ["Turn Two Athletics"],
  family_names: "initial", // what families see of who's going: "full", "initial" (Ava S.), or "off"
  app_labels: { app_name: "Raptors Claim It", app_short: "Claim It", org_name: "Chippewa Valley Raptors", participant: ["Athlete", "Athletes"], group: ["Group", "Groups"],
    schedule: ["Schedule", "Schedules"] },
};

const AGE_GROUPS = [];          // every group name across all schedules (each schedule has its own list)
const ACTIVITIES = [];          // every activity name, in display order (active and hidden)
const ACTIVE_ACTIVITIES = [];   // the ones offered when adding new sessions
const ACTIVITY_COLORS = {};
const ACTIVITY_META = {};       // name -> settings (first schedule that has it; use metaFor when the schedule is known)
const META_SC = {};             // "scheduleId|name" -> settings
const ALL_AGES_ACTIVITIES = []; // activities open to every age group by default
const PRESETS = [];             // [{ name, ages }]
const LOCATIONS = [];
const CATALOG = { current: null };
const FAMILY = { names: "initial" };
const LABELS = { schedule: "Schedule", schedules: "Schedules", app_name: "Raptors Claim It", app_short: "Claim It", org_name: "Chippewa Valley Raptors", participant: "Athlete", participants: "Athletes", group: "Group", groups: "Groups" };

const refill = (arr, items) => arr.splice(0, arr.length, ...items);
const reset = (obj, entries) => { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, Object.fromEntries(entries)); };

// Called by schedules.js whenever any schedule's groups change
function setAllGroups(list) { refill(AGE_GROUPS, [...new Set(list)]); }

function apply(catalog) {
  CATALOG.current = catalog;
  if (!AGE_GROUPS.length) refill(AGE_GROUPS, catalog.age_groups || []);
  const uniq = (list) => [...new Set(list)];
  refill(ACTIVITIES, uniq(catalog.activities.map((a) => a.name)));
  refill(ACTIVE_ACTIVITIES, uniq(catalog.activities.filter((a) => a.active !== false).map((a) => a.name)));
  refill(ALL_AGES_ACTIVITIES, uniq(catalog.activities.filter((a) => a.all_ages).map((a) => a.name)));
  reset(ACTIVITY_COLORS, [...catalog.activities].reverse().map((a) => [a.name, a.color]));
  reset(ACTIVITY_META, [...catalog.activities].reverse().map((a) => [a.name, a]));
  reset(META_SC, catalog.activities.map((a) => [`${a.schedule_id}|${a.name}`, a]));
  refill(PRESETS, catalog.presets.filter((p) => p.ages.length));
  refill(LOCATIONS, catalog.locations);
  FAMILY.names = ["full", "initial", "off"].includes(catalog.family_names) ? catalog.family_names : "initial";
  const al = catalog.app_labels || DEFAULT_CATALOG.app_labels;
  Object.assign(LABELS, {
    app_name: al.app_name || "Raptors Claim It", app_short: al.app_short || al.app_name || "Claim It", org_name: al.org_name || "",
    participant: (al.participant || [])[0] || "Athlete", participants: (al.participant || [])[1] || "Athletes",
    group: (al.group || [])[0] || "Group", groups: (al.group || [])[1] || "Groups",
    schedule: (al.schedule || [])[0] || "Schedule", schedules: (al.schedule || [])[1] || "Schedules",
  });
}
apply(DEFAULT_CATALOG);

module.exports = {
  TZ: "America/Chicago",
  AGE_GROUPS, ACTIVITIES, ACTIVE_ACTIVITIES, ACTIVITY_COLORS, ACTIVITY_META, ALL_AGES_ACTIVITIES, PRESETS, LOCATIONS,
  CATALOG, DEFAULT_CATALOG, FAMILY, LABELS, apply, setAllGroups,
  // An activity's settings/color within a schedule (falls back to any schedule with that name)
  metaFor: (name, sid) => META_SC[`${sid}|${name}`] || ACTIVITY_META[name] || {},
  colorFor: (name, sid) => (META_SC[`${sid}|${name}`] || ACTIVITY_META[name] || {}).color || "#8d9db6",
  APP_URL: (() => {
    const u = (process.env.APP_URL || "").trim().replace(/\/$/, "");
    return u && !/^https?:\/\//.test(u) ? `https://${u}` : u; // tolerate a missing https://
  })(),
};
