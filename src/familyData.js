// My Family (Reports for parents/guardians and athletes): everything here starts from the signed-in person's own
// family, the same rule My Claims uses: linked athletes who allow family access (parent_athletes) plus their own record.
// Nothing is matched by name or email, and every query is limited to those athlete ids.
const { query } = require("./db");
const TZ = "America/Chicago";
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

async function people(user) {
  const kids = (await query(`SELECT a.id, a.first_name, a.last_name, a.kind FROM parent_athletes pa JOIN athletes a ON a.id=pa.athlete_id
    WHERE pa.user_id=$1 AND a.archived_at IS NULL AND a.family_access AND a.self_user_id IS DISTINCT FROM $1 ORDER BY a.first_name`, [user.id])).rows;
  const me = (await query(`SELECT id, first_name, last_name, kind FROM athletes WHERE self_user_id=$1 AND archived_at IS NULL ORDER BY (kind='athlete') DESC, id LIMIT 1`, [user.id])).rows[0];
  return [...kids.map((k) => ({ ...k, you: false })), ...(me ? [{ ...me, you: true }] : [])];
}

// every claim (and RSVP answer) for these athletes; program / volunteer claims and RSVP "Going" answers
async function claims(ids, { board = null } = {}) {
  if (!ids.length) return [];
  return (await query(`SELECT c.id, c.status, c.attended, c.rsvp, c.note, c.created_at, c.canceled_at, a.id AS athlete_id, a.first_name, a.last_name,
      i.id AS item_id, i.title, i.starts_at, i.ends_at, coalesce(nullif(i.location,''), sc.event_location) AS location, sc.id AS board_id, sc.name AS board, sc.board_type,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id
    WHERE c.athlete_id = ANY($1) AND i.canceled_at IS NULL AND i.starts_at IS NOT NULL AND sc.archived_at IS NULL ${board ? "AND sc.id = $2" : ""}
      AND NOT (c.status='canceled' AND c.rsvp IS NOT NULL)
    ORDER BY i.starts_at`, board ? [ids, board] : [ids])).rows.map((c) => {
      const past = new Date(c.ends_at || c.starts_at).getTime() < Date.now();
      return { ...c, past, who: c.first_name, session: [c.path, c.title && c.path ? c.title : ""].filter(Boolean).join(" › ") || c.title || "Session",
        state: c.status === "canceled" ? "Released" : c.status === "waitlisted" ? "Waitlisted" : c.board_type === "rsvp" ? (past ? "Went (RSVP)" : "Going (RSVP)") : past ? "Past" : "Upcoming",
        att: c.status !== "confirmed" || !past ? "" : c.attended == null ? "Not recorded" : c.attended ? "Attended" : "No-show" };
    });
}

function attendance(list) {
  const past = list.filter((c) => c.status === "confirmed" && c.past && c.board_type !== "rsvp");
  const here = past.filter((c) => c.attended === true).length, ns = past.filter((c) => c.attended === false).length, nr = past.filter((c) => c.attended == null).length;
  const months = new Map();
  for (const c of past) { const k = new Date(c.starts_at).toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7), x = months.get(k) || { h: 0, n: 0, u: 0 }; if (c.attended === true) x.h++; else if (c.attended === false) x.n++; else x.u++; months.set(k, x); }
  return { total: past.length, here, ns, nr, rate: here + ns ? pct(here, here + ns) : null,   // shown once any attendance is recorded
    months: [...months].sort().map(([k, x]) => ({ label: new Date(k + "-15T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }), here: x.h, ns: x.n, nr: x.u, rate: x.h + x.n ? pct(x.h, x.h + x.n) : null })),
    history: past.slice().reverse() };
}

// assessment results: only testing days the club has shared with families, only these athletes
async function progress(ids) {
  const A = require("./assess"); try { await A.ensure(); } catch (e) { return []; }
  if (!ids.length) return [];
  const rows = (await query(`SELECT r.athlete_id, r.day_id, r.drill_id, r.attempt, r.value, d.day, d.kind, d.assessment_id, x.name AS assessment
    FROM assess_results r JOIN assess_days d ON d.id=r.day_id JOIN assessments x ON x.id=d.assessment_id
    WHERE r.athlete_id = ANY($1) AND d.shared AND x.archived_at IS NULL ORDER BY d.day, r.attempt`, [ids])).rows;
  const drillsOf = new Map(), out = new Map();
  for (const r of rows) {
    const dk = `${r.day_id}`; if (!drillsOf.has(dk)) drillsOf.set(dk, new Map((await A.dayDrills(r.day_id, r.assessment_id)).map((d) => [d.id, d])));
    const dr = drillsOf.get(dk).get(r.drill_id); if (!dr) continue;
    const k = `${r.athlete_id}|${r.assessment_id}|${r.drill_id}`;
    if (!out.has(k)) out.set(k, { athlete_id: r.athlete_id, assessment_id: r.assessment_id, drill_id: r.drill_id, assessment: r.assessment, drill: dr.name, unit: dr.unit || "", better: dr.better, days: new Map() });
    const s = out.get(k); if (!s.days.has(r.day_id)) s.days.set(r.day_id, { day: r.day, kind: r.kind, dr, tries: [] }); s.days.get(r.day_id).tries[r.attempt - 1] = Number(r.value);
  }
  const desc = await A.descriptions([...new Set([...out.values()].map((s) => s.drill_id))]);
  const list = [...out.values()].map((s) => {
    const pts = [...s.days.values()].map((d) => ({ day: d.day, kind: d.kind, dr: d.dr, v: A.score(d.tries, d.dr, "best") })).filter((p) => p.v != null);
    if (!pts.length) return null;
    const first = pts[0], last = pts[pts.length - 1]; let best = first; for (const p of pts) if (s.better === "higher" ? p.v > best.v : p.v < best.v) best = p;
    const ch = pts.length > 1 ? A.change(first.v, last.v, last.dr) : null;
    const lbl = (p) => `${p.kind} · ${new Date(String(p.day.toISOString ? p.day.toISOString() : p.day).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return { desc: desc.get(s.drill_id) || "", athlete_id: s.athlete_id, assessment: s.assessment, drill: s.drill, unit: s.unit, better: s.better, first: first.v, latest: last.v, best: best.v, pb: pts.length > 1 && best === last, tests: pts.length,
      points: pts.map((p) => ({ label: lbl(p), value: p.v })), latestDay: last.day,
      tries: [...s.days.values()].map((d) => ({ label: lbl(d), tries: d.tries, best: A.score(d.tries, d.dr, "best") })),   // every try, per testing day
      summary: !ch ? "Only one testing day so far: more testing is needed to show improvement." : ch.diff === 0 ? "Same result as the first test." :
        `${ch.diff > 0 ? "Improved" : "Went from"} ${ch.diff > 0 ? `by ${Math.abs(ch.diff)}${s.unit ? " " + s.unit : ""}${ch.pct != null ? ` (${Math.abs(ch.pct)}%)` : ""} since the first test` : `${first.v} to ${last.v}${s.unit ? " " + s.unit : ""} since the first test`}.` };
  }).filter(Boolean);
  // the next testing day for each assessment they've been tested in, or one set for their programs
  const boards = (await query(`SELECT DISTINCT schedule_id FROM schedule_members WHERE athlete_id = ANY($1)`, [ids])).rows.map((r) => r.schedule_id);
  const tests = new Map((await query(`SELECT id, name FROM assessments WHERE archived_at IS NULL AND (id = ANY($1) OR id IN (SELECT assessment_id FROM assess_days WHERE board_id = ANY($2)))`, [[...new Set([...out.values()].map((s) => s.assessment_id))], boards])).rows.map((r) => [r.id, r.name]));
  list.next = [];
  for (const [id, name] of tests) { const d = await A.nextDay(id, boards); if (d) list.next.push({ assessment: name, kind: d.kind, day: d.day }); }
  return list;
}

// recent activity, only from real records: claims made or released, attendance on past sessions, shared results
function activity(list, prog, people) {
  const name = new Map(people.map((p) => [p.id, p.first_name])), since = Date.now() - 14 * 864e5, out = [];
  for (const c of list) {
    if (c.created_at && new Date(c.created_at).getTime() >= since && c.status !== "canceled") out.push({ at: c.created_at, text: `${c.who} ${c.status === "waitlisted" ? "joined the waitlist for" : "claimed"} ${c.session}`, sub: c.board });
    if (c.status === "canceled" && c.canceled_at && new Date(c.canceled_at).getTime() >= since) out.push({ at: c.canceled_at, text: `${c.who}'s claim was released: ${c.session}`, sub: c.board });
    if (c.status === "confirmed" && c.past && c.attended != null && new Date(c.starts_at).getTime() >= since) out.push({ at: c.starts_at, text: `Attendance recorded for ${c.who}: ${c.attended ? "attended" : "no-show"}`, sub: c.session });
  }
  const seen = new Set();
  for (const p of prog) { const k = `${p.athlete_id}|${p.assessment}|${String(p.latestDay)}`; if (seen.has(k)) continue; seen.add(k);
    if (new Date(p.latestDay).getTime() >= Date.now() - 30 * 864e5) out.push({ at: p.latestDay, text: `${name.get(p.athlete_id) || "Your athlete"}'s ${p.assessment} results are available`, sub: "Assessments" }); }
  return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
}

module.exports = { people, claims, attendance, progress, activity, pct };
