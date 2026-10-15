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
const app = (anchor) => `/admin/settings#${anchor}`;

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
const ownerName = async (id) => ((await SC.get(id)) || {}).name || "another schedule";

// ---------- ⚙ App ----------
router.get("/", wrap(async (req, res) => res.send(v.appPage({ user: req.user, flash: flashFrom(req), c: catalog.current() }))));

router.post("/labels", wrap(async (req, res) => {
  const c = catalog.current();
  const b = req.body;
  c.app_labels = { ...(c.app_labels || {}),
    app_name: clean(b.app_name, 40) || "Raptors Claim It", app_short: clean(b.app_short, 20) || clean(b.app_name, 20) || "Claim It",
    org_name: clean(b.org_name, 60) };
  await catalog.save(c);
  go(res, app("labels"), { ok: `Saved. The app is now "${c.app_labels.app_name}".` });
}));

router.post("/family", wrap(async (req, res) => {
  const c = catalog.current();
  c.family_names = ["full", "initial", "off"].includes(req.body.family_names) ? req.body.family_names : "initial";
  await catalog.save(c);
  go(res, app("family"), { ok: { full: "Families now see full names of who's going.", initial: "Families now see first names and last initials of who's going.", off: "Families no longer see who's going." }[c.family_names] });
}));

router.post("/locations", wrap(async (req, res) => {
  const c = catalog.current();
  const name = clean(req.body.name, 80);
  if (!name) return go(res, app("locations"), { err: "Enter a location." });
  if (!c.locations.some((l) => same(l, name))) c.locations.push(name);
  await catalog.save(c);
  go(res, app("locations"), { ok: `Added ${name}.` });
}));

router.post("/locations/remove", wrap(async (req, res) => {
  const c = catalog.current();
  c.locations = c.locations.filter((l) => l !== str(req.body.name));
  await catalog.save(c);
  go(res, app("locations"), { ok: "Location removed. Sessions that already use it keep it." });
}));

// ---------- a schedule's activities ----------
router.get("/activities", wrap(async (req, res) => {
  const { sc } = req.sched;
  const c = catalog.current();
  const list = c.activities.filter((a) => a.schedule_id === sc.id);
  const usage = {};
  for (const a of list) usage[a.name] = await catalog.activityUsage(a.name);
  res.send(v.activitiesPage({ user: req.user, flash: flashFrom(req), sc, list, usage }));
}));

router.post("/activities", wrap(async (req, res) => {
  const { sc } = req.sched;
  const c = catalog.current();
  const name = clean(req.body.name);
  const L = SC.labels(sc);
  if (!name) return go(res, acts(sc), { err: `Enter a name for the ${L.activity.one.toLowerCase()}.` });
  const taken = c.activities.find((a) => same(a.name, name));
  if (taken) return go(res, acts(sc), { err: `"${name}" is already used in ${taken.schedule_id === sc.id ? "this schedule" : await ownerName(taken.schedule_id)}. Names need to be unique across the app.` });
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
  if (!same(from, to) && c.activities.some((a) => same(a.name, to))) return go(res, acts(sc), { err: `"${to}" is already used. Names need to be unique across the app.` });
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
  const u = await catalog.activityUsage(name);
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
  res.send(v.groupsPage({ user: req.user, flash: flashFrom(req), sc, usage }));
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
