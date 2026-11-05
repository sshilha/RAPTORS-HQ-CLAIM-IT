// ⚙ App settings → People
const { esc } = require("./layout");
const { page } = require("./admin");
const PP = require("../people");

const ROLE = { parent: "Parent/guardian", coach: "Coach", volunteer: "Volunteer / outside" };
const chips = (list, cls = "chip-s") => (list || []).filter(Boolean).map((x) => `<span class="${cls}">${esc(x)}</span>`).join("");
const kindTag = (p) => p.kind === "adult"
  ? (() => { const rs = [...new Set([...((p.kids || []).length ? ["parent"] : []), ...(p.roles || [])])];
      return rs.length ? rs.map((r) => `<span class="role-pill r-${r}">${ROLE[r] || r}</span>`).join("") : `<span class="role-pill">Adult</span>`; })()
  : `<span class="role-pill r-athlete">Athlete</span>`;

function fields(p, kind) {
  const v = (k) => esc(p[k] == null ? "" : p[k]);
  const common = `
    <div><label>First name<input name="first_name" required maxlength="40" value="${v("first_name")}"></label></div>
    <div><label>Last name<input name="last_name" required maxlength="40" value="${v("last_name")}"></label></div>
    <div><label><span>Current team <span class="opt">(optional)</span></span><input name="team" maxlength="40" value="${v("team")}" placeholder="e.g. 12U Shilha" list="dir-teams"></label></div>`;
  const athlete = `
    <div><label><span>Birth year <span class="opt">(optional)</span></span><input type="number" name="birth_year" min="1950" max="2100" value="${v("birth_year")}" placeholder="e.g. 2014"></label></div>
    <div><label><span>Jersey # <span class="opt">(optional)</span></span><input name="jersey" maxlength="6" value="${v("jersey")}" placeholder="e.g. 12"></label></div>`;
  const adult = `
    <div><label><span>Email <span class="opt">(they sign in with it)</span></span><input type="email" name="email" maxlength="120" value="${v("email")}" placeholder="e.g. jane@example.com"></label></div>
    <div><label><span>Phone <span class="opt">(optional)</span></span><input name="phone" maxlength="30" value="${v("phone")}" placeholder="e.g. 715-555-0123"></label></div>
    <div class="full"><label><span>Organization <span class="opt">(optional, for outside participants)</span></span><input name="organization" maxlength="80" value="${v("organization")}" placeholder="e.g. Altoona Booster Club"></label></div>
    <div class="full"><span class="field-lbl">Roles</span><div class="tag-checks">${Object.entries(ROLE).map(([k, l]) => `<label class="tag-box"><input type="checkbox" name="roles" value="${k}"${(p.roles || []).includes(k) ? " checked" : ""}> ${l}</label>`).join("")}</div>
      <span class="fine">A person can have more than one, like a parent/guardian who's also a coach.</span></div>`;
  return common + (kind === "adult" ? adult : athlete) + `<div class="full"><label><span>Notes <span class="opt">(admins only)</span></span><textarea name="notes" rows="2" maxlength="1000">${v("notes")}</textarea></label></div>`;
}

const { fmtDateTime } = require("../time");
const shortDate = (t) => new Date(t).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
const TONE = { active: "ok", ready: "ok", invited: "info", notinvited: "plain", setup: "warn", noemail: "bad", noparent: "bad" };
const TIP = { active: "Has signed in", invited: "Invite sent, not used yet", notinvited: "Has an email but hasn't been invited", setup: "Will see the Welcome step at next sign-in",
  noemail: "No email, so they can't sign in", ready: "Has a parent/guardian who can claim for them", noparent: "No parent/guardian linked, so nobody can claim for them yet" };
function statusPill(p) {
  const k = PP.statusOf(p), d = k === "active" ? p.last_login_at : k === "invited" ? p.invited_at : null;
  return `<span class="st-pill ${TONE[k]}" title="${TIP[k]}">${PP.STATUS[k]}</span>${d ? `<span class="fine st-date">${shortDate(d)}</span>` : ""}`;
}
function directoryPage({ user, flash, people, total, f, teams, groups, lists = [], head = null, waiting = 0 }) {
  const cur = lists.find((l) => l.id === f.list);
  const qs = (extra) => `/admin/people?${new URLSearchParams(Object.fromEntries(Object.entries({ ...f, ...extra }).filter(([, x]) => x)))}`;
  const listBar = `  ${cur ? `<div class="list-head"><b>${esc(cur.name)}</b> <span class="fine">${cur.n} ${cur.n === 1 ? "person" : "people"}</span>
    <details class="list-manage"><summary class="link-dark">Rename or delete</summary><div class="lm-box">
      <form method="post" action="/admin/people/lists/${cur.id}" class="inline-add"><input name="name" value="${esc(cur.name)}" maxlength="60" required aria-label="List name"><button class="btn-ghost" type="submit">Rename</button></form>
      <form method="post" action="/admin/people/lists/${cur.id}/delete" onsubmit="return confirm('Delete the list ${esc(cur.name.replace(/'/g, ""))}? The people on it stay in People.')"><button class="link-dark danger-link" type="submit">Delete this list</button></form>
    </div></details></div>` : ""}`;
  const listOpts = (sel) => lists.map((l) => `<option value="${l.id}"${sel === l.id ? " selected" : ""}>${esc(l.name)}</option>`).join("");
  const bulk = `<form method="post" action="/admin/people/bulk" class="bulk-bar" id="bulk"><input type="hidden" name="list" value="${f.list || ""}">
    <span class="bulk-count">0 checked</span>
    <select name="action" aria-label="What to do"><option value="add">Add to list</option><option value="invite">Send invite (adults with an email)</option>${cur ? `<option value="move">Move from ${esc(cur.name)} to</option><option value="remove">Take off ${esc(cur.name)}</option>` : ""}</select>
    <select name="target" class="bulk-target" aria-label="List"><option value="">Pick a list…</option>${listOpts(0)}<option value="new">＋ New list…</option></select>
    <input name="new_name" class="bulk-new" maxlength="60" placeholder="New list name" hidden>
    <button class="btn-small" type="submit">Apply</button></form>`;
  const opt = (list, cur) => list.map((x) => `<option value="${esc(x)}"${cur === x ? " selected" : ""}>${esc(x)}</option>`).join("");
  const dl = `<datalist id="dir-teams">${opt(teams)}</datalist><datalist id="dir-groups">${opt(groups)}</datalist>`;
  // the filters live in the header's gray bar
  const filterForm = `<form method="get" action="/admin/people" class="dir-filters-bar">
        <select name="list" aria-label="List" onchange="this.form.submit()"><option value="">All people (${total})</option>${lists.map((l) => `<option value="${l.id}"${f.list === l.id ? " selected" : ""}>${esc(l.name)} (${l.n})</option>`).join("")}</select>
        <input type="search" name="q" value="${esc(f.q)}" placeholder="Search name, email, phone…" aria-label="Search">
        <select name="kind" aria-label="Kind" onchange="this.form.submit()"><option value="">Everyone</option><option value="athlete"${f.kind === "athlete" ? " selected" : ""}>Athletes</option><option value="adult"${f.kind === "adult" ? " selected" : ""}>Adults</option></select>
        <select name="status" aria-label="Status" onchange="this.form.submit()"><option value="">Any status</option>${Object.entries(PP.STATUS).map(([k, l]) => `<option value="${k}"${f.status === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select name="role" aria-label="Role" onchange="this.form.submit()"><option value="">Any role</option>${Object.entries(ROLE).map(([k, l]) => `<option value="${k}"${f.role === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        ${teams.length ? `<select name="team" aria-label="Current team" onchange="this.form.submit()"><option value="">Any team</option>${opt(teams, f.team)}</select>` : ""}
        ${f.q || f.kind || f.role || f.team || f.status || f.list ? `<a class="link-dark" href="/admin/people">Clear</a>` : ""}</form>`;
  return page({ title: "People", tab: "people", user, flash, xwide: true,
    body: `${head ? head({ active: "people" }) : ""}
    ${dl}
    ${waiting ? `<div class="req-note"><b>${waiting} request${waiting === 1 ? "" : "s"} waiting</b> <span>New accounts, family members to add, or changes people asked for.</span><a class="sb-btn primary" href="/admin/requests">Review</a></div>` : ""}
    <section class="panel">
      ${f.batch ? `<div class="req-note imp-note"><b>People from an import</b> <span>Showing the people touched by import #${f.batch}.</span><a class="sb-btn" href="/admin/people">Show everyone</a></div>` : ""}
      <div class="pp-toolbar">
        <div class="pp-acts"><button type="button" class="sb-btn primary" onclick="var d=document.querySelector('.add-wrap'); d.open=!d.open; if (d.open) d.querySelector('input:not([type=hidden])').focus()">+ Add person</button>
          <a class="sb-btn" href="/admin/people/import">⇪ Import</a><a class="sb-btn" href="/admin/people/export.csv" title="Everyone in People, as a spreadsheet Import reads as is">⇩ Export</a>
          <a class="sb-btn" href="/admin/people/cleanup">Clean up</a>
          <details class="new-list"><summary class="sb-btn">+ New list</summary>
            <form method="post" action="/admin/people/lists" class="inline-add nl-pop"><input name="name" required maxlength="60" placeholder="e.g. 2026 Season Athletes" aria-label="List name"><button class="btn-small" type="submit">Make list</button></form></details></div>
        <div class="pp-filters">${filterForm}</div>
      </div>
      <div class="head-btns"><details class="add-wrap"${total ? "" : " open"}><summary class="btn-small add-sum">＋ Add a person</summary>
      <div class="add-people" id="add">
        <div class="ap-tabs" role="tablist">
          <button type="button" class="ap-tab on" data-ap="athlete">New athlete</button><button type="button" class="ap-tab" data-ap="adult">New adult (parent/guardian, coach, volunteer)</button>
        </div>
        <form method="post" action="/admin/people" class="grid-form ap-pane" data-ap="athlete"><input type="hidden" name="kind" value="athlete">
          ${fields({}, "athlete")}
          <div class="full"><label><span>Parent/guardian emails <span class="opt">(optional; they're added as parents)</span></span><input name="parent_emails" placeholder="e.g. mom@example.com, dad@example.com"></label></div>
          <div class="full ap-actions"><button class="btn-small" type="submit">Add athlete</button></div></form>
        <form method="post" action="/admin/people" class="grid-form ap-pane" data-ap="adult" hidden><input type="hidden" name="kind" value="adult">
          ${fields({}, "adult")}
          <div class="full ap-actions"><button class="btn-small" type="submit">Add adult</button></div></form>
      </div></details></div>
      ${listBar}
      ${cur ? "" : `<h3 class="ilist-head">${people.length === total ? "Everyone" : "Matching"} <span class="fine-inline">(${people.length})</span></h3>`}
      ${people.length ? bulk : ""}
      ${people.length ? `<div class="table-wrap"><table class="dir-table dir2"><colgroup><col class="c-chk"><col class="c-person"><col class="c-contact"><col class="c-family"><col class="c-lists"><col class="c-status"></colgroup>
        <thead><tr><th><input type="checkbox" class="check-all" aria-label="Check all shown" title="Check all shown"></th><th>Person</th><th>Contact</th><th>Family</th><th>Lists &amp; boards</th><th>Status</th></tr></thead><tbody>
        ${people.map((p) => { const ls = (p.list_ids || []).map((id) => (lists.find((l) => l.id === id) || {}).name).filter(Boolean);
          const bs = [...(p.boards || []), ...(p.coaching || []).map((c) => `Coach: ${c}`)];
          const more = (all) => (all.length > 3 ? `<span class="fine dir-more" title="${esc(all.slice(3).join(", "))}">+${all.length - 3} more</span>` : "");
          return `<tr>
          <td data-l=""><input type="checkbox" name="ids" value="${p.id}" form="bulk" aria-label="Check ${esc(PP.display(p))}"></td>
          <td data-l="Person"><a class="dir-name" href="/admin/people/${p.id}">${esc(PP.display(p))}</a>${p.jersey ? ` <span class="fine">#${esc(p.jersey)}</span>` : ""}
            <div class="dir-sub">${kindTag(p)}${p.team ? `<span class="dir-team">${esc(p.team)}</span>` : ""}</div></td>
          <td data-l="Contact" class="dir-contact">${[p.email, p.phone].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("") || `<span class="fine">—</span>`}</td>
          <td data-l="Family" class="dir-family">${p.kind === "athlete" ? (p.parents.length ? `<span class="dir-lbl">Parents/guardians</span>${esc(p.parents.join(", "))}` : `<span class="fine">—</span>`) : (p.kids.length ? `<span class="dir-lbl">Kids</span>${esc(p.kids.join(", "))}` : `<span class="fine">—</span>`)}</td>
          <td data-l="Lists &amp; boards" class="dir-lists">${ls.length ? `<div class="dir-chips">${ls.slice(0, 3).map((n) => `<span class="dir-chip list" title="List">${esc(n)}</span>`).join("")}${more(ls)}</div>` : ""}
            ${bs.length ? `<div class="dir-chips">${bs.slice(0, 3).map((n) => `<span class="dir-chip board" title="Board">${esc(n)}</span>`).join("")}${more(bs)}</div>` : ""}${!ls.length && !bs.length ? `<span class="fine">—</span>` : ""}</td>
          <td data-l="Status" class="st-cell">${statusPill(p)}</td></tr>`; }).join("")}
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
        function sync() { tgt.hidden = act.value === "remove" || act.value === "invite"; nw.hidden = tgt.hidden || tgt.value !== "new"; }
        act.addEventListener("change", sync); tgt.addEventListener("change", sync); sync();
      })();
      document.querySelectorAll(".ap-tab").forEach(function (t) { t.addEventListener("click", function () {
        document.querySelectorAll(".ap-tab").forEach(function (x) { x.classList.toggle("on", x === t); });
        document.querySelectorAll(".ap-pane").forEach(function (p) { p.hidden = p.dataset.ap !== t.dataset.ap; }); }); });
    </script>` });
}

function personPage({ user, flash, p, boards, claimedElsewhere, parents, kids, athletes, allBoards, coaching, mine = [], lists = [], allTeams = [], acct = null, history = [], head = null }) {
  const ra = p.report_access || {}, mode = ra.mode || "none";
  const name = PP.display(p);
  return page({ title: name, tab: "people", user, flash, xwide: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/people"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>People</a></nav>${head ? head({ active: "people" }) : ""}<div class="sub-top"><h2>${esc(name)} <span class="h-sub">${p.kind === "adult" ? "Adult" : "Athlete"}</span></h2></div>
    <div class="board-cols"><div class="bc-left">
      <section class="panel"><h2>Details</h2>
        <form method="post" action="/admin/people/${p.id}" class="grid-form">${fields(p, p.kind)}
          <div class="full q-actions"><button class="btn-small" type="submit">Save</button></div></form></section>
      <section class="panel" id="family"><h2>${p.kind === "athlete" ? "Parents/guardians" : "Kids"}</h2>
        ${p.kind === "athlete"
          ? `${parents.length ? `<ul class="fam-list">${parents.map((x) => `<li><span>${x.person_id ? `<a href="/admin/people/${x.person_id}">${esc(`${x.first_name || ""} ${x.last_name || ""}`.trim() || x.email)}</a>` : ""} <span class="fine">${esc(x.email)}${x.phone ? ` · ${esc(x.phone)}` : ""}</span></span>
              <form method="post" action="/admin/people/${p.id}/family/remove"><input type="hidden" name="user_id" value="${x.user_id}"><input type="hidden" name="athlete_id" value="${p.id}"><button class="x" type="submit" aria-label="Unlink">×</button></form></li>`).join("")}</ul>` : `<p class="muted small">No parents linked yet.</p>`}
            <form method="post" action="/admin/people/${p.id}/family" class="inline-add tag-add"><label>Add a parent/guardian by email<input type="email" name="email" required placeholder="e.g. jane@example.com"></label><button class="btn-small" type="submit">Link parent</button></form>
            <p class="fine">Parents/guardians sign in with their email and see this athlete under My Claims.</p>`
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
      ${p.kind === "athlete" ? `<section class="panel side-card" id="self"><h2>Own sign-in &amp; family sharing</h2>
        <p class="fine">Older athletes can sign in and claim for themselves. Their family can still see and manage it, unless you turn that off.</p>
        <form method="post" action="/admin/people/${p.id}/self" class="stack self-form">
          <label class="field-l"><span>Athlete's own email <span class="opt">(leave empty if only family signs in)</span></span><input type="email" name="email" value="${esc(p.email || "")}" placeholder="athlete@example.com"></label>
          <label class="radio-row"><input type="checkbox" name="family_access" value="1"${p.family_access !== false ? " checked" : ""}> <span><b>Family can see and manage their claims</b> <span class="fine">Parents/guardians see ${esc(p.first_name)} on My Claims and can claim or cancel for them.</span></span></label>
          <label class="radio-row"><input type="checkbox" name="family_emails" value="1"${p.family_emails !== false ? " checked" : ""}> <span><b>Family gets the emails</b> <span class="fine">Confirmations, cancellations, and waitlist news. Off: only ${esc(p.first_name)} gets them.</span></span></label>
          <p class="fine">${PP.isAdultAge(p) ? `${esc(p.first_name)} is 18 or older, so they can change these themselves in My Account.` : `Only admins can change these${p.birth_year ? "" : " (add a birth year so athletes 18+ can manage it themselves)"}.`}</p>
          <div class="q-actions"><button class="btn-small" type="submit">Save</button></div></form></section>` : ""}
      <div class="mg-link"><a class="sb-btn" href="/admin/people/${p.id}/merge">Merge a duplicate into ${esc(p.first_name || "this person")}</a></div>
      ${p.self_user_id ? `<form method="post" action="/admin/shadow/start" class="sh-person"><input type="hidden" name="user_id" value="${p.self_user_id}"><button class="sb-btn" type="submit">Sign in as ${esc(p.first_name || "this person")}</button><span class="fine">See the app exactly as they do. Emails are held, not sent.</span></form>` : ""}
      ${p.kind === "adult" || p.email ? `<section class="panel side-card" id="signin"><h2>Sign-in &amp; setup</h2>
        <dl class="rc-list">
          <div><dt>Account</dt><dd>${!acct ? (p.email ? "Not set up yet" : "No email") : acct.joined_at ? `Joined ${esc(fmtDateTime(acct.joined_at))}` : acct.invited_at ? `Invited ${esc(fmtDateTime(acct.invited_at))}` : "Not invited"}</dd></div>
          <div><dt>Last sign-in</dt><dd>${acct && acct.last_login_at ? esc(fmtDateTime(acct.last_login_at)) : "Never"}</dd></div>
          <div><dt>Password</dt><dd>${acct && acct.password_hash ? "Set" : "None (uses email links)"}</dd></div>
        </dl>
        <form method="post" action="/admin/people/${p.id}/invite" class="si-row"><button class="btn-small" type="submit"${p.email ? "" : " disabled"}>${acct && acct.invited_at ? "Resend invite" : "Send invite"}</button>
          <span class="fine">Emails a 7-day link to set up their account.</span></form>
        <form method="post" action="/admin/people/${p.id}/setup" class="si-row"><input type="hidden" name="on" value="${acct && acct.setup_required ? "0" : "1"}">
          <button class="btn-ghost" type="submit"${p.email ? "" : " disabled"}>${acct && acct.setup_required ? "✓ Setup required at next sign-in · Turn off" : "Require setup at next sign-in"}</button></form>
        <form method="post" action="/admin/people/${p.id}/signin-code" class="si-row"><button class="btn-ghost" type="submit"${p.email ? "" : " disabled"}>Make a one-time sign-in code</button>
          <span class="fine">Backup: read it to them. Works once, 15 minutes.</span></form>
        <details class="si-hist"${history.length ? "" : " hidden"}><summary>Sign-in history (${history.length})</summary>
          <ul>${history.map((h) => `<li class="${h.ok ? "ok" : "no"}"><span><b>${h.ok ? "✓" : "✗"} ${esc(h.method)}</b>${h.reason ? ` · ${esc(h.reason)}` : ""}</span><span class="fine">${esc(fmtDateTime(h.at))} · ${esc(h.device || "")}</span></li>`).join("")}</ul></details>
      </section>` : ""}
      ${p.kind === "adult" ? `<section class="panel side-card" id="reports"><h2>Reports access</h2>
        <p class="fine">Let this person see who claimed, attended, or volunteered. Admins always see every report.</p>
        <form method="post" action="/admin/people/${p.id}/reports" class="stack ra-form">
          <label class="radio-row"><input type="radio" name="mode" value="none"${mode === "none" ? " checked" : ""}> No reports</label>
          <label class="radio-row"><input type="radio" name="mode" value="coached"${mode === "coached" ? " checked" : ""}> The boards they coach <span class="fine">(${coaching.length})</span></label>
          <label class="radio-row"><input type="radio" name="mode" value="boards"${mode === "boards" ? " checked" : ""}> Specific boards</label>
          <div class="ra-boards">${allBoards.map((b) => `<label class="radio-row"><input type="checkbox" name="boards" value="${b.id}"${(ra.boards || []).includes(b.id) ? " checked" : ""}> ${esc(b.name)}</label>`).join("")}</div>
          ${allTeams.length ? `<p class="field-lbl">Only these teams <span class="opt">(leave empty for everyone)</span></p>
            <div class="tag-checks">${allTeams.map((t) => `<label class="tag-box"><input type="checkbox" name="teams" value="${esc(t)}"${(ra.teams || []).includes(t) ? " checked" : ""}> ${esc(t)}</label>`).join("")}</div>` : ""}
          ${p.email ? `<div class="q-actions"><button class="btn-small" type="submit">Save</button></div>` : `<p class="fine">Add an email first, so they can sign in.</p>`}
        </form>
        <script>(function () { var f = document.querySelector(".ra-form"); function s() { f.querySelector(".ra-boards").hidden = !f.querySelector("input[name=mode][value=boards]").checked; }
          f.addEventListener("change", s); s(); })();</script></section>` : ""}
      <section class="panel side-card"><h2>Remove</h2><p class="fine">Takes them out of the directory and board lists' pickers. Past claims stay in reports.</p>
        <form method="post" action="/admin/people/${p.id}/archive" onsubmit="return confirm('Remove ${esc(name.replace(/'/g, ""))} from the directory?')"><button class="link-dark danger-link" type="submit">Remove from People</button></form></section>
    </aside></div>` });
}

// The two ways to add people, explained (shown on People and on a board's people card)
module.exports = { directoryPage, personPage };
