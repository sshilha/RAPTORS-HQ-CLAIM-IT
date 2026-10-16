const { esc } = require("./layout");
const { page } = require("./admin");
const SC = require("../schedules");

function groupSelect(sc, value, attrs = "") {
  return `<select name="group" ${attrs}><option value="">No ${esc(SC.labels(sc).group.one.toLowerCase())}</option>
    ${SC.groupsFor(sc).map((g) => `<option${g === value ? " selected" : ""}>${esc(g)}</option>`).join("")}</select>`;
}

function needBanner(sc, L) {
  const SCm = require("../schedules");
  if (SCm.claimMode(sc) === "roster") return `<div class="need yes"><b>Only the ${esc(L.participant.many.toLowerCase())} listed here can claim on this board.</b> Add each one, with their ${esc(L.group.one.toLowerCase())}${SCm.restricts(sc) ? " and tags" : ""}, and link a parent or contact email so they can sign in.</div>`;
  if (SCm.restricts(sc)) return `<div class="need yes"><b>Add people here to give them a ${esc(L.group.one.toLowerCase())} or tags.</b> Anyone signed in can still claim things that aren't limited; limited ones need the right ${esc(L.group.one.toLowerCase())} or tag.</div>`;
  return `<div class="need no"><b>Not needed for this board.</b> It's open to ${SCm.claimMode(sc) === "public" ? "anyone with the link" : "anyone signed in"}, so people just claim spots.</div>`;
}

function membersPage({ user, flash, sc, members, others, group, total }) {
  const L = SC.labels(sc);
  const groups = SC.groupsFor(sc);
  const tags = sc.tags || [];
  const back = `/admin/members?s=${sc.id}${group ? `&g=${encodeURIComponent(group)}` : ""}`;
  return page({
    title: `${L.participant.many} · ${sc.name}`, tab: "members", user, flash,
    body: `<section class="panel">
      <div class="athlete-head"><div><h1>${esc(L.participant.many)}</h1>
        <p class="muted tight">${total} in ${esc(sc.name)}.</p></div>
        <a class="btn-small" href="#add">+ Add</a></div>
      ${needBanner(sc, L)}
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

    <div class="settings-2" id="add">
      <section class="panel">
        <h2 class="banner">New ${esc(L.participant.one.toLowerCase())}</h2>
        <form method="post" action="/admin/members?s=${sc.id}" class="grid-form">
          <div><label>First name<input name="first_name" required maxlength="40"></label></div>
          <div><label>Last name<input name="last_name" required maxlength="40"></label></div>
          <div><label>${esc(L.group.one)}${groupSelect(sc, null)}</label></div>
          <div><label>Team (optional)<input name="team" maxlength="40"></label></div>
          <div class="full"><label>Parent or contact emails<input name="parent_emails" placeholder="mom@example.com, dad@example.com"></label>
            <span class="fine">They sign in with these to claim spots. For an adult signing up themselves, use their own email.</span></div>
          <div class="full"><button class="btn-small" type="submit">Add ${esc(L.participant.one.toLowerCase())}</button></div>
        </form>
      </section>
      <section class="panel">
        <h2 class="banner">Add someone already in the app</h2>
        <p class="fine">People from other schedules, public sign-ups, or parents who added themselves.</p>
        ${others.length ? `<form method="post" action="/admin/members/add?s=${sc.id}" class="stack">
          <label>People<select name="athlete_id" multiple size="${Math.min(10, Math.max(4, others.length))}" required>
            ${others.map((a) => `<option value="${a.id}">${esc(a.last_name)}, ${esc(a.first_name)}${a.self_user_id ? " (adult)" : ""}</option>`).join("")}</select></label>
          <span class="fine">Hold Ctrl (or ⌘) to pick several.</span>
          <label>${esc(L.group.one)}${groupSelect(sc, null)}</label>
          <button class="btn-small" type="submit">Add to ${esc(sc.name)}</button>
        </form>` : `<p class="muted">Everyone in the app is already in ${esc(sc.name)}.</p>`}
      </section>
    </div>`,
  });
}

module.exports = { membersPage, groupSelect };
