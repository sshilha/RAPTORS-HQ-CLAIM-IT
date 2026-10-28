// A schedule's participants: who can use it, and their group there
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const SC = require("../schedules");
const v = require("../views/members");
const { wrap, flashFrom, go, int, str, dest } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const home = (sc, anchor = "") => `/admin/members?s=${sc.id}${anchor}`;

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
    `SELECT a.id, a.first_name, a.last_name, a.self_user_id, a.kind, a.team, a.se_group, a.roles, a.email,
       ARRAY(SELECT l.name FROM people_list_members m JOIN people_lists l ON l.id=m.list_id WHERE m.athlete_id=a.id) AS lists FROM athletes a
     WHERE a.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM schedule_members m WHERE m.schedule_id=$1 AND m.athlete_id=a.id)
     ORDER BY lower(a.last_name), lower(a.first_name)`, [sc.id])).rows;
  const total = (await query(`SELECT count(*)::int AS n FROM schedule_members WHERE schedule_id=$1`, [sc.id])).rows[0].n;
  // Teams & tags live on the same page, above the people
  const G = require("../groups"), SCx = require("../schedules");
  const usage = {};
  for (const g of SCx.groupsFor(sc)) usage[g] = await G.usage(sc.id, g);
  for (const t of sc.tags || []) usage[`tag:${t}`] = await G.tagUsage(sc.id, t);
  const boards = req.sched.list.filter((x) => x.id !== sc.id && ((x.groups || []).length || (x.tags || []).length));
  const teams = require("../views/settings").groupsPage({ user: req.user, sc, usage, others: boards, embed: true });
  res.send(v.membersPage({ user: req.user, flash: flashFrom(req), sc, members, others, group, total, teams }));
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
  const a = (await query(`INSERT INTO athletes (first_name, last_name) VALUES ($1,$2) RETURNING id`, [first, last])).rows[0];
  await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags) VALUES ($1,$2,$3,$4)`, [sc.id, a.id, group, tags]);
  const bad = await linkParents(a.id, req.body.parent_emails);
  go(res, home(sc), bad.length ? { err: `Added ${first}, but these emails weren't valid: ${bad.join(", ")}` }
    : { ok: `Added ${first} ${last}${group ? ` to ${group}` : ""}${tags.length ? `, tagged ${tags.join(", ")}` : ""}.` + (dupe ? ` (There's already a ${first} ${last}; if that's the same person, use "Add someone already in the app" next time.)` : "") });
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
router.get("/import", wrap(async (req, res) => res.send(v.importPage({ user: req.user, flash: flashFrom(req), sc: req.sched.sc }))));
async function plan(sc, rows, map) {
  const people = readRows(rows, map);
  const groups = SC.groupsFor(sc);
  const ci = (a, b) => a.toLowerCase() === b.toLowerCase();
  for (const p of people) {
    p.groupMatch = p.group ? groups.find((g) => ci(g, p.group)) || null : null;
    p.tagMatch = p.tags.map((t) => (sc.tags || []).find((x) => ci(x, t)) || t);
    if (!p.first || !p.last) { p.status = "skip"; continue; }
    const hit = (await query(`SELECT a.id, EXISTS (SELECT 1 FROM schedule_members m WHERE m.athlete_id=a.id AND m.schedule_id=$3) AS here
      FROM athletes a WHERE lower(a.first_name)=lower($1) AND lower(a.last_name)=lower($2) ORDER BY a.id LIMIT 1`, [p.first, p.last, sc.id])).rows[0];
    p.athleteId = hit ? hit.id : null; p.status = hit ? (hit.here ? "here" : "existing") : "new";
    p.groupMatch = p.group ? groups.find((g) => ci(g, p.group)) || null : null;
    p.tagMatch = p.tags.map((t) => (sc.tags || []).find((x) => ci(x, t)) || t);
  }
  const newGroups = [...new Set(people.filter((p) => p.status !== "skip" && p.group && !p.groupMatch).map((p) => p.group))];
  const newTags = [...new Set(people.flatMap((p) => p.status === "skip" ? [] : p.tagMatch.filter((t) => !(sc.tags || []).includes(t))))];
  return { people, newGroups, newTags };
}
const mapFrom = (b, headers) => {
  const g = guess(headers);
  const pick = (k) => (b[`col_${k}`] === undefined ? g[k] : int(b[`col_${k}`]) ?? -1);
  return { first: pick("first"), last: pick("last"), name: pick("name"), group: pick("group"), tags: pick("tags"), cteam: pick("cteam"), se: pick("se"),
    emails: b.col_emails === undefined && !b.mapped ? g.emails : [].concat(b.col_emails || []).map(int).filter((x) => x >= 0) };
};
router.post("/import/preview", wrap(async (req, res) => {
  const { sc } = req.sched;
  const rows = CSV.parse(req.body.data);
  if (rows.length < 2) return go(res, `/admin/members/import?s=${sc.id}`, { err: "That file has no rows under its headings. Make sure the first row is the column names." });
  const headers = rows[0], body = rows.slice(1);
  const map = mapFrom(req.body, headers);
  const p = await plan(sc, body, map);
  res.send(v.importPreview({ user: req.user, flash: flashFrom(req), sc, headers, map, data: req.body.data, ...p }));
}));
router.post("/import/commit", wrap(async (req, res) => {
  const { sc } = req.sched;
  const rows = CSV.parse(req.body.data);
  const headers = rows[0] || [], map = mapFrom(req.body, headers);
  const { people, newGroups, newTags } = await plan(sc, rows.slice(1), map);
  const G = require("../groups");
  if (req.body.add_groups && newGroups.length) for (const g of newGroups) await G.add(await SC.get(sc.id), g);
  if (req.body.add_tags && newTags.length) for (const t of newTags) await G.addTag(await SC.get(sc.id), t);
  const fresh = await SC.get(sc.id);
  const groups = SC.groupsFor(fresh), tags = fresh.tags || [];
  let added = 0, linked = 0, updated = 0, skipped = 0, emails = 0;
  for (const p of people) {
    if (p.status === "skip") { skipped++; continue; }
    let id = p.athleteId;
    if (!id) { id = (await query(`INSERT INTO athletes (first_name, last_name) VALUES ($1,$2) RETURNING id`, [p.first, p.last])).rows[0].id; added++; }
    // the People directory: current team and SportsEngine group (only when the file has them)
    if (p.cteam || p.se) await query(`UPDATE athletes SET team=COALESCE(NULLIF($2,''), team), se_group=COALESCE(NULLIF($3,''), se_group) WHERE id=$1`, [id, p.cteam, p.se]);
    const group = groups.find((g) => p.group && g.toLowerCase() === p.group.toLowerCase()) || null;
    const ptags = p.tagMatch.filter((t) => tags.includes(t));
    const ex = (await query(`SELECT tags FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [sc.id, id])).rows[0];
    if (ex) { await query(`UPDATE schedule_members SET group_name=COALESCE($3, group_name), tags=$4 WHERE schedule_id=$1 AND athlete_id=$2`,
        [sc.id, id, group, [...new Set([...(ex.tags || []), ...ptags])]]); updated++; }
    else { await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags) VALUES ($1,$2,$3,$4)`, [sc.id, id, group, ptags]); if (p.athleteId) linked++; }
    if (p.emails.length) { await linkParents(id, p.emails.join(",")); emails += p.emails.length; }
  }
  const L = SC.labels(sc);
  go(res, `/admin/members?s=${sc.id}#people`, { ok: [`Imported ${added + linked + updated} ${L.participant.many.toLowerCase()}`,
    added ? `${added} new` : "", linked ? `${linked} already in the app, now on this board` : "", updated ? `${updated} already here, updated` : "",
    skipped ? `${skipped} rows skipped (no name)` : "", emails ? `${emails} parent emails linked` : ""].filter(Boolean).join(" · ") + "." });
}));

// Someone already in the app (from another schedule, a public sign-up, a parent) joins this schedule
router.post("/add", wrap(async (req, res) => {
  const { sc } = req.sched;
  const ids = [].concat(req.body.athlete_id || []).map(int).filter(Boolean);
  const group = SC.groupsFor(sc).includes(str(req.body.group)) ? str(req.body.group) : null;
  if (!ids.length) return go(res, home(sc, "#add"), { err: "Pick at least one person." });
  for (const id of ids) await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [sc.id, id, group]);
  go(res, home(sc), { ok: `Added ${ids.length} ${ids.length === 1 ? "person" : "people"} to ${sc.name}${group ? ` in ${group}` : ""}.` });
}));

// Tags: one person's set, or one tag on/off for many people
router.post("/bulk-tag", wrap(async (req, res) => {
  const { sc } = req.sched;
  const ids = [].concat(req.body.athlete_id || []).map(int).filter(Boolean);
  const tag = str(req.body.tag);
  if (!ids.length || !(sc.tags || []).includes(tag)) return go(res, dest(req, home(sc)), { err: "Check some people and pick a tag." });
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
