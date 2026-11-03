// People import: the review pop-up. Shows every row with what will happen; edit, untick, resolve matches, re-check, import.
(function () {
  var rows = window.IMP_ROWS || [], kind = window.IMP_KIND || "athlete", dlg = document.getElementById("imp-dlg"), tb = document.getElementById("imp-tb");
  var filter = "all", open = {}, dirty = false;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var ST = { new: ["New", "ok"], update: ["Update", "info"], same: ["Up to date", "plain"], match: ["Possible match", "warn"], problem: ["Problem", "bad"] };
  function needsLook(r) { return r.status === "match" || r.status === "problem" || (r.warnings && r.warnings.length); }
  function shown(r) { return filter === "all" || (filter === "attn" ? needsLook(r) : filter === "out" ? !r.include : r.status === filter); }
  function countOf(f) { return rows.filter(function (r) { return f === "all" || (f === "attn" ? needsLook(r) : f === "out" ? !r.include : r.status === f); }).length; }
  function details(r) {
    var bits = [r.birth, r.team, r.jersey ? "#" + r.jersey : "", r.email, r.phone].filter(Boolean).map(esc);
    var ps = (r.parents || []).map(function (p) { var n = [p.first, p.last].filter(Boolean).join(" ");
      return "<div class='imp-p1'>" + (n ? esc(n) + (p.email ? " · <span class='imp-em'>" + esc(p.email) + "</span>" : "") : "<span class='imp-em'>" + esc(p.email) + "</span>") + "</div>"; });
    return (bits.length ? bits.join(" · ") : "<span class='fine'>—</span>") + (ps.length ? "<div class='imp-ps'><span class='imp-lbl'>Parents/guardians</span>" + ps.join("") + "</div>" : "") + (r.lists ? "<div class='imp-ps'><span class='imp-lbl'>Lists</span> " + esc(String(r.lists).split(/[;|]+/).map(function (x) { return x.trim(); }).filter(Boolean).join(", ")) + "</div>" : "");
  }
  function happens(r) {
    var out = (r.messages || []).map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + (r.warnings || []).map(function (m) { return "<li class='w'>" + esc(m) + "</li>"; }).join("");
    if (r.status === "match" || (r.candidates && r.candidates.length)) {
      out += "<li class='imp-pick'><select data-choice='" + r.i + "'><option value=''>Choose who this is…</option>" + r.candidates.map(function (c) {
        return "<option value='" + c.id + "'" + (String(r.choice) === String(c.id) ? " selected" : "") + ">Same person as " + esc(c.label) + "</option>"; }).join("") +
        "<option value='new'" + (r.choice === "new" ? " selected" : "") + ">Someone new: add them</option></select></li>";
    }
    return "<ul class='imp-msgs'>" + out + "</ul>";
  }
  function field(r, k, label, type) { return "<label>" + label + "<input data-f='" + k + "' data-r='" + r.i + "' value='" + esc(r[k]) + "'" + (type ? " type='" + type + "'" : "") + "></label>"; }
  function editor(r) {
    var h = "<div class='imp-ed'>" + field(r, "first", "First name") + field(r, "last", "Last name") +
      (kind === "mixed" ? "<label>Type<select data-f='kind' data-r='" + r.i + "'><option value='athlete'" + (r.kind === "athlete" ? " selected" : "") + ">Athlete</option><option value='adult'" + (r.kind === "adult" ? " selected" : "") + ">Adult</option></select></label>" : "") +
      field(r, "birth", "Birth year") + field(r, "team", "Team") + field(r, "jersey", "Jersey #") + field(r, "email", r.kind === "athlete" ? "Own email" : "Email") + field(r, "phone", "Phone") +
      field(r, "lists", "Lists (separate with ;)") + field(r, "notes", "Notes") + (r.kind === "adult" ? "<label>Roles<input data-f='roles' data-r='" + r.i + "' value='" + esc((r.roles || []).join(", ")) + "' placeholder='coach, volunteer'></label>" : "") + "</div>";
    if (r.kind === "athlete") {
      h += "<div class='imp-ed-ps'>" + (r.parents || []).map(function (p, n) {
        return "<div class='imp-ed-p'><b>Parent/guardian " + (n + 1) + "</b>" + ["first", "last", "email", "phone"].map(function (k) {
          return "<input data-pf='" + k + "' data-pn='" + n + "' data-r='" + r.i + "' value='" + esc(p[k]) + "' placeholder='" + { first: "First", last: "Last", email: "Email", phone: "Phone" }[k] + "'>"; }).join("") +
          "<button type='button' class='x' data-prm='" + n + "' data-r='" + r.i + "' aria-label='Remove parent/guardian'>×</button></div>"; }).join("") +
        ((r.parents || []).length < 4 ? "<button type='button' class='link-dark' data-padd='" + r.i + "'>+ Add a parent/guardian</button>" : "") + "</div>";
    }
    return h;
  }
  function render() {
    document.getElementById("imp-filt").innerHTML = [["all", "All"], ["new", "New"], ["update", "Updates"], ["attn", "Needs attention"], ["out", "Left out"]].map(function (f) {
      return "<a href='#' data-filt='" + f[0] + "'" + (filter === f[0] ? " aria-current='true'" : "") + ">" + f[1] + " <i>" + countOf(f[0]) + "</i></a>"; }).join("");
    tb.innerHTML = rows.filter(shown).map(function (r) {
      var st = ST[r.status] || ["", ""];
      return "<tr class='imp-r st-" + r.status + (r.include ? "" : " out") + "'>" +
        "<td><input type='checkbox' data-inc='" + r.i + "'" + (r.include ? " checked" : "") + (r.status === "problem" ? " disabled title='Fix the problem first'" : "") + " aria-label='Include'></td>" +
        "<td><span class='st-pill " + st[1] + "'>" + st[0] + "</span>" + (kind === "mixed" ? "<div class='fine'>" + (r.kind === "athlete" ? "Athlete" : "Adult") + "</div>" : "") + "</td>" +
        "<td><b>" + (esc([r.first, r.last].filter(Boolean).join(" ")) || "<span class='fine'>(no name)</span>") + "</b><div class='fine'>Row " + (r.i + 2) + "</div></td>" +
        "<td class='imp-det'>" + details(r) + "</td><td>" + happens(r) + "</td>" +
        "<td><button type='button' class='sb-btn imp-edit' data-edit='" + r.i + "'>" + (open[r.i] ? "Done" : "Edit") + "</button></td></tr>" +
        (open[r.i] ? "<tr class='imp-edrow'><td></td><td colspan='5'>" + editor(r) + "</td></tr>" : "");
    }).join("") || "<tr><td colspan='6' class='fine' style='padding:18px'>Nothing here.</td></tr>";
    bar();
  }
  function bar() {
    var inc = rows.filter(function (r) { return r.include; }), unres = inc.filter(function (r) { return r.status === "match"; }).length;
    var go = document.getElementById("imp-go"), rc = document.getElementById("imp-recheck");
    go.disabled = !inc.length || unres > 0;
    go.textContent = dirty ? "Re-check, then import" : unres ? "Choose " + unres + " possible match" + (unres === 1 ? "" : "es") + " first" : "Import " + inc.length + (inc.length === 1 ? " person" : " people");
    if (dirty) go.disabled = false;
    rc.classList.toggle("primary", dirty); rc.textContent = dirty ? "Re-check changes" : "Re-check";
    document.getElementById("imp-all").checked = inc.length && inc.length === rows.filter(function (r) { return r.status !== "problem"; }).length;
  }
  function byI(i) { return rows.filter(function (r) { return String(r.i) === String(i); })[0]; }
  function recheck(then) {
    var rc = document.getElementById("imp-recheck"); rc.disabled = true; rc.textContent = "Checking…";
    fetch("/admin/people/import/check", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ rows: JSON.stringify(rows) }) })
      .then(function (r) { return r.json(); }).then(function (j) { rows = j.rows; dirty = false; rc.disabled = false; render(); if (then) then(); })
      .catch(function () { rc.disabled = false; alert("Couldn't check your changes. Try again."); render(); });
  }
  dlg.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.filt) { e.preventDefault(); filter = t.dataset.filt || t.closest("[data-filt]").dataset.filt; render(); return; }
    var f = t.closest && t.closest("[data-filt]"); if (f) { e.preventDefault(); filter = f.dataset.filt; render(); return; }
    if (t.dataset.edit != null) { open[t.dataset.edit] = !open[t.dataset.edit]; render(); return; }
    if (t.dataset.padd != null) { var r = byI(t.dataset.padd); r.parents = r.parents || []; r.parents.push({ first: "", last: "", email: "", phone: "" }); dirty = true; render(); return; }
    if (t.dataset.prm != null) { var r2 = byI(t.dataset.r); r2.parents.splice(+t.dataset.prm, 1); dirty = true; render(); return; }
  });
  dlg.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.inc != null) { byI(t.dataset.inc).include = t.checked; render(); return; }
    if (t.id === "imp-all") { rows.forEach(function (r) { if (r.status !== "problem") r.include = t.checked; }); render(); return; }
    if (t.dataset.choice != null) { byI(t.dataset.choice).choice = t.value; dirty = true; recheck(); return; }
    if (t.dataset.f) { var r = byI(t.dataset.r); r[t.dataset.f] = t.dataset.f === "roles" ? t.value.split(/[,;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean) : t.value; dirty = true; if (t.dataset.f === "kind") render(); else bar(); return; }
    if (t.dataset.pf) { byI(t.dataset.r).parents[+t.dataset.pn][t.dataset.pf] = t.value; dirty = true; bar(); return; }
  });
  document.getElementById("imp-recheck").addEventListener("click", function () { recheck(); });
  document.getElementById("imp-commit").addEventListener("submit", function (e) {
    if (dirty) { e.preventDefault(); recheck(); return; }
    document.getElementById("imp-rows").value = JSON.stringify(rows);
  });
  function show() { render(); if (dlg.showModal) dlg.showModal(); }
  document.getElementById("imp-open").addEventListener("click", show);
  document.getElementById("imp-x").addEventListener("click", function () { dlg.close(); });
  document.getElementById("imp-back").addEventListener("click", function () { dlg.close(); });
  if (window.IMP_OPEN) show();
})();
