// Family-facing pages: a month calendar per athlete, and a day page to book from.
const { esc, layout } = require("./layout");
const { fmtRange, fmtDateTime, fmtDay, fmtTime, inputParts } = require("../time");
const { cancelDeadline, bookingOpen } = require("../booking");
const { ACTIVITIES, LABELS, colorFor } = require("../config");
const SC = require("../schedules");
const { typeLabel } = require("../rounds");
const { itemLabel } = require("../time");
const P = require("../locations");

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);
const localDate = (ts) => inputParts(ts).date;
const longDay = (isoDate) => { const d = parse(isoDate); return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const dot = (a, sid) => `<span class="dot" style="background:${colorFor(a, sid)}"></span>`;

// ---------- shared pieces ----------

// "This round" summary: what the athlete has used, per activity
function usagePanel(programs, { title = "This round" } = {}) {
  const groups = new Map();
  for (const p of programs) {
    const key = p.round_id ? `r${p.round_id}` : `p${p.id}`;
    const g = groups.get(key) || { name: p.round_id ? p.round_name : p.name, unlock: p.round_id ? p.unlock_hours : null, items: new Map(),
      level: SC.labels({ labels: p.schedule_labels }).middle.one };
    if (!g.items.has(p.activity)) g.items.set(p.activity, { activity: p.activity, sid: p.schedule_id, limit: p.limitsOn ? p.limit : null, used: p.used });
    groups.set(key, g);
  }
  // Only boards/rounds that actually limit something are worth showing
  for (const [k, g] of groups) if (![...g.items.values()].some((i) => i.limit != null)) groups.delete(k);
  if (!groups.size) return "";
  return `<section class="usage">${[...groups.values()].map((g) => {
    const items = [...g.items.values()].sort((a, b) => ACTIVITIES.indexOf(a.activity) - ACTIVITIES.indexOf(b.activity));
    const full = items.some((i) => i.limit != null && i.used >= i.limit);
    return `<div class="usage-round">
      <div class="usage-title">${esc(groups.size > 1 ? g.name : `This ${g.level.toLowerCase()}: ${g.name}`)}</div>
      <div class="usage-items">${items.map((i) => {
        const done = i.limit != null && i.used >= i.limit;
        return `<span class="usage-item${done ? " done" : ""}">${dot(i.activity, i.sid)}<b>${esc(i.activity)}</b>
          <span>${i.limit == null ? "Unlimited" : `${Math.min(i.used, i.limit)} of ${i.limit} used`}</span></span>`;
      }).join("")}</div>
      ${full && g.unlock != null ? `<p class="fine">Used up? Spots still open ${g.unlock % 24 === 0 ? `${g.unlock / 24} day${g.unlock === 24 ? "" : "s"}` : `${g.unlock} hour${g.unlock === 1 ? "" : "s"}`} before a session open to everyone, and those don't count against your limit.</p>` : ""}
    </div>`;
  }).join("")}</section>`;
}

function cancelControl(r, back) {
  const deadline = r.starts_at ? cancelDeadline(r.starts_at, r.cancel_hours) : null; // undated items: no deadline
  const canCancel = r.status === "waitlisted" || !deadline || new Date() < deadline;
  if (!canCancel) return `<span class="fine">Too late to cancel in the app. Contact the organizer.</span>`;
  return `<form method="post" action="/reservations/${r.id}/cancel"
      onsubmit="return confirm('${r.status === "confirmed" ? "Cancel this spot? It will open for someone else." : "Leave the waitlist?"}')">
      <input type="hidden" name="return_to" value="${esc(back)}">
      <button class="btn-ghost" type="submit">${r.status === "confirmed" ? "Cancel my spot" : "Leave waitlist"}</button>
    </form>${r.status === "confirmed" && deadline ? `<span class="fine">Cancel by ${esc(fmtDateTime(deadline))}</span>` : ""}`;
}

function athleteTabs(athletes, current, hrefFor) {
  if (athletes.length < 2) return "";
  // (adults signing up themselves show as "Me")
  return `<nav class="ath-tabs" aria-label="${esc(LABELS.participants)}">${athletes.map((a) =>
    `<a href="${hrefFor(a)}"${a.id === current.id ? ' aria-current="page"' : ""}>${a.self_user_id ? "Me" : esc(a.first_name)}${(a.groups || []).length ? ` <span>${esc(a.groups.join(", "))}</span>` : ""}</a>`).join("")}</nav>`;
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
      <span class="cal-dots">${[...info.activities.values()].map(([a, sid]) => dot(a, sid)).join("")}</span>
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

// Claimable things with no date: a simple list, grouped by what they are
function itemsList(programs, athlete, back, going = {}) {
  const groups = programs.map((p) => ({ p, items: p.sessions.filter((s) => !s.starts_at) })).filter((g) => g.items.length);
  if (!groups.length) return "";
  return `<div class="items-list" id="items">${groups.map(({ p, items }) => `<div class="item-group">
    <h3 class="banner">${esc(require("../config").metaFor(p.activity, p.schedule_id).item_list ? p.schedule_name || p.activity
      : `${p.schedule_name ? `${p.schedule_name} › ` : ""}${p.section ? `${p.section} › ` : ""}${typeLabel(p.activity, p.age_groups, p.required_tags)}`)}</h3>
    ${p.event_date || p.event_location ? `<p class="event-line">${[p.event_date ? esc(require("./setup").eventDates(p)) : "", p.event_location ? P.link(p.event_location) : ""].filter(Boolean).join(" · ")}</p>` : ""}
    <ul class="sess-list">${items.map((s) => { const open = s.capacity - s.confirmed; return `<li class="sess${s.my_status ? " mine" : ""}${open > 0 ? "" : " full"}">
      <div class="sess-main"><div class="sess-time">${esc(s.title || "Spot")}</div>
        ${(s.only_groups || []).length || (s.only_tags || []).length ? `<div class="sess-meta">${esc([...(s.only_groups || []), ...(s.only_tags || [])].join(" or "))} only</div>` : ""}
        ${s.location ? `<div class="sess-meta">${P.link(s.location)}</div>` : ""}
        <div class="spots">${open > 0 ? `${open} of ${s.capacity} open` : "Full"}</div>
        ${(going[s.id] || []).length ? `<div class="going sm">${going[s.id].map((g) => g.id === athlete.id ? `<b>${esc(g.name)}</b>` : esc(g.name)).join(", ")}</div>` : ""}</div>
      <div class="sess-side">${actionFor(p, s, athlete, back)}</div></li>`; }).join("")}</ul></div>`).join("")}</div>`;
}

// The month as a day-by-day list, with a Claim button on each session
function monthList(programs, athlete, month, back) {
  const days = new Map();
  const add = (d, e) => { if (!days.has(d)) days.set(d, []); days.get(d).push(e); };
  for (const p of programs) {
    const dated = p.sessions.filter((s) => s.starts_at && localDate(s.starts_at).startsWith(month));
    if (p.block_minutes) { // split sessions (e.g. Cage Time): one row per day, pick a time on the day page
      const byDay = new Map();
      for (const s of dated) { const d = localDate(s.starts_at); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(s); }
      for (const [d, list] of byDay) add(d, { p, blocks: list, at: list[0].starts_at });
    } else for (const s of dated) add(d0(s), { p, s, at: s.starts_at });
  }
  function d0(s) { return localDate(s.starts_at); }
  if (!days.size) return `<div class="empty"><p>Nothing to claim this month.</p></div>`;
  return `<div class="month-list">${[...days.keys()].sort().map((d) => `<div class="ml-day">
    <h3 class="ml-date"><a href="/athletes/${athlete.id}/day/${d}">${esc(longDay(d))}</a></h3>
    <ul class="sess-list">${days.get(d).sort((a, b) => new Date(a.at) - new Date(b.at)).map((e) => {
      const label = (e.p.section ? `${e.p.section} › ` : "") + typeLabel(e.p.activity, e.p.age_groups, e.p.required_tags);
      if (e.blocks) {
        const openBlocks = e.blocks.filter((s) => s.capacity - s.confirmed > 0).length;
        const mine = e.blocks.some((s) => s.my_status);
        return `<li class="sess${mine ? " mine" : ""}" style="--c:${colorFor(e.p.activity, e.p.schedule_id)}">
          <div class="sess-main"><div class="sess-time"><span class="dot" style="background:var(--c)"></span> ${esc(fmtTime(e.blocks[0].starts_at))}–${esc(fmtTime(e.blocks[e.blocks.length - 1].ends_at))}</div>
            <div class="sess-meta">${esc(label)}</div><div class="spots">${openBlocks} of ${e.blocks.length} times open</div></div>
          <div class="sess-side">${mine ? `<span class="pill ok">Claimed</span>` : ""}<a class="btn-small" href="/athletes/${athlete.id}/day/${d}#p${e.p.id}">Pick a time</a></div></li>`;
      }
      const s = e.s, open = s.capacity - s.confirmed;
      return `<li class="sess${s.my_status ? " mine" : ""}${open > 0 ? "" : " full"}" style="--c:${colorFor(e.p.activity, e.p.schedule_id)}">
        <div class="sess-main"><div class="sess-time"><span class="dot" style="background:var(--c)"></span> ${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))}${s.title ? `, ${esc(s.title)}` : ""}</div>
          <div class="sess-meta">${esc(label)}${s.location ? ` · ${P.link(s.location)}` : ""}</div>
          <div class="spots">${open > 0 ? `${open} of ${s.capacity} open` : "Full"}</div></div>
        <div class="sess-side">${actionFor(e.p, s, athlete, back)}</div></li>`;
    }).join("")}</ul></div>`).join("")}</div>`;
}

function dashboardPage({ user, athletes, athlete, programs, reservations, month, admin, flash, canSelf, view = "cal", canSwitch = false, going = {} }) {
  if (!athletes.length) return layout({ title: "My claims", user, admin, flash, tab: "home",
    body: `<section class="panel"><h1>Welcome to ${esc(LABELS.app_name)}</h1>
      <div class="empty"><p>No ${esc(LABELS.participants.toLowerCase())} are linked to this email yet.</p>
        <p class="muted">If you signed in with a different email than the one you gave us, sign out and try that one. Otherwise, contact us and we'll link your ${esc(LABELS.participant.toLowerCase())}.</p></div></section>
      ${canSelf ? selfCard() : ""}` });

  const today = inputParts(new Date()).date;
  const byDay = new Map();
  for (const p of programs) for (const s of p.sessions) {
    if (!s.starts_at) continue; // undated items are listed below the calendar
    const k = localDate(s.starts_at);
    const info = byDay.get(k) || { activities: new Map(), mine: 0 };
    info.activities.set(`${p.schedule_id}|${p.activity}`, [p.activity, p.schedule_id]);
    if (s.my_status) info.mine++;
    byDay.set(k, info);
  }
  const mine = reservations.filter((r) => r.athlete_id === athlete.id);
  const [y, m] = month.split("-").map(Number);
  const href = (mo) => `/dashboard?a=${athlete.id}&m=${mo}`;
  const curMonth = today.slice(0, 7);
  const activities = [...new Map(programs.map((p) => [`${p.schedule_id}|${p.activity}`, [p.activity, p.schedule_id]])).values()]
    .sort((a, b) => ACTIVITIES.indexOf(a[0]) - ACTIVITIES.indexOf(b[0]));
  const nextDay = [...byDay.keys()].filter((k) => k >= today).sort()[0];

  return layout({
    title: "My claims", user, admin, flash, tab: "home",
    body: `${athleteTabs(athletes, athlete, (a) => `/dashboard?a=${a.id}&m=${month}`)}
    <section class="panel athlete">
      <div class="athlete-head"><h1>${esc(athlete.first_name)} ${esc(athlete.last_name)}</h1>
        ${(athlete.groups || []).length ? `<span class="chip">${esc(athlete.groups.join(", "))}</span>` : ""}</div>
      ${!athlete.on_roster && !athlete.self_user_id && !programs.length ? `<p class="muted">${esc(athlete.first_name)} isn't on a schedule's roster yet, so nothing is shown. Contact us to fix this.</p>` : `
      ${usagePanel(programs)}
      ${byDay.size || !programs.some((p) => p.sessions.some((x) => !x.starts_at)) ? `<div class="month-head">
        ${month > curMonth ? `<a class="month-nav" href="${href(shiftMonth(month, -1))}" aria-label="Previous month">‹</a>` : `<span class="month-nav off" aria-hidden="true">‹</span>`}
        <h2>${MON[m - 1]} ${y}</h2>
        <a class="month-nav" href="${href(shiftMonth(month, 1))}" aria-label="Next month">›</a>
      </div>
      ${canSwitch ? `<nav class="view-switch" aria-label="View">
        <a href="${href(month)}&v=cal"${view === "cal" ? ' aria-current="page"' : ""}>📅 Calendar</a>
        <a href="${href(month)}&v=list"${view === "list" ? ' aria-current="page"' : ""}>☰ List</a></nav>` : ""}
      ${view === "list" ? monthList(programs, athlete, month, `${href(month)}&v=list`) : monthGrid(athlete, month, byDay, today)}
      <div class="pcal-legend">${activities.map(([a, sid]) => `<span>${dot(a, sid)}${esc(a)}</span>`).join("")}<span><span class="cal-mine sm">✓</span>Claimed</span></div>` : ""}
      ${itemsList(programs, athlete, `/dashboard?a=${athlete.id}&m=${month}`, going)}
      ${byDay.size ? `<p class="fine">${view === "list" ? "Tap a date to see who's going." : "Tap a day to see what's open and claim a spot."}${nextDay && nextDay.slice(0, 7) !== month ? ` Next training: <a href="/athletes/${athlete.id}/day/${nextDay}">${esc(longDay(nextDay))}</a>.` : ""}</p>`
        : programs.some((p) => p.sessions.some((s) => !s.starts_at)) ? "" : `<div class="empty"><p>Nothing open to claim right now.</p><p class="muted">New spots show up here as soon as they're posted.</p></div>`}`}
    </section>

    <section class="panel">
      <h2 class="banner">Upcoming for ${athlete.self_user_id ? "you" : esc(athlete.first_name)}</h2>
      ${mine.length ? `<ul class="res-list">${mine.map((r) => `<li class="res">
        <a class="res-main res-link" href="${r.starts_at ? `/athletes/${athlete.id}/day/${localDate(r.starts_at)}` : `/dashboard?a=${athlete.id}#items`}">
          <div class="res-when">${esc(itemLabel(r))}</div>
          <div class="res-what">${esc(r.program_name)}</div></a>${r.location ? `<div class="res-loc">${P.link(r.location)}</div>` : ""}
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
    return `${s.my_status === "confirmed" ? `<span class="pill ok">Claimed</span>` : `<span class="pill wait">Waitlist #${s.my_pos}</span>`}${s.my_note ? `<span class="my-note">${esc(s.my_note)}</span>` : ""}
      ${compact ? `<form method="post" action="/reservations/${s.my_id}/cancel" onsubmit="return confirm('Cancel this spot?')">
          <input type="hidden" name="return_to" value="${esc(back)}"><button class="link-dark sm" type="submit">Cancel</button></form>` : cancelControl(r, back)}`;
  }
  if (!bookingOpen(p)) return `<button class="btn-small" disabled>${compact ? "Soon" : `Opens ${esc(fmtDateTime(p.booking_opens_at))}`}</button>`;
  if (open <= 0 && !p.waitlistOn) return `<button class="btn-small" disabled>Full</button>`;
  if (blocked(p, s)) return `<button class="btn-small" disabled>${compact ? "Limit" : "Limit reached"}</button>` +
    (s.unlocksAt ? `<span class="fine unlock-hint">${compact ? `Opens ${esc(fmtDay(s.unlocksAt))}` : `Opens to all ${esc(fmtDateTime(s.unlocksAt))}`}</span>` : "");
  return `<form method="post" action="/athletes/${athlete.id}/book" class="${p.ask_note ? "claim-note" : ""}">
      <input type="hidden" name="session_id" value="${s.id}"><input type="hidden" name="return_to" value="${esc(back)}">
      ${p.ask_note ? `<input name="note" maxlength="120"${p.note_required ? " required" : ""} placeholder="${esc((p.note_label || "Your answer") + (p.note_required ? "" : " (optional)"))}" aria-label="${esc(p.note_label || "Your answer")}">` : ""}
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
      <div class="sess-meta">${[s.location ? P.link(s.location) : "", s.coach ? esc(`Coach ${s.coach}`) : ""].filter(Boolean).join(" · ")}</div>
      ${s.notes ? `<div class="sess-meta">${esc(s.notes)}</div>` : ""}
      <div class="spots">${spots}${s.unlocked && open > 0 && !s.my_status ? ` <span class="pill open-all">Open to all</span>` : ""}</div>
      ${showNames(p.id) ? goingLine(going[s.id], athlete) : ""}
    </div>
    <div class="sess-side">${actionFor(p, s, athlete, back)}</div>
  </li>`;
}

function blockGrid(p, list, athlete, back, going, showNames) {
  return `<div class="sess-meta">${esc(fmtTime(list[0].starts_at))}–${esc(fmtTime(list[list.length - 1].ends_at))}${list[0].location ? ` · ${P.link(list[0].location)}` : ""}</div>
    <div class="block-grid">${list.map((s) => {
      const open = s.capacity - s.confirmed;
      return `<div class="block${s.my_status ? " mine" : open > 0 ? "" : " full"}">
        <div class="block-time">${esc(fmtTime(s.starts_at))}</div>
        <div class="block-open">${s.my_status ? "&nbsp;" : open > 0 ? `${open} open${s.unlocked ? " · all" : ""}` : "Full"}</div>
        ${showNames(p.id) ? goingLine(going[s.id], athlete, true) : ""}
        ${actionFor(p, s, athlete, back, true)}
      </div>`;
    }).join("")}</div>`;
}

function dayPage({ user, athletes, athlete, programs, date, prevDay, nextDay, admin, flash, going = {}, showNames = () => true }) {
  const back = `/athletes/${athlete.id}/day/${date}`;
  const todays = programs.map((p) => ({ ...p, today: p.sessions.filter((s) => s.starts_at && localDate(s.starts_at) === date) })).filter((p) => p.today.length)
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
        <h2 class="banner">${esc(p.round_id ? (p.section ? `${p.section} › ` : "") + typeLabel(p.activity, p.age_groups, p.required_tags) : p.name)}</h2>
        ${p.block_minutes ? blockGrid(p, p.today, athlete, back, going, showNames) : `<ul class="sess-list">${p.today.map((s) => sessionCard(p, s, athlete, back, going, showNames)).join("")}</ul>`}
      </div>`).join("") : `<div class="empty"><p>No training for ${esc(athlete.first_name)} on this day.</p></div>`}
    </section>`,
  });
}

module.exports = { dashboardPage, dayPage };
