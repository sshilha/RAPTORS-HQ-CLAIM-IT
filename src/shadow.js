// Shadow mode: an admin uses the app as someone else (a person in People, or a visitor with no account), to test and
// troubleshoot. It rides on top of the admin's own sign-in, in that admin's browser only:
//  - a second cookie (rt_shadow) only counts alongside a real admin session;
//  - while it's on, req.user is the person being shadowed (or nobody, for a visitor), so every page shows what they see;
//  - signing in or out inside shadow mode switches the shadowed person, never the admin's real sign-in;
//  - emails are held (shown in the banner), never sent, so real families aren't emailed while testing.
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const { query } = require("./db");

const COOKIE = "rt_shadow", HOURS = 4;
const als = new AsyncLocalStorage();
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS shadow_sessions (id SERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, admin_user_id INT NOT NULL,
    target_user_id INT, pending_user_id INT, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS shadow_outbox (id SERIAL PRIMARY KEY, shadow_id INT NOT NULL, to_addr TEXT, subject TEXT, html TEXT, text TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await query(`ALTER TABLE shadow_outbox ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);
  await query(`ALTER TABLE shadow_sessions ADD COLUMN IF NOT EXISTS visitor_person_id INT`);   // a public-link visitor (in People, no sign-in)
  await query(`ALTER TABLE shadow_outbox ADD COLUMN IF NOT EXISTS sent_to TEXT`);
  ready = true;
}
// who a user is, for the banner
async function labelOf(userId) {
  if (!userId) return null;
  const r = (await query(`SELECT u.email, a.first_name, a.last_name FROM users u LEFT JOIN athletes a ON a.self_user_id=u.id AND a.archived_at IS NULL WHERE u.id=$1 ORDER BY (a.kind='athlete') DESC LIMIT 1`, [userId])).rows[0];
  if (!r) return null;
  const n = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return { id: userId, email: r.email, name: n || r.email };
}

// Middleware (after auth.loadUser): switch req.user while shadow mode is on, and remember it for this request
async function middleware(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  const isAdmin = require("./auth").isAdmin;
  if (!token || !req.user || !isAdmin(req.user)) return als.run({}, next);
  try {
    await ensure();
    const s = (await query(`SELECT * FROM shadow_sessions WHERE token_hash=$1 AND admin_user_id=$2 AND ended_at IS NULL AND expires_at > now()`, [hash(token), req.user.id])).rows[0];
    if (!s) { res.clearCookie(COOKIE); return als.run({}, next); }
    req.realUser = req.user;
    req.user = s.target_user_id ? (await query(`SELECT * FROM users WHERE id=$1`, [s.target_user_id])).rows[0] || null : null;
    req.shadow = s;
    const held = (await query(`SELECT count(*)::int AS n FROM shadow_outbox WHERE shadow_id=$1 AND sent_at IS NULL`, [s.id])).rows[0].n;
    const store = { shadow: s, admin: req.realUser, target: await labelOf(s.target_user_id), pending: s.target_user_id ? null : await labelOf(s.pending_user_id), held,
      visitor: !s.target_user_id && s.visitor_person_id ? await visitorOf(s.visitor_person_id) : null };
    return als.run(store, next);
  } catch (e) { console.error("shadow:", e.message); return als.run({}, next); }
}
const current = () => als.getStore() || {};

// a public-link visitor: their name, email, and the spots they claimed (with the private cancel links from their emails)
async function visitorOf(personId) {
  const p = (await query(`SELECT id, first_name, last_name, email FROM athletes WHERE id=$1`, [personId])).rows[0]; if (!p) return null;
  return { id: p.id, first_name: p.first_name || "", last_name: p.last_name || "", email: p.email || "", name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email };
}
async function visitorClaims(personId) {
  return (await query(`SELECT c.id, c.status, c.cancel_token, c.created_at, i.title, i.starts_at, i.ends_at, sc.name AS board_name, sc.share_code, n.name AS level
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id LEFT JOIN board_nodes n ON n.id=i.node_id
    WHERE c.athlete_id=$1 AND c.cancel_token IS NOT NULL AND sc.share_code IS NOT NULL ORDER BY i.starts_at NULLS LAST, c.id`, [personId])).rows;
}
// people who signed up through a public link and have no sign-in
async function publicVisitors() {
  return (await query(`SELECT a.id, a.first_name, a.last_name, a.email, count(c.id)::int AS spots, string_agg(DISTINCT sc.name, ', ') AS boards, max(c.created_at) AS last
    FROM athletes a JOIN board_claims c ON c.athlete_id=a.id AND c.cancel_token IS NOT NULL JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id
    WHERE a.self_user_id IS NULL AND a.archived_at IS NULL GROUP BY a.id ORDER BY max(c.created_at) DESC LIMIT 200`)).rows;
}
async function start(req, res, pendingUserId = null, visitorPersonId = null) {
  await ensure();
  const t = crypto.randomBytes(24).toString("base64url");
  const s = (await query(`INSERT INTO shadow_sessions (token_hash, admin_user_id, pending_user_id, visitor_person_id, expires_at) VALUES ($1,$2,$3,$4, now() + interval '${HOURS} hours') RETURNING *`,
    [hash(t), req.user.id, pendingUserId || null, visitorPersonId || null])).rows[0];
  res.cookie(COOKIE, t, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" || /^https:/.test(process.env.APP_URL || ""), maxAge: HOURS * 3600e3 });
  const who = await labelOf(pendingUserId), vis = visitorPersonId ? await visitorOf(visitorPersonId) : null;
  await require("./accounts").logEvent(req, { userId: req.user.id, identity: req.user.email, method: who ? `shadow start (as ${who.email})` : vis ? `shadow start (as public-link visitor ${vis.email || vis.name})` : "shadow start (as a visitor)", ok: true });
  return s;
}
// inside shadow mode: become this person (sign-in) / nobody (sign-out)
async function setTarget(req, userId, how) {
  await query(`UPDATE shadow_sessions SET target_user_id=$2, pending_user_id=NULL WHERE id=$1`, [req.shadow.id, userId]);
  const who = await labelOf(userId);
  await require("./accounts").logEvent(req, { userId: req.realUser.id, identity: req.realUser.email, method: `shadow sign-in as ${who ? who.email : userId}${how ? ` (${how})` : ""}`, ok: true });
}
async function signOut(req) { await query(`UPDATE shadow_sessions SET target_user_id=NULL, pending_user_id=NULL WHERE id=$1`, [req.shadow.id]); }
async function exit(req, res) {
  if (req.shadow) {
    await query(`UPDATE shadow_sessions SET ended_at=now() WHERE id=$1`, [req.shadow.id]);
    await require("./accounts").logEvent(req, { userId: req.realUser.id, identity: req.realUser.email, method: "shadow end", ok: true });
  }
  res.clearCookie(COOKIE);
}
// the email sender asks this first: in shadow mode, hold it instead of sending
async function hold({ to, subject, html, text }) {
  const s = current().shadow; if (!s) return false;
  await query(`INSERT INTO shadow_outbox (shadow_id, to_addr, subject, html, text) VALUES ($1,$2,$3,$4,$5)`, [s.id, [].concat(to).filter(Boolean).join(", "), subject, html || null, text || null]);
  return true;
}
async function outbox(shadowId) { await ensure(); return (await query(`SELECT * FROM shadow_outbox WHERE shadow_id=$1 ORDER BY id DESC`, [shadowId])).rows; }
async function recent(adminId) {
  await ensure();
  return (await query(`SELECT s.*, (SELECT email FROM users WHERE id=coalesce(s.target_user_id, s.pending_user_id)) AS who, (SELECT count(*)::int FROM shadow_outbox o WHERE o.shadow_id=s.id) AS held
    FROM shadow_sessions s WHERE s.admin_user_id=$1 ORDER BY s.id DESC LIMIT 8`, [adminId])).rows;
}
// really send a held email: to its original recipients, or to the admin as a test
async function sendHeld(req, id, toMe) {
  await ensure();
  const m = (await query(`SELECT * FROM shadow_outbox WHERE id=$1 AND shadow_id=$2`, [id, req.shadow.id])).rows[0];
  if (!m) throw new Error("That email isn't here anymore.");
  const to = toMe ? [req.realUser.email] : String(m.to_addr || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!to.length) throw new Error("That email has no one to send to.");
  const b = await require("./emailTemplates").brand();
  await require("./email").sendEmail({ to, subject: toMe ? `[Shadow test] ${m.subject}` : m.subject, html: m.html, text: m.text,
    replyTo: b.reply_to || null, fromName: b.sender_name || null, reallySend: true });
  await query(`UPDATE shadow_outbox SET sent_at=now(), sent_to=$2 WHERE id=$1`, [id, `${to.join(", ")}${toMe ? " (test)" : ""}`]);
  await require("./accounts").logEvent(req, { userId: req.realUser.id, identity: req.realUser.email, method: `shadow sent held email "${m.subject}" to ${to.join(", ")}`, ok: true });
  return to;
}
module.exports = { visitorOf, visitorClaims, publicVisitors, sendHeld, COOKIE, middleware, current, start, setTarget, signOut, exit, hold, outbox, recent, labelOf };
