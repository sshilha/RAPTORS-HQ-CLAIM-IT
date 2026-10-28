// Emails for claims on the container engine
const { query } = require("../db");
const { sendEmail, shell } = require("../email");
const { slotName, fmtDateTime } = require("../time");
const { esc } = require("../views/layout");

async function details(claimId) {
  return (await query(`SELECT c.*, i.title, i.starts_at, i.ends_at, i.location, sc.name AS board_name, sc.contact_name, sc.contact_info, sc.event_location,
      a.first_name, a.last_name, a.self_user_id,
      ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS parent_emails,
      (SELECT email FROM users WHERE id=a.self_user_id) AS self_email
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id WHERE c.id=$1`, [claimId])).rows[0];
}
const to = (d, user) => [...new Set([user && user.email, d.self_email, ...(d.parent_emails || [])].filter(Boolean))];
const lines = (d) => [slotName(d), d.board_name, d.location || d.event_location ? `Location: ${d.location || d.event_location}` : "",
  d.contact_name || d.contact_info ? `Questions? ${[d.contact_name, d.contact_info].filter(Boolean).join(", ")}` : ""].filter(Boolean);

async function claimed(c, user) {
  const d = await details(c.id); if (!d) return;
  const waiting = c.status === "waitlisted";
  const subject = `${waiting ? "Waitlisted" : "Claimed"}: ${d.first_name}, ${d.board_name}: ${slotName(d)}`;
  const L = lines(d);
  await sendEmail({ to: to(d, user), subject, text: `${waiting ? `${d.first_name} is on the waitlist.` : `Spot claimed for ${d.first_name}.`}\n\n${L.join("\n")}\n\nSee or cancel it in Claim It under My Claims.`,
    html: shell(waiting ? `${esc(d.first_name)} is on the waitlist` : `Spot claimed for ${esc(d.first_name)}!`, `<p>${L.map(esc).join("<br>")}</p>`, { href: `${process.env.APP_URL || ""}/dashboard`, label: "My Claims" }) });
}
async function canceled(r, user) {
  const d = await details(r.canceled.id); if (!d) return;
  await sendEmail({ to: to(d, user), subject: `Canceled: ${d.first_name}, ${d.board_name}: ${slotName(d)}`, text: `${d.first_name}'s spot was canceled.\n\n${lines(d).join("\n")}`,
    html: shell(`${esc(d.first_name)}'s spot was canceled`, `<p>${lines(d).map(esc).join("<br>")}</p>`) });
  for (const p of r.promoted || []) {
    const q = await details(p.id); if (!q) continue;
    await sendEmail({ to: to(q, null), subject: `You're in: ${q.first_name}, ${q.board_name}: ${slotName(q)}`, text: `A spot opened and ${q.first_name} moved off the waitlist.\n\n${lines(q).join("\n")}`,
      html: shell(`${esc(q.first_name)} moved off the waitlist`, `<p>${lines(q).map(esc).join("<br>")}</p>`, { href: `${process.env.APP_URL || ""}/dashboard`, label: "My Claims" }) });
  }
}
module.exports = { claimed, canceled };
