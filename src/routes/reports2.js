// Reports on the container engine: who claimed, attended, or volunteered. Admins see every board;
// others see only the boards (and teams) given to them under People -> Reports access.
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const PP = require("../people");
const { wrap, flashFrom, go, int, str } = require("./util");
const { slotName } = require("../time");

const router = express.Router();
router.use(auth.requireUser);

// ---------- the newer reports (Overview, Attendance, Sessions, RSVP, Families, Emails, Week sheet) ----------
const D = require("../reportsData");
const NEW = { overview: 1, attendance: 1, noshows: 1, unchecked: 1, fill: 1, busiest: 1, waitlists: 1, locations: 1, rsvp: 1, rsvpAthletes: 1, engagement: 1, notSignedUp: 1, volunteer: 1, emails: 1, week: 1 };
const RUN = { attendance: D.attendance, noshows: D.noshows, unchecked: D.unchecked, fill: D.fill, busiest: D.busiest, waitlists: D.waitlists, locations: D.locations,
  rsvp: D.rsvpEvents, rsvpAthletes: D.rsvpAthletes, engagement: D.engagement, notSignedUp: D.notSignedUp, emails: D.emailProblems };
const localDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const isDay = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
async function requiredHours() { try { const r = (await query(`SELECT value FROM app_kv WHERE key='volunteer_hours_required'`)).rows[0]; return r ? Number(r.value) || 0 : 0; } catch (e) { return 0; } }
router.post("/volunteer-required", auth.requireAdmin, wrap(async (req, res) => {
  const n = Math.max(0, Math.min(Number(req.body.hours) || 0, 500));
  await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await query(`INSERT INTO app_kv (key, value) VALUES ('volunteer_hours_required', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(n)]);
  go(res, `/reports?${new URLSearchParams({ ...req.query, r: "volunteer" })}`, { ok: n ? `Each family needs ${n} volunteer hours.` : "No volunteer-hour requirement." });
}));
async function newReport(req, res, scope, boards) {
  const r = NEW[req.query.r] ? req.query.r : "overview";
  const all = req.query.s === "all" || !req.query.s;
  const board = all ? null : boards.find((b) => b.id === int(req.query.s)) || null;
  const ids = board ? [board.id] : boards.filter((b) => !b.archived_at).map((b) => b.id);
  const today = localDay(Date.now()), back = (n) => localDay(Date.now() - n * 864e5), ahead = (n) => localDay(Date.now() + n * 864e5);
  const from = isDay(req.query.from) ? req.query.from : back(180), to = isDay(req.query.to) ? req.query.to : ahead(90);
  const team = str(req.query.team), required = await requiredHours();
  const f = { boards: ids, from, to, team, weekFrom: isDay(req.query.week) ? req.query.week : today };
  const teams = (await query(`SELECT DISTINCT group_name FROM schedule_members WHERE schedule_id = ANY($1) AND group_name IS NOT NULL ORDER BY 1`, [ids])).rows.map((x) => x.group_name);
  const data = r === "overview" ? await D.overview(f, required) : r === "volunteer" ? await D.volunteer(f, required) : r === "week" ? await D.weekSheet(f) : await RUN[r](f);
  if (req.query.csv && data.cols) {
    const q = (x) => `"${String(x == null ? "" : x instanceof Date ? x.toISOString() : x).replace(/"/g, '""')}"`;
    const lines = [data.cols.map((c) => q(c[1])).join(",")].concat(data.rows.map((row) => data.cols.map((c) => q(c[2] === "dt" || c[2] === "date" ? (row[c[0]] ? require("../time").fmtDateTime(row[c[0]]) : "") : row[c[0]])).join(",")));
    res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="${r}-${(board ? board.name : "all-boards").replace(/[^A-Za-z0-9 -]/g, "")}.csv"`);
    return res.send("\ufeff" + lines.join("\r\n"));
  }
  res.send(require("../views/reports2").reportPage({ user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), boards, board, r, data, from, to, team, teams, required, week: f.weekFrom }));
}

router.get("/", wrap(async (req, res) => {
  const scope = await PP.reportScope(req.user);
  if (!scope) return go(res, "/dashboard", { err: "You don't have access to reports. Ask an admin if you need it." });
  req.user.can_reports = true;
  const boards = (await query(`SELECT id, name, archived_at, groups FROM schedules WHERE ${scope.all ? "TRUE" : "id = ANY($1)"} ORDER BY archived_at NULLS FIRST, name`, scope.all ? [] : [scope.boards])).rows;
  if (!boards.length) return go(res, "/dashboard", { err: "No boards to report on yet." });
  if (!scope.teams.length && (NEW[req.query.r] || (!req.query.v && !req.query.csv))) return newReport(req, res, scope, boards);   // Overview by default
  if (req.query.s === "all") req.query.s = "";   // By person / All claims are for one board
  // open on the board asked for, or the one with the most recent claim
  const busiest = (await query(`SELECT i.schedule_id FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id = ANY($1) AND c.status<>'canceled'
    ORDER BY c.created_at DESC LIMIT 1`, [boards.map((b) => b.id)])).rows[0];
  const sid = boards.some((b) => b.id === int(req.query.s)) ? int(req.query.s) : busiest ? busiest.schedule_id : boards[0].id;
  const board = boards.find((b) => b.id === sid);
  const teamFilter = str(req.query.team);
  let rows = (await query(`SELECT c.id, c.status, c.counts, c.note, c.attended, c.walk_in, c.added_by_admin, c.override, c.created_at, a.id AS athlete_id, a.first_name, a.last_name, a.kind,
      m.group_name, i.title, i.starts_at, i.ends_at,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN athletes a ON a.id=c.athlete_id
    LEFT JOIN schedule_members m ON m.schedule_id=i.schedule_id AND m.athlete_id=a.id
    WHERE i.schedule_id=$1 AND c.status<>'canceled' ORDER BY i.starts_at NULLS LAST, a.last_name, a.first_name`, [sid])).rows;
  // teams this person may see (empty = all), then the optional on-page team filter
  if (scope.teams.length) rows = rows.filter((r) => scope.teams.includes(r.group_name));
  const teams = [...new Set(rows.map((r) => r.group_name).filter(Boolean))].sort();
  if (teamFilter) rows = rows.filter((r) => r.group_name === teamFilter);
  if (req.query.csv) {
    const q = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
    const lines = [["Name", "Team", "Where", "When", "Status", "Attended", "Answer"].map(q).join(",")]
      .concat(rows.map((r) => [`${r.first_name} ${r.last_name}`, r.group_name || "", r.path || "", slotName(r), r.status, r.attended == null ? "" : r.attended ? "yes" : "no", r.note || ""].map(q).join(",")));
    res.set("Content-Type", "text/csv").set("Content-Disposition", `attachment; filename="${board.name.replace(/[^A-Za-z0-9 -]/g, "")} report.csv"`);
    return res.send(lines.join("\r\n"));
  }
  const people = [...rows.reduce((m, r) => { const k = r.athlete_id; const p = m.get(k) || { name: `${r.first_name} ${r.last_name}`, team: r.group_name, claimed: 0, waitlisted: 0, attended: 0, missed: 0, last: null };
    if (r.status === "confirmed") p.claimed++; else p.waitlisted++; if (r.attended === true) p.attended++; if (r.attended === false) p.missed++;
    if (r.starts_at && (!p.last || r.starts_at > p.last)) p.last = r.starts_at; return m.set(k, p); }, new Map()).values()].sort((a, b) => a.name.localeCompare(b.name));
  res.send(require("../views/reports2").reportsPage({ user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), boards, board, rows, people, teams, teamFilter,
    view: req.query.v === "all" ? "all" : "person", limitedTo: scope.teams }));
}));

module.exports = router;
