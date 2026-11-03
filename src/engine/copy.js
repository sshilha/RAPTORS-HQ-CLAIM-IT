// Copy a board on the container engine: its setup and level structure (with every level's settings),
// optionally its sessions (dates shifted to a new first day), the people on it, and its coaches. Never claims.
const { query } = require("../db");
const TZ = "America/Chicago";

// shift a timestamp by whole days, keeping the same local (Central) clock time across DST
async function shiftTs(ts, days) {
  if (!ts || !days) return ts || null;
  return (await query(`SELECT ((($1::timestamptz) AT TIME ZONE '${TZ}') + ($2 || ' days')::interval) AT TIME ZONE '${TZ}' AS t`, [ts, String(days)])).rows[0].t;
}
async function shiftSettings(s, days) {
  const out = { ...(s || {}) };
  if (out.opens_at && days) out.opens_at = new Date(await shiftTs(out.opens_at, days)).toISOString();
  return out;
}
// first session day (Central), for the "new first day" question
async function firstDay(boardId) {
  return (await query(`SELECT to_char(min(starts_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS d FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL`, [boardId])).rows[0].d;
}

async function copyEngineBoard(src, { name, items = false, members = false, coaches = false, startOn = null }) {
  const first = await firstDay(src.id);
  const days = items && startOn && first ? Math.round((Date.parse(startOn + "T12:00:00Z") - Date.parse(first + "T12:00:00Z")) / 864e5) : 0;
  // the board row: every column except identity, publishing, sharing, and archive state
  const skip = new Set(["id", "name", "published_at", "archived_at", "share_code", "created_at", "updated_at", "sort", "event_date", "event_end"]);
  const cols = (await query(`SELECT column_name FROM information_schema.columns WHERE table_name='schedules' AND table_schema = current_schema()`)).rows.map((r) => r.column_name).filter((c) => !skip.has(c));
  const sort = (await query(`SELECT coalesce(max(sort),0)+1 AS n FROM schedules`)).rows[0].n;
  const board = (await query(`INSERT INTO schedules (name, sort, event_date, event_end, ${cols.map((c) => `"${c}"`).join(", ")})
      SELECT $2, $3, ${days ? `event_date + ${days}` : "event_date"}, ${days ? `event_end + ${days}` : "event_end"}, ${cols.map((c) => `"${c}"`).join(", ")} FROM schedules WHERE id=$1 RETURNING *`,
    [src.id, name, sort])).rows[0];
  if (days && board.settings && board.settings.opens_at) await query(`UPDATE schedules SET settings=$2 WHERE id=$1`, [board.id, JSON.stringify(await shiftSettings(board.settings, days))]);
  // the level structure, parents before children
  const nodes = (await query(`SELECT * FROM board_nodes WHERE schedule_id=$1 ORDER BY id`, [src.id])).rows;
  const map = new Map(); let left = nodes.slice(), guard = 0;
  while (left.length && guard++ < 50) {
    for (const n of left.filter((x) => !x.parent_id || map.has(x.parent_id))) {
      const r = (await query(`INSERT INTO board_nodes (schedule_id, parent_id, name, sort, color, settings, visible_from) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [board.id, n.parent_id ? map.get(n.parent_id) : null, n.name, n.sort, n.color, JSON.stringify(await shiftSettings(n.settings, days)), await shiftTs(n.visible_from, days)])).rows[0];
      map.set(n.id, r.id);
    }
    left = left.filter((x) => !map.has(x.id));
  }
  let itemCount = 0;
  if (items) {
    const its = (await query(`SELECT * FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL ORDER BY id`, [src.id])).rows;
    for (const it of its) {
      await query(`INSERT INTO board_items (schedule_id, node_id, title, starts_at, ends_at, capacity, location, settings, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [board.id, it.node_id ? map.get(it.node_id) || null : null, it.title, await shiftTs(it.starts_at, days), await shiftTs(it.ends_at, days), it.capacity, it.location,
          JSON.stringify(await shiftSettings(it.settings, days)), it.sort]);
      itemCount++;
    }
  }
  let memberCount = 0, coachCount = 0;
  if (members) memberCount = (await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags)
      SELECT $2, athlete_id, group_name, tags FROM schedule_members WHERE schedule_id=$1 ON CONFLICT DO NOTHING`, [src.id, board.id])).rowCount;
  if (coaches) coachCount = (await query(`INSERT INTO schedule_coaches (schedule_id, email) SELECT $2, email FROM schedule_coaches WHERE schedule_id=$1 ON CONFLICT DO NOTHING`, [src.id, board.id])).rowCount;
  return { board, nodes: map.size, items: itemCount, members: memberCount, coaches: coachCount, days };
}
module.exports = { copyEngineBoard, firstDay };
