// App settings -> Requests: approve family additions, finish change requests (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const PP = require("../people");
const { APP_URL, LABELS } = require("../config");
const { wrap, flashFrom, go, int, str } = require("./util");
const { esc } = require("../views/layout");

const router = express.Router();
router.use(auth.requireAdmin);

async function tell(r, key, vars) {
  const u = r.user_id ? (await query(`SELECT email FROM users WHERE id=$1`, [r.user_id])).rows[0] : r.data && r.data.email ? { email: r.data.email } : null; if (!u) return;
  require("../emailTemplates").send(key, u.email, { account_link: `${APP_URL || ""}/account`, ...vars }).catch((e) => console.error(e.message));
}

router.get("/", wrap(async (req, res) => {
  const rows = (await query(`SELECT r.*, coalesce(u.email, r.data->>'email') AS email,
      coalesce(nullif(trim(a.first_name||' '||a.last_name),''), nullif(trim(coalesce(r.data->>'first_name','')||' '||coalesce(r.data->>'last_name','')),''), u.email) AS who
    FROM account_requests r LEFT JOIN users u ON u.id=r.user_id
    LEFT JOIN athletes a ON a.self_user_id=u.id AND a.kind='adult' ORDER BY (r.status='waiting') DESC, r.created_at DESC LIMIT 200`)).rows;
  // a new-account request: anyone already in People with the same email, or the same first and last name
  for (const r of rows) if (r.kind === "new_account" && r.status === "waiting")
    r.people = (await query(`SELECT a.id, a.kind, a.first_name, a.last_name, a.team, a.birth_year, a.email, u.email AS login,
        (lower(a.email)=lower($1) OR lower(u.email)=lower($1)) AS same_email
      FROM athletes a LEFT JOIN users u ON u.id=a.self_user_id WHERE a.archived_at IS NULL
        AND (lower(a.email)=lower($1) OR lower(u.email)=lower($1) OR (lower(a.first_name)=lower($2) AND lower(a.last_name)=lower($3)))
      ORDER BY (lower(a.email)=lower($1) OR lower(u.email)=lower($1)) DESC, (a.kind = $4) DESC, a.id`, [r.data.email || "", r.data.first_name || "", r.data.last_name || "", r.data.who === "athlete" ? "athlete" : "adult"])).rows;
  // possible matches already in People, so an approval links instead of duplicating
  for (const r of rows) if (r.kind === "add_family" && r.status === "waiting")
    r.matches = (await query(`SELECT id, first_name, last_name, team FROM athletes WHERE kind='athlete' AND archived_at IS NULL AND lower(first_name)=lower($1) AND lower(last_name)=lower($2)`, [r.data.first_name, r.data.last_name])).rows;
  const AH = require("../views/apphead");
  const show = ["waiting", "handled", "all"].includes(req.query.show) ? req.query.show : "waiting";
  const tools = `<form method="get" action="/admin/requests"><label>Show <select name="show" onchange="this.form.submit()">${[["waiting", "Waiting"], ["handled", "Handled"], ["all", "All"]].map(([k, l]) => `<option value="${k}"${show === k ? " selected" : ""}>${l}</option>`).join("")}</select></label></form>`;
  const shownRows = show === "all" ? rows : show === "handled" ? rows.filter((r) => r.status !== "waiting") : rows.filter((r) => r.status === "waiting");
  res.send(require("../views/requests").requestsPage({ user: req.user, flash: flashFrom(req), rows: shownRows, show, tools, head: await AH.head({ active: "requests" }) }));
}));

router.post("/:id/approve", wrap(async (req, res) => {
  const r = (await query(`SELECT * FROM account_requests WHERE id=$1 AND status='waiting'`, [int(req.params.id)])).rows[0];
  if (!r) return go(res, "/admin/requests", { err: "That request was already handled." });
  if (r.kind === "new_account") {
    const A = require("../accounts");
    const linkTo = int(req.body.person_id) || null;
    if (linkTo) {   // "This is …": that record gets the sign-in; it keeps its kind, boards, claims and family
      const p = (await query(`SELECT a.*, u.email AS login FROM athletes a LEFT JOIN users u ON u.id=a.self_user_id WHERE a.id=$1 AND a.archived_at IS NULL`, [linkTo])).rows[0];
      if (!p) return go(res, "/admin/requests", { err: "That person isn't in People anymore." });
      if (p.self_user_id && auth.normalizeEmail(p.login || "") !== auth.normalizeEmail(r.data.email))
        return go(res, "/admin/requests", { err: `${p.first_name} already signs in as ${p.login}. Approve as someone new, then merge the two in People.` });
      const u = await auth.findOrCreateUser(r.data.email);
      await query(`UPDATE athletes SET self_user_id=$2, email=COALESCE(email,$3), phone=COALESCE(phone,$4), organization=COALESCE(organization,$5), birth_year=COALESCE(birth_year,$6) WHERE id=$1`,
        [p.id, u.id, auth.normalizeEmail(r.data.email), r.data.phone, r.data.organization, r.data.birth_year || null]);
      await query(`UPDATE account_requests SET status='approved', user_id=$2, admin_note=$3, decided_by=$4, decided_at=now() WHERE id=$1`, [r.id, u.id, str(req.body.note) || null, req.user.id]);
      const link = await A.sendInvite(req, u.id);
      return go(res, "/admin/requests", { ok: `Approved and linked to ${p.first_name} ${p.last_name} (${p.kind === "athlete" ? "athlete" : "adult"}). ${r.data.email} was emailed an invite.${process.env.DEV_SHOW_LINK === "true" ? ` (Testing: ${link})` : ""}` });
    }
    const u = await auth.findOrCreateUser(r.data.email);
    const { person } = r.data.who === "athlete" && !(await query(`SELECT 1 FROM athletes WHERE (self_user_id=$1 OR lower(email)=lower($2)) AND archived_at IS NULL`, [u.id, r.data.email])).rowCount
      ? { person: (await query(`INSERT INTO athletes (first_name, last_name, kind, email, self_user_id, birth_year) VALUES ($1,$2,'athlete',$3,$4,$5) RETURNING *`,
          [r.data.first_name, r.data.last_name, auth.normalizeEmail(r.data.email), u.id, r.data.birth_year || null])).rows[0] }   // a new athlete stays an athlete
      : await PP.ensureAdult(r.data.email, { first: r.data.first_name, last: r.data.last_name });
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
    await tell(r, "family_approved", { family_member: `${r.data.first_name} ${r.data.last_name}`.trim() });
    return go(res, "/admin/requests", { ok: `Approved. ${r.data.first_name} ${r.data.last_name} is linked to ${u.email}.` });
  }
  await query(`UPDATE account_requests SET status='done', admin_note=$2, decided_by=$3, decided_at=now() WHERE id=$1`, [r.id, str(req.body.note) || null, req.user.id]);
  await tell(r, "change_done", { about: r.data.about ? `(${r.data.about})` : "", note: str(req.body.note) });
  go(res, "/admin/requests", { ok: "Marked done. They've been emailed." });
}));

router.post("/:id/decline", wrap(async (req, res) => {
  const r = (await query(`UPDATE account_requests SET status='declined', admin_note=$2, decided_by=$3, decided_at=now() WHERE id=$1 AND status='waiting' RETURNING *`,
    [int(req.params.id), str(req.body.note).slice(0, 300) || null, req.user.id])).rows[0];
  if (!r) return go(res, "/admin/requests", { err: "That request was already handled." });
  await tell(r, r.kind === "new_account" ? "account_declined" : "request_declined",
    { note: r.admin_note || "", what: r.kind === "add_family" ? `to add ${r.data.first_name} ${r.data.last_name}` : "for a change" });
  go(res, "/admin/requests", { ok: "Declined. They've been emailed." });
}));

module.exports = router;
