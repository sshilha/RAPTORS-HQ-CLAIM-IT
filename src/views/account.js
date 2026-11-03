const { esc, layout } = require("./layout");
const A = require("../accounts");
const { fmtDateTime } = require("../time");

const ROLE = { parent: "Parent/guardian", coach: "Coach", volunteer: "Volunteer / outside participant" };
const SUM = {};   // current values for the Profile rows (set when the page is built)
const card = (id, title, sub, body, lock = false) => SUM[id] != null ? `<section class="d-card a-card a-rowcard" id="${id}"><div class="a-h"><h2>${title}</h2></div>
    <div class="a-sum"><span class="a-sum-v">${SUM[id]}</span><button type="button" class="sb-btn a-chg" onclick="var c=this.closest('.a-rowcard'); c.classList.add('editing'); var f=c.querySelector('.a-edit input:not([type=hidden])'); if (f) f.focus();">Change</button></div>
    <div class="a-edit">${sub ? `<p class="fine a-edit-sub">${sub}</p>` : ""}${body}<button type="button" class="link-dark a-cancel" onclick="var c=this.closest('.a-rowcard'); c.classList.remove('editing'); c.querySelectorAll('form').forEach(function(f){f.reset();});">Cancel</button></div></section>`
  : `<section class="d-card a-card" id="${id}"><div class="a-h"><h2>${title}</h2>${lock ? `<span class="a-lock" title="Only admins can change this">🔒 View only</span>` : ""}</div>${sub ? `<p class="a-sub">${sub}</p>` : ""}${body}</section>`;
const status = { waiting: ["Waiting", "wl"], approved: ["Approved", "ok"], declined: ["Declined", "no"], done: ["Done", "ok"] };

function accountPage({ user, flash, u, person, kids, coaching, scope, reportBoards, requests, admin, sms, pendingPhone, devCode, myFamily = [], canShare = false, tab = "", sub = "" }) {
  const p = person || {};
  const roles = (p.roles || []).map((r) => ROLE[r] || r);
  const nmTxt = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  SUM.profile = nmTxt ? `<b>${esc(nmTxt)}</b>${p.organization ? ` · ${esc(p.organization)}` : ""}` : `<span class="muted">No name yet</span>`;
  SUM.phone = u.phone && u.phone_verified_at ? `${esc(A.prettyPhone(u.phone))} <span class="d-pill ok">Confirmed</span>` : p.phone ? esc(p.phone) : `<span class="muted">None</span>`;
  SUM.email = `<b>${esc(u.email)}</b>`;
  SUM.password = u.password_hash ? `Set ${u.password_set_at ? esc(fmtDateTime(u.password_set_at)) : ""}. <span class="muted">You can also always sign in with an emailed link.</span>` : `<span class="muted">No password yet: you sign in with emailed links.</span>`;
  return layout({ title: "My Account", user, flash, admin, tab: "account", dash: true,
    body: `<div class="d-wrap a-wrap">
    ${(() => {
      const isAth = p && p.kind === "athlete";
      const TABS = [["account", "Account"], ["family", "Family"]];
      const SUBS = { account: [["profile", "Profile"], ["access", "Access"]],
        family: [["members", "Family members"], ...(isAth ? [["sharing", "Sharing"]] : []), ["list", `My requests${requests.length ? ` <i class="sub-n">${requests.length}</i>` : ""}`]] };
      // old links (?tab=profile, signin, access, requests) land on the matching sub-tab
      const OLD = { profile: ["account", "profile"], signin: ["account", "profile"], access: ["account", "access"], requests: ["family", sub || "add"] };
      if (OLD[tab]) { sub = OLD[tab][1]; tab = OLD[tab][0]; }
      if (sub === "email" || sub === "password") sub = "profile";
      if (sub === "add" || sub === "chg") sub = "members";   // those live on Family members now
      const t = TABS.some((x) => x[0] === tab) ? tab : "account", subs = SUBS[t] || [], st = subs.some((x) => x[0] === sub) ? sub : subs[0][0];
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      return `<section class="bh2 a-hd"><div class="bh2-l"><span class="bh2-tile dash-tile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5"/></svg></span>
        <div><div class="bh2-t"><h1>My Account</h1></div><span class="bh2-meta">${esc([name, u.email].filter(Boolean).join(" · "))}</span></div></div></section>
      <nav class="bh2-tabs dash-tabs a-tabs-main">${TABS.map(([k, l]) => `<a href="/account?tab=${k}"${k === t ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      ${subs.length > 1 ? `<nav class="sub-tabs a-subs">${subs.map(([k, l]) => `<a href="/account?tab=${t}&sub=${k}"${k === st ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>` : ""}
      <div class="sub-body a-sheet${subs.length > 1 ? "" : " no-subs"}" data-tab="${t}" data-sub="${st}">`; })()}
    <div class="a-cols"><div class="a-col">
      ${card("profile", "Name", "", `
        <form method="post" action="/account/profile" class="a-form">
          <div class="a-row"><label>First name<input name="first_name" required maxlength="40" value="${esc(p.first_name || "")}"></label>
            <label>Last name<input name="last_name" required maxlength="40" value="${esc(p.last_name || "")}"></label></div>
          <label><span>Organization <span class="opt">(optional)</span></span><input name="organization" maxlength="80" value="${esc(p.organization || "")}" placeholder="e.g. Altoona Booster Club"></label>
          <div class="a-act"><button class="b-claim" type="submit">Save profile</button></div>
        </form>`)}
      ${card("email", "Sign-in email", "We'll email a confirmation link to the new address. The change happens when you click it.", `
        <p class="a-cur">${esc(u.email)}</p>
        <form method="post" action="/account/email" class="a-form a-inline"><label>New email<input type="email" name="email" required placeholder="new@example.com"></label>
          <button class="b-cancelf-btn" type="submit">Send confirmation link</button></form>
        <p class="fine">We'll email a link to the new address. The change happens when you click it, and your claims and family stay with you.</p>`)}
      ${card("password", "Password", u.password_hash ? "" : "Optional. Set one to sign in without waiting for an email.", `
        <form method="post" action="/account/password" class="a-form">
          ${u.password_hash ? `<label>Current password<input type="password" name="current" required autocomplete="current-password"></label>` : ""}
          <div class="a-row"><label>${u.password_hash ? "New password" : "Password"}<input type="password" name="password" required minlength="${A.MIN_PASSWORD}" autocomplete="new-password"></label>
            <label>Type it again<input type="password" name="password2" required minlength="${A.MIN_PASSWORD}" autocomplete="new-password"></label></div>
          <span class="fine">At least ${A.MIN_PASSWORD} characters.</span>
          <div class="a-act"><button class="b-claim" type="submit">${u.password_hash ? "Change password" : "Set password"}</button></div>
        </form>
        ${u.password_hash ? `<form method="post" action="/account/password/remove" onsubmit="return confirm('Remove your password? You will sign in with an emailed link instead.')"><button class="link-dark danger-link" type="submit">Remove my password</button></form>` : ""}`)}
      ${card("phone", "Phone", "A number the club can reach you at.", `
        ${u.phone && u.phone_verified_at ? `<p class="a-cur">${esc(A.prettyPhone(u.phone))} <span class="d-pill ok">Confirmed</span></p>
          <form method="post" action="/account/phone/remove"><button class="link-dark danger-link" type="submit">Stop using this number for sign-in</button></form>`
          : p.phone ? `<p class="a-cur">${esc(p.phone)}</p>` : ""}
        ${pendingPhone ? `<form method="post" action="/account/phone/verify" class="a-form a-inline"><label>Code texted to ${esc(A.prettyPhone(pendingPhone))}<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required class="code-box" placeholder="123456"></label>
            <button class="b-claim" type="submit">Confirm</button></form>${devCode ? `<p class="devbox">Testing mode: the text says <b>${esc(devCode)}</b></p>` : ""}`
          : `<form method="post" action="/account/phone" class="a-form a-inline"><label>${u.phone_verified_at || p.phone ? "Change number" : "Mobile number"}<input name="phone" inputmode="tel" required placeholder="715-555-0123"></label>
            <button class="b-cancelf-btn" type="submit">${sms ? "Text me a code" : "Save"}</button></form>`}`)}
    </div><div class="a-col">
      ${card("family", "My family", "", `
        <div class="fam-top"><span class="fine">People linked to your account. Changes and additions go to an admin to approve; you'll get an email when it's done.</span>
          <button type="button" class="sb-btn primary" onclick="var a=document.getElementById('fam-add'); a.hidden=!a.hidden; if (!a.hidden) a.querySelector('input').focus()">+ Add a family member</button></div>
        <div id="fam-add" class="fam-add" hidden><h3 class="a-h3">Add a family member</h3>
                  <form method="post" action="/account/request" class="a-form"><input type="hidden" name="kind" value="add_family">
            <div class="a-row"><label>First name<input name="first_name" required maxlength="40"></label><label>Last name<input name="last_name" required maxlength="40"></label></div>
            <div class="a-row"><label><span>Birth year <span class="opt">(optional)</span></span><input name="birth_year" type="number" min="1940" max="2100" placeholder="e.g. 2014"></label>
              <label><span>Current team <span class="opt">(optional)</span></span><input name="team" maxlength="40" placeholder="e.g. 12U Shilha"></label></div>
            <label><span>Relationship <span class="opt">(optional)</span></span><input name="relationship" maxlength="40" placeholder="e.g. Daughter, Son, Spouse"></label>
            <label><span>Anything else? <span class="opt">(optional)</span></span><textarea name="note" rows="2" maxlength="600"></textarea></label>
            <div class="a-act"><button class="b-claim" type="submit">Send request</button></div></form>
          <button type="button" class="link-dark a-cancel" onclick="var a=document.getElementById('fam-add'); a.hidden=true; a.querySelector('form').reset();">Cancel</button></div>
        ${kids.length ? `<ul class="a-list fam-list">${kids.map((k, i) => `<li><div class="fam-row"><div class="fam-who"><b>${esc(k.first_name)} ${esc(k.last_name)}</b>
            <span>${[k.team].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</span>
            ${k.boards.length ? `<span class="fine">On: ${esc(k.boards.join(", "))}</span>` : ""}
            ${k.other_parents.length ? `<span class="fine">Also linked: ${esc(k.other_parents.join(", "))}</span>` : ""}</div>
            <button type="button" class="sb-btn fam-chg" onclick="var f=document.getElementById('fam-chg-${i}'); f.hidden=!f.hidden; if (!f.hidden) f.querySelector('textarea').focus()">Change</button></div>
            <form method="post" action="/account/request" class="a-form fam-chgform" id="fam-chg-${i}" hidden><input type="hidden" name="kind" value="change"><input type="hidden" name="about" value="${esc(`${k.first_name} ${k.last_name}`.trim())}">
              <label>What should change for ${esc(k.first_name)}?<textarea name="message" rows="2" required maxlength="1000" placeholder="e.g. ${esc(k.first_name)} moved to the 14U team."></textarea></label>
              <div class="a-act"><button type="button" class="link-dark" onclick="this.closest('form').hidden=true; this.closest('form').reset();">Cancel</button><button class="b-claim" type="submit">Send request</button></div></form></li>`).join("")}</ul>`
          : `<p class="muted">No one is linked to your account yet.</p>`}`, true)}
      ${p.kind === "athlete" ? card("sharing", "My family &amp; sharing", canShare ? "You're 18 or older, so you decide what your family sees." : "Only an admin can change these until you're 18.", `
        ${myFamily.length ? `<p class="a-cur">Linked family: ${esc(myFamily.join(", "))}</p>` : `<p class="muted">No family is linked to you.</p>`}
        <form method="post" action="/account/sharing" class="a-form">
          <label class="radio-row"><input type="checkbox" name="family_access" value="1"${p.family_access !== false ? " checked" : ""}${canShare ? "" : " disabled"}> <span><b>Family can see and manage my claims</b></span></label>
          <label class="radio-row"><input type="checkbox" name="family_emails" value="1"${p.family_emails !== false ? " checked" : ""}${canShare ? "" : " disabled"}> <span><b>Family gets the emails about my claims</b></span></label>
          ${canShare ? `<div class="a-act"><button class="b-claim" type="submit">Save</button></div>` : ""}
        </form>`, !canShare) : ""}
      ${card("access", "My access", "What you can do in the app. Only admins can change this.", `
        <dl class="b-facts a-facts">
          <div><dt>Account</dt><dd>${admin ? "Administrator" : "Member"}</dd></div>
          <div><dt>Roles</dt><dd>${roles.length ? esc(roles.join(", ")) : "—"}</dd></div>
          <div><dt>Coach on</dt><dd>${coaching.length ? esc(coaching.join(", ")) : "—"}</dd></div>
          <div><dt>Reports</dt><dd>${scope ? (scope.all ? "All boards" : `${esc(reportBoards.join(", "))}${scope.teams.length ? ` (${esc(scope.teams.join(", "))} only)` : ""}`) : "—"}</dd></div>
        </dl>${admin ? `<p class="fine">As an admin, you manage everyone's access under <a href="/admin/people">App settings → People</a>.</p>` : ""}`, true)}
      ${card("requests", "Requests", "Adding a family member or changing their details goes to an admin to approve. You'll get an email when it's done.", `
        <div class="a-tabs"><button type="button" class="on" data-t="add">Add a family member</button><button type="button" data-t="chg">Change a family member's details</button></div>

        <form method="post" action="/account/request" class="a-form" data-p="chg"><input type="hidden" name="kind" value="change">
          <label>Who is it about?<select name="about"><option value="">${esc([p.first_name, p.last_name].filter(Boolean).join(" ") || u.email)}</option>${kids.map((k) => `<option>${esc(k.first_name)} ${esc(k.last_name)}</option>`).join("")}</select></label>
          <label>What should change?<textarea name="message" rows="3" required maxlength="1000" placeholder="e.g. Ava moved to the 14U team."></textarea></label>
          <div class="a-act"><button class="b-claim" type="submit">Send request</button></div></form>
        <div data-p="list">${requests.length ? `<ul class="a-reqs">${requests.map((r) => `<li><span class="d-pill ${status[r.status][1]}">${status[r.status][0]}</span>
            <span>${r.kind === "add_family" ? `Add <b>${esc(r.data.first_name)} ${esc(r.data.last_name)}</b>` : `Change ${esc(r.data.about || "my info")}: ${esc((r.data.message || "").slice(0, 80))}`}</span>
            <span class="fine">${esc(fmtDateTime(r.created_at))}${r.admin_note ? ` · “${esc(r.admin_note)}”` : ""}</span></li>`).join("")}</ul>` : `<p class="muted">No requests yet.</p>`}</div>`)}
    </div></div></div></div>
    <script>document.querySelectorAll(".a-tabs button").forEach(function (b) { b.addEventListener("click", function () {
      document.querySelectorAll(".a-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll("#requests form[data-p]").forEach(function (f) { f.hidden = f.dataset.p !== b.dataset.t; }); }); });</script>` });
}
module.exports = { accountPage };
