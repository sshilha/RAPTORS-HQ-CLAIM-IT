const express = require("express");
const pdf = require("pdf-parse/lib/pdf-parse.js");
const { pool, query } = require("../db");
const auth = require("../auth");
const { parseSchedule } = require("../scheduleImport");
const { AGE_GROUPS, ACTIVITIES, TZ } = require("../config");
const R = require("../rounds");
const { inputParts, isDate, isTime, isLocal, localSql } = require("../time");
const v = require("../views/import");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const roundKey = (round) => (round ? String(round) : "0");
const defaultRoundName = (round) => (round ? `Round ${round}` : "Imported sessions");

function readSettings(b) {
  const out = {
    location: str(b.location) || null,
    priority_limit: Math.min(Math.max(int(b.priority_limit) || 2, 1), 50),
    cancel_hours: Math.min(int(b.cancel_hours) ?? 24, 336),
    defaults: b.defaults ? R.normalizeDefaults(b.defaults) : R.readDefaults(b),
    season_id: int(b.season_id) || null,
    schedule_id: int(b.schedule_id) || null,
    limits: b.limits ? R.normalizeLimits(b.limits) : R.readLimits(b),
    unlock_hours: b.limits ? (b.unlock_hours == null ? null : Math.max(0, parseInt(b.unlock_hours, 10) || 0)) : R.readUnlock(b),
  };
  out.waitlist = !!b.waitlist;
  out.unlockText = R.unlockLabel(out.unlock_hours) + (out.unlock_hours == null ? "" : " each session");
  return out;
}

// An existing round "matches" when the name is the same and it starts within ~2 months
async function findRound(db, name, firstDate, seasonId, scheduleId) {
  return (await db.query(
    `SELECT * FROM rounds WHERE lower(name)=lower($1) AND abs(starts_on - $2::date) <= 60
       AND season_id IS NOT DISTINCT FROM $3 AND ($4::int IS NULL OR schedule_id=$4) ORDER BY starts_on DESC LIMIT 1`,
    [name, firstDate, seasonId, scheduleId])).rows[0] || null;
}
const openSeasons = async () => (await query(`SELECT * FROM seasons WHERE completed_at IS NULL ORDER BY starts_on DESC`)).rows;
const SC = require("../schedules");
const seasonOpen = async (id) => !id || (await query(`SELECT 1 FROM seasons WHERE id=$1 AND completed_at IS NULL`, [id])).rowCount > 0;

async function classify(rows, scheduleId) {
  const existing = new Set((await query(
    `SELECT p.activity, p.age_groups, to_char(s.starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS k
     FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id
     WHERE s.canceled_at IS NULL AND NOT p.archived AND r.schedule_id = $1`, [scheduleId])).rows.map((r) => `${r.activity}|${r.age_groups.join(",")}|${r.k}`));
  const now = inputParts(new Date());
  const nowKey = `${now.date} ${now.time}`;
  const seen = new Set();
  return rows.map((r, i) => {
    const key = `${r.activity}|${r.ages.join(",")}|${r.date} ${r.start}`;
    const status = existing.has(key) || seen.has(key) ? "duplicate" : `${r.date} ${r.start}` < nowKey ? "past" : "new";
    seen.add(key);
    return { ...r, i, status };
  });
}

router.get("/", wrap(async (req, res) => {
  const schedules = await SC.all();
  const sc = schedules.find((x) => x.id === int(req.query.s)) || schedules[0];
  res.send(v.uploadPage({ user: req.user, flash: flashFrom(req), seasons: (await openSeasons()).filter((x) => x.schedule_id === sc.id),
    schedules, v: { schedule_id: sc.id } }));
}));

router.post("/preview", wrap(async (req, res) => {
  const b = req.body;
  let text = str(b.text);
  if (b.pdf_b64) {
    try { text = (await pdf(Buffer.from(b.pdf_b64, "base64"))).text; }
    catch { return res.send(v.uploadPage({ user: req.user, v: b, schedules: await SC.all(), seasons: await openSeasons(), flash: { err: "That file couldn't be read as a PDF. Try pasting the text instead." } })); }
  }
  if (!text) return res.send(v.uploadPage({ user: req.user, v: b, schedules: await SC.all(), seasons: await openSeasons(), flash: { err: "Choose a PDF or paste the schedule text." } }));

  const year = int(b.year);
  const target = await SC.get(int(b.schedule_id)) || (await SC.all())[0];
  const { sessions, warnings } = parseSchedule(text, { year: year && year > 2000 ? year : undefined,
    groups: SC.groupsFor(target), activities: SC.entriesFor(target) });
  if (!sessions.length) return res.send(v.uploadPage({ user: req.user, v: b, schedules: await SC.all(), seasons: await openSeasons(),
    flash: { err: "No sessions found. Lines should look like 6-7:30pm-Hitting-12/14/16/18U, under a date like November 4." } }));

  const settings = readSettings(b);
  if (!(await seasonOpen(settings.season_id))) return res.send(v.uploadPage({ user: req.user, v: b, schedules: await SC.all(), seasons: await openSeasons(), flash: { err: "Pick an open season." } }));
  const rows = await classify(sessions, target.id);
  const rounds = [];
  for (const round of [...new Set(rows.map((r) => r.round))]) {
    const rr = rows.filter((r) => r.round === round);
    const name = defaultRoundName(round);
    rounds.push({ round, key: roundKey(round), name, first: rr[0].date, last: rr[rr.length - 1].date,
      match: await findRound({ query }, name, rr[0].date, settings.season_id, settings.schedule_id) });
  }
  const board = settings.schedule_id ? await SC.get(settings.schedule_id) : null;
  res.send(v.previewPage({ user: req.user, rows, rounds, warnings, settings, seasonName: board?.name }));
}));

router.post("/commit", wrap(async (req, res) => {
  let payload;
  try { payload = JSON.parse(req.body.payload); } catch { return go(res, "/admin/import", { err: "The preview expired. Upload the schedule again." }); }
  const settings = readSettings(payload.settings || {});
  const picked = new Set([].concat(req.body.row || []).map(String));
  const rows = (payload.rows || []).filter((r) =>
    picked.has(String(r.i)) && isDate(r.date) && isTime(r.start) && isTime(r.end) && r.end > r.start &&
    typeof r.activity === "string" && r.activity.length < 60 && Array.isArray(r.ages) && r.ages.every((a) => AGE_GROUPS.includes(a)));
  if (!rows.length) return go(res, "/admin/import", { err: "No sessions were selected." });

  const local = (name) => { const s = str(req.body[name]); return isLocal(s) ? s.replace("T", " ") : null; };
  const client = await pool.connect();
  let created = 0, skipped = 0;
  const touched = [];
  try {
    await client.query("BEGIN");
    for (const key of [...new Set(rows.map((r) => roundKey(r.round)))]) {
      const rr = rows.filter((r) => roundKey(r.round) === key).sort((a, b) => a.date.localeCompare(b.date));
      const name = str(req.body[`name_${key}`]) || defaultRoundName(rr[0].round);
      const first = rr[0].date, last = rr[rr.length - 1].date;
      let round = await findRound(client, name, first, settings.season_id, settings.schedule_id);
      if (round) {
        round = (await client.query(
          `UPDATE rounds SET starts_on=LEAST(starts_on,$2::date), ends_on=GREATEST(ends_on,$3::date) WHERE id=$1 RETURNING *`,
          [round.id, first, last])).rows[0];
      } else {
        round = (await client.query(
          `INSERT INTO rounds (name, starts_on, ends_on, booking_opens_at, priority_ends_at, priority_limit, cancel_hours, location,
             activity_defaults, season_id, activity_limits, unlock_hours, waitlist, schedule_id)
           VALUES ($1,$2,$3,${localSql(4)},${localSql(5)},$6,$7,$8,$9,$10,$11,$12,$13,
             COALESCE((SELECT schedule_id FROM seasons WHERE id=$10), $14, (SELECT min(id) FROM schedules))) RETURNING *`,
          [name, first, last, local(`opens_${key}`), local(`priority_${key}`), settings.priority_limit,
           settings.cancel_hours, settings.location, JSON.stringify(settings.defaults), settings.season_id,
           JSON.stringify(settings.limits), settings.unlock_hours, settings.waitlist, settings.schedule_id])).rows[0];
      }
      touched.push(round.id);
      for (const r of rr) { const n = await R.addSession(client, round, r); if (n) created += n; else skipped++; }
      // The imported times become this round's time slots
      await client.query(`UPDATE rounds SET time_slots=$2 WHERE id=$1`,
        [round.id, JSON.stringify(R.addSlots(round, rr.map((r) => ({ start: r.start, end: r.end }))))]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }

  const msg = `Created ${created} session${created === 1 ? "" : "s"} in ${touched.length} round${touched.length === 1 ? "" : "s"}` +
    (skipped ? `. Skipped ${skipped} already added` : "") + ". They stay hidden from families until you publish them.";
  go(res, touched.length === 1 ? `/admin/rounds/${touched[0]}` : `/admin/setup?s=${settings.schedule_id || ""}`, { ok: msg });
}));

module.exports = router;
