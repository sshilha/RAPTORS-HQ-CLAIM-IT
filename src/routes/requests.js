// App settings -> Requests: approve family additions, finish change requests (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const PP = require("../people");
const { sendEmail, shell } = require("../email");
const { APP_URL, LABELS } = require("../config");
const { wrap, flashFrom, go, int, str } = require("./util");
const { esc } = require("../views/layout");

const router = express.Router();
router.use(auth.requireAdmin);

async function tell(r, subject, msg) {
  const u = r.user_id ? (await query(`SELECT email FROM users WHERE id=$1`, [r.user_id])).rows[0] : r.data && r.data.email ? { email: r.data.email } : null; if (!u) return;
  sendEmail({ to: u.email, subject, text: `${msg}\n\n${APP_URL || ""}/account`, html: shell(subject, `<p>${esc(msg)}</p>`, { href: `${APP_URL || ""}/account`, label: "My Account" }) }).catch((e) => console.error(e.message));
}

router.get("/", wrap(async (req, res) => {
  const rows = (await query(`SELECT r.*, coalesce(u.email, r.data->>'email') AS email,
      coalesce(nullif(trim(a.first_name||' '||a.last_name),''), nullif(trim(coalesce(r.data->>'first_name','')||' '||coalesce(r.data->>'last_name','')),''), u.email) AS who
    FROM account_requests r LEFT JOIN users u ON u.id=r.user_id
    LEFT JOIN athletes a ON a.self_user_id=u.id AND a.kind='adult' ORDER BY (r.status='waiting') DESC, r.created_at DESC LIMIT 200`)).rows;
  // possible matches already in People, so an approval links instead of duplicating
  for (const r of rows) if (r.kind === "add_family" && r.status === "waiting")
    r.matches = (await query(`SELECT id, first_name, last_name, team FROM athletes WHERE kind='athlete' AND archived_at IS NULL AND lower(first_name)=lower($1) AND lower(last_name)=lower($2)`, [r.data.first_name, r.data.last_name])).rows;
  res.send(require("../views/requests").requestsPage({ user: req.user, flash: flashFrom(req), rows }));
}));

router.post("/:id/approve", wrap(async (req, res) => {
  const r = (await query(`SELECT * FROM account_requests WHERE id=$1 AND status='waiting'`, [int(req.params.id)])).rows[0];
  if (!r) return go(res, "/admin/requests", { err: "That request was already handled." });
  if (r.kind === "new_account") {
    const A = require("../accounts");
    const u = await auth.findOrCreateUser(r.data.email);
    const { person } = await PP.ensureAdult(r.data.email, { first: r.data.first_name, last: r.data.last_name });
    await query(`UPDATE athletes SET first_name=$2, last_name=$3, phone=COALESCE($4, phone), organization=COALESCE($5, organization) WHERE id=$1`,
      [person.id, r.data.first_name, r.data.last_name, r.data.phone, r.data.organization]);
    await query(`UPDATE account_requests SET status='approved', user_id=$2, admin_note=$3, decided_by=$4, decided_at=now() WHERE id=$1`, [r.id, u.id, str(req.body.note) || null, req.user.id]);
    const link = await A.sendInvite(req, u.id);
    return go(res, "/admin/requests", { ok: `Approved. ${r.data.email} was emailed an invite to set up their account.${process.env.DEV_SHOW_LINK === "true" ? ` (Testing: ${link})` : ""}` });
  }
  const u = (await query(`SELECT * FROM users WHERE id=$1`, [r.user_id])).rows[0];
  if (r.kind === "add_family") {
    let athleteId = int(req.body.link_to) || null;
    if (!athleteId) athleteId = (await query(`INSERT INTO athletes (first_name, last_name, birth_year, team) VALUES ($1,$2,$3,$4) RETURNING id`,
      [r.data.first_name, r.data.last_name, r.data.birth_year || null, r.data.team || null])).rows[0].id;
    await PP.linkParent(athleteId, u.email);
    await query(`UPDATE account_requests SET status='approved', admin_note=$2, decided_by=$3, decided_at=now() WHERE id=$1`, [r.id, str(req.body.note) || null, req.user.id]);
    await tell(r, "Your request was approved", `${r.data.first_name} ${r.data.last_name} is now linked to your account.`);
    return go(res, "/admin/requests", { ok: `Approved. ${r.data.first_name} ${r.data.last_name} is linked to ${u.email}.` });
  }
  await query(`UPDATE account_requests SET status='done', admin_note=$2, decided_by=$3, decided_at=now() WHERE id=$1`, [r.id, str(req.body.note) || null, req.user.id]);
  await tell(r, "Your change request is done", `We made the change you asked for${r.data.about ? ` (${r.data.about})` : ""}.${str(req.body.note) ? ` Note: ${str(req.body.note)}` : ""}`);
  go(res, "/admin/requests", { ok: "Marked done. They've been emailed." });
}));

router.post("/:id/decline", wrap(async (req, res) => {
  const r = (await query(`UPDATE account_requests SET status='declined', admin_note=$2, decided_by=$3, decided_at=now() WHERE id=$1 AND status='waiting' RETURNING *`,
    [int(req.params.id), str(req.body.note).slice(0, 300) || null, req.user.id])).rows[0];
  if (!r) return go(res, "/admin/requests", { err: "That request was already handled." });
  await tell(r, r.kind === "new_account" ? "About your account request" : "Your request wasn't approved",
    r.kind === "new_account" ? `Thanks for your interest. We weren't able to set up an account for you right now.${r.admin_note ? ` Note: ${r.admin_note}` : ""}`
    : `Your request ${r.kind === "add_family" ? `to add ${r.data.first_name} ${r.data.last_name}` : "for a change"} wasn't approved.${r.admin_note ? ` Note: ${r.admin_note}` : ""}`);
  go(res, "/admin/requests", { ok: "Declined. They've been emailed." });
}));

module.exports = router;
