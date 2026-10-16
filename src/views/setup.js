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
// "Only for" picker for one item: groups and tags, in a small dropdown
function forPicker(sc, chosenGroups = [], chosenTags = [], formId = "") {
  const groups = SC.groupsFor(sc), tags = sc.tags || [];
  if (!SC.restricts(sc) || (!groups.length && !tags.length)) return "";
  const f = formId ? ` form="${formId}"` : "";
  const picked = [...chosenGroups, ...chosenTags];
  return `<details class="for-pick"><summary>${picked.length ? `Only for ${esc(picked.join(", "))}` : "Everyone"}</summary>
    <div class="for-box"><input type="hidden" name="for_shown" value="1"${f}>
      ${groups.length ? `<div class="for-row"><span class="fine">${esc(SC.labels(sc).group.many)}</span>${groups.map((g) => `<label class="tag-box${chosenGroups.includes(g) ? " on" : ""}"><input type="checkbox" name="only_groups" value="${esc(g)}"${f}${chosenGroups.includes(g) ? " checked" : ""}> ${esc(g)}</label>`).join("")}</div>` : ""}
      ${tags.length ? `<div class="for-row"><span class="fine">Tags</span>${tags.map((t) => `<label class="tag-box${chosenTags.includes(t) ? " on" : ""}"><input type="checkbox" name="only_tags" value="${esc(t)}"${f}${chosenTags.includes(t) ? " checked" : ""}> ${esc(t)}</label>`).join("")}</div>` : ""}
      <p class="fine">Leave all unchecked for everyone.</p></div></details>`;
}

function itemsPanel(r, locked, L) {
  const depth = SC.depthOf(CUR);
  const listOnly = !SC.usesCalendar(CUR);
  const limited = SC.restricts(CUR) && (SC.groupsFor(CUR).length || (CUR.tags || []).length);
  const items = r.items || [];
  const types = (r.types || []).filter((t) => depth > 1 || true);
  const pick = depth > 1 && types.length > 1;
  const anchor = `items-${r.id}`;
  return `<div class="items-panel" id="${anchor}">
    <p class="label-like">${listOnly ? esc(L.slot.many) : `${esc(L.slot.many)} without a date`}</p>
    ${items.length ? `<table class="types compact items"><thead><tr>${depth > 1 ? `<th>${esc(L.activity.one)}</th>` : ""}<th>${esc(L.slot.one)}</th><th>Spots</th>${limited ? "<th>Who</th>" : ""}<th>Claimed</th><th></th></tr></thead>
      <tbody>${items.map((it) => `<tr>
        ${depth > 1 ? `<td>${swatch(it.activity)}${it.section ? `${esc(it.section)} › ` : ""}${esc(typeLabel(it.activity, it.age_groups, it.required_tags))}</td>` : ""}
        <td>${locked ? esc(it.title || "") : `<input form="it-${it.id}" name="title" value="${esc(it.title || "")}" maxlength="80" aria-label="Name" required>`}</td>
        <td>${locked ? it.capacity : `<input form="it-${it.id}" type="number" name="capacity" min="1" max="500" value="${it.capacity}" aria-label="Spots" class="spots-in">`}</td>
        ${limited ? `<td>${locked ? esc([...(it.only_groups || []), ...(it.only_tags || [])].join(", ") || "Everyone") : forPicker(CUR, it.only_groups || [], it.only_tags || [], `it-${it.id}`)}</td>` : ""}
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
      ${limited ? forPicker(CUR) : ""}
      <button class="btn-small" type="submit">Add ${esc(L.slot.one.toLowerCase())}</button>
    </form>`}
  </div>`;
}

function timesPart(r, locked, L, acts, anchor) {
  const depth = SC.depthOf(CUR);
  const listOnly = !SC.usesCalendar(CUR);
  const slots = r.time_slots || [];
  return `        <div${listOnly ? " hidden" : ""}>
          <p class="label-like">Times</p>
          ${slots.length ? `<ul class="slot-list">${slots.map((t) => `<li><span>${esc(shortRange(t.start, t.end))}</span>
            ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/slots/remove">${back(anchor)}<input type="hidden" name="slot" value="${t.start}-${t.end}">
              <button type="submit" class="x" aria-label="Remove time">×</button></form>`}</li>`).join("")}</ul>` : `<p class="muted small">No times yet.</p>`}
          ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/slots" class="inline-add">${back(anchor)}
            <label>Start<input type="time" name="start_time" required></label>
            <label>End<input type="time" name="end_time" required></label>
            <button class="btn-ghost" type="submit">Add time</button></form>`}
        </div>

`;
}

function typesPart(r, locked, L, acts, anchor) {
  const depth = SC.depthOf(CUR);
  const listOnly = !SC.usesCalendar(CUR);
  const slots = r.time_slots || [];
  return `        <div${depth === 1 ? ' hidden' : ""}>
          <p class="label-like">${esc(L.activity.many)} offered</p>
          ${r.types.length ? `<table class="types compact"><thead><tr><th>${esc(L.activity.one)}</th><th>Spots</th>${listOnly ? "" : "<th>Split into</th>"}<th>Waitlist</th>${SC.restricts(CUR) && (CUR.tags || []).length ? "<th>Only for</th>" : ""}<th>Coach</th><th>On calendar</th><th></th></tr></thead>
            <tbody>${r.types.map((t) => `<tr>
              <td>${swatch(t.activity)}<strong>${t.section ? `${esc(t.section)} › ` : ""}${esc(typeLabel(t.activity, t.age_groups, t.required_tags))}</strong></td>
              ${locked ? `<td>${t.default_capacity || defaultsFor(r, t.activity).capacity}</td>${listOnly ? "" : `<td>${t.block_minutes ? `${t.block_minutes} min` : "Whole"}</td>`}<td>${t.waitlist == null ? "Round default" : t.waitlist ? "On" : "Off"}</td>${SC.restricts(CUR) && (CUR.tags || []).length ? `<td>${esc((t.required_tags || []).join(", ") || "Everyone")}</td>` : ""}<td>${esc(t.default_coach || "")}</td><td>${t.scheduled}</td><td></td>` : `
              <td><input form="st-${t.id}" type="number" name="spots" min="1" max="200" required value="${t.default_capacity || defaultsFor(r, t.activity).capacity}" aria-label="Spots"></td>
              ${listOnly ? "" : `<td>${blockSelect("block", t.block_minutes, `form="st-${t.id}" aria-label="Split into blocks"`)}</td>`}
              <td>${waitlistSelect(t.waitlist, r, `form="st-${t.id}" aria-label="Waitlist"`)}</td>
              ${SC.restricts(CUR) && (CUR.tags || []).length ? `<td>${onlyFor(CUR.tags, t.required_tags || [], `st-${t.id}`)}</td>` : ""}
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
            ${SC.restricts(CUR) ? `<span class="ages">${SC.groupsFor(CUR).map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"> ${esc(g)}</label>`).join("")}
              ${SC.presetsFor(CUR).map((x) => `<button type="button" class="tchip" data-ages="${esc(x.ages.join(","))}">${esc(x.name)}</button>`).join("")}</span>` : ""}
            <input type="number" name="spots" min="1" max="200" required placeholder="Spots" aria-label="Spots" class="spots-in">
            ${listOnly ? "" : blockSelect("block", null, 'aria-label="Split into blocks" class="block-in"')}
            ${waitlistSelect(null, r, 'aria-label="Waitlist" class="block-in"')}
            ${SC.restricts(CUR) && (CUR.tags || []).length ? `<span class="only-label">Only for:</span>${onlyFor(CUR.tags, [])}` : ""}
            <input name="coach" placeholder="Coach (optional)" aria-label="Coach" class="coach-in">
            <button class="btn-small" type="submit">Add</button>
          </form>`}
        </div>
`;
}

// When claiming opens, and (for dated boards) how late a spot can be given up
function timingForm(r, locked, anchor, L) {
  const { inputParts } = require("../time");
  const at = r.booking_opens_at ? inputParts(r.booking_opens_at) : null;
  const dated = SC.usesCalendar(CUR);
  return `<form method="post" action="/admin/rounds/${r.id}/timing" class="timing-form">${back(anchor)}
    <fieldset class="plain"${locked ? " disabled" : ""}>
    <div class="tf-row"><span class="label-like">Claiming opens</span>
      <label class="radio-row"><input type="radio" name="opens" value="now"${at ? "" : " checked"}> Right away (once published)</label>
      <label class="radio-row"><input type="radio" name="opens" value="at"${at ? " checked" : ""}> At</label>
      <input type="datetime-local" name="booking_opens_at" value="${at ? `${at.date}T${at.time}` : ""}" aria-label="Opens at" onfocus="this.form.opens[1].checked=true"></div>
    <p class="fine">Set a time so everyone gets a fair shot, e.g. "claims open Monday at 7:00 PM".</p>
    ${dated ? `<div class="tf-row"><span class="label-like">Give-it-up deadline</span>
      <input type="number" name="cancel_hours" min="0" max="336" value="${r.cancel_hours ?? 24}" class="spots-in" aria-label="Hours before"> hours before it starts</div>
    <p class="fine">After this, people can't give up a spot online (use 0 for any time). ${esc(L.slot.many)} without a date can always be given up.</p>` : ""}
    ${locked ? "" : `<button class="btn-ghost" type="submit">Save timing</button>`}
    </fieldset></form>`;
}

// 1-2 level boards: the board page itself, in the order you'd do things
function boardBlock(r, locked, L, acts) {
  const anchor = `round-${r.id}`;
  const depth = SC.depthOf(CUR);
  const listOnly = !SC.usesCalendar(CUR);
  const mode = SC.claimMode(CUR);
  const setupLink = `<a href="/admin/setup/schedule?s=${CUR.id}">Claim Board Setup</a>`;
  const step = (n, title, help, body, extra = "") => `<section class="board-step${extra}">
    <h2 class="bs-title"><span class="step-num">${n}</span>${title}</h2>
    ${help ? `<p class="fine bs-help">${help}</p>` : ""}${body}</section>`;
  const what = depth === 1 ? esc(L.slot.many) : `${esc(L.activity.many)} &amp; ${esc(L.slot.many.toLowerCase())}`;
  const how = {
    public: `People get to it with the <b>share link</b> or <b>QR code</b> below, because <i>Who can claim</i> is set to <b>Anyone with the link</b> (change it in ${setupLink}).`,
    family: `People sign in and find it under <b>My Claims</b>, because <i>Who can claim</i> is <b>Anyone signed in</b> (change it in ${setupLink}). Send them your site's address so they can sign in.`,
    roster: `Only the ${esc(L.participant.many.toLowerCase())} you add in Settings can claim it, from <b>My Claims</b> (change who can claim in ${setupLink}).`,
  }[mode];
  return `<div class="board-block" id="${anchor}">
    <div class="bb-status">
      <span>${pln(r.scheduled, L.slot)} · ${r.claimed}/${r.spots} spots claimed</span>
      ${locked ? `<span class="pill">Archived</span>` : statusPill(r)}
      <a class="link-dark" href="/admin/reports?round=${r.id}">Reports</a>
    </div>

    ${step(1, `Add ${what}`, depth === 1
      ? `Each ${esc(L.slot.one.toLowerCase())} is something people can claim, with how many spots it has. For example: <i>Bring a case of water, 10 spots</i>.`
      : `First the ${esc(L.activity.many.toLowerCase())} you're offering (like Concessions or Ticket Booth), then the ${esc(L.slot.many.toLowerCase())} people claim in each.`,
      `${depth > 1 ? typesPart(r, locked, L, acts, anchor) : ""}
       ${listOnly ? "" : `<div class="bs-cal">${timesPart(r, locked, L, acts, anchor)}
         <p class="fine">Dated ${esc(L.slot.many.toLowerCase())} go on the calendar: <a class="btn-small" href="/admin/rounds/${r.id}">Open calendar</a></p></div>`}
       ${itemsPanel(r, locked, L)}`)}

    ${step(2, "Rules <span class='opt-pill'>Optional</span>", `Leave these as they are and anyone who can claim can take as many as they like, starting as soon as you publish. Set a limit to spread spots around, a waitlist if you want people to line up when something fills, and a time if claiming should open later.`,
      limitsForm(r, { returnTo: `${home()}#${anchor}`, readonly: locked, compact: true, activities: acts, listOnly, slotWord: L.slot.many }) + timingForm(r, locked, anchor, L))}

    ${step(3, "Publish &amp; share", `${r.published_at ? "<b>Published:</b> people can see and claim it." : "<b>Not published yet:</b> nobody can see it until you publish."} ${how}`,
      `<div class="bs-publish">${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/publish">${back(anchor)}
        <button class="${r.published_at ? "btn-ghost" : "btn-small"}" type="submit">${r.published_at ? "Hide it" : "Publish"}</button></form>`}</div>
       ${mode === "public" ? shareBox(r) : ""}`)}
  </div>`;
}

function roundBlock(r, locked, L, acts) {
  const anchor = `round-${r.id}`;
  const depth = SC.depthOf(CUR);
  const listOnly = !SC.usesCalendar(CUR);
  const slots = r.time_slots || [];
  return `<details class="round${r.is_main ? " main-round" : ""}" id="${anchor}"${r.is_main ? " open" : ""}>
    <summary>
      <span class="r-name">${r.is_main ? "Rules &amp; what's offered" : esc(r.name)}</span>
      ${r.is_main ? "" : `<span class="r-dates">${esc(niceRange(r.starts_on, r.ends_on))}</span>`}
      <span class="r-stats">${depth === 1 ? `${pln(r.scheduled, L.slot)}, ${r.claimed}/${r.spots} spots claimed`
        : `${pln(r.types.length, L.activity)}, ${pln(r.scheduled, L.slot)}, ${r.claimed}/${r.spots} spots claimed`}</span>
      ${locked ? `<span class="pill">Completed</span>` : statusPill(r)}
    </summary>
    <div class="round-body">
      <div class="round-actions">
        ${listOnly ? "" : `<a class="btn-small" href="/admin/rounds/${r.id}">Open calendar</a>`}
        ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/publish">${back(anchor)}
          <button class="btn-ghost" type="submit">${r.published_at ? "Hide" : r.is_main ? "Publish" : `Publish ${esc(L.middle.one.toLowerCase())}`}</button></form>`}
        <a class="link-dark" href="/admin/rounds/${r.id}#settings">${r.is_main ? "More settings" : `${esc(L.middle.one)} settings`}</a>
        <a class="link-dark" href="/admin/reports?round=${r.id}">Reports</a>
      </div>

      ${r.signup_mode === "public" ? `<div class="round-who"><p class="label-like">Share</p>${shareBox(r)}</div>` : ""}
      <div class="round-limits">
        <p class="label-like">Limits per ${esc(L.participant.one.toLowerCase())}</p>
        ${limitsForm(r, { returnTo: `${home()}#${anchor}`, readonly: locked, compact: true, activities: acts, listOnly, slotWord: L.slot.many })}
      </div>
      <div class="round-grid${listOnly ? " list-only" : ""}">
        ${timesPart(r, locked, L, acts, anchor)}
        ${typesPart(r, locked, L, acts, anchor)}
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
      ${SC.usesCalendar(CUR) ? `<label>First day<input type="date" name="starts_on" required></label>
      <label>Last day<input type="date" name="ends_on" required></label>` : ""}
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
        ${done ? "" : `<form method="post" action="/admin/seasons/${s.id}/complete" onsubmit="return confirm('Complete ${esc(s.name)}? People will no longer see it, and it becomes read-only. Reports stay available.')">${back(`season-${s.id}`)}
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

function scheduleSettingsPage({ user, flash, sc, counts, part = "structure" }) {
  const L = SC.labels(sc);
  const tab = { structure: "schedule", more: "schedule-more", archive: "schedule-archive" }[part] || "schedule";
  const sections = {
    structure: `<section class="panel">
      <h1>${esc(require("../config").LABELS.schedule)} Setup</h1>
      <p class="muted tight">The basics: its name, who can claim, how people see it, its levels, locations, and what people see of who's going.</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/depth?s=${sc.id}" class="depth-form">
        <label>Levels under the board<select name="depth"${counts.items ? " disabled" : ""}>
          ${[1, 2, 3, 4].map((n) => `<option value="${n}"${SC.depthOf(sc) === n ? " selected" : ""}>${n} level${n === 1 ? "" : "s"}</option>`).join("")}</select></label>
        ${counts.items ? `<span class="fine">Can't change once the board has ${esc(L.slot.many.toLowerCase())} or ${esc(L.middle.many.toLowerCase())}. Copy it with nothing on the calendar to restructure.</span>`
          : `<button class="btn-ghost" type="submit">Change</button><span class="fine">The last level is always what people claim.</span>`}
      </form>
      <form method="post" action="/admin/setup/schedules/${sc.id}?s=${sc.id}" class="sched-form">
        <label class="w-wide">Name<input name="name" required value="${esc(sc.name)}" maxlength="60"></label>
        <fieldset class="checks pick-mode"><legend>Who can claim?</legend>
          <label class="mode-opt"><input type="radio" name="claim" value="public"${SC.claimMode(sc) === "public" ? " checked" : ""}><span><b>Anyone with the link</b><span class="fine">Share a link or QR code. People enter a name and email, no account needed.</span></span></label>
          <label class="mode-opt"><input type="radio" name="claim" value="family"${SC.claimMode(sc) === "family" ? " checked" : ""}><span><b>Anyone signed in</b><span class="fine">Anyone who signs in can claim for themselves or their kids. Nothing to set up.</span></span></label>
          <label class="mode-opt"><input type="radio" name="claim" value="roster"${SC.claimMode(sc) === "roster" ? " checked" : ""}><span><b>Only people I add</b><span class="fine">You add the ${esc(L.participant.many.toLowerCase())}. Adds the <strong>${esc(L.participant.many)}</strong> step.</span></span></label>
        </fieldset>
        ${true ? `<fieldset class="checks pick-mode"><legend>Limit some ${esc((SC.depthOf(sc) > 1 ? L.activity.many : L.slot.many).toLowerCase())} to certain people?</legend>
          <label class="mode-opt"><input type="radio" name="restrict" value="no"${SC.restricts(sc) ? "" : " checked"}><span><b>No</b><span class="fine">Anyone who can claim can claim anything on this board.</span></span></label>
          <label class="mode-opt"><input type="radio" name="restrict" value="yes"${SC.restricts(sc) ? " checked" : ""}><span><b>Yes, by ${esc(L.group.one.toLowerCase())} or tag</b><span class="fine">${SC.activitiesFor(sc).includes("Hitting") || !SC.activitiesFor(sc).length && SC.depthOf(sc) === 3
            ? "e.g. Hitting only for 12U–18U, Catching only for catchers."
            : SC.depthOf(sc) === 1 ? "e.g. Salad only for 10U, Chips only for 14U." : `e.g. ${esc(SC.activitiesFor(sc)[0] || L.activity.one)} only for adults, or only for people tagged Bartender.`} Adds the <strong>${esc(L.group.many)} &amp; tags</strong> and <strong>${esc(L.participant.many)}</strong> steps.</span></span></label>
        </fieldset>` : ""}
        <fieldset class="checks pick-mode"><legend>Do things have dates and times?</legend>
          <label class="mode-opt"><input type="radio" name="dated" value="no"${SC.pickMode(sc) === "list" ? " checked" : ""}><span><b>No</b><span class="fine">It's all one day or there are no set times. People pick from a list. Put the day in the board's name, and times in an item's name if needed.</span></span></label>
          <label class="mode-opt"><input type="radio" name="dated" value="yes"${SC.pickMode(sc) === "list" ? "" : " checked"}><span><b>Yes</b><span class="fine">${esc(L.slot.many)} have dates and times. Undated items can still be added too.</span></span></label>
        </fieldset>
        <fieldset class="checks pick-mode" id="views-q"${SC.pickMode(sc) === "list" ? " hidden" : ""}><legend>Available views</legend>
          <label class="mode-opt"><input type="radio" name="pick" value="calendar"${SC.pickMode(sc) !== "both" ? " checked" : ""}><span><b>Calendar</b><span class="fine">People pick days on a calendar.</span></span></label>
          <label class="mode-opt"><input type="radio" name="pick" value="both"${SC.pickMode(sc) === "both" ? " checked" : ""}><span><b>Both: List &amp; Calendar</b><span class="fine">People can switch between the calendar and a day-by-day list. The app remembers which one they used last.</span></span></label>
        </fieldset>
        <script>document.querySelectorAll('input[name="dated"]').forEach(function (r) { r.addEventListener("change", function () {
          document.getElementById("views-q").hidden = r.value === "no" && r.checked; }); });</script>
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
`,
    more: `    <div class="settings-2">
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
      <h2 class="banner">View</h2>
      <p class="fine">What people see of who's going to each ${esc(L.slot.one.toLowerCase())}, so friends can claim spots together. Emails and other contact details are never shown.</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/family?s=${sc.id}" class="stack-list checks">
        ${[["initial", "First name and last initial", "Ava S."], ["full", "Full names", "Ava Smith"], ["off", "Don't show who's going", "Only spots open"]].map(([k, l, ex]) =>
          `<label class="radio-row"><input type="radio" name="family_names" value="${k}"${(sc.family_names || "initial") === k ? " checked" : ""}> ${l} <span class="fine-inline">${ex}</span></label>`).join("")}
        <div><button class="btn-ghost" type="submit">Save</button></div>
      </form>
    </section>
    </div>

`,
    archive: `<section class="panel"><h1>Archive or delete</h1>
      <p class="muted tight">When ${esc(sc.name)} is over, archive it: it's hidden from people and read-only, and its reports stay. Delete is only for empty boards.</p></section>
    <section class="panel">
      <h2>${sc.archived_at ? "Archived" : "Archive"}</h2>
      <p class="muted">${sc.archived_at ? `People can't see anything in ${esc(sc.name)}. Restore it to make it active again.`
        : `Archiving hides ${esc(sc.name)} from people and moves it to the Archived list in Settings. Nothing is deleted, and you can restore it any time.`}</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/archive?s=${sc.id}"><button class="btn-ghost" type="submit">${sc.archived_at ? "Restore" : "Archive"} ${esc(sc.name)}</button></form>
    </section>
    <section class="panel">
      <h2>Delete</h2>
      <p class="muted">${counts.items ? `It has ${counts.items} ${esc(L.top.many.toLowerCase())}/${esc(L.middle.many.toLowerCase())}, so it can't be deleted until those are removed.` : `It's empty, so it can be deleted. ${counts.members ? `Its ${counts.members} ${esc(L.participant.many.toLowerCase())} stay in the app.` : ""}`}</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/delete?s=${sc.id}" onsubmit="return confirm('Delete the ${esc(sc.name)} schedule?')">
        <button class="btn-ghost danger" type="submit"${counts.items ? " disabled" : ""}>Delete ${esc(sc.name)}</button></form>
    </section>`,
  };
  return page({
    title: `Settings · ${sc.name}`, tab, user, flash,
    body: part === "archive" ? sections.archive : sections.structure + sections.more,
  });
}

function newSchedulePage({ user, flash }) {
  const PRE = SC.PRESET_LABELS;
  const { LABELS } = require("../config");
  const levels = (l) => SC.LEVEL_KEYS[l.depth].map((k) => l[k][1]).join(" › ");
  const CHOICES = [
    ["list", "📋", "Item list", "1 level", "Donations, a potluck, team snacks", "Bring a case of water · 10 spots"],
    ["volunteer", "🙋", "Areas & shifts", "2 levels", "Tournament or fundraiser volunteers", "Concessions › 9:00–11:00 AM · 4 spots"],
    ["training", "🥎", "Rounds & sessions", "3 levels", "Training with rounds, limits, and a calendar", "Round 1 › Hitting 12U–18U › Mon 6:00 PM"],
    ["event", "🏆", "Event days", "4 levels", "A multi-day event with areas and stations", "Saturday › Concessions › Grill › 8–10 AM"],
  ];
  const opt = (name, value, title, text) => `<label class="choice"><input type="radio" name="${name}" value="${value}">
    <span class="choice-body"><b>${title}</b><span>${text}</span></span><span class="choice-check" aria-hidden="true">✓</span></label>`;
  return page({
    title: "New", tab: "home", user, flash,
    body: `<a class="back" href="/admin/settings">All ${esc(LABELS.schedules.toLowerCase())}</a>
    <section class="panel wizard">
      <h1>Create ${esc(SC.an(LABELS.schedule))}</h1>
      <p class="muted tight">Set it up in three quick steps. You can change everything later.</p>
      <ol class="wz-progress" aria-label="Steps">
        <li data-step="1" class="on"><span>1</span>Details</li><li data-step="2"><span>2</span>Structure</li><li data-step="3"><span>3</span>Settings</li>
      </ol>
      <form method="post" action="/admin/setup/schedules" id="wz">

        <div class="wz-step" data-step="1">
          <h2>Board details</h2>
          <label class="field">Board name<input name="name" id="wz-name" required maxlength="60" autocomplete="off" placeholder="e.g. Winter Training 2026–27"></label>
          <div class="tip"><b>Tip</b> Use a season or event name people will recognize, like "Winter Training 2026–27" or "Raptors Rumble Concessions, Sat Feb 7".</div>
        </div>

        <div class="wz-step" data-step="2" hidden>
          <h2>Structure</h2>
          <p class="muted tight">How is it organized? The last level is what people claim.</p>
          <div class="choice-grid">${CHOICES.map(([k, icon, title, depth, use, ex]) => `<label class="choice struct">
            <input type="radio" name="preset" value="${k}"${k === "training" ? " checked" : ""}>
            <span class="choice-icon" aria-hidden="true">${icon}</span>
            <span class="choice-body"><b>${title} <em>${depth}</em></b><span class="lv">${esc(levels(PRE[k]))}</span><span>${esc(use)}</span><span class="ex">e.g. ${esc(ex)}</span></span>
            <span class="choice-check" aria-hidden="true">✓</span></label>`).join("")}</div>
        </div>

        <div class="wz-step" data-step="3" hidden>
          <h2>Settings</h2>
          <p class="muted tight">Filled in for the structure you picked. Change any of them.</p>
          <fieldset class="q"><legend>Who can claim?</legend><div class="choice-row three">
            ${opt("claim", "public", "Anyone with the link", "You get a share link and QR code. People just enter a name and email.")}
            ${opt("claim", "family", "Anyone signed in", "People sign in with their email and find it under My Claims.")}
            ${opt("claim", "roster", "Only people I add", "You add the people who can claim, like a team roster.")}</div></fieldset>
          <fieldset class="q"><legend>Limit some things to certain people?</legend><div class="choice-row">
            ${opt("restrict", "no", "No", "Anyone who can claim can claim anything.")}
            ${opt("restrict", "yes", "Yes", "By group or tag, e.g. Salad only for 10U, Catching only for catchers.")}</div></fieldset>
          <fieldset class="q"><legend>Do things have dates and times?</legend><div class="choice-row">
            ${opt("dated", "no", "No", "It's all one day or there are no set times. People pick from a list.")}
            ${opt("dated", "yes", "Yes", "Things have dates and times.")}</div></fieldset>
          <fieldset class="q" id="wz-views"><legend>Available views</legend><div class="choice-row">
            ${opt("pick", "calendar", "Calendar", "People pick days on a calendar.")}
            ${opt("pick", "both", "Both: List &amp; Calendar", "People can switch between the calendar and a day-by-day list.")}</div></fieldset>
          <div class="wz-summary" aria-live="polite"><span class="label-like">Summary</span><p id="wz-sum"></p></div>
        </div>

        <div class="wz-nav">
          <button type="button" class="btn-ghost" id="wz-back" hidden>Back</button>
          <span class="spacer"></span>
          <button type="button" class="btn-small" id="wz-next">Continue</button>
          <button type="submit" class="btn-small" id="wz-create" hidden>Create board</button>
        </div>
      </form>
    </section>
    <script>
    (function () {
      var D = ${JSON.stringify(Object.fromEntries(Object.entries(PRE).map(([k, v]) => [k, { claim: v.claim, restrict: v.restrict ? "yes" : "no", dated: v.calendar === false ? "no" : "yes", depth: v.depth }])))};
      var NAMES = ${JSON.stringify(Object.fromEntries(CHOICES.map(([k, , t, d]) => [k, t + " (" + d + ")"])))};
      var form = document.getElementById("wz"), step = 1, touched = {};
      var $ = function (sel) { return form.querySelector(sel); };
      var val = function (n) { var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ""; };
      function set(n, v) { if (touched[n]) return; var el = form.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (el) el.checked = true; }
      function defaults() { var d = D[val("preset")]; if (!d) return; set("claim", d.claim); set("restrict", d.restrict); set("dated", d.dated); if (!val("pick")) set("pick", "calendar"); refresh(); }
      function refresh() {
        document.getElementById("wz-views").hidden = val("dated") !== "yes";
        var who = { public: "Anyone with the link", family: "Anyone signed in", roster: "Only people I add" }[val("claim")] || "";
        var when = val("dated") === "yes" ? (val("pick") === "both" ? "dates, list & calendar" : "dates, calendar") : "no dates (a list)";
        document.getElementById("wz-sum").innerHTML = "<b>" + (form.name.value.trim() || "Untitled").replace(/[<>&]/g, "") + "</b> · " + (NAMES[val("preset")] || "") +
          " · " + who + " · " + (val("restrict") === "yes" ? "limited by group or tag" : "anyone can claim anything") + " · " + when;
      }
      function show(n) {
        step = n;
        form.querySelectorAll(".wz-step").forEach(function (el) { el.hidden = +el.dataset.step !== n; });
        document.querySelectorAll(".wz-progress li").forEach(function (li) { li.classList.toggle("on", +li.dataset.step <= n); li.classList.toggle("now", +li.dataset.step === n); });
        document.getElementById("wz-back").hidden = n === 1;
        document.getElementById("wz-next").hidden = n === 3;
        document.getElementById("wz-create").hidden = n !== 3;
        if (n === 3) refresh();
        var f = form.querySelector('.wz-step[data-step="' + n + '"] input'); if (f && n === 1) f.focus();
      }
      document.getElementById("wz-next").addEventListener("click", function () {
        if (step === 1 && !form.name.value.trim()) { form.name.reportValidity(); return; }
        show(step + 1);
      });
      document.getElementById("wz-back").addEventListener("click", function () { show(step - 1); });
      form.name.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); document.getElementById("wz-next").click(); } });
      form.querySelectorAll('input[name="preset"]').forEach(function (r) { r.addEventListener("change", defaults); });
      ["claim", "restrict", "dated", "pick"].forEach(function (n) { form.querySelectorAll('input[name="' + n + '"]').forEach(function (r) { r.addEventListener("change", function () { touched[n] = true; refresh(); }); }); });
      form.name.addEventListener("input", refresh);
      defaults(); show(1);
    })();
    </script>`,
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
          <p class="muted tight">${SC.levelKeys(sc).map((k) => esc(L[k].many)).join(" › ")}. ${depth >= 3 && SC.usesCalendar(sc)
            ? `Open ${esc(SC.an(L.middle.one))}'s calendar to put ${esc(L.slot.many.toLowerCase())} on days.`
            : depth >= 3 ? `Add ${esc(L.slot.many.toLowerCase())} inside each ${esc(L.middle.one.toLowerCase())}. People pick from a list (no calendar).`
            : `Three things to do here: <b>add ${esc(L.slot.many.toLowerCase())}</b>, set <b>rules</b> if you want, then <b>publish</b>.`}</p></div>
        ${locked ? `<span class="pill">Archived: read-only</span>` : depth >= 3 ? `<div class="head-actions"><a class="btn-ghost" href="/admin/import?s=${sc.id}">Import vendor schedule</a></div>` : ""}
      </div>
      ${locked ? `<p class="rule">This Claim Board is archived: hidden from people and read-only. Reopen it from Settings to make changes.</p>` : ""}
    </section>

    ${depth <= 2 ? `<section class="panel">${main ? boardBlock(main, locked, L, acts) : ""}</section>` : `<section class="panel">
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
