const { esc, layout } = require("./layout");

const gate = (title, body, flash) => layout({ title, body, flash, gate: true });

const loginPage = ({ error = "", email = "" } = {}) => gate("Sign in", `
  <form method="post" action="/login" class="stack">
    <label for="email">Email address</label>
    <input id="email" name="email" type="email" autocomplete="email" inputmode="email"
           required value="${esc(email)}" placeholder="you@example.com">
    <button class="btn" type="submit">Send sign-in link</button>
  </form>
  <p class="muted gate-help">Use the email on your SportsEngine account. We'll email you a link, so there's no password to remember.</p>`,
  { err: error });

const checkEmailPage = ({ email, devLink }) => gate("Check your email", `
  <div class="gate-card">
    <h1>Check your email</h1>
    <p>If <strong>${esc(email)}</strong> can sign in, a link is on its way. It works once and expires in 15 minutes.</p>
    <p class="muted">Not seeing it? Check spam or promotions, or <a href="/">send a new link</a>.</p>
    ${devLink ? `<div class="devbox"><p>Testing mode: the link is shown here instead of being emailed.</p><a href="${esc(devLink)}">Open sign-in link</a></div>` : ""}
  </div>`);

const confirmPage = ({ token, email }) => gate("Confirm sign in", `
  <div class="gate-card">
    <h1>Finish signing in</h1>
    <p>Signing in as <strong>${esc(email)}</strong>.</p>
    <form method="post" action="/auth/verify">
      <input type="hidden" name="token" value="${esc(token)}">
      <button class="btn" type="submit">Sign in</button>
    </form>
  </div>`);

const invalidLinkPage = () => gate("Link expired", `
  <div class="gate-card">
    <h1>Link expired</h1>
    <p>Sign-in links work once and expire after 15 minutes. Request a new one to continue.</p>
    <a class="btn" href="/">Send a new link</a>
  </div>`);

module.exports = { loginPage, checkEmailPage, confirmPage, invalidLinkPage };
