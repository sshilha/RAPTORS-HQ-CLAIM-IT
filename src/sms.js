// Text messages through Twilio (no extra packages). Turned on by setting in Railway:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (your Twilio number, e.g. +17155550100)
// Without them, texting is hidden. In testing (DEV_SHOW_LINK=true) codes are shown on screen instead of sent.
const live = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
const dev = () => !live() && process.env.DEV_SHOW_LINK === "true";
const enabled = () => live() || dev();

async function send(to, body) {
  if (!live()) { console.log(`[text] to=${to} | ${body}`); return { dev: true }; }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body }),
  });
  if (!res.ok) throw new Error(`Text failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return { dev: false };
}
module.exports = { enabled, live, dev, send };
