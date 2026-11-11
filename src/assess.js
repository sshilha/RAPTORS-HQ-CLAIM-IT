// Assessments: performance tests (e.g. Speed & Agility: six drills, three tries each). Results belong to the athlete,
// so they follow them season after season; each testing day can be linked to a program (board) to compare with attendance.
// assessments → assess_drills (name, unit, better lower|higher, attempts) · assess_days (date, kind, board, shared with families)
// · assess_results (one row per athlete × drill × attempt, every attempt kept; reports choose Best or Average).
const { query } = require("./db");
let ready = null;
function ensure() {
  return ready || (ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS assessments (id SERIAL PRIMARY KEY, name TEXT NOT NULL, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), archived_at TIMESTAMPTZ)`);
    await query(`CREATE TABLE IF NOT EXISTS assess_drills (id SERIAL PRIMARY KEY, assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE, name TEXT NOT NULL,
      unit TEXT, better TEXT NOT NULL DEFAULT 'lower', attempts INT NOT NULL DEFAULT 3, sort INT NOT NULL DEFAULT 0)`);
    await query(`CREATE TABLE IF NOT EXISTS assess_days (id SERIAL PRIMARY KEY, assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE, day DATE NOT NULL,
      kind TEXT NOT NULL DEFAULT 'Baseline', board_id INT, shared BOOLEAN NOT NULL DEFAULT false, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await query(`CREATE TABLE IF NOT EXISTS assess_results (day_id INT NOT NULL REFERENCES assess_days(id) ON DELETE CASCADE, athlete_id INT NOT NULL, drill_id INT NOT NULL REFERENCES assess_drills(id) ON DELETE CASCADE,
      attempt INT NOT NULL, value NUMERIC NOT NULL, by_user INT, at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (day_id, athlete_id, drill_id, attempt))`);
    await query(`CREATE INDEX IF NOT EXISTS assess_results_athlete ON assess_results (athlete_id)`);
    await query(`ALTER TABLE assess_drills ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ`);
    // each testing day keeps its own copy of the drills (frozen once it has scores, so later edits don't rewrite the past)
    await query(`CREATE TABLE IF NOT EXISTS assess_day_drills (day_id INT NOT NULL REFERENCES assess_days(id) ON DELETE CASCADE, drill_id INT NOT NULL, name TEXT NOT NULL, unit TEXT,
      better TEXT NOT NULL DEFAULT 'lower', attempts INT NOT NULL DEFAULT 3, sort INT NOT NULL DEFAULT 0, PRIMARY KEY (day_id, drill_id))`);
    await query(`CREATE TABLE IF NOT EXISTS assess_changes (id SERIAL PRIMARY KEY, assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE, at TIMESTAMPTZ NOT NULL DEFAULT now(), who TEXT, what TEXT NOT NULL)`);
    // results stay when a drill is removed (it's retired instead; only drills without scores are deleted)
    await query(`ALTER TABLE assess_results DROP CONSTRAINT IF EXISTS assess_results_drill_id_fkey`);
    // days from before this existed get their copy now
    await query(`INSERT INTO assess_day_drills (day_id, drill_id, name, unit, better, attempts, sort)
      SELECT d.id, x.id, x.name, x.unit, x.better, x.attempts, x.sort FROM assess_days d JOIN assess_drills x ON x.assessment_id=d.assessment_id AND x.retired_at IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM assess_day_drills y WHERE y.day_id=d.id) ON CONFLICT DO NOTHING`);
  })().catch((e) => { ready = null; throw e; }));
}
const KINDS = ["Baseline", "Midpoint", "Final", "Other"];
async function list({ retired = false } = {}) { await ensure(); return (await query(`SELECT a.*, (SELECT count(*)::int FROM assess_drills WHERE assessment_id=a.id AND retired_at IS NULL) AS drills, (SELECT count(*)::int FROM assess_days WHERE assessment_id=a.id) AS days
  FROM assessments a WHERE ${retired ? "a.archived_at IS NOT NULL" : "a.archived_at IS NULL"} ORDER BY lower(a.name)`)).rows; }
// the drills a testing day uses: its own copy (falls back to the live list)
async function dayDrills(dayId, assessmentId) {
  const own = (await query(`SELECT drill_id AS id, name, unit, better, attempts, sort FROM assess_day_drills WHERE day_id=$1 ORDER BY sort, drill_id`, [dayId])).rows;
  return own.length ? own : (await query(`SELECT * FROM assess_drills WHERE assessment_id=$1 AND retired_at IS NULL ORDER BY sort, id`, [assessmentId])).rows;
}
const hasScores = async (dayId) => (await query(`SELECT 1 FROM assess_results WHERE day_id=$1 LIMIT 1`, [dayId])).rowCount > 0;
// testing days without scores yet follow the assessment's current drills; days with scores keep theirs
async function syncDays(assessmentId) {
  for (const d of (await query(`SELECT id FROM assess_days WHERE assessment_id=$1`, [assessmentId])).rows) {
    if (await hasScores(d.id)) continue;
    await query(`DELETE FROM assess_day_drills WHERE day_id=$1`, [d.id]);
    await query(`INSERT INTO assess_day_drills (day_id, drill_id, name, unit, better, attempts, sort) SELECT $1, id, name, unit, better, attempts, sort FROM assess_drills WHERE assessment_id=$2 AND retired_at IS NULL`, [d.id, assessmentId]);
  }
}
async function logChange(assessmentId, who, what) { await query(`INSERT INTO assess_changes (assessment_id, who, what) VALUES ($1,$2,$3)`, [assessmentId, who, what]); }
async function get(id) {
  await ensure(); const a = (await query(`SELECT * FROM assessments WHERE id=$1`, [id])).rows[0]; if (!a) return null;
  a.drills = (await query(`SELECT x.*, (SELECT count(*)::int FROM assess_results r WHERE r.drill_id=x.id) AS scores, (SELECT coalesce(max(r.attempt),0) FROM assess_results r WHERE r.drill_id=x.id) AS max_try
    FROM assess_drills x WHERE x.assessment_id=$1 ORDER BY (x.retired_at IS NOT NULL), x.sort, x.id`, [id])).rows;
  a.changes = (await query(`SELECT * FROM assess_changes WHERE assessment_id=$1 ORDER BY at DESC, id DESC LIMIT 100`, [id])).rows;
  a.days = (await query(`SELECT d.*, sc.name AS board, (SELECT count(DISTINCT athlete_id)::int FROM assess_results WHERE day_id=d.id) AS tested, EXISTS (SELECT 1 FROM assess_results WHERE day_id=d.id) AS frozen
    FROM assess_days d LEFT JOIN schedules sc ON sc.id=d.board_id WHERE d.assessment_id=$1 ORDER BY d.day DESC, d.id DESC`, [id])).rows;
  return a;
}
async function day(id) {
  await ensure(); const d = (await query(`SELECT d.*, a.name AS assessment, sc.name AS board FROM assess_days d JOIN assessments a ON a.id=d.assessment_id LEFT JOIN schedules sc ON sc.id=d.board_id WHERE d.id=$1`, [id])).rows[0];
  if (!d) return null;
  d.drills = await dayDrills(d.id, d.assessment_id);
  return d;
}
// who's tested on a day: the linked board's athletes (or everyone, if none), plus anyone who already has results
async function roster(d) {
  const rows = d.board_id
    ? (await query(`SELECT a.id, a.first_name, a.last_name, m.group_name AS team FROM schedule_members m JOIN athletes a ON a.id=m.athlete_id WHERE m.schedule_id=$1 AND a.archived_at IS NULL AND a.kind='athlete'`, [d.board_id])).rows
    : (await query(`SELECT a.id, a.first_name, a.last_name, a.team FROM athletes a WHERE a.archived_at IS NULL AND a.kind='athlete'`)).rows;
  const extra = (await query(`SELECT DISTINCT a.id, a.first_name, a.last_name, a.team FROM assess_results r JOIN athletes a ON a.id=r.athlete_id WHERE r.day_id=$1`, [d.id])).rows;
  const seen = new Set(rows.map((r) => r.id)); for (const e of extra) if (!seen.has(e.id)) rows.push(e);
  return rows.sort((x, y) => `${x.last_name} ${x.first_name}`.localeCompare(`${y.last_name} ${y.first_name}`));
}
async function results(dayId) {
  return (await query(`SELECT athlete_id, drill_id, attempt, value FROM assess_results WHERE day_id=$1`, [dayId])).rows;
}
// one attempt (an empty value clears it)
async function save(dayId, athleteId, drillId, attempt, value, userId) {
  await ensure();
  if (value === "" || value == null) { await query(`DELETE FROM assess_results WHERE day_id=$1 AND athlete_id=$2 AND drill_id=$3 AND attempt=$4`, [dayId, athleteId, drillId, attempt]); return null; }
  const v = Number(String(value).replace(",", ".")); if (!Number.isFinite(v)) throw new Error("Enter a number.");
  await query(`INSERT INTO assess_results (day_id, athlete_id, drill_id, attempt, value, by_user) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (day_id, athlete_id, drill_id, attempt) DO UPDATE SET value=EXCLUDED.value, by_user=EXCLUDED.by_user, at=now()`, [dayId, athleteId, drillId, attempt, v, userId]);
  return v;
}
// combine attempts: best (direction-aware) or average
function score(values, drill, how = "best") {
  const v = values.filter((x) => x != null && Number.isFinite(Number(x))).map(Number); if (!v.length) return null;
  const s = how === "avg" ? v.reduce((a, b) => a + b, 0) / v.length : drill.better === "higher" ? Math.max(...v) : Math.min(...v);
  return Math.round(s * 1000) / 1000;
}
// change from a to b, positive = better, in units and %
function change(a, b, drill) {
  if (a == null || b == null) return { diff: null, pct: null };
  const raw = drill.better === "higher" ? b - a : a - b;
  return { diff: Math.round(raw * 1000) / 1000, pct: a ? Math.round((raw / Math.abs(a)) * 1000) / 10 : null };
}
// an athlete's history: every testing day they have results on, per assessment (for their profile, year over year)
async function history(athleteId, { sharedOnly = false } = {}) {
  await ensure();
  const days = (await query(`SELECT DISTINCT d.*, a.name AS assessment FROM assess_results r JOIN assess_days d ON d.id=r.day_id JOIN assessments a ON a.id=d.assessment_id
    WHERE r.athlete_id=$1 ${sharedOnly ? "AND d.shared" : ""} ORDER BY d.day`, [athleteId])).rows;
  const out = new Map();
  for (const d of days) {
    if (!out.has(d.assessment_id)) out.set(d.assessment_id, { id: d.assessment_id, name: d.assessment, drills: [], days: [] });
    const h = out.get(d.assessment_id), dd = await dayDrills(d.id, d.assessment_id);
    for (const x of dd) { const i = h.drills.findIndex((y) => y.id === x.id); if (i < 0) h.drills.push({ ...x }); else h.drills[i] = { ...h.drills[i], ...x }; }   // latest name wins
    const vals = (await query(`SELECT drill_id, attempt, value FROM assess_results WHERE day_id=$1 AND athlete_id=$2`, [d.id, athleteId])).rows;
    h.days.push({ ...d, vals, drills: dd });
  }
  return [...out.values()];
}
module.exports = { dayDrills, syncDays, logChange, hasScores, ensure, KINDS, list, get, day, roster, results, save, score, change, history };
