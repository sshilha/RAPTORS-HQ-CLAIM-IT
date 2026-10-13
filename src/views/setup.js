const { esc } = require("./layout");
const { page } = require("./admin");
const { AGE_GROUPS, ACTIVITIES, ACTIVITY_COLORS } = require("../config");
const { fmtDateTime } = require("../time");
const { typeLabel, defaultsFor } = require("../rounds");
const { niceRange, shortRange, statusPill } = require("./rounds");

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const back = (anchor) => `<input type="hidden" name="return_to" value="/admin/setup${anchor ? `#${anchor}` : ""}">`;
const swatch = (a) => `<span class="swatch" style="background:${ACTIVITY_COLORS[a]}"></span>`;

function roundBlock(r, locked) {
  const anchor = `round-${r.id}`;
  const slots = r.time_slots || [];
  return `<details class="round" id="${anchor}">
    <summary>
      <span class="r-name">${esc(r.name)}</span>
      <span class="r-dates">${esc(niceRange(r.starts_on, r.ends_on))}</span>
      <span class="r-stats">${pl(r.types.length, "session")}, ${r.scheduled} on calendar, ${r.claimed}/${r.spots} spots claimed</span>
      ${locked ? `<span class="pill">Completed</span>` : statusPill(r)}
    </summary>
    <div class="round-body">
      <div class="round-actions">
        <a class="btn-small" href="/admin/rounds/${r.id}">Open calendar</a>
        ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/publish">${back(anchor)}
          <button class="btn-ghost" type="submit">${r.published_at ? "Hide from families" : "Publish round"}</button></form>`}
        <a class="link-dark" href="/admin/rounds/${r.id}#settings">Round settings</a>
        <a class="link-dark" href="/admin/reports?round=${r.id}">Reports</a>
      </div>

      <div class="round-grid">
        <div>
          <p class="label-like">Times</p>
          ${slots.length ? `<ul class="slot-list">${slots.map((t) => `<li><span>${esc(shortRange(t.start, t.end))}</span>
            ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/slots/remove">${back(anchor)}<input type="hidden" name="slot" value="${t.start}-${t.end}">
              <button type="submit" class="x" aria-label="Remove time">×</button></form>`}</li>`).join("")}</ul>` : `<p class="muted small">No times yet.</p>`}
          ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/slots" class="inline-add">${back(anchor)}
            <label>Start<input type="time" name="start_time" required></label>
            <label>End<input type="time" name="end_time" required></label>
            <button class="btn-ghost" type="submit">Add time</button></form>`}
        </div>

        <div>
          <p class="label-like">Sessions</p>
          ${r.types.length ? `<table class="types compact"><thead><tr><th>Session</th><th>Spots</th><th>Coach</th><th>On calendar</th><th></th></tr></thead>
            <tbody>${r.types.map((t) => `<tr>
              <td>${swatch(t.activity)}<strong>${esc(typeLabel(t.activity, t.age_groups))}</strong></td>
              ${locked ? `<td>${t.default_capacity || defaultsFor(r, t.activity).capacity}</td><td>${esc(t.default_coach || "")}</td><td>${t.scheduled}</td><td></td>` : `
              <td><input form="st-${t.id}" type="number" name="spots" min="1" max="200" required value="${t.default_capacity || defaultsFor(r, t.activity).capacity}" aria-label="Spots"></td>
              <td><input form="st-${t.id}" name="coach" value="${esc(t.default_coach)}" placeholder="Optional" aria-label="Coach"></td>
              <td>${t.scheduled}</td>
              <td><div class="row-actions">
                <form id="st-${t.id}" method="post" action="/admin/rounds/${r.id}/types/${t.id}">${back(anchor)}<button class="btn-ghost" type="submit">Save</button></form>
                ${t.scheduled ? "" : `<form method="post" action="/admin/rounds/${r.id}/types/${t.id}/delete">${back(anchor)}<button class="x" type="submit" aria-label="Remove session">×</button></form>`}
              </div></td>`}
            </tr>`).join("")}</tbody></table>` : `<p class="muted small">No sessions yet.</p>`}

          ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/types" class="quick-type">${back(anchor)}
            <select name="activity" required aria-label="Activity"><option value="">Activity…</option>${ACTIVITIES.map((a) => `<option>${esc(a)}</option>`).join("")}</select>
            <span class="ages">${AGE_GROUPS.map((g) => `<label class="check"><input type="checkbox" name="ages" value="${g}"> ${g}</label>`).join("")}
              <button type="button" class="tchip" data-ages="8U,10U">8U–10U</button>
              <button type="button" class="tchip" data-ages="12U,14U,16U,18U">12U–18U</button></span>
            <input type="number" name="spots" min="1" max="200" required placeholder="Spots" aria-label="Spots" class="spots-in">
            <input name="coach" placeholder="Coach (optional)" aria-label="Coach" class="coach-in">
            <button class="btn-small" type="submit">Add session</button>
          </form>`}
        </div>
      </div>
    </div>
  </details>`;
}

function newRoundForm(seasonId, allRounds, first) {
  return `<details class="add-round" id="${first ? "round-new" : `new-round-${seasonId}`}"><summary>Add a round</summary>
    <form method="post" action="/admin/rounds" class="inline-add wrap">
      <input type="hidden" name="return_to" value="/admin/setup#round-{id}">
      <input type="hidden" name="season_id" value="${seasonId || ""}">
      <label>Name<input name="name" required placeholder="Round 1"></label>
      <label>First day<input type="date" name="starts_on" required></label>
      <label>Last day<input type="date" name="ends_on" required></label>
      <label>Start from<select name="copy_from"><option value="">Empty</option>
        ${allRounds.map((r) => `<option value="${r.id}">Copy of ${esc(r.name)} (${esc(niceRange(r.starts_on, r.ends_on))})</option>`).join("")}</select></label>
      <button class="btn-small" type="submit">Add round</button>
    </form></details>`;
}

function seasonBlock(s, rounds, allRounds, first) {
  const done = !!s.completed_at;
  const claimed = rounds.reduce((n, r) => n + r.claimed, 0);
  return `<section class="panel season${done ? " done" : ""}" id="season-${s.id}">
    <div class="athlete-head">
      <div><h2 class="season-title">${esc(s.name)}</h2>
        <p class="muted tight">${esc(niceRange(s.starts_on, s.ends_on))}. ${pl(rounds.length, "round")}, ${pl(claimed, "spot")} claimed.</p></div>
      <div class="head-actions">
        ${done ? `<span class="pill">Completed</span>` : `<span class="pill ok">Open</span>`}
        <a class="btn-ghost" href="/admin/reports?season=${s.id}">Reports</a>
        <a class="btn-ghost" href="/admin/seasons/${s.id}">Settings</a>
        ${done ? "" : `<form method="post" action="/admin/seasons/${s.id}/complete" onsubmit="return confirm('Complete ${esc(s.name)}? Families will no longer see it, and it becomes read-only. Reports stay available.')">${back(`season-${s.id}`)}
          <button class="btn-ghost" type="submit">Complete season</button></form>`}
      </div>
    </div>
    ${done ? `<p class="rule">Completed ${esc(fmtDateTime(s.completed_at))}. Read-only. Reopen it from Settings if you need to change something.</p>` : ""}
    <div class="rounds">${rounds.length ? rounds.map((r) => roundBlock(r, done)).join("") : `<p class="muted">No rounds yet.</p>`}</div>
    ${done ? "" : newRoundForm(s.id, allRounds, first)}
  </section>`;
}

function setupPage({ user, flash, seasons, rounds, standalone }) {
  const open = seasons.filter((s) => !s.completed_at);
  const done = seasons.filter((s) => s.completed_at);
  const loose = rounds.filter((r) => !r.season_id);
  const allRounds = [...rounds].reverse();
  return page({
    title: "Setup", tab: "setup", user, flash, xwide: true,
    body: `<section class="panel">
      <div class="athlete-head">
        <div><h1>Setup</h1>
          <p class="muted tight">Season, then rounds, then each round's times and sessions. Open a round's calendar to put sessions on days.</p></div>
        <div class="head-actions"><a class="btn-small" href="/admin/import">Import vendor schedule</a></div>
      </div>
    </section>

    ${open.length ? open.map((s, i) => seasonBlock(s, rounds.filter((r) => r.season_id === s.id), allRounds, i === 0)).join("")
      : `<section class="panel"><p class="rule">No open season. Open one below to get started.</p></section>`}

    ${loose.length ? `<section class="panel" id="season-none">
      <h2 class="season-title">Rounds not in a season</h2>
      <p class="muted tight">Add these to a season from the season's Settings page.</p>
      <div class="rounds">${loose.map((r) => roundBlock(r, false)).join("")}</div>
    </section>` : ""}

    <section class="panel">
      <details class="add-round" id="season-new"${open.length ? "" : " open"}><summary>Open a new season</summary>
        <form method="post" action="/admin/seasons" class="inline-add wrap">
          <input type="hidden" name="return_to" value="/admin/setup#season-{id}">
          <label>Name<input name="name" required placeholder="Winter Training 2026–27"></label>
          <label>First day<input type="date" name="starts_on" required></label>
          <label>Last day<input type="date" name="ends_on" required></label>
          <label>Start from<select name="copy_from"><option value="">Empty</option>
            ${seasons.map((s) => `<option value="${s.id}">Copy of ${esc(s.name)}</option>`).join("")}</select></label>
          <button class="btn-small" type="submit">Open season</button>
        </form>
        <p class="fine">A copy brings every round, time, session, spots, and the schedule, shifted to the new first day. Start on the same weekday as last year to keep sessions on the same days.</p>
      </details>
    </section>

    ${done.length ? `<section class="panel">
      <details class="add-round"><summary>Completed seasons (${done.length})</summary>
        ${done.map((s) => seasonBlock(s, rounds.filter((r) => r.season_id === s.id), allRounds)).join("")}
      </details>
    </section>` : ""}

    ${standalone.length ? `<section class="panel">
      <details class="add-round"><summary>Standalone programs (${standalone.length})</summary>
        <p class="fine">One-off programs outside a round. <a href="/admin/programs">Manage them here</a>.</p>
        <ul class="plain-list">${standalone.map((p) => `<li><a href="/admin/programs/${p.id}">${esc(p.name)}</a> <span class="fine-inline">${p.archived ? "archived" : `${p.upcoming} upcoming`}</span></li>`).join("")}</ul>
      </details>
    </section>` : ""}

    <script>
    (function () {
      // Open whatever the last action pointed at
      var id = location.hash.slice(1);
      var el = id && document.getElementById(id);
      if (el) {
        if (el.tagName === "DETAILS") el.open = true;
        var parent = el.closest("details"); while (parent) { parent.open = true; parent = parent.parentElement.closest("details"); }
        el.scrollIntoView({ block: "start" });
      }
      document.querySelectorAll(".tchip[data-ages]").forEach(function (b) {
        b.addEventListener("click", function () {
          var want = b.dataset.ages.split(",");
          b.closest("form").querySelectorAll('input[name="ages"]').forEach(function (c) { c.checked = want.indexOf(c.value) >= 0; });
        });
      });
      // Cage Time defaults to all ages
      document.querySelectorAll('.quick-type select[name="activity"]').forEach(function (s) {
        s.addEventListener("change", function () {
          if (s.value === "Cage Time") s.closest("form").querySelectorAll('input[name="ages"]').forEach(function (c) { c.checked = true; });
        });
      });
    })();
    </script>`,
  });
}

module.exports = { setupPage };
