const { esc } = require("./layout");
const { page } = require("./admin");
const { blockSelect } = require("./partials");

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const moveBtns = (action, name, i, n) => `<div class="move">
  <form method="post" action="${action}"><input type="hidden" name="name" value="${esc(name)}"><input type="hidden" name="dir" value="up">
    <button class="x" type="submit" aria-label="Move up"${i === 0 ? " disabled" : ""}>▲</button></form>
  <form method="post" action="${action}"><input type="hidden" name="name" value="${esc(name)}"><input type="hidden" name="dir" value="down">
    <button class="x" type="submit" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>▼</button></form></div>`;

function activityFields(a = {}, id) {
  const f = id ? ` form="${id}"` : "";
  return `
    <td><input${f} name="name" value="${esc(a.name)}" required maxlength="40" aria-label="Name" class="w-name" placeholder="e.g. Speed & Agility"></td>
    <td><input${f} type="color" name="color" value="${esc(a.color || "#8d9db6")}" aria-label="Color" class="w-color"></td>
    <td><input${f} type="number" name="default_spots" min="1" max="200" value="${a.default_spots || 10}" aria-label="Default spots" class="w-num"></td>
    <td>${blockSelect("default_block", a.default_block, `${f} aria-label="Split into blocks"`)}</td>
    <td class="nowrap"><input${f} type="number" name="default_limit" min="1" max="50" value="${a.default_limit ?? 2}" aria-label="Default limit" class="w-num lim-n"${a.default_limit === null && a.name ? " disabled" : ""}>
      <label class="check"><input${f} type="checkbox" name="unlimited" value="1" class="lim-unl"${a.default_limit === null && a.name ? " checked" : ""}> Unlimited</label></td>
    <td><label class="check"><input${f} type="checkbox" name="all_ages" value="1"${a.all_ages ? " checked" : ""}> All groups</label></td>
    <td><input${f} name="aliases" value="${esc((a.aliases || []).join(", "))}" aria-label="Import codes" class="w-alias" placeholder="e.g. D"></td>`;
}

const SC = require("../schedules");
const intro = (sc, what, text) => `<section class="panel"><h1>${esc(what)}</h1><p class="muted tight">${text}</p></section>`;

function activitiesPage({ user, flash, sc, list, usage }) {
  const L = SC.labels(sc);
  const q = `?s=${sc.id}`;
  return page({
    title: `${L.activity.many} · ${sc.name}`, tab: "activities", user, flash, xwide: true,
    body: `${intro(sc, L.activity.many, `What people can claim in ${esc(sc.name)}. Defaults fill in when you add one to ${esc(SC.an(L.middle.one))}; each ${esc(L.middle.one.toLowerCase())} can still change them. "All groups" makes it open to every ${esc(L.group.one.toLowerCase())} (like Cage Time). Import codes are the short names a vendor schedule uses (e.g. "D" for Defense).`)}
    <section class="panel" id="activities">
      <div class="table-wrap"><table class="settings-table">
        <thead><tr><th></th><th>Name</th><th>Color</th><th>Spots</th><th>Split into</th><th>Limit per ${esc(L.participant.one.toLowerCase())}</th><th>Who</th><th>Import codes</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((a, i) => { const id = `act-${i}`; const u = usage[a.name] || {}; return `<tr class="${a.active ? "" : "struck"}">
          <td>${moveBtns(`/admin/settings/activities/move${q}`, a.name, i, list.length)}</td>
          ${activityFields(a, id)}
          <td><label class="check"><input form="${id}" type="checkbox" name="hidden" value="1"${a.active ? "" : " checked"}> Hidden</label>
            <div class="fine">${u.sessions ? pl(u.sessions, L.slot.one.toLowerCase()) : "Not used yet"}</div></td>
          <td><div class="row-actions">
            <form id="${id}" method="post" action="/admin/settings/activities/update${q}"><input type="hidden" name="original" value="${esc(a.name)}"><button class="btn-ghost" type="submit">Save</button></form>
            ${u.programs ? "" : `<form method="post" action="/admin/settings/activities/remove${q}" onsubmit="return confirm('Remove ${esc(a.name)}?')"><input type="hidden" name="name" value="${esc(a.name)}"><button class="x" type="submit" aria-label="Remove">×</button></form>`}
          </div></td></tr>`; }).join("")}
          <tr class="add-row"><td></td>${activityFields({}, "act-new")}<td></td>
            <td><form id="act-new" method="post" action="/admin/settings/activities${q}"><button class="btn-small" type="submit">Add</button></form></td></tr>
        </tbody></table></div>
      ${list.length ? "" : `<p class="muted">No ${esc(L.activity.many.toLowerCase())} yet. Add the first one in the bottom row.</p>`}
      <p class="fine">Renaming updates every ${esc(L.middle.one.toLowerCase())}, ${esc(L.slot.one.toLowerCase())}, and limit that uses it. Hidden ones stay on existing ${esc(L.slot.many.toLowerCase())} and in reports but aren't offered for new ones.</p>
    </section>
    <script>
    document.querySelectorAll(".lim-unl").forEach(function (c) {
      c.addEventListener("change", function () { c.closest("td").querySelector(".lim-n").disabled = c.checked; });
    });
    </script>`,
  });
}

function groupsPage({ user, flash, sc, usage }) {
  const L = SC.labels(sc);
  const q = `?s=${sc.id}`;
  const groups = SC.groupsFor(sc), presets = SC.presetsFor(sc);
  return page({
    title: `${L.group.many} · ${sc.name}`, tab: "groups", user, flash,
    body: `${intro(sc, `${L.group.many} & tags`, `How ${esc(sc.name)}'s ${esc(L.participant.many.toLowerCase())} are sorted. ${esc(SC.an(L.group.one).replace(/^a/, "A"))} can be an age (12U), a team, a level, or anything else. "Roster only" sign-ups can be limited to certain ${esc(L.group.many.toLowerCase())}.`)}
    <div class="settings-2">
    <section class="panel" id="groups">
      <h2 class="banner">${esc(L.group.many)}</h2>
      ${groups.length ? `<ul class="list-edit">${groups.map((g, i) => { const u = usage[g] || {}; return `<li>
        ${moveBtns(`/admin/settings/groups/move${q}`, g, i, groups.length)}
        <form method="post" action="/admin/settings/groups/rename${q}" class="inline-edit">
          <input type="hidden" name="original" value="${esc(g)}"><input name="name" value="${esc(g)}" maxlength="30" aria-label="Name">
          <button class="btn-ghost" type="submit">Rename</button></form>
        <span class="fine">${pl(u.members || 0, L.participant.one.toLowerCase())}</span>
        <form method="post" action="/admin/settings/groups/remove${q}" onsubmit="return confirm('Remove ${esc(g)}?${u.members ? ` ${u.members} will have no ${esc(L.group.one.toLowerCase())}.` : ""}')"><input type="hidden" name="name" value="${esc(g)}"><button class="x" type="submit" aria-label="Remove ${esc(g)}">×</button></form>
      </li>`; }).join("")}</ul>` : `<p class="muted">None yet.</p>`}
      <form method="post" action="/admin/settings/groups${q}" class="inline-add"><label>New ${esc(L.group.one.toLowerCase())}<input name="name" maxlength="30" required placeholder="e.g. 12U, Varsity, Adults"></label>
        <button class="btn-small" type="submit">Add</button></form>
    </section>

    <section class="panel" id="tags">
      <h2 class="banner">Tags</h2>
      <p class="fine">Extra labels on people, like Catcher or Pitcher. A person can have several. Require a tag on ${esc(SC.an(L.activity.one))} (e.g. Catching) and only people with that tag can claim it; everyone else won't see it.</p>
      ${(sc.tags || []).length ? `<ul class="list-edit">${sc.tags.map((t) => { const u = usage[`tag:${t}`] || {}; return `<li>
        <form method="post" action="/admin/settings/tags/rename${q}" class="inline-edit">
          <input type="hidden" name="original" value="${esc(t)}"><input name="name" value="${esc(t)}" maxlength="30" aria-label="Tag name">
          <button class="btn-ghost" type="submit">Rename</button></form>
        <span class="fine">${pl(u.members || 0, L.participant.one.toLowerCase())}, required by ${u.programs || 0}</span>
        <form method="post" action="/admin/settings/tags/remove${q}" onsubmit="return confirm('Remove the ${esc(t)} tag? Anything that required it opens to everyone.')"><input type="hidden" name="name" value="${esc(t)}"><button class="x" type="submit" aria-label="Remove ${esc(t)}">×</button></form>
      </li>`; }).join("")}</ul>` : `<p class="muted">No tags yet.</p>`}
      <form method="post" action="/admin/settings/tags${q}" class="inline-add"><label>New tag<input name="name" maxlength="30" required placeholder="e.g. Catcher"></label>
        <button class="btn-small" type="submit">Add</button></form>
    </section>

    <section class="panel" id="presets">
      <h2 class="banner">Shortcuts</h2>
      <p class="fine">One-click buttons for picking several ${esc(L.group.many.toLowerCase())} at once when you set up ${esc(SC.an(L.middle.one))}.</p>
      ${presets.map((p) => `<form method="post" action="/admin/settings/presets${q}" class="preset-edit">
        <input type="hidden" name="original" value="${esc(p.name)}">
        <input name="name" value="${esc(p.name)}" maxlength="30" aria-label="Shortcut name" class="w-name">
        <span class="ages">${groups.map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"${p.ages.includes(g) ? " checked" : ""}> ${esc(g)}</label>`).join("")}</span>
        <button class="btn-ghost" type="submit">Save</button>
        <button class="x" type="submit" formaction="/admin/settings/presets/remove${q}" aria-label="Remove shortcut">×</button>
      </form>`).join("")}
      ${groups.length ? `<form method="post" action="/admin/settings/presets${q}" class="preset-edit new">
        <input name="name" maxlength="30" placeholder="New shortcut name" aria-label="New shortcut name" class="w-name" required>
        <span class="ages">${groups.map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"> ${esc(g)}</label>`).join("")}</span>
        <button class="btn-small" type="submit">Add</button>
      </form>` : `<p class="muted">Add ${esc(L.group.many.toLowerCase())} first.</p>`}
    </section>
    </div>`,
  });
}

function appPage({ user, flash, c, admins, envAdmins }) {
  const al = c.app_labels || {};
  const { fmtDateTime } = require("../time");
  return page({
    title: "App settings", tab: "settings", user, flash,
    body: `<section class="panel"><h1>App settings</h1>
      <p class="muted tight">Things that apply across the whole app. Everything else lives inside each ${esc((al.schedule || ["Claim Board"])[0])}.</p>
      <nav class="jump"><a href="#labels">Name</a><a href="#admins">Administrators</a></nav></section>
    <section class="panel" id="labels">
      <h2 class="banner">App name</h2>
      <form method="post" action="/admin/settings/labels" class="grid-form labels-form">
        <div><label>App name<input name="app_name" required maxlength="40" value="${esc(al.app_name)}" placeholder="Raptors Claim It"></label></div>
        <div><label>Short name<input name="app_short" maxlength="20" value="${esc(al.app_short)}" placeholder="Claim It"></label><span class="fine">Used on small screens.</span></div>
        <div class="full"><label>Organization<input name="org_name" maxlength="60" value="${esc(al.org_name)}" placeholder="Chippewa Valley Raptors"></label></div>
        <div class="pair"><div><label>Call each one a<input name="schedule_one" required maxlength="24" value="${esc((al.schedule || [])[0] || "Claim Board")}" placeholder="Claim Board"></label></div>
          <div><label>Plural<input name="schedule_many" maxlength="24" value="${esc((al.schedule || [])[1] || "Claim Boards")}" placeholder="Claim Boards"></label></div></div>
        <div class="full"><button class="btn-ghost" type="submit">Save</button></div>
      </form>
    </section>
    <section class="panel" id="admins">
      <h2 class="banner">Administrators</h2>
      <p class="fine">Administrators can open Settings and Reports and manage every ${esc((al.schedule || ["Claim Board"])[0])}. They sign in with their email like everyone else.</p>
      <ul class="res-list">
        ${envAdmins.map((e) => `<li class="res"><div class="res-main"><div class="res-when">${esc(e)}${e === user.email ? " (you)" : ""}</div>
          <div class="res-what">Set on the server (ADMIN_EMAILS in Railway), so it can't be removed here.</div></div>
          <div class="res-side"><span class="pill">Built-in</span></div></li>`).join("")}
        ${admins.filter((a) => !envAdmins.includes(a.email)).map((a) => `<li class="res"><div class="res-main"><div class="res-when">${esc(a.email)}${a.email === user.email ? " (you)" : ""}</div>
          <div class="res-what">Added ${a.added_by ? `by ${esc(a.added_by)} ` : ""}${esc(fmtDateTime(a.created_at))}. ${a.last_login_at ? `Last signed in ${esc(fmtDateTime(a.last_login_at))}.` : "Hasn't signed in yet."}</div></div>
          <div class="res-side">${a.email === user.email ? "" : `<form method="post" action="/admin/settings/admins/remove" onsubmit="return confirm('Remove ${esc(a.email)} as an administrator?')">
            <input type="hidden" name="email" value="${esc(a.email)}"><button class="btn-ghost danger" type="submit">Remove</button></form>`}</div></li>`).join("")}
      </ul>
      <form method="post" action="/admin/settings/admins" class="inline-add"><label>Add an administrator<input type="email" name="email" required placeholder="name@example.com"></label>
        <button class="btn-small" type="submit">Add</button></form>
    </section>`,
  });
}

module.exports = { activitiesPage, groupsPage, appPage };
