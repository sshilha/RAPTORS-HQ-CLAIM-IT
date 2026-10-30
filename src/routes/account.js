// My Account: people edit their own profile and sign-in options; family and access are view-only;
// adding or changing a family member is a request an admin approves.
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const A = require("../accounts");
const SMS = require("../sms");
const PP = require("../people");
const { sendEmail, shell } = require("../email");
const { APP_URL, LABELS } = require("../config");
const v = require("../views/account");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser);
const clean = (x, n) => str(x).replace(/\s+/g, " ").slice(0, n);
const back = (anchor) => `/account${anchor ? `#${anchor}` : ""}`;
const me = async (user) => (await query(`SELECT * FROM athletes WHERE kind='adult' AND self_user_id=$1 ORDER BY id LIMIT 1`, [user.id])).rows[0] || null;

router.get("/", wrap(async (req, res) => {
  const u = (await query(`SELECT * FROM users WHERE id=$1`, [req.user.id])).rows[0];
  const person = await me(req.user);
  const kids = (await query(`SELECT a.*, ARRAY(SELECT sc.name FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id WHERE m.athlete_id=a.id AND sc.archived_at IS NULL ORDER BY sc.name) AS boards,
      ARRAY(SELECT coalesce(nullif(trim(p.first_name||' '||p.last_name),''), u2.email) FROM parent_athletes pa2 JOIN users u2 ON u2.id=pa2.user_id
        LEFT JOIN athletes p ON p.self_user_id=u2.id AND p.kind='adult' WHERE pa2.athlete_id=a.id AND pa2.user_id<>$1 ORDER BY 1) AS other_parents
    FROM parent_athletes pa JOIN athletes a ON a.id=pa.athlete_id WHERE pa.user_id=$1 AND a.archived_at IS NULL ORDER BY a.first_name`, [req.user.id])).rows;
  const coaching = (await query(`SELECT sc.name FROM schedule_coaches c JOIN schedules sc ON sc.id=c.schedule_id WHERE lower(c.email)=lower($1) ORDER BY sc.name`, [u.email])).rows.map((r) => r.name);
  const scope = await PP.reportScope(req.user);
  const reportBoards = scope && !scope.all ? (await query(`SELECT name FROM schedules WHERE id = ANY($1) ORDER BY name`, [scope.boards])).rows.map((r) => r.name) : [];
  const requests = (await query(`SELECT * FROM account_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.user.id])).rows;
  req.user.can_reports = !!scope;
  res.send(v.accountPage({ user: req.user, flash: flashFrom(req), u, person, kids, coaching, scope, reportBoards, requests, admin: auth.isAdmin(req.user),
    sms: SMS.enabled(), pendingPhone: req.query.phone || null, devCode: req.query.dc || null }));
}));

// profile: their own name, organization (saved right away)
router.post("/profile", wrap(async (req, res) => {
  const first = clean(req.body.first_name, 40), last = clean(req.body.last_name, 40), org = clean(req.body.organization, 80) || null;
  if (!first || !last) return go(res, back("profile"), { err: "Enter your first and last name." });
  let p = await me(req.user);
  if (!p) p = (await PP.ensureAdult(req.user.email, { first, last })).person;
  await query(`UPDATE athletes SET first_name=$2, last_name=$3, organization=$4 WHERE id=$1`, [p.id, first, last, org]);
  go(res, back("profile"), { ok: "Profile saved." });
}));

// change sign-in email: confirm from the new address first
router.post("/email", wrap(async (req, res) => {
  const e = auth.normalizeEmail(req.body.email);
  if (!auth.isValidEmail(e)) return go(res, back("email"), { err: "Enter a valid email address." });
  if (e === req.user.email) return go(res, back("email"), { err: "That's already your email." });
  if ((await query(`SELECT 1 FROM users WHERE email=$1`, [e])).rowCount) return go(res, back("email"), { err: "That email already has its own account. Ask an admin to combine them." });
  const t = await A.issueToken(req.user.id, "email_change", e, 60);
  const link = `${APP_URL || `${req.protocol}://${req.get("host")}`}/account/email/confirm?token=${encodeURIComponent(t)}`;
  if (!process.env.RESEND_API_KEY) console.log(`[email change] ${e}: ${link}`);
  else await sendEmail({ to: e, subject: `Confirm your new ${LABELS.app_name} email`, html: shell("Confirm your new email", `<p style="color:#5b6b7a">Click to make <b>${e}</b> the email you sign in with. This link expires in 60 minutes.</p>`, { href: link, label: "Confirm email" }),
    text: `Confirm ${e} as your ${LABELS.app_name} sign-in email: ${link}` });
  go(res, back("email"), { ok: `We sent a link to ${e}. Click it to finish the change.${process.env.DEV_SHOW_LINK === "true" ? ` (Testing: ${link})` : ""}` });
}));
router.get("/email/confirm", wrap(async (req, res) => {
  const row = await A.useToken("email_change", req.query.token);
  if (!row) return go(res, back("email"), { err: "That link expired or was already used. Try again." });
  const old = (await query(`SELECT email FROM users WHERE id=$1`, [row.user_id])).rows[0].email;
  if ((await query(`SELECT 1 FROM users WHERE email=$1`, [row.extra])).rowCount) return go(res, back("email"), { err: "That email already has its own account." });
  await query(`UPDATE users SET email=$2 WHERE id=$1`, [row.user_id, row.extra]);
  await query(`UPDATE athletes SET email=$2 WHERE self_user_id=$1 AND kind='adult'`, [row.user_id, row.extra]);
  await query(`UPDATE schedule_coaches SET email=$2 WHERE lower(email)=lower($1)`, [old, row.extra]);
  if (process.env.RESEND_API_KEY) sendEmail({ to: old, subject: `Your ${LABELS.app_name} email was changed`, text: `Your sign-in email was changed to ${row.extra}. If this wasn't you, contact the club right away.`,
    html: shell("Your email was changed", `<p>Your sign-in email is now <b>${row.extra}</b>. If this wasn't you, contact the club right away.</p>`) }).catch(() => {});
  go(res, back("email"), { ok: `Done. You now sign in with ${row.extra}.` });
}));

// password: set or change (current one needed when changing)
router.post("/password", wrap(async (req, res) => {
  const u = (await query(`SELECT * FROM users WHERE id=$1`, [req.user.id])).rows[0];
  if (u.password_hash && !A.checkPassword(req.body.current, u.password_hash)) return go(res, back("password"), { err: "Your current password isn't right." });
  if (req.body.password !== req.body.password2) return go(res, back("password"), { err: "The two new passwords don't match." });
  const bad = A.passwordProblem(req.body.password); if (bad) return go(res, back("password"), { err: bad });
  await A.setPassword(u.id, req.body.password);
  go(res, back("password"), { ok: u.password_hash ? "Password changed." : "Password set. You can now sign in with it." });
}));
router.post("/password/remove", wrap(async (req, res) => {
  await query(`UPDATE users SET password_hash=NULL, password_set_at=NULL WHERE id=$1`, [req.user.id]);
  go(res, back("password"), { ok: "Password removed. You'll sign in with an emailed link (or a texted code)." });
}));

// mobile number for texted codes: confirm with a code first
router.post("/phone", wrap(async (req, res) => {
  const ph = A.normalizePhone(req.body.phone);
  if (!ph) return go(res, back("phone"), { err: "Enter a 10-digit mobile number." });
  if ((await query(`SELECT 1 FROM users WHERE phone=$1 AND phone_verified_at IS NOT NULL AND id<>$2`, [ph, req.user.id])).rowCount) return go(res, back("phone"), { err: "That number is already on another account." });
  if (!SMS.enabled()) {   // no texting yet: keep it as a contact number on their profile
    const p = await me(req.user); if (p) await query(`UPDATE athletes SET phone=$2 WHERE id=$1`, [p.id, A.prettyPhone(ph)]);
    return go(res, back("phone"), { ok: "Phone saved." });
  }
  const code = await A.issueCode(req.user.id, "phone", ph);
  if (!code) return go(res, back("phone"), { err: "Too many codes requested. Wait 15 minutes." });
  try { await SMS.send(ph, `${code} is your ${LABELS.app_name} code to confirm this number.`); } catch (e) { console.error(e.message); return go(res, back("phone"), { err: "We couldn't text that number." }); }
  res.redirect(`/account?phone=${encodeURIComponent(ph)}${SMS.dev() ? `&dc=${code}` : ""}#phone`);
}));
router.post("/phone/verify", wrap(async (req, res) => {
  const row = await A.useCode(req.user.id, "phone", req.body.code);
  if (!row) return go(res, back("phone"), { err: "That code didn't work. Send a new one." });
  await query(`UPDATE users SET phone=$2, phone_verified_at=now() WHERE id=$1`, [req.user.id, row.extra]);
  const p = await me(req.user); if (p) await query(`UPDATE athletes SET phone=$2 WHERE id=$1`, [p.id, A.prettyPhone(row.extra)]);
  go(res, back("phone"), { ok: "Mobile number confirmed. You can now sign in with a texted code." });
}));
router.post("/phone/remove", wrap(async (req, res) => {
  await query(`UPDATE users SET phone=NULL, phone_verified_at=NULL WHERE id=$1`, [req.user.id]);
  go(res, back("phone"), { ok: "Mobile number removed from sign-in." });
}));

// requests an admin approves: add a family member, or change one's details
router.post("/request", wrap(async (req, res) => {
  const kind = req.body.kind === "change" ? "change" : "add_family";
  let data;
  if (kind === "add_family") {
    data = { first_name: clean(req.body.first_name, 40), last_name: clean(req.body.last_name, 40), birth_year: int(req.body.birth_year) || null,
      team: clean(req.body.team, 40) || null, relationship: clean(req.body.relationship, 40) || null, note: String(req.body.note || "").trim().slice(0, 600) || null };
    if (!data.first_name || !data.last_name) return go(res, back("requests"), { err: "Enter the family member's first and last name." });
  } else {
    data = { about: clean(req.body.about, 80) || null, message: String(req.body.message || "").trim().slice(0, 1000) };
    if (!data.message) return go(res, back("requests"), { err: "Tell us what should change." });
  }
  await query(`INSERT INTO account_requests (user_id, kind, data) VALUES ($1,$2,$3)`, [req.user.id, kind, JSON.stringify(data)]);
  const to = require("../catalog").current().change_email || "info@chippewavalleyraptors.com";
  const what = kind === "add_family" ? `add ${data.first_name} ${data.last_name} to their family` : `change ${data.about || "their info"}`;
  sendEmail({ to, subject: `Request from ${req.user.email}: ${what}`, text: `${req.user.email} asked to ${what}.\n\nReview it in ${LABELS.app_name}: App settings → Requests.`,
    html: shell("New request", `<p><b>${req.user.email}</b> asked to ${what}.</p>`, { href: `${APP_URL || ""}/admin/requests`, label: "Review requests" }) }).catch((e) => console.error(e.message));
  go(res, back("requests"), { ok: "Request sent. An admin will review it, and you'll get an email when it's done." });
}));

module.exports = router;
