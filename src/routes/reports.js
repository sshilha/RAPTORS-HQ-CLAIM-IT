const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const { AGE_GROUPS, ACTIVITIES, TZ } = require("../config");
const { typeLabel } = require("../rounds");
const { isDate } = require("../time");
const v = require("../views/reports");
const { wrap, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const REPORTS = {
  sessions: "Session fill",
  summary: "Activity and group summary",
  athletes: "Athlete participation",
  reservations: "Reservation detail",
};

const BASE = `FROM training_sessions s JOIN programs p ON p.id=s.program_id
  LEFT JOIN rounds rd ON rd.id=p.round_id LEFT JOIN seasons se ON se.id=rd.season_id`;
const DAY = `to_char(s.starts_at AT TIME ZONE '${TZ}', 'Dy Mon FMDD, YYYY')`;
const TIME = `to_char(s.starts_at AT TIME ZONE '${TZ}', 'FMHH12:MI AM') || '–' || to_char(s.ends_at AT TIME ZONE '${TZ}', 'FMHH12:MI AM')`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function readFilters(q) {
  return {
    report: REPORTS[q.report] ? q.report : "sessions",
    season: int(q.season), round: int(q.round),
    from: isDate(str(q.from)) ? str(q.from) : "", to: isDate(str(q.to)) ? str(q.to) : "",
    activity: ACTIVITIES.includes(q.activity) ? q.activity : "",
    age: AGE_GROUPS.includes(q.age) ? q.age : "",
    status: ["confirmed", "waitlisted", "canceled"].includes(q.status) ? q.status : "",
    zero: q.zero === "1",
  };
}

// Builds a WHERE clause; ageScope says whether the age filter means "sessions open to" or "athletes in"
function where(f, ageScope, params = []) {
  const w = [];
  const add = (sql, val) => { params.push(val); w.push(sql.replace("?", `$${params.length}`)); };
  if (f.season) add("se.id = ?", f.season);
  if (f.round) add("rd.id = ?", f.round);
  if (f.from) add(`(s.starts_at AT TIME ZONE '${TZ}')::date >= ?::date`, f.from);
  if (f.to) add(`(s.starts_at AT TIME ZONE '${TZ}')::date <= ?::date`, f.to);
  if (f.activity) add("p.activity = ?", f.activity);
  if (f.age) add(ageScope === "athlete" ? "a.age_group = ?" : "? = ANY(p.age_groups)", f.age);
  return { sql: w.length ? `AND ${w.join(" AND ")}` : "", params };
}

async function sessionRows(f) {
  const { sql, params } = where(f, "session");
  return (await query(
    `SELECT s.id, ${DAY} AS day, ${TIME} AS time, rd.name AS round, p.activity, p.age_groups, s.coach, s.location, s.capacity,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS reserved,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='waitlisted') AS waitlisted,
       (SELECT count(*)::int FROM reservations x WHERE x.session_id=s.id AND x.status='canceled') AS canceled,
       ARRAY(SELECT x.athlete_id FROM reservations x WHERE x.session_id=s.id AND x.status='confirmed') AS athletes
     ${BASE} WHERE s.canceled_at IS NULL ${sql} ORDER BY s.starts_at, p.activity`, params)).rows;
}

const builders = {
  async sessions(f) {
    const rows = await sessionRows(f);
    return {
      columns: [
        { key: "day", label: "Date" }, { key: "time", label: "Time" }, { key: "round", label: "Round" },
        { key: "session", label: "Session" }, { key: "coach", label: "Coach" },
        { key: "capacity", label: "Spots", num: true }, { key: "reserved", label: "Reserved", num: true },
        { key: "waitlisted", label: "Waitlisted", num: true }, { key: "canceled", label: "Cancellations", num: true },
        { key: "fill", label: "Fill %", num: true, pct: true },
      ],
      rows: rows.map((r) => ({ ...r, session: typeLabel(r.activity, r.age_groups), fill: pct(r.reserved, r.capacity), link: `/admin/sessions/${r.id}` })),
      totals: (rs) => ({ capacity: sum(rs, "capacity"), reserved: sum(rs, "reserved"), waitlisted: sum(rs, "waitlisted"),
        canceled: sum(rs, "canceled"), fill: pct(sum(rs, "reserved"), sum(rs, "capacity")) }),
    };
  },

  async summary(f) {
    const rows = await sessionRows(f);
    const groups = new Map();
    for (const r of rows) {
      const k = typeLabel(r.activity, r.age_groups);
      const g = groups.get(k) || { session: k, order: [ACTIVITIES.indexOf(r.activity), AGE_GROUPS.indexOf(r.age_groups[0])],
        sessions: 0, capacity: 0, reserved: 0, waitlisted: 0, canceled: 0, ath: new Set() };
      g.sessions++; g.capacity += r.capacity; g.reserved += r.reserved; g.waitlisted += r.waitlisted; g.canceled += r.canceled;
      r.athletes.forEach((a) => g.ath.add(a));
      groups.set(k, g);
    }
    const all = new Set(rows.flatMap((r) => r.athletes));
    const out = [...groups.values()].sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1])
      .map((g) => ({ ...g, athletes: g.ath.size, fill: pct(g.reserved, g.capacity) }));
    return {
      columns: [
        { key: "session", label: "Session" }, { key: "sessions", label: "Times offered", num: true },
        { key: "capacity", label: "Total spots", num: true }, { key: "reserved", label: "Reserved", num: true },
        { key: "fill", label: "Fill %", num: true, pct: true }, { key: "athletes", label: "Different athletes", num: true },
        { key: "waitlisted", label: "Waitlisted", num: true }, { key: "canceled", label: "Cancellations", num: true },
      ],
      rows: out,
      totals: (rs) => ({ sessions: sum(rs, "sessions"), capacity: sum(rs, "capacity"), reserved: sum(rs, "reserved"),
        fill: pct(sum(rs, "reserved"), sum(rs, "capacity")), athletes: all.size, waitlisted: sum(rs, "waitlisted"), canceled: sum(rs, "canceled") }),
      note: "Different athletes in the totals row counts each athlete once.",
    };
  },

  async athletes(f) {
    const params = [];
    const actCols = ACTIVITIES.map((a) => { params.push(a); return `count(*) FILTER (WHERE x.status='confirmed' AND p.activity=$${params.length})::int AS "a_${a}"`; });
    const { sql } = where(f, "athlete", params);
    const rows = (await query(
      `SELECT a.id, a.first_name, a.last_name, a.age_group, a.team,
         ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id ORDER BY u.email) AS emails,
         count(*) FILTER (WHERE x.status='confirmed')::int AS reserved, ${actCols.join(", ")},
         count(*) FILTER (WHERE x.status='waitlisted')::int AS waitlisted,
         count(*) FILTER (WHERE x.status='canceled')::int AS canceled
       FROM reservations x JOIN athletes a ON a.id=x.athlete_id JOIN training_sessions s ON s.id=x.session_id
       JOIN programs p ON p.id=s.program_id LEFT JOIN rounds rd ON rd.id=p.round_id LEFT JOIN seasons se ON se.id=rd.season_id
       WHERE s.canceled_at IS NULL ${sql}
       GROUP BY a.id ORDER BY a.last_name, a.first_name`, params)).rows;
    if (f.zero) {
      const have = new Set(rows.map((r) => r.id));
      const extra = (await query(
        `SELECT a.id, a.first_name, a.last_name, a.age_group, a.team,
           ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id ORDER BY u.email) AS emails
         FROM athletes a ${f.age ? "WHERE a.age_group=$1" : ""} ORDER BY a.last_name, a.first_name`, f.age ? [f.age] : [])).rows
        .filter((a) => !have.has(a.id))
        .map((a) => ({ ...a, reserved: 0, waitlisted: 0, canceled: 0, ...Object.fromEntries(ACTIVITIES.map((x) => [`a_${x}`, 0])) }));
      rows.push(...extra);
      rows.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
    }
    return {
      columns: [
        { key: "athlete", label: "Athlete" }, { key: "age_group", label: "Age group" }, { key: "team", label: "Team" },
        { key: "parents", label: "Parent emails" }, { key: "reserved", label: "Sessions reserved", num: true },
        ...ACTIVITIES.map((a) => ({ key: `a_${a}`, label: a, num: true })),
        { key: "waitlisted", label: "Waitlisted", num: true }, { key: "canceled", label: "Canceled", num: true },
      ],
      rows: rows.map((r) => ({ ...r, athlete: `${r.last_name}, ${r.first_name}`, parents: r.emails.join(", "), link: `/admin/athletes/${r.id}` })),
      totals: (rs) => Object.fromEntries(["reserved", "waitlisted", "canceled", ...ACTIVITIES.map((a) => `a_${a}`)].map((k) => [k, sum(rs, k)])),
      note: "Counts are reservations, not attendance. Age group filters by the athlete's age group.",
    };
  },

  async reservations(f) {
    const params = [];
    const { sql } = where(f, "athlete", params);
    let statusSql = "";
    if (f.status) { params.push(f.status); statusSql = `AND x.status = $${params.length}`; }
    const rows = (await query(
      `SELECT x.id, x.status, ${DAY} AS day, ${TIME} AS time, rd.name AS round, p.activity, p.age_groups,
         a.first_name, a.last_name, a.age_group, s.id AS sid,
         ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id ORDER BY u.email) AS emails,
         bu.email AS booked_by,
         to_char(x.created_at AT TIME ZONE '${TZ}', 'Mon FMDD, YYYY FMHH12:MI AM') AS booked_at,
         to_char(x.canceled_at AT TIME ZONE '${TZ}', 'Mon FMDD, YYYY FMHH12:MI AM') AS canceled_at,
         x.promoted_at IS NOT NULL AS promoted
       FROM reservations x JOIN athletes a ON a.id=x.athlete_id JOIN training_sessions s ON s.id=x.session_id
       JOIN programs p ON p.id=s.program_id LEFT JOIN rounds rd ON rd.id=p.round_id LEFT JOIN seasons se ON se.id=rd.season_id
       LEFT JOIN users bu ON bu.id=x.booked_by
       WHERE s.canceled_at IS NULL ${sql} ${statusSql}
       ORDER BY s.starts_at, p.activity, x.created_at`, params)).rows;
    const label = { confirmed: "Reserved", waitlisted: "Waitlisted", canceled: "Canceled" };
    return {
      columns: [
        { key: "day", label: "Date" }, { key: "time", label: "Time" }, { key: "round", label: "Round" },
        { key: "session", label: "Session" }, { key: "athlete", label: "Athlete" }, { key: "age_group", label: "Age group" },
        { key: "statusText", label: "Status" }, { key: "parents", label: "Parent emails" },
        { key: "booked_by", label: "Booked by" }, { key: "booked_at", label: "Booked" }, { key: "canceled_at", label: "Canceled" },
      ],
      rows: rows.map((r) => ({ ...r, session: typeLabel(r.activity, r.age_groups), athlete: `${r.last_name}, ${r.first_name}`,
        parents: r.emails.join(", "), statusText: label[r.status] + (r.promoted && r.status !== "waitlisted" ? " (from waitlist)" : ""),
        link: `/admin/sessions/${r.sid}` })),
    };
  },
};

const sum = (rows, k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);

function toCsv(columns, rows, totals) {
  const cell = (x) => { const s = x == null ? "" : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  rows.forEach((r) => lines.push(columns.map((c) => cell(r[c.key])).join(",")));
  if (totals) lines.push(columns.map((c, i) => cell(i === 0 ? "Total" : totals[c.key] ?? "")).join(","));
  return "\uFEFF" + lines.join("\r\n"); // BOM so Excel reads the en dash correctly
}

router.get("/", wrap(async (req, res) => {
  const seasons = (await query(`SELECT id, name, completed_at FROM seasons ORDER BY starts_on DESC`)).rows;
  const rounds = (await query(`SELECT rd.id, rd.name, rd.season_id, se.name AS season_name FROM rounds rd
    LEFT JOIN seasons se ON se.id=rd.season_id ORDER BY rd.starts_on DESC`)).rows;
  const q = { ...req.query };
  if (!Object.keys(req.query).length && seasons[0]) q.season = String(seasons[0].id); // default: latest season
  if (q.round && !q.season) { const r = rounds.find((x) => x.id === int(q.round)); if (r?.season_id) q.season = String(r.season_id); }
  const f = readFilters(q);
  const out = await builders[f.report](f);
  const totals = out.totals ? out.totals(out.rows) : null;

  if (req.query.format === "csv") {
    const name = `raptors-${f.report}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` });
    return res.send(toCsv(out.columns, out.rows, totals));
  }
  res.send(v.reportsPage({ user: req.user, f, reports: REPORTS, seasons, rounds, out, totals }));
}));

module.exports = router;
