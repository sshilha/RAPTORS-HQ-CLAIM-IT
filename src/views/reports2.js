const { esc, layout } = require("./layout");
const { slotName, fmtDateTime } = require("../time");


// the report tabs (shared by every report, including By person / All claims)
const GROUPS = [["overview", "Overview", [["overview", ""]]], ["claims", "Claims", [["person", "By person"], ["all", "All claims"]]],
  ["attendance", "Attendance", [["attendance", "Athletes"], ["noshows", "No-shows"], ["unchecked", "Check-ins not done"]]],
  ["sessions", "Sessions", [["fill", "Fill"], ["busiest", "Busiest times"], ["waitlists", "Waitlists"], ["locations", "Locations"]]],
  ["rsvp", "RSVP", [["rsvp", "Events"], ["rsvpAthletes", "Athletes"]]], ["families", "Families", [["engagement", "Engagement"], ["notSignedUp", "Not signed up"], ["volunteer", "Volunteer hours"]]],
  ["assess", "Assessments", [["assessResults", "Results"], ["assessProgress", "Progress"], ["assessAthlete", ""], ["assessLeaders", "Leaderboard"], ["assessTeamBest", "Best by team"], ["assessTeamProgress", "Team progress"], ["assessRecords", "Records"], ["assessImprove", "Improvement"], ["assessAttend", "vs attendance"], ["assessTeams", "Team improvement"]]],
  ["emails", "Emails", [["emails", ""]]], ["week", "Week sheet", [["week", ""]]]];
function reportNav(key, url, full = true, admin = true) {
  const g = GROUPS.find((x) => x[2].some(([k]) => k === key)) || GROUPS[0];
  const RKEYS = ["cs", "at", "q", "when", "cap", "cov", "st", "prob", "ans", "as", "da", "db", "how", "dsel", "drill", "top", "bf", "bt", "wl", "blanks", "week"];
  const go = (k) => url({ r: k, v: "" }), goNew = (k) => url({ r: k, v: "", ...Object.fromEntries(RKEYS.map((x) => [x, ""])) });
  const groups = (full ? GROUPS : GROUPS.filter((x) => x[0] === "claims")).filter((x) => admin || x[0] !== "emails");
  return `<nav class="sub-tabs r-subs">${groups.map(([id, label, subs]) => `<a href="${go(subs[0][0])}"${id === g[0] ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    ${g[2].length > 1 ? `<nav class="r-chips" aria-label="${esc(g[1])} reports">${g[2].map(([k, l]) => `<a href="${go(k)}"${k === key ? ' class="on" aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</nav>` : ""}`;
}
const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/></svg>`;
const DL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="15" height="15"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`;
const TITLES = { answers: "Answers", assessTeam: "Assessment teams", sess: "Sessions", claims: "Claims", attend: "Attendance", limits: "Limits", assessProgress: "Assessment progress", assessTeamProgress: "Assessment team progress", assessAthlete: "Athlete progress", attSessions: "Attendance by session", upcoming: "Upcoming sessions", notSignedIn: "Not signed in", assessResults: "Assessment results", assessLeaders: "Assessment leaderboard", assessTeamBest: "Assessment best by team", assessRecords: "Assessment records", assessImprove: "Assessment improvement", assessAttend: "Improvement vs attendance", assessTeams: "Assessment team averages", person: "Claims by person", all: "All claims", overview: "Overview", attendance: "Attendance by athlete", noshows: "No-shows", unchecked: "Check-ins not done", fill: "Session fill", busiest: "Busiest times", waitlists: "Waitlists",
  locations: "Locations", rsvp: "RSVP", rsvpAthletes: "RSVP by athlete", engagement: "Families", notSignedUp: "On the list, not signed up", volunteer: "Volunteers", emails: "Email problems", week: "Weekly roster" };
function cell(v, kind) {
  if (kind === "act") return v ? `<td data-sort=""><a class="rf-btn na-act" href="${esc(v[1])}">${esc(v[0])}</a></td>` : `<td data-sort=""></td>`;
  if (v == null || v === "") return `<td class="r-muted${["num", "pct", "spct", "chg"].includes(kind) ? " r-num" : ""}" data-sort="">—</td>`;   // blanks line up with their column
  if (kind === "spct" || kind === "chg") { const n = Number(v); return `<td class="r-num" data-sort="${n}"><b class="chg ${n > 0 ? "up" : n < 0 ? "down" : ""}">${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}${kind === "spct" ? "%" : ""}</b></td>`; }
  if (kind === "pct") return `<td class="r-num" data-sort="${v}"><span class="r-pct"><b>${v}%</b><i style="width:${Math.min(100, v)}%"></i></span></td>`;
  if (kind === "num") return `<td class="r-num" data-sort="${v}">${esc(String(v))}</td>`;
  if (kind === "date" || kind === "dt") { const d = new Date(v); return `<td class="r-muted" data-sort="${d.toISOString()}">${esc(kind === "dt" ? fmtDateTime(d) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }))}</td>`; }
  return `<td>${/^(Repeat|Repeat no-shows|Behind|Never signed in|No account|Never|Full|Over capacity|Declined|Didn't come|Over limit)$/.test(String(v)) ? `<span class="r-flag bad">${esc(v)}</span>` : /^(Done|Active|Past|Complete|Healthy|Signed in|Later email delivered|Improved|Personal best|Came|Going)$/.test(String(v)) ? `<span class="r-flag ok">${esc(v)}</span>` : /^(Close|Signed in, no claims|Waitlisted|Released|Nearly full|Low|Open|More testing needed|Not started|At limit)$/.test(String(v)) || /Method changed|Open spots|^Pending/.test(String(v)) ? `<span class="r-flag mid">${esc(v)}</span>` : esc(String(v))}</td>`;
}
function table(d0, url = null) {
  const d = { ...d0, cols: d0.cols.filter((c) => c[2] !== "csv") };
  const L = (row) => { const h = d.link && d.link(row); if (h && url && h.startsWith("/reports?")) return url(Object.fromEntries(new URLSearchParams(h.split("?")[1]))); return h; };
  if (!d.rows.length) return `<div class="d-empty"><b>Nothing matches these filters.</b> Try widening the dates or removing a filter.</div>`;
  return `<div class="table-wrap"><table class="r-table"><thead><tr>${d.cols.map((c) => `<th${c[2] === "num" || c[2] === "pct" || c[2] === "spct" || c[2] === "chg" ? ' class="r-num"' : ""}>${esc(c[1])}</th>`).join("")}</tr></thead><tbody>
    ${d.rows.map((row) => `<tr>${d.cols.map((c, i) => i === 0 && L(row) ? cell(row[c[0]], c[2]).replace(/^<td([^>]*)>([\s\S]*)<\/td>$/, (m, at, inner) => `<td${at}><a href="${L(row)}"><b>${inner}</b></a></td>`) : cell(row[c[0]], c[2])).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function grid(d) {
  const DAYS = d.cols.slice(1).map((c) => c[0]);
  if (!d.rows.length) return `<div class="d-empty"><b>No sessions with spots in this range.</b></div>`;
  return `<div class="table-wrap"><table class="r-grid" data-nosort><thead><tr><th>Starts</th>${DAYS.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>
    ${d.rows.map((row) => `<tr><th>${esc(row.hour)}</th>${DAYS.map((x) => row[x] == null ? `<td class="r-g0"></td>` : `<td style="background:rgba(141,220,50,${(0.12 + Math.min(100, row[x]) / 100 * 0.88).toFixed(2)})"><b>${row[x]}%</b><small>${row[x + "_n"]}</small></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function weekSheet(d, o = {}) {
  const days = new Map(); for (const s of d.sessions) { const k = new Date(s.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
  const dl = (k) => new Date(k + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const tm = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  const range = `${new Date(d.start + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${new Date(d.end + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  const blanks = o.blanks ?? 3;
  return `<div class="ws"><h2 class="ws-title">Weekly roster · ${esc(range)}</h2>${days.size ? [...days.entries()].map(([k, list]) => `<section class="ws-day"><h2>${esc(dl(k))}</h2>
    ${list.map((s) => { const conf = s.people.filter((p) => p.status === "confirmed"), wl = s.people.filter((p) => p.status === "waitlisted");
      const cap = s.board_type === "rsvp" ? `${conf.length} going` : s.capacity ? `${s.taken} of ${s.capacity} claimed · ${Math.max(s.capacity - s.taken, 0)} open` : `${conf.length} claimed`;
      return `<div class="ws-s"><div class="ws-h"><b>${esc(tm(s.starts_at))}${s.ends_at ? `–${esc(tm(s.ends_at))}` : ""} · ${esc(s.session)}</b><span>${[s.location, s.board, cap].filter(Boolean).map(esc).join(" · ")}</span></div>
      ${s.qLabel ? `<p class="ws-q">Question: <b>${esc(s.qLabel)}</b></p>` : ""}
      <table class="ws-t" data-nocards data-nosort><thead><tr><th class="ws-c">Here</th><th>Athlete</th><th>Team</th><th>${s.showNotes ? "Answer / notes" : "Notes"}</th></tr></thead><tbody>
        ${conf.map((p) => `<tr><td class="ws-c"><span class="ws-box"></span></td><td><b>${esc(p.first_name)} ${esc(p.last_name || "")}</b></td><td>${esc(p.team || "")}</td><td class="ws-n">${p.note && s.showNotes ? `<i>“${esc(p.note)}”</i>` : ""}</td></tr>`).join("")}
        ${Array.from({ length: blanks }, () => `<tr class="ws-blank"><td class="ws-c"><span class="ws-box"></span></td><td></td><td></td><td class="ws-n"></td></tr>`).join("")}
      </tbody></table>
      ${o.wl !== false && wl.length ? `<p class="ws-wl"><b>Waitlist:</b> ${wl.map((p, i) => `${i + 1}. ${esc(p.first_name)} ${esc(p.last_name || "")}`).join(" · ")}</p>` : ""}</div>`; }).join("")}</section>`).join("")
    : `<div class="d-empty"><b>No sessions that week for these filters.</b></div>`}</div>`;
}

// ---------- small SVG charts (no library): labels, tooltips, and readable in print and PDF ----------
const CH = { navy: "#0B1930", lime: "#8DDC32", gray: "#D9E0EA", text: "#5B6B82" };
function barChart(data, { unit = "", two = false, line = false, max = null, h = 180 } = {}) {
  if (!data.length) return `<p class="ch-empty">Nothing in this range yet.</p>`;
  const W = 640, H = h, L = 34, B = 34, T = 10, cw = (W - L - 8) / data.length, top = max || Math.max(1, ...data.map((d) => (d.value || 0) + (two ? d.value2 || 0 : 0)));
  const y = (v) => T + (H - T - B) * (1 - v / top), tick = [0, 0.5, 1].map((f) => Math.round(top * f));
  const bars = data.map((d, i) => { const x = L + i * cw + cw * 0.18, w = cw * 0.64, v = d.value || 0, v2 = two ? d.value2 || 0 : 0, tip = `${d.label}: ${v}${unit}${two ? ` taken · ${v2} open` : ""}`;
    const lab = `<text x="${L + i * cw + cw / 2}" y="${H - B + 14}" text-anchor="middle" class="ch-x">${esc(String(d.label).length > (data.length <= 4 ? 26 : 12) ? String(d.label).slice(0, data.length <= 4 ? 25 : 11) + "…" : d.label)}</text>`;
    if (line) return lab;
    return `<g><title>${esc(tip)}</title><rect x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, y(0) - y(v))}" rx="3" fill="${CH.navy}"/><text x="${x + w / 2}" y="${y(v + (two ? v2 : 0)) - 4}" text-anchor="middle" class="ch-v">${v}${unit}</text>${two ? `<rect x="${x}" y="${y(v + v2)}" width="${w}" height="${Math.max(0, y(v) - y(v + v2))}" rx="3" fill="${CH.gray}"/>` : ""}${lab}</g>`; }).join("");
  const path = line ? `<polyline fill="none" stroke="${CH.lime}" stroke-width="3" points="${data.map((d, i) => `${L + i * cw + cw / 2},${y(d.value || 0)}`).join(" ")}"/>${data.map((d, i) => `<g><title>${esc(`${d.label}: ${d.value}${unit}`)}</title><circle cx="${L + i * cw + cw / 2}" cy="${y(d.value || 0)}" r="4.5" fill="${CH.navy}"/></g>`).join("")}` : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="chart">${tick.map((t) => `<line x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="#EEF1F5"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="ch-y">${t}${unit}</text>`).join("")}${bars}${path}</svg>`;
}
function hBars(data, { unit = "%", max = 100 } = {}) {
  if (!data.length) return `<p class="ch-empty">Nothing to compare yet.</p>`;
  return `<div class="hb">${data.map((d) => `<div class="hb-row" title="${esc(`${d.label}: ${d.value ?? "—"}${unit}`)}"><span class="hb-l">${esc(d.label)}</span><span class="hb-bar"><i style="width:${Math.min(100, ((d.value || 0) / max) * 100)}%"></i></span><b>${d.value ?? "—"}${unit}</b></div>`).join("")}</div>`;
}
const STATUS = (taken, cap) => { if (!cap) return ["No limit", ""]; const p = taken / cap; return p > 1 ? ["Over capacity", "over"] : p >= 1 ? ["Full", "full"] : p >= 0.9 ? ["Nearly full", "near"] : p >= 0.5 ? ["Healthy", "ok"] : ["Low", "low"]; };


const SV = (d, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC2 = {
  chart: SV('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', "ic"), filter: SV('<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>'), layers: SV('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
  stack: SV('<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/>'), users: SV('<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-1a6 6 0 0 1 12 0v1"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 4.8V21"/>'),
  pin: SV('<path d="M12 22s7-6.4 7-12a7 7 0 0 0-14 0c0 5.6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'), cal: SV('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>'),
  clip: SV('<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2.5h6v3H9zM9 11h6M9 15h4"/>'), user: SV('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>'),
  search: SV('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'), reset: SV('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'), mark: SV('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  check: SV('<path d="m5 12.5 4.5 4.5L19 7"/>'), down: SV('<path d="m6 9 6 6 6-6"/>'), home: SV('<path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/>'),
  list: SV('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'), hand: SV('<path d="M11 14h2a2 2 0 0 0 0-4h-3l-4 4 4 4h5l6-6-2-2-4 4"/><path d="m2 13 4 4"/>'),
  mail: SV('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 7 9-7"/>'), calcheck: SV('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M9 15.5l2 2 4-4"/>'),
  doc: SV('<path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z"/><path d="M14 2.5v6h6M8 13h8M8 17h6"/>'), fam: SV('<circle cx="7" cy="6" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="12" cy="12" r="2"/><path d="M3 21v-5a4 4 0 0 1 8 0M13 21v-5a4 4 0 0 1 8 0M9.5 21v-3a2.5 2.5 0 0 1 5 0v3"/>'),
  bars: SV('<path d="M4 20V12M9 20V6M14 20v-9M19 20V4"/>'),
};
// the report sections (tabs) and their reports (chips under the tabs)
const TABS = [["overview", "Overview", IC2.home, [["overview", ""]]],
  ["participation", "Participation", IC2.users, [["claims", "Claims"], ["personView", ""], ["attend", "Attendance"], ["teams", "Teams"], ["limits", "Limits"], ["answers", "Answers"], ["waitlists", "Waitlists"]]],
  ["sessions", "Sessions", IC2.cal, [["sess", "Sessions"], ["week", "Weekly Rosters"]]],
  ["families", "Families", IC2.fam, [["engagement", "Families"], ["volunteer", "Volunteers"], ["emails", "Communication issues"]]],
  ["assess", "Assessments", IC2.bars, [["assessResults", "Results"], ["assessProgress", "Progress"], ["assessAthlete", ""], ["assessLeaders", "Leaderboard"], ["assessTeam", "Teams"]]],
  ["more", "RSVP", IC2.calcheck, [["rsvp", "RSVP"]]]];
// which filters each report uses (the rest show disabled)
const SESSIONS_R = ["answers", "sess", "claims", "attend", "limits", "attSessions", "upcoming", "rsvpAnswers", "overview", "person", "all", "attendance", "noshows", "unchecked", "fill", "busiest", "locations", "waitlists", "teams", "coverage", "volunteer", "rsvp", "rsvpAthletes", "week"];
const USES = { level: SESSIONS_R, loc: SESSIONS_R, days: SESSIONS_R, bt: ["sess", "overview", "person", "all", "attendance", "noshows", "unchecked", "fill", "busiest", "locations", "waitlists", "teams", "week"],
  cs: ["claims"], at: ["claims"], dates: [...SESSIONS_R.filter((x) => x !== "week"), "emails"], team: [...SESSIONS_R, "engagement", "notSignedIn", "notSignedUp"] };

function reportPage({ qOpts = [], qq = "", whoOpts = [], who = "", famOK = false, coached = [], pid = "", user, flash, admin, boards, board, several = null, qd = "", QD = {}, allDates = true, custom = false, RF = {}, rf = {}, BT = {}, btype = "", CS = {}, cstatus = "", AT = {}, astatus = "", kinds = [], views = [], r, data, from, to, team, teams, required, week, opts = {}, filterText = "" }) {
  const o = opts, DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const X = o.assess;
  const PAIR = ["assessImprove", "assessAttend", "assessTeams"].includes(r) || (rf.cmp === "days" && (r === "assessProgress" || (r === "assessTeam" && rf.tshow === "improve")));
  const sIds = board ? String(board.id) : several ? several.map((b) => b.id).join(",") : "all";
  const state = { as: X && X.test ? X.test.id : "", da: X && PAIR ? X.a || "" : "", db: X && PAIR ? X.b || "" : "", how: X && X.how === "avg" ? "avg" : "",
    qq: r === "answers" ? qq : "", pid: r === "personView" || r === "assessAthlete" ? pid : "", cmp: rf.cmp || "", tshow: rf.tshow || "", group: rf.group || "", ashow: rf.ashow || "", who: who || "", rank: X && r === "assessLeaders" && X.rank !== "best" ? X.rank : "", qd: qd || "", stype: btype, cs: cstatus, at: astatus, when: rf.when || "", view: rf.view || "", fview: rf.fview || "", lview: rf.lview || "", cap: rf.cap || "", cov: rf.cov || "", st: rf.st || "", prob: rf.prob || "", ans: rf.ans || "", dsel: X && !PAIR && X.dsel !== "all" ? X.dsel : "", drill: X && X.drill ? X.drill : "", top: X && r === "assessLeaders" && X.top !== 10 ? String(X.top) : "", bf: X && X.bornFrom || "", bt: X && X.bornTo || "", s: sIds, team, from: qd || allDates ? "" : from, to: qd || allDates ? "" : to, r, week: r === "week" ? week : "", level: o.level ? o.level.id : "", loc: o.location || "", days: (o.days || []).join(","), q: o.q || "", wl: r === "week" && o.wl === false ? "0" : "", blanks: r === "week" && o.blanks !== 3 ? o.blanks : "" };
  const url = (x) => { const p = new URLSearchParams(Object.fromEntries(Object.entries({ ...state, ...x }).filter(([, v]) => v !== "" && v != null))); return `/reports?${p}`; };
  const uses = (k) => (USES[k] || []).includes(r) || (k === "team" && /^assess/.test(r));
  const off = (k) => (uses(k) ? "" : ` disabled title="Not used by this report"`);
  const fmtD = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const period = r === "week" ? `Week of ${fmtD(week)}` : X ? (X.test ? X.test.name : "Assessments") : `${fmtD(from)} – ${fmtD(to)}`;
  const chosen = new Set(board ? [board.id] : several ? several.map((b) => b.id) : []);
  const boardLabel = board ? board.name : several ? `${several.length} boards` : "All Boards";
  const hidden = (skip) => Object.entries(state).filter(([k, v]) => v !== "" && v != null && !skip.includes(k)).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(String(v))}">`).join("");
  // ---- header ----
  const head = `<section class="ra-hd"><span class="ra-tile">${IC2.chart}</span><div><h1>Reports &amp; Analytics</h1><p>Claim-It • Participation, Attendance &amp; Board Management</p></div>
    ${famOK ? `<nav class="ra-views" aria-label="Reports view"><a href="/reports?view=mgmt" class="on" aria-current="page">Management Reports</a><a href="/reports?view=family">My Family</a></nav>` : ""}</section>`;
  // ---- the filter panel ----
  const sel = (name, icon, label, opts, cur, extra = "") => `<label class="rf-f"><span class="rf-l">${icon}${label}</span><span class="rf-sel"><select name="${name}" form="rf" onchange="this.form.submit()"${extra}>${opts.map(([v, l]) => `<option value="${esc(String(v))}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${IC2.down}</span></label>`;
  const boardOpts = [["all", "All boards"], ...(several ? [[several.map((b) => b.id).join(","), `${several.length} boards selected`]] : []), ...boards.map((b) => [b.id, b.name + (b.archived_at ? " (archived)" : "")])];
  const levelOpts = board && (o.levels || []).length ? [["", "All levels"], ...o.levels.map((n) => [n.id, "  ".repeat(n.d) + n.path])] : [["", board ? "No levels" : "All levels (pick one board)"]];
  // ---- each report's own filters (a slim bar above the report) ----
  const RFS = { answers: ["qq", "q"], sess: ["group", "view", "q"], claims: ["group", "who", "cs", "at", "q"], attend: ["group", "ashow", "q"], limits: ["lview", "q"], attSessions: ["q"], upcoming: ["view", "q"], notSignedIn: ["q"], person: ["cs", "at", "q"], all: ["cs", "at", "q"], fill: ["view", "q"], busiest: ["when"], locations: ["when"], attendance: ["at", "q"], noshows: ["q"], unchecked: ["q"],
    teams: ["q"], coverage: ["when", "cov", "q"], volunteer: ["q"], waitlists: ["q"], engagement: ["group", "fview", "q"], notSignedUp: ["q"], emails: ["prob", "q"], rsvp: ["q"], rsvpAnswers: ["ans", "q"], rsvpAthletes: ["q"], week: ["week", "wl", "blanks"] };
  const mine = r === "rsvp" ? ["group", ...(rf.group === "answer" ? ["ans"] : []), "q"] : r === "volunteer" ? ["group", "q"] : r === "assessProgress" ? ["cmp", "assess", "q"] : r === "assessTeam" ? ["tshow", ...(rf.tshow === "improve" ? ["cmp"] : []), "assess", "q"] : /^assess/.test(r) ? ["assess", "q"] : RFS[r] || [];
  const small = (name, label, opts, cur) => `<label class="rb-f"><span>${label}</span><span class="rf-sel"><select name="${name}" form="rf" onchange="this.form.submit()">${opts.map(([v, l]) => `<option value="${esc(String(v))}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${IC2.down}</span></label>`;
  const piece = { cs: () => small("cs", "Claim status", [["", "All claim statuses"], ...Object.entries(CS)], cstatus), at: () => small("at", "Attendance status", [["", "All attendance statuses"], ...Object.entries(AT)], astatus),
    cmp: () => `<span class="rb-f rc-grp"><span>Compare</span><span class="fm-mode">${Object.entries(RF.cmp || {}).map(([k, l], i) => `<a href="${url({ cmp: k === "first" ? "" : k })}"${(rf.cmp || "first") === k ? ' class="on" aria-current="true"' : ""}>${l}</a>`).join("")}</span></span>`,
    tshow: () => `<span class="rb-f rc-grp"><span>Show</span><span class="fm-mode">${Object.entries(RF.tshow || {}).map(([k, l]) => `<a href="${url({ tshow: k === "best" ? "" : k, cmp: k === "best" ? "" : rf.cmp })}"${(rf.tshow || "best") === k ? ' class="on" aria-current="true"' : ""}>${l}</a>`).join("")}</span></span>`,
    group: () => `<span class="rb-f rc-grp"><span>Group by</span><span class="fm-mode">${Object.entries(RF.group || {}).map(([k, l], i) => `<a href="${url({ group: k, ...(k === "session" ? { at: "" } : {}) })}"${(rf.group || (i === 0 ? k : "")) === k ? ' class="on" aria-current="true"' : ""}>${l}</a>`).join("")}</span></span>`,
    who: () => small("who", "Person", [["", "Everyone"], ...whoOpts], who),
    qq: () => small("qq", "Question", [["", "All questions"], ...qOpts.map((x) => [x.id, `${x.label} (${x.board})`])], qq),
    ashow: () => small("ashow", "Show", [["", "Everyone / all sessions"], ...Object.entries(RF.ashow || {})], rf.ashow || ""),
    when: () => small("when", "When", [["", "Upcoming and past"], ...Object.entries(RF.when || {})], rf.when || ""), view: () => small("view", "Show", [["", "All sessions"], ...Object.entries(RF.view || {})], rf.view || ""), fview: () => small("fview", "Show", [["", "All families"], ...Object.entries(RF.fview || {})], rf.fview || ""), lview: () => small("lview", "Show", [["", "Everyone"], ...Object.entries(RF.lview || {})], rf.lview || ""), cap: () => small("cap", "Capacity", [["", "Any capacity"], ...Object.entries(RF.cap || {})], rf.cap || ""),
    cov: () => small("cov", "Coverage", [["", "Any coverage"], ...Object.entries(RF.cov || {})], rf.cov || ""), st: () => small("st", "Status", [["", "Any status"], ...Object.entries(RF.st || {})], rf.st || ""),
    prob: () => small("prob", "Problem", [["", "Any problem"], ...Object.entries(RF.prob || {})], rf.prob || ""), ans: () => small("ans", "Answer", [["", "Any answer"], ...Object.entries(RF.ans || {})], rf.ans || ""),
    q: () => `<label class="rf-search rb-q">${IC2.search}<input type="search" name="q" form="rf" value="${esc(o.q || "")}" placeholder="Search this report…" aria-label="Search this report"></label>`,
    week: () => `<label class="rb-f"><span>Week of</span><input type="date" class="rf-date" name="week" form="rf" value="${esc(week)}" onchange="this.form.submit()"></label>`,
    wl: () => small("wl", "Waitlist", [["1", "Show"], ["0", "Hide"]], o.wl === false ? "0" : "1"), blanks: () => small("blanks", "Blank lines", [0, 1, 2, 3, 4, 6].map((n) => [n, String(n)]), o.blanks),
    assess: () => strip };
  const viewsMenu = `<details class="rf-views"><summary class="rf-btn">${IC2.mark}Save View${IC2.down}</summary><div class="rf-views-list">
      <form method="post" action="/reports/views" class="rf-save"><input type="hidden" name="qs" value="${esc(new URLSearchParams(Object.fromEntries(Object.entries(state).filter(([, v]) => v !== "" && v != null))).toString())}">
        <input name="name" maxlength="60" placeholder="Name this view, e.g. Monday Speed & Agility" required aria-label="View name"><button class="btn-small" type="submit">Save</button></form>
      ${views.length ? `<span class="rf-vh">Saved views</span>${views.map((v) => `<div class="rf-v"><a href="/reports?${esc(v.qs)}">${esc(v.name)}</a><form method="post" action="/reports/views/${v.id}/delete" onsubmit="return window.confirm('Delete the saved view &quot;${esc(v.name).replace(/'/g, "")}&quot;?')"><input type="hidden" name="back" value="${esc(new URLSearchParams(Object.fromEntries(Object.entries(state).filter(([, x]) => x !== "" && x != null))).toString())}"><button class="x" type="submit" aria-label="Delete ${esc(v.name)}">×</button></form></div>`).join("")}` : `<span class="fine">No saved views yet. A view remembers this report and its filters.</span>`}</div></details>`;
  const resetHref = (() => { const q = new URLSearchParams({ r }); if (X && X.test) q.set("as", X.test.id); return `/reports?${q}`; })();
  const dayOpt = (sel) => (X.days || []).map((d) => `<option value="${d.id}"${d.id === sel ? " selected" : ""}>${esc(d.kind)} · ${esc(new Date(String(d.day.toISOString ? d.day.toISOString() : d.day).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}${d.board ? ` · ${esc(d.board)}` : ""}</option>`).join("");
  const strip = `${X ? `<div class="r-filters r-assess">${X.tests.length ? `<label class="r-f">Assessment<select name="as" form="rf" onchange="document.querySelectorAll('[name=da],[name=db]').forEach(function (e) { e.disabled = true; }); this.form.submit()">${X.tests.map((t) => `<option value="${t.id}"${X.test && X.test.id === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
      ${PAIR ? `<label class="r-f">From<select name="da" form="rf" onchange="this.form.submit()">${dayOpt(X.a)}</select></label><label class="r-f">To<select name="db" form="rf" onchange="this.form.submit()">${dayOpt(X.b)}</select></label>`
        : `<label class="r-f">Testing day<select name="dsel" form="rf" onchange="this.form.submit()"><option value="all">All days</option>${[...new Set((X.days || []).map((d) => d.kind))].map((k) => `<option value="k:${esc(k)}"${X.dsel === "k:" + k ? " selected" : ""}>All ${esc(k)} days</option>`).join("")}${dayOpt(Number(X.dsel)).replace(/value="(\d+)"/g, 'value="$1"')}</select></label>`}
      <label class="r-f">Drill<select name="drill" form="rf" onchange="this.form.submit()"><option value="">All drills</option>${(X.drills || []).map((d) => `<option value="${d.id}"${X.drill === d.id ? " selected" : ""}>${esc(d.name)}${d.retired_at ? " (retired)" : ""}</option>`).join("")}</select></label>
      <label class="r-f">Count<select name="how" form="rf" onchange="this.form.submit()"><option value="best">Best try</option><option value="avg"${X.how === "avg" ? " selected" : ""}>Average of tries</option></select></label>` : `<span class="fine">No assessments yet: App Settings → People → Assessments.</span>`}
      ${X.tests.length && r === "assessLeaders" ? `<label class="r-f">Rank by<select name="rank" form="rf" onchange="this.form.submit()"><option value="best">Best score</option><option value="improved"${X.rank === "improved" ? " selected" : ""}>Most improved</option><option value="records"${X.rank === "records" ? " selected" : ""}>Records</option></select></label>` : ""}
      ${X.tests.length && r === "assessLeaders" && X.rank !== "records" ? `<label class="r-f">Top<select name="top" form="rf" onchange="this.form.submit()">${[[5, "5"], [10, "10"], [25, "25"], [0, "Everyone"]].map(([v, l]) => `<option value="${v}"${X.top === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
      ${X.tests.length ? `<label class="r-f r-born">Born<input name="bf" form="rf" inputmode="numeric" maxlength="4" placeholder="from" value="${esc(X.bornFrom || "")}" onchange="this.form.submit()">–<input name="bt" form="rf" inputmode="numeric" maxlength="4" placeholder="to" value="${esc(X.bornTo || "")}" onchange="this.form.submit()"></label>` : ""}</div>` : ""}`;
  const rbOn = mine.filter((k) => k === "q" ? o.q : state[k]).length;
  const rbar = mine.length ? `<div class="rb-bar">${IC2.filter}<button type="button" class="rb-t" onclick="this.closest('.rb-bar').classList.toggle('rb-closed')">${esc((TABS.find((t) => t[3].some(([k]) => k === r)) || [, ""])[1])} filters${rbOn ? ` <b class="tb-n">${rbOn}</b>` : ""}<span class="tb-car">${IC2.down}</span></button>${mine.map((k) => piece[k]()).join("")}</div>` : "";
  // ---- the compact filter toolbar: Board · Team · Dates · More filters · Reset, then the active filters as chips ----
  const mini = (name, label, opts, cur, attrs = "") => `<label class="tb-f"><span>${label}</span><span class="rf-sel"><select name="${name}" form="rf" onchange="this.form.submit()"${attrs}>${opts.map(([v, l]) => `<option value="${esc(String(v))}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${IC2.down}</span></label>`;
  const dateWord = r === "emails" ? "Email dates" : "Session dates";
  const moreN = [uses("level") && o.level, uses("loc") && o.location, uses("bt") && btype].filter(Boolean).length;
  const moreItems = [uses("level") && board && (o.levels || []).length ? mini("level", "Level", levelOpts, o.level ? o.level.id : "") : uses("level") ? `<p class="fine tb-hint">Pick one board to filter by level.</p>` : "",
    uses("loc") && (o.locations || []).length > 1 ? mini("loc", "Location", [["", "All locations"], ...(o.locations || []).map((l) => [l, l])], o.location || "") : "",
    uses("bt") ? mini("stype", "Session type", [["", "All session types"], ...Object.entries(BT).filter(([k]) => kinds.includes(k) || btype === k)], btype) : ""].filter(Boolean);
  const showCustom = !qd && !allDates;
  const RLAB = { lview: "Show", fview: "Show", view: "Show", cs: "Claim status", at: "Attendance", when: "When", cap: "Capacity", cov: "Coverage", st: "Status", prob: "Problem", ans: "Answer", q: "Search" };
  const RVAL = { lview: RF.lview || {}, fview: RF.fview || {}, view: RF.view || {}, cs: CS, at: AT, when: RF.when || {}, cap: RF.cap || {}, cov: RF.cov || {}, st: RF.st || {}, prob: RF.prob || {}, ans: RF.ans || {} };
  const chipsOn = [
    (board || several) && ["s", `Board: ${board ? board.name : `${several.length} boards`}`],
    uses("team") && team && ["team", `Team: ${team}`],
    uses("dates") && !allDates && ["qd", `${dateWord}: ${qd ? QD[qd] : `${fmtD(from)} – ${fmtD(to)}`}`],
    uses("level") && o.level && ["level", `Level: ${o.level.path}`], uses("loc") && o.location && ["loc", `Location: ${o.location}`], uses("bt") && btype && ["stype", `Session type: ${BT[btype]}`],
    ...Object.keys(RLAB).filter((k) => (state[k] || (k === "q" && o.q)) && (mine.includes(k))).map((k) => [k, `${RLAB[k]}: ${k === "q" ? `“${o.q}”` : (RVAL[k][state[k]] || state[k])}`]),
  ].filter(Boolean);
  const clearOne = (k) => url(k === "qd" ? { qd: "", from: "", to: "" } : k === "s" ? { s: "all", level: "" } : { [k]: "" });
  const panel = `<form method="get" action="/reports" id="rf">${hidden(["s", "level", "team", "loc", "stype", "cs", "at", "q", "days", "from", "to", "week", "as", "da", "db", "how", "dsel", "drill", "top", "bf", "bt", "when", "view", "fview", "lview", "rank", "ashow", "who", "qq", "cap", "cov", "st", "prob", "ans", "wl", "blanks", ...(qd ? [] : ["qd"])])}</form>
    <section class="tb">
      <button type="button" class="tb-t" aria-expanded="true" onclick="var t = this.closest('.tb'), c = t.classList.toggle('tb-closed'); this.setAttribute('aria-expanded', String(!c));">${IC2.filter}Filters${chipsOn.length ? ` <b class="tb-n">${chipsOn.length}</b>` : ""}<span class="tb-car">${IC2.down}</span></button>
      ${mini("s", "Board", boardOpts, board ? board.id : several ? several.map((b) => b.id).join(",") : "all", ` onchange="var l = this.form.querySelector('[name=level]'); if (l) l.disabled = true; this.form.submit()"`).replace(' onchange="this.form.submit()"', "")}
      ${uses("team") ? mini("team", "Team", [["", "All teams"], ...teams.map((t) => [t, t])], team || "") : ""}
      ${uses("dates") ? `<span class="tb-d"><span class="tb-dl">${IC2.cal}${dateWord}</span><span class="rf-pills">${Object.entries(QD).map(([k, l]) => `<a href="${url({ qd: k, from: "", to: "" })}"${qd === k ? ' class="on" aria-current="true"' : ""}>${l}</a>`).join("")}<a href="#" class="${showCustom ? "on" : ""}" onclick="document.getElementById('rfc').hidden = false; [].forEach.call(this.parentNode.children, function (a) { a.classList.remove('on'); }); this.classList.add('on'); document.querySelector('#rfc input').focus(); return false;">Custom</a><a href="${url({ qd: "", from: "", to: "" })}"${allDates ? ' class="on" aria-current="true"' : ""}>All dates</a></span>
        <span class="rf-custom" id="rfc"${showCustom ? "" : " hidden"}><input type="date" class="rf-date" name="from" form="rf" value="${showCustom ? esc(from) : ""}" aria-label="From"><span class="fine">to</span><input type="date" class="rf-date" name="to" form="rf" value="${showCustom ? esc(to) : ""}" aria-label="To"><button class="rf-apply" type="submit" form="rf">${IC2.check}Apply</button></span></span>` : ""}
      ${moreItems.length ? `<details class="tb-more"${moreN ? "" : ""}><summary class="rf-btn">More filters${moreN ? ` <b class="tb-n">${moreN}</b>` : ""}${IC2.down}</summary><div class="tb-drawer">${moreItems.join("")}</div></details>` : ""}
      ${chipsOn.length ? `<a class="tb-reset" href="/reports?reset=1&r=${esc(r)}">${IC2.reset}Reset</a>` : ""}
    </section>
    ${chipsOn.length ? `<div class="tb-chips" aria-label="Active filters">${chipsOn.map(([k, l]) => `<a class="tb-chip" href="${clearOne(k)}" title="Remove this filter">${esc(l)} <span aria-hidden="true">✕</span></a>`).join("")}</div>` : ""}`;
  // ---- report navigation: only sections this person can use and that apply to the chosen boards ----
  const showSub = (k) => k === "emails" ? admin : /^rsvp/.test(k) ? kinds.includes("rsvp") : k === "coverage" ? kinds.includes("volunteer") : true;   // Volunteer hours always shows under Families
  const showTab = (id) => (TABS.find((t) => t[0] === id) || [, , , []])[3].some(([k, l]) => !l || showSub(k));
  const curTab = TABS.find((t) => t[3].some(([k]) => k === r)) || TABS[0];
  const RK = ["qq", "cmp", "tshow", "group", "ashow", "who", "lview", "rank", "fview", "view", "pid", "cs", "at", "q", "when", "cap", "cov", "st", "prob", "ans", "as", "da", "db", "how", "dsel", "drill", "top", "bf", "bt", "wl", "blanks", "week"];   // a report's own filters
  const go = (k) => url({ r: k, v: "" }), goNew = (k) => url({ r: k, v: "", ...Object.fromEntries(RK.map((x) => [x, ""])) });
  const tabs = `<nav class="rt-tabs" aria-label="Reports">${TABS.filter((t) => showTab(t[0]) || t === curTab).map(([id, label, icon, subs]) => { const first = (subs.find(([k, l]) => l && showSub(k)) || subs[0])[0]; return `<a href="${id === curTab[0] ? go(first) : goNew(first)}"${t0(id)}>${icon}<span>${label}</span></a>`; }).join("")}</nav>
    ${curTab[3].filter(([k, l]) => l && showSub(k)).length > 1 ? `<nav class="r-chips" aria-label="${esc(curTab[1])} reports">${curTab[3].filter(([k, l]) => l && showSub(k)).map(([k, l]) => `<a href="${go(k)}"${k === r ? ' class="on" aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</nav>` : ""}`;
  function t0(id) { return id === curTab[0] ? ' class="on" aria-current="page"' : ""; }
  let body;
  if (r === "overview") {
    const D = data, fmt = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const canCheck = (bid) => coached === "all" || (coached || []).includes(Number(bid));
    const ACT = (a) => ({ checkin: canCheck(a.board_id) ? ["Record attendance", `/checkin/i/${a.item_id}`] : ["View sessions", url({ r: "unchecked" })],
      session: admin ? ["View session", `/admin/b/${a.board_id}/items/${a.item_id}/people`] : ["View sessions", url({ r: "upcoming", q: a.session })],
      waitlist: admin ? ["Review waitlist", `/admin/b/${a.board_id}/items/${a.item_id}/people`] : ["Review waitlists", url({ r: "waitlists" })],
      person: ["View person", url({ r: "personView", pid: a.athlete_id })], families: ["View families", url({ r: "notSignedIn" })], emails: ["Review issues", url({ r: "emails" })],
      waitlists: ["Review waitlists", url({ r: "waitlists" })], released: ["View claims", url({ r: "all", cs: "canceled" })] }[a.action] || ["Open", url({ r: "overview" })]);
    const PRI = { 3: ["High", "s3"], 2: ["Medium", "s2"], 1: ["Info", "s1"] };
    const KIND = { over: "Over capacity", waitopen: "Open spots, people waiting", email: "Email problems", unrecorded: "Attendance not recorded", low: "Low enrollment", near: "Nearly full", vol: "Volunteer coverage", noshows: "Repeated no-shows", helper: "Helper still needed", engage: "Never signed in", newwait: "New waitlist activity", released: "Released claims" };
    const types = [...new Set(D.attention.map((a) => a.kind))];
    const attn = D.attention.length ? `<div class="na-f" role="group" aria-label="Show"><button type="button" class="on" data-na="">All (${D.attention.length})</button>${[3, 2, 1].filter((p) => D.attention.some((a) => a.sev === p)).map((p) => `<button type="button" data-sev="${p}">${PRI[p][0]} (${D.attention.filter((a) => a.sev === p).length})</button>`).join("")}${types.map((k) => `<button type="button" data-na="${k}">${esc(KIND[k] || k)} (${D.attention.filter((a) => a.kind === k).length})</button>`).join("")}</div>
      <div class="table-wrap"><table class="r-table na-t" data-nosort><thead><tr><th>Priority</th><th>Issue</th><th>Board</th><th>Session / person</th><th>Date</th><th></th></tr></thead><tbody>
      ${D.attention.map((a) => { const [al, ah] = ACT(a); return `<tr data-k="${a.kind}" data-s="${a.sev}"><td><span class="na-sev ${PRI[a.sev][1]}">${PRI[a.sev][0]}</span></td><td><b>${esc(a.issue)}</b><span class="em-why">${esc(a.count)}</span></td><td>${esc(a.board || "—")}</td><td>${esc(a.session || "—")}</td><td class="r-muted">${a.kind === "engage" || a.kind === "email" || a.kind === "newwait" || a.kind === "released" ? "—" : esc(fmt(a.when))}</td><td><a class="rf-btn na-act" href="${ah}">${esc(al)}</a></td></tr>`; }).join("")}</tbody></table></div>`
      : `<p class="na-none">✓ Nothing needs attention for these filters.</p>`;
    const charts = [D.claimsOverTime.length && `<section class="db-card"><h3>Claims over time <span class="fine">by week claimed · <i class="lg navy"></i> claims</span></h3>${barChart(D.claimsOverTime)}</section>`,
      D.capacity.length && `<section class="db-card"><h3>Session capacity <span class="fine">upcoming · <i class="lg navy"></i> claimed <i class="lg gray"></i> available</span></h3>${barChart(D.capacity, { two: true })}</section>`,
      D.attendanceTrend.length && `<section class="db-card"><h3>Attendance trend <span class="fine">% attended, by week (recorded sessions only)</span></h3>${barChart(D.attendanceTrend, { unit: "%", line: true, max: 100 })}</section>`,
      D.teams.length && `<section class="db-card"><h3>Participation by team <span class="fine">athletes with a claim, out of the team's roster</span></h3>${hBars(D.teams.map((t) => ({ label: `${t.label} · ${t.text}`, value: t.value })))}</section>`,
      D.utilization.length && `<section class="db-card"><h3>Board utilization <span class="fine">upcoming spots taken</span></h3>${hBars(D.utilization)}</section>`].filter(Boolean);
    const upRows = D.upcoming.map((s) => { const [st, cls] = STATUS(s.taken, s.capacity), act = admin ? ["Manage", `/admin/b/${s.board_id}/items/${s.id}/people`] : canCheck(s.board_id) ? ["Check-in", `/checkin/i/${s.id}`] : null;
      return `<tr><td class="r-muted">${esc(fmt(s.starts_at))}</td><td><b>${esc(s.session)}</b></td><td>${esc(s.board)}</td><td><span class="up-c"><span class="cap"><i class="${cls}" style="width:${s.capacity ? Math.min(100, (s.taken / s.capacity) * 100) : 0}%"></i></span><span class="fine">${s.taken}${s.capacity ? ` / ${s.capacity}` : ""}${s.waitlisted ? ` · ${s.waitlisted} waiting` : ""}</span></span></td><td><b class="st-${cls}">${st}</b></td><td>${act ? `<a class="rf-btn na-act" href="${act[1]}">${act[0]}</a>` : ""}</td></tr>`; }).join("");
    body = `<div class="kpis kp6">${D.kpis.map(([k, label, v, unit, sub, link]) => `<a class="kpi" href="${link.anchor ? "#" + link.anchor : url(link)}"><span class="kpi-l">${esc(label)}</span><b>${v == null ? "—" : `${v}${unit}`}</b><span class="fine">${esc(sub)}</span></a>`).join("")}</div>
      <section class="db-card db-attn" id="attention"><h3>Needs attention</h3>${attn}<p class="fine">Low-enrollment and nearly-full alerts use each board's own thresholds (Board → Notifications → Needs attention).</p></section>
      <section class="db-card"><h3>Upcoming sessions <a class="link-dark db-all" href="${url({ r: "upcoming" })}">View all sessions →</a></h3>${upRows ? `<div class="table-wrap"><table class="r-table up-t" data-nosort><thead><tr><th>Date / time</th><th>Session</th><th>Board</th><th>Claims / capacity</th><th>Status</th><th></th></tr></thead><tbody>${upRows}</tbody></table></div>` : `<p class="ch-empty">No upcoming sessions for these filters.</p>`}</section>
      ${charts.length ? `<div class="db-grid">${charts.join("")}</div>` : `<p class="ch-empty">Charts appear once there's activity for these filters.</p>`}
      <script>document.querySelectorAll(".na-f button").forEach(function (b) { b.addEventListener("click", function () { document.querySelectorAll(".na-f button").forEach(function (x) { x.classList.toggle("on", x === b); });
        document.querySelectorAll(".na-t tbody tr").forEach(function (tr) { tr.hidden = (b.dataset.na && tr.dataset.k !== b.dataset.na) || (b.dataset.sev && tr.dataset.s !== b.dataset.sev); }); }); });</script>`;
  }
  else if (r === "week") body = weekSheet(data, o);
  else if (r === "assessAthlete") {
    const P = data.person;
    body = !P ? `<div class="d-empty"><b>${esc(data.empty || "No results.")}</b></div>` : `<div class="pv-hd"><a class="link-dark" href="${url({ r: "assessProgress", pid: "" })}">← Progress</a>
        <h2>${esc(P.first_name)} ${esc(P.last_name || "")}</h2><p class="fine">${esc(data.test)}${P.team ? ` · ${esc(P.team)}` : ""}</p></div>
      <div class="db-grid">${data.drills.map((d) => `<section class="db-card"><h3>${esc(d.name)}${d.unit ? ` <span class="fine">(${esc(d.unit)})</span>` : ""} ${d.pb ? `<span class="pb">Personal best</span>` : ""}</h3>
        <p class="fine">${d.better === "higher" ? "Higher is better" : "Lower is better"}${d.method ? ` · ${esc(d.method)}` : ""}</p>
        ${d.points.length > 1 ? barChart(d.points, { line: true, unit: "" }) : `<p class="ch-empty">One testing day so far.</p>`}
        <p class="pv-sum">${esc(d.summary)}</p><p class="fine">Initial ${d.initial} · Latest ${d.latest} · Best ${d.best}</p></section>`).join("")}</div>`;
  }
  else if (r === "personView") {
    const P = data.person;
    body = !P ? `<div class="d-empty"><b>That person isn't in this report.</b> They may not be on the boards you can see, or the filters leave them out.</div>` : `
      <div class="pv-hd"><a class="link-dark" href="${url({ r: "claims", group: "person", pid: "" })}">← Claims</a>
        <h2>${esc(P.first_name)} ${esc(P.last_name || "")}</h2><p class="fine">${[P.team, ...data.boards.map((b) => b.name + (b.group_name ? ` (${b.group_name})` : ""))].filter(Boolean).map(esc).join(" · ") || "Not on a board in view"}${admin ? ` · <a href="/admin/people/${P.id}">Open in People</a>` : ""}</p></div>
      <div class="kpis pv-k">${data.kpis.map(([l, v, u]) => `<div class="kpi"><span class="kpi-l">${esc(l)}</span><b>${v == null ? "—" : `${v}${u || ""}`}</b></div>`).join("")}</div>
      ${data.trend.length ? `<section class="db-card"><h3>Attendance by month <span class="fine">% attended (recorded sessions)</span></h3>${barChart(data.trend, { unit: "%", max: 100 })}</section>` : ""}
      <section class="db-card"><h3>Upcoming <span class="fine">${data.upcoming.rows.length}</span></h3>${data.upcoming.rows.length ? table(data.upcoming) : `<p class="ch-empty">Nothing upcoming.</p>`}</section>
      <section class="db-card"><h3>Attendance history <span class="fine">${data.history.rows.length} past sessions</span></h3>${data.history.rows.length ? table(data.history) : `<p class="ch-empty">No past sessions in this range.</p>`}</section>
      <section class="db-card"><h3>Cancellations <span class="fine">${data.canceled.rows.length}</span></h3>${data.canceled.rows.length ? table(data.canceled) : `<p class="ch-empty">No cancellations.</p>`}</section>
      <section class="db-card"><h3>Waitlist activity <span class="fine">${data.waitlist.rows.length}</span></h3>${data.waitlist.rows.length ? table(data.waitlist) : `<p class="ch-empty">No waitlist activity.</p>`}</section>`;
  }
  else body = `${r === "volunteer" && admin ? `<form method="post" action="${url({}).replace("/reports?", "/reports/volunteer-required?")}" class="r-req"><label>Hours each family needs <input type="number" name="hours" min="0" max="500" step="0.5" value="${required || ""}" placeholder="none"></label><button class="sb-btn" type="submit">Save</button><span class="fine">Leave empty for no requirement.</span></form>` : ""}
    ${data.summary ? `<div class="kpis pv-k">${data.summary.map(([l, v]) => `<div class="kpi"><span class="kpi-l">${esc(l)}</span><b>${v}</b></div>`).join("")}</div>` : ""}
    ${data.note ? `<p class="fine r-note2">${esc(data.note)}</p>` : ""}${data.grid ? grid(data) : table(data, url)}`;
  // ---- the board-style layout: navy band · gray category bar · Filters panel (closed) · folder tabs · card ----
  const GLOBAL = new Set(["s", "team", "qd", "level", "loc", "stype"]);
  const onG = chipsOn.filter(([k]) => GLOBAL.has(k));
  const meta = [board ? board.name : several ? `${several.length} boards` : "All boards", ...onG.filter(([k]) => k !== "s").map(([, l]) => l), uses("dates") && allDates ? "All dates" : ""].filter(Boolean).join(" · ");
  const nOn = onG.length;
  const band = `<section class="bh2 r-bh"><div class="bh2-l"><span class="bh2-tile r-tile">${IC2.chart}</span>
      <div><div class="bh2-t"><h1>Reports &amp; Analytics</h1></div><span class="bh2-meta">${esc(meta)}</span></div></div>
    <div class="bh2-acts">
      <button type="button" class="sb-btn r-ftoggle" aria-expanded="false" aria-controls="rfp">${IC2.filter}Filters${nOn ? ` <b class="tb-n">${nOn}</b>` : ""}</button>
      ${data.cols || r === "week" || r === "overview" ? `<a class="sb-btn" href="${url({ pdf: "1" })}">${DL}PDF</a>` : ""}${data.cols ? `<a class="sb-btn" href="${url({ csv: "1" })}">${DL}CSV</a>` : ""}${r === "week" || r === "overview" ? `<button type="button" class="sb-btn" onclick="window.print()">Print</button>` : ""}
      ${famOK ? `<nav class="ra-views" aria-label="Reports view"><a href="/reports?view=mgmt" class="on" aria-current="page">Management</a><a href="/reports?view=family">My Family</a></nav>` : ""}</div></section>`;
  const cats = `<nav class="bh2-tabs board-tabs r-cats" aria-label="Report categories">${TABS.filter((t) => showTab(t[0]) || t === curTab).map(([id, label, icon, subs]) => { const first = (subs.find(([k, l]) => l && showSub(k)) || subs[0])[0];
      return `<a href="${id === curTab[0] ? go(first) : goNew(first)}"${id === curTab[0] ? ' aria-current="page"' : ""}>${icon}${label}</a>`; }).join("")}</nav>`;
  const subsShown = curTab[3].filter(([k, l]) => l && showSub(k));
  const folders = subsShown.length > 1 ? `<nav class="sub-tabs bd-subs r-folders" aria-label="${esc(curTab[1])} reports">${subsShown.map(([k, l]) => `<a href="${go(k)}"${k === r ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</nav>` : "";
  const rfForm = (panel.match(/<form method="get" action="\/reports" id="rf">[\s\S]*?<\/form>/) || [""])[0];
  const fpanel = `<section class="r-fpanel" id="rfp" hidden aria-label="Report filters">
      <div class="r-fgrid">
        ${mini("s", "Board", boardOpts, board ? board.id : several ? several.map((b) => b.id).join(",") : "all", ` onchange="var l = this.form.querySelector('[name=level]'); if (l) l.disabled = true; this.form.submit()"`).replace(' onchange="this.form.submit()"', "")}
        ${uses("team") ? mini("team", "Team", [["", "All teams"], ...teams.map((t) => [t, t])], team || "") : ""}
        ${moreItems.join("")}
      </div>
      ${uses("dates") ? `<div class="r-fdates"><span class="tb-dl">${IC2.cal}${dateWord}</span><span class="rf-pills">${Object.entries(QD).map(([k, l]) => `<a href="${url({ qd: k, from: "", to: "" })}"${qd === k ? ' class="on" aria-current="true"' : ""}>${l}</a>`).join("")}<a href="#" class="${showCustom ? "on" : ""}" onclick="document.getElementById('rfc').hidden = false; [].forEach.call(this.parentNode.children, function (a) { a.classList.remove('on'); }); this.classList.add('on'); document.querySelector('#rfc input').focus(); return false;">Custom</a><a href="${url({ qd: "", from: "", to: "" })}"${allDates ? ' class="on" aria-current="true"' : ""}>All dates</a></span>
        <span class="rf-custom" id="rfc"${showCustom ? "" : " hidden"}><input type="date" class="rf-date" name="from" form="rf" value="${showCustom ? esc(from) : ""}" aria-label="From"><span class="fine">to</span><input type="date" class="rf-date" name="to" form="rf" value="${showCustom ? esc(to) : ""}" aria-label="To"><button class="rf-apply" type="submit" form="rf">${IC2.check}Apply</button></span></div>` : ""}
      <div class="r-fact">${nOn ? `<a class="tb-reset" href="/reports?reset=1&r=${esc(r)}">${IC2.reset}Clear all filters</a>` : `<span class="fine">Filters apply to every report.</span>`}<button type="button" class="sb-btn" onclick="document.querySelector('.r-ftoggle').click()">Done</button></div></section>`;
  // the report's own filters: the card's first row
  const cardRow = mine.length ? `<div class="rc-f">${mine.map((k) => piece[k]()).join("")}</div>` : "";
  return layout({ title: `Reports · ${TITLES[r] || ""}`, user, flash, admin, tab: "reports", dash: true,
    body: `<div class="d-wrap r-wrap ra-page rb2${r === "week" ? " r-print" : ""}">${band}${cats}${fpanel}${rfForm}<div class="r-sheet2">${folders}<section class="d-card r-card">${cardRow}${body}</section></div></div>
    <script>(function () { var b = document.querySelector(".r-ftoggle"), p = document.getElementById("rfp"); if (!b || !p) return;
      function set(open) { p.hidden = !open; b.setAttribute("aria-expanded", String(open)); b.classList.toggle("on", open); try { sessionStorage.setItem("rfOpen", open ? "1" : "0"); } catch (e) {} }
      try { if (sessionStorage.getItem("rfOpen") === "1") set(true); } catch (e) {}
      b.addEventListener("click", function () { set(p.hidden); }); })();</script>` });
}

function reportsPage({ user, flash, admin, boards, board, rows, people, teams, teamFilter, view, limitedTo }) {
  const url = (o) => { const p = new URLSearchParams(Object.fromEntries(Object.entries({ s: board.id, team: teamFilter, v: view === "all" ? "all" : "", ...o }).filter(([, x]) => x))); return `/reports?${p}`; };
  const att = (r) => r.attended == null ? `<span class="fine">—</span>` : r.attended ? `<span class="r-yes">✓ Here</span>` : `<span class="r-no">✗ No-show</span>`;
  const anyAttendance = rows.some((r) => r.attended != null);
  return layout({ title: `Reports · ${board.name}`, user, flash, admin, tab: "reports", dash: true,
    body: `<div class="d-wrap r-wrap">
    <section class="bh2 r-hd"><div class="bh2-l"><span class="bh2-tile dash-tile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/></svg></span>
      <div><div class="bh2-t"><h1>Reports</h1></div><span class="bh2-meta">${esc(board.name)}${teamFilter ? ` · ${esc(teamFilter)}` : ""} · ${people.length} ${people.length === 1 ? "person" : "people"} · ${rows.length} claim${rows.length === 1 ? "" : "s"}${anyAttendance ? ` · ${rows.filter((r) => r.attended === true).length} attended` : ""}</span></div></div></section>
    <nav class="bh2-tabs dash-tabs r-gbar">
      <form method="get" action="/reports" class="r-pick"><span class="r-pick-l">Board</span><select name="s" onchange="this.form.submit()" aria-label="Board">${boards.map((b) => `<option value="${b.id}"${b.id === board.id ? " selected" : ""}>${esc(b.name)}${b.archived_at ? " (archived)" : ""}</option>`).join("")}</select>
        ${teams.length > 1 || teamFilter ? `<select name="team" onchange="this.form.submit()" aria-label="Team"><option value="">All ${limitedTo.length ? "my " : ""}teams</option>${teams.map((t) => `<option${t === teamFilter ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
        ${view === "all" ? `<input type="hidden" name="v" value="all">` : ""}</form>
      <a class="sb-btn" href="${url({ csv: "1" })}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="15" height="15"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Download CSV</a>
    </nav>
    ${reportNav(view === "all" ? "all" : "person", (o) => o.r ? `/reports?${new URLSearchParams(Object.fromEntries(Object.entries({ s: board.id, team: teamFilter, r: o.r }).filter(([, x]) => x)))}` : url({ v: o.v === "all" ? "all" : "" }), !limitedTo.length)}
    <div class="sub-body r-sheet">
    ${limitedTo.length ? `<p class="fine r-lim">You can see ${esc(limitedTo.join(", "))} on this board.</p>` : ""}
    ${anyAttendance ? "" : `<p class="r-note">Attendance shows here once check-in is used for this board. Until then, the Attended column shows “—”.</p>`}
    <section class="d-card r-card">${view === "person"
      ? (people.length ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>Name</th><th>Team</th><th>Claimed</th><th>Waitlisted</th><th>Attended</th><th>No-shows</th><th>Last one</th></tr></thead><tbody>
          ${people.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.team || "")}</td><td>${p.claimed}</td><td>${p.waitlisted || ""}</td><td>${anyAttendance ? p.attended : "—"}</td><td>${anyAttendance ? p.missed || "" : "—"}</td><td class="r-muted">${p.last ? esc(new Date(p.last).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" })) : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="d-empty"><b>No claims yet.</b></div>`)
      : (rows.length ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>Name</th><th>Team</th><th>Where</th><th>When</th><th>Status</th><th>Attended</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td><b>${esc(r.first_name)} ${esc(r.last_name)}</b>${r.note ? `<div class="fine">${esc(r.note)}</div>` : ""}</td><td>${esc(r.group_name || "")}</td><td>${esc(r.path || "")}</td>
            <td>${esc(slotName(r))}</td><td>${r.status === "waitlisted" ? `<span class="d-pill wl">Waitlist</span>` : r.walk_in ? "Walk-in" : r.added_by_admin ? "Added by admin" : "Claimed"}${r.override ? ` <span class="fine">(override)</span>` : r.counts === false && !r.walk_in ? ` <span class="fine">(extra)</span>` : ""}</td><td>${att(r)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="d-empty"><b>No claims yet.</b></div>`)}
    </section></div></div>` });
}
module.exports = { reportsPage, reportPage, GROUPS, TITLES, USES, barChart, IC2 };
