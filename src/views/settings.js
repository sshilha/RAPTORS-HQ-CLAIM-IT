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

function groupsPage({ user, flash, sc, usage, others = [], embed = false }) {
  const L = SC.labels(sc);
  const q = `?s=${sc.id}`;
  const groups = SC.groupsFor(sc), presets = SC.presetsFor(sc);
  // examples in this board's own words
  const acts = SC.activitiesFor(sc);
  const training = !acts.length || acts.includes("Hitting");
  const pick = (re, fb) => acts.find((a) => re.test(a)) || fb;
  const one = SC.depthOf(sc) === 1;
  const ex = { act: one ? "Salad" : pick(/hitting/i, acts[0] || "Hitting"), act2: one ? "Grill cook" : pick(/catch/i, acts[1] || acts[0] || "Catching"),
    group: groups.length > 1 ? `${groups[0]} and ${groups[1]}` : groups[0] || (training ? "12U–18U" : "Adults"),
    tag: (sc.tags || [])[0] || (training ? "Catcher" : "Bartender") };
  const body = `<section class="panel page-intro" id="teams">
      <h2>${esc(L.group.many)} &amp; tags</h2>
      <p class="fine">These decide who can claim what. Set them up here, give them to the ${esc(L.participant.many.toLowerCase())} below,
        then choose who each ${esc((SC.depthOf(sc) > 1 ? L.activity.one : L.slot.one).toLowerCase())} is for with its <b>Who</b> setting.</p>
      ${others.length ? `<details class="copy-from-d"><summary>Copy ${esc(L.group.many.toLowerCase())} and tags from another board</summary>
        <form method="post" action="/admin/settings/groups/copy${q}" class="copy-from">
        <select name="from" required aria-label="Board to copy from"><option value="">Pick a board…</option>
          ${others.map((x) => `<option value="${x.id}">${esc(x.name)} (${(x.groups || []).length} ${esc(SC.labels(x).group.many.toLowerCase())}${(x.tags || []).length ? `, ${(x.tags || []).length} tags` : ""})</option>`).join("")}</select>
        <button class="btn-ghost" type="submit">Copy</button>
        <span class="fine">Adds theirs to this board. Anything already here stays.</span></form></details>` : ""}
    </section>
    <div class="settings-2">
    <section class="panel" id="groups">
      <h2 class="banner">${esc(L.group.many)}</h2>
      <p class="card-def">Each person is on <b>one</b>, like an age group or team.<span class="ex">e.g. ${esc(require("../examples").forDepth(SC.depthOf(sc)).group)}</span></p>
      <form method="post" action="/admin/settings/groups${q}" class="inline-add tag-add"><label>New ${esc(L.group.one.toLowerCase())}<input name="name" maxlength="30" required placeholder="e.g. ${esc(require("../examples").forDepth(SC.depthOf(sc)).groupNames)}"></label>
        <button class="btn-small" type="submit">Add</button></form>
      ${groups.length ? `<ul class="list-edit">${groups.map((g, i) => { const u = usage[g] || {}; return `<li>
        ${moveBtns(`/admin/settings/groups/move${q}`, g, i, groups.length)}
        <form method="post" action="/admin/settings/groups/rename${q}" class="inline-edit">
          <input type="hidden" name="original" value="${esc(g)}"><input name="name" value="${esc(g)}" maxlength="30" aria-label="Name">
          <button class="btn-ghost" type="submit">Rename</button></form>
        <span class="fine">${pl(u.members || 0, L.participant.one.toLowerCase())}</span>
        <form method="post" action="/admin/settings/groups/remove${q}" onsubmit="return confirm('Remove ${esc(g)}?${u.members ? ` ${u.members} will have no ${esc(L.group.one.toLowerCase())}.` : ""}')"><input type="hidden" name="name" value="${esc(g)}"><button class="x" type="submit" aria-label="Remove ${esc(g)}">×</button></form>
      </li>`; }).join("")}</ul>` : `<p class="muted small items-empty">None yet. They'll show here.</p>`}
    </section>

    <section class="panel" id="tags">
      <h2 class="banner">Tags</h2>
      <p class="card-def">Extra labels; a person can have <b>several</b>.<span class="ex">e.g. ${esc(require("../examples").forDepth(SC.depthOf(sc)).tag)}</span></p>
      <form method="post" action="/admin/settings/tags${q}" class="inline-add tag-add"><label>New tag<input name="name" maxlength="30" required placeholder="e.g. ${esc(require("../examples").forDepth(SC.depthOf(sc)).tagNames)}"></label>
        <button class="btn-small" type="submit">Add</button></form>
      ${(sc.tags || []).length ? `<ul class="list-edit">${sc.tags.map((t) => { const u = usage[`tag:${t}`] || {}; return `<li>
        <form method="post" action="/admin/settings/tags/rename${q}" class="inline-edit">
          <input type="hidden" name="original" value="${esc(t)}"><input name="name" value="${esc(t)}" maxlength="30" aria-label="Tag name">
          <button class="btn-ghost" type="submit">Rename</button></form>
        <span class="fine">${pl(u.members || 0, L.participant.one.toLowerCase())}, required by ${u.programs || 0}</span>
        <form method="post" action="/admin/settings/tags/remove${q}" onsubmit="return confirm('Remove the ${esc(t)} tag? Anything that required it opens to everyone.')"><input type="hidden" name="name" value="${esc(t)}"><button class="x" type="submit" aria-label="Remove ${esc(t)}">×</button></form>
      </li>`; }).join("")}</ul>` : `<p class="muted small items-empty">No tags yet. They'll show here.</p>`}
    </section>

${SC.depthOf(sc) >= 3 ? `    <section class="panel" id="presets"><details>
      <summary class="banner-sum">${esc(L.group.one)} shortcuts <span class="fine-inline">(optional time-saver, only you see these)</span></summary>
      <div class="explain-1">
        <p><b>What they're for:</b> when you add ${esc(SC.an(L.activity.one.toLowerCase()))} to a ${esc(L.middle.one.toLowerCase())}, you check which ${esc(L.group.many.toLowerCase())} it's for.
          If you often pick the same set, save it here as a shortcut. It shows up as a button there that checks all of them in one click.</p>
        <p class="fine"><b>Example:</b> a shortcut named <b>12U–18U</b> with 12U, 14U, 16U, and 18U checked. Adding Hitting for the older girls is then one click instead of four.</p>
      </div>
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
    </details></section>` : ""}
    </div>`;
  if (embed) return body;
  return page({ title: `${L.group.many} · ${sc.name}`, tab: "groups", user, flash, body });
}

function appPage({ user, flash, c, admins, envAdmins, places = [], used = {}, mapsKey = "", part = "", counts = {} }) {
  const P = require("../locations");
  const al = c.app_labels || {};
  const { fmtDateTime } = require("../time");
  const I = require("./icons");
  const sections = {
    labels: ["App name & wording", `    <section class="panel" id="labels">
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
`],
    places: ["Locations", `    <section class="panel" id="places">
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

`],
    change: ["Change requests", `    <section class="panel" id="change">
      <h2 class="banner">Change requests</h2>
      <p class="fine">People can't edit their own details. They send a request from My Claims, and it's emailed here so an admin can update People.</p>
      <form method="post" action="/admin/settings/app/change-email" class="inline-add"><label>Send change requests to<input type="email" name="email" required value="${esc(c.change_email || "info@chippewavalleyraptors.com")}"></label>
        <button class="btn-small" type="submit">Save</button></form>
    </section>

`],
    accounts: ["Accounts & sign-in", `<section class="panel" id="accounts">
      <form method="post" action="/admin/settings/app/accounts" class="stack acc-set">
        <fieldset><legend>New accounts</legend>
          <label class="radio-row"><input type="radio" name="new_accounts" value="approval"${c.new_accounts !== "open" ? " checked" : ""}> <span><b>Approval required</b> <span class="fine">Someone with a new email can request an account; an admin approves it in Requests. People you add in People can always sign in.</span></span></label>
          <label class="radio-row"><input type="radio" name="new_accounts" value="open"${c.new_accounts === "open" ? " checked" : ""}> <span><b>Anyone can sign up</b> <span class="fine">Any email gets an account right away (the old way). "Anyone with an account" boards are then open to anyone.</span></span></label>
        </fieldset>
        <fieldset><legend>Passwords</legend>
          <label class="radio-row"><input type="radio" name="password_policy" value="optional"${c.password_policy !== "required" ? " checked" : ""}> <span><b>Optional</b> <span class="fine">The Welcome step offers a password, with "Skip for now". People can always use emailed links.</span></span></label>
          <label class="radio-row"><input type="radio" name="password_policy" value="required"${c.password_policy === "required" ? " checked" : ""}> <span><b>Required</b> <span class="fine">Everyone without a password is taken to the Welcome step until they set one.</span></span></label>
        </fieldset>
        <p class="fine">To require setup for just one person, open them in People → Sign-in &amp; setup.</p>
        <div class="q-actions"><button class="btn-small" type="submit">Save</button></div>
      </form></section>`],
    admins: ["Administrators", `    <section class="panel" id="admins">
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
    </section>`],
  };
  if (sections[part]) return page({ title: `${sections[part][0]} · App settings`, tab: "settings", user, flash,
    body: `<div class="page-top"><h1 class="page-title">App settings <span class="h-sub">${sections[part][0]}</span></h1>
      <a class="btn-ghost" href="/admin/settings/app">← App settings</a></div>${sections[part][1]}` });
  const card = (icon, title, summary, actions, note = "") => `<section class="panel side-card hub-card"><div class="card-head"><span class="ss-ico">${icon}</span><h2>${title}</h2></div>
      <p class="hub-sum">${summary}</p>${note ? `<p class="fine">${note}</p>` : ""}<div class="hub-actions">${actions}</div></section>`;
  const btn = (href, label, primary = false) => `<a class="${primary ? "btn-small" : "btn-ghost"}" href="${href}">${label}</a>`;
  return page({ title: "App settings", tab: "settings", user, flash,
    body: `<div class="page-top"><h1 class="page-title">App settings</h1></div>
    <p class="muted">Things that apply across the whole app. Everything else lives inside each ${esc((al.schedule || ["Claim Board"])[0])}.</p>
    <div class="hub-grid">
      ${card(I.users(), "People", `<b>${counts.people || 0}</b> people · ${counts.athletes || 0} athletes · ${counts.adults || 0} adults`,
        btn("/admin/people", "Manage", true) + btn("/admin/people/import", "⇪ Import"),
        "Everyone in the app. Add people once here, then add them to any board.")}
      ${card(I.userCheck(), "Accounts &amp; sign-in", `New accounts: <b>${c.new_accounts === "open" ? "anyone can sign up" : "approval required"}</b> · Passwords: <b>${c.password_policy === "required" ? "required" : "optional"}</b>`,
        btn("/admin/settings/app?part=accounts", "Edit", true) + btn("/admin/signins", "Sign-in activity"), "Who can get an account, and how people sign in.")}
      ${card(I.check(), "Requests", `<b>${counts.requests || 0}</b> waiting`, btn("/admin/requests", "Review", true),
        "Family members to add, and changes people asked for.")}
      ${card(I.pin(), "Locations", `<b>${places.length}</b> saved place${places.length === 1 ? "" : "s"}`, btn("/admin/settings/app?part=places", "Manage", true),
        "Places with addresses, so people get directions.")}
      ${card(I.userCheck(), "Administrators", `<b>${admins.length + envAdmins.filter((e) => !admins.some((a) => a.email === e)).length}</b> admin${admins.length + envAdmins.length === 1 ? "" : "s"}`,
        btn("/admin/settings/app?part=admins", "Manage", true), "People who can set up boards and see everything.")}
      ${card(I.gear(), "App name &amp; wording", `<b>${esc(require("../config").LABELS.app_name)}</b> · boards are called “${esc(require("../config").LABELS.schedule)}”`,
        btn("/admin/settings/app?part=labels", "Edit", true))}
      ${card(I.check(), "Change requests", `Sent to <b>${esc(c.change_email || "info@chippewavalleyraptors.com")}</b>`, btn("/admin/settings/app?part=change", "Edit", true),
        "People ask here to fix their info; admins update People.")}
    </div>` });
}

module.exports = { activitiesPage, groupsPage, appPage };
