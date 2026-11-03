// Small date / time / status helpers used by several screens (moved here from the old rounds page).
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const nice = (isoDate) => { const d = parse(isoDate); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const niceRange = (a, b) => `${nice(a)} to ${nice(b)}, ${parse(b).getUTCFullYear()}`;
function hm(t) {
  const [h, m] = t.split(":").map(Number);
  return { txt: `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}`, ap: h < 12 ? "a" : "p" };
}
const shortRange = (s, e) => { const a = hm(s), b = hm(e); return a.ap === b.ap ? `${a.txt}–${b.txt}${b.ap}` : `${a.txt}${a.ap}–${b.txt}${b.ap}`; };
const statusPill = (r) => r.published_at ? `<span class="pill ok">Published</span>` : `<span class="pill wait">Draft</span>`;
module.exports = { niceRange, shortRange, statusPill };
