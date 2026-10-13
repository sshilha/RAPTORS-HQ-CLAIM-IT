const { esc, layout } = require("./layout");
const { AGE_GROUPS, ACTIVITIES } = require("../config");
const { fmtRange, fmtDateTime, inputParts } = require("../time");
const { priorityActive } = require("../booking");

const page = (opts) => layout({ ...opts, admin: true, wide: true });

const ageChecks = (selected = []) => `<fieldset class="checks"><legend>Age groups</legend>
  ${AGE_GROUPS.map((g) => `<label class="check"><input type="checkbox" name="age_groups" value="${g}"${selected.includes(g) ? " checked" : ""}> ${g}</label>`).join("")}
</fieldset>`;

function programFields(p = {}) {
  return `
  <div><label for="p-name">Program name</label><input id="p-name" name="name" required value="${esc(p.name)}" placeholder="Winter Hitting, 12U–18U"></div>
  <div><label for="p-act">Activity</label><input id="p-act" name="activity" list="activities" required value="${esc(p.activity)}">
    <datalist id="activities">${ACTIVITIES.map((a) => `<option value="${a}">`).join("")}</datalist></div>
  <div class="full">${ageChecks(p.age_groups)}</div>
  <div class="full"><label for="p-desc">Description for parents (optional)</label><input id="p-desc" name="description" value="${esc(p.description)}"></div>
  <div><label for="p-open">Booking opens (optional)</label><input id="p-open" type="datetime-local" name="booking_opens_at" value="${inputParts(p.booking_opens_at).local}">
    <span class="fine">Leave blank to open immediately.</span></div>
  <div><label for="p-pend">Priority booking ends (optional)</label><input id="p-pend" type="datetime-local" name="priority_ends_at" value="${inputParts(p.priority_ends_at).local}">
    <span class="fine">Leave blank for no priority limit.</span></div>
  <div><label for="p-lim">Priority reservations per athlete</label><input id="p-lim" type="number" min="1" max="50" name="priority_limit" value="${p.priority_limit ?? 2}"></div>
  <div><label for="p-cxl">Cancellation deadline (hours before)</label><input id="p-cxl" type="number" min="0" max="336" name="cancel_hours" value="${p.cancel_hours ?? 24}"></div>`;
}

function programStatus(p) {
  if (p.archived) return `<span class="pill">Archived</span>`;
  if (p.booking_opens_at && new Date(p.booking_opens_at) > new Date()) return `<span class="pill">Opens ${esc(fmtDateTime(p.booking_opens_at))}</span>`;
  if (priorityActive(p)) return `<span class="pill wait">Priority until ${esc(fmtDateTime(p.priority_ends_at))}</span>`;
  return `<span class="pill ok">Open booking</span>`;
}

const programsPage = ({ user, programs, flash }) => page({
  title: "Programs", tab: "programs", user, flash,
  body: `<section class="panel">
    <h1>Programs</h1>
    ${programs.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Program</th><th>Round</th><th>Ages</th><th>Upcoming sessions</th><th>Status</th></tr></thead>
      <tbody>${programs.map((p) => `<tr>
        <td><a href="/admin/programs/${p.id}">${esc(p.name)}</a><div class="fine">${esc(p.activity)}</div></td>
        <td>${p.round_id ? `<a href="/admin/rounds/${p.round_id}">${esc(p.round_name)}</a>${p.round_published ? "" : ` <span class="pill wait">Draft</span>`}` : `<span class="fine">None</span>`}</td>
        <td>${esc(p.age_groups.join(", "))}</td>
        <td>${p.upcoming}</td>
        <td>${programStatus(p)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No programs yet. Create one below, then add sessions to it.</p>`}
  </section>
  <section class="panel">
    <h2>New standalone program</h2>
    <p class="muted">For one-off training outside a round. Most training is easier to set up under Rounds.</p>
    <form method="post" action="/admin/programs" class="grid-form">${programFields()}
      <div class="full"><button class="btn" type="submit">Create program</button></div></form>
  </section>`,
});

function sessionFields(s = {}, { create } = {}) {
  const st = inputParts(s.starts_at), en = inputParts(s.ends_at);
  return `
  <div><label for="s-date">Date</label><input id="s-date" type="date" name="date" required value="${st.date}"></div>
  <div class="pair"><div><label for="s-st">Start</label><input id="s-st" type="time" name="start_time" required value="${st.time}"></div>
    <div><label for="s-en">End</label><input id="s-en" type="time" name="end_time" required value="${en.time}"></div></div>
  <div><label for="s-loc">Location</label><input id="s-loc" name="location" value="${esc(s.location)}"></div>
  <div><label for="s-coach">Coach</label><input id="s-coach" name="coach" value="${esc(s.coach)}"></div>
  <div><label for="s-cap">Capacity</label><input id="s-cap" type="number" min="1" max="200" name="capacity" required value="${s.capacity ?? 8}"></div>
  ${create ? `<div><label for="s-rep">Repeat weekly</label><select id="s-rep" name="repeat_weeks">
      ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i === 0 ? "Just this date" : `${i + 1} weeks in a row`}</option>`).join("")}
    </select></div>` : ""}
  <div class="full"><label for="s-notes">Notes for parents (optional)</label><input id="s-notes" name="notes" value="${esc(s.notes)}" placeholder="Bring catcher's gear"></div>`;
}

const programPage = ({ user, program: p, sessions, flash, readonly }) => page({
  title: p.name, tab: "programs", user, flash, readonly,
  body: `<a class="back" href="/admin/programs">All programs</a>
  <section class="panel">
    <div class="athlete-head"><h1>${esc(p.name)}</h1>${programStatus(p)}</div>
    <h2>Sessions</h2>
    ${sessions.length ? `<div class="table-wrap"><table>
      <thead><tr><th>When</th><th>Location</th><th>Coach</th><th>Reserved</th><th>Waitlist</th></tr></thead>
      <tbody>${sessions.map((s) => `<tr class="${s.canceled_at ? "struck" : ""}">
        <td><a href="/admin/sessions/${s.id}">${esc(fmtRange(s.starts_at, s.ends_at))}</a>${s.canceled_at ? ` <span class="pill">Canceled</span>` : ""}</td>
        <td>${esc(s.location || "")}</td><td>${esc(s.coach || "")}</td>
        <td>${s.confirmed} / ${s.capacity}</td><td>${s.waitlisted}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No sessions yet. Add one below.</p>`}
  </section>
  ${p.round_id ? `<section class="panel"><p class="rule">This program belongs to a round. Add sessions and change booking rules on the
    <a href="/admin/rounds/${p.round_id}">round's page</a>.</p></section>` : `<section class="panel">
    <h2>Add sessions</h2>
    <form method="post" action="/admin/programs/${p.id}/sessions" class="grid-form">${sessionFields({}, { create: true })}
      <div class="full"><button class="btn" type="submit">Add sessions</button></div></form>
  </section>
  <section class="panel">
    <h2>Program settings</h2>
    <form method="post" action="/admin/programs/${p.id}" class="grid-form">${programFields(p)}
      <div class="full"><button class="btn" type="submit">Save program</button></div></form>
    <form method="post" action="/admin/programs/${p.id}/archive" class="inline-end">
      <button class="btn-ghost" type="submit">${p.archived ? "Restore program" : "Archive program"}</button>
      <span class="fine">${p.archived ? "Restoring shows it to parents again." : "Archiving hides it from parents. Reservations are kept."}</span>
    </form>
  </section>`}`,
});

const rosterRows = (rows, kind) => rows.length ? `<div class="table-wrap"><table>
  <thead><tr>${kind === "wait" ? "<th>#</th>" : ""}<th>Athlete</th><th>Age</th><th>Parents</th><th>Booked</th><th></th></tr></thead>
  <tbody>${rows.map((r, i) => `<tr>
    ${kind === "wait" ? `<td>${i + 1}</td>` : ""}
    <td>${esc(r.first_name)} ${esc(r.last_name)}</td><td>${esc(r.age_group || "")}</td>
    <td>${esc(r.emails.join(", "))}</td><td>${esc(fmtDateTime(r.created_at))}</td>
    <td><form method="post" action="/admin/reservations/${r.id}/cancel" onsubmit="return confirm('Remove ${esc(r.first_name)}? Their family will get an email.')">
      <button class="btn-ghost" type="submit">Remove</button></form></td></tr>`).join("")}</tbody></table></div>`
  : `<p class="muted">${kind === "wait" ? "No one on the waitlist." : "No reservations yet."}</p>`;

const sessionPage = ({ user, session: s, program: p, confirmed, waitlist, flash, readonly }) => page({
  title: "Session", tab: "rounds", user, flash, readonly,
  body: `<a class="back" href="${p.round_id ? `/admin/rounds/${p.round_id}` : `/admin/programs/${p.id}`}">${p.round_id ? "Back to round calendar" : esc(p.name)}</a>
  <section class="panel">
    <div class="athlete-head"><h1>${esc(fmtRange(s.starts_at, s.ends_at))}</h1>${s.canceled_at ? `<span class="pill">Canceled</span>` : ""}</div>
    <p class="muted">${[s.location, s.coach && `Coach ${s.coach}`].filter(Boolean).map(esc).join(", ")}</p>
    <h2>Reserved (${confirmed.length} of ${s.capacity})</h2>${rosterRows(confirmed, "ok")}
    <h2>Waitlist</h2>${rosterRows(waitlist, "wait")}
  </section>
  ${s.canceled_at ? "" : `<section class="panel">
    <h2>Edit session</h2>
    <form method="post" action="/admin/sessions/${s.id}" class="grid-form">${sessionFields(s)}
      <div class="full"><button class="btn" type="submit">Save session</button>
      <span class="fine">Raising capacity moves waitlisted athletes in automatically.</span></div></form>
    <form method="post" action="/admin/sessions/${s.id}/cancel" class="inline-end"
          onsubmit="return confirm('Cancel this session? Every reserved and waitlisted family will get an email.')">
      <button class="btn-ghost danger" type="submit">Cancel session</button>
    </form>
  </section>`}`,
});

const ageSelect = (val) => `<select name="age_group" required>
  <option value="">Choose…</option>${AGE_GROUPS.map((g) => `<option${g === val ? " selected" : ""}>${g}</option>`).join("")}</select>`;

const athletesPage = ({ user, athletes, flash }) => page({
  title: "Athletes", tab: "athletes", user, flash,
  body: `<section class="panel">
    <h1>Athletes</h1>
    ${athletes.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Athlete</th><th>Age group</th><th>Team</th><th>Parent emails</th></tr></thead>
      <tbody>${athletes.map((a) => `<tr>
        <td><a href="/admin/athletes/${a.id}">${esc(a.last_name)}, ${esc(a.first_name)}</a></td>
        <td>${esc(a.age_group || "Missing")}</td><td>${esc(a.team || "")}</td>
        <td>${a.emails.length ? esc(a.emails.join(", ")) : `<span class="fine">None linked</span>`}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No athletes yet. Add one below.</p>`}
  </section>
  <section class="panel">
    <h2>Add athlete</h2>
    <form method="post" action="/admin/athletes" class="grid-form">
      <div><label>First name<input name="first_name" required></label></div>
      <div><label>Last name<input name="last_name" required></label></div>
      <div><label>Age group${ageSelect()}</label></div>
      <div><label>Team (optional)<input name="team" placeholder="12U Shilha"></label></div>
      <div class="full"><label>Parent emails<input name="parent_emails" placeholder="mom@example.com, dad@example.com"></label>
        <span class="fine">Separate with commas. Each parent signs in with their own email.</span></div>
      <div class="full"><button class="btn" type="submit">Add athlete</button></div>
    </form>
  </section>`,
});

const athletePage = ({ user, athlete: a, parents, flash }) => page({
  title: `${a.first_name} ${a.last_name}`, tab: "athletes", user, flash,
  body: `<a class="back" href="/admin/athletes">All athletes</a>
  <section class="panel">
    <h1>${esc(a.first_name)} ${esc(a.last_name)}</h1>
    <form method="post" action="/admin/athletes/${a.id}" class="grid-form">
      <div><label>First name<input name="first_name" required value="${esc(a.first_name)}"></label></div>
      <div><label>Last name<input name="last_name" required value="${esc(a.last_name)}"></label></div>
      <div><label>Age group${ageSelect(a.age_group)}</label></div>
      <div><label>Team (optional)<input name="team" value="${esc(a.team)}"></label></div>
      <div class="full"><button class="btn" type="submit">Save athlete</button></div>
    </form>
    <h2>Parents</h2>
    ${parents.length ? `<ul class="res-list">${parents.map((u) => `<li class="res">
      <div class="res-main"><div class="res-when">${esc(u.email)}</div>
        <div class="res-what">${u.last_login_at ? `Last signed in ${esc(fmtDateTime(u.last_login_at))}` : "Hasn't signed in yet"}</div></div>
      <div class="res-side"><form method="post" action="/admin/athletes/${a.id}/parents/${u.id}/remove">
        <button class="btn-ghost" type="submit">Unlink</button></form></div></li>`).join("")}</ul>`
      : `<p class="muted">No parents linked.</p>`}
    <form method="post" action="/admin/athletes/${a.id}/parents" class="grid-form">
      <div><label>Add parent email<input name="email" type="email" required></label></div>
      <div class="align-end"><button class="btn" type="submit">Link parent</button></div>
    </form>
    <form method="post" action="/admin/athletes/${a.id}/delete" class="inline-end"
          onsubmit="return confirm('Delete ${esc(a.first_name)} and all of their reservations?')">
      <button class="btn-ghost danger" type="submit">Delete athlete</button>
    </form>
  </section>`,
});

module.exports = { page, programsPage, programPage, sessionPage, athletesPage, athletePage };
