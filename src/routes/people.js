// ⚙ App settings → People: the directory of everyone (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const PP = require("../people");
const v = require("../views/people");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
// the App Settings header (with fresh counts) for these pages
const AHead = async () => { const AH = require("../views/apphead"), c = await AH.counts(); return (o = {}) => AH.appHeader({ c, ...o }); };
router.use(auth.requireAdmin);
const clean = (x, n) => str(x).replace(/\s+/g, " ").slice(0, n);
const ROLES = ["parent", "coach", "volunteer"];

// Everyone, with what they're connected to
async function directory() {
  return (await query(`SELECT a.*,
      ARRAY(SELECT sc.name FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id WHERE m.athlete_id=a.id AND sc.archived_at IS NULL ORDER BY sc.name) AS boards,
      ARRAY(SELECT trim(k.first_name||' '||k.last_name) FROM parent_athletes pa JOIN athletes k ON k.id=pa.athlete_id WHERE a.self_user_id IS NOT NULL AND pa.user_id=a.self_user_id ORDER BY k.first_name) AS kids,
      ARRAY(SELECT coalesce(nullif(trim(p.first_name||' '||p.last_name),''), u.email) FROM parent_athletes pa JOIN users u ON u.id=pa.user_id
            LEFT JOIN athletes p ON p.self_user_id=u.id AND p.kind='adult' WHERE pa.athlete_id=a.id AND a.kind='athlete' ORDER BY 1) AS parents,
      ARRAY(SELECT sc.name FROM schedule_coaches c JOIN schedules sc ON sc.id=c.schedule_id WHERE a.email IS NOT NULL AND lower(c.email)=lower(a.email) ORDER BY sc.name) AS coaching,
      ARRAY(SELECT m.list_id FROM people_list_members m WHERE m.athlete_id=a.id) AS list_ids,
      u.invited_at, u.joined_at, u.last_login_at, u.setup_required
    FROM athletes a LEFT JOIN users u ON u.id=a.self_user_id WHERE a.archived_at IS NULL ORDER BY lower(a.last_name), lower(a.first_name), a.id`)).rows;
}

router.get("/", wrap(async (req, res) => {
  const all = await directory();
  const f = { q: str(req.query.q).toLowerCase(), kind: str(req.query.kind), role: str(req.query.role), team: str(req.query.team), status: str(req.query.status), batch: int(req.query.batch) || 0, list: int(req.query.list) || 0 };
  const batchRow = f.batch ? await IM().batch(f.batch) : null, batchIds = batchRow ? new Set(batchRow.people) : null;
  const shown = all.filter((p) => (!f.q || `${p.first_name} ${p.last_name} ${p.email || ""} ${p.phone || ""}`.toLowerCase().includes(f.q))
    && (!f.list || (p.list_ids || []).includes(f.list))
    && (!f.kind || p.kind === f.kind) && (!f.role || (p.roles || []).includes(f.role)) && (!f.team || p.team === f.team) && (!f.status || PP.statusOf(p) === f.status) && (!batchIds || batchIds.has(p.id)));
  const teams = [...new Set(all.map((p) => p.team).filter(Boolean))].sort(), groups = [];
  const waiting = (await query(`SELECT count(*)::int AS n FROM account_requests WHERE status='waiting'`)).rows[0].n;
  res.send(v.directoryPage({ waiting, head: await AHead(), user: req.user, flash: flashFrom(req), people: shown, total: all.length, f, teams, groups, lists: await PP.lists() }));
}));

function readPerson(b, kind) {
  const out = { first_name: clean(b.first_name, 40), last_name: clean(b.last_name, 40), team: clean(b.team, 40) || null,
    notes: String(b.notes || "").trim().slice(0, 1000) || null };
  if (kind === "athlete") Object.assign(out, { birth_year: int(b.birth_year) || null, jersey: clean(b.jersey, 6) || null });
  else Object.assign(out, { email: auth.normalizeEmail(b.email) || null, phone: clean(b.phone, 30) || null, organization: clean(b.organization, 80) || null,
    roles: [].concat(b.roles || []).filter((r) => ROLES.includes(r)) });
  return out;
}

router.post("/", wrap(async (req, res) => {
  const kind = req.body.kind === "adult" ? "adult" : "athlete";
  const p = readPerson(req.body, kind);
  if (!p.first_name || !p.last_name) return go(res, "/admin/people#add", { err: "Enter a first and last name." });
  let id;
  if (kind === "adult" && p.email) {
    if (!auth.isValidEmail(p.email)) return go(res, "/admin/people#add", { err: "That email doesn't look right." });
    const { person } = await PP.ensureAdult(p.email, { first: p.first_name, last: p.last_name });
    id = person.id;
    await query(`UPDATE athletes SET first_name=$2, last_name=$3, phone=$4, organization=$5, roles=$6, team=$7, notes=$8 WHERE id=$1`,
      [id, p.first_name, p.last_name, p.phone, p.organization, p.roles, p.team, p.notes]);
  } else {
    id = (await query(`INSERT INTO athletes (kind, first_name, last_name, team, notes, birth_year, jersey, email, phone, organization, roles)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [kind, p.first_name, p.last_name, p.team, p.notes, p.birth_year || null, p.jersey || null, p.email || null, p.phone || null, p.organization || null, p.roles || []])).rows[0].id;
  }
  // a new athlete's parents, by email
  if (kind === "athlete") for (const e of String(req.body.parent_emails || "").split(/[\s,;]+/).map(auth.normalizeEmail).filter(auth.isValidEmail)) await PP.linkParent(id, e);
  go(res, `/admin/people/${id}`, { ok: `Added ${p.first_name} ${p.last_name}.` });
}));

// ---------- lists ----------
const back = (b, extra = "") => `/admin/people?${new URLSearchParams(Object.fromEntries(Object.entries({ list: b.list || "", ...extra }).filter(([, x]) => x)))}`;
router.post("/lists", wrap(async (req, res) => {
  const l = await PP.listNamed(req.body.name);
  if (!l) return go(res, "/admin/people", { err: "Give the list a name." });
  go(res, `/admin/people?list=${l.id}`, { ok: `List "${l.name}" is ready. Check people and use Add to list, or import a file into it.` });
}));
router.post("/lists/:id", wrap(async (req, res) => {
  const id = int(req.params.id), name = clean(req.body.name, 60);
  if (!name) return go(res, `/admin/people?list=${id}`, { err: "Enter a name." });
  const dup = (await query(`SELECT 1 FROM people_lists WHERE lower(name)=lower($1) AND id<>$2`, [name, id])).rowCount;
  if (dup) return go(res, `/admin/people?list=${id}`, { err: `There's already a list called ${name}.` });
  await query(`UPDATE people_lists SET name=$2 WHERE id=$1`, [id, name]);
  go(res, `/admin/people?list=${id}`, { ok: `Renamed to ${name}.` });
}));
router.post("/lists/:id/delete", wrap(async (req, res) => {
  const l = (await query(`DELETE FROM people_lists WHERE id=$1 RETURNING name`, [int(req.params.id)])).rows[0];
  go(res, "/admin/people", { ok: l ? `Deleted the list "${l.name}". The people on it are still in People.` : "Deleted." });
}));
// Check people, then add them to a list, move them from the list you're viewing to another, or take them off it
router.post("/bulk", wrap(async (req, res) => {
  const b = req.body;
  const ids = [].concat(b.ids || []).map(int).filter(Boolean);
  const from = int(b.list) || 0;
  if (!ids.length) return go(res, back(b), { err: "Check at least one person first." });
  let target = int(b.target) || 0;
  if (b.target === "new") { const l = await PP.listNamed(b.new_name); if (!l) return go(res, back(b), { err: "Name the new list." }); target = l.id; }
  const tname = target ? ((await query(`SELECT name FROM people_lists WHERE id=$1`, [target])).rows[0] || {}).name : null;
  const n = `${ids.length} ${ids.length === 1 ? "person" : "people"}`;
  if (b.action === "add") {
    if (!tname) return go(res, back(b), { err: "Pick a list to add them to." });
    await PP.addToList(target, ids);
    return go(res, back(b), { ok: `Added ${n} to ${tname}.` });
  }
  if (b.action === "move") {
    if (!from) return go(res, back(b), { err: "Open the list you're moving people from first." });
    if (!tname) return go(res, back(b), { err: "Pick the list to move them to." });
    await PP.addToList(target, ids);
    if (target !== from) await query(`DELETE FROM people_list_members WHERE list_id=$1 AND athlete_id = ANY($2)`, [from, ids]);
    return go(res, `/admin/people?list=${target}`, { ok: `Moved ${n} to ${tname}.` });
  }
  if (b.action === "invite") {
    const A = require("../accounts"); let sent = 0, skipped = 0;
    for (const id of ids) { const { u } = await accountFor(id); if (!u) { skipped++; continue; } await A.sendInvite(req, u.id); sent++; }
    return go(res, back(b), { ok: `Sent ${sent} invite${sent === 1 ? "" : "s"}.${skipped ? ` Skipped ${skipped} (athletes, or no email).` : ""}` });
  }
  if (b.action === "remove") {
    if (!from) return go(res, back(b), { err: "Open a list to take people off it." });
    await query(`DELETE FROM people_list_members WHERE list_id=$1 AND athlete_id = ANY($2)`, [from, ids]);
    return go(res, back(b), { ok: `Took ${n} off the list. They're still in People.` });
  }
  go(res, back(b), {});
}));
// One person's lists (from their page)
router.post("/:id/lists", wrap(async (req, res) => {
  const id = int(req.params.id);
  if (req.body.remove) await query(`DELETE FROM people_list_members WHERE list_id=$1 AND athlete_id=$2`, [int(req.body.remove), id]);
  else {
    const l = req.body.list === "new" ? await PP.listNamed(req.body.new_name) : (await query(`SELECT * FROM people_lists WHERE id=$1`, [int(req.body.list)])).rows[0];
    if (!l) return go(res, `/admin/people/${id}#lists`, { err: "Pick a list." });
    await PP.addToList(l.id, [id]);
  }
  go(res, `/admin/people/${id}#lists`, { ok: "Saved." });
}));

// ---------- import into the directory (no board) ----------
const CSV = require("../csv");
const H = () => require("./members").importHelpers;
// ---------- import: 1 the file · 2 match the columns + review pop-up · 3 the result ----------
const IM = () => require("../peopleImport"), IV = () => require("../views/peopleImport");
const KINDS = ["athlete", "adult", "mixed"];
router.get("/import", wrap(async (req, res) => res.send(IV().step1Page({ user: req.user, flash: flashFrom(req), head: await AHead() }))));
router.post("/import/preview", wrap(async (req, res) => {
  const rows = CSV.parse(req.body.data || "");
  if (rows.length < 2) return go(res, "/admin/people/import", { err: "That file has no rows under its headings. Make sure the first row is the column names." });
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : "athlete", headers = rows[0];
  // the columns: what was just chosen, else how this kind of file was matched last time, else a guess
  let map, remembered = false;
  if (req.body.mapped) map = IM().mapFrom(req.body, headers);
  else { const saved = await IM().savedMap(headers); if (saved) { map = saved.map; remembered = true; } else map = IM().guess(headers); }
  const people = await IM().analyze(IM().toRows(rows.slice(1), map, kind));
  res.send(IV().mapPage({ user: req.user, flash: flashFrom(req), head: await AHead(), headers, map, kind, data: req.body.data, rows: people, counts: IM().counts(people),
    lists: await PP.lists(), remembered, openReview: false }));
}));
// the review pop-up's Re-check
router.post("/import/check", wrap(async (req, res) => {
  let rows = []; try { rows = JSON.parse(req.body.rows || "[]"); } catch (e) { return res.status(400).json({ ok: false }); }
  rows = await IM().analyze(rows);
  res.json({ ok: true, rows, counts: IM().counts(rows) });
}));
router.post("/import/commit", wrap(async (req, res) => {
  let rows = [], headers = [], map = null;
  try { rows = JSON.parse(req.body.rows || "[]"); headers = JSON.parse(req.body.headers || "[]"); map = JSON.parse(req.body.map || "null"); } catch (e) { return go(res, "/admin/people/import", { err: "Something went wrong reading the review. Start the import again." }); }
  try {
    const out = await IM().commit(rows, { toLists: [].concat(req.body.to_lists || []), newLists: str(req.body.new_lists),
      pLists: [].concat(req.body.p_lists || []), pNewLists: str(req.body.p_new_lists), by: req.user.email });
    if (map && headers.length) await IM().saveMap(headers, map, KINDS.includes(req.body.kind) ? req.body.kind : "athlete");   // next time a file like this lines up by itself
    go(res, `/admin/people/import/${out.batch}`, { ok: `Imported ${out.summary.imported} ${out.summary.imported === 1 ? "person" : "people"}.` });
  } catch (e) { go(res, "/admin/people/import", { err: e.message }); }
}));
router.get("/import/:batch(\\d+)", wrap(async (req, res) => {
  const b = await IM().batch(int(req.params.batch)); if (!b) return go(res, "/admin/people", { err: "Not found." });
  const compare = str(req.query.compare), missing = compare ? await IM().missing(b, compare) : null;
  res.send(IV().resultPage({ user: req.user, flash: flashFrom(req), head: await AHead(), b, invite: b.undone_at ? 0 : (await IM().invitable(b)).length, undoable: IM().canUndo(b),
    lists: await PP.lists(), compare, missing }));
}));
router.post("/import/:batch(\\d+)/invite", wrap(async (req, res) => {
  const b = await IM().batch(int(req.params.batch)); if (!b) return go(res, "/admin/people", {});
  const list = await IM().invitable(b);
  for (const x of list) await require("../accounts").sendInvite(req, x.user_id);
  go(res, `/admin/people/import/${b.id}`, { ok: `Invited ${list.length} ${list.length === 1 ? "person" : "people"}. Their links work for 7 days.` });
}));
router.post("/import/:batch(\\d+)/missing", wrap(async (req, res) => {
  const bid = int(req.params.batch), ids = [].concat(req.body.ids || []), back = `/admin/people/import/${bid}?compare=${encodeURIComponent(str(req.body.compare))}#missing`;
  if (!ids.length) return go(res, back, { err: "Tick at least one person." });
  try {
    if (req.body.act === "archive") { const r = await IM().archiveMissing(ids, req.body.also_parents === "1");
      return go(res, back, { ok: `Archived ${r.people} ${r.people === 1 ? "person" : "people"}${r.parents ? ` and ${r.parents} parent${r.parents === 1 ? "" : "s"}/guardian${r.parents === 1 ? "" : "s"}` : ""}. They can be brought back from People → Archived.` }); }
    const l = await IM().listMissing(ids, int(req.body.list_id), str(req.body.new_list));
    go(res, back, { ok: `Put ${ids.length} ${ids.length === 1 ? "person" : "people"} on ${l.name}.` });
  } catch (e) { go(res, back, { err: e.message }); }
}));
router.post("/import/:batch(\\d+)/undo", wrap(async (req, res) => {
  try { const r = await IM().undoBatch(int(req.params.batch));
    go(res, `/admin/people/import/${req.params.batch}`, { ok: `Undone. Removed ${r.removed} ${r.removed === 1 ? "person" : "people"} it added${r.kept ? `; kept ${r.kept} who were put on a board or linked since` : ""}, and put changed details back.` });
  } catch (e) { go(res, `/admin/people/import/${req.params.batch}`, { err: e.message }); }
}));

// ---------- Communication: every email, its wording, and the branding ----------
const ET = () => require("../emailTemplates"), CV = () => require("../views/communication");
router.get("/communication", wrap(async (req, res) => {
  const all = await Promise.all(ET().TEMPLATES.map((t) => ET().get(t.key)));
  res.send(CV().listPage({ user: req.user, flash: flashFrom(req), head: await AHead(), templates: all, brand: await ET().brand(), logo: (await require("../appimages").urls()).email_logo }));
}));
router.post("/communication/brand", wrap(async (req, res) => {
  const b = req.body, hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(str(v)) ? str(v) : d), D = ET().BRAND_DEFAULTS;
  const names = [].concat(b.var_name || []), vals = [].concat(b.var_value || []);
  const vars = names.map((n, i) => ({ name: str(n).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 40), value: str(vals[i]).slice(0, 300) })).filter((x) => x.name);
  const reserved = new Set(["org_name", "app_name", "app_link", ...ET().TEMPLATES.flatMap((t) => t.vars.map((v) => v[0]))]);
  const clash = vars.find((x) => reserved.has(x.name));
  if (clash) return go(res, "/admin/people/communication#brand", { err: `{{${clash.name}}} is already used by the app. Pick another name for your variable.` });
  const reply = str(b.reply_to).toLowerCase();
  if (reply && !auth.isValidEmail(reply)) return go(res, "/admin/people/communication#brand", { err: "The reply-to address isn't a valid email." });
  await ET().saveBrand({ header_color: hex(b.header_color, D.header_color), button_color: hex(b.button_color, D.button_color), button_text: hex(b.button_text, D.button_text),
    sender_name: str(b.sender_name).slice(0, 60), reply_to: reply, footer: String(b.footer || "").replace(/\r/g, "").trim().slice(0, 600), logo_app: b.logo_app === "1", vars });
  try { if (b.remove_logo === "1") await require("../appimages").set("email_logo", null); else if (b.logo_data) await require("../appimages").set("email_logo", b.logo_data); }
  catch (e) { return go(res, "/admin/people/communication#brand", { err: e.message }); }
  go(res, "/admin/people/communication#brand", { ok: "Saved the branding. Every email uses it." });
}));
router.get("/communication/:key", wrap(async (req, res) => {
  const t = await ET().get(req.params.key); if (!t) return go(res, "/admin/people/communication", { err: "Not found." });
  res.send(CV().editPage({ user: req.user, flash: flashFrom(req), head: await AHead(), t, brand: await ET().brand() }));
}));
const draftOf = (b) => ({ subject: str(b.subject).slice(0, 200), heading: str(b.heading).slice(0, 200), body: String(b.body || "").replace(/\r/g, "").slice(0, 6000), buttonLabel: b.button_label == null ? null : str(b.button_label).slice(0, 60) });
router.post("/communication/:key", wrap(async (req, res) => {
  const t = await ET().get(req.params.key); if (!t) return go(res, "/admin/people/communication", { err: "Not found." });
  const d = draftOf(req.body); if (!d.subject) return go(res, `/admin/people/communication/${t.key}`, { err: "Give the email a subject." });
  await ET().save(t.key, d, req.user.email);
  go(res, `/admin/people/communication/${t.key}`, { ok: `Saved “${t.name}”.` });
}));
router.post("/communication/:key/reset", wrap(async (req, res) => {
  const t = await ET().get(req.params.key); if (!t) return go(res, "/admin/people/communication", {});
  await ET().reset(t.key); go(res, `/admin/people/communication/${t.key}`, { ok: `“${t.name}” is back to the default wording.` });
}));
// the editor's live preview, and "Send me a test" (both use sample values; nothing is saved)
router.post("/communication/:key/preview", wrap(async (req, res) => {
  const t = ET().byKey[req.params.key]; if (!t) return res.status(404).json({ ok: false });
  const r = await ET().render(t.key, ET().SAMPLE, draftOf(req.body));
  res.json({ ok: true, subject: r.subject, html: r.html });
}));
router.post("/communication/:key/test", wrap(async (req, res) => {
  const t = ET().byKey[req.params.key]; if (!t) return res.status(404).json({ ok: false });
  // from the list: the saved email, to any address; from the editor: what's on screen, to you (or the address given)
  const to = str(req.body.to).toLowerCase() || req.user.email;
  if (!auth.isValidEmail(to)) return res.status(400).json({ ok: false, error: "That isn't a valid email." });
  const r = req.body.saved ? await ET().render(t.key, ET().SAMPLE) : await ET().render(t.key, ET().SAMPLE, draftOf(req.body));
  await require("../email").sendEmail({ to, subject: `[Test] ${r.subject}`, html: r.html, text: r.text, replyTo: r.replyTo, fromName: r.fromName });
  res.json({ ok: true, to, sent: !!process.env.RESEND_API_KEY, held: !!req.shadow });
}));

// ---------- merge a duplicate into this person ----------
// ---------- Clean up: sign-ins unused for a year ----------
router.get("/cleanup", wrap(async (req, res) => res.send(IV().cleanupPage({ user: req.user, flash: flashFrom(req), head: await AHead(), rows: await PP.cleanupList(req.user.id) }))));
router.post("/cleanup", wrap(async (req, res) => {
  let act = req.body.act, ids = [].concat(req.body.ids || []);
  if (req.body.one) { const [a, id] = String(req.body.one).split(":"); act = a; ids = [id]; }
  if (!ids.length) return go(res, "/admin/people/cleanup", { err: "Tick at least one person." });
  if (act === "keep") { const n = await PP.cleanupKeep(ids); return go(res, "/admin/people/cleanup", { ok: `Kept ${n}. ${n === 1 ? "They" : "They"} won't show here for a year.` }); }
  if (act === "delete") { const r = await PP.cleanupDelete(ids, req.user.id);
    return go(res, "/admin/people/cleanup", { ok: `Deleted ${r.deleted}${r.archived ? `; archived ${r.archived} with past claims (their history stays in Reports)` : ""}.` }); }
  go(res, "/admin/people/cleanup", {});
}));

router.get("/:id(\\d+)/merge", wrap(async (req, res) => {
  const keep = (await query(`SELECT * FROM athletes WHERE id=$1 AND archived_at IS NULL`, [int(req.params.id)])).rows[0];
  if (!keep) return go(res, "/admin/people", { err: "Not found." });
  const esc = require("../views/layout").esc, nameOf = (p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || `#${p.id}`;
  const others = (await query(`SELECT a.id, a.first_name, a.last_name, a.email, a.team, a.birth_year FROM athletes a WHERE a.archived_at IS NULL AND a.kind=$1 AND a.id<>$2
    ORDER BY (lower(a.last_name)=lower($3)) DESC, lower(a.last_name), lower(a.first_name)`, [keep.kind, keep.id, keep.last_name || ""])).rows;
  const dupId = int(req.query.with), dup = dupId && others.find((o) => o.id === dupId);
  const pv = dup ? await PP.mergePreview(keep.id, dup.id) : null;
  res.send(require("../views/admin").page({ title: `Merge into ${nameOf(keep)}`, tab: "people", user: req.user, flash: flashFrom(req), xwide: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/people/${keep.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>${esc(nameOf(keep))}</a></nav>${(await AHead())({ active: "people" })}<div class="sub-top"><h2>Merge a duplicate into ${esc(nameOf(keep))}</h2></div>
    <section class="panel mg">
      <p class="fine">Pick the duplicate. Everything that belongs to it moves to <b>${esc(nameOf(keep))}</b>, which you keep: claims, boards (with their group and tags), parents/guardians, lists, and their sign-in. Details ${esc(keep.first_name || "they")} is missing are filled in from the duplicate, and the duplicate is archived. This can't be undone.</p>
      <form method="get" action="/admin/people/${keep.id}/merge" class="mg-pick"><label class="field-l"><span>The duplicate</span>
        <select name="with" onchange="this.form.submit()"><option value="">Choose…</option>${others.map((o) => `<option value="${o.id}"${o.id === dupId ? " selected" : ""}>${esc(nameOf(o))}${o.birth_year ? ` · ${o.birth_year}` : ""}${o.team ? ` · ${esc(o.team)}` : ""}${o.email && nameOf(o) !== o.email ? ` · ${esc(o.email)}` : ""}</option>`).join("")}</select></label></form>
      ${dup ? `<div class="mg-pv"><h3>${esc(nameOf(dup))} → ${esc(nameOf(keep))}</h3><ul>
        <li><b>${pv.claims}</b> claim${pv.claims === 1 ? "" : "s"} move${pv.sameClaims ? ` (${pv.sameClaims} for spots ${esc(keep.first_name || "they")} already has are dropped)` : ""}</li>
        <li><b>${pv.boards}</b> board${pv.boards === 1 ? "" : "s"} · <b>${pv.parents}</b> parent${pv.parents === 1 ? "" : "s"}/guardian${pv.parents === 1 ? "" : "s"} · <b>${pv.lists}</b> list${pv.lists === 1 ? "" : "s"}</li></ul>
        <form method="post" action="/admin/people/${keep.id}/merge" onsubmit="return confirm('Merge ${esc(nameOf(dup)).replace(/'/g, "")} into ${esc(nameOf(keep)).replace(/'/g, "")}? This can\\'t be undone.');">
          <input type="hidden" name="dup_id" value="${dup.id}"><button class="sb-btn primary" type="submit">Merge into ${esc(nameOf(keep))}</button></form></div>` : ""}
    </section>` }));
}));
router.post("/:id(\\d+)/merge", wrap(async (req, res) => {
  const keepId = int(req.params.id), dupId = int(req.body.dup_id);
  try { await PP.merge(keepId, dupId); go(res, `/admin/people/${keepId}`, { ok: "Merged. The duplicate is archived, and everything that was theirs is here now." }); }
  catch (e) { go(res, `/admin/people/${keepId}/merge?with=${dupId}`, { err: e.message }); }
}));

router.get("/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p) return go(res, "/admin/people", { err: "Not found." });
  const boards = (await query(`SELECT sc.id, sc.name, sc.archived_at, m.group_name, m.tags,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=sc.id AND c.athlete_id=$1 AND c.status='confirmed') AS claims
    FROM schedule_members m JOIN schedules sc ON sc.id=m.schedule_id WHERE m.athlete_id=$1 ORDER BY sc.archived_at NULLS FIRST, sc.name`, [id])).rows;
  const claimedElsewhere = (await query(`SELECT sc.id, sc.name, count(*)::int AS claims FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id
    WHERE c.athlete_id=$1 AND c.status='confirmed' AND NOT EXISTS (SELECT 1 FROM schedule_members m WHERE m.schedule_id=sc.id AND m.athlete_id=$1) GROUP BY sc.id, sc.name`, [id])).rows;
  const parents = p.kind === "athlete" ? (await query(`SELECT u.id AS user_id, u.email, ad.id AS person_id, ad.first_name, ad.last_name, ad.phone
      FROM parent_athletes pa JOIN users u ON u.id=pa.user_id LEFT JOIN athletes ad ON ad.self_user_id=u.id AND ad.kind='adult' WHERE pa.athlete_id=$1 ORDER BY u.email`, [id])).rows : [];
  const kids = p.kind === "adult" && p.self_user_id ? (await query(`SELECT k.* FROM parent_athletes pa JOIN athletes k ON k.id=pa.athlete_id WHERE pa.user_id=$1 ORDER BY k.first_name`, [p.self_user_id])).rows : [];
  const athletes = p.kind === "adult" ? (await query(`SELECT id, first_name, last_name, team FROM athletes WHERE kind='athlete' AND archived_at IS NULL ORDER BY lower(last_name), lower(first_name)`)).rows : [];
  const allBoards = (await query(`SELECT id, name FROM schedules WHERE archived_at IS NULL ORDER BY name`)).rows;
  const coaching = p.email ? (await query(`SELECT schedule_id FROM schedule_coaches WHERE lower(email)=lower($1)`, [p.email])).rows.map((r) => r.schedule_id) : [];
  const mine = (await query(`SELECT l.* FROM people_list_members m JOIN people_lists l ON l.id=m.list_id WHERE m.athlete_id=$1 ORDER BY lower(l.name)`, [id])).rows;
  const acct = p.self_user_id ? (await query(`SELECT * FROM users WHERE id=$1`, [p.self_user_id])).rows[0] : null;
  const history = acct || p.email ? (await query(`SELECT * FROM login_events WHERE user_id=$1 OR (user_id IS NULL AND lower(identity)=lower($2)) ORDER BY at DESC LIMIT 25`, [acct ? acct.id : 0, p.email || ""])).rows : [];
  const allTeams = [...new Set((await query(`SELECT unnest(groups) AS g FROM schedules WHERE archived_at IS NULL`)).rows.map((r) => r.g))].sort();
  res.send(v.personPage({ head: await AHead(), user: req.user, flash: flashFrom(req), p, boards, claimedElsewhere, parents, kids, athletes, allBoards, coaching, mine, lists: await PP.lists(), allTeams, acct, history }));
}));

router.post("/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const cur = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!cur) return go(res, "/admin/people", { err: "Not found." });
  const p = readPerson(req.body, cur.kind);
  if (!p.first_name || !p.last_name) return go(res, `/admin/people/${id}`, { err: "Enter a first and last name." });
  if (cur.kind === "adult") {
    if (p.email && !auth.isValidEmail(p.email)) return go(res, `/admin/people/${id}`, { err: "That email doesn't look right." });
    let uid = cur.self_user_id;
    if (p.email && p.email !== (cur.email || "")) uid = (await auth.findOrCreateUser(p.email)).id;
    await query(`UPDATE athletes SET first_name=$2, last_name=$3, email=$4, phone=$5, organization=$6, roles=$7, team=$8, notes=$9, self_user_id=$10 WHERE id=$1`,
      [id, p.first_name, p.last_name, p.email, p.phone, p.organization, p.roles, p.team, p.notes, uid]);
  } else {
    await query(`UPDATE athletes SET first_name=$2, last_name=$3, team=$4, notes=$5, birth_year=$6, jersey=$7 WHERE id=$1`,
      [id, p.first_name, p.last_name, p.team, p.notes, p.birth_year, p.jersey]);
  }
  go(res, `/admin/people/${id}`, { ok: "Saved." });
}));

// Family: a parent for an athlete (by email), or a kid for an adult
router.post("/:id/family", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p) return go(res, "/admin/people", {});
  if (p.kind === "athlete") {
    const e = auth.normalizeEmail(req.body.email);
    if (!auth.isValidEmail(e)) return go(res, `/admin/people/${id}#family`, { err: "Enter the parent/guardian's email." });
    await PP.linkParent(id, e);
    return go(res, `/admin/people/${id}#family`, { ok: `Linked ${e}.` });
  }
  const kid = int(req.body.athlete_id);
  if (!kid || !p.email) return go(res, `/admin/people/${id}#family`, { err: p.email ? "Pick an athlete." : "Add this person's email first, so they can sign in and see their kids." });
  await PP.linkParent(kid, p.email);
  go(res, `/admin/people/${id}#family`, { ok: "Linked." });
}));
router.post("/:id/family/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`DELETE FROM parent_athletes WHERE user_id=$1 AND athlete_id=$2`, [int(req.body.user_id), int(req.body.athlete_id)]);
  go(res, `/admin/people/${id}#family`, { ok: "Unlinked." });
}));

// Reports access: none, the boards they coach, or specific boards; optionally only some teams
router.post("/:id/reports", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p || p.kind !== "adult") return go(res, `/admin/people/${id}`, {});
  if (!p.email) return go(res, `/admin/people/${id}#reports`, { err: "Add this person's email first, so they can sign in and see reports." });
  const mode = ["none", "coached", "boards"].includes(req.body.mode) ? req.body.mode : "none";
  const boards = [].concat(req.body.boards || []).map(int).filter(Boolean);
  const teams = [].concat(req.body.teams || []).map(String).filter(Boolean).slice(0, 40);
  if (mode === "boards" && !boards.length) return go(res, `/admin/people/${id}#reports`, { err: "Pick at least one board, or choose another option." });
  await query(`UPDATE athletes SET report_access=$2 WHERE id=$1`, [id, mode === "none" ? null : JSON.stringify({ mode, boards: mode === "boards" ? boards : [], teams })]);
  go(res, `/admin/people/${id}#reports`, { ok: mode === "none" ? "No report access." : `Report access saved${teams.length ? ` (only ${teams.join(", ")})` : ""}.` });
}));

// An athlete's own sign-in (their email) and what their family can see / receive
router.post("/:id/self", wrap(async (req, res) => {
  const id = int(req.params.id), back = `/admin/people/${id}#self`;
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p || p.kind !== "athlete") return go(res, `/admin/people/${id}`, {});
  const fa = req.body.family_access === "1", fe = req.body.family_emails === "1";
  const e = auth.normalizeEmail(req.body.email || "");
  if (!e) {   // no own email: family-managed only (sharing stays on, since they can't sign in)
    await query(`UPDATE athletes SET email=NULL, self_user_id=NULL, family_access=true, family_emails=true WHERE id=$1`, [id]);
    return go(res, back, { ok: `${p.first_name} won't sign in themselves. Their family manages their claims.` });
  }
  if (!auth.isValidEmail(e)) return go(res, back, { err: "Enter a valid email." });
  const u = await auth.findOrCreateUser(e);
  const other = (await query(`SELECT * FROM athletes WHERE self_user_id=$1 AND id<>$2 AND archived_at IS NULL`, [u.id, id])).rows[0];
  if (other) {
    // the same person was added as an adult (e.g. a volunteer): fold that record into the athlete, if nothing hangs off it
    const busy = (await query(`SELECT (SELECT count(*) FROM board_claims WHERE athlete_id=$1) + (SELECT count(*) FROM parent_athletes WHERE user_id=$2) + (SELECT count(*) FROM schedule_members WHERE athlete_id=$1) AS n`, [other.id, u.id])).rows[0].n;
    if (other.kind !== "adult" || Number(busy) > 0) return go(res, back, { err: `${e} already belongs to ${[other.first_name, other.last_name].filter(Boolean).join(" ") || "someone else"} in People${other.kind === "adult" ? ", who has family, boards, or claims" : ""}. Use a different email, or ask for help combining them.` });
    await query(`UPDATE athletes SET roles = (SELECT ARRAY(SELECT DISTINCT unnest(roles || $2::text[]))), phone=COALESCE(phone,$3) WHERE id=$1`, [id, other.roles || [], other.phone]);
    await query(`UPDATE athletes SET self_user_id=NULL, archived_at=now() WHERE id=$1`, [other.id]);
  }
  await query(`UPDATE athletes SET email=$2, self_user_id=$3, family_access=$4, family_emails=$5 WHERE id=$1`, [id, e, u.id, fa, fe]);
  go(res, back, { ok: `${p.first_name} can sign in with ${e}.${!fa ? " Their family no longer sees their claims." : ""}${!fe ? " Emails about their claims go only to them." : ""}${other ? " (Their separate adult record was combined into this one.)" : ""}` });
}));

// Invite someone (7-day link to set up their account), or require setup at their next sign-in
async function accountFor(id) {
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p || !p.email) return { p, u: null };
  let uid = p.self_user_id;
  if (!uid) { uid = (await auth.findOrCreateUser(p.email)).id; await query(`UPDATE athletes SET self_user_id=$2 WHERE id=$1`, [id, uid]); }
  return { p, u: (await query(`SELECT * FROM users WHERE id=$1`, [uid])).rows[0] };
}
router.post("/:id/invite", wrap(async (req, res) => {
  const id = int(req.params.id); const { p, u } = await accountFor(id);
  if (!u) return go(res, `/admin/people/${id}#signin`, { err: "Add an email for this person first." });
  const link = await require("../accounts").sendInvite(req, u.id);
  go(res, `/admin/people/${id}#signin`, { ok: `Invite sent to ${u.email}. The link works for 7 days.${process.env.DEV_SHOW_LINK === "true" ? ` (Testing: ${link})` : ""}` });
}));
router.post("/:id/setup", wrap(async (req, res) => {
  const id = int(req.params.id); const { u } = await accountFor(id);
  if (!u) return go(res, `/admin/people/${id}#signin`, { err: "Add an email for this person first." });
  const on = req.body.on === "1";
  await query(`UPDATE users SET setup_required=$2 WHERE id=$1`, [u.id, on]);
  go(res, `/admin/people/${id}#signin`, { ok: on ? "They'll set up their account (password, etc.) the next time they sign in." : "No setup needed at next sign-in." });
}));

// Help someone sign in: a one-time code to read to them (15 minutes, works once)
router.post("/:id/signin-code", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  let uid = p && p.self_user_id;
  if (!uid && p && p.email) uid = (await auth.findOrCreateUser(p.email)).id;
  if (!uid) return go(res, `/admin/people/${id}#signin`, { err: "Add an email for this person first." });
  const code = await require("../accounts").issueCode(uid, "admin");
  if (!code) return go(res, `/admin/people/${id}#signin`, { err: "Too many codes made recently. Wait 15 minutes." });
  go(res, `/admin/people/${id}#signin`, { ok: `Sign-in code for ${p.email}: ${code.slice(0, 3)} ${code.slice(3)}. Have them go to the sign-in page → "Have a code from an admin?" It works once and expires in 15 minutes.` });
}));

// Coach: which boards they can take attendance on
router.post("/:id/coaching", wrap(async (req, res) => {
  const id = int(req.params.id);
  const p = (await query(`SELECT * FROM athletes WHERE id=$1`, [id])).rows[0];
  if (!p || !p.email) return go(res, `/admin/people/${id}#coach`, { err: "Add this person's email first." });
  const pick = [].concat(req.body.boards || []).map(int).filter(Boolean);
  await query(`DELETE FROM schedule_coaches WHERE lower(email)=lower($1) AND NOT (schedule_id = ANY($2))`, [p.email, pick]);
  for (const b of pick) await query(`INSERT INTO schedule_coaches (schedule_id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [b, auth.normalizeEmail(p.email)]);
  if (pick.length && !(p.roles || []).includes("coach")) await query(`UPDATE athletes SET roles=array_append(roles,'coach') WHERE id=$1`, [id]);
  go(res, `/admin/people/${id}#coach`, { ok: pick.length ? `Coach on ${pick.length} board${pick.length === 1 ? "" : "s"}.` : "Not coaching any boards." });
}));

router.post("/:id/archive", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`UPDATE athletes SET archived_at = CASE WHEN archived_at IS NULL THEN now() ELSE NULL END WHERE id=$1`, [id]);
  go(res, "/admin/people", { ok: "Removed from the directory. Their past claims are kept." });
}));

module.exports = router;
