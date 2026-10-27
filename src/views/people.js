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

function directoryPage({ user, flash, people, total, f, teams, groups }) {
  const opt = (list, cur) => list.map((x) => `<option value="${esc(x)}"${cur === x ? " selected" : ""}>${esc(x)}</option>`).join("");
  const dl = `<datalist id="dir-teams">${opt(teams)}</datalist><datalist id="dir-groups">${opt(groups)}</datalist>`;
  return page({ title: "People", tab: "people", user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">People <span class="h-sub">${total} in the app</span></h1>
      <a class="btn-ghost" href="/admin/settings/app">← App settings</a></div>
    ${dl}
    <section class="panel">
      <p class="fine">Everyone in the app: athletes, parents, coaches, and volunteers. Add people here once, then add them to any board. Only admins can change these details; people can send a change request from My Claims.</p>
      <details class="add-wrap"${total ? "" : " open"}><summary class="btn-small">＋ Add a person</summary>
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
      </div></details>
      <form method="get" action="/admin/people" class="dir-filters">
        <input type="search" name="q" value="${esc(f.q)}" placeholder="Search name, email, phone…" aria-label="Search">
        <select name="kind" aria-label="Kind"><option value="">Everyone</option><option value="athlete"${f.kind === "athlete" ? " selected" : ""}>Athletes</option><option value="adult"${f.kind === "adult" ? " selected" : ""}>Adults</option></select>
        <select name="role" aria-label="Role"><option value="">Any role</option>${Object.entries(ROLE).map(([k, l]) => `<option value="${k}"${f.role === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select name="team" aria-label="Current team"><option value="">Any team</option>${opt(teams, f.team)}</select>
        <select name="se" aria-label="SportsEngine group"><option value="">Any SportsEngine group</option>${opt(groups, f.se)}</select>
        <button class="btn-ghost" type="submit">Filter</button>${f.q || f.kind || f.role || f.team || f.se ? `<a class="link-dark" href="/admin/people">Clear</a>` : ""}
      </form>
      <h3 class="ilist-head">${people.length === total ? "Everyone" : "Matching"} <span class="fine-inline">(${people.length})</span></h3>
      ${people.length ? `<div class="table-wrap"><table class="dir-table"><thead><tr><th>Name</th><th>Kind</th><th>Current team</th><th>SportsEngine group</th><th>Contact</th><th>Family</th><th>Boards</th></tr></thead><tbody>
        ${people.map((p) => `<tr><td><a href="/admin/people/${p.id}"><b>${esc(PP.display(p))}</b></a>${p.jersey ? ` <span class="fine">#${esc(p.jersey)}</span>` : ""}</td>
          <td>${kindTag(p)}</td><td>${esc(p.team || "")}</td><td>${esc(p.se_group || "")}</td>
          <td><span class="fine">${[p.email, p.phone].filter(Boolean).map(esc).join("<br>")}</span></td>
          <td><span class="fine">${p.kind === "athlete" ? (p.parents.length ? `Parents: ${esc(p.parents.join(", "))}` : "") : (p.kids.length ? `Kids: ${esc(p.kids.join(", "))}` : "")}</span></td>
          <td>${chips(p.boards)}${p.coaching.length ? chips(p.coaching.map((c) => `Coach: ${c}`), "chip-s coach") : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">No one matches.</p>`}
    </section>
    <script>
      document.querySelectorAll(".ap-tab").forEach(function (t) { t.addEventListener("click", function () {
        document.querySelectorAll(".ap-tab").forEach(function (x) { x.classList.toggle("on", x === t); });
        document.querySelectorAll(".ap-pane").forEach(function (p) { p.hidden = p.dataset.ap !== t.dataset.ap; }); }); });
    </script>` });
}

function personPage({ user, flash, p, boards, claimedElsewhere, parents, kids, athletes, allBoards, coaching }) {
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

module.exports = { directoryPage, personPage };
