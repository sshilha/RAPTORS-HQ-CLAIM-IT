const { esc, layout } = require("./layout");

const loginPage = ({ error = "", email = "" } = {}) =>
  layout({
    title: "Sign in",
    flash: { err: error },
    body: `
<section class="panel">
  <h1>Sign in to reserve training</h1>
  <p class="lede">Enter the email you use with the Raptors. We'll send you a sign-in link, so there's no password to remember.</p>
  <form method="post" action="/login" class="stack">
    <label for="email">Email address</label>
    <input id="email" name="email" type="email" autocomplete="email" inputmode="email"
           required value="${esc(email)}" placeholder="you@example.com">
    <button class="btn" type="submit">Send sign-in link</button>
  </form>
</section>`,
  });

const checkEmailPage = ({ email, devLink }) =>
  layout({
    title: "Check your email",
    body: `
<section class="panel">
  <h1>Check your email</h1>
  <p class="lede">If <strong>${esc(email)}</strong> can sign in, a link is on its way. It works once and expires in 15 minutes.</p>
  <p class="muted">Not seeing it? Check your spam or promotions folder, or <a href="/">send a new link</a>.</p>
  ${devLink ? `<div class="devbox"><p>Testing mode: the link is shown here instead of being emailed.</p><a href="${esc(devLink)}">Open sign-in link</a></div>` : ""}
</section>`,
  });

const confirmPage = ({ token, email }) =>
  layout({
    title: "Confirm sign in",
    body: `
<section class="panel">
  <h1>Finish signing in</h1>
  <p class="lede">Signing in as <strong>${esc(email)}</strong>.</p>
  <form method="post" action="/auth/verify">
    <input type="hidden" name="token" value="${esc(token)}">
    <button class="btn" type="submit">Sign in</button>
  </form>
</section>`,
  });

const invalidLinkPage = () =>
  layout({
    title: "Link expired",
    body: `
<section class="panel">
  <h1>This sign-in link has expired or was already used</h1>
  <p class="lede">Links work once and expire after 15 minutes. Request a new one to continue.</p>
  <a class="btn" href="/">Send a new link</a>
</section>`,
  });

module.exports = { loginPage, checkEmailPage, confirmPage, invalidLinkPage };
