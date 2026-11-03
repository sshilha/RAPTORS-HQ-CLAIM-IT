// "Add to calendar" for a claim: a signed .ics link (works with Apple, Outlook, and others) and a Google Calendar link.
const crypto = require("crypto");
const { query } = require("./db");
let secret = null;
async function key() {
  if (secret) return secret;
  await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  let r = (await query(`SELECT value FROM app_kv WHERE key='cal_secret'`)).rows[0];
  if (!r) { await query(`INSERT INTO app_kv (key, value) VALUES ('cal_secret', $1) ON CONFLICT DO NOTHING`, [JSON.stringify(crypto.randomBytes(24).toString("hex"))]); r = (await query(`SELECT value FROM app_kv WHERE key='cal_secret'`)).rows[0]; }
  return (secret = r.value);
}
const sign = async (id) => crypto.createHmac("sha256", await key()).update(`claim:${id}`).digest("base64url").slice(0, 22);
const base = () => (process.env.APP_URL || "").replace(/\/$/, "");
async function links(claimId, d) {
  if (!d.starts_at) return { calendar_link: "", google_calendar_link: "" };
  const ics = `${base()}/cal/${claimId}-${await sign(claimId)}.ics`;
  const z = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = d.ends_at || new Date(new Date(d.starts_at).getTime() + 3600e3);
  const g = new URLSearchParams({ action: "TEMPLATE", text: `${d.first_name ? `${d.first_name}: ` : ""}${d.title || d.level || "Session"} (${d.board_name})`,
    dates: `${z(d.starts_at)}/${z(end)}`, details: `${d.board_name}${d.contact_name || d.contact_info ? `\nQuestions? ${[d.contact_name, d.contact_info].filter(Boolean).join(", ")}` : ""}`, location: d.location || d.event_location || "" });
  return { calendar_link: ics, google_calendar_link: `https://calendar.google.com/calendar/render?${g}` };
}
async function verify(token) {
  const m = /^(\d+)-([A-Za-z0-9_-]{22})$/.exec(String(token || "")); if (!m) return null;
  return (await sign(m[1])) === m[2] ? Number(m[1]) : null;
}
// the .ics file for one claim
async function ics(claimId) {
  const d = (await query(`SELECT c.id, c.status, a.first_name, i.title, i.starts_at, i.ends_at, i.location, n.name AS level, sc.name AS board_name, sc.event_location, sc.contact_name, sc.contact_info
    FROM board_claims c JOIN athletes a ON a.id=c.athlete_id JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id LEFT JOIN board_nodes n ON n.id=i.node_id WHERE c.id=$1`, [claimId])).rows[0];
  if (!d || !d.starts_at) return null;
  const z = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const e = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const end = d.ends_at || new Date(new Date(d.starts_at).getTime() + 3600e3);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Claim It//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:claim-${d.id}@claim-it`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(d.starts_at)}`, `DTEND:${z(end)}`,
    `SUMMARY:${e(`${d.first_name ? `${d.first_name}: ` : ""}${d.title || d.level || "Session"} (${d.board_name})`)}`,
    `LOCATION:${e(d.location || d.event_location || "")}`, `DESCRIPTION:${e(`${d.board_name}${d.contact_name || d.contact_info ? `\nQuestions? ${[d.contact_name, d.contact_info].filter(Boolean).join(", ")}` : ""}`)}`,
    ...(d.status === "canceled" ? ["STATUS:CANCELLED"] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
module.exports = { links, verify, ics };
