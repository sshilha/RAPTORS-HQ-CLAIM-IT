const { esc, layout } = require("./layout");
const { slotName, fmtDateTime } = require("../time");


// the report tabs (shared by every report, including By person / All claims)
const GROUPS = [["overview", "Overview", [["overview", ""]]], ["claims", "Claims", [["person", "By person"], ["all", "All claims"]]],
  ["attendance", "Attendance", [["attendance", "Athletes"], ["noshows", "No-shows"], ["unchecked", "Check-ins not done"]]],
  ["sessions", "Sessions", [["fill", "Fill"], ["busiest", "Busiest times"], ["waitlists", "Waitlists"], ["locations", "Locations"]]],
  ["rsvp", "RSVP", [["rsvp", "Events"], ["rsvpAthletes", "Athletes"]]], ["families", "Families", [["engagement", "Engagement"], ["notSignedUp", "Not signed up"], ["volunteer", "Volunteer hours"]]],
  ["assess", "Assessments", [["assessResults", "Results"], ["assessLeaders", "Leaderboard"], ["assessTeamBest", "Best by team"], ["assessRecords", "Records"], ["assessImprove", "Improvement"], ["assessAttend", "vs attendance"], ["assessTeams", "Team improvement"]]],
  ["emails", "Emails", [["emails", ""]]], ["week", "Week sheet", [["week", ""]]]];
function reportNav(key, url, full = true, admin = true) {
  const g = GROUPS.find((x) => x[2].some(([k]) => k === key)) || GROUPS[0];
  const go = (k) => url({ r: k, v: "" });
  const groups = (full ? GROUPS : GROUPS.filter((x) => x[0] === "claims")).filter((x) => admin || x[0] !== "emails");
  return `<nav class="sub-tabs r-subs">${groups.map(([id, label, subs]) => `<a href="${go(subs[0][0])}"${id === g[0] ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    ${g[2].length > 1 ? `<nav class="r-chips" aria-label="${esc(g[1])} reports">${g[2].map(([k, l]) => `<a href="${go(k)}"${k === key ? ' class="on" aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</nav>` : ""}`;
}
const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/></svg>`;
const DL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="15" height="15"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`;
const TITLES = { assessResults: "Assessment results", assessLeaders: "Assessment leaderboard", assessTeamBest: "Assessment best by team", assessRecords: "Assessment records", assessImprove: "Assessment improvement", assessAttend: "Improvement vs attendance", assessTeams: "Assessment team averages", person: "Claims by person", all: "All claims", overview: "Overview", attendance: "Attendance by athlete", noshows: "No-shows", unchecked: "Check-ins not done", fill: "Session fill", busiest: "Busiest times", waitlists: "Waitlists",
  locations: "Locations", rsvp: "RSVP by event", rsvpAthletes: "RSVP by athlete", engagement: "Family engagement", notSignedUp: "On the list, not signed up", volunteer: "Volunteer hours by family", emails: "Email problems", week: "Week sheet" };
function cell(v, kind) {
  if (v == null || v === "") return `<td class="r-muted" data-sort="">—</td>`;
  if (kind === "pct") return `<td data-sort="${v}"><span class="r-pct"><b>${v}%</b><i style="width:${Math.min(100, v)}%"></i></span></td>`;
  if (kind === "num") return `<td class="r-num" data-sort="${v}">${esc(String(v))}</td>`;
  if (kind === "date" || kind === "dt") { const d = new Date(v); return `<td class="r-muted" data-sort="${d.toISOString()}">${esc(kind === "dt" ? fmtDateTime(d) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }))}</td>`; }
  return `<td>${/^(Repeat|Repeat no-shows|Behind|Never signed in|No account|Never)$/.test(String(v)) ? `<span class="r-flag bad">${esc(v)}</span>` : /^(Done|Active)$/.test(String(v)) ? `<span class="r-flag ok">${esc(v)}</span>` : /^(Close|Signed in, no claims)$/.test(String(v)) || /Method changed/.test(String(v)) ? `<span class="r-flag mid">${esc(v)}</span>` : esc(String(v))}</td>`;
}
function table(d) {
  if (!d.rows.length) return `<div class="d-empty"><b>Nothing to show for this board and date range.</b></div>`;
  return `<div class="table-wrap"><table class="r-table"><thead><tr>${d.cols.map((c) => `<th${c[2] === "num" || c[2] === "pct" ? ' class="r-num"' : ""}>${esc(c[1])}</th>`).join("")}</tr></thead><tbody>
    ${d.rows.map((row) => `<tr>${d.cols.map((c, i) => i === 0 && d.link && d.link(row) ? cell(row[c[0]], c[2]).replace(/^<td([^>]*)>([\s\S]*)<\/td>$/, (m, at, inner) => `<td${at}><a href="${d.link(row)}"><b>${inner}</b></a></td>`) : cell(row[c[0]], c[2])).join("")}</tr>`).join("")}</tbody></table></div>`;
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
  const tr = (s) => new Date(s.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) + (s.ends_at ? `–${new Date(s.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}` : "");
  return `<div class="ws">${days.size ? [...days.entries()].map(([k, list]) => `<section class="ws-day"><h2>${esc(dl(k))}</h2>
    ${list.map((s) => `<div class="ws-s"><div class="ws-h"><b>${esc(tr(s))} · ${esc(s.session)}</b><span>${esc(s.board)}${s.location ? ` · ${esc(s.location)}` : ""}${s.board_type === "rsvp" ? "" : ` · ${s.claimed}/${s.capacity}`}</span></div>
      ${s.qLabel ? `<p class="ws-q">Question: <b>${esc(s.qLabel)}</b></p>` : ""}
      <ol class="ws-ppl">${s.people.filter((p) => p.status === "confirmed").map((p) => `<li><span class="ws-box"></span>${esc(p.first_name)} ${esc(p.last_name || "")}${p.team ? ` <small>${esc(p.team)}</small>` : ""}${p.note && s.showNotes ? ` <i>“${esc(p.note)}”</i>` : ""}</li>`).join("")}
        ${Array.from({ length: o.blanks ?? 3 }, () => `<li class="ws-blank"><span class="ws-box"></span></li>`).join("")}</ol>
      ${o.wl !== false && s.people.some((p) => p.status === "waitlisted") ? `<p class="fine">Waitlist: ${esc(s.people.filter((p) => p.status === "waitlisted").map((p) => `${p.first_name} ${p.last_name || ""}`.trim()).join(", "))}</p>` : ""}</div>`).join("")}</section>`).join("")
    : `<div class="d-empty"><b>No sessions that week.</b></div>`}</div>`;
}

// ---------- small SVG charts (no library): labels, tooltips, and readable in print and PDF ----------
const CH = { navy: "#0B1930", lime: "#8DDC32", gray: "#D9E0EA", text: "#5B6B82" };
function barChart(data, { unit = "", two = false, line = false, max = null, h = 180 } = {}) {
  if (!data.length) return `<p class="ch-empty">Nothing in this range yet.</p>`;
  const W = 640, H = h, L = 34, B = 34, T = 10, cw = (W - L - 8) / data.length, top = max || Math.max(1, ...data.map((d) => (d.value || 0) + (two ? d.value2 || 0 : 0)));
  const y = (v) => T + (H - T - B) * (1 - v / top), tick = [0, 0.5, 1].map((f) => Math.round(top * f));
  const bars = data.map((d, i) => { const x = L + i * cw + cw * 0.18, w = cw * 0.64, v = d.value || 0, v2 = two ? d.value2 || 0 : 0, tip = `${d.label}: ${v}${unit}${two ? ` taken · ${v2} open` : ""}`;
    const lab = `<text x="${L + i * cw + cw / 2}" y="${H - B + 14}" text-anchor="middle" class="ch-x">${esc(String(d.label).length > 12 ? String(d.label).slice(0, 11) + "…" : d.label)}</text>`;
    if (line) return lab;
    return `<g><title>${esc(tip)}</title><rect x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, y(0) - y(v))}" rx="3" fill="${CH.navy}"/>${two ? `<rect x="${x}" y="${y(v + v2)}" width="${w}" height="${Math.max(0, y(v) - y(v + v2))}" rx="3" fill="${CH.gray}"/>` : ""}${lab}</g>`; }).join("");
  const path = line ? `<polyline fill="none" stroke="${CH.lime}" stroke-width="3" points="${data.map((d, i) => `${L + i * cw + cw / 2},${y(d.value || 0)}`).join(" ")}"/>${data.map((d, i) => `<g><title>${esc(`${d.label}: ${d.value}${unit}`)}</title><circle cx="${L + i * cw + cw / 2}" cy="${y(d.value || 0)}" r="4.5" fill="${CH.navy}"/></g>`).join("")}` : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="chart">${tick.map((t) => `<line x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="#EEF1F5"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="ch-y">${t}${unit}</text>`).join("")}${bars}${path}</svg>`;
}
function hBars(data, { unit = "%", max = 100 } = {}) {
  if (!data.length) return `<p class="ch-empty">Nothing to compare yet.</p>`;
  return `<div class="hb">${data.map((d) => `<div class="hb-row" title="${esc(`${d.label}: ${d.value ?? "—"}${unit}`)}"><span class="hb-l">${esc(d.label)}</span><span class="hb-bar"><i style="width:${Math.min(100, ((d.value || 0) / max) * 100)}%"></i></span><b>${d.value ?? "—"}${unit}</b></div>`).join("")}</div>`;
}
const STATUS = (taken, cap) => { if (!cap) return ["No limit", ""]; const p = taken / cap; return p > 1 ? ["Over capacity", "over"] : p >= 1 ? ["Full", "full"] : p >= 0.9 ? ["Nearly full", "near"] : p >= 0.5 ? ["Healthy", "ok"] : ["Low", "low"]; };

function reportPage({ user, flash, admin, boards, board, several = null, qd = "", QD = {}, r, data, from, to, team, teams, required, week, opts = {}, filterText = "" }) {
  const o = opts, DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const X = o.assess;
  const PAIR = ["assessImprove", "assessAttend", "assessTeams"].includes(r);
  const sIds = board ? String(board.id) : several ? several.map((b) => b.id).join(",") : "all";
  const state = { as: X && X.test ? X.test.id : "", da: X && PAIR ? X.a || "" : "", db: X && PAIR ? X.b || "" : "", how: X && X.how === "avg" ? "avg" : "",
    qd: qd || "", dsel: X && !PAIR && X.dsel !== "all" ? X.dsel : "", drill: X && X.drill ? X.drill : "", top: X && r === "assessLeaders" && X.top !== 10 ? String(X.top) : "", bf: X && X.bornFrom || "", bt: X && X.bornTo || "", s: sIds, team, from: qd ? "" : from, to: qd ? "" : to, r, week: r === "week" ? week : "", level: o.level ? o.level.id : "", loc: o.location || "", days: (o.days || []).join(","), q: o.q || "", wl: r === "week" && o.wl === false ? "0" : "", blanks: r === "week" && o.blanks !== 3 ? o.blanks : "" };
  const url = (x) => { const p = new URLSearchParams(Object.fromEntries(Object.entries({ ...state, ...x }).filter(([, v]) => v !== "" && v != null))); return `/reports?${p}`; };
  const head = `<section class="bh2 r-hd"><div class="bh2-l"><span class="bh2-tile dash-tile">${ICON}</span><div><div class="bh2-t"><h1>Reports</h1></div>
      <span class="bh2-meta">${esc(TITLES[r] || "")} · ${esc(filterText)}</span></div></div></section>`;
  const chosen = new Set(board ? [board.id] : several ? several.map((b) => b.id) : []);
  const boardLabel = board ? board.name : several ? `${several.length} boards` : "All boards";
  const bar = `<nav class="bh2-tabs dash-tabs r-gbar"><form method="get" action="/reports" class="r-pick" id="rf"><input type="hidden" name="r" value="${esc(r)}">
      <details class="r-boards"><summary class="sb-btn"><span class="r-pick-l">Boards</span> ${esc(boardLabel)} ▾</summary><div class="r-boards-list">
        <label class="radio-row"><input type="checkbox" name="s" value="all"${chosen.size ? "" : " checked"} onchange="if (this.checked) this.form.querySelectorAll('input[name=s]:not([value=all])').forEach(function (c) { c.checked = false; })"> All boards</label>
        ${boards.map((b) => `<label class="radio-row"><input type="checkbox" name="s" value="${b.id}"${chosen.has(b.id) ? " checked" : ""} onchange="if (this.checked) this.form.querySelector('input[name=s][value=all]').checked = false"> ${esc(b.name)}${b.archived_at ? ' <span class="fine">(archived)</span>' : ""}</label>`).join("")}
        <button class="btn-small" type="submit">Show</button></div></details>
      ${r === "week" ? `<label class="r-d">Week of<input type="date" name="week" value="${esc(week)}" onchange="this.form.submit()"></label>`
        : X ? "" : `<span class="r-qd">${Object.entries(QD).map(([k, l]) => `<a href="${url({ qd: k, from: "", to: "" })}"${qd === k ? ' class="on" aria-current="true"' : ""}>${l}</a>`).join("")}<a href="${url({ qd: "" })}"${qd ? "" : ' class="on"'} onclick="var d = document.getElementById('rqc'); if (d) { d.hidden = !d.hidden; return false; }">Custom</a></span>
          <span class="r-custom" id="rqc"${qd ? " hidden" : ""}><label class="r-d">From<input type="date" name="from" value="${esc(from)}"></label><label class="r-d">To<input type="date" name="to" value="${esc(to)}"></label><button class="sb-btn" type="submit">Apply</button></span>`}</form>
      <span class="r-dl">${data.cols || r === "week" || r === "overview" ? `<a class="sb-btn" href="${url({ pdf: "1" })}">${DL}PDF</a>` : ""}${data.cols ? `<a class="sb-btn" href="${url({ csv: "1" })}">${DL}CSV</a>` : ""}${r === "week" || r === "overview" ? `<button type="button" class="sb-btn" onclick="window.print()">Print</button>` : ""}</span></nav>`;
  const dayOpt = (sel) => (X.days || []).map((d) => `<option value="${d.id}"${d.id === sel ? " selected" : ""}>${esc(d.kind)} · ${esc(new Date(String(d.day.toISOString ? d.day.toISOString() : d.day).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}${d.board ? ` · ${esc(d.board)}` : ""}</option>`).join("");
  const strip = `${X ? `<div class="r-filters r-assess">${X.tests.length ? `<label class="r-f">Assessment<select name="as" form="rf" onchange="document.querySelectorAll('[name=da],[name=db]').forEach(function (e) { e.disabled = true; }); this.form.submit()">${X.tests.map((t) => `<option value="${t.id}"${X.test && X.test.id === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
      ${PAIR ? `<label class="r-f">From<select name="da" form="rf" onchange="this.form.submit()">${dayOpt(X.a)}</select></label><label class="r-f">To<select name="db" form="rf" onchange="this.form.submit()">${dayOpt(X.b)}</select></label>`
        : `<label class="r-f">Testing day<select name="dsel" form="rf" onchange="this.form.submit()"><option value="all">All days</option>${[...new Set((X.days || []).map((d) => d.kind))].map((k) => `<option value="k:${esc(k)}"${X.dsel === "k:" + k ? " selected" : ""}>All ${esc(k)} days</option>`).join("")}${dayOpt(Number(X.dsel)).replace(/value="(\d+)"/g, 'value="$1"')}</select></label>`}
      <label class="r-f">Drill<select name="drill" form="rf" onchange="this.form.submit()"><option value="">All drills</option>${(X.drills || []).map((d) => `<option value="${d.id}"${X.drill === d.id ? " selected" : ""}>${esc(d.name)}${d.retired_at ? " (retired)" : ""}</option>`).join("")}</select></label>
      <label class="r-f">Count<select name="how" form="rf" onchange="this.form.submit()"><option value="best">Best try</option><option value="avg"${X.how === "avg" ? " selected" : ""}>Average of tries</option></select></label>` : `<span class="fine">No assessments yet: App Settings → People → Assessments.</span>`}
      ${X.tests.length && r === "assessLeaders" ? `<label class="r-f">Top<select name="top" form="rf" onchange="this.form.submit()">${[[5, "5"], [10, "10"], [25, "25"], [0, "Everyone"]].map(([v, l]) => `<option value="${v}"${X.top === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
      ${X.tests.length ? `<label class="r-f r-born">Born<input name="bf" form="rf" inputmode="numeric" maxlength="4" placeholder="from" value="${esc(X.bornFrom || "")}" onchange="this.form.submit()">–<input name="bt" form="rf" inputmode="numeric" maxlength="4" placeholder="to" value="${esc(X.bornTo || "")}" onchange="this.form.submit()"></label>` : ""}</div>` : ""}<div class="r-filters">
      ${X ? "" : board && (o.levels || []).length ? `<label class="r-f">Level<select name="level" form="rf" onchange="this.form.submit()"><option value="">All levels</option>${o.levels.map((n) => `<option value="${n.id}"${o.level && o.level.id === n.id ? " selected" : ""}>${"\u00a0\u00a0".repeat(n.d)}${esc(n.path)}</option>`).join("")}</select></label>` : board ? "" : `<span class="fine r-f">Pick one board to filter by level</span>`}
      ${teams.length ? `<label class="r-f">Team<select name="team" form="rf" onchange="this.form.submit()"><option value="">All teams</option>${teams.map((t) => `<option${t === team ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>` : ""}
      ${!X && (o.locations || []).length > 1 ? `<label class="r-f">Location<select name="loc" form="rf" onchange="this.form.submit()"><option value="">All locations</option>${o.locations.map((l) => `<option${l === o.location ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` : ""}
      ${X ? "" : `<span class="r-f r-days" role="group" aria-label="Days">${DAYS.map((d, i) => `<label class="r-day"><input type="checkbox" name="d" value="${i}" form="rf"${(o.days || []).includes(i) ? " checked" : ""} onchange="this.form.submit()"><span>${d}</span></label>`).join("")}</span>`}
      <label class="r-f r-q"><input type="search" name="q" form="rf" value="${esc(o.q || "")}" placeholder="Search names, sessions, notes, emails…" aria-label="Search"></label>
      ${r === "week" ? `<label class="r-f">Waitlist<select name="wl" form="rf" onchange="this.form.submit()"><option value="1">Show</option><option value="0"${o.wl === false ? " selected" : ""}>Hide</option></select></label>
        <label class="r-f">Blank lines<select name="blanks" form="rf" onchange="this.form.submit()">${[0, 1, 2, 3, 4, 6].map((n) => `<option${n === o.blanks ? " selected" : ""}>${n}</option>`).join("")}</select></label>` : ""}
    </div>
    ${(() => { const on = [X && X.drill && ["drill", `Drill: ${((X.drills || []).find((d) => d.id === X.drill) || {}).name || ""}`], X && (X.bornFrom || X.bornTo) && ["bf", `Born: ${X.bornFrom || "…"}–${X.bornTo || "…"}`], X && !PAIR && X.dsel !== "all" && ["dsel", `Day: ${X.dsel.startsWith("k:") ? `All ${X.dsel.slice(2)} days` : (((X.days || []).find((d) => String(d.id) === X.dsel)) || {}).kind || ""}`], o.level && ["level", `Level: ${o.level.path}`], team && ["team", `Team: ${team}`], o.location && ["loc", `Location: ${o.location}`], (o.days || []).length && ["days", `Days: ${o.days.map((d) => DAYS[d]).join(", ")}`], o.q && ["q", `Search: “${o.q}”`]].filter(Boolean);
      return on.length ? `<div class="r-on">${on.map(([k, l]) => `<a class="r-chip" href="${url(k === "bf" ? { bf: "", bt: "" } : { [k]: "" })}" title="Remove this filter">${esc(l)} <span aria-hidden="true">✕</span></a>`).join("")}<a class="link-dark" href="${url({ level: "", team: "", loc: "", days: "", q: "", drill: "", bf: "", bt: "", dsel: "" })}">Clear all</a></div>` : ""; })()}`;
  let body;
  if (r === "overview") {
    const D = data, fmt = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const KIND = { over: "Over capacity", waitopen: "Open spots, people waiting", unrecorded: "Attendance not recorded", vol: "Volunteer coverage", low: "Low enrollment", near: "Nearly full", noshows: "Repeated no-shows" };
    const types = [...new Set(D.attention.map((a) => a.kind))];
    const attn = D.attention.length ? `<div class="na-f" role="group" aria-label="Show"><button type="button" class="on" data-na="">All (${D.attention.length})</button>${types.map((k) => `<button type="button" data-na="${k}">${esc(KIND[k])} (${D.attention.filter((a) => a.kind === k).length})</button>`).join("")}</div>
      <ul class="na">${D.attention.map((a) => { const href = a.athlete_id ? (admin ? `/admin/people/${a.athlete_id}` : url({ r: "noshows", q: a.session })) : a.kind === "unrecorded" ? `/checkin/i/${a.item_id}` : admin ? `/admin/b/${a.board_id}/items/${a.item_id}/people` : url({ r: "fill" });
        return `<li data-k="${a.kind}"><span class="na-sev s${a.sev}" aria-label="${a.sev === 3 ? "High" : a.sev === 2 ? "Medium" : "Low"} priority">${a.sev === 3 ? "High" : a.sev === 2 ? "Medium" : "Low"}</span><a href="${href}"><b>${esc(a.issue)}</b><span>${esc([a.session, a.board].filter(Boolean).join(" · "))}</span></a><span class="na-w">${esc(fmt(a.when))}</span><span class="na-c">${esc(a.count)}</span></li>`; }).join("")}</ul>`
      : `<p class="na-none">✓ Nothing needs attention for these filters.</p>`;
    body = `<div class="kpis">${D.kpis.map(([k, label, v, unit, sub, link]) => `<a class="kpi" href="${url(link)}"><span class="kpi-l">${esc(label)}</span><b>${v == null ? "—" : `${v}${unit}`}</b><span class="fine">${esc(sub)}</span></a>`).join("")}</div>
      <section class="db-card db-attn"><h3>Needs attention</h3>${attn}<p class="fine">Low-enrollment and nearly-full alerts use each board's own thresholds (Board → Notifications → Needs attention); boards without them only show the other alerts.</p></section>
      <div class="db-grid">
        <section class="db-card"><h3>Claims over time <span class="fine">by week claimed</span></h3>${barChart(D.claimsOverTime)}</section>
        <section class="db-card"><h3>Session capacity <span class="fine">upcoming · <i class="lg navy"></i> taken <i class="lg gray"></i> open</span></h3>${barChart(D.capacity, { two: true })}</section>
        <section class="db-card"><h3>Attendance trend <span class="fine">% attended, by week</span></h3>${barChart(D.attendanceTrend, { unit: "%", line: true, max: 100 })}</section>
        <section class="db-card"><h3>Participation by team <span class="fine">people with a claim</span></h3>${barChart(D.teams)}</section>
      </div>
      <div class="db-grid">
        <section class="db-card"><h3>Upcoming sessions</h3>${D.upcoming.length ? `<ul class="up">${D.upcoming.map((s) => { const [st, cls] = STATUS(s.taken, s.capacity);
          return `<li><span class="up-w">${esc(fmt(s.starts_at))}</span><span class="up-n"><b>${esc(s.session)}</b><span class="fine">${esc(s.board)}${s.location ? ` · ${esc(s.location)}` : ""}</span></span>
            <span class="up-c"><span class="cap"><i class="${cls}" style="width:${s.capacity ? Math.min(100, (s.taken / s.capacity) * 100) : 0}%"></i></span><span class="fine">${s.taken}${s.capacity ? ` / ${s.capacity}` : ""} · <b class="st-${cls}">${st}</b>${s.waitlisted ? ` · ${s.waitlisted} waiting` : ""}</span></span></li>`; }).join("")}</ul><a class="link-dark" href="${url({ r: "fill" })}">All sessions →</a>` : `<p class="ch-empty">No upcoming sessions in this range.</p>`}</section>
        ${D.utilization.length ? `<section class="db-card"><h3>Board utilization <span class="fine">upcoming spots taken</span></h3>${hBars(D.utilization)}</section>` : ""}
      </div>
      <script>document.querySelectorAll(".na-f button").forEach(function (b) { b.addEventListener("click", function () { document.querySelectorAll(".na-f button").forEach(function (x) { x.classList.toggle("on", x === b); });
        document.querySelectorAll(".na li").forEach(function (li) { li.hidden = !!b.dataset.na && li.dataset.k !== b.dataset.na; }); }); });</script>`;
  }
  else if (r === "week") body = weekSheet(data, o);
  else body = `${r === "volunteer" && admin ? `<form method="post" action="${url({}).replace("/reports?", "/reports/volunteer-required?")}" class="r-req"><label>Hours each family needs <input type="number" name="hours" min="0" max="500" step="0.5" value="${required || ""}" placeholder="none"></label><button class="sb-btn" type="submit">Save</button><span class="fine">Leave empty for no requirement.</span></form>` : ""}
    ${data.note ? `<p class="fine r-note2">${esc(data.note)}</p>` : ""}${data.grid ? grid(data) : table(data)}`;
  return layout({ title: `Reports · ${TITLES[r] || ""}`, user, flash, admin, tab: "reports", dash: true,
    body: `<div class="d-wrap r-wrap${r === "week" ? " r-print" : ""}">${head}${bar}${reportNav(r, url, true, admin)}<div class="sub-body r-sheet">${strip}<section class="d-card r-card">${body}</section></div></div>` });
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
module.exports = { reportsPage, reportPage, GROUPS, TITLES };
