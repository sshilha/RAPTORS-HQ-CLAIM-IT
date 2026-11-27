// Communication → Send a message, and Send now for automated emails.
// Recipients for an athlete: their parents/guardians and the athlete's own sign-in; for an adult, their own email.
// Replies go to the club's address (Communication → branding), like every email.
// Who may send: "Send messages" (comm.message) and "Send automated emails now" (comm.sendnow), on the boards their roles
// cover (Everywhere roles and administrators: everything; People lists need an Everywhere role).
const { query } = require("./db");
const R = require("./roles");

async function familyEmails(athleteIds) {
  if (!athleteIds.length) return [];
  return (await query(`SELECT DISTINCT lower(e) AS e FROM (
      SELECT u.email AS e FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id = ANY($1)
      UNION SELECT u.email FROM athletes a JOIN users u ON u.id=a.self_user_id WHERE a.id = ANY($1)
      UNION SELECT a.email FROM athletes a WHERE a.id = ANY($1) AND a.kind='adult' AND a.email LIKE '%@%') x WHERE e LIKE '%@%' ORDER BY 1`, [athleteIds])).rows.map((r) => r.e);
}
// boards this sender may use (null = every board)
function allowed(acc, perm) { if (acc.admin) return null; const b = acc.boards(perm); return b.all ? null : b.map; }
const okBoard = (map, id) => map === null || map.has(Number(id));
const okTeam = (map, id, team) => map === null || (map.get(Number(id)) === null || !team ? map.get(Number(id)) === null || (map.get(Number(id)) || []).includes(team) : (map.get(Number(id)) || []).includes(team));

// who a message goes to: { athletes: [{ id, name }], emails: [...], what }
async function resolve(spec, acc) {
  const map = allowed(acc, "comm.message"); let rows = [], what = "";
  if (spec.to === "board") {
    const sid = Number(spec.board); if (!okBoard(map, sid)) throw new Error("Your role can't message that board.");
    const lim = map && map.get(sid); const team = spec.team || null;
    if (lim && (!team || !lim.includes(team))) { if (!team && lim.length) throw new Error(`Pick one of your teams: ${lim.join(", ")}.`); if (team && !lim.includes(team)) throw new Error("Your role can't message that team."); }
    rows = spec.who === "signed" ? (await query(`SELECT DISTINCT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN athletes a ON a.id=c.athlete_id
        LEFT JOIN schedule_members m ON m.schedule_id=i.schedule_id AND m.athlete_id=a.id WHERE i.schedule_id=$1 AND c.status IN ('confirmed','waitlisted') AND i.starts_at > now() AND i.canceled_at IS NULL AND ($2::text IS NULL OR m.group_name=$2)`, [sid, team])).rows
      : (await query(`SELECT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name FROM schedule_members m JOIN athletes a ON a.id=m.athlete_id WHERE m.schedule_id=$1 AND a.archived_at IS NULL AND ($2::text IS NULL OR m.group_name=$2)`, [sid, team])).rows;
    const b = (await query(`SELECT name FROM schedules WHERE id=$1`, [sid])).rows[0] || {};
    what = `${spec.who === "signed" ? "Signed up for upcoming sessions on" : "Everyone on"} ${b.name || "the board"}${team ? ` (${team})` : ""}`;
  } else if (spec.to === "session") {
    const it = (await query(`SELECT i.id, i.schedule_id, i.title, i.starts_at, s.name FROM board_items i JOIN schedules s ON s.id=i.schedule_id WHERE i.id=$1`, [Number(spec.session)])).rows[0];
    if (!it || !okBoard(map, it.schedule_id)) throw new Error("Your role can't message that session.");
    const lim = map && map.get(it.schedule_id);
    rows = (await query(`SELECT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name, m.group_name AS team FROM board_claims c JOIN athletes a ON a.id=c.athlete_id LEFT JOIN schedule_members m ON m.schedule_id=$2 AND m.athlete_id=a.id
      WHERE c.item_id=$1 AND c.status IN ('confirmed','waitlisted')`, [it.id, it.schedule_id])).rows.filter((x) => !lim || lim.includes(x.team));
    what = `Signed up for ${it.name}: ${it.title || new Date(it.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  } else if (spec.to === "list") {
    if (map !== null) throw new Error("Lists need an Everywhere role.");
    rows = (await query(`SELECT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name FROM people_list_members m JOIN athletes a ON a.id=m.athlete_id WHERE m.list_id=$1 AND a.archived_at IS NULL`, [Number(spec.list)])).rows;
    what = `The list ${((await query(`SELECT name FROM people_lists WHERE id=$1`, [Number(spec.list)])).rows[0] || {}).name || ""}`;
  } else {
    const ids = [].concat(spec.people || []).map(Number).filter(Boolean);
    rows = (await query(`SELECT a.id, a.first_name || ' ' || coalesce(a.last_name,'') AS name FROM athletes a WHERE a.id = ANY($1) AND a.archived_at IS NULL`, [ids])).rows;
    if (map !== null) {   // only people on their boards (and teams)
      const mem = (await query(`SELECT athlete_id, schedule_id, group_name FROM schedule_members WHERE athlete_id = ANY($1)`, [ids])).rows;
      const bad = rows.filter((p) => !mem.some((m) => m.athlete_id === p.id && okBoard(map, m.schedule_id) && (map.get(m.schedule_id) === null || (map.get(m.schedule_id) || []).includes(m.group_name))));
      if (bad.length) throw new Error(`Your role can't message ${bad.map((b) => b.name).join(", ")}.`);
    }
    what = rows.length === 1 ? rows[0].name : `${rows.length} people`;
  }
  const athletes = [...new Map(rows.map((r) => [r.id, { id: r.id, name: r.name.trim() }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return { athletes, emails: await familyEmails(athletes.map((a) => a.id)), what };
}
async function sendMessage(spec, { subject, message }, req) {
  const acc = await R.forUser(req.user), r = await resolve(spec, acc); let n = 0;
  for (const e of r.emails) { try { await require("./emailTemplates").send("manual_message", e, { subject, message }); n++; } catch (err) { console.error("message:", err.message); } }
  require("./activity").record(req, { kind: "emails", summary: `Sent the message "${subject}" to ${r.what} (${n} email${n === 1 ? "" : "s"})` }).catch(() => {});
  return { sent: n, what: r.what };
}

// ---------- Send now ----------
const NOW = { leftover: "Open leftover spots", leftover_today: "Open leftover spots (today)", helper: "Helper spots open", rsvp: "RSVP reminder (people who haven't answered)",
  reminder: "Claim reminder (everyone signed up for a session)", invite: "Invitation (sign-up link)", welcome: "Welcome email" };
// what it would do: { count, what } (count = sessions, spots or people); send() does it
async function nowPlan(kind, o, req) {
  const acc = await R.forUser(req.user), map = allowed(acc, "comm.sendnow");
  const need = (sid) => { if (!okBoard(map, sid)) throw new Error("Your role can't send that for this board."); };
  if (kind === "leftover" || kind === "leftover_today") {
    if (o.board) need(o.board); else if (map !== null) throw new Error("Pick one of your boards.");
    const p = await require("./notices").leftoverNow({ board: o.board || null, today: kind === "leftover_today" });
    return { count: p.list.length, what: `${p.list.length} session${p.list.length === 1 ? "" : "s"} with open leftover spots${o.board ? "" : " on every board"}`, send: p.send };
  }
  if (kind === "helper") {
    if (o.board) need(o.board); else if (map !== null) throw new Error("Pick one of your boards.");
    const Q = require("./questions"), n = await Q.notifyHelpers(new Date(), { force: true, board: o.board || null, count: true });
    return { count: n, what: `${n} unfilled helper spot${n === 1 ? "" : "s"}`, send: () => Q.notifyHelpers(new Date(), { force: true, board: o.board || null }) };
  }
  if (kind === "rsvp" || kind === "reminder") {
    const it = (await query(`SELECT id, schedule_id FROM board_items WHERE id=$1`, [Number(o.session)])).rows[0]; if (!it) throw new Error("Pick an event or session."); need(it.schedule_id);
    if (kind === "rsvp") { const s = await require("./rsvp").summary(it.id), n = (s.none || []).length; return { count: n, what: `${n} people who haven't answered`, send: () => require("./rsvp").remind(it.id) }; }
    const cl = (await query(`SELECT id FROM board_claims WHERE item_id=$1 AND status='confirmed'`, [it.id])).rows;
    return { count: cl.length, what: `${cl.length} people signed up`, send: async () => { let n = 0; for (const c of cl) { try { await require("./engine/notify").reminder(c.id); n++; } catch (e) { console.error("reminder:", e.message); } } return n; } };
  }
  if (kind === "invite" || kind === "welcome") {
    if (map !== null) throw new Error("Invitations and welcome emails need an Everywhere role.");
    const p = (await query(`SELECT a.id, a.first_name, coalesce(u.email, a.email) AS email, u.id AS uid FROM athletes a LEFT JOIN users u ON u.id=a.self_user_id OR lower(u.email)=lower(a.email) WHERE a.id=$1 LIMIT 1`, [Number(o.person)])).rows[0];
    if (!p || !p.email) throw new Error("Pick someone with an email.");
    return { count: 1, what: `${p.first_name} (${p.email})`, send: async () => {
      if (kind === "welcome") { await require("./emailTemplates").send("welcome", p.email, { first_name: p.first_name }); return 1; }
      const uid = p.uid || (await require("./auth").findOrCreateUser(p.email)).id; await require("./accounts").sendInvite(req, uid); return 1; } };
  }
  throw new Error("Pick an email to send.");
}
module.exports = { familyEmails, resolve, sendMessage, NOW, nowPlan, allowed };
