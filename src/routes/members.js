// A schedule's participants: who can use it, and their group there
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const SC = require("../schedules");
const v = require("../views/members");
const { wrap, flashFrom, go, int, str, dest } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const home = (sc, anchor = "") => `/admin/members?s=${sc.id}&card=${anchor === "#add" ? "add" : "people"}`;

async function linkParents(athleteId, raw) {
  const emails = String(raw || "").split(/[,;\s]+/).map(auth.normalizeEmail).filter(Boolean);
  const bad = emails.filter((e) => !auth.isValidEmail(e));
  for (const e of emails.filter(auth.isValidEmail)) await require("../people").linkParent(athleteId, e);
  return bad;
}

router.get("/", wrap(async (req, res) => {
  const { sc } = req.sched;
  const group = str(req.query.g);
  const members = (await query(
    `SELECT a.*, m.group_name, m.tags, m.created_at AS joined,
       ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id ORDER BY u.email) AS emails,
       ARRAY(SELECT s2.name FROM schedule_members m2 JOIN schedules s2 ON s2.id=m2.schedule_id WHERE m2.athlete_id=a.id AND m2.schedule_id<>$1 ORDER BY s2.sort, s2.id) AS other_schedules
     FROM schedule_members m JOIN athletes a ON a.id=m.athlete_id
     WHERE m.schedule_id=$1 AND ($2 = '' OR coalesce(m.group_name,'') = $2 OR ($2 LIKE 'tag:%' AND substr($2, 5) = ANY(m.tags)))
     ORDER BY m.group_name NULLS LAST, a.last_name, a.first_name`, [sc.id, group === "none" ? "" : group])).rows;
  const others = (await query(
    `SELECT a.id, a.first_name, a.last_name, a.self_user_id, a.kind, a.team, a.roles, a.email,
       ARRAY(SELECT l.name FROM people_list_members m JOIN people_lists l ON l.id=m.list_id WHERE m.athlete_id=a.id) AS lists FROM athletes a
     WHERE a.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM schedule_members m WHERE m.schedule_id=$1 AND m.athlete_id=a.id)
     ORDER BY lower(a.last_name), lower(a.first_name)`, [sc.id])).rows;
  const total = (await query(`SELECT count(*)::int AS n FROM schedule_members WHERE schedule_id=$1`, [sc.id])).rows[0].n;
  const eng = await require("../presence").engagement(sc.id);   // did they (or a parent/guardian) sign in, open this board, claim?
  for (const m of members) m.eng = eng.get(m.id) || { stage: "noaccount" };
  const stageF = ["claimed", "opened", "signedin", "never", "noaccount"].includes(req.query.e) ? req.query.e : "";
  const engCounts = { total: eng.size, signedin: 0, opened: 0, claimed: 0 }; for (const e of eng.values()) { if (e.signed_in_at) engCounts.signedin++; if (e.opened_at) engCounts.opened++; if (e.claims) engCounts.claimed++; }
  // Teams & tags live on the same page, above the people
  const G = require("../groups"), SCx = require("../schedules");
  const usage = {};
  for (const g of SCx.groupsFor(sc)) usage[g] = await G.usage(sc.id, g);
  for (const t of sc.tags || []) usage[`tag:${t}`] = await G.tagUsage(sc.id, t);
  const boards = req.sched.list.filter((x) => x.id !== sc.id && ((x.groups || []).length || (x.tags || []).length));
  const teams = require("../views/settings").groupsPage({ user: req.user, sc, usage, others: boards, embed: true });
  const H = require("../views/setup2"), head = H.boardHeader(sc, { ...(await H.headerData(sc)), active: "access" });
  const card = String(req.query.card || "");
  const sub = ["people", "groups", "shortcuts"].includes(req.query.sub) ? req.query.sub : ({ groups: "groups", tags: "groups", copy: "groups", presets: "shortcuts" }[card] || "people");
  { const ad = await require("../assess").daysFor(members.map((m) => m.id)); for (const m of members) m.assessDays = ad.get(m.id) || []; }
  res.send(v.membersPage({ eng: engCounts, stageF,  head, user: req.user, flash: flashFrom(req), sc, members, others, group, total, teams, sub, addOpen: card === "add" || req.query.add === "1" || (!total && sub === "people") }));
}));

// A brand-new person, added to this schedule
router.post("/", wrap(async (req, res) => {
  const { sc } = req.sched;
  const L = SC.labels(sc);
  const first = str(req.body.first_name).slice(0, 40), last = str(req.body.last_name).slice(0, 40);
  const group = SC.groupsFor(sc).includes(str(req.body.group)) ? str(req.body.group) : null;
  if (!first || !last) return go(res, home(sc, "#add"), { err: `Enter the ${L.participant.one.toLowerCase()}'s first and last name.` });
  const dupe = (await query(`SELECT id FROM athletes WHERE lower(first_name)=lower($1) AND lower(last_name)=lower($2)`, [first, last])).rows[0];
  const tags = [].concat(req.body.tags || []).map(String).filter((t) => (sc.tags || []).includes(t));
  const b = req.body, kind = b.kind === "adult" ? "adult" : "athlete", opt = (x, n) => str(x).slice(0, n) || null;
  const email = kind === "adult" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(b.email)) ? str(b.email).toLowerCase() : null;
  let a;
  if (email) {   // an adult with an email: one person per email (it may already be in People)
    a = (await require("../people").ensureAdult(email, { first, last })).person;
    await query(`UPDATE athletes SET first_name=COALESCE(NULLIF(first_name,''),$2), last_name=COALESCE(NULLIF(last_name,''),$3), phone=COALESCE($4, phone), team=COALESCE($5, team), notes=COALESCE($6, notes) WHERE id=$1`,
      [a.id, first, last, opt(b.phone, 30), opt(b.team, 40), opt(b.notes, 200)]);
  } else {
    a = (await query(`INSERT INTO athletes (kind, first_name, last_name, team, birth_year, jersey, phone, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [kind, first, last, opt(b.team, 40), int(b.birth_year) || null, opt(b.jersey, 4), kind === "adult" ? opt(b.phone, 30) : null, opt(b.notes, 200)])).rows[0];
  }
  if ((await query(`SELECT 1 FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [sc.id, a.id])).rowCount) return go(res, home(sc), { ok: `${first} ${last} is already on ${sc.name}.` });
  await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags) VALUES ($1,$2,$3,$4)`, [sc.id, a.id, group, tags]);
  const bad = kind === "athlete" ? await linkParents(a.id, req.body.parent_emails) : [];
  go(res, home(sc), bad.length ? { err: `Added ${first}, but these emails weren't valid: ${bad.join(", ")}` }
    : { ok: `Added ${first} ${last}${group ? ` to ${group}` : ""}${tags.length ? `, tagged ${tags.join(", ")}` : ""}.` + (dupe && !email ? ` Note: People already had a ${first} ${last}. If that's the same person, remove this one and use Add from People instead.` : "") });
}));

// ---------- import from a spreadsheet (CSV file or pasted rows) ----------
const CSV = require("../csv");
// Which column is which, guessed from the headers
function guess(headers) {
  const h = headers.map((x) => x.toLowerCase());
  const find = (...res) => { for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; } return -1; };
  return {
    first: find(/^first/, /first name/, /participant first/, /player first/, /athlete first/),
    last: find(/^last/, /last name/, /participant last/, /player last/, /athlete last/),
    name: find(/^name$/, /full name/, /player name/, /athlete name/, /participant name/),
    group: find(/^team$/, /team name/, /^group/, /age group/, /division/, /^level/),
    tags: find(/^tags?$/, /position/),
    cteam: find(/^team$/, /team name/, /current team/),
    se: find(/sportsengine group/, /^se group/, /program/, /registration/, /^season/, /^group$/),
    emails: h.map((x, i) => (/e-?mail/.test(x) ? i : -1)).filter((i) => i >= 0),
  };
}
function readRows(rows, map) {
  const out = [];
  for (const r of rows) {
    let first = map.first >= 0 ? r[map.first] || "" : "", last = map.last >= 0 ? r[map.last] || "" : "";
    if ((!first || !last) && map.name >= 0 && r[map.name]) {
      const full = r[map.name].trim();
      if (full.includes(",")) { const [l, f] = full.split(",").map((x) => x.trim()); first = first || f; last = last || l; }
      else { const parts = full.split(/\s+/); first = first || parts.slice(0, -1).join(" ") || parts[0]; last = last || (parts.length > 1 ? parts[parts.length - 1] : ""); }
    }
    const emails = [...new Set(map.emails.flatMap((i) => String(r[i] || "").split(/[\s,;]+/)).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
    out.push({ first: first.slice(0, 40), last: last.slice(0, 40), group: map.group >= 0 ? (r[map.group] || "").slice(0, 30) : "",
      tags: map.tags >= 0 ? String(r[map.tags] || "").split(/[,;/]+/).map((t) => t.trim()).filter(Boolean) : [], emails,
      cteam: map.cteam >= 0 ? (r[map.cteam] || "").slice(0, 40) : "", se: map.se >= 0 ? (r[map.se] || "").slice(0, 60) : "" });
  }
  return out;
}
router.get("/import", (req, res) => go(res, "/admin/people/import", { ok: "Imports happen in People now. Import the roster here, then add the list on the board's Access & people tab." }));
const mapFrom = (b, headers) => {
  const g = guess(headers);
  const pick = (k) => (b[`col_${k}`] === undefined ? g[k] : int(b[`col_${k}`]) ?? -1);
  return { first: pick("first"), last: pick("last"), name: pick("name"), group: pick("group"), tags: pick("tags"), cteam: pick("cteam"), se: pick("se"),
    emails: b.col_emails === undefined && !b.mapped ? g.emails : [].concat(b.col_emails || []).map(int).filter((x) => x >= 0) };
};
router.post("/import/preview", (req, res, next) => go(res, "/admin/people/import", { ok: "Imports happen in People now." }));
router.post("/import/commit", (req, res, next) => go(res, "/admin/people/import", { ok: "Imports happen in People now." }));

// Someone already in the app (from another schedule, a public sign-up, a parent) joins this schedule
router.post("/add", wrap(async (req, res) => {
  const { sc } = req.sched;
  const ids = [].concat(req.body.athlete_id || []).map(int).filter(Boolean);
  const groups = SC.groupsFor(sc), match = str(req.body.group) === "__team";
  const group = groups.includes(str(req.body.group)) ? str(req.body.group) : null;
  if (!ids.length) return go(res, home(sc, "#add"), { err: "Pick at least one person." });
  const people = (await query(`SELECT id, team FROM athletes WHERE id = ANY($1)`, [ids])).rows;
  const byName = new Map(groups.map((g) => [g.toLowerCase(), g])); let matched = 0;
  for (const p of people) {
    const g = match ? byName.get(String(p.team || "").toLowerCase()) || null : group;
    if (match && g) matched++;
    await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [sc.id, p.id, g]);
  }
  go(res, home(sc), { ok: `Added ${people.length} ${people.length === 1 ? "person" : "people"} to ${sc.name}${match ? (groups.length ? ` (${matched} matched a ${SC.labels(sc).group.one.toLowerCase()} by their team${people.length - matched ? `; ${people.length - matched} ${people.length - matched === 1 ? "has" : "have"} none yet` : ""})` : "") : group ? ` in ${group}` : ""}.` });
}));

// Tags: one person's set, or one tag on/off for many people
router.post("/bulk-tag", wrap(async (req, res) => {
  const { sc } = req.sched;
  const ids = [].concat(req.body.athlete_id || []).map(int).filter(Boolean);
  const tag = str(req.body.tag);
  if (!ids.length) return go(res, dest(req, home(sc)), { err: "Check some people first." });
  if (req.body.mode === "group") {
    const g = SC.groupsFor(sc).includes(str(req.body.group)) ? str(req.body.group) : null;
    await query(`UPDATE schedule_members SET group_name=$3 WHERE schedule_id=$1 AND athlete_id = ANY($2)`, [sc.id, ids, g]);
    return go(res, dest(req, home(sc)), { ok: `${g ? `Moved ${ids.length} into ${g}` : `Cleared the ${SC.labels(sc).group.one.toLowerCase()} for ${ids.length}`}.` });
  }
  if (req.body.mode === "off") {
    await query(`DELETE FROM schedule_members WHERE schedule_id=$1 AND athlete_id = ANY($2)`, [sc.id, ids]);
    return go(res, dest(req, home(sc)), { ok: `Removed ${ids.length} from ${sc.name}. They stay in People and keep their sign-ups.` });
  }
  if (!(sc.tags || []).includes(tag)) return go(res, dest(req, home(sc)), { err: "Pick a tag." });
  const on = req.body.mode !== "remove";
  await require("../groups").bulkTag(sc.id, ids, tag, on);
  go(res, dest(req, home(sc)), { ok: `${on ? "Tagged" : "Untagged"} ${ids.length} ${ids.length === 1 ? "person" : "people"} ${on ? "as" : "from"} ${tag}.` });
}));

router.post("/:athleteId/tags", wrap(async (req, res) => {
  const { sc } = req.sched;
  const tags = [].concat(req.body.tags || []).filter((t) => (sc.tags || []).includes(t));
  await require("../groups").setMemberTags(sc.id, int(req.params.athleteId), tags);
  go(res, dest(req, home(sc)), { ok: "Tags saved." });
}));

router.post("/:athleteId", wrap(async (req, res) => {
  const { sc } = req.sched;
  const group = SC.groupsFor(sc).includes(str(req.body.group)) ? str(req.body.group) : null;
  await query(`UPDATE schedule_members SET group_name=$3 WHERE schedule_id=$1 AND athlete_id=$2`, [sc.id, int(req.params.athleteId), group]);
  go(res, dest(req, home(sc)), { ok: "Group saved." });
}));

router.post("/:athleteId/remove", wrap(async (req, res) => {
  const { sc } = req.sched;
  await query(`DELETE FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [sc.id, int(req.params.athleteId)]);
  go(res, dest(req, home(sc)), { ok: `Removed from ${sc.name}. They stay in the app (and any other schedules), and their existing sign-ups are kept.` });
}));

router.importHelpers = { guess, readRows, mapFrom };
module.exports = router;
