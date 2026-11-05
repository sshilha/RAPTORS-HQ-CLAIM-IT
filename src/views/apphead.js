// The App Settings header: navy band (title, live counts, page buttons) + gray bar (tabs left, that page's filters right).
// Used on every App settings page, like the board header is on every board tab.
const { esc } = require("./layout");
const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  grid: SVG('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  people: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.4.2 4 1.9 4.5 5"/>'),
  key: SVG('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'), inbox: SVG('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>'),
  pin: SVG('<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'), shield: SVG('<path d="M12 3 4 7v5c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V7z"/>'),
  type: SVG('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
  org: SVG('<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>'),
};
const TABS = [["people", "/admin/people", IC.people, "People"], ["accounts", "/admin/settings/app?part=accounts", IC.key, "Accounts &amp; sign-in"],
  ["org", "/admin/settings/app?part=places", IC.org, "Organization"]];
const ALIAS = { olddata: "org", shadow: "accounts", communication: "people", requests: "people", admins: "accounts", signins: "accounts", activity: "accounts", online: "accounts", emaillog: "people", overview: "people", locations: "org", wording: "org", pictures: "org" };   // sub-pages light their area
// areas with more than one page get a second row of tabs
const SUBS = {
  people: [["people", "/admin/people", "People"], ["requests", "/admin/requests", "Requests"], ["communication", "/admin/people/communication", "Communication"], ["emaillog", "/admin/email-log", "Email log"]],
  accounts: [["accounts", "/admin/settings/app?part=accounts", "Account settings"], ["admins", "/admin/settings/app?part=admins", "Administrators"], ["online", "/admin/online", "On now"], ["activity", "/admin/activity", "Activity"], ["signins", "/admin/signins", "Sign-in activity"], ["shadow", "/admin/settings/app?part=shadow", "Sign in as"]],
  org: [["locations", "/admin/settings/app?part=places", "Locations"], ["wording", "/admin/settings/app?part=labels", "Wording"], ["pictures", "/admin/settings/app?part=pictures", "Pictures"], ["olddata", "/admin/settings/app?part=olddata", "Old data"]],
};

// live counts for the gray line (people, requests waiting, admins)
async function counts() {
  const { query } = require("../db");
  const r = (await query(`SELECT (SELECT count(*)::int FROM athletes WHERE archived_at IS NULL) AS people,
    (SELECT count(*)::int FROM account_requests WHERE status='waiting') AS waiting,
    (SELECT count(*)::int FROM app_admins) AS admins`)).rows[0];
  r.admins += (process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim()).filter(Boolean).length;
  return r;
}
function appHeader({ active = "people", c = {}, title = "App Settings", meta = "", actions = "", tools = "" } = {}) {
  const sub = active; active = ALIAS[active] || active;
  const subs = SUBS[active] || [];
  const line = meta || `${c.people || 0} ${c.people === 1 ? "person" : "people"} · ${c.waiting || 0} request${c.waiting === 1 ? "" : "s"} waiting · ${c.admins || 0} admin${c.admins === 1 ? "" : "s"}`;
  return `<section class="bh2">
      <div class="bh2-l"><span class="bh2-tile dash-tile">${IC.gear}</span>
        <div><div class="bh2-t"><h1>${esc(title)}</h1></div><span class="bh2-meta">${line}</span></div></div>
      ${actions ? `<div class="bh2-acts">${actions}</div>` : ""}</section>
    <nav class="bh2-tabs dash-tabs app-tabs">${TABS.map(([k, href, ic, label]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ""}>${ic}${label}${k === "people" && c.waiting ? ` <i class="app-badge" title="${c.waiting} request${c.waiting === 1 ? "" : "s"} waiting">${c.waiting}</i>` : ""}</a>`).join("")}
      ${tools ? `<span class="dash-tools app-tools">${tools}</span>` : ""}</nav>
    ${subs.length ? `<nav class="sub-tabs" aria-label="In ${TABS.find((t) => t[0] === active)[3]}">${subs.map(([k, href, label]) => `<a href="${href}"${k === sub ? ' aria-current="page"' : ""}>${label}${k === "requests" && c.waiting ? ` <i class="app-badge">${c.waiting}</i>` : ""}</a>`).join("")}</nav>` : ""}`;
}
// for routes: the header with fresh counts
async function head(opts = {}) { return appHeader({ ...opts, c: await counts() }); }
module.exports = { appHeader, head, counts };
