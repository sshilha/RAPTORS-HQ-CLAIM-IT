const crypto = require("crypto");
const { query } = require("./db");

const LOGIN_TOKEN_MINUTES = 15;
const SESSION_DAYS = 30;
const MAX_LINKS_PER_15_MIN = 5;
const COOKIE_NAME = "rt_session";

const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");

const normalizeEmail = (e) => String(e || "").trim().toLowerCase();
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

async function findOrCreateUser(email) {
  const { rows } = await query(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [email]
  );
  return rows[0];
}

// Returns the raw token (to put in the email link), or null if rate limited.
async function createLoginToken(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM login_tokens
     WHERE user_id = $1 AND created_at > now() - interval '15 minutes'`,
    [userId]
  );
  if (rows[0].n >= MAX_LINKS_PER_15_MIN) return null;

  const token = newToken();
  await query(
    `INSERT INTO login_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [userId, hash(token), String(LOGIN_TOKEN_MINUTES)]
  );
  return token;
}

// Checks a token without consuming it (used to render the confirm screen).
async function peekLoginToken(token) {
  const { rows } = await query(
    `SELECT lt.id, u.email FROM login_tokens lt JOIN users u ON u.id = lt.user_id
     WHERE lt.token_hash = $1 AND lt.used_at IS NULL AND lt.expires_at > now()`,
    [hash(token)]
  );
  return rows[0] || null;
}

// Consumes a token atomically. Returns user_id or null.
async function consumeLoginToken(token) {
  const { rows } = await query(
    `UPDATE login_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hash(token)]
  );
  if (!rows[0]) return null;
  // Invalidate any other outstanding links for this user.
  await query(
    `UPDATE login_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
    [rows[0].user_id]
  );
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [rows[0].user_id]);
  return rows[0].user_id;
}

async function createSession(res, userId) {
  const token = newToken();
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [userId, hash(token), String(SESSION_DAYS)]
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || /^https:/.test(process.env.APP_URL || ""),
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

async function destroySession(req, res) {
  const token = req.cookies[COOKIE_NAME];
  if (token) await query(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)]);
  res.clearCookie(COOKIE_NAME);
}

// Middleware: attaches req.user if a valid session cookie is present.
async function loadUser(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();
  try {
    const { rows } = await query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hash(token)]
    );
    if (rows[0]) req.user = rows[0];
  } catch (err) {
    console.error("Session lookup failed:", err.message);
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.redirect("/");
  next();
}

function isAdmin(user) {
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",").map(normalizeEmail).filter(Boolean);
  return !!user && admins.includes(user.email);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(404).send("Not found");
  next();
}

async function cleanupExpired() {
  await query(`DELETE FROM login_tokens WHERE expires_at < now() - interval '1 day'`);
  await query(`DELETE FROM sessions WHERE expires_at < now()`);
}

module.exports = {
  LOGIN_TOKEN_MINUTES, normalizeEmail, isValidEmail, findOrCreateUser,
  createLoginToken, peekLoginToken, consumeLoginToken, createSession,
  destroySession, loadUser, requireUser, requireAdmin, isAdmin, cleanupExpired,
};
