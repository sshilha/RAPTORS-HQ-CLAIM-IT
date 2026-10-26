// The container engine: one set of rules for boards of any depth.
//   Board -> containers (up to depth-1 levels) -> items -> claims
// Settings live on the board, any container, or an item, and flow down until something lower overrides them.
//   who            { mode: "signed_in" | "list" | "teams", groups: [], tags: [] }   (only narrows; every level must pass)
//   limit          number per person in this container (or the whole board). null = unlimited. Every limit on the path applies.
//   attendance     true / false
//   opens_at       ISO time claiming opens
//   cancel_hours   how late people can cancel (0 = any time)
//   leftover_hours spots still open this close to the start can be claimed past limits (null = never)
//   waitlist       true / false
//   location       text
// Board-only: who can get in at all (claim_mode), published_at, question { label, required, public }.
const { query, pool } = require("../db");

class ClaimError extends Error {}
const INHERITED = ["attendance", "opens_at", "cancel_hours", "leftover_hours", "waitlist", "location"];
const BOARD_DEFAULTS = { attendance: false, opens_at: null, cancel_hours: 24, leftover_hours: null, waitlist: false, location: null };
const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

// ---------- building boards ----------
async function createBoard({ name, depth = 1, claimMode = "family", settings = {}, question = null }, db = { query }) {
  const r = (await db.query(
    `INSERT INTO schedules (name, depth, claim_mode, settings, question, labels) VALUES ($1,$2,$3,$4,$5,'{}') RETURNING *`,
    [name, Math.min(4, Math.max(1, depth)), claimMode, JSON.stringify(settings), question ? JSON.stringify(question) : null])).rows[0];
  return r;
}

// Depth of a container: 1 = directly under the board
async function nodeDepth(nodeId, db = { query }) {
  if (!nodeId) return 0;
  const r = (await db.query(`WITH RECURSIVE up AS (SELECT id, parent_id, 1 AS d FROM board_nodes WHERE id=$1
      UNION ALL SELECT n.id, n.parent_id, up.d + 1 FROM board_nodes n JOIN up ON n.id = up.parent_id) SELECT max(d) AS d FROM up`, [nodeId])).rows[0];
  return Number(r.d) || 0;
}

async function addNode({ boardId, parentId = null, name, settings = {}, visibleFrom = null, color = null, sort = 0 }, db = { query }) {
  const board = (await db.query(`SELECT depth FROM schedules WHERE id=$1`, [boardId])).rows[0];
  if (!board) throw new ClaimError("That board doesn't exist.");
  const d = (await nodeDepth(parentId, db)) + 1;
  if (d > board.depth - 1) throw new ClaimError(`This board has ${board.depth} level${board.depth === 1 ? "" : "s"}, so there's no room for another container here.`);
  if (parentId) {
    const p = (await db.query(`SELECT schedule_id FROM board_nodes WHERE id=$1`, [parentId])).rows[0];
    if (!p || p.schedule_id !== boardId) throw new ClaimError("That container isn't on this board.");
  }
  return (await db.query(`INSERT INTO board_nodes (schedule_id, parent_id, name, settings, visible_from, color, sort) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [boardId, parentId, name, JSON.stringify(settings), visibleFrom, color, sort])).rows[0];
}

async function addItem({ boardId, nodeId = null, title, capacity, startsAt = null, endsAt = null, location = null, settings = {} }, db = { query }) {
  const board = (await db.query(`SELECT depth FROM schedules WHERE id=$1`, [boardId])).rows[0];
  if (!board) throw new ClaimError("That board doesn't exist.");
  // Items always sit at the bottom: under a container on the deepest container level (or under the board on 1-level boards)
  const d = await nodeDepth(nodeId, db);
  if (d !== board.depth - 1) throw new ClaimError(board.depth === 1 ? "Items go directly on this board." : `Items go inside the last level of containers (level ${board.depth - 1}).`);
  return (await db.query(`INSERT INTO board_items (schedule_id, node_id, title, capacity, starts_at, ends_at, location, settings)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [boardId, nodeId, title, capacity, startsAt, endsAt, location, JSON.stringify(settings)])).rows[0];
}

// ---------- reading the chain and resolving settings ----------
// Everything above an item: the board, its containers from the top down, and the item itself
async function chainFor(itemId, db = { query }) {
  const item = (await db.query(`SELECT * FROM board_items WHERE id=$1`, [itemId])).rows[0];
  if (!item) return null;
  const board = (await db.query(`SELECT * FROM schedules WHERE id=$1`, [item.schedule_id])).rows[0];
  const nodes = item.node_id ? (await db.query(`WITH RECURSIVE up AS (SELECT *, 0 AS lvl FROM board_nodes WHERE id=$1
      UNION ALL SELECT n.*, up.lvl + 1 FROM board_nodes n JOIN up ON n.id = up.parent_id) SELECT * FROM up ORDER BY lvl DESC`, [item.node_id])).rows : [];
  return { board, nodes, item };
}

// The settings that apply to an item, and where each one came from
function effective({ board, nodes, item }) {
  const levels = [{ kind: "board", id: board.id, name: board.name, s: { ...BOARD_DEFAULTS, attendance: !!board.track_attendance, ...(board.settings || {}) } },
    ...nodes.map((n) => ({ kind: "node", id: n.id, name: n.name, s: n.settings || {}, visibleFrom: n.visible_from })),
    { kind: "item", id: item.id, name: item.title, s: item.settings || {} }];
  const out = { from: {} };
  for (const k of INHERITED) for (const L of levels) if (has(L.s, k)) { out[k] = L.s[k]; out.from[k] = L.name; }
  if (item.location) { out.location = item.location; out.from.location = item.title; }
  // limits: every level (board and containers) that sets one applies
  out.limits = levels.filter((L) => L.kind !== "item" && has(L.s, "limit") && L.s.limit != null).map((L) => ({ kind: L.kind, id: L.id, name: L.name, limit: Number(L.s.limit) }));
  // who: every level that narrows must pass
  out.who = levels.filter((L) => L.kind !== "board" && L.s.who && L.s.who.mode).map((L) => ({ name: L.name, ...L.s.who }));
  out.hiddenUntil = levels.filter((L) => L.visibleFrom && new Date(L.visibleFrom) > new Date()).map((L) => ({ name: L.name, at: L.visibleFrom }))[0] || null;
  return out;
}

// ---------- who can claim ----------
// person = { athleteId, userId (null for a public, not-signed-in claim), member: { group_name, tags } | null }
function whoPasses(rule, person) {
  if (rule.mode === "signed_in") return !!person.userId;
  if (rule.mode === "list") return !!person.member;
  if (rule.mode === "teams") {
    const m = person.member; if (!m) return false;
    const g = rule.groups || [], t = rule.tags || [];
    if (g.length && !g.includes(m.group_name)) return false;
    if (t.length && !(m.tags || []).some((x) => t.includes(x))) return false;
    return true;
  }
  return true;
}
function doorPasses(board, person) {
  const mode = board.claim_mode || "family";
  if (mode === "public") return true;
  if (mode === "family") return !!person.userId;
  return !!person.member; // roster: only people on the board's list
}
const whoText = (r) => r.mode === "signed_in" ? "people who are signed in" : r.mode === "list" ? "people on this board's list"
  : [...(r.groups || []), ...(r.tags || [])].join(" or ") || "certain people";

// Can this person see and claim this item? Returns { ok, reason, leftover }
function check(chain, eff, person, now = new Date()) {
  const { board, item } = chain;
  if (!board.published_at) return { ok: false, reason: "This board isn't published yet." };
  if (board.archived_at) return { ok: false, reason: "This board is closed." };
  if (item.canceled_at) return { ok: false, reason: "This was canceled." };
  if (eff.hiddenUntil) return { ok: false, hidden: true, reason: `${eff.hiddenUntil.name} isn't open yet.` };
  if (!doorPasses(board, person)) return { ok: false, hidden: true, reason: "You need to be signed in (or on the list) to claim on this board." };
  for (const rule of eff.who) if (!whoPasses(rule, person)) return { ok: false, hidden: true, reason: `${rule.name} is only for ${whoText(rule)}.` };
  if (item.starts_at && new Date(item.starts_at) <= now) return { ok: false, reason: "This has already started." };
  if (eff.opens_at && new Date(eff.opens_at) > now) return { ok: false, reason: `Claiming opens ${new Date(eff.opens_at).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` };
  const leftover = !!item.unlocked_at || (item.starts_at && eff.leftover_hours != null && (new Date(item.starts_at) - now) <= eff.leftover_hours * 3600e3);
  return { ok: true, leftover };
}

// Item ids inside a container (any depth below it)
async function itemsUnder(nodeId, db) {
  return (await db.query(`WITH RECURSIVE down AS (SELECT id FROM board_nodes WHERE id=$1 UNION ALL SELECT n.id FROM board_nodes n JOIN down ON n.parent_id = down.id)
    SELECT i.id FROM board_items i WHERE i.node_id IN (SELECT id FROM down)`, [nodeId])).rows.map((r) => r.id);
}

// ---------- claiming ----------
async function claim({ itemId, athleteId, userId = null, note = null, member = undefined, now = new Date() }) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`SELECT id FROM board_items WHERE id=$1 FOR UPDATE`, [itemId]); // one claim at a time per item
    const chain = await chainFor(itemId, db);
    if (!chain) throw new ClaimError("That isn't available.");
    const eff = effective(chain);
    if (member === undefined) member = (await db.query(`SELECT group_name, tags FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [chain.board.id, athleteId])).rows[0] || null;
    const person = { athleteId, userId, member };
    const ok = check(chain, eff, person, now);
    if (!ok.ok) throw new ClaimError(ok.reason);
    if ((await db.query(`SELECT 1 FROM board_claims WHERE item_id=$1 AND athlete_id=$2 AND status<>'canceled'`, [itemId, athleteId])).rowCount)
      throw new ClaimError("Already claimed.");
    const q = chain.board.question;
    const cleanNote = q && q.label ? String(note || "").replace(/\s+/g, " ").trim().slice(0, 120) || null : null;
    if (q && q.label && q.required && !cleanNote) throw new ClaimError(`Please answer: ${q.label}`);
    // limits (skipped for open leftover spots, which don't count)
    if (!ok.leftover) for (const L of eff.limits) {
      const ids = L.kind === "board" ? (await db.query(`SELECT id FROM board_items WHERE schedule_id=$1`, [chain.board.id])).rows.map((r) => r.id) : await itemsUnder(L.id, db);
      const n = (await db.query(`SELECT count(*)::int AS n FROM board_claims WHERE athlete_id=$1 AND item_id = ANY($2) AND status<>'canceled' AND counts`, [athleteId, ids])).rows[0].n;
      if (n >= L.limit) throw new ClaimError(`That's the limit: ${L.limit} per person ${L.kind === "board" ? "on this board" : `in ${L.name}`}.`);
    }
    const taken = (await db.query(`SELECT count(*)::int AS n FROM board_claims WHERE item_id=$1 AND status='confirmed'`, [itemId])).rows[0].n;
    let status = "confirmed";
    if (taken >= chain.item.capacity) { if (!eff.waitlist) throw new ClaimError("That's full."); status = "waitlisted"; }
    const c = (await db.query(`INSERT INTO board_claims (item_id, athlete_id, booked_by, status, counts, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [itemId, athleteId, userId, status, !ok.leftover, cleanNote])).rows[0];
    await db.query("COMMIT");
    return c;
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}

// When people may cancel themselves (admins always can)
function cancelDeadline(item, eff) {
  if (!item.starts_at || !eff.cancel_hours) return null;
  return new Date(new Date(item.starts_at) - eff.cancel_hours * 3600e3);
}

// Move the first person on the waitlist in, while there's room
async function promote(itemId, db) {
  const out = [];
  for (;;) {
    const item = (await db.query(`SELECT capacity FROM board_items WHERE id=$1`, [itemId])).rows[0];
    const taken = (await db.query(`SELECT count(*)::int AS n FROM board_claims WHERE item_id=$1 AND status='confirmed'`, [itemId])).rows[0].n;
    if (!item || taken >= item.capacity) break;
    const next = (await db.query(`SELECT id FROM board_claims WHERE item_id=$1 AND status='waitlisted' ORDER BY created_at, id LIMIT 1`, [itemId])).rows[0];
    if (!next) break;
    out.push((await db.query(`UPDATE board_claims SET status='confirmed', promoted_at=now() WHERE id=$1 RETURNING *`, [next.id])).rows[0]);
  }
  return out;
}

async function cancel({ claimId, admin = false, now = new Date() }) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const c = (await db.query(`SELECT * FROM board_claims WHERE id=$1 FOR UPDATE`, [claimId])).rows[0];
    if (!c || c.status === "canceled") throw new ClaimError("That claim isn't active.");
    await db.query(`SELECT id FROM board_items WHERE id=$1 FOR UPDATE`, [c.item_id]);
    const chain = await chainFor(c.item_id, db);
    const dl = cancelDeadline(chain.item, effective(chain));
    if (!admin && c.status === "confirmed" && dl && now > dl) throw new ClaimError("Too late to cancel in the app.");
    await db.query(`UPDATE board_claims SET status='canceled', canceled_at=now() WHERE id=$1`, [claimId]);
    const promoted = c.status === "confirmed" ? await promote(c.item_id, db) : [];
    await db.query("COMMIT");
    return { canceled: c, promoted };
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}

async function setCapacity(itemId, capacity) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`UPDATE board_items SET capacity=$2 WHERE id=$1`, [itemId, capacity]);
    const promoted = await promote(itemId, db);
    await db.query("COMMIT");
    return promoted;
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}

// ---------- reading a level (for the Setup screen) ----------
// Containers from the top down to (and including) nodeId
async function nodeChain(nodeId, db = { query }) {
  if (!nodeId) return [];
  return (await db.query(`WITH RECURSIVE up AS (SELECT *, 0 AS lvl FROM board_nodes WHERE id=$1
      UNION ALL SELECT n.*, up.lvl + 1 FROM board_nodes n JOIN up ON n.id = up.parent_id) SELECT * FROM up ORDER BY lvl DESC`, [nodeId])).rows;
}
// The settings in force at a container (or the board when nodes is empty), and where each came from
function effectiveAt(board, nodes) {
  return effective({ board, nodes, item: { id: 0, title: "", settings: {}, location: null } });
}
// What's directly inside a level: its containers (with rollup counts), or its items (with claim counts)
async function children(boardId, parentId, db = { query }) {
  return (await db.query(`
    WITH RECURSIVE kids AS (SELECT id FROM board_nodes WHERE schedule_id=$1 AND parent_id IS NOT DISTINCT FROM $2),
    tree AS (SELECT k.id AS top, k.id FROM kids k UNION ALL SELECT t.top, n.id FROM board_nodes n JOIN tree t ON n.parent_id = t.id)
    SELECT n.*,
      (SELECT count(*)::int FROM board_nodes c WHERE c.parent_id = n.id) AS containers,
      (SELECT count(*)::int FROM board_items i WHERE i.node_id IN (SELECT id FROM tree WHERE top = n.id) AND i.canceled_at IS NULL) AS items,
      (SELECT coalesce(sum(i.capacity),0)::int FROM board_items i WHERE i.node_id IN (SELECT id FROM tree WHERE top = n.id) AND i.canceled_at IS NULL) AS spots,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.node_id IN (SELECT id FROM tree WHERE top = n.id) AND c.status='confirmed') AS claimed
    FROM board_nodes n WHERE n.schedule_id=$1 AND n.parent_id IS NOT DISTINCT FROM $2 ORDER BY n.sort, n.id`, [boardId, parentId || null])).rows;
}
async function items(boardId, nodeId, db = { query }) {
  return (await db.query(`SELECT i.*,
      (SELECT count(*)::int FROM board_claims c WHERE c.item_id=i.id AND c.status='confirmed') AS claimed,
      (SELECT count(*)::int FROM board_claims c WHERE c.item_id=i.id AND c.status='waitlisted') AS waitlisted
    FROM board_items i WHERE i.schedule_id=$1 AND i.node_id IS NOT DISTINCT FROM $2 AND i.canceled_at IS NULL
    ORDER BY i.starts_at NULLS FIRST, i.sort, i.id`, [boardId, nodeId || null])).rows;
}
async function boardTotals(boardId, db = { query }) {
  return (await db.query(`SELECT (SELECT count(*)::int FROM board_nodes WHERE schedule_id=$1) AS containers,
      (SELECT count(*)::int FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL) AS items,
      (SELECT coalesce(sum(capacity),0)::int FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL) AS spots,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=$1 AND c.status='confirmed') AS claimed`, [boardId])).rows[0];
}

module.exports = { nodeChain, effectiveAt, children, items, boardTotals, ClaimError, createBoard, addNode, addItem, chainFor, effective, check, claim, cancel, cancelDeadline, setCapacity, nodeDepth, whoPasses };
