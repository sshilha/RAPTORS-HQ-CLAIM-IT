// Board → Questions: claim questions (on the board or a level) and their answer rules.
const { esc } = require("./layout");
const Q = require("../questions");
const ACT = { followup: "Ask a follow-up question", helper: "Open a helper spot", email: "Email someone", tag: "Add a tag" };
const TO = { coaches: "The board's coaches", organizer: "The board's organizer contact", address: "This address" };

function ruleText(q, r, levels) {
  const ans = (Q.opts(q).find((o) => o.key === r.when) || {}).label || r.when;
  const lv = levels.find((l) => l.id === Number(r.node));
  const what = r.action === "helper" ? `open ${Number(r.spots) || 1} helper spot${Number(r.spots) > 1 ? "s" : ""} in <b>${esc(lv ? lv.path : "(a level that's gone)")}</b> called <b>${esc(r.label || "Helper for {athlete}")}</b>, at the same time and place; claimable by whoever that level allows; doesn't count toward limits`
    : r.action === "email" ? `email ${esc(r.to === "address" ? r.address || "" : TO[r.to] || "")}` : `tag them <b>${esc(r.tag || "")}</b> on the board's list`;
  return `When the answer is <b>${esc(ans)}</b> → ${what}`;
}
function questionsPage({ sc, head, qs, levels, counts, editId }) {
  const where = (q) => (q.node_id ? (levels.find((l) => l.id === q.node_id) || {}).path || "(a level that's gone)" : "Whole board");
  const levelOpts = (cur) => `<option value="">Whole board</option>${levels.map((l) => `<option value="${l.id}"${Number(cur) === l.id ? " selected" : ""}>${esc(l.path)}</option>`).join("")}`;
  const form = (q = null) => `<form method="post" action="/admin/setup/questions${q ? `/${q.id}` : ""}?s=${sc.id}" class="qs-form">
      <div class="qs-grid">
        ${q && q.parent_id ? "" : `<label class="field-l"><span>Ask on</span><select name="node_id">${levelOpts(q ? q.node_id : "")}</select></label>`}
        <label class="field-l qs-wide"><span>Question</span><input name="label" maxlength="160" required value="${esc(q ? q.label : "")}" placeholder="e.g. Do you have a catcher?"></label>
        <label class="field-l"><span>Type</span><select name="kind" onchange="this.form.querySelector('.qs-opts').hidden = !/choice|multi/.test(this.value)">${Object.entries(Q.KINDS).map(([k, l]) => `<option value="${k}"${(q ? q.kind : "choice") === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <label class="field-l qs-opts"${q && !/choice|multi/.test(q.kind) ? " hidden" : ""}><span>Answers <span class="opt">(one per line)</span></span><textarea name="options" rows="3" placeholder="I have a catcher&#10;I need a catcher">${esc(q ? Q.opts(q).map((o) => o.label).join("\n") : "")}</textarea></label>
      <div class="qs-checks">
        <label class="radio-row"><input type="checkbox" name="required" value="1"${!q || q.required ? " checked" : ""}> <span><b>Required</b> <span class="fine">They can't claim without answering (admins adding someone too).</span></span></label>
        <label class="radio-row"><input type="checkbox" name="show_roster" value="1"${!q || (q.show || {}).roster !== false ? " checked" : ""}> <span><b>Show answers on rosters and Check-in</b></span></label>
        <label class="radio-row"><input type="checkbox" name="show_week" value="1"${!q || (q.show || {}).week !== false ? " checked" : ""}> <span><b>Show answers on the weekly roster</b></span></label>
        <label class="radio-row"><input type="checkbox" name="show_public" value="1"${q && (q.show || {}).public ? " checked" : ""}> <span><b>Show answers to other families</b> <span class="fine">Next to each person's name in a session's Details. Families always see their own answers.</span></span></label>
      </div>
      <div class="q-actions"><button class="btn-small" type="submit">${q ? "Save question" : "Add question"}</button>${q ? `<a class="link-dark" href="/admin/setup/questions?s=${sc.id}">Cancel</a>` : ""}</div></form>`;
  const ruleForm = (q) => `<details class="qs-addrule"><summary class="link-dark">+ Add a rule</summary>
      <form method="post" action="/admin/setup/questions/${q.id}/rules?s=${sc.id}" class="qs-form">
        <div class="qs-grid">
          <label class="field-l"><span>When the answer is</span><select name="when">${Q.opts(q).map((o) => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("")}</select></label>
          <label class="field-l"><span>Then</span><select name="action" onchange="var f = this.form; ['followup','helper','email','tag'].forEach(function (a) { f.querySelector('.qr-' + a).hidden = a !== this.value; }, this)">${Object.entries(ACT).filter(([k]) => k === "followup" || q.kind !== "multi").map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        </div>
        <div class="qs-grid qr-followup">
          <label class="field-l qs-wide"><span>Follow-up question</span><input name="f_label" maxlength="160" placeholder="e.g. Who is your catcher?"></label>
          <label class="field-l"><span>Type</span><select name="f_kind" onchange="this.form.querySelector('.qr-fopts').hidden = !/choice|multi/.test(this.value)">${Object.entries(Q.KINDS).map(([k, l]) => `<option value="${k}"${k === "text" ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field-l qs-wide qr-fopts" hidden><span>Answers <span class="opt">(one per line)</span></span><textarea name="f_options" rows="3"></textarea></label>
          <label class="radio-row qs-wide"><input type="checkbox" name="f_required" value="1" checked> <span><b>Required</b> <span class="fine">Only when it's showing.</span></span></label>
          <p class="fine qs-wide">Asked right under this question, only when they pick this answer. A follow-up can have its own rules and follow-ups.</p>
        </div>
        <div class="qs-grid qr-helper" hidden>
          <label class="field-l"><span>In level</span><select name="node">${levels.map((l) => `<option value="${l.id}">${esc(l.path)}</option>`).join("")}</select></label>
          <label class="field-l qs-wide"><span>Call it <span class="opt">({athlete} = their name)</span></span><input name="label" maxlength="100" value="Helper for {athlete}"></label>
          <label class="field-l"><span>Spots</span><input name="spots" type="number" min="1" max="10" value="1"></label>
          <p class="fine qs-wide">It opens at the same time and place as their session. Whoever that level allows can claim it (set who in Board setup); it doesn't count toward their limit; they're emailed right away (not overnight). It closes if the claim is canceled or the answer changes.</p>
        </div>
        <div class="qs-grid qr-email" hidden>
          <label class="field-l"><span>Email</span><select name="to" onchange="this.form.querySelector('.qr-addr').hidden = this.value !== 'address'">${Object.entries(TO).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label class="field-l qs-wide qr-addr" hidden><span>Address</span><input name="address" type="email" maxlength="120"></label>
        </div>
        <div class="qs-grid qr-tag" hidden><label class="field-l"><span>Tag</span><input name="tag" maxlength="40" placeholder="e.g. Catcher"></label>
          <p class="fine qs-wide">Added to them on this board's list. Tags decide who can claim which levels.</p></div>
        <div class="q-actions"><button class="btn-small" type="submit">Add rule</button></div></form></details>`;
  const card = (q) => editId === q.id ? `<div class="qs-card qs-edit">${form(q)}</div>` : `<div class="qs-card">
      <div class="qs-top"><div><b>${esc(q.label)}</b><span class="fine qs-meta">${Q.KINDS[q.kind] || q.kind}${q.required ? " · required" : " · optional"}${(q.show || {}).roster !== false ? " · on rosters" : ""}${(q.show || {}).week !== false ? " · on the weekly roster" : ""}${(q.show || {}).public ? " · shown to families" : ""} · ${counts[q.id] || 0} answered</span></div>
        <span class="qs-acts"><a class="btn-small" href="/admin/setup/questions?s=${sc.id}&edit=${q.id}#q${q.id}">Edit</a>
        <form method="post" action="/admin/setup/questions/${q.id}/archive?s=${sc.id}" onsubmit="return confirm('Remove this question? Answers already given are kept for reports.')"><button class="btn-ghost danger" type="submit">Remove</button></form></span></div>
      ${/choice|multi|yesno/.test(q.kind) ? `<div class="qs-ans">${Q.opts(q).map((o) => `<span class="qs-chip">${esc(o.label)}</span>`).join("")}</div>` : ""}
      ${(q.rules || []).length ? `<ul class="qs-rules">${q.rules.map((r, i) => `<li><span>${ruleText(q, r, levels)}</span><form method="post" action="/admin/setup/questions/${q.id}/rules/${i}/delete?s=${sc.id}" onsubmit="return confirm('Remove this rule?')"><button class="x" type="submit" aria-label="Remove rule">×</button></form></li>`).join("")}</ul>` : ""}
      ${(kids.get(q.id) || []).map((k) => `<div class="qs-follow"><div class="qs-when">When the answer is <b>${esc((Q.opts(q).find((o) => o.key === k.parent_when) || {}).label || k.parent_when)}</b> → ask</div><div id="q${k.id}">${card(k)}</div></div>`).join("")}
      ${/choice|yesno|multi/.test(q.kind) ? ruleForm(q) : ""}</div>`;
  const kids = new Map(); for (const q of qs) if (q.parent_id) { if (!kids.has(q.parent_id)) kids.set(q.parent_id, []); kids.get(q.parent_id).push(q); }
  const groups = new Map(); for (const q of qs.filter((x) => !x.parent_id)) { const k = where(q); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
  return `${head}<div class="sub-body no-subs qs-sheet">
    <section class="nt-sec"><h3>Questions</h3><p class="fine">Questions people answer when they claim a session: on the whole board, or on a level (every session in it and below). Rules act on answers: open a helper spot (e.g. "I need a catcher" opens "Catch for a pitcher" in Catching), email someone, or tag the athlete. This is the one place for a board's questions.</p></section>
    ${groups.size ? [...groups].map(([k, list]) => `<section class="nt-sec"><h3>${esc(k)}</h3>${list.map((q) => `<div id="q${q.id}">${card(q)}</div>`).join("")}</section>`).join("") : `<section class="nt-sec"><p class="muted">No questions yet.</p></section>`}
    <section class="nt-sec"><h3>Add a question</h3>${form()}</section></div>`;
}
module.exports = { questionsPage };
