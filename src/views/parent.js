const { esc, layout } = require("./layout");
const { fmtRange, fmtDateTime, fmtDay, fmtTime } = require("../time");
const { cancelDeadline, priorityActive, bookingOpen } = require("../booking");

function reservationRow(r) {
  const deadline = cancelDeadline(r.starts_at, r.cancel_hours);
  const canCancel = r.status === "waitlisted" || new Date() < deadline;
  const pill = r.status === "confirmed"
    ? `<span class="pill ok">Reserved</span>`
    : `<span class="pill wait">Waitlist #${r.wait_pos}</span>`;
  const action = canCancel
    ? `<form method="post" action="/reservations/${r.id}/cancel"
         onsubmit="return confirm('${r.status === "confirmed" ? "Cancel this reservation? The spot will open for another athlete." : "Leave the waitlist?"}')">
         <button class="btn-ghost" type="submit">${r.status === "confirmed" ? "Cancel reservation" : "Leave waitlist"}</button>
       </form>
       ${r.status === "confirmed" ? `<span class="fine">Cancel by ${esc(fmtDateTime(deadline))}</span>` : ""}`
    : `<span class="fine">Online cancellation closed. Contact your coach.</span>`;
  return `<li class="res">
    <div class="res-main">
      <div class="res-when">${esc(fmtRange(r.starts_at, r.ends_at))}</div>
      <div class="res-what">${esc(r.program_name)}${r.location ? `, ${esc(r.location)}` : ""}</div>
    </div>
    <div class="res-side">${pill}${action}</div>
  </li>`;
}

const dashboardPage = ({ user, athletes, reservations, admin, flash }) =>
  layout({
    title: "My training", user, admin, flash,
    body: athletes.length
      ? athletes.map((a) => {
          const mine = reservations.filter((r) => r.athlete_id === a.id);
          return `<section class="panel athlete">
            <div class="athlete-head">
              <h1>${esc(a.first_name)} ${esc(a.last_name)}</h1>
              ${a.age_group ? `<span class="chip">${esc(a.age_group)}</span>` : ""}
            </div>
            ${mine.length
              ? `<h2>Upcoming sessions</h2><ul class="res-list">${mine.map(reservationRow).join("")}</ul>`
              : `<p class="muted">No upcoming sessions reserved.</p>`}
            ${a.age_group
              ? `<a class="btn" href="/athletes/${a.id}/book">Find training for ${esc(a.first_name)}</a>`
              : `<p class="muted">${esc(a.first_name)} doesn't have an age group yet, so no training is shown. Contact the Raptors to fix this.</p>`}
          </section>`;
        }).join("") + `<p class="signed">Signed in as ${esc(user.email)}</p>`
      : `<section class="panel">
          <h1>Welcome to Raptors Training</h1>
          <p class="muted">Signed in as ${esc(user.email)}</p>
          <div class="empty">
            <p>No athletes are linked to this email yet.</p>
            <p class="muted">If you signed in with a different email than the one on your SportsEngine account, sign out and try that one. Otherwise, contact the Raptors and we'll link your athlete.</p>
          </div>
        </section>`,
  });

function ruleLine(p) {
  if (!bookingOpen(p)) return `Booking opens ${esc(fmtDateTime(p.booking_opens_at))}.`;
  if (priorityActive(p))
    return `Priority booking until ${esc(fmtDateTime(p.priority_ends_at))}: up to ${p.priority_limit} sessions per athlete. <strong>${Math.min(p.used, p.priority_limit)} of ${p.priority_limit} used.</strong>`;
  return `Open booking: reserve any session with open spots.`;
}

function sessionRow(p, s, athlete) {
  const open = s.capacity - s.confirmed;
  const spots = open > 0
    ? `${open} of ${s.capacity} spots open`
    : `Full${s.waitlisted ? `, ${s.waitlisted} on waitlist` : ""}`;
  let action;
  if (s.my_status === "confirmed") action = `<span class="pill ok">Reserved</span>`;
  else if (s.my_status === "waitlisted") action = `<span class="pill wait">Waitlist #${s.my_pos}</span>`;
  else if (!bookingOpen(p)) action = `<button class="btn-small" disabled>Not open yet</button>`;
  else if (priorityActive(p) && p.used >= p.priority_limit) action = `<button class="btn-small" disabled>Priority limit reached</button>`;
  else action = `<form method="post" action="/athletes/${athlete.id}/book">
      <input type="hidden" name="session_id" value="${s.id}">
      <button class="${open > 0 ? "btn-small" : "btn-small secondary"}" type="submit">${open > 0 ? "Reserve" : "Join waitlist"}</button>
    </form>`;
  return `<li class="sess${open > 0 ? "" : " full"}">
    <div class="sess-main">
      <div class="sess-day">${esc(fmtDay(s.starts_at))}</div>
      <div class="sess-time">${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))}</div>
      <div class="sess-meta">${[s.location, s.coach && `Coach ${s.coach}`].filter(Boolean).map(esc).join(", ")}</div>
      ${s.notes ? `<div class="sess-meta">${esc(s.notes)}</div>` : ""}
    </div>
    <div class="sess-side">
      <div class="spots">${spots}</div>
      ${action}
    </div>
  </li>`;
}

const bookPage = ({ user, athlete, programs, admin, flash }) =>
  layout({
    title: `Book training for ${athlete.first_name}`, user, admin, flash,
    body: `<a class="back" href="/dashboard">Back to my training</a>
    <section class="panel">
      <div class="athlete-head">
        <h1>Book training for ${esc(athlete.first_name)}</h1>
        <span class="chip">${esc(athlete.age_group)}</span>
      </div>
      ${programs.length ? programs.map((p) => `
        <div class="program">
          <h2>${esc(p.name)}</h2>
          ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ""}
          <p class="rule">${ruleLine(p)}</p>
          <ul class="sess-list">${p.sessions.map((s) => sessionRow(p, s, athlete)).join("")}</ul>
        </div>`).join("")
      : `<div class="empty"><p>No upcoming training for ${esc(athlete.age_group)} right now.</p><p class="muted">New sessions show up here as soon as they're posted.</p></div>`}
    </section>`,
  });

module.exports = { dashboardPage, bookPage };
