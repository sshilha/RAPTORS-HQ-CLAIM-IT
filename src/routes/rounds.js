const express = require("express");
const { pool, query } = require("../db");
const auth = require("../auth");
const booking = require("../booking");
const { notify } = require("../notify");
const { AGE_GROUPS, ACTIVITIES, ALL_AGES_ACTIVITIES, TZ } = require("../config");
const R = require("../rounds");
const { isDate, isTime, isLocal, localSql } = require("../time");
const v = require("../views/rounds");
const locks = require("../locks");
const { wrap, flashFrom, go, int, str, dest } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

async function tx(fn) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const out = await fn(c); await c.query("COMMIT"); return out; }
  catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}

// Everything that changes a round is blocked once its season is completed
router.post("/:id/*", wrap(async (req, res, next) => {
  if (await locks.roundLocked(int(req.params.id))) return go(res, dest(req, `/admin/rounds/${int(req.params.id)}`), { err: locks.LOCKED_MSG });
  next();
}));

const openSeasons = async () => (await query(`SELECT * FROM seasons WHERE completed_at IS NULL ORDER BY starts_on DESC`)).rows;
// (seasons offered when moving a round are limited to its own schedule in the view)
const seasonOk = async (id) => !id || (await query(`SELECT 1 FROM seasons WHERE id=$1 AND completed_at IS NULL`, [id])).rowCount > 0;

const getRound = async (id, db = { query }) => (await db.query(`SELECT * FROM rounds WHERE id=$1`, [id])).rows[0];
const localOrNull = (s) => (isLocal(str(s)) ? str(s).replace("T", " ") : null);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------- list + create ----------
router.get("/", (req, res, next) => (req.query.season ? next() : res.redirect(`/admin/setup?s=${req.sched.sc.id}`)));
router.get("/", wrap(async (req, res) => {
  const seasons = (await query(`SELECT * FROM seasons ORDER BY starts_on DESC`)).rows;
  const filter = str(req.query.season) || "open";
  const where = filter === "all" ? "TRUE" : filter === "none" ? "r.season_id IS NULL"
    : int(filter) ? `r.season_id = ${int(filter)}` : "(se.id IS NULL OR se.completed_at IS NULL)";
  const rounds = (await query(
    `SELECT r.*, se.name AS season_name, se.completed_at AS season_done,
       (SELECT count(*)::int FROM training_sessions s JOIN programs p ON p.id=s.program_id
          WHERE p.round_id=r.id AND s.canceled_at IS NULL) AS sessions,
       (SELECT count(*)::int FROM reservations x JOIN training_sessions s ON s.id=x.session_id
          JOIN programs p ON p.id=s.program_id WHERE p.round_id=r.id AND x.status<>'canceled') AS reservations
     FROM rounds r LEFT JOIN seasons se ON se.id=r.season_id WHERE ${where} ORDER BY r.starts_on DESC`)).rows;
  const copyable = (await query(`SELECT r.id, r.name, r.starts_on, r.ends_on, se.name AS season_name
     FROM rounds r LEFT JOIN seasons se ON se.id=r.season_id ORDER BY r.starts_on DESC`)).rows;
  res.send(v.roundsPage({ user: req.user, flash: flashFrom(req), rounds, seasons, filter, copyable,
    open: seasons.filter((x) => !x.completed_at) }));
}));

router.post("/", wrap(async (req, res) => {
  const name = str(req.body.name);
  let s = str(req.body.starts_on), e = str(req.body.ends_on);
  // List-only boards don't use dates: rounds just run from today for two years
  const board = int(req.body.schedule_id) ? await require("../schedules").get(int(req.body.schedule_id)) : null;
  if (board && !require("../schedules").usesCalendar(board) && !s && !e) {
    const d = (await query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS a, to_char(CURRENT_DATE + 730, 'YYYY-MM-DD') AS b`)).rows[0];
    s = d.a; e = d.b;
  }
  const seasonId = int(req.body.season_id) || null;
  if (!name || !isDate(s) || !isDate(e) || e < s) return go(res, dest(req, "/admin/rounds", { id: "new" }), { err: "Enter a round name and a first day on or before the last day." });
  if (!(await seasonOk(seasonId))) return go(res, dest(req, "/admin/rounds", { id: "new" }), { err: "Pick an open season." });
  const src = int(req.body.copy_from) ? await getRound(int(req.body.copy_from)) : null;

  const id = await tx(async (db) => {
    if (src) {
      const offset = (await db.query(`SELECT $1::date - $2::date AS d`, [s, src.starts_on])).rows[0].d;
      return (await R.copyRound(db, src, { name, starts_on: s, ends_on: e, season_id: seasonId, offsetDays: offset, shiftRules: false })).round.id;
    }
    return (await db.query(
      `INSERT INTO rounds (name, starts_on, ends_on, season_id, location, activity_defaults, activity_limits, schedule_id, signup_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE((SELECT schedule_id FROM seasons WHERE id=$4), $8, (SELECT min(id) FROM schedules)),
         COALESCE((SELECT claim_mode FROM schedules WHERE id=$8), 'roster')) RETURNING id`,
      [name, s, e, seasonId, ((await require("../schedules").get(int(req.body.schedule_id) || (seasonId && (await require("../schedules").forSeason(seasonId) || {}).id)) || {}).locations || [])[0] || null, "{}",
       JSON.stringify(R.defaultLimits(await require("../schedules").get(int(req.body.schedule_id) || (seasonId && (await require("../schedules").forSeason(seasonId) || {}).id)) || null)),
       int(req.body.schedule_id) || null])).rows[0].id;
  });
  const L = require("../schedules").labels(await require("../schedules").forRound(id));
  go(res, dest(req, `/admin/rounds/${id}`, { id }), { ok: src
    ? `${L.middle.one} created as a copy. Check its limits, unlock period, and booking dates, then publish.`
    : require("../schedules").usesCalendar(await require("../schedules").forRound(id))
      ? `${L.middle.one} created. Next: add its times and ${L.activity.many.toLowerCase()}, then put them on the calendar.`
      : `${L.middle.one} created. Next: add its ${L.activity.many.toLowerCase()}, then its ${L.slot.many.toLowerCase()}.` });
}));

// ---------- builder ----------
router.get("/:id", wrap(async (req, res) => {
  const round = await getRound(int(req.params.id));
  if (!round) return go(res, "/admin/rounds", { err: "Round not found." });
  const types = (await query(
    `SELECT p.*, (SELECT count(*)::int FROM training_sessions s WHERE s.program_id=p.id AND s.canceled_at IS NULL) AS scheduled
     FROM programs p WHERE p.round_id=$1`, [round.id])).rows
    .sort((a, b) => ACTIVITIES.indexOf(a.activity) - ACTIVITIES.indexOf(b.activity) ||
      AGE_GROUPS.indexOf(a.age_groups[0]) - AGE_GROUPS.indexOf(b.age_groups[0]));
  const sessions = (await query(
    `SELECT s.id, s.capacity, s.starts_at, s.unlocked_at, p.id AS program_id, p.activity, p.age_groups, p.block_minutes, p.required_tags,
       to_char(s.starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS date,
       to_char(s.starts_at AT TIME ZONE '${TZ}', 'HH24:MI') AS start,
       to_char(s.ends_at AT TIME ZONE '${TZ}', 'HH24:MI') AS "end",
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS taken
     FROM training_sessions s JOIN programs p ON p.id=s.program_id
     WHERE p.round_id=$1 AND s.canceled_at IS NULL ORDER BY s.starts_at, p.activity`, [round.id])).rows;
  const season = round.season_id ? (await query(`SELECT * FROM seasons WHERE id=$1`, [round.season_id])).rows[0] : null;
  const own = await require("../schedules").forRound(round.id);
  if (own) req.user.sched = { ...req.sched, sc: own }; // tabs follow this round's schedule
  res.send(v.builderPage({ user: req.user, flash: flashFrom(req), round, types, sessions, last: req.query,
    season, seasons: (await openSeasons()).filter((x) => x.schedule_id === round.schedule_id), readonly: !!season?.completed_at,
    schedule: await require("../schedules").forRound(round.id) }));
}));

router.post("/:id/settings", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const name = str(b.name), s = str(b.starts_on), e = str(b.ends_on);
  if (!name || !isDate(s) || !isDate(e) || e < s) return go(res, `/admin/rounds/${id}`, { err: "Enter a name and a start date on or before the end date." });
  await tx(async (db) => {
    const round = (await db.query(
      `UPDATE rounds SET name=$2, starts_on=$3, ends_on=$4, booking_opens_at=${localSql(5)},
         cancel_hours=$6, location=$7 WHERE id=$1 RETURNING *`,
      [id, name, s, e, localOrNull(b.booking_opens_at), Math.min(int(b.cancel_hours) ?? 24, 336), str(b.location) || null])).rows[0];
    await R.syncPrograms(db, round);
    if (b.apply_location) await db.query(
      `UPDATE training_sessions s SET location=$2 FROM programs p WHERE p.id=s.program_id AND p.round_id=$1`, [id, round.location]);
  });
  go(res, `/admin/rounds/${id}#settings`, { ok: "Round saved." });
}));

// ---------- limits (per activity) ----------
router.post("/:id/limits", wrap(async (req, res) => {
  const id = int(req.params.id);
  const cur = await getRound(id);
  const limits = R.readLimits(req.body, cur && cur.activity_limits);
  const unlock = R.readUnlock(req.body);
  await tx(async (db) => {
    const round = (await db.query(
      `UPDATE rounds SET activity_limits=$2, unlock_hours=$3, waitlist=$4 WHERE id=$1 RETURNING *`,
      [id, JSON.stringify(limits), unlock, !!req.body.waitlist])).rows[0];
    await R.syncPrograms(db, round);
  });
  const summary = Object.entries(limits).map(([a, n]) => `${a} ${n == null ? "unlimited" : n}`).join(", ");
  go(res, dest(req, `/admin/rounds/${id}#limits`), { ok: `Limits saved: ${summary}. Open spots unlock ${R.unlockLabel(unlock)}${unlock == null ? "" : " each session"}. Waitlist ${req.body.waitlist ? "on" : "off"}.` });
}));

// ---------- items (claimable things with no date) ----------
// An item's "Only for": only the board's own groups/tags, and only if the form showed the picker
async function saveFor(roundId, sid, b) {
  if (!b.for_shown) return;
  const sc = await require("../schedules").forRound(roundId);
  const groups = [].concat(b.only_groups || []).filter((g) => require("../schedules").groupsFor(sc).includes(g));
  const tags = [].concat(b.only_tags || []).filter((t) => (sc.tags || []).includes(t));
  await query(`UPDATE training_sessions SET only_groups=$2, only_tags=$3 WHERE id=$1`, [sid, groups, tags]);
}
router.post("/:id/items", wrap(async (req, res) => {
  const id = int(req.params.id);
  const program = (await query(`SELECT * FROM programs WHERE id=$1 AND round_id=$2`, [int(req.body.program_id), id])).rows[0];
  const title = str(req.body.title).slice(0, 80), cap = int(req.body.capacity);
  if (!program || !title || !(cap >= 1 && cap <= 500)) return go(res, dest(req, `/admin/rounds/${id}`), { err: "Pick what it is, give it a name, and enter how many spots." });
  const item = await R.addItem({ query }, program, { title, capacity: cap });
  await saveFor(id, item.id, req.body);
  go(res, dest(req, `/admin/rounds/${id}`), { ok: `Added "${title}" with ${cap} spot${cap === 1 ? "" : "s"}.` });
}));

router.post("/:id/items/:sid", wrap(async (req, res) => {
  const id = int(req.params.id), sid = int(req.params.sid);
  const title = str(req.body.title).slice(0, 80), cap = int(req.body.capacity);
  if (!title || !(cap >= 1 && cap <= 500)) return go(res, dest(req, `/admin/rounds/${id}`), { err: "Enter a name and spots." });
  try {
    const promoted = await booking.updateSessionCapacity(sid, { capacity: cap, apply: (db) =>
      db.query(`UPDATE training_sessions SET title=$2, capacity=$3 WHERE id=$1 AND program_id IN (SELECT id FROM programs WHERE round_id=$4)`, [sid, title, cap, id]) });
    await saveFor(id, sid, req.body);
    for (const rid of promoted) notify("promoted", rid);
    go(res, dest(req, `/admin/rounds/${id}`), { ok: `Saved "${title}".` + (promoted.length ? ` ${promoted.length} moved in from the waitlist.` : "") });
  } catch (e) {
    if (e instanceof booking.BookingError) return go(res, dest(req, `/admin/rounds/${id}`), { err: e.message.replace("athletes already reserved", "people who already claimed it") });
    throw e;
  }
}));

router.post("/:id/items/:sid/delete", wrap(async (req, res) => {
  const id = int(req.params.id), sid = int(req.params.sid);
  const taken = (await query(`SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status<>'canceled'`, [sid])).rows[0].n;
  if (taken) return go(res, dest(req, `/admin/rounds/${id}`), { err: `${taken} ${taken === 1 ? "person has" : "people have"} claimed it. Open it to remove them first (they'll be emailed), then remove it.` });
  await query(`DELETE FROM training_sessions WHERE id=$1 AND program_id IN (SELECT id FROM programs WHERE round_id=$2)`, [sid, id]);
  go(res, dest(req, `/admin/rounds/${id}`), { ok: "Removed." });
}));

// ---------- who signs up ----------
router.post("/:id/mode", wrap(async (req, res) => {
  const id = int(req.params.id);
  const mode = ["roster", "family", "public"].includes(req.body.signup_mode) ? req.body.signup_mode : "roster";
  await query(`UPDATE rounds SET signup_mode=$2 WHERE id=$1`, [id, mode]);
  const SC = require("../schedules");
  go(res, dest(req, `/admin/rounds/${id}#who`), { ok: `Who signs up: ${SC.MODES[mode][0]}.` +
    (mode === "public" ? " Share the link below once it's published." : "") });
}));

router.get("/:id/qr.svg", wrap(async (req, res) => {
  const r = await getRound(int(req.params.id));
  if (!r) return res.status(404).end();
  const { APP_URL } = require("../config");
  const base = APP_URL || `${req.protocol}://${req.get("host")}`;
  const svg = await require("qrcode").toString(`${base}/s/${r.share_token}`, { type: "svg", margin: 1, color: { dark: "#0c192e" } });
  res.set("Content-Type", "image/svg+xml").send(svg);
}));

// ---------- times ----------
router.post("/:id/slots", wrap(async (req, res) => {
  const id = int(req.params.id);
  const start = str(req.body.start_time), end = str(req.body.end_time);
  if (!isTime(start) || !isTime(end) || end <= start) return go(res, dest(req, `/admin/rounds/${id}#setup`), { err: "Enter a start time and a later end time." });
  const round = await getRound(id);
  await query(`UPDATE rounds SET time_slots=$2 WHERE id=$1`, [id, JSON.stringify(R.addSlots(round, [{ start, end }]))]);
  go(res, dest(req, `/admin/rounds/${id}#setup`), { ok: "Time added." });
}));

router.post("/:id/slots/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  const round = await getRound(id);
  const key = str(req.body.slot);
  const slots = (round.time_slots || []).filter((s) => `${s.start}-${s.end}` !== key);
  await query(`UPDATE rounds SET time_slots=$2 WHERE id=$1`, [id, JSON.stringify(slots)]);
  go(res, dest(req, `/admin/rounds/${id}#setup`), { ok: "Time removed. Sessions already scheduled at that time stay on the calendar." });
}));

// ---------- session definitions (activity + group + spots) ----------
function readType(b, groups, sid) {
  const activity = require("../schedules").activitiesFor(sid ? { id: sid } : null).includes(b.activity) ? b.activity : null;
  let ages = [].concat(b.ages || []).filter((g) => groups.includes(g));
  if (activity && !ages.length && require("../config").metaFor(activity, sid).all_ages) ages = [...groups];
  const spots = int(b.spots);
  return { activity, ages, spots: spots && spots <= 200 ? spots : null, coach: str(b.coach) || null, block: R.cleanBlock(b.block),
    waitlist: R.readWaitlist(b.waitlist), tags: [].concat(b.only_tags || []).map(String),
    section: str(b.section).replace(/\s+/g, " ").slice(0, 40) || null };
}

router.post("/:id/types", wrap(async (req, res) => {
  const id = int(req.params.id);
  const rr = await getRound(id);
  const sc = await require("../schedules").forRound(id);
  const groups = require("../schedules").groupsFor(sc);
  const t = readType(req.body, groups, sc && sc.id);
  const openSheet = rr && rr.signup_mode !== "roster";
  const limited = require("../schedules").restricts(sc);
  if (!limited) { t.ages = []; t.tags = []; } // the board doesn't limit by group or tag
  else if (t.activity && !t.ages.length && openSheet) t.ages = [...groups]; // open sheets: groups optional
  if (!t.activity || !t.spots || (limited && !t.ages.length && !(openSheet || !groups.length))) return go(res, dest(req, `/admin/rounds/${id}#setup`), { err: "Choose what it is, at least one group, and the number of spots." });
  const round = await getRound(id);
  t.tags = t.tags.filter((x) => (sc && sc.tags || []).includes(x)).sort();
  const exists = (await query(`SELECT 1 FROM programs WHERE round_id=$1 AND activity=$2 AND age_groups=$3::text[]
      AND (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(required_tags) x) = $4::text[] AND section IS NOT DISTINCT FROM $5`,
    [id, t.activity, R.sortAges(t.ages), t.tags, t.section])).rowCount;
  if (exists) return go(res, dest(req, `/admin/rounds/${id}#setup`), { err: `${R.typeLabel(t.activity, t.ages, t.tags)} is already set up here. Change its spots in the list.` });
  await R.ensureProgram({ query }, round, t.activity, t.ages, { capacity: t.spots, coach: t.coach, block: t.block, waitlist: t.waitlist, tags: t.tags, section: t.section });
  go(res, dest(req, `/admin/rounds/${id}#setup`), { ok: `Added ${t.section ? `${t.section} › ` : ""}${R.typeLabel(t.activity, t.ages, t.tags)}, ` +
    (t.block ? `${t.spots} spots per ${t.block}-minute block.` : `${t.spots} spots.`) });
}));

router.post("/:id/types/:pid", wrap(async (req, res) => {
  const id = int(req.params.id), pid = int(req.params.pid);
  const spots = int(req.body.spots);
  if (!spots || spots > 200) return go(res, dest(req, `/admin/rounds/${id}#setup`), { err: "Spots must be between 1 and 200." });
  const coach = str(req.body.coach) || null;
  const p = (await query(`SELECT * FROM programs WHERE id=$1 AND round_id=$2`, [pid, id])).rows[0];
  if (!p) return go(res, dest(req, `/admin/rounds/${id}#setup`), { err: "Session not found." });
  const bsc = await require("../schedules").forRound(id);
  const only = [].concat(req.body.only_tags || []).map(String).filter((x) => (bsc && bsc.tags || []).includes(x)).sort();
  await query(`UPDATE programs SET default_capacity=$2, default_coach=$3, block_minutes=$4, waitlist=$5, required_tags=$6 WHERE id=$1`,
    [pid, spots, coach, R.cleanBlock(req.body.block), R.readWaitlist(req.body.waitlist), req.body.tags_shown ? only : p.required_tags]);
  if (req.body.tags_shown) await R.syncPrograms({ query }, await getRound(id));

  // Apply to everything already scheduled; never drop below who's already reserved
  const sess = (await query(
    `SELECT s.id, (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS taken
     FROM training_sessions s WHERE s.program_id=$1 AND s.canceled_at IS NULL`, [pid])).rows;
  let updated = 0, kept = 0, promoted = [];
  for (const s of sess) {
    const cap = Math.max(spots, s.taken);
    if (cap !== spots) kept++;
    promoted = promoted.concat(await booking.updateSessionCapacity(s.id, {
      capacity: cap, apply: (db) => db.query(`UPDATE training_sessions SET capacity=$2, coach=$3 WHERE id=$1`, [s.id, cap, coach]) }));
    updated++;
  }
  promoted.forEach((rid) => notify("promoted", rid));
  go(res, dest(req, `/admin/rounds/${id}#setup`), { ok: `Saved. Updated ${plural(updated, "scheduled session")}` +
    (kept ? `; ${kept} kept higher because more athletes are already reserved` : "") +
    (promoted.length ? `; ${plural(promoted.length, "athlete")} moved off the waitlist` : "") + "." });
}));

router.post("/:id/types/:pid/delete", wrap(async (req, res) => {
  const id = int(req.params.id), pid = int(req.params.pid);
  const n = (await query(`SELECT count(*)::int AS n FROM training_sessions WHERE program_id=$1`, [pid])).rows[0].n;
  if (n) return go(res, dest(req, `/admin/rounds/${id}#setup`), { err: "Remove this session from the calendar first." });
  await query(`DELETE FROM programs WHERE id=$1 AND round_id=$2`, [pid, id]);
  go(res, dest(req, `/admin/rounds/${id}#setup`), { ok: "Session removed." });
}));

// ---------- schedule ----------
const parseDates = (raw) => [...new Set(String(raw || "").split(",").map((d) => d.trim()).filter(isDate))].sort();

router.post("/:id/schedule", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const round = await getRound(id);
  const dates = parseDates(b.dates);
  let start, end;
  if (b.slot && b.slot !== "custom") [start, end] = String(b.slot).split("-");
  else { start = str(b.start_time); end = str(b.end_time); }
  const typeIds = [].concat(b.types || []).map(int).filter(Boolean);
  const keep = { slot: str(b.slot), types: typeIds.join(","), d: dates[0] || "" };
  const back = (flash) => go(res, `/admin/rounds/${id}`, { ...flash, ...keep });

  if (!dates.length) return back({ err: "Select at least one day on the calendar." });
  if (!isTime(start) || !isTime(end) || end <= start) return back({ err: "Pick a time, or enter a start and later end time." });
  if (!typeIds.length) return back({ err: "Check at least one session." });

  const programs = (await query(`SELECT * FROM programs WHERE round_id=$1 AND id = ANY($2)`, [id, typeIds])).rows;
  let added = 0, tried = 0;
  await tx(async (db) => {
    for (const date of dates) for (const p of programs) {
      tried += R.blocksFor(p, start, end).length;
      added += await R.schedule(db, round, p, { date, start, end });
    }
    // A custom time becomes one of the round's times for next time
    if (b.slot === "custom") await db.query(`UPDATE rounds SET time_slots=$2 WHERE id=$1`,
      [id, JSON.stringify(R.addSlots(round, [{ start, end }]))]);
  });
  if (b.slot === "custom") keep.slot = `${start}-${end}`;
  const SL = require("../schedules").labels(await require("../schedules").forRound(id)).slot;
  back({ ok: `Scheduled ${added} ${(added === 1 ? SL.one : SL.many).toLowerCase()}` + (tried > added ? `. Skipped ${tried - added} already on the calendar.` : ".") });
}));

router.post("/:id/copy-day", wrap(async (req, res) => {
  const id = int(req.params.id);
  const from = str(req.body.copy_from);
  const targets = parseDates(req.body.dates).filter((d) => d !== from);
  if (!isDate(from) || !targets.length) return go(res, `/admin/rounds/${id}`, { err: "Pick a day to copy, then select the days to copy it to." });
  const round = await getRound(id);
  let added = 0;
  await tx(async (db) => {
    const src = (await db.query(
      `SELECT p.*, to_char(s.starts_at AT TIME ZONE '${TZ}', 'HH24:MI') AS start, to_char(s.ends_at AT TIME ZONE '${TZ}', 'HH24:MI') AS "end"
       FROM training_sessions s JOIN programs p ON p.id=s.program_id
       WHERE p.round_id=$1 AND s.canceled_at IS NULL AND (s.starts_at AT TIME ZONE '${TZ}')::date = $2::date`, [id, from])).rows;
    for (const date of targets) for (const x of src)
      added += await R.schedule(db, round, { ...x, block_minutes: null }, { date, start: x.start, end: x.end });
  });
  go(res, `/admin/rounds/${id}`, { ok: `Copied ${plural(added, "session")} to ${plural(targets.length, "day")}.`, d: targets[0] });
}));

router.post("/:id/sessions/:sid/delete", wrap(async (req, res) => {
  const id = int(req.params.id), sid = int(req.params.sid);
  const taken = (await query(`SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status<>'canceled'`, [sid])).rows[0].n;
  if (taken) return go(res, `/admin/sessions/${sid}`, { err: "This session has reservations. Cancel it instead so everyone who claimed it is emailed." });
  const date = (await query(`SELECT to_char(starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS d FROM training_sessions WHERE id=$1`, [sid])).rows[0]?.d;
  await query(`DELETE FROM training_sessions WHERE id=$1`, [sid]);
  go(res, `/admin/rounds/${id}`, { ok: "Removed from the calendar.", d: date || "" });
}));

// Unlock (or lock again) every session on the selected days
router.post("/:id/unlock-days", wrap(async (req, res) => {
  const id = int(req.params.id);
  const dates = parseDates(req.body.dates);
  const unlock = req.body.mode !== "lock";
  if (!dates.length) return go(res, `/admin/rounds/${id}`, { err: "Select days on the calendar first." });
  const { rowCount } = await query(
    `UPDATE training_sessions s SET unlocked_at = ${unlock ? "now()" : "NULL"} FROM programs p
     WHERE p.id=s.program_id AND p.round_id=$1 AND s.canceled_at IS NULL
       AND to_char(s.starts_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') = ANY($2)`, [id, dates]);
  go(res, `/admin/rounds/${id}`, { ok: unlock
    ? `Unlocked ${plural(rowCount, "session")}. Any athlete can take their open spots.`
    : `Locked ${plural(rowCount, "session")} again. Sessions inside the unlock period stay open.`, d: dates[0] });
}));

// Remove all of a split session's blocks on one day (only blocks nobody has reserved)
router.post("/:id/day-blocks/delete", wrap(async (req, res) => {
  const id = int(req.params.id), pid = int(req.body.program_id), date = str(req.body.date);
  if (!pid || !isDate(date)) return go(res, `/admin/rounds/${id}`, { err: "Nothing to remove." });
  const { rowCount } = await query(
    `DELETE FROM training_sessions s USING programs p WHERE p.id=s.program_id AND p.round_id=$1 AND s.program_id=$2
       AND (s.starts_at AT TIME ZONE '${TZ}')::date = $3::date
       AND NOT EXISTS (SELECT 1 FROM reservations x WHERE x.session_id=s.id AND x.status<>'canceled')`, [id, pid, date]);
  go(res, `/admin/rounds/${id}`, { ok: `Removed ${plural(rowCount, "block")}. Blocks with reservations stay; cancel them from their roster.`, d: date });
}));

router.post("/:id/publish", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(
    `UPDATE rounds SET published_at = CASE WHEN published_at IS NULL THEN now() ELSE NULL END WHERE id=$1 RETURNING published_at`, [id]);
  go(res, dest(req, `/admin/rounds/${id}`), { ok: rows[0]?.published_at ? "Published. People can now see and claim it." : "Hidden from people. Existing reservations are kept." });
}));

router.post("/:id/delete", wrap(async (req, res) => {
  const id = int(req.params.id);
  const n = (await query(
    `SELECT count(*)::int AS n FROM reservations x JOIN training_sessions s ON s.id=x.session_id
     JOIN programs p ON p.id=s.program_id WHERE p.round_id=$1 AND x.status<>'canceled'`, [id])).rows[0].n;
  if (n) return go(res, `/admin/rounds/${id}`, { err: "This round has reservations, so it can't be deleted. Hide it instead." });
  await query(`DELETE FROM rounds WHERE id=$1`, [id]);
  go(res, "/admin/rounds", { ok: "Round deleted." });
}));

module.exports = router;
