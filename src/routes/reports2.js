// Reports on the container engine: who claimed, attended, or volunteered. Admins see every board;
// others see only the boards (and teams) given to them under People -> Reports access.
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const PP = require("../people");
const { wrap, flashFrom, go, int, str } = require("./util");
const { slotName } = require("../time");

const router = express.Router();
router.use(auth.requireUser);

// ---------- the newer reports (Overview, Attendance, Sessions, RSVP, Families, Emails, Week sheet) ----------
const D = require("../reportsData");
const NEW = { sess: 1, claims: 1, attend: 1, limits: 1, assessProgress: 1, assessTeamProgress: 1, assessAthlete: 1, attSessions: 1, upcoming: 1, notSignedIn: 1, personView: 1, rsvpAnswers: 1, teams: 1, coverage: 1, assessResults: 1, assessLeaders: 1, assessTeamBest: 1, assessRecords: 1, assessImprove: 1, assessAttend: 1, assessTeams: 1, person: 1, all: 1, overview: 1, attendance: 1, noshows: 1, unchecked: 1, fill: 1, busiest: 1, waitlists: 1, locations: 1, rsvp: 1, rsvpAthletes: 1, engagement: 1, notSignedUp: 1, volunteer: 1, emails: 1, week: 1 };
const RUN = { sess: D.sessView, claims: D.claimsView, attend: D.attendView, limits: D.limits, assessProgress: D.assessProgress, assessTeamProgress: D.assessTeamProgress, attSessions: D.attendanceSessions, upcoming: (f) => D.fill({ ...f, when: "up" }), notSignedIn: async (f) => { const d = await D.engagement({ ...f, fview: "never" }); return { ...d, note: "On a board's list, and neither the athlete nor a parent/guardian has signed in yet." }; },
  rsvpAnswers: D.rsvpAnswers, teams: D.teamsReport, coverage: D.coverage, assessResults: D.assessResults, assessLeaders: D.assessLeaders, assessTeamBest: D.assessTeamBest, assessRecords: D.assessRecords, assessImprove: D.assessImprove, assessAttend: D.assessAttend, assessTeams: D.assessTeams, person: D.claimsByPerson, all: D.claimsAll, attendance: D.attendance, noshows: D.noshows, unchecked: D.unchecked, fill: D.fill, busiest: D.busiest, waitlists: D.waitlists, locations: D.locations,
  rsvp: D.rsvpEvents, rsvpAthletes: D.rsvpAthletes, engagement: D.engagement, notSignedUp: D.notSignedUp, emails: D.emailProblems };
const localDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const isDay = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
async function requiredHours() { try { const r = (await query(`SELECT value FROM app_kv WHERE key='volunteer_hours_required'`)).rows[0]; return r ? Number(r.value) || 0 : 0; } catch (e) { return 0; } }
router.post("/volunteer-required", auth.requireAdmin, wrap(async (req, res) => {
  const n = Math.max(0, Math.min(Number(req.body.hours) || 0, 500));
  await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await query(`INSERT INTO app_kv (key, value) VALUES ('volunteer_hours_required', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(n)]);
  go(res, `/reports?${new URLSearchParams({ ...req.query, r: "volunteer" })}`, { ok: n ? `Each family needs ${n} volunteer hours.` : "No volunteer-hour requirement." });
}));
// ---------- saved views: a name + the report and its filters, per person. Opening one re-checks permissions as usual ----------
async function viewsTable() { await query(`CREATE TABLE IF NOT EXISTS report_views (id SERIAL PRIMARY KEY, user_id INT NOT NULL, name TEXT NOT NULL, qs TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`); }
async function savedViews(userId) { await viewsTable(); return (await query(`SELECT id, name, qs FROM report_views WHERE user_id=$1 ORDER BY lower(name)`, [userId])).rows; }
router.post("/views", wrap(async (req, res) => {
  if (!(await PP.reportScope(req.user))) return go(res, "/dashboard", { err: "You don't have access to reports." });
  await viewsTable(); const name = str(req.body.name).slice(0, 60), qs = String(req.body.qs || "").replace(/^\?/, "").slice(0, 1500);
  const params = new URLSearchParams(qs); params.delete("pdf"); params.delete("csv");
  if (!name) return go(res, `/reports?${params}`, { err: "Give the view a name." });
  await query(`DELETE FROM report_views WHERE user_id=$1 AND lower(name)=lower($2)`, [req.user.id, name]);
  await query(`INSERT INTO report_views (user_id, name, qs) VALUES ($1,$2,$3)`, [req.user.id, name, params.toString()]);
  go(res, `/reports?${params}`, { ok: `Saved "${name}". Find it under Saved views.` });
}));
router.post("/views/:id(\\d+)/delete", wrap(async (req, res) => {
  await viewsTable(); const v = (await query(`DELETE FROM report_views WHERE id=$1 AND user_id=$2 RETURNING name`, [int(req.params.id), req.user.id])).rows[0];
  go(res, `/reports?${String(req.body.back || "").replace(/^\?/, "")}`, v ? { ok: `Deleted "${v.name}".` } : { err: "Not found." });
}));
const ADMIN_ONLY = { emails: 1 };   // reports only admins can open (every view, CSV and PDF)
const MERGED = { person: { r: "claims", group: "person" }, all: { r: "claims", group: "claim" }, attendance: { r: "attend", group: "athlete" },
  attSessions: { r: "attend", group: "session" }, fill: { r: "sess" }, upcoming: { r: "sess", view: "upcoming" }, busiest: { r: "sess", group: "time" }, locations: { r: "sess", group: "location" }, noshows: { r: "attend", group: "athlete", ashow: "noshow" }, unchecked: { r: "attend", group: "session", ashow: "unrec" } };
async function newReport(req, res, scope, boards) {
  if (MERGED[req.query.r]) return res.redirect(`/reports?${new URLSearchParams({ ...req.query, ...MERGED[req.query.r] })}`);
  let r = NEW[req.query.r] ? req.query.r : "overview";
  if (ADMIN_ONLY[r] && !scope.all) r = "overview";
  // boards: All, one, or several, and never anything outside this person's boards
  const pickIds = [].concat(req.query.s || []).flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter((x) => x && x !== "all").map(Number);
  const picked = boards.filter((b) => pickIds.includes(b.id));
  const board = picked.length === 1 ? picked[0] : null, several = picked.length > 1 ? picked : null;
  const ids = picked.length ? picked.map((b) => b.id) : boards.filter((b) => !b.archived_at).map((b) => b.id);
  const today = localDay(Date.now()), back = (n) => localDay(Date.now() - n * 864e5), ahead = (n) => localDay(Date.now() + n * 864e5);
  // quick date picks (Chicago time); "season" = the chosen boards' first to last session
  const QD = { today: "Today", week: "This week", month: "This month" };
  const qd = QD[req.query.qd] ? req.query.qd : "";
  const custom = isDay(req.query.from) || isDay(req.query.to), allDates = !req.query.qd && !custom;   // nothing picked = all dates
  let from = isDay(req.query.from) ? req.query.from : "2000-01-01", to = isDay(req.query.to) ? req.query.to : "2100-12-31";
  if (qd) {
    const t = new Date(today + "T12:00:00"), mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7)); const ds = (d) => localDay(d);
    if (qd === "today") from = to = today;
    if (qd === "week") { from = ds(mon); to = ds(new Date(mon.getTime() + 6 * 864e5)); }
    if (qd === "nextweek") { from = ds(new Date(mon.getTime() + 7 * 864e5)); to = ds(new Date(mon.getTime() + 13 * 864e5)); }
    if (qd === "month") { from = today.slice(0, 8) + "01"; to = ds(new Date(t.getFullYear(), t.getMonth() + 1, 0, 12)); }
    if (qd === "lastmonth") { from = ds(new Date(t.getFullYear(), t.getMonth() - 1, 1, 12)); to = ds(new Date(t.getFullYear(), t.getMonth(), 0, 12)); }
    if (qd === "season") { const r0 = (await query(`SELECT min(starts_at) AS a, max(starts_at) AS b FROM board_items WHERE schedule_id = ANY($1) AND canceled_at IS NULL`, [ids])).rows[0]; if (r0.a) { from = localDay(r0.a); to = localDay(r0.b); } }
  }
  const team = str(req.query.team), required = await requiredHours();
  const BT = { training: "Programs", volunteer: "Volunteer", rsvp: "RSVP" }, btype = BT[req.query.stype] ? req.query.stype : "";
  const CS = { confirmed: "Active", waitlisted: "Waitlisted", canceled: "Canceled" }, cstatus = CS[req.query.cs] ? req.query.cs : "";
  const AT = { attended: "Attended", noshow: "No-show", unrecorded: "Unrecorded" }, astatus = AT[req.query.at] ? req.query.at : "";
  const kinds = [...new Set(boards.filter((b) => ids.includes(b.id)).map((b) => b.board_type || "training"))];
  const f = { boards: ids, from, to, team, weekFrom: isDay(req.query.week) ? req.query.week : today, admin: !!scope.all, scoped: !scope.all,
    teamsBy: Object.keys(scope.teamsBy || {}).length ? scope.teamsBy : null };   // per-board team limits (team managers)
  const teams = (await query(`SELECT DISTINCT group_name FROM schedule_members m WHERE schedule_id = ANY($1) AND group_name IS NOT NULL${f.teamsBy ? " AND (NOT ($2::jsonb ? m.schedule_id::text) OR ($2::jsonb -> m.schedule_id::text) ? m.group_name)" : ""} ORDER BY 1`, f.teamsBy ? [ids, JSON.stringify(f.teamsBy)] : [ids])).rows.map((x) => x.group_name);
  // the fine filters: level (and everything inside it), location, weekdays, search
  const levelsAll = board ? (await query(`WITH RECURSIVE t AS (SELECT id, parent_id, name, name::text AS path, 0 AS d, sort FROM board_nodes WHERE schedule_id=$1 AND parent_id IS NULL
      UNION ALL SELECT n.id, n.parent_id, n.name, t.path || ' › ' || n.name, t.d + 1, n.sort FROM board_nodes n JOIN t ON n.parent_id=t.id) SELECT id, path, d FROM t ORDER BY path`, [board.id])).rows : [];
  const level = levelsAll.find((n) => n.id === int(req.query.level)) || null;
  const subtree = level ? levelsAll.filter((n) => n.path === level.path || n.path.startsWith(level.path + " › ")).map((n) => n.id) : null;
  const locations = (await query(`SELECT DISTINCT coalesce(nullif(i.location,''), sc.event_location) AS l FROM board_items i JOIN schedules sc ON sc.id=i.schedule_id WHERE i.schedule_id = ANY($1) AND i.canceled_at IS NULL ORDER BY 1`, [ids])).rows.map((x) => x.l).filter(Boolean);
  const location = locations.includes(req.query.loc) ? req.query.loc : "";
  const days = [...new Set([].concat(req.query.d || []).concat(String(req.query.days || "").split(",")).filter((x) => String(x).length).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  const q = str(req.query.q).slice(0, 80), wl = req.query.wl !== "0", blanks = [0, 1, 2, 3, 4, 6].includes(int(req.query.blanks)) ? int(req.query.blanks) : 3;
  const RF = { group: r === "claims" ? { person: "Person", claim: "Claim" } : r === "sess" ? { session: "Session", location: "Location", time: "Day & time" } : { athlete: "Athlete", session: "Session" }, ashow: { noshow: "No-shows", repeat: "Repeat no-shows (3+)", unrec: "Not recorded" }, lview: { at: "At limit", left: "Has spots left", none: "Not started", over: "Over limit" }, fview: { never: "Never signed in", noclaims: "No claims", active: "Active participants", inactive: "Inactive", noaccount: "No account" }, view: { upcoming: "Upcoming", past: "Past", low: "Low enrollment", near: "Nearly full", full: "Full", over: "Over capacity", waitlisted: "Waitlisted", pending: "Attendance pending" }, when: { up: "Upcoming", past: "Past" }, cap: { Low: "Low", Healthy: "Healthy", "Nearly full": "Nearly full", Full: "Full", "Over capacity": "Over capacity" },
    cov: { "Needs people": "Needs people", Covered: "Covered" }, st: { "No account": "No account", "Never signed in": "Never signed in", "Signed in, no claims": "No claims", Active: "Active" },
    prob: { Bounced: "Bounced", spam: "Marked as spam", failed: "Failed" }, ans: { Going: "Going", "Can't make it": "Can't make it", "No answer": "No answer" } };
  const rf = Object.fromEntries(Object.keys(RF).map((k) => [k, RF[k][req.query[k]] ? req.query[k] : ""]));
  const U = require("../views/reports2").USES, uses = (k) => (U[k] || []).includes(r) || (k === "team" && /^assess/.test(r));
  f.view = rf.view; f.fview = rf.fview; f.lview = rf.lview; f.group = rf.group; f.ashow = rf.ashow;
  const whoOpts = r === "claims" ? await D.claimPeople(f) : [];
  f.who = whoOpts.some(([id]) => id === int(req.query.who)) ? int(req.query.who) : null;   // only someone in view
  Object.assign(f, { levels: uses("level") ? subtree : null, location: uses("loc") ? location : "", days: uses("days") ? days : [], btype: uses("bt") ? btype : "", cstatus, astatus, when: rf.when });
  if (!uses("team")) f.team = "";
  if (!uses("dates") && r !== "week") { f.from = "2000-01-01"; f.to = "2100-12-31"; }
  // assessments: which test, which two days, best or average
  let assess = null;
  if (/^assess/.test(r)) {
    const AS = require("../assess"); await AS.ensure();
    const tests = await AS.list(), t = tests.find((x) => x.id === int(req.query.as)) || tests[0] || null, full = t ? await AS.get(t.id) : null;
    const dayList = full ? [...full.days].sort((x, y) => (x.day < y.day ? -1 : 1)) : [];
    const pick = (id, pref, last) => dayList.find((d) => d.id === int(id)) || (last ? [...dayList].reverse() : dayList).find((d) => d.kind === pref) || (last ? dayList[dayList.length - 1] : dayList[0]) || null;
    const da = pick(req.query.da, "Baseline", false), db = pick(req.query.db, "Final", true);
    const yr = (v) => (/^(19|20)\d\d$/.test(String(v || "")) ? Number(v) : null);
    const dsel = req.query.dsel === "all" || !req.query.dsel ? "all" : /^k:/.test(req.query.dsel) && AS.KINDS.includes(req.query.dsel.slice(2)) ? req.query.dsel : dayList.some((d) => d.id === int(req.query.dsel)) ? String(int(req.query.dsel)) : "all";
    const drills = full ? full.drills.filter((x) => !x.retired_at || x.scores) : [];
    assess = { tests, test: t, days: dayList, a: da && da.id, b: db && db.id, how: req.query.how === "avg" ? "avg" : "best", dsel, drills,
      drill: drills.some((x) => x.id === int(req.query.drill)) ? int(req.query.drill) : null, top: req.query.top === "0" ? 0 : [5, 10, 25].includes(int(req.query.top)) ? int(req.query.top) : 10,
      bornFrom: yr(req.query.bf), bornTo: yr(req.query.bt), rank: req.query.rank === "improved" ? "improved" : "best" };
    f.assess = assess;
  }
  let data = r === "assessAthlete" ? await D.assessAthlete(f, int(req.query.pid)) : r === "personView" ? await D.personView(f, int(req.query.pid)) : r === "overview" ? await D.dashboard(f) : r === "volunteer" ? await D.volunteer(f, required) : r === "week" ? await D.weekSheet(f) : await RUN[r](f);
  if (!scope.all && data && data.cols) {   // non-admins: no links into admin pages, no contact details
    const hide = new Set(["emails", "email", "addr"]);
    const lk = data.link, mine = new Set((scope.coached || []).map(Number));
    data = { ...data, link: lk ? (row) => { const h = lk(row); return h && (h.startsWith("/reports") || (h.startsWith("/checkin/") && mine.has(Number(row.board_id)))) ? h : null; } : null, cols: data.cols.filter((c) => !hide.has(c[0])), rows: (data.rows || []).map((row) => { const o = { ...row }; for (const k of hide) delete o[k]; return o; }) };
  }
  // the report's own row filters
  if (data && data.rows && !data.grid) {
    const keep = { cap: (x) => x.status === rf.cap, cov: (x) => x.status === rf.cov, st: (x) => x.status === rf.st || x.account === rf.st, ans: (x) => x.answer === rf.ans,
      prob: (x) => (rf.prob === "Bounced" ? /^Bounced/.test(x.why) : rf.prob === "spam" ? /spam/i.test(x.why) : !/^Bounced|spam/i.test(x.why || "")) };
    for (const k of Object.keys(keep)) if (rf[k]) data = { ...data, rows: data.rows.filter(keep[k]) };
  }
  if (data && data.rows && data.cols && data.cols.some((c) => c[2] === "act")) {   // action buttons: only where this person may go
    const mineB = new Set((scope.coached || []).map(Number));
    const ok = (h, row) => scope.all ? true : h.startsWith("/reports") || (h.startsWith("/checkin/") && mineB.has(Number(row.board_id)));
    data = { ...data, rows: data.rows.map((row) => (row.act && !ok(row.act[1], row) ? { ...row, act: null } : row)) };
  }
  if (q) {   // search: keep rows where any column mentions it
    const needle = q.toLowerCase(), has = (o) => Object.values(o).some((v) => v != null && typeof v !== "object" && String(v).toLowerCase().includes(needle));
    if (data.rows && !data.grid) data = { ...data, rows: data.rows.filter(has) };
    if (data.sessions) data = { ...data, sessions: data.sessions.filter((x) => has(x) || x.people.some(has)) };
  }
  const opts = { assess, levels: levelsAll, level, locations, location, days, q, wl, blanks };
  if (r === "overview") data.tiles = data.kpis.map(([k, label, v, unit, sub]) => [k, label, v, unit, sub]);   // the PDF's number grid
  const filterText = [board ? board.name : several ? several.map((b) => b.name).join(" + ") : "All boards", team, level && level.path, location, days.length && days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join("/"),
    r === "week" ? `week of ${f.weekFrom}` : /^assess/.test(r) ? (assess && assess.test ? assess.test.name : "") : allDates ? "all dates" : `${from} to ${to}`, q && `search “${q}”`].filter(Boolean).join(" · ");
  if (req.query.pdf) {
    const V = require("../views/reports2");
    const buf = await require("../reportPdf").build({ title: `Reports · ${V.TITLES[r] || r}`, filters: filterText, data, kind: r === "overview" ? "overview" : r === "week" ? "week" : "table", opts: { waitlist: wl, blanks } });
    res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="${r}-${(board ? board.name : several ? "several-boards" : "all-boards").replace(/[^A-Za-z0-9 -]/g, "")}.pdf"`);
    return res.send(buf);
  }
  if (!req.query.csv && !req.query.pdf) { const keep = new URLSearchParams(); for (const k of KEEP) if (req.query[k] && k !== "r") keep.set(k, String(req.query[k])); keep.set("r", r); prefs(req.user.id, keep.toString()).catch(() => {}); }
  if ((req.query.csv || req.query.pdf) && data.cols) data = { ...data, cols: data.cols.filter((c) => c[2] !== "act") };   // exports: no action buttons
  if (req.query.csv && data.cols) {
    const q = (x) => `"${String(x == null ? "" : x instanceof Date ? x.toISOString() : x).replace(/"/g, '""')}"`;
    const lines = [data.cols.map((c) => q(c[1])).join(",")].concat(data.rows.map((row) => data.cols.map((c) => q(c[2] === "dt" || c[2] === "date" ? (row[c[0]] ? require("../time").fmtDateTime(row[c[0]]) : "") : row[c[0]])).join(",")));
    res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="${r}-${(board ? board.name : "all-boards").replace(/[^A-Za-z0-9 -]/g, "")}.csv"`);
    return res.send("\ufeff" + lines.join("\r\n"));
  }
  res.send(require("../views/reports2").reportPage({ user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), boards, whoOpts, who: f.who || "", famOK: !!req.famOK, pid: int(req.query.pid) || "", coached: scope.all ? "all" : scope.coached || [], board, several, qd, QD, allDates, custom, RF, rf, BT, btype, CS, cstatus, AT, astatus, kinds, views: await savedViews(req.user.id), r, data, from, to, team, teams, required, week: f.weekFrom, opts, filterText }));
}

// remembered report + top filters, per person (re-checked against their permissions like any address)
const KEEP = ["r", "s", "team", "level", "loc", "stype", "qd", "from", "to"];
async function prefs(uid, qs) {
  await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  if (qs === undefined) { const r = (await query(`SELECT value FROM app_kv WHERE key=$1`, [`report_prefs:${uid}`])).rows[0]; return r ? r.value : null; }
  if (qs === null) return query(`DELETE FROM app_kv WHERE key=$1`, [`report_prefs:${uid}`]);
  return query(`INSERT INTO app_kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [`report_prefs:${uid}`, JSON.stringify(qs)]);
}
async function viewPref(uid, v) {
  await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  if (v === undefined) { const r = (await query(`SELECT value FROM app_kv WHERE key=$1`, [`report_view:${uid}`])).rows[0]; return r ? r.value : null; }
  return query(`INSERT INTO app_kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [`report_view:${uid}`, JSON.stringify(v)]);
}
// ---------- My Family ----------
async function familyReport(req, res, mgmt, fam) {
  const FD = require("../familyData"), V = require("../views/family");
  const r = V.SECTIONS.some(([k]) => k === req.query.r) ? req.query.r : "fOverview";
  const ids = fam.map((p) => p.id), sel = ids.includes(int(req.query.a)) ? int(req.query.a) : "";   // only this person's own family
  const scopeIds = sel ? [sel] : ids, all = await FD.claims(scopeIds);
  const boards = [...new Map(all.map((c) => [c.board_id, { id: c.board_id, name: c.board }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const board = boards.some((b) => b.id === int(req.query.b)) ? int(req.query.b) : "";
  const list = board ? all.filter((c) => c.board_id === board) : all;
  const show = ["past", "waitlisted", "released", "all"].includes(req.query.show) ? req.query.show : "", whenF = req.query.when === "past" ? "past" : "";
  const mode = r === "fSchedule" && req.query.mode === "cal" ? "cal" : "", todayM = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(String(req.query.m || "")) ? String(req.query.m) : todayM;
  const url = (o = {}) => { const q = { view: "family", r, a: sel, b: board, show: r === "fClaims" ? show : "", when: r === "fSchedule" && !mode ? whenF : "", mode, m: mode && month !== todayM ? month : "", ...o }; return `/reports?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== "" && v != null))}`; };
  let data;
  if (r === "fOverview") {
    const athletes = fam.filter((p) => scopeIds.includes(p.id) && p.kind === "athlete").map((p) => p.id), prog = await FD.progress(athletes);
    data = { upcoming: list.filter((c) => !c.past && c.status !== "canceled"), active: list.filter((c) => !c.past && c.status === "confirmed").length, waitlisted: list.filter((c) => !c.past && c.status === "waitlisted").length,
      att: FD.attendance(list), prog, activity: FD.activity(list, prog, fam) };
  } else if (r === "fClaims") data = list.filter(show === "past" ? (c) => c.past && c.status === "confirmed" : show === "waitlisted" ? (c) => c.status === "waitlisted" : show === "released" ? (c) => c.status === "canceled" : show === "all" ? () => true : (c) => !c.past && c.status !== "canceled");
  else if (r === "fAttendance") data = FD.attendance(list);
  else if (r === "fProgress") data = await FD.progress(fam.filter((p) => scopeIds.includes(p.id) && p.kind === "athlete").map((p) => p.id));
  else if (mode === "cal") data = list.filter((c) => c.status !== "canceled" && new Date(c.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 7) === month);
  else data = whenF === "past" ? list.filter((c) => c.past && c.status === "confirmed").reverse() : list.filter((c) => !c.past && c.status !== "canceled");
  if (req.query.csv && ["fClaims", "fAttendance", "fSchedule"].includes(r)) {
    const rows = r === "fAttendance" ? data.history : data, cq = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const fmt = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    const lines = [["Athlete", "Date / time", "Session", "Location", "Board", "Status", "Attendance"].map(cq).join(","), ...rows.map((c) => [c.who, fmt(c.starts_at), c.session, c.location, c.board, c.state, c.att].map(cq).join(","))];
    res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="my-family-${r.slice(1).toLowerCase()}.csv"`);
    return res.send("\ufeff" + lines.join("\r\n"));
  }
  res.send(V.familyPage({ user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), people: fam, sel, r, data, url, mgmt, boards, board, show, whenF, mode, month }));
}
router.get("/", wrap(async (req, res, next) => {
  if (req.query.reset) { await prefs(req.user.id, null); return res.redirect(`/reports?r=${encodeURIComponent(String(req.query.r || "overview"))}`); }
  if (!Object.keys(req.query).length && (await viewPref(req.user.id)) !== "family") { const p = await prefs(req.user.id); if (p && typeof p === "string" && p.length) return res.redirect(`/reports?${p}`); }
  next();
}));
router.get("/", wrap(async (req, res) => {
  const scope = await PP.reportScope(req.user), fam = await require("../familyData").people(req.user);
  if (!scope && !fam.length) return go(res, "/dashboard", { err: "You don't have access to reports. Ask an admin if you need it." });
  req.user.can_reports = true;
  // My Family for parents / athletes; people with both views get a switch, and the last one they used is remembered
  if (req.query.view === "family" || req.query.view === "mgmt") viewPref(req.user.id, req.query.view).catch(() => {});
  req.famOK = fam.length > 0;
  if (fam.length && (!scope || req.query.view === "family" || (!req.query.view && !req.query.r && (await viewPref(req.user.id)) === "family"))) return familyReport(req, res, !!scope, fam);
  const boards = (await query(`SELECT id, name, archived_at, groups, board_type FROM schedules WHERE ${scope.all ? "TRUE" : "id = ANY($1)"} ORDER BY archived_at NULLS FIRST, name`, scope.all ? [] : [scope.boards])).rows;
  if (!boards.length) return go(res, "/dashboard", { err: "No boards to report on yet." });
  if (req.query.v && !req.query.r) return res.redirect(`/reports?${new URLSearchParams({ ...req.query, r: req.query.v === "all" ? "all" : "person", v: "" })}`);   // older links → the filterable claims reports
  return newReport(req, res, scope, boards);   // everyone: the reports, limited to their boards (and teams)
  if (req.query.s === "all") req.query.s = "";   // By person / All claims are for one board
  if (req.query.r === "all") req.query.v = "all";
  // open on the board asked for, or the one with the most recent claim
  const busiest = (await query(`SELECT i.schedule_id FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE i.schedule_id = ANY($1) AND c.status<>'canceled'
    ORDER BY c.created_at DESC LIMIT 1`, [boards.map((b) => b.id)])).rows[0];
  const sid = boards.some((b) => b.id === int(req.query.s)) ? int(req.query.s) : busiest ? busiest.schedule_id : boards[0].id;
  const board = boards.find((b) => b.id === sid);
  const teamFilter = str(req.query.team);
  let rows = (await query(`SELECT c.id, c.status, c.counts, c.note, c.attended, c.walk_in, c.added_by_admin, c.override, c.created_at, a.id AS athlete_id, a.first_name, a.last_name, a.kind,
      m.group_name, i.title, i.starts_at, i.ends_at,
      (SELECT string_agg(n.name, ' › ' ORDER BY n.d DESC) FROM (WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS d FROM board_nodes WHERE id=i.node_id
         UNION ALL SELECT p.id, p.parent_id, p.name, up.d+1 FROM board_nodes p JOIN up ON p.id=up.parent_id) SELECT * FROM up) n) AS path
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN athletes a ON a.id=c.athlete_id
    LEFT JOIN schedule_members m ON m.schedule_id=i.schedule_id AND m.athlete_id=a.id
    WHERE i.schedule_id=$1 AND c.status<>'canceled' ORDER BY i.starts_at NULLS LAST, a.last_name, a.first_name`, [sid])).rows;
  // teams this person may see (empty = all), then the optional on-page team filter
  if (scope.teams.length) rows = rows.filter((r) => scope.teams.includes(r.group_name));
  const teams = [...new Set(rows.map((r) => r.group_name).filter(Boolean))].sort();
  if (teamFilter) rows = rows.filter((r) => r.group_name === teamFilter);
  if (req.query.csv) {
    const q = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
    const lines = [["Name", "Team", "Where", "When", "Status", "Attended", "Answer"].map(q).join(",")]
      .concat(rows.map((r) => [`${r.first_name} ${r.last_name}`, r.group_name || "", r.path || "", slotName(r), r.status, r.attended == null ? "" : r.attended ? "yes" : "no", r.note || ""].map(q).join(",")));
    res.set("Content-Type", "text/csv").set("Content-Disposition", `attachment; filename="${board.name.replace(/[^A-Za-z0-9 -]/g, "")} report.csv"`);
    return res.send(lines.join("\r\n"));
  }
  const people = [...rows.reduce((m, r) => { const k = r.athlete_id; const p = m.get(k) || { name: `${r.first_name} ${r.last_name}`, team: r.group_name, claimed: 0, waitlisted: 0, attended: 0, missed: 0, last: null };
    if (r.status === "confirmed") p.claimed++; else p.waitlisted++; if (r.attended === true) p.attended++; if (r.attended === false) p.missed++;
    if (r.starts_at && (!p.last || r.starts_at > p.last)) p.last = r.starts_at; return m.set(k, p); }, new Map()).values()].sort((a, b) => a.name.localeCompare(b.name));
  res.send(require("../views/reports2").reportsPage({ user: req.user, flash: flashFrom(req), admin: auth.isAdmin(req.user), boards, board, rows, people, teams, teamFilter,
    view: req.query.v === "all" ? "all" : "person", limitedTo: scope.teams }));
}));

module.exports = router;
