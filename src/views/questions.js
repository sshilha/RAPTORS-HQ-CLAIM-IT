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
  return `When someone answers <b>${esc(ans)}</b> → ${what}`;
}
function questionsPage({ sc, head, qs, levels, counts, editId }) {
  const where = (q) => (q.node_id ? (levels.find((l) => l.id === q.node_id) || {}).path || "(a level that's gone)" : "");
  const levelOpts = (cur) => `<option value="">Whole board (every session)</option>${levels.map((l) => `<option value="${l.id}"${Number(cur) === l.id ? " selected" : ""}>${esc(l.path)}</option>`).join("")}`;
  const hint = (t) => `<span class="qs-hint">${t}</span>`;
  // the question form (add, or edit an existing one)
  const form = (q = null) => `<form method="post" action="/admin/setup/questions${q ? `/${q.id}` : ""}?s=${sc.id}" class="qs-form">
      ${q && q.parent_id ? "" : `<label class="field-l"><span>Where to ask it</span><select name="node_id">${levelOpts(q ? q.node_id : "")}</select>
        ${hint("<b>Whole board</b> asks it on every session. Pick a level to ask it only on that level's sessions (and the levels inside it). For example, pick <b>Round 1 › Pitching</b> to ask only pitchers.")}</label>`}
      <label class="field-l"><span>Question</span><input name="label" maxlength="160" required value="${esc(q ? q.label : "")}" placeholder="e.g. Do you have a catcher?">
        ${hint("What families see when they claim. Keep it short.")}</label>
      <label class="field-l"><span>Answer type</span><select name="kind" onchange="this.form.querySelector('.qs-opts').hidden = !/choice|multi/.test(this.value)">${Object.entries(Q.KINDS).map(([k, l]) => `<option value="${k}"${(q ? q.kind : "choice") === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        ${hint("<b>Pick one</b> or <b>Yes / No</b> can have rules (follow-up questions, helper spots, emails, tags). <b>Pick any</b> can ask follow-ups. <b>Short answer</b> and <b>Number</b> just collect what they type.")}</label>
      <label class="field-l qs-opts"${q && !/choice|multi/.test(q.kind) ? " hidden" : ""}><span>Answers to choose from</span><textarea name="options" rows="3" placeholder="I have a catcher&#10;I need a catcher">${esc(q ? Q.opts(q).map((o) => o.label).join("\n") : "")}</textarea>
        ${hint("One per line. You can reword them later without losing earlier answers.")}</label>
      <div class="qs-checks"><span class="qs-sub">Options</span>
        <label class="radio-row"><input type="checkbox" name="required" value="1"${!q || q.required ? " checked" : ""}> <span><b>Required</b> ${hint("They can't claim without answering (admins adding someone too).")}</span></label>
        <label class="radio-row"><input type="checkbox" name="show_roster" value="1"${!q || (q.show || {}).roster !== false ? " checked" : ""}> <span><b>Show answers on rosters and Check-in</b></span></label>
        <label class="radio-row"><input type="checkbox" name="show_week" value="1"${!q || (q.show || {}).week !== false ? " checked" : ""}> <span><b>Show answers on the weekly roster</b></span></label>
        <label class="radio-row"><input type="checkbox" name="show_public" value="1"${q && (q.show || {}).public ? " checked" : ""}> <span><b>Show answers to other families</b> ${hint("Next to each person's name in a session's Details. Families always see their own answers.")}</span></label>
      </div>
      <div class="q-actions"><button class="btn-small" type="submit">${q ? "Save question" : "Add question"}</button>${q ? `<a class="link-dark" href="/admin/setup/questions?s=${sc.id}#q${q.id}">Cancel</a>` : ""}</div></form>`;
  // add a rule to a question
  const ruleForm = (q) => `<details class="qs-addrule"><summary class="link-dark">+ Add a rule to this question</summary>
      <form method="post" action="/admin/setup/questions/${q.id}/rules?s=${sc.id}" class="qs-form">
        <p class="qs-hint">A rule does something when someone picks a certain answer: ask a follow-up question, open a helper spot, email someone, or tag the athlete.</p>
        <div class="qs-grid">
          <label class="field-l"><span>When someone answers</span><select name="when">${Q.opts(q).map((o) => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("")}</select></label>
          <label class="field-l"><span>Then</span><select name="action" onchange="var f = this.form; ['followup','helper','email','tag'].forEach(function (a) { f.querySelector('.qr-' + a).hidden = a !== this.value; }, this)">${Object.entries(ACT).filter(([k]) => k === "followup" || q.kind !== "multi").map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        </div>
        <div class="qs-grid qr-followup">
          <label class="field-l qs-wide"><span>Follow-up question</span><input name="f_label" maxlength="160" placeholder="e.g. Who is your catcher?"></label>
          <label class="field-l"><span>Answer type</span><select name="f_kind" onchange="this.form.querySelector('.qr-fopts').hidden = !/choice|multi/.test(this.value)">${Object.entries(Q.KINDS).map(([k, l]) => `<option value="${k}"${k === "text" ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field-l qs-wide qr-fopts" hidden><span>Answers to choose from</span><textarea name="f_options" rows="3"></textarea>${hint("One per line.")}</label>
          <label class="radio-row qs-wide"><input type="checkbox" name="f_required" value="1" checked> <span><b>Required</b> ${hint("Only when it's showing.")}</span></label>
          <p class="qs-hint qs-wide">Asked right under this question, only when they pick that answer. A follow-up can have its own rules and follow-ups.</p>
        </div>
        <div class="qs-grid qr-helper" hidden>
          <label class="field-l"><span>In level</span><select name="node">${levels.map((l) => `<option value="${l.id}">${esc(l.path)}</option>`).join("")}</select></label>
          <label class="field-l qs-wide"><span>Call it</span><input name="label" maxlength="100" value="Helper for {athlete}">${hint("{athlete} becomes their name, e.g. \"Catch for a pitcher: {athlete}\".")}</label>
          <label class="field-l"><span>Spots</span><input name="spots" type="number" min="1" max="10" value="1"></label>
          <p class="qs-hint qs-wide">Opens a spot at the same time and place as their session. Whoever that level allows can claim it (set who in Board setup); it doesn't count toward their limit; they're emailed right away (not overnight). It closes if the claim is canceled or the answer changes.</p>
        </div>
        <div class="qs-grid qr-email" hidden>
          <label class="field-l"><span>Email</span><select name="to" onchange="this.form.querySelector('.qr-addr').hidden = this.value !== 'address'">${Object.entries(TO).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label class="field-l qs-wide qr-addr" hidden><span>Address</span><input name="address" type="email" maxlength="120"></label>
        </div>
        <div class="qs-grid qr-tag" hidden><label class="field-l"><span>Tag</span><input name="tag" maxlength="40" placeholder="e.g. Catcher"></label>
          <p class="qs-hint qs-wide">Added to them on this board's list. Tags decide who can claim which levels.</p></div>
        <div class="q-actions"><button class="btn-small" type="submit">Add rule</button></div></form></details>`;
  const kids = new Map(); for (const q of qs) if (q.parent_id) { if (!kids.has(q.parent_id)) kids.set(q.parent_id, []); kids.get(q.parent_id).push(q); }
  const card = (q) => editId === q.id ? `<div class="qs-card qs-edit"><span class="qs-tag">${q.parent_id ? "Editing follow-up question" : "Editing question"}</span>${form(q)}</div>` : `<div class="qs-card">
      <div class="qs-top"><div class="qs-titlebox"><span class="qs-tag">${q.parent_id ? "Follow-up question" : "Question"}</span><b class="qs-label">${esc(q.label)}</b>
          <span class="fine qs-meta">${Q.KINDS[q.kind] || q.kind}${q.required ? " · required" : " · optional"}${(q.show || {}).roster !== false ? " · on rosters" : ""}${(q.show || {}).week !== false ? " · on the weekly roster" : ""}${(q.show || {}).public ? " · shown to families" : ""} · ${counts[q.id] || 0} answered</span></div>
        <span class="qs-acts"><a class="btn-small" href="/admin/setup/questions?s=${sc.id}&edit=${q.id}#q${q.id}">Edit</a>
        <form method="post" action="/admin/setup/questions/${q.id}/archive?s=${sc.id}" onsubmit="return confirm('Remove this question${(kids.get(q.id) || []).length ? " and its follow-ups" : ""}? Answers already given are kept for reports.')"><button class="btn-ghost danger" type="submit">Remove</button></form></span></div>
      ${/choice|multi|yesno/.test(q.kind) ? `<div class="qs-row"><span class="qs-sub">Answers</span><span class="qs-ans">${Q.opts(q).map((o) => `<span class="qs-chip">${esc(o.label)}</span>`).join("")}</span></div>` : ""}
      ${(q.rules || []).length || (kids.get(q.id) || []).length ? `<div class="qs-sub qs-rulesh">Rules</div>` : ""}
      ${(q.rules || []).length ? `<ul class="qs-rules">${q.rules.map((r, i) => `<li><span>${ruleText(q, r, levels)}</span><form method="post" action="/admin/setup/questions/${q.id}/rules/${i}/delete?s=${sc.id}" onsubmit="return confirm('Remove this rule?')"><button class="x" type="submit" aria-label="Remove rule" title="Remove rule">×</button></form></li>`).join("")}</ul>` : ""}
      ${(kids.get(q.id) || []).map((k) => `<div class="qs-follow"><div class="qs-when">When someone answers <b>${esc((Q.opts(q).find((o) => o.key === k.parent_when) || {}).label || k.parent_when)}</b> → ask this follow-up question:</div><div id="q${k.id}">${card(k)}</div></div>`).join("")}
      ${/choice|yesno|multi/.test(q.kind) ? ruleForm(q) : ""}</div>`;
  const roots = qs.filter((x) => !x.parent_id), groups = new Map();
  for (const q of roots) { const k = where(q); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
  const order = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  return `${head}<div class="sub-body no-subs qs-sheet">
    <section class="nt-sec qs-how"><h3>How questions work</h3>
      <ol class="qs-steps">
        <li><b>Add a question</b> below, and choose where it's asked: on the whole board or one level (for example, only Pitching).</li>
        <li><b>Add rules</b> to a question's answers to make something happen: ask a follow-up question, open a helper spot (e.g. "I need a catcher" opens a "Catch for a pitcher" spot in Catching), email someone, or tag the athlete.</li>
        <li><b>Families answer when they claim</b> and can change answers on My Claims. Answers show in Check-in, on rosters, and in Reports → Participation → Answers.</li>
      </ol></section>
    <section class="nt-sec" id="add"><h3>Add a question</h3>${form()}</section>
    <section class="nt-sec qs-list"><h3>Your questions${roots.length ? ` <span class="fine">(${roots.length})</span>` : ""}</h3>
      ${order.length ? order.map((k) => `<div class="qs-group"><div class="qs-where">Asked on: <b>${k ? esc(k) : "Whole board"}</b> <span class="fine">${k ? "(every session in this level)" : "(every session on this board)"}</span></div>
        ${groups.get(k).map((q) => `<div id="q${q.id}">${card(q)}</div>`).join("")}</div>`).join("") : `<p class="muted">No questions yet. Add one above.</p>`}
    </section></div>`;
}
module.exports = { questionsPage };
