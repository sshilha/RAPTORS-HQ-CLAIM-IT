// Settings: a schedule's activities and groups, plus the app-wide page (⚙ App)
const express = require("express");
const auth = require("../auth");
const catalog = require("../catalog");
const G = require("../groups");
const SC = require("../schedules");
const v = require("../views/settings");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const clean = (s, max = 40) => str(s).replace(/\s+/g, " ").slice(0, max);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const acts = (sc) => `/admin/settings/activities?s=${sc.id}`;
const grps = (sc, anchor = "") => `/admin/members?s=${sc.id}${/^#(groups|tags|presets)$/.test(anchor) ? `&card=${anchor.slice(1)}` : ""}`;
const app = (part) => `/admin/settings/app${part ? `?part=${part}` : ""}${part ? `#${part}` : ""}`;

// ---------- Settings home: active schedules ----------
const { query } = require("../db");
async function boardRows() {
  const rows = (await query(`SELECT sc.*,
      (SELECT count(*)::int FROM board_nodes n WHERE n.schedule_id=sc.id) AS containers,
      (SELECT count(*)::int FROM board_nodes n WHERE n.schedule_id=sc.id AND n.parent_id IS NULL) AS sheets,
      (SELECT count(*)::int FROM board_items i WHERE i.schedule_id=sc.id AND i.canceled_at IS NULL) AS items,
      (SELECT count(*)::int FROM schedule_members m WHERE m.schedule_id=sc.id) AS members,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=sc.id AND c.status<>'canceled') AS all_claims,
      (SELECT count(DISTINCT c.athlete_id)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=sc.id AND c.status<>'canceled') AS signups,
      (SELECT count(*)::int FROM board_claims c JOIN board_items i ON i.id=c.item_id
         WHERE i.schedule_id=sc.id AND c.status='confirmed' AND (i.starts_at IS NULL OR i.starts_at > now())) AS claimed,
      (SELECT min(i.starts_at) FROM board_items i WHERE i.schedule_id=sc.id AND i.canceled_at IS NULL AND i.starts_at > now()) AS next_at,
      (SELECT to_char(min(i.starts_at) AT TIME ZONE 'America/Chicago', 'Dy, Mon FMDD at FMHH12:MI AM') FROM board_items i
         WHERE i.schedule_id=sc.id AND i.canceled_at IS NULL AND i.starts_at > now()) AS next
    FROM schedules sc ORDER BY sc.sort, sc.id`)).rows;
  const lv = (await query(`WITH RECURSIVE t AS (SELECT id, schedule_id, 1 AS d FROM board_nodes WHERE parent_id IS NULL
      UNION ALL SELECT n.id, n.schedule_id, t.d + 1 FROM board_nodes n JOIN t ON n.parent_id = t.id)
    SELECT schedule_id, d, count(*)::int AS n FROM t GROUP BY schedule_id, d`)).rows;
  for (const r of rows) {
    r.live = !!r.published_at && !r.archived_at; r.activities = r.containers; r.empty = r.containers === 0 && r.items === 0;
    const depth = Math.min(4, Math.max(1, r.depth || 1));
    r.level_counts = Array.from({ length: depth }, (_, i) => i === depth - 1 ? r.items : (lv.find((x) => x.schedule_id === r.id && x.d === i + 1) || {}).n || 0);
  }
  return rows;
}

router.get("/", wrap(async (req, res) => {
  const rows = await boardRows();
  const active = rows.filter((r) => !r.archived_at);
  // Volunteers: different people signed up for upcoming shifts on volunteer boards
  const volIds = active.filter((r) => require("../views/setup").boardTypeOf(r) === "volunteer").map((r) => r.id);
  const volunteers = volIds.length ? (await query(`SELECT count(DISTINCT c.athlete_id)::int AS n FROM board_claims c JOIN board_items i ON i.id=c.item_id
    WHERE i.schedule_id = ANY($1) AND c.status='confirmed' AND i.canceled_at IS NULL AND i.starts_at > now()`, [volIds])).rows[0].n : 0;
  const metrics = { active: active.length, upcoming: active.reduce((t, r) => t + (r.claimed || 0), 0), volunteers };
  res.send(require("../views/home").dashboardPage({ user: req.user, flash: flashFrom(req), rows, metrics, tab: String(req.query.tab || "") }));
}));

router.get("/archived", (req, res) => res.redirect("/admin/settings?tab=arch"));   // the dashboard's Archived tab

// ---------- ⚙ App ----------
// ---------- saved places (app-wide) ----------
const { query: q } = require("../db");
const P = require("../locations");
router.get("/places/suggest", wrap(async (req, res) => {
  const G = require("../places-search");
  if (!G.enabled() || String(req.query.q || "").trim().length < 3) return res.json({ items: [] });
  try { res.json({ items: await G.suggest(req.query.q, String(req.query.s || "")) }); }
  catch (e) { console.error(e.message); res.json({ items: [], error: "Address search isn't working right now. Type the address instead." }); }
}));
router.get("/places/details", wrap(async (req, res) => {
  const G = require("../places-search");
  if (!G.enabled()) return res.json({});
  try { res.json(await G.details(String(req.query.id || ""), String(req.query.s || ""))); }
  catch (e) { console.error(e.message); res.json({}); }
}));

router.post("/places", wrap(async (req, res) => {
  const name = clean(req.body.name, 80), address = clean(req.body.address, 200) || null;
  const quick = req.get("X-Requested-With") === "fetch"; // the "Add new location" pop-up
  if (!name) return quick ? res.status(400).json({ error: "Enter a name for the place." }) : go(res, "/admin/settings/app?part=places", { err: "Enter a name for the place." });
  if (P.find(name)) {
    if (quick) return res.json({ place: P.find(name), existed: true });
    return go(res, "/admin/settings/app?part=places", { err: `${name} is already saved. Edit it in the list.` });
  }
  await q(`INSERT INTO app_locations (name, address) VALUES ($1,$2)`, [name, address]);
  await P.load();
  if (quick) return res.json({ place: P.find(name) });
  go(res, "/admin/settings/app?part=places", { ok: `Saved ${name}.${address ? "" : " Add its address so people get directions."}` });
}));
router.post("/places/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const cur = P.all().find((l) => l.id === id);
  const name = clean(req.body.name, 80), address = clean(req.body.address, 200) || null;
  if (!cur || !name) return go(res, "/admin/settings/app?part=places", { err: "Enter a name." });
  if (!same(cur.name, name) && P.find(name)) return go(res, "/admin/settings/app?part=places", { err: `${name} is already saved.` });
  await q(`UPDATE app_locations SET name=$2, address=$3 WHERE id=$1`, [id, name, address]);
  if (cur.name !== name) { // everything that used the old name follows the rename
    await q(`UPDATE board_items SET location=$2 WHERE location=$1`, [cur.name, name]);
    await q(`UPDATE schedules SET event_location=$2 WHERE event_location=$1`, [cur.name, name]);
    if (await require("../db").hasOldData()) { await q(`UPDATE rounds SET location=$2 WHERE location=$1`, [cur.name, name]); await q(`UPDATE training_sessions SET location=$2 WHERE location=$1`, [cur.name, name]); }
  }
  await P.load();
  go(res, "/admin/settings/app?part=places", { ok: `Saved ${name}.` });
}));
router.post("/places/:id/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  const cur = P.all().find((l) => l.id === id);
  await q(`DELETE FROM app_locations WHERE id=$1`, [id]);
  await P.load();
  go(res, "/admin/settings/app?part=places", { ok: `Removed ${cur ? cur.name : "it"}. Anything that used it keeps the name, just without a map link.` });
}));

router.post("/app/accounts", wrap(async (req, res) => {
  const c = catalog.current();
  c.new_accounts = req.body.new_accounts === "open" ? "open" : "approval";
  c.password_policy = req.body.password_policy === "required" ? "required" : "optional";
  await catalog.save(c);
  go(res, "/admin/settings/app?part=accounts", { ok: `Saved. New accounts: ${c.new_accounts === "open" ? "anyone can sign up" : "approval required"}. Passwords: ${c.password_policy}.` });
}));

router.post("/app/change-email", wrap(async (req, res) => {
  const e = require("../auth").normalizeEmail(req.body.email);
  if (!require("../auth").isValidEmail(e)) return go(res, "/admin/requests#notify", { err: "Enter a valid email." });
  const c = catalog.current(); c.change_email = e; await catalog.save(c);
  go(res, "/admin/requests#notify", { ok: `New requests will be emailed to ${e}.` });
}));

router.get("/app", (req, res, next) => {
  if (req.query.part === "change") return res.redirect("/admin/requests#notify");
  if (!req.query.part) return res.redirect("/admin/people" + (req.query.ok || req.query.err ? `?${new URLSearchParams({ ...(req.query.ok ? { ok: req.query.ok } : {}), ...(req.query.err ? { err: req.query.err } : {}) })}` : ""));
  next();
});
// Organization → Old data: the old (pre-rebuild) system's tables. See, download, then remove (typed confirmation).
router.get("/app", wrap(async (req, res, next) => {
  if (req.query.part !== "olddata") return next();
  const OD = require("../oldData"), sum = await OD.summary(), gone = sum ? null : await OD.removedInfo();
  const esc = require("../views/layout").esc, head = await require("../views/apphead").head({ active: "olddata" });
  const names = { seasons: "Seasons", rounds: "Rounds", programs: "Programs (activities)", training_sessions: "Sessions", reservations: "Sign-ups (reservations)" };
  res.send(require("../views/admin").page({ title: "Old data · App settings", tab: "settings", user: req.user, flash: flashFrom(req),
    body: `${head}<div class="sub-top"><h2>Old data</h2></div>
    ${!sum ? `<section class="panel"><p><b>There's no old data.</b> ${gone ? `It was removed ${esc(new Date(gone.at).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" }))}${gone.by ? ` by ${esc(gone.by)}` : ""}.` : "This app's database never had the old system's tables."}</p></section>`
    : `<section class="panel od">
      <p>These tables are from the system before the rebuild (seasons, rounds, programs, sessions and their sign-ups). Today's Claim Boards don't use them. Keep them as long as you like, or download everything and remove them.</p>
      <div class="table-wrap"><table class="cm-table"><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>${sum.tables.map((t) => `<tr><td>${esc(names[t.name] || t.name)} <span class="fine">${esc(t.name)}</span></td><td>${t.rows}</td></tr>`).join("")}</tbody></table></div>
      ${sum.boards.length ? `<h3>By board</h3><div class="table-wrap"><table class="cm-table"><thead><tr><th>Board</th><th>Rounds</th><th>Programs</th><th>Sessions</th><th>Sign-ups</th></tr></thead><tbody>
        ${sum.boards.map((b) => `<tr><td>${esc(b.name)}${b.archived_at ? ` <span class="st-pill plain">Archived</span>` : ""}</td><td>${b.rounds}</td><td>${b.programs}</td><td>${b.sessions}</td><td>${b.reservations}</td></tr>`).join("")}</tbody></table></div>
        <p class="fine">A round with no sessions on a current board is just a setting the old system kept; it has no history in it.</p>` : ""}
      <div class="od-steps">
        <div class="od-step"><b>1. Download it</b><span class="fine">One .zip with a spreadsheet (CSV) per table: every row and column.</span><a class="sb-btn primary" href="/admin/settings/old-data.zip">Download everything (.zip)</a></div>
        <div class="od-step"><b>2. Remove it</b><span class="fine">Deletes these tables for good. Do it after you've downloaded them and backed up the database in Railway.</span>
          <form method="post" action="/admin/settings/old-data/remove" class="od-rm" onsubmit="return confirm('Remove all of the old data for good? This can\\'t be undone.');">
            <label class="radio-row"><input type="checkbox" name="have_copy" value="1" required> I've downloaded it (or backed up the database)</label>
            <label class="field-l"><span>Type <b>REMOVE OLD DATA</b> to confirm</span><input name="confirm" autocomplete="off" required pattern="REMOVE OLD DATA" placeholder="REMOVE OLD DATA"></label>
            <button class="btn-ghost danger" type="submit">Remove old data</button></form></div>
      </div></section>`}` }));
}));
router.get("/old-data.zip", wrap(async (req, res) => {
  const buf = await require("../oldData").download();
  res.set("Content-Type", "application/zip").set("Content-Disposition", `attachment; filename="claim-it-old-data-${new Date().toISOString().slice(0, 10)}.zip"`).send(buf);
}));
router.post("/old-data/remove", wrap(async (req, res) => {
  if (req.body.confirm !== "REMOVE OLD DATA" || req.body.have_copy !== "1") return go(res, "/admin/settings/app?part=olddata", { err: "Tick the box and type REMOVE OLD DATA to confirm." });
  await require("../oldData").remove(req.user.email);
  await require("../accounts").logEvent(req, { userId: req.user.id, identity: req.user.email, method: "removed the old data", ok: true });
  go(res, "/admin/settings/app?part=olddata", { ok: "The old data is removed." });
}));

// Accounts & sign-in → Sign in as: shadow mode (use the app as someone else, to test and troubleshoot)
router.get("/app", wrap(async (req, res, next) => {
  if (req.query.part !== "shadow") return next();
  const people = (await require("../db").query(`SELECT u.id, u.email, u.last_login_at, a.first_name, a.last_name, a.kind, a.roles
    FROM users u LEFT JOIN LATERAL (SELECT * FROM athletes x WHERE x.self_user_id=u.id AND x.archived_at IS NULL ORDER BY (x.kind='athlete') DESC LIMIT 1) a ON true
    WHERE u.id <> $1 ORDER BY lower(coalesce(nullif(a.last_name,''), u.email)), lower(a.first_name)`, [req.user.id])).rows;
  const recent = await require("../shadow").recent(req.user.id), visitors = await require("../shadow").publicVisitors();
  const head = await require("../views/apphead").head({ active: "shadow" });
  const esc = require("../views/layout").esc, when = (d) => new Date(d).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const isAdm = (p) => require("../auth").isAdmin({ email: p.email });
  res.send(require("../views/admin").page({ title: "Sign in as · App settings", tab: "settings", user: req.user, flash: flashFrom(req),
    body: `${head}<div class="sub-top"><h2>Sign in as someone else</h2></div>
    <section class="panel sh-intro"><p>Use the app exactly as someone else would, to test or troubleshoot: the same pages, choices and limits they get, starting from the sign-in screen. <b>Changes you make are real</b> (a claim is their claim), but <b>no emails are sent</b>: they're held so you can read them. A banner stays on top until you choose <b>Exit shadow mode</b>.</p></section>
    <div class="sh-cols">
      <section class="panel"><h3>Someone in the app</h3>
        <input type="search" class="sh-find" placeholder="Search name or email…" oninput="var v=this.value.toLowerCase(); document.querySelectorAll('.sh-row').forEach(function(r){ r.hidden = v && r.dataset.k.indexOf(v) < 0; })">
        <div class="sh-list">${people.map((p) => { const n = [p.first_name, p.last_name].filter(Boolean).join(" ");
          return `<form method="post" action="/admin/shadow/start" class="sh-row" data-k="${esc((n + " " + p.email).toLowerCase())}"><input type="hidden" name="user_id" value="${p.id}">
            <span class="sh-p"><b>${esc(n || p.email)}</b><span class="fine">${n ? esc(p.email) + " · " : ""}${p.kind === "athlete" ? "Athlete" : (p.roles || []).length ? esc(p.roles.join(", ")) : "Adult"}${isAdm(p) ? " · admin" : ""} · ${p.last_login_at ? `last in ${esc(when(p.last_login_at))}` : "never signed in"}</span></span>
            <button class="sb-btn" type="submit">Sign in as</button></form>`; }).join("") || `<p class="muted">No one else has a sign-in yet.</p>`}</div></section>
      <section class="panel"><h3>Someone who signed up through a public link</h3>
        <p class="fine">They're in People but have no sign-in. You'll see the public board with their name and email filled in, plus <b>Their links</b>: each spot they claimed, with the private cancel link from their email.</p>
        ${visitors.length ? `<input type="search" class="sh-find" placeholder="Search name or email…" oninput="var v=this.value.toLowerCase(); document.querySelectorAll('.sh-vrow').forEach(function(r){ r.hidden = v && r.dataset.k.indexOf(v) < 0; })">
        <div class="sh-list sh-vlist">${visitors.map((v) => { const n = [v.first_name, v.last_name].filter(Boolean).join(" ");
          return `<form method="post" action="/admin/shadow/start" class="sh-row sh-vrow" data-k="${esc((n + " " + (v.email || "")).toLowerCase())}"><input type="hidden" name="visitor_person" value="${v.id}">
            <span class="sh-p"><b>${esc(n || v.email)}</b><span class="fine">${v.email && n ? esc(v.email) + " · " : ""}${esc(v.boards)} · ${v.spots} spot${v.spots === 1 ? "" : "s"}</span></span>
            <button class="sb-btn" type="submit">Shadow</button></form>`; }).join("")}</div>` : `<p class="muted">No one has signed up through a public link yet.</p>`}
        <h3 class="sh-rh">Someone not in the app</h3>
        <p class="fine">Start signed out, like a brand-new visitor: try an unknown email, Request an account, or a public link. Sign-in links they'd get are held in the banner, so you can follow them.</p>
        <form method="post" action="/admin/shadow/start"><input type="hidden" name="user_id" value="visitor"><button class="sb-btn primary" type="submit">Start as a visitor</button></form>
        ${recent.length ? `<h3 class="sh-rh">Recent</h3><ul class="sh-recent">${recent.map((r) => `<li>${esc(when(r.started_at))} · ${esc(r.who || "a visitor")} · ${r.held} email${r.held === 1 ? "" : "s"} held${r.ended_at ? "" : " · <b>still on</b>"}</li>`).join("")}</ul>` : ""}</section>
    </div>` }));
}));

// Organization → Pictures: header pictures for the My Claims cards
router.get("/app", wrap(async (req, res, next) => {
  if (req.query.part !== "pictures") return next();
  const AI = require("../appimages"), u = await AI.urls();
  const head = await require("../views/apphead").head({ active: "pictures" });
  const slot = (k) => `<div class="ap-pic">
      <div class="ap-pic-h"><b>${AI.KEYS[k]}</b><span class="fine">Shown on the right of this card's navy header bar on My Claims, fading into navy so the title stays readable.</span></div>
      <div class="ap-pic-prev${u[k] ? " has" : ""}"><span class="mc-img" style="${u[k] ? `background-image:url('${u[k]}')` : ""}"></span><span class="ap-pic-shade"></span><span class="ap-pic-t">${AI.KEYS[k]}</span></div>
      <div class="ap-pic-ctl"><label class="btn-ghost">Choose picture<input type="file" accept="image/*" hidden data-key="${k}"></label>
        <label class="radio-row ap-pic-rm"${u[k] ? "" : " hidden"}><input type="checkbox" name="remove_${k}" value="1"> Remove this picture</label>
        <input type="hidden" name="img_${k}" value=""><span class="fine ap-pic-note">${u[k] ? "" : "No picture yet: the bar is navy with lime stripes."}</span></div></div>`;
  res.send(require("../views/admin").page({ title: "Pictures · App settings", tab: "settings", user: req.user, flash: flashFrom(req),
    body: `${head}<form method="post" action="/admin/settings/app/pictures" class="panel ap-pics">
      <p class="fine">Wide pictures work best (about 4 to 1, like 1600 × 400). They're resized before upload.</p>
      ${slot("upcoming")}${slot("signup")}
      <div class="q-actions"><button class="btn-small" type="submit">Save pictures</button></div></form>
    <script>(function () {
      document.querySelectorAll(".ap-pic input[type=file]").forEach(function (inp) { inp.addEventListener("change", function () {
        var f = inp.files[0], box = inp.closest(".ap-pic"); if (!f) return;
        var img = new Image(), rd = new FileReader();
        rd.onload = function () { img.onload = function () {
          var w = Math.min(1600, img.width), h = Math.round(img.height * w / img.width), c = document.createElement("canvas"); c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h); var d = c.toDataURL("image/jpeg", 0.82);
          box.querySelector("input[name=img_" + inp.dataset.key + "]").value = d;
          var pv = box.querySelector(".ap-pic-prev"); pv.querySelector(".mc-img").style.backgroundImage = "url('" + d + "')"; pv.classList.add("has");
          box.querySelector(".ap-pic-note").textContent = "New picture ready. Save to use it.";
        }; img.src = rd.result; }; rd.readAsDataURL(f);
      }); });
    })();</script>` }));
}));
router.post("/app/pictures", wrap(async (req, res) => {
  const AI = require("../appimages"); let n = 0;
  try {
    for (const k of Object.keys(AI.KEYS)) {
      if (req.body["remove_" + k] === "1") { await AI.set(k, null); n++; }
      else if (req.body["img_" + k]) { await AI.set(k, req.body["img_" + k]); n++; }
    }
  } catch (e) { return go(res, "/admin/settings/app?part=pictures", { err: e.message }); }
  go(res, "/admin/settings/app?part=pictures", { ok: n ? "Saved. My Claims shows the new pictures." : "Nothing changed." });
}));
router.get("/app", wrap(async (req, res) => {
  const admins = (await require("../db").query(`SELECT a.*, u.last_login_at FROM app_admins a LEFT JOIN users u ON u.email=a.email ORDER BY a.email`)).rows;
  const used = Object.fromEntries((await require("../db").query(
    `SELECT location, count(*)::int AS n FROM (SELECT location FROM board_items WHERE canceled_at IS NULL UNION ALL SELECT event_location FROM schedules WHERE archived_at IS NULL) x
     WHERE location IS NOT NULL GROUP BY location`)).rows.map((r) => [r.location.toLowerCase(), r.n]));
  const counts = (await require("../db").query(`SELECT count(*)::int AS people, count(*) FILTER (WHERE kind='athlete')::int AS athletes,
      count(*) FILTER (WHERE kind='adult')::int AS adults FROM athletes WHERE archived_at IS NULL`)).rows[0];
  counts.requests = (await require("../db").query(`SELECT count(*)::int AS n FROM account_requests WHERE status='waiting'`)).rows[0].n;
  const AH = require("../views/apphead"), hc = await AH.counts();
  const TAB = { accounts: "accounts", places: "locations", admins: "admins", labels: "wording" };   // admins = a sub-tab of Accounts
  const head = (part) => AH.appHeader({ c: hc, active: TAB[part] || "overview" }) + ((t) => (t ? `<div class="page-toolbar">${t}</div>` : ""))(part === "places" ? `<label class="dt-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" placeholder="Search places…" aria-label="Search places" oninput="var v=this.value.toLowerCase();document.querySelectorAll('table.places tbody tr').forEach(function(r){r.hidden=v&&r.textContent.toLowerCase().indexOf(v)<0;})"></label>`
      : "");
  res.send(v.appPage({ head, user: req.user, flash: flashFrom(req), c: catalog.current(), admins, envAdmins: auth.envAdmins(),
    places: require("../locations").all(), used, mapsKey: process.env.GOOGLE_MAPS_API_KEY || "", part: String(req.query.part || ""), counts }));
}));

router.post("/labels", wrap(async (req, res) => {
  const c = catalog.current();
  const b = req.body;
  const one = clean(b.schedule_one, 24) || "Schedule";
  c.app_labels = { ...(c.app_labels || {}),
    app_name: clean(b.app_name, 40) || "Raptors Claim It", app_short: clean(b.app_short, 20) || clean(b.app_name, 20) || "Claim It",
    org_name: clean(b.org_name, 60), schedule: [one, clean(b.schedule_many, 24) || `${one}s`] };
  await catalog.save(c);
  go(res, app("labels"), { ok: `Saved. The app is now "${c.app_labels.app_name}".` });
}));

// ---------- administrators ----------
router.post("/admins", wrap(async (req, res) => {
  const email = auth.normalizeEmail(req.body.email);
  if (!auth.isValidEmail(email)) return go(res, app("admins"), { err: "Enter a valid email." });
  await q(`INSERT INTO app_admins (email, added_by) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [email, req.user.email]);
  await auth.findOrCreateUser(email);
  await auth.loadAdmins();
  const { sendEmail, shell } = require("../email");
  const { APP_URL, LABELS } = require("../config");
  require("../emailTemplates").send("admin_added", email, { added_by: req.user.email }).catch((e) => console.error("admin email:", e.message));
  go(res, app("admins"), { ok: `${email} is now an administrator. They've been emailed.` });
}));

router.post("/admins/remove", wrap(async (req, res) => {
  const email = auth.normalizeEmail(req.body.email);
  if (email === req.user.email && !auth.envAdmins().includes(email))
    return go(res, app("admins"), { err: "You can't remove yourself. Ask another administrator." });
  await q(`DELETE FROM app_admins WHERE email=$1`, [email]);
  await auth.loadAdmins();
  go(res, app("admins"), { ok: `${email} is no longer an administrator.` });
}));

// ---------- a schedule's activities ----------
router.get("/activities", (req, res) => res.redirect("/admin/settings"));   // the old activities page (old boards only)


// ---------- a schedule's groups + shortcuts ----------
router.get("/groups", wrap(async (req, res) => {
  const { sc } = req.sched;
  // Teams & tags now share a page with the people list
  const q = new URLSearchParams({ s: sc.id, ...(req.query.ok ? { ok: req.query.ok } : {}), ...(req.query.err ? { err: req.query.err } : {}) });
  return res.redirect(`/admin/members?${q}#teams`);
  const usage = {};
  for (const g of SC.groupsFor(sc)) usage[g] = await G.usage(sc.id, g);
  for (const t of sc.tags || []) usage[`tag:${t}`] = await G.tagUsage(sc.id, t);
  const others = req.sched.list.filter((x) => x.id !== sc.id && ((x.groups || []).length || (x.tags || []).length));
  res.send(v.groupsPage({ user: req.user, flash: flashFrom(req), sc, usage, others }));
}));

const groupName = (s) => clean(s, 30).replace(/,/g, "");

router.post("/groups", wrap(async (req, res) => {
  const { sc } = req.sched;
  const name = groupName(req.body.name);
  const L = SC.labels(sc);
  if (!name) return go(res, grps(sc, "#groups"), { err: `Enter a name for the ${L.group.one.toLowerCase()}.` });
  if (SC.groupsFor(sc).some((g) => same(g, name))) return go(res, grps(sc, "#groups"), { err: `${name} already exists here.` });
  await G.add(sc, name);
  go(res, grps(sc, "#groups"), { ok: `Added ${name}. Sessions that were open to every ${L.group.one.toLowerCase()} now include it too.` });
}));

router.post("/groups/rename", wrap(async (req, res) => {
  const { sc } = req.sched;
  const from = str(req.body.original), to = groupName(req.body.name);
  if (!to || from === to) return go(res, grps(sc, "#groups"), {});
  if (SC.groupsFor(sc).some((g) => same(g, to) && g !== from)) return go(res, grps(sc, "#groups"), { err: `${to} already exists here.` });
  await G.rename(sc, from, to);
  go(res, grps(sc, "#groups"), { ok: `Renamed ${from} to ${to} for this schedule's people, sessions, and shortcuts.` });
}));

router.post("/groups/move", wrap(async (req, res) => {
  const { sc } = req.sched;
  await G.move(sc, str(req.body.name), req.body.dir);
  go(res, grps(sc, "#groups"), {});
}));

router.post("/groups/remove", wrap(async (req, res) => {
  const { sc } = req.sched;
  const name = str(req.body.name);
  if (SC.groupsFor(sc).length <= 1) return go(res, grps(sc, "#groups"), { err: "Keep at least one." });
  const r = await G.remove(sc, name);
  if (r.blocked) return go(res, grps(sc, "#groups"), { err: `${r.blocked} level${r.blocked === 1 ? " or session is" : "s or sessions are"} only for ${name}. Change ${r.blocked === 1 ? "its" : "their"} “who can claim” in Board setup first, so removing ${name} doesn't open ${r.blocked === 1 ? "it" : "them"} to everyone.` });
  go(res, grps(sc, "#groups"), { ok: `Removed ${name}. Anyone who was in it now has no ${SC.labels(sc).group.one.toLowerCase()} here.` });
}));

// Copy another board's groups, tags, and shortcuts (adds what's missing; keeps what's here)
router.post("/groups/copy", wrap(async (req, res) => {
  const { sc } = req.sched;
  const src = await SC.get(int(req.body.from));
  if (!src || src.id === sc.id) return go(res, grps(sc), { err: "Pick a board to copy from." });
  const have = SC.groupsFor(sc);
  let added = 0, tags = 0, shortcuts = 0;
  for (const g of SC.groupsFor(src)) if (!have.some((x) => same(x, g))) { await G.add(await SC.get(sc.id), g); added++; }
  for (const t of src.tags || []) if (!(sc.tags || []).some((x) => same(x, t))) { await G.addTag(await SC.get(sc.id), t); tags++; }
  const now = await SC.get(sc.id);
  const presets = SC.presetsFor(now).slice();
  for (const p of SC.presetsFor(src)) if (!presets.some((x) => same(x.name, p.name))) { presets.push({ name: p.name, ages: p.ages.filter((g) => SC.groupsFor(now).includes(g)) }); shortcuts++; }
  if (shortcuts) await G.savePresets(now, presets);
  const L = SC.labels(sc);
  go(res, grps(sc), { ok: added || tags || shortcuts
    ? `Copied from ${src.name}: ${added} ${L.group.many.toLowerCase()}, ${tags} tag${tags === 1 ? "" : "s"}, ${shortcuts} shortcut${shortcuts === 1 ? "" : "s"}.`
    : `Nothing new to copy from ${src.name}. This board already has all of them.` });
}));

// ---------- a board's tags ----------
const tagName = (s) => clean(s, 30).replace(/,/g, "");
router.post("/tags", wrap(async (req, res) => {
  const { sc } = req.sched;
  const name = tagName(req.body.name);
  if (!name) return go(res, grps(sc, "#tags"), { err: "Enter a tag name." });
  if ((sc.tags || []).some((t) => same(t, name))) return go(res, grps(sc, "#tags"), { err: `${name} already exists.` });
  await G.addTag(sc, name);
  go(res, grps(sc, "#tags"), { ok: `Added tag ${name}. Give it to people in the ${SC.labels(sc).participant.many} step, and require it on ${SC.labels(sc).activity.many.toLowerCase()} that need it.` });
}));
router.post("/tags/rename", wrap(async (req, res) => {
  const { sc } = req.sched;
  const from = str(req.body.original), to = tagName(req.body.name);
  if (!to || from === to) return go(res, grps(sc, "#tags"), {});
  if ((sc.tags || []).some((t) => same(t, to) && t !== from)) return go(res, grps(sc, "#tags"), { err: `${to} already exists.` });
  await G.renameTag(sc, from, to);
  go(res, grps(sc, "#tags"), { ok: `Renamed ${from} to ${to} on people and ${SC.labels(sc).activity.many.toLowerCase()}.` });
}));
router.post("/tags/remove", wrap(async (req, res) => {
  const { sc } = req.sched;
  const name = str(req.body.name), r = await G.removeTag(sc, name);
  if (r && r.blocked) return go(res, grps(sc, "#tags"), { err: `${r.blocked} level${r.blocked === 1 ? " or session is" : "s or sessions are"} only for ${name}. Change ${r.blocked === 1 ? "its" : "their"} “who can claim” in Board setup first, so removing ${name} doesn't open ${r.blocked === 1 ? "it" : "them"} to everyone.` });
  go(res, grps(sc, "#tags"), { ok: `Removed ${name}. No one has it on this board now.` });
}));

router.post("/presets", wrap(async (req, res) => {
  const { sc } = req.sched;
  const name = clean(req.body.name, 30);
  const groups = SC.groupsFor(sc);
  const ages = groups.filter((g) => [].concat(req.body.ages || []).includes(g));
  const orig = str(req.body.original);
  const presets = SC.presetsFor(sc).slice();
  if (!name || !ages.length) return go(res, grps(sc, "#presets"), { err: "Enter a name and check at least one." });
  if (presets.some((p) => same(p.name, name) && p.name !== orig)) return go(res, grps(sc, "#presets"), { err: `${name} already exists.` });
  const existing = presets.find((p) => p.name === orig);
  if (existing) Object.assign(existing, { name, ages }); else presets.push({ name, ages });
  await G.savePresets(sc, presets);
  go(res, grps(sc, "#presets"), { ok: existing ? `Saved ${name}.` : `Added shortcut ${name}.` });
}));

router.post("/presets/remove", wrap(async (req, res) => {
  const { sc } = req.sched;
  await G.savePresets(sc, SC.presetsFor(sc).filter((p) => p.name !== str(req.body.name)));
  go(res, grps(sc, "#presets"), { ok: "Shortcut removed." });
}));

module.exports = router;
