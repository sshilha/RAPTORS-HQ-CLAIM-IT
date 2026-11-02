const { esc, layout } = require("./layout");
const timeRange = (a, b) => { const f = (x) => new Date(x).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }); return a ? `${f(a)} – ${b ? f(b) : ""}` : ""; };
const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const L = SVG('<path d="m15 18-6-6 6-6"/>'), R = SVG('<path d="m9 18 6-6-6-6"/>');
const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const where = (x) => x.location || x.event_location || "";
const leaf = (p) => (p || "").split(" › ").pop();
const crumb = (p) => (p || "").split(" › ").slice(0, -1).join(" • ");

function dayPage({ user, flash, admin, day, sessions, isToday, prev, next }) {
  return layout({ title: "Check-in", user, flash, admin, tab: "checkin", dash: true,
    body: `<div class="d-wrap ck-wrap">
    <div class="ck-top"><h1>Check-in</h1>
      <nav class="ck-days">${prev ? `<a href="/checkin?d=${prev}" aria-label="Previous day with sessions">${L}</a>` : `<span class="off">${L}</span>`}
        <b>${isToday ? "Today · " : ""}${esc(dayLabel(day))}</b>
        ${next ? `<a href="/checkin?d=${next}" aria-label="Next day with sessions">${R}</a>` : `<span class="off">${R}</span>`}
        ${isToday ? "" : `<a class="ck-today" href="/checkin">Today</a>`}</nav></div>
    ${sessions.length ? `<div class="ck-list">${sessions.map((s) => {
      const done = s.here + s.noshow, pct = s.claimed ? Math.round((done / s.claimed) * 100) : 0;
      return `<a class="ck-card" href="/checkin/i/${s.id}">
        <span class="ck-time">${esc(timeRange(s.starts_at, s.ends_at))}</span>
        <span class="ck-what"><b>${esc(leaf(s.path) || s.title || "Session")}</b><small>${esc([s.board_name, crumb(s.path), s.title && s.path ? s.title : ""].filter(Boolean).join(" • "))}</small>
          ${where(s) ? `<small>${esc(where(s))}</small>` : ""}</span>
        <span class="ck-nums"><b>${s.here}</b> here · ${s.noshow ? `<b>${s.noshow}</b> no-show · ` : ""}${s.claimed} claimed
          <span class="ck-bar"><i style="width:${pct}%"></i></span></span>
        <span class="ck-go">${R}</span></a>`; }).join("")}</div>`
      : `<div class="d-empty"><b>No sessions to check in ${isToday ? "today" : "this day"}.</b><span>${next ? `<a href="/checkin?d=${next}">Next: ${esc(dayLabel(next))}</a>` : prev ? `<a href="/checkin?d=${prev}">Last: ${esc(dayLabel(prev))}</a>` : "Sessions show here once a board you check in has them."}</span></div>`}
    </div>` });
}

function rosterPage({ user, flash, admin, it, people, board, others }) {
  const conf = people.filter((p) => p.status === "confirmed"), wl = people.filter((p) => p.status === "waitlisted");
  const q = it.question || {};
  const day = new Date(it.starts_at || Date.now()).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const row = (p) => `<li class="ck-p" data-claim="${p.id}" data-state="${p.attended === true ? "here" : p.attended === false ? "noshow" : ""}">
      <span class="ck-name"><b>${esc(p.first_name)} ${esc(p.last_name)}</b>
        <small>${[p.group_name, p.walk_in ? "Walk-in" : "", p.counts === false && !p.walk_in ? "Extra spot" : "", p.status === "waitlisted" ? "Waitlist" : ""].filter(Boolean).map(esc).join(" · ")}</small>
        ${q.label && p.note ? `<small class="ck-ans">${esc(q.label)}: ${esc(p.note)}</small>` : ""}</span>
      <form method="post" action="/checkin/i/${it.id}/mark" class="ck-btns"><input type="hidden" name="claim" value="${p.id}">
        <button name="state" value="here" class="ck-here" type="submit" aria-label="Here">✓ Here</button>
        <button name="state" value="noshow" class="ck-no" type="submit" aria-label="No-show">✗ No-show</button></form></li>`;
  const here = conf.filter((p) => p.attended === true).length, no = conf.filter((p) => p.attended === false).length;
  return layout({ title: `Check-in · ${it.board_name}`, user, flash, admin, tab: "checkin", dash: true,
    body: `<div class="d-wrap ck-wrap">
    <a class="b-back" href="/checkin?d=${day}">${L}Back to ${esc(dayLabel(day))}</a>
    <div class="ck-head"><div><h1>${esc(leaf(it.path) || it.title || "Session")}</h1>
      <span>${esc([it.board_name, crumb(it.path)].filter(Boolean).join(" • "))}</span>
      <span>${it.starts_at ? esc(timeRange(it.starts_at, it.ends_at)) : ""}${where(it) ? ` · ${esc(where(it))}` : ""}</span></div>
      <div class="ck-sum"><b id="ck-here">${here}</b> here · <b id="ck-no">${no}</b> no-show · <span id="ck-claimed">${conf.length}</span> claimed</div></div>
    ${conf.length ? `<form method="post" action="/checkin/i/${it.id}/all" class="ck-allf"><button class="b-cancelf-btn" type="submit">Mark everyone else here</button></form>` : ""}
    <section class="d-card ck-card-list">${conf.length ? `<ul class="ck-roster">${conf.map(row).join("")}</ul>` : `<div class="d-empty"><b>No one has claimed this session.</b><span>Add walk-ins below.</span></div>`}</section>
    ${wl.length ? `<h3 class="ck-h3">Waitlist</h3><section class="d-card ck-card-list"><ul class="ck-roster">${wl.map(row).join("")}</ul></section>` : ""}
    <section class="d-card ck-walk" id="walkin"><h3>+ Walk-in</h3><p class="fine">Someone here who didn't claim? Add them. Walk-ins don't use a spot or count toward limits.</p>
      <form method="post" action="/checkin/i/${it.id}/walkin" class="a-form">
        <label>Pick someone<select name="athlete_id"><option value="">Choose…</option>
          ${board.length ? `<optgroup label="On this board">${board.map((p) => `<option value="${p.id}">${esc(p.last_name)}, ${esc(p.first_name)}${p.group_name ? ` (${esc(p.group_name)})` : ""}</option>`).join("")}</optgroup>` : ""}
          ${others.length ? `<optgroup label="Everyone else in People">${others.map((p) => `<option value="${p.id}">${esc(p.last_name)}, ${esc(p.first_name)}</option>`).join("")}</optgroup>` : ""}</select></label>
        <p class="fine">Not listed? Type their name:</p>
        <div class="a-row"><label>First name<input name="first_name" maxlength="40"></label><label>Last name<input name="last_name" maxlength="40"></label></div>
        <div class="a-act"><button class="b-claim" type="submit">Add walk-in</button></div></form></section>
    </div>
    <script>
    (function () {
      document.querySelectorAll(".ck-btns").forEach(function (f) {
        f.addEventListener("submit", function (e) {
          e.preventDefault(); var li = f.closest(".ck-p"), btn = e.submitter, cur = li.dataset.state, want = btn.value === cur ? "clear" : btn.value;
          li.dataset.state = want === "clear" ? "" : want;                      // show it right away
          var body = new URLSearchParams({ claim: f.claim.value, state: want });
          fetch(f.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: body })
            .then(function (r) { return r.json(); }).then(function (c) { if (!c.ok) throw 0;
              document.getElementById("ck-here").textContent = c.here; document.getElementById("ck-no").textContent = c.noshow; })
            .catch(function () { li.dataset.state = cur; alert("That didn't save. Check your connection and try again."); });
        });
      });
    })();
    </script>` });
}
module.exports = { dayPage, rosterPage };
