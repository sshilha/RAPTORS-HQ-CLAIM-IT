const express = require("express");
const auth = require("../auth");
const catalog = require("../catalog");
const { BLOCK_CHOICES } = require("../rounds");
const v = require("../views/settings");
const { wrap, flashFrom, go, int, str } = require("./util");

const router = express.Router();
router.use(auth.requireUser, auth.requireAdmin);

const back = (res, anchor, flash) => go(res, `/admin/settings#${anchor}`, flash);
const clean = (s, max = 40) => str(s).replace(/\s+/g, " ").slice(0, max);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const COLORS = ["#93c47d", "#7fa7d9", "#f6cf55", "#d0503f", "#9a85cc", "#5fb3b3", "#e69a4a", "#c27ba0", "#8d9db6", "#6aa84f"];

function readActivity(b) {
  const spots = int(b.default_spots);
  const block = int(b.default_block);
  const limit = int(b.default_limit);
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

router.get("/", wrap(async (req, res) => {
  const c = catalog.current();
  const usage = {};
  for (const a of c.activities) usage[`a:${a.name}`] = await catalog.activityUsage(a.name);
  for (const g of c.age_groups) usage[`g:${g}`] = await catalog.groupUsage(g);
  res.send(v.settingsPage({ user: req.user, flash: flashFrom(req), c, usage }));
}));

// ---------- activities ----------
router.post("/activities", wrap(async (req, res) => {
  const c = catalog.current();
  const name = clean(req.body.name);
  if (!name) return back(res, "activities", { err: "Enter a name for the activity." });
  if (c.activities.some((a) => same(a.name, name))) return back(res, "activities", { err: `${name} already exists.` });
  const a = { name, ...readActivity(req.body) };
  if (!req.body.color) a.color = COLORS.find((x) => !c.activities.some((y) => y.color === x)) || COLORS[c.activities.length % COLORS.length];
  c.activities.push(a);
  await catalog.save(c);
  back(res, "activities", { ok: `Added ${name}.` });
}));

router.post("/activities/update", wrap(async (req, res) => {
  const c = catalog.current();
  const from = str(req.body.original);
  const to = clean(req.body.name) || from;
  if (!c.activities.some((a) => a.name === from)) return back(res, "activities", { err: "Activity not found." });
  if (!same(from, to) && c.activities.some((a) => same(a.name, to))) return back(res, "activities", { err: `${to} already exists.` });
  await catalog.renameActivity(from, to, readActivity(req.body));
  back(res, "activities", { ok: from === to ? `Saved ${to}.` : `Renamed ${from} to ${to} everywhere it's used.` });
}));

router.post("/activities/move", wrap(async (req, res) => {
  const c = catalog.current();
  const i = c.activities.findIndex((a) => a.name === str(req.body.name));
  const j = i + (req.body.dir === "up" ? -1 : 1);
  if (i >= 0 && j >= 0 && j < c.activities.length) [c.activities[i], c.activities[j]] = [c.activities[j], c.activities[i]];
  await catalog.save(c);
  back(res, "activities", {});
}));

router.post("/activities/remove", wrap(async (req, res) => {
  const c = catalog.current();
  const name = str(req.body.name);
  const u = await catalog.activityUsage(name);
  if (u.programs) return back(res, "activities", { err: `${name} is used by ${u.sessions} scheduled session${u.sessions === 1 ? "" : "s"}, so it can't be removed. Hide it instead to stop offering it.` });
  if (c.activities.length <= 1) return back(res, "activities", { err: "Keep at least one activity." });
  c.activities = c.activities.filter((a) => a.name !== name);
  await catalog.save(c);
  back(res, "activities", { ok: `Removed ${name}.` });
}));

// ---------- age groups ----------
const groupName = (s) => clean(s, 30).replace(/,/g, "");

router.post("/groups", wrap(async (req, res) => {
  const c = catalog.current();
  const name = groupName(req.body.name);
  if (!name) return back(res, "groups", { err: "Enter a name for the group." });
  if (c.age_groups.some((g) => same(g, name))) return back(res, "groups", { err: `${name} already exists.` });
  await catalog.addGroup(name);
  back(res, "groups", { ok: `Added ${name}. Sessions that were open to every group now include it too.` });
}));

router.post("/groups/rename", wrap(async (req, res) => {
  const c = catalog.current();
  const from = str(req.body.original), to = groupName(req.body.name);
  if (!to || from === to) return back(res, "groups", {});
  if (c.age_groups.some((g) => same(g, to) && g !== from)) return back(res, "groups", { err: `${to} already exists.` });
  await catalog.renameGroup(from, to);
  back(res, "groups", { ok: `Renamed ${from} to ${to} for athletes, sessions, and shortcuts.` });
}));

router.post("/groups/move", wrap(async (req, res) => {
  const c = catalog.current();
  const i = c.age_groups.indexOf(str(req.body.name));
  const j = i + (req.body.dir === "up" ? -1 : 1);
  if (i >= 0 && j >= 0 && j < c.age_groups.length) [c.age_groups[i], c.age_groups[j]] = [c.age_groups[j], c.age_groups[i]];
  await catalog.save(c);
  back(res, "groups", {});
}));

router.post("/groups/remove", wrap(async (req, res) => {
  const c = catalog.current();
  const name = str(req.body.name);
  const u = await catalog.groupUsage(name);
  if (u.athletes)
    return back(res, "groups", { err: `${u.athletes} athlete${u.athletes === 1 ? " is" : "s are"} in ${name}. Move them to another group first, or rename the group instead.` });
  if (c.age_groups.length <= 1) return back(res, "groups", { err: "Keep at least one group." });
  const r = await catalog.removeGroup(name);
  if (r.blocked) return back(res, "groups", { err: `${r.blocked} session setup${r.blocked === 1 ? " is" : "s are"} only for ${name}. Remove ${r.blocked === 1 ? "it" : "them"} from the round first.` });
  back(res, "groups", { ok: `Removed ${name}.` });
}));

// ---------- group shortcuts ----------
router.post("/presets", wrap(async (req, res) => {
  const c = catalog.current();
  const name = clean(req.body.name, 30);
  const ages = [].concat(req.body.ages || []).filter((g) => c.age_groups.includes(g));
  const orig = str(req.body.original);
  if (!name || !ages.length) return back(res, "presets", { err: "Enter a name and check at least one group." });
  if (c.presets.some((p) => same(p.name, name) && p.name !== orig)) return back(res, "presets", { err: `${name} already exists.` });
  const sorted = c.age_groups.filter((g) => ages.includes(g));
  const existing = c.presets.find((p) => p.name === orig);
  if (existing) Object.assign(existing, { name, ages: sorted }); else c.presets.push({ name, ages: sorted });
  await catalog.save(c);
  back(res, "presets", { ok: existing ? `Saved ${name}.` : `Added shortcut ${name}.` });
}));

router.post("/presets/remove", wrap(async (req, res) => {
  const c = catalog.current();
  c.presets = c.presets.filter((p) => p.name !== str(req.body.name));
  await catalog.save(c);
  back(res, "presets", { ok: "Shortcut removed." });
}));

// ---------- app-wide labels ----------
router.post("/labels", wrap(async (req, res) => {
  const c = catalog.current();
  const b = req.body;
  const one = (k, d) => clean(b[`${k}_one`], 24) || d;
  const p1 = one("participant", "Athlete"), g1 = one("group", "Group");
  c.app_labels = {
    app_name: clean(b.app_name, 40) || "Raptors Claim It", app_short: clean(b.app_short, 20) || clean(b.app_name, 20) || "Claim It",
    org_name: clean(b.org_name, 60),
    participant: [p1, clean(b.participant_many, 24) || `${p1}s`], group: [g1, clean(b.group_many, 24) || `${g1}s`],
  };
  await catalog.save(c);
  back(res, "labels", { ok: `Saved. The app is now "${c.app_labels.app_name}", with ${c.app_labels.participant[1].toLowerCase()} in ${c.app_labels.group[1].toLowerCase()}.` });
}));

// ---------- family view ----------
router.post("/family", wrap(async (req, res) => {
  const c = catalog.current();
  c.family_names = ["full", "initial", "off"].includes(req.body.family_names) ? req.body.family_names : "initial";
  await catalog.save(c);
  back(res, "family", { ok: { full: "Families now see full names of who's going.", initial: "Families now see first names and last initials of who's going.", off: "Families no longer see who's going." }[c.family_names] });
}));

// ---------- locations ----------
router.post("/locations", wrap(async (req, res) => {
  const c = catalog.current();
  const name = clean(req.body.name, 80);
  if (!name) return back(res, "locations", { err: "Enter a location." });
  if (!c.locations.some((l) => same(l, name))) c.locations.push(name);
  await catalog.save(c);
  back(res, "locations", { ok: `Added ${name}.` });
}));

router.post("/locations/remove", wrap(async (req, res) => {
  const c = catalog.current();
  c.locations = c.locations.filter((l) => l !== str(req.body.name));
  await catalog.save(c);
  back(res, "locations", { ok: "Location removed. Sessions that already use it keep it." });
}));

module.exports = router;
