const { esc } = require("./layout");
const { page } = require("./admin");
const { AGE_GROUPS, ACTIVITIES } = require("../config");

const opt = (val, label, cur) => `<option value="${esc(val)}"${String(cur) === String(val) ? " selected" : ""}>${esc(label)}</option>`;

function reportsPage({ user, f, reports, seasons, rounds, out, totals, schedules = [], L }) {
  const qs = new URLSearchParams(Object.entries({ report: f.report, season: f.season || "", round: f.round || "", from: f.from, to: f.to,
    activity: f.activity, age: f.age, status: f.status, zero: f.zero ? "1" : "" }).filter(([, x]) => x)).toString();
  return page({
    title: "Reports", tab: "reports", user, xwide: true,
    body: `<section class="panel no-print">
    <h1>Reports</h1>
    <form method="get" action="/admin/reports" class="report-form" id="rf">
      <div class="full"><fieldset class="checks"><legend>Report</legend>
        ${Object.entries(reports).map(([k, l]) => `<label class="radio-row"><input type="radio" name="report" value="${k}"${f.report === k ? " checked" : ""} onchange="this.form.submit()"> ${esc(l)}</label>`).join("")}
      </fieldset></div>
      ${schedules.length > 1 ? `<div><label>Schedule<select name="schedule">${opt("", "All schedules", f.schedule || "")}${schedules.map((x) => opt(x.id, x.name, f.schedule || "")).join("")}</select></label></div>` : ""}
      <div><label>${esc(L.top.one)}<select name="season" id="f-season">${opt("", `All ${L.top.many.toLowerCase()}`, f.season || "")}
        ${seasons.map((s) => opt(s.id, s.name + (s.completed_at ? " (completed)" : ""), f.season || "")).join("")}</select></label></div>
      <div><label>${esc(L.middle.one)}<select name="round" id="f-round">${opt("", `All ${L.middle.many.toLowerCase()}`, f.round || "")}
        ${rounds.map((r) => `<option value="${r.id}" data-season="${r.season_id || ""}"${f.round === r.id ? " selected" : ""}>${esc(r.name)}${r.season_name ? ` (${esc(r.season_name)})` : ""}</option>`).join("")}</select></label></div>
      <div class="pair"><div><label>From<input type="date" name="from" value="${esc(f.from)}"></label></div>
        <div><label>To<input type="date" name="to" value="${esc(f.to)}"></label></div></div>
      <div><label>Activity<select name="activity">${opt("", "All activities", f.activity)}${ACTIVITIES.map((a) => opt(a, a, f.activity)).join("")}</select></label></div>
      <div><label>Age group<select name="age">${opt("", "All age groups", f.age)}${AGE_GROUPS.map((a) => opt(a, a, f.age)).join("")}</select></label></div>
      ${f.report === "reservations" ? `<div><label>Status<select name="status">${opt("", "All", f.status)}${opt("confirmed", "Claimed", f.status)}${opt("waitlisted", "Waitlisted", f.status)}${opt("canceled", "Canceled", f.status)}</select></label></div>` : ""}
      ${f.report === "athletes" ? `<div class="align-end"><label class="check"><input type="checkbox" name="zero" value="1"${f.zero ? " checked" : ""}> Include athletes with no reservations</label></div>` : ""}
      <div class="full actions">
        <button class="btn-small" type="submit">Run report</button>
        <a class="btn-ghost" href="/admin/reports?${esc(qs)}&amp;format=csv">Download CSV</a>
        <button class="btn-ghost" type="button" onclick="window.print()">Print</button>
        <a class="link-dark" href="/admin/reports?report=${f.report}">Clear filters</a>
        <span class="fine">For a single day, set From and To to the same date.</span>
      </div>
    </form>
  </section>

  <section class="panel report">
    <h2>${esc(reports[f.report])} <span class="h-sub">${out.rows.length} row${out.rows.length === 1 ? "" : "s"}</span></h2>
    <p class="fine print-only">${esc(describe(f, seasons, rounds))}</p>
    ${out.note ? `<p class="fine">${esc(out.note)}</p>` : ""}
    ${out.rows.length ? `<div class="table-wrap"><table class="rep">
      <thead><tr>${out.columns.map((c) => `<th class="${c.num ? "n" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${out.rows.map((r) => `<tr>${out.columns.map((c, i) => {
        const val = r[c.key] ?? "";
        const txt = c.pct ? `${val}%` : esc(val);
        return `<td class="${c.num ? "n" : ""}">${i === 0 && r.link ? `<a href="${r.link}">${txt}</a>` : txt}</td>`;
      }).join("")}</tr>`).join("")}</tbody>
      ${totals ? `<tfoot><tr>${out.columns.map((c, i) => `<td class="${c.num ? "n" : ""}">${i === 0 ? "Total" : totals[c.key] != null ? (c.pct ? `${totals[c.key]}%` : totals[c.key]) : ""}</td>`).join("")}</tr></tfoot>` : ""}
    </table></div>` : `<p class="muted">Nothing matches these filters.</p>`}
  </section>
  <script>
  (function () {
    var s = document.getElementById("f-season"), r = document.getElementById("f-round");
    function sync() {
      Array.from(r.options).forEach(function (o) { if (o.value) o.hidden = !!s.value && o.dataset.season !== s.value; });
      if (r.selectedOptions[0] && r.selectedOptions[0].hidden) r.value = "";
    }
    s.addEventListener("change", sync); sync();
  })();
  </script>`,
  });
}

function describe(f, seasons, rounds) {
  const parts = [];
  const s = seasons.find((x) => x.id === f.season); if (s) parts.push(s.name);
  const r = rounds.find((x) => x.id === f.round); if (r) parts.push(r.name);
  if (f.from || f.to) parts.push(f.from === f.to ? f.from : `${f.from || "start"} to ${f.to || "end"}`);
  if (f.activity) parts.push(f.activity);
  if (f.age) parts.push(f.age);
  return parts.length ? parts.join(" · ") : "All data";
}

module.exports = { reportsPage };
