// What people see. Big, simple, one question per screen.
const { esc, layout } = require("./layout");
const { slotName, fmtDateTime, inputParts } = require("../time");
const P = require("../locations");

const page = (o) => layout({ ...o, tab: "home", xwide: true });
const who = (p) => (p && p.self_user_id ? "you" : p ? p.first_name : "");
const Who = (p) => (p && p.self_user_id ? "You" : p ? p.first_name : "");
const evDates = (b) => (b.event_date ? require("./setup").eventDates(b) : "");

// ---------- My Claims dashboard ----------
const SVG = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const IC = {
  cal: SVG('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M8 14h2M14 14h2M8 18h2M14 18h2"/>'),
  clip: SVG('<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4"/>'),
  people: SVG('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.6.2 4.4 2 5 4.9"/>'),
  pin: SVG('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  right: SVG('<path d="m9 6 6 6-6 6"/>'),
  trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4h6v3"/>'),
  mega: SVG('<path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>'),
  chart: SVG('<path d="M5 20V12M10 20V8M15 20v-6M20 20V4"/>', ' stroke-width="3"'),
};
const thumb = (cls = "", b = null) => b && b.image
  ? `<span class="d-thumb photo ${cls}"><img src="/img/board/${b.id}?v=${b.image_at ? new Date(b.image_at).getTime() : 0}" alt="" loading="lazy"></span>`
  : `<span class="d-thumb code ${cls}"><b>${esc(require("./setup").codeOf(b || {}))}</b></span>`;
const dayBlock = (t) => {
  if (!t) return `<span class="d-date any"><small>ANY</small><b>TIME</b></span>`;
  const d = new Date(t), o = { timeZone: "America/Chicago" };
  return `<span class="d-date"><small>${d.toLocaleDateString("en-US", { ...o, weekday: "short" }).toUpperCase()}</small><b>${d.toLocaleDateString("en-US", { ...o, month: "short" }).toUpperCase()} ${d.toLocaleDateString("en-US", { ...o, day: "numeric" })}</b></span>`;
};
const timeRange = (a, b) => { const f = (x) => new Date(x).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }); return a ? `${f(a)} – ${b ? f(b) : ""}` : ""; };
const shortDay = (t) => new Date(t).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });
const rangeOf = (b, span) => {
  const fmt = (x, y) => new Date(x).toLocaleDateString("en-US", { timeZone: y ? "America/Chicago" : "UTC", month: "short", day: "numeric", year: "numeric" });
  if (b.event_date) return require("./setup").eventDates(b);
  if (span && span.first) { const a = fmt(span.first, 1), z = fmt(span.last, 1); return a === z ? a : `${a.replace(/, \d{4}$/, a.slice(-4) === z.slice(-4) ? "" : a.slice(-6))} – ${z}`; }
  return "";
};
const isVolunteer = (b) => require("./setup").boardTypeOf(b) === "volunteer";
const audience = (b) => {
  const mode = b.claim_mode || "family", g = b.groups || [];
  if (mode === "public") return "Open to everyone";
  if (mode === "roster") return g.length > 1 ? (g.length <= 3 ? g.join(", ") : "Multiple age groups") : g[0] || "Rostered members";
  return "Anyone signed in";
};

function homePage({ user, flash, claims, boards, extra, admin, coach, family = [], who = 0, all = false, tab = "", allBoards = false }) {
  const q = (o) => { const p = new URLSearchParams(Object.fromEntries(Object.entries({ who: who || "", all: all ? "1" : "", tab: tab === "vol" ? "vol" : "", boards: allBoards ? "all" : "", ...o }).filter(([, x]) => x))); const t = p.toString(); return `/dashboard${t ? `?${t}` : ""}`; };
  // alerts: one compact row per board + person
  const alerts = [...extra.reduce((m, x) => { const k = `${x.board.id}:${x.person.id}`; if (!m.has(k)) m.set(k, { ...x, n: 0 }); m.get(k).n++; return m; }, new Map()).values()];
  const alertRows = alerts.map((x, i) => `<a class="d-alert ${i % 2 ? "green" : "blue"}" href="/b/${x.board.id}?p=${x.person.self_user_id ? "me" : x.person.id}">
      <span class="d-alert-ic">${i % 2 ? IC.people : IC.mega}</span>
      <span class="d-alert-t"><b>${x.n} extra spot${x.n === 1 ? " is" : "s are"} open</b> on ${esc(x.board.name)} for ${esc(x.person.self_user_id ? "you" : x.person.first_name)}. <span class="see">See openings ›</span></span>
      <span class="d-chev">${IC.right}</span></a>`).join("");
  // upcoming claims grouped by board
  const groups = [...claims.reduce((m, c) => m.set(c.schedule_id, [...(m.get(c.schedule_id) || []), c]), new Map()).values()];
  const LIMIT = 6; let shown = 0;
  const claimsHtml = groups.length ? groups.map((cs) => {
    const upcoming = cs.filter((c) => !c.past), next = upcoming.find((c) => c.starts_at);
    const rows = cs.filter(() => all || shown++ < LIMIT);
    if (!rows.length) return "";
    return `<div class="d-group">
      <div class="d-group-h">${thumb("sm", { id: cs[0].schedule_id, image: cs[0].board_image ? 1 : null, image_at: cs[0].board_image_at, short_code: cs[0].board_code, name: cs[0].board_name })}<b>${esc(cs[0].board_name)}</b>
        <span class="d-group-s"><b>${upcoming.length} claimed</b>${next ? ` · Next ${esc(shortDay(next.starts_at))}` : ""}</span></div>
      ${rows.map((c) => `<div class="d-claim${c.past ? " past" : ""}${c.status === "waitlisted" ? " wl" : ""}">${dayBlock(c.starts_at)}
        <div class="d-claim-b"><div class="d-claim-t"><b>${c.starts_at ? esc(timeRange(c.starts_at, c.ends_at)) : esc(c.title || "Anytime")}</b>${c.status === "waitlisted" ? `<span class="d-pill wl">Waitlist</span>` : ""}${c.past ? `<span class="d-pill">Done</span>` : ""}</div>
          <span>${esc([c.self_user_id ? "You" : c.first_name, ...(c.path ? c.path.split(" › ") : []), c.starts_at && c.title ? c.title : ""].filter(Boolean).join(" · "))}</span></div>
        ${c.past ? "" : c.cancelable ? `<form method="post" action="/claims/${c.id}/cancel" class="d-cancel" onsubmit="return confirm('Cancel this spot for ${esc((c.self_user_id ? "yourself" : c.first_name).replace(/'/g, ""))}? It will open for someone else.')">
            <input type="hidden" name="back" value="/dashboard"><button type="submit">${IC.trash}<span>Cancel</span></button></form>`
          : `<span class="d-late">Too late to cancel</span>`}
      </div>`).join("")}</div>`;
  }).join("") + (!all && claims.length > LIMIT ? `<a class="d-more" href="${q({ all: "1" })}#claims">Show all ${claims.length} claims</a>` : "")
    : `<div class="d-empty">${IC.cal}<b>${who ? "Nothing claimed for this person yet." : "No upcoming claims yet."}</b><span>Pick something under <i>Sign Up for Something</i> to get started.</span></div>`;
  // family filter
  const famChips = family.length > 1 ? `<nav class="d-fam" aria-label="Show claims for">${[["", "All family members"], ...family.map((p) => [p.self_user_id ? "me" : String(p.id), p.self_user_id ? "Me (parent / volunteer)" : p.first_name])]
    .map(([k, l]) => `<a href="${q({ who: k })}#claims"${String(who || "") === k ? ' aria-current="true"' : ""}>${esc(l)}</a>`).join("")}</nav>` : "";
  // sign up: one list of everything open; each card says what kind it is. ?tab=vol shows just volunteer boards.
  const volOnly = tab === "vol";
  const list = volOnly ? boards.filter((b) => isVolunteer(b.board)) : boards;
  const SHOW = 6;
  const boardCards = list.length ? list.slice(0, allBoards ? 999 : SHOW).map(({ board: b, span }) => {
    const range = rangeOf(b, span), vol = isVolunteer(b);
    return `<div class="d-board">${thumb("", b)}
      <div class="d-board-b"><span class="d-type ${vol ? "vol" : "train"}">${vol ? `${IC.people}Volunteer opportunity` : `${IC.cal}Training sessions`}</span><b>${esc(b.name)}</b>
        ${range || b.event_location ? `<span class="d-board-l1">${esc([range, b.event_location].filter(Boolean).join("  ·  "))}</span>` : ""}
        <span class="d-board-meta"><span>${IC.people}${esc(audience(b))}</span>${b.event_location ? `<span>${IC.pin}${esc(b.event_location)}</span>` : ""}</span>
        ${b.description ? `<span class="d-board-desc">${esc(b.description.split(/\n/)[0].slice(0, 120))}</span>` : ""}
      </div>
      <a class="d-signup" href="/b/${b.id}">Sign Up ${IC.right}</a></div>`;
  }).join("") + (!allBoards && list.length > SHOW ? `<a class="d-more" href="${q({ boards: "all" })}#signup">Show all ${list.length}</a>` : "")
    : `<div class="d-empty">${volOnly ? IC.people : IC.clip}<b>${volOnly ? "No volunteer opportunities open right now." : "Nothing open to sign up for right now."}</b><span>${volOnly && boards.length ? `<a href="${q({ tab: "" })}#signup">See everything that's open</a>` : "Check back soon."}</span></div>`;
  return layout({ title: "My Claims", user, flash, admin, tab: "home", dash: true,
    body: `
    <div class="d-wrap">
      ${alertRows ? `<div class="d-alerts">${alertRows}</div>` : ""}
      <div class="d-cols">
        <section class="d-card" id="claims">
          <div class="d-card-h"><span class="d-card-ic">${IC.cal}</span><h2>Your Upcoming Claims</h2>
            <a class="d-btn" href="${all ? q({ all: "" }) : q({ all: "1" })}#claims">${all ? "Upcoming Only" : "View All Claims"} ${IC.right}</a></div>
          ${famChips}
          ${claimsHtml}
        </section>
        <section class="d-card" id="signup">
          <div class="d-card-h"><span class="d-card-ic">${IC.clip}</span><h2>Sign Up for Something</h2></div>
          <div class="d-open-h"><b>${volOnly ? "Volunteer opportunities" : "Currently open opportunities"}</b><i>${list.length}</i>
            ${volOnly ? `<a href="${q({ tab: "" })}#signup">Show all</a>` : ""}</div>
          ${boardCards}
        </section>
      </div>
    </div>
    <script>
      // a little "working…" state on buttons that submit
      document.querySelectorAll(".d-cancel").forEach(function (f) { f.addEventListener("submit", function () { setTimeout(function () { var b = f.querySelector("button"); b.disabled = true; b.classList.add("busy"); }, 0); }); });
      document.querySelectorAll(".d-signup, .d-alert, .d-q").forEach(function (a) { a.addEventListener("click", function () { a.classList.add("busy"); }); });
    </script>` });
}

function whoPage({ user, flash, board, who: people }) {
  return page({ title: board.name, user, flash,
    body: `<a class="back" href="/dashboard">My Claims</a>
    <section class="panel mc-who"><p class="mc-board-name">${esc(board.name)}</p><h1>Who's signing up?</h1>
      <div class="who-grid">${people.map((p) => `<a class="who-btn" href="/b/${board.id}?p=${p.id || "me"}">${p.self_user_id ? "Me" : esc(p.first_name)}
        ${p.self_user_id ? `<span>Signing up myself</span>` : p.last_name ? `<span>${esc(p.first_name)} ${esc(p.last_name)}</span>` : ""}</a>`).join("")}</div>
      <p class="fine">You'll sign up one person at a time. You can switch to someone else afterward.</p></section>` });
}

// Who's going on a spot, following the board's "Who's going" setting
function goingHtml(board, r) {
  const mode = board.family_names || "initial", q = board.question || {};
  if (!r.going.length) return "";
  if (mode === "off") return `<span class="going">${r.going.length} going</span>`;
  const nm = (g) => mode === "full" ? `${g.first_name} ${g.last_name}` : `${g.first_name} ${(g.last_name || "").slice(0, 1)}${g.last_name ? "." : ""}`;
  return `<span class="going">Going: ${r.going.map((g) => `${esc(nm(g))}${q.label && q.public !== false && g.note ? ` <i>(${esc(g.note)})</i>` : ""}`).join(", ")}</span>`;
}

function rowHtml(board, person, r, back, showWhere = false) {
  const it = r.item, q = board.question || {};
  const leaf = r.chain[r.chain.length - 1];
  let action;
  if (r.mine) {
    const canCancel = !r.cancelBy || new Date() < new Date(r.cancelBy);
    action = `<span class="state ok">${r.mine.status === "waitlisted" ? "On the waitlist" : `Claimed ✓`}</span>${r.mine.counts === false ? `<span class="fine">doesn't count toward limits (open leftover spot)</span>` : ""}
      ${canCancel ? `<form method="post" action="/claims/${r.mine.id}/cancel" onsubmit="return confirm('Cancel this spot?')"><input type="hidden" name="back" value="${esc(back)}"><button class="link-dark" type="submit">Cancel</button></form>`
        : `<span class="fine">Too late to cancel in the app${board.contact_name || board.contact_info ? `. Contact ${esc([board.contact_name, board.contact_info].filter(Boolean).join(", "))}` : ""}.</span>`}`;
  } else if (r.canClaim) {
    action = `<form method="post" action="/b/${board.id}/claim" class="claim-f"><input type="hidden" name="p" value="${person.id}"><input type="hidden" name="item" value="${it.id}"><input type="hidden" name="back" value="${esc(back)}">
      ${q.label ? `<input name="note" maxlength="120"${q.required ? " required" : ""} placeholder="${esc(q.label)}${q.required ? "" : " (optional)"}" aria-label="${esc(q.label)}">` : ""}
      <button class="btn-small big" type="submit">${r.full ? "Join waitlist" : "Claim"}</button></form>`;
  } else if (r.blockedBy) action = `<span class="state">${esc(Who(person))} ${person.self_user_id ? "have" : "has"} claimed the ${r.blockedBy.limit} allowed ${r.blockedBy.kind === "board" ? "on this board" : `in ${esc(r.blockedBy.name)}`}</span>`;
  else action = `<span class="state">${esc(r.full ? "Full" : r.reason || "Not available")}</span>`;
  return `<li id="i${it.id}" class="${r.mine ? "mine" : ""}${r.leftover && !r.mine ? " lo" : ""}">
    <div class="mc-what">${showWhere && leaf ? `<span class="where"><b>${esc(leaf.name)}</b>${r.chain.length > 1 ? ` <small>${esc(r.chain.slice(0, -1).map((n) => n.name).join(" › "))}</small>` : ""}</span>` : ""}<b>${esc(slotName(it))}</b>
      <span>${r.full ? "Full" : `${r.open} of ${it.capacity} open`}${r.leftover && !r.mine ? ` · <b class="lo-tag">🔓 Open to everyone</b> <span class="fine">(doesn't count toward limits)</span>` : ""}${(it.location || r.eff.location) ? ` · ${P.link(it.location || r.eff.location)}` : ""}</span></div>
    ${goingHtml(board, r)}
    <div class="mc-act">${action}</div></li>`;
}

function boardPage({ user, flash, board, person, who: people, view, mode, month, day }) {
  view = view || { items: [], limits: [] };
  const rows = view.items;
  const dated = rows.some((r) => r.item.starts_at);
  const base = person ? `/b/${board.id}?p=${person.self_user_id ? "me" : person.id}` : `/b/${board.id}?`;
  const back = `${base}${mode === "cal" ? "&v=cal" : ""}${month ? `&m=${month}` : ""}${day ? `&d=${day}` : ""}`;
  // one section per activity (the container right above the items); the path above it is a small breadcrumb
  const limitOf = (nodeId) => view.limits.find((L) => L.kind === "node" && L.id === nodeId);
  const groupsOf = (list) => { const g = new Map(); for (const r of list) { const leaf = r.chain[r.chain.length - 1]; const k = leaf ? leaf.id : 0;
      if (!g.has(k)) g.set(k, { leaf, crumb: r.chain.slice(0, -1).map((n) => n.name), rows: [] }); g.get(k).rows.push(r); } return [...g.values()]; };
  const tally = (list) => { const open = list.filter((r) => r.canClaim).length, mine = list.filter((r) => r.mine).length;
    return [open ? `${open} open` : "", mine ? `<span class="ok">${mine} claimed ✓</span>` : ""].filter(Boolean).join(" · ") || "nothing open"; };
  const listHtml = (list) => list.length ? groupsOf(list).map(({ leaf, crumb, rows: rs }) => {
      const L = leaf && limitOf(leaf.id);
      return `<details class="mc-sec" data-id="${leaf ? leaf.id : 0}" open><summary><span class="tw" aria-hidden="true"></span>
        <span class="sec-t">${crumb.length ? `<small>${esc(crumb.join(" › "))}</small>` : ""}<b>${leaf ? esc(leaf.name) : esc(board.name)}</b></span>
        ${L ? `<span class="sec-lim${L.left ? "" : " none"}">${L.left ? `${L.left} of ${L.limit} left` : `all ${L.limit} used`} for ${esc(Who(person))}</span>` : ""}
        <span class="tw-sum">${tally(rs)}</span></summary>
        <ul class="mc-rows">${rs.map((r) => rowHtml(board, person, r, back)).join("")}</ul></details>`;
    }).join("") : `<p class="muted">Nothing here${day ? " on this day" : ""}.</p>`;
  const flat = (list) => list.length ? `<ul class="mc-rows">${list.map((r) => rowHtml(board, person, r, back, true)).join("")}</ul>` : `<p class="muted">Nothing here on this day.</p>`;
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
      const acts = [...rs.reduce((m, r) => { const n = (r.chain[r.chain.length - 1] || {}).name || "Open"; const x = m.get(n) || { open: 0, mine: 0 }; x.open += r.canClaim ? 1 : 0; x.mine += r.mine ? 1 : 0; return m.set(n, x); }, new Map())];
      const names = acts.slice(0, 3).map(([n, x]) => `<i class="${x.mine ? "m" : x.open ? "" : "f"}">${esc(n)}${x.mine ? " ✓" : x.open ? ` · ${x.open} open` : " · full"}</i>`).join("") + (acts.length > 3 ? `<i>+${acts.length - 3} more</i>` : "");
      cells.push(rs.length ? `<a class="cd has${day === key ? " sel" : ""}${mineN ? " mine" : ""}" href="${base}&v=cal&m=${ym}&d=${key}"><b>${dnum}</b><span class="cd-short">${mineN ? `<span class="ok">✓ ${mineN}</span>` : ""}${openN ? `<span>${openN} open</span>` : ""}</span><span class="cd-names">${names}</span></a>` : `<div class="cd"><b>${dnum}</b></div>`);
    }
    cal = `<div class="mc-cal"><div class="cal-head"><a class="btn-ghost" href="${base}&v=cal&m=${prev}">‹</a><b>${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b><a class="btn-ghost" href="${base}&v=cal&m=${next}">›</a></div>
      <div class="cal-grid">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => `<div class="cw">${x}</div>`).join("")}${cells.join("")}</div>
      <p class="fine">Tap a day to see what's open.</p></div>
      ${day ? `<h2 class="mc-day">${esc(new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</h2>${flat(byDay[day] || [])}` : ""}`;
  }
  const pick = (p) => `/b/${board.id}?p=${p.self_user_id ? "me" : p.id}${mode === "cal" ? "&v=cal" : ""}`;
  const meta = [evDates(board), board.event_location ? P.link(board.event_location) : "", board.contact_name || board.contact_info ? `Questions? ${esc([board.contact_name, board.contact_info].filter(Boolean).join(", "))}` : ""].filter(Boolean);
  return page({ title: board.name, user, flash,
    body: `<div class="mc-top"><a class="back" href="/dashboard">My Claims</a>
      ${board.image ? `<img class="mc-bimg" src="/img/board/${board.id}?v=${board.image_at ? new Date(board.image_at).getTime() : 0}" alt="">` : ""}<h1 class="mc-bname">${esc(board.name)}</h1>${meta.length ? `<span class="mc-meta">${meta.map((x) => x.startsWith("<") ? x : esc(x)).join(" · ")}</span>` : ""}</div>
    ${board.description ? `<p class="mc-desc">${esc(board.description)}</p>` : ""}
    <nav class="mc-people" aria-label="Who's signing up"><span>Signing up:</span>
      ${people.map((p) => `<a class="pchip${person && ((p.self_user_id && person.self_user_id) || p.id === person.id) ? " on" : ""}" href="${pick(p)}">${p.self_user_id ? "Me" : esc(p.first_name)}</a>`).join("")}</nav>
    ${!person ? `<p class="mc-pickfirst">👆 Tap who's signing up to see what's available.</p>` : `
    ${(() => { const leafIds = new Set(rows.map((r) => (r.chain[r.chain.length - 1] || {}).id)); const top = view.limits.filter((L) => !(L.kind === "node" && leafIds.has(L.id)));
      return top.length || extra.length ? `<p class="mc-notes">${top.length ? `${esc(Who(person))}: ${top.map((L) => L.left ? `<b>${L.left} of ${L.limit}</b> left ${where(L)}` : `all ${L.limit} used ${where(L)}`).join(" · ")}` : ""}${extra.length ? `${top.length ? " · " : ""}<span class="lo-tag">🔓 ${extra.length} extra spot${extra.length === 1 ? "" : "s"} open to everyone</span>` : ""}</p>` : ""; })()}
    ${dated ? `<nav class="mc-toggle" aria-label="View"><a href="${base}&v=list"${mode === "list" ? ' aria-current="page"' : ""}>☰ List</a><a href="${base}&v=cal"${mode === "cal" ? ' aria-current="page"' : ""}>📅 Calendar</a></nav>` : ""}
    <section class="panel mc-list">${mode === "cal" && dated ? cal : listHtml(rows)}</section>`}
    <script>(function () { var K = "mc-open-${board.id}", st = {}; try { st = JSON.parse(localStorage.getItem(K) || "{}"); } catch (e) {}
      document.querySelectorAll("details.mc-sec").forEach(function (d) { if (d.dataset.id in st) d.open = st[d.dataset.id];
        d.addEventListener("toggle", function () { st[d.dataset.id] = d.open; try { localStorage.setItem(K, JSON.stringify(st)); } catch (e) {} }); });
      var h = location.hash && document.querySelector(location.hash); if (h) { var p = h.parentElement; while (p) { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; } h.scrollIntoView({ block: "center" }); }
    })();</script>` });
}

module.exports = { homePage, whoPage, boardPage };
