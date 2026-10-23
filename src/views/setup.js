const { esc } = require("./layout");
const { page } = require("./admin");
const { colorFor } = require("../config");
const { fmtDateTime } = require("../time");
const { typeLabel, defaultsFor } = require("../rounds");
const { niceRange, shortRange, statusPill } = require("./rounds");
const { blockSelect, spotsLabel, limitsForm, limitsScript, waitlistSelect, modeForm, shareBox, onlyFor, attendanceSelect } = require("./partials");
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
      <p class="fine for-hint">Who can claim this? Leave everything unchecked for everyone.${formId ? " Click the item's Save to keep the change." : ""}</p>
      ${groups.length ? `<div class="for-row"><span class="fine">${esc(SC.labels(sc).group.many)}</span>${groups.map((g) => `<label class="tag-box${chosenGroups.includes(g) ? " on" : ""}"><input type="checkbox" name="only_groups" value="${esc(g)}"${f}${chosenGroups.includes(g) ? " checked" : ""}> ${esc(g)}</label>`).join("")}</div>` : ""}
      ${tags.length ? `<div class="for-row"><span class="fine">Tags</span>${tags.map((t) => `<label class="tag-box${chosenTags.includes(t) ? " on" : ""}"><input type="checkbox" name="only_tags" value="${esc(t)}"${f}${chosenTags.includes(t) ? " checked" : ""}> ${esc(t)}</label>`).join("")}</div>` : ""}
      <div class="for-actions">
        <button type="button" class="btn-small" data-for="done">Done</button>
        <button type="button" class="btn-ghost" data-for="cancel">Cancel</button>
      </div>
    </div></details>`;
}

// One small script per page for every "Who" dropdown: live label, Done/Cancel, click-outside, Esc
const FOR_PICK_JS = `<script>
(function () {
  function boxes(d) { return d.querySelectorAll('input[type=checkbox]'); }
  function label(d) {
    var on = [].filter.call(boxes(d), function (c) { return c.checked; }).map(function (c) { return c.value; });
    d.querySelector('summary').textContent = on.length ? 'Only for ' + on.join(', ') : 'Everyone';
    [].forEach.call(boxes(d), function (c) { c.closest('.tag-box').classList.toggle('on', c.checked); });
  }
  document.querySelectorAll('details.for-pick').forEach(function (d) {
    d.addEventListener('toggle', function () { if (d.open) d._saved = [].map.call(boxes(d), function (c) { return c.checked; }); });
    d.addEventListener('change', function () { label(d); });
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-for]'); if (!b) return;
      if (b.dataset.for === 'cancel' && d._saved) [].forEach.call(boxes(d), function (c, i) { c.checked = d._saved[i]; });
      label(d); d.open = false;
    });
  });
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.for-pick[open]').forEach(function (d) { if (!d.contains(e.target)) { label(d); d.open = false; } });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('details.for-pick[open]').forEach(function (d) { label(d); d.open = false; });
  });
})();
</script>`;

// One claimable item: name, optional date/time (dated boards), spots, location, who, claimed
function itemRow(it, r, locked, L) {
  const { inputParts, fmtRange } = require("../time");
  const dated = SC.usesCalendar(CUR);
  const limited = SC.restricts(CUR) && (SC.groupsFor(CUR).length || (CUR.tags || []).length);
  const f = `it-${it.id}`, st = it.starts_at ? inputParts(it.starts_at) : null, en = it.ends_at ? inputParts(it.ends_at) : null;
  const who = [...(it.only_groups || []), ...(it.only_tags || [])];
  const meta = [it.starts_at ? fmtRange(it.starts_at, it.ends_at) : "", `${it.capacity} spot${it.capacity === 1 ? "" : "s"}`,
    it.location ? `📍 ${it.location}` : "", who.length ? `Only for ${who.join(", ")}` : "",
    (it.attendance ?? it.p_attendance ?? CUR.track_attendance) ? "✓ attendance" : ""].filter(Boolean);
  const claimed = `<a class="ir-claimed" href="/admin/sessions/${it.id}" title="See who claimed it">${it.claimed ? `${it.claimed} claimed` : "No claims yet"}${it.waitlisted ? ` · ${it.waitlisted} waiting` : ""}</a>`;
  return `<li class="irow" data-item="${it.id}">
    <div class="ir-view">
      <div class="ir-main"><b>${esc(it.title || "")}</b><span class="ir-meta">${meta.map(esc).join(" · ")}</span></div>
      <div class="ir-side">${claimed}${locked ? "" : `<button type="button" class="link-dark ir-edit-btn" onclick="this.closest('.irow').classList.add('editing')">Edit</button>`}</div>
    </div>
    ${locked ? "" : `<div class="ir-edit">
      <form id="${f}" method="post" action="/admin/rounds/${r.id}/items/${it.id}">${back(`items-${r.id}`)}${dated ? `<input type="hidden" name="when_shown" value="1">` : ""}</form>
      <div class="ir-fields">
        <label class="mini">Name<input form="${f}" name="title" value="${esc(it.title || "")}" maxlength="80" required class="ir-title" size="${Math.max(12, (it.title || "").length + 2)}" oninput="this.size=Math.max(12,this.value.length+2)"></label>
        ${dated ? `<label class="mini">Date<input form="${f}" type="date" name="date" value="${st ? st.date : ""}"></label>
          <label class="mini">Start<input form="${f}" type="time" name="start_time" value="${st ? st.time : ""}"></label>
          <label class="mini">End<input form="${f}" type="time" name="end_time" value="${en ? en.time : ""}"></label>` : ""}
        <label class="mini">Spots<input form="${f}" type="number" name="capacity" min="1" max="500" value="${it.capacity}" class="spots-in"></label>
        <label class="mini">Location<input form="${f}" name="location" value="${esc(it.location || "")}" list="app-locations" maxlength="80" class="ir-loc" size="${Math.max(10, (it.location || "").length + 2)}" oninput="this.size=Math.max(10,this.value.length+2)" placeholder="Optional"></label>
        ${limited ? `<div class="mini">Who${forPicker(CUR, it.only_groups || [], it.only_tags || [], f)}</div>` : ""}
        ${SC.depthOf(CUR) === 1 ? `<label class="mini">Attendance${attendanceSelect(it.attendance ?? null, !!CUR.track_attendance, `form="${f}"`)}</label>` : ""}
      </div>
      <div class="ir-edit-actions">
        <form method="post" action="/admin/rounds/${r.id}/items/${it.id}/delete" onsubmit="return confirm('Remove ${esc((it.title || "this").replace(/'/g, ""))}?')">${back(`items-${r.id}`)}<button class="link-dark danger-link" type="submit">Remove</button></form>
        <span class="spacer"></span>
        <button type="button" class="btn-ghost" onclick="var row=this.closest('.irow'); row.classList.remove('editing'); document.getElementById('${f}').reset(); row.querySelectorAll('[form=${f}]').forEach(function(el){ el.value = el.defaultValue; });">Cancel</button>
        <button class="btn-small" type="submit" form="${f}">Save</button>
      </div>
    </div>`}
  </li>`;
}

function itemAdd(r, programId, L, placeholder) {
  const dated = SC.usesCalendar(CUR);
  const limited = SC.restricts(CUR) && (SC.groupsFor(CUR).length || (CUR.tags || []).length);
  return `<form method="post" action="/admin/rounds/${r.id}/items" class="item-add2">${back(`items-${r.id}`)}
    <span class="ia-title">Add ${esc(SC.an(L.slot.one))}</span>
    <input type="hidden" name="program_id" value="${programId}">${dated ? `<input type="hidden" name="when_shown" value="1">` : ""}
    <label class="mini ia-name">Name<input name="title" required maxlength="80" placeholder="${esc(placeholder)}" class="ir-title"></label>
    ${dated ? `<label class="mini">Date<input type="date" name="date"></label>
      <label class="mini">Start<input type="time" name="start_time"></label>
      <label class="mini">End<input type="time" name="end_time"></label>` : ""}
    <label class="mini">Spots<input type="number" name="capacity" min="1" max="500" required placeholder="e.g. 4" class="spots-in"></label>
    <label class="mini"><span>Location <span class="opt">(optional)</span></span><input name="location" list="app-locations" maxlength="80" placeholder="e.g. Pavilion" class="ir-loc"></label>
    ${limited ? `<div class="mini">Who${forPicker(CUR)}</div>` : ""}
    <button class="btn-small" type="submit">Add ${esc(L.slot.one.toLowerCase())}</button>
  </form>`;
}

// 2-level boards: each area with its items inside, then "Add area"
function areasPanel(r, locked, L) {
  const areas = r.types || [];
  return `<div class="areas" id="items-${r.id}">${require("../locations").datalist()}
    ${locked ? "" : `<form method="post" action="/admin/rounds/${r.id}/areas" class="area-add">
      <span class="ia-title">Add ${esc(SC.an(L.activity.one))}</span>${back(`items-${r.id}`)}
      <input name="name" required maxlength="40" placeholder="e.g. ${SC.usesCalendar(CUR) ? "Concessions" : "Desserts"}" aria-label="New ${esc(L.activity.one.toLowerCase())}">
      <button class="btn-small" type="submit">Add ${esc(L.activity.one.toLowerCase())}</button></form>`}
    ${areas.length ? `<h3 class="ilist-head">Your ${esc(L.activity.many.toLowerCase())} <span class="fine-inline">(${areas.length})</span></h3>` : ""}
    ${areas.length ? areas.map((t) => {
      const its = (r.items || []).filter((i) => i.program_id === t.id);
      return `<section class="area">
        <div class="area-head">
          ${locked ? `<h3>${esc(t.activity)}</h3>` : `<form method="post" action="/admin/rounds/${r.id}/areas/${t.id}" class="area-name">${back(`items-${r.id}`)}
            <input name="name" value="${esc(t.activity)}" maxlength="40" required aria-label="${esc(L.activity.one)} name"><button class="btn-ghost" type="submit">Rename</button>
            <label class="att-lab">Attendance ${attendanceSelect(t.attendance ?? null, !!CUR.track_attendance, `onchange="this.form.submit()" class="att-sel"`)}</label></form>`}
          <span class="fine">${its.length} ${esc((its.length === 1 ? L.slot.one : L.slot.many).toLowerCase())} · ${its.reduce((n, i) => n + i.claimed, 0)}/${its.reduce((n, i) => n + i.capacity, 0)} claimed</span>
          ${locked || its.length ? "" : `<form method="post" action="/admin/rounds/${r.id}/areas/${t.id}/delete" onsubmit="return confirm('Remove ${esc(t.activity)}?')">${back(`items-${r.id}`)}<button class="x" type="submit" aria-label="Remove ${esc(t.activity)}">×</button></form>`}
        </div>
        ${locked ? "" : itemAdd(r, t.id, L, SC.usesCalendar(CUR) ? `e.g. Grill` : `e.g. Brownies`)}
        ${its.length ? `<ul class="ilist">${its.map((it) => itemRow(it, r, locked, L)).join("")}</ul>` : `<p class="muted small items-empty">No ${esc(L.slot.many.toLowerCase())} yet.</p>`}
      </section>`;
    }).join("") : `<p class="muted small items-empty">No ${esc(L.activity.many.toLowerCase())} yet. Add one above, then add its ${esc(L.slot.many.toLowerCase())}.</p>`}

  </div>`;
}

function itemsPanel(r, locked, L) {
  // the built-in round of a 1-level board: one simple list, same rows as areas use
  if (r.is_main && SC.depthOf(CUR) === 1) {
    const its = r.items || [];
    const prog = (r.types || [])[0];
    return `<div class="items-panel" id="items-${r.id}">${require("../locations").datalist()}
      ${locked || !prog ? "" : itemAdd(r, prog.id, L, "e.g. Bring a case of water")}
      <h3 class="ilist-head">Your ${esc(L.slot.many.toLowerCase())} <span class="fine-inline">(${its.length})${its.length ? ` · ${its.reduce((n, i) => n + (i.capacity || 0), 0)} spots${its.some((i) => i.claimed) ? ` · ${its.reduce((n, i) => n + (i.claimed || 0), 0)} claimed` : ""}` : ""}</span></h3>
      ${its.length ? `<ul class="ilist">${its.map((it) => itemRow(it, r, locked, L)).join("")}</ul>`
        : `<p class="muted small items-empty">Nothing added yet. Your ${esc(L.slot.many.toLowerCase())} will show here.</p>`}
    </div>`;
  }
  const depth = SC.depthOf(CUR);
  const listOnly = !SC.usesCalendar(CUR);
  const limited = SC.restricts(CUR) && (SC.groupsFor(CUR).length || (CUR.tags || []).length);
  const items = r.items || [];
  const types = (r.types || []).filter((t) => depth > 1 || true);
  const pick = depth > 1 && types.length > 1;
  const anchor = `items-${r.id}`;
  return `<div class="items-panel" id="${anchor}">
    <p class="label-like">${listOnly ? esc(L.slot.many) : `${esc(L.slot.many)} without a date`}</p>
    ${locked || (depth > 1 && !types.length) ? (depth > 1 && !types.length && !locked ? `<p class="fine">Add ${esc(SC.an(L.activity.one))} first, then its ${esc(L.slot.many.toLowerCase())}.</p>` : "") : `<form method="post" action="/admin/rounds/${r.id}/items" class="quick-type item-add">${back(anchor)}
      ${pick ? `<select name="program_id" required aria-label="${esc(L.activity.one)}"><option value="">${esc(L.activity.one)}…</option>${types.map((t) => `<option value="${t.id}">${t.section ? `${esc(t.section)} › ` : ""}${esc(typeLabel(t.activity, t.age_groups, t.required_tags))}</option>`).join("")}</select>`
        : `<input type="hidden" name="program_id" value="${(types[0] || {}).id || ""}">`}
      <input name="title" required maxlength="80" placeholder="e.g. Bring a case of water" aria-label="Name" class="title-in">
      <input type="number" name="capacity" min="1" max="500" required placeholder="Spots" aria-label="Spots" class="spots-in">
      <input name="location" list="app-locations" maxlength="80" placeholder="Location (optional)" aria-label="Location" class="coach-in">${require("../locations").datalist()}
      ${limited ? forPicker(CUR) : ""}
      <button class="btn-small" type="submit">Add ${esc(L.slot.one.toLowerCase())}</button>
    </form>`}
    ${items.length ? `<table class="types compact items"><thead><tr>${depth > 1 ? `<th>${esc(L.activity.one)}</th>` : ""}<th>${esc(L.slot.one)}</th><th>Spots</th>${limited ? "<th>Who</th>" : ""}<th>Claimed</th><th></th></tr></thead>
      <tbody>${items.map((it) => `<tr>
        ${depth > 1 ? `<td>${swatch(it.activity)}${it.section ? `${esc(it.section)} › ` : ""}${esc(typeLabel(it.activity, it.age_groups, it.required_tags))}</td>` : ""}
        <td>${locked ? esc(it.title || "") : `<input form="it-${it.id}" name="title" value="${esc(it.title || "")}" maxlength="80" aria-label="Name" required>`}${it.location ? `<div class="fine">📍 ${esc(it.location)}</div>` : ""}</td>
        <td>${locked ? it.capacity : `<input form="it-${it.id}" type="number" name="capacity" min="1" max="500" value="${it.capacity}" aria-label="Spots" class="spots-in">`}</td>
        ${limited ? `<td>${locked ? esc([...(it.only_groups || []), ...(it.only_tags || [])].join(", ") || "Everyone") : forPicker(CUR, it.only_groups || [], it.only_tags || [], `it-${it.id}`)}</td>` : ""}
        <td><a href="/admin/sessions/${it.id}">${it.claimed} of ${it.capacity}${it.waitlisted ? `, ${it.waitlisted} waiting` : ""}</a></td>
        <td>${locked ? "" : `<div class="row-actions">
          <form id="it-${it.id}" method="post" action="/admin/rounds/${r.id}/items/${it.id}">${back(anchor)}<button class="btn-ghost" type="submit">Save</button></form>
          <form method="post" action="/admin/rounds/${r.id}/items/${it.id}/delete" onsubmit="return confirm('Remove this ${esc(L.slot.one.toLowerCase())}?')">${back(anchor)}<button class="x" type="submit" aria-label="Remove">×</button></form></div>`}</td>
      </tr>`).join("")}</tbody></table>` : `<p class="muted small items-empty">Nothing added yet. Your ${esc(L.slot.many.toLowerCase())} will show here.</p>`}
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
          ${r.types.length ? `<table class="types compact"><thead><tr><th>${esc(L.activity.one)}</th><th>Spots</th>${listOnly ? "" : "<th>Split into</th>"}<th>Waitlist</th><th>Attendance</th>${SC.restricts(CUR) && (CUR.tags || []).length ? "<th>Only for</th>" : ""}<th>Coach</th><th>On calendar</th><th></th></tr></thead>
            <tbody>${r.types.map((t) => `<tr>
              <td>${swatch(t.activity)}<strong>${t.section ? `${esc(t.section)} › ` : ""}${esc(typeLabel(t.activity, t.age_groups, t.required_tags))}</strong></td>
              ${locked ? `<td>${t.default_capacity || defaultsFor(r, t.activity).capacity}</td>${listOnly ? "" : `<td>${t.block_minutes ? `${t.block_minutes} min` : "Whole"}</td>`}<td>${t.waitlist == null ? "Round default" : t.waitlist ? "On" : "Off"}</td><td>${(t.attendance ?? CUR.track_attendance) ? "Track" : "Don't track"}</td>${SC.restricts(CUR) && (CUR.tags || []).length ? `<td>${esc((t.required_tags || []).join(", ") || "Everyone")}</td>` : ""}<td>${esc(t.default_coach || "")}</td><td>${t.scheduled}</td><td></td>` : `
              <td><input form="st-${t.id}" type="number" name="spots" min="1" max="200" required value="${t.default_capacity || defaultsFor(r, t.activity).capacity}" aria-label="Spots"></td>
              ${listOnly ? "" : `<td>${blockSelect("block", t.block_minutes, `form="st-${t.id}" aria-label="Split into blocks"`)}</td>`}
              <td>${waitlistSelect(t.waitlist, r, `form="st-${t.id}" aria-label="Waitlist"`)}</td>
              <td>${attendanceSelect(t.attendance ?? null, !!CUR.track_attendance, `form="st-${t.id}" aria-label="Attendance"`)}</td>
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

// When claiming opens, and (for dated boards) how late a spot can be canceled
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
    ${dated ? `<div class="tf-row"><span class="label-like">Cancel deadline</span>
      <input type="number" name="cancel_hours" min="0" max="336" value="${r.cancel_hours ?? 24}" class="spots-in" aria-label="Hours before"> hours before it starts</div>
    <p class="fine">After this, people can't cancel a spot in the app (use 0 for any time). ${esc(L.slot.many)} without a date can always be canceled.</p>` : ""}
    ${locked ? "" : `<button class="btn-ghost" type="submit">Save timing</button>`}
    </fieldset></form>`;
}

// One-line summary of a board's rules, e.g. "Unlimited per person · No waitlist · Opens right away"
function rulesSummary(r, L, acts) {
  const { limitFor } = require("../rounds");
  const { fmtDateTime } = require("../time");
  const depth = SC.depthOf(CUR);
  const parts = [];
  if (depth === 1) { const n = limitFor(r, acts[0]); parts.push(n == null ? "Unlimited per person" : `Up to ${n} per person`); }
  else {
    const lim = acts.map((a) => [a, limitFor(r, a)]).filter(([, n]) => n != null);
    parts.push(lim.length ? lim.map(([a, n]) => `${a} ${n}`).join(", ") + " per person" : "No limits");
  }
  parts.push(r.waitlist ? "Waitlist on" : "No waitlist");
  parts.push(r.booking_opens_at ? `Opens ${fmtDateTime(r.booking_opens_at)}` : "Opens right away");
  if (SC.usesCalendar(CUR)) parts.push(r.cancel_hours ? `Cancel up to ${r.cancel_hours}h before` : "Cancel any time");
  return parts.join(" · ");
}

// Confirm before publishing / unpublishing a board
const publishForm = (r, name, cls = "") => {
  const msg = r.published_at
    ? `Unpublish ${name}? People won't see it or be able to claim until you publish it again. Existing claims are kept.`
    : `Publish ${name}? People who can claim will be able to see it and start claiming.`;
  return `<form method="post" action="/admin/rounds/${r.id}/publish" onsubmit="return confirm(${esc(JSON.stringify(msg))})">${back()}
    <button class="${r.published_at ? "btn-ghost" : "btn-small"} ${cls}" type="submit">${r.published_at ? "Unpublish" : "Publish board"}</button></form>`;
};

// The rules, read as a short list; Edit rules turns the card into one form with one Save
// The rule fields, shared by the board's summary card and the Rules page
function rulesParts(r, L, acts) {
  const { limitFor } = require("../rounds");
  const { fmtDateTime, inputParts } = require("../time");
  const dated = SC.usesCalendar(CUR);
  const depth = SC.depthOf(CUR);
  const lim = acts.map((a) => [a, limitFor(r, a)]);
  const perPerson = depth === 1 ? (lim[0] && lim[0][1] != null ? `Up to ${lim[0][1]}` : "Unlimited")
    : lim.filter(([, n]) => n != null).map(([a, n]) => `${a}: ${n}`).join(", ") || "Unlimited";
  const at = r.booking_opens_at ? inputParts(r.booking_opens_at) : null;
  const rows = [
    ["Per person", perPerson],
    ["Waitlist", r.waitlist ? "On" : "Off"],
    ["Claiming opens", r.booking_opens_at ? fmtDateTime(r.booking_opens_at) : "Right away"],
    ...(dated ? [["Cancel deadline", r.cancel_hours ? `${r.cancel_hours} hours before` : "Any time"]] : []),
    ...(dated ? [["Open leftover spots", r.unlock_hours == null ? "Never" : r.unlock_hours % 24 === 0 ? `${r.unlock_hours / 24} day${r.unlock_hours === 24 ? "" : "s"} before` : `${r.unlock_hours} hour${r.unlock_hours === 1 ? "" : "s"} before`]] : []),
    ["Question", r.ask_note ? `"${r.note_label || "Your answer"}"${[r.note_required ? "required" : "", r.note_public !== false ? "shown to others" : "private"].filter(Boolean).map((x) => ` · ${x}`).join("")}` : "None"],
  ];
  const slots = L.slot.many.toLowerCase();
  return {
    rows,
    per: `      <fieldset><legend>How many can each person claim?</legend>
        ${lim.map(([a, n], k) => `<div class="rc-limit"><input type="hidden" name="lname_${k}" value="${esc(a)}">
          ${depth > 1 ? `<span class="rc-act">${esc(a)}</span>` : ""}
          <input type="number" name="lim_${k}" min="1" max="50" value="${n ?? 2}" class="spots-in"${n == null ? " disabled" : ""} aria-label="Limit${depth > 1 ? ` for ${esc(a)}` : ""}">
          <label class="radio-row"><input type="checkbox" name="unl_${k}" value="1"${n == null ? " checked" : ""} onchange="this.closest('.rc-limit').querySelector('input[type=number]').disabled=this.checked"> Unlimited</label></div>`).join("")}
      </fieldset>`,
    wait: `      <fieldset><legend>Waitlist</legend>
        <label class="radio-row"><input type="checkbox" name="waitlist" value="1"${r.waitlist ? " checked" : ""}> When ${esc(slots)} fill up, let people join a waitlist</label>
      </fieldset>`,
    opens: `      <fieldset><legend>When claiming opens</legend>
        <label class="radio-row"><input type="radio" name="opens" value="now"${at ? "" : " checked"}> Right away (once published)</label>
        <label class="radio-row"><input type="radio" name="opens" value="at"${at ? " checked" : ""}> At <input type="datetime-local" name="booking_opens_at" value="${at ? `${at.date}T${at.time}` : ""}" onfocus="this.form.opens[1].checked=true"></label>
      </fieldset>`,
    cancel: `      ${dated ? `<fieldset><legend>Cancel deadline</legend>
        <label class="radio-row"><input type="number" name="cancel_hours" min="0" max="336" value="${r.cancel_hours ?? 24}" class="spots-in"> hours before it starts (0 = any time)</label>
        <p class="fine">People can cancel their spot in the app until then. After that, they'd need to ask you, and you can always remove someone yourself.</p>
      </fieldset>` : ""}`,
    leftover: `      ${dated ? `<fieldset><legend>Open leftover spots to everyone</legend>
        <p class="fine">Only matters with a per-person limit. Spots still open this close to the start can be claimed by anyone, even people who've reached their limit, and they don't count toward it. Shown with 🔓.</p>
        <label class="radio-row"><input type="radio" name="leftover" value="never"${r.unlock_hours == null ? " checked" : ""}> Never (limits always apply)</label>
        <label class="radio-row"><input type="radio" name="leftover" value="before"${r.unlock_hours == null ? "" : " checked"}>
          <input type="number" name="leftover_n" min="1" max="1440" value="${r.unlock_hours == null ? 1 : r.unlock_hours % 24 === 0 ? r.unlock_hours / 24 : r.unlock_hours}" class="spots-in" onfocus="this.form.leftover[1].checked=true">
          <select name="leftover_unit" onfocus="this.form.leftover[1].checked=true"><option value="days"${r.unlock_hours != null && r.unlock_hours % 24 === 0 ? " selected" : ""}>days</option><option value="hours"${r.unlock_hours != null && r.unlock_hours % 24 !== 0 ? " selected" : ""}>hours</option></select>
          before it starts</label>
        <p class="ex">e.g. ${esc(SC.depthOf(CUR) === 2 ? "1 Concessions shift per person, but any shift still open 1 day before is up for grabs" : "1 snack slot per family, but any still open 2 days before can be taken by anyone")}</p>
      </fieldset>` : ""}`,
    question: `      <fieldset><legend>Ask a question when they claim</legend>
        <label class="radio-row"><input type="checkbox" name="ask_note" value="1"${r.ask_note ? " checked" : ""} onchange="var b=this.closest('fieldset').querySelector('.rc-note'); b.hidden=!this.checked; b.querySelector('input[name=note_label]').required=this.checked;"> Ask a question</label>
        <div class="rc-note"${r.ask_note ? "" : " hidden"}>
          <input name="note_label" maxlength="80" value="${esc(r.note_label || "")}" placeholder="e.g. What will you bring? or T-shirt size?" aria-label="Question"${r.ask_note ? " required" : ""}>
          <label class="radio-row"><input type="checkbox" name="note_required" value="1"${r.note_required ? " checked" : ""}> Required</label>
          <label class="radio-row"><input type="checkbox" name="note_public" value="1"${r.note_public !== false ? " checked" : ""}> Show answers to others, next to their name</label>
          <p class="fine">Turn that off for private answers (like allergies). You always see the answers on the claimed list and in reports.</p>
        </div>
      </fieldset>`,
  };
}

// Board screen: a short summary of the rules, with Manage
function rulesCard(r, locked, L, acts) {
  const { rows } = rulesParts(r, L, acts);
  const I = require("./icons");
  return `<section class="panel side-card" id="rules-${r.id}">
    <div class="card-head"><span class="ss-ico">${I.gear()}</span><h2>Rules</h2>
      ${locked ? "" : `<a class="btn-ghost" href="/admin/setup/rules?s=${CUR.id}">${I.gear()} Manage</a>`}</div>
    <dl class="rc-list">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
  </section>`;
}

// Limits, Timing, Question as setup sections (Edit → Cancel · Save), for the Settings page
function rulesSections(sc, main, L, acts, ret) {
  const I = require("./icons");
  if (!main) return [["limits", I.users(), "Limits", `Set in each ${esc(L.middle.one.toLowerCase())} for now: open a ${esc(L.middle.one.toLowerCase())} on the board and use its <b>Limits</b>.`],
    ["timing", I.calendar(), "Timing", `Set in each ${esc(L.middle.one.toLowerCase())} for now.`]].map(([id, icon, title, sub]) =>
    `<section class="ss" id="rg-${id}"><div class="ss-head"><span class="ss-ico">${icon}</span><div class="ss-titles"><h3>${title}</h3><p class="fine">${sub}</p></div></div></section>`).join("");
  CUR = sc;
  const P = rulesParts(main, L, acts);
  const row = (k) => P.rows.find((r) => r[0] === k);
  const rows = (keys) => `<dl class="ss-rows">${keys.map(row).filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  const sec = (id, icon, title, sub, keys, inner) => `<section class="ss" id="rg-${id}">
      <div class="ss-head"><span class="ss-ico">${icon}</span><div class="ss-titles"><h3>${title}</h3><p class="fine">${sub}</p></div>
        <button type="button" class="btn-ghost ss-edit">${I.pencil()} Edit</button></div>
      <div class="ss-view">${rows(keys)}</div>
      <form method="post" action="/admin/rounds/${main.id}/rules" class="ss-form rc-form rules-fields" hidden>
        <input type="hidden" name="q" value="${id}"><input type="hidden" name="return_to" value="${ret}">${inner}
        <div class="q-actions"><button class="btn-small" type="submit">Save</button><button type="button" class="btn-ghost ss-cancel">Cancel</button></div>
      </form></section>`;
  return sec("limits", I.users(), "Limits", "How much each person can claim, and what happens when things fill up.", ["Per person", "Open leftover spots", "Waitlist"], P.per + P.leftover + P.wait)
    + sec("timing", I.calendar(), "Timing", "When claiming opens, and how late people can cancel.", ["Claiming opens", "Cancel deadline"], P.opens + P.cancel)
    + sec("question", I.check(), "Question", "Something to ask people when they claim.", ["Question"], P.question);
}

// Publish & share: a short checklist before publishing; the link and QR once it's live
function publishCard(r, locked, L) {
  const mode = SC.claimMode(CUR);
  const n = r.scheduled || 0;
  const setupLink = `<a href="/admin/setup/schedule?s=${CUR.id}">change</a>`;
  const who = { public: "Anyone with the link", family: "Anyone signed in", roster: `Only ${L.participant.many.toLowerCase()} you add` }[mode];
  if (r.published_at) return `<section class="panel side-card">
    <div class="bc-head"><h2>Publish &amp; share</h2><span class="pill ok">Live</span></div>
    <p class="fine">${mode === "public" ? "Share this link or QR code. Anyone with it can claim." : mode === "family" ? "People sign in and find it under <b>My Claims</b>." : `Your ${esc(L.participant.many.toLowerCase())} find it under <b>My Claims</b>.`}</p>
    ${mode === "public" ? shareBox(r) : ""}
    ${locked ? "" : publishForm(r, CUR.name)}
  </section>`;
  const check = (ok, text) => `<li class="${ok ? "ok" : ""}"><span class="ck">${ok ? "✓" : ""}</span><span>${text}</span></li>`;
  return `<section class="panel side-card">
    <div class="bc-head"><h2>Ready to publish?</h2><span class="pill warn">Draft</span></div>
    <ul class="checklist">
      ${check(n > 0, n > 0 ? `${n} ${esc((n === 1 ? L.slot.one : L.slot.many).toLowerCase())} added` : `Add at least one ${esc(L.slot.one.toLowerCase())}`)}
      ${check(true, `Who can claim: <b>${esc(who)}</b> (${setupLink})`)}
      ${check(true, `Rules: ${r.waitlist || r.booking_opens_at || r.ask_note ? "set (see below)" : "the defaults are fine (see below)"}`)}
    </ul>
    <p class="fine">${mode === "public" ? "Once published, you'll get a share link and QR code here." : "Once published, people will see it under My Claims."}</p>
    ${locked ? "" : publishForm(r, CUR.name, "full-btn")}
  </section>`;
}

// 1-2 level boards: the work column
function boardBlock(r, locked, L, acts) {
  const depth = SC.depthOf(CUR);
  return `<section class="panel bc-main" id="round-${r.id}">
      <div class="bc-head"><h2>${depth === 2 ? `${esc(L.activity.many)} &amp; ${esc(L.slot.many.toLowerCase())}` : esc(L.slot.many)}</h2></div>
      ${depth === 2 ? areasPanel(r, locked, L) : itemsPanel(r, locked, L)}
    </section>`;
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

// Levels and what they're called (the board's structure), used by the board's Edit window
function levelsTable(sc, hasItems) {
  const L = SC.labels(sc), depth = SC.depthOf(sc);
  return `${hasItems ? `<p class="fine"><b>${depth} level${depth === 1 ? "" : "s"}</b>, set once a board has things on it. To restructure, copy the board without its calendar.</p><input type="hidden" name="depth" value="${depth}">`
      : `<label class="field-l">Levels<select name="depth">
          ${[1, 2, 3, 4].map((n) => `<option value="${n}"${depth === n ? " selected" : ""}>${n} level${n === 1 ? "" : "s"}</option>`).join("")}</select>
          <span class="fine">You can change this while the board is empty. The last level is always what people claim.</span></label>`}
    <div class="table-wrap"><table class="levels">
      <thead><tr><th>Level</th><th>Called (one)</th><th>Called (many)</th></tr></thead>
      <tbody>${SC.levelKeys(sc).map((k, i, all) => `<tr>
        <td><strong>Level ${i + 1}</strong>${i === all.length - 1 ? ` <span class="pill ok claim-pill">Claimed</span>` : ""}<div class="fine">e.g. ${esc(LEVEL_INFO[k](i === all.length - 1)[1])}</div></td>
        <td><input name="${k}_one" value="${esc(L[k].one)}" maxlength="24" required aria-label="Level ${i + 1} singular"></td>
        <td><input name="${k}_many" value="${esc(L[k].many)}" maxlength="24" required aria-label="Level ${i + 1} plural"></td></tr>`).join("")}
        ${["participant", "group"].map((k) => `<tr class="people-row">
        <td><strong>${k === "participant" ? "People" : "People's groups"}</strong><div class="fine">e.g. ${esc(LEVEL_INFO[k]()[1])}</div></td>
        <td><input name="${k}_one" value="${esc(L[k].one)}" maxlength="24" required></td>
        <td><input name="${k}_many" value="${esc(L[k].many)}" maxlength="24" required></td></tr>`).join("")}
      </tbody></table></div>`;
}

// Plain-language descriptions of "Who can claim", used by the wizard and Settings
function claimHelp(L) {
  const org = require("../config").LABELS.org_name || "your organization";
  const people = (L ? L.participant.many : "people").toLowerCase();
  return {
    public: `Anyone with the link or QR code can claim. No sign-in: they just type a name and email. <i>Best for public events and donations.</i>`,
    family: `Anyone who signs in with an email can see it and claim, <strong>not limited to ${esc(org)}</strong>, and you don't keep a list. <i>Best when any help is welcome.</i>`,
    roster: `Only the ${esc(people)} on this board's list can see it and claim. Parents see just their own kids. <i>Best for training or team-only events.</i>`,
  };
}

// "Sat, Feb 7, 2026" or "Feb 7–8, 2026"
function eventDates(sc) {
  if (!sc.event_date) return "";
  const f = (d, o) => new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", o);
  if (!sc.event_end) return f(sc.event_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return `${f(sc.event_date, { month: "short", day: "numeric" })} – ${f(sc.event_end, { month: "short", day: "numeric", year: "numeric" })}`;
}

function scheduleSettingsPage({ user, flash, sc, counts, part = "structure", main = null }) {
  const L = SC.labels(sc);
  const I = require("./icons");
  const P = require("../locations");
  const tab = { structure: "schedule", more: "schedule-more", archive: "schedule-archive" }[part] || "schedule";
  if (part === "archive") return page({ title: `Settings · ${sc.name}`, tab, user, flash, body: `<section class="panel"><h1>Archive or delete</h1>
      <p class="muted tight">When ${esc(sc.name)} is over, archive it: it's hidden from people and read-only, and its reports stay. Delete is only for empty boards.</p></section>
<section class="panel"><h1>Archive or delete</h1>
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
    </section>` });
  const radio = (name, value, cur, title, text, ex) => `<label class="mode-opt"><input type="radio" name="${name}" value="${value}" data-label="${esc(title.replace(/<[^>]+>/g, ""))}"${cur === value ? " checked" : ""}><span><b>${title}</b>${text ? `<span class="fine">${text}</span>` : ""}${ex ? `<span class="ex">e.g. ${esc(ex)}</span>` : ""}</span></label>`;
  const claim = SC.claimMode(sc), pick = SC.pickMode(sc), depth = SC.depthOf(sc);
  const EX = require("../examples").forDepth(depth);
  const CLAIM = { public: "Anyone with the link", family: "Anyone signed in", roster: "Only people I add" };
  const VIEWS = { list: "No dates: a list", dlist: "Dates and times: list view", calendar: "Dates and times: calendar", both: "Dates and times: list & calendar" };
  const WHO = { initial: "First name + initial", full: "Full names", off: "Hidden" };
  const action = `/admin/setup/schedules/${sc.id}?s=${sc.id}`;
  const rows = (list) => `<dl class="ss-rows">${list.filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  // One setup section: icon, title, description, Edit at top right; Edit swaps the answers for its form
  const sec = (id, icon, title, sub, view, form) => `<section class="ss" id="ss-${id}">
      <div class="ss-head"><span class="ss-ico">${icon}</span><div class="ss-titles"><h3>${title}</h3><p class="fine">${sub}</p></div>
        <button type="button" class="btn-ghost ss-edit">${I.pencil()} Edit</button></div>
      <div class="ss-view">${view}</div>
      <form method="post" action="${action}" class="ss-form" hidden><input type="hidden" name="q" value="${id}">${form}
        <div class="q-actions"><button class="btn-small" type="submit">Save</button><button type="button" class="btn-ghost ss-cancel">Cancel</button></div></form>
    </section>`;
  const levelLine = SC.levelKeys(sc).map((k) => esc(L[k].many)).join(" › ");
  const groups = SC.groupsFor(sc), tags = sc.tags || [];
  const chips = (list) => list.map((x) => `<span class="chip-s">${esc(x)}</span>`).join("");
  const published = !!counts.published;
  // inline editors in the header (name, event date, location)
  const inline = (id, view, form) => `<span class="inl" id="inl-${id}"><span class="inl-view">${view}<button type="button" class="pencil" aria-label="Edit">${I.pencil()}</button></span>
      <form method="post" action="${action}" class="inl-form" hidden><input type="hidden" name="q" value="${id}">${form}
        <button type="button" class="btn-ghost inl-cancel">Cancel</button><button class="btn-small" type="submit">Save</button></form></span>`;
  const dates = eventDates(sc);
  return page({
    title: `${sc.name} Settings`, tab, user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">${esc(sc.name)} <span class="h-sub">Settings</span></h1>
      <a class="btn-ghost" href="/admin/setup?s=${sc.id}">← Back to ${esc(sc.name)}</a></div>
    <div class="settings-one">
    <section class="panel setup-panel" id="setup-form">

      ${sec("who", I.users(), "Who can claim", "Who can see this board and claim from it, and whether some things are limited.",
        rows([["Who can claim", `${CLAIM[claim]}<div class="fine">${{ public: "No sign-in needed; anyone with the link.", family: `Anyone who signs in, not just ${esc(require("../config").LABELS.org_name || "your organization")}.`, roster: `Only the ${esc(L.participant.many.toLowerCase())} on this board's list.` }[claim]}</div>`], claim === "public" ? null : [`Limit some ${esc((depth > 1 ? L.activity.many : L.slot.many).toLowerCase())}`, sc.restricted ? `Yes, by ${esc(L.group.one.toLowerCase())} or tag` : "No"]]),
        `<div class="opt-row three">
          ${radio("claim", "public", claim, "Anyone with the link", claimHelp(L).public, EX.claim.public)}
          ${radio("claim", "family", claim, "Anyone signed in", claimHelp(L).family, EX.claim.family)}
          ${radio("claim", "roster", claim, "Only people I add", claimHelp(L).roster, EX.claim.roster)}
        </div>
        <div class="sub-q" data-restrict${claim === "public" ? " hidden" : ""}>
          <p class="q-label">Limit some ${esc((depth > 1 ? L.activity.many : L.slot.many).toLowerCase())} to certain people?</p>
          <div class="opt-row">
            ${radio("restrict", "no", sc.restricted ? "yes" : "no", "No", "Anyone who can claim can claim anything.")}
            ${radio("restrict", "yes", sc.restricted ? "yes" : "no", `Yes, by ${esc(L.group.one.toLowerCase())} or tag`, "", EX.restrict)}
          </div>
        </div>
        <p class="fine" data-public-note${claim === "public" ? "" : " hidden"}>With "Anyone with the link" people are anonymous, so there's nothing to limit by ${esc(L.group.one.toLowerCase())} or tag.</p>`)}

      ${sec("see", I.calendar(), "How people see it", "Whether things have dates, which views people get, and what they see of who's going.",
        rows([["Dates &amp; views", VIEWS[pick] || VIEWS.calendar], ["Who's going", WHO[sc.family_names || "initial"]]]),
        `<p class="q-label">Do things have dates and times?</p>
        <div class="opt-row">
          ${radio("dated", "no", pick === "list" ? "no" : "yes", "No", "It's all one day or there are no set times. People pick from a list.", EX.datedNo)}
          ${radio("dated", "yes", pick === "list" ? "no" : "yes", "Yes", `${esc(L.slot.many)} have dates and times.`, EX.datedYes)}
        </div>
        <div class="sub-q" data-views${pick === "list" ? " hidden" : ""}>
          <p class="q-label">Available views</p>
          <div class="opt-row three">
            ${radio("pick", "list", pick === "dlist" ? "list" : pick, "List", "A day-by-day list with dates and times.", EX.viewList)}
            ${radio("pick", "calendar", ["calendar", "list"].includes(pick) ? "calendar" : pick, "Calendar", "People pick days on a calendar.", EX.viewCal)}
            ${radio("pick", "both", pick, "Both", "People can switch between the two.", "the calendar for planning, the list for a quick look")}
          </div>
        </div>
        <p class="q-label">Who's going</p>
        <div class="opt-row three">
          ${radio("family_names", "initial", sc.family_names || "initial", "First name + initial", "", EX.whoGoing)}
          ${radio("family_names", "full", sc.family_names || "initial", "Full names", "", EX.whoGoing.replace(/(\w+) (\w)\./g, (m, f, l) => `${f} ${({ S: "Smith", K: "Klein", P: "Peters", R: "Reed" })[l] || l + "…"}`))}
          ${radio("family_names", "off", sc.family_names || "initial", "Hidden", "Only how many spots are open", "2 of 4 spots open")}
        </div>
        <p class="fine">Emails and contact details are never shown.</p>`)}

      ${rulesSections(sc, main, L, SC.activitiesFor(sc, { activeOnly: true }), `/admin/setup/schedule?s=${sc.id}`)}
      ${sec("attendance", I.check(), "Attendance", "Whether attendance is taken, and the coaches who can take it.",
        rows([["Track attendance", sc.track_attendance ? "Yes, by default" : "No, not by default"], ["Coaches", (counts.coaches || []).length ? esc(counts.coaches.join(", ")) : "None"]]),
        `<div class="opt-row">
          ${radio("track", "off", sc.track_attendance ? "on" : "off", "No, not by default", "Turn it on for just the ones that need it.", "")}
          ${radio("track", "on", sc.track_attendance ? "on" : "off", "Yes, by default", "", EX.attendance)}
        </div>
        <p class="fine">${depth >= 2 ? `Each ${esc(L.activity.one.toLowerCase())} can change this (e.g. track Hitting, not Cage Time).` : `Each ${esc(L.slot.one.toLowerCase())} can change this.`}</p>
        <label class="field-l"><span>Coaches who can take attendance <span class="opt">(one email per line)</span></span>
          <textarea name="coaches" rows="${Math.max(2, (counts.coaches || []).length + 1)}" placeholder="e.g. coach@example.com, one per line">${esc((counts.coaches || []).join("\n"))}</textarea></label>
        <p class="fine">They sign in with their email and only see Check-in. Admins can always take attendance.</p>
        <p class="ex">e.g. ${esc(EX.coaches)}</p>`)}
    </section>


    </div>
    <script>
    (function () {
      var val = function (f, n) { var el = f.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ""; };
      function sync(f) {
        var r = f.querySelector("[data-restrict]"), pn = f.querySelector("[data-public-note]"), vq = f.querySelector("[data-views]");
        if (r) r.hidden = val(f, "claim") === "public";
        if (pn) pn.hidden = val(f, "claim") !== "public";
        if (vq) vq.hidden = val(f, "dated") !== "yes";
      }
      // sections: Edit swaps the answers for the form; Cancel puts them back
      document.querySelectorAll(".ss").forEach(function (sec) {
        var f = sec.querySelector(".ss-form"), v = sec.querySelector(".ss-view"), b = sec.querySelector(".ss-edit");
        b.addEventListener("click", function () {
          document.querySelectorAll(".ss.open .ss-cancel, .inl.open .inl-cancel").forEach(function (c) { c.click(); });
          f.hidden = false; v.hidden = true; b.hidden = true; sec.classList.add("open");
        });
        sec.querySelector(".ss-cancel").addEventListener("click", function () { f.reset(); sync(f); f.hidden = true; v.hidden = false; b.hidden = false; sec.classList.remove("open"); });
        f.addEventListener("change", function () { sync(f); });
      });
      // header: pencil edits in place
      document.querySelectorAll(".inl").forEach(function (x) {
        var f = x.querySelector(".inl-form"), v = x.querySelector(".inl-view");
        x.querySelector(".pencil").addEventListener("click", function () {
          document.querySelectorAll(".ss.open .ss-cancel, .inl.open .inl-cancel").forEach(function (c) { c.click(); });
          f.hidden = false; v.hidden = true; x.classList.add("open"); var i = f.querySelector("input:not([type=hidden])"); if (i) i.focus();
        });
        x.querySelector(".inl-cancel").addEventListener("click", function () { f.reset(); f.hidden = true; v.hidden = false; x.classList.remove("open"); });
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.querySelectorAll(".ss.open .ss-cancel, .inl.open .inl-cancel").forEach(function (c) { c.click(); }); });
      document.querySelectorAll(".turn-on").forEach(function (b) {
        b.addEventListener("click", function () { var sec = document.getElementById("ss-" + b.dataset.open); if (!sec) return;
          sec.scrollIntoView({ behavior: "smooth", block: "center" }); var e = sec.querySelector(".ss-edit"); if (e && !e.hidden) e.click(); });
      });
      var h = location.hash && document.querySelector(location.hash.replace("#q-", "#ss-"));
      if (h) { h.classList.add("just-saved"); setTimeout(function () { h.classList.remove("just-saved"); }, 1800); }
    })();
    </script>`,
  });
}

function newSchedulePage({ user, flash }) {
  const PRE = SC.PRESET_LABELS;
  const { LABELS } = require("../config");
  const levels = (l) => SC.LEVEL_KEYS[l.depth].map((k) => l[k][1]).join(" › ");
  const CHOICES = [
    ["list", "📋", "Item list", "1 level", "Donations, a potluck, team snacks", "Bring a case of water · 10 spots"],
    ["volunteer", "🗂️", "Categories & items", "2 levels", "Volunteer jobs by area, a potluck by course, donations by type", "Concessions › Grill 8–10 AM, or Desserts › Brownies"],
    ["training", "🥎", "Rounds & sessions", "3 levels", "Training with rounds, limits, and a calendar", "Round 1 › Hitting 12U–18U › Mon 6:00 PM"],
    ["event", "🏆", "Event days", "4 levels", "A multi-day event with areas and stations", "Saturday › Concessions › Grill › 8–10 AM"],
  ];
  const opt = (name, value, title, text, exKey) => `<label class="choice"><input type="radio" name="${name}" value="${value}">
    <span class="choice-body"><b>${title}</b><span>${text}</span>${exKey ? `<span class="ex" data-ex="${exKey}"></span>` : ""}</span><span class="choice-check" aria-hidden="true">✓</span></label>`;
  return page({
    title: "New", tab: "home", user, flash,
    body: `<a class="back" href="/admin/settings">All ${esc(LABELS.schedules.toLowerCase())}</a>
    <section class="panel wizard">
      <h1>Create ${esc(SC.an(LABELS.schedule))}</h1>
      <p class="muted tight">Set up your board in three simple steps. You can change everything later.</p>
      <ol class="wz-progress" aria-label="Steps">
        <li data-step="1" class="on"><span>1</span>Details</li><li data-step="2"><span>2</span>Structure</li><li data-step="3"><span>3</span>Settings</li>
      </ol>
      <form method="post" action="/admin/setup/schedules" id="wz">

        <div class="wz-step" data-step="1">
          <h2>Board details</h2>
          <p class="muted tight">Give it a name people will recognize.</p>
          <label class="field">Board name<input name="name" id="wz-name" required maxlength="60" autocomplete="off" placeholder="e.g. Winter Training 2026–27"></label>
          <div class="tip"><b>Helpful tip</b>Use a season or event name people will recognize, like "Winter Training 2026–27" or "Raptors Rumble Concessions, Sat Feb 7".</div>
        </div>

        <div class="wz-step" data-step="2" hidden>
          <h2>Structure</h2>
          <p class="muted tight">How is it organized? Pick one. The last level is what people claim.</p>
          <p class="alert" id="wz-pick-err" hidden>Pick a structure to continue.</p>
          <div class="choice-grid">${CHOICES.map(([k, icon, title, depth, use, ex]) => `<label class="choice struct">
            <input type="radio" name="preset" value="${k}" required>
            <span class="choice-icon" aria-hidden="true">${icon}</span>
            <span class="choice-body"><b>${title} <em>${depth}</em></b><span class="lv">${esc(levels(PRE[k]))}</span><span>${esc(use)}</span><span class="ex">e.g. ${esc(ex)}</span></span>
            <span class="choice-check" aria-hidden="true">✓</span></label>`).join("")}</div>
        </div>

        <div class="wz-step" data-step="3" hidden>
          <h2>Settings</h2>
          <p class="muted tight">Filled in for the structure you picked. Change any of them.</p>
          <fieldset class="q"><legend>Who can claim?</legend><div class="choice-row three">
            ${opt("claim", "public", "Anyone with the link", claimHelp().public, "claim.public")}
            ${opt("claim", "family", "Anyone signed in", claimHelp().family, "claim.family")}
            ${opt("claim", "roster", "Only people I add", claimHelp().roster.replace("this board's list", "the list you make"), "claim.roster")}</div></fieldset>
          <fieldset class="q"><legend>Limit some things to certain people?</legend><div class="choice-row">
            ${opt("restrict", "no", "No", "Anyone who can claim can claim anything.")}
            ${opt("restrict", "yes", "Yes", "By team or tag.", "restrict")}</div></fieldset>
          <fieldset class="q"><legend>Do things have dates and times?</legend><div class="choice-row">
            ${opt("dated", "no", "No", "It's all one day or there are no set times. People pick from a list.", "datedNo")}
            ${opt("dated", "yes", "Yes", "Things have dates and times.", "datedYes")}</div></fieldset>
          <fieldset class="q" id="wz-views"><legend>Available views</legend><div class="choice-row three">
            ${opt("pick", "list", "List", "A day-by-day list with dates and times. No calendar.", "viewList")}
            ${opt("pick", "calendar", "Calendar", "People pick days on a calendar.", "viewCal")}
            ${opt("pick", "both", "Both: List &amp; Calendar", "People can switch between the calendar and a day-by-day list.")}</div></fieldset>
          <div class="wz-summary" aria-live="polite"><span class="label-like">Summary</span><p id="wz-sum"></p></div>
        </div>

        <div class="wz-nav">
          <button type="button" class="btn-ghost" id="wz-back" disabled>Back</button>
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
      var EXAMPLES = ${JSON.stringify(require("../examples").BY_DEPTH)};
      var form = document.getElementById("wz"), step = 1, touched = {};
      var $ = function (sel) { return form.querySelector(sel); };
      var val = function (n) { var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ""; };
      function set(n, v) { if (touched[n]) return; var el = form.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (el) el.checked = true; }
      function defaults() { var d = D[val("preset")]; if (!d) return; set("claim", d.claim); set("restrict", d.restrict); set("dated", d.dated); if (!val("pick")) set("pick", "calendar"); refresh();
        var err = document.getElementById("wz-pick-err"); if (err) err.hidden = true; }
      function examples() {
        var d = (D[val("preset")] || {}).depth, ex = EXAMPLES[d];
        form.querySelectorAll("[data-ex]").forEach(function (el) {
          var v = ex && el.dataset.ex.split(".").reduce(function (o, k) { return o && o[k]; }, ex);
          el.textContent = v ? "e.g. " + v : ""; el.hidden = !v;
        });
      }
      function refresh() {
        examples();
        document.getElementById("wz-views").hidden = val("dated") !== "yes";
        var rq = document.querySelector('input[name="restrict"]').closest("fieldset"); rq.hidden = val("claim") === "public";
        var who = { public: "Anyone with the link", family: "Anyone signed in", roster: "Only people I add" }[val("claim")] || "";
        var when = val("dated") === "yes" ? ({ both: "dates, list & calendar", list: "dates, list view" }[val("pick")] || "dates, calendar") : "no dates (a list)";
        document.getElementById("wz-sum").innerHTML = "<b>" + (form.name.value.trim() || "Untitled").replace(/[<>&]/g, "") + "</b> · " + (NAMES[val("preset")] || "") +
          " · " + who + (val("claim") === "public" ? "" : " · " + (val("restrict") === "yes" ? "limited by group or tag" : "anyone can claim anything")) + " · " + when;
      }
      function show(n) {
        step = n;
        form.querySelectorAll(".wz-step").forEach(function (el) { el.hidden = +el.dataset.step !== n; });
        document.querySelectorAll(".wz-progress li").forEach(function (li) { li.classList.toggle("on", +li.dataset.step <= n); li.classList.toggle("now", +li.dataset.step === n); });
        document.getElementById("wz-back").disabled = n === 1;
        document.getElementById("wz-next").hidden = n === 3;
        document.getElementById("wz-create").hidden = n !== 3;
        if (n === 3) refresh();
        var f = form.querySelector('.wz-step[data-step="' + n + '"] input'); if (f && n === 1) f.focus();
      }
      document.getElementById("wz-next").addEventListener("click", function () {
        if (step === 1 && !form.name.value.trim()) { form.name.reportValidity(); return; }
        if (step === 2 && !val("preset")) { document.getElementById("wz-pick-err").hidden = false; return; }
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

// Board screen header: "<name> Setup", status, event details (edited from the board's card), Share and Publish
function boardHeader(sc, L, depth, main, rounds, locked) {
  const I = require("./icons"), P = require("../locations");
  const published = depth <= 2 ? !!(main && main.published_at) : rounds.some((r) => r.published_at);
  const status = locked ? `<span class="pill">Archived</span>` : published ? `<span class="pill ok">${depth <= 2 ? "Published" : "Live"}</span>` : `<span class="pill warn">Draft</span>`;
  const dates = eventDates(sc);
  const share = depth <= 2 && main && main.published_at && SC.claimMode(sc) === "public"
    ? `<details class="share-pop"><summary class="btn-ghost btn-lg">Share</summary><div class="share-panel">${shareBox(main)}</div></details>` : "";
  const meta = [dates ? `<span class="meta">${I.calendar()} <b>${esc(dates)}</b></span>` : "",
    sc.event_location ? `<span class="meta">${I.pin()} <b>${P.link(sc.event_location)}</b></span>` : "",
    sc.contact_name || sc.contact_info ? `<span class="meta">${I.users()} Organizer: <b>${esc([sc.contact_name, sc.contact_info].filter(Boolean).join(", "))}</b></span>` : ""].filter(Boolean);
  return `<section class="board-head settings-head">
      <div class="bh-main">
        <div class="bh-title"><h1>${esc(sc.name)} <span class="h-sub">Setup</span></h1>${status}</div>
        ${meta.length ? `<div class="meta-line">${meta.join("")}</div>` : ""}
        ${sc.description ? `<p class="board-desc">${esc(sc.description)}</p>` : ""}
        ${!locked && !meta.length && !sc.description ? `<p class="fine">Add an event date, location, description, or organizer with <b>Edit</b> on this board's card in <a href="/admin/settings">${esc(require("../config").LABELS.schedules)}</a>.</p>` : ""}
      </div>
      <div class="bh-actions">
        ${depth >= 3 && !locked ? `<a class="btn-ghost" href="/admin/import?s=${sc.id}">Import schedule</a>` : ""}
        ${share}
        ${depth <= 2 && main && !locked ? publishForm(main, sc.name, "btn-lg") : ""}
      </div>
    </section>
    ${locked ? `<p class="rule">Archived: hidden from people and read-only. Reopen it from the Claim Boards page to make changes.</p>` : ""}`;
}

// Right column: what's set, with Manage
function sideCards(sc, L, depth, main, locked, acts, counts) {
  const I = require("./icons");
  const claim = SC.claimMode(sc), pick = SC.pickMode(sc);
  const CLAIM = { public: "Anyone with the link", family: "Anyone signed in", roster: "Only people I add" };
  const VIEWS = { list: "No dates (a list)", dlist: "Dates · list view", calendar: "Dates · calendar", both: "Dates · list & calendar" };
  const manage = (href, on = true) => locked ? "" : on ? `<a class="btn-ghost" href="${href}">${I.gear()} Manage</a>` : `<span class="btn-ghost is-off" aria-disabled="true">${I.gear()} Manage</span>`;
  const rows = (list) => `<dl class="rc-list">${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  let ruleRows = [];
  if (depth <= 2 && main) {
    const R = rulesParts(main, L, acts).rows;
    const g = (k) => (R.find((r) => r[0] === k) || [])[1];
    ruleRows = [["Per person", esc(g("Per person"))], ["Waitlist", esc(g("Waitlist"))],
      ...(g("Cancel deadline") ? [["Cancel deadline", esc(g("Cancel deadline"))]] : []), ["Question", esc(g("Question"))]];
  } else ruleRows = [["Limits &amp; timing", `Set in each ${esc(L.middle.one.toLowerCase())}`]];
  const settings = `<section class="panel side-card"><div class="card-head"><span class="ss-ico">${I.gear()}</span><h2>Settings</h2>${manage(`/admin/setup/schedule?s=${sc.id}`)}</div>
    ${rows([["Who can claim", CLAIM[claim]], ["How people see it", VIEWS[pick] || VIEWS.calendar], ...ruleRows,
      ["Attendance", `${sc.track_attendance ? "Tracked" : "Not tracked"}${(counts.coaches || []).length ? ` · ${counts.coaches.length} coach${counts.coaches.length === 1 ? "" : "es"}` : ""}`]])}</section>`;
  const rules = "";
  const tagsUsed = SC.restricts(sc), peopleUsed = SC.needsPeople(sc) || (claim !== "public" && (sc.has_roster || sc.has_tag_rules));
  const used = tagsUsed || peopleUsed;
  const groups = SC.groupsFor(sc), tags = sc.tags || [];
  const people = `<section class="panel side-card${used ? "" : " not-used"}"><div class="card-head"><span class="ss-ico">${I.userCheck()}</span>
      <h2>${esc(L.group.many)}, tags &amp; ${esc(L.participant.many.toLowerCase())}</h2>${manage(`/admin/members?s=${sc.id}`, used)}</div>
    ${used ? "" : `<p class="fine off-note"><span class="pill">Not in use</span> ${claim === "public" ? "This board is open to anyone with the link, so it doesn't use teams, tags, or a list of people." : "Anyone signed in can claim and nothing is limited."}
      <a class="link-dark" href="/admin/setup/schedule?s=${sc.id}#ss-who">Turn on</a></p>`}
    ${rows([[esc(L.group.many), groups.length ? esc(groups.join(", ")) : "None"], ["Tags", tags.length ? esc(tags.join(", ")) : "None"], [esc(L.participant.many), String(sc.member_count || 0)]])}</section>`;
  return `<aside class="bc-side">${settings}${rules}${people}</aside>`;
}

// Rounds boards: their activities, right in the work column
function activitiesPanel(sc, L, locked) {
  const list = SC.activitiesFor(sc);
  const { metaFor } = require("../config");
  return `<section class="panel" id="activities">
    <div class="bc-head"><h2>${esc(L.activity.many)}</h2>${locked ? "" : `<a class="btn-ghost" href="/admin/settings/activities?s=${sc.id}">Edit details</a>`}</div>
    ${locked ? "" : `<form method="post" action="/admin/settings/activities?s=${sc.id}" class="item-add2"><input type="hidden" name="return_to" value="/admin/setup?s=${sc.id}#activities">
      <span class="ia-title">Add ${esc(SC.an(L.activity.one))}</span>
      <label class="mini ia-name">Name<input name="name" required maxlength="40" placeholder="e.g. ${esc(require("../examples").forDepth(SC.depthOf(sc)).group.split(" ")[0])}" class="ir-title"></label>
      <label class="mini">Default spots<input type="number" name="default_spots" min="1" max="500" placeholder="e.g. 12" class="spots-in"></label>
      <button class="btn-small" type="submit">Add ${esc(L.activity.one.toLowerCase())}</button></form>`}
    <h3 class="ilist-head">Your ${esc(L.activity.many.toLowerCase())} <span class="fine-inline">(${list.length})</span></h3>
    ${list.length ? `<ul class="act-list">${list.map((a) => { const m = metaFor(a, sc.id); return `<li>${swatch(a)}<b>${esc(a)}</b>
      <span class="fine">${m.default_spots ? `${m.default_spots} spots by default` : ""}${m.active === false ? " · hidden" : ""}</span></li>`; }).join("")}</ul>`
      : `<p class="muted small items-empty">None yet. Add one above, then add it to a ${esc(L.middle.one.toLowerCase())}.</p>`}
  </section>`;
}


function setupPage({ user, flash, schedule: sc, rounds, standalone, counts = {} }) {
  CUR = sc;
  const L = SC.labels(sc);
  const acts = SC.activitiesFor(sc, { activeOnly: true });
  const locked = !!sc.archived_at;
  const depth = SC.depthOf(sc);
  const main = rounds.find((r) => r.is_main);
  const sorted = rounds.filter((r) => !r.is_main).sort((x, y) => String(x.starts_on).localeCompare(String(y.starts_on)));
  return page({
    title: sc.name, tab: "setup", user, flash, xwide: true,
    body: `${boardHeader(sc, L, depth, main, sorted, locked)}
    <div class="board-cols"><div class="bc-left">
    ${depth <= 2 ? (main ? boardBlock(main, locked, L, acts) : "") : activitiesPanel(sc, L, locked) + `<section class="panel">
      <h2 class="season-title">${esc(L.middle.many)}</h2>
      <div class="rounds">${sorted.length ? sorted.map((r) => roundBlock(r, locked, L, acts)).join("") : `<p class="muted">No ${esc(L.middle.many.toLowerCase())} yet. Add the first one below.</p>`}</div>
      ${locked ? "" : newRoundForm(null, [...sorted].reverse(), true, L)}
    </section>`}
    </div>${sideCards(sc, L, depth, main, locked, acts, counts)}</div>

    ${standalone.length ? `<section class="panel">
      <details class="add-round"><summary>Standalone programs (${standalone.length})</summary>
        <p class="fine">One-off programs from before ${esc(L.middle.many.toLowerCase())}. <a href="/admin/programs">Manage them here</a>.</p>
        <ul class="plain-list">${standalone.map((p) => `<li><a href="/admin/programs/${p.id}">${esc(p.name)}</a> <span class="fine-inline">${p.archived ? "archived" : `${p.upcoming} upcoming`}</span></li>`).join("")}</ul>
      </details>
    </section>` : ""}
    ${FOR_PICK_JS}
    <script>
    (function () {
      document.querySelectorAll(".inl").forEach(function (x) {
        var f = x.querySelector(".inl-form"), v = x.querySelector(".inl-view"); if (!f) return;
        x.querySelector(".pencil").addEventListener("click", function () {
          document.querySelectorAll(".inl.open .inl-cancel").forEach(function (c) { c.click(); });
          f.hidden = false; v.hidden = true; x.classList.add("open"); var i = f.querySelector("input:not([type=hidden])"); if (i) i.focus();
        });
        x.querySelector(".inl-cancel").addEventListener("click", function () { f.reset(); f.hidden = true; v.hidden = false; x.classList.remove("open"); });
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.querySelectorAll(".inl.open .inl-cancel").forEach(function (c) { c.click(); }); });
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

module.exports = { setupPage, scheduleSettingsPage, newSchedulePage, eventDates, levelsTable };
