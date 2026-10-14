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

function settingsPage({ user, flash, c, usage }) {
  const acts = c.activities;
  return page({
    title: "Settings", tab: "settings", user, flash, xwide: true,
    body: `<section class="panel">
      <h1>Settings</h1>
      <p class="muted tight">The building blocks every season uses: what you offer, who it's for, and where. Keep it simple or get as detailed as you like.</p>
      <nav class="jump"><a href="#activities">Activities</a><a href="#groups">Groups</a><a href="#presets">Group shortcuts</a><a href="#locations">Locations</a><a href="#family">Family view</a></nav>
    </section>

    <section class="panel" id="activities">
      <h2 class="banner">Activities</h2>
      <p class="fine">What families can book. Defaults fill in when you add the activity to a round; each round can still change them. "All groups" makes it open to every group (like Cage Time). Import codes are the short names used in the vendor PDF (e.g. "D" for Defense).</p>
      <div class="table-wrap"><table class="settings-table">
        <thead><tr><th></th><th>Name</th><th>Color</th><th>Spots</th><th>Split into</th><th>Limit per athlete</th><th>Who</th><th>Import codes</th><th>Status</th><th></th></tr></thead>
        <tbody>${acts.map((a, i) => { const id = `act-${i}`; const u = usage[`a:${a.name}`] || {}; return `<tr class="${a.active ? "" : "struck"}">
          <td>${moveBtns("/admin/settings/activities/move", a.name, i, acts.length)}</td>
          ${activityFields(a, id)}
          <td><label class="check"><input form="${id}" type="checkbox" name="hidden" value="1"${a.active ? "" : " checked"}> Hidden</label>
            <div class="fine">${u.sessions ? pl(u.sessions, "session") : "Not used yet"}</div></td>
          <td><div class="row-actions">
            <form id="${id}" method="post" action="/admin/settings/activities/update"><input type="hidden" name="original" value="${esc(a.name)}"><button class="btn-ghost" type="submit">Save</button></form>
            ${u.programs ? "" : `<form method="post" action="/admin/settings/activities/remove" onsubmit="return confirm('Remove ${esc(a.name)}?')"><input type="hidden" name="name" value="${esc(a.name)}"><button class="x" type="submit" aria-label="Remove">×</button></form>`}
          </div></td></tr>`; }).join("")}
          <tr class="add-row"><td></td>${activityFields({}, "act-new")}<td></td>
            <td><form id="act-new" method="post" action="/admin/settings/activities"><button class="btn-small" type="submit">Add</button></form></td></tr>
        </tbody></table></div>
      <p class="fine">Renaming updates every round, session, and limit that uses it. Hidden activities stay on existing sessions and in reports but aren't offered for new ones.</p>
    </section>

    <div class="settings-2">
    <section class="panel" id="groups">
      <h2 class="banner">Groups</h2>
      <p class="fine">Each athlete belongs to one group. Groups can be ages (10U), levels (Beginner), or anything else.</p>
      <ul class="list-edit">${c.age_groups.map((g, i) => { const u = usage[`g:${g}`] || {}; return `<li>
        ${moveBtns("/admin/settings/groups/move", g, i, c.age_groups.length)}
        <form method="post" action="/admin/settings/groups/rename" class="inline-edit">
          <input type="hidden" name="original" value="${esc(g)}"><input name="name" value="${esc(g)}" maxlength="30" aria-label="Group name">
          <button class="btn-ghost" type="submit">Rename</button></form>
        <span class="fine">${pl(u.athletes || 0, "athlete")}</span>
        ${u.athletes ? "" : `<form method="post" action="/admin/settings/groups/remove" onsubmit="return confirm('Remove ${esc(g)}?')"><input type="hidden" name="name" value="${esc(g)}"><button class="x" type="submit" aria-label="Remove ${esc(g)}">×</button></form>`}
      </li>`; }).join("")}</ul>
      <form method="post" action="/admin/settings/groups" class="inline-add"><label>New group<input name="name" maxlength="30" required placeholder="e.g. 6U or Adult"></label>
        <button class="btn-small" type="submit">Add group</button></form>
    </section>

    <section class="panel" id="presets">
      <h2 class="banner">Group shortcuts</h2>
      <p class="fine">One-click buttons for picking several groups at once when you add a session.</p>
      ${c.presets.map((p) => `<form method="post" action="/admin/settings/presets" class="preset-edit">
        <input type="hidden" name="original" value="${esc(p.name)}">
        <input name="name" value="${esc(p.name)}" maxlength="30" aria-label="Shortcut name" class="w-name">
        <span class="ages">${c.age_groups.map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"${p.ages.includes(g) ? " checked" : ""}> ${esc(g)}</label>`).join("")}</span>
        <button class="btn-ghost" type="submit">Save</button>
        <button class="x" type="submit" formaction="/admin/settings/presets/remove" aria-label="Remove shortcut">×</button>
      </form>`).join("")}
      <form method="post" action="/admin/settings/presets" class="preset-edit new">
        <input name="name" maxlength="30" placeholder="New shortcut name" aria-label="New shortcut name" class="w-name" required>
        <span class="ages">${c.age_groups.map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"> ${esc(g)}</label>`).join("")}</span>
        <button class="btn-small" type="submit">Add</button>
      </form>
    </section>

    <section class="panel" id="locations">
      <h2 class="banner">Locations</h2>
      <p class="fine">Suggested when you set a round's location. Removing one doesn't change sessions that already use it.</p>
      <ul class="slot-list">${c.locations.map((l) => `<li><span>${esc(l)}</span>
        <form method="post" action="/admin/settings/locations/remove"><input type="hidden" name="name" value="${esc(l)}"><button class="x" type="submit" aria-label="Remove ${esc(l)}">×</button></form></li>`).join("")}</ul>
      <form method="post" action="/admin/settings/locations" class="inline-add"><label>New location<input name="name" maxlength="80" required placeholder="e.g. CVTC Fieldhouse"></label>
        <button class="btn-small" type="submit">Add location</button></form>
    </section>
    <section class="panel" id="family">
      <h2 class="banner">Family view</h2>
      <p class="fine">On a day's page, families can see which athletes are going to each session (so friends can sign up together). They never see emails or other contact details.</p>
      <form method="post" action="/admin/settings/family" class="stack-list checks">
        ${[["initial", "First name and last initial", "Ava S."], ["full", "Full names", "Ava Smith"], ["off", "Don't show who's going", "Only spots open"]].map(([v, l, ex]) =>
          `<label class="radio-row"><input type="radio" name="family_names" value="${v}"${(c.family_names || "initial") === v ? " checked" : ""}> ${l} <span class="fine-inline">${ex}</span></label>`).join("")}
        <div><button class="btn-ghost" type="submit">Save</button></div>
      </form>
    </section>
    </div>
    <script>
    document.querySelectorAll(".lim-unl").forEach(function (c) {
      c.addEventListener("change", function () { c.closest("td").querySelector(".lim-n").disabled = c.checked; });
    });
    </script>`,
  });
}

module.exports = { settingsPage };
