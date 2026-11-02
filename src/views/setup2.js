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
        <span>${t ? `${esc(word(lvl).one)} · ` : ""}${plural(c.items, L.slot)} · ${c.spots} total spots · ${c.claimed} claimed</span></div>
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
        <span class="ss-fill"><b>${it.claimed} / ${it.capacity}</b> claimed${it.waitlisted ? ` · ${it.waitlisted} waiting` : ""}
          <span class="ss-bar"><i style="width:${Math.min(100, pct)}%"></i></span><small>${it.capacity - it.claimed > 0 ? `${it.capacity - it.claimed} open` : "Full"} · ${pct}%</small></span>
        <span class="ss-acts"><a class="sb-btn sm ic" href="/admin/b/${sc.id}/items/${it.id}/people" title="People: see, add, or remove" aria-label="People">${IC.people}</a>
          ${locked ? "" : `<button type="button" class="sb-btn sm ic" title="Edit" aria-label="Edit" data-item='${esc(JSON.stringify({ id: it.id, node: it.node_id || "", title: it.title, capacity: it.capacity, location: it.location || "", date: st ? st.date : "", start: st ? st.time : "", end: en ? en.time : "" }))}'>${IC.edit}</button>
          <button type="button" class="sb-btn sm ic" title="Duplicate, then change what's different" aria-label="Duplicate" data-dup='${esc(JSON.stringify({ node: it.node_id || "", title: it.title, capacity: it.capacity, location: it.location || "", date: st ? st.date : "", start: st ? st.time : "", end: en ? en.time : "" }))}'>${IC.copy}</button>
          <button type="button" class="sb-btn sm ic danger" title="Delete" data-del-item="${it.id}" data-name="${esc(slotName(it))}" data-claims="${it.claimed + it.waitlisted}" aria-label="Delete">${IC.trash}</button>`}</span></li>`;
    };
    body = `<section class="sp-card"><div class="sp-card-h">${IC.clock}<b>${esc(L.slot.many)}</b><span class="fine">(spots to claim)</span>
        ${locked ? "" : `<button type="button" class="sb-btn primary" data-add-item="${t ? t.node.id : ""}">${IC.plus}Add ${esc(L.slot.one.toLowerCase())}</button>`}</div>
      ${items.length ? `<ul class="ss-list">${items.map(row).join("")}</ul>` : `<div class="sp-empty">${IC.clock}<b>No ${esc(L.slot.many.toLowerCase())} yet.</b><span>Add one, and people can start claiming it once the board is published.</span></div>`}</section>`;
  } else {
    body = `<section class="sp-card"><div class="sp-card-h">${LEVEL_IC[(lvl + 1) % LEVEL_IC.length]}<b>${esc(childW.many)}</b><span class="fine">in ${esc(t ? t.node.name : "this board")}</span>
        ${locked ? "" : `<button type="button" class="sb-btn primary" data-add-node="${t ? t.node.id : ""}" data-word="${esc(childW.one)}">${IC.plus}Add ${esc(childW.one.toLowerCase())}</button>`}</div>
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
      <form method="post" action="/admin/b/${sc.id}/nodes/${t.node.id}" class="st-name"><label>${esc(word(lvl).one)} name<span class="st-name-row"><input name="name" value="${esc(t.node.name)}" maxlength="60" required${locked ? " disabled" : ""}>${locked ? "" : `<button class="sb-btn" type="submit">Save</button>`}</span></label></form>
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
          <span class="tn-c" title="${t.count.claimed} claimed of ${t.count.spots} spots">${t.count.spots ? `${t.count.claimed}/${t.count.spots}` : ""}</span></a>
        ${locked ? "" : `<span class="tn-more"><button type="button" class="tn-dots" aria-label="More for ${esc(t.node.name)}">⋯</button>
          <span class="tn-menu" hidden>
            ${holds ? `<button type="button" data-add-item="${t.node.id}">${IC.plus}Add ${esc(L.slot.one.toLowerCase())}</button>` : `<button type="button" data-add-node="${t.node.id}" data-word="${esc(childW.one)}">${IC.plus}Add ${esc(childW.one.toLowerCase())}</button>`}
            <button type="button" data-rename="${t.node.id}" data-name="${esc(t.node.name)}">${IC.edit}Rename</button>
            <button type="button" data-dup-node="${t.node.id}" data-name="${esc(t.node.name)}">${IC.copy}Duplicate</button>
            <button type="button" data-settings="${t.node.id}">${IC.gear}Settings</button>
            <button type="button" class="danger" data-delete="${t.node.id}" data-name="${esc(t.node.name)}">${IC.trash}Delete</button></span></span>`}</div>
      ${t.kids.length ? `<ul>${t.kids.map((k) => node(k, lvl + 1)).join("")}</ul>` : ""}</li>`;
  };
  const shareUrl = sc.share_code ? `${process.env.APP_URL || ""}/s/${sc.share_code}` : "";
  const header = `<section class="bh2">
    <div class="bh2-l">${sc.image ? `<span class="d-thumb photo bh2-tile"><img src="/img/board/${sc.id}?v=${sc.image_at ? new Date(sc.image_at).getTime() : 0}" alt=""></span>` : `<span class="d-thumb code bh2-tile"><b>${esc(require("./setup").codeOf(sc))}</b></span>`}
      <div><div class="bh2-t"><h1>${esc(sc.name)}</h1><span class="bh2-st ${locked ? "arch" : published ? "pub" : "draft"}">${locked ? "Archived" : published ? "Published" : "Draft"}</span></div>
        <span class="bh2-meta">${depth > 1 ? `${plural(tree.length, word(0))} · ` : ""}${plural(totals.items, L.slot)} · ${totals.spots} total spots · ${totals.claimed} claimed (${pct}%)${sc.event_location ? ` · ${IC.pin}${P.link(sc.event_location)}` : ""}</span></div></div>
    <div class="bh2-acts">
      <a class="sb-btn" href="${published ? (SC.claimMode(sc) === "public" && shareUrl ? shareUrl : `/b/${sc.id}`) : `/b/${sc.id}`}" target="_blank" rel="noopener">${IC.eye}Preview</a>
      ${published && SC.claimMode(sc) === "public" && shareUrl ? `<details class="share-pop"><summary class="sb-btn">Share</summary><div class="share-panel">
          <p class="fine">Anyone with this link can sign up, no account needed.</p>
          <div class="share-row"><input readonly value="${esc(shareUrl)}" class="share-url" onclick="this.select()"><button type="button" class="btn-small" onclick="var i=this.previousElementSibling; i.select(); navigator.clipboard && navigator.clipboard.writeText(i.value); this.textContent='Copied'">Copy</button></div>
          <div class="share-qr"><img src="/admin/b/${sc.id}/qr.svg" alt="QR code" width="140" height="140"><span><a class="btn-ghost" href="/admin/b/${sc.id}/qr.svg?download=1">Download QR code</a></span></div></div></details>` : ""}
      <a class="sb-btn" href="/admin/setup/schedules/${sc.id}/copy">${IC.copy}Duplicate</a>
      ${locked ? "" : `<form method="post" action="/admin/b/${sc.id}/publish" onsubmit="return confirm(${esc(JSON.stringify(published ? `Unpublish ${sc.name}? People won't see it until you publish again. Claims are kept.` : `Publish ${sc.name}? People who can claim will be able to see it.`))})">
        <button class="sb-btn ${published ? "" : "primary"}" type="submit">${published ? "Unpublish" : "Publish"}</button></form>`}</div>
  </section>
  <nav class="bh2-tabs"><a aria-current="page" href="/admin/setup?s=${sc.id}">${IC.gear}Board setup</a><a href="/admin/settings?from=setup#edit-${sc.id}">${IC.board}Board details</a>
    <a href="/admin/members?s=${sc.id}">${IC.people}Access &amp; people</a><a href="/admin/setup/schedule?s=${sc.id}">${IC.edit}Board defaults</a></nav>`;
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
    <dialog class="edit-dlg sd" id="dlg-node"><form method="post" class="stack"><input type="hidden" name="parent_id">
      <div class="dlg-head"><h2></h2><button type="button" class="dlg-x" data-close>×</button></div>
      <label>Name<input name="name" required maxlength="60" autocomplete="off"></label>
      <div class="q-actions"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-small" type="submit">Save</button></div></form></dialog>
    <dialog class="edit-dlg sd" id="dlg-item"><form method="post" class="stack"><input type="hidden" name="node_id">
      <div class="dlg-head"><h2></h2><button type="button" class="dlg-x" data-close>×</button></div>
      ${SC.usesCalendar(sc) ? `<div class="sd-row"><label>Date<input type="date" name="date"></label><label>Start<input type="time" name="start_time"></label><label>End<input type="time" name="end_time"></label></div>` : ""}
      <label><span>Name ${SC.usesCalendar(sc) ? `<span class="opt">(optional when it has a date)</span>` : ""}</span><input name="title" maxlength="80" placeholder="e.g. Lower field"></label>
      <div class="sd-row"><label>Spots<input type="number" name="capacity" min="1" max="500" required></label><label><span>Location <span class="opt">(optional)</span></span><input name="location" list="app-locations" maxlength="80"></label></div>
      ${SC.usesCalendar(sc) ? `<fieldset class="sd-rep"><label class="radio-row"><input type="checkbox" name="repeat" value="1"> <b>Repeat weekly</b></label>
        <div class="sd-rep-b" hidden><div class="sd-days">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => `<label><input type="checkbox" name="days" value="${i}"><span>${d}</span></label>`).join("")}</div>
          <label>Until<input type="date" name="until"></label><p class="sd-count fine"></p></div></fieldset>` : ""}
      <p class="fine sd-err" hidden></p>
      <div class="q-actions"><button type="button" class="btn-ghost" data-close>Cancel</button><button class="btn-small" type="submit">Save</button></div></form></dialog>
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
    if (t.matches(".tn-dots")) { var m = t.nextElementSibling, was = m.hidden; document.querySelectorAll(".tn-menu").forEach(function (x) { x.hidden = true; }); m.hidden = !was; return; }
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
      var rep = di.querySelector(".sd-rep"); if (rep) { rep.hidden = !!it; rep.querySelector(".sd-rep-b").hidden = true; }
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
  // Repeat weekly: show the days (starting with the date's weekday) and how many sessions it will make
  function repCount() {
    var f = di.querySelector("form"); if (!f.repeat) return; var box = di.querySelector(".sd-rep-b"), out = di.querySelector(".sd-count");
    box.hidden = !f.repeat.checked; if (!f.repeat.checked) return;
    var days = [].filter.call(f.querySelectorAll("[name=days]"), function (c) { return c.checked; }).map(function (c) { return +c.value; });
    if (!f.date.value || !f.until.value || !days.length) { out.textContent = "Pick the days and an end date."; return; }
    var n = 0, a = Date.parse(f.date.value + "T12:00:00Z"), b = Date.parse(f.until.value + "T12:00:00Z");
    for (var t = a; t <= b && n < 201; t += 864e5) if (days.indexOf(new Date(t).getUTCDay()) >= 0) n++;
    out.textContent = b < a ? "The end date is before the first date." : n ? "This will create " + Math.min(n, 200) + " session" + (n === 1 ? "" : "s") + "." : "No dates match those days.";
  }
  di.addEventListener("change", function (e) {
    var f = di.querySelector("form");
    if (e.target.name === "repeat" && e.target.checked && f.date.value && ![].some.call(f.querySelectorAll("[name=days]"), function (c) { return c.checked; })) {
      var wd = new Date(Date.parse(f.date.value + "T12:00:00Z")).getUTCDay(); f.querySelector('[name=days][value="' + wd + '"]').checked = true; }
    if (/^(repeat|days|until|date)$/.test(e.target.name)) repCount();
  });
  // session form: friendly checks before sending
  di.querySelector("form").addEventListener("submit", function (e) {
    var f = e.target, err = di.querySelector(".sd-err"), msg = "";
    if (f.date) { var any = f.date.value || f.start_time.value || f.end_time.value;
      if (any && !(f.date.value && f.start_time.value && f.end_time.value)) msg = "For a date and time, fill in the date, start, and end (or leave all three empty).";
      else if (any && f.end_time.value <= f.start_time.value) msg = "The end time needs to be after the start time.";
      else if (!any && !f.title.value.trim()) msg = "Give it a name, or a date and time.";
      else if (f.repeat && f.repeat.checked) { var dd = [].some.call(f.querySelectorAll("[name=days]"), function (c) { return c.checked; });
        if (!f.date.value) msg = "Repeating needs a first date and times."; else if (!dd || !f.until.value) msg = "For a repeat, pick the days and an end date.";
        else if (/No dates|before/.test(di.querySelector(".sd-count").textContent)) msg = di.querySelector(".sd-count").textContent; } }
    if (msg) { e.preventDefault(); err.textContent = msg; err.hidden = false; }
  });
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

module.exports = { setupPage, panels };
