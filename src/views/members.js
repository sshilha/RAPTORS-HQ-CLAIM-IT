const { esc } = require("./layout");
const { page } = require("./admin");
const SC = require("../schedules");

function groupSelect(sc, value, attrs = "") {
  return `<select name="group" ${attrs}><option value="">No ${esc(SC.labels(sc).group.one.toLowerCase())}</option>
    ${SC.groupsFor(sc).map((g) => `<option${g === value ? " selected" : ""}>${esc(g)}</option>`).join("")}</select>`;
}

function needBanner(sc, L) {
  const SCm = require("../schedules");
  return needHelp(sc, L) + (SCm.needsPeople(sc) ? `<p class="ex">e.g. ${esc(require("../examples").forDepth(SCm.depthOf(sc)).person)}</p>` : "");
}
function needHelp(sc, L) {
  const SCm = require("../schedules");
  const p = esc(L.participant.many.toLowerCase()), g = esc(L.group.one.toLowerCase());
  if (SCm.claimMode(sc) === "roster") return `<p class="fine page-help">Only the ${p} listed here can claim on <b>${esc(sc.name)}</b>. Add each one with their ${g}${SCm.restricts(sc) ? " and tags" : ""}, plus a parent or contact email so they can sign in and see their own.</p>`;
  if (SCm.restricts(sc)) return `<p class="fine page-help">Give people their ${g} and tags here. Anyone with an account can still claim things that aren't limited; limited ones need the matching ${g} or tag.</p>`;
  return `<p class="fine page-help"><b>Not in use on this board.</b> It's open to ${SCm.claimMode(sc) === "public" ? "anyone with the link" : "anyone signed in"}, so people just claim spots. <a href="/admin/setup/schedule?s=${sc.id}">Back to settings</a></p>`;
}

function membersPage({ user, flash, sc, members, others, group, total, teams = "", head = "", sub = "people", addOpen = false }) {
  const L = SC.labels(sc);
  const groups = SC.groupsFor(sc);
  const tags = sc.tags || [];
  const back = `/admin/members?s=${sc.id}&sub=people${group ? `&g=${encodeURIComponent(group)}` : ""}`;
  const noGroup = members.filter((m) => !m.group_name).length;
  const ICO = (d) => `<span class="card-ico" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
  const sumList = (xs, none) => xs.length ? esc(xs.slice(0, 6).join(" · ")) + (xs.length > 6 ? ` +${xs.length - 6}` : "") : none;
  const SUBOF = { copy: "groups", groups: "groups", tags: "groups", presets: "shortcuts" };
  const hasShortcuts = teams.includes('id="presets"');
  if (sub === "shortcuts" && !hasShortcuts) sub = "people";
  const vis = (k) => (SUBOF[k] || "people") === sub ? "" : " hidden";
  const cardTeams = teams
    .replace('<section class="panel page-intro" id="teams">', `<section class="panel page-intro" id="teams" data-card="copy" data-order="6"${vis("copy")} data-title="Copy groups &amp; tags" data-sum="From another board" data-sub="Start from another board's ${esc(L.group.many.toLowerCase())} and tags">${ICO('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/>')}`)
    .replace('<section class="panel" id="groups">', `<section class="panel" id="groups" data-card="groups" data-order="3"${vis("groups")} data-title="${esc(L.group.many)}" data-sum="${sumList(groups, "None yet")}" data-sub="Each person is on one, like an age group">${ICO('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.4.2 4 1.9 4.5 5"/>')}`)
    .replace('<section class="panel" id="tags">', `<section class="panel" id="tags" data-card="tags" data-order="4"${vis("tags")} data-title="Tags" data-sum="${sumList(tags, "None yet")}" data-sub="Extra labels; a person can have several">${ICO('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>')}`)
    .replace('<section class="panel" id="presets">', `<section class="panel" id="presets" data-card="presets" data-order="5"${vis("presets")} data-title="${esc(L.group.one)} shortcuts" data-sum="Optional time-saver" data-sub="Pick several ${esc(L.group.many.toLowerCase())} at once">${ICO('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>')}`);
  return page({
    title: `${sc.name} ${L.group.many}, tags & ${L.participant.many.toLowerCase()}`, tab: "members", user, flash,
    body: `${head}
    <nav class="sub-tabs" aria-label="Access &amp; people">
      <a href="/admin/members?s=${sc.id}&sub=people"${sub === "people" ? ' aria-current="page"' : ""}>${esc(L.participant.many)} <i class="sub-n">${total}</i></a>
      <a href="/admin/members?s=${sc.id}&sub=groups"${sub === "groups" ? ' aria-current="page"' : ""}>${esc(L.group.many)} &amp; tags</a>
      ${hasShortcuts ? `<a href="/admin/members?s=${sc.id}&sub=shortcuts"${sub === "shortcuts" ? ' aria-current="page"' : ""}>${esc(L.group.one)} shortcuts</a>` : ""}</nav>
    <div class="am-body">
    <section class="panel" id="people" data-card="add" data-order="2"${sub === "people" && addOpen ? "" : " hidden"} data-title="Add people" data-sum="From People, or quick add someone new" data-sub="Put people on this board">${ICO('<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.8 3.3-6 6.5-6s5.9 2.2 6.5 6M19 8v6M16 11h6"/>')}
      <div class="athlete-head"><div><h2>${esc(L.participant.many)}</h2>
        <p class="muted tight">${total} on ${esc(sc.name)}</p></div>
        <span class="head-btns"><a class="btn-ghost" href="/admin/people/import" title="Bring a roster into People first, then add the list here">⇪ Import into People</a></span></div>
      ${needBanner(sc, L)}
      <p class="fine where-note">Everyone lives in <a href="/admin/people">People</a> (names, families, contact info). This board keeps <b>who is on it</b> and their ${esc(L.group.one.toLowerCase())} and tags here. For a whole roster: import it in People, then add the list below.</p>
      <div class="add-people" id="add">
        <div class="ap-tabs" role="tablist">
          <button type="button" role="tab" class="ap-tab on" data-ap="existing" aria-selected="true">Add from People${others.length ? ` (${others.length})` : ""}</button>
          <button type="button" role="tab" class="ap-tab" data-ap="new" aria-selected="false">Quick add someone new</button>
        </div>
        <form method="post" action="/admin/members?s=${sc.id}" class="grid-form ap-pane qa" data-ap="new" hidden>
          <p class="fine full">Someone who isn't in People yet. They're added to People and to this board.</p>
          <div><label>First name<input name="first_name" required maxlength="40"></label></div>
          <div><label>Last name<input name="last_name" required maxlength="40"></label></div>
          <div><label>${esc(L.group.one)} on this board${groupSelect(sc, null)}</label></div>
          ${(sc.tags || []).length ? `<div class="full"><span class="field-lbl">Tags on this board</span><div class="tag-checks">${sc.tags.map((t) => `<label class="tag-box"><input type="checkbox" name="tags" value="${esc(t)}"> ${esc(t)}</label>`).join("")}</div></div>` : ""}
          <details class="full qa-more"><summary class="link-dark">Add all details</summary>
            <div class="grid-form qa-grid">
              <div class="full qa-kind"><label class="radio-row"><input type="radio" name="kind" value="athlete" checked> ${esc(L.participant.one === "Volunteer" ? "Athlete" : L.participant.one)}</label><label class="radio-row"><input type="radio" name="kind" value="adult"> Adult (volunteer, coach, parent)</label></div>
              <div><label>Current team<input name="team" maxlength="40" placeholder="e.g. 12U Shilha"></label></div>
              <div class="qa-ath"><label>Birth year<input name="birth_year" type="number" min="1940" max="2100"></label></div>
              <div class="qa-ath"><label>Jersey #<input name="jersey" maxlength="4"></label></div>
              <div class="full qa-ath"><label>Parent emails<input name="parent_emails" placeholder="e.g. mom@example.com, dad@example.com"></label><span class="fine">They sign in with these to claim for this athlete.</span></div>
              <div class="qa-adult" hidden><label>Email<input name="email" type="email" maxlength="120"></label></div>
              <div class="qa-adult" hidden><label>Phone<input name="phone" maxlength="30"></label></div>
              <div class="full"><label>Notes<input name="notes" maxlength="200"></label></div>
            </div></details>
          <div class="full ap-actions"><button class="btn-small" type="submit">Add to People and ${esc(sc.name)}</button></div>
        </form>
        <div class="ap-pane" data-ap="existing">
          <p class="fine">Everyone in the app's <a href="/admin/people">People</a> directory who isn't on this board yet. Filter by list or current team, check who to add, then pick their ${esc(L.group.one.toLowerCase())} here.</p>
          ${others.length ? (() => { const uniq = (k) => [...new Set(others.map((o) => o[k]).filter(Boolean))].sort();
            const sel = (k, label) => uniq(k).length ? `<select class="ap-f" data-f="${k}" aria-label="${label}"><option value="">${label}: any</option>${uniq(k).map((x) => `<option>${esc(x)}</option>`).join("")}</select>` : "";
            return `<div class="ap-filter"><input type="search" class="ap-search" placeholder="Type to find someone…" aria-label="Find someone">
              <select class="ap-f" data-f="kind" aria-label="Kind"><option value="">Everyone</option><option value="athlete">Athletes</option><option value="adult">Adults</option></select>
              ${(() => { const ls = [...new Set(others.flatMap((o) => o.lists || []))].sort(); return ls.length ? `<select class="ap-f" data-f="lists" aria-label="List"><option value="">List: any</option>${ls.map((x) => `<option>${esc(x)}</option>`).join("")}</select>` : ""; })()}
              ${sel("team", "Current team")}
              <button type="button" class="link-dark ap-all">Check all shown</button></div>`; })() : ""}
          ${others.length ? `<form method="post" action="/admin/members/add?s=${sc.id}" class="stack ap-existing">
          <div class="ap-list">${others.map((a) => `<label class="ap-person" data-kind="${a.kind}" data-team="${esc(a.team || "")}" data-lists="${esc((a.lists || []).join("|"))}"><input type="checkbox" name="athlete_id" value="${a.id}"> ${a.first_name || a.last_name ? `${esc(a.last_name)}, ${esc(a.first_name)}` : esc(a.email || "(no name)")}
            <span class="fine">${[a.kind === "adult" ? ((a.roles || []).join(", ") || "adult") : "", a.team].filter(Boolean).map(esc).join(" · ")}</span></label>`).join("")}</div>
          <span class="fine ap-count">Check everyone to add.</span>
          <label>${esc(L.group.one)} on this board${groupSelect(sc, null).replace(/(<select[^>]*>)/, `$1<option value="__team" selected>Match their team (if it's a ${esc(L.group.one.toLowerCase())} here)</option>`)}</label>
          <div class="ap-actions"><button class="btn-small" type="submit">Add to ${esc(sc.name)}</button></div>
        </form>` : `<p class="muted">Everyone in the app is already on ${esc(sc.name)}.</p>`}
      
        </div>
      </div>
    </section>
    <section class="panel" id="people-list" data-card="people" data-order="1"${sub === "people" ? "" : " hidden"} data-title="${esc(L.participant.many)} on this board" data-sum="<b>${total}</b> on ${esc(sc.name)}${noGroup && !group ? ` · ${noGroup} without a ${esc(L.group.one.toLowerCase())}` : ""}" data-sub="Their ${esc(L.group.one.toLowerCase())} and tags here">${ICO('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><path d="M16 4h5M16 8h5M16 12h3"/>')}
      <div class="pp-toolbar am-toolbar"><div class="pp-acts"><button type="button" class="sb-btn primary" onclick="var a=document.getElementById('people'); a.hidden=!a.hidden; if (!a.hidden) a.scrollIntoView({block:'start'})">+ Add people</button></div>
        <h3 class="ilist-head">${esc(L.participant.many)} on ${esc(sc.name)} <span class="fine-inline">(${total})</span></h3></div>
      ${groups.length ? `<nav class="chip-filter" aria-label="Filter by ${esc(L.group.one.toLowerCase())}">
        <a href="/admin/members?s=${sc.id}&sub=people"${!group ? ' aria-current="page"' : ""}>All</a>
        ${groups.map((g) => `<a href="/admin/members?s=${sc.id}&sub=people&g=${encodeURIComponent(g)}"${group === g ? ' aria-current="page"' : ""}>${esc(g)}</a>`).join("")}
        <a href="/admin/members?s=${sc.id}&sub=people&g=none"${group === "none" ? ' aria-current="page"' : ""}>No ${esc(L.group.one.toLowerCase())}</a>
        ${(sc.tags || []).map((t) => `<a class="tag-filter" href="/admin/members?s=${sc.id}&g=${encodeURIComponent("tag:" + t)}"${group === "tag:" + t ? ' aria-current="page"' : ""}>🏷 ${esc(t)}</a>`).join("")}</nav>` : ""}
      ${members.length ? `<div class="table-wrap"><table>
        <thead><tr><th><input type="checkbox" aria-label="Select all" onclick="document.querySelectorAll('.pick').forEach(c=>c.checked=this.checked)"></th><th>${esc(L.participant.one)}</th><th>${esc(L.group.one)}</th>${tags.length ? "<th>Tags</th>" : ""}<th>Emails</th><th>Also in</th><th></th></tr></thead>
        <tbody>${members.map((a) => `<tr>
          <td><input type="checkbox" class="pick" name="athlete_id" value="${a.id}" form="bulk" aria-label="Select ${esc(a.first_name)}"></td>
          <td><a href="/admin/people/${a.id}" title="Details, family, and contact info are edited in People">${esc(a.last_name)}, ${esc(a.first_name)}</a>${a.self_user_id ? ` <span class="fine-inline">adult</span>` : ""}</td>
          <td><form method="post" action="/admin/members/${a.id}?s=${sc.id}" class="inline-group">
            <input type="hidden" name="return_to" value="${esc(back)}">
            ${groupSelect(sc, a.group_name, `onchange="this.form.submit()" aria-label="${esc(L.group.one)}"`)}
            <noscript><button class="btn-ghost">Save</button></noscript></form></td>
          ${tags.length ? `<td><form method="post" action="/admin/members/${a.id}/tags?s=${sc.id}" class="tag-boxes">
            <input type="hidden" name="return_to" value="${esc(back)}">
            ${tags.map((t) => `<label class="tag-box${(a.tags || []).includes(t) ? " on" : ""}"><input type="checkbox" name="tags" value="${esc(t)}"${(a.tags || []).includes(t) ? " checked" : ""} onchange="this.form.submit()"> ${esc(t)}</label>`).join("")}
            <noscript><button class="btn-ghost">Save</button></noscript></form></td>` : ""}
          <td>${a.emails.length ? esc(a.emails.join(", ")) : `<span class="fine">None</span>`}</td>
          <td>${a.other_schedules.length ? esc(a.other_schedules.join(", ")) : ""}</td>
          <td><form method="post" action="/admin/members/${a.id}/remove?s=${sc.id}" onsubmit="return confirm('Remove ${esc(a.first_name)} from ${esc(sc.name)}?')">
            <input type="hidden" name="return_to" value="${esc(back)}"><button class="x" type="submit" aria-label="Remove from ${esc(sc.name)}">×</button></form></td>
        </tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">${group ? "No one in this filter." : `No ${esc(L.participant.many.toLowerCase())} yet. Add them below.`}</p>`}
      ${members.length ? `<form id="bulk" method="post" action="/admin/members/bulk-tag?s=${sc.id}" class="bulk-tag">
        <input type="hidden" name="return_to" value="${esc(back)}">
        <span class="label-like">Checked people:</span>
        ${groups.length ? `<select name="group" aria-label="${esc(L.group.one)}"><option value="">No ${esc(L.group.one.toLowerCase())}</option>${groups.map((g) => `<option>${esc(g)}</option>`).join("")}</select>
          <button class="btn-ghost" type="submit" name="mode" value="group">Set ${esc(L.group.one.toLowerCase())}</button>` : ""}
        ${tags.length ? `<select name="tag" aria-label="Tag">${tags.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
          <button class="btn-ghost" type="submit" name="mode" value="add">Add tag</button><button class="btn-ghost" type="submit" name="mode" value="remove">Remove tag</button>` : ""}
        <button class="btn-ghost danger" type="submit" name="mode" value="off" onclick="return confirm('Remove the checked people from ${esc(sc.name).replace(/'/g, "")}? They stay in People and keep their sign-ups.')">Remove from board</button>
      </form>` : ""}
      ${tags.length ? "" : `<p class="fine">Need tags like Catcher or Pitcher? Add them in the ${esc(L.group.many)} &amp; tags step.</p>`}
    </section>
    ${cardTeams}
    </div>

    </div>
    ${ADD_PEOPLE_JS}`,
  });
}

// ---------- import from a spreadsheet ----------
const ADD_PEOPLE_JS = `<script>
(function () {
  document.querySelectorAll(".ap-tab").forEach(function (t) { t.addEventListener("click", function () {
    document.querySelectorAll(".ap-tab").forEach(function (x) { var on = x === t; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); });
    document.querySelectorAll(".ap-pane").forEach(function (p) { p.hidden = p.dataset.ap !== t.dataset.ap; });
  }); });
  var qa = document.querySelector(".qa");
  if (qa) { function kind() { var ad = qa.querySelector("input[name=kind][value=adult]").checked;
      qa.querySelectorAll(".qa-adult").forEach(function (x) { x.hidden = !ad; }); qa.querySelectorAll(".qa-ath").forEach(function (x) { x.hidden = ad; }); }
    qa.addEventListener("change", function (e) { if (e.target.name === "kind") kind(); }); kind(); }
  var q = document.querySelector(".ap-search");
  function filt() {
    var v = q ? q.value.toLowerCase() : "", f = {};
    document.querySelectorAll(".ap-f").forEach(function (s) { if (s.value) f[s.dataset.f] = s.value; });
    document.querySelectorAll(".ap-person").forEach(function (o) {
      var ok = (!v || o.textContent.toLowerCase().indexOf(v) >= 0);
      for (var k in f) if (k === "lists" ? ("|" + o.dataset.lists + "|").indexOf("|" + f[k] + "|") < 0 : o.dataset[k] !== f[k]) ok = false;
      o.hidden = !ok; });
  }
  if (q) q.addEventListener("input", filt);
  document.querySelectorAll(".ap-f").forEach(function (s) { s.addEventListener("change", filt); });
  var all = document.querySelector(".ap-all");
  if (all) all.addEventListener("click", function () { document.querySelectorAll(".ap-person").forEach(function (o) { if (!o.hidden) o.querySelector("input").checked = true; });
    var fx = document.querySelector(".ap-existing"); if (fx) fx.dispatchEvent(new Event("change")); });
  var f = document.querySelector(".ap-existing");
  if (f) { f.addEventListener("change", function () { var n = f.querySelectorAll("input[name=athlete_id]:checked").length;
      f.querySelector(".ap-count").textContent = n ? n + " checked" : "Check everyone to add."; });
    f.addEventListener("submit", function (e) { if (!f.querySelector("input[name=athlete_id]:checked")) { e.preventDefault(); f.querySelector(".ap-count").textContent = "Check at least one person."; } }); }
})();
</script>`;

function importPage({ user, flash, sc }) {
  const L = SC.labels(sc);
  return page({ title: `Import ${L.participant.many.toLowerCase()} · ${sc.name}`, tab: "members", user, flash,
    body: `<div class="page-top"><h1 class="page-title">${esc(sc.name)} <span class="h-sub">Import ${esc(L.participant.many.toLowerCase())}</span></h1>
      <a class="btn-ghost" href="/admin/members?s=${sc.id}">← Back to ${esc(L.participant.many.toLowerCase())}</a></div>
    <section class="panel">
      <h2>Step 1: Your spreadsheet</h2>
      <p class="fine">Use a <b>CSV file</b> (like a SportsEngine roster export, or any spreadsheet saved as CSV), or copy the rows from Excel or Google Sheets and paste them below.
        The first row should be the column names. Nothing is saved until you check the preview.</p>
      <form method="post" action="/admin/members/import/preview?s=${sc.id}" class="stack" id="imp-form">
        <label class="field-l">Choose a CSV file<input type="file" accept=".csv,text/csv,.txt" id="imp-file"></label>
        <label class="field-l"><span>…or paste the rows here</span><textarea name="data" id="imp-data" rows="10" required
          placeholder="First Name,Last Name,Team,Parent Email&#10;Ava,Smith,12U,jane@example.com&#10;Mia,Klein,14U,tom@example.com"></textarea></label>
        <div class="q-actions"><button class="btn-small" type="submit">Preview</button></div>
      </form>
      <p class="ex">e.g. columns we recognize: First Name, Last Name (or one Name column), Team / Group / Age Group, Tags / Position, and any column with "email" in it.</p>
    </section>
    <script>
      document.getElementById("imp-file").addEventListener("change", function () {
        var f = this.files && this.files[0]; if (!f) return;
        var r = new FileReader(); r.onload = function () { document.getElementById("imp-data").value = r.result; }; r.readAsText(f);
      });
    </script>` });
}

function importPreview({ user, flash, sc, headers, map, data, people, newGroups, newTags }) {
  const L = SC.labels(sc);
  const col = (k, label, multiple = false) => `<label class="field-l"><span>${label}</span>
    <select name="col_${k}"${multiple ? ` multiple size="${Math.min(5, headers.length + 1)}"` : ""} onchange="this.form.submit()">
      ${multiple ? "" : `<option value="-1">— Not in my file —</option>`}
      ${headers.map((h, i) => `<option value="${i}"${(multiple ? map[k].includes(i) : map[k] === i) ? " selected" : ""}>${esc(h || `Column ${i + 1}`)}</option>`).join("")}</select></label>`;
  const count = (st) => people.filter((p) => p.status === st).length;
  const label = { new: ["New", "ok"], existing: ["Already in the app", "info"], here: ["Already on this board", "info"], skip: ["Skipped: no name", "warn"] };
  return page({ title: `Import ${L.participant.many.toLowerCase()} · ${sc.name}`, tab: "members", user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">${esc(sc.name)} <span class="h-sub">Import ${esc(L.participant.many.toLowerCase())}</span></h1>
      <a class="btn-ghost" href="/admin/members/import?s=${sc.id}">← Start over</a></div>
    <form method="post" action="/admin/members/import/preview?s=${sc.id}" class="panel imp-map">
      <input type="hidden" name="data" value="${esc(data)}"><input type="hidden" name="mapped" value="1">
      <h2>Step 2: Match the columns</h2>
      <p class="fine">These were guessed from your column names. Change any that are wrong, and the preview updates.</p>
      <div class="imp-grid">
        ${col("first", "First name")}${col("last", "Last name")}${col("name", "Or one full-name column")}
        ${col("group", `${esc(L.group.one)} on this board`)}${col("tags", "Tags <span class=\"opt\">(comma-separated)</span>")}
        ${col("cteam", "Current team <span class=\"opt\">(for People)</span>")}
        <fieldset class="field-l imp-emails"><span>Parent / contact emails <span class="opt">(check all that apply)</span></span>
          ${headers.map((h, i) => `<label class="radio-row"><input type="checkbox" name="col_emails" value="${i}"${map.emails.includes(i) ? " checked" : ""} onchange="this.form.submit()"> ${esc(h || `Column ${i + 1}`)}</label>`).join("")}
          <input type="hidden" name="col_emails" value="-1"></fieldset>
      </div>
    </form>
    <form method="post" action="/admin/members/import/commit?s=${sc.id}" class="panel">
      <input type="hidden" name="data" value="${esc(data)}"><input type="hidden" name="mapped" value="1">
      ${["first", "last", "name", "group", "tags", "cteam", "se"].map((k) => `<input type="hidden" name="col_${k}" value="${map[k]}">`).join("")}
      ${map.emails.map((i) => `<input type="hidden" name="col_emails" value="${i}">`).join("")}
      <h2>Step 3: Check and import</h2>
      <p class="imp-sum"><b>${people.length}</b> rows · <b>${count("new")}</b> new · <b>${count("existing")}</b> already in the app (they'll be linked, not duplicated) · <b>${count("here")}</b> already on this board (updated) · <b>${count("skip")}</b> skipped</p>
      ${newGroups.length ? `<label class="radio-row imp-new"><input type="checkbox" name="add_groups" value="1" checked> Add ${newGroups.length} new ${esc((newGroups.length === 1 ? L.group.one : L.group.many).toLowerCase())} from the file: <b>${esc(newGroups.join(", "))}</b>
        <span class="fine">(unchecked: those people are added without a ${esc(L.group.one.toLowerCase())})</span></label>` : ""}
      ${newTags.length ? `<label class="radio-row imp-new"><input type="checkbox" name="add_tags" value="1" checked> Add ${newTags.length} new tag${newTags.length === 1 ? "" : "s"}: <b>${esc(newTags.join(", "))}</b></label>` : ""}
      <div class="table-wrap"><table class="imp-table"><thead><tr><th></th><th>Name</th><th>${esc(L.group.one)}</th><th>Tags</th><th>Parent emails</th></tr></thead><tbody>
        ${people.map((p) => `<tr class="st-${p.status}"><td><span class="pill ${label[p.status][1]}">${label[p.status][0]}</span></td>
          <td>${esc(`${p.first} ${p.last}`.trim()) || "<span class='fine'>(blank)</span>"}</td>
          <td>${p.group ? (p.groupMatch ? esc(p.groupMatch) : `${esc(p.group)} <span class="fine">(new)</span>`) : "<span class='fine'>—</span>"}</td>
          <td>${esc((p.tagMatch || p.tags).join(", ")) || "<span class='fine'>—</span>"}</td>
          <td class="fine">${esc(p.emails.join(", ")) || "—"}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="q-actions"><button class="btn-small" type="submit"${count("new") + count("existing") + count("here") ? "" : " disabled"}>Import ${count("new") + count("existing") + count("here")} ${esc(L.participant.many.toLowerCase())}</button>
        <a class="btn-ghost" href="/admin/members?s=${sc.id}">Cancel</a></div>
    </form>` });
}

module.exports = {
  importPage,
  importPreview, membersPage, groupSelect };
