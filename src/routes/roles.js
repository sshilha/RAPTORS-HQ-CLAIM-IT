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
const read = (b) => ({ name: str(b.name).slice(0, 60), description: str(b.description).slice(0, 160) || null, scope: Object.keys(R.SCOPE).includes(b.scope) ? b.scope : "board",
  grants: Object.fromEntries(R.ALL.map((k) => [k, ["none", "view", "full"].includes(b[`g_${k}`]) && (R.KIND[k] === "vf" || b[`g_${k}`] !== "view") ? b[`g_${k}`] : "none"]).filter(([, v]) => v !== "none")) });
router.get("/", wrap(async (req, res) => {
  const head = await require("../views/apphead").head({ active: "roles", acc: req.access });
  res.send(await page(req, require("../views/roles").rolesPage({ head, roles: await R.list(), editId: int(req.query.edit), canEdit: req.access.has("settings.roles", 2) })));
}));
router.post("/", wrap(async (req, res) => {
  await R.ensure(); const r = read(req.body);
  if (!r.name) return go(res, "/admin/roles#add", { err: "Give the role a name." });
  if ((await query(`SELECT 1 FROM roles WHERE lower(name)=lower($1) AND archived_at IS NULL`, [r.name])).rowCount) return go(res, "/admin/roles#add", { err: `There's already a role called "${r.name}".` });
  const id = (await query(`INSERT INTO roles (name, description, scope, grants, sort) VALUES ($1,$2,$3,$4,(SELECT coalesce(max(sort),0)+1 FROM roles)) RETURNING id`, [r.name, r.description, r.scope, JSON.stringify(r.grants)])).rows[0].id;
  go(res, `/admin/roles#r${id}`, { ok: `Added "${r.name}". Give it to people on their People page.` });
}));
router.post("/:id(\\d+)", wrap(async (req, res) => {
  await R.ensure();
  const old = (await query(`SELECT * FROM roles WHERE id=$1 AND archived_at IS NULL`, [int(req.params.id)])).rows[0];
  if (!old || old.key === "admin") return go(res, "/admin/roles", { err: "Administrator can't be changed." });
  const r = read(req.body); if (!r.name) return go(res, `/admin/roles?edit=${old.id}`, { err: "Give the role a name." });
  if ((await query(`SELECT 1 FROM roles WHERE lower(name)=lower($1) AND id<>$2 AND archived_at IS NULL`, [r.name, old.id])).rowCount) return go(res, `/admin/roles?edit=${old.id}`, { err: `There's already a role called "${r.name}".` });
  await query(`UPDATE roles SET name=$2, description=$3, grants=$4${old.key ? "" : ", scope=$5"} WHERE id=$1`, old.key ? [old.id, r.name, r.description, JSON.stringify(r.grants)] : [old.id, r.name, r.description, JSON.stringify(r.grants), r.scope]);
  go(res, `/admin/roles#r${old.id}`, { ok: `Saved "${r.name}". It applies to everyone with it right away.` });
}));
router.post("/:id(\\d+)/delete", wrap(async (req, res) => {
  const old = (await query(`SELECT * FROM roles WHERE id=$1 AND archived_at IS NULL`, [int(req.params.id)])).rows[0];
  if (!old || old.key) return go(res, "/admin/roles", { err: "Built-in roles can be edited but not deleted." });
  const n = (await query(`DELETE FROM user_roles WHERE role_id=$1`, [old.id])).rowCount + (await query(`DELETE FROM role_boards WHERE role_id=$1`, [old.id])).rowCount;
  await query(`UPDATE roles SET archived_at=now() WHERE id=$1`, [old.id]);
  await query(`UPDATE athletes SET role_ids = array_remove(role_ids, $1) WHERE $1 = ANY(role_ids)`, [old.id]);
  go(res, "/admin/roles", { ok: `Deleted "${old.name}"${n ? `; ${n} ${n === 1 ? "person" : "people"} lost it` : ""}.` });
}));
module.exports = router;
