// The old (pre-rebuild) system's tables: see what's there, download it all, then remove it.
// App Settings → Organization → Old data. Nothing here runs by itself.
const zlib = require("zlib");
const { query, pool, OLD_TABLES, hasOldData } = require("./db");

async function summary() {
  if (!(await hasOldData())) return null;
  const tables = [];
  for (const t of OLD_TABLES) {
    const ok = (await query(`SELECT to_regclass($1) IS NOT NULL AS x`, [`public.${t}`])).rows[0].x;
    if (ok) tables.push({ name: t, rows: (await query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n });
  }
  const boards = (await query(`SELECT sc.id, sc.name, sc.archived_at, count(DISTINCT r.id)::int AS rounds, count(DISTINCT p.id)::int AS programs, count(DISTINCT s.id)::int AS sessions,
      (SELECT count(*)::int FROM reservations x JOIN training_sessions s2 ON s2.id=x.session_id JOIN programs p2 ON p2.id=s2.program_id JOIN rounds r2 ON r2.id=p2.round_id WHERE r2.schedule_id=sc.id) AS reservations
    FROM rounds r JOIN schedules sc ON sc.id=r.schedule_id LEFT JOIN programs p ON p.round_id=r.id LEFT JOIN training_sessions s ON s.program_id=p.id
    GROUP BY sc.id ORDER BY sc.id`)).rows;
  return { tables, boards };
}
// ---- a .zip of one CSV per table (stored, not compressed; every spreadsheet app opens CSV) ----
const cell = (v) => { if (v == null) return ""; const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function zip(files) {
  const parts = [], central = []; let offset = 0;
  const dosTime = (d) => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = (d) => ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const now = new Date();
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data), crc = zlib.crc32(data) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(dosTime(now), 10); h.writeUInt16LE(dosDate(now), 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, name, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dosTime(now), 12); c.writeUInt16LE(dosDate(now), 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name); offset += h.length + name.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
async function download() {
  const files = [];
  for (const t of OLD_TABLES) {
    if (!(await query(`SELECT to_regclass($1) IS NOT NULL AS x`, [`public.${t}`])).rows[0].x) continue;
    const r = await query(`SELECT * FROM ${t} ORDER BY 1`);
    const cols = r.fields.map((f) => f.name);
    files.push({ name: `${t}.csv`, data: "\uFEFF" + [cols.join(","), ...r.rows.map((row) => cols.map((c) => cell(row[c])).join(","))].join("\r\n") + "\r\n" });
  }
  files.push({ name: "README.txt", data: `Claim It: old (pre-rebuild) data, downloaded ${new Date().toISOString()}.\r\nOne CSV per table: ${files.map((f) => f.name).join(", ")}.\r\n` });
  return zip(files);
}
// remove the old tables (after a download / backup); nothing in the app needs them
async function remove(by) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const t of OLD_TABLES) await c.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    await c.query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await c.query(`INSERT INTO app_kv (key, value) VALUES ('old_data_removed', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify({ at: new Date().toISOString(), by })]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
async function removedInfo() {
  try { const r = (await query(`SELECT value FROM app_kv WHERE key='old_data_removed'`)).rows[0]; return r ? r.value : null; } catch (e) { return null; }
}
module.exports = { summary, download, remove, removedInfo };
