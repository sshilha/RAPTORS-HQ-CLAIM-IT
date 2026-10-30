const express = require("express");
const auth = require("../auth");
const { sendEmail, shell } = require("../email");
const { APP_URL, LABELS } = require("../config");
const v = require("../views/auth");
const { wrap } = require("./util");

const router = express.Router();
const DEV_SHOW_LINK = process.env.DEV_SHOW_LINK === "true";

router.get("/", (req, res) => (req.user ? res.redirect("/dashboard") : res.send(v.loginPage())));

const A = require("../accounts");
const SMS = require("../sms");
const { query } = require("../db");
const base = (req) => APP_URL || `${req.protocol}://${req.get("host")}`;
const mask = (e) => String(e).replace(/^(.)(.*)(.@.*)$/, (m, a, b, c) => a + "•".repeat(Math.min(6, b.length)) + c);

async function emailLink(req, res, user, email) {
  const token = await auth.createLoginToken(user.id);
  if (!token) return res.status(429).send(v.loginPage({ error: "Too many sign-in links requested. Wait 15 minutes and try again.", email }));
  const link = `${base(req)}/auth/verify?token=${encodeURIComponent(token)}`;
  try {
    if (!process.env.RESEND_API_KEY) console.log(`[login link] ${user.email}: ${link}`);
    else await sendEmail({ to: user.email, subject: `Your ${LABELS.app_name} sign-in link`,
      html: shell(`Sign in to ${LABELS.app_name}`, `<p style="color:#5b6b7a">This link works once and expires in ${auth.LOGIN_TOKEN_MINUTES} minutes. If you didn't request it, ignore this email.</p>`, { href: link, label: "Sign in" }),
      text: `Sign in to ${LABELS.app_name}: ${link}\n\nThis link works once and expires in ${auth.LOGIN_TOKEN_MINUTES} minutes.` });
  } catch (err) { console.error("Login email failed:", err.message); return res.status(502).send(v.loginPage({ error: "We couldn't send the email. Try again in a minute.", email })); }
  res.send(v.checkEmailPage({ email: user.email === email ? email : mask(user.email), devLink: DEV_SHOW_LINK ? link : null }));
}

// One form, three ways in: password, emailed link, texted code
router.post("/login", wrap(async (req, res) => {
  const who = String(req.body.email || "").trim();
  const method = ["password", "link", "text"].includes(req.body.method) ? req.body.method : "link";
  const found = await A.findUser(who);
  if (!found.email && !found.phone) return res.status(400).send(v.loginPage({ error: "Enter a valid email address or mobile number.", email: who }));
  if (method === "password") {
    const r = await A.passwordLogin(found.user, req.body.password);
    if (r.ok) return A.signedIn(req, res, found.user.id, "password");
    await A.logEvent(req, { userId: found.user ? found.user.id : null, identity: who, method: "password", ok: false,
      reason: !found.user ? "no account" : r.why === "locked" ? "locked (too many tries)" : r.why === "nopass" ? "no password set" : "wrong password" });
    const msg = r.why === "locked" ? "Too many wrong tries. Wait 15 minutes, or use a sign-in link below."
      : r.why === "nopass" && found.user ? "That account doesn't have a password yet. Use a sign-in link below, then set one under My Account."
      : "That email (or phone) and password don't match.";
    return res.status(401).send(v.loginPage({ error: msg, email: who }));
  }
  if (method === "text") {
    if (!SMS.enabled()) return res.send(v.loginPage({ error: "Texting isn't available yet. Use a sign-in link.", email: who }));
    const u = found.user && found.user.phone && found.user.phone_verified_at ? found.user : null;
    if (!u) { await A.logEvent(req, { userId: found.user ? found.user.id : null, identity: who, method: "text code", ok: false, reason: found.user ? "no confirmed mobile number" : "no account" });
      return res.send(v.codePage({ email: who, sentTo: "the mobile number on that account (if there is one)" })); }   // don't reveal who has accounts
    const code = await A.issueCode(u.id, "login");
    if (!code) return res.status(429).send(v.loginPage({ error: "Too many codes requested. Wait 15 minutes and try again.", email: who }));
    try { await SMS.send(u.phone, `${code} is your ${LABELS.app_name} sign-in code. It expires in 10 minutes.`); }
    catch (e) { console.error(e.message); return res.status(502).send(v.loginPage({ error: "We couldn't send the text. Try a sign-in link instead.", email: who })); }
    return res.send(v.codePage({ email: who, sentTo: A.prettyPhone(u.phone), devCodeShown: SMS.dev() ? code : "" }));
  }
  // emailed link: an email signs in (or creates) that account; a phone sends the link to the account's email
  if (found.email) {
    if (!found.user && A.settings().newAccounts === "approval" && !(await A.knownEmail(found.email))) {
      await A.logEvent(req, { identity: found.email, method: "email link", ok: false, reason: "no account" });
      return res.send(v.noAccountPage({ email: found.email }));
    }
    return emailLink(req, res, found.user || (await auth.findOrCreateUser(found.email)), found.email);
  }
  if (!found.user) return res.send(v.checkEmailPage({ email: "the email on that account" }));
  return emailLink(req, res, found.user, who);
}));

// a texted code, or one an admin read out
router.get("/login/code", (req, res) => res.send(v.codePage({ admin: true })));
router.post("/login/code", wrap(async (req, res) => {
  const who = String(req.body.email || "").trim();
  const { user } = await A.findUser(who);
  const ok = user && (await A.useCode(user.id, ["login", "admin"], req.body.code));
  if (!ok) { await A.logEvent(req, { userId: user ? user.id : null, identity: who, method: "code", ok: false, reason: user ? "wrong or expired code" : "no account" });
    return res.status(401).send(v.codePage({ email: who, admin: true, error: "That code didn't work. Codes expire after 10–15 minutes and work once." })); }
  return A.signedIn(req, res, user.id, ok.purpose === "admin" ? "admin code" : "text code");
}));

// forgot password: reset by emailed link or texted code
router.get("/forgot", (req, res) => res.send(v.forgotPage()));
router.post("/forgot", wrap(async (req, res) => {
  const who = String(req.body.email || "").trim();
  const found = await A.findUser(who);
  if (!found.email && !found.phone) return res.status(400).send(v.forgotPage({ error: "Enter a valid email address or mobile number.", email: who }));
  if (req.body.method === "text" && SMS.enabled()) {
    const u = found.user && found.user.phone_verified_at ? found.user : null;
    let code = null;
    if (u) { code = await A.issueCode(u.id, "reset"); if (code) try { await SMS.send(u.phone, `${code} is your ${LABELS.app_name} password reset code. It expires in 10 minutes.`); } catch (e) { console.error(e.message); } }
    return res.send(v.resetPage({ byCode: true, email: who, sentTo: u ? A.prettyPhone(u.phone) : "the mobile number on that account (if there is one)", devCodeShown: SMS.dev() && code ? code : "" }));
  }
  let devLink = null;
  if (found.user) {
    const t = await A.issueToken(found.user.id, "reset_link", null, 60);
    const link = `${base(req)}/reset?token=${encodeURIComponent(t)}`;
    if (!process.env.RESEND_API_KEY) console.log(`[reset link] ${found.user.email}: ${link}`);
    else await sendEmail({ to: found.user.email, subject: `Reset your ${LABELS.app_name} password`,
      html: shell("Reset your password", `<p style="color:#5b6b7a">This link works once and expires in 60 minutes. If you didn't ask for it, ignore this email.</p>`, { href: link, label: "Set a new password" }),
      text: `Reset your ${LABELS.app_name} password: ${link}\n\nThis link works once and expires in 60 minutes.` }).catch((e) => console.error(e.message));
    if (DEV_SHOW_LINK) devLink = link;
  }
  res.send(v.sentResetPage({ email: found.user && found.user.email !== who ? mask(found.user.email) : who, devLink }));
}));
router.get("/reset", wrap(async (req, res) => {
  const row = await A.peekToken("reset_link", req.query.token);
  if (!row) return res.status(400).send(v.invalidLinkPage("Password reset links"));
  res.send(v.resetPage({ token: req.query.token }));
}));
const pwCheck = (b) => (b.password !== b.password2 ? "The two passwords don't match." : A.passwordProblem(b.password));
router.post("/reset", wrap(async (req, res) => {
  const bad = pwCheck(req.body); if (bad) return res.status(400).send(v.resetPage({ token: req.body.token, error: bad }));
  const row = await A.useToken("reset_link", req.body.token);
  if (!row) return res.status(400).send(v.invalidLinkPage("Password reset links"));
  await A.setPassword(row.user_id, req.body.password);
  return A.signedIn(req, res, row.user_id, "password reset (email)", "/dashboard?ok=" + encodeURIComponent("Your new password is saved."));
}));
router.post("/reset/code", wrap(async (req, res) => {
  const who = String(req.body.email || "").trim();
  const bad = pwCheck(req.body); if (bad) return res.status(400).send(v.resetPage({ byCode: true, email: who, error: bad }));
  const { user } = await A.findUser(who);
  const ok = user && (await A.useCode(user.id, ["reset", "admin"], req.body.code));
  if (!ok) return res.status(401).send(v.resetPage({ byCode: true, email: who, error: "That code didn't work. Codes expire after 10 minutes and work once." }));
  await A.setPassword(user.id, req.body.password);
  return A.signedIn(req, res, user.id, "password reset (text)", "/dashboard?ok=" + encodeURIComponent("Your new password is saved."));
}));

router.get("/auth/verify", wrap(async (req, res) => {
  const token = String(req.query.token || "");
  const found = token && (await auth.peekLoginToken(token));
  if (!found) return res.status(400).send(v.invalidLinkPage());
  res.send(v.confirmPage({ token, email: found.email }));
}));

router.post("/auth/verify", wrap(async (req, res) => {
  const userId = await auth.consumeLoginToken(String(req.body.token || ""));
  if (!userId) { await A.logEvent(req, { method: "email link", ok: false, reason: "link expired or already used" }); return res.status(400).send(v.invalidLinkPage()); }
  return A.signedIn(req, res, userId, "email link");
  res.redirect("/dashboard");
}));

// ---------- request an account (when new accounts need approval) ----------
router.get("/request-account", (req, res) => res.send(v.requestAccountPage({ email: String(req.query.email || "") })));
router.post("/request-account", wrap(async (req, res) => {
  const b = req.body, clean = (x, n) => String(x || "").replace(/\s+/g, " ").trim().slice(0, n);
  const data = { first_name: clean(b.first_name, 40), last_name: clean(b.last_name, 40), email: auth.normalizeEmail(b.email), phone: clean(b.phone, 30) || null,
    organization: clean(b.organization, 80) || null, connection: String(b.connection || "").trim().slice(0, 600) || null };
  const again = (error) => res.status(400).send(v.requestAccountPage({ ...data, error }));
  if (!data.first_name || !data.last_name) return again("Enter your first and last name.");
  if (!auth.isValidEmail(data.email)) return again("Enter a valid email address.");
  if (!data.connection) return again("Tell us how you're connected to the club.");
  if ((await query(`SELECT 1 FROM users WHERE email=$1`, [data.email])).rowCount) return res.send(v.loginPage({ notice: "That email already has an account. Sign in below.", email: data.email }));
  const recent = (await query(`SELECT count(*)::int AS n FROM account_requests WHERE kind='new_account' AND data->>'email'=$1 AND created_at > now() - interval '1 day'`, [data.email])).rows[0].n;
  if (!recent) {
    await query(`INSERT INTO account_requests (user_id, kind, data) VALUES (NULL, 'new_account', $1)`, [JSON.stringify(data)]);
    const to = require("../catalog").current().change_email || "info@chippewavalleyraptors.com";
    sendEmail({ to, subject: `Account request: ${data.first_name} ${data.last_name}`, text: `${data.first_name} ${data.last_name} (${data.email}) asked for an account.\n\n${data.connection}\n\nReview: App settings → Requests.`,
      html: shell("New account request", `<p><b>${data.first_name} ${data.last_name}</b> (${data.email}) asked for an account.</p><p>${data.connection.replace(/</g, "&lt;")}</p>`, { href: `${base(req)}/admin/requests`, label: "Review requests" }) }).catch((e) => console.error(e.message));
  }
  res.send(v.requestSentPage({ email: data.email }));
}));

// ---------- invites: a 7-day link that signs them in and opens the Welcome step ----------
router.get("/invite", wrap(async (req, res) => {
  const row = await A.peekToken("invite", req.query.token);
  if (!row) { await A.logEvent(req, { method: "invite", ok: false, reason: "invite expired or already used" }); return res.status(400).send(v.invalidLinkPage("Invite links")); }
  const u = (await query(`SELECT email FROM users WHERE id=$1`, [row.user_id])).rows[0];
  res.send(v.inviteConfirmPage({ token: req.query.token, email: u ? u.email : "" }));
}));
router.post("/invite", wrap(async (req, res) => {
  const row = await A.useToken("invite", req.body.token);
  if (!row) return res.status(400).send(v.invalidLinkPage("Invite links"));
  return A.signedIn(req, res, row.user_id, "invite");
}));

// ---------- the Welcome step: name, password (required or optional), phone ----------
router.get("/welcome", auth.requireUser, wrap(async (req, res) => {
  const p = (await query(`SELECT * FROM athletes WHERE kind='adult' AND self_user_id=$1 ORDER BY id LIMIT 1`, [req.user.id])).rows[0] || {};
  res.send(v.welcomePage({ user: req.user, p, required: A.mustSetUp(req.user), hasPassword: !!req.user.password_hash, err: req.query.err }));
}));
router.post("/welcome", auth.requireUser, wrap(async (req, res) => {
  const b = req.body, clean = (x, n) => String(x || "").replace(/\s+/g, " ").trim().slice(0, n);
  const required = A.mustSetUp(req.user);
  if (b.skip && !required) { await query(`UPDATE users SET welcomed_at=now() WHERE id=$1`, [req.user.id]); return res.redirect("/dashboard"); }
  const first = clean(b.first_name, 40), last = clean(b.last_name, 40);
  if (!first || !last) return res.redirect("/welcome?err=" + encodeURIComponent("Enter your first and last name."));
  const needPw = required && !req.user.password_hash || b.password;
  if (needPw) {
    if (b.password !== b.password2) return res.redirect("/welcome?err=" + encodeURIComponent("The two passwords don't match."));
    const bad = A.passwordProblem(b.password); if (bad) return res.redirect("/welcome?err=" + encodeURIComponent(bad));
    await A.setPassword(req.user.id, b.password);
  }
  const { person } = await require("../people").ensureAdult(req.user.email, { first, last });
  const ph = A.normalizePhone(b.phone);
  await query(`UPDATE athletes SET first_name=$2, last_name=$3, phone=COALESCE($4, phone) WHERE id=$1`, [person.id, first, last, ph ? A.prettyPhone(ph) : null]);
  await query(`UPDATE users SET setup_required=false, welcomed_at=now() WHERE id=$1`, [req.user.id]);
  res.redirect("/dashboard?ok=" + encodeURIComponent("You're all set. Welcome!"));
}));

router.post("/logout", wrap(async (req, res) => {
  await auth.destroySession(req, res);
  res.redirect("/");
}));

module.exports = router;
