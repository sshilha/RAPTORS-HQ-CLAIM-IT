// Setup-screen actions on the container engine (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const E = require("../engine");
const SC = require("../schedules");
const { wrap, go, int, str, dest } = require("./util");

const router = express.Router();
router.use(auth.requireAdmin);

const at = (sid, n) => `/admin/setup?s=${sid}${n ? `&n=${n}` : ""}`;
// "2026-11-02" + "18:00" (Central) -> a timestamp; "2026-11-02T18:00" too
async function ts(dateOrLocal, time) {
  const local = time ? `${dateOrLocal} ${time}` : String(dateOrLocal || "").replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(local)) return null;
  return (await query(`SELECT ($1::timestamp AT TIME ZONE 'America/Chicago') AS t`, [local])).rows[0].t;
}
async function board(req) { return (await query(`SELECT * FROM schedules WHERE id=$1`, [int(req.params.sid)])).rows[0]; }
async function node(req, sc) { return (await query(`SELECT * FROM board_nodes WHERE id=$1 AND schedule_id=$2`, [int(req.params.nid), sc.id])).rows[0]; }
const fail = (res, path, e) => { if (e instanceof E.ClaimError) return go(res, path, { err: e.message }); throw e; };

// ---------- publish (the whole board) ----------
router.post("/:sid/publish", wrap(async (req, res) => {
  const sc = await board(req); if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const back = dest(req, at(sc.id));
  if (!sc.published_at) {
    const n = (await E.boardTotals(sc.id)).items;
    if (!n) return go(res, back, { err: `Add at least one ${SC.labels(sc).slot.one.toLowerCase()} first, then publish.` });
  }
  const r = (await query(`UPDATE schedules SET published_at = CASE WHEN published_at IS NULL THEN now() ELSE NULL END WHERE id=$1 RETURNING published_at`, [sc.id])).rows[0];
  go(res, back, { ok: r.published_at ? "Published. People can now see it and claim." : "Unpublished. People won't see it until you publish again. Claims are kept." });
}));

// ---------- containers ----------
router.post("/:sid/nodes", wrap(async (req, res) => {
  const sc = await board(req); const parent = int(req.body.parent_id) || null;
  const name = str(req.body.name).replace(/\s+/g, " ").slice(0, 60);
  if (!name) return go(res, at(sc.id, parent), { err: "Enter a name." });
  try {
    const sort = (await query(`SELECT coalesce(max(sort),0)+1 AS s FROM board_nodes WHERE schedule_id=$1 AND parent_id IS NOT DISTINCT FROM $2`, [sc.id, parent])).rows[0].s;
    await E.addNode({ boardId: sc.id, parentId: parent, name, sort });
  } catch (e) { return fail(res, at(sc.id, parent), e); }
  go(res, at(sc.id, parent), { ok: `Added ${name}.` });
}));

router.post("/:sid/nodes/:nid", wrap(async (req, res) => {
  const sc = await board(req); const n = await node(req, sc);
  if (!n) return go(res, at(sc.id), { err: "Not found." });
  const name = str(req.body.name).replace(/\s+/g, " ").slice(0, 60);
  if (name) await query(`UPDATE board_nodes SET name=$2 WHERE id=$1`, [n.id, name]);
  go(res, at(sc.id, n.id), { ok: `Saved ${name || n.name}.` });
}));

router.post("/:sid/nodes/:nid/delete", wrap(async (req, res) => {
  const sc = await board(req); const n = await node(req, sc);
  if (!n) return go(res, at(sc.id), {});
  const claims = (await query(`WITH RECURSIVE down AS (SELECT id FROM board_nodes WHERE id=$1 UNION ALL SELECT c.id FROM board_nodes c JOIN down ON c.parent_id=down.id)
    SELECT count(*)::int AS n FROM board_claims x JOIN board_items i ON i.id=x.item_id WHERE i.node_id IN (SELECT id FROM down) AND x.status<>'canceled'`, [n.id])).rows[0].n;
  if (claims) return go(res, at(sc.id, n.id), { err: `${n.name} has ${claims} claim${claims === 1 ? "" : "s"}, so it can't be removed. Cancel them first.` });
  await query(`DELETE FROM board_nodes WHERE id=$1`, [n.id]);
  go(res, at(sc.id, n.parent_id), { ok: `Removed ${n.name}.` });
}));

// A container's own settings ("Same as above" clears that setting here)
router.post("/:sid/nodes/:nid/settings", wrap(async (req, res) => {
  const sc = await board(req); const n = await node(req, sc);
  if (!n) return go(res, at(sc.id), { err: "Not found." });
  const b = req.body, s = {};
  const list = (v) => [].concat(v || []).map(String);
  if (["signed_in", "list"].includes(b.who_mode)) s.who = { mode: b.who_mode };
  if (b.who_mode === "teams") {
    const groups = list(b.who_groups).filter((g) => SC.groupsFor(sc).includes(g)), tags = list(b.who_tags).filter((t) => (sc.tags || []).includes(t));
    if (!groups.length && !tags.length) return go(res, at(sc.id, n.id), { err: `Pick at least one ${SC.labels(sc).group.one.toLowerCase()} or tag, or choose Same as above.` });
    s.who = { mode: "teams", groups, tags };
  }
  if (b.limit_mode === "n") s.limit = Math.max(1, Math.min(int(b.limit_n) || 1, 99));
  if (b.opens === "now") s.opens_at = null;
  if (b.opens === "at") { const t = await ts(b.opens_at); if (!t) return go(res, at(sc.id, n.id), { err: "Pick when claiming opens." }); s.opens_at = new Date(t).toISOString(); }
  if (b.cancel === "n") s.cancel_hours = Math.max(0, Math.min(int(b.cancel_hours) ?? 24, 336));
  if (b.leftover === "never") s.leftover_hours = null;
  if (b.leftover === "n") { const k = Math.max(1, Math.min(int(b.leftover_n) || 1, 1440)); s.leftover_hours = b.leftover_unit === "hours" ? k : k * 24; }
  if (b.waitlist === "on" || b.waitlist === "off") s.waitlist = b.waitlist === "on";
  if (b.attendance === "on" || b.attendance === "off") s.attendance = b.attendance === "on";
  if (str(b.location)) s.location = str(b.location).slice(0, 80);
  const vf = b.visible === "at" ? await ts(b.visible_from) : null;
  if (b.visible === "at" && !vf) return go(res, at(sc.id, n.id), { err: "Pick the date and time it becomes visible." });
  await query(`UPDATE board_nodes SET settings=$2, visible_from=$3 WHERE id=$1`, [n.id, JSON.stringify(s), vf]);
  go(res, at(sc.id, n.id), { ok: `Saved settings for ${n.name}.` });
}));

// ---------- board-wide defaults (Settings page) ----------
router.post("/:sid/defaults", wrap(async (req, res) => {
  const sc = await board(req); const b = req.body;
  const back = `/admin/setup/schedule?s=${sc.id}#rg-${["limits", "timing", "question"].includes(b.q) ? b.q : "limits"}`;
  const s = { ...(sc.settings || {}) };
  if (b.q === "limits") {
    if (b.limit_mode === "n") s.limit = Math.max(1, Math.min(int(b.limit_n) || 1, 99)); else delete s.limit;
    if (b.leftover === "never") s.leftover_hours = null;
    if (b.leftover === "n") { const k = Math.max(1, Math.min(int(b.leftover_n) || 1, 1440)); s.leftover_hours = b.leftover_unit === "hours" ? k : k * 24; }
    s.waitlist = b.waitlist === "on";
  }
  if (b.q === "timing") {
    if (b.opens === "at") { const t = await ts(b.opens_at); if (!t) return go(res, back, { err: "Pick when claiming opens." }); s.opens_at = new Date(t).toISOString(); } else s.opens_at = null;
    if (b.cancel_hours !== undefined) s.cancel_hours = Math.max(0, Math.min(int(b.cancel_hours) ?? 24, 336));
  }
  if (b.q === "question") {
    const label = str(b.label).replace(/\s+/g, " ").slice(0, 80);
    if (b.ask && !label) return go(res, back, { err: "Type the question you want to ask." });
    await query(`UPDATE schedules SET question=$2 WHERE id=$1`, [sc.id, b.ask ? JSON.stringify({ label, required: !!b.required, public: !!b.public }) : null]);
  }
  await query(`UPDATE schedules SET settings=$2 WHERE id=$1`, [sc.id, JSON.stringify(s)]);
  go(res, back, { ok: "Saved." });
}));

// ---------- items ----------
async function readItem(b) {
  const out = { title: str(b.title).replace(/\s+/g, " ").slice(0, 80), capacity: Math.max(1, Math.min(int(b.capacity) || 0, 500)), location: str(b.location).slice(0, 80) || null, startsAt: null, endsAt: null };
  if (str(b.date) || str(b.start_time) || str(b.end_time)) {
    if (!str(b.date) || !str(b.start_time) || !str(b.end_time)) return { err: "For a date and time, fill in the date, start, and end (or leave all three empty)." };
    if (str(b.end_time) <= str(b.start_time)) return { err: "The end time needs to be after the start time." };
    out.startsAt = await ts(str(b.date), str(b.start_time)); out.endsAt = await ts(str(b.date), str(b.end_time));
  }
  if (!out.title) return { err: "Enter a name." };
  if (!int(b.capacity)) return { err: "Enter how many spots." };
  return out;
}
router.post("/:sid/items", wrap(async (req, res) => {
  const sc = await board(req); const nodeId = int(req.body.node_id) || null;
  const v = await readItem(req.body); if (v.err) return go(res, at(sc.id, nodeId), { err: v.err });
  try { await E.addItem({ boardId: sc.id, nodeId, ...v }); } catch (e) { return fail(res, at(sc.id, nodeId), e); }
  go(res, at(sc.id, nodeId), { ok: `Added "${v.title}" with ${v.capacity} spot${v.capacity === 1 ? "" : "s"}.` });
}));
router.post("/:sid/items/:iid", wrap(async (req, res) => {
  const sc = await board(req);
  const it = (await query(`SELECT * FROM board_items WHERE id=$1 AND schedule_id=$2`, [int(req.params.iid), sc.id])).rows[0];
  if (!it) return go(res, at(sc.id), { err: "Not found." });
  const v = await readItem(req.body); if (v.err) return go(res, at(sc.id, it.node_id), { err: v.err });
  const taken = (await query(`SELECT count(*)::int AS n FROM board_claims WHERE item_id=$1 AND status='confirmed'`, [it.id])).rows[0].n;
  if (v.capacity < taken) return go(res, at(sc.id, it.node_id), { err: `${taken} people already claimed it, so it needs at least ${taken} spots.` });
  await query(`UPDATE board_items SET title=$2, location=$3, starts_at=$4, ends_at=$5 WHERE id=$1`, [it.id, v.title, v.location, v.startsAt, v.endsAt]);
  const moved = await E.setCapacity(it.id, v.capacity);
  go(res, at(sc.id, it.node_id), { ok: `Saved "${v.title}".${moved.length ? ` ${moved.length} moved off the waitlist.` : ""}` });
}));
router.post("/:sid/items/:iid/delete", wrap(async (req, res) => {
  const sc = await board(req);
  const it = (await query(`SELECT * FROM board_items WHERE id=$1 AND schedule_id=$2`, [int(req.params.iid), sc.id])).rows[0];
  if (!it) return go(res, at(sc.id), {});
  const n = (await query(`SELECT count(*)::int AS n FROM board_claims WHERE item_id=$1 AND status<>'canceled'`, [it.id])).rows[0].n;
  if (n) return go(res, at(sc.id, it.node_id), { err: `"${it.title}" has ${n} claim${n === 1 ? "" : "s"}, so it can't be removed. Cancel them first.` });
  await query(`DELETE FROM board_items WHERE id=$1`, [it.id]);
  go(res, at(sc.id, it.node_id), { ok: `Removed "${it.title}".` });
}));

module.exports = router;
