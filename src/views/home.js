const { esc } = require("./layout");
const { page } = require("./admin");
const { LABELS } = require("../config");
const SC = require("../schedules");
const { niceRange } = require("./rounds");

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function card(sc, archived) {
  const L = SC.labels(sc);
  const low = (x) => x.toLowerCase();
  const n = esc(LABELS.schedule.toLowerCase());
  return `<div class="sched-card${archived ? " is-archived" : ""}">
    <a class="sc-main" href="/admin/setup?s=${sc.id}">
      <div class="sc-head"><span class="sc-name">${esc(sc.name)}</span>
        ${archived ? `<span class="pill">Archived</span>` : sc.live ? `<span class="pill ok">Live</span>` : `<span class="pill">Not live</span>`}</div>
      <div class="sc-levels">${SC.levelKeys(sc).map((k) => esc(L[k].many)).join(" › ")}</div>
      <div class="sc-stats">
        ${SC.depthOf(sc) >= 3 ? `<span><b>${sc.sheets}</b> ${esc(low(sc.sheets === 1 ? L.middle.one : L.middle.many))}</span>` : `<span><b>${sc.items}</b> ${esc(low(sc.items === 1 ? L.slot.one : L.slot.many))}</span>`}
        <span><b>${sc.members}</b> ${esc(low(sc.members === 1 ? L.participant.one : L.participant.many))}</span>
        ${SC.depthOf(sc) > 1 ? `<span><b>${sc.activities}</b> ${esc(low(sc.activities === 1 ? L.activity.one : L.activity.many))}</span>` : ""}
        ${archived ? "" : `<span><b>${sc.claimed}</b> upcoming spot${sc.claimed === 1 ? "" : "s"} claimed</span>`}
      </div>
      ${archived ? `<div class="sc-next">Archived ${esc(new Date(sc.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</div>`
        : sc.next ? `<div class="sc-next">Next: ${esc(sc.next)}</div>` : ""}
    </a>
    <div class="sc-actions">
      <a class="btn-small" href="/admin/setup?s=${sc.id}">${archived ? "View" : "Open"}</a>
      <a class="btn-ghost" href="/admin/setup/schedule?s=${sc.id}">Settings</a>
      <a class="btn-ghost" href="/admin/setup/schedules/${sc.id}/copy">Copy</a>
      <form method="post" action="/admin/setup/schedules/${sc.id}/archive?s=${sc.id}"
        ${archived ? "" : `onsubmit="return confirm('Archive ${esc(sc.name)}? Families won\\'t see anything in it. Nothing is deleted, and you can reopen it any time.')"`}>
        <input type="hidden" name="return_to" value="${archived ? "/admin/settings/archived" : "/admin/settings"}">
        <button class="btn-ghost" type="submit">${archived ? "Reopen" : "Archive"}</button></form>
      ${archived && sc.empty ? `<form method="post" action="/admin/setup/schedules/${sc.id}/delete?s=${sc.id}" onsubmit="return confirm('Delete ${esc(sc.name)} for good?')">
        <button class="btn-ghost danger" type="submit">Delete</button></form>` : ""}
    </div>
  </div>`;
}

function homePage({ user, flash, active, archivedCount }) {
  return page({
    title: "Settings", tab: "home", user, flash,
    body: `<section class="panel home-head">
      <div><h1>Settings</h1>
        <p class="muted tight">Pick a ${esc(LABELS.schedule.toLowerCase())} to set up its calendar, groups, activities, and people, or start a new one.</p></div>
      <div class="head-actions">
        <a class="btn-ghost" href="/admin/settings/app">⚙ App</a>
        <a class="btn-small" href="/admin/setup/new">+ New ${esc(LABELS.schedule.toLowerCase())}</a>
      </div>
    </section>
    <h2 class="list-title">Active ${esc(LABELS.schedules.toLowerCase())}</h2>
    ${active.length ? `<div class="sched-grid">${active.map((x) => card(x, false)).join("")}</div>`
      : `<section class="panel"><div class="empty"><p>No active ${esc(LABELS.schedules.toLowerCase())}.</p><p class="muted"><a href="/admin/setup/new">Create one</a> to get started.</p></div></section>`}
    <p class="archived-link"><a href="/admin/settings/archived">View archived ${esc(LABELS.schedules.toLowerCase())}${archivedCount ? ` (${archivedCount})` : ""}</a></p>`,
  });
}

function archivedPage({ user, flash, archived }) {
  return page({
    title: `Archived ${LABELS.schedules}`, tab: "home", user, flash,
    body: `<a class="back" href="/admin/settings">Settings</a>
    <section class="panel"><h1>Archived ${esc(LABELS.schedules.toLowerCase())}</h1>
      <p class="muted tight">Families can't see these. Nothing in them was deleted. Reopen one to make it active again, or copy it to start a new one.</p></section>
    ${archived.length ? `<div class="sched-grid">${archived.map((x) => card(x, true)).join("")}</div>`
      : `<section class="panel"><p class="muted">Nothing archived.</p></section>`}`,
  });
}

// "Winter Training 2026–27" → "Winter Training 2027–28"; "2027 Arctic Rumble" → "2028 Arctic Rumble"
function nextName(name) {
  const bumped = name.replace(/(\d{4})(\s*[–-]\s*)(\d{2,4})/, (m, a, sep, b) => `${+a + 1}${sep}${b.length === 2 ? String((+b + 1) % 100).padStart(2, "0") : +b + 1}`);
  if (bumped !== name) return bumped;
  const one = name.replace(/\b(20\d{2})\b/, (m, y) => String(+y + 1));
  return one !== name ? one : `${name} (copy)`;
}

function copyPage({ user, flash, sc, counts }) {
  const L = SC.labels(sc);
  const n = LABELS.schedule.toLowerCase();
  return page({
    title: `Copy ${sc.name}`, tab: "home", user, flash,
    body: `<a class="back" href="/admin/settings">Settings</a>
    <section class="panel">
      <h1>Copy ${esc(sc.name)}</h1>
      <p class="lede">Make a new ${esc(n)} from this one. Its setup (name, levels, who can claim, views, and locations) always comes along. Pick what else to bring.</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/copy" class="stack copy-form">
        <label>Name of the new ${esc(n)}<input name="name" required maxlength="40" value="${esc(nextName(sc.name))}"></label>
        <fieldset class="checks stack-list"><legend>Bring along</legend>
          <label class="mode-opt"><input type="checkbox" name="activities" value="1" checked><span><b>${esc(L.activity.many)}</b><span class="fine">${counts.activities} with their colors, spots, limits, and other defaults</span></span></label>
          <label class="mode-opt"><input type="checkbox" name="groups" value="1" checked><span><b>${esc(L.group.many)} and shortcuts</b><span class="fine">${(sc.groups || []).length} ${esc(L.group.many.toLowerCase())}</span></span></label>
          <label class="mode-opt"><input type="checkbox" name="members" value="1"><span><b>${esc(L.participant.many)}</b><span class="fine">${counts.members} people, in the same ${esc(L.group.many.toLowerCase())} (if those come along)</span></span></label>
          <label class="mode-opt"><input type="checkbox" name="calendar" value="1" id="cal"><span><b>Calendar</b><span class="fine">${counts.rounds} ${esc((counts.rounds === 1 ? L.middle.one : L.middle.many).toLowerCase())} with their times and ${esc(L.activity.many.toLowerCase())}. Copies start as drafts, and no claims come along.</span></span></label>
        </fieldset>
        <label id="start-wrap">New first day (for the calendar)<input type="date" name="start_on" value="${esc(counts.first || "")}">
          <span class="fine">Everything shifts by the same number of days. Pick the same weekday as ${esc(counts.firstLabel || "the original")} to keep times on the same days.</span></label>
        <button class="btn" type="submit">Make the copy</button>
      </form>
    </section>
    <script>
      (function () { var c = document.getElementById("cal"), w = document.getElementById("start-wrap");
        function f() { w.style.display = c.checked ? "" : "none"; } c.addEventListener("change", f); f(); })();
    </script>`,
  });
}

module.exports = { homePage, archivedPage, copyPage };
