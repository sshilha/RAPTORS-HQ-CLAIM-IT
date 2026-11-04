// RSVP boards: athletes on the board answer Going / Can't make it for each event, with an optional note.
// Going is a normal confirmed claim (so My Claims, reminders, check-in and reports all just work);
// Can't make it is a canceled claim marked rsvp='no' (so it never counts as taking part anywhere).
const { query, pool } = require("./db");
const E = require("./engine");
let ready = false;
async function ensure() { if (ready) return; await query(`ALTER TABLE board_claims ADD COLUMN IF NOT EXISTS rsvp TEXT`); ready = true; }
const isRsvp = (board) => !!board && board.board_type === "rsvp";
const cleanNote = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;

async function answer({ itemId, athleteId, userId = null, going, note }) {
  await ensure();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`SELECT id FROM board_items WHERE id=$1 FOR UPDATE`, [itemId]);
    const chain = await E.chainFor(itemId, db);
    if (!chain || !isRsvp(chain.board)) throw new E.ClaimError("That isn't available.");
    if (chain.item.starts_at && new Date(chain.item.starts_at) <= new Date()) throw new E.ClaimError("That's already started, so answers are closed.");
    const member = (await db.query(`SELECT group_name, tags FROM schedule_members WHERE schedule_id=$1 AND athlete_id=$2`, [chain.board.id, athleteId])).rows[0] || null;
    const ok = E.check(chain, E.effective(chain), { athleteId, userId, member });
    if (!ok.ok) throw new E.ClaimError(ok.reason || "That isn't open to them.");
    const n = cleanNote(note);
    const active = (await db.query(`SELECT * FROM board_claims WHERE item_id=$1 AND athlete_id=$2 AND status<>'canceled' ORDER BY id DESC LIMIT 1`, [itemId, athleteId])).rows[0];
    const declined = (await db.query(`SELECT * FROM board_claims WHERE item_id=$1 AND athlete_id=$2 AND status='canceled' AND rsvp='no' ORDER BY id DESC LIMIT 1`, [itemId, athleteId])).rows[0];
    let row;
    if (going) {
      if (active) row = (await db.query(`UPDATE board_claims SET rsvp='yes', note=$2 WHERE id=$1 RETURNING *`, [active.id, n])).rows[0];
      else if (declined) row = (await db.query(`UPDATE board_claims SET status='confirmed', rsvp='yes', note=$2, canceled_at=NULL, booked_by=COALESCE($3, booked_by) WHERE id=$1 RETURNING *`, [declined.id, n, userId])).rows[0];
      else row = (await db.query(`INSERT INTO board_claims (item_id, athlete_id, booked_by, status, counts, note, rsvp) VALUES ($1,$2,$3,'confirmed',false,$4,'yes') RETURNING *`, [itemId, athleteId, userId, n])).rows[0];
    } else {
      if (active) row = (await db.query(`UPDATE board_claims SET status='canceled', rsvp='no', note=$2, canceled_at=now() WHERE id=$1 RETURNING *`, [active.id, n])).rows[0];
      else if (declined) row = (await db.query(`UPDATE board_claims SET note=$2 WHERE id=$1 RETURNING *`, [declined.id, n])).rows[0];
      else row = (await db.query(`INSERT INTO board_claims (item_id, athlete_id, booked_by, status, counts, note, rsvp, canceled_at) VALUES ($1,$2,$3,'canceled',false,$4,'no',now()) RETURNING *`, [itemId, athleteId, userId, n])).rows[0];
    }
    await db.query("COMMIT");
    return row;
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}

// one athlete's answers on a board: item id → { going, note }
async function answersFor(boardId, athleteId) {
  await ensure();
  const rows = (await query(`SELECT c.item_id, c.status, c.rsvp, c.note FROM board_claims c JOIN board_items i ON i.id=c.item_id
    WHERE i.schedule_id=$1 AND c.athlete_id=$2 AND (c.status='confirmed' OR (c.status='canceled' AND c.rsvp='no')) ORDER BY c.id`, [boardId, athleteId])).rows;
  const out = new Map(); for (const r of rows) out.set(r.item_id, { going: r.status === "confirmed", note: r.note });
  return out;
}
// per-event counts for a board: item id → { going, no }
async function countsFor(boardId) {
  await ensure();
  const rows = (await query(`SELECT c.item_id, count(*) FILTER (WHERE c.status='confirmed')::int AS going, count(*) FILTER (WHERE c.status='canceled' AND c.rsvp='no')::int AS no
    FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=$1 GROUP BY c.item_id`, [boardId])).rows;
  return new Map(rows.map((r) => [r.item_id, r]));
}
// who's going, who can't, and who hasn't answered (athletes on the board this event is open to)
async function summary(itemId) {
  await ensure();
  const chain = await E.chainFor(itemId); if (!chain) return null;
  const eff = E.effective(chain);
  const people = (await query(`SELECT a.id, a.first_name, a.last_name, a.team, m.group_name, m.tags FROM schedule_members m JOIN athletes a ON a.id=m.athlete_id
    WHERE m.schedule_id=$1 AND a.archived_at IS NULL ORDER BY lower(a.last_name), lower(a.first_name)`, [chain.board.id])).rows;
  const ans = (await query(`SELECT DISTINCT ON (athlete_id) athlete_id, status, rsvp, note, created_at FROM board_claims
    WHERE item_id=$1 AND (status='confirmed' OR (status='canceled' AND rsvp='no')) ORDER BY athlete_id, id DESC`, [itemId])).rows;
  const byId = new Map(ans.map((r) => [r.athlete_id, r]));
  const out = { going: [], no: [], none: [] };
  for (const p of people) {
    const a = byId.get(p.id);
    if (a) { (a.status === "confirmed" ? out.going : out.no).push({ ...p, note: a.note }); continue; }
    const ok = E.check(chain, eff, { athleteId: p.id, member: { group_name: p.group_name, tags: p.tags } });
    if (ok.ok || !ok.hidden) out.none.push(p);
  }
  // people who answered but aren't on the board's list anymore still show under their answer
  for (const a of ans) if (!people.some((p) => p.id === a.athlete_id)) {
    const p = (await query(`SELECT id, first_name, last_name, team FROM athletes WHERE id=$1`, [a.athlete_id])).rows[0];
    if (p) (a.status === "confirmed" ? out.going : out.no).push({ ...p, note: a.note });
  }
  return { chain, ...out };
}
// email the families of everyone who hasn't answered
async function remind(itemId) {
  const s = await summary(itemId); if (!s) return 0;
  const { slotName } = require("./time"), base = process.env.APP_URL || "";
  const b = s.chain.board, it = s.chain.item; let n = 0;
  for (const p of s.none) {
    const a = (await query(`SELECT a.*, (SELECT email FROM users WHERE id=a.self_user_id) AS self_email,
        ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS parent_emails FROM athletes a WHERE a.id=$1`, [p.id])).rows[0];
    const to = [...new Set([a.self_email, ...(a.family_emails === false ? [] : a.parent_emails || [])].filter(Boolean))];
    if (!to.length) continue;
    await require("./emailTemplates").send("rsvp_reminder", to, { person_first: a.first_name, person_name: `${a.first_name} ${a.last_name}`.trim(), board_name: b.name,
      session: slotName(it), location: it.location || b.event_location || "", organizers: [b.contact_name, b.contact_info].filter(Boolean).join(", "), answer_link: `${base}/b/${b.id}?p=${a.id}#i${it.id}` });
    n++;
  }
  return n;
}
module.exports = { isRsvp, answer, answersFor, countsFor, summary, remind, ensure };
