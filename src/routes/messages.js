// Communication → Send a message (and Send an automated email now). Needs "Send messages" or "Send automated emails now".
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const R = require("../roles");
const M = require("../messages");
const { wrap, flashFrom, go, str } = require("./util");
const router = express.Router();
router.use(auth.requireUser);
router.use(wrap(async (req, res, next) => { const acc = await R.forUser(req.user); if (!acc.has("comm.message") && !acc.has("comm.sendnow")) return res.status(404).send("Not found"); req.access = acc; next(); }));
const page = async (req, body) => require("../views/admin").page({ title: "Send a message", tab: "settings", user: req.user, flash: flashFrom(req), noBack: true,
  body: `${await require("../views/apphead").head({ active: "messages", acc: req.access })}${body}` });
async function options(req) {
  const acc = req.access, mm = M.allowed(acc, "comm.message"), nm = M.allowed(acc, "comm.sendnow");
  const boards = (await query(`SELECT id, name, coalesce(board_type,'training') AS t FROM schedules WHERE archived_at IS NULL ORDER BY lower(name)`)).rows;
  const teams = {}; for (const r of (await query(`SELECT DISTINCT schedule_id, group_name FROM schedule_members WHERE group_name IS NOT NULL AND group_name <> '' ORDER BY group_name`)).rows) (teams[r.schedule_id] = teams[r.schedule_id] || []).push(r.group_name);
  const items = (await query(`SELECT i.id, i.schedule_id, i.title, i.starts_at, s.name AS board, coalesce(s.board_type,'training') AS t FROM board_items i JOIN schedules s ON s.id=i.schedule_id
    WHERE i.canceled_at IS NULL AND s.archived_at IS NULL AND i.starts_at > now() - interval '1 day' AND i.starts_at < now() + interval '60 days' AND (i.settings->>'helper_claim') IS NULL ORDER BY i.starts_at LIMIT 400`)).rows;
  const people = (await query(`SELECT DISTINCT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name, a.email FROM athletes a ${mm === null ? "" : "JOIN schedule_members m ON m.athlete_id=a.id AND m.schedule_id = ANY($1)"} WHERE a.archived_at IS NULL ORDER BY 2`, mm === null ? [] : [[...mm.keys()]])).rows;
  const lists = mm === null ? (await query(`SELECT id, name FROM people_lists ORDER BY lower(name)`).catch(() => ({ rows: [] }))).rows : [];
  return { acc, mBoards: boards.filter((b) => mm === null || mm.has(b.id)), nBoards: boards.filter((b) => nm === null || nm.has(b.id)), teams, mm, nm,
    mItems: items.filter((i) => mm === null || mm.has(i.schedule_id)), nItems: items.filter((i) => nm === null || nm.has(i.schedule_id)), people, lists };
}
router.get("/", wrap(async (req, res) => res.send(await page(req, require("../views/messages").composePage({ ...(await options(req)), form: req.query })))));
const specOf = (b) => ({ to: b.to, board: b.board, team: str(b.team) || null, who: b.who, session: b.session, list: b.list, people: b.people });
router.post("/preview", wrap(async (req, res) => {
  if (!req.access.has("comm.message")) return go(res, "/admin/messages", { err: "Your role can't send messages." });
  const subject = str(req.body.subject).slice(0, 150), message = String(req.body.message || "").slice(0, 5000).trim();
  if (!subject || !message) return go(res, "/admin/messages", { err: "Write a subject and a message." });
  let r; try { r = await M.resolve(specOf(req.body), req.access); } catch (e) { return go(res, "/admin/messages", { err: e.message }); }
  const email = await require("../emailTemplates").render("manual_message", { subject, message });
  res.send(await page(req, require("../views/messages").previewPage({ body: req.body, r, email })));
}));
router.post("/send", wrap(async (req, res) => {
  if (!req.access.has("comm.message")) return go(res, "/admin/messages", { err: "Your role can't send messages." });
  try { const out = await M.sendMessage(specOf(req.body), { subject: str(req.body.subject).slice(0, 150), message: String(req.body.message || "").slice(0, 5000).trim() }, req);
    go(res, "/admin/messages", { ok: `Sent to ${out.what}: ${out.sent} email${out.sent === 1 ? "" : "s"}. They're in the Email log.` }); } catch (e) { go(res, "/admin/messages", { err: e.message }); }
}));
router.post("/now", wrap(async (req, res) => {
  if (!req.access.has("comm.sendnow")) return go(res, "/admin/messages#now", { err: "Your role can't send automated emails." });
  let p; try { p = await M.nowPlan(req.body.kind, req.body, req); } catch (e) { return go(res, "/admin/messages#now", { err: e.message }); }
  if (req.body.confirm !== "1") return res.send(await page(req, require("../views/messages").nowPreview({ body: req.body, p, label: M.NOW[req.body.kind] })));
  const n = await p.send();
  require("../activity").record(req, { kind: "emails", summary: `Sent now: ${M.NOW[req.body.kind]} (${p.what}); ${n || 0} sent` }).catch(() => {});
  go(res, "/admin/messages#now", { ok: `Sent ${M.NOW[req.body.kind]}: ${p.what}.` });
}));
module.exports = router;
