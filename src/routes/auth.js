const express = require("express");
const auth = require("../auth");
const { sendEmail, shell } = require("../email");
const { APP_URL, LABELS } = require("../config");
const v = require("../views/auth");
const { wrap } = require("./util");

const router = express.Router();
const DEV_SHOW_LINK = process.env.DEV_SHOW_LINK === "true";

router.get("/", (req, res) => (req.user ? res.redirect("/dashboard") : res.send(v.loginPage())));

router.post("/login", wrap(async (req, res) => {
  const email = auth.normalizeEmail(req.body.email);
  if (!auth.isValidEmail(email)) return res.status(400).send(v.loginPage({ error: "Enter a valid email address.", email }));

  const user = await auth.findOrCreateUser(email);
  const token = await auth.createLoginToken(user.id);
  if (!token) return res.status(429).send(v.loginPage({ error: "Too many sign-in links requested. Wait 15 minutes and try again.", email }));

  const link = `${APP_URL || `${req.protocol}://${req.get("host")}`}/auth/verify?token=${encodeURIComponent(token)}`;
  try {
    if (!process.env.RESEND_API_KEY) console.log(`[login link] ${email}: ${link}`);
    else await sendEmail({
      to: email,
      subject: `Your ${LABELS.app_name} sign-in link`,
      html: shell(`Sign in to ${LABELS.app_name}`,
        `<p style="color:#5b6b7a">This link works once and expires in ${auth.LOGIN_TOKEN_MINUTES} minutes. If you didn't request it, ignore this email.</p>`,
        { href: link, label: "Sign in" }),
      text: `Sign in to ${LABELS.app_name}: ${link}\n\nThis link works once and expires in ${auth.LOGIN_TOKEN_MINUTES} minutes.`,
    });
  } catch (err) {
    console.error("Login email failed:", err.message);
    return res.status(502).send(v.loginPage({ error: "We couldn't send the email. Try again in a minute.", email }));
  }
  res.send(v.checkEmailPage({ email, devLink: DEV_SHOW_LINK ? link : null }));
}));

router.get("/auth/verify", wrap(async (req, res) => {
  const token = String(req.query.token || "");
  const found = token && (await auth.peekLoginToken(token));
  if (!found) return res.status(400).send(v.invalidLinkPage());
  res.send(v.confirmPage({ token, email: found.email }));
}));

router.post("/auth/verify", wrap(async (req, res) => {
  const userId = await auth.consumeLoginToken(String(req.body.token || ""));
  if (!userId) return res.status(400).send(v.invalidLinkPage());
  await auth.createSession(res, userId);
  res.redirect("/dashboard");
}));

router.post("/logout", wrap(async (req, res) => {
  await auth.destroySession(req, res);
  res.redirect("/");
}));

module.exports = router;
