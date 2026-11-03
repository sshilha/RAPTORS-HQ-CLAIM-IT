const { esc, layout } = require("./layout");
const { AGE_GROUPS, ACTIVITIES } = require("../config");
const { fmtRange, fmtDateTime, inputParts } = require("../time");
const { limitFor, isUnlocked, unlocksAt } = require("../rounds");

// Two areas per board:
//  - the board itself (Open): rounds/items/calendar, with just a breadcrumb
//  - its Settings (from the card): numbered steps in the order you'd set things up
const BOARD_AREA = ["setup", "seasons", "rounds", "programs", "import"];
const STEPS = [
  ["structure", (sc) => `/admin/setup/schedule?s=${sc.id}`, () => "Setup", () => "", ["schedule", "schedule-more"]],
  ["activities", (sc) => `/admin/settings/activities?s=${sc.id}`, (L) => L.activity.many, (sc, SC) => String(SC.activitiesFor(sc).length), ["activities"]],
  ["groups", (sc) => `/admin/settings/groups?s=${sc.id}`, (L) => `${L.group.many} & tags`, (sc) => `${(sc.groups || []).length}${(sc.tags || []).length ? ` + ${(sc.tags || []).length} tag${(sc.tags || []).length === 1 ? "" : "s"}` : ""}`, ["groups"]],
  ["members", (sc) => `/admin/members?s=${sc.id}`, (L) => L.participant.many, (sc) => String(sc.member_count || 0), ["members", "athletes"]],
];
// Every board screen: a trail back to the board (the board is home base)
function settingsNav(tab, user) {
  const sched = user && user.sched;
  const { LABELS } = require("../config");
  if (tab === "home" || tab === "settings" || tab === "people" || !sched || !sched.sc) return "";
  const sc = sched.sc;
  const SC = require("../schedules");
  const L = SC.labels(sc);
  const here = { schedule: "Settings", "schedule-more": "Settings", "schedule-archive": "Archive or delete", rules: "Rules",
    members: `${L.group.many}, tags & ${L.participant.many.toLowerCase()}`, athletes: `${L.group.many}, tags & ${L.participant.many.toLowerCase()}`,
    groups: `${L.group.many}, tags & ${L.participant.many.toLowerCase()}`, activities: L.activity.many, import: "Import schedule",
    rounds: L.middle.one, programs: L.middle.one, seasons: L.middle.one }[tab];
  // buttons back, instead of a breadcrumb: All Boards, and (off the Setup screen) the board's Setup
  const back = (href, label) => `<a class="back-btn" href="${href}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>${esc(label)}</a>`;
  return `<nav class="back-row no-print" aria-label="Go back">${back("/admin/settings", "All Boards")}${["setup", "members", "schedule", "schedule-more", "schedule-archive"].includes(tab) ? "" : back(`/admin/setup?s=${sc.id}`, `${sc.name}`)}${sc.archived_at ? ` <span class="pill">Archived</span>` : ""}</nav>`;
}
const SAME_WIDTH = ["members", "athletes", "groups", "activities", "schedule", "setup", "rules"];
// pages with folder-style sub-tabs: everything after the tabs sits on the white sheet the tabs open onto
const sheet = (body) => { const i = body.indexOf('<nav class="sub-tabs"'); if (i < 0) return body; const j = body.indexOf("</nav>", i) + 6;
  return `${body.slice(0, j)}<div class="sub-body">${body.slice(j)}</div>`; };
const page = (opts) => layout({ ...opts, admin: true, wide: true, xwide: opts.xwide || SAME_WIDTH.includes(opts.tab), body: (opts.noBack ? "" : settingsNav(opts.tab, opts.user)) + sheet(opts.body) });

module.exports = { page };
