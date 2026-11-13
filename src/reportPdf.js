// Reports → PDF (server-side, pdfmake). One builder for every report: the same columns and rows as the page and CSV.
const pdfMake = require("pdfmake/build/pdfmake");
const fonts = require("pdfmake/build/vfs_fonts");
pdfMake.vfs = fonts.pdfMake ? fonts.pdfMake.vfs : fonts.vfs || fonts;
const { fmtDateTime } = require("./time");
const NAVY = "#0B1930", LIME = "#8DDC32", GRAY = "#5B6B82";

function text(v, kind) {
  if (v == null || v === "") return "—";
  if (kind === "pct") return `${v}%`;
  if (kind === "dt") return fmtDateTime(v);
  if (kind === "date") return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  return String(v);
}
// lime at a strength between 0 and 1, blended on white (pdfmake has no transparency)
function lime(t) { const mix = (a, b) => Math.round(255 + (b - 255) * t).toString(16).padStart(2, "0"); return `#${mix(0, 0x8d)}${mix(0, 0xdc)}${mix(0, 0x32)}`; }
function table(d) {
  const wide = d.cols.length > 6;
  const body = [d.cols.map((c) => ({ text: c[1], bold: true, color: "#fff", fillColor: NAVY, alignment: c[2] === "num" || c[2] === "pct" ? "right" : "left" })),
    ...d.rows.map((r) => d.cols.map((c) => ({ text: text(r[c[0]], c[2]), alignment: c[2] === "num" || c[2] === "pct" ? "right" : "left",
      color: /^(Repeat|Repeat no-shows|Behind|Never signed in|No account|Never|No-show)$/.test(String(r[c[0]])) ? "#b91c1c" : undefined })))];
  return { wide, block: d.rows.length ? { table: { headerRows: 1, widths: d.cols.map((c) => (c[2] === "num" || c[2] === "pct" || c[2] === "dt" || c[2] === "date" ? "auto" : "*")), body },
    layout: { fillColor: (i) => (i > 0 && i % 2 === 0 ? "#F6F8FB" : null), hLineColor: "#E3E8F0", vLineColor: "#E3E8F0", hLineWidth: () => 0.5, vLineWidth: () => 0.5 }, fontSize: wide ? 7.5 : 8.5 }
    : { text: "Nothing to show for these filters.", color: GRAY, italics: true } };
}
function grid(d) {
  const days = d.cols.slice(1).map((c) => c[0]);
  return { table: { headerRows: 1, widths: ["auto", ...days.map(() => "*")], body: [[{ text: "Starts", bold: true }, ...days.map((x) => ({ text: x, bold: true, alignment: "center" }))],
    ...d.rows.map((r) => [{ text: r.hour, bold: true }, ...days.map((x) => r[x] == null ? { text: "" } : { text: `${r[x]}%\n${r[x + "_n"]} session${r[x + "_n"] === 1 ? "" : "s"}`, alignment: "center", fillColor: lime(0.15 + Math.min(100, r[x]) / 100 * 0.85), fontSize: 8 })])] },
    layout: { hLineColor: "#fff", vLineColor: "#fff", hLineWidth: () => 2, vLineWidth: () => 2 } };
}
function overview(d) {
  const cells = d.tiles.map(([, label, v, unit, sub]) => ({ stack: [{ text: label.toUpperCase(), fontSize: 8, bold: true, color: GRAY }, { text: v == null ? "—" : `${v}${unit}`, fontSize: 22, bold: true, color: NAVY }, { text: sub, fontSize: 8, color: GRAY }], margin: [6, 6, 6, 6] }));
  const rows = []; for (let i = 0; i < cells.length; i += 4) rows.push([0, 1, 2, 3].map((k) => cells[i + k] || { text: "" }));
  return { table: { widths: ["*", "*", "*", "*"], body: rows }, layout: { hLineColor: "#E3E8F0", vLineColor: "#E3E8F0" } };
}
function week(d, { waitlist = true, blanks = 3 } = {}) {
  const tm = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  const box = { width: 14, table: { widths: [6], heights: [6], body: [[{ text: "", fontSize: 4 }]] }, layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => NAVY, vLineColor: () => NAVY, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }, margin: [0, 1, 0, 0] };
  const days = new Map(); for (const s of d.sessions) { const k = new Date(s.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
  const out = [];
  for (const [k, list] of days) {
    out.push({ text: new Date(k + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), fontSize: 13, bold: true, color: NAVY, margin: [0, 10, 0, 4] });
    for (const s of list) {
      const conf = s.people.filter((p) => p.status === "confirmed"), wl = s.people.filter((p) => p.status === "waitlisted");
      const lines = [...conf.map((p) => ({ columns: [box, { text: [{ text: `${p.first_name} ${p.last_name || ""}`.trim() }, p.team ? { text: `  ${p.team}`, color: GRAY, fontSize: 8 } : "", p.note && s.showNotes ? { text: `  “${p.note}”`, italics: true, color: GRAY, fontSize: 8 } : ""] }], margin: [0, 2, 0, 2] })),
        ...Array.from({ length: blanks }, () => ({ columns: [box, { canvas: [{ type: "line", x1: 0, y1: 9, x2: 200, y2: 9, lineWidth: 0.5, lineColor: "#c9d1de" }] }], margin: [0, 3, 0, 3] }))];
      out.push({ unbreakable: true, stack: [s.qLabel ? "" : "", { columns: [{ text: `${tm(s.starts_at)}${s.ends_at ? `–${tm(s.ends_at)}` : ""} · ${s.session}`, bold: true }, { text: `${s.board}${s.location ? ` · ${s.location}` : ""}${s.board_type === "rsvp" ? "" : ` · ${s.claimed}/${s.capacity}`}`, alignment: "right", color: GRAY, fontSize: 8 }] },
        s.qLabel ? { text: [{ text: "Question: ", color: GRAY }, { text: s.qLabel, bold: true }], fontSize: 8, margin: [0, 2, 0, 0] } : "",
        { columns: [{ stack: lines.filter((_, i) => i % 2 === 0) }, { stack: lines.filter((_, i) => i % 2 === 1) }], columnGap: 16, margin: [0, 4, 0, 0] },
        waitlist && wl.length ? { text: `Waitlist: ${wl.map((p) => `${p.first_name} ${p.last_name || ""}`.trim()).join(", ")}`, fontSize: 8, color: GRAY, margin: [0, 3, 0, 0] } : ""], margin: [0, 0, 0, 8] });
    }
  }
  return out.length ? out : [{ text: "No sessions that week for these filters.", color: GRAY, italics: true }];
}
// → a Buffer
function build({ title, subtitle, filters, data, kind, opts = {} }) {
  const body = kind === "overview" ? overview(data) : kind === "week" ? week(data, opts) : data.grid ? grid(data) : table(data).block;
  const wide = kind !== "week" && kind !== "overview" && data.cols && (data.grid || data.cols.length > 6);
  const doc = {
    pageSize: "LETTER", pageOrientation: wide ? "landscape" : "portrait", pageMargins: [32, 40, 32, 40], defaultStyle: { fontSize: 9, color: "#1e293b" },
    footer: (page, pages) => ({ columns: [{ text: `Raptors Claim It · ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })}`, color: GRAY, fontSize: 7 },
      { text: `Page ${page} of ${pages}`, alignment: "right", color: GRAY, fontSize: 7 }], margin: [32, 10, 32, 0] }),
    content: [{ text: title, fontSize: 16, bold: true, color: NAVY }, subtitle ? { text: subtitle, color: GRAY, margin: [0, 2, 0, 0] } : "",
      filters ? { text: filters, color: GRAY, fontSize: 8, margin: [0, 4, 0, 10] } : { text: "", margin: [0, 0, 0, 8] },
      data.note && kind !== "week" ? { text: data.note, color: GRAY, fontSize: 8, italics: true, margin: [0, 0, 0, 8] } : "", body] };
  return new Promise((resolve) => pdfMake.createPdf(doc).getBuffer((b) => resolve(Buffer.from(b))));
}
module.exports = { build };
