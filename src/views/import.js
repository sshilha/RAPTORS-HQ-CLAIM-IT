const { esc } = require("./layout");
const { page } = require("./admin");
const { defaultsTable, niceRange } = require("./rounds");
const { limitsTable, limitsScript, unlockFields } = require("./partials");

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MON[m - 1]} ${d}, ${y}`;
};
const t12 = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

const uploadPage = ({ user, flash, v = {}, seasons = [] }) => page({
  title: "Import schedule", tab: "import", user, flash,
  body: `<section class="panel">
    <h1>Import a vendor schedule</h1>
    <p class="lede">Upload the Turn Two schedule PDF, or paste its text. You'll see every session it found before anything is created, and each round is saved as a draft until you publish it.</p>
    <form id="imp" method="post" action="/admin/import/preview" class="grid-form">
      <div class="full"><label for="pdf">Schedule PDF</label><input id="pdf" type="file" accept="application/pdf,.pdf"></div>
      <div class="full"><label for="text">Or paste the schedule text</label>
        <textarea id="text" name="text" rows="6" placeholder="November 3&#10;4:30-6pm-Hitting-8/10U&#10;November 4&#10;6-7:30pm-Hitting-8/10U">${esc(v.text)}</textarea></div>
      <div><label for="season">Season</label><select id="season" name="season_id">
        ${seasons.map((x) => `<option value="${x.id}"${String(v.season_id) === String(x.id) ? " selected" : ""}>${esc(x.name)}</option>`).join("")}
        <option value=""${seasons.length ? "" : " selected"}>No season</option></select>
        ${seasons.length ? "" : `<span class="fine"><a href="/admin/seasons">Open a season</a> first to group these rounds by year.</span>`}</div>
      <div><label for="year">Year of the first date</label><input id="year" name="year" inputmode="numeric" value="${esc(v.year)}" placeholder="Read from the PDF">
        <span class="fine">Leave blank to use the year on the schedule.</span></div>
      <div><label for="loc">Location</label><input id="loc" name="location" value="${esc(v.location ?? "Turn Two Athletics")}"></div>
      <div class="full"><p class="label-like">Limits per athlete, each round</p>${limitsTable(null)}${unlockFields(null)}</div>
      <div><label for="cxl">Cancellation deadline (hours before)</label><input id="cxl" type="number" min="0" max="336" name="cancel_hours" value="${esc(v.cancel_hours ?? 24)}"></div>
      <div class="full"><p class="label-like">Session defaults by activity</p>${defaultsTable(null)}
        <span class="fine">Used for new rounds. Cage Time is split into 30-minute blocks of 2 unless you change it.</span></div>
      <input type="hidden" name="pdf_b64" id="pdf_b64">
      <div class="full"><button class="btn" type="submit">Preview sessions</button></div>
    </form>
  </section>
  <script>
  document.getElementById("imp").addEventListener("submit", function (e) {
    var f = document.getElementById("pdf").files[0];
    if (!f) return;
    e.preventDefault();
    var r = new FileReader();
    r.onload = function () {
      document.getElementById("pdf_b64").value = String(r.result).split(",")[1];
      e.target.submit();
    };
    r.readAsDataURL(f);
  });
  </script>${limitsScript}`,
});

const ACT_SUMMARY = (d) => Object.entries(d || {}).map(([a, x]) => `${esc(a)} ${x.capacity}`).join(", ");

function previewPage({ user, flash, rows, rounds, warnings, settings, seasonName }) {
  const selectable = rows.filter((r) => r.status === "new").length;
  const byRound = rounds.map((rd) => ({ ...rd, rows: rows.filter((r) => r.round === rd.round) }));
  return page({
    title: "Review import", tab: "import", user, flash,
    body: `<a class="back" href="/admin/import">Start over</a>
    <form method="post" action="/admin/import/commit">
    <section class="panel">
      <h1>Review ${rows.length} sessions</h1>
      <p class="lede">${selectable} ready to create in ${rounds.length} round${rounds.length === 1 ? "" : "s"}${seasonName ? ` in <strong>${esc(seasonName)}</strong>` : ""}. Uncheck anything you don't want.</p>
      ${warnings.length ? `<details class="warn"><summary>${warnings.length} line${warnings.length === 1 ? "" : "s"} skipped</summary>
        <ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
      <p class="muted">New rounds: ${esc(settings.location || "no location")}, limits ${esc(Object.entries(settings.limits).map(([a, n]) => `${a} ${n == null ? "unlimited" : n}`).join(", "))}, open spots unlock ${esc(settings.unlockText)}, cancel ${settings.cancel_hours} hours before.
        Capacity: ${ACT_SUMMARY(settings.defaults)}.</p>
    </section>

    ${byRound.map((rd) => `<section class="panel">
      <h2>${esc(rd.name)} <span class="h-sub">${esc(dayLabel(rd.first))} to ${esc(dayLabel(rd.last))}</span></h2>
      ${rd.match ? `<p class="rule">Adds to the existing round <a href="/admin/rounds/${rd.match.id}">${esc(rd.match.name)}</a> (${esc(niceRange(rd.match.starts_on, rd.match.ends_on))}). Its settings stay as they are.</p>
        <input type="hidden" name="name_${rd.key}" value="${esc(rd.name)}">`
      : `<div class="grid-form round-dates">
        <div class="full"><label>Round name<input name="name_${rd.key}" value="${esc(rd.name)}" required></label>
          <span class="fine">Parents see this in program names, like "${esc(rd.name)} Hitting 12U–18U".</span></div>
        <div><label>Booking opens<input type="datetime-local" name="opens_${rd.key}"></label>
          <span class="fine">Blank opens booking when you publish.</span></div>

      </div>`}
      <div class="table-wrap"><table class="import">
        <thead><tr><th><input type="checkbox" checked aria-label="Select all in this round" onclick="this.closest('table').querySelectorAll('tbody input:not(:disabled)').forEach(c=>c.checked=this.checked)"></th>
          <th>Date</th><th>Time</th><th>Program</th><th></th></tr></thead>
        <tbody>${rd.rows.map((r) => `<tr class="${r.status === "new" ? "" : "struck"}">
          <td><input type="checkbox" name="row" value="${r.i}"${r.status === "new" ? " checked" : ""}${r.status === "duplicate" ? " disabled" : ""} aria-label="Include"></td>
          <td>${esc(dayLabel(r.date))}</td>
          <td>${esc(t12(r.start))}–${esc(t12(r.end))}</td>
          <td>${esc(r.program)}</td>
          <td>${r.status === "duplicate" ? `<span class="pill">Already added</span>`
              : r.status === "past" ? `<span class="pill">In the past</span>` : ""}</td>
        </tr>`).join("")}</tbody></table></div>
    </section>`).join("")}

    <section class="panel">
      <input type="hidden" name="payload" value="${esc(JSON.stringify({ rows, settings }))}">
      <button class="btn" type="submit">Create selected sessions as drafts</button>
      <span class="fine">Past sessions are unchecked by default. Check them if you're testing with an old schedule.</span>
    </section>
    </form>`,
  });
}

module.exports = { uploadPage, previewPage };
