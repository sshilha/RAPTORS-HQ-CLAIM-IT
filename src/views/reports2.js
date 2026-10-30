const { esc, layout } = require("./layout");
const { slotName } = require("../time");

function reportsPage({ user, flash, admin, boards, board, rows, people, teams, teamFilter, view, limitedTo }) {
  const url = (o) => { const p = new URLSearchParams(Object.fromEntries(Object.entries({ s: board.id, team: teamFilter, v: view === "all" ? "all" : "", ...o }).filter(([, x]) => x))); return `/reports?${p}`; };
  const att = (r) => r.attended == null ? `<span class="fine">—</span>` : r.attended ? `<span class="r-yes">✓ Here</span>` : `<span class="r-no">✗ No-show</span>`;
  const anyAttendance = rows.some((r) => r.attended != null);
  return layout({ title: `Reports · ${board.name}`, user, flash, admin, tab: "reports", dash: true,
    body: `<div class="d-wrap r-wrap">
    <div class="r-top"><h1>Reports</h1>
      <form method="get" action="/reports" class="r-pick"><select name="s" onchange="this.form.submit()" aria-label="Board">${boards.map((b) => `<option value="${b.id}"${b.id === board.id ? " selected" : ""}>${esc(b.name)}${b.archived_at ? " (archived)" : ""}</option>`).join("")}</select>
        ${teams.length > 1 || teamFilter ? `<select name="team" onchange="this.form.submit()" aria-label="Team"><option value="">All ${limitedTo.length ? "my " : ""}teams</option>${teams.map((t) => `<option${t === teamFilter ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
        ${view === "all" ? `<input type="hidden" name="v" value="all">` : ""}</form>
      <a class="d-btn" href="${url({ csv: "1" })}">Download CSV</a></div>
    ${limitedTo.length ? `<p class="fine">You can see ${esc(limitedTo.join(", "))} on this board.</p>` : ""}
    ${anyAttendance ? "" : `<p class="r-note">Attendance shows here once check-in is used for this board. Until then, the Attended column shows “—”.</p>`}
    <nav class="r-tabs"><a href="${url({ v: "" })}"${view === "person" ? ' aria-current="true"' : ""}>By person <i>${people.length}</i></a><a href="${url({ v: "all" })}"${view === "all" ? ' aria-current="true"' : ""}>All claims <i>${rows.length}</i></a></nav>
    <section class="d-card r-card">${view === "person"
      ? (people.length ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>Name</th><th>Team</th><th>Claimed</th><th>Waitlisted</th><th>Attended</th><th>No-shows</th><th>Last one</th></tr></thead><tbody>
          ${people.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.team || "")}</td><td>${p.claimed}</td><td>${p.waitlisted || ""}</td><td>${anyAttendance ? p.attended : "—"}</td><td>${anyAttendance ? p.missed || "" : "—"}</td><td class="fine">${p.last ? esc(new Date(p.last).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" })) : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="d-empty"><b>No claims yet.</b></div>`)
      : (rows.length ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>Name</th><th>Team</th><th>Where</th><th>When</th><th>Status</th><th>Attended</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td><b>${esc(r.first_name)} ${esc(r.last_name)}</b>${r.note ? `<div class="fine">${esc(r.note)}</div>` : ""}</td><td>${esc(r.group_name || "")}</td><td>${esc(r.path || "")}</td>
            <td>${esc(slotName(r))}</td><td>${r.status === "waitlisted" ? `<span class="d-pill wl">Waitlist</span>` : "Claimed"}${r.counts === false ? ` <span class="fine">(extra)</span>` : ""}</td><td>${att(r)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="d-empty"><b>No claims yet.</b></div>`)}
    </section></div>` });
}
module.exports = { reportsPage };
