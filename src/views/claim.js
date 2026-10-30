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

// ---------- board sign-up page (List + Calendar), matched to the approved mockup ----------
const PALETTE = ["#43A047", "#2F6FED", "#8B5CF6", "#F59E0B", "#0EA5A4", "#E0457B", "#DC2626", "#64748B"];
const ACT_IC = [SVG('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>'),
  SVG('<path d="M12 3 4.5 6v5.5c0 4.4 3.2 8.4 7.5 9.5 4.3-1.1 7.5-5.1 7.5-9.5V6z"/>'),
  SVG('<circle cx="12" cy="12" r="8.5"/><path d="M7 6.5c2.2 3.2 2.2 7.8 0 11M17 6.5c-2.2 3.2-2.2 7.8 0 11"/>'),
  SVG('<path d="M12 2.5 15 9l7 .6-5.3 4.6L18.4 21 12 17.3 5.6 21l1.7-6.8L2 9.6 9 9z"/>')];

function boardPage({ user, flash, board, person, who: people, view, mode, month, day, span = null, filters = {}, admin = false, group = "activity" }) {
  view = view || { items: [], limits: [] };
  const rows = view.items;
  const dated = rows.some((r) => r.item.starts_at);
  const pid = person ? (person.self_user_id ? "me" : person.id) : "";
  const link = (o = {}) => { const p = new URLSearchParams(Object.fromEntries(Object.entries({ p: pid, v: mode === "cal" ? "cal" : "list", g: group === "day" ? "day" : "", m: month || "", act: filters.act || "", grp: filters.grp || "", show: filters.show || "", ...o }).filter(([, x]) => x)));
    const t = p.toString(); return `/b/${board.id}${t ? `?${t}` : ""}`; };
  const back = link();
  // activities (the container right above the sessions) and their age group / round
  const leafOf = (r) => r.chain[r.chain.length - 1] || null;
  const acts = []; for (const r of rows) { const l = leafOf(r); if (l && !acts.some((a) => a.id === l.id)) acts.push(l); }
  const color = (id) => PALETTE[Math.max(0, acts.findIndex((a) => a.id === id)) % PALETTE.length];
  const groupName = (r) => (r.chain.length >= 2 ? r.chain[r.chain.length - 2].name : "");
  const groups = [...new Set(rows.map(groupName).filter(Boolean))];
  const actNames = [...new Set(acts.map((a) => a.name))];
  // filters
  let shown = rows;
  if (filters.act) shown = shown.filter((r) => (leafOf(r) || {}).name === filters.act);
  if (filters.grp) shown = shown.filter((r) => groupName(r) === filters.grp);
  if (filters.show === "open") shown = shown.filter((r) => r.canClaim);
  if (filters.show === "mine") shown = shown.filter((r) => r.mine);
  const q = board.question || {};
  const Name = person ? (person.self_user_id ? "You" : person.first_name) : "";
  const whoLine = (r) => { const w = r.eff.who || []; if (!w.length) return board.claim_mode === "public" ? "Open to everyone" : board.claim_mode === "roster" ? "Everyone on the list" : "Anyone signed in";
    const last = w[w.length - 1]; return last.mode === "signed_in" ? "Anyone signed in" : last.mode === "list" ? "Everyone on the list" : `Only ${[...(last.groups || []), ...(last.tags || [])].join(", ")}`; };
  const going = (r) => { const g = r.going || []; if (!g.length) return ""; const mode = board.family_names || "initial"; if (mode === "off") return `${g.length} going`;
    return `Going: ${g.map((x) => mode === "full" ? `${x.first_name} ${x.last_name}` : `${x.first_name} ${(x.last_name || "").slice(0, 1)}.`).join(", ")}`; };
  const claimForm = (r, big = false) => `<form method="post" action="/b/${board.id}/claim" class="b-claimf"><input type="hidden" name="p" value="${person.id}"><input type="hidden" name="item" value="${r.item.id}"><input type="hidden" name="back" value="${esc(back)}">
      ${q.label ? `<input name="note" maxlength="120"${q.required ? " required" : ""} placeholder="${esc(q.label)}${q.required ? "" : " (optional)"}" aria-label="${esc(q.label)}">` : ""}
      <button class="b-claim${big ? " big" : ""}" type="submit">${r.full ? "Join waitlist" : "Claim"}</button></form>`;
  const cancelForm = (r) => `<form method="post" action="/claims/${r.mine.id}/cancel" class="b-cancelf" onsubmit="return confirm('Cancel this spot for ${esc((person.self_user_id ? "yourself" : person.first_name).replace(/'/g, ""))}? It will open for someone else.')">
      <input type="hidden" name="back" value="${esc(back)}"><button type="submit">Cancel</button></form>`;
  const canCancel = (r) => !r.cancelBy || new Date() < new Date(r.cancelBy);
  const action = (r, big = false) => {
    if (r.mine) return `<span class="b-claimed">${IC_CHECK}${r.mine.status === "waitlisted" ? "Waitlisted" : "Claimed"}</span>${canCancel(r) ? cancelForm(r) : `<span class="b-late">Too late to cancel</span>`}`;
    if (r.canClaim) return claimForm(r, big);
    if (r.blockedBy) return `<span class="b-state">Limit reached${r.blockedBy.kind === "board" ? "" : ` in ${esc(r.blockedBy.name)}`}</span>`;
    return `<span class="b-state">${esc(r.full ? "Full" : r.reason || "Not available")}</span>`;
  };
  const avail = (r) => r.full ? "Full" : `${r.open} of ${r.item.capacity} open`;
  const rowHtml2 = (r, o = {}) => `<div class="b-row${o.noDate ? " nod" : ""}${r.mine ? " mine" : ""}${r.leftover && !r.mine ? " lo" : ""}" id="i${r.item.id}">
      ${o.noDate ? "" : dayBlock(r.item.starts_at)}
      <div class="b-row-main">${o.act ? `<span class="b-act" style="--c:${color((leafOf(r) || {}).id)}"><i></i>${esc((leafOf(r) || {}).name || "")}${r.chain.length > 1 ? `<small>${esc(r.chain.slice(0, -1).map((n) => n.name).join(" • "))}</small>` : ""}${limFor((leafOf(r) || {}).id)}</span>` : ""}<b class="b-time">${r.item.starts_at ? esc(timeRange(r.item.starts_at, r.item.ends_at)) : esc(r.item.title || "Anytime")}</b>${r.item.starts_at && r.item.title ? `<span class="b-title">${esc(r.item.title)}</span>` : ""}</div>
      <div class="b-row-meta"><span>${avail(r)}</span><span class="b-dot">•</span><span class="b-elig">${IC.people}${esc(whoLine(r))}</span>
        ${r.leftover && !r.mine ? `<span class="b-lo">🔓 Extra spot, doesn't count toward limits</span>` : ""}
        ${(r.item.location || r.eff.location) && (r.item.location || r.eff.location) !== board.event_location ? `<span class="b-loc">${IC.pin}${esc(r.item.location || r.eff.location)}</span>` : ""}
        ${going(r) ? `<span class="b-going">${esc(going(r))}</span>` : ""}</div>
      <div class="b-row-act">${action(r)}</div></div>`;
  // this person's count for an activity, shown wherever that activity's name appears
  const limFor = (leafId) => { const L = leafId && view.limits.find((x) => x.kind === "node" && x.id === leafId); if (!person || !L) return "";
    return `<span class="b-lim${L.left ? "" : " none"}">${L.left ? `${L.left} of ${L.limit} left` : `all ${L.limit} used`}</span>`; };
  // sessions grouped by calendar day (in date order); undated ones stay as plain rows
  const dayKey = (r) => (r.item.starts_at ? inputParts(r.item.starts_at).date : "any");
  const dayGroups = (list) => [...list.reduce((m, r) => { const k = dayKey(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); return m; }, new Map())];
  // ---- group by day: weeks (twisties) -> days -> sessions labeled with their activity ----
  const weekOf = (k) => { const d = new Date(k + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
  const today = new Date().toISOString().slice(0, 10), thisWeek = weekOf(today);
  const byDayHtml = () => {
    const dated = shown.filter((r) => r.item.starts_at), undated = shown.filter((r) => !r.item.starts_at);
    const weeks = [...dated.reduce((m, r) => { const w = weekOf(dayKey(r)); if (!m.has(w)) m.set(w, []); m.get(w).push(r); return m; }, new Map())];
    if (!weeks.length && !undated.length) return "";
    const firstOpen = weeks.findIndex(([w]) => w >= thisWeek);
    return weeks.map(([w, rs], n) => { const open = rs.filter((r) => r.canClaim).length, mine = rs.filter((r) => r.mine).length;
      return `<details class="b-sec b-week" data-id="w${w}"${n === (firstOpen < 0 ? 0 : firstOpen) || w > thisWeek && n <= (firstOpen < 0 ? 0 : firstOpen) + 1 ? " open" : ""}><summary>
          <span class="b-ic wk">${IC.cal}</span><b>Week of ${esc(new Date(w + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }))}</b>
          <span class="b-count">${[open ? `${open} open` : "", mine ? `${mine} claimed` : ""].filter(Boolean).join(" · ") || "Nothing open"}</span><span class="b-chev" aria-hidden="true"></span></summary>
        <div class="b-rows">${dayGroups(rs).map(([k, ds], i) => `<div class="b-dayg${i % 2 ? " alt" : ""}">${dayBlock(ds[0].item.starts_at)}<div class="b-dayg-rows">${ds.map((r) => rowHtml2(r, { noDate: true, act: true })).join("")}</div></div>`).join("")}</div></details>`; }).join("")
      + (undated.length ? `<details class="b-sec" data-id="wany" open><summary><span class="b-ic wk">${IC.clip}</span><b>Any time</b><span class="b-count">${undated.length}</span><span class="b-chev" aria-hidden="true"></span></summary>
          <div class="b-rows">${undated.map((r) => rowHtml2(r, { act: true })).join("")}</div></details>` : "");
  };
  // ---- list: one accordion per activity ----
  const sections = [...shown.reduce((m, r) => { const l = leafOf(r); const k = l ? l.id : 0; if (!m.has(k)) m.set(k, { leaf: l, rows: [] }); m.get(k).rows.push(r); return m; }, new Map()).values()];
  const listHtml = sections.length ? sections.map(({ leaf, rows: rs }, idx) => {
    const crumb = rs[0].chain.slice(0, -1).map((n) => n.name);
    const open = rs.filter((r) => r.canClaim).length, mine = rs.filter((r) => r.mine).length;
    const L = leaf && view.limits.find((x) => x.kind === "node" && x.id === leaf.id);
    const c = color(leaf ? leaf.id : 0);
    return `<details class="b-sec" data-id="${leaf ? leaf.id : 0}" open><summary>
        <span class="b-ic" style="background:${c}">${ACT_IC[(leaf ? acts.findIndex((a) => a.id === leaf.id) : 0) % ACT_IC.length]}</span>
        <b>${esc(leaf ? leaf.name : board.name)}</b>${crumb.length ? `<span class="b-crumb">(${esc(crumb.join(" • "))})</span>` : ""}
        ${L ? `<span class="b-lim${L.left ? "" : " none"}">${L.left ? `${L.left} of ${L.limit} left` : `all ${L.limit} used`}</span>` : ""}
        <span class="b-count">${[open ? `${open} open` : "", mine ? `${mine} claimed` : ""].filter(Boolean).join(" · ") || "Nothing open"}</span><span class="b-chev" aria-hidden="true"></span></summary>
      <div class="b-rows">${dayGroups(rs).map(([k, ds], n) => k === "any" ? ds.map((r) => rowHtml2(r)).join("")
        : `<div class="b-dayg${n % 2 ? " alt" : ""}">${dayBlock(ds[0].item.starts_at)}<div class="b-dayg-rows">${ds.map((r) => rowHtml2(r, { noDate: true })).join("")}</div></div>`).join("")}</div></details>`;
  }).join("") : `<div class="d-empty"><b>Nothing matches.</b><span>${filters.act || filters.grp || filters.show ? `<a href="${link({ act: "", grp: "", show: "" })}">Clear the filters</a>` : "Nothing is open for this person right now."}</span></div>`;
  // ---- calendar: sessions inside each day; tap one for details + Claim ----
  let calHtml = "";
  const dlg = [];
  if (mode === "cal" && dated) {
    const first = shown.find((r) => r.item.starts_at && new Date(r.item.starts_at) > new Date()) || shown.find((r) => r.item.starts_at) || rows.find((r) => r.item.starts_at);
    const ym = month || (first ? inputParts(first.item.starts_at).date.slice(0, 7) : new Date().toISOString().slice(0, 7));
    const [y, m] = ym.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const byDay = {}; for (const r of shown) if (r.item.starts_at) { const dd = inputParts(r.item.starts_at).date; (byDay[dd] = byDay[dd] || []).push(r); }
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    const t1 = (x) => new Date(x).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
    const chip = (r) => { const l = leafOf(r); dlg.push(r);
      return `<button type="button" class="c-chip${r.mine ? " mine" : ""}${!r.canClaim && !r.mine ? " off" : ""}" data-dlg="s${r.item.id}" style="--c:${color(l ? l.id : 0)}">
        <span class="c-dot"></span><span class="c-t"><b>${esc(l ? l.name : r.item.title || "Session")}</b><small>${esc(t1(r.item.starts_at))} – ${esc(r.item.ends_at ? t1(r.item.ends_at) : "")}</small></span>
        <span class="c-s">${r.mine ? `${IC_CHECK}Claimed` : r.full ? "Full" : r.canClaim ? `${r.open} open` : "—"}</span></button>`; };
    const cells = []; for (let i = 0; i < lead; i++) cells.push(`<div class="c-day out"></div>`);
    for (let dn = 1; dn <= days; dn++) {
      const key = `${ym}-${String(dn).padStart(2, "0")}`, rs = byDay[key] || [];
      const MAX = 3;
      cells.push(`<div class="c-day${rs.length ? " has" : ""}${key === new Date().toISOString().slice(0, 10) ? " today" : ""}"><span class="c-num">${dn}</span>
        ${rs.slice(0, MAX).map(chip).join("")}
        ${rs.length > MAX ? `<button type="button" class="c-more" data-dlg="d${key}">+ ${rs.length - MAX} more</button>` : ""}</div>`);
      if (rs.length > MAX) dlg.push({ day: key, rs });
    }
    // phones: agenda (one list of days)
    const agenda = Object.keys(byDay).filter((k) => k.startsWith(ym)).sort().map((k) => `<div class="c-ag-day"><h4>${esc(new Date(k + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }))}</h4>
      ${byDay[k].map((r) => `<div class="c-ag-row" style="--c:${color((leafOf(r) || {}).id)}"><span class="c-dot"></span><div class="c-ag-t"><b>${esc((leafOf(r) || {}).name || r.item.title || "Session")}</b><small>${esc(timeRange(r.item.starts_at, r.item.ends_at))} · ${avail(r)}</small></div><div class="b-row-act">${action(r)}</div></div>`).join("")}</div>`).join("") || `<p class="muted">Nothing this month.</p>`;
    calHtml = `<div class="c-wrap">
      <div class="c-grid" role="grid">${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((x) => `<div class="c-wd">${x}</div>`).join("")}${cells.join("")}</div>
      <div class="c-agenda">${agenda}</div></div>`;
    calHtml = { ym, prev, next, html: calHtml, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  const dialogs = dlg.map((x) => x.day
    ? `<dialog class="b-dlg" id="d${x.day}"><div class="b-dlg-h"><b>${esc(new Date(x.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</b><button type="button" class="dlg-x" aria-label="Close">×</button></div>
        <div class="b-dlg-b">${x.rs.map(rowHtml2).join("")}</div></dialog>`
    : `<dialog class="b-dlg" id="s${x.item.id}"><div class="b-dlg-h"><span class="b-ic" style="background:${color((leafOf(x) || {}).id)}">${ACT_IC[Math.max(0, acts.findIndex((a) => a.id === (leafOf(x) || {}).id)) % ACT_IC.length]}</span>
        <span class="b-dlg-t"><b>${esc((leafOf(x) || {}).name || x.item.title || "Session")}</b><small>${esc(x.chain.slice(0, -1).map((n) => n.name).join(" • "))}</small></span><button type="button" class="dlg-x" aria-label="Close">×</button></div>
        <div class="b-dlg-b"><dl class="b-facts"><div><dt>When</dt><dd>${esc(slotName(x.item))}</dd></div><div><dt>Spots</dt><dd>${avail(x)}</dd></div><div><dt>Who can claim</dt><dd>${esc(whoLine(x))}</dd></div>
          ${x.item.location || x.eff.location || board.event_location ? `<div><dt>Where</dt><dd>${P.link(x.item.location || x.eff.location || board.event_location)}</dd></div>` : ""}
          ${limFor((leafOf(x) || {}).id) ? `<div><dt>${esc(Name)}</dt><dd>${limFor((leafOf(x) || {}).id)} in ${esc((leafOf(x) || {}).name)}</dd></div>` : ""}
          <div><dt>Going</dt><dd>${going(x) ? esc(going(x).replace(/^Going: /, "")) : `<span class="b-none">No one yet</span>`}</dd></div>
          ${x.leftover && !x.mine ? `<div><dt>Note</dt><dd>🔓 Extra spot: doesn't count toward limits</dd></div>` : ""}</dl>
          <div class="b-dlg-act">${action(x, true)}</div></div></dialog>`).join("");
  // ---- header + toolbar ----
  const fmtD = (x) => new Date(x).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
  const range = board.event_date ? require("./setup").eventDates(board) : span && span.first ? (fmtD(span.first) === fmtD(span.last) ? fmtD(span.first) : `${fmtD(span.first).replace(/, \d{4}$/, "")} – ${fmtD(span.last)}`) : "";
  const leafIds = new Set(acts.map((a) => a.id));
  const limitBits = person ? view.limits.map((L) => `<span><b>${L.left} of ${L.limit}</b> left ${L.kind === "board" ? "on this board" : `in ${esc(L.label || L.name)}`}</span>`) : [];
  const extra = rows.filter((r) => r.leftover && r.canClaim && r.open > 0);
  const sel = (name, label, list, cur, all) => `<label class="b-f"><span>${label}</span><select name="${name}" onchange="this.form.submit()"><option value="">${all}</option>${list.map((x) => `<option${cur === x ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>`;
  const hidden = (o) => Object.entries(o).filter(([, x]) => x).map(([k, x]) => `<input type="hidden" name="${k}" value="${esc(x)}">`).join("");
  return layout({ title: board.name, user, flash, admin, tab: "home", dash: true,
    body: `<div class="d-wrap b-wrap">
    <section class="b-head">
      <a class="b-back" href="/dashboard">${SVG('<path d="M19 12H5M11 18l-6-6 6-6"/>')}Back to Dashboard</a>
      ${board.image ? `<span class="d-thumb photo b-tile"><img src="/img/board/${board.id}?v=${board.image_at ? new Date(board.image_at).getTime() : 0}" alt=""></span>` : `<span class="d-thumb code b-tile"><b>${esc(require("./setup").codeOf(board))}</b></span>`}
      <div class="b-head-t"><div class="b-head-line"><h1>${esc(board.name)}</h1>
          ${range || board.event_location ? `<span class="b-head-meta">${[range ? `${IC.cal}${esc(range)}` : "", board.event_location ? `${IC.pin}${P.link(board.event_location)}` : ""].filter(Boolean).map((x) => `<span>${x}</span>`).join("")}</span>` : ""}
          ${board.contact_name || board.contact_info ? `<span class="b-org">Questions? ${esc([board.contact_name, board.contact_info].filter(Boolean).join(", "))}</span>` : ""}</div>
        ${board.description ? `<p>${esc(board.description)}</p>` : ""}</div>
    </section>
    <section class="b-bar">
      <span class="b-bar-l">Signing up for:</span>
      <nav class="b-people">${people.map((p) => `<a href="/b/${board.id}?p=${p.self_user_id ? "me" : p.id}&v=${mode === "cal" ? "cal" : "list"}"${person && ((p.self_user_id && person.self_user_id) || p.id === person.id) ? ' aria-current="true"' : ""}>${p.self_user_id ? "Me" : esc(p.first_name)}</a>`).join("")}</nav>
      ${person ? `<span class="b-bar-lim">${IC.people}<span>${limitBits.length ? `<b>${esc(Name)}:</b> ${limitBits.join(" · ")}` : `No claim limits for ${esc(person.self_user_id ? "you" : person.first_name)} on this board`}</span></span>` : ""}
      ${extra.length ? `<span class="b-bar-extra">${IC.mega}${extra.length} extra spot${extra.length === 1 ? "" : "s"} open to everyone</span>` : ""}
    </section>
    ${!person ? `<p class="b-pick">👆 Tap who's signing up to see what's available.</p>` : `
    <div class="b-tools">
      ${dated ? `<nav class="b-view"><a href="${link({ v: "list", m: "" })}"${mode !== "cal" ? ' aria-current="true"' : ""}>${SVG('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>')}List View</a>
        <a href="${link({ v: "cal" })}"${mode === "cal" ? ' aria-current="true"' : ""}>${IC.cal}Calendar View</a></nav>` : ""}
      ${mode === "cal" && dated ? `<div class="c-nav"><a href="${link({ m: calHtml.prev })}" aria-label="Previous month">${SVG('<path d="m15 18-6-6 6-6"/>')}</a><b>${esc(calHtml.label)}</b><a href="${link({ m: calHtml.next })}" aria-label="Next month">${IC.right}</a></div>
        <div class="c-legend">${acts.filter((a) => !filters.act || a.name === filters.act).map((a) => `<span style="--c:${color(a.id)}"><i></i>${esc(a.name)}${limFor(a.id)}</span>`).join("")}<span class="full"><i></i>Full</span></div>` : ""}
      ${mode !== "cal" && dated ? `<div class="b-group-w"><span class="b-group-l" id="grp-l">Group by</span><nav class="b-group" aria-labelledby="grp-l"><a href="${link({ g: "activity" })}"${group !== "day" ? ' aria-current="true"' : ""}>${esc(require("../schedules").labels(board).activity.one)}</a><a href="${link({ g: "day" })}"${group === "day" ? ' aria-current="true"' : ""}>Day</a></nav></div>` : ""}
      <form method="get" action="/b/${board.id}" class="b-filters">${hidden({ p: pid, v: mode === "cal" ? "cal" : "list", g: group === "day" ? "day" : "", m: month || "" })}
        ${sel("show", "Show", ["open", "mine"].map((x) => x), filters.show, "All sessions").replace('<option>open</option>', `<option value="open"${filters.show === "open" ? " selected" : ""}>Open to claim</option>`).replace('<option>mine</option>', `<option value="mine"${filters.show === "mine" ? " selected" : ""}>${esc(Name)}'s claims</option>`)}
        ${actNames.length > 1 ? sel("act", require("../schedules").labels(board).activity.one, actNames, filters.act, "All") : ""}
        ${groups.length > 1 ? sel("grp", "Group", groups, filters.grp, "All") : ""}
      </form>
    </div>
    ${mode === "cal" && dated ? calHtml.html : group === "day" && dated ? (byDayHtml() || listHtml) : listHtml}
    ${dialogs}`}
    </div>
    <script>
    (function () {
      document.querySelectorAll("[data-dlg]").forEach(function (b) { b.addEventListener("click", function () { var d = document.getElementById(b.dataset.dlg); if (d) d.showModal(); }); });
      document.querySelectorAll(".b-dlg").forEach(function (d) { d.querySelector(".dlg-x").addEventListener("click", function () { d.close(); });
        d.addEventListener("click", function (e) { if (e.target === d) d.close(); }); });
      var K = "b-open-${board.id}", st = {}; try { st = JSON.parse(localStorage.getItem(K) || "{}"); } catch (e) {}
      document.querySelectorAll("details.b-sec").forEach(function (d) { if (d.dataset.id in st) d.open = st[d.dataset.id];
        d.addEventListener("toggle", function () { st[d.dataset.id] = d.open; try { localStorage.setItem(K, JSON.stringify(st)); } catch (e) {} }); });
      var h = location.hash && document.querySelector(location.hash); if (h) { var p = h.closest("details"); if (p) p.open = true; h.scrollIntoView({ block: "center" }); h.classList.add("flash"); }
      document.querySelectorAll(".b-claimf, .b-cancelf").forEach(function (f) { f.addEventListener("submit", function () { setTimeout(function () { var b = f.querySelector("button"); b.disabled = true; b.classList.add("busy"); }, 0); }); });
    })();
    </script>` });
}
const IC_CHECK = SVG('<path d="m5 12.5 4.5 4.5L19 7"/>', ' stroke-width="2.6"');

module.exports = { homePage, whoPage, boardPage };
