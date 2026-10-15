const { esc } = require("./layout");
const { page } = require("./admin");
const { AGE_GROUPS, ACTIVE_ACTIVITIES, ACTIVITY_COLORS, ACTIVITY_META, PRESETS, LOCATIONS } = require("../config");
const { fmtDateTime } = require("../time");
const { typeLabel, defaultsFor } = require("../rounds");
const { niceRange, shortRange, statusPill } = require("./rounds");
const { blockSelect, spotsLabel, limitsForm, limitsScript, waitlistSelect, modeForm, shareBox } = require("./partials");
const SC = require("../schedules");
const { LABELS } = require("../config");

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pln = (n, l) => `${n} ${n === 1 ? l.one.toLowerCase() : l.many.toLowerCase()}`;
// The schedule being viewed, so forms come back to it
let CUR = { id: "" };
const home = () => `/admin/setup?s=${CUR.id}`;
const back = (anchor) => `<input type="hidden" name="return_to" value="${home()}${anchor ? `#${anchor}` : ""}">`;
const swatch = (a) => `<span class="swatch" style="background:${ACTIVITY_COLORS[a]}"></span>`;

function roundBlock(r, locked, L, acts) {
  const anchor = `round-${r.id}`;
  const slots = r.time_slots || [];
  return `<details class="round" id="${anchor}">
    <summary>
      <span class="r-name">${esc(r.name)}</span>
      <span class="r-dates">${esc(niceRange(r.starts_on, r.ends_on))}</span>
      <span class="r-stats">${pln(r.types.length, L.activity)}, ${r.scheduled} on calendar, ${r.claimed}/${r.spots} spots claimed</span>
      <span class="pill mode-pill">${esc(SC.MODES[r.signup_mode || "roster"][0])}</span>
      ${locked ? `<span class="pill">Completed</span>` : statusPill(r)}
    </summary>
    <div class="round-body">
      <div class="round-actions">
        <a class="btn-small" href="/admin/rounds/${r.id}">Open calendar</a>
        ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/publish">${back(anchor)}
          <button class="btn-ghost" type="submit">${r.published_at ? "Hide" : `Publish ${esc(L.middle.one.toLowerCase())}`}</button></form>`}
        <a class="link-dark" href="/admin/rounds/${r.id}#settings">${esc(L.middle.one)} settings</a>
        <a class="link-dark" href="/admin/reports?round=${r.id}">Reports</a>
      </div>

      <div class="round-who">
        <p class="label-like">Who signs up</p>
        ${modeForm(r, { returnTo: `${home()}#${anchor}`, readonly: locked })}
        ${r.signup_mode === "public" ? shareBox(r) : ""}
      </div>
      <div class="round-limits">
        <p class="label-like">Limits per ${esc(L.participant.one.toLowerCase())}</p>
        ${limitsForm(r, { returnTo: `${home()}#${anchor}`, readonly: locked, compact: true, activities: acts })}
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
          <p class="label-like">${esc(L.activity.many)} offered</p>
          ${r.types.length ? `<table class="types compact"><thead><tr><th>${esc(L.activity.one)}</th><th>Spots</th><th>Split into</th><th>Waitlist</th><th>Coach</th><th>On calendar</th><th></th></tr></thead>
            <tbody>${r.types.map((t) => `<tr>
              <td>${swatch(t.activity)}<strong>${esc(typeLabel(t.activity, t.age_groups))}</strong></td>
              ${locked ? `<td>${t.default_capacity || defaultsFor(r, t.activity).capacity}</td><td>${t.block_minutes ? `${t.block_minutes} min` : "Whole"}</td><td>${t.waitlist == null ? "Round default" : t.waitlist ? "On" : "Off"}</td><td>${esc(t.default_coach || "")}</td><td>${t.scheduled}</td><td></td>` : `
              <td><input form="st-${t.id}" type="number" name="spots" min="1" max="200" required value="${t.default_capacity || defaultsFor(r, t.activity).capacity}" aria-label="Spots"></td>
              <td>${blockSelect("block", t.block_minutes, `form="st-${t.id}" aria-label="Split into blocks"`)}</td>
              <td>${waitlistSelect(t.waitlist, r, `form="st-${t.id}" aria-label="Waitlist"`)}</td>
              <td><input form="st-${t.id}" name="coach" value="${esc(t.default_coach)}" placeholder="Optional" aria-label="Coach"></td>
              <td>${t.scheduled}</td>
              <td><div class="row-actions">
                <form id="st-${t.id}" method="post" action="/admin/rounds/${r.id}/types/${t.id}">${back(anchor)}<button class="btn-ghost" type="submit">Save</button></form>
                ${t.scheduled ? "" : `<form method="post" action="/admin/rounds/${r.id}/types/${t.id}/delete">${back(anchor)}<button class="x" type="submit" aria-label="Remove">×</button></form>`}
              </div></td>`}
            </tr>`).join("")}</tbody></table>` : `<p class="muted small">None yet.</p>`}

          ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/types" class="quick-type">${back(anchor)}
            <select name="activity" required aria-label="${esc(L.activity.one)}"><option value="">${esc(L.activity.one)}…</option>${acts.map((a) => `<option>${esc(a)}</option>`).join("")}</select>
            <span class="ages">${SC.groupsFor(CUR).map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"> ${esc(g)}</label>`).join("")}
              ${SC.presetsFor(CUR).map((x) => `<button type="button" class="tchip" data-ages="${esc(x.ages.join(","))}">${esc(x.name)}</button>`).join("")}</span>
            <input type="number" name="spots" min="1" max="200" required placeholder="Spots" aria-label="Spots" class="spots-in">
            ${blockSelect("block", null, 'aria-label="Split into blocks" class="block-in"')}
            ${waitlistSelect(null, r, 'aria-label="Waitlist" class="block-in"')}
            <input name="coach" placeholder="Coach (optional)" aria-label="Coach" class="coach-in">
            <button class="btn-small" type="submit">Add</button>
          </form>${r.signup_mode && r.signup_mode !== "roster" ? `<p class="fine">This ${esc(L.middle.one.toLowerCase())} is open to everyone, so ${esc(LABELS.groups.toLowerCase())} are optional.</p>` : ""}`}
        </div>
      </div>
    </div>
  </details>`;
}

function newRoundForm(seasonId, allRounds, first, L) {
  return `<details class="add-round" id="${first ? "round-new" : `new-round-${seasonId}`}"><summary>Add ${esc(SC.an(L.middle.one))}</summary>
    <form method="post" action="/admin/rounds" class="inline-add wrap">
      <input type="hidden" name="return_to" value="${home()}#round-{id}">
      <input type="hidden" name="season_id" value="${seasonId || ""}">
      <input type="hidden" name="schedule_id" value="${CUR.id}">
      <label>Name<input name="name" required placeholder="${esc(L.middle.one)} 1"></label>
      <label>First day<input type="date" name="starts_on" required></label>
      <label>Last day<input type="date" name="ends_on" required></label>
      <label>Start from<select name="copy_from"><option value="">Empty</option>
        ${allRounds.map((r) => `<option value="${r.id}">Copy of ${esc(r.name)} (${esc(niceRange(r.starts_on, r.ends_on))})</option>`).join("")}</select></label>
      <button class="btn-small" type="submit">Add ${esc(L.middle.one.toLowerCase())}</button>
    </form></details>`;
}

function seasonBlock(s, rounds, allRounds, first, L, acts) {
  const done = !!s.completed_at;
  const claimed = rounds.reduce((n, r) => n + r.claimed, 0);
  return `<section class="panel season${done ? " done" : ""}" id="season-${s.id}">
    <div class="athlete-head">
      <div><h2 class="season-title">${esc(s.name)}</h2>
        <p class="muted tight">${esc(niceRange(s.starts_on, s.ends_on))}. ${pln(rounds.length, L.middle)}, ${pl(claimed, "spot")} claimed.</p></div>
      <div class="head-actions">
        ${done ? `<span class="pill">Completed</span>` : `<span class="pill ok">Open</span>`}
        <a class="btn-ghost" href="/admin/reports?season=${s.id}">Reports</a>
        <a class="btn-ghost" href="/admin/seasons/${s.id}">Settings</a>
        ${done ? "" : `<form method="post" action="/admin/seasons/${s.id}/complete" onsubmit="return confirm('Complete ${esc(s.name)}? Families will no longer see it, and it becomes read-only. Reports stay available.')">${back(`season-${s.id}`)}
          <button class="btn-ghost" type="submit">Complete ${esc(L.top.one.toLowerCase())}</button></form>`}
      </div>
    </div>
    ${done ? `<p class="rule">Completed ${esc(fmtDateTime(s.completed_at))}. Read-only. Reopen it from Settings if you need to change something.</p>` : ""}
    <div class="rounds">${rounds.length ? rounds.map((r) => roundBlock(r, done, L, acts)).join("") : `<p class="muted">No ${esc(L.middle.many.toLowerCase())} yet.</p>`}</div>
    ${done ? "" : newRoundForm(s.id, allRounds, first, L)}
  </section>`;
}

function scheduleSettingsPage({ user, flash, sc, counts }) {
  const L = SC.labels(sc);
  return page({
    title: `Schedule settings · ${sc.name}`, tab: "schedule", user, flash,
    body: `<section class="panel">
      <h1>Schedule settings</h1>
      <p class="muted tight">What ${esc(sc.name)} is called, and what it calls each level.</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}?s=${sc.id}" class="sched-form">
        <label class="w-wide">Schedule name<input name="name" required value="${esc(sc.name)}" maxlength="40"></label>
        <div class="table-wrap"><table class="levels">
          <thead><tr><th>Level</th><th>What it is</th><th>Called (one)</th><th>Called (many)</th></tr></thead>
          <tbody>${SC.LEVELS.map(([k, name, def, ex]) => `<tr>
            <td><strong>${esc(name)}</strong></td><td class="def">${esc(def)}<div class="fine">e.g. ${esc(ex)}</div></td>
            <td><input name="${k}_one" value="${esc(L[k].one)}" maxlength="24" required aria-label="${esc(name)} singular"></td>
            <td><input name="${k}_many" value="${esc(L[k].many)}" maxlength="24" required aria-label="${esc(name)} plural"></td></tr>`).join("")}
          </tbody></table></div>
        <div class="sched-actions"><button class="btn-small" type="submit">Save</button></div>
      </form>
    </section>
    <section class="panel">
      <h2>Delete this schedule</h2>
      <p class="muted">${counts.items ? `It has ${counts.items} ${esc(L.top.many.toLowerCase())}/${esc(L.middle.many.toLowerCase())}, so it can't be deleted until those are removed.` : `It's empty, so it can be deleted. ${counts.members ? `Its ${counts.members} ${esc(L.participant.many.toLowerCase())} stay in the app.` : ""}`}</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/delete?s=${sc.id}" onsubmit="return confirm('Delete the ${esc(sc.name)} schedule?')">
        <button class="btn-ghost danger" type="submit"${counts.items ? " disabled" : ""}>Delete ${esc(sc.name)}</button></form>
    </section>`,
  });
}

function newSchedulePage({ user, flash, schedules }) {
  const PRE = SC.PRESET_LABELS;
  const line = (l) => `${l.top[0]} › ${l.middle[0]} › ${l.activity[0]} › ${l.slot[0]} · ${l.participant[1]} in ${l.group[1]}`;
  return page({
    title: "New schedule", tab: "setup", user, flash,
    body: `<section class="panel">
      <h1>New schedule</h1>
      <p class="lede">A schedule is its own sign-up space with its own ${"activities, groups, people, and calendar"}, like Training or Concessions. Start with a name and a naming style; you can rename every level afterward.</p>
      <form method="post" action="/admin/setup/schedules" class="stack">
        <label>Name<input name="name" required maxlength="40" placeholder="e.g. Concessions"></label>
        <fieldset class="checks stack-list"><legend>Naming style</legend>
          ${[["training", "Training"], ["volunteer", "Volunteer shifts"], ["weekly", "Weekly sign-ups"]].map(([k, t], i) =>
            `<label class="mode-opt"><input type="radio" name="preset" value="${k}"${i === 0 ? " checked" : ""}><span><b>${t}</b><span class="fine">${esc(line(PRE[k]))}</span></span></label>`).join("")}
        </fieldset>
        ${schedules.length ? `<label>Copy groups and shortcuts from<select name="copy_groups"><option value="">Nothing (start empty)</option>
          ${schedules.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>` : ""}
        <button class="btn" type="submit">Create schedule</button>
      </form>
      <p class="fine">Next you'll add its ${"activities, groups, and people"}, then set up the calendar.</p>
    </section>`,
  });
}

function setupPage({ user, flash, schedule: sc, seasons, rounds, standalone }) {
  CUR = sc;
  const L = SC.labels(sc);
  const acts = SC.activitiesFor(sc, { activeOnly: true });
  const open = seasons.filter((s) => !s.completed_at);
  const done = seasons.filter((s) => s.completed_at);
  const loose = rounds.filter((r) => !r.season_id);
  const allRounds = [...rounds].reverse();
  return page({
    title: sc.name, tab: "setup", user, flash, xwide: true,
    body: `<section class="panel">
      <div class="athlete-head">
        <div><h1>${esc(sc.name)}</h1>
          <p class="muted tight">${esc(L.top.one)} › ${esc(L.middle.one)} › ${esc(L.activity.one)} › ${esc(L.slot.one)}. Open ${esc(SC.an(L.middle.one))}'s calendar to put ${esc(L.slot.many.toLowerCase())} on days.</p></div>
        <div class="head-actions"><a class="btn-small" href="/admin/import?s=${sc.id}">Import vendor schedule</a></div>
      </div>
    </section>

    ${open.length ? open.map((s, i) => seasonBlock(s, rounds.filter((r) => r.season_id === s.id), allRounds, i === 0, L, acts)).join("")
      : `<section class="panel"><p class="rule">No open ${esc(L.top.one.toLowerCase())}. Open one below to get started.</p></section>`}

    ${loose.length ? `<section class="panel" id="season-none">
      <h2 class="season-title">${esc(L.middle.many)} not in ${esc(SC.an(L.top.one))}</h2>
      <p class="muted tight">Add these to ${esc(SC.an(L.top.one))} from its Settings page.</p>
      <div class="rounds">${loose.map((r) => roundBlock(r, false, L, acts)).join("")}</div>
    </section>` : ""}

    <section class="panel">
      <details class="add-round" id="season-new"${open.length ? "" : " open"}><summary>Open a new ${esc(L.top.one.toLowerCase())}</summary>
        <form method="post" action="/admin/seasons" class="inline-add wrap">
          <input type="hidden" name="return_to" value="${home()}#season-{id}">
          <input type="hidden" name="schedule_id" value="${sc.id}">
          <label>Name<input name="name" required placeholder="${esc(sc.name)} 2026–27"></label>
          <label>First day<input type="date" name="starts_on" required></label>
          <label>Last day<input type="date" name="ends_on" required></label>
          <label>Start from<select name="copy_from"><option value="">Empty</option>
            ${seasons.map((s) => `<option value="${s.id}">Copy of ${esc(s.name)}</option>`).join("")}</select></label>
          <button class="btn-small" type="submit">Open ${esc(L.top.one.toLowerCase())}</button>
        </form>
        <p class="fine">A copy brings every ${esc(L.middle.one.toLowerCase())}, time, ${esc(L.activity.one.toLowerCase())}, spots, and the calendar, shifted to the new first day.</p>
      </details>
    </section>

    ${done.length ? `<section class="panel">
      <details class="add-round"><summary>Completed ${esc(L.top.many.toLowerCase())} (${done.length})</summary>
        ${done.map((s) => seasonBlock(s, rounds.filter((r) => r.season_id === s.id), allRounds, false, L, acts)).join("")}
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
      // Picking an activity fills in its defaults from Settings
      var META = ${JSON.stringify(ACTIVITY_META).replace(/</g, "\\u003c")};
      document.querySelectorAll('.quick-type select[name="activity"]').forEach(function (s) {
        s.addEventListener("change", function () {
          var m = META[s.value]; if (!m) return;
          var f = s.closest("form");
          if (m.all_ages) f.querySelectorAll('input[name="ages"]').forEach(function (c) { c.checked = true; });
          f.querySelector('select[name="block"]').value = m.default_block ? String(m.default_block) : "";
          f.querySelector('input[name="spots"]').placeholder = m.default_spots || "Spots";
        });
      });
    })();
    </script>${limitsScript}`,
  });
}

module.exports = { setupPage, scheduleSettingsPage, newSchedulePage };
