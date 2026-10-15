const { pool, query } = require("./db");
const R = require("./rounds");
const { fmtDateTime } = require("./time");

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

// Active reservations an athlete holds for one activity across a round
async function activityUsage(db, athleteId, roundId, activity) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM reservations r JOIN training_sessions s ON s.id=r.session_id
     JOIN programs p ON p.id=s.program_id
     WHERE r.athlete_id=$1 AND p.round_id=$2 AND p.activity=$3 AND r.status<>'canceled' AND r.counts_toward_limit`,
    [athleteId, roundId, activity]);
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
         WHERE w.session_id=$1 AND w.status='waitlisted' AND s.canceled_at IS NULL AND (s.starts_at IS NULL OR s.starts_at > now())
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
      `SELECT s.*, p.name AS program_name, p.age_groups, p.priority_limit, p.priority_ends_at, p.activity, p.round_id, p.required_tags,
              r.name AS round_name, r.activity_limits, r.priority_limit AS round_limit, r.unlock_hours,
              p.waitlist AS program_waitlist, r.waitlist AS round_waitlist, r.signup_mode, r.schedule_id,
              p.booking_opens_at,
              (p.archived OR (p.round_id IS NOT NULL AND r.published_at IS NULL) OR se.completed_at IS NOT NULL
               OR EXISTS (SELECT 1 FROM schedules x WHERE x.id=r.schedule_id AND x.archived_at IS NOT NULL)) AS archived
       FROM training_sessions s JOIN programs p ON p.id=s.program_id LEFT JOIN rounds r ON r.id=p.round_id
       LEFT JOIN seasons se ON se.id=r.season_id
       WHERE s.id=$1 FOR UPDATE OF s`,
      [sessionId]
    );
    const s = rows[0];
    if (!s || s.archived) throw new BookingError("That session isn't available.");
    if (s.canceled_at) throw new BookingError("That session was canceled.");
    if (s.starts_at && new Date(s.starts_at) <= new Date()) throw new BookingError("That one has already started.");
    if (!bookingOpen(s)) throw new BookingError("Booking for this program hasn't opened yet.");

    const a = (await db.query(`SELECT * FROM athletes WHERE id=$1`, [athleteId])).rows[0];
    // Roster sheets: only this schedule's members, in one of the session's groups.
    // Family and public sheets are open to anyone.
    const openSheet = s.signup_mode === "family" || s.signup_mode === "public";
    if (!openSheet) {
      const m = s.schedule_id ? (await db.query(`SELECT group_name FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [s.schedule_id, athleteId])).rows[0] : null;
      const group = m ? m.group_name : a.age_group;
      if (!m && s.schedule_id) throw new BookingError(`${a.first_name} isn't on this schedule's roster.`);
      if (s.age_groups.length && !s.age_groups.includes(group)) throw new BookingError(`${a.first_name} isn't eligible for ${s.program_name}.`);
    }
    // Tag rules ("Catcher only") apply on every kind of sheet
    if ((s.required_tags || []).length) {
      const m = (await db.query(`SELECT tags FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [s.schedule_id, athleteId])).rows[0];
      if (!m || !m.tags.some((t) => s.required_tags.includes(t)))
        throw new BookingError(`${a.first_name} can't claim this one. It's only for: ${s.required_tags.join(" or ")}.`);
    }

    const dup = await db.query(
      `SELECT 1 FROM reservations WHERE session_id=$1 AND athlete_id=$2 AND status<>'canceled'`,
      [sessionId, athleteId]
    );
    if (dup.rowCount) throw new BookingError(`${a.first_name} is already signed up for this time.`);

    let counts = true;
    if (s.round_id) {
      // Round programs: per-activity limit across the round (null = unlimited), unless the session is unlocked
      const round = { activity_limits: s.activity_limits, priority_limit: s.round_limit, unlock_hours: s.unlock_hours, schedule_id: s.schedule_id };
      const limit = R.limitFor(round, s.activity);
      const unlocked = R.isUnlocked(s, round);
      // Only an extra spot taken from an unlocked session is exempt from the limit
      counts = !(limit != null && unlocked);
      if (limit != null && !unlocked && (await activityUsage(db, athleteId, s.round_id, s.activity)) >= limit) {
        const at = R.unlocksAt(s, round);
        throw new BookingError(
          (limit === 1 ? `${a.first_name} already has the 1 ${s.activity} reservation allowed in ${s.round_name}.`
            : `${a.first_name} has used all ${limit} ${s.activity} reservations for ${s.round_name}.`) +
          (at ? ` If spots are still open, this session opens to everyone ${fmtDateTime(at)}.` : ""));
      }
    } else if (priorityActive(s) && (await usage(db, athleteId, s.program_id)) >= s.priority_limit) {
      throw new BookingError(
        `${a.first_name} has used all ${s.priority_limit} priority reservations for ${s.program_name}. More sessions open up when priority booking ends.`
      );
    }

    const confirmed = (await db.query(
      `SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status='confirmed'`, [sessionId]
    )).rows[0].n;
    const status = confirmed < s.capacity ? "confirmed" : "waitlisted";
    if (status === "waitlisted" && !R.waitlistOn({ waitlist: s.program_waitlist }, { waitlist: s.round_waitlist }))
      throw new BookingError("Sorry, that time just filled up.");

    const r = (await db.query(
      `INSERT INTO reservations (session_id, athlete_id, booked_by, status, counts_toward_limit) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [sessionId, athleteId, userId, status, counts]
    )).rows[0];
    return { reservationId: r.id, status };
  });
}

// ---------- admin adjustments (skip limits and group rules) ----------

// Put an athlete into a session. Full sessions waitlist them, unless overCapacity adds a spot.
async function placeAthlete(db, { adminId, athleteId, sessionId, overCapacity }) {
  const s = (await db.query(
    `SELECT s.*, p.activity, p.round_id, r.activity_limits, r.priority_limit AS round_limit, r.unlock_hours, r.schedule_id AS round_schedule,
       p.waitlist AS program_waitlist, r.waitlist AS round_waitlist
     FROM training_sessions s JOIN programs p ON p.id=s.program_id LEFT JOIN rounds r ON r.id=p.round_id
     WHERE s.id=$1 FOR UPDATE OF s`, [sessionId])).rows[0];
  if (!s || s.canceled_at) throw new BookingError("That session isn't available.");
  const dup = await db.query(`SELECT 1 FROM reservations WHERE session_id=$1 AND athlete_id=$2 AND status<>'canceled'`, [sessionId, athleteId]);
  if (dup.rowCount) throw new BookingError("That athlete is already in this session (or its waitlist).");
  const confirmed = (await db.query(`SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status='confirmed'`, [sessionId])).rows[0].n;
  let status = "confirmed";
  if (confirmed >= s.capacity) {
    if (overCapacity) await db.query(`UPDATE training_sessions SET capacity=$2 WHERE id=$1`, [sessionId, confirmed + 1]);
    else if (R.waitlistOn({ waitlist: s.program_waitlist }, { waitlist: s.round_waitlist })) status = "waitlisted";
    else throw new BookingError('That session is full. Check "Add anyway" to add a spot.');
  }
  let counts = true;
  if (s.round_id) {
    const round = { activity_limits: s.activity_limits, priority_limit: s.round_limit, unlock_hours: s.unlock_hours, schedule_id: s.round_schedule };
    counts = !(R.limitFor(round, s.activity) != null && R.isUnlocked(s, round));
  }
  const r = (await db.query(
    `INSERT INTO reservations (session_id, athlete_id, booked_by, status, counts_toward_limit) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [sessionId, athleteId, adminId, status, counts])).rows[0];
  return { reservationId: r.id, status, grew: confirmed >= s.capacity && overCapacity };
}

const adminAdd = (opts) => tx((db) => placeAthlete(db, opts));

// Move someone off the waitlist now; if the session is full, add a spot for them
async function adminPromote({ reservationId }) {
  return tx(async (db) => {
    const r = (await db.query(`SELECT * FROM reservations WHERE id=$1 FOR UPDATE`, [reservationId])).rows[0];
    if (!r || r.status !== "waitlisted") throw new BookingError("That athlete isn't on the waitlist.");
    const s = (await db.query(`SELECT * FROM training_sessions WHERE id=$1 FOR UPDATE`, [r.session_id])).rows[0];
    const confirmed = (await db.query(`SELECT count(*)::int AS n FROM reservations WHERE session_id=$1 AND status='confirmed'`, [s.id])).rows[0].n;
    if (confirmed >= s.capacity) await db.query(`UPDATE training_sessions SET capacity=$2 WHERE id=$1`, [s.id, confirmed + 1]);
    await db.query(`UPDATE reservations SET status='confirmed', promoted_at=now() WHERE id=$1`, [reservationId]);
    return { grew: confirmed >= s.capacity };
  });
}

// Move an athlete to another session: their old spot opens (waitlist moves up), they're placed in the new one
async function adminMove({ adminId, reservationId, toSessionId, overCapacity }) {
  return tx(async (db) => {
    const r = (await db.query(`SELECT * FROM reservations WHERE id=$1 FOR UPDATE`, [reservationId])).rows[0];
    if (!r || r.status === "canceled") throw new BookingError("That reservation no longer exists.");
    if (r.session_id === toSessionId) throw new BookingError("Pick a different session to move to.");
    await db.query(`UPDATE reservations SET status='canceled', canceled_at=now(), canceled_by=$2 WHERE id=$1`, [reservationId, adminId]);
    const promoted = r.status === "confirmed" ? await promoteWaitlist(db, r.session_id) : [];
    const placed = await placeAthlete(db, { adminId, athleteId: r.athlete_id, sessionId: toSessionId, overCapacity });
    return { ...placed, promoted };
  });
}

// Parent cancel (admin=false) enforces the deadline; admin cancel does not.
async function cancelReservation({ userId, reservationId, admin = false }) {
  return tx(async (db) => {
    const { rows } = await db.query(
      `SELECT r.*, s.starts_at, s.id AS sid, p.cancel_hours,
         (se.completed_at IS NOT NULL OR EXISTS (SELECT 1 FROM schedules x WHERE x.id=rd.schedule_id AND x.archived_at IS NOT NULL)) AS season_done
       FROM reservations r JOIN training_sessions s ON s.id=r.session_id JOIN programs p ON p.id=s.program_id
       LEFT JOIN rounds rd ON rd.id=p.round_id LEFT JOIN seasons se ON se.id=rd.season_id
       WHERE r.id=$1 FOR UPDATE OF r, s`,
      [reservationId]
    );
    const r = rows[0];
    if (!r || r.status === "canceled") throw new BookingError("That reservation was already canceled.");
    if (r.season_done) throw new BookingError("That Claim Board is archived, so its spots can't be changed.");
    if (!admin && !(await isParentOf(db, userId, r.athlete_id))) throw new BookingError("That reservation isn't yours.");
    if (!admin && r.status === "confirmed" && r.starts_at && new Date() > cancelDeadline(r.starts_at, r.cancel_hours))
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
    `SELECT r.id, r.status, r.athlete_id, r.created_at, s.starts_at, s.ends_at, s.location, s.coach, s.title,
            p.name AS program_name, p.cancel_hours,
            (SELECT count(*)::int FROM reservations w WHERE w.session_id=r.session_id AND w.status='waitlisted'
               AND (w.created_at, w.id) <= (r.created_at, r.id)) AS wait_pos
     FROM reservations r
     JOIN training_sessions s ON s.id=r.session_id
     JOIN programs p ON p.id=s.program_id
     JOIN parent_athletes pa ON pa.athlete_id=r.athlete_id AND pa.user_id=$1
     LEFT JOIN rounds rd ON rd.id=p.round_id LEFT JOIN seasons se ON se.id=rd.season_id
     WHERE r.status<>'canceled' AND s.canceled_at IS NULL AND (s.ends_at IS NULL OR s.ends_at > now()) AND se.completed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM schedules x WHERE x.id=rd.schedule_id AND x.archived_at IS NOT NULL)
     ORDER BY s.starts_at NULLS LAST, s.title`,
    [userId]
  );
  return rows;
}

async function bookingOptions(athlete) {
  const programs = (await query(
    `SELECT p.*, r.name AS round_name, r.activity_limits, r.priority_limit AS round_limit, r.unlock_hours, r.waitlist AS round_waitlist,
       r.signup_mode, r.schedule_id, sc.labels AS schedule_labels, sc.name AS schedule_name, sc.family_names
     FROM programs p LEFT JOIN rounds r ON r.id=p.round_id LEFT JOIN seasons se ON se.id=r.season_id
     LEFT JOIN schedules sc ON sc.id=r.schedule_id
     LEFT JOIN schedule_members m ON m.schedule_id=r.schedule_id AND m.athlete_id=$3
     WHERE NOT p.archived AND (p.round_id IS NULL OR r.published_at IS NOT NULL) AND se.completed_at IS NULL AND sc.archived_at IS NULL
       AND (r.signup_mode IN ('family','public')
         OR (r.id IS NOT NULL AND m.athlete_id IS NOT NULL AND (cardinality(p.age_groups) = 0 OR m.group_name = ANY(p.age_groups)))
         OR (r.id IS NULL AND $1 = ANY(p.age_groups) AND NOT $2::boolean))
       AND (cardinality(p.required_tags) = 0 OR (m.tags IS NOT NULL AND m.tags && p.required_tags))
     ORDER BY r.starts_on NULLS LAST, p.activity, p.name`,
    [athlete.age_group || "", !!athlete.self_user_id, athlete.id]
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
     WHERE s.program_id = ANY($1) AND s.canceled_at IS NULL AND (s.starts_at IS NULL OR s.starts_at > now())
     ORDER BY s.starts_at NULLS LAST, s.title, s.id`,
    [programs.map((p) => p.id), athlete.id]
  )).rows;

  const used = Object.fromEntries((await query(
    `SELECT s.program_id, count(*)::int AS n FROM reservations r JOIN training_sessions s ON s.id=r.session_id
     WHERE r.athlete_id=$1 AND r.status<>'canceled' GROUP BY s.program_id`,
    [athlete.id]
  )).rows.map((r) => [r.program_id, r.n]));

  // Per-activity usage within each round
  const usedAct = {};
  (await query(
    `SELECT p.round_id, p.activity, count(*)::int AS n FROM reservations r JOIN training_sessions s ON s.id=r.session_id
     JOIN programs p ON p.id=s.program_id WHERE r.athlete_id=$1 AND r.status<>'canceled' AND p.round_id IS NOT NULL
       AND r.counts_toward_limit
     GROUP BY p.round_id, p.activity`, [athlete.id])).rows.forEach((r) => (usedAct[`${r.round_id}|${r.activity}`] = r.n));

  return programs
    .map((p) => {
      let limit, limitsOn, usedN;
      let progSessions = sessions.filter((s) => s.program_id === p.id);
      if (p.round_id) {
        const round = { activity_limits: p.activity_limits, priority_limit: p.round_limit, unlock_hours: p.unlock_hours, schedule_id: p.schedule_id };
        limit = R.limitFor(round, p.activity); limitsOn = limit != null; usedN = usedAct[`${p.round_id}|${p.activity}`] || 0;
        progSessions = progSessions.map((s) => ({ ...s, unlocked: limit != null && R.isUnlocked(s, round), unlocksAt: R.unlocksAt(s, round) }));
      } else {
        limit = p.priority_ends_at ? p.priority_limit : null; limitsOn = priorityActive(p); usedN = used[p.id] || 0;
      }
      return { ...p, limit, limitsOn, used: usedN, limitsEnd: p.round_id ? null : p.priority_ends_at, sessions: progSessions,
        waitlistOn: R.waitlistOn(p, { waitlist: p.round_waitlist }) };
    })
    .filter((p) => p.sessions.length);
}

module.exports = {
  BookingError, reserve, cancelReservation, adminAdd, adminPromote, adminMove, cancelSession, updateSessionCapacity, promoteWaitlist,
  parentReservations, bookingOptions, priorityActive, bookingOpen, cancelDeadline, isParentOf,
};
