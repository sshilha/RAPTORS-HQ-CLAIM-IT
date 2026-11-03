// App-wide pictures (App Settings → Organization → Pictures): header images for the My Claims cards.
const { query } = require("./db");
const KEYS = { upcoming: "Your Upcoming Claims", signup: "Sign Up for Something" };
let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS app_images (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  ready = true;
}
// { upcoming: <url with version> | null, signup: ... }
async function urls() {
  await ensure();
  const rows = (await query(`SELECT key, updated_at FROM app_images`)).rows;
  const out = {}; for (const k of Object.keys(KEYS)) { const r = rows.find((x) => x.key === k); out[k] = r ? `/img/app/${k}?v=${new Date(r.updated_at).getTime()}` : null; }
  return out;
}
async function get(key) { await ensure(); return (await query(`SELECT data FROM app_images WHERE key=$1`, [key])).rows[0] || null; }
async function set(key, data) {
  await ensure();
  if (!KEYS[key]) return;
  if (!data) return query(`DELETE FROM app_images WHERE key=$1`, [key]);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(data) || data.length > 2_500_000) throw new Error("That picture couldn't be used. Try a JPG or PNG under 2 MB.");
  await query(`INSERT INTO app_images (key, data, updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [key, data]);
}
module.exports = { KEYS, urls, get, set };
