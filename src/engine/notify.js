// Emails for claims on the container engine
const { query } = require("../db");
const { sendEmail, shell } = require("../email");
const { slotName, fmtDateTime } = require("../time");
const { esc } = require("../views/layout");

async function details(claimId) {
  return (await query(`SELECT c.*, i.title, i.starts_at, i.ends_at, i.location, sc.name AS board_name, sc.contact_name, sc.contact_info, sc.event_location,
      a.first_name, a.last_name, a.self_user_id, a.email AS athlete_email, a.family_emails, sc.share_code,
      ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS parent_emails,
      (SELECT email FROM users WHERE id=a.self_user_id) AS self_email
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id WHERE c.id=$1`, [claimId])).rows[0];
}
const to = (d, user) => { const fam = d.family_emails === false ? [] : d.parent_emails || [];   // family_emails off: only the athlete (and whoever acted)
  const list = [...new Set([user && user.email, d.self_email, ...fam].filter(Boolean))];
  return list.length ? list : d.athlete_email ? [d.athlete_email] : []; };   // claimed through the public link: their own email
const lines = (d) => [slotName(d), d.board_name, d.location || d.event_location ? `Location: ${d.location || d.event_location}` : "",
  d.contact_name || d.contact_info ? `Questions? ${[d.contact_name, d.contact_info].filter(Boolean).join(", ")}` : ""].filter(Boolean);

// the variables a claim email gets
function claimVars(d) {
  return { person_first: d.first_name, person_name: [d.first_name, d.last_name].filter(Boolean).join(" "), board_name: d.board_name, session: slotName(d),
    location: d.location || d.event_location || "", organizers: [d.contact_name, d.contact_info].filter(Boolean).join(", "), my_claims_link: `${process.env.APP_URL || ""}/dashboard` };
}
const T = (key, to, vars) => require("../emailTemplates").send(key, to, vars);
async function claimed(c, user, cancelUrl = null) {
  const d = await details(c.id); if (!d) return;
  const waiting = c.status === "waitlisted";
  const key = cancelUrl ? (waiting ? "claim_public_waitlisted" : "claim_public") : (waiting ? "claim_waitlisted" : "claim_confirmed");
  await T(key, to(d, user), { ...claimVars(d), cancel_link: cancelUrl || "" });
}
async function canceled(r, user, { tellCanceled = true } = {}) {
  const d = await details(r.canceled.id); if (!d) return;
  if (tellCanceled) await T("claim_canceled", to(d, user), claimVars(d));
  for (const p of r.promoted || []) {
    const q = await details(p.id); if (!q) continue;
    await T("waitlist_moved_up", to(q, null), claimVars(q));
  }
}
module.exports = { claimed, canceled };
