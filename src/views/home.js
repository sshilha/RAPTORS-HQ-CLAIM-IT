const { esc } = require("./layout");
const { page } = require("./admin");
const { LABELS } = require("../config");
const SC = require("../schedules");
const { niceRange } = require("./rounds");

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "What the board is": name, event, note for people, organizer, structure. Opened from the card.
function editDialog(sc) {
  const P = require("../locations");
  const S = require("./setup");
  const v = (x) => esc(x == null ? "" : String(x).slice(0, 10));
  return `<dialog class="edit-dlg" id="edit-${sc.id}" aria-labelledby="edit-${sc.id}-t">
    <form method="post" action="/admin/setup/schedules/${sc.id}?s=${sc.id}" class="dlg-form">
      <input type="hidden" name="return_to" value="/admin/settings">
      <div class="dlg-head"><h2 id="edit-${sc.id}-t">Edit ${esc(sc.name)}</h2>
        <button type="button" class="dlg-x" aria-label="Close" onclick="this.closest('dialog').close()">×</button></div>
      <div class="dlg-body">
        <h3>The basics</h3>
        <label class="field-l">Name<input name="name" required maxlength="60" value="${esc(sc.name)}"></label>
        <div class="field-row">
          <label class="field-l"><span>Event date <span class="opt">(optional)</span></span><input type="date" name="event_date" value="${v(sc.event_date)}"></label>
          <label class="field-l"><span>End date <span class="opt">(if more than one day)</span></span><input type="date" name="event_end" value="${v(sc.event_end)}"></label>
        </div>
        <label class="field-l"><span>Main location <span class="opt">(optional)</span></span>${require("../locations").picker("event_location", sc.event_location)}
          <span class="fine">Areas and items can have their own location too, like the concession stand. Set those on the board.</span></label>
        <label class="field-l"><span>Description <span class="opt">(optional, shown to people at the top of the board)</span></span>
          <textarea name="description" rows="3" maxlength="600" placeholder="e.g. Drop donations at the concession stand by 7:30 AM Saturday.">${esc(sc.description || "")}</textarea></label>
        <h3>Board type</h3>
        ${S.boardTypeField(sc)}
        <h3>Picture</h3>
        ${S.imagePicker(sc)}
        <h3>Organizer <span class="opt">(optional)</span></h3>
        <p class="fine">Shown to people with the board and in confirmation emails, so they know who to ask.</p>
        <div class="field-row">
          <label class="field-l">Name<input name="contact_name" maxlength="60" value="${esc(sc.contact_name || "")}" placeholder="e.g. Jane Smith"></label>
          <label class="field-l">Email or phone<input name="contact_info" maxlength="80" value="${esc(sc.contact_info || "")}" placeholder="e.g. jane@example.com"></label>
        </div>
        <h3>Structure</h3>
        <p class="fine">How the board is organized, and what things are called. Rename anything here (e.g. Items → Donations).</p>
        ${S.levelsTable(sc, !sc.empty, sc.level_counts || [])}
      </div>
      <script>document.currentScript.closest("form").addEventListener("change", function (e) {
        if (e.target.name === "dated") { var v = this.querySelector(".dlg-views"); if (v) v.hidden = e.target.value !== "yes"; } });</script>
      <div class="q-actions dlg-actions"><button class="btn-small" type="submit">Save</button><button type="button" class="btn-ghost" onclick="this.closest('form').reset(); this.closest('dialog').close()">Cancel</button></div>
    </form>
  </dialog>`;
}

function card(sc, archived) {
  const L = SC.labels(sc);
  const low = (x) => x.toLowerCase();
  const n = esc(LABELS.schedule.toLowerCase());
  return `<div class="sched-card${archived ? " is-archived" : ""}">
    <a class="sc-main" href="/admin/setup?s=${sc.id}">
      <div class="sc-head"><span class="sc-name">${esc(sc.name)}</span>
        ${archived ? `<span class="pill">Archived</span>` : sc.live ? `<span class="pill ok">Live</span>` : `<span class="pill">Not live</span>`}</div>
      <div class="sc-levels">${SC.levelKeys(sc).map((k) => esc(L[k].many)).join(" › ")}</div>
      <div class="sc-stats">
        ${SC.depthOf(sc) >= 3 ? `<span><b>${sc.sheets}</b> ${esc(low(sc.sheets === 1 ? L.middle.one : L.middle.many))}</span>` : `<span><b>${sc.items}</b> ${esc(low(sc.items === 1 ? L.slot.one : L.slot.many))}</span>`}
        <span><b>${sc.members}</b> ${esc(low(sc.members === 1 ? L.participant.one : L.participant.many))}</span>
        ${SC.depthOf(sc) > 1 ? `<span><b>${sc.activities}</b> ${esc(low(sc.activities === 1 ? L.activity.one : L.activity.many))}</span>` : ""}
        ${archived ? "" : `<span><b>${sc.claimed}</b> upcoming spot${sc.claimed === 1 ? "" : "s"} claimed</span>`}
      </div>
      ${archived ? `<div class="sc-next">Archived ${esc(new Date(sc.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</div>`
        : sc.next ? `<div class="sc-next">Next: ${esc(sc.next)}</div>` : ""}
    </a>
    <div class="sc-actions">
      <a class="btn-small" href="/admin/setup?s=${sc.id}">${archived ? "View" : "Open"}</a>

      <a class="btn-ghost" href="/admin/setup/schedules/${sc.id}/copy">Duplicate</a>
      <form method="post" action="/admin/setup/schedules/${sc.id}/archive?s=${sc.id}"
        ${archived ? "" : `onsubmit="return confirm('Archive ${esc(sc.name)}? People won\'t see anything in it. Nothing is deleted, and you can reopen it any time.')"`}>
        <input type="hidden" name="return_to" value="${archived ? "/admin/settings/archived" : "/admin/settings"}">
        <button class="btn-ghost" type="submit">${archived ? "Reopen" : "Archive"}</button></form>
      ${archived ? `<button type="button" class="btn-ghost danger" onclick="document.getElementById('del-${sc.id}').showModal()">Delete permanently</button>
        <dialog class="edit-dlg del-dlg" id="del-${sc.id}"><form method="post" action="/admin/setup/schedules/${sc.id}/delete?s=${sc.id}" class="stack">
          <div class="dlg-head"><h2>Delete ${esc(sc.name)} for good?</h2><button type="button" class="dlg-x" onclick="this.closest('dialog').close()">×</button></div>
          <p><b>This can't be undone.</b> Deleting removes:</p>
          <ul class="del-list"><li>${sc.containers} level${sc.containers === 1 ? "" : "s"} and ${sc.items} session${sc.items === 1 ? "" : "s"}</li>
            <li><b>${sc.all_claims}</b> claim${sc.all_claims === 1 ? "" : "s"}, including past ones and attendance (they'll be gone from Reports)</li>
            <li>The board's list of ${sc.members} ${sc.members === 1 ? "person" : "people"}, its coaches, and its public link</li></ul>
          <p class="fine">What stays: everyone in <b>People</b>, their accounts, and your other boards. If you might want this board's history later, keep it archived instead.</p>
          <label>Type <b>${esc(sc.name)}</b> to confirm<input name="confirm" autocomplete="off" required data-match="${esc(sc.name)}"></label>
          <div class="q-actions"><button type="button" class="btn-ghost" onclick="this.closest('dialog').close()">Keep it</button>
            <button class="btn-small del-go" type="submit" disabled>Delete permanently</button></div>
        </form></dialog>` : ""}
    </div>
    ${archived ? "" : editDialog(sc)}
  </div>`;
}

// ---------- Claim Board Dashboard ----------
const DSVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const DI = {
  board: DSVG('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M8.5 15l2.5 2.5 4.5-5"/>'),
  layers: DSVG('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'), cal: DSVG('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>'),
  calok: DSVG('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M8.5 15.5l2.3 2.3 4.7-4.6"/>'),
  people: DSVG('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.4.2 4 1.9 4.5 5"/>'),
  ok: DSVG('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>'), pen: DSVG('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  arch: DSVG('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>'), search: DSVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  open: DSVG('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'), copy: DSVG('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/>'),
  plus: DSVG('<path d="M12 5v14M5 12h14"/>'), train: DSVG('<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>'),
};
function dashCard(sc) {
  const L = SC.labels(sc), depth = SC.depthOf(sc), archived = !!sc.archived_at, status = archived ? "arch" : sc.published_at ? "pub" : "draft";
  const type = require("./setup").boardTypeOf(sc);
  const word = (n, w) => esc((n === 1 ? w.one : w.many));
  // the board's own top level, its people (the assigned list, or who has signed up on open boards), and its sessions
  const top = L[SC.levelKeys(sc)[0]], ppl = SC.claimMode(sc) === "roster" ? sc.members : sc.signups;
  const stats = [depth > 1 ? [sc.sheets, word(sc.sheets, top)] : [sc.items, word(sc.items, L.slot)], [ppl, word(ppl, L.participant)],
    depth > 1 ? [sc.items, word(sc.items, L.slot)] : [sc.claimed, "Upcoming claims"]];
  const img = sc.image ? `/img/board/${sc.id}?v=${sc.image_at ? new Date(sc.image_at).getTime() : 0}` : "";
  return `<article class="bc" data-status="${status}" data-name="${esc(sc.name.toLowerCase())}" data-next="${sc.next_at ? new Date(sc.next_at).getTime() : ""}" data-id="${sc.id}">
    <a class="bc-head${img ? " has-img" : ""}" href="/admin/setup?s=${sc.id}" aria-label="Open ${esc(sc.name)}">
      ${img ? `<span class="bc-img" style="background-image:url('${img}')"></span>` : `<span class="bc-code">${esc(require("./setup").codeOf(sc))}</span>`}
      <span class="bc-shade"></span>
      <span class="bc-top"><span class="bc-type">${type === "volunteer" ? DI.people : DI.train}${type === "volunteer" ? "Volunteer" : "Program"}</span>
        <span class="bc-st ${status}">${status === "pub" ? `${DI.ok}Published` : status === "draft" ? `${DI.pen}Draft` : `${DI.arch}Archived`}</span></span>
      <span class="bc-title" title="${esc(sc.name)}">${esc(sc.name)}</span>
      <span class="bc-levels">${SC.levelKeys(sc).map((k) => esc(L[k].many)).join(" › ")}</span>
    </a>
    <div class="bc-body">
      <div class="bc-stats">${stats.map(([n, l]) => `<span><b>${n}</b><small>${l}</small></span>`).join("")}</div>
      <div class="bc-next">${DI.cal}${archived ? `<span>Archived ${esc(new Date(sc.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</span>`
        : sc.next ? `<span>Next: <b>${esc(sc.next)}</b></span>${sc.claimed ? `<span class="bc-pill" title="${sc.claimed} upcoming spot${sc.claimed === 1 ? "" : "s"} claimed">${sc.claimed} claimed</span>` : ""}` : `<span class="muted">No upcoming ${esc(L.slot.many.toLowerCase())}</span>`}</div>
      <div class="bc-acts">
        <a class="bc-btn primary" href="/admin/setup?s=${sc.id}">${DI.open}${archived ? "View" : "Open"}</a>
        <a class="bc-btn" href="/admin/setup/schedules/${sc.id}/copy">${DI.copy}Duplicate</a>
        <form method="post" action="/admin/setup/schedules/${sc.id}/archive?s=${sc.id}"${archived ? "" : ` onsubmit="return confirm('Archive ${esc(sc.name).replace(/'/g, "")}? People won\'t see anything in it. Nothing is deleted, and you can reopen it any time.')"`}>
          <input type="hidden" name="return_to" value="${archived ? "/admin/settings?tab=arch" : "/admin/settings"}"><button class="bc-btn" type="submit">${DI.arch}${archived ? "Reopen" : "Archive"}</button></form>
        ${archived ? `<button type="button" class="bc-btn danger" onclick="document.getElementById('del-${sc.id}').showModal()">Delete permanently</button>
          <dialog class="edit-dlg del-dlg" id="del-${sc.id}"><form method="post" action="/admin/setup/schedules/${sc.id}/delete?s=${sc.id}" class="stack">
            <div class="dlg-head"><h2>Delete ${esc(sc.name)} for good?</h2><button type="button" class="dlg-x" onclick="this.closest('dialog').close()">×</button></div>
            <p><b>This can't be undone.</b> Deleting removes:</p>
            <ul class="del-list"><li>${sc.containers} level${sc.containers === 1 ? "" : "s"} and ${sc.items} session${sc.items === 1 ? "" : "s"}</li>
              <li><b>${sc.all_claims}</b> claim${sc.all_claims === 1 ? "" : "s"}, including past ones and attendance (they'll be gone from Reports)</li>
              <li>The board's list of ${sc.members} ${sc.members === 1 ? "person" : "people"}, its coaches, and its public link</li></ul>
            <p class="fine">What stays: everyone in <b>People</b>, their accounts, and your other boards. If you might want this board's history later, keep it archived instead.</p>
            <label>Type <b>${esc(sc.name)}</b> to confirm<input name="confirm" autocomplete="off" required data-match="${esc(sc.name)}"></label>
            <div class="q-actions"><button type="button" class="btn-ghost" onclick="this.closest('dialog').close()">Keep it</button>
              <button class="btn-small del-go" type="submit" disabled>Delete permanently</button></div></form></dialog>` : ""}
      </div>
    </div>
  </article>`;
}
function dashboardPage({ user, flash, rows, metrics, tab = "" }) {
  const n = { all: rows.filter((r) => !r.archived_at).length, pub: rows.filter((r) => !r.archived_at && r.published_at).length,
    draft: rows.filter((r) => !r.archived_at && !r.published_at).length, arch: rows.filter((r) => r.archived_at).length };
  const start = ["pub", "draft", "arch"].includes(tab) ? tab : "all";
  const tabBtn = (k, label, ic) => `<button type="button" class="dt-tab${start === k ? " on" : ""}" data-tab="${k}">${ic}${label} <i>(${n[k]})</i></button>`;
  const metric = (ic, v, label) => `<div class="dm"><span class="dm-ic">${ic}</span><span><b>${v}</b><small>${label}</small></span></div>`;
  return page({ title: "Claim Board Dashboard", tab: "home", user, flash, xwide: true,
    body: `<section class="bh2">
      <div class="bh2-l"><span class="bh2-tile dash-tile">${DI.board}</span>
        <div><div class="bh2-t"><h1>Claim Board Dashboard</h1></div><span class="bh2-meta">${metrics.active} active board${metrics.active === 1 ? "" : "s"} · ${metrics.upcoming} upcoming claim${metrics.upcoming === 1 ? "" : "s"} · ${metrics.volunteers} volunteer${metrics.volunteers === 1 ? "" : "s"} signed up</span></div></div>
      <div class="bh2-acts"><a class="sb-btn primary" href="/admin/setup/new">${DI.plus}Create Board</a></div></section>
    <nav class="bh2-tabs dash-tabs" role="tablist">${tabBtn("all", "All Boards", DI.layers)}${tabBtn("pub", "Published", DI.ok)}${tabBtn("draft", "Draft", DI.pen)}${tabBtn("arch", "Archived", DI.arch)}
      <span class="dash-tools"><label class="dt-search">${DI.search}<input type="search" placeholder="Search boards…" aria-label="Search boards"></label>
        <label class="dt-sort"><span>Sort by</span><select aria-label="Sort boards"><option value="name">Name (A–Z)</option><option value="name-d">Name (Z–A)</option>
          <option value="next">Next date (soonest)</option><option value="status">Status</option><option value="new">Newest first</option></select></label></span></nav>
    <h2 class="dlist-h">Active Claim Boards</h2>
    <div class="bc-grid">${rows.map(dashCard).join("")}</div>
    <p class="d-none" hidden></p>
    ${require("./setup").IMAGE_JS}
    <script>(function () {
      var m = /^#edit-(\\d+)$/.exec(location.hash); if (m) { location.replace("/admin/setup?s=" + m[1] + "&details=1"); return; }
      document.querySelectorAll("[data-match]").forEach(function (i) { var b = i.form.querySelector(".del-go");
        i.addEventListener("input", function () { b.disabled = i.value.trim().replace(/\\s+/g, " ").toLowerCase() !== i.dataset.match.trim().toLowerCase(); }); });
      // tabs, search, sort: all on this page, no reloading
      var tab = ${JSON.stringify(start)}, grid = document.querySelector(".bc-grid"), cards = [].slice.call(grid.children), q = document.querySelector(".dt-search input"), sort = document.querySelector(".dt-sort select");
      var TITLES = { all: "Active Claim Boards", pub: "Published Claim Boards", draft: "Draft Claim Boards", arch: "Archived Claim Boards" }, ORDER = { pub: 0, draft: 1, arch: 2 };
      try { sort.value = localStorage.getItem("dash-sort") || "name"; } catch (e) {}
      function apply() {
        var v = q.value.trim().toLowerCase(), shown = 0;
        cards.forEach(function (c) { var st = c.dataset.status, ok = (tab === "all" ? st !== "arch" : st === tab) && (!v || c.dataset.name.indexOf(v) >= 0); c.hidden = !ok; if (ok) shown++; });
        var s = sort.value; cards.slice().sort(function (a, b) {
          if (s === "name-d") return b.dataset.name.localeCompare(a.dataset.name);
          if (s === "next") return (+a.dataset.next || 9e15) - (+b.dataset.next || 9e15) || a.dataset.name.localeCompare(b.dataset.name);
          if (s === "status") return ORDER[a.dataset.status] - ORDER[b.dataset.status] || a.dataset.name.localeCompare(b.dataset.name);
          if (s === "new") return +b.dataset.id - +a.dataset.id;
          return a.dataset.name.localeCompare(b.dataset.name); }).forEach(function (c) { grid.appendChild(c); });
        document.querySelector(".dlist-h").textContent = TITLES[tab];
        var none = document.querySelector(".d-none"); none.hidden = shown > 0; none.textContent = v ? "No boards match \u201c" + q.value.trim() + "\u201d." : { all: "No active boards yet. Create one to get started.", pub: "Nothing published yet.", draft: "No drafts.", arch: "Nothing archived." }[tab];
      }
      document.querySelectorAll(".dt-tab").forEach(function (b) { b.addEventListener("click", function () { tab = b.dataset.tab;
        document.querySelectorAll(".dt-tab").forEach(function (x) { x.classList.toggle("on", x === b); }); history.replaceState(null, "", tab === "all" ? "/admin/settings" : "/admin/settings?tab=" + tab); apply(); }); });
      q.addEventListener("input", apply); sort.addEventListener("change", function () { try { localStorage.setItem("dash-sort", sort.value); } catch (e) {} apply(); });
      apply();
    })();</script>` });
}

function homePage({ user, flash, active, archivedCount }) {
  return page({
    title: "All Boards", tab: "home", user, flash,
    body: `<section class="panel home-head">
      <div class="hh-line"><h1>All Boards</h1>
        <p class="muted tight">Pick a ${esc(LABELS.schedule.toLowerCase())} to set up its calendar, groups, activities, and people, or start a new one.</p></div>
      <div class="head-actions">
        <a class="btn-small" href="/admin/setup/new">+ New ${esc(LABELS.schedule.toLowerCase())}</a>
      </div>
    </section>
    <h2 class="list-title">Active ${esc(LABELS.schedules.toLowerCase())}</h2>
    ${active.length ? `<div class="sched-grid">${active.map((x) => card(x, false)).join("")}</div>`
      : `<section class="panel"><div class="empty"><p>No active ${esc(LABELS.schedules.toLowerCase())}.</p><p class="muted"><a href="/admin/setup/new">Create one</a> to get started.</p></div></section>`}
    <p class="archived-link"><a href="/admin/settings/archived">View archived ${esc(LABELS.schedules.toLowerCase())}${archivedCount ? ` (${archivedCount})` : ""}</a></p>
    ${require("../locations").datalist()}
    ${require("../locations").placeDialog()}
    ${require("./setup").IMAGE_JS}
    <script>(function () {
      var m = /^#edit-(\\d+)$/.exec(location.hash); var d = m && document.getElementById("edit-" + m[1]); if (!d || !d.showModal) return;
      // opened from a board's Setup (Board details tab): saving, Cancel, and × all go back to that Setup screen
      if (/[?&]from=setup/.test(location.search)) {
        var back = "/admin/setup?s=" + m[1], f = d.querySelector("form"), r = f && f.querySelector("[name=return_to]"), saving = false;
        if (r) r.value = back; if (f) f.addEventListener("submit", function () { saving = true; });
        d.addEventListener("close", function () { if (!saving) location.href = back; });
      }
      d.showModal();
    })();</script>`,
  });
}

function archivedPage({ user, flash, archived }) {
  return page({
    title: `Archived ${LABELS.schedules}`, tab: "home", user, flash,
    body: `<a class="back" href="/admin/settings">Settings</a>
    <section class="panel"><h1>Archived ${esc(LABELS.schedules.toLowerCase())}</h1>
      <p class="muted tight">People can't see these. Nothing in them was deleted. Reopen one to make it active again, duplicate it to start a new one, or delete it permanently.</p></section>
    ${archived.length ? `<div class="sched-grid">${archived.map((x) => card(x, true)).join("")}</div>`
      : `<section class="panel"><p class="muted">Nothing archived.</p></section>`}
    <script>document.querySelectorAll("[data-match]").forEach(function (i) { var b = i.form.querySelector(".del-go");
      i.addEventListener("input", function () { b.disabled = i.value.trim().replace(/\\s+/g, " ").toLowerCase() !== i.dataset.match.trim().toLowerCase(); }); });</script>`,
  });
}

// "Winter Training 2026–27" → "Winter Training 2027–28"; "2027 Arctic Rumble" → "2028 Arctic Rumble"
function nextName(name) {
  const bumped = name.replace(/(\d{4})(\s*[–-]\s*)(\d{2,4})/, (m, a, sep, b) => `${+a + 1}${sep}${b.length === 2 ? String((+b + 1) % 100).padStart(2, "0") : +b + 1}`);
  if (bumped !== name) return bumped;
  const one = name.replace(/\b(20\d{2})\b/, (m, y) => String(+y + 1));
  return one !== name ? one : `${name} (copy)`;
}

function copyPage({ user, flash, sc, counts }) {
  const L = SC.labels(sc);
  const n = LABELS.schedule.toLowerCase();
  return page({
    title: `Copy ${sc.name}`, tab: "home", user, flash,
    body: `<a class="back" href="/admin/settings">Settings</a>
    <section class="panel">
      <h1>Duplicate ${esc(sc.name)}</h1>
      <p class="lede">Make a new ${esc(n)} from this one. Its setup (name, levels, who can claim, views, and locations) always comes along. Pick what else to bring.</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/copy" class="stack copy-form">
        <label>Name of the new ${esc(n)}<input name="name" required maxlength="40" value="${esc(nextName(sc.name))}"></label>
        <fieldset class="checks stack-list"><legend>Bring along</legend>
          <label class="mode-opt"><input type="checkbox" name="activities" value="1" checked><span><b>${esc(L.activity.many)}</b><span class="fine">${counts.activities} with their colors, spots, limits, and other defaults</span></span></label>
          <label class="mode-opt"><input type="checkbox" name="groups" value="1" checked><span><b>${esc(L.group.many)} and shortcuts</b><span class="fine">${(sc.groups || []).length} ${esc(L.group.many.toLowerCase())}</span></span></label>
          <label class="mode-opt"><input type="checkbox" name="members" value="1"><span><b>${esc(L.participant.many)}</b><span class="fine">${counts.members} people, in the same ${esc(L.group.many.toLowerCase())} (if those come along)</span></span></label>
          <label class="mode-opt"><input type="checkbox" name="calendar" value="1" id="cal"><span><b>Calendar</b><span class="fine">${counts.rounds} ${esc((counts.rounds === 1 ? L.middle.one : L.middle.many).toLowerCase())} with their times and ${esc(L.activity.many.toLowerCase())}. Copies start as drafts, and no claims come along.</span></span></label>
        </fieldset>
        <label id="start-wrap">New first day (for the calendar)<input type="date" name="start_on" value="${esc(counts.first || "")}">
          <span class="fine">Everything shifts by the same number of days. Pick the same weekday as ${esc(counts.firstLabel || "the original")} to keep times on the same days.</span></label>
        <button class="btn" type="submit">Make the copy</button>
      </form>
    </section>
    <script>
      (function () { var c = document.getElementById("cal"), w = document.getElementById("start-wrap");
        function f() { w.style.display = c.checked ? "" : "none"; } c.addEventListener("change", f); f(); })();
    </script>`,
  });
}

module.exports = { editDialog, dashboardPage, homePage, archivedPage, copyPage };
