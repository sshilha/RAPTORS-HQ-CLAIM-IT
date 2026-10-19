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
    body: `${intro(sc, L.activity.many, `The kinds of things people claim in ${esc(sc.name)} (you'll add the actual ${esc(L.slot.many.toLowerCase())} when you open the board). Defaults fill in when you add one to ${esc(SC.an(L.middle.one))}; each ${esc(L.middle.one.toLowerCase())} can still change them. "All groups" makes it open to every ${esc(L.group.one.toLowerCase())} (like Cage Time). Import codes are the short names a vendor schedule uses (e.g. "D" for Defense).`)}
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

function groupsPage({ user, flash, sc, usage, others = [] }) {
  const L = SC.labels(sc);
  const q = `?s=${sc.id}`;
  const groups = SC.groupsFor(sc), presets = SC.presetsFor(sc);
  // examples in this board's own words
  const acts = SC.activitiesFor(sc);
  const training = !acts.length || acts.includes("Hitting");
  const pick = (re, fb) => acts.find((a) => re.test(a)) || fb;
  const ex = { act: pick(/hitting/i, acts[0] || "Hitting"), act2: pick(/catch/i, acts[1] || acts[0] || "Catching"),
    group: groups.length > 1 ? `${groups[0]} and ${groups[1]}` : groups[0] || (training ? "12U–18U" : "Adults"),
    tag: (sc.tags || [])[0] || (training ? "Catcher" : "Bartender") };
  return page({
    title: `${L.group.many} · ${sc.name}`, tab: "groups", user, flash,
    body: `<section class="panel"><h1>${esc(L.group.many)} &amp; tags</h1>
      <p class="why-note">Shown because Setup says <b>some ${esc((SC.depthOf(sc) > 1 ? L.activity.many : L.slot.many).toLowerCase())} are limited to certain people</b>. <a href="/admin/setup/schedule?s=${sc.id}#who">Change that</a></p>
      <p class="lede">Use this only if some ${esc(L.activity.many.toLowerCase())} should be claimable by <b>certain people only</b>. If anyone can claim anything, skip this step.</p>
      <div class="explain">
        <div><b>${esc(L.group.many)}</b> sort ${esc(L.participant.many.toLowerCase())} into one group each, like ages (12U, 14U) or teams. When you add ${esc(SC.an(L.activity.one))} you pick which ${esc(L.group.many.toLowerCase())} it's for.
          <div class="fine">Example: ${esc(ex.act)} only for ${esc(ex.group)}.</div></div>
        <div><b>Tags</b> are extra labels a person can have several of, like Catcher or Pitcher. You check them on each person in the <b>${esc(L.participant.many)}</b> step, then set "Only for" on ${esc(SC.an(L.activity.one))}.
          <div class="fine">Example: ${esc(ex.act2)} only for people tagged ${esc(ex.tag)}.</div></div>
      </div>
      ${others.length ? `<form method="post" action="/admin/settings/groups/copy${q}" class="copy-from">
        <span class="label-like">Copy from another board</span>
        <select name="from" required aria-label="Board to copy from"><option value="">Pick a board…</option>
          ${others.map((x) => `<option value="${x.id}">${esc(x.name)} (${(x.groups || []).length} ${esc(SC.labels(x).group.many.toLowerCase())}${(x.tags || []).length ? `, ${(x.tags || []).length} tags` : ""})</option>`).join("")}</select>
        <button class="btn-ghost" type="submit">Copy</button>
        <span class="fine">Adds their ${esc(L.group.many.toLowerCase())}, tags, and shortcuts. Anything already here stays.</span>
      </form>` : ""}
    </section>
    <div class="settings-2">
    <section class="panel" id="groups">
      <h2 class="banner">${esc(L.group.many)}</h2>
      <p class="fine">Each person is in one. Pick a person's ${esc(L.group.one.toLowerCase())} in the ${esc(L.participant.many)} step.</p>
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
      <p class="fine">A person can have several. They appear as checkboxes next to each person in the ${esc(L.participant.many)} step, and as "Only for" choices when you add ${esc(SC.an(L.activity.one))}. People without the tag won't see it.</p>
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

    <section class="panel" id="presets"><details>
      <summary class="banner-sum">Setup shortcuts <span class="fine-inline">(a time-saver for you; people claiming never see these)</span></summary>
      <p class="fine">Buttons that check several ${esc(L.group.many.toLowerCase())} at once when you add ${esc(SC.an(L.activity.one))}. For example, a "12U–18U" button checks 12U, 14U, 16U, and 18U in one click. Only worth setting up if you have lots of ${esc(L.group.many.toLowerCase())}.</p>
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
    </details></section>
    </div>`,
  });
}

function appPage({ user, flash, c, admins, envAdmins, places = [], used = {}, mapsKey = "" }) {
  const P = require("../locations");
  const al = c.app_labels || {};
  const { fmtDateTime } = require("../time");
  return page({
    title: "App settings", tab: "settings", user, flash,
    body: `<section class="panel"><h1>App settings</h1>
      <p class="muted tight">Things that apply across the whole app. Everything else lives inside each ${esc((al.schedule || ["Claim Board"])[0])}.</p>
      <nav class="jump"><a href="#labels">Name</a><a href="#places">Locations</a><a href="#admins">Administrators</a></nav></section>
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
    <section class="panel" id="places">
      <h2 class="banner">Locations</h2>
      <p class="fine">Places you use often. Location boxes everywhere suggest these, and people see them as a 📍 link to directions. You can still type any location (like "Pavilion behind Field 2"); it just shows as plain text.</p>
      ${places.length ? `<div class="table-wrap"><table class="places">
        <thead><tr><th>Name</th><th>Address</th><th>Map</th><th>Used</th><th></th></tr></thead>
        <tbody>${places.map((l) => `<tr>
          <td><input form="pl-${l.id}" name="name" value="${esc(l.name)}" maxlength="80" required aria-label="Name"></td>
          <td><input form="pl-${l.id}" name="address" value="${esc(l.address)}" maxlength="200" class="addr" placeholder="Street, city, state" aria-label="Address"></td>
          <td>${l.address ? `<a href="${P.mapUrl(l.name)}" target="_blank" rel="noopener">Open in Maps</a>` : `<span class="fine">Add an address</span>`}</td>
          <td><span class="used-n">${used[l.name.toLowerCase()] || 0}</span></td>
          <td><div class="row-actions"><form id="pl-${l.id}" method="post" action="/admin/settings/places/${l.id}"><button class="btn-ghost" type="submit">Save</button></form>
            <form method="post" action="/admin/settings/places/${l.id}/remove" onsubmit="return confirm('Remove ${esc(l.name)} from saved places?')"><button class="x" type="submit" aria-label="Remove">×</button></form></div></td>
        </tr>`).join("")}</tbody></table></div>` : `<p class="muted">No saved places yet.</p>`}
      <form method="post" action="/admin/settings/places" class="inline-add place-add">
        <label>Name<input name="name" id="place-name" required maxlength="80" placeholder="e.g. Turn Two Athletics"></label>
        <label class="grow">Address<input name="address" id="place-address" class="addr" maxlength="200" placeholder="${mapsKey ? "Start typing to search…" : "Street, city, state"}"></label>
        <button class="btn-small" type="submit">Add place</button>
      </form>
      ${mapsKey ? "" : `<p class="fine">Want address search as you type? Add a Google Maps API key in Railway as <code>GOOGLE_MAPS_API_KEY</code>. Map links work without it.</p>`}
    </section>
    ${mapsKey ? `<script>
      function initPlaces() {
        document.querySelectorAll("input.addr").forEach(function (el) {
          var ac = new google.maps.places.Autocomplete(el, { fields: ["formatted_address", "name"], componentRestrictions: { country: "us" } });
          ac.addListener("place_changed", function () {
            var p = ac.getPlace(); if (!p) return;
            if (p.formatted_address) el.value = p.formatted_address;
            var nameBox = el.form ? el.form.querySelector('[name="name"]') : document.querySelector('[form="' + el.getAttribute("form") + '"][name="name"]');
            if (el.id === "place-address") nameBox = document.getElementById("place-name");
            if (nameBox && !nameBox.value && p.name) nameBox.value = p.name;
          });
          el.addEventListener("keydown", function (e) { if (e.key === "Enter" && document.querySelector(".pac-container:not([style*='display: none'])")) e.preventDefault(); });
        });
      }
    </script>
    <script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&libraries=places&callback=initPlaces"></script>` : ""}

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
