// A completed season is read-only. These checks walk up from any object to its season.
const { query } = require("./db");

const SEASON_DONE = `JOIN rounds rd ON rd.id = p.round_id JOIN seasons se ON se.id = rd.season_id AND se.completed_at IS NOT NULL`;

const has = async (sql, id) => (await query(sql, [id])).rowCount > 0;

module.exports = {
  LOCKED_MSG: "This season is completed, so it's read-only. Reopen the season to make changes.",
  seasonLocked: (id) => has(`SELECT 1 FROM seasons WHERE id=$1 AND completed_at IS NOT NULL`, id),
  roundLocked: (id) => has(`SELECT 1 FROM rounds rd JOIN seasons se ON se.id=rd.season_id AND se.completed_at IS NOT NULL WHERE rd.id=$1`, id),
  programLocked: (id) => has(`SELECT 1 FROM programs p ${SEASON_DONE} WHERE p.id=$1`, id),
  sessionLocked: (id) => has(`SELECT 1 FROM training_sessions s JOIN programs p ON p.id=s.program_id ${SEASON_DONE} WHERE s.id=$1`, id),
  reservationLocked: (id) => has(`SELECT 1 FROM reservations x JOIN training_sessions s ON s.id=x.session_id
    JOIN programs p ON p.id=s.program_id ${SEASON_DONE} WHERE x.id=$1`, id),
};
