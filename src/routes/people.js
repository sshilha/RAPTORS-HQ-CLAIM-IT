// ⚙ App settings → People: the directory of everyone (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const PP = require("../people");
const v = require("../views/people");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireAdmin);
const clean = (x, n) => str(x).replace(/\s+/g, " ").slice(0, n);
const ROLES = ["parent", "coach", "volunteer"];

// Everyone, with what they're connected to
async function directory() {
  return (await query(`SELECT a.*,
      ARRAY(SELECT sc.name FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id WHERE m.athlete_id=a.id AND sc.archived_at IS NULL ORDER BY sc.name) AS boards,
      ARRAY(SELECT trim(k.first_name||' '||k.last_name) FROM parent_athletes pa JOIN athletes k ON k.id=pa.athlete_id WHERE a.self_user_id IS NOT NULL AND pa.user_id=a.self_user_id ORDER BY k.first_name) AS kids,
      ARRAY(SELECT coalesce(nullif(trim(p.first_name||' '||p.last_name),''), u.email) FROM parent_athletes pa JOIN users u ON u.id=pa.user_id
            LEFT JOIN athletes p ON p.self_user_id=u.id AND p.kind='adult' WHERE pa.athlete_id=a.id AND a.kind='athlete' ORDER BY 1) AS parents,
      ARRAY(SELECT sc.name FROM schedule_coaches c JOIN schedules sc ON sc.id=c.schedule_id WHERE a.email IS NOT NULL AND lower(c.email)=lower(a.email) ORDER BY sc.name) AS coaching
    FROM athletes a WHERE a.archived_at IS NULL ORDER BY lower(a.last_name), lower(a.first_name), a.id`)).rows;
}

router.get("/", wrap(async (req, res) => {
  const all = await directory();
  const f = { q: str(req.query.q).toLowerCase(), kind: str(req.query.kind), role: str(req.query.role), team: str(req.query.team), se: str(req.query.se) };
  const shown = all.filter((p) => (!f.q || `${p.first_name} ${p.last_name} ${p.email || ""} ${p.phone || ""}`.toLowerCase().includes(f.q))
    && (!f.kind || p.kind === f.kind) && (!f.role || (p.roles || []).includes(f.role)) && (!f.team || p.team === f.team) && (!f.se || p.se_group === f.se));
  const teams = [...new Set(all.map((p) => p.team).filter(Boolean))].sort(), groups = [...new Set(all.map((p) => p.se_group).filter(Boolean))].sort();
  res.send(v.directoryPage({ user: req.user, flash: flashFrom(req), people: shown, total: all.length, f, teams, groups }));
}));

function readPerson(b, kind) {
  const out = { first_name: clean(b.first_name, 40), last_name: clean(b.last_name, 40), team: clean(b.team, 40) || null, se_group: clean(b.se_group, 60) || null,
    notes: String(b.notes || "").trim().slice(0, 1000) || null };
  if (kind === "athlete") Object.assign(out, { birth_year: int(b.birth_year) || null, jersey: clean(b.jersey, 6) || null });
  else Object.assign(out, { email: auth.normalizeEmail(b.email) || null, phone: clean(b.phone, 30) || null, organization: clean(b.organization, 80) || null,
    roles: [].concat(b.roles || []).filter((r) => ROLES.includes(r)) });
  return out;
}

router.post("/", wrap(async (req, res) => {
  const kind = req.body.kind === "adult" ? "adult" : "athlete";
  const p = readPerson(req.body, kind);
  if (!p.first_name || !p.last_name) return go(res, "/admin/people#add", { err: "Enter a first and last name." });
  let id;
  if (kind === "adult" && p.email) {
    if (!auth.isValidEmail(p.email)) return go(res, "/admin/people#add", { err: "That email doesn't look right." });
    const { person } = await PP.ensureAdult(p.email, { first: p.first_name, last: p.last_name });
    id = person.id;
    await query(`UPDATE athletes SET first_name=$2, last_name=$3, phone=$4, organization=$5, roles=$6, team=$7, se_group=$8, notes=$9 WHERE id=$1`,
      [id, p.first_name, p.last_name, p.phone, p.organization, p.roles, p.team, p.se_group, p.notes]);
  } else {
    id = (await query(`INSERT INTO athletes (kind, first_name, last_name, team, se_group, notes, birth_year, jersey, email, phone, organization, roles)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [kind, p.first_name, p.last_name, p.team, p.se_group, p.notes, p.birth_year || null, p.jersey || null, p.email || null, p.phone || null, p.organization || null, p.roles || []])).rows[0].id;
  }
  // a new athlete's parents, by email
  if (kind === "athlete") for (const e of String(req.body.parent_emails || "").split(/[\s,;]+/).map(auth.normalizeEmail).filter(auth.isValidEmail)) await PP.linkParent(id, e);
  go(res, `/admin/people/${id}`, { ok: `Added ${p.first_name} ${p.last_name}.` });
}));

router.get("/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p) return go(res, "/admin/people", { err: "Not found." });
  const boards = (await query(`SELECT sc.id, sc.name, sc.archived_at, m.group_name, m.tags,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=sc.id AND c.athlete_id=$1 AND c.status='confirmed') AS claims
    FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id WHERE m.athlete_id=$1 ORDER BY sc.archived_at NULLS FIRST, sc.name`, [id])).rows;
  const claimedElsewhere = (await query(`SELECT sc.id, sc.name, count(*)::int AS claims FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id
    WHERE c.athlete_id=$1 AND c.status='confirmed' AND NOT EXISTS (SELECT 1 FROM schedule_members m WHERE m.schedule_id=sc.id AND m.athlete_id=$1) GROUP BY sc.id, sc.name`, [id])).rows;
  const parents = p.kind === "athlete" ? (await query(`SELECT u.id AS user_id, u.email, ad.id AS person_id, ad.first_name, ad.last_name, ad.phone
      FROM parent_athletes pa JOIN users u ON u.id=pa.user_id LEFT JOIN athletes ad ON ad.self_user_id=u.id AND ad.kind='adult' WHERE pa.athlete_id=$1 ORDER BY u.email`, [id])).rows : [];
  const kids = p.kind === "adult" && p.self_user_id ? (await query(`SELECT k.* FROM parent_athletes pa JOIN athletes k ON k.id=pa.athlete_id WHERE pa.user_id=$1 ORDER BY k.first_name`, [p.self_user_id])).rows : [];
  const athletes = p.kind === "adult" ? (await query(`SELECT id, first_name, last_name, team FROM athletes WHERE kind='athlete' AND archived_at IS NULL ORDER BY lower(last_name), lower(first_name)`)).rows : [];
  const allBoards = (await query(`SELECT id, name FROM schedules WHERE archived_at IS NULL ORDER BY name`)).rows;
  const coaching = p.email ? (await query(`SELECT schedule_id FROM schedule_coaches WHERE lower(email)=lower($1)`, [p.email])).rows.map((r) => r.schedule_id) : [];
  res.send(v.personPage({ user: req.user, flash: flashFrom(req), p, boards, claimedElsewhere, parents, kids, athletes, allBoards, coaching }));
}));

router.post("/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const cur = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!cur) return go(res, "/admin/people", { err: "Not found." });
  const p = readPerson(req.body, cur.kind);
  if (!p.first_name || !p.last_name) return go(res, `/admin/people/${id}`, { err: "Enter a first and last name." });
  if (cur.kind === "adult") {
    if (p.email && !auth.isValidEmail(p.email)) return go(res, `/admin/people/${id}`, { err: "That email doesn't look right." });
    let uid = cur.self_user_id;
    if (p.email && p.email !== (cur.email || "")) uid = (await auth.findOrCreateUser(p.email)).id;
    await query(`UPDATE athletes SET first_name=$2, last_name=$3, email=$4, phone=$5, organization=$6, roles=$7, team=$8, se_group=$9, notes=$10, self_user_id=$11 WHERE id=$1`,
      [id, p.first_name, p.last_name, p.email, p.phone, p.organization, p.roles, p.team, p.se_group, p.notes, uid]);
  } else {
    await query(`UPDATE athletes SET first_name=$2, last_name=$3, team=$4, se_group=$5, notes=$6, birth_year=$7, jersey=$8 WHERE id=$1`,
      [id, p.first_name, p.last_name, p.team, p.se_group, p.notes, p.birth_year, p.jersey]);
  }
  go(res, `/admin/people/${id}`, { ok: "Saved." });
}));

// Family: a parent for an athlete (by email), or a kid for an adult
router.post("/:id/family", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p) return go(res, "/admin/people", {});
  if (p.kind === "athlete") {
    const e = auth.normalizeEmail(req.body.email);
    if (!auth.isValidEmail(e)) return go(res, `/admin/people/${id}#family`, { err: "Enter the parent's email." });
    await PP.linkParent(id, e);
    return go(res, `/admin/people/${id}#family`, { ok: `Linked ${e}.` });
  }
  const kid = int(req.body.athlete_id);
  if (!kid || !p.email) return go(res, `/admin/people/${id}#family`, { err: p.email ? "Pick an athlete." : "Add this person's email first, so they can sign in and see their kids." });
  await PP.linkParent(kid, p.email);
  go(res, `/admin/people/${id}#family`, { ok: "Linked." });
}));
router.post("/:id/family/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`DELETE FROM parent_athletes WHERE user_id=$1 AND athlete_id=$2`, [int(req.body.user_id), int(req.body.athlete_id)]);
  go(res, `/admin/people/${id}#family`, { ok: "Unlinked." });
}));

// Coach: which boards they can take attendance on
router.post("/:id/coaching", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p || !p.email) return go(res, `/admin/people/${id}#coach`, { err: "Add this person's email first." });
  const pick = [].concat(req.body.boards || []).map(int).filter(Boolean);
  await query(`DELETE FROM schedule_coaches WHERE lower(email)=lower($1) AND NOT (schedule_id = ANY($2))`, [p.email, pick]);
  for (const b of pick) await query(`INSERT INTO schedule_coaches (schedule_id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [b, auth.normalizeEmail(p.email)]);
  if (pick.length && !(p.roles || []).includes("coach")) await query(`UPDATE athletes SET roles=array_append(roles,'coach') WHERE id=$1`, [id]);
  go(res, `/admin/people/${id}#coach`, { ok: pick.length ? `Coach on ${pick.length} board${pick.length === 1 ? "" : "s"}.` : "Not coaching any boards." });
}));

router.post("/:id/archive", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`UPDATE athletes SET archived_at = CASE WHEN archived_at IS NULL THEN now() ELSE NULL END WHERE id=$1`, [id]);
  go(res, "/admin/people", { ok: "Removed from the directory. Their past claims are kept." });
}));

module.exports = router;
