// People import screens: 1 the file · 2 match the columns (+ the review pop-up) · 3 the result
const { esc } = require("./layout");
const { page } = require("./admin");
const SVGI = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const KINDS = [["athlete", "Athletes", "Players, with their parents' or guardians' emails."], ["adult", "Adults", "Volunteers, coaches, or parents/guardians, each with their own email."],
  ["mixed", "Mixed", "Both, with a column that says which (like Type: Player / Coach)."]];
const steps = (n) => `<nav class="bh2-tabs dash-tabs wz-tabs" aria-label="Steps"><ol class="wz-progress">${["Your file", "Match the columns", "Review &amp; import"].map((l, i) =>
  `<li class="${i + 1 <= n ? "on" : ""}${i + 1 === n ? " now" : ""}${i + 1 < n ? " done" : ""}"><button type="button" disabled><span>${i + 1}</span>${l}</button></li>`).join("")}</ol></nav>`;
const top = (head, n) => `${head({ active: "people" })}<div class="sub-top"><a class="back-btn" href="/admin/people">← People</a><h2>Import people</h2></div>${steps(n)}`;

// ---------- 1: the file ----------
function step1Page({ user, flash, head }) {
  return page({ title: "Import people", tab: "people", user, flash, xwide: true,
    body: `${top(head, 1)}
    <form method="post" action="/admin/people/import/preview" class="panel imp1" id="imp-form">
      <p class="q-label">Who's in this file?</p>
      <div class="choice-row three">${KINDS.map(([k, t, d], i) => `<label class="choice"><input type="radio" name="kind" value="${k}"${i === 0 ? " checked" : ""}>
        <span class="choice-body"><b>${t}</b><span>${d}</span></span><span class="choice-check" aria-hidden="true">✓</span></label>`).join("")}</div>
      <p class="q-label">Your spreadsheet</p>
      <div class="imp-drop" id="imp-drop">${SVGI('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>')}
        <span><b>Choose a file</b> (CSV or Excel), or drop it here</span><input type="file" accept=".csv,.txt,.xlsx,.xls,text/csv" id="imp-file"><span class="fine" id="imp-fname"></span></div>
      <label class="field-l"><span>…or paste the rows here <span class="opt">(from Excel or Google Sheets; the first row is the column names)</span></span>
        <textarea name="data" id="imp-data" rows="7" required placeholder="First Name,Last Name,Birth Year,Team,Parent 1 First Name,Parent 1 Last Name,Parent 1 Email&#10;Ava,Smith,2014,12U Shilha,Jane,Smith,jane@example.com"></textarea></label>
      <p class="fine">Nothing is saved yet. Next you'll match the columns, then review everyone before anything is imported.</p>
      <div class="q-actions"><button class="sb-btn primary" type="submit">Continue</button></div>
    </form>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script>(function () {
      var inp = document.getElementById("imp-file"), out = document.getElementById("imp-data"), nm = document.getElementById("imp-fname"), drop = document.getElementById("imp-drop");
      function read(f) { if (!f) return; nm.textContent = f.name;
        if (/\\.xlsx?$/i.test(f.name)) { var r = new FileReader(); r.onload = function () {
            try { var wb = XLSX.read(new Uint8Array(r.result), { type: "array" }); out.value = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { blankrows: false }); }
            catch (e) { alert("That Excel file couldn't be read. Try saving it as CSV."); } }; r.readAsArrayBuffer(f); }
        else { var t = new FileReader(); t.onload = function () { out.value = t.result; }; t.readAsText(f); } }
      inp.addEventListener("change", function () { read(inp.files[0]); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); read(e.dataTransfer.files[0]); });
    })();</script>` });
}

// ---------- 2: match the columns + the review pop-up ----------
function mapPage({ user, flash, head, headers, map, kind, data, rows, counts, lists, remembered, openReview }) {
  const opts = (cur) => `<option value="-1">Not in my file</option>${headers.map((h, i) => `<option value="${i}"${cur === i ? " selected" : ""}>${esc(h || `Column ${i + 1}`)}</option>`).join("")}`;
  const sel = (k, label, cur) => `<label class="field-l"><span>${label}</span><select name="col_${k}" onchange="this.form.submit()">${opts(cur)}</select></label>`;
  const P = (n) => { const p = map.parents[n - 1]; return `<div class="imp-par"><b>Parent/guardian ${n}</b>${sel(`p${n}_first`, "First name", p.first)}${sel(`p${n}_last`, "Last name", p.last)}${sel(`p${n}_name`, "Or one name column", p.name)}${sel(`p${n}_email`, "Email", p.email)}${sel(`p${n}_phone`, "Phone", p.phone)}</div>`; };
  const kindTxt = { athlete: "Athletes", adult: "Adults", mixed: "Mixed" }[kind];
  return page({ title: "Import people", tab: "people", user, flash, xwide: true,
    body: `${top(head, 2)}
    <form method="post" action="/admin/people/import/preview" class="panel imp-map" id="imp-map">
      <input type="hidden" name="data" value="${esc(data)}"><input type="hidden" name="kind" value="${esc(kind)}"><input type="hidden" name="mapped" value="1">
      <div class="imp-map-top"><p class="fine">${remembered ? "<b>Matched the same way as your last file with these columns.</b> " : "Guessed from your column names. "}Change any that are wrong, and the counts update.
        <span class="imp-kind">File: <b>${kindTxt}</b> · <a href="/admin/people/import">change</a></span></p></div>
      <div class="imp-sect"><h3>The person</h3><div class="imp-grid">${sel("first", "First name", map.first)}${sel("last", "Last name", map.last)}${sel("name", "Or one full-name column", map.name)}
        ${kind === "mixed" ? sel("kind", "Type (athlete or adult)", map.kind) : ""}${sel("email", kind === "athlete" ? "Athlete's own email (optional)" : "Email", map.email)}${sel("phone", "Phone", map.phone)}</div></div>
      <div class="imp-sect"><h3>Details</h3><div class="imp-grid">${sel("birth", "Birth year or date of birth", map.birth)}${sel("jersey", "Jersey #", map.jersey)}${sel("team", "Current team", map.team)}
        ${sel("lists", "Make lists from this column <span class=\"opt\">(e.g. a program; several per person: separate with ;)</span>", map.lists)}${kind !== "athlete" ? sel("roles", "Roles (coach, volunteer…)", map.roles) : ""}${sel("notes", "Notes", map.notes)}</div></div>
      ${kind !== "adult" ? `<div class="imp-sect"><h3>Parents/guardians</h3><div class="imp-pars">${[1, 2, 3, 4].map(P).join("")}</div>
        <fieldset class="field-l imp-emails"><span>Other email columns, used as parent/guardian emails <span class="opt">(check any)</span></span>
          ${headers.map((h, i) => /e-?mail/i.test(h) ? `<label class="radio-row"><input type="checkbox" name="col_emails" value="${i}"${map.emails.includes(i) ? " checked" : ""} onchange="this.form.submit()"> ${esc(h)}</label>` : "").join("") || `<span class="fine">None</span>`}
          <input type="hidden" name="col_emails" value="-1"></fieldset></div>` : ""}
    </form>
    <section class="panel imp-ready">
      <p class="imp-sum"><b>${counts.all}</b> rows · <b>${counts.new}</b> new · <b>${counts.update}</b> updates · <b>${counts.same}</b> already up to date · ${counts.match ? `<b class="warn">${counts.match}</b> possible match${counts.match === 1 ? "" : "es"} · ` : ""}${counts.problem ? `<b class="bad">${counts.problem}</b> with problems` : "no problems"}</p>
      <button type="button" class="sb-btn primary" id="imp-open">Review &amp; import</button>
    </section>

    <dialog class="imp-dlg" id="imp-dlg">
      <form method="post" action="/admin/people/import/commit" id="imp-commit">
        <input type="hidden" name="rows" id="imp-rows"><input type="hidden" name="kind" value="${esc(kind)}">
        <input type="hidden" name="headers" value="${esc(JSON.stringify(headers))}"><input type="hidden" name="map" value="${esc(JSON.stringify(map))}">
        <div class="imp-dlg-h"><div><h2>Review before importing</h2><p class="fine">Nothing is saved until you press Import. Fix anything right here, or untick anyone you don't want.</p></div>
          <button type="button" class="dlg-x" id="imp-x" aria-label="Close">×</button></div>
        <div class="imp-dlg-bar"><nav class="imp-filt" id="imp-filt"></nav><button type="button" class="sb-btn" id="imp-recheck">Re-check changes</button></div>
        <div class="imp-dlg-body"><table class="imp-rt"><thead><tr><th><input type="checkbox" id="imp-all" aria-label="Include all"></th><th>Status</th><th>Name</th><th>Details</th><th>What happens</th><th></th></tr></thead><tbody id="imp-tb"></tbody></table></div>
        <div class="imp-dlg-f">
          <div class="imp-lists">
          <div class="field-l imp-tolist"><span>Put ${kind === "adult" ? "everyone imported" : kind === "mixed" ? "everyone imported (athletes and adults)" : "the athletes"} on lists <span class="opt">(optional; tick any, or name new ones)</span></span>
            <span class="imp-tolist-r">${lists.map((l) => `<label class="tag-box"><input type="checkbox" name="to_lists" value="${l.id}"> ${esc(l.name)}</label>`).join("")}
              <input name="new_lists" maxlength="200" placeholder="New lists, separated by commas (e.g. 2026 Athletes, 2026 Winter Training)"></span></div>
          ${kind !== "adult" ? `<div class="field-l imp-tolist"><span>Put their parents/guardians on lists <span class="opt">(optional; from the parent/guardian columns)</span></span>
            <span class="imp-tolist-r">${lists.map((l) => `<label class="tag-box"><input type="checkbox" name="p_lists" value="${l.id}"> ${esc(l.name)}</label>`).join("")}
              <input name="p_new_lists" maxlength="200" placeholder="New lists, separated by commas (e.g. 2026 Winter Parents/Guardians)"></span></div>` : ""}
          </div>
          <span class="imp-dlg-acts"><button type="button" class="btn-ghost" id="imp-back">Back to columns</button><button type="submit" class="sb-btn primary" id="imp-go">Import</button></span></div>
      </form>
    </dialog>
    <script>window.IMP_ROWS = ${JSON.stringify(rows).replace(/</g, "\\u003c")}; window.IMP_KIND = ${JSON.stringify(kind)}; window.IMP_OPEN = ${openReview ? "true" : "false"};</script>
    <script src="/import-review.js"></script>` });
}

// ---------- 3: the result ----------
function resultPage({ user, flash, head, b, invite, undoable }) {
  const s = b.summary || {};
  return page({ title: "Import done", tab: "people", user, flash, xwide: true,
    body: `${top(head, 3)}
    <section class="panel imp-done">
      <h2>${b.undone_at ? "This import was undone" : `Imported ${s.imported} ${s.imported === 1 ? "person" : "people"}`}</h2>
      <p class="imp-sum"><b>${s.added || 0}</b> added · <b>${s.updated || 0}</b> updated · <b>${s.parentsNew || 0}</b> new parent${s.parentsNew === 1 ? "" : "s"}/guardian${s.parentsNew === 1 ? "" : "s"} · <b>${s.left || 0}</b> left out${(s.lists || []).length ? ` · on ${(s.lists || []).map(esc).join(", ")}` : ""}${(s.pLists || []).length ? ` · parents/guardians on ${(s.pLists || []).map(esc).join(", ")}` : ""}</p>
      <div class="imp-done-acts">
        <a class="sb-btn" href="/admin/people?batch=${b.id}">View the people imported</a>
        ${!b.undone_at && invite ? `<form method="post" action="/admin/people/import/${b.id}/invite"><button class="sb-btn primary" type="submit">Invite the ${invite} new adult${invite === 1 ? "" : "s"}</button></form>` : ""}
        ${undoable ? `<form method="post" action="/admin/people/import/${b.id}/undo" onsubmit="return confirm('Undo this import? People it added are removed (unless they've been put on a board or claimed something since), and changed details go back.');"><button class="btn-ghost danger" type="submit">Undo this import</button></form>` : ""}
      </div>
      ${undoable ? `<p class="fine">You can undo this import for 24 hours.</p>` : ""}
      <p class="fine">Next: add them to a board from that board's <b>Access &amp; people → Add from People</b>.</p>
    </section>` });
}
module.exports = { step1Page, mapPage, resultPage };
