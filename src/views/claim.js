// What people see. Big, simple, one question per screen.
const { esc, layout } = require("./layout");
const { slotName, fmtDateTime, inputParts } = require("../time");
const P = require("../locations");

const page = (o) => layout({ ...o, tab: "home" });
const who = (p) => (p && p.self_user_id ? "you" : p ? p.first_name : "");
const Who = (p) => (p && p.self_user_id ? "You" : p ? p.first_name : "");
const evDates = (b) => (b.event_date ? require("./setup").eventDates(b) : "");

function homePage({ user, flash, upcoming, boards, extra, admin }) {
  return page({ title: "My Claims", user, flash, admin,
    body: `<h1 class="mc-title">My Claims</h1>
    ${extra.length ? `<section class="panel mc-extra"><h2>🔓 Extra spots open</h2>
      <p>These still have open spots. They can be claimed even if a limit was reached, and they don't count toward it.</p>
      <ul class="mc-rows">${extra.map((x) => `<li><div class="mc-what"><b>${esc(slotName(x.row.item))}</b>
          <span>${esc([x.board.name, ...x.row.chain.map((n) => n.name)].join(" › "))} · ${x.row.open} open</span></div>
        <a class="btn-small big" href="/b/${x.board.id}?p=${x.person.id}#i${x.row.item.id}">Claim for ${esc(Who(x.person))}</a></li>`).join("")}</ul></section>` : ""}
    <section class="panel"><h2>Your upcoming claims</h2>
      ${upcoming.length ? `<ul class="mc-rows">${upcoming.map((c) => `<li class="${c.status === "waitlisted" ? "wl" : ""}">
        <div class="mc-what"><b>${esc(slotName(c))}</b><span>${esc(c.self_user_id ? "You" : c.first_name)} · ${esc([c.board_name, c.path].filter(Boolean).join(" › "))}${c.status === "waitlisted" ? " · <b>on the waitlist</b>" : ""}</span>
          ${c.location ? `<span>${P.link(c.location)}</span>` : ""}</div>
        <form method="post" action="/claims/${c.id}/cancel" onsubmit="return confirm('Cancel this spot? It will open for someone else.')"><input type="hidden" name="back" value="/dashboard">
          <button class="btn-ghost" type="submit">Cancel</button></form></li>`).join("")}</ul>`
        : `<p class="muted big">Nothing claimed yet. Pick something to sign up for below.</p>`}
    </section>
    <section class="panel"><h2>Sign up for something</h2>
      ${boards.length ? `<div class="mc-boards">${boards.map(({ board: b }) => `<a class="mc-board" href="/b/${b.id}">
          <b>${esc(b.name)}</b>
          ${evDates(b) || b.event_location ? `<span>${esc([evDates(b), b.event_location].filter(Boolean).join(" · "))}</span>` : ""}
          ${b.description ? `<span class="desc">${esc(b.description.split(/\n/)[0].slice(0, 140))}</span>` : ""}
          <span class="go">Sign up ›</span></a>`).join("")}</div>`
        : `<p class="muted big">There's nothing open for you to sign up for right now.</p>`}
    </section>` });
}

function whoPage({ user, flash, board, who: people }) {
  return page({ title: board.name, user, flash,
    body: `<a class="back" href="/dashboard">My Claims</a>
    <section class="panel mc-who"><p class="mc-board-name">${esc(board.name)}</p><h1>Who's signing up?</h1>
      <div class="who-grid">${people.map((p) => `<a class="who-btn" href="/b/${board.id}?p=${p.id || "me"}">${p.self_user_id ? "Me" : esc(p.first_name)}
        ${p.self_user_id ? `<span>Signing up myself</span>` : p.last_name ? `<span>${esc(p.first_name)} ${esc(p.last_name)}</span>` : ""}</a>`).join("")}</div>
      <p class="fine">You'll sign up one person at a time. You can switch to someone else afterward.</p></section>` });
}

function rowHtml(board, person, r, back) {
  const it = r.item, q = board.question || {};
  let action;
  if (r.mine) {
    const canCancel = !r.cancelBy || new Date() < new Date(r.cancelBy);
    action = `<span class="state ok">${r.mine.status === "waitlisted" ? "On the waitlist" : `Claimed ✓`}</span>
      ${canCancel ? `<form method="post" action="/claims/${r.mine.id}/cancel" onsubmit="return confirm('Cancel this spot?')"><input type="hidden" name="back" value="${esc(back)}"><button class="link-dark" type="submit">Cancel</button></form>`
        : `<span class="fine">Too late to cancel in the app${board.contact_name || board.contact_info ? `. Contact ${esc([board.contact_name, board.contact_info].filter(Boolean).join(", "))}` : ""}.</span>`}`;
  } else if (r.canClaim) {
    action = `<form method="post" action="/b/${board.id}/claim" class="claim-f"><input type="hidden" name="p" value="${person.id}"><input type="hidden" name="item" value="${it.id}"><input type="hidden" name="back" value="${esc(back)}">
      ${q.label ? `<input name="note" maxlength="120"${q.required ? " required" : ""} placeholder="${esc(q.label)}${q.required ? "" : " (optional)"}" aria-label="${esc(q.label)}">` : ""}
      <button class="btn-small big" type="submit">${r.full ? "Join waitlist" : "Claim"}</button></form>`;
  } else if (r.blockedBy) action = `<span class="state">${esc(Who(person))} ${person.self_user_id ? "have" : "has"} claimed the ${r.blockedBy.limit} allowed ${r.blockedBy.kind === "board" ? "on this board" : `in ${esc(r.blockedBy.name)}`}</span>`;
  else action = `<span class="state">${esc(r.full ? "Full" : r.reason || "Not available")}</span>`;
  return `<li id="i${it.id}" class="${r.mine ? "mine" : ""}${r.leftover && !r.mine ? " lo" : ""}">
    <div class="mc-what"><b>${esc(slotName(it))}</b>
      <span>${r.mine ? "" : r.full ? "Full" : `${r.open} of ${it.capacity} open`}${r.leftover && !r.mine ? ` · <b class="lo-tag">🔓 Open to everyone</b> <span class="fine">(doesn't count toward limits)</span>` : ""}${(it.location || r.eff.location) ? ` · ${P.link(it.location || r.eff.location)}` : ""}</span></div>
    <div class="mc-act">${action}</div></li>`;
}

function boardPage({ user, flash, board, person, who: people, view, mode, month, day }) {
  const rows = view.items;
  const dated = rows.some((r) => r.item.starts_at);
  const base = `/b/${board.id}?p=${person.self_user_id ? "me" : person.id}`;
  const back = `${base}${mode === "cal" ? "&v=cal" : ""}${month ? `&m=${month}` : ""}${day ? `&d=${day}` : ""}`;
  // group rows by where they sit (Round 1 › 12U–18U › Hitting)
  const groupRows = (list) => { const g = new Map(); for (const r of list) { const k = r.chain.map((n) => n.name).join(" › "); if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return g; };
  const listHtml = (list) => list.length ? [...groupRows(list)].map(([k, rs]) => `<section class="mc-group">${k ? `<h3>${esc(k)}</h3>` : ""}<ul class="mc-rows">${rs.map((r) => rowHtml(board, person, r, back)).join("")}</ul></section>`).join("")
    : `<p class="muted big">Nothing here${day ? " on this day" : ""}.</p>`;
  const where = (L) => (L.kind === "board" ? "on this board" : `in ${esc(L.name)}`);
  const limitNotes = view.limits.map((L) => L.left
    ? `<li>${esc(Who(person))} can claim <b>${L.left}</b> more ${where(L)} <span class="fine">(${L.used} of ${L.limit} used)</span></li>`
    : `<li>${esc(Who(person))} ${person.self_user_id ? "have" : "has"} used <b>all ${L.limit}</b> ${where(L)}</li>`);
  const extra = rows.filter((r) => r.leftover && r.canClaim && r.open > 0);
  // calendar
  let cal = "";
  if (mode === "cal" && dated) {
    const first = rows.find((r) => r.item.starts_at && new Date(r.item.starts_at) > new Date()) || rows.find((r) => r.item.starts_at);
    const ym = month || (first ? inputParts(first.item.starts_at).date.slice(0, 7) : new Date().toISOString().slice(0, 7));
    const [y, m] = ym.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = start.getUTCDay();
    const byDay = {}; for (const r of rows) if (r.item.starts_at) { const dd = inputParts(r.item.starts_at).date; (byDay[dd] = byDay[dd] || []).push(r); }
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    const cells = []; for (let i = 0; i < lead; i++) cells.push(`<div class="cd empty"></div>`);
    for (let dnum = 1; dnum <= days; dnum++) {
      const key = `${ym}-${String(dnum).padStart(2, "0")}`, rs = byDay[key] || [];
      const mineN = rs.filter((r) => r.mine).length, openN = rs.filter((r) => r.canClaim).length;
      cells.push(rs.length ? `<a class="cd has${day === key ? " sel" : ""}${mineN ? " mine" : ""}" href="${base}&v=cal&m=${ym}&d=${key}"><b>${dnum}</b>${mineN ? `<span class="ok">✓ ${mineN}</span>` : ""}${openN ? `<span>${openN} open</span>` : ""}</a>` : `<div class="cd"><b>${dnum}</b></div>`);
    }
    cal = `<div class="mc-cal"><div class="cal-head"><a class="btn-ghost" href="${base}&v=cal&m=${prev}">‹</a><b>${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b><a class="btn-ghost" href="${base}&v=cal&m=${next}">›</a></div>
      <div class="cal-grid">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => `<div class="cw">${x}</div>`).join("")}${cells.join("")}</div>
      <p class="fine">Tap a day to see what's open.</p></div>
      ${day ? `<h2 class="mc-day">${esc(new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</h2>${listHtml(byDay[day] || [])}` : ""}`;
  }
  return page({ title: board.name, user, flash,
    body: `<a class="back" href="/dashboard">My Claims</a>
    <section class="panel mc-head"><h1>${esc(board.name)}</h1>
      ${evDates(board) || board.event_location ? `<p class="mc-sub">${esc([evDates(board)].filter(Boolean).join(""))}${board.event_location ? `${evDates(board) ? " · " : ""}${P.link(board.event_location)}` : ""}</p>` : ""}
      ${board.description ? `<p class="board-note">${esc(board.description)}</p>` : ""}
      <div class="mc-person"><span>Signing up: <b>${person.self_user_id ? "Me" : `${esc(person.first_name)} ${esc(person.last_name || "")}`}</b></span>
        ${people.length > 1 ? `<a class="btn-ghost" href="/b/${board.id}">Change</a>` : ""}</div>
      ${limitNotes.length ? `<ul class="mc-limits">${limitNotes.join("")}</ul>` : ""}
      ${extra.length ? `<p class="mc-lo">🔓 <b>${extra.length} extra spot${extra.length === 1 ? " is" : "s are"} open</b> to everyone, even past a limit. Look for <b>Open to everyone</b> below.</p>` : ""}
    </section>
    ${dated ? `<nav class="mc-toggle" aria-label="View"><a href="${base}&v=list"${mode === "list" ? ' aria-current="page"' : ""}>☰ List</a><a href="${base}&v=cal"${mode === "cal" ? ' aria-current="page"' : ""}>📅 Calendar</a></nav>` : ""}
    <section class="panel">${mode === "cal" && dated ? cal : listHtml(rows)}</section>
    ${board.contact_name || board.contact_info ? `<p class="fine mc-contact">Questions? ${esc([board.contact_name, board.contact_info].filter(Boolean).join(", "))}</p>` : ""}` });
}

module.exports = { homePage, whoPage, boardPage };
