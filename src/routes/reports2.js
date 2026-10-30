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

router.get("/", wrap(async (req, res) => {
  const scope = await PP.reportScope(req.user);
  if (!scope) return go(res, "/dashboard", { err: "You don't have access to reports. Ask an admin if you need it." });
  req.user.can_reports = true;
  const boards = (await query(`SELECT id, name, archived_at, groups FROM schedules WHERE ${scope.all ? "TRUE" : "id = ANY($1)"} ORDER BY archived_at NULLS FIRST, name`, scope.all ? [] : [scope.boards])).rows;
  if (!boards.length) return go(res, "/dashboard", { err: "No boards to report on yet." });
  // open on the board asked for, or the one with the most recent claim
  const busiest = (await query(`SELECT i.schedule_id FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id = ANY($1) AND c.status<>'canceled'
    ORDER BY c.created_at DESC LIMIT 1`, [boards.map((b) => b.id)])).rows[0];
  const sid = boards.some((b) => b.id === int(req.query.s)) ? int(req.query.s) : busiest ? busiest.schedule_id : boards[0].id;
  const board = boards.find((b) => b.id === sid);
  const teamFilter = str(req.query.team);
  let rows = (await query(`SELECT c.id, c.status, c.counts, c.note, c.attended, c.walk_in, c.created_at, a.id AS athlete_id, a.first_name, a.last_name, a.kind,
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
