// App-wide saved places: a name and (optionally) an address. A location typed anywhere in the app
// is just text; when it matches a saved place by name, people get a map link to its address.
const { query } = require("./db");

let CACHE = [];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function load() {
  CACHE = (await query(`SELECT * FROM app_locations ORDER BY lower(name)`)).rows;
  return CACHE;
}
const all = () => CACHE;
const find = (name) => {
  const n = String(name || "").trim().toLowerCase();
  return n ? CACHE.find((l) => l.name.toLowerCase() === n) || null : null;
};
// Google Maps link: the saved address if there is one, else nothing (plain text locations stay plain)
const mapUrl = (name) => {
  const l = find(name);
  return l && l.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}` : null;
};
// HTML for showing a location: "📍 Turn Two Athletics" linked to directions when we know the address
const link = (name) => {
  if (!name) return "";
  const url = mapUrl(name);
  return url ? `<a class="loc-link" href="${url}" target="_blank" rel="noopener">📍 ${esc(name)}</a>` : esc(name);
};
// <datalist> of saved names, so location boxes suggest them while still allowing free text
const datalist = (id = "app-locations") => `<datalist id="${id}">${CACHE.map((l) => `<option value="${esc(l.name)}">${esc(l.address || "")}</option>`).join("")}</datalist>`;

// One time: earlier board/app location lists become saved places (names only)
async function migrate() {
  const catalog = require("./catalog");
  const c = catalog.current();
  if (c.places_migrated) return load(); // one time only, so renamed/removed places don't come back
  const names = new Set([...(c.locations || [])]);
  for (const r of (await query(`SELECT locations FROM schedules`)).rows) for (const n of r.locations || []) names.add(n);
  for (const n of names) if (String(n).trim())
    await query(`INSERT INTO app_locations (name) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM app_locations WHERE lower(name)=lower($1))`, [String(n).trim()]);
  // the old per-board / per-app lists are retired
  await query(`UPDATE schedules SET locations='{}'`);
  const c2 = catalog.current(); c2.locations = []; c2.places_migrated = true; await catalog.save(c2);
  await load();
}

// A dropdown of saved places, with "Add new location..." (opens the pop-up from placeDialog())
function picker(name, value, attrs = "") {
  const cur = String(value || "").trim();
  const known = CACHE.some((l) => l.name.toLowerCase() === cur.toLowerCase());
  return `<select name="${name}" class="place-picker" data-prev="${esc(cur)}" ${attrs}>
    <option value="">— None —</option>
    ${CACHE.map((l) => `<option value="${esc(l.name)}"${l.name.toLowerCase() === cur.toLowerCase() ? " selected" : ""}>${esc(l.name)}${l.address ? ` · ${esc(l.address)}` : ""}</option>`).join("")}
    ${cur && !known ? `<option value="${esc(cur)}" selected>${esc(cur)} (not saved)</option>` : ""}
    <option value="__new">＋ Add new location…</option>
  </select>`;
}
function placeDialog() {
  return `<dialog class="edit-dlg place-dlg" id="place-dlg" aria-labelledby="place-dlg-t">
    <form class="dlg-form" id="place-form">
      <div class="dlg-head"><h2 id="place-dlg-t">Add a location</h2><button type="button" class="dlg-x" aria-label="Close" data-place-cancel>×</button></div>
      <div class="dlg-body">
        <p class="fine">It's saved to your locations (⚙ App settings → Locations), so you can pick it on any board.</p>
        <label class="field-l">Name<input name="name" required maxlength="80" placeholder="e.g. Carson Park"></label>
        <label class="field-l"><span>Address <span class="opt">(optional, so people get directions)</span></span><input name="address" maxlength="200" placeholder="e.g. 400 Carson Park Dr, Eau Claire, WI"></label>
        <p class="alert" id="place-err" hidden></p>
      </div>
      <div class="q-actions dlg-actions"><button class="btn-small" type="submit">Save location</button><button type="button" class="btn-ghost" data-place-cancel>Cancel</button></div>
    </form>
  </dialog>
  <script>
  (function () {
    var dlg = document.getElementById("place-dlg"), form = document.getElementById("place-form"), err = document.getElementById("place-err"), from = null;
    function back() { if (from) from.value = from.dataset.prev || ""; dlg.close(); }
    document.addEventListener("change", function (e) {
      var s = e.target; if (!s.classList || !s.classList.contains("place-picker")) return;
      if (s.value === "__new") { from = s; form.reset(); err.hidden = true; dlg.showModal(); form.name.focus(); } else s.dataset.prev = s.value;
    });
    dlg.querySelectorAll("[data-place-cancel]").forEach(function (b) { b.addEventListener("click", back); });
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); back(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      fetch("/admin/settings/places", { method: "POST", headers: { "X-Requested-With": "fetch", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ name: form.name.value, address: form.address.value }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { err.textContent = x.j.error || "Couldn't save that."; err.hidden = false; return; }
          var p = x.j.place, label = p.name + (p.address ? " · " + p.address : "");
          document.querySelectorAll("select.place-picker").forEach(function (s) {
            if (![].some.call(s.options, function (o) { return o.value === p.name; })) {
              var o = new Option(label, p.name); s.insertBefore(o, s.querySelector('option[value="__new"]'));
            }
          });
          if (from) { from.value = p.name; from.dataset.prev = p.name; from.dispatchEvent(new Event("input", { bubbles: true })); }
          dlg.close();
        })
        .catch(function () { err.textContent = "Couldn't save that. Check your connection and try again."; err.hidden = false; });
    });
  })();
  </script>`;
}

module.exports = { load, all, find, mapUrl, link, datalist, migrate, picker, placeDialog };
