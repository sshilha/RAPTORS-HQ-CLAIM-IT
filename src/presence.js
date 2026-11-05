// Who's on now (App Settings → Accounts & sign-in → On now), and which boards each person has opened
// (a board's Access & people shows, for each athlete, whether they or a parent/guardian signed in, opened it, claimed).
const { query } = require("./db");
let ready = null;
function ensure() {
  return ready || (ready = (async () => {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_path TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_device TEXT`);
    await query(`CREATE TABLE IF NOT EXISTS board_views (user_id INT NOT NULL, schedule_id INT NOT NULL, first_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_at TIMESTAMPTZ NOT NULL DEFAULT now(), n INT NOT NULL DEFAULT 1, PRIMARY KEY (user_id, schedule_id))`);
  })().catch((e) => { ready = null; throw e; }));
}
function device(ua) {
  ua = String(ua || "");
  const os = /iPhone|iPad/.test(ua) ? (/iPad/.test(ua) ? "iPad" : "iPhone") : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ");
}
const seen = new Map();   // user id → when last written (so busy pages don't write on every request)
function middleware(req, res, next) {
  if (req.method !== "GET" || !req.user || req.shadow || /\.(css|js|png|jpg|svg|ico|ics|json|csv|webp|woff2?)$/i.test(req.path) || /^\/(cal|shadow)\//.test(req.path)) return next();
  const id = req.user.id, path = req.originalUrl.slice(0, 300), now = Date.now(), board = /^\/b\/(\d+)/.exec(req.path);
  const last = seen.get(id) || { t: 0, path: "" }, write = last.path !== path || last.t < now - 20000;   // a new page, or 20 seconds since the last write
  if (write) seen.set(id, { t: now, path });
  ensure().then(async () => {
    if (write) await query(`UPDATE users SET last_seen_at=now(), last_seen_path=$2, last_seen_device=$3 WHERE id=$1`, [id, path, device(req.get("user-agent"))]);
    if (board && req.query.preview !== "1") await query(`INSERT INTO board_views (user_id, schedule_id) VALUES ($1,$2) ON CONFLICT (user_id, schedule_id) DO UPDATE SET last_at=now(), n=board_views.n+1`, [id, +board[1]]);
  }).catch((e) => console.error("presence:", e.message));
  next();
}
// what someone is looking at, in words
async function pageName(path) {
  const p = String(path || "").split("?")[0], q = new URLSearchParams(String(path || "").split("?")[1] || ""), board = async (id) => ((await query(`SELECT name FROM schedules WHERE id=$1`, [id])).rows[0] || {}).name || "a board";
  let m;
  if ((m = /^\/b\/(\d+)/.exec(p))) return `${await board(+m[1])}: sign-up page`;
  if ((m = /^\/checkin\/i\/(\d+)/.exec(p))) { const i = (await query(`SELECT i.*, n.name AS level FROM board_items i LEFT JOIN board_nodes n ON n.id=i.node_id WHERE i.id=$1`, [+m[1]])).rows[0];
    return i ? `Check-in: ${[i.level, require("./time").slotName(i)].filter(Boolean).join(", ")}` : "Check-in"; }
  if (/^\/checkin/.test(p)) return "Check-in";
  if (/^\/dashboard/.test(p) || p === "/") return "My Claims";
  if (/^\/account/.test(p)) return "My Account";
  if (/^\/reports/.test(p)) return "Reports";
  if (/^\/admin\/(setup|members|b)/.test(p)) { const s = +(q.get("s") || (/\/b\/(\d+)/.exec(p) || [])[1] || 0); return s ? `${await board(s)}: setup` : "Board setup"; }
  if (/^\/admin\/settings\/?$/.test(p)) return "All Boards";
  if (/^\/admin\/people/.test(p)) return "People";
  if (/^\/(admin|shadow)/.test(p)) return "App Settings";
  if (/^\/s\//.test(p)) return "A public sign-up page";
  if (/^\/welcome/.test(p)) return "Welcome (first sign-in)";
  return p;
}
async function onNow(minutes = 15) {
  await ensure();
  const rows = (await query(`SELECT u.id, u.email, u.last_seen_at, u.last_seen_path, u.last_seen_device,
      (SELECT nullif(trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), '') FROM athletes a WHERE a.self_user_id=u.id AND a.archived_at IS NULL LIMIT 1) AS name,
      EXISTS (SELECT 1 FROM parent_athletes pa WHERE pa.user_id=u.id) AS parent, EXISTS (SELECT 1 FROM schedule_coaches c WHERE lower(c.email)=lower(u.email)) AS coach
    FROM users u WHERE u.last_seen_at > now() - ($1 || ' minutes')::interval ORDER BY u.last_seen_at DESC`, [String(minutes)])).rows;
  for (const r of rows) r.page = await pageName(r.last_seen_path);
  return rows;
}
// for each athlete on a board: did they or a parent/guardian sign in, open this board, claim?
async function engagement(boardId) {
  await ensure();
  const rows = (await query(`WITH fam AS (
      SELECT m.athlete_id, u.id AS user_id FROM schedule_members m JOIN athletes a ON a.id=m.athlete_id JOIN users u ON u.id=a.self_user_id WHERE m.schedule_id=$1
      UNION SELECT m.athlete_id, pa.user_id FROM schedule_members m JOIN parent_athletes pa ON pa.athlete_id=m.athlete_id WHERE m.schedule_id=$1)
    SELECT m.athlete_id,
      (SELECT max(u.last_login_at) FROM fam f JOIN users u ON u.id=f.user_id WHERE f.athlete_id=m.athlete_id) AS signed_in_at,
      (SELECT max(v.last_at) FROM fam f JOIN board_views v ON v.user_id=f.user_id AND v.schedule_id=$1 WHERE f.athlete_id=m.athlete_id) AS opened_at,
      (SELECT count(*) FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=$1 AND c.athlete_id=m.athlete_id AND c.status<>'canceled')::int AS claims,
      (SELECT count(*) FROM fam f WHERE f.athlete_id=m.athlete_id)::int AS accounts
    FROM schedule_members m WHERE m.schedule_id=$1`, [boardId])).rows;
  const out = new Map();
  for (const r of rows) out.set(r.athlete_id, { ...r, stage: r.claims ? "claimed" : r.opened_at ? "opened" : r.signed_in_at ? "signedin" : r.accounts ? "never" : "noaccount" });
  return out;
}
module.exports = { ensure, middleware, onNow, engagement, device };
