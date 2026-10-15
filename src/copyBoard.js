// Copy a Claim Board into a new one: settings always; activities, groups, participants, and the
// calendar (open seasons + rounds, shifted to a new start date) as chosen. Copied rounds are drafts.
const { pool, query } = require("./db");
const SC = require("./schedules");
const R = require("./rounds");
const catalog = require("./catalog");

async function copyBoard(src, { name, activities = true, groups = true, members = false, calendar = false, startOn = null }) {
  const sort = (await query(`SELECT coalesce(max(sort),0)+1 AS n FROM schedules`)).rows[0].n;
  const board = (await query(
    `INSERT INTO schedules (name, labels, groups, presets, locations, family_names, sort, tags, depth, use_calendar, pick_mode, claim_mode, restricted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [name, JSON.stringify(src.labels || {}), groups ? src.groups || [] : [], JSON.stringify(groups ? src.presets || [] : []),
     src.locations || [], src.family_names || "initial", sort, groups ? src.tags || [] : [], SC.depthOf(src), SC.usesCalendar(src), SC.pickMode(src), SC.claimMode(src), !!src.restricted])).rows[0];

  // Activities are per board: duplicate this board's entries (needed before the calendar is copied)
  if (activities || calendar) {
    const c = catalog.current();
    const mine = c.activities.filter((a) => a.schedule_id === src.id);
    c.activities.push(...mine.map((a) => ({ ...a, schedule_id: board.id })));
    await catalog.save(c);
  }
  await SC.refreshGroups();

  const out = { board, members: 0, seasons: 0, rounds: 0, sessions: 0 };
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    if (members) {
      out.members = (await db.query(
        `INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags)
         SELECT $1, athlete_id, CASE WHEN $3 THEN group_name END, CASE WHEN $3 THEN tags ELSE '{}' END FROM schedule_members WHERE schedule_id=$2`,
        [board.id, src.id, !!groups])).rowCount;
    }
    if (calendar) {
      const rounds = (await db.query(`SELECT * FROM rounds WHERE schedule_id=$1 ORDER BY starts_on`, [src.id])).rows;
      const firstDay = rounds.map((r) => r.starts_on).sort()[0];
      const offset = firstDay && startOn ? (await db.query(`SELECT $1::date - $2::date AS d`, [startOn, firstDay])).rows[0].d : 0;
      const shift = async (d) => (await db.query(`SELECT to_char($1::date + $2::int, 'YYYY-MM-DD') AS d`, [d, offset])).rows[0].d;
      for (const r of rounds) {
        const res = await R.copyRound(db, r, { name: r.name, starts_on: await shift(r.starts_on), ends_on: await shift(r.ends_on),
          season_id: null, offsetDays: offset, shiftRules: true, schedule_id: board.id });
        out.rounds++; out.sessions += res.sessions;
      }
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    // undo the board itself so a failed copy leaves nothing behind
    const c = catalog.current(); c.activities = c.activities.filter((a) => a.schedule_id !== board.id); await catalog.save(c);
    await query(`DELETE FROM schedules WHERE id=$1`, [board.id]);
    throw e;
  } finally { db.release(); }
  await SC.ensureStructure(await SC.get(board.id)); // built-in round for 1-2 level boards (if the calendar didn't bring one)
  return out;
}

module.exports = { copyBoard };
