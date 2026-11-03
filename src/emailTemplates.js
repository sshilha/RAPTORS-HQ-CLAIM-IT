// Every email the app sends, editable in App Settings → People → Communication.
// A template: subject + body (plain text: blank line = new paragraph, **bold**, [text](link)) + an optional button,
// with {{variables}}. A line whose variables are all empty is left out (so "Location: {{location}}" disappears when
// there's no location). Branding (logos, colors, sender, footer, custom variables) wraps every email.
const { query } = require("./db");

// ---------- variables every email can use ----------
const GLOBAL_VARS = [["org_name", "Your club's name"], ["app_name", "The app's name"], ["app_link", "Link to the app"]];
// ---------- the emails ----------
const V = (k, d) => [k, d];
const CLAIM_VARS = [V("person_first", "First name of the person the spot is for"), V("person_name", "Their full name"), V("board_name", "The board"),
  V("session", "The session: name, date and time"), V("location", "Where it is"), V("organizers", "Organizer name(s) and contact"), V("my_claims_link", "Link to My Claims"),
  V("calendar_link", "Add to calendar (Apple, Outlook, others)"), V("google_calendar_link", "Add to Google Calendar"), V("manage_link", "Where they view or cancel it (My Claims, or their cancel link)")];
const CAL = "[Add to calendar]({{calendar_link}}) · [Google Calendar]({{google_calendar_link}})";
const TEMPLATES = [
  // Sign-in & accounts
  { key: "signin_link", group: "Sign-in & accounts", name: "Sign-in link", when: "Someone asks for a sign-in link", to: "The person signing in",
    subject: "Your {{app_name}} sign-in link", heading: "Sign in to {{app_name}}",
    body: "This link works once and expires in {{minutes}} minutes. If you didn't request it, ignore this email.",
    button: { label: "Sign in", link: "sign_in_link" }, vars: [V("sign_in_link", "The sign-in link"), V("minutes", "Minutes until it expires")] },
  { key: "password_reset", group: "Sign-in & accounts", name: "Password reset", when: "Someone clicks Forgot password", to: "The person",
    subject: "Reset your {{app_name}} password", heading: "Reset your password",
    body: "This link works once and expires in 60 minutes. If you didn't ask for it, ignore this email.",
    button: { label: "Set a new password", link: "reset_link" }, vars: [V("reset_link", "The reset link")] },
  { key: "invite", group: "Sign-in & accounts", name: "Invitation", when: "An admin sends an invite (from People, or after an import)", to: "The person invited",
    subject: "You're invited to {{app_name}}", heading: "Welcome to {{app_name}}",
    body: "{{org_name}} uses {{app_name}} for training sign-ups and volunteer shifts. Click below to set your password and get started. This link works for 7 days.",
    button: { label: "Set up my account", link: "invite_link" }, vars: [V("first_name", "Their first name, when known"), V("invite_link", "The invitation link")] },
  { key: "email_confirm", group: "Sign-in & accounts", name: "Confirm a new email", when: "Someone changes their sign-in email in My Account", to: "The new email address",
    subject: "Confirm your new {{app_name}} email", heading: "Confirm your new email",
    body: "Click to make **{{new_email}}** the email you sign in with. This link expires in 60 minutes.",
    button: { label: "Confirm email", link: "confirm_link" }, vars: [V("new_email", "The new email"), V("confirm_link", "The confirmation link")] },
  { key: "email_changed", group: "Sign-in & accounts", name: "Email was changed", when: "A sign-in email change is confirmed", to: "The old email address",
    subject: "Your {{app_name}} email was changed", heading: "Your email was changed",
    body: "Your sign-in email is now **{{new_email}}**. If this wasn't you, contact the club right away.", vars: [V("new_email", "The new email")] },
  { key: "admin_added", group: "Sign-in & accounts", name: "Made an administrator", when: "Someone is added as an administrator", to: "The new administrator",
    subject: "You're an administrator for {{app_name}}", heading: "You're an administrator",
    body: "{{added_by}} added you as an administrator for {{app_name}}. Sign in with this email to manage Claim Boards, people, and reports.",
    button: { label: "Sign in", link: "app_link" }, vars: [V("added_by", "Who added them")] },
  // Claims
  { key: "claim_confirmed", group: "Claims", name: "Spot claimed", when: "Someone claims a spot (signed in)", to: "The person, and their parents/guardians if family sharing is on",
    subject: "Claimed: {{person_first}}, {{board_name}}: {{session}}", heading: "Spot claimed for {{person_first}}!",
    body: "{{session}}\n{{board_name}}\nLocation: {{location}}\nQuestions? {{organizers}}\n\n" + CAL, button: { label: "My Claims", link: "my_claims_link" }, vars: CLAIM_VARS },
  { key: "claim_waitlisted", group: "Claims", name: "Put on the waitlist", when: "Someone joins a waitlist (signed in)", to: "The person, and their parents/guardians if family sharing is on",
    subject: "Waitlisted: {{person_first}}, {{board_name}}: {{session}}", heading: "{{person_first}} is on the waitlist",
    body: "{{session}}\n{{board_name}}\nLocation: {{location}}\nQuestions? {{organizers}}\n\nWe'll email you if a spot opens up.", button: { label: "My Claims", link: "my_claims_link" }, vars: CLAIM_VARS },
  { key: "claim_public", group: "Claims", name: "Spot claimed (public link)", when: "A visitor claims through a public link, with no account", to: "The visitor's email",
    subject: "Claimed: {{person_first}}, {{board_name}}: {{session}}", heading: "Spot claimed for {{person_first}}!",
    body: "{{session}}\n{{board_name}}\nLocation: {{location}}\nQuestions? {{organizers}}\n\n" + CAL + "\n\nCan't make it? Use the button below to cancel, so someone else can claim it.",
    button: { label: "Cancel my spot", link: "cancel_link" }, vars: [...CLAIM_VARS, V("cancel_link", "Their private cancel link")] },
  { key: "claim_public_waitlisted", group: "Claims", name: "Waitlisted (public link)", when: "A visitor joins a waitlist through a public link", to: "The visitor's email",
    subject: "Waitlisted: {{person_first}}, {{board_name}}: {{session}}", heading: "{{person_first}} is on the waitlist",
    body: "{{session}}\n{{board_name}}\nLocation: {{location}}\nQuestions? {{organizers}}\n\nWe'll email you if a spot opens up.",
    button: { label: "Leave the waitlist", link: "cancel_link" }, vars: [...CLAIM_VARS, V("cancel_link", "Their private cancel link")] },
  { key: "claim_canceled", group: "Claims", name: "Spot canceled", when: "A claim is canceled (by them or an admin)", to: "The person, and their parents/guardians if family sharing is on",
    subject: "Canceled: {{person_first}}, {{board_name}}: {{session}}", heading: "{{person_first}}'s spot was canceled",
    body: "{{session}}\n{{board_name}}\nLocation: {{location}}\nQuestions? {{organizers}}", vars: CLAIM_VARS },
  { key: "waitlist_moved_up", group: "Claims", name: "Moved off the waitlist", when: "A spot opens and someone moves up from the waitlist", to: "The person, and their parents/guardians if family sharing is on",
    subject: "You're in: {{person_first}}, {{board_name}}: {{session}}", heading: "{{person_first}} moved off the waitlist",
    body: "A spot opened up.\n\n{{session}}\n{{board_name}}\nLocation: {{location}}\nQuestions? {{organizers}}\n\n" + CAL, button: { label: "My Claims", link: "my_claims_link" }, vars: CLAIM_VARS },
  { key: "claim_reminder", group: "Claims", name: "Reminder before a session", when: "Before each claimed session (the board's Notifications tab sets when; 1 day before unless changed)", to: "The person, and their parents/guardians if family sharing is on",
    subject: "Reminder: {{person_first}}, {{session}}", heading: "See you soon, {{person_first}}!",
    body: "{{session}}\n{{board_name}}\nLocation: {{location}}\nQuestions? {{organizers}}\n\n" + CAL + "\n\nCan't make it? Cancel so someone else can have the spot.",
    button: { label: "View or cancel my spot", link: "manage_link" }, vars: CLAIM_VARS },
  // Requests (answers to the person who asked)
  { key: "family_approved", group: "Requests", name: "Family member added", when: "An admin approves adding a family member", to: "The person who asked",
    subject: "Your request was approved", heading: "Your request was approved",
    body: "{{family_member}} is now linked to your account.", button: { label: "My Account", link: "account_link" }, vars: [V("family_member", "Who was added"), V("account_link", "Link to My Account")] },
  { key: "change_done", group: "Requests", name: "Change made", when: "An admin marks a change request done", to: "The person who asked",
    subject: "Your change request is done", heading: "Your change request is done",
    body: "We made the change you asked for. {{about}}\nNote: {{note}}", button: { label: "My Account", link: "account_link" }, vars: [V("about", "What it was about"), V("note", "The admin's note"), V("account_link", "Link to My Account")] },
  { key: "request_declined", group: "Requests", name: "Request not approved", when: "An admin declines a family or change request", to: "The person who asked",
    subject: "Your request wasn't approved", heading: "Your request wasn't approved",
    body: "Your request {{what}} wasn't approved.\nNote: {{note}}", button: { label: "My Account", link: "account_link" }, vars: [V("what", "What they asked for"), V("note", "The admin's note"), V("account_link", "Link to My Account")] },
  { key: "account_declined", group: "Requests", name: "Account request declined", when: "An admin declines a new-account request", to: "The person who asked",
    subject: "About your account request", heading: "About your account request",
    body: "Thanks for your interest. We weren't able to set up an account for you right now.\nNote: {{note}}", vars: [V("note", "The admin's note")] },
  // Notices to admins
  { key: "admin_account_request", group: "Notices to admins", name: "New account request", when: "Someone without an account asks for one", to: "Your request email (Requests page)",
    subject: "Account request: {{requester_name}}", heading: "New account request",
    body: "**{{requester_name}}** ({{requester_email}}) asked for an account.\n\n{{connection}}", button: { label: "Review requests", link: "review_link" },
    vars: [V("requester_name", "Their name"), V("requester_email", "Their email"), V("connection", "What they said about their connection"), V("review_link", "Link to Requests")] },
  { key: "admin_family_request", group: "Notices to admins", name: "New family or change request", when: "Someone sends a request from My Account", to: "Your request email (Requests page)",
    subject: "Request from {{requester_email}}: {{what}}", heading: "New request",
    body: "**{{requester_email}}** asked to {{what}}.", button: { label: "Review requests", link: "review_link" },
    vars: [V("requester_email", "Who asked"), V("what", "What they asked for"), V("review_link", "Link to Requests")] },
];
const byKey = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));

// ---------- storage ----------
let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS email_templates (key TEXT PRIMARY KEY, subject TEXT, heading TEXT, body TEXT, button_label TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT)`);
  await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  ready = true;
}
const BRAND_DEFAULTS = { header_color: "#0B1930", button_color: "#8DDC32", button_text: "#0B1930", sender_name: "", reply_to: "", footer: "{{org_name}}", logo_app: true, vars: [] };
async function brand() { await ensure(); const r = (await query(`SELECT value FROM app_kv WHERE key='email_brand'`)).rows[0]; return { ...BRAND_DEFAULTS, ...(r ? r.value : {}) }; }
async function saveBrand(b) { await ensure(); await query(`INSERT INTO app_kv (key, value) VALUES ('email_brand', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(b)]); }
async function custom() { await ensure(); return Object.fromEntries((await query(`SELECT * FROM email_templates`)).rows.map((r) => [r.key, r])); }
async function get(key) {
  const t = byKey[key]; if (!t) return null;
  const c = (await custom())[key];
  return { ...t, custom: !!c, subject: c && c.subject != null ? c.subject : t.subject, heading: c && c.heading != null ? c.heading : t.heading, body: c && c.body != null ? c.body : t.body,
    buttonLabel: t.button ? (c && c.button_label != null ? c.button_label : t.button.label) : null, updated_at: c && c.updated_at, updated_by: c && c.updated_by };
}
async function save(key, { subject, heading, body, buttonLabel }, by) {
  await ensure();
  await query(`INSERT INTO email_templates (key, subject, heading, body, button_label, updated_by) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (key) DO UPDATE SET subject=EXCLUDED.subject, heading=EXCLUDED.heading, body=EXCLUDED.body, button_label=EXCLUDED.button_label, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [key, subject, heading, body, buttonLabel, by]);
}
async function reset(key) { await ensure(); await query(`DELETE FROM email_templates WHERE key=$1`, [key]); }

// ---------- rendering ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const VAR = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
// fill one line; null if every variable in it is empty (so the line is dropped)
function fillLine(line, vars, html) {
  const used = [...line.matchAll(VAR)].map((m) => m[1].toLowerCase());
  if (used.length && used.every((k) => !String(vars[k] ?? "").trim())) return null;
  const out = line.replace(VAR, (m, k) => { const v = vars[k.toLowerCase()]; return v == null ? "" : html ? esc(v) : String(v); });
  return out;
}
function fill(text, vars, html) { return String(text || "").split("\n").map((l) => fillLine(l, vars, html)).filter((l) => l != null).join("\n"); }
// plain-text body → html paragraphs (**bold**, [text](link), bare links)
function toHtml(filled) {
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#1a6fe0">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" style="color:#1a6fe0">$2</a>');
  return filled.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p style="margin:0 0 14px;line-height:1.5">${p.split("\n").map(inline).join("<br>")}</p>`).join("");
}
const toText = (filled) => filled.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
// the variables an email gets: globals + branding's custom variables + its own
function allVars(own = {}, b = BRAND_DEFAULTS) {
  const { LABELS, APP_URL } = require("./config");
  const v = { org_name: LABELS.org_name || "Chippewa Valley Raptors", app_name: LABELS.app_name || "Claim It", app_link: `${APP_URL || ""}/` };
  for (const x of b.vars || []) if (x && x.name) v[String(x.name).toLowerCase()] = x.value || "";
  for (const [k, val] of Object.entries(own)) v[k.toLowerCase()] = val == null ? "" : String(val);
  return v;
}
async function logoUrls(b) {
  const { APP_URL } = require("./config"), u = await require("./appimages").urls();
  const abs = (p) => (p ? (/^https?:/.test(p) ? p : `${APP_URL || ""}${p}`) : null);
  return { club: abs(u.email_logo), app: b.logo_app !== false ? `${APP_URL || ""}/claim-it-logo-email.png` : null };
}
async function render(key, own = {}, override = null) {
  const t = override ? { ...(await get(key)), ...override } : await get(key);
  if (!t) throw new Error(`No email template "${key}"`);
  const b = await brand(), vars = allVars(own, b), L = await logoUrls(b);
  const subject = fill(t.subject, vars, false).replace(/\s+/g, " ").trim();
  const heading = fill(t.heading || "", vars, true);
  const bodyF = fill(t.body, vars, true), bodyT = fill(t.body, vars, false);
  const link = t.button ? vars[t.button.link] : null, label = t.buttonLabel != null ? fill(t.buttonLabel, vars, false) : null;
  const footer = fill(b.footer || "", vars, true);
  const logos = [L.club, L.app].filter(Boolean);
  const html = `<div style="background:#f3f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e8f0">
  <div style="background:${esc(b.header_color)};padding:16px 22px;border-bottom:4px solid ${esc(b.button_color)}">${logos.length ? logos.map((src) => `<img src="${esc(src)}" alt="" height="56" style="height:56px;max-width:220px;margin-right:14px;vertical-align:middle;border:0">`).join("") : `<span style="color:#fff;font-weight:bold;font-size:18px">${esc(vars.org_name)}</span>`}</div>
  <div style="padding:22px 22px 8px;color:#0f2236;font-size:15px">
    ${heading ? `<h2 style="margin:0 0 14px;color:#0f2236;font-size:21px">${heading}</h2>` : ""}
    ${toHtml(bodyF)}
    ${link && label ? `<p style="margin:20px 0 18px"><a href="${esc(link)}" style="display:inline-block;background:${esc(b.button_color)};color:${esc(b.button_text)};text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:9px">${esc(label)}</a></p>` : ""}
  </div>
  ${footer ? `<div style="padding:14px 22px;border-top:1px solid #eef1f5;color:#5b6b7a;font-size:12px;line-height:1.5">${toHtml(footer).replace(/margin:0 0 14px/g, "margin:0 0 4px")}</div>` : ""}
</div></div>`;
  const text = [toText(fill(t.heading || "", vars, false)), toText(bodyT), link && label ? `${label}: ${link}` : "", toText(fill(b.footer || "", vars, false))].filter(Boolean).join("\n\n");
  return { subject, html, text, replyTo: b.reply_to || null, fromName: b.sender_name || null };
}
// send one: the template, filled in, branded
async function send(key, to, own = {}) {
  const r = await render(key, own);
  return require("./email").sendEmail({ to, subject: r.subject, html: r.html, text: r.text, replyTo: r.replyTo, fromName: r.fromName });
}
// sample values for the preview and test emails
const SAMPLE = { person_first: "Ava", person_name: "Ava Smith", first_name: "Jane", board_name: "Winter Training 2027", session: "Hitting · Tue, Nov 10, 5:00 PM–6:00 PM",
  location: "Turn Two Athletics", organizers: "Scott (scott@example.com)", my_claims_link: "https://example.com/dashboard", manage_link: "https://example.com/dashboard",
  calendar_link: "https://example.com/cal/sample.ics", google_calendar_link: "https://calendar.google.com/calendar/render?action=TEMPLATE", cancel_link: "https://example.com/s/abc/cancel/xyz",
  sign_in_link: "https://example.com/auth/verify?token=sample", minutes: "15", reset_link: "https://example.com/reset?token=sample", invite_link: "https://example.com/invite?token=sample",
  new_email: "jane.new@example.com", confirm_link: "https://example.com/account/email/confirm?token=sample", added_by: "scott@example.com", family_member: "Max Smith",
  about: "Ava moved to 14U", note: "", what: "to add Max Smith", account_link: "https://example.com/account", requester_name: "Jane Smith", requester_email: "jane@example.com",
  connection: "My daughter plays on the 12U team.", review_link: "https://example.com/admin/requests" };
module.exports = { TEMPLATES, GLOBAL_VARS, byKey, get, save, reset, custom, brand, saveBrand, render, send, SAMPLE, BRAND_DEFAULTS };
