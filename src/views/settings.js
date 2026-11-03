const { esc } = require("./layout");
const { page } = require("./admin");

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const moveBtns = (action, name, i, n) => `<div class="move">
  <form method="post" action="${action}"><input type="hidden" name="name" value="${esc(name)}"><input type="hidden" name="dir" value="up">
    <button class="x" type="submit" aria-label="Move up"${i === 0 ? " disabled" : ""}>▲</button></form>
  <form method="post" action="${action}"><input type="hidden" name="name" value="${esc(name)}"><input type="hidden" name="dir" value="down">
    <button class="x" type="submit" aria-label="Move down"${i === n - 1 ? " disabled" : ""}>▼</button></form></div>`;

const SC = require("../schedules");
const intro = (sc, what, text) => `<section class="panel"><h1>${esc(what)}</h1><p class="muted tight">${text}</p></section>`;

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

function appPage({ user, flash, c, admins, envAdmins, places = [], used = {}, mapsKey = "", part = "", counts = {}, head = null }) {
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
      <div class="place-addbox"><span class="ia-title">Add a place</span>
      <form method="post" action="/admin/settings/places" class="inline-add place-add">
        <label>Name<input name="name" id="place-name" required maxlength="80" placeholder="e.g. Turn Two Athletics"></label>
        <label class="grow">Address<input name="address" id="place-address" class="addr" maxlength="200" placeholder="${mapsKey ? "Start typing to search…" : "Street, city, state"}"></label>
        <button class="btn-small" type="submit">Add place</button>
      </form>
      ${mapsKey ? `<p class="fine">Address search is on: start typing an address or place name and pick from the list.</p>` : `<p class="fine">Want address search as you type? Add a Google Maps API key in Railway as <code>GOOGLE_MAPS_API_KEY</code> (with <b>Places API (New)</b> turned on). Map links work without it.</p>`}
      </div>
      <h3 class="ilist-head">Your places <span class="fine-inline">(${places.length})</span></h3>
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
    </section>
    ${mapsKey ? `<script>
    (function () {
      var token = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
      document.querySelectorAll("input.addr").forEach(function (el) {
        el.setAttribute("autocomplete", "off");
        var box = document.createElement("div"); box.className = "addr-sug"; box.hidden = true; el.parentNode.style.position = "relative"; el.parentNode.appendChild(box);
        var t = null, items = [], at = -1;
        function close() { box.hidden = true; at = -1; }
        function show(list, err) {
          items = list; at = -1;
          box.innerHTML = err ? '<div class="addr-err">' + err + '</div>' : list.map(function (x, i) { return '<button type="button" data-i="' + i + '"><b></b><span></span></button>'; }).join("");
          if (!err) [].forEach.call(box.querySelectorAll("button"), function (b, i) { b.querySelector("b").textContent = list[i].main; b.querySelector("span").textContent = list[i].sub; });
          box.hidden = !list.length && !err;
        }
        function pick(i) {
          var x = items[i]; if (!x) return; close(); el.value = x.main + (x.sub ? ", " + x.sub : "");
          fetch("/admin/settings/places/details?id=" + encodeURIComponent(x.id) + "&s=" + token).then(function (r) { return r.json(); }).then(function (d) {
            if (d.address) el.value = d.address;
            var nameBox = el.id === "place-address" ? document.getElementById("place-name") : (el.form ? el.form.querySelector('[name="name"]') : document.querySelector('[form="' + el.getAttribute("form") + '"][name="name"]'));
            if (nameBox && !nameBox.value && d.name) nameBox.value = d.name;
            token = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());   // next search, new session
          });
        }
        el.addEventListener("input", function () { clearTimeout(t); var q = el.value.trim(); if (q.length < 3) return close();
          t = setTimeout(function () { fetch("/admin/settings/places/suggest?q=" + encodeURIComponent(q) + "&s=" + token).then(function (r) { return r.json(); }).then(function (j) { show(j.items || [], j.error); }); }, 250); });
        box.addEventListener("mousedown", function (e) { var b = e.target.closest("button"); if (b) { e.preventDefault(); pick(+b.dataset.i); } });
        el.addEventListener("keydown", function (e) {
          if (box.hidden) return; var bs = box.querySelectorAll("button");
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); at = (at + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length; bs.forEach(function (b, i) { b.classList.toggle("on", i === at); }); }
          else if (e.key === "Enter" && at >= 0) { e.preventDefault(); pick(at); } else if (e.key === "Escape") close();
        });
        el.addEventListener("blur", function () { setTimeout(close, 150); });
      });
    })();
    </script>` : ""}

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
          <label class="radio-row"><input type="radio" name="password_policy" value="required"${c.password_policy === "required" ? " checked" : ""}> <span><b>Required</b> <span class="fine">Everyone sets a password the first time they sign in (with an emailed link). After that they sign in with it, and email is only used for Forgot password. Fewer emails, and nothing waits on email.</span></span></label>
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
    body: `${head ? head(part) : ""}${sections[part][1]}` });
  const card = (icon, title, summary, actions, note = "") => `<section class="panel side-card hub-card"><div class="card-head"><span class="ss-ico">${icon}</span><h2>${title}</h2></div>
      <p class="hub-sum">${summary}</p>${note ? `<p class="fine">${note}</p>` : ""}<div class="hub-actions">${actions}</div></section>`;
  const btn = (href, label, primary = false) => `<a class="${primary ? "btn-small" : "btn-ghost"}" href="${href}">${label}</a>`;
  return page({ title: "App settings", tab: "settings", user, flash,
    body: `${head ? head("") : ""}
    <p class="muted app-intro">Things that apply across the whole app. Everything else lives inside each ${esc((al.schedule || ["Claim Board"])[0])}.</p>
    <div class="hub-grid">
      ${card(I.users(), "People", `<b>${counts.people || 0}</b> people · ${counts.athletes || 0} athletes · ${counts.adults || 0} adults`,
        btn("/admin/people", "Manage", true) + btn("/admin/people/import", "⇪ Import"),
        "Everyone in the app. Add people once here, then add them to any board.")}
      ${card(I.userCheck(), "Accounts &amp; sign-in", `New accounts: <b>${c.new_accounts === "open" ? "anyone can sign up" : "approval required"}</b> · Passwords: <b>${c.password_policy === "required" ? "required" : "optional"}</b>`,
        btn("/admin/settings/app?part=accounts", "Edit", true) + btn("/admin/signins", "Sign-in activity"), "Who can get an account, and how people sign in.")}
      ${card(I.check(), "Requests", `<b>${counts.requests || 0}</b> waiting`, btn("/admin/requests", "Review", true),
        "New account requests, family members to add, and changes people asked for.")}
      ${card(I.pin(), "Locations", `<b>${places.length}</b> saved place${places.length === 1 ? "" : "s"}`, btn("/admin/settings/app?part=places", "Manage", true),
        "Places with addresses, so people get directions.")}
      ${card(I.userCheck(), "Administrators", `<b>${admins.length + envAdmins.filter((e) => !admins.some((a) => a.email === e)).length}</b> admin${admins.length + envAdmins.length === 1 ? "" : "s"}`,
        btn("/admin/settings/app?part=admins", "Manage", true), "People who can set up boards and see everything.")}
      ${card(I.gear(), "App name &amp; wording", `<b>${esc(require("../config").LABELS.app_name)}</b> · boards are called “${esc(require("../config").LABELS.schedule)}”`,
        btn("/admin/settings/app?part=labels", "Edit", true))}
    </div>` });
}

module.exports = { groupsPage, appPage };
