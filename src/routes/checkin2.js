// Check-in on the new boards: admins (every board) and coaches (their boards).
// Day view -> a session's roster -> Here / No-show (saved instantly), Mark everyone here, + Walk-in.
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const E = require("../engine");
const A = require("../attendance");
const v = require("../views/checkin2");
const { localDate } = require("../time");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser);
router.use(wrap(async (req, res, next) => {
  req.boards = await A.boardsFor(req.user);
  if (!req.boards.length) return res.status(403).send(require("../views/layout").errorPage("Check-in is for admins and coaches.", { user: req.user }));
  req.user.can_reports = !!(await require("../people").reportScope(req.user));
  next();
}));
const isDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
const tracked = async (itemId) => { const ch = await E.chainFor(itemId); return ch ? E.effective(ch).attendance !== false : false; };
const pathOf = async (nodeId) => (await query(`WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=$1
  UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT string_agg(name, ' › ' ORDER BY d DESC) AS p FROM up`, [nodeId])).rows[0].p;

// one session, if this person may check in for it
async function itemFor(req, id) {
  const it = (await query(`SELECT i.*, sc.name AS board_name, sc.question, sc.event_location, sc.settings AS board_settings FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id
    WHERE i.id=$1 AND i.schedule_id = ANY($2) AND i.canceled_at IS NULL`, [id, req.boards])).rows[0];
  if (it) { it.path = await pathOf(it.node_id); it.lock = lockOf(it); }
  return it || null;
}
// When a session's check-in locks for coaches (Board defaults → Attendance): the end of the session's day plus N days.
// Admins can always change it.
function lockOf(it) {
  const days = require("../views/setup").lockDays({ settings: it.board_settings });
  if (days < 0 || !it.starts_at) return { locked: false, until: null };
  const d = new Date(localDate(new Date(it.starts_at)) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days);
  const until = d.toISOString().slice(0, 10);          // the last day it can be changed (local)
  return { locked: localDate(new Date()) > until, until };
}
const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const closedFor = (req, it) => it.lock.locked && !auth.isAdmin(req.user);
const closedMsg = (it) => `Check-in for this session closed ${dayLabel(it.lock.until)}. An admin can still change it.`;

// ---------- the day ----------
router.get("/", wrap(async (req, res) => {
  const day = isDate(req.query.d) ? req.query.d : localDate(new Date());
  const all = (await query(`SELECT i.id, i.node_id, i.title, i.starts_at, i.ends_at, i.capacity, i.location, i.schedule_id AS board_id, sc.name AS board_name, sc.event_location,
      count(c.*) FILTER (WHERE c.status='confirmed')::int AS claimed,
      count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended)::int AS here,
      count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended = false)::int AS noshow
    FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id LEFT JOIN board_claims c ON c.item_id=i.id
    WHERE i.schedule_id = ANY($1) AND i.canceled_at IS NULL AND i.starts_at IS NOT NULL AND sc.archived_at IS NULL
      AND to_char(i.starts_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') = $2
    GROUP BY i.id, sc.name, sc.event_location ORDER BY i.starts_at, i.id`, [req.boards, day])).rows;
  const sessions = [];
  for (const s of all) if (await tracked(s.id)) { s.path = await pathOf(s.node_id); sessions.push(s); }
  const days = (await query(`SELECT DISTINCT to_char(i.starts_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS d FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id
    WHERE i.schedule_id = ANY($1) AND i.canceled_at IS NULL AND i.starts_at IS NOT NULL AND sc.archived_at IS NULL ORDER BY d`, [req.boards])).rows.map((r) => r.d);
  res.send(v.dayPage({ user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), day, sessions, board: Number(req.query.b) || 0, isToday: day === localDate(new Date()),
    prev: days.filter((d) => d < day).pop() || null, next: days.find((d) => d > day) || null }));
}));

// ---------- a session's roster ----------
async function roster(itemId) {
  return (await query(`SELECT c.id, c.status, c.counts, c.note, c.attended, c.walk_in, a.id AS athlete_id, a.first_name, a.last_name, m.group_name
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN athletes a ON a.id=c.athlete_id
    LEFT JOIN schedule_members m ON m.schedule_id=i.schedule_id AND m.athlete_id=a.id
    WHERE c.item_id=$1 AND c.status<>'canceled' ORDER BY c.status, lower(a.last_name), lower(a.first_name)`, [itemId])).rows;
}
router.get("/i/:id", wrap(async (req, res) => {
  const it = await itemFor(req, int(req.params.id));
  if (!it) return go(res, "/checkin", { err: "That session isn't one you can check in." });
  const people = await roster(it.id);
  const onIds = new Set(people.map((p) => p.athlete_id));
  // walk-in choices: this board's list first, then everyone else in People
  const board = (await query(`SELECT a.id, a.first_name, a.last_name, m.group_name FROM schedule_members m JOIN athletes a ON a.id=m.athlete_id
    WHERE m.schedule_id=$1 AND a.archived_at IS NULL ORDER BY lower(a.last_name), lower(a.first_name)`, [it.schedule_id])).rows.filter((p) => !onIds.has(p.id));
  const others = (await query(`SELECT id, first_name, last_name, kind FROM athletes WHERE archived_at IS NULL AND id <> ALL($1) ORDER BY lower(last_name), lower(first_name) LIMIT 800`,
    [[...onIds, ...board.map((p) => p.id)]])).rows;
  res.send(v.rosterPage({ sub: ["roster", "waitlist", "walkin"].includes(req.query.sub) ? req.query.sub : "roster", user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), it, people, board, others }));
}));

// Here / No-show / clear (instant from the page; plain form as a fallback)
router.post("/i/:id/mark", wrap(async (req, res, next) => {
  const it0 = await itemFor(req, int(req.params.id));
  if (it0 && closedFor(req, it0)) return req.accepts("json") && /json/.test(req.get("accept") || "") ? res.status(403).json({ ok: false, locked: true, message: closedMsg(it0) }) : go(res, `/checkin/i/${it0.id}`, { err: closedMsg(it0) });
  next();
}), wrap(async (req, res) => {
  const it = await itemFor(req, int(req.params.id));
  const json = (req.get("accept") || "").includes("json");
  if (!it) return json ? res.status(403).json({ ok: false }) : go(res, "/checkin", { err: "Not allowed." });
  const state = { here: true, noshow: false, clear: null }[req.body.state];
  if (state === undefined) return json ? res.status(400).json({ ok: false }) : go(res, `/checkin/i/${it.id}`, {});
  await query(`UPDATE board_claims SET attended=$3::boolean, attended_at=CASE WHEN $3::boolean IS NULL THEN NULL ELSE now() END,
      attended_by=CASE WHEN $3::boolean IS NULL THEN NULL ELSE $4::integer END
    WHERE id=$1 AND item_id=$2`, [int(req.body.claim), it.id, state, req.user.id]);
  const c = (await query(`SELECT count(*) FILTER (WHERE status='confirmed')::int AS claimed, count(*) FILTER (WHERE attended)::int AS here, count(*) FILTER (WHERE attended = false)::int AS noshow
    FROM board_claims WHERE item_id=$1 AND status<>'canceled'`, [it.id])).rows[0];
  const who = (await query(`SELECT a.id, a.first_name, a.last_name FROM board_claims bc JOIN athletes a ON a.id=bc.athlete_id WHERE bc.id=$1`, [int(req.body.claim)])).rows[0];
  if (who) require("../activity").record(req, { kind: "checkin", summary: `${{ true: "Marked here", false: "Marked no-show", null: "Cleared check-in for" }[String(state)]}: ${who.first_name} ${who.last_name || ""} · ${require("../time").slotName(it)}`,
    boardId: it.schedule_id, athleteId: who.id, itemId: it.id });
  json ? res.json({ ok: true, ...c }) : go(res, `/checkin/i/${it.id}`, {});
}));
router.post("/i/:id/all", wrap(async (req, res, next) => {
  const it0 = await itemFor(req, int(req.params.id));
  if (it0 && closedFor(req, it0)) return go(res, `/checkin/i/${it0.id}`, { err: closedMsg(it0) });
  next();
}), wrap(async (req, res) => {
  const it = await itemFor(req, int(req.params.id)); if (!it) return go(res, "/checkin", { err: "Not allowed." });
  const r = await query(`UPDATE board_claims SET attended=true, attended_at=now(), attended_by=$2 WHERE item_id=$1 AND status='confirmed' AND attended IS NULL`, [it.id, req.user.id]);
  go(res, `/checkin/i/${it.id}`, { ok: `Marked ${r.rowCount} here.` });
}));
// Walk-in: someone who showed up without claiming (doesn't use a spot or count toward limits)
router.post("/i/:id/walkin", wrap(async (req, res, next) => {
  const it0 = await itemFor(req, int(req.params.id));
  if (it0 && closedFor(req, it0)) return go(res, `/checkin/i/${it0.id}`, { err: closedMsg(it0) });
  next();
}), wrap(async (req, res) => {
  const it = await itemFor(req, int(req.params.id)); if (!it) return go(res, "/checkin", { err: "Not allowed." });
  let aid = int(req.body.athlete_id);
  const first = str(req.body.first_name).slice(0, 40), last = str(req.body.last_name).slice(0, 40);
  if (!aid && first && last) aid = (await query(`INSERT INTO athletes (first_name, last_name) VALUES ($1,$2) RETURNING id`, [first, last])).rows[0].id;
  if (!aid) return go(res, `/checkin/i/${it.id}#walkin`, { err: "Pick someone, or type a first and last name." });
  const p = (await query(`SELECT first_name, last_name FROM athletes WHERE id=$1`, [aid])).rows[0];
  const had = (await query(`SELECT id FROM board_claims WHERE item_id=$1 AND athlete_id=$2 AND status<>'canceled'`, [it.id, aid])).rows[0];
  if (had) await query(`UPDATE board_claims SET attended=true, attended_at=now(), attended_by=$2 WHERE id=$1`, [had.id, req.user.id]);
  else await query(`INSERT INTO board_claims (item_id, athlete_id, status, counts, walk_in, attended, attended_at, attended_by, booked_by)
    VALUES ($1,$2,'confirmed',false,true,true,now(),$3,$3)`, [it.id, aid, req.user.id]);
  go(res, `/checkin/i/${it.id}`, { ok: `${p.first_name} ${p.last_name} added as a walk-in and marked here.` });
}));

module.exports = router;
