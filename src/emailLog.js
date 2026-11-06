// The email log: every email the app tries to send, and what happened (App Settings → People → Email log).
// sent (Resend accepted it) · failed (Resend refused it, with its reason) · held (Sign in as) · not sent (no email service set up).
// "Check delivery" asks Resend what happened after: delivered, bounced, marked as spam, delayed, opened…
const { query } = require("./db");
let ready = null;
function ensure() {
  return ready || (ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS email_log (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), to_addr TEXT NOT NULL, email_key TEXT, subject TEXT,
      status TEXT NOT NULL, error TEXT, resend_id TEXT, delivery TEXT, checked_at TIMESTAMPTZ)`);
    await query(`CREATE INDEX IF NOT EXISTS email_log_at ON email_log (at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS email_log_to ON email_log (lower(to_addr), at DESC)`);
  })().catch((e) => { ready = null; throw e; }));
}
async function log(recipients, { key = null, subject = "", status, error = null, resendId = null }) {
  try {
    await ensure();
    for (const to of [].concat(recipients).filter(Boolean))
      await query(`INSERT INTO email_log (to_addr, email_key, subject, status, error, resend_id) VALUES ($1,$2,$3,$4,$5,$6)`, [String(to).toLowerCase(), key, String(subject).slice(0, 300), status, error ? String(error).slice(0, 500) : null, resendId]);
    if (Math.random() < 0.002) await query(`DELETE FROM email_log WHERE at < now() - interval '1 year'`);
  } catch (e) { console.error("email log:", e.message); }   // logging must never stop an email
}
// Resend's error text, in plain words
function plain(err) {
  const s = String(err || ""), m = /Resend error (\d+): (.*)$/s.exec(s); let msg = m ? m[2] : s;
  try { const j = JSON.parse(msg); msg = j.message || j.error || msg; } catch (e) {}
  const code = m ? +m[1] : 0;
  if (code === 429 || /quota|rate limit/i.test(msg)) return `Resend's sending limit was reached (${msg})`;
  if (code === 403 || /not verified|domain/i.test(msg)) return `The sending domain isn't verified in Resend (${msg})`;
  if (code === 401 || /api key/i.test(msg)) return `The Resend key isn't valid (${msg})`;
  if (code === 422) return `Resend didn't accept it (${msg})`;
  return msg || "Unknown error";
}
// what happened after sending, from Resend
async function check(id) {
  await ensure();
  const r = (await query(`SELECT * FROM email_log WHERE id=$1`, [id])).rows[0]; if (!r) return null;
  if (!r.resend_id || !process.env.RESEND_API_KEY) return r;
  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(r.resend_id)}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
    if (res.ok) { const j = await res.json(); return (await query(`UPDATE email_log SET delivery=$2, checked_at=now() WHERE id=$1 RETURNING *`, [id, j.last_event || "sent"])).rows[0]; }
    return (await query(`UPDATE email_log SET checked_at=now() WHERE id=$1 RETURNING *`, [id])).rows[0];
  } catch (e) { return r; }
}
async function list({ q = "", key = "", status = "", from = "", to = "", limit = 200 } = {}) {
  await ensure();
  const w = [], a = []; const add = (sql, v) => { a.push(v); w.push(sql.replace("?", `$${a.length}`)); };
  if (q) add(`(to_addr ILIKE ? OR subject ILIKE $${a.length + 1})`, `%${q}%`);
  if (key) add(`email_key = ?`, key);
  if (status === "delivered") w.push(`delivery IN ('delivered','opened','clicked')`); else if (status === "bounced") w.push(`delivery IN ('bounced','complained')`);
  else if (status) add(`status = ?`, status);
  if (from) add(`at >= (?::date)::timestamp AT TIME ZONE 'America/Chicago'`, from);
  if (to) add(`at < ((?::date) + 1)::timestamp AT TIME ZONE 'America/Chicago'`, to);
  return (await query(`SELECT * FROM email_log ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY at DESC, id DESC LIMIT ${Math.min(+limit || 200, 5000)}`, a)).rows;
}
module.exports = { ensure, log, plain, check, list };
