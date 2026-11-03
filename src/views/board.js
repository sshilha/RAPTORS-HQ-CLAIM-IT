// The board Setup screen on the container engine: drill down through containers, add and edit at any level,
// and see the settings in force wherever you are (set here, or inherited from above).
const { esc } = require("./layout");
const { page } = require("./admin");
const SC = require("../schedules");
const I = require("./icons");
const P = require("../locations");
const { inputParts, fmtDateTime, slotName } = require("../time");


// Safari/Firefox: a text box inside a radio's <label> can't be typed in (clicks go to the radio).
// Keep the radio + its words in the label and put any boxes beside it.
function unnest(html) {
  return html.replace(/<label class="radio-row">([\s\S]*?)<\/label>/g, (whole, inner) => {
    const controls = [...inner.matchAll(/<(input|select)\b/g)];
    if (controls.length < 2) return whole;
    const cut = controls[1].index;
    return `<div class="radio-row"><label class="rr">${inner.slice(0, cut)}</label>${inner.slice(cut)}</div>`;
  });
}

const word = (sc, i, many = true) => { const L = SC.labels(sc), k = SC.levelKeys(sc)[i]; return (many ? L[k].many : L[k].one); };
const hrs = (h) => h % 24 === 0 && h ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`;
const whoText = (w) => !w || !w.mode ? "Same as above" : w.mode === "signed_in" ? "Anyone with an account" : w.mode === "list" ? "Only people on the list"
  : `Only ${[...(w.groups || []), ...(w.tags || [])].join(", ") || "certain people"}`;
const when = (t) => t ? fmtDateTime(t) : "Right away";

// What each setting is, and how to show it
function settingRows(sc, eff, own, at) {
  const src = (k) => Object.prototype.hasOwnProperty.call(own || {}, k) && own[k] !== undefined ? "Set here" : eff.from[k] === sc.name || !eff.from[k] ? "Board default" : `From ${eff.from[k]}`;
  const dated = SC.usesCalendar(sc);
  const mine = (own && own.limit != null) ? `${own.limit} per person here` : "No limit of its own";
  const all = eff.limits.length ? eff.limits.map((l) => `${l.limit} in ${l.kind === "board" ? "the board" : l.name}`).join(", ") : "None";
  return [
    at === "board"
      ? ["Who can claim", { public: "Anyone with the link", family: "Anyone with an account", roster: "Only people assigned to the board" }[SC.claimMode(sc)], "The board's front door"]
      : ["Who can claim here", whoText(own && own.who), own && own.who ? "Set here" : eff.who.length ? `Narrowed above (${eff.who.map((w) => w.name).join(", ")})` : "Same as the board"],
    ["Per-person limit", at === "board" ? (own && own.limit != null ? `${own.limit} per person on the board` : "Unlimited") : mine, at === "board" ? "Board" : `All limits that apply: ${all}`],
    ...(dated ? [["Claiming opens", when(eff.opens_at), src("opens_at")], ["Cancel deadline", eff.cancel_hours ? `${eff.cancel_hours} hours before` : "Any time", src("cancel_hours")],
      ["Open leftover spots", eff.leftover_hours == null ? "Never" : `${hrs(eff.leftover_hours)} before`, src("leftover_hours")]] : [["Claiming opens", when(eff.opens_at), src("opens_at")]]),
    ["Waitlist", eff.waitlist ? "On" : "Off", src("waitlist")],
    ["Attendance", eff.attendance ? "Tracked" : "Not tracked", src("attendance")],
    ["Location", eff.location ? P.link(eff.location) : "None", src("location")],
  ];
}

// The form for overriding settings on a container (Same as above = clear the override)
function settingsForm(sc, node, eff) { return unnest(settingsFormRaw(sc, node, eff)); }
function settingsFormRaw(sc, node, eff) {
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
      ${door === "public" ? opt("who_mode", "signed_in", w.mode, "Anyone with an account") : ""}
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
    <div class="q-actions"><button class="btn-small" type="submit">Save</button><button type="button" class="btn-ghost" onclick="this.closest('form').reset(); this.closest('dialog').close()">Cancel</button></div>
  </form>`;
}

function levelChanges(n) { const st = n.settings || {}, b = [];
    if (st.who && st.who.mode) b.push(whoText(st.who)); if (st.limit != null) b.push(`limit ${st.limit} per person`);
    if (st.opens_at) b.push(`opens ${fmtDateTime(st.opens_at)}`); if (n.visible_from) b.push(`hidden until ${fmtDateTime(n.visible_from)}`);
    if (st.cancel_hours != null) b.push(`cancel deadline ${st.cancel_hours} h`); if (st.leftover_hours !== undefined) b.push(st.leftover_hours == null ? "no open leftover spots" : `leftover spots ${st.leftover_hours} h before`);
    if (st.waitlist === true) b.push("waitlist on"); if (st.waitlist === false) b.push("waitlist off");
    if (st.attendance === true) b.push("attendance on"); if (st.attendance === false) b.push("attendance off"); if (st.location) b.push(`location ${st.location}`);
    return b; }
// every level that changed a default, with its path: [{ id, path: [names], c: [changes] }]
function levelOverrides(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n])), out = [];
  const pathOf = (n) => { const p = []; let x = n, g = 0; while (x && g++ < 10) { p.unshift(x.name); x = byId.get(x.parent_id); } return p; };
  for (const n of nodes) { const c = levelChanges(n); if (c.length) out.push({ id: n.id, path: pathOf(n), c }); }
  return out.sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")));
}
function boardDefaultsSections(sc) { return unnest(boardDefaultsSectionsRaw(sc)); }
function boardDefaultsSectionsRaw(sc) {
  const s = sc.settings || {}, q = sc.question || {};
  const dated = SC.usesCalendar(sc);
  const eff = require("../engine").effectiveAt(sc, []);
  const at = s.opens_at ? inputParts(s.opens_at) : null;
  const rows = (list) => `<dl class="ss-rows">${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const radio = (name, val, cur, label) => `<label class="radio-row"><input type="radio" name="${name}" value="${val}"${cur === val ? " checked" : ""}> ${label}</label>`;
  const sec = (id, icon, title, sub, view, inner) => `<section class="ss" id="rg-${id}" data-card="${id}">
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

// Copy a board (new engine): setup + levels always; sessions (dates moved), people, coaches optional; never claims
function copyPage({ user, flash, sc, counts: c }) {
  const L = SC.labels(sc);
  const next = (() => { const m = /(\d{4})(?!.*\d{4})/.exec(sc.name); return m ? sc.name.replace(m[1], String(+m[1] + 1)) : `${sc.name} (copy)`; })();
  const suggest = c.first ? new Date(Date.parse(c.first + "T12:00:00Z") + 364 * 864e5).toISOString().slice(0, 10) : "";   // same weekday, a year later
  const firstLbl = c.first ? new Date(c.first + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }) : "";
  const S2 = require("./setup"), tile = sc.image ? `<span class="bh2-tile b-hd-tile"><img src="/img/board/${sc.id}?v=${sc.image_at ? new Date(sc.image_at).getTime() : 0}" alt=""></span>` : `<span class="bh2-tile b-hd-tile code"><b>${esc(S2.codeOf(sc))}</b></span>`;
  const has = [c.nodes ? `${c.nodes} level${c.nodes === 1 ? "" : "s"}` : "", c.items ? `${c.items} ${esc((c.items === 1 ? L.slot.one : L.slot.many).toLowerCase())}` : "",
    c.members ? `${c.members} ${esc((c.members === 1 ? L.participant.one : L.participant.many).toLowerCase())}` : "", c.coaches ? `${c.coaches} coach${c.coaches === 1 ? "" : "es"}` : ""].filter(Boolean);
  return page({ title: `Duplicate ${sc.name}`, tab: "home", user, flash, wide: true, noBack: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>All Boards</a></nav>
    <section class="bh2 cp-hd"><div class="bh2-l">${tile}
      <div><div class="bh2-t"><h1>Duplicate ${esc(sc.name)}</h1></div><span class="bh2-meta">Copies its setup into a new board. It starts unpublished, and claims never come along.</span></div></div></section>
    <nav class="bh2-tabs dash-tabs cp-gbar"><span class="cp-has"><b>${esc(sc.name)} has:</b> ${has.length ? has.join(" · ") : "nothing yet"}</span></nav>
    <section class="sub-body no-subs cp-sheet"><form method="post" action="/admin/setup/schedules/${sc.id}/copy" class="stack copy-form">
      <label>Name of the new board<input name="name" required maxlength="60" value="${esc(next)}"></label>
      <p class="q-label">What comes along</p>
      <label class="mode-opt on"><input type="checkbox" checked disabled><span><b>Setup and levels</b><span class="fine">${c.nodes} level${c.nodes === 1 ? "" : "s"} (like ${esc(L.middle.many)} › ${esc(L.activity.many)}) with all their settings: limits, who can claim, timing, attendance. Plus the question, wording, ${esc(L.group.many.toLowerCase())}, picture, type, location and organizer.</span></span></label>
      <label class="mode-opt"><input type="checkbox" name="items" value="1" id="cp-items"${c.items ? "" : " disabled"}><span><b>${esc(L.slot.many)}</b><span class="fine">${c.items} ${esc((c.items === 1 ? L.slot.one : L.slot.many).toLowerCase())} with their times and spots${c.dated ? ", moved to the new first day below" : ""}.</span></span></label>
      ${c.dated ? `<label id="cp-start" hidden>New first day<input type="date" name="start_on" value="${esc(suggest)}"><span class="fine">The first ${esc(L.slot.one.toLowerCase())} was ${esc(firstLbl)}. Every date moves by the same number of days and keeps its time. The suggested day is the same weekday, one year later.</span></label>` : ""}
      <label class="mode-opt"><input type="checkbox" name="members" value="1"${c.members ? "" : " disabled"}><span><b>People on the board</b><span class="fine">${c.members} ${esc((c.members === 1 ? L.participant.one : L.participant.many).toLowerCase())}, with their ${esc(L.group.many.toLowerCase())} and tags.</span></span></label>
      <label class="mode-opt"><input type="checkbox" name="coaches" value="1"${c.coaches ? "" : " disabled"}><span><b>Coaches</b><span class="fine">${c.coaches} coach${c.coaches === 1 ? " who takes" : "es who take"} attendance.</span></span></label>
      <p class="fine">Claims never come along. The duplicate starts unpublished, so you can check it before families see it.</p>
      <div class="q-actions cp-acts"><a class="btn-ghost" href="/admin/settings">Cancel</a><button class="sb-btn primary" type="submit">Create the duplicate</button></div>
    </form></section>
    <script>(function () { var b = document.getElementById("cp-items"), s = document.getElementById("cp-start"); if (b && s) { b.addEventListener("change", function () { s.hidden = !b.checked; }); } })();</script>` });
}

function spotPeoplePage({ head = "", user, flash, sc, it, path, people, onBoard, everyone }) {
  const q = sc.question || {};
  const conf = people.filter((p) => p.status === "confirmed"), wl = people.filter((p) => p.status === "waitlisted");
  const tags = (p) => [p.group_name, p.added_by_admin ? "Added by admin" : "", p.override ? "Override" : "", p.counts === false && !p.walk_in ? "Extra spot" : "", p.walk_in ? "Walk-in" : ""].filter(Boolean);
  const row = (p) => `<li class="sp-row"><div class="sp-who"><b>${esc(p.first_name)} ${esc(p.last_name)}</b>
      <span class="sp-tags">${tags(p).map((t) => `<span class="pill${t === "Override" ? " warn" : ""}">${esc(t)}</span>`).join("")}</span>
      ${q.label && p.note ? `<span class="fine">${esc(q.label)}: ${esc(p.note)}</span>` : ""}
      <span class="fine">${p.added_by_admin ? "Added" : "Claimed"} ${esc(require("../time").fmtDateTime(p.created_at))}${p.booked_email ? ` by ${esc(p.booked_email)}` : ""}</span></div>
    <form method="post" action="/admin/b/${sc.id}/items/${it.id}/people/${p.id}/remove" class="sp-rm" onsubmit="return confirm('Remove ${esc(`${p.first_name} ${p.last_name}`.replace(/'/g, ""))} from this spot?')">
      <label class="fine"><input type="checkbox" name="email" value="1" checked> Email them</label><button class="link-dark danger-link" type="submit">Remove</button></form></li>`;
  return page({ title: `People · ${slotName(it)}`, tab: "setup", user, flash, wide: true, noBack: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/setup?s=${sc.id}${it.node_id ? `&n=${it.node_id}` : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>Back to Setup</a></nav>
    ${head}
    <div class="sub-body no-subs sp-sheet">
    <div class="sp-session"><b>${esc(it.title && !it.starts_at ? it.title : path[path.length - 1] || it.title || "Spot")}</b>
      <span>${esc([...path.slice(0, -1)].join(" • "))}${path.length > 1 ? " · " : ""}${esc(slotName(it))}${it.location ? ` · ${esc(it.location)}` : ""}</span></div>
    <div class="ck-listbar"><h3>In this spot <i class="sub-n">${conf.length} of ${it.capacity}</i></h3>
      <button type="button" class="sb-btn primary" onclick="var a=document.getElementById('add'); a.hidden=!a.hidden; if (!a.hidden) a.querySelector('select').focus();">+ Add someone</button></div>
        <section class="sp-addbox" id="add" hidden><h3>Add someone to this spot</h3>
      <form method="post" action="/admin/b/${sc.id}/items/${it.id}/people/add" class="stack sp-add">
        <label>Who<select name="athlete_id" required><option value="">Choose…</option>
          ${onBoard.length ? `<optgroup label="On this board">${onBoard.map((p) => `<option value="${p.id}">${esc(p.last_name)}, ${esc(p.first_name)}${p.group_name ? ` (${esc(p.group_name)})` : ""}</option>`).join("")}</optgroup>` : ""}
          ${everyone.length ? `<optgroup label="Everyone else in People">${everyone.map((p) => `<option value="${p.id}">${esc(p.last_name)}, ${esc(p.first_name)}${p.kind === "adult" ? " (adult)" : ""}</option>`).join("")}</optgroup>` : ""}</select></label>
        ${q.label ? `<label>${esc(q.label)} <span class="opt">(optional)</span><input name="note" maxlength="120"></label>` : ""}
        <label class="radio-row"><input type="checkbox" name="override" value="1"> <span><b>Override the rules</b> <span class="fine">Add them even if the spot is full, they're past a limit, or the spot isn't open to them.</span></span></label>
        <label class="radio-row"><input type="checkbox" name="email" value="1" checked> <span><b>Email them</b> <span class="fine">The usual “Spot claimed” email to them (or their parents/guardians).</span></span></label>
        <div class="q-actions"><button type="button" class="link-dark" onclick="var a=document.getElementById('add'); a.hidden=true; a.querySelector('form').reset();">Cancel</button><button class="btn-small" type="submit">Add to this spot</button></div>
      </form></section>
    <section class="sp-in">
      ${conf.length ? `<ul class="sp-list">${conf.map(row).join("")}</ul>` : `<p class="muted">No one yet.</p>`}
      ${wl.length ? `<h3 class="ck-wlh">Waitlist <i class="sub-n">${wl.length}</i></h3><ul class="sp-list">${wl.map(row).join("")}</ul>` : ""}</section>
    </div>` });
}

module.exports = { levelOverrides, spotPeoplePage, copyPage, boardDefaultsSections, settingsForm, settingRows, levelChanges };
