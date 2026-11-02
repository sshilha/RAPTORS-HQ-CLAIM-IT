// Setup-screen actions on the container engine (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const E = require("../engine");
const SC = require("../schedules");
const { wrap, go, int, str, dest, flashFrom } = require("./util");

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

// ---------- the public link (Anyone with the link) ----------
async function shareCode(sc) {
  if (sc.share_code) return sc.share_code;
  const code = require("crypto").randomBytes(6).toString("base64url").replace(/[-_]/g, "x");
  await query(`UPDATE schedules SET share_code=$2 WHERE id=$1 AND share_code IS NULL`, [sc.id, code]);
  return (await query(`SELECT share_code FROM schedules WHERE id=$1`, [sc.id])).rows[0].share_code;
}
router.get("/:sid/qr.svg", wrap(async (req, res) => {
  const sc = await board(req); if (!sc) return res.status(404).end();
  const url = `${process.env.APP_URL || `${req.protocol}://${req.get("host")}`}/s/${await shareCode(sc)}`;
  const svg = await require("qrcode").toString(url, { type: "svg", margin: 1, color: { dark: "#0B1930", light: "#ffffff" } });
  res.set("Content-Type", "image/svg+xml");
  if (req.query.download) res.set("Content-Disposition", `attachment; filename="${sc.name.replace(/[^A-Za-z0-9 -]/g, "")} QR.svg"`);
  res.send(svg);
}));
router.shareCode = shareCode;

// ---------- publish (the whole board) ----------
router.post("/:sid/publish", wrap(async (req, res) => {
  const sc = await board(req); if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const back = dest(req, at(sc.id));
  if (!sc.published_at) {
    const n = (await E.boardTotals(sc.id)).items;
    if (!n) return go(res, back, { err: `Add at least one ${SC.labels(sc).slot.one.toLowerCase()} first, then publish.` });
  }
  const r = (await query(`UPDATE schedules SET published_at = CASE WHEN published_at IS NULL THEN now() ELSE NULL END WHERE id=$1 RETURNING published_at`, [sc.id])).rows[0];
  if (r.published_at && sc.claim_mode === "public") await shareCode(sc);
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

// Duplicate a level: its sub-levels, settings, and sessions (never claims), placed right after it as "Name (copy)"
router.post("/:sid/nodes/:nid/duplicate", wrap(async (req, res) => {
  const sc = await board(req); const n = await node(req, sc);
  if (!n) return go(res, at(sc.id), { err: "Not found." });
  const all = (await query(`SELECT * FROM board_nodes WHERE schedule_id=$1`, [sc.id])).rows;
  // number the siblings in their current order, leaving a gap right after this one for the copy
  await query(`WITH o AS (SELECT id, row_number() OVER (ORDER BY sort, id) * 2 AS rn FROM board_nodes WHERE schedule_id=$1 AND parent_id IS NOT DISTINCT FROM $2)
    UPDATE board_nodes b SET sort = o.rn FROM o WHERE b.id = o.id`, [sc.id, n.parent_id]);
  n.sort = (await query(`SELECT sort FROM board_nodes WHERE id=$1`, [n.id])).rows[0].sort;
  const copyOne = async (src, parentId, name, sort) => {
    const r = (await query(`INSERT INTO board_nodes (schedule_id, parent_id, name, sort, color, settings, visible_from) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [sc.id, parentId, name, sort, src.color, JSON.stringify(src.settings || {}), src.visible_from])).rows[0];
    await query(`INSERT INTO board_items (schedule_id, node_id, title, starts_at, ends_at, capacity, location, settings, sort)
      SELECT schedule_id, $2, title, starts_at, ends_at, capacity, location, settings, sort FROM board_items WHERE node_id=$1 AND canceled_at IS NULL`, [src.id, r.id]);
    for (const k of all.filter((x) => x.parent_id === src.id).sort((a, b) => a.sort - b.sort || a.id - b.id)) await copyOne(k, r.id, k.name, k.sort);
    return r.id;
  };
  const newId = await copyOne(n, n.parent_id, `${n.name} (copy)`.slice(0, 60), n.sort + 1);
  const c = (await query(`WITH RECURSIVE d AS (SELECT id FROM board_nodes WHERE id=$1 UNION ALL SELECT x.id FROM board_nodes x JOIN d ON x.parent_id=d.id)
    SELECT (SELECT count(*)::int FROM d) - 1 AS levels, (SELECT count(*)::int FROM board_items WHERE node_id IN (SELECT id FROM d)) AS items`, [newId])).rows[0];
  go(res, at(sc.id, newId), { ok: `Made “${n.name} (copy)”${c.levels ? ` with ${c.levels} level${c.levels === 1 ? "" : "s"} inside` : ""}${c.items ? `${c.levels ? " and" : " with"} ${c.items} session${c.items === 1 ? "" : "s"}` : ""} (no claims). Rename it and adjust what's different.` });
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
  const b = req.body;
  const ONLY = { who: "who", limit: "limit", opens: "opens_at", cancel: "cancel_hours", leftover: "leftover_hours", waitlist: "waitlist", attendance: "attendance", location: "location", visible: null };
  const only = Object.prototype.hasOwnProperty.call(ONLY, b.only) ? b.only : null;
  const s = only ? { ...(n.settings || {}) } : {};
  if (only && ONLY[only]) delete s[ONLY[only]];
  const want = (k) => !only || only === k;
  const list = (v) => [].concat(v || []).map(String);
  if (want("who") && ["signed_in", "list"].includes(b.who_mode)) s.who = { mode: b.who_mode };
  if (want("who") && b.who_mode === "teams") {
    const groups = list(b.who_groups).filter((g) => SC.groupsFor(sc).includes(g)), tags = list(b.who_tags).filter((t) => (sc.tags || []).includes(t));
    if (!groups.length && !tags.length) return go(res, at(sc.id, n.id), { err: `Pick at least one ${SC.labels(sc).group.one.toLowerCase()} or tag, or choose Same as above.` });
    s.who = { mode: "teams", groups, tags };
  }
  if (want("limit") && b.limit_mode === "n") s.limit = Math.max(1, Math.min(int(b.limit_n) || 1, 99));
  if (want("opens") && b.opens === "now") s.opens_at = null;
  if (want("opens") && b.opens === "at") { const t = await ts(b.opens_at); if (!t) return go(res, at(sc.id, n.id), { err: "Pick when claiming opens." }); s.opens_at = new Date(t).toISOString(); }
  if (want("cancel") && b.cancel === "n") s.cancel_hours = Math.max(0, Math.min(int(b.cancel_hours) ?? 24, 336));
  if (want("leftover") && b.leftover === "never") s.leftover_hours = null;
  if (want("leftover") && b.leftover === "n") { const k = Math.max(1, Math.min(int(b.leftover_n) || 1, 1440)); s.leftover_hours = b.leftover_unit === "hours" ? k : k * 24; }
  if (want("waitlist") && (b.waitlist === "on" || b.waitlist === "off")) s.waitlist = b.waitlist === "on";
  if (want("attendance") && (b.attendance === "on" || b.attendance === "off")) s.attendance = b.attendance === "on";
  if (want("location") && str(b.location)) s.location = str(b.location).slice(0, 80);
  const vf = only && only !== "visible" ? n.visible_from : b.visible === "at" ? await ts(b.visible_from) : null;
  if (want("visible") && b.visible === "at" && !vf) return go(res, at(sc.id, n.id), { err: "Pick the date and time it becomes visible." });
  await query(`UPDATE board_nodes SET settings=$2, visible_from=$3 WHERE id=$1`, [n.id, JSON.stringify(s), vf]);
  go(res, at(sc.id, n.id), { ok: only ? `Saved ${{ who: "who can claim", limit: "the limit", opens: "when claiming opens", cancel: "the cancel deadline", leftover: "open leftover spots", waitlist: "the waitlist", attendance: "attendance", location: "the location", visible: "when it's visible" }[only]} for ${n.name}.` : `Saved settings for ${n.name}.` });
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
  if (!out.title && !out.startsAt) return { err: "Give it a name, or a date and time." };
  if (!int(b.capacity)) return { err: "Enter how many spots." };
  return out;
}
// the dates a weekly repeat makes: from the first date through "until", on the chosen weekdays (0 = Sunday)
function repeatDates(first, until, days) {
  const out = [], start = Date.parse(first + "T12:00:00Z"), end = Date.parse(until + "T12:00:00Z");
  if (!(end >= start)) return out;
  for (let t = start; t <= end && out.length < 200; t += 864e5) { const d = new Date(t); if (days.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); }
  return out;
}
router.post("/:sid/items", wrap(async (req, res) => {
  const sc = await board(req); const nodeId = int(req.body.node_id) || null;
  const v = await readItem(req.body); if (v.err) return go(res, at(sc.id, nodeId), { err: v.err });
  // Repeat weekly: one session per chosen weekday, from the date through "until", same times and spots
  if (req.body.repeat === "1" && v.startsAt) {
    const days = [].concat(req.body.days || []).map((x) => int(x)).filter((x) => x >= 0 && x <= 6);
    const until = str(req.body.until);
    if (!days.length || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return go(res, at(sc.id, nodeId), { err: "For a repeat, pick the days and an end date." });
    const dates = repeatDates(str(req.body.date), until, days);
    if (!dates.length) return go(res, at(sc.id, nodeId), { err: "No dates match those days between the start and end dates." });
    try {
      for (const d of dates) await E.addItem({ boardId: sc.id, nodeId, title: v.title, capacity: v.capacity, location: v.location,
        startsAt: await ts(d, str(req.body.start_time)), endsAt: await ts(d, str(req.body.end_time)) });
    } catch (e) { return fail(res, at(sc.id, nodeId), e); }
    return go(res, at(sc.id, nodeId), { ok: `Added ${dates.length} session${dates.length === 1 ? "" : "s"}, ${dates[0]} through ${dates[dates.length - 1]}${dates.length === 200 ? " (200 is the most at once)" : ""}.` });
  }
  try { await E.addItem({ boardId: sc.id, nodeId, ...v }); } catch (e) { return fail(res, at(sc.id, nodeId), e); }
  go(res, at(sc.id, nodeId), { ok: `Added "${require("../time").slotName({ title: v.title, starts_at: v.startsAt, ends_at: v.endsAt })}" with ${v.capacity} spot${v.capacity === 1 ? "" : "s"}.` });
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
  go(res, at(sc.id, it.node_id), { ok: `Saved "${require("../time").slotName({ title: v.title, starts_at: v.startsAt, ends_at: v.endsAt })}".${moved.length ? ` ${moved.length} moved off the waitlist.` : ""}` });
}));
// ---------- who's in a spot (admins can add and remove people) ----------
async function spot(req) {
  const sc = await board(req);
  const it = sc && (await query(`SELECT * FROM board_items WHERE id=$1 AND schedule_id=$2`, [int(req.params.iid), sc.id])).rows[0];
  return { sc, it };
}
router.get("/:sid/items/:iid/people", wrap(async (req, res) => {
  const { sc, it } = await spot(req); if (!it) return go(res, at(sc && sc.id), { err: "Not found." });
  const chain = await E.chainFor(it.id);
  const people = (await query(`SELECT c.*, a.first_name, a.last_name, a.kind, m.group_name, u.email AS booked_email,
      ARRAY(SELECT u2.email FROM parent_athletes pa JOIN users u2 ON u2.id=pa.user_id WHERE pa.athlete_id=a.id) AS parent_emails, a.email AS own_email
    FROM board_claims c JOIN athletes a ON a.id=c.athlete_id LEFT JOIN schedule_members m ON m.schedule_id=$2 AND m.athlete_id=a.id LEFT JOIN users u ON u.id=c.booked_by
    WHERE c.item_id=$1 AND c.status<>'canceled' ORDER BY c.status, c.created_at, c.id`, [it.id, sc.id])).rows;
  const inIds = people.map((p) => p.athlete_id);
  const onBoard = (await query(`SELECT a.id, a.first_name, a.last_name, m.group_name FROM schedule_members m JOIN athletes a ON a.id=m.athlete_id
    WHERE m.schedule_id=$1 AND a.archived_at IS NULL AND a.id <> ALL($2) ORDER BY lower(a.last_name), lower(a.first_name)`, [sc.id, inIds])).rows;
  const everyone = (await query(`SELECT id, first_name, last_name, kind FROM athletes WHERE archived_at IS NULL AND id <> ALL($1) ORDER BY lower(last_name), lower(first_name) LIMIT 1000`,
    [[...inIds, ...onBoard.map((p) => p.id)]])).rows;
  res.send(require("../views/board").spotPeoplePage({ user: req.user, flash: flashFrom(req), sc, it, path: chain ? chain.nodes.map((n) => n.name) : [], people, onBoard, everyone }));
}));
router.post("/:sid/items/:iid/people/add", wrap(async (req, res) => {
  const { sc, it } = await spot(req); if (!it) return go(res, at(sc && sc.id), { err: "Not found." });
  const back = `/admin/b/${sc.id}/items/${it.id}/people`;
  const aid = int(req.body.athlete_id); if (!aid) return go(res, back, { err: "Pick someone to add." });
  const p = (await query(`SELECT first_name, last_name FROM athletes WHERE id=$1`, [aid])).rows[0]; if (!p) return go(res, back, { err: "Not found." });
  const note = str(req.body.note).slice(0, 120) || null, email = req.body.email === "1", override = req.body.override === "1";
  let c;
  try {
    c = await E.claim({ itemId: it.id, athleteId: aid, userId: req.user.id, note });
  } catch (e) {
    if (!(e instanceof E.ClaimError)) throw e;
    if (!override) return go(res, back, { err: `${p.first_name} ${p.last_name} can't be added: ${e.message} Check "Override the rules" to add them anyway.` });
    if ((await query(`SELECT 1 FROM board_claims WHERE item_id=$1 AND athlete_id=$2 AND status<>'canceled'`, [it.id, aid])).rowCount) return go(res, back, { err: `${p.first_name} is already in this spot.` });
    c = (await query(`INSERT INTO board_claims (item_id, athlete_id, booked_by, status, counts, note, override) VALUES ($1,$2,$3,'confirmed',true,$4,true) RETURNING *`, [it.id, aid, req.user.id, note])).rows[0];
  }
  // Override means "put them in the spot": a full spot's waitlist doesn't apply
  if (override && c.status === "waitlisted") c = (await query(`UPDATE board_claims SET status='confirmed', counts=true, override=true WHERE id=$1 RETURNING *`, [c.id])).rows[0];
  await query(`UPDATE board_claims SET added_by_admin=true WHERE id=$1`, [c.id]);
  if (email) await require("../engine/notify").claimed(c, null).catch((e) => console.error(e.message));
  go(res, back, { ok: `Added ${p.first_name} ${p.last_name}${c.status === "waitlisted" ? " to the waitlist" : ""}${c.override ? " (rules overridden)" : ""}.${email ? " They were emailed." : ""}` });
}));
router.post("/:sid/items/:iid/people/:cid/remove", wrap(async (req, res) => {
  const { sc, it } = await spot(req); if (!it) return go(res, at(sc && sc.id), { err: "Not found." });
  const back = `/admin/b/${sc.id}/items/${it.id}/people`;
  const c = (await query(`SELECT c.*, a.first_name, a.last_name FROM board_claims c JOIN athletes a ON a.id=c.athlete_id WHERE c.id=$1 AND c.item_id=$2`, [int(req.params.cid), it.id])).rows[0];
  if (!c) return go(res, back, {});
  try {
    const r = await E.cancel({ claimId: c.id, admin: true });
    // the removed person is emailed only if asked; anyone moved up off the waitlist always hears they're in
    await require("../engine/notify").canceled(r, null, { tellCanceled: req.body.email === "1" }).catch((e) => console.error(e.message));
    go(res, back, { ok: `Removed ${c.first_name} ${c.last_name}.${r.promoted && r.promoted.length ? ` ${r.promoted.length} moved up from the waitlist.` : ""}${req.body.email === "1" ? " They were emailed." : ""}` });
  } catch (e) { if (e instanceof E.ClaimError) return go(res, back, { err: e.message }); throw e; }
}));

router.post("/:sid/items/:iid/delete", wrap(async (req, res) => {
  const sc = await board(req);
  const it = (await query(`SELECT * FROM board_items WHERE id=$1 AND schedule_id=$2`, [int(req.params.iid), sc.id])).rows[0];
  if (!it) return go(res, at(sc.id), {});
  const n = (await query(`SELECT count(*)::int AS n FROM board_claims WHERE item_id=$1 AND status<>'canceled'`, [it.id])).rows[0].n;
  if (n) return go(res, at(sc.id, it.node_id), { err: `"${it.title}" has ${n} claim${n === 1 ? "" : "s"}, so it can't be removed. Cancel them first.` });
  await query(`DELETE FROM board_items WHERE id=$1`, [it.id]);
  go(res, at(sc.id, it.node_id), { ok: `Removed "${require("../time").slotName(it)}".` });
}));

module.exports = router;
