// Attendance: which items are tracked, and who may take attendance
const { query } = require("./db");
const auth = require("./auth");

// Item setting wins, then its activity/area, then the board's default
const tracked = (row) => (row.s_attendance != null ? row.s_attendance : row.p_attendance != null ? row.p_attendance : !!row.board_track);

// SQL pieces for "is this session tracked?" (needs s = training_sessions, p = programs, sc = schedules)
const TRACKED_SQL = `COALESCE(s.attendance, p.attendance, sc.track_attendance, false)`;

// Boards a user can take attendance for: every board for admins, their own for coaches
async function boardsFor(user) {
  if (!user) return [];
  if (auth.isAdmin(user)) return (await query(`SELECT id FROM schedules WHERE archived_at IS NULL`)).rows.map((r) => r.id);
  return (await query(`SELECT c.schedule_id AS id FROM schedule_coaches c JOIN schedules sc ON sc.id=c.schedule_id
    WHERE c.email=$1 AND sc.archived_at IS NULL`, [user.email])).rows.map((r) => r.id);
}
async function isCoach(user) {
  return !!user && (await query(`SELECT 1 FROM schedule_coaches WHERE email=$1 LIMIT 1`, [user.email])).rowCount > 0;
}
async function canCheckIn(user, scheduleId) {
  return auth.isAdmin(user) || (await boardsFor(user)).includes(scheduleId);
}

module.exports = { tracked, TRACKED_SQL, boardsFor, isCoach, canCheckIn };
