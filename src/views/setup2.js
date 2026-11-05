// Board Setup, three panels: structure tree (left), the selected level's contents (center), its settings (right).
// Uses the same save actions as before (/admin/b/:sid/...); every save comes back with the level selected (?n=).
const { esc } = require("./layout");
const { page } = require("./admin");
const SC = require("../schedules");
const P = require("../locations");
const B = require("./board");
const { inputParts, slotName } = require("../time");

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// one simple icon per level (by depth), and one for the things people claim
const LEVEL_IC = [SVG('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>'),
  SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.4.2 4 1.9 4.5 5"/>'),
  SVG('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
  SVG('<path d="M12 3 4 7v5c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V7z"/>')];
const IC = {
  slot: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'), home: SVG('<path d="M3 11 12 3l9 8"/><path d="M5 9.5V21h14V9.5"/>'),
  tree: SVG('<rect x="9" y="2.5" width="6" height="5" rx="1"/><rect x="2.5" y="16.5" width="6" height="5" rx="1"/><rect x="15.5" y="16.5" width="6" height="5" rx="1"/><path d="M12 7.5V12M5.5 16.5V12h13v4.5"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>'), edit: SVG('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  eye: SVG('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), copy: SVG('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/>'),
  pin: SVG('<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'), clock: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  people: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/>'), search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  chev: SVG('<path d="m9 6 6 6-6 6"/>'), board: SVG('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M7.5 14h3M13.5 14h3M7.5 17.5h3"/>'),
};
const plural = (n, w) => `${n} ${(n === 1 ? w.one : w.many).toLowerCase()}`;

// ---------- the center + right panels for a selection (also sent alone when clicking in the tree) ----------
function panels({ sc, tree, topItems, totals, eff, sel }) {
  const L = SC.labels(sc), depth = SC.depthOf(sc), keys = SC.levelKeys(sc);
  const word = (i) => L[keys[i]];                                      // level i's name (i = depth-1 is the slot)
  const all = new Map(); const index = (ts) => ts.forEach((t) => { all.set(t.node.id, t); index(t.kids); }); index(tree);
  const t = sel ? all.get(sel) : null;
  const lvl = t ? t.chain.length - 1 : -1;                            // -1 = the whole board
  const holdsItems = depth === 1 ? !t : lvl === depth - 2;             // this level's children are sessions
  const childW = holdsItems ? L.slot : word(lvl + 1);
  const kids = t ? t.kids : tree;
  const items = t ? t.items : topItems;
  const c = t ? t.count : { items: totals.items, spots: totals.spots, claimed: totals.claimed };
  const crumbs = `<nav class="sp-crumbs" aria-label="Where you are"><a href="/admin/setup?s=${sc.id}" data-nav="">${IC.home}<span>${esc(sc.name)}</span></a>
    ${t ? t.chain.map((n, i) => `<span class="sep">›</span>${i === t.chain.length - 1 ? `<b>${esc(n.name)}</b>` : `<a href="/admin/setup?s=${sc.id}&n=${n.id}" data-nav="${n.id}">${esc(n.name)}</a>`}`).join("") : ""}</nav>`;
  const locked = !!sc.archived_at;
  // --- center ---
  const head = `<div class="sp-head"><span class="sp-ico">${t ? LEVEL_IC[lvl % LEVEL_IC.length] : IC.board}</span>
      <div class="sp-title"><h2>${esc(t ? t.node.name : sc.name)}</h2>
        <span>${t ? `${esc(word(lvl).one)} · ` : ""}${plural(c.items, L.slot)} · ${(sc && sc.board_type === "rsvp") ? `${c.claimed} going` : `${c.spots} total spots · ${c.claimed} claimed`}</span></div>
      ${t && !locked ? `<div class="sp-acts"><button type="button" class="sb-btn" data-rename="${t.node.id}" data-name="${esc(t.node.name)}">${IC.edit}Rename</button>
        <button type="button" class="sb-btn" data-dup-node="${t.node.id}" data-name="${esc(t.node.name)}">${IC.copy}Duplicate</button>
        <button type="button" class="sb-btn danger" data-delete="${t.node.id}" data-name="${esc(t.node.name)}">${IC.trash}Delete</button></div>` : ""}</div>`;
  let body;
  if (holdsItems) {
    const row = (it) => {
      const st = it.starts_at ? inputParts(it.starts_at) : null, en = it.ends_at ? inputParts(it.ends_at) : null;
      const pct = it.capacity ? Math.round((it.claimed / it.capacity) * 100) : 0;
      const d = it.starts_at ? new Date(it.starts_at) : null;
      const dpart = (o) => d.toLocaleDateString("en-US", { timeZone: "America/Chicago", ...o });
      return `<li class="ss-row">
        ${d ? `<span class="ss-date"><small>${esc(dpart({ month: "short" }).toUpperCase())}</small><b>${esc(dpart({ day: "numeric" }))}</b><small>${esc(dpart({ weekday: "short" }))}</small></span>` : `<span class="ss-date nodate">${IC.slot}</span>`}
        <span class="ss-main"><b>${esc(it.title || (t ? `${t.node.name} ${L.slot.one.toLowerCase()}` : L.slot.one))}</b>
          ${d ? `<span>${IC.clock}${esc(slotName({ starts_at: it.starts_at, ends_at: it.ends_at }).replace(/^[^,]+, [^,]+, /, ""))}</span>` : ""}
          ${(() => { const loc = it.location || (t && t.eff.location) || sc.event_location; if (!loc) return "";
            const src = it.location ? "" : t && t.eff.location ? (t.eff.from.location && t.eff.from.location !== sc.name ? `from ${t.eff.from.location}` : "board") : "board";
            return `<span>${IC.pin}${esc(loc)}${src ? ` <i class="fine">(${esc(src)})</i>` : ""}</span>`; })()}</span>
        ${(sc && sc.board_type === "rsvp") ? `<span class="ss-fill"><b>${it.claimed}</b> going</span>` : `<span class="ss-fill"><b>${it.claimed} / ${it.capacity}</b> claimed${it.waitlisted ? ` · ${it.waitlisted} waiting` : ""}
          <span class="ss-bar"><i style="width:${Math.min(100, pct)}%"></i></span><small>${it.capacity - it.claimed > 0 ? `${it.capacity - it.claimed} open` : "Full"} · ${pct}%</small></span>`}
        <span class="ss-acts"><a class="sb-btn sm ic" href="/admin/b/${sc.id}/items/${it.id}/people" title="People: see, add, or remove" aria-label="People">${IC.people}</a>
          ${locked ? "" : `<button type="button" class="sb-btn sm ic" title="Edit" aria-label="Edit" data-item='${esc(JSON.stringify({ id: it.id, node: it.node_id || "", title: it.title, capacity: it.capacity, location: it.location || "", date: st ? st.date : "", start: st ? st.time : "", end: en ? en.time : "" }))}'>${IC.edit}</button>
          <button type="button" class="sb-btn sm ic" title="Duplicate, then change what's different" aria-label="Duplicate" data-dup='${esc(JSON.stringify({ node: it.node_id || "", title: it.title, capacity: it.capacity, location: it.location || "", date: st ? st.date : "", start: st ? st.time : "", end: en ? en.time : "" }))}'>${IC.copy}</button>
          <button type="button" class="sb-btn sm ic danger" title="Delete" data-del-item="${it.id}" data-name="${esc(slotName(it))}" data-claims="${it.claimed + it.waitlisted}" aria-label="Delete">${IC.trash}</button>`}</span></li>`;
    };
    body = `<section class="sp-card"><div class="sp-card-h">${IC.clock}<b>${esc(L.slot.many)}</b><span class="fine">${(sc && sc.board_type === "rsvp") ? "(events to RSVP)" : "(spots to claim)"}</span>
        ${locked ? "" : `${SC.usesCalendar(sc) ? `<button type="button" class="sb-btn" data-copy-day="${t ? t.node.id : ""}">Copy a day</button>` : ""}<button type="button" class="sb-btn primary" data-add-item="${t ? t.node.id : ""}">${IC.plus}Add ${esc(L.slot.one.toLowerCase())}</button>`}</div>
      ${items.length ? `<ul class="ss-list">${items.map(row).join("")}</ul>` : `<div class="sp-empty">${IC.clock}<b>No ${esc(L.slot.many.toLowerCase())} yet.</b><span>Add one, and people can start claiming it once the board is published.</span></div>`}</section>`;
  } else {
    body = `<section class="sp-card"><div class="sp-card-h">${LEVEL_IC[(lvl + 1) % LEVEL_IC.length]}<b>${esc(childW.many)}</b><span class="fine">in ${esc(t ? t.node.name : "this board")}</span>
        ${locked ? "" : `<a class="sb-btn" href="/admin/b/${sc.id}/import-level?parent=${t ? t.node.id : ""}" title="Add a level exported from another copy of Claim It">Import a level</a><button type="button" class="sb-btn primary" data-add-node="${t ? t.node.id : ""}" data-word="${esc(childW.one)}">${IC.plus}Add ${esc(childW.one.toLowerCase())}</button>`}</div>
      ${kids.length ? `<div class="kid-grid">${kids.map((k) => `<a class="kid" href="/admin/setup?s=${sc.id}&n=${k.node.id}" data-nav="${k.node.id}">
          <span class="kid-ico">${LEVEL_IC[(lvl + 1) % LEVEL_IC.length]}</span><b>${esc(k.node.name)}</b>
          <span class="fine">${k.kids.length ? `${plural(k.kids.length, lvl + 2 <= depth - 2 ? word(lvl + 2) : L.slot)} · ` : ""}${plural(k.count.items, L.slot)} · ${k.count.spots} spots · ${k.count.claimed} claimed</span>
          ${B.levelChanges(k.node).length ? `<span class="kid-own">${IC.gear}Own settings</span>` : ""}</a>`).join("")}</div>`
        : `<div class="sp-empty">${LEVEL_IC[(lvl + 1) % LEVEL_IC.length]}<b>No ${esc(childW.many.toLowerCase())} yet.</b><span>Add the first one${t ? ` to ${esc(t.node.name)}` : ""}.</span></div>`}</section>`;
  }
  const center = crumbs + head + body;
  // --- right: settings for the selection (inherited vs set here) ---
  const srcTag = (src) => { const m = /^Narrowed above \((.*)\)$/.exec(src || "");
    return src === "Set here" ? `<span class="src-tag here">Set here</span>` : m ? `<span class="src-tag from">From ${esc(m[1])}</span>` : /^From /.test(src) ? `<span class="src-tag from">${esc(src)}</span>`
      : /Board|board/.test(src) || src === "Same as the board" ? `<span class="src-tag board">From board</span>` : `<span class="st-why">${esc(src)}</span>`; };
  const rowsHtml = (rows) => `<dl class="st-list">${rows.map(([k, v, src]) => `<div><dt>${k}</dt><dd><span>${v}</span>${srcTag(src)}</dd></div>`).join("")}</dl>`;
  let right;
  if (!t) {
    right = `<div class="st-h">${IC.gear}<h3>Settings</h3></div>
      <p class="st-note">Pick a ${esc((depth > 1 ? word(0) : L.slot).one.toLowerCase())} or any level on the left to see and change its settings.</p>
      <p class="st-note">Settings for the whole board are under <a href="/admin/setup/schedule?s=${sc.id}"><b>Board defaults</b></a> at the top. Every level starts with those, and can change any of them.</p>`;
  } else {
    const own = B.levelChanges(t.node);
    right = `<div class="st-h">${IC.gear}<h3>${esc(word(lvl).one)} settings</h3></div>
      <p class="st-sub">What applies to <b>${esc(t.node.name)}</b></p>
      ${inlineSettings(sc, t, locked)}
      <p class="st-legend"><span class="src-tag here">Set here</span> changed on this ${esc(word(lvl).one.toLowerCase())} · <span class="src-tag board">From board</span> board default · <span class="src-tag from">From …</span> a level above</p>`;
  }
  return { center, right, title: `${t ? t.node.name : "Setup"} · ${sc.name}` };
}

// each setting as a row with Edit; Edit shows that setting's own part of the settings form, saved alone (?only=)
const KEY_OF = { "Who can claim here": "who", "Per-person limit here": "limit", "Claiming opens": "opens", "Cancel deadline": "cancel", "Open leftover spots": "leftover",
  "Waitlist": "waitlist", "Attendance": "attendance", "Location": "location", "Visible from": "visible" };
const ROW_KEY = { "Who can claim here": "who", "Per-person limit": "limit", "Claiming opens": "opens", "Cancel deadline": "cancel", "Open leftover spots": "leftover", "Waitlist": "waitlist", "Attendance": "attendance", "Location": "location", "Visible from": "visible" };
function inlineSettings(sc, t, locked) {
  const n = t.node;
  const form = B.settingsForm(sc, n, t.inherited);
  const parts = {}; form.replace(/<fieldset><legend>([^<]+)<\/legend>([\s\S]*?)<\/fieldset>/g, (m, legend, inner) => { const k = KEY_OF[legend.trim()]; if (k) parts[k] = m; return m; });
  const rows = B.settingRows(sc, t.eff, n.settings || {}, "node");
  rows.push(["Visible from", n.visible_from ? `Hidden until ${require("../time").fmtDateTime(n.visible_from)}` : "Always", n.visible_from ? "Set here" : "Board default"]);
  const tag = (src) => { const m = /^Narrowed above \((.*)\)$/.exec(src || "");
    return src === "Set here" ? `<span class="src-tag here">Set here</span>` : m ? `<span class="src-tag from">From ${esc(m[1])}</span>` : /^From /.test(src) ? `<span class="src-tag from">${esc(src)}</span>`
      : /Board|board/.test(src) || src === "Same as the board" ? `<span class="src-tag board">From board</span>` : `<span class="st-why">${esc(src)}</span>`; };
  return `<dl class="st-list">${rows.map(([k, v, src]) => { const key = ROW_KEY[k], part = key && parts[key];
    return `<div class="st-item" data-key="${key || ""}"><div class="st-row"><dt>${k}</dt><dd><span>${v}</span>${tag(src)}</dd>
        ${part && !locked ? `<button type="button" class="st-editl" aria-expanded="false">Edit</button>` : ""}</div>
      ${part && !locked ? `<form method="post" action="/admin/b/${sc.id}/nodes/${n.id}/settings" class="node-settings st-inline" hidden>
        <input type="hidden" name="only" value="${key}">${part.replace(/<legend>[^<]*<\/legend>/, "")}
        <div class="st-inline-acts"><button type="button" class="btn-ghost st-cancel">Cancel</button><button class="btn-small" type="submit">Save</button></div></form>` : ""}</div>`; }).join("")}</dl>`;
}

// Board details as cards: the same edit form, split into sections; a card's view shows only its section
// (the others stay in the form, so Save keeps everything as it was)
function detailsCards(sc) {
  const L = SC.labels(sc), keys = SC.levelKeys(sc);
  const fmt = (d) => new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  let f = require("./home").editDialog(sc)
    .replace(/<dialog class="edit-dlg" id="edit-(\d+)"[^>]*>/, `<section class="bd-panel" id="bd-panel" hidden><nav class="sub-tabs bd-subs" aria-label="Board details">${[["general", "General"], ["look", "Type &amp; look"], ["organizer", "Organizers"], ["structure", "Structure &amp; names"]].map(([k, l]) => `<a href="/admin/setup?s=${sc.id}&tab=details&sub=${k}" data-sub="${k}">${l}</a>`).join("")}</nav><div class="sub-body">`)
    .replace(/<\/dialog>\s*$/, "</div></section>")
    .replace(/<div class="dlg-head">[\s\S]*?<\/div>/, "")
    .replace('name="return_to" value="/admin/settings"', `name="return_to" value="/admin/setup?s=${sc.id}&tab=details"`)
    .replace(`onclick="this.closest('form').reset(); this.closest('dialog').close()"`, `onclick="this.closest('form').reset()"`);
  const ico = (d) => `<span class="card-ico" hidden>${d}</span>`;
  const SUB = { basics: "general", location: "general", description: "general", type: "look", picture: "look", organizer: "organizer", structure: "structure" };
  const sec = (id, title, sum, icon) => `</div><div class="bd-sec" data-sub="${SUB[id]}">`;
  const dates = sc.event_date ? (sc.event_end && String(sc.event_end).slice(0, 10) !== String(sc.event_date).slice(0, 10) ? `${fmt(sc.event_date)} – ${fmt(sc.event_end)}` : fmt(sc.event_date)) : "No dates";
  const cuts = [
    [/<h3>The basics<\/h3>/, sec("basics", "Name & dates", `<b>${esc(sc.name)}</b><br>${esc(dates)}`, IC.board)],
    [/<label class="field-l"><span>Main location/, sec("location", "Location", esc(sc.event_location || "None"), IC.pin) + '<label class="field-l"><span>Main location'],
    [/<label class="field-l"><span>Description/, sec("description", "Description", sc.description ? esc(sc.description.slice(0, 90)) + (sc.description.length > 90 ? "…" : "") : "None", IC.edit) + '<label class="field-l"><span>Description'],
    [/<h3>Board type<\/h3>/, sec("type", "Board type", ({ volunteer: "Volunteer", rsvp: "RSVP" }[require("./setup").boardTypeOf(sc)] || "Program"), IC.people)],
    [/<h3>Picture<\/h3>/, sec("picture", "Picture & short code", sc.image ? `<img class="ch-img" src="/img/board/${sc.id}?v=${sc.image_at ? new Date(sc.image_at).getTime() : 0}" alt="">` : `<span class="ch-code">${esc(require("./setup").codeOf(sc))}</span>`, IC.eye)],
    [/<h3>Organizers?( <span class="opt">\(optional\)<\/span>)?<\/h3>/, sec("organizer", "Organizer", esc([sc.contact_name, sc.contact_info].filter(Boolean).join(" · ") || "None"), IC.people)],
    [/<h3>Structure<\/h3>/, sec("structure", "Structure & names", esc(keys.map((k) => L[k].many).join(" › ")), IC.tree)],
  ];
  for (const [re, html] of cuts) f = f.replace(re, html);
  // "Do sessions have dates and times?" belongs with General; "Available views" with Type & look
  const views = (f.match(/<div class="sub-q dlg-views"[^>]*>[\s\S]*?<\/div>\s*<\/div>/) || [""])[0];
  if (views) f = f.replace(views, "");
  const dated = (f.match(/<p class="q-label">Do [^<]* have dates and times\?<\/p>\s*<div class="opt-row">[\s\S]*?<\/div>/) || [""])[0];
  if (dated) f = f.replace(dated, "");
  const at = (sub) => f.indexOf(`</div><div class="bd-sec" data-sub="${sub}">`);
  if (dated && at("look") >= 0) { const i = at("look"); f = f.slice(0, i) + `</div><div class="bd-sec bd-when" data-sub="general"><h3>Dates and times</h3>${dated}` + f.slice(i); }
  if (views && at("organizer") >= 0) { const i = at("organizer"); f = f.slice(0, i) + `</div><div class="bd-sec bd-views" data-sub="look"><h3>How families see it</h3>${views.replace('class="sub-q dlg-views"', 'class="dlg-views"')}<p class="fine bd-noviews">${esc(L.slot.many)} don't have dates, so families see a simple list. To offer a calendar, set dates and times under <b>General</b>.</p>` + f.slice(i); }
  // the first cut closed a <div> that wasn't open yet: open a wrapper at the start of the form body
  f = f.replace('<div class="dlg-body">', '<div class="dlg-body"><div class="bd-pre">').replace("<h3>Board type</h3>", "").replace("<h3>Picture</h3>", "<h3>Picture &amp; short code</h3>");
  return f;
}

// the board header (name, status, counts, Preview, Publish) and its four tabs, on every tab's page
function boardHeader(sc, { tops = 0, totals = { items: 0, spots: 0, claimed: 0 }, active = "setup" } = {}) {
  const L = SC.labels(sc), depth = SC.depthOf(sc), keys = SC.levelKeys(sc);
  const word = (i) => L[keys[i]];
  const published = !!sc.published_at, locked = !!sc.archived_at;
  const pct = totals.spots ? Math.round((totals.claimed / totals.spots) * 100) : 0;
  const tree = { length: tops };
  // on the Setup page, Board setup / Board details switch in place (data-btab); elsewhere they're plain links
  const inPlace = active === "setup" || active === "details";
  const tab = (k, href, ic, label) => `<a href="${href}"${k === active ? ' aria-current="page"' : ""}${inPlace && (k === "setup" || k === "details") ? ` data-btab="${k}"` : ""}>${ic}${label}</a>`;
  const shareUrl = sc.share_code ? `${process.env.APP_URL || ""}/s/${sc.share_code}` : "";
  return `<section class="bh2">
    <div class="bh2-l">${sc.image ? `<span class="d-thumb photo bh2-tile"><img src="/img/board/${sc.id}?v=${sc.image_at ? new Date(sc.image_at).getTime() : 0}" alt=""></span>` : `<span class="d-thumb code bh2-tile"><b>${esc(require("./setup").codeOf(sc))}</b></span>`}
      <div><div class="bh2-t"><h1>${esc(sc.name)}</h1><span class="bh2-st ${locked ? "arch" : published ? "pub" : "draft"}">${locked ? "Archived" : published ? "Published" : "Draft"}</span></div>
        <span class="bh2-meta">${depth > 1 ? `${plural(tree.length, word(0))} · ` : ""}${plural(totals.items, L.slot)} · ${(sc && sc.board_type === "rsvp") ? `${totals.claimed} going` : `${totals.spots} total spots · ${totals.claimed} claimed (${pct}%)`}${sc.event_location ? ` · ${P.link(sc.event_location)}` : ""}</span></div></div>
    <div class="bh2-acts">
      <details class="tx-exp"><summary class="sb-btn" title="Download this board to import into another copy (e.g. staging → production)">Export</summary>
        <form class="tx-pop" method="get" action="/admin/setup/schedules/${sc.id}/export" onsubmit="this.people.value=this.p.checked?'1':'0';this.coaches.value=this.c.checked?'1':'0';setTimeout(()=>this.closest('details').open=false,300);">
          <b>Export this board</b><span class="fine">Setup, levels and sessions. Never claims.</span>
          <label class="radio-row"><input type="checkbox" name="p" checked> People on the board</label><label class="radio-row"><input type="checkbox" name="c" checked> Coaches</label>
          <input type="hidden" name="people"><input type="hidden" name="coaches"><button class="btn-small" type="submit">Download the file</button></form></details>
      <a class="sb-btn" href="/b/${sc.id}?preview=1" target="_blank" rel="noopener" title="See the board as a family would, even before it's published">${IC.eye}Preview</a>
      ${published && SC.claimMode(sc) === "public" && shareUrl ? `<details class="share-pop"><summary class="sb-btn">Share</summary><div class="share-panel">
          <p class="fine">Anyone with this link can sign up, no account needed.</p>
          <div class="share-row"><input readonly value="${esc(shareUrl)}" class="share-url" onclick="this.select()"><button type="button" class="btn-small" onclick="var i=this.previousElementSibling; i.select(); navigator.clipboard && navigator.clipboard.writeText(i.value); this.textContent='Copied'">Copy</button></div>
          <div class="share-qr"><img src="/admin/b/${sc.id}/qr.svg" alt="QR code" width="140" height="140"><span><a class="btn-ghost" href="/admin/b/${sc.id}/qr.svg?download=1">Download QR code</a></span></div></div></details>` : ""}
      ${locked ? "" : `<form method="post" action="/admin/b/${sc.id}/publish" onsubmit="return confirm(${esc(JSON.stringify(published ? `Unpublish ${sc.name}? People won't see it until you publish again. Claims are kept.` : `Publish ${sc.name}? People who can claim will be able to see it.`))})">
        <button class="sb-btn ${published ? "" : "primary"}" type="submit">${published ? "Unpublish" : "Publish"}</button></form>`}</div>
  </section>
  <nav class="bh2-tabs board-tabs">${tab("setup", `/admin/setup?s=${sc.id}`, IC.gear, "Board setup")}${locked ? "" : tab("details", `/admin/setup?s=${sc.id}&tab=details`, IC.board, "Board details")}${tab("access", `/admin/members?s=${sc.id}`, IC.people, "Access &amp; people")}${tab("defaults", `/admin/setup/schedule?s=${sc.id}`, IC.edit, "Board defaults")}${tab("notify", `/admin/setup/notifications?s=${sc.id}`, `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`, "Notifications")}</nav><script>(function () { var n = document.currentScript.previousElementSibling, c = n && n.querySelector("[aria-current]"); if (c && n.scrollWidth > n.clientWidth) n.scrollLeft = c.offsetLeft - 12; })();</script>`;
}
// what the header needs, for pages other than Setup
async function headerData(sc) {
  const { query } = require("../db");
  const totals = await require("../engine").boardTotals(sc.id);
  const tops = (await query(`SELECT count(*)::int AS n FROM board_nodes WHERE schedule_id=$1 AND parent_id IS NULL`, [sc.id])).rows[0].n;
  return { tops, totals };
}

// ---------- card grid + card views, the same on Board details, Access & people, and Board defaults ----------
// Mark sections with data-card="id" (and data-title, data-sum; an optional <span class="card-ico" hidden>svg</span>).
// No ?card= in the address: a grid of cards. ?card=id: only that section, with "← Back to …".
// ---------- the whole page ----------
function setupPage({ user, flash, sc, tree, topItems, totals, eff, sel }) {
  const L = SC.labels(sc), depth = SC.depthOf(sc), keys = SC.levelKeys(sc);
  const word = (i) => L[keys[i]];
  const published = !!sc.published_at, locked = !!sc.archived_at;
  const pct = totals.spots ? Math.round((totals.claimed / totals.spots) * 100) : 0;
  const pane = panels({ sc, tree, topItems, totals, eff, sel });
  // the structure tree
  const node = (t, lvl) => {
    const holds = lvl === depth - 2, childW = holds ? null : word(lvl + 1);
    return `<li class="tn" data-id="${t.node.id}" data-name="${esc(t.node.name.toLowerCase())}">
      <div class="tn-row${t.node.id === sel ? " on" : ""}">
        ${t.kids.length ? `<button type="button" class="tn-tog" aria-label="Open or close ${esc(t.node.name)}">${IC.chev}</button>` : `<span class="tn-tog none"></span>`}
        <a class="tn-link" href="/admin/setup?s=${sc.id}&n=${t.node.id}" data-nav="${t.node.id}">${LEVEL_IC[lvl % LEVEL_IC.length]}<span class="tn-name">${esc(t.node.name)}</span>
          <span class="tn-c" title="${t.count.claimed} claimed of ${t.count.spots} spots">${t.count.spots ? ((sc && sc.board_type === "rsvp") ? `${t.count.claimed}` : `${t.count.claimed}/${t.count.spots}`) : ""}</span></a>
        ${locked ? "" : `<span class="tn-more"><button type="button" class="tn-dots" aria-label="More for ${esc(t.node.name)}">⋯</button>
          <span class="tn-menu" hidden>
            ${holds ? `<button type="button" data-add-item="${t.node.id}">${IC.plus}Add ${esc(L.slot.one.toLowerCase())}</button>` : `<button type="button" data-add-node="${t.node.id}" data-word="${esc(childW.one)}">${IC.plus}Add ${esc(childW.one.toLowerCase())}</button>`}
            <button type="button" data-rename="${t.node.id}" data-name="${esc(t.node.name)}">${IC.edit}Rename</button>
            <button type="button" data-dup-node="${t.node.id}" data-name="${esc(t.node.name)}">${IC.copy}Duplicate</button>
            <button type="button" data-settings="${t.node.id}">${IC.gear}Settings</button>
            <a href="/admin/b/${sc.id}/nodes/${t.node.id}/export" download title="Download this level, with everything inside it, to import into another copy">${IC.copy}Export</a>
            <button type="button" class="danger" data-delete="${t.node.id}" data-name="${esc(t.node.name)}">${IC.trash}Delete</button></span></span>`}</div>
      ${t.kids.length ? `<ul>${t.kids.map((k) => node(k, lvl + 1)).join("")}</ul>` : ""}</li>`;
  };
  const header = boardHeader(sc, { tops: tree.length, totals, active: "setup" });
  const L0 = depth > 1 ? word(0) : L.slot;
  return page({ title: pane.title, tab: "setup", user, flash, xwide: true,
    body: `${header}
    <div class="sp3" data-sid="${sc.id}">
      <aside class="sp3-tree"><div class="spt-h">${IC.tree}<h3>Board structure</h3>
          ${locked ? "" : depth > 1 ? `<button type="button" class="sb-btn primary sm" data-add-node="" data-word="${esc(L0.one)}">${IC.plus}Add ${esc(L0.one.toLowerCase())}</button>` : ""}</div>
        <label class="spt-search">${IC.search}<input type="search" placeholder="Search levels…" aria-label="Search levels"></label>
        <ul class="spt">
          ${tree.map((t) => node(t, 0)).join("")}
        </ul>
        ${depth > 1 && !tree.length ? `<p class="fine spt-empty">No ${esc(L0.many.toLowerCase())} yet.</p>` : ""}</aside>
      <main class="sp3-center" id="sp-center">${pane.center}</main>
      <aside class="sp3-right" id="sp-right">${pane.right}</aside>
    </div>
    ${P.datalist()}
    ${locked ? "" : detailsCards(sc)}
    ${locked ? "" : `${P.placeDialog()}${require("./setup").IMAGE_JS}`}
    <script>(function () {   // Board details sub-tabs: show one group of the form; Save comes back to it
      var panel = document.getElementById("bd-panel"); if (!panel) return;
      var sub = (new URLSearchParams(location.search).get("sub") || "general"), ok = ["general", "look", "organizer", "structure"];
      if (ok.indexOf(sub) < 0) sub = "general";
      panel.querySelectorAll(".bd-sec").forEach(function (x) { x.hidden = x.dataset.sub !== sub; });
      panel.querySelectorAll(".bd-subs a").forEach(function (a) { if (a.dataset.sub === sub) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
      var r = panel.querySelector("[name=return_to]"); if (r) r.value = "/admin/setup?s=${sc.id}&tab=details&sub=" + sub;
    })();</script>
    <script>(function () {
      var panel = document.getElementById("bd-panel"), grid = document.querySelector(".sp3"), dirty = false, sid = ${sc.id};
      if (!panel) return;
      var form = panel.querySelector("form"); form.addEventListener("input", function () { dirty = true; }); form.addEventListener("change", function () { dirty = true; }); form.addEventListener("submit", function () { dirty = false; });
      window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
      window.boardTab = function (t, push) {
        if (t === "setup" && dirty && !confirm("You have unsaved board details. Leave without saving?")) return;
        if (t === "setup") { dirty = false; form.reset(); }
        panel.hidden = t !== "details"; grid.hidden = t === "details";
        document.querySelectorAll("[data-btab]").forEach(function (a) { if (a.dataset.btab === t) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
        history.replaceState(null, "", "/admin/setup?s=" + sid + (t === "details" ? "&tab=details" + ((location.search.match(/[?&]sub=[a-z]+/) || [""])[0].replace("?", "&")) : (location.search.match(/[?&]n=\\d+/) || [""])[0].replace("?", "&")));
        if (t === "details") { var f = form.querySelector("input:not([type=hidden])"); if (f) f.focus({ preventScroll: true }); }
      };
      document.querySelectorAll("[data-btab]").forEach(function (a) { a.addEventListener("click", function (e) { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); window.boardTab(a.dataset.btab); }); });
      if (/[?&](tab=details|details=1)/.test(location.search)) window.boardTab("details");
    })();</script>
    <dialog class="edit-dlg sd" id="dlg-node"><form method="post" class="stack"><input type="hidden" name="parent_id">
      <div class="dlg-head"><h2></h2><button type="button" class="dlg-x" data-close>×</button></div>
      <label>Name<input name="name" required maxlength="60" autocomplete="off"></label>
      <div class="q-actions"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-small" type="submit">Save</button></div></form></dialog>
    <dialog class="edit-dlg sd" id="dlg-item"><form method="post" class="stack"><input type="hidden" name="node_id">
      <div class="dlg-head"><h2></h2><button type="button" class="dlg-x" data-close>×</button></div>
      ${SC.usesCalendar(sc) ? `<div class="sd-row"><label>Date<input type="date" name="date"></label><label>Start<input type="time" name="start_time"></label><label>End<input type="time" name="end_time"></label></div>` : ""}
      <label><span>Name ${SC.usesCalendar(sc) ? `<span class="opt">(optional when it has a date)</span>` : ""}</span><input name="title" maxlength="80" placeholder="e.g. Lower field"></label>
      <div class="sd-row">${(sc && sc.board_type === "rsvp") ? `<input type="hidden" name="capacity" value="500">` : `<label>Spots<input type="number" name="capacity" min="1" max="500" required></label>`}<label><span>Location <span class="opt">(optional)</span></span><input name="location" list="app-locations" maxlength="80"></label></div>
      ${SC.usesCalendar(sc) ? `<fieldset class="sd-rep sd-split-f"><label class="radio-row"><input type="checkbox" name="split" value="1"> <b>Split into time slots</b> <span class="fine">e.g. 3:00 to 7:00, a slot every 30 minutes</span></label>
        <div class="sd-split" hidden><label>Each slot<select name="every">${[5, 10, 15, 20, 30, 45, 60, 90, 120].map((m) => `<option value="${m}"${m === 30 ? " selected" : ""}>${m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`}</option>`).join("")}</select></label><span class="fine sd-slots"></span></div></fieldset>
      <fieldset class="sd-rep sd-when-f"><span class="q-label">Which days</span>
        <div class="sd-when"><label class="radio-row"><input type="radio" name="when_mode" value="once" checked> Just this date</label><label class="radio-row"><input type="radio" name="when_mode" value="weekly"> Repeat weekly</label><label class="radio-row"><input type="radio" name="when_mode" value="dates"> Pick dates on a calendar</label></div>
        <div class="sd-rep-b" hidden><div class="sd-days">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => `<label><input type="checkbox" name="days" value="${i}"><span>${d}</span></label>`).join("")}</div>
          <label>Until<input type="date" name="until"></label></div>
        <div class="sd-cal-b" hidden><div class="cal-pick" data-input="dates"></div><input type="hidden" name="dates"></div>
        <p class="sd-count fine"></p></fieldset>` : ""}
      <p class="fine sd-err" hidden></p>
      <div class="q-actions"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-small" type="submit">Save</button></div></form></dialog>
    ${SC.usesCalendar(sc) ? `<dialog class="edit-dlg sd" id="dlg-copyday"><form method="post" action="/admin/b/${sc.id}/copy-day" class="stack"><input type="hidden" name="node_id"><input type="hidden" name="to">
      <div class="dlg-head"><h2>Copy a day</h2><button type="button" class="dlg-x" data-close>×</button></div>
      <p class="fine">Copies every ${esc(L.slot.one.toLowerCase())} on one day (times, spots, names and places, but no claims) onto the days you pick. Anything already there at the same time is skipped.</p>
      <div class="sd-when"><label class="radio-row"><input type="radio" name="scope" value="level" checked> <span>Just <b class="cd-level"></b></span></label><label class="radio-row"><input type="radio" name="scope" value="board"> The whole board</label></div>
      <label>Copy this day<select name="from" required><option value="">Loading…</option></select></label>
      <div><span class="q-label">Onto these days</span><div class="cal-pick" data-input="to"></div></div>
      <p class="fine cd-count"></p><p class="fine sd-err" hidden></p>
      <div class="q-actions"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-small" type="submit">Copy</button></div></form></dialog>` : ""}
    <form method="post" id="del-form" hidden></form>
    <script>${CLIENT_JS}</script>` });
}

// browser side: select without reloading, tree open/closed memory, search, menus, dialogs, unsaved changes
const CLIENT_JS = `
(function () {
  var root = document.querySelector(".sp3"); if (!root) return;
  var sid = root.dataset.sid, KEY = "tree-open-" + sid, open = {}; try { open = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  var dirty = false;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(open)); } catch (e) {} }
  function setOpen(li, on) { li.classList.toggle("open", on); open[li.dataset.id] = on; save(); }
  // restore open branches, and always open the path to the selection
  document.querySelectorAll(".spt .tn[data-id]").forEach(function (li) { if (open[li.dataset.id]) li.classList.add("open"); });
  // the path to the selection is always open, and remembered like any branch you open
  function openPath() { var on = document.querySelector(".spt .tn-row.on"); var li = on && on.parentElement.closest(".tn[data-id]"); li = li && li.parentElement.closest(".tn[data-id]");
    while (li) { li.classList.add("open"); open[li.dataset.id] = true; li = li.parentElement.closest(".tn[data-id]"); } save(); }
  openPath();
  function select(n) {
    document.querySelectorAll(".spt .tn-row").forEach(function (r) { r.classList.remove("on"); });
    var row = n ? document.querySelector('.spt .tn[data-id="' + n + '"] > .tn-row') : document.querySelector(".spt .tn.root > .tn-row");
    if (row) row.classList.add("on"); openPath();
  }
  function go(n, push) {
    if (dirty && !confirm("You have unsaved changes to these settings. Leave without saving?")) return;
    var url = "/admin/setup?s=" + sid + (n ? "&n=" + n : "");
    fetch(url + "&partial=1", { headers: { Accept: "application/json" } }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      document.getElementById("sp-center").innerHTML = j.center; document.getElementById("sp-right").innerHTML = j.right; document.title = j.title;
      dirty = false; select(n); if (push) history.pushState({ n: n }, "", url);
      document.getElementById("sp-center").scrollTop = 0;
    }).catch(function () { location.href = url; });
  }
  window.addEventListener("popstate", function () { var m = /[?&]n=(\\d+)/.exec(location.search); go(m ? m[1] : "", false); });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("input", function (e) { if (e.target.closest(".node-settings")) dirty = true; });
  document.addEventListener("submit", function (e) { dirty = false; });
  var dn = document.getElementById("dlg-node"), di = document.getElementById("dlg-item"), del = document.getElementById("del-form");
  function nameOf(id) { var a = document.querySelector('.tn[data-id="' + id + '"] > .tn-row .tn-name'); return a ? a.textContent : ""; }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, a"); if (!t) { document.querySelectorAll(".tn-menu").forEach(function (m) { m.hidden = true; }); return; }
    if (t.matches("[data-close]")) { t.closest("dialog").close(); return; }
    if (t.matches(".tn-tog:not(.none)")) { var li = t.closest(".tn"); setOpen(li, !li.classList.contains("open")); return; }
    if (t.matches(".tn-dots")) { var m = t._menu || (t._menu = t.nextElementSibling), was = m.hidden; document.querySelectorAll(".tn-menu").forEach(function (x) { x.hidden = true; });
      if (m.parentElement !== document.body) document.body.appendChild(m);   // on the page itself, so nothing in the tree can cover it
      m.hidden = !was; if (was) placeMenu(m, t); return; }
    document.querySelectorAll(".tn-menu").forEach(function (x) { x.hidden = true; });
    if (t.matches("[data-nav]") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(t.dataset.nav, true); return; }
    if (t.matches("[data-settings]")) { go(t.dataset.settings, true); return; }
    if (t.matches("[data-add-node]")) { var f = dn.querySelector("form"); f.action = "/admin/b/" + sid + "/nodes"; f.parent_id.value = t.dataset.addNode; f.name.value = "";
      dn.querySelector("h2").textContent = "Add " + t.dataset.word.toLowerCase() + (t.dataset.addNode ? " to " + nameOf(t.dataset.addNode) : ""); dn.showModal(); f.name.focus(); return; }
    if (t.matches("[data-rename]")) { var f2 = dn.querySelector("form"); f2.action = "/admin/b/" + sid + "/nodes/" + t.dataset.rename; f2.parent_id.value = ""; f2.name.value = t.dataset.name;
      dn.querySelector("h2").textContent = "Rename " + t.dataset.name; dn.showModal(); f2.name.select(); return; }
    if (t.matches("[data-delete]")) { if (!confirm("Delete " + t.dataset.name + " and everything inside it? This can't be undone. (It's blocked if anything inside has claims.)")) return;
      del.action = "/admin/b/" + sid + "/nodes/" + t.dataset.delete + "/delete"; del.submit(); return; }
    if (t.matches("[data-del-item]")) { if (+t.dataset.claims) { alert(t.dataset.name + " has claims, so it can't be deleted. Remove the people first (People button)."); return; }
      if (!confirm("Delete " + t.dataset.name + "? This can't be undone.")) return; del.action = "/admin/b/" + sid + "/items/" + t.dataset.delItem + "/delete"; del.submit(); return; }
    if (t.matches("[data-dup-node]")) { if (!confirm("Duplicate " + t.dataset.name + " with everything inside it (its levels, settings, and sessions, but no claims)?")) return;
      del.action = "/admin/b/" + sid + "/nodes/" + t.dataset.dupNode + "/duplicate"; del.submit(); return; }
    if (t.matches("[data-add-item], [data-item], [data-dup]")) { var f3 = di.querySelector("form"), it = t.dataset.item ? JSON.parse(t.dataset.item) : null, dup = t.dataset.dup ? JSON.parse(t.dataset.dup) : null, src = it || dup;
      f3.reset(); f3.action = "/admin/b/" + sid + "/items" + (it ? "/" + it.id : ""); f3.node_id.value = dup ? dup.node : (t.dataset.addItem || "");
      if (src) { f3.title.value = src.title; f3.capacity.value = src.capacity; f3.location.value = src.location; if (f3.date) { f3.date.value = src.date; f3.start_time.value = src.start; f3.end_time.value = src.end; } }
      di.querySelectorAll(".sd-rep").forEach(function (r) { r.hidden = !!it; }); var cb = di.querySelector(".cal-pick"); if (cb && cb._cal) cb._cal.set([]);
      di.querySelector("h2").textContent = it ? "Edit" : dup ? "Duplicate: change what's different" : "Add" + (t.dataset.addItem ? " to " + nameOf(t.dataset.addItem) : "");
      di.querySelector(".sd-err").hidden = true; di.showModal(); (f3.date || f3.title).focus(); repCount(); return; }
  });
  // a setting's inline edit: one open at a time; Cancel resets it
  document.addEventListener("click", function (e) {
    var ed = e.target.closest(".st-editl"), cx = e.target.closest(".st-cancel");
    if (ed) { var item = ed.closest(".st-item"), f = item.querySelector(".st-inline"), opening = f.hidden;
      document.querySelectorAll(".st-inline").forEach(function (x) { if (x !== f && !x.hidden) { x.reset(); x.hidden = true; x.closest(".st-item").classList.remove("editing"); x.closest(".st-item").querySelector(".st-editl").setAttribute("aria-expanded", "false"); } });
      f.hidden = !opening; item.classList.toggle("editing", opening); ed.setAttribute("aria-expanded", String(opening)); if (opening) { var first = f.querySelector("input:not([type=hidden]), select"); if (first) first.focus(); } }
    if (cx) { var f2 = cx.closest(".st-inline"); f2.reset(); f2.hidden = true; f2.closest(".st-item").classList.remove("editing"); f2.closest(".st-item").querySelector(".st-editl").setAttribute("aria-expanded", "false"); dirty = false; }
  });
  // keyboard: Enter/Space on a tree name works like a click (links already do); Escape closes menus
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.querySelectorAll(".tn-menu").forEach(function (m) { m.hidden = true; }); });
  function placeMenu(m, btn) {
    var r = btn.getBoundingClientRect(); m.classList.add("tn-float"); m.style.left = "0px"; m.style.top = "0px";
    var w = m.offsetWidth, h = m.offsetHeight, x = r.right - w, y = r.bottom + 4;
    if (x < 8) x = Math.min(r.left, window.innerWidth - w - 8);
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 4);
    m.style.left = Math.round(x) + "px"; m.style.top = Math.round(y) + "px";
  }
  // a floating menu closes when the page or the tree scrolls (it would otherwise drift away from its row)
  function closeMenus() { document.querySelectorAll(".tn-menu:not([hidden])").forEach(function (m) { m.hidden = true; }); }
  window.addEventListener("resize", closeMenus); document.addEventListener("scroll", closeMenus, true);
  // a month calendar where you tap the days you want (used by Pick dates and Copy a day)
  function calPick(box, input, onChange) {
    var sel = {}, now = new Date(), y = now.getFullYear(), m = now.getMonth(), MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    function key(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    function draw() {
      var first = new Date(y, m, 1), start = first.getDay(), days = new Date(y, m + 1, 0).getDate(), today = key(new Date()), h = "";
      h += '<div class="cal-h"><button type="button" class="cal-nav" data-d="-1" aria-label="Previous month">‹</button><b>' + MON[m] + " " + y + '</b><button type="button" class="cal-nav" data-d="1" aria-label="Next month">›</button></div><div class="cal-g">';
      ["S","M","T","W","T","F","S"].forEach(function (w) { h += '<span class="cal-w">' + w + "</span>"; });
      for (var i = 0; i < start; i++) h += "<span></span>";
      for (var d = 1; d <= days; d++) { var k = key(new Date(y, m, d)); h += '<button type="button" class="cal-d' + (sel[k] ? " on" : "") + (k === today ? " today" : "") + (k < today ? " past" : "") + '" data-k="' + k + '">' + d + "</button>"; }
      box.innerHTML = h + '</div><p class="cal-n fine">' + count() + "</p>";
    }
    function count() { var n = Object.keys(sel).length; return n ? n + " day" + (n === 1 ? "" : "s") + " picked" : "Tap the days you want."; }
    function sync() { input.value = Object.keys(sel).sort().join(","); if (onChange) onChange(); }
    box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; e.preventDefault();
      if (b.dataset.d) { m += +b.dataset.d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); return; }
      var k = b.dataset.k; if (sel[k]) delete sel[k]; else sel[k] = 1; b.classList.toggle("on"); box.querySelector(".cal-n").textContent = count(); sync(); });
    box._cal = { set: function (list, month) { sel = {}; (list || []).forEach(function (k) { sel[k] = 1; }); if (month) { y = +month.slice(0, 4); m = +month.slice(5, 7) - 1; } draw(); sync(); }, size: function () { return Object.keys(sel).length; } };
    draw(); return box._cal;
  }
  // the times a session (or a split range) makes
  function slots(f) {
    var a = f.start_time.value, b = f.end_time.value; if (!a || !b) return [];
    var mm = function (t) { var p = t.split(":"); return +p[0] * 60 + +p[1]; }, hm = function (x) { var h = Math.floor(x / 60), mi = x % 60, ap = h < 12 ? "am" : "pm"; return (((h + 11) % 12) + 1) + (mi ? ":" + String(mi).padStart(2, "0") : "") + ap; };
    if (!f.split || !f.split.checked) return [[hm(mm(a)), hm(mm(b))]];
    var ev = +f.every.value, out = []; for (var t = mm(a); t + ev <= mm(b) && out.length < 201; t += ev) out.push([hm(t), hm(t + ev)]); return out;
  }
  function modeOf(f) { var r = f.querySelector("[name=when_mode]:checked"); return r ? r.value : "once"; }
  function dayCount(f) {
    var mode = modeOf(f);
    if (mode === "dates") return f.dates.value ? f.dates.value.split(",").length : 0;
    if (mode === "weekly") { var days = [].filter.call(f.querySelectorAll("[name=days]"), function (c) { return c.checked; }).map(function (c) { return +c.value; });
      if (!f.date.value || !f.until.value || !days.length) return 0; var n = 0, a = Date.parse(f.date.value + "T12:00:00Z"), b = Date.parse(f.until.value + "T12:00:00Z");
      for (var t = a; t <= b && n < 400; t += 864e5) if (days.indexOf(new Date(t).getUTCDay()) >= 0) n++; return n; }
    return f.date.value ? 1 : 0;
  }
  // Which days + Split into time slots: show the right parts, and how many sessions it will make
  function repCount() {
    var f = di.querySelector("form"); if (!f.when_mode) return;
    var mode = modeOf(f); di.querySelector(".sd-rep-b").hidden = mode !== "weekly"; di.querySelector(".sd-cal-b").hidden = mode !== "dates";
    f.date.closest("label").hidden = mode === "dates"; di.querySelector(".sd-split").hidden = !f.split.checked;
    var sl = slots(f), out = di.querySelector(".sd-count"), so = di.querySelector(".sd-slots");
    if (f.split.checked) so.textContent = sl.length ? sl.length + " slot" + (sl.length === 1 ? "" : "s") + ": " + sl.slice(0, 3).map(function (x) { return x[0] + "–" + x[1]; }).join(", ") + (sl.length > 3 ? " … " + sl[sl.length - 1][0] + "–" + sl[sl.length - 1][1] : "") : "Set a start and end time first.";
    var d = dayCount(f), total = d * (sl.length || 1);
    if (mode === "weekly" && !d) out.textContent = f.date.value && f.until.value ? "No dates match those days." : "Pick the days and an end date.";
    else if (mode === "dates" && !d) out.textContent = "Tap the days on the calendar.";
    else out.textContent = total > 200 ? "That's " + total + " sessions; 200 is the most at once." : total > 1 ? "This will create " + total + " sessions" + (sl.length > 1 && d > 1 ? " (" + d + " days × " + sl.length + " slots)" : "") + "." : "";
  }
  var calF = di.querySelector(".cal-pick"); if (calF) calPick(calF, di.querySelector("[name=dates]"), repCount);
  di.addEventListener("change", function (e) {
    var f = di.querySelector("form");
    if (e.target.name === "when_mode" && e.target.value === "weekly" && f.date.value && ![].some.call(f.querySelectorAll("[name=days]"), function (c) { return c.checked; })) {
      var wd = new Date(Date.parse(f.date.value + "T12:00:00Z")).getUTCDay(); f.querySelector('[name=days][value="' + wd + '"]').checked = true; }
    if (e.target.name === "when_mode" && e.target.value === "dates" && calF && f.date.value && !calF._cal.size()) calF._cal.set([f.date.value], f.date.value);
    repCount();
  });
  di.addEventListener("input", function (e) { if (/^(start_time|end_time|date|until)$/.test(e.target.name)) repCount(); });
  // session form: friendly checks before sending
  di.querySelector("form").addEventListener("submit", function (e) {
    var f = e.target, err = di.querySelector(".sd-err"), msg = "";
    if (f.date) { var mode = modeOf(f), needDate = mode !== "dates", any = (needDate && f.date.value) || f.start_time.value || f.end_time.value;
      if (mode === "dates" && !f.dates.value) msg = "Tap at least one day on the calendar.";
      else if (mode === "dates" && !(f.start_time.value && f.end_time.value)) msg = "Fill in the start and end times.";
      else if (any && !((needDate ? f.date.value : true) && f.start_time.value && f.end_time.value)) msg = "For a date and time, fill in the date, start, and end (or leave all three empty).";
      else if (any && f.end_time.value <= f.start_time.value) msg = "The end time needs to be after the start time.";
      else if (!any && mode !== "dates" && !f.title.value.trim()) msg = "Give it a name, or a date and time.";
      else if (f.split && f.split.checked && !slots(f).length) msg = "The time range is shorter than one slot.";
      else if (mode === "weekly" && /No dates|Pick the days/.test(di.querySelector(".sd-count").textContent)) msg = di.querySelector(".sd-count").textContent;
      else if (/200 is the most/.test(di.querySelector(".sd-count").textContent)) msg = di.querySelector(".sd-count").textContent; }
    if (msg) { e.preventDefault(); err.textContent = msg; err.hidden = false; }
  });
  // Copy a day
  var dc = document.getElementById("dlg-copyday");
  if (dc) {
    var cf = dc.querySelector("form"), calC = calPick(dc.querySelector(".cal-pick"), cf.to, cdCount), fromSel = cf.from, dayN = {};
    function cdCount() { var n = calC.size(), per = dayN[fromSel.value] || 0; dc.querySelector(".cd-count").textContent = fromSel.value && n ? "This will add up to " + per * n + " session" + (per * n === 1 ? "" : "s") + " (" + per + " on " + n + " day" + (n === 1 ? "" : "s") + ")." : ""; }
    function loadDays() {
      var scope = cf.querySelector("[name=scope]:checked").value;
      fetch("/admin/b/" + sid + "/days?node=" + encodeURIComponent(cf.node_id.value) + "&scope=" + scope, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (j) {
        dayN = {}; fromSel.innerHTML = j.days.length ? '<option value="">Pick a day…</option>' + j.days.map(function (d) { dayN[d.day] = d.n; var dt = new Date(d.day + "T12:00:00");
          return '<option value="' + d.day + '">' + dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " (" + d.n + ")</option>"; }).join("") : '<option value="">No days with sessions yet</option>';
        cdCount(); });
    }
    document.addEventListener("click", function (e) { var t = e.target.closest("[data-copy-day]"); if (!t) return;
      cf.reset(); cf.node_id.value = t.dataset.copyDay || ""; dc.querySelector(".cd-level").textContent = t.dataset.copyDay ? nameOf(t.dataset.copyDay) : "this board";
      calC.set([]); dc.querySelector(".sd-err").hidden = true; loadDays(); dc.showModal(); });
    cf.addEventListener("change", function (e) { if (e.target.name === "scope") loadDays(); if (e.target.name === "from" && e.target.value) calC.set(calC.size() ? cf.to.value.split(",") : [], e.target.value); cdCount(); });
    cf.addEventListener("submit", function (e) { var err = dc.querySelector(".sd-err"), msg = !fromSel.value ? "Pick the day to copy." : !cf.to.value ? "Tap at least one day to copy it to." : "";
      if (msg) { e.preventDefault(); err.textContent = msg; err.hidden = false; } });
  }
  // search: show matching levels (and the path to them)
  var q = document.querySelector(".spt-search input");
  q.addEventListener("input", function () {
    var v = q.value.trim().toLowerCase(), lis = document.querySelectorAll(".spt .tn[data-id]");
    lis.forEach(function (li) { li.classList.remove("hit", "hide"); });
    if (!v) { lis.forEach(function (li) { li.classList.toggle("open", !!open[li.dataset.id]); }); openPath(); return; }
    lis.forEach(function (li) { li.classList.add("hide"); });
    lis.forEach(function (li) { if (li.dataset.name.indexOf(v) >= 0) { li.classList.add("hit"); li.classList.remove("hide"); var p = li.parentElement.closest(".tn[data-id]"); while (p) { p.classList.remove("hide"); p.classList.add("open"); p = p.parentElement.closest(".tn[data-id]"); }
      li.querySelectorAll(".tn[data-id]").forEach(function (k) { k.classList.remove("hide"); }); } });
  });
})();`;

module.exports = { setupPage, panels, boardHeader, headerData };
