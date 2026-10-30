// What people see: My Claims, then a board -> who's signing up -> pick a spot. One person at a time.
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const E = require("../engine");
const PP = require("../people");
const v = require("../views/claim");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(["/dashboard", "/b", "/claims"], auth.requireUser);

// The people this signed-in person can claim for: their linked kids, and themselves
async function myPeople(user) {
  const kids = (await query(`SELECT a.* FROM parent_athletes pa JOIN athletes a ON a.id=pa.athlete_id
    WHERE pa.user_id=$1 AND a.archived_at IS NULL ORDER BY a.first_name`, [user.id])).rows;
  let me = (await query(`SELECT * FROM athletes WHERE self_user_id=$1 AND kind='adult' ORDER BY id LIMIT 1`, [user.id])).rows[0];
  return { kids, me };
}
const memberOf = async (boardId, athleteId) => (await query(`SELECT group_name, tags FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [boardId, athleteId])).rows[0] || null;
const asPerson = async (user, boardId, athleteId) => ({ athleteId, userId: user.id, member: await memberOf(boardId, athleteId) });
const nameOf = (p) => p ? (p.self_user_id ? "you" : `${p.first_name}`) : "";

// Boards this person could use, and who on their side can claim there
async function boardsFor(user, people) {
  const boards = (await query(`SELECT * FROM schedules WHERE published_at IS NOT NULL AND archived_at IS NULL ORDER BY event_date NULLS LAST, name`)).rows;
  const out = [];
  for (const b of boards) {
    const who = [];
    const cands = [...people.kids, ...(people.me ? [people.me] : [{ id: 0, self_user_id: user.id, first_name: "Me" }])];
    for (const p of cands) {
      if (!p.id) { if (b.claim_mode !== "roster") who.push(p); continue; }    // "Me" before a record exists
      const view = await E.personView(b.id, await asPerson(user, b.id, p.id));
      if (view && view.items.length) who.push(p);
    }
    if (who.length) out.push({ board: b, who });
  }
  return out;
}

router.get("/dashboard", wrap(async (req, res) => {
  req.user.can_reports = !!(await PP.reportScope(req.user));
  const people = await myPeople(req.user);
  const family = [...people.kids, ...(people.me ? [people.me] : [])];
  const ids = family.map((p) => p.id);
  const all = req.query.all === "1";                       // View All Claims: include recent past ones too
  // family filter: everyone, one athlete, or "me" (the parent / volunteer)
  const who = req.query.who === "me" ? (people.me ? people.me.id : -1) : int(req.query.who) || 0;
  const shownIds = who ? ids.filter((x) => x === who) : ids;
  const claims = shownIds.length ? (await query(`SELECT c.*, i.title, i.starts_at, i.ends_at, i.location, i.node_id, i.schedule_id, sc.name AS board_name, sc.labels AS board_labels,
      sc.image IS NOT NULL AS board_image, sc.image_at AS board_image_at, sc.short_code AS board_code,
      a.first_name, a.last_name, a.self_user_id,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id
    WHERE c.athlete_id = ANY($1) AND c.status<>'canceled' AND sc.archived_at IS NULL
      AND (i.starts_at IS NULL OR i.starts_at > now() ${all ? "- interval '90 days'" : ""})
    ORDER BY i.starts_at NULLS LAST, c.id`, [shownIds])).rows : [];
  // can each still be canceled in the app? (same rule as the board page: the cancel deadline in force)
  for (const c of claims) {
    const chain = await E.chainFor(c.item_id);
    const dl = chain ? E.cancelDeadline(chain.item, E.effective(chain)) : null;
    c.past = c.starts_at && new Date(c.starts_at) <= new Date();
    c.cancelable = !c.past && (!dl || new Date() < dl);
  }
  const boards = await boardsFor(req.user, people);
  // each board's date range: its event dates, or the span of its sessions
  const spans = boards.length ? (await query(`SELECT schedule_id, min(starts_at) AS first, max(starts_at) AS last FROM board_items
    WHERE schedule_id = ANY($1) AND canceled_at IS NULL AND starts_at IS NOT NULL GROUP BY schedule_id`, [boards.map((b) => b.board.id)])).rows : [];
  for (const b of boards) b.span = spans.find((x) => x.schedule_id === b.board.id) || null;
  // extra open spots: one line per board + person (only where a limit is reached and leftover spots are open)
  const extra = [];
  for (const { board, who: ws } of boards) for (const p of ws) {
    if (!p.id) continue;
    const view = await E.personView(board.id, await asPerson(req.user, board.id, p.id));
    for (const r of view.items) if (r.leftover && r.canClaim && r.open > 0) extra.push({ board, person: p, row: r });
  }
  res.send(v.homePage({ user: req.user, flash: flashFrom(req), claims, boards, extra, admin: auth.isAdmin(req.user),
    coach: !!req.user.is_coach, family, who: req.query.who === "me" ? "me" : who, all,
    tab: req.query.tab === "vol" ? "vol" : "", allBoards: req.query.boards === "all" }));
}));

router.get("/b/:sid", wrap(async (req, res) => {
  const sid = int(req.params.sid);
  const people = await myPeople(req.user);
  const all = await boardsFor(req.user, people);
  const entry = all.find((x) => x.board.id === sid);
  if (!entry) return go(res, "/dashboard", { err: "That board isn't open to you right now." });
  const ck = `ci_p_${sid}`;
  let pid = req.query.p === "me" ? "me" : int(req.query.p);
  if (!pid && req.cookies && req.cookies[ck]) pid = req.cookies[ck] === "me" ? "me" : int(req.cookies[ck]);   // who they picked last time
  if (!pid && entry.who.length === 1) pid = entry.who[0].id || "me";
  if (pid && pid !== "me" && !entry.who.some((p) => p.id === pid)) pid = null;
  if (pid === "me" && !entry.who.some((p) => p.self_user_id)) pid = null;
  const viewMode0 = ["list", "cal"].includes(req.query.v) ? req.query.v : req.cookies && req.cookies.ci_view === "cal" ? "cal" : "list";
  if (!pid) { req.user.can_reports = !!(await PP.reportScope(req.user));
    return res.send(v.boardPage({ user: req.user, flash: flashFrom(req), board: entry.board, person: null, who: entry.who, view: null, mode: viewMode0, filters: {}, admin: auth.isAdmin(req.user) })); }
  res.cookie(ck, String(pid), { maxAge: 180 * 864e5, sameSite: "lax" });
  if (pid === "me") {   // claiming for themselves: make sure they have a record
    if (!people.me) people.me = (await PP.ensureAdult(req.user.email)).person;
    pid = people.me.id;
  }
  const person = entry.who.find((p) => p.id === pid) || (people.me && people.me.id === pid ? people.me : null);
  if (!person) return go(res, `/b/${sid}`, { err: "Pick who's signing up." });
  const view = await E.personView(sid, await asPerson(req.user, sid, pid));
  const viewMode = ["list", "cal"].includes(req.query.v) ? req.query.v : req.cookies && req.cookies.ci_view === "cal" ? "cal" : "list";
  if (req.query.v) res.cookie("ci_view", viewMode, { maxAge: 365 * 864e5, sameSite: "lax" });
  req.user.can_reports = !!(await PP.reportScope(req.user));
  const span = (await query(`SELECT min(starts_at) AS first, max(starts_at) AS last FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL AND starts_at IS NOT NULL`, [sid])).rows[0];
  const filters = { act: str(req.query.act), grp: str(req.query.grp), show: ["open", "mine"].includes(req.query.show) ? req.query.show : "" };
  // Group by activity (default) or day; remembered like List/Calendar
  const group = ["activity", "day"].includes(req.query.g) ? req.query.g : req.cookies && req.cookies.ci_group === "day" ? "day" : "activity";
  if (req.query.g) res.cookie("ci_group", group, { maxAge: 365 * 864e5, sameSite: "lax" });
  res.send(v.boardPage({ user: req.user, flash: flashFrom(req), board: entry.board, person, who: entry.who, view, mode: viewMode, span, filters, group, admin: auth.isAdmin(req.user),
    month: /^\d{4}-\d{2}$/.test(str(req.query.m)) ? str(req.query.m) : null, day: /^\d{4}-\d{2}-\d{2}$/.test(str(req.query.d)) ? str(req.query.d) : null }));
}));

router.post("/b/:sid/claim", wrap(async (req, res) => {
  const sid = int(req.params.sid), pid = int(req.body.p), itemId = int(req.body.item);
  const back = str(req.body.back).startsWith(`/b/${sid}`) ? str(req.body.back) : `/b/${sid}?p=${pid}`;
  const people = await myPeople(req.user);
  const mineIds = [...people.kids.map((k) => k.id), ...(people.me ? [people.me.id] : [])];
  if (!mineIds.includes(pid)) return go(res, back, { err: "You can only claim for yourself or your own family." });
  try {
    const c = await E.claim({ itemId, athleteId: pid, userId: req.user.id, note: req.body.note });
    const it = (await query(`SELECT * FROM board_items WHERE id=$1`, [itemId])).rows[0];
    const who = people.kids.find((k) => k.id === pid) || people.me;
    const label = require("../time").slotName(it);
    await require("../engine/notify").claimed(c, req.user);
    go(res, back, { ok: c.status === "waitlisted" ? `${nameOf(who)} is on the waitlist for ${label}. We'll email you if a spot opens.` : `Claimed ${label} for ${nameOf(who)}. A confirmation email is on its way.` });
  } catch (e) { if (e instanceof E.ClaimError) return go(res, back, { err: e.message }); throw e; }
}));

router.post("/claims/:id/cancel", wrap(async (req, res) => {
  const id = int(req.params.id);
  const back = str(req.body.back).startsWith("/") ? str(req.body.back) : "/dashboard";
  const c = (await query(`SELECT c.* FROM board_claims c WHERE c.id=$1`, [id])).rows[0];
  const people = await myPeople(req.user);
  const mineIds = [...people.kids.map((k) => k.id), ...(people.me ? [people.me.id] : [])];
  if (!c || !mineIds.includes(c.athlete_id)) return go(res, back, { err: "That isn't one of your claims." });
  try {
    const r = await E.cancel({ claimId: id });
    await require("../engine/notify").canceled(r, req.user);
    go(res, back, { ok: "Canceled. The spot is open for someone else now." });
  } catch (e) { if (e instanceof E.ClaimError) return go(res, back, { err: e.message }); throw e; }
}));

module.exports = router;
