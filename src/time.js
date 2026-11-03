const { TZ } = require("./config");

const fmtDay = (d) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const fmtDateTime = (d) => (d ? `${fmtDay(d)} at ${fmtTime(d)}` : "");
const fmtRange = (a, b) => (a ? `${fmtDay(a)}, ${fmtTime(a)}–${fmtTime(b)}` : "Anytime");
// What a claimable item is called: its title and/or its date + time
const itemLabel = (s) => [s.title, s.starts_at ? fmtRange(s.starts_at, s.ends_at) : ""].filter(Boolean).join(", ") || "Anytime";

// Values for <input type="date|time|datetime-local"> in Central time
function inputParts(d) {
  if (!d) return { date: "", time: "", local: "" };
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(d)).map((x) => [x.type, x.value])
  );
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}`;
  return { date, time, local: `${date}T${time}` };
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => /^\d{2}:\d{2}$/.test(s);
const isLocal = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);

// SQL fragment that turns a Central-time "YYYY-MM-DD HH:MM" param into timestamptz
const localSql = (n) => `($${n}::timestamp AT TIME ZONE '${TZ}')`;

const localDate = (ts) => inputParts(ts).date;
// An item's display name: its own name, or its date and time when it has none
function slotName(it) {
  const when = it.starts_at ? fmtRange(it.starts_at, it.ends_at) : "";
  const t = String(it.title || "").trim();
  return t && when ? `${when} · ${t}` : t || when || "Untitled";
}
module.exports = { slotName, localDate, itemLabel, fmtDay, fmtTime, fmtDateTime, fmtRange, inputParts, isDate, isTime, isLocal, localSql };
