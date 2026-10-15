// Family-facing pages: a month calendar per athlete, and a day page to book from.
const { esc, layout } = require("./layout");
const { fmtRange, fmtDateTime, fmtDay, fmtTime, inputParts } = require("../time");
const { cancelDeadline, bookingOpen } = require("../booking");
const { ACTIVITY_COLORS, ACTIVITIES, LABELS } = require("../config");
const SC = require("../schedules");

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);
const localDate = (ts) => inputParts(ts).date;
const longDay = (isoDate) => { const d = parse(isoDate); return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const dot = (a) => `<span class="dot" style="background:${ACTIVITY_COLORS[a] || "#8d9db6"}"></span>`;

// ---------- shared pieces ----------

// "This round" summary: what the athlete has used, per activity
function usagePanel(programs, { title = "This round" } = {}) {
  const groups = new Map();
  for (const p of programs) {
    const key = p.round_id ? `r${p.round_id}` : `p${p.id}`;
    const g = groups.get(key) || { name: p.round_id ? p.round_name : p.name, unlock: p.round_id ? p.unlock_hours : null, items: new Map(),
      level: SC.labels({ labels: p.schedule_labels }).middle.one };
    if (!g.items.has(p.activity)) g.items.set(p.activity, { activity: p.activity, limit: p.limitsOn ? p.limit : null, used: p.used });
    groups.set(key, g);
  }
  if (!groups.size) return "";
  return `<section class="usage">${[...groups.values()].map((g) => {
    const items = [...g.items.values()].sort((a, b) => ACTIVITIES.indexOf(a.activity) - ACTIVITIES.indexOf(b.activity));
    const full = items.some((i) => i.limit != null && i.used >= i.limit);
    return `<div class="usage-round">
      <div class="usage-title">${esc(groups.size > 1 ? g.name : `This ${g.level.toLowerCase()}: ${g.name}`)}</div>
      <div class="usage-items">${items.map((i) => {
        const done = i.limit != null && i.used >= i.limit;
        return `<span class="usage-item${done ? " done" : ""}">${dot(i.activity)}<b>${esc(i.activity)}</b>
          <span>${i.limit == null ? "Unlimited" : `${Math.min(i.used, i.limit)} of ${i.limit} used`}</span></span>`;
      }).join("")}</div>
      ${full && g.unlock != null ? `<p class="fine">Used up? Spots still open ${g.unlock % 24 === 0 ? `${g.unlock / 24} day${g.unlock === 24 ? "" : "s"}` : `${g.unlock} hour${g.unlock === 1 ? "" : "s"}`} before a session open to everyone, and those don't count against your limit.</p>` : ""}
    </div>`;
  }).join("")}</section>`;
}

function cancelControl(r, back) {
  const deadline = cancelDeadline(r.starts_at, r.cancel_hours);
  const canCancel = r.status === "waitlisted" || new Date() < deadline;
  if (!canCancel) return `<span class="fine">Too late to give it up online. Contact your coach.</span>`;
  return `<form method="post" action="/reservations/${r.id}/cancel"
      onsubmit="return confirm('${r.status === "confirmed" ? "Give up this spot? It will open for someone else." : "Leave the waitlist?"}')">
      <input type="hidden" name="return_to" value="${esc(back)}">
      <button class="btn-ghost" type="submit">${r.status === "confirmed" ? "Give it up" : "Leave waitlist"}</button>
    </form>${r.status === "confirmed" ? `<span class="fine">Give it up by ${esc(fmtDateTime(deadline))}</span>` : ""}`;
}

function athleteTabs(athletes, current, hrefFor) {
  if (athletes.length < 2) return "";
  // (adults signing up themselves show as "Me")
  return `<nav class="ath-tabs" aria-label="${esc(LABELS.participants)}">${athletes.map((a) =>
    `<a href="${hrefFor(a)}"${a.id === current.id ? ' aria-current="page"' : ""}>${a.self_user_id ? "Me" : esc(a.first_name)}${a.age_group ? ` <span>${esc(a.age_group)}</span>` : ""}</a>`).join("")}</nav>`;
}

// ---------- calendar (My Training) ----------

function monthGrid(athlete, month, byDay, today) {
  const first = parse(`${month}-01`);
  const start = addDays(first, -first.getUTCDay());
  const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const end = addDays(nextMonth, (7 - nextMonth.getUTCDay()) % 7 - 1);
  const cells = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = iso(d);
    const inMonth = d.getUTCMonth() === first.getUTCMonth();
    const info = byDay.get(key);
    const past = key < today;
    if (!info || !inMonth) {
      cells.push(`<div class="cal-day${inMonth ? "" : " other"}${key === today ? " today" : ""}${past ? " past" : ""}"><span class="cal-num">${d.getUTCDate()}</span></div>`);
      continue;
    }
    cells.push(`<a class="cal-day has${info.mine ? " mine" : ""}${key === today ? " today" : ""}" href="/athletes/${athlete.id}/day/${key}"
        aria-label="${esc(longDay(key))}: ${info.activities.size} activit${info.activities.size === 1 ? "y" : "ies"}${info.mine ? `, ${info.mine} claimed` : ""}">
      <span class="cal-num">${d.getUTCDate()}</span>
      ${info.mine ? `<span class="cal-mine" aria-hidden="true">✓${info.mine > 1 ? info.mine : ""}</span>` : ""}
      <span class="cal-dots">${[...info.activities].map(dot).join("")}</span>
    </a>`);
  }
  return `<div class="pcal"><div class="pcal-dow">${DOW.map((x) => `<span>${x[0]}<i>${x.slice(1)}</i></span>`).join("")}</div>
    <div class="pcal-grid">${cells.join("")}</div></div>`;
}

function shiftMonth(month, n) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const selfCard = () => `<section class="panel self-card">
  <h2 class="banner">Sign up yourself</h2>
  <p class="muted">Some spots (like volunteer shifts) are for adults. Add yourself once, then you'll find a "Me" tab here.</p>
  <form method="post" action="/me" class="inline-add">
    <label>First name<input name="first_name" required maxlength="40" autocomplete="given-name"></label>
    <label>Last name<input name="last_name" required maxlength="40" autocomplete="family-name"></label>
    <button class="btn-small" type="submit">Add me</button>
  </form></section>`;

function dashboardPage({ user, athletes, athlete, programs, reservations, month, admin, flash, canSelf }) {
  if (!athletes.length) return layout({ title: "My claims", user, admin, flash, tab: "home",
    body: `<section class="panel"><h1>Welcome to ${esc(LABELS.app_name)}</h1>
      <div class="empty"><p>No ${esc(LABELS.participants.toLowerCase())} are linked to this email yet.</p>
        <p class="muted">If you signed in with a different email than the one you gave us, sign out and try that one. Otherwise, contact us and we'll link your ${esc(LABELS.participant.toLowerCase())}.</p></div></section>
      ${canSelf ? selfCard() : ""}` });

  const today = inputParts(new Date()).date;
  const byDay = new Map();
  for (const p of programs) for (const s of p.sessions) {
    const k = localDate(s.starts_at);
    const info = byDay.get(k) || { activities: new Set(), mine: 0 };
    info.activities.add(p.activity);
    if (s.my_status) info.mine++;
    byDay.set(k, info);
  }
  const mine = reservations.filter((r) => r.athlete_id === athlete.id);
  const [y, m] = month.split("-").map(Number);
  const href = (mo) => `/dashboard?a=${athlete.id}&m=${mo}`;
  const curMonth = today.slice(0, 7);
  const activities = [...new Set(programs.map((p) => p.activity))].sort((a, b) => ACTIVITIES.indexOf(a) - ACTIVITIES.indexOf(b));
  const nextDay = [...byDay.keys()].filter((k) => k >= today).sort()[0];

  return layout({
    title: "My claims", user, admin, flash, tab: "home",
    body: `${athleteTabs(athletes, athlete, (a) => `/dashboard?a=${a.id}&m=${month}`)}
    <section class="panel athlete">
      <div class="athlete-head"><h1>${esc(athlete.first_name)} ${esc(athlete.last_name)}</h1>
        ${athlete.age_group ? `<span class="chip">${esc(athlete.age_group)}</span>` : ""}</div>
      ${!athlete.age_group && !athlete.self_user_id && !programs.length ? `<p class="muted">${esc(athlete.first_name)} doesn't have a ${esc(LABELS.group.toLowerCase())} yet, so nothing is shown. Contact us to fix this.</p>` : `
      ${usagePanel(programs)}
      <div class="month-head">
        ${month > curMonth ? `<a class="month-nav" href="${href(shiftMonth(month, -1))}" aria-label="Previous month">‹</a>` : `<span class="month-nav off" aria-hidden="true">‹</span>`}
        <h2>${MON[m - 1]} ${y}</h2>
        <a class="month-nav" href="${href(shiftMonth(month, 1))}" aria-label="Next month">›</a>
      </div>
      ${monthGrid(athlete, month, byDay, today)}
      <div class="pcal-legend">${activities.map((a) => `<span>${dot(a)}${esc(a)}</span>`).join("")}<span><span class="cal-mine sm">✓</span>Claimed</span></div>
      ${byDay.size ? `<p class="fine">Tap a day to see what's open and claim a spot.${nextDay && nextDay.slice(0, 7) !== month ? ` Next training: <a href="/athletes/${athlete.id}/day/${nextDay}">${esc(longDay(nextDay))}</a>.` : ""}</p>`
        : `<div class="empty"><p>Nothing open to claim right now.</p><p class="muted">New spots show up here as soon as they're posted.</p></div>`}`}
    </section>

    <section class="panel">
      <h2 class="banner">Upcoming for ${athlete.self_user_id ? "you" : esc(athlete.first_name)}</h2>
      ${mine.length ? `<ul class="res-list">${mine.map((r) => `<li class="res">
        <a class="res-main res-link" href="/athletes/${athlete.id}/day/${localDate(r.starts_at)}">
          <div class="res-when">${esc(fmtRange(r.starts_at, r.ends_at))}</div>
          <div class="res-what">${esc(r.program_name)}${r.location ? `, ${esc(r.location)}` : ""}</div></a>
        <div class="res-side">${r.status === "confirmed" ? `<span class="pill ok">Claimed</span>` : `<span class="pill wait">Waitlist #${r.wait_pos}</span>`}
          ${cancelControl(r, `/dashboard?a=${athlete.id}&m=${month}`)}</div></li>`).join("")}</ul>`
        : `<p class="muted">Nothing claimed yet. Pick a day on the calendar to get started.</p>`}
    </section>
    ${canSelf ? selfCard() : ""}`,
  });
}

// ---------- day page ----------

const atLimit = (p) => p.limit != null && p.limitsOn && p.used >= p.limit;
const blocked = (p, s) => atLimit(p) && !s.unlocked;

function actionFor(p, s, athlete, back, compact) {
  const open = s.capacity - s.confirmed;
  if (s.my_status) {
    const r = { id: s.my_id, status: s.my_status, starts_at: s.starts_at, cancel_hours: p.cancel_hours };
    return `${s.my_status === "confirmed" ? `<span class="pill ok">Claimed</span>` : `<span class="pill wait">Waitlist #${s.my_pos}</span>`}
      ${compact ? `<form method="post" action="/reservations/${s.my_id}/cancel" onsubmit="return confirm('Give up this spot?')">
          <input type="hidden" name="return_to" value="${esc(back)}"><button class="link-dark sm" type="submit">Give it up</button></form>` : cancelControl(r, back)}`;
  }
  if (!bookingOpen(p)) return `<button class="btn-small" disabled>${compact ? "Soon" : `Opens ${esc(fmtDateTime(p.booking_opens_at))}`}</button>`;
  if (open <= 0 && !p.waitlistOn) return `<button class="btn-small" disabled>Full</button>`;
  if (blocked(p, s)) return `<button class="btn-small" disabled>${compact ? "Limit" : "Limit reached"}</button>` +
    (s.unlocksAt ? `<span class="fine unlock-hint">${compact ? `Opens ${esc(fmtDay(s.unlocksAt))}` : `Opens to all ${esc(fmtDateTime(s.unlocksAt))}`}</span>` : "");
  return `<form method="post" action="/athletes/${athlete.id}/book">
      <input type="hidden" name="session_id" value="${s.id}"><input type="hidden" name="return_to" value="${esc(back)}">
      <button class="${open > 0 ? "btn-small" : "btn-small secondary"}" type="submit">${open > 0 ? "Claim it" : compact ? "Waitlist" : "Join waitlist"}</button>
    </form>`;
}

// "Going (3): Ava S., Bea J., Cy J." with the current athlete highlighted
function goingLine(list, athlete, compact) {
  if (!list || !list.length) return compact ? "" : `<div class="going none">No one yet. Be the first!</div>`;
  const names = list.map((g) => g.id === athlete.id ? `<b>${esc(g.name)}</b>` : esc(g.name)).join(", ");
  if (compact) return `<div class="going sm">${names}</div>`;
  return list.length > 8
    ? `<details class="going"><summary>Going (${list.length})</summary>${names}</details>`
    : `<div class="going"><span>Going (${list.length}):</span> ${names}</div>`;
}

function sessionCard(p, s, athlete, back, going, showNames) {
  const open = s.capacity - s.confirmed;
  const spots = open > 0 ? `${open} of ${s.capacity} spots open` : `Full${p.waitlistOn && s.waitlisted ? `, ${s.waitlisted} on waitlist` : ""}`;
  return `<li class="sess${open > 0 ? "" : " full"}${s.my_status ? " mine" : ""}">
    <div class="sess-main">
      <div class="sess-time">${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))}</div>
      <div class="sess-meta">${[s.location, s.coach && `Coach ${s.coach}`].filter(Boolean).map(esc).join(", ")}</div>
      ${s.notes ? `<div class="sess-meta">${esc(s.notes)}</div>` : ""}
      <div class="spots">${spots}${s.unlocked && open > 0 && !s.my_status ? ` <span class="pill open-all">Open to all</span>` : ""}</div>
      ${showNames ? goingLine(going[s.id], athlete) : ""}
    </div>
    <div class="sess-side">${actionFor(p, s, athlete, back)}</div>
  </li>`;
}

function blockGrid(p, list, athlete, back, going, showNames) {
  return `<div class="sess-meta">${esc(fmtTime(list[0].starts_at))}–${esc(fmtTime(list[list.length - 1].ends_at))}${list[0].location ? `, ${esc(list[0].location)}` : ""}</div>
    <div class="block-grid">${list.map((s) => {
      const open = s.capacity - s.confirmed;
      return `<div class="block${s.my_status ? " mine" : open > 0 ? "" : " full"}">
        <div class="block-time">${esc(fmtTime(s.starts_at))}</div>
        <div class="block-open">${s.my_status ? "&nbsp;" : open > 0 ? `${open} open${s.unlocked ? " · all" : ""}` : "Full"}</div>
        ${showNames ? goingLine(going[s.id], athlete, true) : ""}
        ${actionFor(p, s, athlete, back, true)}
      </div>`;
    }).join("")}</div>`;
}

function dayPage({ user, athletes, athlete, programs, date, prevDay, nextDay, admin, flash, going = {}, showNames }) {
  const back = `/athletes/${athlete.id}/day/${date}`;
  const todays = programs.map((p) => ({ ...p, today: p.sessions.filter((s) => localDate(s.starts_at) === date) })).filter((p) => p.today.length)
    .sort((a, b) => ACTIVITIES.indexOf(a.activity) - ACTIVITIES.indexOf(b.activity) || a.today[0].starts_at - b.today[0].starts_at);
  const relevant = programs.filter((p) => todays.some((t) => (t.round_id && t.round_id === p.round_id) || t.id === p.id));
  return layout({
    title: longDay(date), user, admin, flash, tab: "home",
    body: `${athleteTabs(athletes, athlete, (a) => `/athletes/${a.id}/day/${date}`)}
    <div class="day-nav">
      <a class="back" href="/dashboard?a=${athlete.id}&m=${date.slice(0, 7)}">Calendar</a>
      <span class="spacer"></span>
      ${prevDay ? `<a class="month-nav" href="/athletes/${athlete.id}/day/${prevDay}" aria-label="Previous training day">‹</a>` : `<span class="month-nav off">‹</span>`}
      ${nextDay ? `<a class="month-nav" href="/athletes/${athlete.id}/day/${nextDay}" aria-label="Next training day">›</a>` : `<span class="month-nav off">›</span>`}
    </div>
    <section class="panel">
      <div class="athlete-head"><h1>${esc(longDay(date))}</h1><span class="chip">${esc(athlete.first_name)}</span></div>
      ${admin ? `<p class="admin-hint"><a href="/admin/day/${date}">👥 Who's signed up this day</a> <span class="fine-inline">(admins only)</span></p>` : ""}
      ${usagePanel(relevant)}
      ${todays.length ? todays.map((p) => `<div class="program">
        <h2 class="banner">${esc(p.round_id ? p.name.replace(new RegExp(`^${p.round_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`), "") : p.name)}</h2>
        ${p.block_minutes ? blockGrid(p, p.today, athlete, back, going, showNames) : `<ul class="sess-list">${p.today.map((s) => sessionCard(p, s, athlete, back, going, showNames)).join("")}</ul>`}
      </div>`).join("") : `<div class="empty"><p>No training for ${esc(athlete.first_name)} on this day.</p></div>`}
    </section>`,
  });
}

module.exports = { dashboardPage, dayPage };
