// App Settings → Roles: create and edit roles. Needs "Create and edit roles" (administrators always can).
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const R = require("../roles");
const { wrap, flashFrom, go, int, str } = require("./util");
const router = express.Router();
router.use(auth.requireUser);
router.use(wrap(async (req, res, next) => { const acc = await R.forUser(req.user); if (!acc.has("settings.roles")) return res.status(404).send("Not found");
  if (req.method !== "GET" && !acc.has("settings.roles", 2)) return go(res, "/admin/roles", { err: "Your role can view roles but not change them." }); req.access = acc; next(); }));
const page = async (req, body) => require("../views/admin").page({ title: "Roles", tab: "settings", user: req.user, flash: flashFrom(req), noBack: true, body });
const record = (req, summary) => require("../activity").record(req, { kind: "roles", summary }).catch(() => {});
const LVL = { none: "No access", view: "View only", full: "Full" };
const diff = (a = {}, b = {}) => R.ALL.filter((k) => (a[k] || "none") !== (b[k] || "none")).map((k) => { const p = R.PERMS.flatMap(([, ps]) => ps).find((x) => x[0] === k);
  const lab = (v) => (p[3] === "yn" ? (v === "full" ? "Yes" : "No") : p[3] === "ra" ? { none: "Can't", view: "Request it", full: "Add directly" }[v] : LVL[v]); return `${p[1]}: ${lab(a[k] || "none")} → ${lab(b[k] || "none")}`; });
const read = (b) => ({ board_type: Object.keys(R.BOARD_TYPES).includes(b.board_type) ? b.board_type : "training", notify: Object.fromEntries(Object.keys(R.NOTIFY).map((k) => [k, b[`n_${k}`] === "1"])), name: str(b.name).slice(0, 60), description: str(b.description).slice(0, 160) || null, scope: Object.keys(R.SCOPE).includes(b.scope) ? b.scope : "board",
  grants: Object.fromEntries(R.ALL.map((k) => [k, ["none", "view", "full"].includes(b[`g_${k}`]) && (R.KIND[k] !== "yn" || b[`g_${k}`] !== "view") ? b[`g_${k}`] : "none"]).filter(([, v]) => v !== "none")) });
router.get("/", wrap(async (req, res) => {
  const head = await require("../views/apphead").head({ active: "roles", acc: req.access });
  res.send(await page(req, require("../views/roles").rolesPage({ head, roles: await R.list(), editId: int(req.query.edit), canEdit: req.access.has("settings.roles", 2), boards: (await query(`SELECT id, name FROM schedules WHERE archived_at IS NULL ORDER BY lower(name)`)).rows })));
}));
router.post("/", wrap(async (req, res) => {
  await R.ensure(); const r = read(req.body);
  if (!r.name) return go(res, "/admin/roles#add", { err: "Give the role a name." });
  if ((await query(`SELECT 1 FROM roles WHERE lower(name)=lower($1) AND archived_at IS NULL`, [r.name])).rowCount) return go(res, "/admin/roles#add", { err: `There's already a role called "${r.name}".` });
  const id = (await query(`INSERT INTO roles (name, description, scope, grants, board_type, notify, sort) VALUES ($1,$2,$3,$4,$5,$6,(SELECT coalesce(max(sort),0)+1 FROM roles)) RETURNING id`, [r.name, r.description, r.scope, JSON.stringify(r.grants), r.board_type, JSON.stringify(r.notify)])).rows[0].id;
  record(req, `Added the role "${r.name}" (${r.scope === "type" ? R.BOARD_TYPES[r.board_type] : R.SCOPE[r.scope]})`);
  go(res, `/admin/roles#r${id}`, { ok: `Added "${r.name}". Give it to people on their People page.` });
}));
router.post("/:id(\\d+)", wrap(async (req, res) => {
  await R.ensure();
  const old = (await query(`SELECT * FROM roles WHERE id=$1 AND archived_at IS NULL`, [int(req.params.id)])).rows[0];
  if (!old || old.key === "admin") return go(res, "/admin/roles", { err: "Administrator can't be changed." });
  const r = read(req.body); if (!r.name) return go(res, `/admin/roles?edit=${old.id}`, { err: "Give the role a name." });
  if ((await query(`SELECT 1 FROM roles WHERE lower(name)=lower($1) AND id<>$2 AND archived_at IS NULL`, [r.name, old.id])).rowCount) return go(res, `/admin/roles?edit=${old.id}`, { err: `There's already a role called "${r.name}".` });
  await query(`UPDATE roles SET name=$2, description=$3, grants=$4, notify=$5${old.key ? "" : ", scope=$6, board_type=$7"} WHERE id=$1`, old.key ? [old.id, r.name, r.description, JSON.stringify(r.grants), JSON.stringify(r.notify)] : [old.id, r.name, r.description, JSON.stringify(r.grants), JSON.stringify(r.notify), r.scope, r.board_type]);
  const ch = diff(old.grants || {}, r.grants), nch = Object.keys(R.NOTIFY).filter((k) => !!(old.notify || {})[k] !== !!r.notify[k]).map((k) => `${R.NOTIFY[k]} email: ${r.notify[k] ? "on" : "off"}`);
  if (ch.length || nch.length || old.name !== r.name || (!old.key && old.scope !== r.scope)) record(req, `Changed the role "${r.name}"${old.name !== r.name ? ` (was "${old.name}")` : ""}: ${[...ch, ...nch].join("; ") || "where it applies"}`);
  go(res, `/admin/roles#r${old.id}`, { ok: `Saved "${r.name}". It applies to everyone with it right away.` });
}));
router.post("/:id(\\d+)/delete", wrap(async (req, res) => {
  const old = (await query(`SELECT * FROM roles WHERE id=$1 AND archived_at IS NULL`, [int(req.params.id)])).rows[0];
  if (!old || old.key) return go(res, "/admin/roles", { err: "Built-in roles can be edited but not deleted." });
  const n = (await query(`DELETE FROM user_roles WHERE role_id=$1`, [old.id])).rowCount + (await query(`DELETE FROM role_boards WHERE role_id=$1`, [old.id])).rowCount;
  await query(`UPDATE roles SET archived_at=now() WHERE id=$1`, [old.id]);
  record(req, `Deleted the role "${old.name}"`);
  await query(`UPDATE athletes SET role_ids = array_remove(role_ids, $1) WHERE $1 = ANY(role_ids)`, [old.id]);
  go(res, "/admin/roles", { ok: `Deleted "${old.name}"${n ? `; ${n} ${n === 1 ? "person" : "people"} lost it` : ""}.` });
}));
// preview a role: see the app as that role (on a board, for per-board roles) until "Stop previewing"
router.post("/:id(\\d+)/preview", wrap(async (req, res) => {
  const r = (await query(`SELECT * FROM roles WHERE id=$1 AND archived_at IS NULL`, [int(req.params.id)])).rows[0]; if (!r || r.key === "admin") return go(res, "/admin/roles", { err: "Pick a role to preview." });
  const board = r.scope === "board" ? int(req.body.board) : null; if (r.scope === "board" && !board) return go(res, "/admin/roles", { err: "Pick a board to preview it on." });
  res.cookie("role_preview", `${r.id}${board ? `:${board}` : ""}`, { httpOnly: true, sameSite: "lax", maxAge: 2 * 3600e3 });
  res.redirect(303, "/dashboard");
}));
module.exports = router;
