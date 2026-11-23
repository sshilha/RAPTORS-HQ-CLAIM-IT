// App Settings → Roles: create and edit roles, one row per function (No access / View only / Full, or No / Yes).
// rolePick: the roles a person has; per-board roles show the boards (and teams) they have them on.
const { esc } = require("./layout");
const R = require("../roles");
const LABEL = { none: "No access", view: "View only", full: "Full" }, YN = { none: "No", full: "Yes" }, RA = { none: "Can't", view: "Request it", full: "Add directly" };

// roles for a person: Everywhere / Own roles as checkboxes; per-board roles with their boards and teams
function rolePick(roles, checked = [], { boards = [], assigned = [], disabled = false, withTeams = true } = {}) {
  const on = new Set(checked.map(Number)), dis = disabled ? " disabled" : "";
  const plain = roles.filter((r) => r.scope !== "board"), per = roles.filter((r) => r.scope === "board");
  const mine = (rid, bid) => assigned.find((a) => a.role.id === rid && a.schedule_id === bid);
  return `<div class="ar-pick">${plain.map((r) => `<label class="radio-row ar-opt"><input type="checkbox" name="app_roles" value="${r.id}"${on.has(r.id) ? " checked" : ""}${dis}>
      <span><b>${esc(r.name)}</b> <span class="fine">${esc(r.description || R.SCOPE[r.scope] || "")}</span></span></label>`).join("")}
    ${per.length && boards.length ? `<div class="ar-per"><div class="ar-perh">Per-board roles <span class="fine">(only on the boards ticked)</span></div>
      ${per.map((r) => { const has = boards.some((b) => mine(r.id, b.id)); return `<details class="ar-role"${has ? " open" : ""}><summary><b>${esc(r.name)}</b> <span class="fine">${has ? `on ${boards.filter((b) => mine(r.id, b.id)).map((b) => esc(b.name)).join(", ")}` : esc(r.description || "not on any board")}</span></summary>
        <div class="ar-boards">${boards.map((b) => { const a = mine(r.id, b.id); return `<div class="ar-b"><label class="radio-row"><input type="checkbox" name="rb_${r.id}" value="${b.id}"${a ? " checked" : ""}${dis}> ${esc(b.name)}</label>
          ${withTeams ? `<input class="ar-teams" name="rt_${r.id}_${b.id}" value="${esc(a ? a.teams.join(", ") : "")}" placeholder="All teams (or e.g. 10U, 12U)" aria-label="Teams on ${esc(b.name)}"${dis}>` : ""}</div>`; }).join("")}</div></details>`; }).join("")}</div>` : ""}</div>`;
}
// read the picker back: { roles: [ids], boards: [{ roleId, boards: [{ id, teams }] }], any }
function readPick(body, roles) {
  const ids = [].concat(body.app_roles || []).map(Number).filter(Boolean);
  const boards = roles.filter((r) => r.scope === "board").map((r) => ({ roleId: r.id, boards: [].concat(body[`rb_${r.id}`] || []).map(Number).filter(Boolean)
    .map((b) => ({ id: b, teams: String(body[`rt_${r.id}_${b}`] || "").split(",").map((t) => t.trim()).filter(Boolean) })) }));
  return { roles: ids, boards, any: ids.length > 0 || boards.some((x) => x.boards.length) };
}
function summary(r) {
  if (r.key === "admin") return "Every function, on every board.";
  const g = R.grantsOf(r);
  const out = R.PERMS.map(([area, ps]) => { const on = ps.filter((p) => g[p[0]] && g[p[0]] !== "none"); if (!on.length) return "";
    const full = on.filter((p) => g[p[0]] === "full"), view = on.filter((p) => g[p[0]] === "view");
    const tag = (p) => (p[3] === "ra" ? (g[p[0]] === "full" ? " (add directly)" : " (request it)") : g[p[0]] === "view" ? " (view only)" : "");
    return `<b>${esc(area)}:</b> ${on.length === ps.length && !view.length ? "everything" : on.map((p) => `${esc(p[1])}${tag(p)}`).join(", ")}`; }).filter(Boolean);
  return out.length ? out.join("<br>") : "Nothing yet.";
}
function roleForm(r = null) {
  const locked = r && r.key === "admin", g = r ? R.grantsOf(r) : {}, dis = locked ? " disabled" : "";
  const row = ([k, label, hint, kind]) => { const cur = g[k] || "none", opts = kind === "yn" ? ["none", "full"] : ["none", "view", "full"];
    return `<tr><td><b>${esc(label)}</b>${hint ? `<span class="qs-hint">${esc(hint)}</span>` : ""}</td>${opts.map((o) => `<td class="rl-c"><label class="rl-opt"><input type="radio" name="g_${k}" value="${o}"${cur === o ? " checked" : ""}${dis}><span>${(kind === "ra" ? RA : kind === "vf" ? LABEL : YN)[o]}</span></label></td>`).join("")}${kind === "yn" ? "<td></td>" : ""}</tr>`; };
  return `<form method="post" action="/admin/roles${r ? `/${r.id}` : ""}" class="qs-form rl-form">
    <div class="qs-grid"><label class="field-l"><span>Name</span><input name="name" maxlength="60" required value="${esc(r ? r.name : "")}" placeholder="e.g. Assistant coach"${dis}></label>
      <label class="field-l qs-wide"><span>Description <span class="opt">(optional)</span></span><input name="description" maxlength="160" value="${esc(r ? r.description || "" : "")}" placeholder="What this role is for"${dis}></label></div>
    <label class="field-l"><span>Where it applies</span><select name="scope"${dis || (r && r.key) ? " disabled" : ""}>${Object.entries(R.SCOPE).map(([k, l]) => `<option value="${k}"${(r ? r.scope : "board") === k ? " selected" : ""}>${l}</option>`).join("")}</select>
      <select name="board_type" class="rl-btype" aria-label="Which kind of board"${dis}>${Object.entries(R.BOARD_TYPES).map(([k, l]) => `<option value="${k}"${(r && r.board_type || "training") === k ? " selected" : ""}>${l}</option>`).join("")}</select>
      <span class="qs-hint"><b>All boards of a type</b>: every board of the kind picked (Program, Volunteer or RSVP), including new ones. <b>Everywhere</b>: given once, applies on every board. <b>Per board</b>: given for specific boards (and maybe some teams), on the person's page in People. <b>Their own family or self</b>: for Family and Athlete.${r && r.key ? " Built-in roles keep theirs." : ""}</span></label>
    ${R.PERMS.map(([area, ps]) => `<div class="rl-area"><div class="rl-ah"><b>${esc(area)}</b>${locked ? "" : `<span class="rl-quick"><button type="button" data-set="full">All full</button><button type="button" data-set="view">All view only</button><button type="button" data-set="none">None</button></span>`}</div>
      <div class="table-wrap"><table class="rl-t"><tbody>${ps.map(row).join("")}</tbody></table></div></div>`).join("")}
    <div class="rl-area"><div class="rl-ah"><b>Notifications</b><span class="qs-hint">Emails people with this role get, for the boards (and teams) their role covers</span></div>
      ${Object.entries(R.NOTIFY).map(([k, l]) => `<label class="radio-row"><input type="checkbox" name="n_${k}" value="1"${r && (r.notify || {})[k] ? " checked" : ""}${dis}> ${esc(l)}</label>`).join("")}</div>
    <p class="qs-hint">My Claims is always on. Anything not listed here stays with administrators.</p>
    ${locked ? "" : `<div class="q-actions"><button class="btn-small" type="submit">${r ? "Save role" : "Add role"}</button>${r ? `<a class="link-dark" href="/admin/roles">Cancel</a>` : ""}</div>`}
    <script>(function (f) { [].forEach.call(f.querySelectorAll(".rl-quick button"), function (b) { b.addEventListener("click", function () {
      [].forEach.call(b.closest(".rl-area").querySelectorAll("tbody tr"), function (tr) { var want = b.dataset.set, el = tr.querySelector('input[value="' + want + '"]') || (want === "view" ? tr.querySelector('input[value="full"]') : null); if (el) el.checked = true; }); }); }); })(document.currentScript.closest("form"));</script></form>`;
}
function rolesPage({ head = "", roles, editId, canEdit = true, boards = [] }) {
  const preview = (r) => r.key === "admin" ? "" : `<form method="post" action="/admin/roles/${r.id}/preview" class="rl-pv">${r.scope === "board" ? `<select name="board" aria-label="Board to preview on">${boards.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select>` : ""}<button class="btn-ghost" type="submit">👀 Preview</button></form>`;
  const card = (r) => editId === r.id && canEdit && r.key !== "admin" ? `<div class="qs-card qs-edit" id="r${r.id}"><span class="qs-tag">Editing role</span>${roleForm(r)}
    <div class="rl-pvedit"><span class="fine">Preview shows the role as it's saved now. Save your changes first to preview them.</span>${preview(r)}</div></div>` : `<div class="qs-card" id="r${r.id}">
    <div class="qs-top"><div class="qs-titlebox"><span class="qs-tag">${r.key === "admin" ? "Locked" : r.key ? "Built-in role" : "Role"}</span><b class="qs-label">${esc(r.name)}</b>
      <span class="fine qs-meta">${esc(r.scope === "type" ? R.BOARD_TYPES[r.board_type || "training"] : R.SCOPE[r.scope] || r.scope)}${r.scope === "board" ? "" : ` · ${r.people} ${r.people === 1 ? "person" : "people"}`}${r.description ? ` · ${esc(r.description)}` : ""}</span></div>
      ${r.key === "admin" || !canEdit ? "" : `<span class="qs-acts"><a class="btn-small" href="/admin/roles?edit=${r.id}#r${r.id}">Edit</a>${r.key ? "" : `<form method="post" action="/admin/roles/${r.id}/delete" onsubmit="return confirm('Delete this role? Everyone who has it loses it.')"><button class="btn-ghost danger" type="submit">Delete</button></form>`}</span>`}</div>
    <p class="rl-sum">${summary(r)}${Object.entries(r.notify || {}).some(([, v]) => v) ? `<br><b>Emails:</b> ${Object.entries(R.NOTIFY).filter(([k]) => (r.notify || {})[k]).map(([, l]) => esc(l)).join(", ")}` : ""}</p>${canEdit ? preview(r) : ""}</div>`;
  return `${head}<div class="sub-body no-subs qs-sheet">
    <section class="nt-sec qs-how"><h3>How roles work</h3><ol class="qs-steps">
      <li><b>A role lists what someone can do, function by function</b>: No access, View only, or Full (or just No / Yes for simple actions).</li>
      <li><b>Where it applies</b>: <b>Everywhere</b> roles apply on every board. <b>Per-board</b> roles (like Coach) apply only on the boards someone is given them for, and can be limited to some teams there.</li>
      <li><b>People can have several roles</b>; their abilities add up (a coach who's also a parent has Coach on their boards and Family). Give roles on the person's page in People.</li>
    </ol></section>
    ${canEdit ? `<section class="nt-sec" id="add"><details><summary class="link-dark rl-add">+ Add a role</summary>${roleForm()}</details></section>` : ""}
    <section class="nt-sec"><h3>Roles <span class="fine">(${roles.length})</span></h3>${roles.map(card).join("")}</section></div>`;
}
module.exports = { rolesPage, rolePick, readPick };
