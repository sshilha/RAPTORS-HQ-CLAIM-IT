// The activity log: who did what, for whom, where and when. App Settings → Accounts & sign-in → Activity.
// Every change in the app ends in a confirmation sentence (?ok=…) or an error (?err=…); the middleware records each
// one with who did it and the board / person / session it was about. Check-in taps (which answer with data, not a
// sentence) record their own entries. Sign-ins come from the sign-in log. Entries older than a year are cleared.
const { query } = require("./db");
let ready = null;
function ensure() {
  if (ready) return ready;
  return (ready = (async () => {
    await require("./rsvp").ensure();   // the fill below reads the RSVP column, which a database that never used RSVP doesn't have yet
    await query(`CREATE TABLE IF NOT EXISTS activity_log (
      id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), actor_user_id INT, actor TEXT, via TEXT, kind TEXT, ok BOOLEAN NOT NULL DEFAULT true,
      summary TEXT, board_id INT, athlete_id INT, item_id INT, path TEXT, details JSONB)`);
    await query(`CREATE INDEX IF NOT EXISTS activity_at ON activity_log (at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS activity_board ON activity_log (board_id, at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS activity_person ON activity_log (athlete_id, at DESC)`);
    await backfill();
  })().catch((e) => { ready = null; throw e; }));
}
// once: claims and cancels from before the log existed
async function backfill() {
  await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = (await query(`SELECT 1 FROM app_kv WHERE key='activity_backfilled'`)).rowCount;
  if (done) return;
  await query(`INSERT INTO activity_log (at, actor_user_id, actor, via, kind, summary, board_id, athlete_id, item_id, details)
    SELECT c.created_at, c.booked_by, u.email, CASE WHEN c.booked_by IS NULL THEN 'public link' ELSE 'app' END, 'claims',
      (CASE WHEN c.status='waitlisted' THEN 'Waitlisted ' ELSE 'Claimed ' END) || coalesce(nullif(i.title,''), n.name, 'a session') || ' for ' || a.first_name || ' ' || coalesce(a.last_name,''),
      i.schedule_id, c.athlete_id, c.item_id, '{"from":"before the log"}'::jsonb
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN athletes a ON a.id=c.athlete_id LEFT JOIN board_nodes n ON n.id=i.node_id LEFT JOIN users u ON u.id=c.booked_by
    WHERE c.created_at > now() - interval '1 year'`);
  await query(`INSERT INTO activity_log (at, via, kind, summary, board_id, athlete_id, item_id, details)
    SELECT c.canceled_at, 'app', 'claims', 'Canceled ' || coalesce(nullif(i.title,''), n.name, 'a session') || ' for ' || a.first_name || ' ' || coalesce(a.last_name,''),
      i.schedule_id, c.athlete_id, c.item_id, '{"from":"before the log"}'::jsonb
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN athletes a ON a.id=c.athlete_id LEFT JOIN board_nodes n ON n.id=i.node_id
    WHERE c.canceled_at IS NOT NULL AND c.canceled_at > now() - interval '1 year' AND coalesce(c.rsvp,'') <> 'no'`);
  await query(`INSERT INTO app_kv (key, value) VALUES ('activity_backfilled', 'true'::jsonb) ON CONFLICT DO NOTHING`);
}
// what kind of action, from where it happened
const KINDS = [["claims", "Claims & cancels"], ["rsvp", "RSVP answers"], ["checkin", "Check-in"], ["boards", "Boards & setup"], ["people", "People"],
  ["requests", "Requests"], ["account", "Accounts & family"], ["settings", "App settings"], ["emails", "Emails"], ["signin", "Sign-ins"]];
function kindOf(path) {
  if (/\/rsvp\b/.test(path)) return "rsvp";
  if (/^\/(b\/\d+\/claim|claims\/|s\/)/.test(path) || /\/(assign|move)\b/.test(path)) return "claims";
  if (/^\/checkin/.test(path)) return "checkin";
  if (/^\/admin\/(setup|b|members)/.test(path)) return "boards";
  if (/^\/admin\/people\/communication/.test(path)) return "emails";
  if (/^\/admin\/people/.test(path)) return "people";
  if (/^\/admin\/requests/.test(path)) return "requests";
  if (/^\/(account|welcome)/.test(path)) return "account";
  if (/^\/(admin\/settings|admin\/signins|shadow)/.test(path)) return "settings";
  return "other";
}
const num = (v) => (/^\d+$/.test(String(v || "")) ? +v : null);
// what it was about: the board, the person and the session, from the address and the form
async function about(req) {
  const p = req.originalUrl.split("?")[0], b = req.body || {}, q = req.query || {}, out = {};
  let m;
  if ((m = /^\/admin\/b\/(\d+)/.exec(p)) || (m = /^\/b\/(\d+)/.exec(p)) || (m = /^\/admin\/setup\/schedules\/(\d+)/.exec(p))) out.boardId = +m[1];
  out.boardId = out.boardId || num(b.s) || num(b.sid) || num(b.schedule_id) || num(q.s);
  if ((m = /\/items\/(\d+)/.exec(p)) || (m = /^\/checkin\/i\/(\d+)/.exec(p))) out.itemId = +m[1];
  out.itemId = out.itemId || num(b.item) || num(b.item_id);
  if ((m = /^\/admin\/people\/(\d+)/.exec(p))) out.athleteId = +m[1];
  out.athleteId = out.athleteId || num(b.p) || num(b.pid) || num(b.athlete_id) || num(b.athlete);
  if ((m = /^\/claims\/(\d+)/.exec(p))) {
    const c = (await query(`SELECT c.athlete_id, c.item_id, i.schedule_id FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE c.id=$1`, [+m[1]])).rows[0];
    if (c) Object.assign(out, { athleteId: c.athlete_id, itemId: c.item_id, boardId: c.schedule_id });
  }
  if (out.itemId && !out.boardId) { const i = (await query(`SELECT schedule_id FROM board_items WHERE id=$1`, [out.itemId])).rows[0]; if (i) out.boardId = i.schedule_id; }
  return out;
}
function who(req) {
  const u = req.user, b = req.body || {};
  if (req.shadow && req.realUser) return { id: u ? u.id : null, label: `${req.realUser.email} (as ${u ? u.email : "a visitor"})`, via: "Sign in as" };
  if (!u) return { id: null, label: [b.first_name || b.first, b.last_name || b.last].filter(Boolean).join(" ") + (b.email ? ` (${b.email})` : "") || "A visitor", via: "public link" };
  return { id: u.id, label: u.email, via: require("./auth").isAdmin(u) ? "admin" : "app" };
}
async function record(req, { kind, summary, ok = true, boardId = null, athleteId = null, itemId = null, details = null }) {
  try {
    await ensure(); const w = who(req);
    await query(`INSERT INTO activity_log (actor_user_id, actor, via, kind, ok, summary, board_id, athlete_id, item_id, path, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [w.id, w.label, w.via, kind, ok, String(summary || "").slice(0, 500), boardId, athleteId, itemId, req.originalUrl.split("?")[0].slice(0, 200), details ? JSON.stringify(details) : null]);
    if (Math.random() < 0.002) await query(`DELETE FROM activity_log WHERE at < now() - interval '1 year'`);   // keep a year
  } catch (e) { console.error("activity log:", e.message); }   // the log must never get in the way of the app
}
// every change (a POST) that ends in a confirmation or an error is recorded
const SKIP = /^\/(login|auth|logout|forgot|reset|code)\b|^\/cal\//;   // sign-ins have their own log; passwords never
function middleware(req, res, next) {
  if (req.method !== "POST" || SKIP.test(req.path)) return next();
  const redirect = res.redirect.bind(res);
  res.redirect = function (url) {
    try {
      const u = new URL(String(arguments.length > 1 ? arguments[1] : url), "http://x"), ok = u.searchParams.get("ok"), err = u.searchParams.get("err");
      if ((ok || err) && !req._logged) { req._logged = true;
        about(req).then((a) => record(req, { kind: kindOf(req.originalUrl.split("?")[0]), summary: ok || err, ok: !!ok, ...a })); }
    } catch (e) {}
    return redirect.apply(res, arguments);
  };
  next();
}
// the Activity page: the log plus sign-ins, filtered
async function list({ q = "", board = null, kind = "", from = "", to = "", problems = false, limit = 200, offset = 0 } = {}) {
  await ensure();
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  if (q) add(`(e.actor ILIKE ? OR e.summary ILIKE $${args.length + 1} OR e.person ILIKE $${args.length + 1})`, `%${q}%`);
  if (board) add(`e.board_id = ?`, board);
  if (kind) add(`e.kind = ?`, kind);
  if (from) add(`e.at >= (?::date)::timestamp AT TIME ZONE 'America/Chicago'`, from);
  if (to) add(`e.at < ((?::date) + 1)::timestamp AT TIME ZONE 'America/Chicago'`, to);
  if (problems) where.push(`NOT e.ok`);
  const sql = `WITH e AS (
      SELECT l.id, l.at, l.actor, l.via, l.kind, l.ok, l.summary, l.board_id, l.athlete_id, sc.name AS board, nullif(trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), '') AS person,
        i.title AS item_title, i.starts_at AS item_starts, i.ends_at AS item_ends, n.name AS item_level
        FROM activity_log l LEFT JOIN schedules sc ON sc.id=l.board_id LEFT JOIN athletes a ON a.id=l.athlete_id LEFT JOIN board_items i ON i.id=l.item_id LEFT JOIN board_nodes n ON n.id=i.node_id
      UNION ALL
      SELECT -s.id, s.at, coalesce(u.email, s.identity), coalesce(s.method, 'sign-in'), 'signin', s.ok, CASE WHEN s.ok THEN 'Signed in' ELSE 'Sign-in failed' || coalesce(': ' || s.reason, '') END,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM login_events s LEFT JOIN users u ON u.id=s.user_id)
    SELECT * FROM e ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, id DESC LIMIT ${Math.min(+limit || 200, 5000)} OFFSET ${Math.max(+offset || 0, 0)}`;
  return (await query(sql, args)).rows;
}
module.exports = { ensure, record, middleware, list, KINDS };
