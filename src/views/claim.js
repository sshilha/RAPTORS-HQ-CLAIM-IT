// What people see. Big, simple, one question per screen.
const { esc, layout } = require("./layout");
const { slotName, fmtDateTime, inputParts } = require("../time");
const P = require("../locations");

const page = (o) => layout({ ...o, tab: "home", xwide: true });
const who = (p) => (p && p.self_user_id ? "you" : p ? p.first_name : "");
const Who = (p) => (p && p.self_user_id ? "You" : p ? p.first_name : "");
const evDates = (b) => (b.event_date ? require("./setup").eventDates(b) : "");

function homePage({ user, flash, upcoming, boards, extra, admin }) {
  return page({ title: "My Claims", user, flash, admin,
    body: `<h1 class="mc-title">My Claims</h1>
    ${extra.length ? `<div class="mc-extra-line">${[...extra.reduce((m, x) => { const k = `${x.board.id}:${x.person.id}`; if (!m.has(k)) m.set(k, { ...x, n: 0 }); m.get(k).n++; return m; }, new Map()).values()]
      .map((x) => `<a href="/b/${x.board.id}?p=${x.person.self_user_id ? "me" : x.person.id}">🔓 <b>${x.n} extra spot${x.n === 1 ? " is" : "s are"} open</b> on ${esc(x.board.name)} for ${esc(Who(x.person))}. <span>See them ›</span></a>`).join("")}</div>` : ""}
    <section class="panel"><h2>Your upcoming claims</h2>
      ${upcoming.length ? [...upcoming.reduce((m, c) => m.set(c.board_name, [...(m.get(c.board_name) || []), c]), new Map())].map(([bname, cs], gi) => `<details class="mc-tw lvl-0"${gi < 2 ? " open" : ""}>
        <summary><span class="tw" aria-hidden="true"></span><b>${esc(bname)}</b><span class="tw-sum"><span class="ok">${cs.length} claimed</span>${cs[0] && cs[0].starts_at ? ` · next ${esc(slotName({ starts_at: cs[0].starts_at, ends_at: cs[0].ends_at }).split(",").slice(0, 2).join(","))}` : ""}</span></summary>
        <div class="mc-tw-body"><ul class="mc-rows">${cs.map((c) => `<li class="${c.status === "waitlisted" ? "wl" : ""}">
        <div class="mc-what"><b>${esc(slotName(c))}</b><span>${esc(c.self_user_id ? "You" : c.first_name)}${c.path ? ` · ${esc(c.path)}` : ""}${c.status === "waitlisted" ? " · <b>on the waitlist</b>" : ""}</span>
          ${c.location ? `<span>${P.link(c.location)}</span>` : ""}</div>
        <form method="post" action="/claims/${c.id}/cancel" onsubmit="return confirm('Cancel this spot? It will open for someone else.')"><input type="hidden" name="back" value="/dashboard">
          <button class="btn-ghost" type="submit">Cancel</button></form></li>`).join("")}</ul></div></details>`).join("")
        : `<p class="muted">Nothing claimed yet. Pick something to sign up for below.</p>`}
    </section>
    <section class="panel"><h2>Sign up for something</h2>
      ${boards.length ? `<div class="mc-boards">${boards.map(({ board: b }) => `<a class="mc-board" href="/b/${b.id}">
          <b>${esc(b.name)}</b>
          ${evDates(b) || b.event_location ? `<span>${esc([evDates(b), b.event_location].filter(Boolean).join(" · "))}</span>` : ""}
          ${b.description ? `<span class="desc">${esc(b.description.split(/\n/)[0].slice(0, 140))}</span>` : ""}
          <span class="go">Sign up ›</span></a>`).join("")}</div>`
        : `<p class="muted">There's nothing open for you to sign up for right now.</p>`}
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
    <div class="mc-what"><b>${esc(slotName(it))}</b>
      <span>${r.mine ? "" : r.full ? "Full" : `${r.open} of ${it.capacity} open`}${r.leftover && !r.mine ? ` · <b class="lo-tag">🔓 Open to everyone</b> <span class="fine">(doesn't count toward limits)</span>` : ""}${(it.location || r.eff.location) ? ` · ${P.link(it.location || r.eff.location)}` : ""}</span></div>
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
  const flat = (list) => list.length ? `<ul class="mc-rows">${list.map((r) => rowHtml(board, person, r, back)).join("")}</ul>` : `<p class="muted">Nothing here on this day.</p>`;
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
      ${day ? `<h2 class="mc-day">${esc(new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</h2>${flat(byDay[day] || [])}` : ""}`;
  }
  const pick = (p) => `/b/${board.id}?p=${p.self_user_id ? "me" : p.id}${mode === "cal" ? "&v=cal" : ""}`;
  const meta = [evDates(board), board.event_location ? P.link(board.event_location) : "", board.contact_name || board.contact_info ? `Questions? ${esc([board.contact_name, board.contact_info].filter(Boolean).join(", "))}` : ""].filter(Boolean);
  return page({ title: board.name, user, flash,
    body: `<div class="mc-top"><a class="back" href="/dashboard">My Claims</a>
      <h1 class="mc-bname">${esc(board.name)}</h1>${meta.length ? `<span class="mc-meta">${meta.map((x) => x.startsWith("<") ? x : esc(x)).join(" · ")}</span>` : ""}</div>
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
