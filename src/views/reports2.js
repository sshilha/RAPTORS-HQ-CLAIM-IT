const { esc, layout } = require("./layout");
const { slotName } = require("../time");

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
    <nav class="sub-tabs r-subs"><a href="${url({ v: "" })}"${view === "person" ? ' aria-current="page"' : ""}>By person <i class="sub-n">${people.length}</i></a><a href="${url({ v: "all" })}"${view === "all" ? ' aria-current="page"' : ""}>All claims <i class="sub-n">${rows.length}</i></a></nav>
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
module.exports = { reportsPage };
