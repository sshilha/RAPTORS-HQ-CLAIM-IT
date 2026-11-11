// Assessments: set up tests (App Settings → Organization → Assessments), testing days, score entry (phone/tablet,
// saves as you type), an athlete's history (year over year), and families' view of shared results (My Account).
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const A = require("../assess");
const { esc, layout } = require("../views/layout");
const { page } = require("../views/admin");
const { wrap, go, flashFrom, str, int } = require("./util");
const router = express.Router();
const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>`;
const fmtDay = (d) => new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const num = (v) => (v == null ? "" : String(Number(v)));
async function canEnter(user, d) {
  if (auth.isAdmin(user)) return true;
  if (!d.board_id) return false;
  return (await query(`SELECT 1 FROM schedule_coaches WHERE schedule_id=$1 AND lower(email)=lower($2)`, [d.board_id, user.email])).rowCount > 0;
}
const head = async (active) => (await require("../views/apphead").head({ active }));

// ---------- setup (admins) ----------
router.get("/admin/assess", auth.requireAdmin, wrap(async (req, res) => {
  const list = await A.list(), retired = await A.list({ retired: true });
  res.send(page({ title: "Assessments", tab: "settings", user: req.user, flash: flashFrom(req), wide: true,
    body: `${await head("assess")}<div class="sub-top"><h2>Assessments <span class="h-sub">performance tests, kept with each athlete year over year</span></h2></div>
    <section class="panel">${list.length ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>Assessment</th><th>Drills</th><th>Testing days</th></tr></thead><tbody>
      ${list.map((a) => `<tr><td><a href="/admin/assess/${a.id}"><b>${esc(a.name)}</b></a>${a.notes ? `<span class="em-why">${esc(a.notes)}</span>` : ""}</td><td class="r-num">${a.drills}</td><td class="r-num">${a.days}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No assessments yet. Add one, list its drills, then add testing days (Baseline, Final…) and enter scores.</p>`}
      <form method="post" action="/admin/assess" class="as-new stack"><h3>New assessment</h3><label>Name<input name="name" required maxlength="80" placeholder="e.g. Speed & Agility Assessment"></label>
        <label>Notes <span class="opt">(optional)</span><input name="notes" maxlength="300"></label><div class="q-actions"><button class="btn-small" type="submit">Add assessment</button></div></form>
      ${retired.length ? `<details class="as-retired"><summary>Retired assessments (${retired.length})</summary><ul>${retired.map((a) => `<li><b>${esc(a.name)}</b> <span class="fine">${a.days} testing days</span>
        <form method="post" action="/admin/assess/${a.id}/retire" style="display:inline"><button class="link-dark" type="submit">Restore</button></form> · <a href="/admin/assess/${a.id}">Open</a></li>`).join("")}</ul>
        <p class="fine">Retired assessments are hidden from score entry and Reports; their results stay on each athlete's profile.</p></details>` : ""}</section>` }));
}));
router.post("/admin/assess", auth.requireAdmin, wrap(async (req, res) => {
  await A.ensure(); const name = str(req.body.name).slice(0, 80); if (!name) return go(res, "/admin/assess", { err: "Give it a name." });
  const r = (await query(`INSERT INTO assessments (name, notes) VALUES ($1,$2) RETURNING id`, [name, str(req.body.notes).slice(0, 300) || null])).rows[0];
  go(res, `/admin/assess/${r.id}`, { ok: `Added "${name}". Now add its drills.` });
}));
router.get("/admin/assess/:id(\\d+)", auth.requireAdmin, wrap(async (req, res) => {
  const a = await A.get(int(req.params.id)); if (!a) return go(res, "/admin/assess", { err: "Not found." });
  const boards = (await query(`SELECT id, name FROM schedules WHERE archived_at IS NULL ORDER BY lower(name)`)).rows, today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const active = a.drills.filter((d) => !d.retired_at), gone = a.drills.filter((d) => d.retired_at);
  const drillRow = (d, i) => `<form method="post" action="/admin/assess/${a.id}/drills" class="as-drill"${d ? ` data-max="${d.max_try}"` : ""} onsubmit="var t=+this.attempts.value, m=+(this.dataset.max||0); if (this.dataset.act==='save' && t<m) { if (!window.confirm('Some athletes have scores in try '+(t+1)+(m>t+1?'–'+m:'')+'. Testing days that already have scores keep them (they are frozen), but testing days without scores will only have '+t+' tries. Continue?')) return false; this.lower_ok.value='1'; }">
    <input type="hidden" name="drill_id" value="${d ? d.id : ""}"><input type="hidden" name="lower_ok" value="">
    ${d ? `<span class="as-move"><button class="as-mv" name="move" value="up" type="submit" title="Move up"${i === 0 ? " disabled" : ""} onclick="this.form.dataset.act='move'">↑</button><button class="as-mv" name="move" value="down" type="submit" title="Move down"${i === active.length - 1 ? " disabled" : ""} onclick="this.form.dataset.act='move'">↓</button></span>` : `<span class="as-move"></span>`}
    <input name="name" value="${esc(d ? d.name : "")}" placeholder="${d ? "" : "New drill, e.g. Pro agility (5-10-5)"}" required maxlength="80" aria-label="Drill">
    <input name="unit" value="${esc(d ? d.unit || "" : "")}" placeholder="unit (sec, in, mph…)" maxlength="20" aria-label="Unit">
    <select name="better" aria-label="Better"><option value="lower"${d && d.better === "higher" ? "" : " selected"}>Lower is better</option><option value="higher"${d && d.better === "higher" ? " selected" : ""}>Higher is better</option></select>
    <select name="attempts" aria-label="Tries">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${(d ? d.attempts : 3) === n ? " selected" : ""}>${n} ${n === 1 ? "try" : "tries"}</option>`).join("")}</select>
    <div class="as-meth">${(() => { const cur = d ? d.method || "" : "", other = cur && !A.METHOD_LIST.includes(cur);
      return `<label>Measured with<select name="method" onchange="this.form.method_other.hidden = this.value !== '__other'; if (this.value === '__other') this.form.method_other.focus();">
        <option value="">Choose…</option>${A.METHODS.map(([g, xs]) => `<optgroup label="${esc(g)}">${xs.map((x) => `<option${x === cur ? " selected" : ""}>${esc(x)}</option>`).join("")}</optgroup>`).join("")}
        <option value="__other"${other ? " selected" : ""}>Other (describe)…</option></select></label>
        <input name="method_other" value="${esc(other ? cur : "")}" placeholder="What's used, e.g. Pocket Radar" maxlength="60" aria-label="Other method"${other ? "" : " hidden"}>
        <label class="as-note-l">How it's measured <span class="opt">(optional)</span><input name="method_note" value="${esc(d ? d.method_note || "" : "")}" maxlength="200" placeholder="e.g. Start on first movement; 3-point stance"></label>`; })()}</div>
    <button class="btn-small" type="submit" onclick="this.form.dataset.act='save'">${d ? "Save" : "Add drill"}</button>${d ? `<button class="btn-ghost danger" name="remove" value="1" type="submit" onclick="this.form.dataset.act='remove'; return window.confirm(${d.scores ? "'This drill has scores, so it will be retired: gone from future testing days, but its past results stay. Continue?'" : "'Delete this drill? It has no scores.'"})">${d.scores ? "Retire" : "Delete"}</button>` : ""}</form>`;
  res.send(page({ title: a.name, tab: "settings", user: req.user, flash: flashFrom(req), wide: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/assess">${ARROW}Assessments</a></nav>${await head("assess")}
    <div class="sub-top"><h2>${esc(a.name)}${a.archived_at ? ` <span class="as-share">Retired</span>` : ""}</h2></div>
    <section class="panel"><form method="post" action="/admin/assess/${a.id}/rename" class="as-name"><label>Name<input name="name" value="${esc(a.name)}" required maxlength="80"></label>
      <label>Notes <span class="opt">(optional)</span><input name="notes" value="${esc(a.notes || "")}" maxlength="300"></label><button class="btn-small" type="submit">Save</button></form>
      <form method="post" action="/admin/assess/${a.id}/retire" onsubmit="return window.confirm(${a.archived_at ? "'Restore this assessment?'" : "'Retire this assessment? It will be hidden from score entry and Reports. Athletes keep its results on their profiles, and you can restore it.'"})"><button class="${a.archived_at ? "btn-small" : "btn-ghost danger"}" type="submit">${a.archived_at ? "Restore assessment" : "Retire assessment"}</button></form></section>
    <section class="panel"><h3>Drills <span class="fine">(${active.length})</span></h3><p class="fine">Every try is kept; reports choose Best or Average. Testing days that already have scores keep the drills as they were, so changes here never rewrite past results.</p>
      <div class="as-drills">${active.map((d, i) => drillRow(d, i)).join("")}${drillRow(null)}</div>
      ${gone.length ? `<details class="as-retired"><summary>Retired drills (${gone.length})</summary><ul>${gone.map((d) => `<li><b>${esc(d.name)}</b> <span class="fine">${d.scores} scores kept</span>
        <form method="post" action="/admin/assess/${a.id}/drills" style="display:inline"><input type="hidden" name="drill_id" value="${d.id}"><input type="hidden" name="restore" value="1"><button class="link-dark" type="submit">Restore</button></form></li>`).join("")}</ul></details>` : ""}</section>
    <section class="panel"><h3>Testing days</h3>
      ${a.days.length ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>Day</th><th>Kind</th><th>Program</th><th>Tested</th><th>Families can see</th><th></th></tr></thead><tbody>
        ${a.days.map((d) => `<tr><td><b>${esc(fmtDay(d.day))}</b>${d.frozen ? `<span class="em-why" title="This day has scores, so it keeps its drills as they were.">Drills locked (has scores)</span>` : ""}</td><td>${esc(d.kind)}</td><td>${esc(d.board || "—")}</td><td class="r-num">${d.tested}</td>
          <td><form method="post" action="/admin/assess/days/${d.id}/share"><button class="as-share ${d.shared ? "on" : ""}" type="submit" title="${d.shared ? "Families can see their own athlete's results. Click to hide." : "Hidden from families. Click to share."}">${d.shared ? "Shared" : "Hidden"}</button></form></td>
          <td class="as-acts"><a class="sb-btn primary" href="/assess/days/${d.id}">Enter scores</a><form method="post" action="/admin/assess/days/${d.id}/delete" onsubmit="return window.confirm('Delete this testing day and all its scores?')"><button class="link-dark rv-rm" type="submit">Delete</button></form></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No testing days yet.</p>`}
      <form method="post" action="/admin/assess/${a.id}/days" class="as-day"><label>Day<input type="date" name="day" value="${today}" required></label>
        <label>Kind<select name="kind">${A.KINDS.map((k) => `<option>${k}</option>`).join("")}</select></label>
        <label>Program <span class="opt">(whose athletes are tested; used to compare with attendance)</span><select name="board_id"><option value="">None</option>${boards.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></label>
        <div class="q-actions"><button class="btn-small" type="submit">Add testing day</button></div></form>
      <p class="fine">Results stay hidden from families until you click <b>Hidden</b> to share that day. Coaches of the linked program can enter scores too.</p></section>
    <section class="panel"><details class="as-log"${a.changes.length ? "" : " hidden"}><summary>Change history (${a.changes.length})</summary><ul>${a.changes.map((c) => `<li><span class="fine">${esc(new Date(c.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))} · ${esc(c.who || "")}</span> ${esc(c.what)}</li>`).join("")}</ul></details>
      ${a.changes.length ? "" : `<p class="fine">Changes to this assessment will be listed here.</p>`}</section>` }));
}));
router.post("/admin/assess/:id(\\d+)/rename", auth.requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id), a = (await query(`SELECT * FROM assessments WHERE id=$1`, [id])).rows[0]; if (!a) return go(res, "/admin/assess", { err: "Not found." });
  const name = str(req.body.name).slice(0, 80), notes = str(req.body.notes).slice(0, 300) || null; if (!name) return go(res, `/admin/assess/${id}`, { err: "Give it a name." });
  await query(`UPDATE assessments SET name=$2, notes=$3 WHERE id=$1`, [id, name, notes]);
  const ch = [a.name !== name && `Renamed the assessment "${a.name}" → "${name}"`, (a.notes || null) !== notes && "Changed the notes"].filter(Boolean);
  if (ch.length) await A.logChange(id, req.user.email, ch.join(" · "));
  go(res, `/admin/assess/${id}`, { ok: ch.length ? "Saved." : "Nothing changed." });
}));
router.post("/admin/assess/:id(\\d+)/retire", auth.requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id), a = (await query(`UPDATE assessments SET archived_at = CASE WHEN archived_at IS NULL THEN now() END WHERE id=$1 RETURNING name, archived_at`, [id])).rows[0];
  if (!a) return go(res, "/admin/assess", { err: "Not found." });
  await A.logChange(id, req.user.email, a.archived_at ? "Retired the assessment" : "Restored the assessment");
  go(res, a.archived_at ? "/admin/assess" : `/admin/assess/${id}`, { ok: a.archived_at ? `Retired "${a.name}". Athletes keep its results on their profiles.` : `Restored "${a.name}".` });
}));
router.post("/admin/assess/:id(\\d+)/drills", auth.requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id), did = int(req.body.drill_id), back = `/admin/assess/${id}`, who = req.user.email;
  const old = did ? (await query(`SELECT x.*, (SELECT count(*)::int FROM assess_results r WHERE r.drill_id=x.id) AS scores, (SELECT coalesce(max(r.attempt),0) FROM assess_results r WHERE r.drill_id=x.id) AS max_try FROM assess_drills x WHERE x.id=$1 AND x.assessment_id=$2`, [did, id])).rows[0] : null;
  if (did && !old) return go(res, back, { err: "Not found." });
  if (old && req.body.restore) { await query(`UPDATE assess_drills SET retired_at=NULL, sort=(SELECT coalesce(max(sort),0)+1 FROM assess_drills WHERE assessment_id=$2 AND retired_at IS NULL) WHERE id=$1`, [did, id]);
    await A.syncDays(id); await A.logChange(id, who, `Restored the drill "${old.name}"`); return go(res, back, { ok: `Restored ${old.name}.` }); }
  if (old && req.body.remove) {
    if (old.scores) { await query(`UPDATE assess_drills SET retired_at=now() WHERE id=$1`, [did]); await A.logChange(id, who, `Retired the drill "${old.name}" (its ${old.scores} scores are kept)`); }
    else { await query(`DELETE FROM assess_drills WHERE id=$1`, [did]); await A.logChange(id, who, `Deleted the drill "${old.name}" (it had no scores)`); }
    await A.syncDays(id); return go(res, back, { ok: old.scores ? `Retired ${old.name}. Its past results stay.` : `Deleted ${old.name}.` });
  }
  if (old && req.body.move) {
    const list = (await query(`SELECT id FROM assess_drills WHERE assessment_id=$1 AND retired_at IS NULL ORDER BY sort, id`, [id])).rows.map((r) => r.id), i = list.indexOf(did), j = req.body.move === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; for (let k = 0; k < list.length; k++) await query(`UPDATE assess_drills SET sort=$2 WHERE id=$1`, [list[k], k + 1]);
      await A.syncDays(id); await A.logChange(id, who, `Moved "${old.name}" ${req.body.move}`); }
    return go(res, back, {});
  }
  const name = str(req.body.name).slice(0, 80); if (!name) return go(res, back, { err: "Give the drill a name." });
  const unit = str(req.body.unit).slice(0, 20) || null, better = req.body.better === "higher" ? "higher" : "lower", attempts = Math.max(1, Math.min(int(req.body.attempts) || 3, 5));
  const method = (req.body.method === "__other" ? str(req.body.method_other).slice(0, 60) : A.METHOD_LIST.includes(req.body.method) ? req.body.method : "") || null, methodNote = str(req.body.method_note).slice(0, 200) || null;
  if (old && attempts < old.max_try && req.body.lower_ok !== "1") return go(res, back, { err: `${old.name} has scores in try ${attempts + 1}${old.max_try > attempts + 1 ? `–${old.max_try}` : ""}. Lower the tries again and confirm to continue.` });
  if (old) {
    await query(`UPDATE assess_drills SET name=$2, unit=$3, better=$4, attempts=$5, method=$6, method_note=$7 WHERE id=$1`, [did, name, unit, better, attempts, method, methodNote]);
    const ch = [old.name !== name && `name "${old.name}" → "${name}"`, (old.unit || null) !== unit && `unit ${old.unit || "none"} → ${unit || "none"}`, old.better !== better && `${old.better} is better → ${better} is better`, old.attempts !== attempts && `tries ${old.attempts} → ${attempts}`,
      (old.method || null) !== method && `measured with ${old.method || "not set"} → ${method || "not set"}`, (old.method_note || null) !== methodNote && `how it's measured: "${methodNote || ""}"`].filter(Boolean);
    if (ch.length) await A.logChange(id, who, `Changed "${old.name}": ${ch.join(" · ")}`);
  } else {
    await query(`INSERT INTO assess_drills (assessment_id, name, unit, better, attempts, sort, method, method_note) VALUES ($1,$2,$3,$4,$5,(SELECT coalesce(max(sort),0)+1 FROM assess_drills WHERE assessment_id=$1),$6,$7)`, [id, name, unit, better, attempts, method, methodNote]);
    await A.logChange(id, who, `Added the drill "${name}" (${unit || "no unit"}, ${better} is better, ${attempts} ${attempts === 1 ? "try" : "tries"}${method ? `, measured with ${method}` : ""})`);
  }
  await A.syncDays(id);
  go(res, back, { ok: old ? `Saved ${name}. Testing days with scores keep the drill as it was.` : `Added ${name}.` });
}));
router.post("/admin/assess/:id(\\d+)/days", auth.requireAdmin, wrap(async (req, res) => {
  const id = int(req.params.id); if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.day || "")) return go(res, `/admin/assess/${id}`, { err: "Pick the day." });
  const r = (await query(`INSERT INTO assess_days (assessment_id, day, kind, board_id) VALUES ($1,$2,$3,$4) RETURNING id`, [id, req.body.day, A.KINDS.includes(req.body.kind) ? req.body.kind : "Other", int(req.body.board_id) || null])).rows[0];
  await A.syncDays(id); await A.logChange(id, req.user.email, `Added a ${req.body.kind || "testing"} day on ${req.body.day}`);
  go(res, `/assess/days/${r.id}`, { ok: "Testing day added. Enter scores below." });
}));
router.post("/admin/assess/days/:id(\\d+)/share", auth.requireAdmin, wrap(async (req, res) => {
  const d = (await query(`UPDATE assess_days SET shared = NOT shared WHERE id=$1 RETURNING assessment_id, shared`, [int(req.params.id)])).rows[0];
  go(res, `/admin/assess/${d.assessment_id}`, { ok: d.shared ? "Shared: families can now see their own athlete's results from that day (My Account)." : "Hidden from families again." });
}));
router.post("/admin/assess/days/:id(\\d+)/delete", auth.requireAdmin, wrap(async (req, res) => {
  const d = (await query(`DELETE FROM assess_days WHERE id=$1 RETURNING assessment_id`, [int(req.params.id)])).rows[0];
  go(res, d ? `/admin/assess/${d.assessment_id}` : "/admin/assess", { ok: "Deleted the testing day and its scores." });
}));

// ---------- entering scores (admins, and coaches of the linked program) ----------
router.get("/assess/days/:id(\\d+)", auth.requireUser, wrap(async (req, res) => {
  const d = await A.day(int(req.params.id)); if (!d || !(await canEnter(req.user, d))) return go(res, "/dashboard", { err: "You can't enter scores for that." });
  const people = await A.roster(d), res0 = await A.results(d.id), mode = req.query.mode === "drill" ? "drill" : "athlete";
  const val = new Map(res0.map((r) => [`${r.athlete_id}|${r.drill_id}|${r.attempt}`, r.value]));
  const done = (aid) => d.drills.every((dr) => [...Array(dr.attempts)].some((_, i) => val.has(`${aid}|${dr.id}|${i + 1}`)));
  const nm = (p) => `${p.first_name} ${p.last_name || ""}`.trim();
  const box = (aid, dr, i) => `<input class="as-in" inputmode="decimal" autocomplete="off" data-a="${aid}" data-d="${dr.id}" data-t="${i}" value="${esc(num(val.get(`${aid}|${dr.id}|${i}`)))}" aria-label="${esc(dr.name)} try ${i}">`;
  let body;
  if (mode === "athlete") {
    const i = Math.max(0, people.findIndex((p) => p.id === int(req.query.a))), p = people[i];
    body = p ? `<div class="as-pick"><a class="sb-btn" href="?mode=athlete&a=${(people[i - 1] || people[people.length - 1]).id}" aria-label="Previous athlete">‹</a>
        <select onchange="location.search='?mode=athlete&a='+this.value" aria-label="Athlete">${people.map((x) => `<option value="${x.id}"${x.id === p.id ? " selected" : ""}>${done(x.id) ? "✓ " : ""}${esc(nm(x))}${x.team ? ` (${esc(x.team)})` : ""}</option>`).join("")}</select>
        <a class="sb-btn primary" href="?mode=athlete&a=${(people[i + 1] || people[0]).id}">Next athlete ›</a></div>
      <h2 class="as-who">${esc(nm(p))}${p.team ? ` <span class="fine">${esc(p.team)}</span>` : ""}</h2>
      <div class="as-cards">${d.drills.map((dr) => `<section class="as-card"><b>${esc(dr.name)}</b><span class="fine">${esc(dr.unit || "")}${dr.unit ? " · " : ""}${dr.better === "higher" ? "higher is better" : "lower is better"}</span>${dr.method ? `<span class="as-m">📏 ${esc(dr.method)}${dr.method_note ? ` · ${esc(dr.method_note)}` : ""}</span>` : ""}
        <div class="as-tries">${[...Array(dr.attempts)].map((_, k) => `<label><span>Try ${k + 1}</span>${box(p.id, dr, k + 1)}</label>`).join("")}</div></section>`).join("")}</div>` : `<p class="muted">No athletes to test. Link the testing day to a program with athletes on it.</p>`;
  } else {
    const dr = d.drills.find((x) => x.id === int(req.query.drill)) || d.drills[0];
    body = dr ? `<div class="as-pick"><select onchange="location.search='?mode=drill&drill='+this.value" aria-label="Drill">${d.drills.map((x) => `<option value="${x.id}"${x.id === dr.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <span class="fine">${esc(dr.unit || "")}${dr.unit ? " · " : ""}${dr.better === "higher" ? "higher is better" : "lower is better"}</span>${dr.method ? `<span class="as-m">📏 ${esc(dr.method)}${dr.method_note ? ` · ${esc(dr.method_note)}` : ""}</span>` : ""}</div>
      <div class="table-wrap"><table class="r-table as-grid" data-nosort><thead><tr><th>Athlete</th>${[...Array(dr.attempts)].map((_, k) => `<th>Try ${k + 1}</th>`).join("")}</tr></thead><tbody>
        ${people.map((p) => `<tr><td><b>${esc(nm(p))}</b>${p.team ? ` <span class="fine">${esc(p.team)}</span>` : ""}</td>${[...Array(dr.attempts)].map((_, k) => `<td>${box(p.id, dr, k + 1)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">This assessment has no drills yet.</p>`;
  }
  const tested = people.filter((p) => done(p.id)).length;
  res.send(layout({ title: `Scores · ${d.assessment}`, user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), tab: "checkin", dash: true,
    body: `<div class="d-wrap">${auth.isAdmin(req.user) ? `<nav class="back-row"><a class="back-btn" href="/admin/assess/${d.assessment_id}">${ARROW}${esc(d.assessment)}</a></nav>` : ""}
    <section class="bh2"><div class="bh2-l"><div><div class="bh2-t"><h1>${esc(d.kind)} · ${esc(d.assessment)}</h1></div><span class="bh2-meta">${esc(fmtDay(d.day))}${d.board ? ` · ${esc(d.board)}` : ""} · <span id="as-n">${tested}</span> of ${people.length} fully tested</span></div></div></section>
    <nav class="sub-tabs"><a href="?mode=athlete"${mode === "athlete" ? ' aria-current="page"' : ""}>By athlete</a><a href="?mode=drill"${mode === "drill" ? ' aria-current="page"' : ""}>By drill (station)</a></nav>
    <div class="sub-body"><section class="d-card as-body">${body}<p class="fine as-note">Scores save as you type (✓ = saved). Clear a box to remove that try.</p></section></div></div>
    <script>(function () { var t = {};
      function save(el) { el.classList.remove("ok", "bad"); el.classList.add("busy");
        fetch("/assess/days/${d.id}/save", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({ athlete: el.dataset.a, drill: el.dataset.d, attempt: el.dataset.t, value: el.value.trim() }) })
          .then(function (r) { return r.json(); }).then(function (j) { el.classList.remove("busy"); el.classList.add(j.ok ? "ok" : "bad"); el.title = j.ok ? "Saved" : (j.err || "Not saved"); if (j.ok && j.tested != null) document.getElementById("as-n").textContent = j.tested; })
          .catch(function () { el.classList.remove("busy"); el.classList.add("bad"); el.title = "Not saved: check the connection"; }); }
      document.addEventListener("input", function (e) { var el = e.target; if (!el.classList.contains("as-in")) return; clearTimeout(t[el.dataset.a + el.dataset.d + el.dataset.t]); t[el.dataset.a + el.dataset.d + el.dataset.t] = setTimeout(function () { save(el); }, 600); });
      document.addEventListener("keydown", function (e) { var el = e.target; if (e.key !== "Enter" || !el.classList.contains("as-in")) return; e.preventDefault(); var all = [].slice.call(document.querySelectorAll(".as-in")), n = all[all.indexOf(el) + 1]; if (n) n.focus(); });
    })();</script>` }));
}));
router.post("/assess/days/:id(\\d+)/save", auth.requireUser, wrap(async (req, res) => {
  const d = await A.day(int(req.params.id)); if (!d || !(await canEnter(req.user, d))) return res.status(403).json({ ok: false, err: "Not allowed." });
  const dr = d.drills.find((x) => x.id === int(req.body.drill)), t = int(req.body.attempt);
  if (!dr || !(t >= 1 && t <= dr.attempts)) return res.json({ ok: false, err: "Unknown drill or try." });
  try { await A.save(d.id, int(req.body.athlete), dr.id, t, str(req.body.value), req.user.id); } catch (e) { return res.json({ ok: false, err: e.message }); }
  const people = await A.roster(d), r = await A.results(d.id), have = new Set(r.map((x) => `${x.athlete_id}|${x.drill_id}`));
  res.json({ ok: true, tested: people.filter((p) => d.drills.every((x) => have.has(`${p.id}|${x.id}`))).length });
}));

// ---------- an athlete's history (admins: People → the athlete; families: shared days only) ----------
function historyHtml(hist, how = "best") {
  if (!hist.length) return `<p class="muted">No assessment results yet.</p>`;
  return hist.map((h) => `<section class="as-hist"><h3>${esc(h.name)}</h3><div class="table-wrap"><table class="r-table" data-nosort><thead><tr><th>Drill</th>${h.days.map((d) => `<th>${esc(d.kind)}<span class="em-why">${esc(fmtDay(d.day))}</span></th>`).join("")}<th>Change</th></tr></thead><tbody>
    ${h.drills.map((dr) => { const sc = h.days.map((d) => { const own = (d.drills || []).find((x) => x.id === dr.id) || dr; return A.score(d.vals.filter((v) => v.drill_id === dr.id).map((v) => v.value), own, how); }); const first = sc.find((x) => x != null), last = [...sc].reverse().find((x) => x != null), ch = A.change(first, last, dr);
      const ms = [...new Set(h.days.filter((d) => d.vals.some((v) => v.drill_id === dr.id)).map((d) => ((d.drills || []).find((x) => x.id === dr.id) || {}).method).filter(Boolean))];
      return `<tr><td><b>${esc(dr.name)}</b><span class="em-why">${esc(dr.unit || "")}${dr.unit ? " · " : ""}${dr.better === "higher" ? "higher is better" : "lower is better"}</span>${ms.length ? `<span class="em-why">📏 ${esc(ms.join(" → "))}${ms.length > 1 ? " (method changed)" : ""}</span>` : ""}</td>${sc.map((x) => `<td class="r-num">${x == null ? "—" : x}</td>`).join("")}
        <td class="r-num">${ch.diff == null || sc.filter((x) => x != null).length < 2 ? "—" : `<span class="as-ch ${ch.diff > 0 ? "up" : ch.diff < 0 ? "down" : ""}">${ch.diff > 0 ? "▲" : ch.diff < 0 ? "▼" : "="} ${Math.abs(ch.diff)}${ch.pct != null ? ` (${Math.abs(ch.pct)}%)` : ""}</span>`}</td></tr>`; }).join("")}</tbody></table></div></section>`).join("");
}
router.get("/admin/assess/athlete/:id(\\d+)", auth.requireAdmin, wrap(async (req, res) => {
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [int(req.params.id)])).rows[0]; if (!p) return go(res, "/admin/people", { err: "Not found." });
  const how = req.query.how === "avg" ? "avg" : "best";
  res.send(page({ title: `${p.first_name} · assessments`, tab: "people", user: req.user, flash: flashFrom(req), wide: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/people/${p.id}">${ARROW}${esc(p.first_name)} ${esc(p.last_name || "")}</a></nav>${await head("people")}
    <div class="sub-top"><h2>${esc(p.first_name)} ${esc(p.last_name || "")} · Assessments</h2></div><section class="panel">
      <nav class="r-chips"><a href="?how=best"${how === "best" ? ' class="on"' : ""}>Best try</a><a href="?how=avg"${how === "avg" ? ' class="on"' : ""}>Average of tries</a></nav><br>
      ${historyHtml(await A.history(p.id), how)}<p class="fine">Change compares the first and latest results; ▲ is better, whichever direction the drill counts as better.</p></section>` }));
}));
router.get("/account/results", auth.requireUser, wrap(async (req, res) => {
  const kids = (await query(`SELECT a.id, a.first_name, a.last_name FROM athletes a WHERE a.archived_at IS NULL AND (a.self_user_id=$1 OR a.id IN (SELECT athlete_id FROM parent_athletes WHERE user_id=$1)) AND a.kind='athlete' ORDER BY a.first_name`, [req.user.id])).rows;
  const blocks = []; for (const k of kids) { const h = await A.history(k.id, { sharedOnly: true }); if (h.length) blocks.push(`<h2 class="as-who">${esc(k.first_name)} ${esc(k.last_name || "")}</h2>${historyHtml(h)}`); }
  res.send(layout({ title: "Assessment results", user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), tab: "account", dash: true,
    body: `<div class="d-wrap"><nav class="back-row"><a class="back-btn" href="/account">${ARROW}My Account</a></nav><section class="bh2"><div class="bh2-l"><div><div class="bh2-t"><h1>Assessment results</h1></div><span class="bh2-meta">Results the club has shared</span></div></div></section>
    <div class="sub-body"><section class="d-card as-body">${blocks.join("") || `<p class="muted">No results have been shared yet.</p>`}<p class="fine">▲ means better since the first result (best of the tries).</p></section></div></div>` }));
}));
module.exports = router;
