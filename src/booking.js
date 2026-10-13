const { pool, query } = require("./db");

class BookingError extends Error {}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

const isParentOf = async (db, userId, athleteId) =>
  (await db.query(`SELECT 1 FROM parent_athletes WHERE user_id=$1 AND athlete_id=$2`, [userId, athleteId])).rowCount > 0;

const priorityActive = (p) => p.priority_ends_at && new Date(p.priority_ends_at) > new Date();
const bookingOpen = (p) => !p.booking_opens_at || new Date(p.booking_opens_at) <= new Date();
const cancelDeadline = (startsAt, hours) => new Date(new Date(startsAt).getTime() - hours * 3600 * 1000);

// Active (confirmed or waitlisted) reservations an athlete holds in a program
async function usage(db, athleteId, programId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM reservations r JOIN training_sessions s ON s.id=r.session_id
     WHERE r.athlete_id=$1 AND s.program_id=$2 AND r.status<>'canceled'`,
    [athleteId, programId]
  );
  return rows[0].n;
}

// Move waitlisted athletes into open spots, oldest first. Returns promoted reservation ids.
async function promoteWaitlist(db, sessionId) {
  const promoted = [];
  for (;;) {
    const { rows } = await db.query(
      `UPDATE reservations SET status='confirmed', promoted_at=now()
       WHERE id = (
         SELECT w.id FROM reservations w JOIN training_sessions s ON s.id=w.session_id
         WHERE w.session_id=$1 AND w.status='waitlisted' AND s.canceled_at IS NULL AND s.starts_at > now()
           AND (SELECT count(*) FROM reservations c WHERE c.session_id=$1 AND c.status='confirmed') < s.capacity
         ORDER BY w.created_at, w.id LIMIT 1
       ) RETURNING id`,
      [sessionId]
    );
    if (!rows[0]) return promoted;
    promoted.push(rows[0].id);
  }
}

async function reserve({ userId, athleteId, sessionId }) {
  return tx(async (db) => {
    if (!(await isParentOf(db, userId, athleteId))) throw new BookingError("That athlete isn't linked to your account.");

    // Lock the session row so two families can't take the last spot at once
    const { rows } = await db.query(
      `SELECT s.*, p.name AS program_name, p.age_groups, p.priority_limit, p.priority_ends_at,
              p.booking_opens_at,
              (p.archived OR (p.round_id IS NOT NULL AND r.published_at IS NULL) OR se.completed_at IS NOT NULL) AS archived
       FROM training_sessions s JOIN programs p ON p.id=s.program_id LEFT JOIN rounds r ON r.id=p.round_id
       LEFT JOIN seasons se ON se.id=r.season_id
       WHERE s.id=$1 FOR UPDATE OF s`,
      [sessionId]
    );
    const s = rows[0];
    if (!s || s.archived) throw new BookingError("That session isn't available.");
    if (s.canceled_at) throw new BookingError("That session was canceled.");
    if (new Date(s.starts_at) <= new Date()) throw new BookingError("That session has already started.");
    if (!bookingOpen(s)) throw new BookingError("Booking for this program hasn't opened yet.");

    const a = (await db.query(`SELECT * FROM athletes WHERE id=$1`, [athleteId])).rows[0];
    if (!a.age_group || !s.age_groups.includes(a.age_group))
      throw new BookingError(`${a.first_name} isn't eligible for ${s.program_name}.`);

    const dup = await db.query(
      `SELECT 1 FROM reservations WHERE session_id=$1 AND athlete_id=$2 AND status<>'canceled'`,
      [sessionId, athleteId]
    );
    if (dup.rowCount) throw new BookingError(`${a.first_name} already has a spot or waitlist place for this session.`);

    if (priorityActive(s) && (await usage(db, athleteId, s.program_id)) >= s.priority_limit)
      throw new BookingError(
        `${a.first_name} has used all ${s.priority_limit} priority reservations for ${s.program_name}. More sessions open up when priority booking ends.`
      );

    const confirmed = (await db.query(
      `SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status='confirmed'`, [sessionId]
    )).rows[0].n;
    const status = confirmed < s.capacity ? "confirmed" : "waitlisted";

    const r = (await db.query(
      `INSERT INTO reservations (session_id, athlete_id, booked_by, status) VALUES ($1,$2,$3,$4) RETURNING id`,
      [sessionId, athleteId, userId, status]
    )).rows[0];
    return { reservationId: r.id, status };
  });
}

// Parent cancel (admin=false) enforces the deadline; admin cancel does not.
async function cancelReservation({ userId, reservationId, admin = false }) {
  return tx(async (db) => {
    const { rows } = await db.query(
      `SELECT r.*, s.starts_at, s.id AS sid, p.cancel_hours, se.completed_at AS season_done
       FROM reservations r JOIN training_sessions s ON s.id=r.session_id JOIN programs p ON p.id=s.program_id
       LEFT JOIN rounds rd ON rd.id=p.round_id LEFT JOIN seasons se ON se.id=rd.season_id
       WHERE r.id=$1 FOR UPDATE OF r, s`,
      [reservationId]
    );
    const r = rows[0];
    if (!r || r.status === "canceled") throw new BookingError("That reservation was already canceled.");
    if (r.season_done) throw new BookingError("That season is completed, so its reservations can't be changed.");
    if (!admin && !(await isParentOf(db, userId, r.athlete_id))) throw new BookingError("That reservation isn't yours.");
    if (!admin && r.status === "confirmed" && new Date() > cancelDeadline(r.starts_at, r.cancel_hours))
      throw new BookingError(`Online cancellation closed ${r.cancel_hours} hours before the session. Contact your coach.`);

    await db.query(
      `UPDATE reservations SET status='canceled', canceled_at=now(), canceled_by=$2 WHERE id=$1`,
      [reservationId, userId]
    );
    const promoted = r.status === "confirmed" ? await promoteWaitlist(db, r.sid) : [];
    return { wasStatus: r.status, promoted };
  });
}

async function cancelSession(sessionId, userId) {
  return tx(async (db) => {
    const s = (await db.query(`SELECT * FROM training_sessions WHERE id=$1 FOR UPDATE`, [sessionId])).rows[0];
    if (!s || s.canceled_at) throw new BookingError("That session is already canceled.");
    await db.query(`UPDATE training_sessions SET canceled_at=now() WHERE id=$1`, [sessionId]);
    const { rows } = await db.query(
      `UPDATE reservations SET status='canceled', canceled_at=now(), canceled_by=$2
       WHERE session_id=$1 AND status<>'canceled' RETURNING id`,
      [sessionId, userId]
    );
    return rows.map((r) => r.id);
  });
}

async function updateSessionCapacity(sessionId, fields) {
  return tx(async (db) => {
    const confirmed = (await db.query(
      `SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status='confirmed'`, [sessionId]
    )).rows[0].n;
    if (fields.capacity < confirmed)
      throw new BookingError(`Capacity can't be lower than the ${confirmed} athletes already reserved.`);
    await fields.apply(db);
    return promoteWaitlist(db, sessionId);
  });
}

// ---------- read models for pages ----------

async function parentReservations(userId) {
  const { rows } = await query(
    `SELECT r.id, r.status, r.athlete_id, r.created_at, s.starts_at, s.ends_at, s.location, s.coach,
            p.name AS program_name, p.cancel_hours,
            (SELECT count(*)::int FROM reservations w WHERE w.session_id=r.session_id AND w.status='waitlisted'
               AND (w.created_at, w.id) <= (r.created_at, r.id)) AS wait_pos
     FROM reservations r
     JOIN training_sessions s ON s.id=r.session_id
     JOIN programs p ON p.id=s.program_id
     JOIN parent_athletes pa ON pa.athlete_id=r.athlete_id AND pa.user_id=$1
     LEFT JOIN rounds rd ON rd.id=p.round_id LEFT JOIN seasons se ON se.id=rd.season_id
     WHERE r.status<>'canceled' AND s.canceled_at IS NULL AND s.ends_at > now() AND se.completed_at IS NULL
     ORDER BY s.starts_at`,
    [userId]
  );
  return rows;
}

async function bookingOptions(athlete) {
  const programs = (await query(
    `SELECT p.* FROM programs p LEFT JOIN rounds r ON r.id=p.round_id LEFT JOIN seasons se ON se.id=r.season_id
     WHERE NOT p.archived AND $1 = ANY(p.age_groups) AND (p.round_id IS NULL OR r.published_at IS NOT NULL)
       AND se.completed_at IS NULL
     ORDER BY r.starts_on NULLS LAST, p.activity, p.name`,
    [athlete.age_group || ""]
  )).rows;
  if (!programs.length) return [];

  const sessions = (await query(
    `SELECT s.*,
       (SELECT count(*)::int FROM reservations c WHERE c.session_id=s.id AND c.status='confirmed') AS confirmed,
       (SELECT count(*)::int FROM reservations c WHERE c.session_id=s.id AND c.status='waitlisted') AS waitlisted,
       my.id AS my_id, my.status AS my_status,
       (SELECT count(*)::int FROM reservations w WHERE w.session_id=s.id AND w.status='waitlisted'
          AND (w.created_at, w.id) <= (my.created_at, my.id)) AS my_pos
     FROM training_sessions s
     LEFT JOIN reservations my ON my.session_id=s.id AND my.athlete_id=$2 AND my.status<>'canceled'
     WHERE s.program_id = ANY($1) AND s.canceled_at IS NULL AND s.starts_at > now()
     ORDER BY s.starts_at`,
    [programs.map((p) => p.id), athlete.id]
  )).rows;

  const used = Object.fromEntries((await query(
    `SELECT s.program_id, count(*)::int AS n FROM reservations r JOIN training_sessions s ON s.id=r.session_id
     WHERE r.athlete_id=$1 AND r.status<>'canceled' GROUP BY s.program_id`,
    [athlete.id]
  )).rows.map((r) => [r.program_id, r.n]));

  return programs
    .map((p) => ({ ...p, used: used[p.id] || 0, sessions: sessions.filter((s) => s.program_id === p.id) }))
    .filter((p) => p.sessions.length);
}

module.exports = {
  BookingError, reserve, cancelReservation, cancelSession, updateSessionCapacity, promoteWaitlist,
  parentReservations, bookingOptions, priorityActive, bookingOpen, cancelDeadline, isParentOf,
};
