const express = require("express");
const { pool, query } = require("../db");
const auth = require("../auth");
const R = require("../rounds");
const { isDate } = require("../time");
const v = require("../views/seasons");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const getSeason = async (id) => (await query(`SELECT * FROM seasons WHERE id=$1`, [id])).rows[0];
const STATS = `
  (SELECT count(*)::int FROM rounds r WHERE r.season_id=se.id) AS rounds,
  (SELECT count(*)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id
     WHERE r.season_id=se.id AND s.canceled_at IS NULL) AS sessions,
  (SELECT count(*)::int FROM reservations x JOIN training_sessions s ON s.id=x.session_id JOIN programs p ON p.id=s.program_id
     JOIN rounds r ON r.id=p.round_id WHERE r.season_id=se.id AND x.status='confirmed') AS reserved`;

router.get("/", wrap(async (req, res) => {
  const seasons = (await query(`SELECT se.*, ${STATS} FROM seasons se ORDER BY se.starts_on DESC`)).rows;
  const unassigned = (await query(`SELECT count(*)::int AS n FROM rounds WHERE season_id IS NULL`)).rows[0].n;
  res.send(v.seasonsPage({ user: req.user, flash: flashFrom(req), seasons, unassigned }));
}));

router.post("/", wrap(async (req, res) => {
  const name = str(req.body.name), s = str(req.body.starts_on), e = str(req.body.ends_on);
  if (!name || !isDate(s) || !isDate(e) || e < s) return go(res, "/admin/seasons", { err: "Enter a name and a start date on or before the end date." });
  const src = int(req.body.copy_from) ? await getSeason(int(req.body.copy_from)) : null;

  const c = await pool.connect();
  let id, copied = { rounds: 0, sessions: 0 };
  try {
    await c.query("BEGIN");
    id = (await c.query(`INSERT INTO seasons (name, starts_on, ends_on) VALUES ($1,$2,$3) RETURNING id`, [name, s, e])).rows[0].id;
    if (src) {
      // Shift every round by the gap between the two seasons' first days
      const offset = (await c.query(`SELECT $1::date - $2::date AS d`, [s, src.starts_on])).rows[0].d;
      const rounds = (await c.query(
        `SELECT *, to_char(starts_on + $2::int, 'YYYY-MM-DD') AS ns, to_char(ends_on + $2::int, 'YYYY-MM-DD') AS ne
         FROM rounds WHERE season_id=$1 ORDER BY starts_on`, [src.id, offset])).rows;
      for (const r of rounds) {
        const out = await R.copyRound(c, r, { name: r.name, starts_on: r.ns, ends_on: r.ne, season_id: id, offsetDays: offset, shiftRules: true });
        copied.rounds++; copied.sessions += out.sessions;
      }
    }
    await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK"); throw err; }
  finally { c.release(); }
  go(res, `/admin/seasons/${id}`, { ok: src
    ? `Season created with ${copied.rounds} round${copied.rounds === 1 ? "" : "s"} and ${copied.sessions} session${copied.sessions === 1 ? "" : "s"} copied from ${src.name}. They're drafts: review each round, then publish.`
    : "Season created. Add rounds to it, or import the vendor schedule." });
}));

router.get("/:id", wrap(async (req, res) => {
  const season = (await query(`SELECT se.*, ${STATS} FROM seasons se WHERE se.id=$1`, [int(req.params.id)])).rows[0];
  if (!season) return go(res, "/admin/seasons", { err: "Season not found." });
  const rounds = (await query(
    `SELECT r.*,
       (SELECT count(*)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id WHERE p.round_id=r.id AND s.canceled_at IS NULL) AS sessions,
       (SELECT count(*)::int FROM reservations x JOIN training_sessions s ON s.id=x.session_id JOIN programs p ON p.id=s.program_id
          WHERE p.round_id=r.id AND x.status='confirmed') AS reserved
     FROM rounds r WHERE r.season_id=$1 ORDER BY r.starts_on`, [season.id])).rows;
  const unassigned = (await query(`SELECT id, name, starts_on, ends_on FROM rounds WHERE season_id IS NULL ORDER BY starts_on`)).rows;
  res.send(v.seasonPage({ user: req.user, flash: flashFrom(req), season, rounds, unassigned }));
}));

const guardOpen = async (req, res) => {
  const s = await getSeason(int(req.params.id));
  if (!s) { go(res, "/admin/seasons", { err: "Season not found." }); return null; }
  if (s.completed_at) { go(res, `/admin/seasons/${s.id}`, { err: "This season is completed. Reopen it to make changes." }); return null; }
  return s;
};

router.post("/:id", wrap(async (req, res) => {
  const s = await guardOpen(req, res); if (!s) return;
  const name = str(req.body.name), a = str(req.body.starts_on), e = str(req.body.ends_on);
  if (!name || !isDate(a) || !isDate(e) || e < a) return go(res, `/admin/seasons/${s.id}`, { err: "Enter a name and a start date on or before the end date." });
  await query(`UPDATE seasons SET name=$2, starts_on=$3, ends_on=$4 WHERE id=$1`, [s.id, name, a, e]);
  go(res, `/admin/seasons/${s.id}`, { ok: "Season saved." });
}));

router.post("/:id/attach", wrap(async (req, res) => {
  const s = await guardOpen(req, res); if (!s) return;
  const ids = [].concat(req.body.round || []).map(int).filter(Boolean);
  if (!ids.length) return go(res, `/admin/seasons/${s.id}`, { err: "Check the rounds to add." });
  await query(`UPDATE rounds SET season_id=$1 WHERE id = ANY($2) AND season_id IS NULL`, [s.id, ids]);
  go(res, `/admin/seasons/${s.id}`, { ok: `Added ${ids.length} round${ids.length === 1 ? "" : "s"} to this season.` });
}));

router.post("/:id/complete", wrap(async (req, res) => {
  const s = await guardOpen(req, res); if (!s) return;
  await query(`UPDATE seasons SET completed_at=now() WHERE id=$1`, [s.id]);
  go(res, `/admin/seasons/${s.id}`, { ok: "Season completed. It's hidden from families and read-only. Its reports are still available." });
}));

router.post("/:id/reopen", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`UPDATE seasons SET completed_at=NULL WHERE id=$1`, [id]);
  go(res, `/admin/seasons/${id}`, { ok: "Season reopened. Rounds that were published are visible to families again." });
}));

router.post("/:id/delete", wrap(async (req, res) => {
  const s = await guardOpen(req, res); if (!s) return;
  const n = (await query(`SELECT count(*)::int AS n FROM rounds WHERE season_id=$1`, [s.id])).rows[0].n;
  if (n) return go(res, `/admin/seasons/${s.id}`, { err: "Delete or move this season's rounds first." });
  await query(`DELETE FROM seasons WHERE id=$1`, [s.id]);
  go(res, "/admin/seasons", { ok: "Season deleted." });
}));

module.exports = router;
