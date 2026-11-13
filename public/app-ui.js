// App-wide behavior: 1) click a table heading to sort by it (remembered per table); 2) after you change something,
// the page comes back to where you were instead of jumping to the top.
(function () {
  var KEY = location.pathname + location.search.replace(/[?&](ok|err)=[^&]*/g, "");
  // ---------- 1. sortable tables ----------
  var SKIP = "table.levels, table.limits, table.imp-rt, table[data-nosort]";   // editing grids (row order is saved) and the import review
  var YEAR = new Date().getFullYear();
  function cellValue(td) {
    if (!td) return "";
    if (td.dataset && td.dataset.sort != null) return td.dataset.sort;
    var c = td.querySelector("input[type=checkbox]"); if (c && td.innerText.trim() === "") return c.checked ? "1" : "0";
    return td.innerText.replace(/\s+/g, " ").trim();
  }
  function asDate(s) {
    var t = s.split(/\s[–-]\s|–/)[0].replace(/\bat\b/, "").trim(); if (!/[A-Za-z]{3}/.test(t) || !/\d/.test(t)) return NaN;
    var d = Date.parse(t); if (isNaN(d) || !/\d{4}/.test(t)) { var d2 = Date.parse(t + " " + YEAR); if (!isNaN(d2)) d = d2; }
    return d;
  }
  function compare(a, b) {
    if (!a && !b) return 0; if (!a || a === "—") return 1; if (!b || b === "—") return -1;   // blanks last, either direction
    var da = asDate(a), db = asDate(b); if (!isNaN(da) && !isNaN(db)) return da - db;
    var na = /^-?[\d,.]+%?$/.test(a) ? parseFloat(a.replace(/,/g, "")) : NaN, nb = /^-?[\d,.]+%?$/.test(b) ? parseFloat(b.replace(/,/g, "")) : NaN;
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }
  function sortTable(table, col, dir, save) {
    var body = table.tBodies[0]; if (!body) return;
    var rows = [].slice.call(body.rows).filter(function (r) { return r.cells.length > col; });
    var keyed = rows.map(function (r, i) { return { r: r, v: cellValue(r.cells[col]), i: i }; });
    keyed.sort(function (x, y) { var c = compare(x.v, y.v); if (!x.v || !y.v || x.v === "—" || y.v === "—") return c || x.i - y.i; return (dir === "desc" ? -c : c) || x.i - y.i; });
    keyed.forEach(function (k) { body.appendChild(k.r); });
    [].forEach.call(table.tHead.rows[0].cells, function (th, i) { th.classList.toggle("sort-asc", i === col && dir === "asc"); th.classList.toggle("sort-desc", i === col && dir === "desc"); th.setAttribute("aria-sort", i === col ? (dir === "asc" ? "ascending" : "descending") : "none"); });
    if (save) try { sessionStorage.setItem("sort:" + KEY + ":" + table.dataset.sortId, JSON.stringify([col, dir])); } catch (e) {}
  }
  var n = 0;
  [].forEach.call(document.querySelectorAll("table"), function (table) {
    if (table.matches(SKIP) || !table.tHead || !table.tHead.rows.length || !table.tBodies[0]) return;
    table.dataset.sortId = String(n++); table.classList.add("sortable");
    [].forEach.call(table.tHead.rows[0].cells, function (th, i) {
      var label = th.innerText.trim(); if (!label || th.querySelector("input")) return;   // the checkbox column, empty headings
      th.classList.add("sort-th"); th.tabIndex = 0; th.title = "Sort by " + label;
      var go = function () { var dir = th.classList.contains("sort-asc") ? "desc" : "asc"; sortTable(table, i, dir, true); };
      th.addEventListener("click", function (e) { if (e.target.closest("a, button, input, select")) return; go(); });
      th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    try { var saved = JSON.parse(sessionStorage.getItem("sort:" + KEY + ":" + table.dataset.sortId) || "null"); if (saved) sortTable(table, saved[0], saved[1], false); } catch (e) {}
  });
  // ---------- 1b. what stays on screen while you scroll, screen by screen ----------
  // Each screen lists what sticks, top to bottom (each right under the one above). Everything else scrolls behind.
  // "band" = the page's navy title band. "head" = the column headings of the page's table. Phones keep less.
  var qs = new URLSearchParams(location.search), path = location.pathname;
  var SCREENS = [
    [/^\/admin\/settings\/?$/, ["band", ".bh2-tabs.dash-tabs"]],                                   // All Boards
    [/^\/admin\/people\/?$/, ["band", ".app-tabs", ".dir-filters-bar"]],                            // People
    [/^\/admin\/setup\/new/, ["band", ".wz-tabs"]],                                                 // Create Board
    [/^\/admin\/setup\/schedules\/\d+\/copy/, ["band", ".cp-gbar"]],                              // Duplicate
    [/^\/admin\/(setup\/?$|setup\/schedule(\?|$)|setup\/notifications|members|b\/)/, ["band", ".board-tabs", ".sub-tabs"]],   // a board's screens
    [/^\/(admin\/(people|requests|signins|activity|email-log|online|settings\/app)|shadow)/, ["band", ".app-tabs", ".sub-tabs", "head"]],   // other App Settings
    [/^\/reports/, ["band", ".r-gbar", ".sub-tabs", "head"]],                                        // Reports
    [/^\/checkin\/i\//, ["band", ".ck-gbar", ".ck-listbar"]],                                       // a session's check-in
    [/^\/checkin/, ["band", ".ck-gbar"]],                                                          // Check-in day
    [/^\/dashboard/, ["band", ".d-filt"]],                                                         // My Claims
    [/^\/account/, ["band", ".a-tabs-main", ".a-subs"]],                                           // My Account
    [/^\//, ["band"]]                                                                              // anything else
  ];
  var PHONE_KEEP = {};   // phones: nothing sticks (one plain scroll is far easier with a thumb)
  var plan = (SCREENS.filter(function (r) { return r[0].test(path); })[0] || [0, ["band"]])[1];
  var bandEl = [].slice.call(document.querySelectorAll(".bh2")).filter(function (e) { return !e.closest("header, dialog"); })[0];
  if (bandEl) bandEl.classList.add("page-band");
  if (plan.indexOf(".dir-filters-bar") >= 0) document.documentElement.classList.add("stick-filters");   // People: its toolbar lets the filters row through
  function pieces(sel) {
    if (sel === "band") return bandEl ? [bandEl] : [];
    if (sel === "head") return [].concat.apply([], [].slice.call(document.querySelectorAll("table.sortable")).filter(function (t) { return t.tHead && t.offsetParent; }).map(function (t) { return [].slice.call(t.tHead.rows[0].cells); }));
    var e = [].slice.call(document.querySelectorAll(sel)).filter(function (x) { return x.offsetParent && x !== bandEl; })[0]; return e ? [e] : [];
  }
  function stick() {
    var header = document.querySelector("header.dh"), top = header && getComputedStyle(header).position === "sticky" ? header.offsetHeight + (parseFloat(getComputedStyle(header).top) || 0) : 0;   // below the top bar (and a staging stripe above it)
    var phone = window.innerWidth <= 760;
    document.querySelectorAll(".stuck").forEach(function (e) { e.classList.remove("stuck"); e.style.top = ""; e.style.zIndex = ""; });
    document.querySelectorAll(".table-wrap.head-stuck").forEach(function (w) { w.classList.remove("head-stuck"); });
    plan.forEach(function (sel, i) {
      if (phone && !PHONE_KEEP[sel]) return;
      var els = pieces(sel); if (!els.length) return;
      if (sel === "head") els.forEach(function (th) { var w = th.closest(".table-wrap"); if (w) w.classList.add("head-stuck"); });
      els.forEach(function (e) { e.classList.add("stuck"); e.style.top = top + "px"; e.style.zIndex = String(40 - i); });
      if (sel !== "head") top += els[0].offsetHeight;
    });
  }
  stick(); window.addEventListener("resize", stick); window.addEventListener("load", stick);
  // once you scroll, the logo tucks inside the top bar (so it never covers the page)
  function scrolled() { document.documentElement.classList.toggle("scrolled", window.scrollY > 4); }
  scrolled(); window.addEventListener("scroll", scrolled, { passive: true });
  // a "↑ Top" button once you're far down a long page
  var up = document.createElement("button"); up.type = "button"; up.className = "to-top"; up.textContent = "↑ Top"; up.setAttribute("aria-label", "Back to the top");
  up.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.body.appendChild(up);
  window.addEventListener("scroll", function () { up.classList.toggle("on", window.scrollY > window.innerHeight * 1.5); }, { passive: true });
  // ---------- 1c. Add to calendar menus float above the page (lists that scroll in their own box, and cards, would cut them off) ----------
  function menuOf(d) { if (!d._menu) { d._menu = d.querySelector(".cal-menu"); d._menu.hidden = true; document.body.appendChild(d._menu); } return d._menu; }   // on the page itself
  function closeCal(except) { document.querySelectorAll("details.cal-add[open]").forEach(function (d) { if (d !== except) { d.open = false; menuOf(d).hidden = true; } }); }
  document.addEventListener("toggle", function (e) {
    var d = e.target; if (!d.matches || !d.matches("details.cal-add")) return;
    var m = menuOf(d); if (!d.open) { m.hidden = true; return; }
    closeCal(d); m.hidden = false; var r = d.querySelector("summary").getBoundingClientRect();
    m.style.left = "0px"; m.style.top = "0px"; var w = m.offsetWidth, h = m.offsetHeight, x = r.right - w, y = r.bottom + 6;
    if (x < 8) x = Math.min(r.left, window.innerWidth - w - 8); if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    m.style.left = Math.round(x) + "px"; m.style.top = Math.round(y) + "px";
  }, true);
  document.addEventListener("click", function (e) { if (!e.target.closest("details.cal-add, .cal-menu")) closeCal(); if (e.target.closest(".cal-menu a")) setTimeout(closeCal, 50); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCal(); });
  document.addEventListener("scroll", function (e) { if (!(e.target.closest && e.target.closest(".cal-menu"))) closeCal(); }, true); window.addEventListener("resize", function () { closeCal(); });
  // ---------- 1d. phones: a tab row becomes one button ("Board setup ▾") that opens the list of sections ----------
  // Each item clicks the original tab, so links and same-page tabs work exactly as before. Rows that aren't tabs
  // (Check-in's day bar, Reports' and Duplicate's bars, the Create Board steps, Signing up for) are left alone.
  var TABROWS = "nav.board-tabs, nav.app-tabs, nav.a-tabs-main, nav.sub-tabs, nav.bh2-tabs.dash-tabs:not(.ck-gbar):not(.cp-gbar):not(.r-gbar):not(.wz-tabs):not(.b-whobar)";
  function tabItems(nav) { return [].slice.call(nav.querySelectorAll(":scope > a, :scope > button, :scope > span > a")).filter(function (x) { return x.textContent.trim(); }); }
  function isCurrent(x) { return x.getAttribute("aria-current") === "page" || x.classList.contains("on") || x.classList.contains("active") || x.classList.contains("now"); }
  function tabMenus() {
    var phone = window.innerWidth <= 760;
    [].forEach.call(document.querySelectorAll(TABROWS), function (nav) {
      var items = tabItems(nav), dd = nav.previousElementSibling && nav.previousElementSibling.classList.contains("tab-dd") ? nav.previousElementSibling : null;
      var want = phone && items.length >= 2 && (items.length >= 3 || nav.scrollWidth > nav.clientWidth + 2);
      if (!want) { if (dd) dd.remove(); nav.classList.remove("tab-dd-hidden"); return; }
      var cur = items.filter(isCurrent)[0] || items[0];
      if (!dd) { dd = document.createElement("details"); dd.className = "tab-dd"; nav.parentNode.insertBefore(dd, nav); }
      dd.className = "tab-dd" + (nav.classList.contains("sub-tabs") ? " tab-dd-sub" : "");
      dd.innerHTML = "<summary></summary><div class=\"tab-dd-menu\" role=\"menu\"></div>";
      dd.querySelector("summary").innerHTML = "<span class=\"tab-dd-cur\"></span><span class=\"tab-dd-n\">" + items.length + " sections</span><span class=\"tab-dd-car\" aria-hidden=\"true\">▾</span>";
      dd.querySelector(".tab-dd-cur").innerHTML = cur.innerHTML;
      var menu = dd.querySelector(".tab-dd-menu");
      items.forEach(function (x) {
        var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem"); b.innerHTML = x.innerHTML;
        if (x === cur) { b.className = "on"; b.setAttribute("aria-current", "page"); }
        b.addEventListener("click", function () { dd.open = false; if (x !== cur || x.dataset.sub) x.click(); setTimeout(tabMenus, 60); });
        menu.appendChild(b);
      });
      nav.classList.add("tab-dd-hidden");
    });
  }
  tabMenus(); window.addEventListener("resize", tabMenus);
  document.addEventListener("click", function (e) { if (!e.target.closest(".tab-dd")) [].forEach.call(document.querySelectorAll(".tab-dd[open]"), function (d) { d.open = false; }); });
  // ---------- 1e. phones: wide tables become cards (each row a card; "Label: value" lines from the table's own headings) ----------
  // Skips tables that are already phone-friendly or are really grids. Tables added later (Show more, live refresh) are handled too.
  var SKIP_CARDS = ".dir2, .r-grid, .cal-pick, .cal-month, .as-grid, [data-nocards], .ck-roster, .b-cal";
  function cardify(root) {
    if (window.innerWidth > 760) return;
    [].forEach.call((root || document).querySelectorAll("table"), function (t) {
      if (t.matches(SKIP_CARDS) || t.closest("[data-nocards]") || !t.tHead) return;
      var heads = [].map.call(t.tHead.rows[0].cells, function (c) { return (c.innerText || "").replace(/\s+/g, " ").trim(); });
      [].forEach.call(t.tBodies, function (tb) { [].forEach.call(tb.rows, function (tr) { [].forEach.call(tr.cells, function (td, i) {
        if (!td.hasAttribute("data-label")) td.setAttribute("data-label", heads[i] || "");
        if (!td.innerText.trim() || td.innerText.trim() === "—") td.classList.add("cd-empty");
      }); }); });
      t.classList.add("cards");
    });
  }
  cardify(); window.addEventListener("resize", function () { cardify(); });
  if (window.MutationObserver) new MutationObserver(function (m) { m.forEach(function (x) { [].forEach.call(x.addedNodes, function (n) { if (n.nodeType === 1 && (n.tagName === "TABLE" || n.querySelector && n.querySelector("table"))) cardify(n.tagName === "TABLE" ? n.parentNode : n); }); }); })
    .observe(document.body, { childList: true, subtree: true });
  // ---------- 1f. phones: filters fold behind one "Filters" button; long card lists show 20 at a time; Board setup's side panels fold ----------
  var PHONE = window.innerWidth <= 760;
  function activeCount(box) {
    var n = 0;
    [].forEach.call(box.querySelectorAll("input, select"), function (e) {
      if (e.disabled || e.type === "hidden" || e.type === "submit" || e.type === "button") return;
      if (e.type === "checkbox" || e.type === "radio") { if (e.checked && e.type === "checkbox") n++; return; }
      if (e.tagName === "SELECT") { if (e.selectedIndex > 0) n++; return; }
      if (e.value && e.name !== "from" && e.name !== "to" && e.name !== "week") n++;
    });
    return n;
  }
  if (PHONE) {
    [].forEach.call(document.querySelectorAll(".act-f, .dir-filters-bar, .r-filters"), function (f) {
      if (f.closest(".flt") || f.closest("dialog")) return;
      var d = document.createElement("details"), sm = document.createElement("summary"), n = activeCount(f);
      d.className = "flt"; sm.innerHTML = '<span class="flt-ic" aria-hidden="true">⚙</span> Filters' + (n ? ' <b class="flt-n">' + n + ' on</b>' : "") + '<span class="flt-car" aria-hidden="true">▾</span>';
      d.appendChild(sm); f.parentNode.insertBefore(d, f); d.appendChild(f);
    });
    // Reports: the two filter strips share one button
    var strips = document.querySelectorAll(".flt > .r-filters");
    if (strips.length > 1) { var first = strips[0].parentNode; for (var i = 1; i < strips.length; i++) { var other = strips[i].parentNode; first.appendChild(strips[i]); other.remove(); }
      var n2 = activeCount(first); first.querySelector("summary").innerHTML = '<span class="flt-ic" aria-hidden="true">⚙</span> Filters' + (n2 ? ' <b class="flt-n">' + n2 + ' on</b>' : "") + '<span class="flt-car" aria-hidden="true">▾</span>'; }
    // long card lists: 30 at a time
    [].forEach.call(document.querySelectorAll("table.cards"), function (t) {
      [].forEach.call(t.tBodies, function (tb) {
        var rows = [].slice.call(tb.rows); if (rows.length <= 25) return;
        rows.forEach(function (r, i) { if (i >= 20) r.classList.add("more-hid"); });
        var b = document.createElement("button"); b.type = "button"; b.className = "sb-btn more-btn";
        var left = function () { return tb.querySelectorAll("tr.more-hid").length; };
        var label = function () { b.textContent = "Show " + Math.min(20, left()) + " more (" + left() + " left)"; };
        label(); b.addEventListener("click", function () { [].slice.call(tb.querySelectorAll("tr.more-hid"), 0, 20).forEach(function (r) { r.classList.remove("more-hid"); }); if (left()) label(); else b.remove(); });
        (t.closest(".table-wrap") || t).insertAdjacentElement("afterend", b);
      });
    });
    // Board setup with a level open: the tree and the level settings fold, so the sessions come first
    if (document.querySelector(".sp3-center")) {
      [[".sp3-tree", "Board structure", /[?&]n=\d/.test(location.search)], [".sp3-right", null, true]].forEach(function (x) {
        var el = document.querySelector(x[0]); if (!el) return;
        var h = el.querySelector(".sp-card-h b, .sp-card-h h2, h2, h3"), name = x[1] || (h ? h.textContent.trim() : "Settings");
        var t = document.createElement("button"); t.type = "button"; t.className = "ph-fold-h"; t.setAttribute("aria-expanded", String(!x[2]));
        t.innerHTML = '<span>' + name.replace(/[<>&]/g, "") + '</span><span aria-hidden="true">▾</span>';
        el.classList.add("ph-fold"); if (x[2]) el.classList.add("ph-closed"); el.insertBefore(t, el.firstChild);
        t.addEventListener("click", function () { var c = el.classList.toggle("ph-closed"); t.setAttribute("aria-expanded", String(!c)); });
      });
    }
  }
  // ---------- 2. keep your place after a change ----------
  function scrollers() { return [].slice.call(document.querySelectorAll(".table-wrap, .sh-list, .imp-dlg-body, .ck-scroll, .rv-cols, [data-keep-scroll]")); }
  var PLACE = "place:" + location.pathname;   // the page you come back to after a change may have a different ?query
  function remember(f) {
    if (!f || String(f.getAttribute("method") || "get").toLowerCase() !== "post") return;
    try { sessionStorage.setItem(PLACE, JSON.stringify({ y: window.scrollY, s: scrollers().map(function (el) { return el.scrollTop; }), t: Date.now() })); } catch (x) {}
  }
  document.addEventListener("submit", function (e) { if (!e.defaultPrevented) remember(e.target); }, true);
  var nativeSubmit = HTMLFormElement.prototype.submit;   // forms sent from a script (e.g. Apply) skip the submit event
  HTMLFormElement.prototype.submit = function () { remember(this); return nativeSubmit.apply(this, arguments); };
  function restore() {
    var raw; try { raw = sessionStorage.getItem(PLACE); sessionStorage.removeItem(PLACE); } catch (x) {}
    var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!raw || target) return;   // a change meant to jump to something on the page (#…) wins
    var p = JSON.parse(raw); if (Date.now() - p.t > 2 * 60e3) return;
    var put = function () { window.scrollTo(0, p.y); var els = scrollers(); (p.s || []).forEach(function (v, i) { if (els[i]) els[i].scrollTop = v; }); };
    put(); setTimeout(put, 60); setTimeout(put, 250);   // again after the page's own "show the message" scroll
  }
  if (document.readyState === "complete") restore(); else window.addEventListener("load", restore);
})();
