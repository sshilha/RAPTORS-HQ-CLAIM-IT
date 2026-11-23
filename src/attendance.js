// Attendance: which items are tracked, and who may take attendance
const { query } = require("./db");
const auth = require("./auth");

// Item setting wins, then its activity/area, then the board's default
const tracked = (row) => (row.s_attendance != null ? row.s_attendance : row.p_attendance != null ? row.p_attendance : !!row.board_track);

// SQL pieces for "is this session tracked?" (needs s = training_sessions, p = programs, sc = schedules)
// Check-in: boards where their roles allow "Open Check-in" (App Settings → Roles)
async function boardsFor(user) {   // boards where they may open either Check-in tab
  if (!user) return [];
  const acc = await require("./roles").forUser(user), a = acc.boards("checkin.attendance"), s = acc.boards("checkin.signups");
  const b = { all: a.all || s.all, map: new Map([...a.map, ...s.map]) };
  if (b.all) return (await query(`SELECT id FROM schedules WHERE archived_at IS NULL`)).rows.map((r) => r.id);
  return b.map.size ? (await query(`SELECT id FROM schedules WHERE id = ANY($1) AND archived_at IS NULL`, [[...b.map.keys()]])).rows.map((r) => r.id) : [];
}
async function isCoach(user) {   // "may open Check-in somewhere" (the menu's Check-in link)
  if (!user) return false; const acc = await require("./roles").forUser(user), a = acc.boards("checkin.attendance"), s = acc.boards("checkin.signups"); return a.all || s.all || a.map.size > 0 || s.map.size > 0;
}
module.exports = { tracked, boardsFor, isCoach };
