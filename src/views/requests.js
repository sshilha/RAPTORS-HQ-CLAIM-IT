const { esc } = require("./layout");
const { page } = require("./admin");
const { fmtDateTime } = require("../time");

function requestsPage({ user, flash, rows }) {
  const waiting = rows.filter((r) => r.status === "waiting"), done = rows.filter((r) => r.status !== "waiting");
  const row = (r) => `<li class="rq${r.status === "waiting" ? "" : " rq-done"}">
    <div class="rq-main"><b>${r.kind === "new_account" ? `New account: ${esc(r.data.first_name)} ${esc(r.data.last_name)}` : r.kind === "add_family" ? `Add ${esc(r.data.first_name)} ${esc(r.data.last_name)} to their family` : `Change ${esc(r.data.about || "their own info")}`}</b>
      <span class="fine">From ${esc(r.who)} (${esc(r.email)}) · ${esc(fmtDateTime(r.created_at))}</span>
      ${r.kind === "new_account" ? `<span>${[r.data.email, r.data.phone, r.data.organization].filter(Boolean).map(esc).join(" · ")}</span><span class="rq-note">“${esc(r.data.connection || "")}”</span>` : r.kind === "add_family" ? `<span>${[r.data.relationship, r.data.birth_year ? `born ${r.data.birth_year}` : "", r.data.team].filter(Boolean).map(esc).join(" · ")}</span>${r.data.note ? `<span class="rq-note">“${esc(r.data.note)}”</span>` : ""}`
        : `<span class="rq-note">“${esc(r.data.message)}”</span>`}
      ${r.status !== "waiting" ? `<span class="fine">${{ approved: "Approved", declined: "Declined", done: "Done" }[r.status]} ${r.decided_at ? esc(fmtDateTime(r.decided_at)) : ""}${r.admin_note ? ` · “${esc(r.admin_note)}”` : ""}</span>` : ""}</div>
    ${r.status === "waiting" ? `<div class="rq-act">
      <form method="post" action="/admin/requests/${r.id}/approve" class="stack">
        ${r.kind === "add_family" && r.matches && r.matches.length ? `<label class="fine">Already in People?<select name="link_to"><option value="">No, add a new person</option>${r.matches.map((m) => `<option value="${m.id}" selected>Yes: link ${esc(m.first_name)} ${esc(m.last_name)}${m.team ? ` (${esc(m.team)})` : ""}</option>`).join("")}</select></label>` : ""}
        <input name="note" maxlength="300" placeholder="Note to them (optional)">
        <button class="btn-small" type="submit">${r.kind === "change" ? "Mark done" : r.kind === "new_account" ? "Approve and send invite" : "Approve"}</button></form>
      <form method="post" action="/admin/requests/${r.id}/decline" class="stack rq-decline"><input name="note" maxlength="300" placeholder="Why (optional)"><button class="btn-ghost" type="submit">Decline</button></form>
      ${r.kind === "change" ? `<p class="fine">Make the change in <a href="/admin/people">People</a>, then mark it done.</p>` : ""}
    </div>` : ""}</li>`;
  return page({ title: "Requests", tab: "people", user, flash, xwide: true,
    body: `<div class="page-top"><h1 class="page-title">Requests <span class="h-sub">${waiting.length} waiting</span></h1><a class="btn-ghost" href="/admin/settings/app">← App settings</a></div>
    <form method="post" action="/admin/settings/app/change-email" class="rq-notify" id="notify">
      <span>Email new requests to:</span><b class="rq-addr">${esc(require("../catalog").current().change_email || "info@chippewavalleyraptors.com")}</b>
      <details><summary class="link-dark">Change</summary><span class="rq-edit"><input type="email" name="email" required value="${esc(require("../catalog").current().change_email || "info@chippewavalleyraptors.com")}" aria-label="Email address"><button class="btn-small" type="submit">Save</button></span></details>
    </form>
    <section class="panel"><p class="fine">New account requests, family members to add, and changes people asked for. People can edit their own profile; these need an admin. They're emailed when you approve, finish, or decline.</p>
      ${waiting.length ? `<ul class="rq-list">${waiting.map(row).join("")}</ul>` : `<p class="muted">Nothing waiting.</p>`}
      ${done.length ? `<details class="rq-past"><summary>Handled (${done.length})</summary><ul class="rq-list">${done.map(row).join("")}</ul></details>` : ""}
    </section>` });
}
module.exports = { requestsPage };
