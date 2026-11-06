const { esc, layout } = require("./layout");
const timeRange = (a, b) => { const f = (x) => new Date(x).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }); return a ? `${f(a)} – ${b ? f(b) : ""}` : ""; };
const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const L = SVG('<path d="m15 18-6-6 6-6"/>'), R = SVG('<path d="m9 18 6-6-6-6"/>');
const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const where = (x) => x.location || x.event_location || "";
const leaf = (p) => (p || "").split(" › ").pop();
const crumb = (p) => (p || "").split(" › ").slice(0, -1).join(" • ");

const CK_IC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>`;
function dayPage({ user, flash, admin, day, sessions: allSessions, board = 0, isToday, prev, next }) {
  // boards with sessions this day become sub-tabs (only when there's more than one)
  const boards = [...new Map(allSessions.map((x) => [x.board_id, x.board_name])).entries()];
  const sessions = board && boards.some(([id]) => id === board) ? allSessions.filter((x) => x.board_id === board) : allSessions;
  const tot = sessions.reduce((t, x) => ({ c: t.c + x.claimed, h: t.h + x.here }), { c: 0, h: 0 });
  const bq = board ? `&b=${board}` : "";
  return layout({ title: "Check-in", user, flash, admin, tab: "checkin", dash: true,
    body: `<div class="d-wrap ck-wrap">
    <section class="bh2 ck-hd"><div class="bh2-l"><span class="bh2-tile dash-tile">${CK_IC}</span>
      <div><div class="bh2-t"><h1>Check-in</h1></div><span class="bh2-meta">${esc(dayLabel(day))}${isToday ? " (today)" : ""} · ${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${tot.c} claimed · ${tot.h} checked in</span></div></div></section>
    <nav class="bh2-tabs dash-tabs ck-gbar">
      <span class="ck-days">${prev ? `<a href="/checkin?d=${prev}${bq}" aria-label="Previous day with sessions">${L}</a>` : `<span class="off">${L}</span>`}
        <b>${isToday ? "Today · " : ""}${esc(dayLabel(day))}</b>
        ${next ? `<a href="/checkin?d=${next}${bq}" aria-label="Next day with sessions">${R}</a>` : `<span class="off">${R}</span>`}</span>
      ${isToday ? "" : `<a class="sb-btn ck-today" href="/checkin${board ? `?b=${board}` : ""}">Today</a>`}
    </nav>
    ${boards.length > 1 ? `<nav class="sub-tabs ck-subs"><a href="/checkin?d=${day}&b=0"${!board ? ' aria-current="page"' : ""}>All boards</a>${boards.map(([id, n]) => `<a href="/checkin?d=${day}&b=${id}"${board === id ? ' aria-current="page"' : ""}>${esc(n)}</a>`).join("")}</nav>` : ""}
    <div class="sub-body ck-sheet${boards.length > 1 ? "" : " no-subs"}">
    ${sessions.length ? [...new Map(sessions.map((x) => [x.board_id, x.board_name])).entries()].map(([bid, bname]) => { const mine = sessions.filter((x) => x.board_id === bid), t2 = mine.reduce((t, x) => ({ c: t.c + x.claimed, h: t.h + x.here }), { c: 0, h: 0 });
      const ini = String(bname || "?").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
      return `<section class="ck-bsec"><div class="ck-bhd"><span class="ck-btile">${esc(ini)}</span><div><b>${esc(bname)}</b><span class="fine">${mine.length} session${mine.length === 1 ? "" : "s"} · ${t2.c} claimed · ${t2.h} here</span></div></div>
      <div class="ck-list">${mine.map((s) => {
      const done = s.here + s.noshow, pct = s.claimed ? Math.round((done / s.claimed) * 100) : 0;
      return `<a class="ck-card" href="/checkin/i/${s.id}">
        <span class="ck-time">${esc(timeRange(s.starts_at, s.ends_at))}</span>
        <span class="ck-what"><b>${esc(leaf(s.path) || s.title || "Session")}</b><small>${esc([board || boards.length > 0 ? "" : s.board_name, crumb(s.path), s.title && s.path ? s.title : ""].filter(Boolean).join(" • "))}</small>
          ${where(s) ? `<small>${esc(where(s))}</small>` : ""}</span>
        <span class="ck-nums">${s.rsvp ? `<b>${s.rsvp.going}</b> going · ${s.rsvp.no} can't make it · ${s.rsvp.none} no answer${s.here ? ` · <b>${s.here}</b> here` : ""}` : `<b>${s.here}</b> here · ${s.noshow ? `<b>${s.noshow}</b> no-show · ` : ""}${s.claimed} claimed`}
          <span class="ck-bar"><i style="width:${pct}%"></i></span></span>
        <span class="ck-go">${R}</span></a>`; }).join("")}</div></section>`; }).join("")
      : `<div class="d-empty"><b>No sessions to check in ${isToday ? "today" : "this day"}.</b><span>${next ? `<a href="/checkin?d=${next}">Next: ${esc(dayLabel(next))}</a>` : prev ? `<a href="/checkin?d=${prev}">Last: ${esc(dayLabel(prev))}</a>` : "Sessions show here once a board you check in has them."}</span></div>`}
    </div></div>` });
}

function rosterPage({ user, flash, admin, it, people, board, others, sub = "roster", rsvp = null }) {
  const lock = it.lock || { locked: false, until: null }, ro = lock.locked && !admin;   // read-only for coaches once it's closed
  const short = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const conf = people.filter((p) => p.status === "confirmed"), wl = people.filter((p) => p.status === "waitlisted");
  const q = it.question || {};
  const day = new Date(it.starts_at || Date.now()).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const row = (p) => `<li class="ck-p" data-claim="${p.id}" data-state="${p.attended === true ? "here" : p.attended === false ? "noshow" : ""}">
      <span class="ck-name"><b>${esc(p.first_name)} ${esc(p.last_name)}</b>
        <small>${[p.group_name, p.walk_in ? "Walk-in" : "", p.counts === false && !p.walk_in && !rsvp ? "Extra spot" : "", p.status === "waitlisted" ? "Waitlist" : ""].filter(Boolean).map(esc).join(" · ")}</small>
        ${q.label && p.note ? `<small class="ck-ans">${esc(q.label)}: ${esc(p.note)}</small>` : rsvp && p.note ? `<small class="ck-ans">“${esc(p.note)}”</small>` : ""}</span>
      <form method="post" action="/checkin/i/${it.id}/mark" class="ck-btns"><input type="hidden" name="claim" value="${p.id}">
        <button name="state" value="here" class="ck-here" type="submit" aria-label="Here"${ro ? " disabled" : ""}>✓ Here</button>
        <button name="state" value="noshow" class="ck-no" type="submit" aria-label="No-show"${ro ? " disabled" : ""}>✗ No-show</button></form></li>`;
  const here = conf.filter((p) => p.attended === true).length, no = conf.filter((p) => p.attended === false).length;
  return layout({ title: `Check-in · ${it.board_name}`, user, flash, admin, tab: "checkin", dash: true,
    body: `<div class="d-wrap ck-wrap">
    <nav class="back-row"><a class="back-btn" href="/checkin?d=${day}">${L}Back to Check-in</a></nav>
    <section class="bh2 ck-hd"><div class="bh2-l"><span class="bh2-tile dash-tile">${CK_IC}</span>
      <div><span class="ck-board">${esc(it.board_name)}</span><div class="bh2-t"><h1>${esc(leaf(it.path) || it.title || "Session")}</h1></div>
        <span class="bh2-meta">${esc([crumb(it.path), it.starts_at ? timeRange(it.starts_at, it.ends_at) : "", where(it)].filter(Boolean).join(" · "))}</span></div></div></section>
    <nav class="bh2-tabs dash-tabs ck-gbar">
      <span class="ck-sum"><b id="ck-here">${here}</b> here · <b id="ck-no">${no}</b> no-show · <span id="ck-claimed">${conf.length}</span> ${rsvp ? "going" : "claimed"}
        <span class="ck-bar-p"><i id="ck-pct" style="width:${conf.length ? Math.round(((here + no) / conf.length) * 100) : 0}%"></i></span></span>
      ${lock.until ? `<span class="ck-lock${lock.locked ? " on" : ""}">${lock.locked ? (admin ? `Closed for coaches ${esc(short(lock.until))}. You can still change it.` : `Check-in closed ${esc(short(lock.until))}`) : `Open until ${esc(short(lock.until))}`}</span>` : ""}
      ${conf.length && !ro ? `<form method="post" action="/checkin/i/${it.id}/all" class="ck-allf" onsubmit="var n = document.querySelectorAll('.ck-p-roster .ck-p:not([data-state=here]):not([data-state=noshow])').length; if (!n) { alert('Everyone is already marked.'); return false; } return confirm('Mark the ' + n + (n === 1 ? ' person' : ' people') + ' not checked in yet as here?');"><button class="sb-btn primary" type="submit">Mark the rest here</button></form>` : ""}
    </nav>
    <div class="sub-body ck-sheet no-subs">
    <div class="ck-listbar"><h3>${rsvp ? "Going" : "Signed up"} <i class="sub-n">${conf.length}</i></h3>
      ${ro ? "" : `<button type="button" class="sb-btn ck-addwalk" onclick="var w=document.getElementById('walkin'); w.hidden=!w.hidden; window.dispatchEvent(new Event('resize')); if (!w.hidden) { w.querySelector('select, input').focus(); }">+ Add walk-in</button>`}</div>
        <section class="d-card ck-walk" id="walkin" hidden><h3>Add a walk-in</h3><p class="fine">Someone here who didn't claim? Add them. They're added to the list as here, and don't use a spot or count toward limits.</p>
      <form method="post" action="/checkin/i/${it.id}/walkin" class="a-form">
        <label>Pick someone<select name="athlete_id"><option value="">Choose…</option>
          ${board.length ? `<optgroup label="On this board">${board.map((p) => `<option value="${p.id}">${esc(p.last_name)}, ${esc(p.first_name)}${p.group_name ? ` (${esc(p.group_name)})` : ""}</option>`).join("")}</optgroup>` : ""}
          ${others.length ? `<optgroup label="Everyone else in People">${others.map((p) => `<option value="${p.id}">${esc(p.last_name)}, ${esc(p.first_name)}</option>`).join("")}</optgroup>` : ""}</select></label>
        <p class="fine">Not listed? Type their name:</p>
        <div class="a-row"><label>First name<input name="first_name" maxlength="40"></label><label>Last name<input name="last_name" maxlength="40"></label></div>
        <div class="a-act"><button type="button" class="link-dark" onclick="var w=document.getElementById('walkin'); w.hidden=true; w.querySelector('form').reset(); window.dispatchEvent(new Event('resize'));">Cancel</button><button class="b-claim" type="submit">Add as here</button></div></form></section>
    <div class="ck-scroll" id="ck-scroll">
    <section class="d-card ck-card-list ck-p-roster">${conf.length ? `<ul class="ck-roster">${conf.map(row).join("")}</ul>` : `<div class="d-empty"><b>No one has claimed this session.</b><span>Use <b>+ Add walk-in</b> above for anyone who shows up.</span></div>`}</section>
    ${rsvp ? (() => { const nm = (p) => `<li class="ck-rv"><b>${esc(p.first_name)} ${esc(p.last_name || "")}</b>${p.team ? ` <small>${esc(p.team)}</small>` : ""}${p.note ? `<small class="ck-ans">“${esc(p.note)}”</small>` : ""}</li>`;
      return `<h3 class="ck-wlh">Can't make it <i class="sub-n">${rsvp.no.length}</i></h3><section class="d-card ck-card-list"><ul class="ck-rvl">${rsvp.no.length ? rsvp.no.map(nm).join("") : `<li class="fine">No one.</li>`}</ul></section>
        <h3 class="ck-wlh">No answer yet <i class="sub-n">${rsvp.none.length}</i></h3><section class="d-card ck-card-list"><ul class="ck-rvl">${rsvp.none.length ? rsvp.none.map(nm).join("") : `<li class="fine">Everyone has answered.</li>`}</ul></section>`; })() : ""}
    ${wl.length ? `<h3 class="ck-wlh">Waitlist <i class="sub-n">${wl.length}</i></h3><section class="d-card ck-card-list ck-p-waitlist"><ul class="ck-roster">${wl.map(row).join("")}</ul></section>` : ""}

    </div></div>
    </div>
    <script>(function () {
      var box = document.getElementById("ck-scroll"), root = document.documentElement;
      function fit() { root.classList.remove("b-fixed"); box.style.height = "";
        root.classList.add("b-measure"); var after = Math.max(0, document.body.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom); root.classList.remove("b-measure");
        var h = window.innerHeight - (box.getBoundingClientRect().top + window.scrollY) - after - 10; if (h < 240) return; root.classList.add("b-fixed"); box.style.height = h + "px"; }
      fit(); window.addEventListener("resize", fit);
    })();</script>
    <script>
    (function () {
      document.querySelectorAll(".ck-btns").forEach(function (f) {
        f.addEventListener("submit", function (e) {
          e.preventDefault(); var li = f.closest(".ck-p"), btn = e.submitter, cur = li.dataset.state, want = btn.value === cur ? "clear" : btn.value;
          li.dataset.state = want === "clear" ? "" : want;                      // show it right away
          var body = new URLSearchParams({ claim: f.claim.value, state: want });
          fetch(f.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: body })
            .then(function (r) { return r.json(); }).then(function (c) { if (!c.ok) throw 0;
              document.getElementById("ck-here").textContent = c.here; document.getElementById("ck-no").textContent = c.noshow;
              var tot = +document.getElementById("ck-claimed").textContent || 0; document.getElementById("ck-pct").style.width = (tot ? Math.round(((c.here + c.noshow) / tot) * 100) : 0) + "%"; })
            .catch(function () { li.dataset.state = cur; alert("That didn't save. Check-in may be closed, or check your connection and try again."); });
        });
      });
    })();
    </script>` });
}
module.exports = { dayPage, rosterPage };
