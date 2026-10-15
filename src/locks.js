// An archived Claim Board is read-only. These checks walk up from any object to its board.
const { query } = require("./db");

const BOARD_ARCHIVED = `JOIN rounds rd ON rd.id = p.round_id JOIN schedules sc ON sc.id = rd.schedule_id AND sc.archived_at IS NOT NULL`;
const has = async (sql, id) => (await query(sql, [id])).rowCount > 0;

module.exports = {
  LOCKED_MSG: "This Claim Board is archived, so it's read-only. Reopen it to make changes.",
  roundLocked: (id) => has(`SELECT 1 FROM rounds rd JOIN schedules sc ON sc.id=rd.schedule_id AND sc.archived_at IS NOT NULL WHERE rd.id=$1`, id),
  programLocked: (id) => has(`SELECT 1 FROM programs p ${BOARD_ARCHIVED} WHERE p.id=$1`, id),
  sessionLocked: (id) => has(`SELECT 1 FROM training_sessions s JOIN programs p ON p.id=s.program_id ${BOARD_ARCHIVED} WHERE s.id=$1`, id),
  reservationLocked: (id) => has(`SELECT 1 FROM reservations x JOIN training_sessions s ON s.id=x.session_id
    JOIN programs p ON p.id=s.program_id ${BOARD_ARCHIVED} WHERE x.id=$1`, id),
  seasonLocked: async () => false, // seasons are gone; kept so old links don't break
};
