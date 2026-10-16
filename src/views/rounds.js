const { esc } = require("./layout");
const { page } = require("./admin");
const { AGE_GROUPS, ACTIVITIES, ACTIVE_ACTIVITIES, ALL_AGES_ACTIVITIES, colorFor } = require("../config");
let SID = null; // schedule of the page being drawn (colors are per schedule)
const ACTIVITY_COLORS = new Proxy({}, { get: (_, name) => colorFor(String(name), SID) });
const { inputParts } = require("../time");
const { typeLabel, defaultsFor, isUnlocked, limitFor } = require("../rounds");
const { blockSelect, spotsLabel, limitsForm, limitsScript, waitlistSelect, modeForm, shareBox, onlyFor } = require("./partials");
const SC = require("../schedules");
const { LABELS } = require("../config");
let L = SC.labels(null), ACTS = [], GROUPS = [], PRESETS_SC = [], BTAGS = [], DEPTH = 3, TYPES = [], RESTRICT = true;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);
const nice = (isoDate) => { const d = parse(isoDate); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const niceRange = (a, b) => `${nice(a)} to ${nice(b)}, ${parse(b).getUTCFullYear()}`;

function hm(t) {
  const [h, m] = t.split(":").map(Number);
  return { txt: `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}`, ap: h < 12 ? "a" : "p" };
}
const shortRange = (s, e) => { const a = hm(s), b = hm(e); return a.ap === b.ap ? `${a.txt}–${b.txt}${b.ap}` : `${a.txt}${a.ap}–${b.txt}${b.ap}`; };

const statusPill = (r) => r.published_at ? `<span class="pill ok">Published</span>` : `<span class="pill wait">Draft</span>`;

function defaultsTable(round, activities) {
  return `<div class="table-wrap"><table class="defaults">
    <thead><tr><th>Activity</th><th>Spots</th><th>Split into</th><th>Coach</th></tr></thead>
    <tbody>${(activities || ACTIVITIES).map((a, i) => { const d = defaultsFor(round || {}, a); return `<tr>
      <td><input type="hidden" name="dname_${i}" value="${esc(a)}"><span class="swatch" style="background:${colorFor(a, round && round.schedule_id)}"></span>${esc(a)}</td>
      <td><input type="number" min="1" max="200" name="cap_${i}" value="${d.capacity}" aria-label="${esc(a)} capacity"></td>
      <td>${blockSelect(`block_${i}`, d.block, `aria-label="${esc(a)} blocks"`)}</td>
      <td><input name="coach_${i}" value="${esc(d.coach)}" aria-label="${esc(a)} coach" placeholder="Optional"></td></tr>`; }).join("")}
    </tbody></table></div>`;
}

const roundsPage = ({ user, flash, rounds, seasons, open, filter, copyable }) => page({
  title: "Rounds", tab: "rounds", user, flash,
  body: `<section class="panel">
    <div class="athlete-head"><h1>Rounds</h1>
      <form method="get" action="/admin/rounds" class="filter-inline">
        <label>Show <select name="season" onchange="this.form.submit()">
          <option value="open"${filter === "open" ? " selected" : ""}>Open seasons</option>
          ${seasons.map((x) => `<option value="${x.id}"${String(x.id) === filter ? " selected" : ""}>${esc(x.name)}${x.completed_at ? " (completed)" : ""}</option>`).join("")}
          <option value="none"${filter === "none" ? " selected" : ""}>Not in a season</option>
          <option value="all"${filter === "all" ? " selected" : ""}>Everything</option>
        </select></label><noscript><button class="btn-ghost">Show</button></noscript>
      </form></div>
    ${rounds.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Round</th><th>Season</th><th>Dates</th><th>Sessions</th><th>Reservations</th><th>Status</th></tr></thead>
      <tbody>${rounds.map((r) => `<tr>
        <td><a href="/admin/rounds/${r.id}">${esc(r.name)}</a></td>
        <td>${r.season_name ? `<a href="/admin/seasons/${r.season_id}">${esc(r.season_name)}</a>` : `<span class="fine">None</span>`}</td>
        <td>${esc(niceRange(r.starts_on, r.ends_on))}</td>
        <td>${r.sessions}</td><td>${r.reservations}</td><td>${r.season_done ? `<span class="pill">Season completed</span>` : statusPill(r)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No rounds here yet. Create one below, or import a vendor schedule.</p>`}
  </section>
  <section class="panel">
    <h2>New round</h2>
    ${!open.length ? `<p class="rule">Tip: <a href="/admin/seasons">open a season</a> first so rounds are grouped by year.</p>` : ""}
    <form method="post" action="/admin/rounds" class="grid-form">
      <div><label>Name<input name="name" required placeholder="Round 1"></label></div>
      <div class="pair"><div><label>First day<input type="date" name="starts_on" required></label></div>
        <div><label>Last day<input type="date" name="ends_on" required></label></div></div>
      <div><label>Start from
        <select name="copy_from"><option value="">An empty calendar</option>
          ${copyable.map((r) => `<option value="${r.id}">A copy of ${esc(r.name)}${r.season_name ? `, ${esc(r.season_name)}` : ""} (${esc(niceRange(r.starts_on, r.ends_on))})</option>`).join("")}
        </select></label>
        <span class="fine">Copies times, sessions, spots, and the schedule, shifted to the new first day.</span></div>
      <div class="full"><button class="btn" type="submit">Create round</button></div>
    </form>
  </section>`,
});

// Show a split session's blocks on one day as a single chip
function groupBlocks(list) {
  const out = [];
  for (const s of list) {
    const g = s.block_minutes && out.find((x) => x.blocks && x.program_id === s.program_id && x.end === s.start);
    if (g) { g.end = s.end; g.blocks++; g.taken += s.taken; g.capacity += s.capacity; g.open = g.open || s.open; }
    else if (s.block_minutes) out.push({ ...s, blocks: 1 });
    else out.push(s);
  }
  return out;
}

function grid(round, sessions) {
  const start = parse(round.starts_on), end = parse(round.ends_on);
  const first = addDays(start, -start.getUTCDay());
  const last = addDays(end, 6 - end.getUTCDay());
  const byDate = {};
  // 🔓 marks sessions open to every athlete (only meaningful for activities with a limit)
  sessions.forEach((s) => { s.open = limitFor(round, s.activity) != null && isUnlocked(s, round); });
  sessions.forEach((s) => (byDate[s.date] = byDate[s.date] || []).push(s));
  const weeks = [];
  for (let w = first; w <= last; w = addDays(w, 7)) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i), key = iso(d);
      const list = byDate[key] || [];
      const label = d.getUTCDate() === 1 || key === round.starts_on || i === 0 ? `${MON[d.getUTCMonth()]} ${d.getUTCDate()}` : d.getUTCDate();
      days.push(d >= start && d <= end ? `<div class="day" data-date="${key}" data-label="${esc(nice(key))}" tabindex="0" role="button" aria-pressed="false">
        <div class="day-head"><span class="day-num">${label}</span>
          ${list.length ? `<span class="day-tools"><a class="who-btn" href="/admin/day/${key}" title="Who's signed up" aria-label="Who's signed up on ${esc(nice(key))}">👥</a><button type="button" class="copy-btn" data-copy="${key}" data-count="${list.length}" title="Copy this day to other days">Copy</button></span>` : ""}</div>
        ${groupBlocks(list).map((s) => s.blocks ? `<div class="chip-s" style="--c:${ACTIVITY_COLORS[s.activity]}">
          <a href="/admin/day/${key}#p${s.program_id}" title="See who's signed up for each block">${esc(shortRange(s.start, s.end))} ${esc(typeLabel(s.activity, s.age_groups, s.required_tags))}
            <span class="blocks-n">${s.blocks} blocks</span> <span class="spots-n">${s.taken}/${s.capacity}</span>${s.open ? `<span class="lock-ic" title="Unlocked: open to all athletes">🔓</span>` : ""}</a>
          ${s.taken ? "" : `<form method="post" action="/admin/rounds/${round.id}/day-blocks/delete"><input type="hidden" name="program_id" value="${s.program_id}"><input type="hidden" name="date" value="${key}"><button type="submit" class="x" title="Remove these blocks" aria-label="Remove these blocks">×</button></form>`}
        </div>` : `<div class="chip-s" style="--c:${ACTIVITY_COLORS[s.activity]}">
          <a href="/admin/sessions/${s.id}" title="Open roster and edit">${esc(shortRange(s.start, s.end))} ${esc(typeLabel(s.activity, s.age_groups, s.required_tags))}
            <span class="spots-n">${s.taken}/${s.capacity}</span>${s.open ? `<span class="lock-ic" title="Unlocked: open to all athletes">🔓</span>` : ""}</a>
          ${s.taken ? "" : `<form method="post" action="/admin/rounds/${round.id}/sessions/${s.id}/delete"><button type="submit" class="x" title="Remove from calendar" aria-label="Remove from calendar">×</button></form>`}
        </div>`).join("")}
      </div>` : `<div class="day out"></div>`);
    }
    weeks.push(`<div class="week">${days.join("")}</div>`);
  }
  return `<div class="cal"><div class="week dow">${DOW.map((d) => `<div>${d}</div>`).join("")}</div>${weeks.join("")}</div>`;
}

const unlockText = (h) => (h == null ? "Automatic unlocking is off for this round (see Limits)."
  : `Sessions also unlock automatically ${h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`} before they start.`);
const swatch = (a) => `<span class="swatch" style="background:${ACTIVITY_COLORS[a]}"></span>`;

function timesPanel(r) {
  const slots = r.time_slots || [];
  return `<section class="panel step">
    <h2><span class="step-n">1</span> Times</h2>
    <p class="fine">The time slots used in this round. You'll pick from these when scheduling.</p>
    ${slots.length ? `<ul class="slot-list">${slots.map((t) => `<li><span>${esc(shortRange(t.start, t.end))}</span>
      <form method="post" action="/admin/rounds/${r.id}/slots/remove"><input type="hidden" name="slot" value="${t.start}-${t.end}">
        <button type="submit" class="x" aria-label="Remove ${esc(shortRange(t.start, t.end))}">×</button></form></li>`).join("")}</ul>`
      : `<p class="muted">No times yet.</p>`}
    <form method="post" action="/admin/rounds/${r.id}/slots" class="inline-add">
      <label>Start<input type="time" name="start_time" required></label>
      <label>End<input type="time" name="end_time" required></label>
      <button class="btn-small" type="submit">Add time</button>
    </form>
  </section>`;
}

function sessionsPanel(r, types) {
  return `<section class="panel step">
    <h2><span class="step-n">2</span> ${esc(L.activity.many)}</h2>
    <p class="fine">Each session is an activity for a group, with the number of spots players can claim.</p>
    ${types.length ? `<div class="table-wrap"><table class="types">
      <thead><tr><th>Session</th><th>Spots</th><th>Split into</th><th>Waitlist</th>${BTAGS.length ? "<th>Only for</th>" : ""}<th>Coach</th><th>On calendar</th><th></th></tr></thead>
      <tbody>${types.map((t) => `<tr>
        <td>${swatch(t.activity)}<strong>${t.section ? `${esc(t.section)} › ` : ""}${esc(typeLabel(t.activity, t.age_groups, t.required_tags))}</strong></td>
        <td><input form="type-${t.id}" type="number" name="spots" min="1" max="200" required value="${t.default_capacity || defaultsFor(r, t.activity).capacity}" aria-label="Spots"></td>
        <td>${blockSelect("block", t.block_minutes, `form="type-${t.id}" aria-label="Split into blocks"`)}</td>
        <td>${waitlistSelect(t.waitlist, r, `form="type-${t.id}" aria-label="Waitlist"`)}</td>
        ${BTAGS.length ? `<td>${onlyFor(BTAGS, t.required_tags || [], `type-${t.id}`)}</td>` : ""}
        <td><input form="type-${t.id}" name="coach" value="${esc(t.default_coach)}" placeholder="Optional" aria-label="Coach"></td>
        <td>${t.scheduled}</td>
        <td><div class="row-actions">
          <form id="type-${t.id}" method="post" action="/admin/rounds/${r.id}/types/${t.id}"><button class="btn-ghost" type="submit">Save</button></form>
          ${t.scheduled ? "" : `<form method="post" action="/admin/rounds/${r.id}/types/${t.id}/delete"><button class="x" type="submit" aria-label="Remove session">×</button></form>`}
        </div></td></tr>`).join("")}</tbody></table></div>
      <p class="fine">Saving spots updates every scheduled occurrence. If you add spots, waitlisted athletes move in automatically. With blocks, spots are per block, and "Split into" applies the next time you schedule it.</p>`
      : `<p class="muted">No sessions yet. Add the activity and group combinations this round offers.</p>`}

    <form method="post" action="/admin/rounds/${r.id}/types" class="type-add">
      <h3>Add ${esc(SC.an(L.activity.one))}</h3>
      ${SC.depthOf({ depth: DEPTH }) === 4 ? `<label>${esc(L.section.one)}<input name="section" required maxlength="40" list="round-sections"></label>
        <datalist id="round-sections">${[...new Set(TYPES.map((t) => t.section).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}
      <fieldset class="checks"><legend>Activity</legend>
        ${ACTS.map((a) => `<label class="act" style="--c:${ACTIVITY_COLORS[a]}"><input type="radio" name="activity" value="${esc(a)}" required> ${esc(a)}</label>`).join("")}
      </fieldset>
      <fieldset class="checks"${RESTRICT ? "" : " hidden"}><legend>${esc(L.group.one)}</legend>
        ${GROUPS.map((g) => `<label class="check"><input type="checkbox" name="ages" value="${esc(g)}"> ${esc(g)}</label>`).join("")}
        <div class="presets">
          ${PRESETS_SC.map((x) => `<button type="button" class="tchip" data-ages="${esc(x.ages.join(","))}">${esc(x.name)}</button>`).join("")}
          ${GROUPS.length ? `<button type="button" class="tchip" data-ages="${esc(GROUPS.join(","))}">All ${esc(L.group.many.toLowerCase())}</button>` : ""}
        </div>
      </fieldset>
      <div class="inline-add">
        <label>Spots<input type="number" name="spots" min="1" max="200" required placeholder="10"></label>
        <label>Split into${blockSelect("block", null)}</label>
        <label>Waitlist${waitlistSelect(null, r)}</label>
        ${RESTRICT && BTAGS.length ? `<label>Only for${onlyFor(BTAGS, [])}</label>` : ""}
        <label>Coach<input name="coach" placeholder="Optional"></label>
        <button class="btn-small" type="submit">Add session</button>
      </div>
      <p class="fine">Split into blocks for drop-in style sessions (like Cage Time): scheduling 3–7 PM in 30-minute blocks with 2 spots creates eight 30-minute blocks of 2.</p>
    </form>
  </section>`;
}

function schedulePanel(r, types, last) {
  const slots = r.time_slots || [];
  const lastTypes = String(last.types || "").split(",");
  const lastSlot = String(last.slot || "");
  const ready = types.length > 0;
  return `<aside class="panel add-panel">
      <div id="copy-bar" class="copy-bar" hidden>
        <p><strong>Copying <span id="copy-label"></span></strong>. Select the days to copy it to.</p>
        <form method="post" action="/admin/rounds/${r.id}/copy-day">
          <input type="hidden" name="copy_from" id="copy-from"><input type="hidden" name="dates" class="sel-dates">
          <button class="btn-small" type="submit" id="paste-btn" disabled>Paste to 0 days</button>
          <button class="btn-ghost" type="button" id="copy-cancel">Cancel</button>
        </form>
      </div>
      <form method="post" action="/admin/rounds/${r.id}/schedule" id="add-form">
        <h2><span class="step-n">3</span> Schedule</h2>
        ${ready ? `
        <input type="hidden" name="dates" class="sel-dates">
        <div><p class="label-like">Days</p>
          <p class="sel-line"><span id="sel-label">Click days on the calendar.</span> <button type="button" class="link-dark" id="sel-clear" hidden>Clear</button></p></div>

        <fieldset class="checks stack-list"><legend>Time</legend>
          ${slots.map((t) => { const k = `${t.start}-${t.end}`; return `<label class="radio-row"><input type="radio" name="slot" value="${k}"${lastSlot === k ? " checked" : ""} required> ${esc(shortRange(t.start, t.end))}</label>`; }).join("")}
          <label class="radio-row"><input type="radio" name="slot" value="custom" id="slot-custom"${!slots.length || lastSlot === "custom" ? " checked" : ""}> Other time</label>
          <div class="pair" id="custom-times"${slots.length && lastSlot !== "custom" ? " hidden" : ""}>
            <div><label>Start<input type="time" name="start_time"></label></div>
            <div><label>End<input type="time" name="end_time"></label></div></div>
        </fieldset>

        <fieldset class="checks stack-list"><legend>${esc(L.activity.many)} at this time</legend>
          ${types.map((t) => `<label class="act wide" style="--c:${ACTIVITY_COLORS[t.activity]}"><input type="checkbox" name="types" value="${t.id}"${lastTypes.includes(String(t.id)) ? " checked" : ""}>
            ${t.section ? `${esc(t.section)} › ` : ""}${esc(typeLabel(t.activity, t.age_groups, t.required_tags))} <span class="fine-inline">${spotsLabel(t.default_capacity || defaultsFor(r, t.activity).capacity, t.block_minutes)}</span></label>`).join("")}
        </fieldset>
        <button class="btn wide-btn" type="submit" id="add-btn" disabled>Select days first</button>`
        : `<p class="muted">Add this round's sessions (step 2) first. Then select days here and schedule them.</p>`}
      </form>
      <form method="post" action="/admin/rounds/${r.id}/unlock-days" class="unlock-days">
        <input type="hidden" name="dates" class="sel-dates">
        <p class="label-like">Selected days: open to all athletes</p>
        <div class="unlock-btns">
          <button class="btn-ghost" type="submit" name="mode" value="unlock">🔓 Unlock</button>
          <button class="btn-ghost" type="submit" name="mode" value="lock">Lock again</button>
        </div>
        <p class="fine">Open spots on these days unlock for every athlete, past the limits. ${esc(unlockText(r.unlock_hours))}</p>
      </form>
    </aside>`;
}

function builderPage({ user, flash, round, types, sessions, last = {}, season, seasons = [], readonly, schedule }) {
  L = SC.labels(schedule); ACTS = SC.activitiesFor(schedule, { activeOnly: true }); SID = schedule && schedule.id;
  GROUPS = SC.groupsFor(schedule); PRESETS_SC = SC.presetsFor(schedule); BTAGS = (schedule && schedule.tags) || [];
  DEPTH = SC.depthOf(schedule); TYPES = types || []; RESTRICT = SC.restricts(schedule);
  if (!RESTRICT) BTAGS = [];
  const r = round;
  const total = sessions.length;
  const taken = sessions.reduce((n, s) => n + s.taken, 0);
  return page({
    title: r.name, tab: "rounds", user, flash, xwide: true, readonly,
    body: `<a class="back" href="${season ? `/admin/seasons/${season.id}` : "/admin/rounds"}">${season ? esc(season.name) : "All rounds"}</a>
  <section class="panel">
    <div class="athlete-head">
      <div><h1>${esc(r.is_main ? (schedule && schedule.name) || r.name : r.name)}</h1><p class="muted tight">${esc(niceRange(r.starts_on, r.ends_on))}. ${total} ${esc(L.slot.many.toLowerCase())} scheduled, ${taken} spots claimed. <a href="#settings">${esc(L.middle.one)} settings</a></p></div>
      <div class="head-actions">${statusPill(r)}
        <form method="post" action="/admin/rounds/${r.id}/publish" ${r.published_at ? `onsubmit="return confirm('Hide this round? Their reservations are kept.')"` : ""}>
          <button class="${r.published_at ? "btn-ghost" : "btn-small"}" type="submit">${r.published_at ? "Hide" : `Publish ${esc(L.middle.one.toLowerCase())}`}</button></form></div>
    </div>
    ${readonly ? `<p class="rule">Part of a completed season: read-only and hidden from people. <a href="/admin/reports?round=${r.id}">Run reports for this round</a>.</p>`
      : r.published_at ? "" : `<p class="rule">Draft: nobody can see this ${esc(L.middle.one.toLowerCase())} yet. Set up times and ${esc(L.activity.many.toLowerCase())}, put them on the calendar, then publish.</p>`}
  </section>

  ${!SC.usesCalendar(schedule) ? `<p class="rule">This board picks from a list (no calendar). Add and edit its ${esc(L.slot.many.toLowerCase())} on the board page. This page holds the rest of its settings.</p>` : `
  <div class="setup" id="setup">${timesPanel(r)}${readonly ? `<fieldset disabled class="plain">${sessionsPanel(r, types)}</fieldset>` : sessionsPanel(r, types)}</div>

  <div class="builder">
    <section class="panel cal-panel">
      <h2>Calendar</h2>
      <p class="fine">Click days to select them. Click a scheduled session to see its roster. Numbers show spots claimed out of spots available.</p>
      ${grid(r, sessions)}
    </section>
    ${readonly ? `<aside class="panel add-panel keep-visible"><h2>Read-only</h2><p class="muted">This Claim Board is archived. Reopen it to make changes.</p></aside>` : schedulePanel(r, types, last)}
  </div>`}

  <section class="panel" id="limits">
    <h2>Limits per ${esc(L.participant.one.toLowerCase())}</h2>
    ${limitsForm(r, { readonly, activities: SC.activitiesFor(schedule), listOnly: !SC.usesCalendar(schedule) })}
  </section>

  <section class="panel" id="who"${r.signup_mode === "public" ? "" : " hidden"}>
    <h2>Share</h2>
    ${r.signup_mode === "public" ? shareBox(r) : ""}
  </section>

  <section class="panel" id="settings">
    <h2>${esc(L.middle.one)} settings</h2>
    <form method="post" action="/admin/rounds/${r.id}/settings" class="grid-form keep"><fieldset class="plain grid-form full"${readonly ? " disabled" : ""}>
      <div><label>Name<input name="name" required value="${esc(r.name)}"></label></div>
      <div class="pair"><div><label>First day<input type="date" name="starts_on" required value="${esc(r.starts_on)}"></label></div>
        <div><label>Last day<input type="date" name="ends_on" required value="${esc(r.ends_on)}"></label></div></div>
      <div><label>Booking opens<input type="datetime-local" name="booking_opens_at" value="${inputParts(r.booking_opens_at).local}"></label>
        <span class="fine">Blank opens booking as soon as the round is published.</span></div>

      <div><label>Cancellation deadline (hours before)<input type="number" min="0" max="336" name="cancel_hours" value="${r.cancel_hours}"></label></div>
      <div class="full"><label>Location<input name="location" value="${esc(r.location)}" list="locations"></label>
        <datalist id="locations">${((schedule && schedule.locations) || []).map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
        <label class="check"><input type="checkbox" name="apply_location" value="1"> Also change it on sessions already scheduled</label></div>
      ${readonly ? "" : `<div class="full"><button class="btn" type="submit">Save round</button></div>`}
    </fieldset></form>
    <form method="post" action="/admin/rounds/${r.id}/delete" class="inline-end" onsubmit="return confirm('Delete ${esc(r.name)} and everything in it?')">
      <button class="btn-ghost danger" type="submit">Delete round</button>
      <span class="fine">Only possible while no one has reserved.</span>
    </form>
  </section>

  <script>
  (function () {
    var sel = new Set(), copyFrom = null;
    var $ = function (q) { return document.querySelector(q); };
    var days = document.querySelectorAll(".day[data-date]");
    function labelFor(d) { return document.querySelector('.day[data-date="' + d + '"]').dataset.label; }
    function typeCount() { return document.querySelectorAll('input[name="types"]:checked').length; }
    function refresh() {
      var list = Array.from(sel).sort();
      document.querySelectorAll(".sel-dates").forEach(function (i) { i.value = list.join(","); });
      days.forEach(function (el) {
        var on = sel.has(el.dataset.date);
        el.classList.toggle("selected", on); el.setAttribute("aria-pressed", on);
        el.classList.toggle("source", el.dataset.date === copyFrom);
      });
      var n = list.length, s = n === 1 ? "" : "s";
      if ($("#sel-label")) {
        $("#sel-label").textContent = n ? (n <= 4 ? list.map(labelFor).join("; ") : n + " days selected") : "Click days on the calendar.";
        $("#sel-clear").hidden = !n;
        var total = n * typeCount();
        $("#add-btn").disabled = !total;
        $("#add-btn").textContent = !n ? "Select days first" : !typeCount() ? "Check sessions to schedule" :
          "Schedule " + total + " session" + (total === 1 ? "" : "s");
      }
      $("#paste-btn").disabled = !n;
      $("#paste-btn").textContent = "Paste to " + n + " day" + s;
    }
    function toggle(el) {
      var d = el.dataset.date;
      if (d === copyFrom) return;
      sel.has(d) ? sel.delete(d) : sel.add(d);
      refresh();
    }
    days.forEach(function (el) {
      el.addEventListener("click", function (e) { if (!e.target.closest("a,button,form")) toggle(el); });
      el.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); toggle(el); } });
    });
    if ($("#sel-clear")) $("#sel-clear").addEventListener("click", function () { sel.clear(); refresh(); });
    document.querySelectorAll('input[name="types"]').forEach(function (c) { c.addEventListener("change", refresh); });
    document.querySelectorAll('input[name="slot"]').forEach(function (r) {
      r.addEventListener("change", function () { $("#custom-times").hidden = !$("#slot-custom").checked; });
    });

    document.querySelectorAll(".copy-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        copyFrom = b.dataset.copy; sel.clear();
        $("#copy-from").value = copyFrom;
        $("#copy-label").textContent = labelFor(copyFrom) + " (" + b.dataset.count + " session" + (b.dataset.count === "1" ? "" : "s") + ")";
        $("#copy-bar").hidden = false; $("#add-form").hidden = true;
        refresh();
      });
    });
    $("#copy-cancel").addEventListener("click", function () {
      copyFrom = null; sel.clear(); $("#copy-bar").hidden = true; $("#add-form").hidden = false; refresh();
    });
    document.querySelectorAll(".tchip[data-ages]").forEach(function (b) {
      b.addEventListener("click", function () {
        var want = b.dataset.ages.split(","), form = b.closest("form");
        form.querySelectorAll('input[name="ages"]').forEach(function (c) { c.checked = want.indexOf(c.value) >= 0; });
      });
    });
    var allAges = ${JSON.stringify(SC.entriesFor(schedule).filter((a) => a.all_ages).map((a) => a.name))};
    document.querySelectorAll('.type-add input[name="activity"]').forEach(function (r) {
      r.addEventListener("change", function () {
        if (allAges.indexOf(r.value) >= 0) r.closest("form").querySelectorAll('input[name="ages"]').forEach(function (c) { c.checked = true; });
      });
    });
    document.querySelectorAll('.type-add input[name="activity"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var f = r.closest("form");
        var m = ${SC.metaJson(schedule)}[r.value] || {};
        f.querySelector('select[name="block"]').value = m.default_block ? String(m.default_block) : "";
        f.querySelector('input[name="spots"]').placeholder = m.default_spots || "10";
      });
    });
    var last = ${JSON.stringify(String(last.d || ""))};
    if (last) {
      var cell = document.querySelector('.day[data-date="' + last + '"]');
      if (cell) cell.closest(".week").scrollIntoView({ block: "center" });
    }
    refresh();
  })();
  </script>${limitsScript}`,
  });
}

module.exports = { roundsPage, builderPage, defaultsTable, niceRange, shortRange, statusPill };
