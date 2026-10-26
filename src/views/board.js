// The board Setup screen on the container engine: drill down through containers, add and edit at any level,
// and see the settings in force wherever you are (set here, or inherited from above).
const { esc } = require("./layout");
const { page } = require("./admin");
const SC = require("../schedules");
const I = require("./icons");
const P = require("../locations");
const { fmtRange, inputParts, fmtDateTime } = require("../time");

const word = (sc, i, many = true) => { const L = SC.labels(sc), k = SC.levelKeys(sc)[i]; return (many ? L[k].many : L[k].one); };
const hrs = (h) => h % 24 === 0 && h ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`;
const whoText = (w) => !w || !w.mode ? "Same as above" : w.mode === "signed_in" ? "Anyone signed in" : w.mode === "list" ? "Only people on the list"
  : `Only ${[...(w.groups || []), ...(w.tags || [])].join(", ") || "certain people"}`;
const when = (t) => t ? fmtDateTime(t) : "Right away";

// What each setting is, and how to show it
function settingRows(sc, eff, own, at) {
  const src = (k) => Object.prototype.hasOwnProperty.call(own || {}, k) && own[k] !== undefined ? "Set here" : eff.from[k] === sc.name || !eff.from[k] ? "Board default" : `From ${eff.from[k]}`;
  const dated = SC.usesCalendar(sc);
  const mine = (own && own.limit != null) ? `${own.limit} per person here` : "No limit of its own";
  const all = eff.limits.length ? eff.limits.map((l) => `${l.limit} in ${l.kind === "board" ? "the board" : l.name}`).join(", ") : "None";
  return [
    ["Who can claim here", whoText(own && own.who), own && own.who ? "Set here" : eff.who.length ? `Narrowed above (${eff.who.map((w) => w.name).join(", ")})` : "Same as the board"],
    ["Per-person limit", at === "board" ? (own && own.limit != null ? `${own.limit} per person on the board` : "Unlimited") : mine, at === "board" ? "Board" : `All limits that apply: ${all}`],
    ...(dated ? [["Claiming opens", when(eff.opens_at), src("opens_at")], ["Cancel deadline", eff.cancel_hours ? `${eff.cancel_hours} hours before` : "Any time", src("cancel_hours")],
      ["Open leftover spots", eff.leftover_hours == null ? "Never" : `${hrs(eff.leftover_hours)} before`, src("leftover_hours")]] : [["Claiming opens", when(eff.opens_at), src("opens_at")]]),
    ["Waitlist", eff.waitlist ? "On" : "Off", src("waitlist")],
    ["Attendance", eff.attendance ? "Tracked" : "Not tracked", src("attendance")],
    ["Location", eff.location ? P.link(eff.location) : "None", src("location")],
  ];
}

// The form for overriding settings on a container (Same as above = clear the override)
function settingsForm(sc, node, eff) {
  const own = node.settings || {};
  const set = (k) => Object.prototype.hasOwnProperty.call(own, k) && own[k] !== undefined;
  const dated = SC.usesCalendar(sc);
  const groups = SC.groupsFor(sc), tags = sc.tags || [];
  const door = SC.claimMode(sc);
  const w = own.who || {};
  const opt = (name, val, cur, label) => `<label class="radio-row"><input type="radio" name="${name}" value="${val}"${cur === val ? " checked" : ""}> ${label}</label>`;
  const at = own.opens_at ? inputParts(own.opens_at) : null;
  const vf = node.visible_from ? inputParts(node.visible_from) : null;
  const inh = (k, text) => `<span class="fine">(above: ${text})</span>`;
  return `<form method="post" action="/admin/b/${sc.id}/nodes/${node.id}/settings" class="node-settings">
    <fieldset><legend>Who can claim here</legend>
      ${opt("who_mode", "", w.mode || "", `Same as above <span class="fine">(${esc(eff.who.length ? whoText(eff.who[eff.who.length - 1]) : "the board's setting")})</span>`)}
      ${door === "public" ? opt("who_mode", "signed_in", w.mode, "Anyone signed in") : ""}
      ${door !== "roster" ? opt("who_mode", "list", w.mode, "Only people on the list") : ""}
      ${groups.length || tags.length ? opt("who_mode", "teams", w.mode, `Only certain ${esc(SC.labels(sc).group.many.toLowerCase())} or tags`) : `<p class="fine">Add ${esc(SC.labels(sc).group.many.toLowerCase())} or tags to limit by them.</p>`}
      <div class="who-pick">${groups.map((g) => `<label class="tag-box"><input type="checkbox" name="who_groups" value="${esc(g)}"${(w.groups || []).includes(g) ? " checked" : ""}> ${esc(g)}</label>`).join("")}
        ${tags.map((t) => `<label class="tag-box"><input type="checkbox" name="who_tags" value="${esc(t)}"${(w.tags || []).includes(t) ? " checked" : ""}> 🏷 ${esc(t)}</label>`).join("")}</div>
      <p class="fine">This can only narrow who's allowed above it.</p>
    </fieldset>
    <fieldset><legend>Per-person limit here</legend>
      ${opt("limit_mode", "none", own.limit == null ? "none" : "n", "No limit of its own")}
      <label class="radio-row"><input type="radio" name="limit_mode" value="n"${own.limit != null ? " checked" : ""}> Up to <input type="number" name="limit_n" min="1" max="99" value="${own.limit ?? 2}" class="spots-in" onfocus="this.form.limit_mode[1].checked=true"> per person in ${esc(node.name)}</label>
      <p class="fine">Limits above it still apply too.</p>
    </fieldset>
    <fieldset><legend>Claiming opens</legend>
      ${opt("opens", "", set("opens_at") ? (own.opens_at ? "at" : "now") : "", `Same as above ${inh("opens_at", esc(when(eff.opens_at)))}`)}
      ${opt("opens", "now", set("opens_at") ? (own.opens_at ? "at" : "now") : "", "Right away")}
      <label class="radio-row"><input type="radio" name="opens" value="at"${at ? " checked" : ""}> At <input type="datetime-local" name="opens_at" value="${at ? `${at.date}T${at.time}` : ""}" onfocus="this.form.opens[2].checked=true"></label>
    </fieldset>
    ${dated ? `<fieldset><legend>Cancel deadline</legend>
      ${opt("cancel", "", set("cancel_hours") ? "n" : "", `Same as above ${inh("", eff.cancel_hours ? `${eff.cancel_hours} hours before` : "any time")}`)}
      <label class="radio-row"><input type="radio" name="cancel" value="n"${set("cancel_hours") ? " checked" : ""}> <input type="number" name="cancel_hours" min="0" max="336" value="${own.cancel_hours ?? 24}" class="spots-in" onfocus="this.form.cancel[1].checked=true"> hours before it starts</label>
    </fieldset>
    <fieldset><legend>Open leftover spots</legend>
      ${opt("leftover", "", set("leftover_hours") ? (own.leftover_hours == null ? "never" : "n") : "", `Same as above ${inh("", eff.leftover_hours == null ? "never" : `${hrs(eff.leftover_hours)} before`)}`)}
      ${opt("leftover", "never", set("leftover_hours") ? (own.leftover_hours == null ? "never" : "n") : "", "Never")}
      <label class="radio-row"><input type="radio" name="leftover" value="n"${set("leftover_hours") && own.leftover_hours != null ? " checked" : ""}> <input type="number" name="leftover_n" min="1" max="1440" value="${own.leftover_hours != null ? (own.leftover_hours % 24 === 0 ? own.leftover_hours / 24 : own.leftover_hours) : 1}" class="spots-in" onfocus="this.form.leftover[2].checked=true">
        <select name="leftover_unit"><option value="days"${own.leftover_hours == null || own.leftover_hours % 24 === 0 ? " selected" : ""}>days</option><option value="hours"${own.leftover_hours != null && own.leftover_hours % 24 ? " selected" : ""}>hours</option></select> before it starts</label>
    </fieldset>` : ""}
    <fieldset><legend>Waitlist</legend>
      ${opt("waitlist", "", set("waitlist") ? (own.waitlist ? "on" : "off") : "", `Same as above ${inh("", eff.waitlist ? "on" : "off")}`)}
      ${opt("waitlist", "on", set("waitlist") ? (own.waitlist ? "on" : "off") : "", "On")}${opt("waitlist", "off", set("waitlist") ? (own.waitlist ? "on" : "off") : "", "Off")}
    </fieldset>
    <fieldset><legend>Attendance</legend>
      ${opt("attendance", "", set("attendance") ? (own.attendance ? "on" : "off") : "", `Same as above ${inh("", eff.attendance ? "tracked" : "not tracked")}`)}
      ${opt("attendance", "on", set("attendance") ? (own.attendance ? "on" : "off") : "", "Track")}${opt("attendance", "off", set("attendance") ? (own.attendance ? "on" : "off") : "", "Don't track")}
    </fieldset>
    <fieldset><legend>Location</legend>
      <input name="location" list="app-locations" maxlength="80" value="${esc(own.location || "")}" placeholder="${esc(eff.location ? `Same as above: ${eff.location}` : "e.g. Turn Two Athletics")}">
      <p class="fine">Leave empty to use the location from above.</p>
    </fieldset>
    <fieldset><legend>Visible from</legend>
      ${opt("visible", "", vf ? "at" : "", "Always (once the board is published)")}
      <label class="radio-row"><input type="radio" name="visible" value="at"${vf ? " checked" : ""}> Hidden until <input type="datetime-local" name="visible_from" value="${vf ? `${vf.date}T${vf.time}` : ""}" onfocus="this.form.visible[1].checked=true"></label>
    </fieldset>
    <div class="q-actions"><button class="btn-small" type="submit">Save</button><button type="button" class="btn-ghost" onclick="this.closest('dialog').close()">Cancel</button></div>
  </form>`;
}

function itemRowE(sc, it) {
  const dated = SC.usesCalendar(sc);
  const st = it.starts_at ? inputParts(it.starts_at) : null, en = it.ends_at ? inputParts(it.ends_at) : null;
  const meta = [it.starts_at ? fmtRange(it.starts_at, it.ends_at) : "", `${it.capacity} spot${it.capacity === 1 ? "" : "s"}`, it.location ? `📍 ${it.location}` : ""].filter(Boolean);
  const f = `it-${it.id}`;
  return `<li class="irow">
    <div class="ir-view"><div class="ir-main"><b>${esc(it.title)}</b><span class="ir-meta">${meta.map(esc).join(" · ")}</span></div>
      <div class="ir-side"><span class="ir-claimed">${it.claimed ? `${it.claimed} claimed` : "No claims yet"}${it.waitlisted ? ` · ${it.waitlisted} waiting` : ""}</span>
        <button type="button" class="link-dark ir-edit-btn" onclick="this.closest('.irow').classList.add('editing')">Edit</button></div></div>
    <div class="ir-edit">
      <form id="${f}" method="post" action="/admin/b/${sc.id}/items/${it.id}"></form>
      <div class="ir-fields">
        <label class="mini">Name<input form="${f}" name="title" value="${esc(it.title)}" maxlength="80" required class="ir-title" size="${Math.max(12, it.title.length + 2)}"></label>
        ${dated ? `<label class="mini">Date<input form="${f}" type="date" name="date" value="${st ? st.date : ""}"></label>
          <label class="mini">Start<input form="${f}" type="time" name="start_time" value="${st ? st.time : ""}"></label>
          <label class="mini">End<input form="${f}" type="time" name="end_time" value="${en ? en.time : ""}"></label>` : ""}
        <label class="mini">Spots<input form="${f}" type="number" name="capacity" min="1" max="500" value="${it.capacity}" class="spots-in"></label>
        <label class="mini">Location<input form="${f}" name="location" value="${esc(it.location || "")}" list="app-locations" maxlength="80" class="ir-loc" placeholder="Optional"></label>
      </div>
      <div class="ir-edit-actions">
        <form method="post" action="/admin/b/${sc.id}/items/${it.id}/delete" onsubmit="return confirm('Remove ${esc(it.title.replace(/'/g, ""))}?')"><button class="link-dark danger-link" type="submit">Remove</button></form>
        <span class="spacer"></span>
        <button type="button" class="btn-ghost" onclick="this.closest('.irow').classList.remove('editing'); document.getElementById('${f}').reset();">Cancel</button>
        <button class="btn-small" type="submit" form="${f}">Save</button>
      </div>
    </div></li>`;
}

function boardSetupPage({ user, flash, sc, chain, kids, list, eff, totals, coaches = [] }) {
  const L = SC.labels(sc);
  const depth = SC.depthOf(sc);
  const here = chain[chain.length - 1] || null;            // the container we're in (null = the board itself)
  const level = chain.length;                              // 0 = board
  const showsItems = level === depth - 1;
  const childWord = showsItems ? L.slot : { one: word(sc, level, false), many: word(sc, level) };
  const dated = SC.usesCalendar(sc);
  const url = (n) => `/admin/setup?s=${sc.id}${n ? `&n=${n}` : ""}`;
  const parent = here ? here.id : "";
  const locked = !!sc.archived_at;
  const published = !!sc.published_at;
  // header
  const status = locked ? `<span class="pill">Archived</span>` : published ? `<span class="pill ok">Published</span>` : `<span class="pill warn">Draft</span>`;
  const pubForm = locked ? "" : `<form method="post" action="/admin/b/${sc.id}/publish" onsubmit="return confirm(${esc(JSON.stringify(published ? `Unpublish ${sc.name}? People won't see it until you publish again. Claims are kept.` : `Publish ${sc.name}? People who can claim will be able to see it.`))})">
      <input type="hidden" name="return_to" value="${url(parent)}"><button class="${published ? "btn-ghost" : "btn-small"} btn-lg" type="submit">${published ? "Unpublish" : "Publish board"}</button></form>`;
  const path = [`<a href="${url()}">${esc(sc.name)}</a>`, ...chain.map((n, i) => i === chain.length - 1 ? `<span aria-current="page">${esc(n.name)}</span>` : `<a href="${url(n.id)}">${esc(n.name)}</a>`)];
  // left: what's inside this level
  const addContainer = locked ? "" : `<form method="post" action="/admin/b/${sc.id}/nodes" class="item-add2">
      <input type="hidden" name="parent_id" value="${parent}"><span class="ia-title">Add ${esc(SC.an(childWord.one.toLowerCase()))}</span>
      <label class="mini ia-name">Name<input name="name" required maxlength="60" placeholder="e.g. ${esc(level === 0 && depth >= 3 ? "Round 1" : depth === 2 ? "Concessions" : "Hitting 12U–18U")}" class="ir-title"></label>
      <button class="btn-small" type="submit">Add ${esc(childWord.one.toLowerCase())}</button></form>`;
  const addItem = locked ? "" : `<form method="post" action="/admin/b/${sc.id}/items" class="item-add2">
      <input type="hidden" name="node_id" value="${parent}"><span class="ia-title">Add ${esc(SC.an(L.slot.one.toLowerCase()))}</span>
      <label class="mini ia-name">Name<input name="title" required maxlength="80" placeholder="e.g. ${dated ? "Mon 6:00 PM" : "Bring a case of water"}" class="ir-title"></label>
      ${dated ? `<label class="mini">Date<input type="date" name="date"></label><label class="mini">Start<input type="time" name="start_time"></label><label class="mini">End<input type="time" name="end_time"></label>` : ""}
      <label class="mini">Spots<input type="number" name="capacity" min="1" max="500" required placeholder="e.g. 4" class="spots-in"></label>
      <label class="mini"><span>Location <span class="opt">(optional)</span></span><input name="location" list="app-locations" maxlength="80" placeholder="e.g. Pavilion" class="ir-loc"></label>
      <button class="btn-small" type="submit">Add ${esc(L.slot.one.toLowerCase())}</button></form>`;
  const badge = (n) => { const s = n.settings || {}, b = [];
    if (s.who && s.who.mode) b.push(whoText(s.who)); if (s.limit != null) b.push(`${s.limit} per person`);
    if (n.visible_from) b.push(`Hidden until ${fmtDateTime(n.visible_from)}`); if (s.opens_at) b.push(`Opens ${fmtDateTime(s.opens_at)}`);
    if (s.attendance === true) b.push("Attendance"); if (s.waitlist === true) b.push("Waitlist");
    return b.map((x) => `<span class="nbadge">${esc(x)}</span>`).join(""); };
  const nextWord = level + 1 < depth - 1 ? word(sc, level + 1) : L.slot.many;
  const containerList = kids && kids.length ? `<ul class="node-list">${kids.map((n) => `<li class="node-card">
      <a class="nc-main" href="${url(n.id)}"><b>${esc(n.name)}</b>
        <span class="fine">${level + 1 < depth - 1 ? `${n.containers} ${esc(nextWord.toLowerCase())} · ` : ""}${n.items} ${esc(L.slot.many.toLowerCase())} · ${n.spots} spots${n.claimed ? ` · ${n.claimed} claimed` : ""}</span>
        <span class="nbadges">${badge(n)}</span></a>
      <a class="btn-ghost" href="${url(n.id)}">Open ›</a></li>`).join("")}</ul>`
    : `<p class="muted small items-empty">No ${esc(childWord.many.toLowerCase())} yet. Add one above.</p>`;
  const itemList = list && list.length ? `<ul class="ilist">${list.map((it) => itemRowE(sc, it)).join("")}</ul>` : `<p class="muted small items-empty">Nothing added yet. Your ${esc(L.slot.many.toLowerCase())} will show here.</p>`;
  // right: settings in force here
  const rowsHtml = (rows) => `<dl class="rc-list">${rows.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}<span class="src">${esc(s)}</span></dd></div>`).join("")}</dl>`;
  const settingsCard = here
    ? `<section class="panel side-card"><div class="card-head"><span class="ss-ico">${I.gear()}</span><h2>Settings for ${esc(here.name)}</h2>
        ${locked ? "" : `<button type="button" class="btn-ghost" onclick="document.getElementById('node-set').showModal()">${I.pencil()} Edit</button>`}</div>
        ${rowsHtml(settingRows(sc, eff, here.settings || {}, "node"))}
        ${here.visible_from ? `<p class="fine">Hidden from people until ${esc(fmtDateTime(here.visible_from))}.</p>` : ""}</section>
      <dialog class="edit-dlg" id="node-set"><div class="dlg-head"><h2>Settings for ${esc(here.name)}</h2><button type="button" class="dlg-x" onclick="this.closest('dialog').close()">×</button></div>
        <div class="dlg-body">${settingsForm(sc, here, require("../engine").effectiveAt(sc, chain.slice(0, -1)))}</div></dialog>`
    : `<section class="panel side-card"><div class="card-head"><span class="ss-ico">${I.gear()}</span><h2>Settings</h2><a class="btn-ghost" href="/admin/setup/schedule?s=${sc.id}">${I.gear()} Manage</a></div>
        ${rowsHtml(settingRows(sc, eff, sc.settings || {}, "board"))}
        <p class="fine">Board-wide defaults. Any ${esc(depth > 1 ? word(sc, 0, false).toLowerCase() : "level")} can change them for what's inside it.</p></section>`;
  const peopleCard = `<section class="panel side-card"><div class="card-head"><span class="ss-ico">${I.userCheck()}</span><h2>${esc(L.group.many)}, tags &amp; ${esc(L.participant.many.toLowerCase())}</h2>
      <a class="btn-ghost" href="/admin/members?s=${sc.id}">${I.gear()} Manage</a></div>
    <dl class="rc-list"><div><dt>${esc(L.group.many)}</dt><dd>${esc(SC.groupsFor(sc).join(", ") || "None")}</dd></div><div><dt>Tags</dt><dd>${esc((sc.tags || []).join(", ") || "None")}</dd></div>
      <div><dt>${esc(L.participant.many)}</dt><dd>${sc.member_count || 0}</dd></div></dl></section>`;
  return page({
    title: `${sc.name} Setup`, tab: "setup", user, flash, xwide: true,
    body: `<a class="back" href="/admin/settings">← All ${esc(require("../config").LABELS.schedules.toLowerCase())}</a>
    <section class="board-head settings-head">
      <div class="bh-main"><div class="bh-title"><h1>${esc(sc.name)} <span class="h-sub">Setup</span></h1>${status}</div>
        <div class="meta-line"><span class="meta">${totals.items} ${esc(L.slot.many.toLowerCase())} · ${totals.spots} spots${totals.claimed ? ` · ${totals.claimed} claimed` : ""}</span>
          ${sc.event_location ? `<span class="meta">${I.pin()} <b>${P.link(sc.event_location)}</b></span>` : ""}</div>
        ${sc.description ? `<p class="board-desc">${esc(sc.description)}</p>` : ""}</div>
      <div class="bh-actions">${pubForm}</div>
    </section>
    ${depth > 1 ? `<nav class="drill" aria-label="Where you are in the board">${path.join(`<span class="sep">›</span>`)}</nav>` : ""}
    ${P.datalist()}
    <div class="board-cols"><div class="bc-left">
      <section class="panel bc-main">
        <div class="bc-head"><h2>${here ? `${esc(here.name)}: ` : ""}${esc(childWord.many)}</h2>
          ${here && !locked ? `<details class="node-more"><summary class="btn-ghost">⋯</summary><div class="node-menu">
            <form method="post" action="/admin/b/${sc.id}/nodes/${here.id}" class="rename-f"><input name="name" value="${esc(here.name)}" maxlength="60" required aria-label="Name"><button class="btn-small" type="submit">Rename</button></form>
            <form method="post" action="/admin/b/${sc.id}/nodes/${here.id}/delete" onsubmit="return confirm('Remove ${esc(here.name.replace(/'/g, ""))} and everything inside it?')"><button class="link-dark danger-link" type="submit">Remove ${esc(here.name)}</button></form></div></details>` : ""}</div>
        ${showsItems ? addItem + `<h3 class="ilist-head">Your ${esc(L.slot.many.toLowerCase())} <span class="fine-inline">(${(list || []).length})</span></h3>` + itemList
          : addContainer + `<h3 class="ilist-head">Your ${esc(childWord.many.toLowerCase())} <span class="fine-inline">(${(kids || []).length})</span></h3>` + containerList}
      </section>
    </div>
    <aside class="bc-side">${settingsCard}${here ? "" : peopleCard}</aside></div>
    <script>
      // Times need a date: Start/End stay off until the date is filled in
      document.querySelectorAll(".item-add2, .ir-fields").forEach(function (box) {
        var dateEl = box.querySelector('input[name=date]'); if (!dateEl) return;
        var times = box.querySelectorAll('input[name=start_time], input[name=end_time]');
        function sync() {
          var has = !!dateEl.value;
          times.forEach(function (t) { t.disabled = !has; if (!has) t.value = ""; t.title = has ? "" : "Pick a date first"; t.placeholder = has ? "" : "Pick a date first"; });
        }
        dateEl.addEventListener("input", sync); dateEl.addEventListener("change", sync); sync();
      });
      document.querySelectorAll(".node-settings").forEach(function (f) {
        function sync() { var t = f.querySelector('input[name=who_mode][value=teams]'); var p = f.querySelector('.who-pick'); if (p) p.hidden = !(t && t.checked); }
        f.addEventListener("change", sync); sync();
      });
    </script>`,
  });
}

// Settings page: the board-wide defaults (Limits, Timing, Question), each Edit -> Cancel · Save
function boardDefaultsSections(sc) {
  const s = sc.settings || {}, q = sc.question || {};
  const dated = SC.usesCalendar(sc);
  const eff = require("../engine").effectiveAt(sc, []);
  const at = s.opens_at ? inputParts(s.opens_at) : null;
  const rows = (list) => `<dl class="ss-rows">${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const radio = (name, val, cur, label) => `<label class="radio-row"><input type="radio" name="${name}" value="${val}"${cur === val ? " checked" : ""}> ${label}</label>`;
  const sec = (id, icon, title, sub, view, inner) => `<section class="ss" id="rg-${id}">
      <div class="ss-head"><span class="ss-ico">${icon}</span><div class="ss-titles"><h3>${title}</h3><p class="fine">${sub}</p></div>
        <button type="button" class="btn-ghost ss-edit">${I.pencil()} Edit</button></div>
      <div class="ss-view">${view}</div>
      <form method="post" action="/admin/b/${sc.id}/defaults" class="ss-form rc-form rules-fields node-settings" hidden><input type="hidden" name="q" value="${id}">${inner}
        <div class="q-actions"><button class="btn-small" type="submit">Save</button><button type="button" class="btn-ghost ss-cancel">Cancel</button></div></form></section>`;
  const lh = eff.leftover_hours;
  return sec("limits", I.users(), "Limits", "Board-wide. Any level can add its own limit for what's inside it.",
      rows([["Per person on the board", s.limit != null ? `Up to ${s.limit}` : "Unlimited"], ...(dated ? [["Open leftover spots", lh == null ? "Never" : `${hrs(lh)} before`]] : []), ["Waitlist", eff.waitlist ? "On" : "Off"]]),
      `<fieldset><legend>Per person on the whole board</legend>${radio("limit_mode", "none", s.limit == null ? "none" : "n", "Unlimited")}
        <label class="radio-row"><input type="radio" name="limit_mode" value="n"${s.limit != null ? " checked" : ""}> Up to <input type="number" name="limit_n" min="1" max="99" value="${s.limit ?? 4}" class="spots-in" onfocus="this.form.limit_mode[1].checked=true"> per person</label></fieldset>
      ${dated ? `<fieldset><legend>Open leftover spots</legend><p class="fine">Spots still open this close to the start can be claimed past the limits, and don't count toward them.</p>
        ${radio("leftover", "never", lh == null ? "never" : "n", "Never (limits always apply)")}
        <label class="radio-row"><input type="radio" name="leftover" value="n"${lh != null ? " checked" : ""}> <input type="number" name="leftover_n" min="1" max="1440" value="${lh != null ? (lh % 24 === 0 ? lh / 24 : lh) : 1}" class="spots-in" onfocus="this.form.leftover[1].checked=true">
          <select name="leftover_unit"><option value="days"${lh == null || lh % 24 === 0 ? " selected" : ""}>days</option><option value="hours"${lh != null && lh % 24 ? " selected" : ""}>hours</option></select> before it starts</label></fieldset>` : ""}
      <fieldset><legend>Waitlist</legend>${radio("waitlist", "off", eff.waitlist ? "on" : "off", "Off: full means full")}${radio("waitlist", "on", eff.waitlist ? "on" : "off", "On: people can line up when something fills")}</fieldset>`)
    + sec("timing", I.calendar(), "Timing", "Board-wide. Any level can change these for what's inside it.",
      rows([["Claiming opens", when(eff.opens_at)], ...(dated ? [["Cancel deadline", eff.cancel_hours ? `${eff.cancel_hours} hours before` : "Any time"]] : [])]),
      `<fieldset><legend>Claiming opens</legend>${radio("opens", "now", at ? "at" : "now", "Right away (once published)")}
        <label class="radio-row"><input type="radio" name="opens" value="at"${at ? " checked" : ""}> At <input type="datetime-local" name="opens_at" value="${at ? `${at.date}T${at.time}` : ""}" onfocus="this.form.opens[1].checked=true"></label></fieldset>
      ${dated ? `<fieldset><legend>Cancel deadline</legend><label class="radio-row"><input type="number" name="cancel_hours" min="0" max="336" value="${eff.cancel_hours ?? 24}" class="spots-in"> hours before it starts (0 = any time)</label>
        <p class="fine">People can cancel their spot in the app until then. You can always remove someone yourself.</p></fieldset>` : ""}`)
    + sec("question", I.check(), "Question", "Asked when people claim anything on this board.",
      rows([["Question", q.label ? `"${esc(q.label)}"${q.required ? " · required" : ""}${q.public === false ? " · private" : " · shown to others"}` : "None"]]),
      `<fieldset><legend>Ask a question when they claim</legend>
        <label class="radio-row"><input type="checkbox" name="ask" value="1"${q.label ? " checked" : ""}> Ask a question</label>
        <input name="label" maxlength="80" value="${esc(q.label || "")}" placeholder="e.g. What will you bring? or T-shirt size?">
        <label class="radio-row"><input type="checkbox" name="required" value="1"${q.required ? " checked" : ""}> Required</label>
        <label class="radio-row"><input type="checkbox" name="public" value="1"${q.public !== false ? " checked" : ""}> Show answers to others, next to their name</label></fieldset>`);
}

module.exports = { boardSetupPage, boardDefaultsSections };
