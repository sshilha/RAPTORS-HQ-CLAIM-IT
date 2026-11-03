// Day-before reminders (or whatever the board sets under Notifications): checked every 15 minutes, sent once per claim.
// Runs inside the app; a database lock keeps two copies of the app from sending the same reminder twice.
const { query, pool } = require("./db");
const EVERY = 15 * 60e3;
async function ensure() { await query(`ALTER TABLE board_claims ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ`); }
async function run() {
  const c = await pool.connect();
  try {
    const got = (await c.query(`SELECT pg_try_advisory_lock(724311) AS ok`)).rows[0].ok; if (!got) return 0;
    try {
      await ensure();
      // confirmed claims whose reminder time has come; skip anyone who claimed inside the window (they just signed up)
      const due = (await query(`SELECT c.id FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id
        WHERE c.status='confirmed' AND c.reminded_at IS NULL AND i.canceled_at IS NULL AND i.starts_at IS NOT NULL AND i.starts_at > now()
          AND sc.archived_at IS NULL AND sc.published_at IS NOT NULL
          AND coalesce((sc.settings->'notify'->>'reminder_hours')::int, 24) > 0
          AND now() >= i.starts_at - make_interval(hours => coalesce((sc.settings->'notify'->>'reminder_hours')::int, 24))
          AND c.created_at < i.starts_at - make_interval(hours => coalesce((sc.settings->'notify'->>'reminder_hours')::int, 24))
        ORDER BY i.starts_at LIMIT 500`)).rows;
      let n = 0;
      for (const r of due) {
        await query(`UPDATE board_claims SET reminded_at=now() WHERE id=$1 AND reminded_at IS NULL`, [r.id]);   // mark first, so a failure never repeats it
        try { await require("./engine/notify").reminder(r.id); n++; } catch (e) { console.error("reminder:", e.message); }
      }
      if (n) console.log(`[reminders] sent ${n}`);
      return n;
    } finally { await c.query(`SELECT pg_advisory_unlock(724311)`); }
  } catch (e) { console.error("reminders:", e.message); return 0; } finally { c.release(); }
}
function start() {
  if (process.env.NO_REMINDERS === "1") return;
  setTimeout(run, 60e3); setInterval(run, EVERY);
}
module.exports = { run, start };
