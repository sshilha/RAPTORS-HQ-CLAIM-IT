// My Family: the Reports section for parents, guardians and athletes. Same header and look as the management reports.
const { esc, layout } = require("./layout");
const R = require("./reports2"), IC2 = R.IC2;
const TZ = "America/Chicago";
const when = (t) => new Date(t).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = (t) => new Date(t).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
const SECTIONS = [["fOverview", "Overview", IC2.home], ["fClaims", "My Claims", IC2.clip], ["fAttendance", "My Attendance", IC2.users], ["fProgress", "Assessments", IC2.bars], ["fSchedule", "My Schedule", IC2.cal]];
const tag = (s) => `<span class="fm-tag fm-${s.replace(/[^a-z]/gi, "").toLowerCase()}">${esc(s)}</span>`;

function familyPage({ user, flash, admin, people, sel, r, data, url, mgmt, boards = [], board = "", show = "", whenF = "", mode = "", month = "" }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const csvBtn = ["fClaims", "fAttendance", "fSchedule"].includes(r) ? `<a class="sb-btn" href="${url({ csv: "1" })}">⬇ CSV</a>` : "";
  const head = `<section class="bh2 r-bh"><div class="bh2-l"><span class="bh2-tile r-tile">${IC2.chart}</span>
      <div><div class="bh2-t"><h1>My Family</h1></div><span class="bh2-meta">Your athletes, sessions, attendance, and progress</span></div></div>
    <div class="bh2-acts">${csvBtn}${mgmt ? `<nav class="ra-views" aria-label="Reports view"><a href="/reports?view=mgmt">Management</a><a href="${url({})}" class="on" aria-current="page">My Family</a></nav>` : ""}</div></section>`;
  const sub = "";
  const tabs = `<nav class="bh2-tabs board-tabs r-cats" aria-label="My Family">${SECTIONS.map(([k, l, ic]) => `<a href="${url({ r: k, show: "", when: "", mode: "", m: "" })}"${k === r ? ' aria-current="page"' : ""}>${ic}${l}</a>`).join("")}</nav>`;
  // simple filters: athlete, program, and the section's own choice
  const pick = (name, label, opts, cur) => `<label class="tb-f"><span>${label}</span><span class="rf-sel"><select name="${name}" onchange="this.form.submit()">${opts.map(([v, l]) => `<option value="${esc(String(v))}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${IC2.down}</span></label>`;
  const hidden = (o) => Object.entries(o).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(String(v))}">`).join("");
  const filters = `<form method="get" action="/reports" class="rc-f fm-f">${hidden({ view: "family", r })}
      ${people.length > 1 ? pick("a", "Athlete", [["", "All my athletes"], ...people.map((p) => [p.id, p.you ? `${p.first_name} (you)` : p.first_name])], sel || "") : `<span class="fm-one">${esc(people[0] ? people[0].first_name : "")}</span>`}
      ${r !== "fProgress" && boards.length > 1 ? pick("b", "Program", [["", "All programs"], ...boards.map((b) => [b.id, b.name])], board) : hidden({ b: board })}
      ${r === "fClaims" ? pick("show", "Show", [["", "Upcoming & waitlisted"], ["past", "Past"], ["waitlisted", "Waitlisted"], ["released", "Released"], ["all", "All"]], show) : ""}
      ${r === "fSchedule" && !mode ? pick("when", "When", [["", "Upcoming"], ["past", "Past"]], whenF) : ""}
      ${r === "fSchedule" ? `<span class="fm-mode" role="group" aria-label="View"><a href="${url({ mode: "", m: "" })}"${mode ? "" : ' class="on" aria-current="true"'}>List</a><a href="${url({ mode: "cal", when: "" })}"${mode ? ' class="on" aria-current="true"' : ""}>Calendar</a></span>` : ""}</form>`;
  const csv = "";
  let body = "";
  const empty = (t, more = "") => `<div class="d-empty"><b>${t}</b>${more ? ` ${more}` : ""}</div>`;
  const card = (c, actions = true) => `<div class="fm-c"><div class="fm-cd"><b>${esc(when(c.starts_at))}</b>${tag(c.state)}${c.att ? tag(c.att) : ""}</div>
      <div class="fm-cs">${esc(c.session)}</div><div class="fine">${esc([people.length > 1 ? c.who : "", c.location, c.board].filter(Boolean).join(" · "))}${c.note ? ` · “${esc(c.note)}”` : ""}</div>
      ${actions && !c.past && c.board_type !== "rsvp" && c.status !== "canceled" ? `<form method="post" action="/claims/${c.id}/cancel" class="fm-act" onsubmit="return window.confirm('Release this ${c.status === "waitlisted" ? "waitlist spot" : "claim"}? The spot opens for someone else.')"><input type="hidden" name="back" value="${esc(url({}))}"><button class="rf-btn" type="submit">Release</button><a class="link-dark" href="/b/${c.board_id}${sel ? `?p=${sel}` : ""}#i${c.item_id}">Open on the board</a></form>` : ""}</div>`;
  if (!people.length) body = empty("No athletes are linked to your account yet.", "Ask the club to link your family, or request access from My Account.");
  else if (r === "fOverview") {
    const D = data;
    const kp = [["Upcoming sessions", D.upcoming.length, D.upcoming[0] ? `Next: ${when(D.upcoming[0].starts_at)}` : "Nothing upcoming", url({ r: "fSchedule" })],
      ["My claims", D.active, `${D.waitlisted} waitlisted`, url({ r: "fClaims" })],
      ["Attendance", D.att.rate == null ? "—" : `${D.att.rate}%`, D.att.rate == null ? (D.att.total ? "Not recorded yet" : "No past sessions yet") : `${D.att.here} attended`, url({ r: "fAttendance" })],
      ["Assessments", D.prog.length ? D.prog.filter((p) => p.tests > 1 && /^Improved/.test(p.summary)).length : "—", D.prog.length ? `drills improved · ${D.prog.length} results` : "No shared results yet", url({ r: "fProgress" })]];
    body = `<div class="kpis fm-k">${kp.map(([l, v, s, h]) => `<a class="kpi" href="${h}"><span class="kpi-l">${esc(l)}</span><b>${esc(String(v))}</b><span class="fine">${esc(s)}</span></a>`).join("")}</div>
      <div class="db-grid"><section class="db-card"><h3>Upcoming sessions <a class="link-dark db-all" href="${url({ r: "fSchedule" })}">My Schedule →</a></h3>${D.upcoming.length ? D.upcoming.slice(0, 5).map((c) => card(c, false)).join("") : `<p class="ch-empty">Nothing upcoming. <a href="/dashboard">Find sessions on Claim Boards →</a></p>`}</section>
        <section class="db-card"><h3>Recent activity</h3>${D.activity.length ? `<ul class="fm-act-l">${D.activity.map((x) => `<li><b>${esc(x.text)}</b><span class="fine">${esc(x.sub || "")} · ${esc(new Date(x.at).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" }))}</span></li>`).join("")}</ul>` : `<p class="ch-empty">Nothing in the last two weeks.</p>`}</section></div>`;
  } else if (r === "fClaims") {
    body = data.length ? `<div class="fm-list">${data.map((c) => card(c)).join("")}</div><p class="fine">Releasing follows each board's own rules and deadlines; if it's too late, the board will say so.</p>` : empty("No claims to show.", `<a href="/dashboard">Find sessions on Claim Boards →</a>`);
  } else if (r === "fAttendance") {
    const A = data;
    body = !A.total ? empty("No past sessions yet.") : `<div class="kpis fm-k">${[["Attended", A.here], ["No-shows", A.ns], ["Not recorded", A.nr], ["Attendance", A.rate == null ? "—" : `${A.rate}%`]].map(([l, v]) => `<div class="kpi"><span class="kpi-l">${l}</span><b>${v}</b></div>`).join("")}</div>
      <p class="fine">Attendance = attended ÷ (attended + no-shows). Sessions not recorded yet don't count either way.</p>
      <section class="db-card"><h3>By month</h3><div class="table-wrap"><table class="r-table" data-nosort data-nocards><thead><tr><th>Month</th><th class="num">Attended</th><th class="num">No-shows</th><th class="num">Not recorded</th><th class="num">Attendance</th></tr></thead><tbody>
        ${A.months.map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${m.here}</td><td class="num">${m.ns}</td><td class="num">${m.nr}</td><td class="num">${m.rate == null ? "—" : m.rate + "%"}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="db-card"><h3>Session history</h3><div class="fm-list">${A.history.map((c) => `<div class="fm-c fm-row"><span>${esc(when(c.starts_at))}</span><span>${esc(people.length > 1 ? c.who + " · " : "")}${esc(c.session)}</span>${tag(c.att)}</div>`).join("")}</div></section>`;
  } else if (r === "fProgress") {
    body = !data.length ? empty("No shared assessment results yet.", "Results appear here once the club shares a testing day with families.") :
      `<div class="db-grid">${data.map((p) => `<section class="db-card"><h3>${esc(p.drill)}${p.unit ? ` <span class="fine">(${esc(p.unit)})</span>` : ""}${p.pb ? ` <span class="pb">Personal best</span>` : ""}</h3>
        <p class="fine">${esc(people.length > 1 ? (byId.get(p.athlete_id) || {}).first_name + " · " : "")}${esc(p.assessment)} · ${p.better === "higher" ? "higher is better" : "lower is better"}</p>
        ${p.points.length > 1 ? R.barChart(p.points, { line: true }) : ""}
        <p class="pv-sum">${esc(p.summary)}</p><p class="fine">First ${p.first} · Latest ${p.latest} · Best ${p.best} · ${p.tests} test${p.tests === 1 ? "" : "s"}</p></section>`).join("")}</div>`;
  } else if (r === "fSchedule" && mode === "cal") {
    // a month grid; each session is a chip linking to its card below
    const [y, mo] = month.split("-").map(Number), first = new Date(Date.UTC(y, mo - 1, 1)), daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate(), lead = first.getUTCDay();
    const shift = (n) => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ }), byDay = new Map();
    for (const c of data) { const k = new Date(c.starts_at).toLocaleDateString("en-CA", { timeZone: TZ }); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(c); }
    const tm = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
    const chipCls = (c) => (c.status === "waitlisted" ? "wl" : c.past ? "past" : "up");
    const short = (c) => (c.session.split(" › ").slice(-2).join(" › "));
    const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
    while (cells.length % 7) cells.push(null);
    const title = new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    body = `<div class="cal-hd"><a class="rf-btn" href="${url({ m: shift(-1) })}" aria-label="Previous month">‹</a><h3>${esc(title)}</h3><a class="rf-btn" href="${url({ m: shift(1) })}" aria-label="Next month">›</a>
        <span class="cal-key"><i class="up"></i>Claimed <i class="wl"></i>Waitlisted <i class="past"></i>Past</span></div>
      <div class="cal" role="grid" aria-label="${esc(title)}">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-dow" role="columnheader">${d}</div>`).join("")}
        ${cells.map((k) => { if (!k) return `<div class="cal-d cal-x"></div>`; const list = byDay.get(k) || [];
          return `<div class="cal-d${k === today ? " today" : ""}${list.length ? " has" : ""}" role="gridcell">${list.length ? `<a class="cal-n" href="#d${k}">${Number(k.slice(8))}</a>` : `<span class="cal-n">${Number(k.slice(8))}</span>`}
            ${list.map((c) => `<a class="cal-c ${chipCls(c)}" href="#c${c.id}" title="${esc(`${when(c.starts_at)} · ${c.who} · ${c.session}${c.status === "waitlisted" ? " (waitlisted)" : ""}`)}"><b>${esc(tm(c.starts_at))}</b> ${esc(people.length > 1 ? c.who + " · " : "")}${esc(short(c))}</a>`).join("")}
            ${list.length ? `<span class="cal-dots">${list.map((c) => `<i class="${chipCls(c)}"></i>`).join("")}</span>` : ""}</div>`; }).join("")}</div>
      ${data.length ? [...byDay].sort().map(([k, list]) => `<section class="fm-day" id="d${k}"><h3>${esc(day(list[0].starts_at))}</h3>${list.map((c) => `<div id="c${c.id}">${card(c, false)}</div>`).join("")}</section>`).join("")
        : `<p class="ch-empty">Nothing this month. <a href="/dashboard">Find sessions on Claim Boards →</a></p>`}`;
  } else if (r === "fSchedule") {
    const days = new Map(); for (const c of data) { const k = new Date(c.starts_at).toLocaleDateString("en-CA", { timeZone: TZ }); if (!days.has(k)) days.set(k, []); days.get(k).push(c); }
    body = !data.length ? empty(whenF === "past" ? "No past sessions." : "Nothing upcoming.", `<a href="/dashboard">Find sessions on Claim Boards →</a>`) :
      `${[...days].map(([k, list]) => `<section class="fm-day"><h3>${esc(day(list[0].starts_at))}</h3>${list.map((c) => card(c, false)).join("")}</section>`).join("")}
       <p class="fine"><a class="link-dark" href="/dashboard">Find more sessions on Claim Boards →</a></p>`;
  }
  return layout({ title: "Reports · My Family", user, flash, admin, tab: "reports", dash: true,
    body: `<div class="d-wrap r-wrap ra-page rb2 fm-page">${head}${tabs}<div class="r-sheet2"><section class="d-card r-card fm-card">${people.length ? filters : ""}${body}</section></div></div>` });
}
module.exports = { familyPage, SECTIONS };
