const { esc, layout } = require("./layout");
const { slotName, fmtDateTime } = require("../time");


// the report tabs (shared by every report, including By person / All claims)
const GROUPS = [["overview", "Overview", [["overview", ""]]], ["claims", "Claims", [["person", "By person"], ["all", "All claims"]]],
  ["attendance", "Attendance", [["attendance", "Athletes"], ["noshows", "No-shows"], ["unchecked", "Check-ins not done"]]],
  ["sessions", "Sessions", [["fill", "Fill"], ["busiest", "Busiest times"], ["waitlists", "Waitlists"], ["locations", "Locations"]]],
  ["rsvp", "RSVP", [["rsvp", "Events"], ["rsvpAthletes", "Athletes"]]], ["families", "Families", [["engagement", "Engagement"], ["notSignedUp", "Not signed up"], ["volunteer", "Volunteer hours"]]],
  ["emails", "Emails", [["emails", ""]]], ["week", "Week sheet", [["week", ""]]]];
function reportNav(key, url, full = true) {
  const g = GROUPS.find((x) => x[2].some(([k]) => k === key)) || GROUPS[0];
  const go = (k) => (k === "person" || k === "all" ? url({ r: "", v: k === "all" ? "all" : "person" }) : url({ r: k, v: "" }));
  const groups = full ? GROUPS : GROUPS.filter((x) => x[0] === "claims");
  return `<nav class="sub-tabs r-subs">${groups.map(([id, label, subs]) => `<a href="${go(subs[0][0])}"${id === g[0] ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    ${g[2].length > 1 ? `<nav class="r-chips" aria-label="${esc(g[1])} reports">${g[2].map(([k, l]) => `<a href="${go(k)}"${k === key ? ' class="on" aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</nav>` : ""}`;
}
const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/></svg>`;
const DL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="15" height="15"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`;
const TITLES = { overview: "Overview", attendance: "Attendance by athlete", noshows: "No-shows", unchecked: "Check-ins not done", fill: "Session fill", busiest: "Busiest times", waitlists: "Waitlists",
  locations: "Locations", rsvp: "RSVP by event", rsvpAthletes: "RSVP by athlete", engagement: "Family engagement", notSignedUp: "On the list, not signed up", volunteer: "Volunteer hours by family", emails: "Email problems", week: "Week sheet" };
function cell(v, kind) {
  if (v == null || v === "") return `<td class="fine" data-sort="">—</td>`;
  if (kind === "pct") return `<td data-sort="${v}"><span class="r-pct"><b>${v}%</b><i style="width:${Math.min(100, v)}%"></i></span></td>`;
  if (kind === "num") return `<td class="r-num" data-sort="${v}">${esc(String(v))}</td>`;
  if (kind === "date" || kind === "dt") { const d = new Date(v); return `<td class="fine" data-sort="${d.toISOString()}">${esc(kind === "dt" ? fmtDateTime(d) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }))}</td>`; }
  return `<td>${/^(Repeat|Repeat no-shows|Behind|Never signed in|No account|Never)$/.test(String(v)) ? `<span class="r-flag bad">${esc(v)}</span>` : /^(Done|Active)$/.test(String(v)) ? `<span class="r-flag ok">${esc(v)}</span>` : /^(Close|Signed in, no claims)$/.test(String(v)) ? `<span class="r-flag mid">${esc(v)}</span>` : esc(String(v))}</td>`;
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
function weekSheet(d) {
  const days = new Map(); for (const s of d.sessions) { const k = new Date(s.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
  const dl = (k) => new Date(k + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const tr = (s) => new Date(s.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) + (s.ends_at ? `–${new Date(s.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}` : "");
  return `<div class="ws">${days.size ? [...days.entries()].map(([k, list]) => `<section class="ws-day"><h2>${esc(dl(k))}</h2>
    ${list.map((s) => `<div class="ws-s"><div class="ws-h"><b>${esc(tr(s))} · ${esc(s.session)}</b><span>${esc(s.board)}${s.location ? ` · ${esc(s.location)}` : ""}${s.board_type === "rsvp" ? "" : ` · ${s.claimed}/${s.capacity}`}</span></div>
      <ol class="ws-ppl">${s.people.filter((p) => p.status === "confirmed").map((p) => `<li><span class="ws-box"></span>${esc(p.first_name)} ${esc(p.last_name || "")}${p.team ? ` <small>${esc(p.team)}</small>` : ""}${p.note ? ` <i>“${esc(p.note)}”</i>` : ""}</li>`).join("")}
        ${[1, 2, 3].map(() => `<li class="ws-blank"><span class="ws-box"></span></li>`).join("")}</ol>
      ${s.people.some((p) => p.status === "waitlisted") ? `<p class="fine">Waitlist: ${esc(s.people.filter((p) => p.status === "waitlisted").map((p) => `${p.first_name} ${p.last_name || ""}`.trim()).join(", "))}</p>` : ""}</div>`).join("")}</section>`).join("")
    : `<div class="d-empty"><b>No sessions that week.</b></div>`}</div>`;
}
function reportPage({ user, flash, admin, boards, board, r, data, from, to, team, teams, required, week }) {
  const url = (o) => { const p = new URLSearchParams(Object.fromEntries(Object.entries({ s: board ? board.id : "all", team, from, to, r, week: r === "week" ? week : "", ...o }).filter(([, x]) => x))); return `/reports?${p}`; };
  const head = `<section class="bh2 r-hd"><div class="bh2-l"><span class="bh2-tile dash-tile">${ICON}</span><div><div class="bh2-t"><h1>Reports</h1></div>
      <span class="bh2-meta">${esc(board ? board.name : "All boards")}${team ? ` · ${esc(team)}` : ""} · ${esc(TITLES[r] || "")}</span></div></div></section>`;
  const bar = `<nav class="bh2-tabs dash-tabs r-gbar"><form method="get" action="/reports" class="r-pick"><input type="hidden" name="r" value="${esc(r)}">
      <span class="r-pick-l">Board</span><select name="s" onchange="this.form.submit()" aria-label="Board"><option value="all"${board ? "" : " selected"}>All boards</option>${boards.map((b) => `<option value="${b.id}"${board && b.id === board.id ? " selected" : ""}>${esc(b.name)}${b.archived_at ? " (archived)" : ""}</option>`).join("")}</select>
      ${teams.length ? `<select name="team" onchange="this.form.submit()" aria-label="Team"><option value="">All teams</option>${teams.map((t) => `<option${t === team ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
      ${r === "week" ? `<label class="r-d">Week of<input type="date" name="week" value="${esc(week)}" onchange="this.form.submit()"></label>`
        : r === "busiest" || r === "overview" || true ? `<label class="r-d">From<input type="date" name="from" value="${esc(from)}"></label><label class="r-d">To<input type="date" name="to" value="${esc(to)}"></label><button class="sb-btn" type="submit">Apply</button>` : ""}</form>
      ${r === "week" ? `<button type="button" class="sb-btn" onclick="window.print()">Print</button>` : data.cols ? `<a class="sb-btn" href="${url({ csv: "1" })}">${DL}Download CSV</a>` : ""}</nav>`;
  let body;
  if (r === "overview") body = `<div class="r-tiles">${data.tiles.map(([k, label, v, unit, sub]) => `<a class="r-tile" href="${url({ r: k })}"><span class="r-tl">${esc(label)}</span><b>${v == null ? "—" : `${v}${unit}`}</b><span class="fine">${esc(sub)}</span></a>`).join("")}</div>
    <p class="fine r-foot">For ${esc(board ? board.name : "all boards")}, ${esc(from)} to ${esc(to)}. Click a number to see the report behind it.</p>`;
  else if (r === "week") body = weekSheet(data);
  else body = `${r === "volunteer" && admin ? `<form method="post" action="${url({}).replace("/reports?", "/reports/volunteer-required?")}" class="r-req"><label>Hours each family needs <input type="number" name="hours" min="0" max="500" step="0.5" value="${required || ""}" placeholder="none"></label><button class="sb-btn" type="submit">Save</button><span class="fine">Leave empty for no requirement.</span></form>` : ""}
    ${data.note ? `<p class="fine r-note2">${esc(data.note)}</p>` : ""}${data.grid ? grid(data) : table(data)}`;
  return layout({ title: `Reports · ${TITLES[r] || ""}`, user, flash, admin, tab: "reports", dash: true,
    body: `<div class="d-wrap r-wrap${r === "week" ? " r-print" : ""}">${head}${bar}${reportNav(r, url)}<div class="sub-body r-sheet"><section class="d-card r-card">${body}</section></div></div>` });
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
          ${people.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.team || "")}</td><td>${p.claimed}</td><td>${p.waitlisted || ""}</td><td>${anyAttendance ? p.attended : "—"}</td><td>${anyAttendance ? p.missed || "" : "—"}</td><td class="fine">${p.last ? esc(new Date(p.last).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" })) : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="d-empty"><b>No claims yet.</b></div>`)
      : (rows.length ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>Name</th><th>Team</th><th>Where</th><th>When</th><th>Status</th><th>Attended</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td><b>${esc(r.first_name)} ${esc(r.last_name)}</b>${r.note ? `<div class="fine">${esc(r.note)}</div>` : ""}</td><td>${esc(r.group_name || "")}</td><td>${esc(r.path || "")}</td>
            <td>${esc(slotName(r))}</td><td>${r.status === "waitlisted" ? `<span class="d-pill wl">Waitlist</span>` : r.walk_in ? "Walk-in" : r.added_by_admin ? "Added by admin" : "Claimed"}${r.override ? ` <span class="fine">(override)</span>` : r.counts === false && !r.walk_in ? ` <span class="fine">(extra)</span>` : ""}</td><td>${att(r)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="d-empty"><b>No claims yet.</b></div>`)}
    </section></div></div>` });
}
module.exports = { reportsPage, reportPage, GROUPS };
