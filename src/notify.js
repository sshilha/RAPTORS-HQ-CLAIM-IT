const { query } = require("./db");
const { sendEmail, shell } = require("./email");
const { fmtRange, fmtDateTime, itemLabel } = require("./time");
const { APP_URL } = require("./config");
const { cancelDeadline } = require("./booking");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadReservation(id) {
  const { rows } = await query(
    `SELECT r.*, a.first_name, a.last_name, s.starts_at, s.ends_at, s.location, s.coach, s.notes, s.title,
            p.name AS program_name, p.cancel_hours,
            ARRAY(SELECT u.email FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS emails
     FROM reservations r JOIN athletes a ON a.id=r.athlete_id
     JOIN training_sessions s ON s.id=r.session_id JOIN programs p ON p.id=s.program_id
     WHERE r.id=$1`,
    [id]
  );
  return rows[0];
}

function details(r) {
  const lines = [
    `${r.program_name}`,
    itemLabel(r),
    r.location && `Location: ${r.location}`,
    r.coach && `Coach: ${r.coach}`,
    r.notes,
  ].filter(Boolean);
  return { html: `<p style="line-height:1.6">${lines.map(esc).join("<br>")}</p>`, text: lines.join("\n") };
}

const button = { href: `${APP_URL}/dashboard`, label: "View my claims" };

const templates = {
  confirmed: (r) => ({
    subject: `Claimed: ${r.first_name}, ${r.program_name}: ${itemLabel(r)}`,
    heading: `Spot claimed for ${r.first_name}!`,
    extra: r.starts_at ? `You can cancel online until ${fmtDateTime(cancelDeadline(r.starts_at, r.cancel_hours))}. Giving it up lets someone else claim it.`
      : "Can't make it? Give it up online so someone else can claim it.",
  }),
  waitlisted: (r) => ({
    subject: `Waitlisted: ${r.first_name}, ${r.program_name}: ${itemLabel(r)}`,
    heading: `${r.first_name} is on the waitlist`,
    extra: `If a spot opens, ${r.first_name} moves in automatically and you'll get an email.`,
  }),
  promoted: (r) => ({
    subject: `Spot opened: claimed for ${r.first_name}, ${r.program_name}`,
    heading: `A spot opened and it's claimed for ${r.first_name}`,
    extra: `${r.first_name} moved off the waitlist. If you can't make it, give the spot up online so someone else can claim it.`,
  }),
  canceled: (r) => ({
    subject: `Spot given up: ${r.first_name}, ${r.program_name}: ${itemLabel(r)}`,
    heading: `${r.first_name}'s spot was given up`,
    extra: `The spot is open for someone else to claim.`,
  }),
  sessionCanceled: (r) => ({
    subject: `Canceled: ${r.program_name}: ${itemLabel(r)}`,
    heading: `This time was canceled`,
    extra: `${r.first_name}'s spot was removed, and it doesn't count against any limits.`,
  }),
};

// Fire-and-forget: email problems never block a booking
function notify(kind, reservationId) {
  (async () => {
    const r = await loadReservation(reservationId);
    if (!r) return;
    const t = templates[kind](r);
    const d = details(r);
    await sendEmail({
      to: r.emails,
      subject: t.subject,
      html: shell(esc(t.heading), d.html + `<p style="color:#5b6b7a">${esc(t.extra)}</p>`, button),
      text: `${t.heading}\n\n${d.text}\n\n${t.extra}\n\n${button.href}`,
    });
  })().catch((e) => console.error(`notify(${kind}) failed:`, e.message));
}

module.exports = { notify };
