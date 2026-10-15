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
  for (const e of emails.filter(auth.isValidEmail)) {
    const u = await auth.findOrCreateUser(e);
    await query(`INSERT INTO parent_athletes (user_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.id, athleteId]);
  }
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
    `SELECT a.id, a.first_name, a.last_name, a.self_user_id FROM athletes a
     WHERE NOT EXISTS (SELECT 1 FROM schedule_members m WHERE m.schedule_id=$1 AND m.athlete_id=a.id)
     ORDER BY a.last_name, a.first_name`, [sc.id])).rows;
  const total = (await query(`SELECT count(*)::int AS n FROM schedule_members WHERE schedule_id=$1`, [sc.id])).rows[0].n;
  res.send(v.membersPage({ user: req.user, flash: flashFrom(req), sc, members, others, group, total }));
}));

// A brand-new person, added to this schedule
router.post("/", wrap(async (req, res) => {
  const { sc } = req.sched;
  const L = SC.labels(sc);
  const first = str(req.body.first_name).slice(0, 40), last = str(req.body.last_name).slice(0, 40);
  const group = SC.groupsFor(sc).includes(str(req.body.group)) ? str(req.body.group) : null;
  if (!first || !last) return go(res, home(sc, "#add"), { err: `Enter the ${L.participant.one.toLowerCase()}'s first and last name.` });
  const dupe = (await query(`SELECT id FROM athletes WHERE lower(first_name)=lower($1) AND lower(last_name)=lower($2)`, [first, last])).rows[0];
  const a = (await query(`INSERT INTO athletes (first_name, last_name, team) VALUES ($1,$2,$3) RETURNING id`, [first, last, str(req.body.team) || null])).rows[0];
  await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name) VALUES ($1,$2,$3)`, [sc.id, a.id, group]);
  const bad = await linkParents(a.id, req.body.parent_emails);
  go(res, home(sc), bad.length ? { err: `Added ${first}, but these emails weren't valid: ${bad.join(", ")}` }
    : { ok: `Added ${first} ${last}${group ? ` to ${group}` : ""}.` + (dupe ? ` (There's already a ${first} ${last}; if that's the same person, use "Add someone already in the app" next time.)` : "") });
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

module.exports = router;
