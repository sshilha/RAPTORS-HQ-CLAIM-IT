const { esc } = require("./layout");
const { page } = require("./admin");
const { LABELS } = require("../config");
const SC = require("../schedules");
const { niceRange } = require("./rounds");

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function card(sc) {
  const L = SC.labels(sc);
  const low = (x) => x.toLowerCase();
  return `<a class="sched-card" href="/admin/setup?s=${sc.id}">
    <div class="sc-head"><span class="sc-name">${esc(sc.name)}</span>
      ${sc.live ? `<span class="pill ok">Live</span>` : `<span class="pill">Not live</span>`}</div>
    <div class="sc-levels">${esc(L.top.one)} › ${esc(L.middle.one)} › ${esc(L.activity.one)} › ${esc(L.slot.one)}</div>
    <div class="sc-stats">
      <span><b>${sc.open_top}</b> open ${esc(low(sc.open_top === 1 ? L.top.one : L.top.many))}</span>
      <span><b>${sc.sheets}</b> ${esc(low(sc.sheets === 1 ? L.middle.one : L.middle.many))}</span>
      <span><b>${sc.members}</b> ${esc(low(sc.members === 1 ? L.participant.one : L.participant.many))}</span>
      <span><b>${sc.activities}</b> ${esc(low(sc.activities === 1 ? L.activity.one : L.activity.many))}</span>
      <span><b>${sc.claimed}</b> upcoming spot${sc.claimed === 1 ? "" : "s"} claimed</span>
    </div>
    ${sc.next ? `<div class="sc-next">Next: ${esc(sc.next)}</div>` : ""}
    <span class="sc-open">Open ›</span>
  </a>`;
}

function homePage({ user, flash, active, archived }) {
  return page({
    title: "Settings", tab: "home", user, flash,
    body: `<section class="panel home-head">
      <div><h1>Settings</h1>
        <p class="muted tight">Pick a ${esc(LABELS.schedule.toLowerCase())} to set up its ${esc("calendar, groups, activities, and people")}, or start a new one.</p></div>
      <div class="head-actions">
        <a class="btn-ghost" href="/admin/settings/app">⚙ App</a>
        <a class="btn-small" href="/admin/setup/new">+ New ${esc(LABELS.schedule.toLowerCase())}</a>
      </div>
    </section>
    <h2 class="list-title">Active ${esc(LABELS.schedules.toLowerCase())}</h2>
    ${active.length ? `<div class="sched-grid">${active.map(card).join("")}</div>`
      : `<section class="panel"><div class="empty"><p>No active ${esc(LABELS.schedules.toLowerCase())}.</p><p class="muted"><a href="/admin/setup/new">Create one</a> to get started.</p></div></section>`}
    ${archived.length ? `<section class="panel archived">
      <details><summary>Archived (${archived.length})</summary>
        <ul class="res-list">${archived.map((sc) => `<li class="res">
          <div class="res-main"><div class="res-when">${esc(sc.name)}</div><div class="res-what">Archived ${esc(new Date(sc.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</div></div>
          <div class="res-side member-row"><a class="btn-ghost" href="/admin/setup?s=${sc.id}">View</a>
            <form method="post" action="/admin/setup/schedules/${sc.id}/archive?s=${sc.id}"><input type="hidden" name="return_to" value="/admin/settings"><button class="btn-ghost" type="submit">Restore</button></form></div>
        </li>`).join("")}</ul></details></section>` : ""}`,
  });
}

module.exports = { homePage };
