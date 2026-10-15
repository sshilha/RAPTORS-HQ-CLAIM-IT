const { esc } = require("./layout");
const { page } = require("./admin");
const { colorFor } = require("../config");
const { fmtDateTime } = require("../time");
const { typeLabel, defaultsFor } = require("../rounds");
const { niceRange, shortRange, statusPill } = require("./rounds");
const { blockSelect, spotsLabel, limitsForm, limitsScript, waitlistSelect, modeForm, shareBox, onlyFor } = require("./partials");
const SC = require("../schedules");
const { LABELS } = require("../config");

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pln = (n, l) => `${n} ${n === 1 ? l.one.toLowerCase() : l.many.toLowerCase()}`;
// The schedule being viewed, so forms come back to it
let CUR = { id: "" };
const home = () => `/admin/setup?s=${CUR.id}`;
const back = (anchor) => `<input type="hidden" name="return_to" value="${home()}${anchor ? `#${anchor}` : ""}">`;
const swatch = (a) => `<span class="swatch" style="background:${colorFor(a, CUR.id)}"></span>`;

// Items without a date (and titled ones), with spots and who's claimed
function itemsPanel(r, locked, L) {
  const depth = SC.depthOf(CUR);
  const items = r.items || [];
  const types = (r.types || []).filter((t) => depth > 1 || true);
  const pick = depth > 1 && types.length > 1;
  const anchor = `items-${r.id}`;
  return `<div class="items-panel" id="${anchor}">
    <p class="label-like">${esc(L.slot.many)} without a date</p>
    ${items.length ? `<table class="types compact items"><thead><tr>${depth > 1 ? `<th>${esc(L.activity.one)}</th>` : ""}<th>${esc(L.slot.one)}</th><th>Spots</th><th>Claimed</th><th></th></tr></thead>
      <tbody>${items.map((it) => `<tr>
        ${depth > 1 ? `<td>${swatch(it.activity)}${it.section ? `${esc(it.section)} › ` : ""}${esc(typeLabel(it.activity, it.age_groups, it.required_tags))}</td>` : ""}
        <td>${locked ? esc(it.title || "") : `<input form="it-${it.id}" name="title" value="${esc(it.title || "")}" maxlength="80" aria-label="Name" required>`}</td>
        <td>${locked ? it.capacity : `<input form="it-${it.id}" type="number" name="capacity" min="1" max="500" value="${it.capacity}" aria-label="Spots" class="spots-in">`}</td>
        <td><a href="/admin/sessions/${it.id}">${it.claimed} of ${it.capacity}${it.waitlisted ? `, ${it.waitlisted} waiting` : ""}</a></td>
        <td>${locked ? "" : `<div class="row-actions">
          <form id="it-${it.id}" method="post" action="/admin/rounds/${r.id}/items/${it.id}">${back(anchor)}<button class="btn-ghost" type="submit">Save</button></form>
          <form method="post" action="/admin/rounds/${r.id}/items/${it.id}/delete" onsubmit="return confirm('Remove this ${esc(L.slot.one.toLowerCase())}?')">${back(anchor)}<button class="x" type="submit" aria-label="Remove">×</button></form></div>`}</td>
      </tr>`).join("")}</tbody></table>` : `<p class="muted small">None yet.</p>`}
    ${locked || (depth > 1 && !types.length) ? (depth > 1 && !types.length && !locked ? `<p class="fine">Add ${esc(SC.an(L.activity.one))} first, then its ${esc(L.slot.many.toLowerCase())}.</p>` : "") : `<form method="post" action="/admin/rounds/${r.id}/items" class="quick-type item-add">${back(anchor)}
      ${pick ? `<select name="program_id" required aria-label="${esc(L.activity.one)}"><option value="">${esc(L.activity.one)}…</option>${types.map((t) => `<option value="${t.id}">${t.section ? `${esc(t.section)} › ` : ""}${esc(typeLabel(t.activity, t.age_groups, t.required_tags))}</option>`).join("")}</select>`
        : `<input type="hidden" name="program_id" value="${(types[0] || {}).id || ""}">`}
      <input name="title" required maxlength="80" placeholder="e.g. Bring a case of water" aria-label="Name" class="title-in">
      <input type="number" name="capacity" min="1" max="500" required placeholder="Spots" aria-label="Spots" class="spots-in">
      <button class="btn-small" type="submit">Add ${esc(L.slot.one.toLowerCase())}</button>
    </form>`}
  </div>`;
}

function roundBlock(r, locked, L, acts) {
  const anchor = `round-${r.id}`;
  const depth = SC.depthOf(CUR);
  const slots = r.time_slots || [];
  return `<details class="round${r.is_main ? " main-round" : ""}" id="${anchor}"${r.is_main ? " open" : ""}>
    <summary>
      <span class="r-name">${r.is_main ? "Rules &amp; what's offered" : esc(r.name)}</span>
      ${r.is_main ? "" : `<span class="r-dates">${esc(niceRange(r.starts_on, r.ends_on))}</span>`}
      <span class="r-stats">${depth === 1 ? `${pln(r.scheduled, L.slot)}, ${r.claimed}/${r.spots} spots claimed`
        : `${pln(r.types.length, L.activity)}, ${pln(r.scheduled, L.slot)}, ${r.claimed}/${r.spots} spots claimed`}</span>
      <span class="pill mode-pill">${esc(SC.MODES[r.signup_mode || "roster"][0])}</span>
      ${locked ? `<span class="pill">Completed</span>` : statusPill(r)}
    </summary>
    <div class="round-body">
      <div class="round-actions">
        <a class="btn-small" href="/admin/rounds/${r.id}">Open calendar</a>
        ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/publish">${back(anchor)}
          <button class="btn-ghost" type="submit">${r.published_at ? "Hide" : r.is_main ? "Publish" : `Publish ${esc(L.middle.one.toLowerCase())}`}</button></form>`}
        <a class="link-dark" href="/admin/rounds/${r.id}#settings">${r.is_main ? "More settings" : `${esc(L.middle.one)} settings`}</a>
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

        <div${depth === 1 ? ' hidden' : ""}>
          <p class="label-like">${esc(L.activity.many)} offered</p>
          ${r.types.length ? `<table class="types compact"><thead><tr><th>${esc(L.activity.one)}</th><th>Spots</th><th>Split into</th><th>Waitlist</th>${(CUR.tags || []).length ? "<th>Only for</th>" : ""}<th>Coach</th><th>On calendar</th><th></th></tr></thead>
            <tbody>${r.types.map((t) => `<tr>
              <td>${swatch(t.activity)}<strong>${t.section ? `${esc(t.section)} › ` : ""}${esc(typeLabel(t.activity, t.age_groups, t.required_tags))}</strong></td>
              ${locked ? `<td>${t.default_capacity || defaultsFor(r, t.activity).capacity}</td><td>${t.block_minutes ? `${t.block_minutes} min` : "Whole"}</td><td>${t.waitlist == null ? "Round default" : t.waitlist ? "On" : "Off"}</td>${(CUR.tags || []).length ? `<td>${esc((t.required_tags || []).join(", ") || "Everyone")}</td>` : ""}<td>${esc(t.default_coach || "")}</td><td>${t.scheduled}</td><td></td>` : `
              <td><input form="st-${t.id}" type="number" name="spots" min="1" max="200" required value="${t.default_capacity || defaultsFor(r, t.activity).capacity}" aria-label="Spots"></td>
              <td>${blockSelect("block", t.block_minutes, `form="st-${t.id}" aria-label="Split into blocks"`)}</td>
              <td>${waitlistSelect(t.waitlist, r, `form="st-${t.id}" aria-label="Waitlist"`)}</td>
              ${(CUR.tags || []).length ? `<td>${onlyFor(CUR.tags, t.required_tags || [], `st-${t.id}`)}</td>` : ""}
              <td><input form="st-${t.id}" name="coach" value="${esc(t.default_coach)}" placeholder="Optional" aria-label="Coach"></td>
              <td>${t.scheduled}</td>
              <td><div class="row-actions">
                <form id="st-${t.id}" method="post" action="/admin/rounds/${r.id}/types/${t.id}">${back(anchor)}<button class="btn-ghost" type="submit">Save</button></form>
                ${t.scheduled ? "" : `<form method="post" action="/admin/rounds/${r.id}/types/${t.id}/delete">${back(anchor)}<button class="x" type="submit" aria-label="Remove">×</button></form>`}
              </div></td>`}
            </tr>`).join("")}</tbody></table>` : `<p class="muted small">None yet.</p>`}

          ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/types" class="quick-type">${back(anchor)}
            ${depth === 4 ? `<input name="section" required maxlength="40" list="sections-${r.id}" placeholder="${esc(L.section.one)}" aria-label="${esc(L.section.one)}" class="coach-in">
              <datalist id="sections-${r.id}">${[...new Set((r.types || []).map((t) => t.section).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}
            <select name="activity" required aria-label="${esc(L.activity.one)}"><option value="">${esc(L.activity.one)}…</option>${acts.map((a) => `<option>${esc(a)}</option>`).join("")}</select>
            <span class="ages">${SC.groupsFor(CUR).map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"> ${esc(g)}</label>`).join("")}
              ${SC.presetsFor(CUR).map((x) => `<button type="button" class="tchip" data-ages="${esc(x.ages.join(","))}">${esc(x.name)}</button>`).join("")}</span>
            <input type="number" name="spots" min="1" max="200" required placeholder="Spots" aria-label="Spots" class="spots-in">
            ${blockSelect("block", null, 'aria-label="Split into blocks" class="block-in"')}
            ${waitlistSelect(null, r, 'aria-label="Waitlist" class="block-in"')}
            ${(CUR.tags || []).length ? `<span class="only-label">Only for:</span>${onlyFor(CUR.tags, [])}` : ""}
            <input name="coach" placeholder="Coach (optional)" aria-label="Coach" class="coach-in">
            <button class="btn-small" type="submit">Add</button>
          </form>${r.signup_mode && r.signup_mode !== "roster" ? `<p class="fine">Open to everyone, so ${esc(L.group.many.toLowerCase())} are optional.</p>` : ""}`}
        </div>
      </div>
      ${itemsPanel(r, locked, L)}
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

const LEVEL_INFO = {
  middle: () => ["A period or part with its own dates and rules (limits, unlocking, who signs up).", "Round, Day, Week"],
  section: () => ["Groups the next level into sections.", "Area, Field, Team"],
  activity: (last) => [last ? "What people claim, with spots." : "A kind of thing to claim, with default spots, limits, and who can claim it.", "Activity, Area, Role"],
  slot: () => ["What people claim. It has a number of spots, and can have a date and time or just be a named item.", "Session, Shift, Task, Item"],
  participant: () => ["The people who use this board. They can be kids, parents, or anyone.", "Athlete, Volunteer"],
  group: () => ["How people are sorted, so things can be limited to certain groups.", "12U, Team, Level"],
};

function scheduleSettingsPage({ user, flash, sc, counts }) {
  const L = SC.labels(sc);
  return page({
    title: `Settings · ${sc.name}`, tab: "schedule", user, flash,
    body: `<section class="panel">
      <h1>${esc(require("../config").LABELS.schedule)} settings</h1>
      <p class="muted tight">What ${esc(sc.name)} is called, and what it calls each level.</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/depth?s=${sc.id}" class="depth-form">
        <label>Levels under the board<select name="depth"${counts.items ? " disabled" : ""}>
          ${[1, 2, 3, 4].map((n) => `<option value="${n}"${SC.depthOf(sc) === n ? " selected" : ""}>${n} level${n === 1 ? "" : "s"}</option>`).join("")}</select></label>
        ${counts.items ? `<span class="fine">Can't change once the board has ${esc(L.slot.many.toLowerCase())} or ${esc(L.middle.many.toLowerCase())}. Copy it with nothing on the calendar to restructure.</span>`
          : `<button class="btn-ghost" type="submit">Change</button><span class="fine">The last level is always what people claim.</span>`}
      </form>
      <form method="post" action="/admin/setup/schedules/${sc.id}?s=${sc.id}" class="sched-form">
        <label class="w-wide">Name<input name="name" required value="${esc(sc.name)}" maxlength="40"></label>
        <div class="table-wrap"><table class="levels">
          <thead><tr><th>Level</th><th>What it is</th><th>Called (one)</th><th>Called (many)</th></tr></thead>
          <tbody>${SC.levelKeys(sc).map((k, i, all) => { const info = LEVEL_INFO[k](i === all.length - 1); return `<tr>
            <td><strong>Level ${i + 1}</strong>${i === all.length - 1 ? `<div class="pill ok claim-pill">Claimed</div>` : ""}</td>
            <td class="def">${esc(info[0])}<div class="fine">e.g. ${esc(info[1])}</div></td>
            <td><input name="${k}_one" value="${esc(L[k].one)}" maxlength="24" required aria-label="Level ${i + 1} singular"></td>
            <td><input name="${k}_many" value="${esc(L[k].many)}" maxlength="24" required aria-label="Level ${i + 1} plural"></td></tr>`; }).join("")}
            ${["participant", "group"].map((k) => { const info = LEVEL_INFO[k](); return `<tr class="people-row">
            <td><strong>${k === "participant" ? "People" : "People's groups"}</strong></td><td class="def">${esc(info[0])}<div class="fine">e.g. ${esc(info[1])}</div></td>
            <td><input name="${k}_one" value="${esc(L[k].one)}" maxlength="24" required></td>
            <td><input name="${k}_many" value="${esc(L[k].many)}" maxlength="24" required></td></tr>`; }).join("")}
          </tbody></table></div>
        <div class="sched-actions"><button class="btn-small" type="submit">Save</button></div>
      </form>
    </section>
    <div class="settings-2">
    <section class="panel" id="locations">
      <h2 class="banner">Locations</h2>
      <p class="fine">Suggested when you set a ${esc(L.middle.one.toLowerCase())}'s location. The first one is the default for new ${esc(L.middle.many.toLowerCase())}.</p>
      ${(sc.locations || []).length ? `<ul class="slot-list">${sc.locations.map((l) => `<li><span>${esc(l)}</span>
        <form method="post" action="/admin/setup/schedules/${sc.id}/locations/remove?s=${sc.id}"><input type="hidden" name="name" value="${esc(l)}"><button class="x" type="submit" aria-label="Remove ${esc(l)}">×</button></form></li>`).join("")}</ul>`
        : `<p class="muted">None yet.</p>`}
      <form method="post" action="/admin/setup/schedules/${sc.id}/locations?s=${sc.id}" class="inline-add"><label>New location<input name="name" maxlength="80" required placeholder="e.g. Turn Two Athletics"></label>
        <button class="btn-small" type="submit">Add</button></form>
    </section>
    <section class="panel" id="family">
      <h2 class="banner">Family view</h2>
      <p class="fine">On a day's page, families can see who's going to each ${esc(L.slot.one.toLowerCase())}, so friends can claim spots together. They never see emails or other contact details.</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/family?s=${sc.id}" class="stack-list checks">
        ${[["initial", "First name and last initial", "Ava S."], ["full", "Full names", "Ava Smith"], ["off", "Don't show who's going", "Only spots open"]].map(([k, l, ex]) =>
          `<label class="radio-row"><input type="radio" name="family_names" value="${k}"${(sc.family_names || "initial") === k ? " checked" : ""}> ${l} <span class="fine-inline">${ex}</span></label>`).join("")}
        <div><button class="btn-ghost" type="submit">Save</button></div>
      </form>
    </section>
    </div>

    <section class="panel">
      <h2>${sc.archived_at ? "Archived" : "Archive"}</h2>
      <p class="muted">${sc.archived_at ? `Families can't see anything in ${esc(sc.name)}. Restore it to make it active again.`
        : `Archiving hides ${esc(sc.name)} from families and moves it to the Archived list in Settings. Nothing is deleted, and you can restore it any time.`}</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/archive?s=${sc.id}"><button class="btn-ghost" type="submit">${sc.archived_at ? "Restore" : "Archive"} ${esc(sc.name)}</button></form>
    </section>
    <section class="panel">
      <h2>Delete</h2>
      <p class="muted">${counts.items ? `It has ${counts.items} ${esc(L.top.many.toLowerCase())}/${esc(L.middle.many.toLowerCase())}, so it can't be deleted until those are removed.` : `It's empty, so it can be deleted. ${counts.members ? `Its ${counts.members} ${esc(L.participant.many.toLowerCase())} stay in the app.` : ""}`}</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/delete?s=${sc.id}" onsubmit="return confirm('Delete the ${esc(sc.name)} schedule?')">
        <button class="btn-ghost danger" type="submit"${counts.items ? " disabled" : ""}>Delete ${esc(sc.name)}</button></form>
    </section>`,
  });
}

function newSchedulePage({ user, flash, schedules }) {
  const PRE = SC.PRESET_LABELS;
  const line = (l) => `${SC.LEVEL_KEYS[l.depth].map((k) => l[k][1]).join(" › ")} · ${l.participant[1]} in ${l.group[1]}`;
  return page({
    title: "New", tab: "home", user, flash,
    body: `<section class="panel">
      <h1>New ${esc(require("../config").LABELS.schedule.toLowerCase())}</h1>
      <a class="back" href="/admin/settings">All</a>
      <p class="lede">Each one is a sign-up space for a period or an event, like <b>Winter Training 2026–27</b> or <b>2027 Arctic Rumble Volunteering</b>, with its own rounds, activities, groups, and people. Pick a name and a naming style; you can rename every level afterward. To start from last year's, use <b>Copy</b> on its card instead.</p>
      <form method="post" action="/admin/setup/schedules" class="stack">
        <label>Name<input name="name" required maxlength="40" placeholder="e.g. Winter Training 2026–27 or 2027 Arctic Rumble Volunteering"></label>
        <fieldset class="checks stack-list"><legend>Structure</legend>
          ${[["list", "Item list (1 level)"], ["volunteer", "Areas and shifts (2 levels)"], ["training", "Training (3 levels)"], ["event", "Event days (4 levels)"]].map(([k, t], i) =>
            `<label class="mode-opt"><input type="radio" name="preset" value="${k}"${k === "training" ? " checked" : ""}><span><b>${t}</b><span class="fine">${esc(line(PRE[k]))}</span></span></label>`).join("")}
        </fieldset>
        ${schedules.length ? `<label>Copy groups and shortcuts from<select name="copy_groups"><option value="">Nothing (start empty)</option>
          ${schedules.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>` : ""}
        <button class="btn" type="submit">Create</button>
      </form>
      <p class="fine">Next you'll add its ${"activities, groups, and people"}, then set up the calendar.</p>
    </section>`,
  });
}

function setupPage({ user, flash, schedule: sc, rounds, standalone }) {
  CUR = sc;
  const L = SC.labels(sc);
  const acts = SC.activitiesFor(sc, { activeOnly: true });
  const locked = !!sc.archived_at;
  const depth = SC.depthOf(sc);
  const main = rounds.find((r) => r.is_main);
  const sorted = rounds.filter((r) => !r.is_main).sort((x, y) => String(x.starts_on).localeCompare(String(y.starts_on)));
  return page({
    title: sc.name, tab: "setup", user, flash, xwide: true,
    body: `<section class="panel">
      <div class="athlete-head">
        <div><h1>${esc(sc.name)}</h1>
          <p class="muted tight">${SC.levelKeys(sc).map((k) => esc(L[k].many)).join(" › ")}. ${depth >= 3
            ? `Open ${esc(SC.an(L.middle.one))}'s calendar to put ${esc(L.slot.many.toLowerCase())} on days.`
            : `Add ${esc(L.slot.many.toLowerCase())} without a date below, or open the calendar to put them on days.`}</p></div>
        ${locked ? `<span class="pill">Archived: read-only</span>` : depth >= 3 ? `<div class="head-actions"><a class="btn-ghost" href="/admin/import?s=${sc.id}">Import vendor schedule</a></div>` : ""}
      </div>
      ${locked ? `<p class="rule">This Claim Board is archived: hidden from families and read-only. Reopen it from Settings to make changes.</p>` : ""}
    </section>

    ${depth <= 2 ? `<section class="panel"><div class="rounds">${main ? roundBlock(main, locked, L, acts) : ""}</div></section>` : `<section class="panel">
      <h2 class="season-title">${esc(L.middle.many)}</h2>
      <div class="rounds">${sorted.length ? sorted.map((r) => roundBlock(r, locked, L, acts)).join("") : `<p class="muted">No ${esc(L.middle.many.toLowerCase())} yet. Add the first one below.</p>`}</div>
      ${locked ? "" : newRoundForm(null, [...sorted].reverse(), true, L)}
    </section>`}

    ${standalone.length ? `<section class="panel">
      <details class="add-round"><summary>Standalone programs (${standalone.length})</summary>
        <p class="fine">One-off programs from before ${esc(L.middle.many.toLowerCase())}. <a href="/admin/programs">Manage them here</a>.</p>
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
      var META = ${SC.metaJson(sc)};
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
