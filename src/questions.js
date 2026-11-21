// Claim questions + answer rules.
// Questions belong to a board (node_id null) or a level (node_id); a session asks every question on its board and on
// each level above it. Types: choice (one), multi (several), yesno, text, number. Answers live per claim
// (claim_answers). The board's older single question (schedules.question, answered into the claim's note) is separate
// and unchanged.
// Rules, per choice/yes-no answer ("when the answer is X, then…"):
//   helper: open a linked "helper spot" in another level at this session's time and place (e.g. "I need a catcher" →
//           "Catch for a pitcher: Ava T" in Catching). It's a real one-session item (settings.helper_claim = the claim),
//           claimable by whoever that level allows, outside limits (counts=false), closed when the claim is canceled or
//           the answer changes. People who can claim it are emailed (batched, held 9 PM–7 AM).
//   email:  email the board's coaches, its organizer contact, or an address.
//   tag:    add a tag to the athlete on the board's list (tags drive who can claim which levels).
const { query, pool } = require("./db");
const TZ = "America/Chicago";
const KINDS = { choice: "Pick one", multi: "Pick any", yesno: "Yes / No", text: "Short answer", number: "Number" };
let ready = null;
function ensure() {
  return ready || (ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS claim_questions (id SERIAL PRIMARY KEY, schedule_id INT NOT NULL, node_id INT, sort INT NOT NULL DEFAULT 0,
      label TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'choice', options JSONB NOT NULL DEFAULT '[]', required BOOLEAN NOT NULL DEFAULT true,
      show JSONB NOT NULL DEFAULT '{"roster": true, "week": true}', rules JSONB NOT NULL DEFAULT '[]', archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await query(`CREATE TABLE IF NOT EXISTS claim_answers (claim_id INT NOT NULL, question_id INT NOT NULL, value TEXT, answered_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (claim_id, question_id))`);
    await query(`CREATE TABLE IF NOT EXISTS helper_notices (item_id INT PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  })().catch((e) => { ready = null; throw e; }));
}
const opts = (q) => (q.kind === "yesno" ? [{ key: "yes", label: "Yes" }, { key: "no", label: "No" }] : (q.options || []).map((o, i) => (typeof o === "string" ? { key: `o${i}`, label: o } : o)));
// the questions a session asks (board-wide first, then each level from the top down)
async function forItem(itemId, db = { query }) {
  await ensure();
  const it = (await db.query(`SELECT schedule_id, node_id FROM board_items WHERE id=$1`, [itemId])).rows[0]; if (!it) return [];
  const chain = []; let n = it.node_id;
  while (n) { const r = (await db.query(`SELECT id, parent_id FROM board_nodes WHERE id=$1`, [n])).rows[0]; if (!r) break; chain.unshift(r.id); n = r.parent_id; }
  const qs = (await db.query(`SELECT * FROM claim_questions WHERE schedule_id=$1 AND archived_at IS NULL AND (node_id IS NULL OR node_id = ANY($2)) ORDER BY sort, id`, [it.schedule_id, chain])).rows;
  return qs.sort((a, b) => (a.node_id ? chain.indexOf(a.node_id) + 1 : 0) - (b.node_id ? chain.indexOf(b.node_id) + 1 : 0) || a.sort - b.sort || a.id - b.id);
}
// questions for many sessions of one board at once: { itemId: [questions] } (empty when the board has none)
async function mapFor(boardId, itemIds) {
  await ensure();
  const qs = (await query(`SELECT * FROM claim_questions WHERE schedule_id=$1 AND archived_at IS NULL ORDER BY sort, id`, [boardId])).rows; if (!qs.length || !itemIds.length) return {};
  const nodes = new Map((await query(`SELECT id, parent_id FROM board_nodes WHERE schedule_id=$1`, [boardId])).rows.map((n) => [n.id, n]));
  const items = (await query(`SELECT id, node_id FROM board_items WHERE id = ANY($1)`, [itemIds])).rows, out = {};
  for (const it of items) { const chain = []; let n = nodes.get(it.node_id); while (n) { chain.unshift(n.id); n = nodes.get(n.parent_id); }
    const mine = qs.filter((q) => !q.node_id || chain.includes(q.node_id)).sort((a, b) => (a.node_id ? chain.indexOf(a.node_id) + 1 : 0) - (b.node_id ? chain.indexOf(b.node_id) + 1 : 0) || a.sort - b.sort || a.id - b.id);
    if (mine.length) out[it.id] = mine; }
  return out;
}
// read answers out of a submitted form (fields q_<id>)
function fromBody(body = {}) {
  const out = {};
  for (const [k, v] of Object.entries(body)) { const m = /^q_(\d+)$/.exec(k); if (m) out[m[1]] = [].concat(v).map(String); }
  return out;
}
// check and clean answers; throws a plain-language message for a missing or invalid required answer
function clean(qs, answers = {}) {
  const out = {};
  for (const q of qs) {
    const raw = (answers[q.id] || answers[String(q.id)] || []).map((x) => String(x).trim()).filter(Boolean);
    let v = null;
    if (q.kind === "choice" || q.kind === "yesno") { const keys = opts(q).map((o) => o.key); v = raw.find((x) => keys.includes(x)) || null; }
    else if (q.kind === "multi") { const keys = opts(q).map((o) => o.key); const pick = raw.filter((x) => keys.includes(x)); v = pick.length ? pick.join(",") : null; }
    else if (q.kind === "number") { const n = Number(raw[0]); v = raw.length && Number.isFinite(n) ? String(n) : null; }
    else v = raw.length ? raw[0].replace(/\s+/g, " ").slice(0, 200) : null;
    if (q.required && v == null) { const e = new Error(`Please answer: ${q.label}`); e.claimAnswer = true; throw e; }
    if (v != null) out[q.id] = v;
  }
  return out;
}
async function save(claimId, cleaned, db = { query }) {
  for (const [qid, v] of Object.entries(cleaned)) await db.query(`INSERT INTO claim_answers (claim_id, question_id, value) VALUES ($1,$2,$3) ON CONFLICT (claim_id, question_id) DO UPDATE SET value=EXCLUDED.value, answered_at=now()`, [claimId, Number(qid), v]);
}
// how an answer reads
function show(q, v) {
  if (v == null || v === "") return "";
  if (["choice", "yesno", "multi"].includes(q.kind)) { const m = new Map(opts(q).map((o) => [o.key, o.label])); return String(v).split(",").map((k) => m.get(k) || k).join(", "); }
  return String(v);
}
async function answersFor(claimIds) {   // { claimId: [{ q, value, text }] }
  await ensure(); const out = {}; if (!claimIds.length) return out;
  const rows = (await query(`SELECT a.claim_id, a.value, q.* FROM claim_answers a JOIN claim_questions q ON q.id=a.question_id WHERE a.claim_id = ANY($1) ORDER BY q.sort, q.id`, [claimIds])).rows;
  for (const r of rows) (out[r.claim_id] = out[r.claim_id] || []).push({ q: r, value: r.value, text: show(r, r.value) });
  return out;
}
// form fields for a session's questions (names q_<id>)
function fields(qs, { answers = {}, compact = false, esc = (x) => String(x) } = {}) {
  return qs.map((q) => {
    const cur = String(answers[q.id] || ""), req = q.required ? " required" : "", lab = `${esc(q.label)}${q.required ? "" : ' <span class="opt">(optional)</span>'}`;
    if (q.kind === "choice" || q.kind === "yesno") return `<fieldset class="cq${compact ? " cq-c" : ""}"><legend>${lab}</legend>${opts(q).map((o) => `<label class="cq-o"><input type="radio" name="q_${q.id}" value="${esc(o.key)}"${cur === o.key ? " checked" : ""}${req}> ${esc(o.label)}</label>`).join("")}</fieldset>`;
    if (q.kind === "multi") return `<fieldset class="cq${compact ? " cq-c" : ""}"><legend>${lab}</legend>${opts(q).map((o) => `<label class="cq-o"><input type="checkbox" name="q_${q.id}" value="${esc(o.key)}"${cur.split(",").includes(o.key) ? " checked" : ""}> ${esc(o.label)}</label>`).join("")}</fieldset>`;
    return `<label class="cq${compact ? " cq-c" : ""}"><span>${lab}</span><input name="q_${q.id}" ${q.kind === "number" ? 'type="number" inputmode="decimal"' : 'maxlength="200"'} value="${esc(cur)}"${req}></label>`;
  }).join("");
}

// ---------- rules ----------
const matches = (q, value, when) => value != null && String(value).split(",").includes(String(when));
async function claimInfo(claimId) {
  return (await query(`SELECT c.*, i.schedule_id, i.node_id, i.starts_at, i.ends_at, i.location, i.settings AS item_settings, sc.name AS board, a.first_name, a.last_name
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id WHERE c.id=$1`, [claimId])).rows[0];
}
async function openHelpers(claimId) { return (await query(`SELECT * FROM board_items WHERE (settings->>'helper_claim')::int = $1 AND canceled_at IS NULL`, [claimId])).rows; }
// make the claim's helper spots match its answers (open the ones a rule calls for; close the rest)
async function syncHelpers(claimId) {
  const c = await claimInfo(claimId); if (!c) return;
  const qs = await forItem(c.item_id), ans = (await query(`SELECT question_id, value FROM claim_answers WHERE claim_id=$1`, [claimId])).rows;
  const val = new Map(ans.map((a) => [a.question_id, a.value]));
  const want = []; if (c.status !== "canceled") for (const q of qs) for (const [i, r] of (q.rules || []).entries()) if (r.action === "helper" && r.node && matches(q, val.get(q.id), r.when)) want.push({ q, r, key: `${q.id}:${i}` });
  const have = await openHelpers(claimId);
  for (const w of want) if (!have.some((h) => h.settings.helper_rule === w.key)) {
    const title = String(w.r.label || "Helper for {athlete}").replace(/\{athlete\}/g, `${c.first_name} ${c.last_name || ""}`.trim()).slice(0, 120);
    await query(`INSERT INTO board_items (schedule_id, node_id, title, starts_at, ends_at, capacity, location, settings) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c.schedule_id, Number(w.r.node), title, c.starts_at, c.ends_at, Math.max(1, Number(w.r.spots) || 1), c.location, JSON.stringify({ helper_claim: claimId, helper_rule: w.key })]);
  }
  for (const h of have) if (!want.some((w) => w.key === h.settings.helper_rule)) await closeHelper(h, c);
}
// a helper spot is no longer needed: close it and tell whoever had taken it
async function closeHelper(h, c) {
  await query(`UPDATE board_items SET canceled_at=now() WHERE id=$1`, [h.id]);
  const took = (await query(`UPDATE board_claims SET status='canceled', canceled_at=now() WHERE item_id=$1 AND status<>'canceled' RETURNING id`, [h.id])).rows;
  const N = require("./engine/notify");
  for (const t of took) { const d = await N.details(t.id); if (!d) continue;
    await require("./emailTemplates").send("helper_closed", N.to(d, null), { ...(await N.claimVars(d)), helping_for: `${c.first_name} ${c.last_name || ""}`.trim() }).catch((e) => console.error("helper_closed:", e.message)); }
}
// after a claim (and its answers) is saved: helper spots, emails, tags; and, for a helper spot, tell the person helped
async function afterClaim(claimId, { actor = null } = {}) {
  await ensure();
  const c = await claimInfo(claimId); if (!c) return;
  const N = require("./engine/notify"), T = (k, to, v) => require("./emailTemplates").send(k, to, v).catch((e) => console.error(`${k}:`, e.message));
  if (c.item_settings && c.item_settings.helper_claim && c.status === "confirmed") {   // someone took a helper spot
    const p = await claimInfo(Number(c.item_settings.helper_claim)), d = p && (await N.details(p.id));
    if (d) await T("helper_found", N.to(d, null), { ...(await N.claimVars(d)), helper_name: `${c.first_name} ${c.last_name || ""}`.trim() });
  }
  const qs = await forItem(c.item_id), val = new Map((await query(`SELECT question_id, value FROM claim_answers WHERE claim_id=$1`, [claimId])).rows.map((a) => [a.question_id, a.value]));
  for (const q of qs) for (const r of q.rules || []) {
    if (!matches(q, val.get(q.id), r.when)) continue;
    if (r.action === "tag" && r.tag) await query(`UPDATE schedule_members SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(coalesce(tags,'{}') || ARRAY[$3::text]))) WHERE schedule_id=$1 AND athlete_id=$2`, [c.schedule_id, c.athlete_id, String(r.tag).slice(0, 40)]);
    if (r.action === "email") {
      const to = r.to === "coaches" ? (await query(`SELECT email FROM schedule_coaches WHERE schedule_id=$1`, [c.schedule_id])).rows.map((x) => x.email)
        : r.to === "organizer" ? (await query(`SELECT contact_info FROM schedules WHERE id=$1`, [c.schedule_id])).rows.map((x) => x.contact_info).filter((e) => /@/.test(e || "")) : [String(r.address || "")].filter((e) => /@/.test(e));
      const d = await N.details(claimId);
      if (to.length && d) await T("answer_alert", to, { ...(await N.claimVars(d)), question: q.label, answer: show(q, val.get(q.id)) });
    }
  }
  await syncHelpers(claimId);
}
// after a cancel: a canceled claim closes its helper spots; a helper giving up a spot reopens it (and tells the person helped)
async function afterCancel(claim) {
  await ensure();
  const it = (await query(`SELECT settings FROM board_items WHERE id=$1`, [claim.item_id])).rows[0];
  if (it && it.settings && it.settings.helper_claim) {
    await query(`DELETE FROM helper_notices WHERE item_id=$1`, [claim.item_id]);   // email helpers again
    const N = require("./engine/notify"), d = await N.details(Number(it.settings.helper_claim));
    if (d && d.status !== "canceled") await require("./emailTemplates").send("helper_reopened", N.to(d, null), await N.claimVars(d)).catch((e) => console.error("helper_reopened:", e.message));
    return;
  }
  await syncHelpers(claim.id);
}
// email everyone who could take an open helper spot (batched per account; held 9 PM–7 AM). Run by the reminders job.
async function notifyHelpers(now = new Date()) {
  await ensure();
  const hour = Number(now.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })) % 24; if (hour < 7 || hour >= 21) return 0;
  const open = (await query(`SELECT i.id, i.title, i.starts_at, i.schedule_id, i.settings, sc.name AS board FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id
    WHERE i.canceled_at IS NULL AND i.settings ? 'helper_claim' AND i.starts_at > $1 AND sc.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM helper_notices n WHERE n.item_id=i.id)
      AND (SELECT count(*) FROM board_claims c WHERE c.item_id=i.id AND c.status='confirmed') < i.capacity ORDER BY i.starts_at`, [now])).rows;
  if (!open.length) return 0;
  for (const s of open) await query(`INSERT INTO helper_notices (item_id) VALUES ($1) ON CONFLICT DO NOTHING`, [s.id]);   // mark first: never twice
  const E = require("./engine");
  const chains = new Map(); for (const s of open) { const ch = await E.chainFor(s.id); if (ch) chains.set(s.id, { ch, eff: E.effective(ch), helped: (await query(`SELECT athlete_id FROM board_claims WHERE id=$1`, [Number(s.settings.helper_claim)])).rows[0] }); }
  const fam = (await query(`SELECT pa.user_id, a.id FROM parent_athletes pa JOIN athletes a ON a.id=pa.athlete_id WHERE a.archived_at IS NULL AND a.family_access
      UNION SELECT self_user_id, id FROM athletes WHERE self_user_id IS NOT NULL AND archived_at IS NULL`)).rows;
  const byUser = new Map(); for (const r of fam) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r.id); }
  const mem = new Map((await query(`SELECT schedule_id, athlete_id, group_name, tags FROM schedule_members WHERE schedule_id = ANY($1)`, [[...new Set(open.map((s) => s.schedule_id))]])).rows.map((r) => [`${r.schedule_id}|${r.athlete_id}`, r]));
  const when = (t) => new Date(t).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const users = (await query(`SELECT id, email FROM users WHERE email LIKE '%@%'`)).rows, { APP_URL } = require("./config");
  let n = 0;
  for (const u of users) {
    const kids = byUser.get(u.id) || []; if (!kids.length) continue;   // helper spots go to families who could take them
    const mine = open.filter((s) => { const x = chains.get(s.id); return x && kids.some((k) => k !== (x.helped || {}).athlete_id && E.check(x.ch, x.eff, { athleteId: k, userId: u.id, member: mem.get(`${s.schedule_id}|${k}`) || null }, now).ok); });
    if (!mine.length) continue;
    const vars = { count_text: `${mine.length} spot${mine.length === 1 ? "" : "s"}`, sessions: mine.map((s) => `• ${when(s.starts_at)} · ${s.title} (${s.board})`).join("\n"),
      board_link: `${APP_URL || ""}/${new Set(mine.map((s) => s.schedule_id)).size === 1 ? `b/${mine[0].schedule_id}` : "dashboard"}` };
    try { await require("./emailTemplates").send("helper_needed", u.email, vars); n++; } catch (e) { console.error("helper_needed:", e.message); }
  }
  return n;
}
module.exports = { ensure, KINDS, opts, forItem, mapFor, fromBody, clean, save, show, answersFor, fields, afterClaim, afterCancel, syncHelpers, notifyHelpers };
