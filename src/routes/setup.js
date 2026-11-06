const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const v = require("../views/setup");
const SC = require("../schedules");
const { wrap, flashFrom, go, int, str, dest } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

router.get("/", wrap(async (req, res) => {
  const sc = req.sched.sc;
  const E = require("../engine");
  // the whole board as a tree: every container, and the items at the bottom
  const nodes = (await query(`SELECT * FROM board_nodes WHERE schedule_id=$1 ORDER BY sort, id`, [sc.id])).rows;
  const items = (await query(`SELECT i.*,
      (SELECT count(*)::int FROM board_claims c WHERE c.item_id=i.id AND c.status='confirmed') AS claimed,
      (SELECT count(*)::int FROM board_claims c WHERE c.item_id=i.id AND c.status='waitlisted') AS waitlisted
    FROM board_items i WHERE i.schedule_id=$1 AND i.canceled_at IS NULL ORDER BY i.starts_at NULLS FIRST, i.sort, i.id`, [sc.id])).rows;
  const byParent = (pid) => nodes.filter((n) => (n.parent_id || null) === (pid || null));
  const build = (pid, chain) => byParent(pid).map((n) => {
    const c = [...chain, n];
    const kids = build(n.id, c);
    const own = items.filter((it) => it.node_id === n.id);
    const all = (x) => [...x.items, ...x.kids.flatMap(all)];
    const t = { node: n, chain: c, eff: E.effectiveAt(sc, c), inherited: E.effectiveAt(sc, chain), kids, items: own };
    const every = all(t);
    t.count = { containers: kids.length, items: every.length, spots: every.reduce((a, b) => a + b.capacity, 0), claimed: every.reduce((a, b) => a + b.claimed, 0) };
    return t;
  });
  const tree = build(null, []);
  const topItems = items.filter((it) => !it.node_id);
  // ?n= : the part to show open (after adding or saving something in it)
  const focus = int(req.query.n) || null;
  const open = new Set();
  if (focus) { let x = nodes.find((n) => n.id === focus); while (x) { open.add(x.id); x = nodes.find((n) => n.id === x.parent_id); } }
  const totals = await E.boardTotals(sc.id);
  if (sc.published_at && sc.claim_mode === "public" && !sc.share_code) sc.share_code = await require("./board").shareCode(sc);
  // three panels: the selected level (?n=) shows in the center and right; clicking in the tree asks for just those (partial=1)
  const sel = focus && nodes.some((n) => n.id === focus) ? focus : null;
  sc._roll = await E.rollingMap(sc.id);   // "only the next one": which sessions families see right now
  const V = require("../views/setup2"), args = { sc, tree, topItems, totals, eff: E.effectiveAt(sc, []), sel };
  if (req.query.partial) return res.json(V.panels(args));
  res.send(V.setupPage({ user: req.user, flash: flashFrom(req), ...args }));
}));

// The board's Rules page (1-2 level boards; rounds boards keep per-round rules for now)
router.get("/rules", wrap(async (req, res) => res.redirect(`/admin/setup/schedule?s=${req.sched.sc.id}#rg-limits`))); // Rules live in Settings now

router.get("/new", wrap(async (req, res) => res.send(v.newSchedulePage({ user: req.user, flash: flashFrom(req) }))));

// Board → Notifications: which claim emails this board sends, and when reminders go out
const NOTE_KEYS = [["confirm", "Spot claimed", "When someone claims a spot (signed in)."], ["waitlist", "Put on the waitlist", "When someone joins a waitlist (signed in)."],
  ["cancel", "Spot canceled", "When a claim is canceled, by them or an admin."], ["moved_up", "Moved off the waitlist", "When a spot opens and someone moves up."]];
const REMIND = [[0, "Off"], [2, "2 hours before"], [12, "12 hours before"], [24, "1 day before"], [48, "2 days before"], [72, "3 days before"]];
router.get("/notifications", wrap(async (req, res) => {
  const sc = await SC.get(int(req.query.s)); if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const n = (sc.settings && sc.settings.notify) || {}, rh = n.reminder_hours == null ? 24 : Number(n.reminder_hours);
  const H = require("../views/setup2"), head = H.boardHeader(sc, { ...(await H.headerData(sc)), active: "notify" });
  await query(`ALTER TABLE board_claims ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ`);
  const due = rh > 0 ? (await query(`SELECT count(*)::int AS n FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id=$1 AND c.status='confirmed' AND i.starts_at > now() AND c.reminded_at IS NULL`, [sc.id])).rows[0].n : 0;
  res.send(require("../views/admin").page({ title: `Notifications · ${sc.name}`, tab: "setup", user: req.user, flash: flashFrom(req), wide: true, noBack: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>All Boards</a></nav>
    ${head}
    <form method="post" action="/admin/setup/notifications?s=${sc.id}" class="sub-body no-subs nt-sheet">
      <section class="nt-sec"><h3>Reminders</h3><p class="fine">${sc.board_type === "rsvp" ? "A reminder before each event, to those who answered Going" : "A reminder before each claimed session"}, to the person and their parents/guardians (if family sharing is on). It has Add to calendar links and ${sc.board_type === "rsvp" ? "a way to change their answer" : "a way to cancel"}.</p>
        <label class="field-l nt-when"><span>Send a reminder</span><select name="reminder_hours">${REMIND.map(([h, l]) => `<option value="${h}"${h === rh ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <p class="fine">${rh > 0 ? `${sc.board_type === "rsvp" ? `${due} ${due === 1 ? "answer" : "answers"} of Going will get a reminder. People who answer inside that window don't get one (they just answered).` : `${due} upcoming claim${due === 1 ? "" : "s"} will get a reminder. People who claim inside that window don't get one (they just signed up).`}` : "No reminders for this board."}</p></section>
      ${sc.board_type === "rsvp" ? `<section class="nt-sec"><h3>Reminder to answer</h3><p class="fine">Two days before each event, everyone on the list who hasn't answered yet gets the <b>Please RSVP</b> email (with their parents/guardians, if family emails are on), once. You can also use <b>Remind them</b> on an event's People page anytime.</p>
        <label class="radio-row nt-sw"><input type="checkbox" name="rsvp_nudge" value="1"${n.rsvp_nudge !== false ? " checked" : ""}> <span><b>Remind those who haven't answered, 2 days before</b></span></label></section>` : ""}
      <section class="nt-sec"${sc.board_type === "rsvp" ? " hidden" : ""}><h3>Claim emails</h3><p class="fine">Turn off any this board shouldn't send. Their wording is in App Settings → People → <a href="/admin/people/communication">Communication</a>.</p>
        ${NOTE_KEYS.map(([k, t, d]) => `<label class="radio-row nt-sw"><input type="checkbox" name="${k}" value="1"${n[k] !== false ? " checked" : ""}> <span><b>${t}</b><span class="fine">${d}</span></span></label>`).join("")}
        <p class="fine">Public-link confirmations always send, because they carry the visitor's private cancel link.</p></section>
      <div class="q-actions"><button class="sb-btn primary" type="submit">Save</button></div>
    </form>` }));
}));
router.post("/notifications", wrap(async (req, res) => {
  const sc = await SC.get(int(req.query.s)); if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const rh = REMIND.map((r) => r[0]).includes(Number(req.body.reminder_hours)) ? Number(req.body.reminder_hours) : 24;
  const notify = { reminder_hours: rh, ...Object.fromEntries(NOTE_KEYS.map(([k]) => [k, sc.board_type === "rsvp" ? (((sc.settings || {}).notify || {})[k] !== false) : req.body[k] === "1"])),
    ...(sc.board_type === "rsvp" ? { rsvp_nudge: req.body.rsvp_nudge === "1" } : {}) };
  await query(`UPDATE schedules SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('notify', $2::jsonb) WHERE id=$1`, [sc.id, JSON.stringify(notify)]);
  go(res, `/admin/setup/notifications?s=${sc.id}`, { ok: "Saved this board's notifications." });
}));
router.get(["/schedule", "/schedule/more", "/schedule/archive"], wrap(async (req, res) => {
  const sc = req.sched.sc;
  const counts = (await query(`SELECT (SELECT count(*) FROM board_items WHERE schedule_id=$1) AS items,
    (SELECT count(*) FROM schedule_members WHERE schedule_id=$1) AS members`, [sc.id])).rows[0];
  if (req.path.endsWith("/more")) return res.redirect(`/admin/setup/schedule?s=${sc.id}#locations`); // merged into Setup
  const part = req.path.endsWith("/archive") ? "archive" : "structure";
  const coaches = (await query(`SELECT email FROM schedule_coaches WHERE schedule_id=$1 ORDER BY email`, [sc.id])).rows.map((r) => r.email);
  const published = !!sc.published_at, main = null;
  const nodes = (await query(`SELECT id, parent_id, name, settings, visible_from FROM board_nodes WHERE schedule_id=$1`, [sc.id])).rows;
  const H = require("../views/setup2"), head = H.boardHeader(sc, { ...(await H.headerData(sc)), active: "defaults" });
  const SUBOF = { who: "who", see: "who", limits: "limits", timing: "limits", question: "qa", attendance: "qa", levels: "levels" };
  const sub = ["who", "limits", "qa", "levels"].includes(req.query.sub) ? req.query.sub : SUBOF[String(req.query.card || "")] || "who";
  res.send(v.scheduleSettingsPage({ user: req.user, flash: flashFrom(req), sc, part, main, head, sub, overrides: require("../views/board").levelOverrides(nodes),
    counts: { items: Number(counts.items), members: Number(counts.members), coaches, published } }));
}));

// ---------- schedules ----------
const clean = (x, n = 24) => str(x).replace(/\s+/g, " ").slice(0, n);

router.post("/schedules", wrap(async (req, res) => {
  const name = clean(req.body.name, 60);
  if (!name) return go(res, "/admin/setup/new", { err: "Enter a name for the schedule." });
  const pre = SC.PRESET_LABELS[req.body.preset] || SC.PRESET_LABELS.training;
  const { depth = 3, calendar: preCal = true, claim: preClaim = "roster", restrict: preRestrict = false, ...labels } = pre;
  // the answers on the New page win over the structure's defaults
  const b0 = req.body;
  const claim = ["public", "family", "roster"].includes(b0.claim) ? b0.claim : preClaim;
  const restrict = claim === "public" ? false : b0.restrict ? b0.restrict === "yes" : preRestrict;
  const dated = b0.dated ? b0.dated === "yes" : preCal;
  const pickMode = !dated ? "list" : b0.pick === "both" ? "both" : b0.pick === "list" ? "dlist" : "calendar";
  const calendar = pickMode !== "list";
  const src = null; // groups are copied later from the Groups & tags step, if needed
  // renamed levels from the Structure step win over the structure's defaults
  for (const k of ["middle", "section", "activity", "slot", "participant", "group"]) {
    const one = clean(b0[`${k}_one`]), many = clean(b0[`${k}_many`]);
    if (one && many) labels[k] = [one, many];
  }
  const dateOk = (x) => /^\d{4}-\d{2}-\d{2}$/.test(str(x)) ? str(x) : null;
  const evStart = dateOk(b0.event_date), evEnd = evStart && dateOk(b0.event_end) > evStart ? dateOk(b0.event_end) : null;
  const sort = (await query(`SELECT coalesce(max(sort),0)+1 AS n FROM schedules`)).rows[0].n;
  const { rows } = await query(`INSERT INTO schedules (name, labels, sort, groups, presets, depth, use_calendar, pick_mode, claim_mode, restricted,
      event_date, event_end, event_location, description, contact_name, contact_info)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [name, JSON.stringify(labels), sort, src ? src.groups : [], JSON.stringify(src ? src.presets : []), depth, calendar, pickMode,
     claim, restrict, evStart, evEnd, clean(b0.event_location, 80) || null, String(b0.description || "").trim().slice(0, 600) || null,
     clean(b0.contact_name, 60) || null, clean(b0.contact_info, 80) || null]);
  if (clean(b0.contact_name, 60) || clean(b0.contact_info, 80)) await query(`UPDATE schedules SET organizers=$2 WHERE id=$1`,
    [rows[0].id, JSON.stringify([{ name: clean(b0.contact_name, 60) || "", info: clean(b0.contact_info, 80) || "" }])]);
  if (["training", "volunteer", "rsvp"].includes(b0.board_type)) await query(`UPDATE schedules SET board_type=$2 WHERE id=$1`, [rows[0].id, b0.board_type]);
  { const code = String(b0.short_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    await query(`UPDATE schedules SET short_code=$2 WHERE id=$1`, [rows[0].id, code.length >= 2 ? code : require("../views/setup").initials(name)]); }
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(b0.image_data || "")) && String(b0.image_data).length < 1500000)
    await query(`UPDATE schedules SET image=$2, image_at=now() WHERE id=$1`, [rows[0].id, b0.image_data]);
  await SC.refreshGroups();
  const L = SC.labels({ labels });
  const first = SC.levelKeys({ depth })[0];
  // RSVP boards: only the athletes on the board answer, and what they answer for is an Event
  if (b0.board_type === "rsvp") await query(`UPDATE schedules SET claim_mode='roster',
    labels = coalesce(labels, '{}'::jsonb) || jsonb_build_object('slot', jsonb_build_array('Event', 'Events'), 'participant', jsonb_build_array('Athlete', 'Athletes')) WHERE id=$1`, [rows[0].id]);
  go(res, `/admin/setup?s=${rows[0].id}`, { ok: depth === 1
    ? `Created ${name}. Add its ${L.slot.many.toLowerCase()} below.`
    : `Created ${name}. Add its first ${L[first].one.toLowerCase()} below, then open it to keep going.` });
}));

// Number of levels: only while the board is empty (nothing to restructure)
router.post("/schedules/:id/depth", wrap(async (req, res) => {
  const id = int(req.params.id);
  const depth = Math.min(4, Math.max(1, int(req.body.depth) || 3));
  const used = (await query(`SELECT count(*)::int AS n FROM board_items WHERE schedule_id=$1`, [id])).rows[0].n;
  if (Number(used)) return go(res, `/admin/setup/schedule?s=${id}`, { err: "This board already has things in it, so its levels can't change." });
  await query(`UPDATE schedules SET depth=$2 WHERE id=$1`, [id, depth]);
  go(res, `/admin/setup/schedule?s=${id}`, { ok: `Now ${depth} level${depth === 1 ? "" : "s"}. Name them below.` });
}));

router.post("/schedules/:id", wrap(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  // Number of levels: only while the board is empty (same rule as before)
  const before = await SC.get(id);
  const wantDepth = int(b.depth);
  if (wantDepth && wantDepth !== SC.depthOf(before)) {
    const used = (await query(`SELECT count(*)::int AS n FROM board_items WHERE schedule_id=$1`, [id])).rows[0].n;
    if (Number(used)) return go(res, `/admin/setup/schedule?s=${id}`, { err: "This board already has things in it, so its levels can't change." });
    await query(`UPDATE schedules SET depth=$2 WHERE id=$1`, [id, Math.min(4, Math.max(1, wantDepth))]);
  }
  // Event details (optional): date, end date, location
  if (b.event_date !== undefined) {
    const d1 = /^\d{4}-\d{2}-\d{2}$/.test(str(b.event_date)) ? str(b.event_date) : null;
    let d2 = /^\d{4}-\d{2}-\d{2}$/.test(str(b.event_end)) ? str(b.event_end) : null;
    if (!d1 || (d2 && d2 <= d1)) d2 = null;
    await query(`UPDATE schedules SET event_date=$2, event_end=$3 WHERE id=$1`, [id, d1, d2]);
  }
  if (b.event_location !== undefined) await query(`UPDATE schedules SET event_location=$2 WHERE id=$1`, [id, str(b.event_location).slice(0, 80) || null]);
  if (b.image_data !== undefined) {
    const img = String(b.image_data || "");
    if (img === "remove") await query(`UPDATE schedules SET image=NULL, image_at=now() WHERE id=$1`, [id]);
    else if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img) && img.length < 1500000) await query(`UPDATE schedules SET image=$2, image_at=now() WHERE id=$1`, [id, img]);
  }
  if (["training", "volunteer", "rsvp"].includes(b.board_type)) await query(`UPDATE schedules SET board_type=$2${b.board_type === "rsvp" ? ", claim_mode='roster'" : ""} WHERE id=$1`, [id, b.board_type]);
  if (b.short_code !== undefined) {
    const code = String(b.short_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    const pic = (await query(`SELECT image IS NOT NULL AS has FROM schedules WHERE id=$1`, [id])).rows[0];
    if (code.length < 2 && !(pic && pic.has)) return go(res, back, { err: "Give the board a 2–3 letter short code (like WT), or add a picture." });
    await query(`UPDATE schedules SET short_code=$2 WHERE id=$1`, [id, code.length >= 2 ? code : null]);
  }
  if (b.description !== undefined) await query(`UPDATE schedules SET description=$2 WHERE id=$1`, [id, String(b.description || "").trim().slice(0, 600) || null]);
  if (b.org_name !== undefined) {
    const names = [].concat(b.org_name || []), infos = [].concat(b.org_info || []);
    const orgs = names.map((n, i) => ({ name: str(n).slice(0, 60), info: str(infos[i]).slice(0, 80) })).filter((o) => o.name || o.info).slice(0, 12);
    // one organizer: name + info, as before; several: one line everywhere ("Jane Smith (jane@…) · Bob Lee (715…)")
    const line = orgs.length > 1 ? orgs.map((o) => (o.name && o.info ? `${o.name} (${o.info})` : o.name || o.info)).join(" · ") : null;
    await query(`UPDATE schedules SET organizers=$2, contact_name=$3, contact_info=$4 WHERE id=$1`,
      [id, JSON.stringify(orgs), orgs.length > 1 ? line : orgs[0] ? orgs[0].name || null : null, orgs.length > 1 ? null : orgs[0] ? orgs[0].info || null : null]);
  } else if (b.contact_name !== undefined) await query(`UPDATE schedules SET contact_name=$2, contact_info=$3, organizers=$4 WHERE id=$1`,
    [id, str(b.contact_name).slice(0, 60) || null, str(b.contact_info).slice(0, 80) || null, JSON.stringify(str(b.contact_name) || str(b.contact_info) ? [{ name: str(b.contact_name).slice(0, 60), info: str(b.contact_info).slice(0, 80) }] : [])]);
  // Who's going, attendance default, coaches (one email per line)
  if (["full", "initial", "off"].includes(b.family_names)) await query(`UPDATE schedules SET family_names=$2 WHERE id=$1`, [id, b.family_names]);
  if (b.track) await query(`UPDATE schedules SET track_attendance=$2 WHERE id=$1`, [id, b.track === "on"]);
  // check-in lock for coaches (Board defaults → Attendance)
  if (b.checkin_lock !== undefined && ["0", "1", "2", "7", "-1"].includes(String(b.checkin_lock)))
    await query(`UPDATE schedules SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('checkin_lock', $2::int) WHERE id=$1`, [id, Number(b.checkin_lock)]);
  let badCoaches = [];
  if (b.coaches !== undefined) {
    const auth = require("../auth");
    const emails = [...new Set(String(b.coaches).split(/[\s,;]+/).map(auth.normalizeEmail).filter(Boolean))];
    badCoaches = emails.filter((e) => !auth.isValidEmail(e));
    const good = emails.filter(auth.isValidEmail);
    await query(`DELETE FROM schedule_coaches WHERE schedule_id=$1 AND NOT (email = ANY($2))`, [id, good]);
    for (const e of good) { await query(`INSERT INTO schedule_coaches (schedule_id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, e]); await auth.findOrCreateUser(e); }
  }
  const prev = (await SC.get(id)).labels || {};
  const labels = { ...prev };
  for (const k of Object.keys(SC.DEFAULT_LABELS)) {
    if (b[`${k}_one`] === undefined) continue; // levels this board doesn't use keep their words
    const one = clean(b[`${k}_one`]) || SC.DEFAULT_LABELS[k][0];
    labels[k] = [one, clean(b[`${k}_many`]) || `${one}s`];
  }
  const pick = b.dated === "no" ? "list" : b.dated === "yes" ? (b.pick === "both" ? "both" : b.pick === "list" ? "dlist" : "calendar")
    : ["list", "calendar", "both"].includes(b.pick) ? b.pick : null;
  let claim = ["public", "family", "roster"].includes(b.claim) ? b.claim : null;
  const typeNow = b.board_type || ((await query(`SELECT board_type FROM schedules WHERE id=$1`, [id])).rows[0] || {}).board_type;
  if (typeNow === "rsvp") claim = "roster";   // RSVP boards are always just for the people on the board
  const restrict = b.restrict === "yes" ? true : b.restrict === "no" ? false : null;
  await query(`UPDATE schedules SET claim_mode = COALESCE($2, claim_mode), restricted = COALESCE($3, restricted) WHERE id=$1`, [id, claim, restrict]);
  await query(`UPDATE schedules SET name = COALESCE($2, name), labels=$3, pick_mode = COALESCE($4, pick_mode), use_calendar = COALESCE($4, pick_mode) <> 'list' WHERE id=$1`,
    [id, b.name === undefined ? null : clean(b.name, 60) || "Claim Board", JSON.stringify(labels), pick]);
  const sc2 = await SC.get(id);
  const L2 = SC.labels(sc2);
  const back = dest(req, `/admin/setup/schedule?s=${id}${/^[a-z]+$/.test(b.q || "") ? `&card=${b.q}#q-${b.q}` : ""}`);
  go(res, back, badCoaches.length
    ? { err: `Saved, but these coach emails weren't valid and were left out: ${badCoaches.join(", ")}` }
    : { ok: "Saved." });
}));

// ---------- a board's locations + view (who's going) ----------
router.post("/schedules/:id/locations", wrap(async (req, res) => {
  const id = int(req.params.id);
  const name = str(req.body.name).replace(/\s+/g, " ").slice(0, 80);
  if (!name) return go(res, `/admin/setup/schedule?s=${id}#locations`, { err: "Enter a location." });
  await query(`UPDATE schedules SET locations = array_append(locations, $2) WHERE id=$1 AND NOT ($2 = ANY(locations))`, [id, name]);
  go(res, `/admin/setup/schedule?s=${id}#locations`, { ok: `Added ${name}.` });
}));

router.post("/schedules/:id/locations/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`UPDATE schedules SET locations = array_remove(locations, $2) WHERE id=$1`, [id, str(req.body.name)]);
  go(res, `/admin/setup/schedule?s=${id}#locations`, { ok: "Location removed. Anything that already uses it keeps it." });
}));

router.post("/schedules/:id/family", wrap(async (req, res) => {
  const id = int(req.params.id);
  const mode = ["full", "initial", "off"].includes(req.body.family_names) ? req.body.family_names : "initial";
  await query(`UPDATE schedules SET family_names=$2 WHERE id=$1`, [id, mode]);
  go(res, `/admin/setup/schedule?s=${id}#family`, { ok: { full: "People now see full names of who's going.", initial: "People now see first names and last initials of who's going.", off: "People no longer see who's going." }[mode] });
}));

const fileName = (s) => String(s || "export").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "export";
// ---------- export a board / import a board (moving setup between copies, e.g. staging → production) ----------
router.get("/schedules/:id/export", wrap(async (req, res) => {
  const sc = await SC.get(int(req.params.id)); if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const d = await require("../transfer").exportBoard(sc.id, { people: req.query.people !== "0", coaches: req.query.coaches !== "0" });
  res.setHeader("Content-Type", "application/json"); res.setHeader("Content-Disposition", `attachment; filename="${fileName(sc.name)}.claimit.json"`);
  res.send(JSON.stringify(d, null, 1));
}));
router.get("/import", wrap(async (req, res) => res.send(require("../views/transfer").importPage({ user: req.user, flash: flashFrom(req) }))));
router.post("/import/preview", wrap(async (req, res) => {
  const r = require("../transfer").read(String(req.body.data || "")); if (r.err) return go(res, "/admin/setup/import", { err: r.err });
  if (r.data.kind !== "board") return go(res, "/admin/setup/import", { err: "That file is a level, not a board. Import it from Board setup, where it should go." });
  res.send(require("../views/transfer").previewPage({ user: req.user, flash: flashFrom(req), p: await require("../transfer").preview(r.data), data: String(req.body.data) }));
}));
router.post("/import", wrap(async (req, res) => {
  const r = require("../transfer").read(String(req.body.data || "")); if (r.err || r.data.kind !== "board") return go(res, "/admin/setup/import", { err: r.err || "That file isn't a board." });
  const out = await require("../transfer").importBoard(r.data, { name: str(req.body.name), people: req.body.people === "1", coaches: req.body.coaches === "1" });
  go(res, `/admin/setup?s=${out.board.id}`, { ok: `Imported "${out.board.name}": ${out.levels} levels, ${out.sessions} sessions${out.people ? `, ${out.people} people` : ""}${out.coaches ? `, ${out.coaches} coach${out.coaches === 1 ? "" : "es"}` : ""}. It's unpublished.${out.missing.length ? ` ${out.missing.length} people weren't found in People here.` : ""}` });
}));

// ---------- copy a whole board ----------
// boards built on the new engine (levels + sessions) copy with engine/copy.js
const isEngineBoard = async (id) => !(await require("../db").hasOldData()) || !(await query(`SELECT 1 FROM training_sessions s JOIN programs p ON p.id=s.program_id
  JOIN rounds r ON r.id=p.round_id WHERE r.schedule_id=$1 LIMIT 1`, [id])).rowCount;   // made before the rebuild = has old-system sessions
router.get("/schedules/:id/copy", wrap(async (req, res) => {
  const sc = await SC.get(int(req.params.id));
  if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  if (await isEngineBoard(sc.id)) {
    const c = (await query(`SELECT (SELECT count(*)::int FROM board_nodes WHERE schedule_id=$1) AS nodes,
        (SELECT count(*)::int FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL) AS items,
        (SELECT count(*)::int FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL AND starts_at IS NOT NULL) AS dated,
        (SELECT count(*)::int FROM schedule_members WHERE schedule_id=$1) AS members,
        (SELECT count(*)::int FROM schedule_coaches WHERE schedule_id=$1) AS coaches`, [sc.id])).rows[0];
    c.first = await require("../engine/copy").firstDay(sc.id);
    return res.send(require("../views/board").copyPage({ user: req.user, flash: flashFrom(req), sc, counts: c }));
  }
  go(res, "/admin/settings", { err: `${sc.name} was made before the rebuild, so it can't be duplicated. Create a new board instead.` });
}));

router.post("/schedules/:id/copy", wrap(async (req, res) => {
  const sc = await SC.get(int(req.params.id));
  if (!sc) return go(res, "/admin/settings", { err: "Not found." });
  const b = req.body;
  if (await isEngineBoard(sc.id)) {
    const name = str(b.name).replace(/\s+/g, " ").slice(0, 60) || `${sc.name} (copy)`;
    const startOn = /^\d{4}-\d{2}-\d{2}$/.test(str(b.start_on)) ? str(b.start_on) : null;
    const out = await require("../engine/copy").copyEngineBoard(sc, { name, items: !!b.items, members: !!b.members, coaches: !!b.coaches, startOn });
    const L = SC.labels(sc), n = (c, l) => `${c} ${(c === 1 ? l.one : l.many).toLowerCase()}`;
    const bits = [`its setup and ${out.nodes} level${out.nodes === 1 ? "" : "s"}`];
    if (b.items) bits.push(`${n(out.items, L.slot)}${out.days ? ` (moved ${out.days > 0 ? "ahead" : "back"} ${Math.abs(out.days)} days)` : ""}`);
    if (b.members) bits.push(n(out.members, L.participant));
    if (b.coaches) bits.push(`${out.coaches} coach${out.coaches === 1 ? "" : "es"}`);
    return go(res, `/admin/setup?s=${out.board.id}`, { ok: `Created ${name} from ${sc.name} with ${bits.join(", ")}. It isn't published yet.` });
  }
  go(res, "/admin/settings", { err: `${sc.name} was made before the rebuild, so it can't be duplicated. Create a new board instead.` });
}));

// ---------- attendance: board default + coaches ----------
router.post("/schedules/:id/attendance", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`UPDATE schedules SET track_attendance=$2 WHERE id=$1`, [id, req.body.track === "on"]);
  if (req.body.checkin_lock !== undefined && ["0", "1", "2", "7", "-1"].includes(String(req.body.checkin_lock)))
    await query(`UPDATE schedules SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('checkin_lock', $2::int) WHERE id=$1`, [id, Number(req.body.checkin_lock)]);
  go(res, `/admin/setup/schedule?s=${id}&card=attendance#attendance`, { ok: req.body.track === "on" ? "Attendance is tracked by default." : "Attendance isn't tracked by default." });
}));
router.post("/schedules/:id/coaches", wrap(async (req, res) => {
  const id = int(req.params.id);
  const email = require("../auth").normalizeEmail(req.body.email);
  if (!require("../auth").isValidEmail(email)) return go(res, `/admin/setup/schedule?s=${id}&card=attendance#attendance`, { err: "Enter a valid email." });
  await query(`INSERT INTO schedule_coaches (schedule_id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, email]);
  await require("../auth").findOrCreateUser(email);
  go(res, `/admin/setup/schedule?s=${id}&card=attendance#attendance`, { ok: `${email} can now take attendance on this board.` });
}));
router.post("/schedules/:id/coaches/remove", wrap(async (req, res) => {
  const id = int(req.params.id);
  await query(`DELETE FROM schedule_coaches WHERE schedule_id=$1 AND email=$2`, [id, str(req.body.email)]);
  go(res, `/admin/setup/schedule?s=${id}&card=attendance#attendance`, { ok: "Coach removed." });
}));

router.post("/schedules/:id/archive", wrap(async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(`UPDATE schedules SET archived_at = CASE WHEN archived_at IS NULL THEN now() ELSE NULL END WHERE id=$1 RETURNING name, archived_at`, [id]);
  const r = rows[0];
  const { LABELS } = require("../config");
  go(res, require("./util").dest(req, `/admin/setup/schedule/archive?s=${id}`), { ok: r.archived_at
    ? `${r.name} archived. People can't see it anymore. Find it under "View archived ${LABELS.schedules.toLowerCase()}".`
    : `${r.name} reopened. It's active again.` });
}));

router.post("/schedules/:id/delete", wrap(async (req, res) => {
  const id = int(req.params.id), back = "/admin/settings/archived";
  const sc = (await query(`SELECT * FROM schedules WHERE id=$1`, [id])).rows[0];
  if (!sc) return go(res, back, { err: "Not found." });
  if (!sc.archived_at) return go(res, "/admin/settings", { err: `Archive ${sc.name} first. Only archived boards can be deleted.` });
  const norm = (x) => String(x || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (norm(req.body.confirm) !== norm(sc.name)) return go(res, back, { err: `To delete it, type the board's name exactly: ${sc.name}` });
  if ((await query(`SELECT count(*)::int AS n FROM schedules WHERE id<>$1`, [id])).rows[0].n === 0) return go(res, back, { err: "Keep at least one board." });
  const c = (await query(`SELECT (SELECT count(*)::int FROM board_items WHERE schedule_id=$1) AS items,
      (SELECT count(*)::int FROM board_claims x JOIN board_items i ON i.id=x.item_id WHERE i.schedule_id=$1) AS claims`, [id])).rows[0];
  const catalog = require("../catalog");
  const cat = catalog.current(); cat.activities = (cat.activities || []).filter((a) => a.schedule_id !== id); await catalog.save(cat);
  await query(`DELETE FROM schedules WHERE id=$1`, [id]);   // levels, sessions, claims, its people list, coaches, and links go with it
  res.clearCookie("rt_sched");
  await SC.refreshGroups();
  go(res, back, { ok: `Deleted ${sc.name} for good (${c.items} session${c.items === 1 ? "" : "s"}, ${c.claims} claim${c.claims === 1 ? "" : "s"}). People are still in People.` });
}));

module.exports = router;
