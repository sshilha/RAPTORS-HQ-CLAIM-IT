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
  if (SCm.restricts(sc)) return `<p class="fine page-help">Give people their ${g} and tags here. Anyone signed in can still claim things that aren't limited; limited ones need the matching ${g} or tag.</p>`;
  return `<p class="fine page-help"><b>Not in use on this board.</b> It's open to ${SCm.claimMode(sc) === "public" ? "anyone with the link" : "anyone signed in"}, so people just claim spots. <a href="/admin/setup/schedule?s=${sc.id}">Back to settings</a></p>`;
}

function membersPage({ user, flash, sc, members, others, group, total, teams = "" }) {
  const L = SC.labels(sc);
  const groups = SC.groupsFor(sc);
  const tags = sc.tags || [];
  const back = `/admin/members?s=${sc.id}${group ? `&g=${encodeURIComponent(group)}` : ""}`;
  return page({
    title: `${sc.name} ${L.group.many}, tags & ${L.participant.many.toLowerCase()}`, tab: "members", user, flash,
    body: `<div class="page-top"><h1 class="page-title">${esc(sc.name)} <span class="h-sub">${esc(L.group.many)}, tags &amp; ${esc(L.participant.many.toLowerCase())}</span></h1>
      <a class="btn-ghost" href="/admin/setup?s=${sc.id}">← Back to ${esc(sc.name)}</a></div>
    ${teams}
    <section class="panel" id="people">
      <div class="athlete-head"><div><h2>${esc(L.participant.many)}</h2>
        <p class="muted tight">${total} on ${esc(sc.name)}</p></div>
        <span class="head-btns"><a class="btn-ghost" href="/admin/members/import?s=${sc.id}">⇪ Import from a spreadsheet</a></span></div>
      ${needBanner(sc, L)}
      <div class="add-people" id="add">
        <div class="ap-tabs" role="tablist">
          <button type="button" role="tab" class="ap-tab on" data-ap="new" aria-selected="true">New ${esc(L.participant.one.toLowerCase())}</button>
          <button type="button" role="tab" class="ap-tab" data-ap="existing" aria-selected="false">Someone already in the app${others.length ? ` (${others.length})` : ""}</button>
        </div>
        <form method="post" action="/admin/members?s=${sc.id}" class="grid-form ap-pane" data-ap="new">
          <div><label>First name<input name="first_name" required maxlength="40"></label></div>
          <div><label>Last name<input name="last_name" required maxlength="40"></label></div>
          <div><label>${esc(L.group.one)}${groupSelect(sc, null)}</label></div>
          <div class="full"><span class="field-lbl">Tags</span>
            ${(sc.tags || []).length ? `<div class="tag-checks">${sc.tags.map((t) => `<label class="tag-box"><input type="checkbox" name="tags" value="${esc(t)}"> ${esc(t)}</label>`).join("")}</div>`
              : `<span class="fine">No tags yet. Add tags like Catcher or Pitcher in ${esc(L.group.many)} &amp; tags above, then they'll show here.</span>`}</div>
          <div class="full"><label>Parent or contact emails<input name="parent_emails" placeholder="e.g. mom@example.com, dad@example.com"></label>
            <span class="fine">They sign in with these to claim spots. For an adult signing up themselves, use their own email.</span></div>
          <div class="full ap-actions"><button class="btn-small" type="submit">Add ${esc(L.participant.one.toLowerCase())}</button></div>
        </form>
        <div class="ap-pane" data-ap="existing" hidden>
          <p class="fine">People already in the app, from other boards, public sign-ups, or parents who added themselves. Adding them links the same person (with their parents and history) instead of making a duplicate.</p>
          ${others.length ? `<input type="search" class="ap-search" placeholder="Type to find someone…" aria-label="Find someone">` : ""}
          ${others.length ? `<form method="post" action="/admin/members/add?s=${sc.id}" class="stack ap-existing">
          <div class="ap-list">${others.map((a) => `<label class="ap-person"><input type="checkbox" name="athlete_id" value="${a.id}"> ${esc(a.last_name)}, ${esc(a.first_name)}${a.self_user_id ? ` <span class="fine">(adult)</span>` : ""}</label>`).join("")}</div>
          <span class="fine ap-count">Check everyone to add.</span>
          <label>${esc(L.group.one)}${groupSelect(sc, null)}</label>
          <div class="ap-actions"><button class="btn-small" type="submit">Add to ${esc(sc.name)}</button></div>
        </form>` : `<p class="muted">Everyone in the app is already on ${esc(sc.name)}.</p>`}
      
        </div>
      </div>
      <h3 class="ilist-head">Your ${esc(L.participant.many.toLowerCase())} <span class="fine-inline">(${total})</span></h3>
      ${groups.length ? `<nav class="chip-filter" aria-label="Filter by ${esc(L.group.one.toLowerCase())}">
        <a href="/admin/members?s=${sc.id}"${!group ? ' aria-current="page"' : ""}>All</a>
        ${groups.map((g) => `<a href="/admin/members?s=${sc.id}&g=${encodeURIComponent(g)}"${group === g ? ' aria-current="page"' : ""}>${esc(g)}</a>`).join("")}
        <a href="/admin/members?s=${sc.id}&g=none"${group === "none" ? ' aria-current="page"' : ""}>No ${esc(L.group.one.toLowerCase())}</a>
        ${(sc.tags || []).map((t) => `<a class="tag-filter" href="/admin/members?s=${sc.id}&g=${encodeURIComponent("tag:" + t)}"${group === "tag:" + t ? ' aria-current="page"' : ""}>🏷 ${esc(t)}</a>`).join("")}</nav>` : ""}
      ${members.length ? `<div class="table-wrap"><table>
        <thead><tr>${tags.length ? `<th><input type="checkbox" aria-label="Select all" onclick="document.querySelectorAll('.pick').forEach(c=>c.checked=this.checked)"></th>` : ""}<th>${esc(L.participant.one)}</th><th>${esc(L.group.one)}</th>${tags.length ? "<th>Tags</th>" : ""}<th>Emails</th><th>Also in</th><th></th></tr></thead>
        <tbody>${members.map((a) => `<tr>
          ${tags.length ? `<td><input type="checkbox" class="pick" name="athlete_id" value="${a.id}" form="bulk" aria-label="Select ${esc(a.first_name)}"></td>` : ""}
          <td><a href="/admin/athletes/${a.id}">${esc(a.last_name)}, ${esc(a.first_name)}</a>${a.self_user_id ? ` <span class="fine-inline">adult</span>` : ""}</td>
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
      ${tags.length && members.length ? `<form id="bulk" method="post" action="/admin/members/bulk-tag?s=${sc.id}" class="bulk-tag">
        <input type="hidden" name="return_to" value="${esc(back)}">
        <span class="label-like">Checked people:</span>
        <select name="tag" required aria-label="Tag">${tags.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
        <button class="btn-ghost" type="submit" name="mode" value="add">Add tag</button>
        <button class="btn-ghost" type="submit" name="mode" value="remove">Remove tag</button>
      </form>` : ""}
      ${tags.length ? "" : `<p class="fine">Need tags like Catcher or Pitcher? Add them in the ${esc(L.group.many)} &amp; tags step.</p>`}
    </section>

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
  var q = document.querySelector(".ap-search");
  if (q) q.addEventListener("input", function () { var v = q.value.toLowerCase();
    document.querySelectorAll(".ap-person").forEach(function (o) { o.hidden = !!v && o.textContent.toLowerCase().indexOf(v) < 0; }); });
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
        ${col("group", `${esc(L.group.one)}`)}${col("tags", "Tags <span class=\"opt\">(comma-separated)</span>")}
        <fieldset class="field-l imp-emails"><span>Parent / contact emails <span class="opt">(check all that apply)</span></span>
          ${headers.map((h, i) => `<label class="radio-row"><input type="checkbox" name="col_emails" value="${i}"${map.emails.includes(i) ? " checked" : ""} onchange="this.form.submit()"> ${esc(h || `Column ${i + 1}`)}</label>`).join("")}
          <input type="hidden" name="col_emails" value="-1"></fieldset>
      </div>
    </form>
    <form method="post" action="/admin/members/import/commit?s=${sc.id}" class="panel">
      <input type="hidden" name="data" value="${esc(data)}"><input type="hidden" name="mapped" value="1">
      ${["first", "last", "name", "group", "tags"].map((k) => `<input type="hidden" name="col_${k}" value="${map[k]}">`).join("")}
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
