const { LABELS } = require("./config");

async function sendEmail({ to, subject, html, text, replyTo = null, fromName = null, reallySend = false }) {
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) return;
  if (!reallySend && await require("./shadow").hold({ to: recipients, subject, html, text })) return;   // shadow mode: held, never sent
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] to=${recipients.join(",")} | ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: (() => { const f = process.env.EMAIL_FROM || `${LABELS.app_name} <onboarding@resend.dev>`; if (!fromName) return f;
        const addr = (/<([^>]+)>/.exec(f) || [null, f])[1].trim(); return `${String(fromName).replace(/[<>"]/g, "")} <${addr}>`; })(),
      to: recipients, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shell = (heading, bodyHtml, button) => `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f2236">
  <p style="margin:0 0 12px"><img src="${esc(require("./config").APP_URL || "")}/claim-it-logo-email.png" width="240" height="120" alt="${esc(LABELS.app_name)}" style="display:block;border:0"></p>
  <h2 style="margin:0 0 16px;color:#0f2236">${heading}</h2>
  ${bodyHtml}
  ${button ? `<p style="margin-top:24px"><a href="${button.href}" style="display:inline-block;background:#8cc63f;color:#0f2236;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:8px">${button.label}</a></p>` : ""}
</div>`;

module.exports = { sendEmail, shell };
