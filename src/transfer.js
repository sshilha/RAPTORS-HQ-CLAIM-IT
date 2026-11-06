// Moving setup between copies of the app (e.g. staging → production): export a board or a level to a .claimit.json file,
// and import it. Never claims or check-ins. People travel by who they are (email; name + birth year; parents' emails),
// never by internal ids, which differ between copies. Imports always create new things (a draft board, a new level).
const { query, pool } = require("./db");
const E = require("./engine");
const FORMAT = "claimit-transfer", VERSION = 1;
const SKIP = new Set(["id", "created_at", "sort", "published_at", "archived_at", "share_code"]);

async function nodesOf(boardId, rootId = null) {
  const all = (await query(`SELECT * FROM board_nodes WHERE schedule_id=$1 ORDER BY sort, id`, [boardId])).rows;
  if (!rootId) return all;
  const keep = new Set([rootId]); let grew = true;
  while (grew) { grew = false; for (const n of all) if (n.parent_id && keep.has(n.parent_id) && !keep.has(n.id)) { keep.add(n.id); grew = true; } }
  return all.filter((n) => keep.has(n.id));
}
// who a person is, in a way another copy of the app can recognize
async function identity(athleteIds) {
  if (!athleteIds.length) return new Map();
  const rows = (await query(`SELECT a.id, a.kind, a.first_name, a.last_name, a.birth_year, a.team, a.email, (SELECT email FROM users WHERE id=a.self_user_id) AS self_email,
      ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS parents FROM athletes a WHERE a.id = ANY($1)`, [athleteIds])).rows;
  return new Map(rows.map((r) => [r.id, { kind: r.kind, first: r.first_name, last: r.last_name, birth_year: r.birth_year || null, team: r.team || null,
    email: (r.self_email || r.email || "").toLowerCase() || null, parents: (r.parents || []).map((e) => e.toLowerCase()) }]));
}
// ---------- export ----------
async function exportBoard(boardId, { people = true, coaches = true } = {}) {
  const b = (await query(`SELECT * FROM schedules WHERE id=$1`, [boardId])).rows[0]; if (!b) return null;
  const board = {}; for (const [k, v] of Object.entries(b)) if (!SKIP.has(k)) board[k] = v;
  return { format: FORMAT, version: VERSION, kind: "board", exported_at: new Date().toISOString(), from: process.env.ENV_LABEL || process.env.APP_URL || "",
    board, ...(await treeOf(b, null)), members: people ? await membersOf(boardId) : null,
    coaches: coaches ? (await query(`SELECT email FROM schedule_coaches WHERE schedule_id=$1 ORDER BY email`, [boardId])).rows.map((r) => r.email) : null };
}
async function exportLevel(nodeId) {
  const n = (await query(`SELECT * FROM board_nodes WHERE id=$1`, [nodeId])).rows[0]; if (!n) return null;
  const b = (await query(`SELECT * FROM schedules WHERE id=$1`, [n.schedule_id])).rows[0];
  return { format: FORMAT, version: VERSION, kind: "level", exported_at: new Date().toISOString(), from: process.env.ENV_LABEL || process.env.APP_URL || "",
    board_name: b.name, board_depth: b.depth, depth: await E.nodeDepth(nodeId), labels: b.labels || null,
    inside: n.parent_id ? (await query(`SELECT name FROM board_nodes WHERE id=$1`, [n.parent_id])).rows[0].name : null, ...(await treeOf(b, nodeId)) };
}
async function treeOf(b, rootId) {
  const nodes = await nodesOf(b.id, rootId), ids = nodes.map((n) => n.id);
  const items = (await query(`SELECT * FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL ${rootId ? "AND node_id = ANY($2)" : ""} ORDER BY sort, starts_at, id`, rootId ? [b.id, ids] : [b.id])).rows;
  return { nodes: nodes.map((n) => ({ ref: n.id, parent: rootId && n.id === rootId ? null : n.parent_id, name: n.name, sort: n.sort, color: n.color, settings: n.settings || {}, visible_from: n.visible_from })),
    items: items.map((i) => ({ node: i.node_id, title: i.title, starts_at: i.starts_at, ends_at: i.ends_at, capacity: i.capacity, location: i.location, settings: i.settings || {}, sort: i.sort })) };
}
async function membersOf(boardId) {
  const m = (await query(`SELECT athlete_id, group_name, tags FROM schedule_members WHERE schedule_id=$1`, [boardId])).rows;
  const who = await identity(m.map((x) => x.athlete_id));
  return m.map((x) => ({ ...who.get(x.athlete_id), group: x.group_name, tags: x.tags || [] })).filter((x) => x.first || x.email);
}
// ---------- reading a file ----------
function read(text) {
  let d; try { d = JSON.parse(text); } catch (e) { return { err: "That isn't an export file from Claim It (it couldn't be read)." }; }
  if (!d || d.format !== FORMAT) return { err: "That file isn't a Claim It export." };
  if (d.version > VERSION) return { err: "That file is from a newer version of Claim It. Update this copy first." };
  if (!Array.isArray(d.nodes) || !Array.isArray(d.items)) return { err: "That export file is incomplete." };
  return { data: d };
}
// find the same person here: own email, else name + birth year (a parent's email breaks ties)
async function findPerson(p) {
  if (!p) return null;
  if (p.email) { const r = (await query(`SELECT a.id FROM athletes a LEFT JOIN users u ON u.id=a.self_user_id WHERE a.archived_at IS NULL AND (lower(u.email)=$1 OR lower(a.email)=$1) ORDER BY (a.kind=$2) DESC LIMIT 1`, [p.email, p.kind || "athlete"])).rows[0]; if (r) return r.id; }
  if (!p.first) return null;
  const c = (await query(`SELECT a.id, a.birth_year, ARRAY(SELECT lower(u.email) FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS parents
    FROM athletes a WHERE a.archived_at IS NULL AND a.kind=$1 AND lower(a.first_name)=lower($2) AND lower(coalesce(a.last_name,''))=lower(coalesce($3,''))`, [p.kind || "athlete", p.first, p.last || ""])).rows;
  let pick = c.filter((x) => !p.birth_year || !x.birth_year || x.birth_year === p.birth_year);
  if (pick.length > 1 && p.parents && p.parents.length) { const share = pick.filter((x) => x.parents.some((e) => p.parents.includes(e))); if (share.length) pick = share; }
  return pick.length === 1 ? pick[0].id : null;
}
async function matchMembers(members) {
  const found = [], missing = [];
  for (const m of members || []) { const id = await findPerson(m); (id ? found : missing).push({ ...m, id }); }
  return { found, missing };
}
const nameOf = (p) => [p.first, p.last].filter(Boolean).join(" ") || p.email || "Someone";
// what an import would do (shown before anything is created)
async function preview(d, target = null) {
  const out = { kind: d.kind, from: d.from || "", exported_at: d.exported_at, name: d.kind === "board" ? d.board.name : (d.nodes.find((n) => !n.parent) || {}).name,
    levels: d.nodes.length, sessions: d.items.length, coaches: (d.coaches || []).length, people: null, problem: null };
  if (d.members) { const m = await matchMembers(d.members); out.people = { total: d.members.length, found: m.found.length, missing: m.missing.map(nameOf) }; }
  if (d.kind === "level" && target) {
    const tb = (await query(`SELECT depth FROM schedules WHERE id=$1`, [target.boardId])).rows[0];
    const at = target.parentId ? (await E.nodeDepth(target.parentId)) + 1 : 1;
    if (!tb || tb.depth !== d.board_depth) out.problem = `It came from a board with ${d.board_depth} levels of structure, and this board has ${tb ? tb.depth : "a different number"}. Import it into a board set up the same way.`;
    else if (at !== d.depth) {
      const where = at < d.depth ? `${d.depth - at === 1 ? "one level" : `${d.depth - at} levels`} further in: open the level it belongs inside and use Import a level there` : `${at - d.depth === 1 ? "one level" : `${at - d.depth} levels`} further out${d.depth === 1 ? ": at the top of the board (Board setup with nothing picked, then Import a level)" : ""}`;
      out.problem = d.inside ? `In ${d.board_name} it sat inside "${d.inside}", so import it inside a level like that one (${where}).` : d.inside === null ? `In ${d.board_name} it was at the top of the board, so import it from the board itself (Board setup with nothing picked, then Import a level).` : `It goes ${where}.`;
    }
  }
  return out;
}
// ---------- import ----------
// the board table's columns here, with their types (json columns get JSON text; text-list columns get a list)
async function cols() { return new Map((await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='schedules' AND table_schema=current_schema()`)).rows.map((r) => [r.column_name, r.data_type])); }
async function insertTree(db, boardId, d, rootParent) {
  const map = new Map(); let left = d.nodes.slice(), guard = 0;
  while (left.length && guard++ < 60) {
    for (const n of left.filter((x) => !x.parent || map.has(x.parent))) {
      const r = (await db.query(`INSERT INTO board_nodes (schedule_id, parent_id, name, sort, color, settings, visible_from) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [boardId, n.parent ? map.get(n.parent) : rootParent, n.name, n.sort || 0, n.color || null, JSON.stringify(n.settings || {}), n.visible_from || null])).rows[0];
      map.set(n.ref, r.id);
    }
    left = left.filter((x) => !map.has(x.ref));
  }
  let items = 0;
  for (const it of d.items) {
    await db.query(`INSERT INTO board_items (schedule_id, node_id, title, starts_at, ends_at, capacity, location, settings, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [boardId, it.node ? map.get(it.node) || null : rootParent, it.title == null ? "" : it.title, it.starts_at || null, it.ends_at || null, Math.max(1, Math.min(+it.capacity || 1, 500)), it.location || null, JSON.stringify(it.settings || {}), it.sort || 0]);
    items++;
  }
  return { levels: map.size, items };
}
async function importBoard(d, { name, people = true, coaches = true } = {}) {
  const have = await cols(), b = d.board || {}, keys = Object.keys(b).filter((k) => have.has(k) && !SKIP.has(k) && k !== "name");
  let title = String(name || b.name || "Imported board").slice(0, 80);
  if ((await query(`SELECT 1 FROM schedules WHERE lower(name)=lower($1) AND archived_at IS NULL`, [title])).rowCount) title = `${title} (imported)`;
  if (b.short_code && (await query(`SELECT 1 FROM schedules WHERE short_code=$1`, [b.short_code])).rowCount) b.short_code = null;
  const vals = keys.map((k) => (b[k] == null ? null : /json/.test(have.get(k)) ? JSON.stringify(b[k]) : b[k]));
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const sort = (await db.query(`SELECT coalesce(max(sort),0)+1 AS n FROM schedules`)).rows[0].n;
    const board = (await db.query(`INSERT INTO schedules (name, sort${keys.map((k) => `, "${k}"`).join("")}) VALUES ($1, $2${keys.map((_, i) => `, $${i + 3}`).join("")}) RETURNING id, name`, [title, sort, ...vals])).rows[0];
    const t = await insertTree(db, board.id, d, null);
    let added = 0, missing = [];
    if (people && d.members) {
      const m = await matchMembers(d.members); missing = m.missing.map(nameOf);
      for (const p of m.found) added += (await db.query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [board.id, p.id, p.group || null, p.tags || []])).rowCount;
    }
    let co = 0;
    if (coaches && d.coaches) for (const e of d.coaches) co += (await db.query(`INSERT INTO schedule_coaches (schedule_id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [board.id, String(e).toLowerCase()])).rowCount;
    await db.query("COMMIT");
    return { board, levels: t.levels, sessions: t.items, people: added, missing, coaches: co };
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}
async function importLevel(d, boardId, parentId) {
  const p = await preview(d, { boardId, parentId }); if (p.problem) return { err: p.problem };
  const db = await pool.connect();
  try { await db.query("BEGIN"); const t = await insertTree(db, boardId, d, parentId || null); await db.query("COMMIT"); return { name: p.name, levels: t.levels, sessions: t.items }; }
  catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}
// ---------- People → a spreadsheet the People import reads as is ----------
async function peopleCsv() {
  const rows = (await query(`SELECT a.*, (SELECT email FROM users WHERE id=a.self_user_id) AS self_email,
      ARRAY(SELECT pl.name FROM people_list_members m JOIN people_lists pl ON pl.id=m.list_id WHERE m.athlete_id=a.id ORDER BY pl.name) AS lists,
      ARRAY(SELECT json_build_object('first', p.first_name, 'last', p.last_name, 'email', u.email, 'phone', coalesce(p.phone, u.phone))::text FROM parent_athletes pa JOIN users u ON u.id=pa.user_id
        LEFT JOIN athletes p ON p.kind='adult' AND p.archived_at IS NULL AND (p.self_user_id=u.id OR lower(p.email)=lower(u.email)) WHERE pa.athlete_id=a.id ORDER BY u.email) AS parents
    FROM athletes a WHERE a.archived_at IS NULL ORDER BY a.kind DESC, lower(a.last_name), lower(a.first_name)`)).rows;
  const head = ["Kind", "First name", "Last name", "Email", "Phone", "Birth year", "Jersey", "Team", "List", "Roles", "Notes"];
  for (let n = 1; n <= 4; n++) head.push(`Parent ${n} first name`, `Parent ${n} last name`, `Parent ${n} email`, `Parent ${n} phone`);
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head.map(q).join(",")];
  for (const r of rows) {
    const ps = (r.parents || []).map((x) => JSON.parse(x)).slice(0, 4), cells = [r.kind === "adult" ? "Adult" : "Athlete", r.first_name, r.last_name, r.self_email || r.email || "", r.phone || "", r.birth_year || "", r.jersey || "", r.team || "",
      (r.lists || []).join("; "), (r.roles || []).join("; "), r.notes || ""];
    for (let n = 0; n < 4; n++) { const p = ps[n] || {}; cells.push(p.first || "", p.last || "", p.email || "", p.phone || ""); }
    lines.push(cells.map(q).join(","));
  }
  return lines.join("\n") + "\n";
}
module.exports = { exportBoard, exportLevel, read, preview, importBoard, importLevel, peopleCsv, FORMAT };
