// Board → Access & people: everyone with a per-board role on this board (Coach, Team manager, custom roles), add or remove.
const { esc } = require("./layout");
function boardRoles({ sc, rows, roles, people }) {
  return `<section class="panel br-sec" id="board-roles"><h2>Roles on this board</h2>
    <p class="fine">Per-board roles apply only here (and only to the teams listed). What each role can do is set in App Settings → Accounts &amp; sign-in → Roles.</p>
    ${rows.length ? `<table class="br-t"><tbody>${rows.map((r) => `<tr><td><b>${esc(r.name || r.email)}</b>${r.name ? ` <span class="fine">${esc(r.email)}</span>` : ""}</td><td><span class="ar-chip">${esc(r.role.name)}</span></td><td class="fine">${r.teams.length ? esc(r.teams.join(", ")) : "All teams"}</td>
      <td><form method="post" action="/admin/members/roles/remove?s=${sc.id}" onsubmit="return confirm('Remove ${esc(r.role.name)} on this board for ${esc(r.name || r.email)}?')"><input type="hidden" name="email" value="${esc(r.email)}"><input type="hidden" name="role" value="${r.role.id}"><button class="btn-ghost danger" type="submit">Remove</button></form></td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No one has a role on this board yet.</p>`}
    <form method="post" action="/admin/members/roles?s=${sc.id}" class="br-add">
      <label class="field-l"><span>Person</span><select name="email" required><option value="">Pick someone with an email…</option>${people.map((p) => `<option value="${esc(p.email)}">${esc(p.name)} · ${esc(p.email)}</option>`).join("")}</select></label>
      <label class="field-l"><span>Role</span><select name="role" required>${roles.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></label>
      <label class="field-l"><span>Teams <span class="opt">(optional)</span></span><input name="teams" placeholder="All teams, or e.g. 10U, 12U"></label>
      <button class="btn-small" type="submit">Add</button></form></section>`;
}
module.exports = { boardRoles };
