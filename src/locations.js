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

module.exports = { load, all, find, mapUrl, link, datalist, migrate };
