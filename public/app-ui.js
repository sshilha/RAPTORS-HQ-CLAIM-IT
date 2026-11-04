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
    [/^\/(admin\/(people|requests|signins|settings\/app)|shadow)/, ["band", ".app-tabs", ".sub-tabs", "head"]],   // other App Settings
    [/^\/reports/, ["band", ".r-gbar", ".sub-tabs", "head"]],                                        // Reports
    [/^\/checkin\/i\//, ["band", ".ck-gbar", ".ck-listbar"]],                                       // a session's check-in
    [/^\/checkin/, ["band", ".ck-gbar"]],                                                          // Check-in day
    [/^\/dashboard/, ["band", ".d-filt"]],                                                         // My Claims
    [/^\/account/, ["band", ".a-tabs-main", ".a-subs"]],                                           // My Account
    [/^\//, ["band"]]                                                                              // anything else
  ];
  var PHONE_KEEP = { band: 1, ".ck-gbar": 1, ".ck-listbar": 1 };
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
    var header = document.querySelector("header.dh"), top = header && getComputedStyle(header).position === "sticky" ? header.offsetHeight : 0;
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
