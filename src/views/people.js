// ⚙ App settings → People
const { esc } = require("./layout");
const { page } = require("./admin");
const PP = require("../people");

const ROLE = { parent: "Parent", coach: "Coach", volunteer: "Volunteer / outside" };
const chips = (list, cls = "chip-s") => (list || []).filter(Boolean).map((x) => `<span class="${cls}">${esc(x)}</span>`).join("");
const kindTag = (p) => p.kind === "adult"
  ? ((p.roles || []).length ? (p.roles || []).map((r) => `<span class="role-pill r-${r}">${ROLE[r] || r}</span>`).join("") : `<span class="role-pill">Adult</span>`)
  : `<span class="role-pill r-athlete">Athlete</span>`;

function fields(p, kind) {
  const v = (k) => esc(p[k] == null ? "" : p[k]);
  const common = `
    <div><label>First name<input name="first_name" required maxlength="40" value="${v("first_name")}"></label></div>
    <div><label>Last name<input name="last_name" required maxlength="40" value="${v("last_name")}"></label></div>
    <div><label><span>Current team <span class="opt">(optional)</span></span><input name="team" maxlength="40" value="${v("team")}" placeholder="e.g. 12U Shilha" list="dir-teams"></label></div>
    <div><label><span>SportsEngine group <span class="opt">(optional)</span></span><input name="se_group" maxlength="60" value="${v("se_group")}" placeholder="e.g. 2026 Travel Program" list="dir-groups"></label></div>`;
  const athlete = `
    <div><label><span>Birth year <span class="opt">(optional)</span></span><input type="number" name="birth_year" min="1950" max="2100" value="${v("birth_year")}" placeholder="e.g. 2014"></label></div>
    <div><label><span>Jersey # <span class="opt">(optional)</span></span><input name="jersey" maxlength="6" value="${v("jersey")}" placeholder="e.g. 12"></label></div>`;
  const adult = `
    <div><label><span>Email <span class="opt">(they sign in with it)</span></span><input type="email" name="email" maxlength="120" value="${v("email")}" placeholder="e.g. jane@example.com"></label></div>
    <div><label><span>Phone <span class="opt">(optional)</span></span><input name="phone" maxlength="30" value="${v("phone")}" placeholder="e.g. 715-555-0123"></label></div>
    <div class="full"><label><span>Organization <span class="opt">(optional, for outside participants)</span></span><input name="organization" maxlength="80" value="${v("organization")}" placeholder="e.g. Altoona Booster Club"></label></div>
    <div class="full"><span class="field-lbl">Roles</span><div class="tag-checks">${Object.entries(ROLE).map(([k, l]) => `<label class="tag-box"><input type="checkbox" name="roles" value="${k}"${(p.roles || []).includes(k) ? " checked" : ""}> ${l}</label>`).join("")}</div>
      <span class="fine">A person can have more than one, like a parent who's also a coach.</span></div>`;
  return common + (kind === "adult" ? adult : athlete) + `<div class="full"><label><span>Notes <span class="opt">(admins only)</span></span><textarea name="notes" rows="2" maxlength="1000">${v("notes")}</textarea></label></div>`;
}

function directoryPage({ user, flash, people, total, f, teams, groups, lists = [] }) {
  const cur = lists.find((l) => l.id === f.list);
  const qs = (extra) => `/admin/people?${new URLSearchParams(Object.fromEntries(Object.entries({ ...f, ...extra }).filter(([, x]) => x)))}`;
  const listBar = `<div class="list-bar" id="lists"><span class="field-lbl">Lists</span>
    <a class="lchip${f.list ? "" : " on"}" href="${qs({ list: "" })}">Everyone <span>${total}</span></a>
    ${lists.map((l) => `<a class="lchip${f.list === l.id ? " on" : ""}" href="${qs({ list: l.id })}">${esc(l.name)} <span>${l.n}</span></a>`).join("")}
    <details class="new-list"><summary class="lchip add">＋ New list</summary>
      <form method="post" action="/admin/people/lists" class="inline-add"><input name="name" required maxlength="60" placeholder="e.g. 2026 Season Athletes" aria-label="List name"><button class="btn-small" type="submit">Make list</button></form></details>
  </div>
  ${cur ? `<div class="list-head"><b>${esc(cur.name)}</b> <span class="fine">${cur.n} ${cur.n === 1 ? "person" : "people"}</span>
    <details class="list-manage"><summary class="link-dark">Rename or delete</summary><div class="lm-box">
      <form method="post" action="/admin/people/lists/${cur.id}" class="inline-add"><input name="name" value="${esc(cur.name)}" maxlength="60" required aria-label="List name"><button class="btn-ghost" type="submit">Rename</button></form>
      <form method="post" action="/admin/people/lists/${cur.id}/delete" onsubmit="return confirm('Delete the list ${esc(cur.name.replace(/'/g, ""))}? The people on it stay in People.')"><button class="link-dark danger-link" type="submit">Delete this list</button></form>
    </div></details></div>` : ""}`;
  const listOpts = (sel) => lists.map((l) => `<option value="${l.id}"${sel === l.id ? " selected" : ""}>${esc(l.name)}</option>`).join("");
  const bulk = `<form method="post" action="/admin/people/bulk" class="bulk-bar" id="bulk"><input type="hidden" name="list" value="${f.list || ""}">
    <span class="bulk-count">0 checked</span>
    <select name="action" aria-label="What to do"><option value="add">Add to list</option>${cur ? `<option value="move">Move from ${esc(cur.name)} to</option><option value="remove">Take off ${esc(cur.name)}</option>` : ""}</select>
    <select name="target" class="bulk-target" aria-label="List"><option value="">Pick a list…</option>${listOpts(0)}<option value="new">＋ New list…</option></select>
    <input name="new_name" class="bulk-new" maxlength="60" placeholder="New list name" hidden>
    <button class="btn-small" type="submit">Apply</button></form>`;
  const opt = (list, cur) => list.map((x) => `<option value="${esc(x)}"${cur === x ? " selected" : ""}>${esc(x)}</option>`).join("");
  const dl = `<datalist id="dir-teams">${opt(teams)}</datalist><datalist id="dir-groups">${opt(groups)}</datalist>`;
  return page({ title: "People", tab: "people", user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">People <span class="h-sub">${total} in the app</span></h1>
      <a class="btn-ghost" href="/admin/settings/app">← App settings</a></div>
    ${dl}
    <section class="panel">
      ${WHERE_NOTE}
      <p class="fine">Only admins can change these details; people can send a change request from My Claims.</p>
      <div class="head-btns"><details class="add-wrap"${total ? "" : " open"}><summary class="btn-small">＋ Add a person</summary>
      <div class="add-people" id="add">
        <div class="ap-tabs" role="tablist">
          <button type="button" class="ap-tab on" data-ap="athlete">New athlete</button><button type="button" class="ap-tab" data-ap="adult">New adult (parent, coach, volunteer)</button>
        </div>
        <form method="post" action="/admin/people" class="grid-form ap-pane" data-ap="athlete"><input type="hidden" name="kind" value="athlete">
          ${fields({}, "athlete")}
          <div class="full"><label><span>Parent emails <span class="opt">(optional; they're added as parents)</span></span><input name="parent_emails" placeholder="e.g. mom@example.com, dad@example.com"></label></div>
          <div class="full ap-actions"><button class="btn-small" type="submit">Add athlete</button></div></form>
        <form method="post" action="/admin/people" class="grid-form ap-pane" data-ap="adult" hidden><input type="hidden" name="kind" value="adult">
          ${fields({}, "adult")}
          <div class="full ap-actions"><button class="btn-small" type="submit">Add adult</button></div></form>
      </div></details><a class="btn-ghost imp-btn" href="/admin/people/import">⇪ Import from a spreadsheet</a></div>
      <form method="get" action="/admin/people" class="dir-filters"><input type="hidden" name="list" value="${f.list || ""}">
        <input type="search" name="q" value="${esc(f.q)}" placeholder="Search name, email, phone…" aria-label="Search">
        <select name="kind" aria-label="Kind"><option value="">Everyone</option><option value="athlete"${f.kind === "athlete" ? " selected" : ""}>Athletes</option><option value="adult"${f.kind === "adult" ? " selected" : ""}>Adults</option></select>
        <select name="role" aria-label="Role"><option value="">Any role</option>${Object.entries(ROLE).map(([k, l]) => `<option value="${k}"${f.role === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select name="team" aria-label="Current team"><option value="">Any team</option>${opt(teams, f.team)}</select>
        <select name="se" aria-label="SportsEngine group"><option value="">Any SportsEngine group</option>${opt(groups, f.se)}</select>
        <button class="btn-ghost" type="submit">Filter</button>${f.q || f.kind || f.role || f.team || f.se ? `<a class="link-dark" href="/admin/people">Clear</a>` : ""}
      </form>
      ${listBar}
      ${cur ? "" : `<h3 class="ilist-head">${people.length === total ? "Everyone" : "Matching"} <span class="fine-inline">(${people.length})</span></h3>`}
      ${people.length ? bulk : ""}
      ${people.length ? `<div class="table-wrap"><table class="dir-table"><thead><tr><th><input type="checkbox" class="check-all" aria-label="Check all shown" title="Check all shown"></th><th>Name</th><th>Kind</th><th>Current team</th><th>SportsEngine group</th><th>Contact</th><th>Family</th><th>Boards</th></tr></thead><tbody>
        ${people.map((p) => `<tr><td><input type="checkbox" name="ids" value="${p.id}" form="bulk" aria-label="Check ${esc(PP.display(p))}"></td><td><a href="/admin/people/${p.id}"><b>${esc(PP.display(p))}</b></a>${(p.list_ids || []).length ? `<div class="mini-lists">${lists.filter((l) => p.list_ids.includes(l.id)).map((l) => `<span>${esc(l.name)}</span>`).join("")}</div>` : ""}${p.jersey ? ` <span class="fine">#${esc(p.jersey)}</span>` : ""}</td>
          <td>${kindTag(p)}</td><td>${esc(p.team || "")}</td><td>${esc(p.se_group || "")}</td>
          <td><span class="fine">${[p.email, p.phone].filter(Boolean).map(esc).join("<br>")}</span></td>
          <td><span class="fine">${p.kind === "athlete" ? (p.parents.length ? `Parents: ${esc(p.parents.join(", "))}` : "") : (p.kids.length ? `Kids: ${esc(p.kids.join(", "))}` : "")}</span></td>
          <td>${chips(p.boards)}${p.coaching.length ? chips(p.coaching.map((c) => `Coach: ${c}`), "chip-s coach") : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">No one matches.</p>`}
    </section>
    <script>
      (function () {
        var bar = document.getElementById("bulk"); if (!bar) return;
        var boxes = function () { return document.querySelectorAll('input[name=ids][form=bulk]'); };
        function count() { var n = [].filter.call(boxes(), function (b) { return b.checked; }).length; bar.querySelector(".bulk-count").textContent = n + " checked"; bar.classList.toggle("has", n > 0); }
        document.addEventListener("change", function (e) { if (e.target.name === "ids") count(); });
        var all = document.querySelector(".check-all");
        if (all) all.addEventListener("change", function () { boxes().forEach(function (b) { b.checked = all.checked; }); count(); });
        var act = bar.querySelector("select[name=action]"), tgt = bar.querySelector(".bulk-target"), nw = bar.querySelector(".bulk-new");
        function sync() { tgt.hidden = act.value === "remove"; nw.hidden = tgt.hidden || tgt.value !== "new"; }
        act.addEventListener("change", sync); tgt.addEventListener("change", sync); sync();
      })();
      document.querySelectorAll(".ap-tab").forEach(function (t) { t.addEventListener("click", function () {
        document.querySelectorAll(".ap-tab").forEach(function (x) { x.classList.toggle("on", x === t); });
        document.querySelectorAll(".ap-pane").forEach(function (p) { p.hidden = p.dataset.ap !== t.dataset.ap; }); }); });
    </script>` });
}

function personPage({ user, flash, p, boards, claimedElsewhere, parents, kids, athletes, allBoards, coaching, mine = [], lists = [] }) {
  const name = PP.display(p);
  return page({ title: name, tab: "people", user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">${esc(name)} <span class="h-sub">${p.kind === "adult" ? "Adult" : "Athlete"}</span></h1>
      <a class="btn-ghost" href="/admin/people">← People</a></div>
    <div class="board-cols"><div class="bc-left">
      <section class="panel"><h2>Details</h2>
        <form method="post" action="/admin/people/${p.id}" class="grid-form">${fields(p, p.kind)}
          <div class="full q-actions"><button class="btn-small" type="submit">Save</button></div></form></section>
      <section class="panel" id="family"><h2>${p.kind === "athlete" ? "Parents / guardians" : "Kids"}</h2>
        ${p.kind === "athlete"
          ? `${parents.length ? `<ul class="fam-list">${parents.map((x) => `<li><span>${x.person_id ? `<a href="/admin/people/${x.person_id}">${esc(`${x.first_name || ""} ${x.last_name || ""}`.trim() || x.email)}</a>` : ""} <span class="fine">${esc(x.email)}${x.phone ? ` · ${esc(x.phone)}` : ""}</span></span>
              <form method="post" action="/admin/people/${p.id}/family/remove"><input type="hidden" name="user_id" value="${x.user_id}"><input type="hidden" name="athlete_id" value="${p.id}"><button class="x" type="submit" aria-label="Unlink">×</button></form></li>`).join("")}</ul>` : `<p class="muted small">No parents linked yet.</p>`}
            <form method="post" action="/admin/people/${p.id}/family" class="inline-add tag-add"><label>Add a parent by email<input type="email" name="email" required placeholder="e.g. jane@example.com"></label><button class="btn-small" type="submit">Link parent</button></form>
            <p class="fine">Parents sign in with their email and see this athlete under My Claims.</p>`
          : `${kids.length ? `<ul class="fam-list">${kids.map((k) => `<li><a href="/admin/people/${k.id}">${esc(PP.display(k))}</a>${k.team ? ` <span class="fine">${esc(k.team)}</span>` : ""}
              <form method="post" action="/admin/people/${p.id}/family/remove"><input type="hidden" name="user_id" value="${p.self_user_id}"><input type="hidden" name="athlete_id" value="${k.id}"><button class="x" type="submit" aria-label="Unlink">×</button></form></li>`).join("")}</ul>` : `<p class="muted small">No kids linked.</p>`}
            <form method="post" action="/admin/people/${p.id}/family" class="inline-add tag-add"><label>Link an athlete<select name="athlete_id" required><option value="">Pick an athlete…</option>
              ${athletes.filter((a) => !kids.some((k) => k.id === a.id)).map((a) => `<option value="${a.id}">${esc(a.last_name)}, ${esc(a.first_name)}${a.team ? ` (${esc(a.team)})` : ""}</option>`).join("")}</select></label>
              <button class="btn-small" type="submit">Link</button></form>`}
      </section>
    </div>
    <aside class="bc-side">
      <section class="panel side-card" id="lists"><h2>Lists</h2>
        ${mine.length ? `<div class="chip-line">${mine.map((l) => `<form method="post" action="/admin/people/${p.id}/lists" class="lchip-f"><input type="hidden" name="remove" value="${l.id}">
          <a class="lchip" href="/admin/people?list=${l.id}">${esc(l.name)}</a><button class="x" type="submit" aria-label="Take off ${esc(l.name)}">×</button></form>`).join("")}</div>` : `<p class="muted small">Not on any lists.</p>`}
        <form method="post" action="/admin/people/${p.id}/lists" class="inline-add"><select name="list" onchange="this.form.new_name.hidden = this.value !== 'new'" aria-label="Add to list"><option value="">Add to a list…</option>
          ${lists.filter((l) => !mine.some((m) => m.id === l.id)).map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}<option value="new">＋ New list…</option></select>
          <input name="new_name" maxlength="60" placeholder="New list name" hidden><button class="btn-ghost" type="submit">Add</button></form>
      </section>
      <section class="panel side-card"><h2>Boards</h2>
        ${boards.length ? `<dl class="rc-list">${boards.map((b) => `<div><dt><a href="/admin/setup?s=${b.id}">${esc(b.name)}</a>${b.archived_at ? ` <span class="fine">(archived)</span>` : ""}</dt>
          <dd>${esc([b.group_name, ...(b.tags || [])].filter(Boolean).join(" · ") || "On the list")}<span class="src">${b.claims} claim${b.claims === 1 ? "" : "s"}</span></dd></div>`).join("")}</dl>` : `<p class="muted small">Not on any board's list yet.</p>`}
        ${claimedElsewhere.length ? `<p class="fine">Also claimed on: ${claimedElsewhere.map((b) => `${esc(b.name)} (${b.claims})`).join(", ")}</p>` : ""}
      </section>
      ${p.kind === "adult" ? `<section class="panel side-card" id="coach"><h2>Coach</h2>
        <p class="fine">Boards this person takes attendance on. They sign in with ${p.email ? `<b>${esc(p.email)}</b>` : "their email (add one first)"} and see Check-in.</p>
        <form method="post" action="/admin/people/${p.id}/coaching" class="stack">
          ${allBoards.map((b) => `<label class="radio-row"><input type="checkbox" name="boards" value="${b.id}"${coaching.includes(b.id) ? " checked" : ""}${p.email ? "" : " disabled"}> ${esc(b.name)}</label>`).join("") || `<p class="muted small">No boards yet.</p>`}
          ${p.email && allBoards.length ? `<div class="q-actions"><button class="btn-small" type="submit">Save</button></div>` : ""}
        </form></section>` : ""}
      <section class="panel side-card"><h2>Remove</h2><p class="fine">Takes them out of the directory and board lists' pickers. Past claims stay in reports.</p>
        <form method="post" action="/admin/people/${p.id}/archive" onsubmit="return confirm('Remove ${esc(name.replace(/'/g, ""))} from the directory?')"><button class="link-dark danger-link" type="submit">Remove from People</button></form></section>
    </aside></div>` });
}

// The two ways to add people, explained (shown on People and on a board's people card)
const WHERE_NOTE = `<div class="where-note"><b>Two ways to add people</b>
  <span><b>Here in People:</b> everyone in the app. Add or import once, and they're available to add to any board, but they aren't on a board yet.</span>
  <span><b>On a board</b> (its Teams, tags &amp; people page): puts them on that board's list right away, and adds them to People too if they're new.</span>
  <span class="fine">Building next season's roster? Add or import here. Adding someone to one board right now? Do it on the board.</span></div>`;

function importPage({ user, flash }) {
  return page({ title: "Import people", tab: "people", user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">People <span class="h-sub">Import</span></h1><a class="btn-ghost" href="/admin/people">← People</a></div>
    <section class="panel"><h2>Step 1: Your spreadsheet</h2>
      <p class="fine">Use a <b>CSV file</b> (like a SportsEngine roster export) or paste rows from Excel or Google Sheets. The first row should be the column names.
        This adds people to the directory only. Add them to a board afterward from that board's <b>From People</b>.</p>
      <form method="post" action="/admin/people/import/preview" class="stack" id="imp-form">
        <label class="field-l">Choose a CSV file<input type="file" accept=".csv,text/csv,.txt" id="imp-file"></label>
        <label class="field-l"><span>…or paste the rows here</span><textarea name="data" id="imp-data" rows="10" required
          placeholder="First Name,Last Name,Team,SportsEngine Group,Parent 1 Email,Parent 2 Email&#10;Ava,Smith,12U Shilha,2026 Travel,jane@example.com,tom@example.com"></textarea></label>
        <div class="q-actions"><button class="btn-small" type="submit">Preview</button></div></form>
      <p class="ex">e.g. columns we recognize: First Name, Last Name (or one Name column), Team / Current Team, SportsEngine Group / Program, and any column with "email" in it (several parents are fine).</p>
    </section>
    <script>document.getElementById("imp-file").addEventListener("change", function () { var f = this.files && this.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { document.getElementById("imp-data").value = r.result; }; r.readAsText(f); });</script>` });
}

function importPreview({ user, flash, headers, map, data, people, lists = [] }) {
  const col = (k, label) => `<label class="field-l"><span>${label}</span><select name="col_${k}" onchange="this.form.submit()"><option value="-1">— Not in my file —</option>
      ${headers.map((h, i) => `<option value="${i}"${map[k] === i ? " selected" : ""}>${esc(h || `Column ${i + 1}`)}</option>`).join("")}</select></label>`;
  const count = (st) => people.filter((p) => p.status === st).length;
  const hidden = `<input type="hidden" name="data" value="${esc(data)}"><input type="hidden" name="mapped" value="1">`;
  return page({ title: "Import people", tab: "people", user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">People <span class="h-sub">Import</span></h1><a class="btn-ghost" href="/admin/people/import">← Start over</a></div>
    <form method="post" action="/admin/people/import/preview" class="panel imp-map">${hidden}
      <h2>Step 2: Match the columns</h2><p class="fine">Guessed from your column names. Change any that are wrong, and the preview updates.</p>
      <div class="imp-grid">${col("first", "First name")}${col("last", "Last name")}${col("name", "Or one full-name column")}
        ${col("cteam", "Current team")}${col("se", "SportsEngine group")}
        <fieldset class="field-l imp-emails"><span>Parent / contact emails <span class="opt">(check all that apply)</span></span>
          ${headers.map((h, i) => `<label class="radio-row"><input type="checkbox" name="col_emails" value="${i}"${map.emails.includes(i) ? " checked" : ""} onchange="this.form.submit()"> ${esc(h || `Column ${i + 1}`)}</label>`).join("")}
          <input type="hidden" name="col_emails" value="-1"></fieldset></div></form>
    <form method="post" action="/admin/people/import/commit" class="panel">${hidden}
      ${["first", "last", "name", "cteam", "se"].map((k) => `<input type="hidden" name="col_${k}" value="${map[k]}">`).join("")}${map.emails.map((i) => `<input type="hidden" name="col_emails" value="${i}">`).join("")}
      <h2>Step 3: Check and import</h2>
      <p class="imp-sum"><b>${people.length}</b> rows · <b>${count("new")}</b> new · <b>${count("existing")}</b> already in People (updated, not duplicated) · <b>${count("skip")}</b> skipped</p>
      <div class="table-wrap"><table class="imp-table"><thead><tr><th></th><th>Name</th><th>Current team</th><th>SportsEngine group</th><th>Parent emails</th></tr></thead><tbody>
        ${people.map((p) => `<tr class="st-${p.status}"><td><span class="pill ${{ new: "ok", existing: "info", skip: "warn" }[p.status]}">${{ new: "New", existing: "Already in People", skip: "Skipped: no name" }[p.status]}</span></td>
          <td>${esc(`${p.first} ${p.last}`.trim()) || "<span class='fine'>(blank)</span>"}</td><td>${esc(p.cteam || "") || "—"}</td><td>${esc(p.se || "") || "—"}</td>
          <td class="fine">${esc(p.emails.join(", ")) || "—"}</td></tr>`).join("")}</tbody></table></div>
      <div class="imp-list"><label class="field-l"><span>Put everyone in this file on a list <span class="opt">(optional)</span></span>
        <select name="to_list" onchange="this.form.new_list.hidden = this.value !== 'new'"><option value="">No list</option>${lists.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}<option value="new">＋ New list…</option></select></label>
        <input name="new_list" maxlength="60" placeholder="e.g. 2026 Season Athletes" hidden></div>
      <div class="q-actions"><button class="btn-small" type="submit"${count("new") + count("existing") ? "" : " disabled"}>Import ${count("new") + count("existing")} people</button>
        <a class="btn-ghost" href="/admin/people">Cancel</a></div></form>` });
}

module.exports = { directoryPage, personPage, importPage, importPreview, WHERE_NOTE };
