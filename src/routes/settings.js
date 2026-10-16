// Settings: a schedule's activities and groups, plus the app-wide page (⚙ App)
const express = require("express");
const auth = require("../auth");
const catalog = require("../catalog");
const G = require("../groups");
const SC = require("../schedules");
const { BLOCK_CHOICES } = require("../rounds");
const v = require("../views/settings");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const clean = (s, max = 40) => str(s).replace(/\s+/g, " ").slice(0, max);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const COLORS = ["#93c47d", "#7fa7d9", "#f6cf55", "#d0503f", "#9a85cc", "#5fb3b3", "#e69a4a", "#c27ba0", "#8d9db6", "#6aa84f"];
const acts = (sc) => `/admin/settings/activities?s=${sc.id}`;
const grps = (sc, anchor = "") => `/admin/settings/groups?s=${sc.id}${anchor}`;
const app = (anchor) => `/admin/settings/app#${anchor}`;

function readActivity(b) {
  const spots = int(b.default_spots), block = int(b.default_block), limit = int(b.default_limit);
  return {
    color: /^#[0-9a-f]{6}$/i.test(str(b.color)) ? str(b.color) : "#8d9db6",
    all_ages: !!b.all_ages,
    default_spots: spots >= 1 && spots <= 200 ? spots : 8,
    default_block: BLOCK_CHOICES.includes(block) ? block : null,
    default_limit: b.unlimited ? null : limit >= 1 && limit <= 50 ? limit : 2,
    aliases: str(b.aliases).split(",").map((x) => clean(x, 12)).filter(Boolean).slice(0, 6),
    active: !b.hidden,
  };
}

// ---------- Settings home: active schedules ----------
const { query } = require("../db");
async function boardRows() {
  const rows = (await query(`SELECT sc.*,
      (SELECT count(*)::int FROM rounds r WHERE r.schedule_id=sc.id AND NOT r.is_main) AS sheets,
      (SELECT count(*)::int FROM training_sessions t JOIN programs p ON p.id=t.program_id JOIN rounds r ON r.id=p.round_id
         WHERE r.schedule_id=sc.id AND t.canceled_at IS NULL) AS items,
      (SELECT count(*)::int FROM rounds r WHERE r.schedule_id=sc.id AND r.published_at IS NOT NULL AND r.ends_on >= CURRENT_DATE) AS live_sheets,
      (SELECT count(*)::int FROM schedule_members m WHERE m.schedule_id=sc.id) AS members,
      (SELECT count(*)::int FROM reservations x JOIN training_sessions t ON t.id=x.session_id JOIN programs p ON p.id=t.program_id
         JOIN rounds r ON r.id=p.round_id WHERE r.schedule_id=sc.id AND x.status='confirmed' AND t.starts_at > now()) AS claimed,
      (SELECT count(*)::int FROM rounds r WHERE r.schedule_id=sc.id AND NOT r.is_main) AS item_rounds,
      (SELECT to_char(min(t.starts_at) AT TIME ZONE 'America/Chicago', 'Dy, Mon FMDD at FMHH12:MI AM') FROM training_sessions t
         JOIN programs p ON p.id=t.program_id JOIN rounds r ON r.id=p.round_id
         WHERE r.schedule_id=sc.id AND r.published_at IS NOT NULL AND t.canceled_at IS NULL AND t.starts_at > now()) AS next
    FROM schedules sc ORDER BY sc.sort, sc.id`)).rows;
  for (const r of rows) { r.live = r.live_sheets > 0 && !r.archived_at; r.activities = SC.activitiesFor(r).length; r.empty = r.item_rounds === 0 && r.items === 0; }
  return rows;
}

router.get("/", wrap(async (req, res) => {
  const rows = await boardRows();
  res.send(require("../views/home").homePage({ user: req.user, flash: flashFrom(req),
    active: rows.filter((r) => !r.archived_at), archivedCount: rows.filter((r) => r.archived_at).length }));
}));

router.get("/archived", wrap(async (req, res) => {
  const rows = await boardRows();
  res.send(require("../views/home").archivedPage({ user: req.user, flash: flashFrom(req), archived: rows.filter((r) => r.archived_at) }));
}));

// ---------- ⚙ App ----------
router.get("/app", wrap(async (req, res) => {
  const admins = (await require("../db").query(`SELECT a.*, u.last_login_at FROM app_admins a LEFT JOIN users u ON u.email=a.email ORDER BY a.email`)).rows;
  res.send(v.appPage({ user: req.user, flash: flashFrom(req), c: catalog.current(), admins, envAdmins: auth.envAdmins() }));
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
const { query: q } = require("../db");
router.post("/admins", wrap(async (req, res) => {
  const email = auth.normalizeEmail(req.body.email);
  if (!auth.isValidEmail(email)) return go(res, app("admins"), { err: "Enter a valid email." });
  await q(`INSERT INTO app_admins (email, added_by) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [email, req.user.email]);
  await auth.findOrCreateUser(email);
  await auth.loadAdmins();
  const { sendEmail, shell } = require("../email");
  const { APP_URL, LABELS } = require("../config");
  sendEmail({ to: email, subject: `You're an administrator for ${LABELS.app_name}`,
    html: shell(`You're an administrator`, `<p>${req.user.email} added you as an administrator for ${LABELS.app_name}. Sign in with this email to manage Claim Boards, people, and reports.</p>`,
      { href: `${APP_URL}/`, label: "Sign in" }),
    text: `${req.user.email} added you as an administrator for ${LABELS.app_name}. Sign in with this email: ${APP_URL}/` }).catch((e) => console.error("admin email:", e.message));
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
router.get("/activities", wrap(async (req, res) => {
  const { sc } = req.sched;
  const c = catalog.current();
  const list = c.activities.filter((a) => a.schedule_id === sc.id);
  const usage = {};
  for (const a of list) usage[a.name] = await catalog.activityUsage(a.name, sc.id);
  res.send(v.activitiesPage({ user: req.user, flash: flashFrom(req), sc, list, usage }));
}));

router.post("/activities", wrap(async (req, res) => {
  const { sc } = req.sched;
  const c = catalog.current();
  const name = clean(req.body.name);
  const L = SC.labels(sc);
  if (!name) return go(res, acts(sc), { err: `Enter a name for the ${L.activity.one.toLowerCase()}.` });
  // Names only need to be unique within a schedule; other schedules can use the same name
  if (c.activities.some((a) => a.schedule_id === sc.id && same(a.name, name))) return go(res, acts(sc), { err: `${name} already exists in ${sc.name}.` });
  const a = { name, ...readActivity(req.body), schedule_id: sc.id };
  if (!req.body.color) a.color = COLORS.find((x) => !c.activities.some((y) => y.color === x)) || COLORS[c.activities.length % COLORS.length];
  c.activities.push(a);
  await catalog.save(c);
  go(res, acts(sc), { ok: `Added ${name}.` });
}));

router.post("/activities/update", wrap(async (req, res) => {
  const { sc } = req.sched;
  const c = catalog.current();
  const from = str(req.body.original), to = clean(req.body.name) || from;
  if (!c.activities.some((a) => a.name === from && a.schedule_id === sc.id)) return go(res, acts(sc), { err: "Not found in this schedule." });
  if (!same(from, to) && c.activities.some((a) => a.schedule_id === sc.id && same(a.name, to))) return go(res, acts(sc), { err: `${to} already exists in ${sc.name}.` });
  await catalog.renameActivity(from, to, { ...readActivity(req.body), schedule_id: sc.id });
  go(res, acts(sc), { ok: from === to ? `Saved ${to}.` : `Renamed ${from} to ${to} everywhere it's used.` });
}));

router.post("/activities/move", wrap(async (req, res) => {
  const { sc } = req.sched;
  const c = catalog.current();
  // Move within this schedule's list: swap with the neighbor that belongs to the same schedule
  const mine = c.activities.map((a, i) => [a, i]).filter(([a]) => a.schedule_id === sc.id);
  const k = mine.findIndex(([a]) => a.name === str(req.body.name));
  const n = k + (req.body.dir === "up" ? -1 : 1);
  if (k >= 0 && n >= 0 && n < mine.length) {
    const i = mine[k][1], j = mine[n][1];
    [c.activities[i], c.activities[j]] = [c.activities[j], c.activities[i]];
    await catalog.save(c);
  }
  go(res, acts(sc), {});
}));

router.post("/activities/remove", wrap(async (req, res) => {
  const { sc } = req.sched;
  const c = catalog.current();
  const name = str(req.body.name);
  const u = await catalog.activityUsage(name, sc.id);
  if (u.programs) return go(res, acts(sc), { err: `${name} is on ${u.sessions} scheduled time${u.sessions === 1 ? "" : "s"}, so it can't be removed. Hide it instead to stop offering it.` });
  c.activities = c.activities.filter((a) => !(a.name === name && a.schedule_id === sc.id));
  await catalog.save(c);
  go(res, acts(sc), { ok: `Removed ${name}.` });
}));

// ---------- a schedule's groups + shortcuts ----------
router.get("/groups", wrap(async (req, res) => {
  const { sc } = req.sched;
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
  if (r.blocked) return go(res, grps(sc, "#groups"), { err: `${r.blocked} session setup${r.blocked === 1 ? " is" : "s are"} only for ${name}. Remove ${r.blocked === 1 ? "it" : "them"} from the ${SC.labels(sc).middle.one.toLowerCase()} first.` });
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
  await G.removeTag(sc, str(req.body.name));
  go(res, grps(sc, "#tags"), { ok: `Removed ${str(req.body.name)}. Anything that required it is open to everyone now.` });
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
