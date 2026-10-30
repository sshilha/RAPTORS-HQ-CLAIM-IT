const { esc, layout } = require("./layout");

const gate = (title, body, flash) => layout({ title, body, flash, gate: true });
const smsOn = () => require("../sms").enabled();
const devCode = (code) => (code ? `<div class="devbox"><p>Testing mode: the text message is shown here instead of being sent.</p><b class="dev-code">${esc(code)}</b></div>` : "");

const loginPage = ({ error = "", email = "", notice = "" } = {}) => gate("Sign in", `
  <form method="post" action="/login" class="stack signin">
    <label for="who">Email or mobile number</label>
    <input id="who" name="email" autocomplete="username" required value="${esc(email)}" placeholder="you@example.com or 715-555-0123">
    <div class="pw-row"><label for="pw">Password</label><a class="forgot" href="/forgot">Forgot password?</a></div>
    <input id="pw" name="password" type="password" autocomplete="current-password" placeholder="If you've set one">
    <button class="btn" type="submit" name="method" value="password">Sign in</button>
    <div class="or"><span>or</span></div>
    <button class="btn btn-alt" type="submit" name="method" value="link">Email me a sign-in link</button>
    ${smsOn() ? `<button class="btn btn-alt" type="submit" name="method" value="text">Text me a code</button>` : ""}
  </form>
  <p class="muted gate-help">No password yet? Use a sign-in link. You can set a password later under <b>My Account</b>.<br>
    Have a code from an admin? <a href="/login/code">Enter it here</a>.</p>
  <script>document.querySelector(".signin").addEventListener("submit", function (e) {
    var b = e.submitter; if (b && b.value === "password" && !document.getElementById("pw").value) { e.preventDefault(); var p = document.getElementById("pw"); p.focus(); p.placeholder = "Enter your password, or use a link below"; }
  });</script>`, { err: error, ok: notice });

const checkEmailPage = ({ email, devLink }) => gate("Check your email", `
  <div class="gate-card">
    <h1>Check your email</h1>
    <p>If <strong>${esc(email)}</strong> can sign in, a link is on its way. It works once and expires in 15 minutes.</p>
    <p class="muted">Not seeing it? Check spam or promotions, or <a href="/">try again</a>.</p>
    ${devLink ? `<div class="devbox"><p>Testing mode: the link is shown here instead of being emailed.</p><a href="${esc(devLink)}">Open sign-in link</a></div>` : ""}
  </div>`);

// Enter a 6-digit code (texted, or from an admin)
const codePage = ({ email = "", sentTo = "", error = "", devCodeShown = "", admin = false } = {}) => gate("Enter your code", `
  <div class="gate-card">
    <h1>${admin ? "Sign in with a code" : "Enter the code we texted you"}</h1>
    ${sentTo ? `<p>We texted a 6-digit code to <strong>${esc(sentTo)}</strong>. It expires in 10 minutes.</p>` : admin ? `<p>Enter your email (or mobile number) and the code an admin gave you.</p>` : ""}
    ${devCode(devCodeShown)}
    <form method="post" action="/login/code" class="stack">
      ${admin || !email ? `<label for="who">Email or mobile number</label><input id="who" name="email" required value="${esc(email)}" autocomplete="username">` : `<input type="hidden" name="email" value="${esc(email)}">`}
      <label for="code">Code</label>
      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required placeholder="123456" class="code-box">
      <button class="btn" type="submit">Sign in</button>
    </form>
    <p class="muted"><a href="/">Back to sign in</a></p>
  </div>`, { err: error });

const forgotPage = ({ error = "", email = "" } = {}) => gate("Forgot password", `
  <div class="gate-card">
    <h1>Forgot your password?</h1>
    <p>Enter your email or mobile number and choose how to reset it.</p>
    <form method="post" action="/forgot" class="stack">
      <label for="who">Email or mobile number</label>
      <input id="who" name="email" required value="${esc(email)}" autocomplete="username">
      <button class="btn" type="submit" name="method" value="link">Email me a reset link</button>
      ${smsOn() ? `<button class="btn btn-alt" type="submit" name="method" value="text">Text me a reset code</button>` : ""}
    </form>
    <p class="muted"><a href="/">Back to sign in</a></p>
  </div>`, { err: error });

const pwFields = () => `<label for="pw1">New password</label><input id="pw1" name="password" type="password" autocomplete="new-password" minlength="8" required>
  <span class="fine">At least 8 characters.</span>
  <label for="pw2">Type it again</label><input id="pw2" name="password2" type="password" autocomplete="new-password" minlength="8" required>`;

const resetPage = ({ token = "", email = "", byCode = false, sentTo = "", error = "", devCodeShown = "" } = {}) => gate("Set a new password", `
  <div class="gate-card">
    <h1>Set a new password</h1>
    ${byCode && sentTo ? `<p>We texted a 6-digit code to <strong>${esc(sentTo)}</strong>.</p>` : ""}
    ${devCode(devCodeShown)}
    <form method="post" action="${byCode ? "/reset/code" : "/reset"}" class="stack">
      ${byCode ? `<input type="hidden" name="email" value="${esc(email)}"><label for="code">Code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required class="code-box">` : `<input type="hidden" name="token" value="${esc(token)}">`}
      ${pwFields()}
      <button class="btn" type="submit">Save password and sign in</button>
    </form>
  </div>`, { err: error });

const sentResetPage = ({ email, devLink }) => gate("Check your email", `
  <div class="gate-card"><h1>Check your email</h1>
    <p>If <strong>${esc(email)}</strong> has an account, a link to reset the password is on its way. It works once and expires in 60 minutes.</p>
    ${devLink ? `<div class="devbox"><p>Testing mode: the link is shown here instead of being emailed.</p><a href="${esc(devLink)}">Open reset link</a></div>` : ""}
    <p class="muted"><a href="/">Back to sign in</a></p></div>`);

const confirmPage = ({ token, email }) => gate("Confirm sign in", `
  <div class="gate-card">
    <h1>Finish signing in</h1>
    <p>Signing in as <strong>${esc(email)}</strong>.</p>
    <form method="post" action="/auth/verify">
      <input type="hidden" name="token" value="${esc(token)}">
      <button class="btn" type="submit">Sign in</button>
    </form>
  </div>`);

const invalidLinkPage = (what = "Sign-in links") => gate("Link expired", `
  <div class="gate-card">
    <h1>Link expired</h1>
    <p>${esc(what)} work once and expire. Request a new one to continue.</p>
    <a class="btn" href="/">Back to sign in</a>
  </div>`);

const noAccountPage = ({ email }) => gate("No account yet", `
  <div class="gate-card">
    <h1>We don't have an account for that email</h1>
    <p><strong>${esc(email)}</strong> isn't set up in Claim It yet.</p>
    <p class="muted">If your family is with the club, try the email you gave the club. Otherwise, ask for an account and an admin will set you up.</p>
    <a class="btn" href="/request-account?email=${encodeURIComponent(email)}">Request an account</a>
    <p class="muted"><a href="/">Try a different email</a></p>
  </div>`);

const requestAccountPage = ({ email = "", first_name = "", last_name = "", phone = "", organization = "", connection = "", error = "" } = {}) => gate("Request an account", `
  <div class="gate-card">
    <h1>Request an account</h1>
    <p class="muted">An admin will review it. You'll get an email with a link to finish setting up.</p>
    <form method="post" action="/request-account" class="stack">
      <div class="gate-row"><span><label for="rf">First name</label><input id="rf" name="first_name" required maxlength="40" value="${esc(first_name)}" autocomplete="given-name"></span>
        <span><label for="rl">Last name</label><input id="rl" name="last_name" required maxlength="40" value="${esc(last_name)}" autocomplete="family-name"></span></div>
      <label for="re">Email</label><input id="re" name="email" type="email" required value="${esc(email)}" autocomplete="email">
      <label for="rp">Mobile number <span class="opt">(optional)</span></label><input id="rp" name="phone" inputmode="tel" value="${esc(phone)}" autocomplete="tel">
      <label for="ro">Organization <span class="opt">(optional)</span></label><input id="ro" name="organization" maxlength="80" value="${esc(organization)}" placeholder="e.g. Altoona Booster Club">
      <label for="rc">How are you connected to the Raptors?</label><textarea id="rc" name="connection" rows="3" required maxlength="600" placeholder="e.g. My niece plays 12U and I'd like to volunteer at the Rumble.">${esc(connection)}</textarea>
      <button class="btn" type="submit">Send request</button>
    </form>
    <p class="muted"><a href="/">Back to sign in</a></p>
  </div>`, { err: error });

const requestSentPage = ({ email }) => gate("Request sent", `
  <div class="gate-card"><h1>Thanks! Your request was sent.</h1>
    <p>An admin will review it. When it's approved, we'll email <strong>${esc(email)}</strong> a link to finish setting up your account.</p>
    <p class="muted"><a href="/">Back to sign in</a></p></div>`);

const inviteConfirmPage = ({ token, email }) => gate("Welcome", `
  <div class="gate-card"><h1>Welcome to Claim It</h1>
    <p>You've been invited to join as <strong>${esc(email)}</strong>. Next you'll set your password.</p>
    <form method="post" action="/invite"><input type="hidden" name="token" value="${esc(token)}"><button class="btn" type="submit">Get started</button></form></div>`);

const welcomePage = ({ user, p = {}, required, hasPassword, err = "" }) => gate("Welcome", `
  <div class="gate-card welcome">
    <h1>Welcome! Let's set up your account.</h1>
    <p class="muted">Signed in as <strong>${esc(user.email)}</strong>.</p>
    <form method="post" action="/welcome" class="stack">
      <div class="gate-row"><span><label for="wf">First name</label><input id="wf" name="first_name" required maxlength="40" value="${esc(p.first_name || "")}" autocomplete="given-name"></span>
        <span><label for="wl">Last name</label><input id="wl" name="last_name" required maxlength="40" value="${esc(p.last_name || "")}" autocomplete="family-name"></span></div>
      ${hasPassword && !required ? "" : `<label for="pw1">Password${required ? "" : ` <span class="opt">(optional)</span>`}</label>
        <input id="pw1" name="password" type="password" autocomplete="new-password" minlength="8"${required && !hasPassword ? " required" : ""}>
        <span class="fine">At least 8 characters. ${required ? "" : "You can always sign in with an emailed link instead."}</span>
        <label for="pw2">Type it again</label><input id="pw2" name="password2" type="password" autocomplete="new-password" minlength="8"${required && !hasPassword ? " required" : ""}>`}
      <label for="wp">Mobile number <span class="opt">(optional)</span></label><input id="wp" name="phone" inputmode="tel" value="${esc(p.phone || "")}" placeholder="715-555-0123">
      <button class="btn" type="submit">Save and continue</button>
    </form>
    ${required ? "" : `<form method="post" action="/welcome"><input type="hidden" name="skip" value="1"><button class="link-btn skip" type="submit">Skip for now</button></form>`}
    <form method="post" action="/logout"><button class="link-btn skip" type="submit">Sign out</button></form>
  </div>`, { err });

module.exports = { noAccountPage, requestAccountPage, requestSentPage, inviteConfirmPage, welcomePage, loginPage, checkEmailPage, codePage, forgotPage, resetPage, sentResetPage, confirmPage, invalidLinkPage };
