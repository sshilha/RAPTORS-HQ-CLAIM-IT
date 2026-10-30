const { esc, layout } = require("./layout");
const A = require("../accounts");
const { fmtDateTime } = require("../time");

const ROLE = { parent: "Parent", coach: "Coach", volunteer: "Volunteer / outside participant" };
const card = (id, title, sub, body, lock = false) => `<section class="d-card a-card" id="${id}"><div class="a-h"><h2>${title}</h2>${lock ? `<span class="a-lock" title="Only admins can change this">🔒 View only</span>` : ""}</div>${sub ? `<p class="a-sub">${sub}</p>` : ""}${body}</section>`;
const status = { waiting: ["Waiting", "wl"], approved: ["Approved", "ok"], declined: ["Declined", "no"], done: ["Done", "ok"] };

function accountPage({ user, flash, u, person, kids, coaching, scope, reportBoards, requests, admin, sms, pendingPhone, devCode }) {
  const p = person || {};
  const roles = (p.roles || []).map((r) => ROLE[r] || r);
  return layout({ title: "My Account", user, flash, admin, tab: "account", dash: true,
    body: `<div class="d-wrap a-wrap">
    <div class="a-top"><h1>My Account</h1><span class="a-who">${esc(u.email)}</span></div>
    <div class="a-cols"><div class="a-col">
      ${card("profile", "My profile", "Your own details. Changes save right away.", `
        <form method="post" action="/account/profile" class="a-form">
          <div class="a-row"><label>First name<input name="first_name" required maxlength="40" value="${esc(p.first_name || "")}"></label>
            <label>Last name<input name="last_name" required maxlength="40" value="${esc(p.last_name || "")}"></label></div>
          <label><span>Organization <span class="opt">(optional)</span></span><input name="organization" maxlength="80" value="${esc(p.organization || "")}" placeholder="e.g. Altoona Booster Club"></label>
          <div class="a-act"><button class="b-claim" type="submit">Save profile</button></div>
        </form>`)}
      ${card("email", "Sign-in email", "The email you sign in with and where we send confirmations.", `
        <p class="a-cur">${esc(u.email)}</p>
        <form method="post" action="/account/email" class="a-form a-inline"><label>New email<input type="email" name="email" required placeholder="new@example.com"></label>
          <button class="b-cancelf-btn" type="submit">Send confirmation link</button></form>
        <p class="fine">We'll email a link to the new address. The change happens when you click it, and your claims and family stay with you.</p>`)}
      ${card("password", "Password", u.password_hash ? `Set ${u.password_set_at ? esc(fmtDateTime(u.password_set_at)) : ""}. You can also always sign in with an emailed link.` : "Optional. Set one to sign in without waiting for an email.", `
        <form method="post" action="/account/password" class="a-form">
          ${u.password_hash ? `<label>Current password<input type="password" name="current" required autocomplete="current-password"></label>` : ""}
          <div class="a-row"><label>${u.password_hash ? "New password" : "Password"}<input type="password" name="password" required minlength="${A.MIN_PASSWORD}" autocomplete="new-password"></label>
            <label>Type it again<input type="password" name="password2" required minlength="${A.MIN_PASSWORD}" autocomplete="new-password"></label></div>
          <span class="fine">At least ${A.MIN_PASSWORD} characters.</span>
          <div class="a-act"><button class="b-claim" type="submit">${u.password_hash ? "Change password" : "Set password"}</button></div>
        </form>
        ${u.password_hash ? `<form method="post" action="/account/password/remove" onsubmit="return confirm('Remove your password? You will sign in with an emailed link instead.')"><button class="link-dark danger-link" type="submit">Remove my password</button></form>` : ""}`)}
      ${card("phone", sms ? "Mobile number for sign-in codes" : "Phone", sms ? "Get a 6-digit code by text to sign in or reset your password. Standard text rates may apply." : "A number the club can reach you at.", `
        ${u.phone && u.phone_verified_at ? `<p class="a-cur">${esc(A.prettyPhone(u.phone))} <span class="d-pill ok">Confirmed</span></p>
          <form method="post" action="/account/phone/remove"><button class="link-dark danger-link" type="submit">Stop using this number for sign-in</button></form>`
          : p.phone ? `<p class="a-cur">${esc(p.phone)}</p>` : ""}
        ${pendingPhone ? `<form method="post" action="/account/phone/verify" class="a-form a-inline"><label>Code texted to ${esc(A.prettyPhone(pendingPhone))}<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required class="code-box" placeholder="123456"></label>
            <button class="b-claim" type="submit">Confirm</button></form>${devCode ? `<p class="devbox">Testing mode: the text says <b>${esc(devCode)}</b></p>` : ""}`
          : `<form method="post" action="/account/phone" class="a-form a-inline"><label>${u.phone_verified_at || p.phone ? "Change number" : "Mobile number"}<input name="phone" inputmode="tel" required placeholder="715-555-0123"></label>
            <button class="b-cancelf-btn" type="submit">${sms ? "Text me a code" : "Save"}</button></form>`}`)}
    </div><div class="a-col">
      ${card("family", "My family", "People linked to your account. To add someone or fix their details, send a request below.", `
        ${kids.length ? `<ul class="a-list">${kids.map((k) => `<li><b>${esc(k.first_name)} ${esc(k.last_name)}</b>
            <span>${[k.team, k.se_group].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</span>
            ${k.boards.length ? `<span class="fine">On: ${esc(k.boards.join(", "))}</span>` : ""}
            ${k.other_parents.length ? `<span class="fine">Also linked: ${esc(k.other_parents.join(", "))}</span>` : ""}</li>`).join("")}</ul>`
          : `<p class="muted">No one is linked to your account yet.</p>`}`, true)}
      ${card("access", "My access", "What you can do in the app. Only admins can change this.", `
        <dl class="b-facts a-facts">
          <div><dt>Account</dt><dd>${admin ? "Administrator" : "Member"}</dd></div>
          <div><dt>Roles</dt><dd>${roles.length ? esc(roles.join(", ")) : "—"}</dd></div>
          <div><dt>Coach on</dt><dd>${coaching.length ? esc(coaching.join(", ")) : "—"}</dd></div>
          <div><dt>Reports</dt><dd>${scope ? (scope.all ? "All boards" : `${esc(reportBoards.join(", "))}${scope.teams.length ? ` (${esc(scope.teams.join(", "))} only)` : ""}`) : "—"}</dd></div>
        </dl>${admin ? `<p class="fine">As an admin, you manage everyone's access under <a href="/admin/people">App settings → People</a>.</p>` : ""}`, true)}
      ${card("requests", "Requests", "Adding a family member or changing their details goes to an admin to approve. You'll get an email when it's done.", `
        <div class="a-tabs"><button type="button" class="on" data-t="add">Add a family member</button><button type="button" data-t="chg">Change a family member's details</button></div>
        <form method="post" action="/account/request" class="a-form" data-p="add"><input type="hidden" name="kind" value="add_family">
          <div class="a-row"><label>First name<input name="first_name" required maxlength="40"></label><label>Last name<input name="last_name" required maxlength="40"></label></div>
          <div class="a-row"><label><span>Birth year <span class="opt">(optional)</span></span><input name="birth_year" type="number" min="1940" max="2100" placeholder="e.g. 2014"></label>
            <label><span>Current team <span class="opt">(optional)</span></span><input name="team" maxlength="40" placeholder="e.g. 12U Shilha"></label></div>
          <label><span>Relationship <span class="opt">(optional)</span></span><input name="relationship" maxlength="40" placeholder="e.g. Daughter, Son, Spouse"></label>
          <label><span>Anything else? <span class="opt">(optional)</span></span><textarea name="note" rows="2" maxlength="600"></textarea></label>
          <div class="a-act"><button class="b-claim" type="submit">Send request</button></div></form>
        <form method="post" action="/account/request" class="a-form" data-p="chg" hidden><input type="hidden" name="kind" value="change">
          <label>Who is it about?<select name="about"><option value="">Me</option>${kids.map((k) => `<option>${esc(k.first_name)} ${esc(k.last_name)}</option>`).join("")}</select></label>
          <label>What should change?<textarea name="message" rows="3" required maxlength="1000" placeholder="e.g. Ava moved to the 14U team."></textarea></label>
          <div class="a-act"><button class="b-claim" type="submit">Send request</button></div></form>
        ${requests.length ? `<h3 class="a-h3">My requests</h3><ul class="a-reqs">${requests.map((r) => `<li><span class="d-pill ${status[r.status][1]}">${status[r.status][0]}</span>
            <span>${r.kind === "add_family" ? `Add <b>${esc(r.data.first_name)} ${esc(r.data.last_name)}</b>` : `Change ${esc(r.data.about || "my info")}: ${esc((r.data.message || "").slice(0, 80))}`}</span>
            <span class="fine">${esc(fmtDateTime(r.created_at))}${r.admin_note ? ` · “${esc(r.admin_note)}”` : ""}</span></li>`).join("")}</ul>` : ""}`)}
    </div></div></div>
    <script>document.querySelectorAll(".a-tabs button").forEach(function (b) { b.addEventListener("click", function () {
      document.querySelectorAll(".a-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll("#requests form[data-p]").forEach(function (f) { f.hidden = f.dataset.p !== b.dataset.t; }); }); });</script>` });
}
module.exports = { accountPage };
