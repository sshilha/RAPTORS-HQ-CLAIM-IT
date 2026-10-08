async function sendEmail({ to, subject, html, text }) {
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] to=${recipients.join(",")} | ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Raptors Training <onboarding@resend.dev>",
      to: recipients, subject, html, text,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

const shell = (heading, bodyHtml, button) => `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f2236">
  <p style="margin:0 0 4px;color:#5b6b7a;font-size:14px">Chippewa Valley Raptors Training</p>
  <h2 style="margin:0 0 16px;color:#0f2236">${heading}</h2>
  ${bodyHtml}
  ${button ? `<p style="margin-top:24px"><a href="${button.href}" style="display:inline-block;background:#8cc63f;color:#0f2236;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:8px">${button.label}</a></p>` : ""}
</div>`;

module.exports = { sendEmail, shell };
