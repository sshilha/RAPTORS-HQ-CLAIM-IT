// Export / import screens: moving a board or a level between copies of the app (e.g. staging → production)
const { page } = require("./admin");
const { esc } = require("./layout");
const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// step 1: choose the file (read in the browser and sent as text)
function importPage({ user, flash, level = null }) {
  const back = level ? `/admin/setup?s=${level.sc.id}${level.parentId ? `&n=${level.parentId}` : ""}` : "/admin/settings";
  const title = level ? `Import a level into ${level.parentName || level.sc.name}` : "Import a board";
  return page({ title, tab: "home", user, flash, wide: true, noBack: true,
    body: `<nav class="back-row"><a class="back-btn" href="${back}">${ARROW}${level ? "Back to Setup" : "All Boards"}</a></nav>
    <section class="bh2 cp-hd"><div class="bh2-l"><div><div class="bh2-t"><h1>${esc(title)}</h1></div>
      <span class="bh2-meta">${level ? "Adds a level exported from another copy of Claim It (with its levels and sessions) here." : "Creates a new board from a board exported from another copy of Claim It (for example, staging)."}</span></div></div></section>
    <nav class="bh2-tabs dash-tabs cp-gbar"><span class="cp-has"><b>Step 1 of 2</b> · choose the export file (it ends in <b>.claimit.json</b>)</span></nav>
    <section class="sub-body no-subs cp-sheet"><form method="post" action="${level ? `/admin/b/${level.sc.id}/import-level/preview` : "/admin/setup/import/preview"}" class="stack" id="tx-form">
      ${level ? `<input type="hidden" name="parent" value="${level.parentId || ""}">` : ""}<input type="hidden" name="data" id="tx-data">
      <label class="tx-drop" id="tx-drop"><input type="file" accept=".json,application/json" id="tx-file"><span><b>Choose the file</b> or drop it here</span><span class="fine" id="tx-name">Nothing chosen yet</span></label>
      <p class="fine sd-err" id="tx-err" hidden></p>
      <div class="q-actions"><a class="btn-ghost" href="${back}">Cancel</a><button class="btn-small" type="submit" id="tx-go" disabled>Next: check what it contains</button></div></form>
      <script>(function () { var f = document.getElementById("tx-file"), d = document.getElementById("tx-data"), go = document.getElementById("tx-go"), nm = document.getElementById("tx-name"), err = document.getElementById("tx-err"), drop = document.getElementById("tx-drop");
        function take(file) { if (!file) return; nm.textContent = file.name; err.hidden = true; var r = new FileReader();
          r.onload = function () { try { var j = JSON.parse(r.result); if (j.format !== "claimit-transfer") throw 0; d.value = r.result; go.disabled = false; } catch (e) { err.textContent = "That isn't an export file from Claim It."; err.hidden = false; go.disabled = true; } };
          r.readAsText(file); }
        f.addEventListener("change", function () { take(f.files[0]); });
        drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); }); drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
        drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer.files[0]); }); })();</script></section>` });
}
// step 2: what's in the file, the choices, and Create
function previewPage({ user, flash, p, data, level = null }) {
  const back = level ? `/admin/setup?s=${level.sc.id}${level.parentId ? `&n=${level.parentId}` : ""}` : "/admin/settings";
  const when = p.exported_at ? new Date(p.exported_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const has = [plural(p.levels, "level", "levels"), plural(p.sessions, "session", "sessions"), p.people ? plural(p.people.total, "person", "people") : "", p.coaches ? plural(p.coaches, "coach", "coaches") : ""].filter(Boolean);
  return page({ title: level ? "Import a level" : "Import a board", tab: "home", user, flash, wide: true, noBack: true,
    body: `<nav class="back-row"><a class="back-btn" href="${back}">${ARROW}${level ? "Back to Setup" : "All Boards"}</a></nav>
    <section class="bh2 cp-hd"><div class="bh2-l"><div><div class="bh2-t"><h1>${level ? "Import" : "Import"} ${esc(p.name || "")}</h1></div>
      <span class="bh2-meta">Exported${p.from ? ` from ${esc(p.from)}` : ""}${when ? ` on ${esc(when)}` : ""}</span></div></div></section>
    <nav class="bh2-tabs dash-tabs cp-gbar"><span class="cp-has"><b>Step 2 of 2 · The file has:</b> ${has.join(" · ")}</span></nav>
    <section class="sub-body no-subs cp-sheet">
    ${p.problem ? `<div class="tx-warn"><b>This level can't go here.</b> ${esc(p.problem)}</div><div class="q-actions"><a class="btn-ghost" href="${back}">Back</a></div>` : `
    <form method="post" action="${level ? `/admin/b/${level.sc.id}/import-level` : "/admin/setup/import"}" class="stack copy-form">
      <textarea name="data" hidden>${esc(data)}</textarea>${level ? `<input type="hidden" name="parent" value="${level.parentId || ""}">` : ""}
      ${level ? `<p>Adds <b>${esc(p.name)}</b> into <b>${esc(level.parentName || level.sc.name)}</b>, with ${plural(p.levels, "level", "levels")} and ${plural(p.sessions, "session", "sessions")}.</p>` : `
      <label>Name of the new board<input name="name" required maxlength="80" value="${esc(p.name || "")}"></label>
      <p class="q-label">What comes along</p>
      <label class="mode-opt on"><input type="checkbox" checked disabled><span><b>Setup, levels and sessions</b><span class="fine">${plural(p.levels, "level", "levels")} with all their settings, and ${plural(p.sessions, "session", "sessions")} with their dates, times, spots and places. Board details, look, wording, Board defaults and Notifications too.</span></span></label>
      ${p.people ? `<label class="mode-opt on"><input type="checkbox" name="people" value="1" checked><span><b>People on the board</b><span class="fine">${p.people.found} of ${p.people.total} found in People here (by email, or name and birth year), with their groups and tags.${p.people.missing.length ? ` Not found: ${esc(p.people.missing.slice(0, 12).join(", "))}${p.people.missing.length > 12 ? ` and ${p.people.missing.length - 12} more` : ""}. Import them into People first (People → Export there, Import here), then add them on the board.` : ""}</span></span></label>` : ""}
      ${p.coaches ? `<label class="mode-opt on"><input type="checkbox" name="coaches" value="1" checked><span><b>Coaches</b><span class="fine">${plural(p.coaches, "coach", "coaches")} who take${p.coaches === 1 ? "s" : ""} attendance (by email).</span></span></label>` : ""}
      <p class="fine">Claims and check-ins never come along. The new board starts unpublished, so you can check it before families see it.</p>`}
      <div class="q-actions"><a class="btn-ghost" href="${back}">Cancel</a><button class="btn-small" type="submit">${level ? "Import the level" : "Create the board"}</button></div></form>`}</section>` });
}
module.exports = { importPage, previewPage };
