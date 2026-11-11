// The data behind Reports. Each report returns { cols: [[key, label, kind]], rows: [...], note? } so the page and the
// CSV download share one shape. kind: "num" | "pct" | "date" | "dt" | undefined (text). Every report is limited to
// the boards in scope (ids), the date range (local dates, inclusive), and, when given, a team.
const { query } = require("./db");
const { slotName } = require("./time");
const TZ = "America/Chicago";
const span = (a, b) => [`(${a}::date)::timestamp AT TIME ZONE '${TZ}'`, `((${b}::date) + 1)::timestamp AT TIME ZONE '${TZ}'`];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
// the extra filters every session-based report shares: level (node ids, the level and everything inside it), location, weekdays
function more(f, args) {
  const w = [];
  if (f.levels && f.levels.length) { args.push(f.levels); w.push(`i.node_id = ANY($${args.length})`); }
  if (f.location) { args.push(f.location); w.push(`coalesce(nullif(i.location,''), sc.event_location) = $${args.length}`); }
  if (f.days && f.days.length) { args.push(f.days); w.push(`EXTRACT(DOW FROM i.starts_at AT TIME ZONE '${TZ}')::int = ANY($${args.length})`); }
  return w.length ? ` AND ${w.join(" AND ")}` : "";
}

// sessions in range, with their level path and counts
async function sessions(f) {
  const { boards, from, to, past = false } = f, [lo, hi] = span("$2", "$3"), args = [boards, from, to], x = more(f, args);
  return (await query(`SELECT i.id, i.title, i.starts_at, i.ends_at, i.capacity, coalesce(nullif(i.location,''), sc.event_location) AS location, i.schedule_id AS board_id, sc.name AS board, sc.board_type, sc.question,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path,
      count(c.*) FILTER (WHERE c.status='confirmed')::int AS claimed, count(c.*) FILTER (WHERE c.status='waitlisted')::int AS waitlisted,
      count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended)::int AS here, count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended = false)::int AS noshow,
      count(c.*) FILTER (WHERE c.status='confirmed' AND c.attended IS NULL)::int AS unmarked
    FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id LEFT JOIN board_claims c ON c.item_id=i.id
    WHERE i.schedule_id = ANY($1) AND i.canceled_at IS NULL AND i.starts_at IS NOT NULL AND i.starts_at >= ${lo} AND i.starts_at < ${hi} ${past ? "AND coalesce(i.ends_at, i.starts_at) < now()" : ""}${x}
    GROUP BY i.id, sc.name, sc.board_type, sc.event_location, sc.question ORDER BY i.starts_at, i.id`, args)).rows.map((s) => ({ ...s, session: [s.path, s.title && s.path ? s.title : ""].filter(Boolean).join(" › ") || s.title || "Session" }));
}
// confirmed claims on past sessions in range (for attendance)
async function claimsIn(f, { past = true, statuses = ["confirmed"] } = {}) {
  const [lo, hi] = span("$2", "$3"), args = [f.boards, f.from, f.to, statuses];
  let x = more(f, args); if (f.team) { args.push(f.team); x += ` AND m.group_name = $${args.length}`; }
  return (await query(`SELECT c.id, c.status, c.attended, c.walk_in, c.note, c.counts, c.added_by_admin, c.rsvp, a.id AS athlete_id, a.first_name, a.last_name, m.group_name AS team, i.id AS item_id, i.title, i.starts_at, i.ends_at,
      sc.name AS board, sc.board_type, i.schedule_id AS board_id, coalesce(nullif(i.location,''), sc.event_location) AS location,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id
    LEFT JOIN schedule_members m ON m.schedule_id=i.schedule_id AND m.athlete_id=a.id
    WHERE i.schedule_id = ANY($1) AND c.status = ANY($4) AND i.canceled_at IS NULL AND i.starts_at >= ${lo} AND i.starts_at < ${hi}${past ? " AND coalesce(i.ends_at, i.starts_at) < now()" : ""}${x}
    ORDER BY i.starts_at, lower(a.last_name), lower(a.first_name)`, args)).rows;
}
const pastClaims = (f) => claimsIn(f);
const nm = (r) => `${r.first_name} ${r.last_name || ""}`.trim();
const REPEAT = 3;   // no-shows that count as "repeat"

// ---------- Claims ----------
const stat = (c) => c.status === "waitlisted" ? "Waitlist" : c.board_type === "rsvp" ? "Going" : c.walk_in ? "Walk-in" : c.added_by_admin ? "Added by admin" : "Claimed";
const att = (c) => c.attended == null ? "" : c.attended ? "Here" : "No-show";
async function claimsAll(f) {
  const rows = (await claimsIn(f, { past: false, statuses: ["confirmed", "waitlisted"] })).map((c) => ({ id: c.athlete_id, name: nm(c), team: c.team || "", session: [c.path, c.title && c.path ? c.title : ""].filter(Boolean).join(" › ") || c.title || "Session",
    when: c.starts_at, board: c.board, location: c.location || "", status: stat(c), attended: att(c), note: c.note || "" }));
  return { cols: [["name", "Name"], ["team", "Team"], ["session", "Session"], ["when", "When", "dt"], ["board", "Board"], ["location", "Location"], ["status", "Status"], ["attended", "Attended"], ["note", "Answer / note"]],
    rows, link: (r) => `/admin/people/${r.id}`, note: "Every claim (and waitlist spot) in the range that matches the filters." };
}
async function claimsByPerson(f) {
  const by = new Map();
  for (const c of await claimsIn(f, { past: false, statuses: ["confirmed", "waitlisted"] })) {
    const p = by.get(c.athlete_id) || { id: c.athlete_id, name: nm(c), team: c.team || "", claimed: 0, waitlisted: 0, here: 0, noshow: 0, next: null, last: null };
    if (c.status === "waitlisted") p.waitlisted++; else p.claimed++; if (c.attended === true) p.here++; if (c.attended === false) p.noshow++;
    const t = new Date(c.starts_at); if (t > new Date()) { if (!p.next || t < p.next) p.next = t; } else if (!p.last || t > p.last) p.last = t;
    by.set(c.athlete_id, p);
  }
  return { cols: [["name", "Name"], ["team", "Team"], ["claimed", "Claimed", "num"], ["waitlisted", "Waitlisted", "num"], ["here", "Attended", "num"], ["noshow", "No-shows", "num"], ["last", "Last one", "dt"], ["next", "Next one", "dt"]],
    rows: [...by.values()].sort((a, b) => a.name.localeCompare(b.name)), link: (r) => `/admin/people/${r.id}`, note: "Each person's claims in the range that match the filters." };
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
async function unchecked(f) {
  const rows = (await sessions({ ...f, past: true })).filter((s) => s.unmarked > 0);
  const coaches = new Map((await query(`SELECT schedule_id, string_agg(email, ', ' ORDER BY email) AS e FROM schedule_coaches WHERE schedule_id = ANY($1) GROUP BY schedule_id`, [f.boards])).rows.map((r) => [r.schedule_id, r.e]));
  return { cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["claimed", "Claimed", "num"], ["unmarked", "Not checked in", "num"], ["coaches", "Coaches"]],
    rows: rows.reverse().map((s) => ({ id: s.id, when: s.starts_at, session: s.session, board: s.board, claimed: s.claimed, unmarked: s.unmarked, coaches: coaches.get(s.board_id) || "" })),
    link: (r) => `/checkin/i/${r.id}`, note: "Past sessions where someone who claimed was never marked Here or No-show. Open one to finish it." };
}
// ---------- Sessions ----------
async function fill(f) {
  const rows = (await sessions(f)).filter((s) => s.board_type !== "rsvp");
  return { cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["capacity", "Spots", "num"], ["claimed", "Claimed", "num"], ["fill", "Full", "pct"], ["waitlisted", "Waitlist", "num"], ["here", "Attended", "num"]],
    rows: rows.map((s) => ({ id: s.id, when: s.starts_at, session: s.session, board: s.board, capacity: s.capacity, claimed: s.claimed, fill: pct(s.claimed, s.capacity), waitlisted: s.waitlisted, here: s.here, board_id: s.board_id })),
    link: (r) => `/admin/b/${r.board_id}/items/${r.id}/people`, note: "How full each session is. Sort by Full to find what's always full (add more) or always empty." };
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
  return { cols: [["when", "When", "dt"], ["session", "Session"], ["board", "Board"], ["capacity", "Spots", "num"], ["claimed", "Claimed", "num"], ["waitlisted", "Waiting", "num"]],
    rows: rows.map((s) => ({ id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, capacity: s.capacity, claimed: s.claimed, waitlisted: s.waitlisted })).sort((a, b) => b.waitlisted - a.waitlisted),
    link: (r) => `/admin/b/${r.board_id}/items/${r.id}/people`, note: "Sessions with people waiting for a spot right now, most waiting first: where more room would help." };
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
  const R = require("./rsvp"), rows = [];
  for (const s of (await sessions(f)).filter((x) => x.board_type === "rsvp")) {
    const r = await R.summary(s.id); if (!r) continue;
    const open = r.going.length + r.no.length + r.none.length, noShow = (await query(`SELECT count(*)::int AS n FROM board_claims WHERE item_id=$1 AND status='confirmed' AND attended = false`, [s.id])).rows[0].n;
    rows.push({ id: s.id, board_id: s.board_id, when: s.starts_at, session: s.session, board: s.board, open, answered: pct(r.going.length + r.no.length, open), going: r.going.length, no: r.no.length, none: r.none.length, noshow: noShow });
  }
  return { cols: [["when", "When", "dt"], ["session", "Event"], ["board", "Board"], ["open", "On the list", "num"], ["answered", "Answered", "pct"], ["going", "Going", "num"], ["no", "Can't", "num"], ["none", "No answer", "num"], ["noshow", "Said Going, didn't come", "num"]],
    rows, link: (r) => `/admin/b/${r.board_id}/items/${r.id}/people`, note: "Each RSVP event in the range. \"Said Going, didn't come\" counts Going answers marked No-show at check-in." };
}
async function rsvpAthletes(f) {
  const R = require("./rsvp"), by = new Map();
  for (const s of (await sessions(f)).filter((x) => x.board_type === "rsvp")) {
    const r = await R.summary(s.id); if (!r) continue;
    for (const [list, k] of [[r.going, "going"], [r.no, "no"], [r.none, "none"]]) for (const p of list) {
      if (f.team && p.group_name !== f.team && p.team !== f.team) continue;
      const x = by.get(p.id) || { id: p.id, name: nm(p), team: p.group_name || p.team || "", events: 0, going: 0, no: 0, none: 0 }; x.events++; x[k]++; by.set(p.id, x);
    }
  }
  const rows = [...by.values()].map((x) => ({ ...x, answered: pct(x.going + x.no, x.events) })).sort((a, b) => (a.answered ?? 101) - (b.answered ?? 101) || a.name.localeCompare(b.name));
  return { cols: [["name", "Athlete"], ["team", "Team"], ["events", "Events", "num"], ["answered", "Answered", "pct"], ["going", "Going", "num"], ["no", "Can't", "num"], ["none", "No answer", "num"]],
    rows, link: (r) => `/admin/people/${r.id}`, note: "How often each athlete (or their family) answers. Lowest first." };
}
// ---------- Families ----------
async function members(f) {
  return (await query(`SELECT m.schedule_id AS board_id, sc.name AS board, sc.board_type, a.id, a.first_name, a.last_name, m.group_name AS team,
      ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id ORDER BY u.email) AS parents,
      (SELECT email FROM users WHERE id=a.self_user_id) AS own,
      (SELECT max(u.last_login_at) FROM users u WHERE u.id=a.self_user_id OR u.id IN (SELECT user_id FROM parent_athletes WHERE athlete_id=a.id)) AS signed_in,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=m.schedule_id AND c.athlete_id=a.id AND c.status<>'canceled') AS claims
    FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id JOIN athletes a ON a.id=m.athlete_id
    WHERE m.schedule_id = ANY($1) AND a.archived_at IS NULL ${f.team ? "AND m.group_name = $2" : ""} ORDER BY lower(a.last_name), lower(a.first_name)`, f.team ? [f.boards, f.team] : [f.boards])).rows;
}
async function engagement(f) {
  const by = new Map();
  for (const m of await members(f)) {
    const x = by.get(m.id) || { id: m.id, name: nm(m), team: m.team || "", boards: [], claims: 0, signed_in: m.signed_in, emails: [...new Set([m.own, ...(m.parents || [])].filter(Boolean))].join(", ") };
    x.boards.push(m.board); x.claims += m.claims; by.set(m.id, x);
  }
  const rows = [...by.values()].map((x) => ({ ...x, boards: x.boards.join(", "), status: !x.emails ? "No account" : !x.signed_in ? "Never signed in" : !x.claims ? "Signed in, no claims" : "Active" }))
    .sort((a, b) => ["No account", "Never signed in", "Signed in, no claims", "Active"].indexOf(a.status) - ["No account", "Never signed in", "Signed in, no claims", "Active"].indexOf(b.status) || a.name.localeCompare(b.name));
  return { cols: [["name", "Athlete"], ["team", "Team"], ["status", "Status"], ["signed_in", "Last sign-in (them or family)", "date"], ["claims", "Claims", "num"], ["boards", "Boards"], ["emails", "Emails"]],
    rows, link: (r) => `/admin/people/${r.id}`, note: "Everyone on the boards in scope. Download CSV for the emails to send a reminder." };
}
async function notSignedUp(f) {
  const rows = (await members(f)).filter((m) => m.board_type !== "rsvp" && m.claims === 0);
  return { cols: [["name", "Athlete"], ["team", "Team"], ["board", "Board"], ["status", "Signed in"], ["emails", "Emails"]],
    rows: rows.map((m) => ({ id: m.id, name: nm(m), team: m.team || "", board: m.board, status: m.signed_in ? "Yes" : (m.own || (m.parents || []).length) ? "Never" : "No account", emails: [...new Set([m.own, ...(m.parents || [])].filter(Boolean))].join(", ") })),
    link: (r) => `/admin/people/${r.id}`, note: "On a board's list with no claims on it at all: likely the families who need a personal reminder." };
}
async function volunteer(f, required) {
  const [lo, hi] = span("$2", "$3"), volArgs = [f.boards, f.from, f.to], volX = more(f, volArgs);
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
        (array_agg(coalesce(CASE e.delivery WHEN 'bounced' THEN 'Bounced' WHEN 'complained' THEN 'Marked as spam' END, e.error, 'Failed') ORDER BY e.at DESC))[1] AS why
      FROM email_log e WHERE (e.status='failed' OR e.delivery IN ('bounced','complained')) AND e.at >= ${lo} AND e.at < ${hi} GROUP BY lower(e.to_addr))
    SELECT b.*, p.id AS person, p.name FROM bad b LEFT JOIN LATERAL (SELECT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name FROM athletes a LEFT JOIN users u ON u.id=a.self_user_id
      WHERE (lower(u.email)=b.addr OR lower(a.email)=b.addr) AND a.archived_at IS NULL ORDER BY a.kind DESC LIMIT 1) p ON true ORDER BY b.last DESC`, [f.from, f.to])).rows;
  return { cols: [["addr", "Email address"], ["name", "Person"], ["why", "Problem"], ["n", "Times", "num"], ["last", "Last", "dt"]],
    rows: rows.map((r) => ({ ...r, id: r.person })), link: (r) => (r.id ? `/admin/people/${r.id}` : `/admin/email-log?q=${encodeURIComponent(r.addr)}`),
    note: "Addresses that bounced, were marked as spam, or Resend refused, in the date range. Fix the address on the person's page. (Check delivery in the Email log first to catch recent bounces.)" };
}
// ---------- Week sheet ----------
async function weekSheet(f) {
  const start = f.weekFrom, end = new Date(new Date(start + "T12:00:00").getTime() + 6 * 864e5).toISOString().slice(0, 10);
  const list = await sessions({ ...f, from: start, to: end });
  for (const s of list) { const q = s.question || {}; s.showNotes = s.board_type === "rsvp" || !!(q.label && q.week); s.qLabel = s.board_type === "rsvp" ? "" : q.week ? q.label || "" : ""; }
  for (const s of list) s.people = (await query(`SELECT a.first_name, a.last_name, m.group_name AS team, c.note, c.status FROM board_claims c JOIN athletes a ON a.id=c.athlete_id
      LEFT JOIN schedule_members m ON m.schedule_id=$2 AND m.athlete_id=a.id WHERE c.item_id=$1 AND c.status IN ('confirmed','waitlisted') ORDER BY c.status, lower(a.last_name), lower(a.first_name)`, [s.id, s.board_id])).rows;
  return { week: true, start, end, sessions: list };
}

// ---------- Assessments (baseline → final, and against attendance) ----------
async function assessPair(f) {
  const A = require("./assess"); await A.ensure();
  const x = f.assess || {}; if (!x.a || !x.b) return null;
  const da = await A.day(x.a), db = await A.day(x.b); if (!da || !db) return null;
  const drills = db.drills.filter((x) => da.drills.some((y) => y.id === x.id)).concat(db.drills.filter((x) => !da.drills.some((y) => y.id === x.id))), how = x.how === "avg" ? "avg" : "best";
  const ownA = new Map(da.drills.map((x) => [x.id, x])), ownB = new Map(db.drills.map((x) => [x.id, x]));
  const vals = async (d) => { const m = new Map(); for (const r of await A.results(d.id)) { const k = `${r.athlete_id}|${r.drill_id}`; if (!m.has(k)) m.set(k, []); m.get(k).push(r.value); } return m; };
  const [va, vb] = [await vals(da), await vals(db)];
  const ids = [...new Set([...va.keys(), ...vb.keys()].map((k) => +k.split("|")[0]))];
  const ppl = ids.length ? (await query(`SELECT a.id, a.first_name, a.last_name, coalesce((SELECT m.group_name FROM schedule_members m WHERE m.athlete_id=a.id AND m.schedule_id=$2), a.team) AS team FROM athletes a WHERE a.id = ANY($1)`, [ids, db.board_id || da.board_id || 0])).rows : [];
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
  return { cols: [["name", "Athlete"], ["team", "Team"], ["drill", "Drill"], ["method", "Measured with"], ["a", `${P.da.kind} ${P.da.day.toISOString ? P.da.day.toISOString().slice(5, 10) : ""}`, "num"], ["b", `${P.db.kind} ${P.db.day.toISOString ? P.db.day.toISOString().slice(5, 10) : ""}`, "num"],
      ["diff", "Change (+ = better)", "num"], ["pct", "Change %", "num"], ["verdict", ""]], rows, link: (r) => `/admin/assess/athlete/${r.id}`,
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
  return { cols: [["name", "Athlete"], ["team", "Team"], ["sessions", "Sessions attended", "num"], ["claimed", "Sessions claimed", "num"], ["avg", "Avg improvement %", "num"], ["improved", "Drills improved"]],
    rows, link: (r) => `/admin/assess/athlete/${r.id}`,
    note: board ? `Sessions on the linked program between the two testing days. ${withAvg.length > 1 && mid > 0 ? `Athletes who attended ${mid}+ sessions improved ${mean(hi)}% on average; those who attended fewer improved ${mean(lo) ?? "—"}%.` : ""}` : "Link the testing days to a program to count sessions attended." };
}
async function assessTeams(f) {
  const P = await assessPair(f); if (!P) return noPair;
  const by = new Map();
  for (const p of P.ppl) for (const dr of P.drills) { const ch = P.A.change(P.A.score(P.va.get(`${p.id}|${dr.id}`) || [], P.ownA.get(dr.id) || dr, P.how), P.A.score(P.vb.get(`${p.id}|${dr.id}`) || [], P.ownB.get(dr.id) || dr, P.how), dr); if (ch.pct == null) continue;
    const k = `${p.team || "(no team)"}|${dr.id}`, x = by.get(k) || { team: p.team || "(no team)", drill: dr.name + (dr.unit ? ` (${dr.unit})` : ""), n: 0, sum: 0, up: 0 }; x.n++; x.sum += ch.pct; if (ch.diff > 0) x.up++; by.set(k, x); }
  return { cols: [["team", "Team"], ["drill", "Drill"], ["n", "Athletes", "num"], ["avg", "Avg improvement %", "num"], ["better", "Improved", "pct"]],
    rows: [...by.values()].map((x) => ({ ...x, avg: Math.round((x.sum / x.n) * 10) / 10, better: Math.round((x.up / x.n) * 100) })).sort((a, b) => a.team.localeCompare(b.team) || a.drill.localeCompare(b.drill)), note: "Average change per team and drill (positive = better)." };
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
module.exports = { assessImprove, assessAttend, assessTeams, claimsAll, claimsByPerson, attendance, noshows, unchecked, fill, busiest, waitlists, locations, rsvpEvents, rsvpAthletes, engagement, notSignedUp, volunteer, emailProblems, weekSheet, overview, REPEAT };
