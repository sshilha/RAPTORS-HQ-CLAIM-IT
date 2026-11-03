const { esc } = require("./layout");
const { page } = require("./admin");
const { fmtDateTime } = require("../time");
const { niceRange } = require("./rounds");

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const seasonPill = (s) => s.completed_at ? `<span class="pill">Completed</span>` : `<span class="pill ok">Open</span>`;
const roundPill = (r) => r.published_at ? `<span class="pill ok">Published</span>` : `<span class="pill wait">Draft</span>`;

const seasonsPage = ({ user, flash, seasons, unassigned }) => page({
  title: "Seasons", tab: "seasons", user, flash,
  body: `<section class="panel">
    <h1>Seasons</h1>
    ${seasons.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Season</th><th>Dates</th><th>Rounds</th><th>Sessions</th><th>Spots claimed</th><th>Status</th></tr></thead>
      <tbody>${seasons.map((s) => `<tr>
        <td><a href="/admin/seasons/${s.id}">${esc(s.name)}</a></td><td>${esc(niceRange(s.starts_on, s.ends_on))}</td>
        <td>${s.rounds}</td><td>${s.sessions}</td><td>${s.reserved}</td><td>${seasonPill(s)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No seasons yet. Create your first one below.</p>`}
    ${unassigned ? `<p class="rule">${unassigned} round${unassigned === 1 ? " isn't" : "s aren't"} in a season yet. Open a season and add ${unassigned === 1 ? "it" : "them"} from the season's page.</p>` : ""}
  </section>
  <section class="panel">
    <h2>Open a new season</h2>
    <form method="post" action="/admin/seasons" class="grid-form">
      <div><label>Name<input name="name" required placeholder="Winter Training 2026–27"></label></div>
      <div class="pair"><div><label>First day<input type="date" name="starts_on" required></label></div>
        <div><label>Last day<input type="date" name="ends_on" required></label></div></div>
      <div class="full"><label>Start from
        <select name="copy_from"><option value="">Empty (add rounds or import the vendor schedule)</option>
          ${seasons.map((s) => `<option value="${s.id}">A copy of ${esc(s.name)}</option>`).join("")}</select></label>
        <span class="fine">A copy brings over every round, time, session, spots, and the schedule, shifted by the gap between the two first days. Start on the same weekday to keep sessions on the same days. Copied rounds start as drafts.</span></div>
      <div class="full"><button class="btn" type="submit">Open season</button></div>
    </form>
  </section>`,
});

const seasonPage = ({ user, flash, season: s, rounds, unassigned }) => page({
  title: s.name, tab: "seasons", user, flash, readonly: !!s.completed_at,
  body: `<a class="back" href="/admin/seasons">All seasons</a>
  <section class="panel">
    <div class="athlete-head">
      <div><h1>${esc(s.name)}</h1><p class="muted tight">${esc(niceRange(s.starts_on, s.ends_on))}. ${pl(s.rounds, "round")}, ${pl(s.sessions, "session")}, ${pl(s.reserved, "spot")} claimed.</p></div>
      <div class="head-actions">${seasonPill(s)}
        <a class="btn-ghost" href="/admin/reports?season=${s.id}">Reports</a>
        ${s.completed_at
          ? `<form method="post" action="/admin/seasons/${s.id}/reopen" class="keep" onsubmit="return confirm('Reopen ${esc(s.name)}? It becomes editable, and rounds that were published become visible to people again.')"><button class="btn-ghost" type="submit">Reopen season</button></form>`
          : `<form method="post" action="/admin/seasons/${s.id}/complete" onsubmit="return confirm('Complete ${esc(s.name)}? People will no longer see it, and it becomes read-only. Reports stay available.')"><button class="btn-small" type="submit">Complete season</button></form>`}
      </div>
    </div>
    ${s.completed_at ? `<p class="rule">Completed ${esc(fmtDateTime(s.completed_at))}. This season is read-only and only visible here in Admin.</p>` : ""}
  </section>

  <section class="panel">
    <h2>Rounds</h2>
    ${rounds.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Round</th><th>Dates</th><th>Sessions</th><th>Spots claimed</th><th>Status</th></tr></thead>
      <tbody>${rounds.map((r) => `<tr><td><a href="/admin/rounds/${r.id}">${esc(r.name)}</a></td>
        <td>${esc(niceRange(r.starts_on, r.ends_on))}</td><td>${r.sessions}</td><td>${r.reserved}</td><td>${roundPill(r)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No rounds yet. <a href="/admin/rounds?season=${s.id}">Create a round</a> or <a href="/admin/import">import the vendor schedule</a> into this season.</p>`}
    ${!s.completed_at && unassigned.length ? `<form method="post" action="/admin/seasons/${s.id}/attach" class="attach">
      <p class="label-like">Rounds not in a season yet</p>
      ${unassigned.map((r) => `<label class="check"><input type="checkbox" name="round" value="${r.id}"> ${esc(r.name)} (${esc(niceRange(r.starts_on, r.ends_on))})</label>`).join("")}
      <button class="btn-ghost" type="submit">Add to this season</button></form>` : ""}
  </section>

  ${s.completed_at ? "" : `<section class="panel">
    <h2>Season settings</h2>
    <form method="post" action="/admin/seasons/${s.id}" class="grid-form">
      <div><label>Name<input name="name" required value="${esc(s.name)}"></label></div>
      <div class="pair"><div><label>First day<input type="date" name="starts_on" required value="${esc(s.starts_on)}"></label></div>
        <div><label>Last day<input type="date" name="ends_on" required value="${esc(s.ends_on)}"></label></div></div>
      <div class="full"><button class="btn" type="submit">Save season</button></div>
    </form>
    <form method="post" action="/admin/seasons/${s.id}/delete" class="inline-end" onsubmit="return confirm('Delete ${esc(s.name)}?')">
      <button class="btn-ghost danger" type="submit">Delete season</button><span class="fine">Only possible when it has no rounds.</span></form>
  </section>`}`,
});

module.exports = { seasonsPage, seasonPage };
