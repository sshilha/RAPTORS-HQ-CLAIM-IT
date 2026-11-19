// The data behind Reports. Each report returns { cols: [[key, label, kind]], rows: [...], note? } so the page and the
// CSV download share one shape. kind: "num" | "pct" | "date" | "dt" | undefined (text). Every report is limited to
// the boards in scope (ids), the date range (local dates, inclusive), and, when given, a team.
const { query } = require("./db");
const { slotName } = require("./time");
const TZ = "America/Chicago";
const span = (a, b) => [`(${a}::date)::timestamp AT TIME ZONE '${TZ}'`, `((${b}::date) + 1)::timestamp AT TIME ZONE '${TZ}'`];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
// team limits (team managers): for boards with a limit, only athletes on those teams count. $n is the {board: [teams]} map.
function teamCond(f, args, board, athlete) {
  if (!f.teamsBy) return "";
  args.push(JSON.stringify(f.teamsBy)); const n = args.length;
  return ` AND (NOT ($${n}::jsonb ? (${board})::text) OR EXISTS (SELECT 1 FROM schedule_members tm WHERE tm.schedule_id = ${board} AND tm.athlete_id = ${athlete} AND ($${n}::jsonb -> (${board})::text) ? tm.group_name))`;
}
function memberCond(f, args, m) {   // for rows that are board memberships
  if (!f.teamsBy) return "";
  args.push(JSON.stringify(f.teamsBy)); const n = args.length;
  return ` AND (NOT ($${n}::jsonb ? ${m}.schedule_id::text) OR ($${n}::jsonb -> ${m}.schedule_id::text) ? ${m}.group_name)`;
}
const teamAllowed = (f, boardId, team) => !f.teamsBy || !f.teamsBy[boardId] || f.teamsBy[boardId].includes(team);
// the extra filters every session-based report shares: level (node ids, the level and everything inside it), location, weekdays
function more(f, args) {
  const w = [];
  if (f.levels && f.levels.length) { args.push(f.levels); w.push(`i.node_id = ANY($${args.length})`); }
  if (f.location) { args.push(f.location); w.push(`coalesce(nullif(i.location,''), sc.event_location) = $${args.length}`); }
  if (f.days && f.days.length) { args.push(f.days); w.push(`EXTRACT(DOW FROM i.starts_at AT TIME ZONE '${TZ}')::int = ANY($${args.length})`); }
  if (f.btype) { args.push(f.btype); w.push(`sc.board_type = $${args.length}`); }   // Session type = the board's type
  if (f.when === "up") w.push(`i.starts_at >= now()`); if (f.when === "past") w.push(`coalesce(i.ends_at, i.starts_at) < now()`);   // When
  return w.length ? ` AND ${w.join(" AND ")}` : "";
}

// sessions in range, with their level path and counts
async function sessions(f) {
  const { boards, from, to, past = false } = f, [lo, hi] = span("$2", "$3"), args = [boards, from, to], x = more(f, args), tj = teamCond(f, args, "i.schedule_id", "c.athlete_id");
  return (await query(`SELECT i.id, i.title, i.starts_at, i.ends_at, i.capacity, coalesce(nullif(i.location,''), sc.event_location) AS location, i.schedule_id AS board_id, sc.name AS board, sc.board_type, sc.question,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path,
      count(c.*) FILTER (WHERE c.status='confirmed')::int AS claimed, count(c.*) FILTER (WHERE c.status='confirmed' AND c.counts)::int AS taken, count(c.*) FILTER (WHERE c.status='waitlisted')::int AS waitlisted,
      count(c.*) FILTER (WHERE c.status='canceled' AND c.rsvp IS NULL)::int AS canceled, sc.settings->'report' AS thresholds,
      count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended)::int AS here, count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended = false)::int AS noshow,
      count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended IS NULL)::int AS unmarked
    FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id LEFT JOIN board_claims c ON c.item_id=i.id${tj}
    WHERE i.schedule_id = ANY($1) AND i.canceled_at IS NULL AND i.starts_at IS NOT NULL AND i.starts_at >= ${lo} AND i.starts_at < ${hi} ${past ? "AND coalesce(i.ends_at, i.starts_at) < now()" : ""}${x}
    GROUP BY i.id, sc.name, sc.board_type, sc.event_location, sc.question, sc.settings ORDER BY i.starts_at, i.id`, args)).rows.map((s) => ({ ...s, session: [s.path, s.title && s.path ? s.title : ""].filter(Boolean).join(" › ") || s.title || "Session" }));
}
// confirmed claims on past sessions in range (for attendance)
async function claimsIn(f, { past = true, statuses = ["confirmed"] } = {}) {
  if (f.cstatus) statuses = statuses.includes(f.cstatus) || f.cstatus === "canceled" ? [f.cstatus] : statuses;   // Claim status filter
  const [lo, hi] = span("$2", "$3"), args = [f.boards, f.from, f.to, statuses];
  let x = more(f, args); if (f.team) { args.push(f.team); x += ` AND m.group_name = $${args.length}`; }
  x += teamCond(f, args, "i.schedule_id", "c.athlete_id");
  return (await query(`SELECT c.id, c.status, c.attended, c.walk_in, c.note, c.counts, c.added_by_admin, c.rsvp, c.created_at, c.canceled_at, c.promoted_at, a.id AS athlete_id, a.first_name, a.last_name, m.group_name AS team, i.id AS item_id, i.title, i.starts_at, i.ends_at,
      sc.name AS board, sc.board_type, i.schedule_id AS board_id, coalesce(nullif(i.location,''), sc.event_location) AS location,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id
    LEFT JOIN schedule_members m ON m.schedule_id=i.schedule_id AND m.athlete_id=a.id
    WHERE i.schedule_id = ANY($1) AND c.status = ANY($4) AND i.canceled_at IS NULL AND i.starts_at >= ${lo} AND i.starts_at < ${hi}${past ? " AND coalesce(i.ends_at, i.starts_at) < now()" : ""}${x}
      ${f.cstatus === "canceled" ? "AND c.rsvp IS NULL" : ""}${f.astatus === "attended" ? " AND c.attended" : f.astatus === "noshow" ? " AND c.attended = false" : f.astatus === "unrecorded" ? " AND c.attended IS NULL AND coalesce(i.ends_at, i.starts_at) < now()" : ""}
    ORDER BY i.starts_at, lower(a.last_name), lower(a.first_name)`, args)).rows;
}
const pastClaims = (f) => claimsIn(f);
const nm = (r) => `${r.first_name} ${r.last_name || ""}`.trim();
const REPEAT = 3;   // no-shows that count as "repeat"

// ---------- Claims ----------
async function cancelWho(rows) {
  const c = rows.filter((x) => x.status === "canceled" && x.canceled_at); if (!c.length) return;
  const found = (await query(`SELECT DISTINCT ON (l.item_id, l.athlete_id) l.item_id, l.athlete_id, l.via FROM activity_log l
      WHERE l.item_id = ANY($1) AND l.athlete_id = ANY($2) AND l.kind IN ('claims','people','sessions','checkin','rsvp') ORDER BY l.item_id, l.athlete_id, l.at DESC`,
    [[...new Set(c.map((x) => x.item_id))], [...new Set(c.map((x) => x.athlete_id))]])).rows;
  const by = new Map(found.map((r) => [`${r.item_id}|${r.athlete_id}`, r.via]));
  // an admin removal from a session's People page is logged by its address (…/items/<session>/people/<claim>/remove)
  const removed = new Set((await query(`SELECT path FROM activity_log WHERE via='admin' AND path LIKE ANY($1)`, [c.map((x) => `%/items/${x.item_id}/people/${x.id}/remove%`)])).rows
    .map((r) => (/\/people\/(\d+)\/remove/.exec(r.path) || [])[1]).filter(Boolean).map(Number));
  for (const x of c) { const v = removed.has(x.id) ? "admin" : by.get(`${x.item_id}|${x.athlete_id}`); x.cancel_kind = v === "admin" ? "Canceled by admin" : v ? "Released" : "Canceled"; }
}
const stat = (c) => c.status === "canceled" ? (c.cancel_kind || "Canceled") : c.status === "waitlisted" ? "Waitlisted" : c.board_type !== "rsvp" && new Date(c.ends_at || c.starts_at).getTime() < Date.now() ? "Past" : c.board_type !== "rsvp" && !c.walk_in && !c.added_by_admin ? "Active" : c.board_type === "rsvp" ? "Going" : c.walk_in ? "Walk-in" : c.added_by_admin ? "Added by admin" : "Claimed";
const att = (c) => c.status === "canceled" ? "" : c.attended == null ? "" : c.attended ? "Here" : "No-show";
async function claimsAll(f) {
  const raw = (await claimsIn(f, { past: false, statuses: ["confirmed", "waitlisted"] })).filter((c) => c.board_type !== "rsvp" || f.cstatus); await cancelWho(raw);
  const rows = raw.map((c) => ({ id: c.athlete_id, name: nm(c), team: c.team || "", board: c.board,
    session: [c.path, c.title && c.path ? c.title : ""].filter(Boolean).join(" › ") || c.title || "Session", when: c.starts_at, location: c.location || "", status: stat(c), attended: att(c),
    claimed: c.created_at, canceled: c.canceled_at, note: c.note || "" }));
  return { cols: [["name", "Name"], ["team", "Team"], ["board", "Board"], ["session", "Level & session"], ["when", "When", "dt"], ["location", "Location"], ["status", "Status"], ["attended", "Attendance"], ["claimed", "Claimed on", "dt"], ["canceled", "Canceled on", "dt"], ["note", "Answer / note"]],
    rows, link: (r) => `/reports?r=personView&pid=${r.id}`, note: f.cstatus === "canceled" ? "Canceled claims in the range (an RSVP \"Can't make it\" isn't a cancellation)." : "Every claim and waitlist spot in the range. Choose Claim status → Canceled to see cancellations." };
}
async function claimsByPerson(f) {
  const by = new Map(), now = Date.now();
  for (const c of (await claimsIn(f, { past: false, statuses: ["confirmed", "waitlisted"] })).filter((x) => x.board_type !== "rsvp")) {
    const p = by.get(c.athlete_id) || { id: c.athlete_id, name: nm(c), team: c.team || "", levels: new Map(), total: 0, upcoming: 0, waitlisted: 0, here: 0, noshow: 0, last: null, next: null };
    if (c.status === "waitlisted") p.waitlisted++; else {
      p.total++; const lv = (c.path || "").split(" › ").slice(0, 2).join(" › "); if (lv) p.levels.set(lv, (p.levels.get(lv) || 0) + 1);
      const t = new Date(c.starts_at).getTime(), done = new Date(c.ends_at || c.starts_at).getTime() < now;
      if (c.attended === true) p.here++; if (c.attended === false) p.noshow++;
      if (done) { if (!p.last || t > p.last) p.last = t; } else { p.upcoming++; if (!p.next || t < p.next) p.next = t; }
    }
    by.set(c.athlete_id, p);
  }
  const rows = [...by.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, level: [...p.levels].sort((a, b) => b[1] - a[1]).map(([k]) => k)[0] || "", total: p.total, upcoming: p.upcoming,
    here: p.here, noshow: p.noshow, att: p.here + p.noshow ? pct(p.here, p.here + p.noshow) : null, waitlisted: p.waitlisted, last: p.last ? new Date(p.last) : null, next: p.next ? new Date(p.next) : null })).sort((a, b) => a.name.localeCompare(b.name));
  return { cols: [["name", "Athlete"], ["team", "Team"], ["level", "Level"], ["total", "Total claims", "num"], ["upcoming", "Upcoming", "num"], ["here", "Attended", "num"], ["noshow", "No-shows", "num"], ["att", "Attendance", "pct"], ["waitlisted", "Waitlisted", "num"], ["last", "Last session", "dt"], ["next", "Next session", "dt"]],
    rows, link: (r) => `/reports?r=personView&pid=${r.id}`, note: "Active claims in the range (program and volunteer boards). Attendance = attended ÷ (attended + no-shows) on past sessions; shown once any attendance is recorded. Click a name for their history." };
}
// ---------- one person, in detail (opened from a name) ----------
async function personView(f, pid) {
  const p = (await query(`SELECT id, first_name, last_name, team, kind FROM athletes WHERE id=$1`, [pid])).rows[0];
  if (!p) return { person: null };
  const all = (await claimsIn(f, { past: false, statuses: ["confirmed", "waitlisted", "canceled"] })).filter((c) => c.athlete_id === pid && c.board_type !== "rsvp" && !(c.status === "canceled" && c.rsvp)); await cancelWho(all);
  const ob = [pid, f.boards];   // only boards (and teams) this viewer may see
  const onBoards = (await query(`SELECT sc.id, sc.name, m.group_name FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id WHERE m.athlete_id=$1 AND m.schedule_id = ANY($2)${memberCond(f, ob, "m")} ORDER BY sc.name`, ob)).rows;
  if (f.scoped && !all.length && !onBoards.length) return { person: null };   // not someone on this person's boards
  const now = Date.now(), done = (c) => new Date(c.ends_at || c.starts_at).getTime() < now, act = all.filter((c) => c.status === "confirmed");
  const sess = (c) => [c.path, c.title && c.path ? c.title : ""].filter(Boolean).join(" › ") || c.title || "Session";
  const past = act.filter(done), up = act.filter((c) => !done(c)), here = past.filter((c) => c.attended === true).length, ns = past.filter((c) => c.attended === false).length;
  const canceled = all.filter((c) => c.status === "canceled"), waiting = all.filter((c) => c.status === "waitlisted"), moved = act.filter((c) => c.promoted_at);
  const months = new Map(); for (const c of past) { const k = new Date(c.starts_at).toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7), x = months.get(k) || { h: 0, n: 0 }; if (c.attended === true) x.h++; if (c.attended === false) x.n++; months.set(k, x); }
  const row = (c) => ({ when: c.starts_at, board: c.board, session: sess(c), location: c.location || "", status: stat(c), attended: done(c) && c.status === "confirmed" ? (c.attended == null ? "Not recorded" : c.attended ? "Here" : "No-show") : "",
    claimed: c.created_at, canceled: c.canceled_at, moved: c.promoted_at, note: c.note || "" });
  const T = (cols, list, note) => ({ cols, rows: list.map(row), note });
  return { person: p, boards: onBoards, kpis: [["Active claims", act.length], ["Completed", past.length], ["Upcoming", up.length], ["Attended", here], ["No-shows", ns], ["Attendance", pct(here, here + ns), "%"], ["Cancellations", canceled.length], ["Waitlisted", waiting.length]],
    trend: [...months].sort().map(([k, x]) => ({ label: new Date(k + "-15T12:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }), value: pct(x.h, x.h + x.n) ?? 0 })),
    upcoming: T([["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["location", "Location"]], up),
    history: T([["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["attended", "Attendance"]], past.slice().reverse()),
    canceled: T([["when", "Session date", "dt"], ["session", "Session"], ["board", "Board"], ["canceled", "Canceled on", "dt"], ["claimed", "Claimed on", "dt"]], canceled.slice().reverse()),
    waitlist: T([["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["status", "Now"], ["moved", "Moved up on", "dt"]], [...waiting, ...moved]),
    // the CSV / PDF: every claim
    cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["location", "Location"], ["status", "Status"], ["attended", "Attendance"], ["claimed", "Claimed on", "dt"], ["canceled", "Canceled on", "dt"], ["note", "Answer / note"]],
    rows: all.map(row), note: `${p.first_name} ${p.last_name || ""}: every claim in the range on the boards in view.` };
}

// ---------- Teams: participation grouped by team ----------
async function teamsReport(f) {
  const cl = (await claimsIn(f, { past: false, statuses: ["confirmed"] })).filter((c) => c.board_type !== "rsvp"), now = Date.now(), by = new Map();
  const roster = new Map(); for (const m of await members(f)) { if (m.board_type === "rsvp") continue; const k = m.team || "(no team)"; if (!roster.has(k)) roster.set(k, new Set()); roster.get(k).add(m.id); }
  const blank = (k) => ({ team: k, people: new Set(), claims: 0, done: 0, here: 0, noshow: 0, upcoming: 0, upPeople: new Set() });
  for (const c of cl) {
    const k = c.team || "(no team)", x = by.get(k) || blank(k);
    x.people.add(c.athlete_id); x.claims++;
    if (new Date(c.ends_at || c.starts_at).getTime() < now) { x.done++; if (c.attended === true) x.here++; if (c.attended === false) x.noshow++; } else { x.upcoming++; x.upPeople.add(c.athlete_id); }
    by.set(k, x);
  }
  for (const k of roster.keys()) if (!by.has(k)) by.set(k, blank(k));
  const rows = [...by.values()].map((x) => { const r = roster.get(x.team), n = x.people.size, rs = r ? r.size : null;
    return { team: x.team, roster: rs, people: n, rate: rs ? pct([...x.people].filter((id) => r.has(id)).length, rs) : null, claims: x.claims, per: n ? Math.round((x.claims / n) * 10) / 10 : null,
      done: x.done, att: x.here + x.noshow ? pct(x.here, x.here + x.noshow) : null, noshow: x.noshow, upcoming: x.upcoming, upPeople: x.upPeople.size, upRate: rs ? pct([...x.upPeople].filter((id) => r.has(id)).length, rs) : null }; })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.team.localeCompare(b.team));
  return { cols: [["team", "Team"], ["roster", "Roster", "num"], ["people", "Participants", "num"], ["rate", "Participation", "pct"], ["claims", "Claims", "num"], ["per", "Claims per participant", "num"], ["done", "Completed", "num"], ["att", "Attendance", "pct"], ["noshow", "No-shows", "num"], ["upcoming", "Upcoming claims", "num"], ["upRate", "Upcoming participation", "pct"]],
    rows, note: "Roster = athletes on the boards' lists for that team. Participation = roster athletes with at least one claim; Upcoming participation = roster athletes with an upcoming claim. Attendance = attended ÷ (attended + no-shows)." };
}
// ---------- Volunteers: shift coverage ----------
async function coverage(f) {
  const rows = (await sessions(f)).filter((s) => s.board_type === "volunteer"), now = Date.now();
  return { cols: [["when", "When", "dt"], ["session", "Shift"], ["board", "Board"], ["capacity", "Needed", "num"], ["taken", "Claimed", "num"], ["open", "Open", "num"], ["cov", "Coverage", "pct"], ["status", "Status"]],
    rows: rows.map((s) => ({ id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, capacity: s.capacity, taken: s.taken, open: s.capacity ? Math.max(s.capacity - s.taken, 0) : null,
      cov: s.capacity ? pct(Math.min(s.taken, s.capacity), s.capacity) : null, status: new Date(s.starts_at).getTime() < now ? "Past" : !s.capacity ? "No limit" : s.taken >= s.capacity ? "Covered" : "Needs people" })),
    link: (r) => `/admin/b/${r.board_id}/items/${r.id}/people`, note: "Shifts on volunteer boards in the range. Claimed means signed up, not completed; completed hours are under Volunteer hours." };
}

// ---------- Attendance ----------
async function attendance(f) {
  const by = new Map();
  for (const c of await pastClaims(f)) {
    const p = by.get(c.athlete_id) || { id: c.athlete_id, name: nm(c), team: c.team || "", claimed: 0, here: 0, noshow: 0, unmarked: 0, last: null };
    p.claimed++; if (c.attended === true) { p.here++; if (!p.last || c.starts_at > p.last) p.last = c.starts_at; } else if (c.attended === false) p.noshow++; else p.unmarked++;
    by.set(c.athlete_id, p);
  }
  const rows = [...by.values()].map((p) => ({ ...p, pct: pct(p.here, p.here + p.noshow), flag: p.noshow >= REPEAT ? "Repeat no-shows" : "" })).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.name.localeCompare(b.name));
  return { cols: [["name", "Athlete"], ["team", "Team"], ["claimed", "Claimed", "num"], ["here", "Attended", "num"], ["noshow", "No-shows", "num"], ["unmarked", "Not checked in", "num"], ["pct", "Attendance", "pct"], ["last", "Last came", "date"], ["flag", ""]],
    rows, link: (r) => `/admin/people/${r.id}`, note: "Past sessions in the date range. Attendance % = attended out of the checked-in ones (not checked in isn't counted against them). Lowest first." };
}
async function noshows(f) {
  const all = (await pastClaims(f)).filter((c) => c.attended === false), count = new Map();
  for (const c of all) count.set(c.athlete_id, (count.get(c.athlete_id) || 0) + 1);
  return { cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["name", "Athlete"], ["team", "Team"], ["total", "No-shows in range", "num"], ["flag", ""]],
    rows: all.map((c) => ({ id: c.athlete_id, when: c.starts_at, session: slotName(c), board: c.board, name: nm(c), team: c.team || "", total: count.get(c.athlete_id), flag: count.get(c.athlete_id) >= REPEAT ? "Repeat" : "" })).reverse(),
    link: (r) => `/admin/people/${r.id}`, note: `Newest first. "Repeat" = ${REPEAT} or more no-shows in the date range.` };
}
async function attendanceSessions(f) {
  const rows = (await sessions({ ...f, past: true })).filter((s) => s.board_type !== "rsvp" && s.claimed > 0);
  return { cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["claimed", "Expected", "num"], ["here", "Attended", "num"], ["noshow", "No-shows", "num"], ["unmarked", "Not recorded", "num"], ["done", "Recorded", "pct"], ["rate", "Attendance", "pct"]],
    rows: rows.reverse().map((s) => ({ id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, claimed: s.claimed, here: s.here, noshow: s.noshow, unmarked: s.unmarked,
      done: pct(s.here + s.noshow, s.claimed), rate: s.here + s.noshow ? pct(s.here, s.here + s.noshow) : null })),
    link: (r) => `/checkin/i/${r.id}`, note: "Past sessions with claims. Recorded = how much of the session's attendance is marked; Attendance = attended ÷ (attended + no-shows). Not recorded never counts as a no-show. Click a date to record attendance." };
}
async function unchecked(f) {
  const rows = (await sessions({ ...f, past: true })).filter((s) => s.unmarked > 0);
  const coaches = new Map((await query(`SELECT schedule_id, string_agg(email, ', ' ORDER BY email) AS e FROM schedule_coaches WHERE schedule_id = ANY($1) GROUP BY schedule_id`, [f.boards])).rows.map((r) => [r.schedule_id, r.e]));
  return { cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["claimed", "Claimed", "num"], ["unmarked", "Not checked in", "num"], ["coaches", "Coaches"]],
    rows: rows.reverse().map((s) => ({ id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, claimed: s.claimed, unmarked: s.unmarked, coaches: coaches.get(s.board_id) || "" })),
    link: (r) => `/checkin/i/${r.id}`, note: "Past sessions where someone who claimed was never marked Here or No-show. Open one to finish it." };
}
// ---------- Sessions ----------
async function fill(f) {
  const now = Date.now(), rows = (await sessions(f)).filter((s) => s.board_type !== "rsvp");
  const statusOf = (s) => { if (!s.capacity) return "No limit"; const p = (s.taken / s.capacity) * 100, t = s.thresholds || {};
    return s.taken > s.capacity ? "Over capacity" : s.taken >= s.capacity ? "Full" : p >= (Number(t.near_pct) || 90) ? "Nearly full" : p < (Number(t.min_pct) || 50) ? "Low" : "Healthy"; };
  const out = rows.map((s) => { const past = new Date(s.ends_at || s.starts_at).getTime() < now, st = statusOf(s);
    const attend = !past ? "Upcoming" : !s.claimed ? "No claims" : s.unmarked ? `Pending (${s.unmarked} not recorded)` : "Complete";
    return { id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, location: s.location || "", capacity: s.capacity, claimed: s.taken,
      open: s.capacity ? Math.max(s.capacity - s.taken, 0) : null, fill: pct(s.taken, s.capacity), status: st, waitlisted: s.waitlisted, attend, past,
      act: past && s.unmarked ? ["Record attendance", `/checkin/i/${s.id}`] : ["Manage", `/admin/b/${s.board_id}/items/${s.id}/people`] }; });
  const V = { upcoming: (x) => !x.past, past: (x) => x.past, low: (x) => !x.past && x.status === "Low", near: (x) => !x.past && x.status === "Nearly full", full: (x) => !x.past && x.status === "Full",
    over: (x) => x.status === "Over capacity", waitlisted: (x) => x.waitlisted > 0, pending: (x) => /^Pending/.test(x.attend) };
  const shown = f.view && V[f.view] ? out.filter(V[f.view]) : out;
  return { cols: [["when", "Date / time", "dt"], ["session", "Session"], ["board", "Board"], ["location", "Location"], ["capacity", "Capacity", "num"], ["claimed", "Claimed", "num"], ["open", "Available", "num"],
      ["fill", "% full", "pct"], ["status", "Status"], ["waitlisted", "Waitlist", "num"], ["attend", "Attendance"], ["act", "", "act"]],
    rows: shown, note: "Capacity counts spots taken (walk-ins and extra spots don't). Low / Nearly full use each board's thresholds when set (Board → Notifications), otherwise under 50% / 90%+. Sort any column." };
}
async function busiest(f) {
  const rows = (await sessions(f)).filter((s) => s.board_type !== "rsvp" && s.capacity);
  const cell = new Map(); let hours = new Set();
  for (const s of rows) {
    const d = new Date(new Date(s.starts_at).toLocaleString("en-US", { timeZone: TZ })), k = `${d.getDay()}|${d.getHours()}`;
    const c = cell.get(k) || { n: 0, claimed: 0, cap: 0 }; c.n++; c.claimed += s.claimed; c.cap += s.capacity; cell.set(k, c); hours.add(d.getHours());
  }
  hours = [...hours].sort((a, b) => a - b);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], h12 = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
  const out = hours.map((h) => { const r = { hour: h12(h) }; DAYS.forEach((d, i) => { const c = cell.get(`${i}|${h}`); r[d] = c ? pct(c.claimed, c.cap) : null; r[`${d}_n`] = c ? c.n : 0; }); return r; });
  return { cols: [["hour", "Starts"], ...DAYS.map((d) => [d, d, "pct"])], rows: out, grid: true, note: "How full sessions are, by weekday and start time (all sessions in the range). Darker = fuller; the small number is how many sessions." };
}
async function waitlists(f) {
  const rows = (await sessions(f)).filter((s) => s.waitlisted > 0);
  return { cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["capacity", "Capacity", "num"], ["taken", "Claimed", "num"], ["waitlisted", "Waitlisted", "num"], ["open", "Available", "num"], ["flag", ""]],
    rows: rows.map((s) => { const open = s.capacity ? Math.max(s.capacity - s.taken, 0) : null; return { id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, capacity: s.capacity, taken: s.taken, waitlisted: s.waitlisted, open, flag: open > 0 && new Date(s.starts_at).getTime() > Date.now() ? "Open spots while people wait" : "" }; })
      .sort((a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0) || b.waitlisted - a.waitlisted),
    link: (r) => `/admin/b/${r.board_id}/items/${r.id}/people`, note: "Sessions with people waiting. Sessions with open spots while people wait are listed first; moving someone up follows each board's waitlist rules (nothing changes automatically here)." };
}
async function locations(f) {
  const by = new Map();
  for (const s of await sessions(f)) {
    const h = s.ends_at ? (new Date(s.ends_at) - new Date(s.starts_at)) / 3600e3 : 0, k = s.location || "(no location)";
    const r = by.get(k) || { location: k, sessions: 0, hours: 0, claimedH: 0, hereH: 0 }; r.sessions++; r.hours += h; r.claimedH += h * s.claimed; r.hereH += h * s.here; by.set(k, r);
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  return { cols: [["location", "Location"], ["sessions", "Sessions", "num"], ["hours", "Hours scheduled", "num"], ["claimedH", "Person-hours claimed", "num"], ["hereH", "Person-hours attended", "num"]],
    rows: [...by.values()].map((r) => ({ ...r, hours: r1(r.hours), claimedH: r1(r.claimedH), hereH: r1(r.hereH) })).sort((a, b) => b.hours - a.hours), note: "Hours booked at each place in the range, and how much they were used (one person for one hour = 1)." };
}
// ---------- RSVP ----------
async function rsvpEvents(f) {
  // On the list = can answer (eligible). Response rate = answered ÷ on the list. Follow-through = of those who said Going,
  // came ÷ (came + recorded no-shows) on past events; missing attendance never counts against anyone; future events show "—".
  const R = require("./rsvp"), rows = [], now = Date.now();
  for (const s of (await sessions(f)).filter((x) => x.board_type === "rsvp")) {
    const r = await R.summary(s.id); if (!r) continue; for (const k of ["going", "no", "none"]) r[k] = r[k].filter((p) => teamAllowed(f, s.board_id, p.group_name || p.team));
    const past = new Date(s.ends_at || s.starts_at).getTime() < now, list = r.going.length + r.no.length + r.none.length, ans = r.going.length + r.no.length;
    const came = r.going.filter((p) => p.attended === true).length, ns = r.going.filter((p) => p.attended === false).length;
    rows.push({ id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, list, answered: ans, rate: list ? pct(ans, list) : null, going: r.going.length, no: r.no.length, none: r.none.length,
      came: past ? came : null, follow: past && came + ns ? pct(came, came + ns) : null, didnt: past ? ns : null, state: past ? "Past" : "Upcoming",
      act: past ? ["Attendance", `/checkin/i/${s.id}`] : ["Event", `/admin/b/${s.board_id}/items/${s.id}/people`] });
  }
  return { cols: [["when", "When", "dt"], ["session", "Event"], ["board", "Board"], ["list", "On the list", "num"], ["answered", "Answered", "num"], ["rate", "Response rate", "pct"], ["going", "Going", "num"], ["no", "Can't make it", "num"],
      ["none", "No answer", "num"], ["came", "Came", "num"], ["follow", "Follow-through", "pct"], ["didnt", "Said going, didn't come", "num"], ["state", ""], ["act", "", "act"]],
    rows, note: "On the list = who can answer. An answer isn't a claim or attendance: Came and Follow-through only appear after the event, from recorded attendance of those who said Going (not recorded never counts as not coming)." };
}// one row per athlete per RSVP event: their answer (Going / Can't make it / No answer), note, and attendance
async function rsvpAnswers(f) {
  const R = require("./rsvp"), rows = [], now = Date.now();
  for (const s of (await sessions(f)).filter((x) => x.board_type === "rsvp")) {
    const r = await R.summary(s.id); if (!r) continue; const past = new Date(s.ends_at || s.starts_at).getTime() < now;
    for (const [list, label] of [[r.going, "Going"], [r.no, "Can't make it"], [r.none, "No answer"]]) for (const p of list) {
      if (!teamAllowed(f, s.board_id, p.group_name || p.team) || (f.team && (p.group_name || p.team) !== f.team)) continue;
      rows.push({ id: p.id, name: nm(p), team: p.group_name || p.team || "", session: s.session, when: s.starts_at, board: s.board, answer: label, answered: p.answered_at || null, note: p.note || "",
        attended: label !== "Going" ? "" : !past ? "Upcoming" : p.attended == null ? "Not recorded" : p.attended ? "Came" : "Didn't come" });
    }
  }
  return { cols: [["name", "Athlete"], ["team", "Team"], ["session", "Event"], ["when", "When", "dt"], ["board", "Board"], ["answer", "Answer"], ["answered", "Answered on", "dt"], ["note", "Note"], ["attended", "Attendance"]],
    rows: rows.sort((a, b) => new Date(a.when) - new Date(b.when) || a.name.localeCompare(b.name)), link: (r) => `/reports?r=personView&pid=${r.id}`,
    note: "Every athlete on each RSVP event's list and their answer. Attendance shows only for those who said Going, and only after the event." };
}async function rsvpAthletes(f) {
  const R = require("./rsvp"), by = new Map(), now = Date.now();
  for (const s of (await sessions(f)).filter((x) => x.board_type === "rsvp")) {
    const r = await R.summary(s.id); if (!r) continue; const past = new Date(s.ends_at || s.starts_at).getTime() < now;
    for (const [k, list] of [["going", r.going], ["no", r.no], ["none", r.none]]) for (const p of list) {
      if (!teamAllowed(f, s.board_id, p.group_name || p.team) || (f.team && (p.group_name || p.team) !== f.team)) continue;
      const x = by.get(p.id) || { id: p.id, name: nm(p), team: p.group_name || p.team || "", events: 0, going: 0, no: 0, none: 0, came: 0, ns: 0 };
      x.events++; x[k]++; if (k === "going" && past) { if (p.attended === true) x.came++; if (p.attended === false) x.ns++; }
      by.set(p.id, x);
    }
  }
  const rows = [...by.values()].map((x) => ({ ...x, rate: pct(x.going + x.no, x.events), follow: x.came + x.ns ? pct(x.came, x.came + x.ns) : null })).sort((a, b) => a.name.localeCompare(b.name));
  return { cols: [["name", "Athlete"], ["team", "Team"], ["events", "Events on their list", "num"], ["rate", "Response rate", "pct"], ["going", "Going", "num"], ["no", "Can't make it", "num"], ["none", "No answer", "num"], ["came", "Came", "num"], ["ns", "Said going, didn't come", "num"], ["follow", "Follow-through", "pct"]],
    rows, link: (r) => `/reports?r=personView&pid=${r.id}`, note: "Each athlete across the RSVP events in view. Follow-through = came ÷ (came + recorded no-shows) for events they said Going to, after the event." };
}// ---------- Families ----------
async function members(f) {
  const margs = f.team ? [f.boards, f.team] : [f.boards];
  return (await query(`SELECT m.schedule_id AS board_id, sc.name AS board, sc.board_type, a.id, a.first_name, a.last_name, m.group_name AS team,
      ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id ORDER BY u.email) AS parents,
      (SELECT email FROM users WHERE id=a.self_user_id) AS own,
      (SELECT max(u.last_login_at) FROM users u WHERE u.id=a.self_user_id OR u.id IN (SELECT user_id FROM parent_athletes WHERE athlete_id=a.id)) AS signed_in,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=m.schedule_id AND c.athlete_id=a.id AND c.status<>'canceled') AS claims
    FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id JOIN athletes a ON a.id=m.athlete_id
    WHERE m.schedule_id = ANY($1) AND a.archived_at IS NULL ${f.team ? "AND m.group_name = $2" : ""}${memberCond(f, margs, "m")} ORDER BY lower(a.last_name), lower(a.first_name)`, margs)).rows;
}
async function engagement(f) {
  // "Signed in" means the athlete's own account or any linked parent/guardian account. Claims = active claims on the boards in view.
  const by = new Map(), recent = Date.now() - 30 * 864e5;
  for (const m of await members(f)) {
    const x = by.get(m.id) || { id: m.id, name: nm(m), team: m.team || "", boards: [], claims: 0, signed_in: m.signed_in, emails: [...new Set([m.own, ...(m.parents || [])].filter(Boolean))].join(", ") };
    x.boards.push(m.board); x.claims += m.claims; by.set(m.id, x);
  }
  const all = [...by.values()].map((x) => { const acct = !!x.emails, signed = !!x.signed_in;
    return { ...x, boards: x.boards.join(", "), account: !acct ? "No account" : signed ? "Signed in" : "Never signed in", status: !acct ? "No account" : !signed ? "Never signed in" : !x.claims ? "Signed in, no claims" : "Active",
      inactive: acct && !x.claims && (!signed || new Date(x.signed_in).getTime() < recent), act: ["View", `/reports?r=personView&pid=${x.id}`] }; });
  const V = { never: (x) => x.account === "Never signed in", noclaims: (x) => !x.claims, active: (x) => x.claims > 0, inactive: (x) => x.inactive, noaccount: (x) => x.account === "No account" };
  const rows = (f.fview && V[f.fview] ? all.filter(V[f.fview]) : all).sort((a, b) => ["No account", "Never signed in", "Signed in, no claims", "Active"].indexOf(a.status) - ["No account", "Never signed in", "Signed in, no claims", "Active"].indexOf(b.status) || a.name.localeCompare(b.name));
  const n = (fn) => all.filter(fn).length;
  return { summary: [["Total athletes", all.length], ["Active accounts", n((x) => x.account === "Signed in")], ["Never signed in", n((x) => x.account === "Never signed in")],
      ["With claims", n((x) => x.claims > 0)], ["Without claims", n((x) => !x.claims)], ["Signed in, last 30 days", n((x) => x.signed_in && new Date(x.signed_in).getTime() >= recent)]],
    cols: [["name", "Athlete"], ["team", "Team"], ["account", "Account"], ["signed_in", "Last sign-in", "date"], ["claims", "Claims", "num"], ["boards", "Boards"], ["emails", "Emails", "csv"], ["act", "", "act"]],
    rows, link: (r) => `/reports?r=personView&pid=${r.id}`,
    note: "Everyone on the boards in view. Account and last sign-in count the athlete's own sign-in or any linked parent/guardian's. Active = signed in with claims; Inactive = no claims and no sign-in in the last 30 days." };
}
async function notSignedUp(f) {
  const rows = (await members(f)).filter((m) => m.board_type !== "rsvp" && m.claims === 0);
  return { cols: [["name", "Athlete"], ["team", "Team"], ["board", "Board"], ["status", "Signed in"], ["emails", "Emails"]],
    rows: rows.map((m) => ({ id: m.id, name: nm(m), team: m.team || "", board: m.board, status: m.signed_in ? "Yes" : (m.own || (m.parents || []).length) ? "Never" : "No account", emails: [...new Set([m.own, ...(m.parents || [])].filter(Boolean))].join(", ") })),
    link: (r) => `/admin/people/${r.id}`, note: "On a board's list with no claims on it at all: likely the families who need a personal reminder." };
}
async function volunteer(f, required) {
  const [lo, hi] = span("$2", "$3"), volArgs = [f.boards, f.from, f.to]; let volX = more(f, volArgs); volX += teamCond(f, volArgs, "i.schedule_id", "c.athlete_id");
  const claims = (await query(`SELECT c.athlete_id, c.attended, i.starts_at, i.ends_at, a.kind, a.first_name, a.last_name, a.self_user_id,
      (SELECT min(pa.user_id) FROM parent_athletes pa WHERE pa.athlete_id=a.id) AS parent_user
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id
    WHERE sc.board_type='volunteer' AND i.schedule_id = ANY($1) AND c.status='confirmed' AND coalesce(c.attended, true) AND i.canceled_at IS NULL AND i.ends_at IS NOT NULL
      AND i.starts_at >= ${lo} AND i.starts_at < ${hi}${volX}`, volArgs)).rows;
  const fam = new Map();
  for (const c of claims) {
    const key = c.self_user_id ? `u${c.self_user_id}` : c.parent_user ? `u${c.parent_user}` : `a${c.athlete_id}`;
    const x = fam.get(key) || { key, who: new Set(), hours: 0, shifts: 0 }; x.who.add(nm(c)); x.hours += (new Date(c.ends_at) - new Date(c.starts_at)) / 3600e3; x.shifts++; fam.set(key, x);
  }
  // name each family by its account (and the kids it's for)
  const rows = [];
  for (const x of fam.values()) {
    let family = [...x.who].join(", "), email = "";
    if (x.key[0] === "u") { const u = (await query(`SELECT u.email, (SELECT a.first_name || ' ' || coalesce(a.last_name,'') FROM athletes a WHERE a.self_user_id=u.id LIMIT 1) AS name,
        ARRAY(SELECT a.first_name FROM parent_athletes pa JOIN athletes a ON a.id=pa.athlete_id WHERE pa.user_id=u.id ORDER BY a.first_name) AS kids FROM users u WHERE u.id=$1`, [+x.key.slice(1)])).rows[0];
      if (u) { family = `${(u.name || u.email).trim()}${u.kids.length ? ` (${u.kids.join(", ")})` : ""}`; email = u.email; } }
    const hours = Math.round(x.hours * 10) / 10;
    rows.push({ family, who: [...x.who].join(", "), email, shifts: x.shifts, hours, status: required ? (hours >= required ? "Done" : hours >= required * 0.5 ? "Close" : "Behind") : "" });
  }
  rows.sort((a, b) => a.hours - b.hours || a.family.localeCompare(b.family));
  return { cols: [["family", "Family"], ["who", "Who volunteered"], ["shifts", "Shifts", "num"], ["hours", "Hours", "num"], ...(required ? [["status", `Status (need ${required})`]] : []), ["email", "Email"]],
    rows, note: "Volunteer-board shifts in the date range (no-shows don't count). Families are grouped by the parent/guardian account." };
}
// ---------- Emails ----------
async function emailProblems(f) {
  await require("./emailLog").ensure();
  const [lo, hi] = span("$1", "$2");
  const rows = (await query(`WITH bad AS (SELECT lower(e.to_addr) AS addr, count(*)::int AS n, max(e.at) AS last,
        (array_agg(coalesce(CASE e.delivery WHEN 'bounced' THEN 'Bounced' WHEN 'complained' THEN 'Marked as spam' END, e.error, 'Failed') ORDER BY e.at DESC))[1] AS why,
        (array_agg(e.board_id ORDER BY e.at DESC) FILTER (WHERE e.board_id IS NOT NULL))[1] AS board_id
      FROM email_log e WHERE (e.status='failed' OR e.delivery IN ('bounced','complained')) AND e.at >= ${lo} AND e.at < ${hi} GROUP BY lower(e.to_addr))
    SELECT b.*, p.id AS person, p.name, sc.name AS board,
      EXISTS (SELECT 1 FROM email_log g WHERE lower(g.to_addr)=b.addr AND g.at > b.last AND g.delivery IN ('delivered','opened','clicked')) AS later_ok
    FROM bad b LEFT JOIN schedules sc ON sc.id=b.board_id
    LEFT JOIN LATERAL (SELECT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name FROM athletes a LEFT JOIN users u ON u.id=a.self_user_id
      WHERE (lower(u.email)=b.addr OR lower(a.email)=b.addr) AND a.archived_at IS NULL ORDER BY a.kind DESC LIMIT 1) p ON true ORDER BY b.last DESC`, [f.from, f.to])).rows;
  return { cols: [["name", "Person"], ["addr", "Email address"], ["why", "Problem"], ["n", "Times", "num"], ["last", "Last occurrence", "dt"], ["board", "Related board"], ["status", "Status"], ["act", "", "act"], ["log", "", "act"]],
    rows: rows.map((r) => ({ ...r, id: r.person, name: r.name || "(not in People)", board: r.board || "—", status: r.later_ok ? "Later email delivered" : "Open",
      act: r.person ? ["Fix address", `/admin/people/${r.person}`] : null, log: ["View log", `/admin/email-log?q=${encodeURIComponent(r.addr)}`] })),
    link: (r) => (r.id ? `/admin/people/${r.id}` : null),
    note: "Addresses that bounced, were marked as spam, or Resend refused, in the date range. Related board = the board the latest problem email was about (recorded from this version on). Status turns to \"Later email delivered\" once a newer email reached them. Nothing changes an address automatically." };
}
// ---------- Week sheet ----------
async function weekSheet(f) {
  const start = f.weekFrom, end = new Date(new Date(start + "T12:00:00").getTime() + 6 * 864e5).toISOString().slice(0, 10);
  const list = await sessions({ ...f, from: start, to: end });
  for (const s of list) { const q = s.question || {}; s.showNotes = s.board_type === "rsvp" || !!(q.label && q.week); s.qLabel = s.board_type === "rsvp" ? "" : q.week ? q.label || "" : ""; }
  for (const s of list) s.people = (await query(`SELECT a.first_name, a.last_name, m.group_name AS team, c.note, c.status FROM board_claims c JOIN athletes a ON a.id=c.athlete_id
      LEFT JOIN schedule_members m ON m.schedule_id=$2 AND m.athlete_id=a.id WHERE c.item_id=$1 AND c.status IN ('confirmed','waitlisted') ORDER BY c.status, lower(a.last_name), lower(a.first_name)`, [s.id, s.board_id])).rows
      .filter((x) => teamAllowed(f, s.board_id, x.team));
  return { week: true, start, end, sessions: list };
}

// ---------- Assessments (baseline → final, and against attendance) ----------
async function assessPair(f) {
  const A = require("./assess"); await A.ensure();
  const x = f.assess || {}; if (!x.a || !x.b) return null;
  const da = await A.day(x.a), db = await A.day(x.b); if (!da || !db) return null;
  let drills = db.drills.filter((x) => da.drills.some((y) => y.id === x.id)).concat(db.drills.filter((x) => !da.drills.some((y) => y.id === x.id))); const how = x.how === "avg" ? "avg" : "best";
  if (x.drill) drills = drills.filter((d) => d.id === Number(x.drill));
  const ownA = new Map(da.drills.map((x) => [x.id, x])), ownB = new Map(db.drills.map((x) => [x.id, x]));
  const vals = async (d) => { const m = new Map(); for (const r of await A.results(d.id)) { const k = `${r.athlete_id}|${r.drill_id}`; if (!m.has(k)) m.set(k, []); m.get(k).push(r.value); } return m; };
  let [va, vb] = [await vals(da), await vals(db)];
  if (f.scoped) { const ok = new Set((await query(`SELECT DISTINCT athlete_id FROM schedule_members m WHERE schedule_id = ANY($1)${f.teamsBy ? " AND (NOT ($2::jsonb ? m.schedule_id::text) OR ($2::jsonb -> m.schedule_id::text) ? m.group_name)" : ""}`, f.teamsBy ? [f.boards, JSON.stringify(f.teamsBy)] : [f.boards])).rows.map((r) => r.athlete_id));
    const keep = (m) => new Map([...m].filter(([k]) => ok.has(+k.split("|")[0]))); va = keep(va); vb = keep(vb); }   // only athletes on the boards in scope
  const ids = [...new Set([...va.keys(), ...vb.keys()].map((k) => +k.split("|")[0]))];
  const ppl0 = ids.length ? (await query(`SELECT a.id, a.first_name, a.last_name, a.birth_year, coalesce((SELECT m.group_name FROM schedule_members m WHERE m.athlete_id=a.id AND m.schedule_id=$2), a.team) AS team FROM athletes a WHERE a.id = ANY($1)`, [ids, db.board_id || da.board_id || 0])).rows : [];
  const ppl = ppl0.filter((p) => (!x.bornFrom || p.birth_year >= x.bornFrom) && (!x.bornTo || p.birth_year <= x.bornTo));
  return { A, da, db, drills, how, va, vb, ownA, ownB, ppl: f.team ? ppl.filter((p) => p.team === f.team) : ppl };
}
const noPair = { cols: [["msg", ""]], rows: [], note: "Pick an assessment and the two testing days to compare (above)." };
async function assessImprove(f) {
  const P = await assessPair(f); if (!P) return noPair;
  const rows = [];
  for (const p of P.ppl) for (const dr of P.drills) {
    const a = P.A.score(P.va.get(`${p.id}|${dr.id}`) || [], P.ownA.get(dr.id) || dr, P.how), b = P.A.score(P.vb.get(`${p.id}|${dr.id}`) || [], P.ownB.get(dr.id) || dr, P.how); if (a == null && b == null) continue;
    const ch = P.A.change(a, b, dr);
    const mA = (P.ownA.get(dr.id) || {}).method || "", mB = (P.ownB.get(dr.id) || dr).method || "";
    rows.push({ id: p.id, name: nm(p), team: p.team || "", drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), method: mA && mB && mA !== mB ? `${mA} → ${mB}` : mB || mA, a, b, diff: ch.diff, pct: ch.pct,
      verdict: [ch.diff == null ? "" : ch.diff > 0 ? "Better" : ch.diff < 0 ? "Worse" : "Same", mA && mB && mA !== mB ? "Method changed" : ""].filter(Boolean).join(" · ") });
  }
  return { cols: [["name", "Athlete"], ["team", "Team"], ["drill", "Drill"], ["method", "Measured with"], ["a", `${P.da.kind} · ${new Date(String(P.da.day.toISOString ? P.da.day.toISOString() : P.da.day).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, "num"], ["b", `${P.db.kind} · ${new Date(String(P.db.day.toISOString ? P.db.day.toISOString() : P.db.day).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, "num"],
      ["diff", "Change (+ = better)", "chg"], ["pct", "Change %", "spct"], ["verdict", ""]], rows, link: (r) => `/admin/assess/athlete/${r.id}`,
    note: `${P.how === "avg" ? "Average" : "Best"} of the tries on each day. Positive change = better, whichever direction the drill counts as better. "Method changed" means the two days were measured differently (e.g. stopwatch, then timing gates), so compare with care.` };
}
async function assessAttend(f) {
  const P = await assessPair(f); if (!P) return noPair;
  const board = P.db.board_id || P.da.board_id, from = P.da.day < P.db.day ? P.da.day : P.db.day, to = P.da.day < P.db.day ? P.db.day : P.da.day;
  const att = new Map(board ? (await query(`SELECT c.athlete_id, count(*) FILTER (WHERE c.attended)::int AS here, count(*)::int AS claimed FROM board_claims c JOIN board_items i ON i.id=c.item_id
      WHERE i.schedule_id=$1 AND c.status='confirmed' AND i.starts_at >= $2::date AND i.starts_at < ($3::date + 1) GROUP BY c.athlete_id`, [board, from, to])).rows.map((r) => [r.athlete_id, r]) : []);
  const rows = [];
  for (const p of P.ppl) {
    const pcts = [], better = []; for (const dr of P.drills) { const ch = P.A.change(P.A.score(P.va.get(`${p.id}|${dr.id}`) || [], P.ownA.get(dr.id) || dr, P.how), P.A.score(P.vb.get(`${p.id}|${dr.id}`) || [], P.ownB.get(dr.id) || dr, P.how), dr); if (ch.pct != null) { pcts.push(ch.pct); better.push(ch.diff > 0); } }
    const t = att.get(p.id) || { here: 0, claimed: 0 };
    rows.push({ id: p.id, name: nm(p), team: p.team || "", sessions: t.here, claimed: t.claimed, avg: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null, improved: pcts.length ? `${better.filter(Boolean).length} of ${pcts.length}` : "" });
  }
  rows.sort((a, b) => b.sessions - a.sessions || (b.avg ?? -999) - (a.avg ?? -999));
  const withAvg = rows.filter((r) => r.avg != null), mid = withAvg.length ? [...withAvg].sort((a, b) => a.sessions - b.sessions)[Math.floor(withAvg.length / 2)].sessions : 0;
  const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b.avg, 0) / xs.length) * 10) / 10 : null);
  const hi = withAvg.filter((r) => r.sessions >= mid && mid > 0), lo = withAvg.filter((r) => r.sessions < mid || mid === 0);
  return { cols: [["name", "Athlete"], ["team", "Team"], ["sessions", "Sessions attended", "num"], ["claimed", "Sessions claimed", "num"], ["avg", "Avg improvement %", "spct"], ["improved", "Drills improved"]],
    rows, link: (r) => `/admin/assess/athlete/${r.id}`,
    note: board ? `Sessions on the linked program between the two testing days. ${withAvg.length > 1 && mid > 0 ? `Athletes who attended ${mid}+ sessions improved ${mean(hi)}% on average; those who attended fewer improved ${mean(lo) ?? "—"}%. This shows an association, not proof that attendance caused the difference.` : ""}` : "Link the testing days to a program to count sessions attended." };
}
async function assessTeams(f) {
  const P = await assessPair(f); if (!P) return noPair;
  const by = new Map();
  for (const p of P.ppl) for (const dr of P.drills) { const ch = P.A.change(P.A.score(P.va.get(`${p.id}|${dr.id}`) || [], P.ownA.get(dr.id) || dr, P.how), P.A.score(P.vb.get(`${p.id}|${dr.id}`) || [], P.ownB.get(dr.id) || dr, P.how), dr); if (ch.pct == null) continue;
    const k = `${p.team || "(no team)"}|${dr.id}`, x = by.get(k) || { team: p.team || "(no team)", drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), n: 0, sum: 0, up: 0 }; x.n++; x.sum += ch.pct; if (ch.diff > 0) x.up++; by.set(k, x); }
  return { cols: [["team", "Team"], ["drill", "Drill"], ["n", "Athletes", "num"], ["avg", "Avg improvement %", "spct"], ["better", "Improved", "pct"]],
    rows: [...by.values()].map((x) => ({ ...x, avg: Math.round((x.sum / x.n) * 10) / 10, better: Math.round((x.up / x.n) * 100) })).sort((a, b) => a.team.localeCompare(b.team) || a.drill.localeCompare(b.drill)), note: "Average change per team and drill (positive = better)." };
}


// ---------- Assessments: the detailed reports (Results, Leaderboard, Best by team, Records) ----------
// One loader: the chosen assessment's testing days (all / a kind / one day), drills (all / one), and every score, per
// athlete × day × drill, judged by that day's own copy of the drill. Filters: team, born (from–to), search (page-level).
async function assessScores(f) {
  const A = require("./assess"); await A.ensure();
  const x = f.assess || {}; if (!x.test) return null;
  let days = x.days || [];
  if (x.dsel && x.dsel !== "all") days = x.dsel.startsWith("k:") ? days.filter((d) => d.kind === x.dsel.slice(2)) : days.filter((d) => d.id === Number(x.dsel));
  if (!days.length) return { rows: [], days, drills: [] };
  const own = new Map(); for (const d of days) for (const dr of await A.dayDrills(d.id, x.test.id)) own.set(`${d.id}|${dr.id}`, dr);
  let drills = [...new Map([...own.values()].map((dr) => [dr.id, dr])).values()].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  if (x.drill) drills = drills.filter((dr) => dr.id === Number(x.drill));
  const ids = drills.map((d) => d.id); if (!ids.length) return { rows: [], days, drills };
  const res = (await query(`SELECT r.day_id, r.athlete_id, r.drill_id, r.attempt, r.value, a.first_name, a.last_name, a.birth_year,
      coalesce((SELECT m.group_name FROM schedule_members m JOIN assess_days d ON d.id=r.day_id WHERE m.schedule_id=d.board_id AND m.athlete_id=a.id), a.team) AS team
    FROM assess_results r JOIN athletes a ON a.id=r.athlete_id WHERE r.day_id = ANY($1) AND r.drill_id = ANY($2)
      ${f.scoped ? `AND EXISTS (SELECT 1 FROM schedule_members m WHERE m.athlete_id=a.id AND m.schedule_id = ANY($3)${f.teamsBy ? " AND (NOT ($4::jsonb ? m.schedule_id::text) OR ($4::jsonb -> m.schedule_id::text) ? m.group_name)" : ""})` : ""} ORDER BY r.attempt`,
      f.scoped ? [days.map((d) => d.id), ids, f.boards, ...(f.teamsBy ? [JSON.stringify(f.teamsBy)] : [])] : [days.map((d) => d.id), ids])).rows;
  const by = new Map();
  for (const r of res) {
    if (f.team && r.team !== f.team) continue;
    if (x.bornFrom && !(r.birth_year >= x.bornFrom)) continue; if (x.bornTo && !(r.birth_year <= x.bornTo)) continue;
    const k = `${r.athlete_id}|${r.day_id}|${r.drill_id}`;
    if (!by.has(k)) by.set(k, { athlete_id: r.athlete_id, name: nm(r), team: r.team || "", born: r.birth_year, day_id: r.day_id, drill_id: r.drill_id, tries: [] });
    by.get(k).tries[r.attempt - 1] = Number(r.value);
  }
  const dayOf = new Map(days.map((d) => [d.id, d])), dl = (d) => `${d.kind} · ${new Date(String(d.day.toISOString ? d.day.toISOString() : d.day).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const rows = [...by.values()].map((r) => { const dr = own.get(`${r.day_id}|${r.drill_id}`); return { ...r, dr, dayLabel: dl(dayOf.get(r.day_id)), dayDate: dayOf.get(r.day_id).day,
    best: A.score(r.tries, dr, "best"), avg: A.score(r.tries, dr, "avg"), score: A.score(r.tries, dr, x.how === "avg" ? "avg" : "best") }; });
  return { rows, days, drills, how: x.how === "avg" ? "avg" : "best", A };
}
const noTest = { cols: [["msg", ""]], rows: [], note: "No assessments yet: App Settings → People → Assessments." };
const unitOf = (dr) => (dr && dr.unit ? ` ${dr.unit}` : "");
const better = (dr, a, b) => (dr.better === "higher" ? b - a : a - b);   // sort: best first
async function assessResults(f) {
  const S = await assessScores(f); if (!S) return noTest;
  const maxT = Math.max(1, ...S.drills.map((d) => d.attempts || 1));
  const rows = S.rows.sort((a, b) => a.name.localeCompare(b.name) || String(a.dayDate).localeCompare(String(b.dayDate)) || (a.dr.sort || 0) - (b.dr.sort || 0))
    .map((r) => ({ id: r.athlete_id, name: r.name, team: r.team, born: r.born, day: r.dayLabel, drill: r.dr.name + (r.dr.unit ? ` (${r.dr.unit})` : ""),
      ...Object.fromEntries([...Array(maxT)].map((_, i) => [`t${i + 1}`, r.tries[i]])), best: r.best, avg: r.avg, method: r.dr.method || "" }));
  return { cols: [["name", "Athlete"], ["team", "Team"], ["born", "Born", "num"], ["day", "Testing day"], ["drill", "Drill"], ...[...Array(maxT)].map((_, i) => [`t${i + 1}`, `Try ${i + 1}`, "num"]), ["best", "Best", "num"], ["avg", "Average", "num"], ["method", "Measured with"]],
    rows, link: (r) => `/admin/assess/athlete/${r.id}`, note: "Every score that matches the filters. Best and Average follow each drill's better direction." };
}
async function assessLeaders(f) {
  const S = await assessScores(f); if (!S) return noTest;
  const top = Number((f.assess || {}).top) || 10, rows = [];
  if ((f.assess || {}).rank === "improved") {   // most improved: first → latest testing day
    for (const dr of S.drills) {
      const list = series(S).filter((x) => x.drill_id === dr.id && x.list.length > 1).map((x) => { const last = x.list[x.list.length - 1]; return { x, last, ch: S.A.change(x.list[0].score, last.score, last.dr) }; })
        .filter((y) => y.ch.pct != null).sort((a, b) => b.ch.pct - a.ch.pct).slice(0, top || undefined);
      list.forEach((y, i) => rows.push({ id: y.x.athlete_id, drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), rank: i + 1, name: y.x.name, team: y.x.team, born: y.x.born, from: y.x.list[0].score, to: y.last.score, score: y.ch.pct, day: y.last.dayLabel }));
    }
    return { cols: [["drill", "Drill"], ["rank", "#", "num"], ["name", "Athlete"], ["team", "Team"], ["born", "Born", "num"], ["from", "First", "num"], ["to", "Latest", "num"], ["score", "Improved %", "spct"], ["day", "Latest test"]],
      rows, note: `${top ? `Top ${top}` : "Everyone"} per drill by improvement from their first to their most recent testing day (athletes tested at least twice). Improvement isn't the only measure of progress; see Progress for each athlete.` };
  }
  for (const dr of S.drills) {
    const best = new Map();   // each athlete's best across the chosen days
    for (const r of S.rows.filter((x) => x.drill_id === dr.id && x.score != null)) { const cur = best.get(r.athlete_id); if (!cur || better(r.dr, r.score, cur.score) < 0) best.set(r.athlete_id, r); }   // keep the better one
    const list = [...best.values()].sort((a, b) => better(dr, a.score, b.score)).slice(0, top || undefined);
    let rank = 0, last = null; list.forEach((r, i) => { if (r.score !== last) rank = i + 1; last = r.score;
      rows.push({ id: r.athlete_id, drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), rank, name: r.name, team: r.team, born: r.born, score: r.score, day: r.dayLabel }); });
  }
  return { cols: [["drill", "Drill"], ["rank", "#", "num"], ["name", "Athlete"], ["team", "Team"], ["born", "Born", "num"], ["score", S.how === "avg" ? "Average" : "Best", "num"], ["day", "Set on"]],
    rows, note: `${top ? `Top ${top}` : "Everyone"} per drill: each athlete's ${S.how === "avg" ? "best average" : "best try"} across the chosen testing days. Fastest times / highest marks first, by each drill's better direction; ties share a rank.` };
}
async function assessTeamBest(f) {
  const S = await assessScores(f); if (!S) return noTest;
  const rows = [];
  for (const dr of S.drills) {
    const teams = new Map();
    for (const r of S.rows.filter((x) => x.drill_id === dr.id && x.score != null)) { const t = r.team || "(no team)", m = teams.get(t) || new Map(), cur = m.get(r.athlete_id); if (!cur || better(r.dr, r.score, cur.score) < 0) m.set(r.athlete_id, r); teams.set(t, m); }
    for (const [team, m] of teams) {
      const v = [...m.values()].sort((a, b) => better(dr, a.score, b.score)), vals = v.map((r) => r.score).sort((a, b) => a - b), mid = Math.floor(vals.length / 2);
      const r3 = (n) => Math.round(n * 100) / 100;
      rows.push({ team, drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), n: v.length, best: v[0].score, who: v[0].name, avg: r3(vals.reduce((a, b) => a + b, 0) / vals.length), median: r3(vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2) });
    }
  }
  rows.sort((a, b) => a.drill.localeCompare(b.drill) || a.team.localeCompare(b.team));
  return { cols: [["team", "Team"], ["drill", "Drill"], ["n", "Tested", "num"], ["best", "Team best", "num"], ["who", "Set by"], ["avg", "Team average", "num"], ["median", "Median", "num"]],
    rows, note: `Each athlete counts once per drill (their ${S.how === "avg" ? "best average" : "best try"} across the chosen testing days).` };
}
async function assessRecords(f) {
  const S = await assessScores(f); if (!S) return noTest;
  const kinds = [...new Set(S.days.map((d) => d.kind))], rows = [];
  for (const dr of S.drills) {
    const list = S.rows.filter((x) => x.drill_id === dr.id && x.score != null); if (!list.length) continue;
    const rec = [...list].sort((a, b) => better(dr, a.score, b.score))[0], avgK = {};
    for (const k of kinds) { const v = list.filter((r) => S.days.find((d) => d.id === r.day_id).kind === k).map((r) => r.score); avgK[`k_${k}`] = v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; }
    rows.push({ drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), better: dr.better === "higher" ? "Higher" : "Lower", record: rec.score, who: rec.name, team: rec.team, on: rec.dayLabel, n: new Set(list.map((r) => r.athlete_id)).size, ...avgK });
  }
  return { cols: [["drill", "Drill"], ["better", "Better"], ["record", "Record", "num"], ["who", "Held by"], ["team", "Team"], ["on", "Set on"], ["n", "Athletes", "num"], ...kinds.map((k) => [`k_${k}`, `${k} avg`, "num"])],
    rows, note: "The best mark for each drill across the chosen testing days, and the average on each kind of day (e.g. Baseline vs Final)." };
}


// ---------- the Overview dashboard ----------
// KPI definitions (all within the active filters: boards, date range, team, level, location, weekdays):
//  Total claims        active claims (status confirmed) on program & volunteer sessions in the range
//  Unique participants distinct athletes with an active claim (stable athlete ids, so boards don't double-count)
//  Attendance rate     attended ÷ (attended + no-shows) on past sessions; unrecorded and future sessions don't count
//  Upcoming sessions   sessions in the range that haven't started
//  Available spots     Σ max(capacity − spots taken, 0) on upcoming sessions (walk-ins / extra spots don't take spots)
//  Waitlisted          waitlist entries on upcoming sessions
//  No-shows            claims marked No-show on past sessions in the range
//  Unfilled volunteer  available spots on upcoming volunteer-board sessions
// RSVP boards are left out of claim and capacity numbers (an answer isn't a claim); they have their own report.
async function dashboard(f) {
  const all = await sessions(f), now = Date.now(), started = (s) => new Date(s.starts_at).getTime() <= now, ended = (s) => new Date(s.ends_at || s.starts_at).getTime() < now;
  const work = all.filter((s) => s.board_type !== "rsvp"), up = work.filter((s) => !started(s)), past = work.filter(ended);
  const claims = await claimsIn(f, { past: false, statuses: ["confirmed"] }), cl = claims.filter((c) => c.board_type !== "rsvp");
  const sum = (xs, k) => xs.reduce((t, x) => t + (Number(x[k]) || 0), 0), open = (s) => (s.capacity ? Math.max(s.capacity - s.taken, 0) : 0);
  const here = sum(past, "here"), ns = sum(past, "noshow"), capUp = up.filter((s) => s.capacity), takenUp = sum(capUp.map((s) => ({ t: Math.min(s.taken, s.capacity) })), "t"), availUp = sum(capUp.map((s) => ({ o: open(s) })), "o");
  const fmtD = (d) => new Date(d).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const awaiting = past.filter((s) => s.unmarked > 0).length, wlSessions = up.filter((s) => s.waitlisted > 0);
  const attn = await attention(f, all);
  const kpis = [
    ["claims", "Active claims", cl.length, "", `${new Set(cl.map((c) => c.athlete_id)).size} unique participants`, { r: "all", cs: "confirmed" }],
    ["upcoming", "Upcoming sessions", up.length, "", up.length ? `Next: ${fmtD(up[0].starts_at)}` : "None scheduled", { r: "upcoming" }],
    ["capacity", "Capacity", capUp.length ? pct(takenUp, takenUp + availUp) : null, "%", capUp.length ? `${takenUp} claimed · ${availUp} available` : "No upcoming spots", { r: "upcoming" }],
    ["att", "Attendance", here + ns ? pct(here, here + ns) : null, "%", here + ns ? `${awaiting} session${awaiting === 1 ? "" : "s"} awaiting check-in` : awaiting ? `No attendance recorded yet · ${awaiting} awaiting` : "No attendance recorded yet", { r: "attendance" }],
    ["wait", "Waitlists", sum(up, "waitlisted"), "", `${wlSessions.length} session${wlSessions.length === 1 ? "" : "s"} with waitlists`, { r: "waitlists" }],
    ["attn", "Needs attention", attn.filter((a) => a.sev >= 2).length, "", `${attn.filter((a) => a.sev === 3).length} high priority`, { anchor: "attention" }],
  ];
  // charts (only drawn when they have data)
  const wk = (d) => { const x = new Date(new Date(d).toLocaleString("en-US", { timeZone: TZ })); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const lbl = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const byWeek = new Map(); for (const c of cl) { const k = wk(c.created_at || c.starts_at).getTime(); byWeek.set(k, (byWeek.get(k) || 0) + 1); }
  const claimsOverTime = [...byWeek].sort((a, b) => a[0] - b[0]).slice(-16).map(([k, n]) => ({ label: lbl(new Date(k)), value: n }));
  const attW = new Map(); for (const s of past) { const k = wk(s.starts_at).getTime(), x = attW.get(k) || { h: 0, n: 0 }; x.h += s.here; x.n += s.noshow; attW.set(k, x); }
  const attendanceTrend = [...attW].sort((a, b) => a[0] - b[0]).slice(-16).filter(([, x]) => x.h + x.n).map(([k, x]) => ({ label: lbl(new Date(k)), value: pct(x.h, x.h + x.n) }));
  const grpCap = new Map(), multi = new Set(up.map((s) => s.board_id)).size > 1;
  for (const s of capUp) { const k = multi ? s.board : (s.path || "").split(" › ")[0] || s.board, x = grpCap.get(k) || { taken: 0, open: 0 }; x.taken += Math.min(s.taken, s.capacity); x.open += open(s); grpCap.set(k, x); }
  const capacity = [...grpCap].map(([label, x]) => ({ label, value: x.taken, value2: x.open })).slice(0, 12);
  // participation by team: athletes with a claim out of the team's roster (people on the boards in view)
  const roster = new Map(); for (const m of await members(f)) { if (m.board_type === "rsvp") continue; const k = m.team || "(no team)"; if (!roster.has(k)) roster.set(k, new Set()); roster.get(k).add(m.id); }
  const active = new Map(); for (const c of cl) { const k = c.team || "(no team)"; if (!active.has(k)) active.set(k, new Set()); active.get(k).add(c.athlete_id); }
  const teams = [...roster].map(([label, ppl]) => { const n = [...(active.get(label) || [])].filter((id) => ppl.has(id)).length; return { label, value: pct(n, ppl.size), text: `${n} of ${ppl.size}` }; }).sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 12);
  const utilization = multi || new Set(work.map((s) => s.board_id)).size > 1 ? [...new Map(capUp.map((s) => [s.board_id, s.board]))].map(([id, name]) => {
    const xs = capUp.filter((s) => s.board_id === id); return { label: name, value: pct(sum(xs.map((s) => ({ t: Math.min(s.taken, s.capacity) })), "t"), sum(xs, "capacity")) }; }) : [];
  const upcoming = up.slice(0, 8).map((s) => ({ ...s, open: open(s) }));
  return { kpis, claimsOverTime, attendanceTrend, capacity, teams, utilization, upcoming, attention: attn, kinds: [...new Set(all.map((s) => s.board_type))] };
}
// ---------- Needs attention ----------
// Facts (no threshold needed): over capacity, open spots while people wait, past sessions with attendance not recorded,
// upcoming volunteer shifts not covered, repeated no-shows (3+). Thresholds set per board (Board → Notifications →
// Needs attention): low enrollment (under X% full within N days of the session) and near capacity (X% full or more).
async function attention(f, all) {
  const now = Date.now(), out = [];
  for (const s of all.filter((x) => x.board_type !== "rsvp")) {
    const t = s.thresholds || {}, startsIn = (new Date(s.starts_at).getTime() - now) / 864e5, past = new Date(s.ends_at || s.starts_at).getTime() < now, fillP = s.capacity ? pct(s.taken, s.capacity) : null;
    const add = (kind, sev, issue, count, action) => out.push({ kind, sev, issue, count, action, session: s.session, board: s.board, board_id: s.board_id, item_id: s.id, when: s.starts_at });
    if (!past && s.capacity && s.taken > s.capacity) add("over", 3, "Over capacity", `${s.taken} / ${s.capacity}`, "session");
    if (!past && s.waitlisted && s.capacity && s.taken < s.capacity) add("waitopen", 3, "Open spots while people wait", `${s.capacity - s.taken} open · ${s.waitlisted} waiting`, "waitlist");
    if (past && s.unmarked > 0) add("unrecorded", 2, "Attendance not recorded", `${s.unmarked} not checked in`, "checkin");
    if (!past && s.board_type === "volunteer" && s.capacity && s.taken < s.capacity && startsIn <= (Number(t.min_days) || 14)) add("vol", 2, "Volunteer shift needs people", `${s.capacity - s.taken} of ${s.capacity} open`, "session");
    if (!past && t.min_pct && s.capacity && startsIn >= 0 && startsIn <= (Number(t.min_days) || 0) && fillP < Number(t.min_pct)) add("low", 2, `Low enrollment (under ${t.min_pct}%)`, `${s.taken} / ${s.capacity}`, "session");
    if (!past && t.near_pct && s.capacity && fillP >= Number(t.near_pct) && s.taken < s.capacity) add("near", 2, `Nearly full (${t.near_pct}%+)`, `${s.taken} / ${s.capacity}`, "session");
  }
  const seen = new Set();
  for (const r of (await noshows(f)).rows.filter((r) => r.flag)) { if (seen.has(r.id)) continue; seen.add(r.id); out.push({ kind: "noshows", sev: 2, issue: `Repeated no-shows (${REPEAT}+)`, count: `${r.total} no-shows`, session: r.name, board: "", athlete_id: r.id, when: r.when, action: "person" }); }
  // families never signed in (one item)
  const never = (await engagement(f)).rows.filter((r) => r.status === "Never signed in");
  if (never.length) out.push({ kind: "engage", sev: 2, issue: "Families never signed in", count: `${never.length} athlete${never.length === 1 ? "" : "s"}`, session: never.slice(0, 3).map((r) => r.name).join(", ") + (never.length > 3 ? "…" : ""), board: "", when: new Date(), action: "families" });
  // email delivery problems in the last 30 days (admins only)
  if (f.admin) { await require("./emailLog").ensure(); const n = (await query(`SELECT count(DISTINCT lower(to_addr))::int AS n FROM email_log WHERE (status='failed' OR delivery IN ('bounced','complained')) AND at > now() - interval '30 days'`)).rows[0].n;
    if (n) out.push({ kind: "email", sev: 3, issue: "Email delivery problems", count: `${n} address${n === 1 ? "" : "es"}`, session: "Bounced, marked as spam or refused in the last 30 days", board: "", when: new Date(), action: "emails" }); }
  // informational: the last 7 days
  const recent = (await query(`SELECT count(*) FILTER (WHERE c.status='waitlisted' AND c.created_at > now() - interval '7 days')::int AS wl,
      count(*) FILTER (WHERE c.status='canceled' AND c.rsvp IS NULL AND c.canceled_at > now() - interval '7 days')::int AS rel
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id WHERE i.schedule_id = ANY($1) AND sc.board_type <> 'rsvp'${teamCond(f, [f.boards], "i.schedule_id", "c.athlete_id").replace(/\$2/g, "$2")}`, f.teamsBy ? [f.boards, JSON.stringify(f.teamsBy)] : [f.boards])).rows[0];
  if (recent.wl) out.push({ kind: "newwait", sev: 1, issue: "New waitlist activity", count: `${recent.wl} in the last 7 days`, session: "", board: "", when: new Date(), action: "waitlists" });
  if (recent.rel) out.push({ kind: "released", sev: 1, issue: "Released claims", count: `${recent.rel} in the last 7 days`, session: "", board: "", when: new Date(), action: "released" });
  return out.sort((a, b) => b.sev - a.sev || new Date(a.when) - new Date(b.when)).slice(0, 60);
}


// ---------- Assessments: progress over time (initial → latest, best, personal bests) ----------
const dstr = (d) => String(d && d.toISOString ? d.toISOString() : d);
function series(S) {   // athlete × drill → results in date order, each judged by that day's own drill settings
  const m = new Map();
  for (const r of S.rows) { if (r.score == null) continue; const k = `${r.athlete_id}|${r.drill_id}`; if (!m.has(k)) m.set(k, { athlete_id: r.athlete_id, name: r.name, team: r.team, born: r.born, drill_id: r.drill_id, list: [] }); m.get(k).list.push(r); }
  for (const x of m.values()) x.list.sort((a, b) => dstr(a.dayDate).localeCompare(dstr(b.dayDate)));
  return [...m.values()];
}
const better2 = (dr, a, b) => (dr.better === "higher" ? b > a : b < a);
async function assessProgress(f) {
  const S = await assessScores(f); if (!S) return noTest;
  if (!S.rows.length) return { cols: [["msg", ""]], rows: [], note: "No results for these filters yet." };
  const drillOf = new Map(S.drills.map((d) => [d.id, d])), rows = [];
  for (const x of series(S)) {
    const dr = drillOf.get(x.drill_id) || x.list[x.list.length - 1].dr, first = x.list[0], last = x.list[x.list.length - 1];
    let best = first; for (const r of x.list) if (better2(r.dr, best.score, r.score)) best = r;
    const ch = x.list.length > 1 ? S.A.change(first.score, last.score, last.dr) : { diff: null, pct: null };
    rows.push({ id: x.athlete_id, name: x.name, team: x.team, drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), better: dr.better === "higher" ? "Higher" : "Lower",
      initial: first.score, latest: last.score, best: best.score, pb: x.list.length > 1 && best === last ? "Personal best" : "", diff: ch.diff, pct: ch.pct, tests: x.list.length,
      verdict: x.list.length < 2 ? "More testing needed" : ch.diff > 0 ? "Improved" : ch.diff < 0 ? "Declined" : "Same" });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.drill.localeCompare(b.drill));
  return { cols: [["name", "Athlete"], ["team", "Team"], ["drill", "Drill"], ["better", "Better"], ["initial", "Initial", "num"], ["latest", "Latest", "num"], ["best", "Best", "num"], ["pb", ""], ["diff", "Change (+ = better)", "chg"], ["pct", "Change %", "spct"], ["tests", "Tests", "num"], ["verdict", ""]],
    rows, link: (r) => `/reports?r=assessAthlete&pid=${r.id}`, note: `${S.how === "avg" ? "Average" : "Best"} of the tries on each testing day; initial = their first testing day, latest = their most recent. Change is positive when they got better, whichever direction the drill counts as better. Click a name for their progress charts.` };
}
async function assessAthlete(f, pid) {
  const S = await assessScores(f); if (!S) return { person: null, empty: "No assessments yet." };
  const mine = series(S).filter((x) => x.athlete_id === pid);
  const p = (await query(`SELECT id, first_name, last_name, team FROM athletes WHERE id=$1`, [pid])).rows[0];
  if (!p || !mine.length) return { person: null, empty: "No results for this athlete with these filters (or they're not on your boards)." };
  const drillOf = new Map(S.drills.map((d) => [d.id, d]));
  const drills = mine.map((x) => { const dr = drillOf.get(x.drill_id) || x.list[x.list.length - 1].dr, first = x.list[0], last = x.list[x.list.length - 1];
    let best = first; for (const r of x.list) if (better2(r.dr, best.score, r.score)) best = r;
    const ch = x.list.length > 1 ? S.A.change(first.score, last.score, last.dr) : null;
    return { name: dr.name, unit: dr.unit || "", better: dr.better, method: dr.method || "", points: x.list.map((r) => ({ label: r.dayLabel, value: r.score })), initial: first.score, latest: last.score, best: best.score, pb: x.list.length > 1 && best === last,
      summary: !ch ? "One testing day so far: more testing is needed to show improvement." : `${ch.diff > 0 ? "Improved" : ch.diff < 0 ? "Declined" : "No change"} by ${Math.abs(ch.diff)}${dr.unit ? " " + dr.unit : ""}${ch.pct != null ? ` (${Math.abs(ch.pct)}%)` : ""} since their first test.` }; });
  return { person: p, test: f.assess.test.name, drills, cols: [["drill", "Drill"], ["initial", "Initial", "num"], ["latest", "Latest", "num"], ["best", "Best", "num"], ["summary", "Progress"]],
    rows: drills.map((d) => ({ drill: d.name, initial: d.initial, latest: d.latest, best: d.best, summary: d.summary })), note: `${p.first_name} ${p.last_name || ""}: ${f.assess.test.name}.` };
}
async function assessTeamProgress(f) {
  const S = await assessScores(f); if (!S) return noTest;
  const by = new Map();
  for (const x of series(S)) {
    const k = `${x.team || "(no team)"}|${x.drill_id}`, dr = x.list[x.list.length - 1].dr, t = by.get(k) || { team: x.team || "(no team)", drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), tested: 0, multi: 0, sum: 0, sumP: 0, nP: 0, up: 0 };
    t.tested++;
    if (x.list.length > 1) { const ch = S.A.change(x.list[0].score, x.list[x.list.length - 1].score, dr); t.multi++; t.sum += ch.diff || 0; if (ch.pct != null) { t.sumP += ch.pct; t.nP++; } if (ch.diff > 0) t.up++; }
    by.set(k, t);
  }
  const rows = [...by.values()].map((t) => ({ team: t.team, drill: t.drill, tested: t.tested, multi: t.multi, avg: t.multi ? Math.round((t.sum / t.multi) * 100) / 100 : null, avgP: t.nP ? Math.round((t.sumP / t.nP) * 10) / 10 : null, improved: t.multi ? pct(t.up, t.multi) : null }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.drill.localeCompare(b.drill));
  return { cols: [["team", "Team"], ["drill", "Drill"], ["tested", "Athletes tested", "num"], ["multi", "With 2+ tests", "num"], ["avg", "Avg change", "chg"], ["avgP", "Avg change %", "spct"], ["improved", "Improved", "pct"]],
    rows, note: "Change = each athlete's first to most recent testing day (only athletes tested at least twice), positive = better. Athletes tested once count as tested but can't show improvement yet." };
}

// ---------- Overview ----------
async function overview(f, required) {
  const [a, n, u, fl, rv, en, vo, em] = await Promise.all([attendance(f), noshows(f), unchecked(f), fill(f), rsvpEvents(f), engagement(f), volunteer(f, required), emailProblems(f)]);
  const sum = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const here = sum(a.rows, "here"), ns = sum(a.rows, "noshow"), cl = sum(fl.rows, "claimed"), cap = sum(fl.rows, "capacity");
  const rvOpen = sum(rv.rows, "open"), rvAns = sum(rv.rows, "going") + sum(rv.rows, "no");
  return { tiles: [
    ["attendance", "Attendance", pct(here, here + ns), "%", `${here} attended · ${ns} no-shows`],
    ["noshows", "Repeat no-shows", new Set(n.rows.filter((r) => r.flag).map((r) => r.id)).size, "", `athletes with ${REPEAT}+ no-shows`],
    ["unchecked", "Check-ins not done", u.rows.length, "", "past sessions not finished"],
    ["fill", "Sessions full", pct(cl, cap), "%", `${cl} of ${cap} spots claimed`],
    ["rsvp", "RSVP answered", pct(rvAns, rvOpen), "%", `${rvAns} of ${rvOpen} answers in`],
    ["engagement", "Families signed in", pct(en.rows.filter((r) => r.signed_in).length, en.rows.length), "%", `${en.rows.filter((r) => r.status === "Active").length} active of ${en.rows.length}`],
    ["volunteer", "Volunteer hours", Math.round(sum(vo.rows, "hours")), "", required ? `${vo.rows.filter((r) => r.status === "Done").length} of ${vo.rows.length} families done` : `${vo.rows.length} families`],
    ["emails", "Email problems", em.rows.length, "", "addresses to fix"]] };
}
module.exports = { assessProgress, assessAthlete, assessTeamProgress, attendanceSessions, personView, rsvpAnswers, teamsReport, coverage, dashboard, attention, assessResults, assessLeaders, assessTeamBest, assessRecords, assessImprove, assessAttend, assessTeams, claimsAll, claimsByPerson, attendance, noshows, unchecked, fill, busiest, waitlists, locations, rsvpEvents, rsvpAthletes, engagement, notSignedUp, volunteer, emailProblems, weekSheet, overview, REPEAT };
