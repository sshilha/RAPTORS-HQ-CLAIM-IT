// Accounts: passwords, one-time codes (texted, or read out by an admin), email changes, family requests.
// Sign-in works three ways: an emailed link (always), a password (if set), or a texted code (if SMS is set up).
const crypto = require("crypto");
const { query } = require("./db");

async function migrate() {
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;                 -- E.164, e.g. +17155550123
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users (phone) WHERE phone IS NOT NULL AND phone_verified_at IS NOT NULL;
    -- one-time codes: texted sign-in, phone check, password reset, admin-issued
    CREATE TABLE IF NOT EXISTS auth_codes (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL, code_hash TEXT NOT NULL, extra TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes (user_id, purpose, created_at);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_required BOOLEAN NOT NULL DEFAULT false;   -- must finish the Welcome step
    ALTER TABLE users ADD COLUMN IF NOT EXISTS welcomed_at TIMESTAMPTZ;   -- saw the Welcome step (or skipped it)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;     -- first successful sign-in
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    -- every sign-in attempt, for troubleshooting
    CREATE TABLE IF NOT EXISTS login_events (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, identity TEXT,
      method TEXT NOT NULL, ok BOOLEAN NOT NULL, reason TEXT, ip TEXT, device TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events (user_id, at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_events_at ON login_events (at DESC);
    -- requests that need an admin: add a family member, change a family member's details
    CREATE TABLE IF NOT EXISTS account_requests (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'approved', 'declined', 'done')),
      admin_note TEXT, decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL, decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- account requests come from people without an account yet
    ALTER TABLE account_requests ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE account_requests DROP CONSTRAINT IF EXISTS account_requests_kind_check;
    ALTER TABLE account_requests ADD CONSTRAINT account_requests_kind_check CHECK (kind IN ('add_family', 'change', 'new_account'));
  `);
}

// ---------- app-wide sign-in settings (App settings -> Accounts & sign-in) ----------
const settings = () => { const c = require("./catalog").current() || {};
  return { newAccounts: c.new_accounts === "open" ? "open" : "approval", passwords: c.password_policy === "required" ? "required" : "optional" }; };
// must they finish the Welcome step before using the app?
const mustSetUp = (u) => !!u && (u.setup_required || (settings().passwords === "required" && !u.password_hash));

// ---------- sign-in history ----------
function device(ua) {
  const s = String(ua || "");
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "Mac" : /CrOS/.test(s) ? "Chromebook" : /Linux/.test(s) ? "Linux" : "";
  const br = /Edg\//.test(s) ? "Edge" : /CriOS|Chrome\//.test(s) ? "Chrome" : /FxiOS|Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ") || s.slice(0, 40) || "Unknown";
}
async function logEvent(req, { userId = null, identity = null, method, ok, reason = null }) {
  try {
    await query(`INSERT INTO login_events (user_id, identity, method, ok, reason, ip, device) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, identity ? String(identity).slice(0, 120) : null, method, ok, reason, String(req.ip || "").slice(0, 60), device(req.get && req.get("user-agent"))]);
  } catch (e) { console.error("login log:", e.message); }
}
// The one way everyone gets signed in: session, history, and where to go next (Welcome if setup is needed)
async function signedIn(req, res, userId, method, next = "/dashboard") {
  const auth = require("./auth");
  await auth.createSession(res, userId);
  const u = (await query(`UPDATE users SET last_login_at=now(), joined_at=COALESCE(joined_at, now()), failed_logins=0, locked_until=NULL WHERE id=$1 RETURNING *`, [userId])).rows[0];
  await logEvent(req, { userId, identity: u.email, method, ok: true });
  if (mustSetUp(u) || !u.welcomed_at) return res.redirect("/welcome");
  res.redirect(next);
}

// ---------- passwords (scrypt, built into Node) ----------
const MIN_PASSWORD = 8;
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString("base64")}$${h.toString("base64")}`;
}
function checkPassword(pw, stored) {
  const m = /^scrypt\$(\d+)\$([^$]+)\$([^$]+)$/.exec(stored || ""); if (!m) return false;
  const want = Buffer.from(m[3], "base64");
  const got = crypto.scryptSync(String(pw), Buffer.from(m[2], "base64"), want.length, { N: Number(m[1]), r: 8, p: 1 });
  return crypto.timingSafeEqual(got, want);
}
const passwordProblem = (pw) => (String(pw || "").length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : String(pw).length > 200 ? "That's too long." : null);
async function setPassword(userId, pw) {
  await query(`UPDATE users SET password_hash=$2, password_set_at=now(), failed_logins=0, locked_until=NULL WHERE id=$1`, [userId, hashPassword(pw)]);
}
// Sign in with a password; locks for 15 minutes after 5 wrong tries in a row
async function passwordLogin(user, pw) {
  if (!user || !user.password_hash) return { ok: false, why: "nopass" };
  if (user.locked_until && new Date(user.locked_until) > new Date()) return { ok: false, why: "locked" };
  if (checkPassword(pw, user.password_hash)) { await query(`UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1`, [user.id]); return { ok: true }; }
  const n = (user.failed_logins || 0) + 1;
  await query(`UPDATE users SET failed_logins=$2, locked_until=$3 WHERE id=$1`, [user.id, n >= 5 ? 0 : n, n >= 5 ? new Date(Date.now() + 15 * 60e3) : null]);
  return { ok: false, why: n >= 5 ? "locked" : "wrong" };
}

// ---------- phones ----------
// US-friendly: "715-555-0123" -> "+17155550123"; already-international numbers kept
function normalizePhone(v) {
  const s = String(v || "").trim(); if (!s) return null;
  const d = s.replace(/[^\d]/g, "");
  if (s.startsWith("+") && d.length >= 10 && d.length <= 15) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}
const prettyPhone = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p || ""; };

// Who is signing in: an email, or a verified phone number
async function findUser(identity) {
  const auth = require("./auth");
  const e = auth.normalizeEmail(identity);
  if (auth.isValidEmail(e)) return { user: (await query(`SELECT * FROM users WHERE email=$1`, [e])).rows[0] || null, email: e };
  const ph = normalizePhone(identity);
  if (ph) return { user: (await query(`SELECT * FROM users WHERE phone=$1 AND phone_verified_at IS NOT NULL`, [ph])).rows[0] || null, phone: ph };
  return { user: null };
}

// ---------- one-time codes ----------
const CODE_TTL = { login: 10, phone: 10, reset: 10, admin: 15 };   // minutes
async function issueCode(userId, purpose, extra = null) {
  const recent = (await query(`SELECT count(*)::int AS n FROM auth_codes WHERE user_id=$1 AND purpose=$2 AND created_at > now() - interval '15 minutes'`, [userId, purpose])).rows[0].n;
  if (recent >= 5) return null;
  await query(`UPDATE auth_codes SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL`, [userId, purpose]);   // only the newest works
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await query(`INSERT INTO auth_codes (user_id, purpose, code_hash, extra, expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval)`,
    [userId, purpose, crypto.createHash("sha256").update(code).digest("hex"), extra, String(CODE_TTL[purpose] || 10)]);
  return code;
}
// Check a code; 5 wrong tries uses it up. Returns the code row (with .extra) or null.
async function useCode(userId, purposes, code) {
  const row = (await query(`SELECT * FROM auth_codes WHERE user_id=$1 AND purpose = ANY($2) AND used_at IS NULL AND expires_at > now() ORDER BY id DESC LIMIT 1`, [userId, [].concat(purposes)])).rows[0];
  if (!row) return null;
  const ok = row.code_hash === crypto.createHash("sha256").update(String(code || "").replace(/\D/g, "")).digest("hex");
  if (!ok) { await query(`UPDATE auth_codes SET attempts=attempts+1, used_at=CASE WHEN attempts+1 >= 5 THEN now() ELSE NULL END WHERE id=$1`, [row.id]); return null; }
  await query(`UPDATE auth_codes SET used_at=now() WHERE id=$1`, [row.id]);
  return row;
}
// A long random token for emailed links (reset password, confirm a new email)
async function issueToken(userId, purpose, extra = null, minutes = 60) {
  const t = crypto.randomBytes(32).toString("base64url");
  await query(`INSERT INTO auth_codes (user_id, purpose, code_hash, extra, expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval)`,
    [userId, purpose, crypto.createHash("sha256").update(t).digest("hex"), extra, String(minutes)]);
  return t;
}
async function peekToken(purpose, t) {
  return (await query(`SELECT * FROM auth_codes WHERE purpose=$1 AND code_hash=$2 AND used_at IS NULL AND expires_at > now()`, [purpose, crypto.createHash("sha256").update(String(t || "")).digest("hex")])).rows[0] || null;
}
async function useToken(purpose, t) {
  const row = await peekToken(purpose, t); if (!row) return null;
  await query(`UPDATE auth_codes SET used_at=now() WHERE id=$1`, [row.id]); return row;
}

async function sendInvite(req, userId) {
  const { sendEmail, shell } = require("./email"); const { APP_URL, LABELS } = require("./config");
  const u = (await query(`UPDATE users SET invited_at=now(), setup_required=true WHERE id=$1 RETURNING *`, [userId])).rows[0];
  await query(`UPDATE auth_codes SET used_at=now() WHERE user_id=$1 AND purpose='invite' AND used_at IS NULL`, [userId]);   // only the newest invite works
  const t = await issueToken(userId, "invite", null, 7 * 24 * 60);
  const link = `${APP_URL || `${req.protocol}://${req.get("host")}`}/invite?token=${encodeURIComponent(t)}`;
  const org = (require("./config").LABELS.org_name) || "Chippewa Valley Raptors";
  if (!process.env.RESEND_API_KEY) console.log(`[invite] ${u.email}: ${link}`);
  else await sendEmail({ to: u.email, subject: `You're invited to ${LABELS.app_name}`,
    html: shell(`Welcome to ${LABELS.app_name}`, `<p>${org} uses ${LABELS.app_name} for training sign-ups and volunteer shifts. Click below to set your password and get started. This link works for 7 days.</p>`, { href: link, label: "Set up my account" }),
    text: `${org} invited you to ${LABELS.app_name}. Set up your account (link works for 7 days): ${link}` });
  return link;
}

// Someone the club already knows may sign in even when new accounts need approval:
// admins, coaches on a board, and anyone in People (adults with that email)
async function knownEmail(email) {
  const auth = require("./auth");
  if (auth.isAdmin({ email })) return true;
  return (await query(`SELECT 1 FROM schedule_coaches WHERE lower(email)=lower($1) UNION ALL SELECT 1 FROM athletes WHERE lower(email)=lower($1) AND archived_at IS NULL LIMIT 1`, [email])).rowCount > 0;
}

module.exports = { knownEmail, sendInvite, settings, mustSetUp, device, logEvent, signedIn, migrate, MIN_PASSWORD, hashPassword, checkPassword, passwordProblem, setPassword, passwordLogin, normalizePhone, prettyPhone,
  findUser, issueCode, useCode, issueToken, peekToken, useToken };
