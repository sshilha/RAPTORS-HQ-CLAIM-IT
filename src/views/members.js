const { esc } = require("./layout");
const { page } = require("./admin");
const SC = require("../schedules");

function groupSelect(sc, value, attrs = "") {
  return `<select name="group" ${attrs}><option value="">No ${esc(SC.labels(sc).group.one.toLowerCase())}</option>
    ${SC.groupsFor(sc).map((g) => `<option${g === value ? " selected" : ""}>${esc(g)}</option>`).join("")}</select>`;
}

function membersPage({ user, flash, sc, members, others, group, total }) {
  const L = SC.labels(sc);
  const groups = SC.groupsFor(sc);
  const back = `/admin/members?s=${sc.id}${group ? `&g=${encodeURIComponent(group)}` : ""}`;
  return page({
    title: `${L.participant.many} · ${sc.name}`, tab: "members", user, flash,
    body: `<section class="panel">
      <div class="athlete-head"><div><h1>${esc(L.participant.many)}</h1>
        <p class="muted tight">${total} in ${esc(sc.name)}. These are the people who can use this schedule's "roster only" sign-ups. Family and public sign-ups are open to anyone.</p></div>
        <a class="btn-small" href="#add">+ Add</a></div>
      ${groups.length ? `<nav class="chip-filter" aria-label="Filter by ${esc(L.group.one.toLowerCase())}">
        <a href="/admin/members?s=${sc.id}"${!group ? ' aria-current="page"' : ""}>All</a>
        ${groups.map((g) => `<a href="/admin/members?s=${sc.id}&g=${encodeURIComponent(g)}"${group === g ? ' aria-current="page"' : ""}>${esc(g)}</a>`).join("")}
        <a href="/admin/members?s=${sc.id}&g=none"${group === "none" ? ' aria-current="page"' : ""}>No ${esc(L.group.one.toLowerCase())}</a></nav>` : ""}
      ${members.length ? `<div class="table-wrap"><table>
        <thead><tr><th>${esc(L.participant.one)}</th><th>${esc(L.group.one)}</th><th>Emails</th><th>Also in</th><th></th></tr></thead>
        <tbody>${members.map((a) => `<tr>
          <td><a href="/admin/athletes/${a.id}">${esc(a.last_name)}, ${esc(a.first_name)}</a>${a.self_user_id ? ` <span class="fine-inline">adult</span>` : ""}</td>
          <td><form method="post" action="/admin/members/${a.id}?s=${sc.id}" class="inline-group">
            <input type="hidden" name="return_to" value="${esc(back)}">
            ${groupSelect(sc, a.group_name, `onchange="this.form.submit()" aria-label="${esc(L.group.one)}"`)}
            <noscript><button class="btn-ghost">Save</button></noscript></form></td>
          <td>${a.emails.length ? esc(a.emails.join(", ")) : `<span class="fine">None</span>`}</td>
          <td>${a.other_schedules.length ? esc(a.other_schedules.join(", ")) : ""}</td>
          <td><form method="post" action="/admin/members/${a.id}/remove?s=${sc.id}" onsubmit="return confirm('Remove ${esc(a.first_name)} from ${esc(sc.name)}?')">
            <input type="hidden" name="return_to" value="${esc(back)}"><button class="x" type="submit" aria-label="Remove from ${esc(sc.name)}">×</button></form></td>
        </tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">${group ? "No one in this filter." : `No ${esc(L.participant.many.toLowerCase())} yet. Add them below.`}</p>`}
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
