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
  // ---------- 1b. the page's title band stays put under the top bar; everything else scrolls behind it ----------
  var bandEl = [].slice.call(document.querySelectorAll(".bh2")).filter(function (e) { return !e.closest("header, dialog"); })[0];
  function stick() {
    var header = document.querySelector("header.dh"), top = header && getComputedStyle(header).position === "sticky" ? header.offsetHeight : 0;
    if (bandEl) { bandEl.classList.add("page-band"); bandEl.style.top = top + "px"; }
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
