const { esc, layout } = require("./layout");
const { fmtTime, itemLabel } = require("../time");
const { typeLabel } = require("../rounds");

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return `${DAYS[dt.getUTCDay()]}, ${MON[m - 1]} ${d}`; };
const label = (s) => [s.is_main ? "" : s.round_name, s.section, s.title && s.is_main ? "" : typeLabel(s.activity, s.age_groups, s.required_tags)].filter(Boolean).join(" › ");
const page = (o) => layout({ ...o, tab: "checkin", wide: true });

function card(s) {
  const marked = s.here + s.noshow;
  return `<a class="ci-card" href="/checkin/${s.id}">
    <div class="ci-when">${s.starts_at ? `${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))}` : "No date"}</div>
    <div class="ci-what"><b>${esc(s.title || label(s))}</b><span class="fine">${esc(s.board_name)}${s.title ? ` · ${esc(label(s))}` : ""}</span></div>
    <div class="ci-count">${s.claimed ? `<b>${s.here}</b> here${s.noshow ? ` · ${s.noshow} no-show` : ""}<span class="fine">${marked < s.claimed ? `${s.claimed - marked} to mark` : "All marked ✓"}</span>` : `<span class="fine">No claims</span>`}</div>
  </a>`;
}

function dayPage({ user, flash, day, sessions, undated, prev, next, isToday }) {
  return page({ title: "Check-in", user, flash, body: `
    <section class="panel ci-head">
      <h1>Check-in</h1>
      <div class="ci-days">
        ${prev ? `<a class="btn-ghost" href="/checkin?d=${prev}">‹ ${esc(longDay(prev).split(",")[0])}</a>` : `<span></span>`}
        <div class="ci-day"><b>${esc(longDay(day))}</b>${isToday ? `<span class="pill ok">Today</span>` : `<a href="/checkin">Today</a>`}</div>
        ${next ? `<a class="btn-ghost" href="/checkin?d=${next}">${esc(longDay(next).split(",")[0])} ›</a>` : `<span></span>`}
      </div>
    </section>
    <section class="panel">
      ${sessions.length ? `<div class="ci-list">${sessions.map(card).join("")}</div>`
        : `<p class="muted">Nothing to take attendance for on this day.${next ? ` Next: <a href="/checkin?d=${next}">${esc(longDay(next))}</a>.` : ""}</p>`}
    </section>
    ${undated.length ? `<section class="panel"><h2>Without a date</h2><div class="ci-list">${undated.map(card).join("")}</div></section>` : ""}` });
}

function sessionPage({ user, flash, s, people, others }) {
  const here = people.filter((p) => p.attended === true).length, noshow = people.filter((p) => p.attended === false).length;
  const btn = (p, state, text, on) => `<form method="post" action="/checkin/${s.id}/mark"><input type="hidden" name="rid" value="${p.id}">
    <input type="hidden" name="state" value="${on ? "clear" : state}"><button class="ci-btn ${state}${on ? " on" : ""}" type="submit" aria-pressed="${on}">${text}</button></form>`;
  return page({ title: "Check-in", user, flash, body: `
    <a class="back" href="/checkin${s.starts_at ? `?d=${require("../time").localDate(s.starts_at)}` : ""}">All sessions</a>
    <section class="panel">
      <p class="label-like">${esc(s.board_name)}</p>
      <h1>${esc(s.title || label(s))}</h1>
      <p class="muted tight">${esc(itemLabel(s))}${s.title ? ` · ${esc(label(s))}` : ""}${s.location ? ` · 📍 ${esc(s.location)}` : ""}</p>
      ${s.tracked ? "" : `<p class="rule">Attendance isn't tracked for this one, but you can still mark it.</p>`}
      <div class="ci-summary"><span><b>${people.length}</b> claimed</span><span><b>${here}</b> here</span><span><b>${noshow}</b> no-show</span>
        <span><b>${people.length - here - noshow}</b> not marked</span></div>
      ${people.some((p) => p.attended == null) ? `<form method="post" action="/checkin/${s.id}/all"><button class="btn-small" type="submit">✓ Mark everyone else here</button></form>` : ""}
    </section>
    <section class="panel">
      ${people.length ? `<ul class="ci-people">${people.map((p) => `<li id="r${p.id}" class="${p.attended === true ? "is-here" : p.attended === false ? "is-out" : ""}">
        <div class="ci-name"><b>${esc(p.first_name)} ${esc(p.last_name)}</b>
          <span class="fine">${[p.grp, p.walk_in ? "walk-in" : "", p.note].filter(Boolean).map(esc).join(" · ")}</span></div>
        <div class="ci-actions">${btn(p, "here", "✓ Here", p.attended === true)}${btn(p, "noshow", "✗ No-show", p.attended === false)}</div>
      </li>`).join("")}</ul>` : `<p class="muted">No one has claimed this yet.</p>`}
    </section>
    <section class="panel">
      <h2>+ Walk-in</h2>
      ${others.length ? `<form method="post" action="/checkin/${s.id}/walkin" class="inline-add">
        <label>Who showed up<select name="athlete_id" required><option value="">Pick a person…</option>
          ${others.map((a) => `<option value="${a.id}">${esc(a.last_name)}, ${esc(a.first_name)}</option>`).join("")}</select></label>
        <button class="btn-small" type="submit">Add and mark here</button></form>`
        : `<p class="muted">Everyone on this board is already on the list.</p>`}
    </section>` });
}

module.exports = { dayPage, sessionPage };
