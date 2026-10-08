const { query } = require("./db");
const { sendEmail, shell } = require("./email");
const { fmtRange, fmtDateTime } = require("./time");
const { APP_URL } = require("./config");
const { cancelDeadline } = require("./booking");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadReservation(id) {
  const { rows } = await query(
    `SELECT r.*, a.first_name, a.last_name, s.starts_at, s.ends_at, s.location, s.coach, s.notes,
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
    fmtRange(r.starts_at, r.ends_at),
    r.location && `Location: ${r.location}`,
    r.coach && `Coach: ${r.coach}`,
    r.notes,
  ].filter(Boolean);
  return { html: `<p style="line-height:1.6">${lines.map(esc).join("<br>")}</p>`, text: lines.join("\n") };
}

const button = { href: `${APP_URL}/dashboard`, label: "View my training" };

const templates = {
  confirmed: (r) => ({
    subject: `Reserved: ${r.first_name}, ${r.program_name} ${fmtRange(r.starts_at, r.ends_at)}`,
    heading: `${r.first_name} is reserved`,
    extra: `You can cancel online until ${fmtDateTime(cancelDeadline(r.starts_at, r.cancel_hours))}. Canceling opens the spot for another athlete.`,
  }),
  waitlisted: (r) => ({
    subject: `Waitlisted: ${r.first_name}, ${r.program_name} ${fmtRange(r.starts_at, r.ends_at)}`,
    heading: `${r.first_name} is on the waitlist`,
    extra: `If a spot opens, ${r.first_name} moves in automatically and you'll get an email.`,
  }),
  promoted: (r) => ({
    subject: `Spot opened: ${r.first_name} is now reserved for ${r.program_name}`,
    heading: `A spot opened. ${r.first_name} is reserved`,
    extra: `${r.first_name} moved off the waitlist. If you can't make it, cancel online so the next athlete gets the spot.`,
  }),
  canceled: (r) => ({
    subject: `Canceled: ${r.first_name}, ${r.program_name} ${fmtRange(r.starts_at, r.ends_at)}`,
    heading: `${r.first_name}'s reservation is canceled`,
    extra: `The spot is now open for another athlete.`,
  }),
  sessionCanceled: (r) => ({
    subject: `Session canceled: ${r.program_name} ${fmtRange(r.starts_at, r.ends_at)}`,
    heading: `This training session was canceled`,
    extra: `${r.first_name}'s reservation was removed. It doesn't count against priority reservations.`,
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
