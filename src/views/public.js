const { esc, layout } = require("./layout");
const { ACTIVITY_COLORS, LABELS } = require("../config");
const { fmtTime, fmtDateTime } = require("../time");
const { typeLabel } = require("../rounds");
const SC = require("../schedules");

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return `${DAYS[dt.getUTCDay()]}, ${MON[m - 1]} ${d}`; };
const pub = (o) => layout({ ...o, pub: true });
const opensLater = (s) => s.booking_opens_at && new Date(s.booking_opens_at) > new Date();

function slotAction(r, s) {
  const open = s.capacity - s.confirmed;
  if (opensLater(s)) return `<span class="btn-small" aria-disabled="true">Opens ${esc(fmtDateTime(s.booking_opens_at))}</span>`;
  const wl = s.program_waitlist != null ? s.program_waitlist : r.waitlist;
  if (open <= 0 && !wl) return `<button class="btn-small" disabled>Full</button>`;
  return `<a class="${open > 0 ? "btn-small" : "btn-small secondary"}" href="/s/${r.share_token}/${s.id}">${open > 0 ? "Sign up" : "Join waitlist"}</a>`;
}

function sheetPage({ user, round: r, slots, flash }) {
  const L = SC.labels({ labels: r.schedule_labels });
  const days = [...new Set(slots.map((s) => s.day))];
  return pub({
    title: r.name, user, flash,
    body: `<section class="panel">
      <p class="label-like">${esc(r.schedule_name || "")}</p>
      <h1>${esc(r.name)}</h1>
      ${r.location ? `<p class="muted tight">${esc(r.location)}</p>` : ""}
      ${user ? `<p class="fine">Signed in as ${esc(user.email)}. Your sign-ups also show under <a href="/dashboard">My Sign-Ups</a>.</p>`
        : `<p class="fine">Pick a time and enter a name and email. No account needed. Already signed up? <a href="/">Sign in</a> with your email to see or cancel.</p>`}
    </section>
    ${days.length ? days.map((d) => `<section class="panel pub-day">
      <h2 class="banner">${esc(longDay(d))}</h2>
      <ul class="sess-list">${slots.filter((s) => s.day === d).map((s) => {
        const open = s.capacity - s.confirmed;
        return `<li class="sess${open > 0 ? "" : " full"}" style="--c:${ACTIVITY_COLORS[s.activity] || "#8d9db6"}">
          <div class="sess-main">
            <div class="sess-time"><span class="dot" style="background:var(--c)"></span> ${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))}</div>
            <div class="sess-meta">${esc(typeLabel(s.activity, s.age_groups))}${s.coach ? `, ${esc(s.coach)}` : ""}</div>
            <div class="spots">${open > 0 ? `${open} of ${s.capacity} open` : "Full"}</div>
            ${s.going && s.going.length ? `<div class="going"><span>Going:</span> ${s.going.map(esc).join(", ")}</div>` : ""}
          </div>
          <div class="sess-side">${slotAction(r, s)}</div></li>`;
      }).join("")}</ul></section>`).join("")
      : `<section class="panel"><div class="empty"><p>No open ${esc(L.slot.many.toLowerCase())} right now.</p></div></section>`}`,
  });
}

function formPage({ user, round: r, slot: s, values = {}, err }) {
  return pub({
    title: `Sign up · ${r.name}`, user, flash: { err },
    body: `<a class="back" href="/s/${r.share_token}">All times</a>
    <section class="panel">
      <p class="label-like">${esc(r.name)}</p>
      <h1>${esc(longDay(s.day))}</h1>
      <p class="lede"><strong>${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))}</strong> · ${esc(typeLabel(s.activity, s.age_groups))}${r.location ? ` · ${esc(r.location)}` : ""}</p>
      <form method="post" action="/s/${r.share_token}/${s.id}" class="stack">
        <div class="pair"><div><label>First name<input name="first_name" required maxlength="40" value="${esc(values.first_name)}" autocomplete="given-name"></label></div>
          <div><label>Last name<input name="last_name" required maxlength="40" value="${esc(values.last_name)}" autocomplete="family-name"></label></div></div>
        <label>Your email<input type="email" name="email" required value="${esc(values.email)}" autocomplete="email" inputmode="email"></label>
        <p class="fine">Name the person who's coming (you, or your child). We'll email the confirmation here.</p>
        <div class="hp" aria-hidden="true"><label>Leave blank<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <button class="btn" type="submit">Sign up</button>
      </form>
    </section>`,
  });
}

function donePage({ user, round: r, slot: s, values, status }) {
  return pub({
    title: "Signed up", user,
    body: `<section class="panel done-card">
      <h1>${status === "confirmed" ? "You're signed up!" : "You're on the waitlist"}</h1>
      <p class="lede"><strong>${esc(values.first_name)} ${esc(values.last_name)}</strong>, ${esc(longDay(s.day))}, ${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))} (${esc(typeLabel(s.activity, s.age_groups))}).</p>
      <p>We emailed a confirmation to <strong>${esc(values.email)}</strong>. To see or cancel your sign-ups, <a href="/">sign in</a> with that email.</p>
      <p><a class="btn-small" href="/s/${r.share_token}">Sign up for another time</a></p>
    </section>`,
  });
}

const closedPage = ({ user }) => pub({
  title: "Sign-up closed", user,
  body: `<section class="panel"><h1>This sign-up isn't open</h1><p class="lede">The link may have expired, or the sign-up isn't published yet. Check with the organizer.</p></section>`,
});

module.exports = { sheetPage, formPage, donePage, closedPage };
