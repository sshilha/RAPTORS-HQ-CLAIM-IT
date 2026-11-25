// Two automatic emails, run by the 15-minute reminders job (src/reminders.js):
//  1. Welcome: every new account gets the "welcome" email once (sign-in steps, how to sign up, View My Reports).
//     Admin invites send the Invitation instead (it carries the same welcome plus the set-up button) and count as welcomed.
//     Accounts that existed before this was added are marked as welcomed, so nobody existing gets it.
//  2. Open leftover spots: once a day (from 7 AM Chicago time), a summary to everyone with an account of sessions whose
//     "open leftover spots" time has arrived and that still have open spots (they can be claimed past a reached limit).
//     Only sessions with that setting (on the board or a level), only with spots left, each announced once; per-board
//     switch Board → Notifications (on unless turned off).
const { query } = require("./db");
const TZ = "America/Chicago";
let ready = null;
async function ensure() {
  if (ready) return ready;
  ready = (async () => {
    const had = (await query(`SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='welcome_emailed_at'`)).rows.length;
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_emailed_at TIMESTAMPTZ`);
    if (!had) await query(`UPDATE users SET welcome_emailed_at=now() WHERE welcome_emailed_at IS NULL`);   // existing accounts: already welcomed
    await query(`CREATE TABLE IF NOT EXISTS leftover_notices (item_id INT PRIMARY KEY, spots INT, sent_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
// an admin invite is the welcome for that account
async function markWelcomed(userId) { await ensure(); await query(`UPDATE users SET welcome_emailed_at=now() WHERE id=$1 AND welcome_emailed_at IS NULL`, [userId]); }

async function welcome() {
  await ensure();
  // a couple of minutes' grace, so an admin invite sent right after creating the account goes out instead
  const due = (await query(`SELECT id, email FROM users WHERE welcome_emailed_at IS NULL AND invited_at IS NULL AND created_at < now() - interval '2 minutes' AND email LIKE '%@%' ORDER BY id LIMIT 200`)).rows;
  let n = 0;
  for (const u of due) {
    await query(`UPDATE users SET welcome_emailed_at=now() WHERE id=$1 AND welcome_emailed_at IS NULL`, [u.id]);   // mark first: never twice
    const who = (await query(`SELECT first_name FROM athletes WHERE self_user_id=$1 ORDER BY id LIMIT 1`, [u.id])).rows[0];
    try { await require("./emailTemplates").send("welcome", u.email, { first_name: who ? who.first_name : "" }); n++; } catch (e) { console.error("welcome:", e.message); }
  }
  return n;
}

// Open leftover spots: two emails per session, each only when the session still has open spots.
//  1. "Spots open": when the session's leftover window opens (checked every 15 minutes; held from 9 PM to 7 AM).
//  2. "Today": 7 AM the morning of the session (board setting notify.leftover_morning, on unless turned off).
// A session whose window opens the same morning it happens gets just one email. Several sessions are batched per family.
const QUIET = (h) => h < 7 || h >= 21;
const local = (d) => ({ day: d.toLocaleDateString("en-CA", { timeZone: TZ }), hour: Number(d.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })) % 24 });
async function openSessions(now = new Date()) {   // sessions whose leftover window is open and that have open spots
  const E = require("./engine");
  await query(`ALTER TABLE leftover_notices ADD COLUMN IF NOT EXISTS morning_sent_at TIMESTAMPTZ`);
  const items = (await query(`SELECT i.id, i.schedule_id, i.starts_at, i.capacity, sc.name AS board, sc.settings, coalesce(sc.board_type,'training') AS board_type, n.item_id IS NOT NULL AS opened, n.morning_sent_at,
      (SELECT count(*)::int FROM board_claims c WHERE c.item_id=i.id AND c.status='confirmed' AND c.counts) AS taken
    FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id LEFT JOIN leftover_notices n ON n.item_id=i.id
    WHERE i.canceled_at IS NULL AND i.starts_at > $1 AND sc.archived_at IS NULL AND sc.published_at IS NOT NULL AND coalesce(sc.board_type,'training') <> 'rsvp'
      AND coalesce((sc.settings->'notify'->>'leftover_email')::boolean, true) ORDER BY i.starts_at`, [now])).rows;
  const out = [];
  for (const it of items) {
    const open = it.capacity - it.taken; if (open <= 0) continue;
    const chain = await E.chainFor(it.id); if (!chain) continue;
    const eff = E.effective(chain); if (eff.leftover_hours == null) continue;                        // no leftover setting: never announced
    if (now.getTime() < new Date(it.starts_at).getTime() - eff.leftover_hours * 3600e3) continue;   // not open to everyone yet
    const name = [...(chain.nodes || []).map((n) => n.name), chain.item.title].filter(Boolean).join(" › ") || "Session";
    out.push({ id: it.id, board_id: it.schedule_id, board: it.board, starts_at: it.starts_at, name, open, opened: it.opened, morningSent: !!it.morning_sent_at, chain, eff, board_type: it.board_type,
      morning: !(it.settings && it.settings.notify && it.settings.notify.leftover_morning === false), today: local(new Date(it.starts_at)).day === local(now).day });
  }
  return out;
}
async function leftoverDue(now = new Date()) { return (await openSessions(now)).filter((s) => !s.opened); }   // (kept for reports/tests)
async function sendSummary(key, list, now) {
  // Everyone with an account gets it. A family sees only the sessions where at least one of their athletes could still
  // sign up (not already claimed or waitlisted there, and allowed on that board); nothing left = no email for them.
  // Accounts with no athletes (admins, coaches) see the whole list.
  const E = require("./engine");
  const when = (t) => new Date(t).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const { APP_URL } = require("./config");
  const varsFor = (items) => {
    const byBoard = new Map(); for (const s of items) { if (!byBoard.has(s.board_id)) byBoard.set(s.board_id, { board: s.board, list: [] }); byBoard.get(s.board_id).list.push(s); }
    const spots = items.reduce((t, s) => t + s.open, 0), first = [...byBoard.keys()][0];
    return { spots_text: `${spots} open spot${spots === 1 ? "" : "s"}`, spots: String(spots), session_count: String(items.length),
      sessions: [...byBoard.values()].map((b) => `**${b.board}**\n${b.list.map((s) => `• ${when(s.starts_at)} · ${s.name}: ${s.open} spot${s.open === 1 ? "" : "s"} open`).join("\n")}`).join("\n\n"),
      board_name: byBoard.size === 1 ? byBoard.get(first).board : "Claim It", board_link: `${APP_URL || ""}/${byBoard.size === 1 ? `b/${first}` : "dashboard"}` };
  };
  const ids = list.map((s) => s.id), boards = [...new Set(list.map((s) => s.board_id))];
  const users = (await query(`SELECT id, email FROM users WHERE email LIKE '%@%' ORDER BY id`)).rows;
  const fam = new Map(); for (const r of (await query(`SELECT pa.user_id, a.id, a.kind FROM parent_athletes pa JOIN athletes a ON a.id=pa.athlete_id WHERE a.archived_at IS NULL AND a.family_access
      UNION SELECT self_user_id, id, kind FROM athletes WHERE self_user_id IS NOT NULL AND archived_at IS NULL`)).rows) { if (!fam.has(r.user_id)) fam.set(r.user_id, []); fam.get(r.user_id).push(r); }
  const taken = new Set((await query(`SELECT item_id, athlete_id FROM board_claims WHERE item_id = ANY($1) AND status IN ('confirmed','waitlisted')`, [ids])).rows.map((r) => `${r.item_id}|${r.athlete_id}`));
  const mem = new Map((await query(`SELECT schedule_id, athlete_id, group_name, tags FROM schedule_members WHERE schedule_id = ANY($1)`, [boards])).rows.map((r) => [`${r.schedule_id}|${r.athlete_id}`, r]));
  // a parent's own (adult) record only counts on volunteer boards; athletes count everywhere
  const could = (s, p, uid) => (p.kind === "athlete" || s.board_type === "volunteer") && !taken.has(`${s.id}|${p.id}`) && E.check(s.chain, s.eff, { athleteId: p.id, userId: uid, member: mem.get(`${s.board_id}|${p.id}`) || null }, now).ok;
  let n = 0;
  for (const u of users) {
    const kids = (fam.get(u.id) || []).filter((p) => p.kind === "athlete" || list.some((s) => s.board_type === "volunteer"));
    const mine = kids.length ? list.filter((s) => kids.some((k) => could(s, k, u.id))) : list;
    if (!mine.length) continue;   // everyone in this family is already signed up (or can't sign up): no email
    try { await require("./emailTemplates").send(key, u.email, varsFor(mine)); n++; } catch (err) { console.error(`${key}:`, err.message); }
  }
  return n;
}
async function leftoverDigest({ now = new Date(), force = false } = {}) {
  await ensure();
  const L = local(now), all = await openSessions(now); let n = 0;
  const last = (await query(`SELECT value FROM app_kv WHERE key='leftover_morning_day'`)).rows[0];
  const morningDue = force || (L.hour >= 7 && !QUIET(L.hour) && !(last && last.value === L.day));
  // 1. spots just opened (not overnight). Today's sessions that open in time for this morning's email go in that one
  //    email instead (so families don't get two at 7 AM); a same-day opening after the morning email gets its own.
  if (force || !QUIET(L.hour)) {
    const fresh = all.filter((s) => !s.opened), now7 = (s) => morningDue && s.today && s.morning;
    for (const s of fresh) await query(`INSERT INTO leftover_notices (item_id, spots, morning_sent_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [s.id, s.open, s.today && !now7(s) ? now : null]);   // mark first: never twice
    const send = fresh.filter((s) => !now7(s));
    if (send.length) n += await sendSummary("leftover_open", send, now);
  }
  // 2. the morning of the session, from 7 AM, once a day
  if (morningDue) {
    await query(`INSERT INTO app_kv (key, value) VALUES ('leftover_morning_day', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(L.day)]);
    const today = (await openSessions(now)).filter((s) => s.today && s.opened && !s.morningSent && s.morning);
    if (today.length) { for (const s of today) await query(`UPDATE leftover_notices SET morning_sent_at=$2 WHERE item_id=$1`, [s.id, now]); n += await sendSummary("leftover_today", today, now); }
  }
  return n;
}
// Send now (Communication): sessions with open leftover spots right now (announced or not), on one board or all
async function leftoverNow({ board = null, today = false } = {}) {
  await ensure(); const now = new Date();
  const list = (await openSessions(now)).filter((s) => (!board || s.board_id === Number(board)) && (!today || s.today));
  return { list, send: async () => (list.length ? sendSummary(today ? "leftover_today" : "leftover_open", list, now) : 0) };
}
module.exports = { leftoverNow, ensure, welcome, leftoverDigest, leftoverDue, openSessions, markWelcomed };
