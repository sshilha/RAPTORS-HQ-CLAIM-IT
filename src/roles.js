// Roles: what each person can see and do (App Settings → Roles). A person can have several roles; their abilities
// are the sum of them. Each role has a reach — where its permissions apply:
//   all      every board
//   coached  boards they coach (board → Access & people)
//   managed  boards and teams they manage (the person's Team manager card)
//   own      their own family only (no boards)
// Administrator always has every permission everywhere and can't be edited. ADMIN_EMAILS (Railway) are always
// administrators. Everything is checked on the server; hiding a menu item never stands in for a check.
const { query } = require("./db");

// Permissions: [key, label, hint, kind]. kind "vf" = No access / View only / Full; "yn" = No / Yes.
const REPORTS = [["overview", "Overview"], ["claims", "Claims"], ["attend", "Attendance"], ["teams", "Teams"], ["limits", "Limits"], ["answers", "Answers"], ["waitlists", "Waitlists"],
  ["sess", "Sessions"], ["signups", "Sign-ups"], ["week", "Weekly Rosters"], ["engagement", "Families"], ["volunteer", "Volunteers"], ["emails", "Communication issues"],
  ["assessResults", "Assessments: Results"], ["assessDay", "Assessments: Testing day"], ["assessProgress", "Assessments: Progress"], ["assessLeaders", "Assessments: Leaderboard"], ["assessTeam", "Assessments: Teams"], ["rsvp", "RSVP"]];
const PERMS = [
  ["Claim Boards", [["boards.create", "Create and import boards", "New boards, and importing a board from a file", "yn"],
    ["board.setup", "Board setup", "Levels and sessions. View only, or Full to change them", "vf"], ["board.details", "Board details", "Name, dates, location, type and look, organizers", "vf"],
    ["board.access", "Access & people", "Who's on the board, groups, tags, and roles on the board", "vf"], ["board.defaults", "Board defaults", "Rules, limits, attendance and other defaults", "vf"],
    ["board.notify", "Notifications", "Reminders and notification emails for the board", "vf"], ["board.questions", "Questions", "Claim questions and their rules", "vf"],
    ["board.publish", "Publish and unpublish", "", "yn"], ["board.export", "Export and QR code", "", "yn"], ["board.copy", "Copy a board", "", "yn"], ["board.archive", "Archive and delete boards", "", "yn"],
    ["session.people", "A session's People page", "View who's on a session, or Full to add, remove and record RSVPs", "vf"], ["session.waitlist", "Manage the waitlist", "Remove people from a session's waitlist (promotion happens on its own when a spot opens)", "yn"], ["session.override", "Override the rules when adding someone", "Past limits, full sessions and closed sign-ups", "yn"]]],
  ["Family", [["family.signup", "Sign up for sessions", "Claim spots on Sign Up for Something", "yn"], ["family.release", "Release their spots", "Give a claimed spot back", "yn"],
    ["family.answers", "Change their answers", "Answers to claim questions, on My Claims", "yn"], ["family.add", "Add family members", "Request it: an administrator approves. Add directly: added right away", "ra"], ["family.reports", "My Family reports", "Schedule, claims, attendance and assessment results", "yn"]]],
  ["Check-in", [["checkin.attendance", "Attendance tab", "View only: see rosters. Full: record Here / No-show", "vf"], ["checkin.signups", "Sign-ups only tab", "Who's signed up for sessions without attendance", "yn"],
    ["checkin.markall", "Mark everyone here", "", "yn"], ["checkin.walkin", "Add walk-ins", "", "yn"], ["checkin.afterclose", "Change attendance after check-in closes", "", "yn"]]],
  ["Reports", [...REPORTS.map(([k, l]) => [`report.${k}`, l, "", "yn"]), ["reports.export", "Download CSV and PDF", "", "yn"], ["reports.contacts", "See email addresses and phone numbers", "In reports and exports", "yn"]]],
  ["People", [["people.person", "People list and person pages", "View only, or Full to edit details, family links, kind and archive", "vf"],
    ["people.invite", "Invite people and approve account requests", "Invites, sign-in codes, account requests", "yn"], ["people.roles", "Assign roles", "Give people roles and boards", "yn"],
    ["people.lists", "Lists", "Make lists and add people to them", "yn"], ["people.bulk", "Bulk actions", "Change many people at once", "yn"], ["people.import", "Import people", "", "yn"],
    ["people.export", "Export people", "Download the People list", "yn"], ["people.merge", "Merge duplicates", "", "yn"], ["people.cleanup", "Clean up", "Old and unused records", "yn"]]],
  ["Assessments", [["assess.setup", "Assessments, drills and testing days", "View only, or Full to change them", "vf"], ["assess.scores", "Enter scores", "View only, or Full to enter and change scores", "vf"],
    ["assess.share", "Share testing days with families", "", "yn"], ["assess.allteams", "See every team's assessment results", "No: only the teams on their role (when teams are set on it)", "yn"]]],
  ["Communication", [["comm.message", "Send messages", "To people, a board or team, a session, or a list (per-board roles: their own boards)", "yn"],
    ["comm.sendnow", "Send automated emails now", "Re-send open spots, helper spots, RSVP and claim reminders, invitations", "yn"], ["comm.templates", "Email templates and branding", "View only, or Full to change them", "vf"], ["comm.test", "Send test emails", "", "yn"], ["comm.emaillog", "Email log", "Every email sent and what happened to it", "yn"]]],
  ["Accounts", [["accounts.settings", "Account settings", "Sign-in and account options", "vf"], ["accounts.admins", "Administrators", "View only, or Full to add and remove administrators", "vf"],
    ["settings.roles", "Roles", "View only, or Full to create and edit roles", "vf"], ["accounts.online", "On now", "", "yn"], ["accounts.activity", "Activity log", "", "yn"],
    ["accounts.signins", "Sign-in activity", "", "yn"], ["accounts.signinas", "Sign in as someone", "See the app as another person", "yn"]]],
  ["Organization", [["org.locations", "Locations", "Saved places", "vf"], ["org.wording", "Wording", "The app's labels and names", "vf"], ["org.pictures", "Pictures", "Logos and images", "vf"], ["org.olddata", "Old data", "Download or remove old records", "vf"]]],
];
const KIND = Object.fromEntries(PERMS.flatMap(([, ps]) => ps.map((p) => [p[0], p[3]])));
const ALL = Object.keys(KIND);
const LV = { none: 0, view: 1, full: 2 };
const FULL = Object.fromEntries(ALL.map((k) => [k, "full"]));
const SCOPE = { everywhere: "Everywhere (all boards)", type: "All boards of a type (Program, Volunteer or RSVP)", board: "Per board (given for specific boards, maybe some teams)", own: "Their own family or self" };
const BOARD_TYPES = { training: "Program boards", volunteer: "Volunteer boards", rsvp: "RSVP boards" };
const NOTIFY = { claimed: "Someone claims or joins the waitlist", released: "Someone releases a spot", full: "A session fills up", opened: "Spots open up on a full session" };
const REPORT_CATS = { overview: ["overview"], participation: ["claims", "attend", "teams", "limits", "answers", "waitlists"], sessions: ["sess", "signups", "week"],
  families: ["engagement", "volunteer", "emails"], assessments: ["assessResults", "assessDay", "assessProgress", "assessLeaders", "assessTeam"], rsvp: ["rsvp"] };
const staffReports = Object.fromEntries(REPORTS.filter(([k]) => k !== "emails").map(([k]) => [`report.${k}`, "full"]));
const famGrants = { "family.signup": "full", "family.release": "full", "family.answers": "full", "family.add": "view", "family.reports": "full" };
const BUILTIN = [
  { key: "admin", name: "Administrator", scope: "everywhere", grants: FULL, locked: true, description: "Everything, everywhere. Can't be changed." },
  { key: "coach", name: "Coach", scope: "board", grants: { "comm.message": "full", "assess.scores": "full", "checkin.attendance": "full", "checkin.signups": "full", "checkin.markall": "full", "checkin.walkin": "full", ...staffReports, "reports.export": "full" }, description: "On the boards they coach: Check-in and Reports." },
  { key: "manager", name: "Team manager", scope: "board", grants: { ...staffReports, "reports.export": "full" }, description: "On the boards (and teams) they manage: Reports." },
  { key: "family", name: "Family", scope: "own", grants: famGrants, description: "Parents and guardians: sign up their athletes and see My Family." },
  { key: "athlete", name: "Athlete", scope: "own", grants: famGrants, description: "Athletes with their own sign-in: sign themselves up and see My Family." },
];
let ready = null;
function ensure() {
  return ready || (ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, key TEXT UNIQUE, name TEXT NOT NULL, description TEXT, reach TEXT NOT NULL DEFAULT 'own',
      perms TEXT[] NOT NULL DEFAULT '{}', locked BOOLEAN NOT NULL DEFAULT false, sort INT NOT NULL DEFAULT 0, archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS scope TEXT`);
    await query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS grants JSONB`);
    await query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS board_type TEXT`);   // scope "type": which kind of board
    await query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS notify JSONB NOT NULL DEFAULT '{}'`);   // emails people with this role get
    await query(`ALTER TABLE schedule_coaches ADD COLUMN IF NOT EXISTS teams TEXT[] NOT NULL DEFAULT '{}'`);   // a coach's teams on that board (optional)
    await query(`CREATE TABLE IF NOT EXISTS user_roles (user_id INT NOT NULL, role_id INT NOT NULL, assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, role_id))`);
    // per-board roles other than Coach (board coaches list) and Team manager (Team manager cards): who, which role, which board, which teams
    await query(`CREATE TABLE IF NOT EXISTS role_boards (email TEXT NOT NULL, role_id INT NOT NULL, schedule_id INT NOT NULL, teams TEXT[] NOT NULL DEFAULT '{}', PRIMARY KEY (email, role_id, schedule_id))`);
    await query(`ALTER TABLE athletes ADD COLUMN IF NOT EXISTS role_ids INT[]`);   // roles picked for a person before they have a sign-in
    await query(`CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await require("./people").ensureManagers();
    const fresh = !(await query(`SELECT 1 FROM roles LIMIT 1`)).rowCount;
    for (const [i, b] of BUILTIN.entries())
      await query(`INSERT INTO roles (key, name, description, scope, grants, locked, sort) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (key) DO NOTHING`, [b.key, b.name, b.description, b.scope, JSON.stringify(b.grants), !!b.locked, i]);
    await query(`UPDATE roles SET grants=$1, scope='everywhere' WHERE key='admin'`, [JSON.stringify(FULL)]);   // Administrator: every permission, new ones included
    await migrate(fresh);
  })().catch((e) => { ready = null; throw e; }));
}
const roleId = async (key) => (await query(`SELECT id FROM roles WHERE key=$1`, [key])).rows[0].id;
const env = () => (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
async function flag(k) { return (await query(`SELECT 1 FROM app_kv WHERE key=$1`, [k])).rowCount > 0; }
async function setFlag(k) { await query(`INSERT INTO app_kv (key, value) VALUES ($1, 'true'::jsonb) ON CONFLICT (key) DO NOTHING`, [k]); }
async function migrate() {
  const give = async (key, sql, args = []) => { const r = await roleId(key); await query(`INSERT INTO user_roles (user_id, role_id) SELECT DISTINCT u.id, ${r} FROM users u WHERE ${sql} ON CONFLICT DO NOTHING`, args); };
  // 1. first time: everyone gets the role matching what they could do before roles existed
  if (!(await flag("roles_migrated"))) {
    await give("admin", `lower(u.email) = ANY($1) OR lower(u.email) IN (SELECT lower(email) FROM app_admins)`, [env()]);
    for (const p of (await query(`SELECT a.email, a.self_user_id, a.report_access FROM athletes a WHERE a.report_access->>'mode' = 'boards' AND a.archived_at IS NULL`)).rows) {   // older Reports access → Team manager
      const email = p.email || (p.self_user_id ? ((await query(`SELECT email FROM users WHERE id=$1`, [p.self_user_id])).rows[0] || {}).email : null); if (!email) continue;
      for (const b of (p.report_access.boards || []).map(Number).filter(Boolean)) await query(`INSERT INTO board_managers (schedule_id, email, teams) VALUES ($1,lower($2),$3) ON CONFLICT DO NOTHING`, [b, email, (p.report_access.teams || []).filter(Boolean)]);
    }
    await setFlag("roles_migrated");
  }
  // 2. per-function levels, per-board roles, and Athlete apart from Family
  if (!(await flag("roles_v2"))) {
    const map = { "checkin.view": [["checkin.attendance", "view"], ["checkin.signups", "full"]], "checkin.attendance": [["checkin.attendance", "full"], ["checkin.markall", "full"], ["checkin.walkin", "full"]],
      "reports.export": [["reports.export", "full"]], "reports.contacts": [["reports.contacts", "full"]], "reports.emaillog": [["report.emails", "full"]],
      "people.view": [["people.person", "view"]], "people.edit": [["people.person", "full"]], "people.invite": [["people.invite", "full"]], "people.roles": [["people.roles", "full"]],
      "settings.roles": [["settings.roles", "full"]], "family.signup": [["family.signup", "full"], ["family.release", "full"], ["family.answers", "full"]], "family.reports": [["family.reports", "full"]] };
    for (const [cat, keys] of Object.entries(REPORT_CATS)) map[`reports.${cat}`] = keys.filter((k) => k !== "emails").map((k) => [`report.${k}`, "full"]);
    for (const r of (await query(`SELECT * FROM roles WHERE key IS NULL OR key NOT IN ('admin')`)).rows) {
      if (r.grants && r.scope) continue;
      const g = {}; for (const p of r.perms || []) for (const [k, v] of map[p] || []) if ((LV[v] || 0) > (LV[g[k]] || 0)) g[k] = v;
      const scope = r.reach === "all" ? "everywhere" : r.reach === "own" ? "own" : "board";
      await query(`UPDATE roles SET grants=$2, scope=$3 WHERE id=$1`, [r.id, JSON.stringify(g), scope]);
      if (r.key) continue;   // built-ins: Coach and Team manager assignments already live in the coaches lists and Team manager cards
      // a custom per-board role: its people get it on the boards they coached (or managed) before
      for (const u of (await query(`SELECT u.email FROM user_roles ur JOIN users u ON u.id=ur.user_id WHERE ur.role_id=$1`, [r.id])).rows) {
        const rows = r.reach === "managed" ? (await query(`SELECT schedule_id, teams FROM board_managers WHERE lower(email)=lower($1)`, [u.email])).rows : (await query(`SELECT schedule_id, '{}'::text[] AS teams FROM schedule_coaches WHERE lower(email)=lower($1)`, [u.email])).rows;
        for (const b of rows) await query(`INSERT INTO role_boards (email, role_id, schedule_id, teams) VALUES (lower($1),$2,$3,$4) ON CONFLICT DO NOTHING`, [u.email, r.id, b.schedule_id, b.teams || []]);
        // they had this role instead of Coach there (before, a coaching-type role kept Coach away): keep it that way
        if (r.reach !== "managed") await query(`DELETE FROM schedule_coaches WHERE lower(email)=lower($1)`, [u.email]);
      }
    }
    // per-board roles live in their assignments, not as "everywhere" memberships
    await query(`DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE scope='board')`);
    // Family for parents and guardians; Athlete for athletes with their own sign-in (both, for someone who is both)
    await give("family", `u.id IN (SELECT user_id FROM parent_athletes)`);
    await give("athlete", `u.id IN (SELECT self_user_id FROM athletes WHERE self_user_id IS NOT NULL AND kind='athlete' AND archived_at IS NULL)`);
    await query(`DELETE FROM user_roles ur USING roles r WHERE r.id=ur.role_id AND r.key='family' AND ur.user_id NOT IN (SELECT user_id FROM parent_athletes)
      AND ur.user_id IN (SELECT self_user_id FROM athletes WHERE self_user_id IS NOT NULL AND kind='athlete')`);   // athletes (not parents): Athlete instead of Family
    await give("family", `u.id IN (SELECT self_user_id FROM athletes WHERE self_user_id IS NOT NULL AND kind='adult' AND archived_at IS NULL) AND u.id IN (SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.key='family')`);
    await setFlag("roles_v2");
  }
  // 3. Claim Boards and App settings by function: coaches keep entering scores for their boards' testing days
  if (!(await flag("roles_v5"))) {   // coaches can message their own boards
    await query(`UPDATE roles SET grants = coalesce(grants,'{}'::jsonb) || '{"comm.message": "full"}'::jsonb WHERE key='coach'`);
    await setFlag("roles_v5");
  }
  if (!(await flag("roles_v4"))) {   // families and athletes keep requesting additions, as before
    await query(`UPDATE roles SET grants = coalesce(grants,'{}'::jsonb) || '{"family.add": "view"}'::jsonb WHERE key IN ('family','athlete')`);
    await setFlag("roles_v4");
  }
  if (!(await flag("roles_v3"))) {
    await query(`UPDATE roles SET grants = coalesce(grants,'{}'::jsonb) || '{"assess.scores": "full"}'::jsonb WHERE key='coach'`);
    await setFlag("roles_v3");
  }
}

// ---------- reading ----------
const grantsOf = (r) => (r.key === "admin" ? FULL : r.grants || {});
async function list() { await ensure(); return (await query(`SELECT r.*, (SELECT count(*)::int FROM user_roles ur WHERE ur.role_id=r.id) AS people FROM roles r WHERE r.archived_at IS NULL ORDER BY r.sort, r.id`)).rows; }
async function rolesOf(userId) { await ensure(); return (await query(`SELECT r.* FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.archived_at IS NULL ORDER BY r.sort, r.id`, [userId])).rows; }
// per-board assignments for an email: [{ role, schedule_id, teams }] (Coach from the board coaches lists; Team manager from Team manager cards)
async function assignmentsOf(email) {
  await ensure(); if (!email) return [];
  const roles = new Map((await query(`SELECT * FROM roles WHERE archived_at IS NULL AND scope='board'`)).rows.map((r) => [r.id, r])), byKey = (k) => [...roles.values()].find((r) => r.key === k);
  const out = [];
  if (byKey("coach")) for (const b of (await query(`SELECT schedule_id, teams FROM schedule_coaches WHERE lower(email)=lower($1)`, [email])).rows) out.push({ role: byKey("coach"), schedule_id: b.schedule_id, teams: b.teams || [] });
  if (byKey("manager")) for (const b of (await query(`SELECT schedule_id, teams FROM board_managers WHERE lower(email)=lower($1)`, [email])).rows) out.push({ role: byKey("manager"), schedule_id: b.schedule_id, teams: b.teams || [] });
  for (const b of (await query(`SELECT role_id, schedule_id, teams FROM role_boards WHERE lower(email)=lower($1)`, [email])).rows) if (roles.has(b.role_id)) out.push({ role: roles.get(b.role_id), schedule_id: b.schedule_id, teams: b.teams || [] });
  return out;
}
// A user's abilities. level(perm, board?) → 0 none / 1 view / 2 full; boards(perm, min) → { all, map: Map(boardId → teams[] | null) }.
async function forUser(user) {
  if (!user) return none();
  if (user._access) return user._access;
  await ensure(); await settle(user);
  const admin = require("./auth").isAdmin(user);
  let own = await rolesOf(user.id), asg = await assignmentsOf(user.email);
  if (user._preview) {   // previewing a role (App Settings → Roles → Preview): only that role, on the board picked
    const r = (await query(`SELECT * FROM roles WHERE id=$1`, [user._preview.role])).rows[0];
    own = r && r.scope !== "board" ? [r] : []; asg = r && r.scope === "board" && user._preview.board ? [{ role: r, schedule_id: Number(user._preview.board), teams: [] }] : [];
  }
  const types = new Map((await query(`SELECT id, coalesce(board_type,'training') AS t FROM schedules WHERE archived_at IS NULL`)).rows.map((b) => [b.id, b.t]));
  const roles = admin ? [{ key: "admin", name: "Administrator", scope: "everywhere", grants: FULL }, ...own.filter((r) => r.key !== "admin")] : own;
  const names = [...new Set([...roles.map((r) => r.name), ...asg.map((a) => a.role.name)])];
  const lv = (r, p) => LV[grantsOf(r)[p]] || 0;
  const cache = new Map();
  const boards = (perm, min = 1) => {
    const k = `${perm}|${min}`; if (cache.has(k)) return cache.get(k);
    const out = { all: roles.some((r) => r.scope === "everywhere" && lv(r, perm) >= min), map: new Map() };
    for (const r of roles) if (r.scope === "type" && lv(r, perm) >= min) for (const [id, t] of types) if (t === (r.board_type || "training")) out.map.set(id, null);   // every board of that type
    for (const a of asg) if (lv(a.role, perm) >= min) { const cur = out.map.get(a.schedule_id), t = a.teams.length ? a.teams : null;
      out.map.set(a.schedule_id, t === null || cur === null ? null : [...new Set([...(cur || []), ...t])]); }
    cache.set(k, out); return out;
  };
  const level = (perm, boardId) => {
    let best = 0;
    for (const r of roles) if (r.scope === "everywhere" || r.scope === "own" || (r.scope === "type" && (boardId == null || types.get(Number(boardId)) === (r.board_type || "training")))) best = Math.max(best, lv(r, perm));
    for (const a of asg) if (boardId == null || a.schedule_id === Number(boardId)) best = Math.max(best, lv(a.role, perm));
    return best;
  };
  const acc = { admin, roles, names, level, boards, has: (p, min = 1) => level(p) >= min,
    can: (p, boardId, team = undefined, min = 1) => { const b = boards(p, min); if (b.all) return true; if (!b.map.has(Number(boardId))) return false; const t = b.map.get(Number(boardId)); return t === null || team === undefined || t.includes(team); } };
  Object.defineProperty(user, "_access", { value: acc, enumerable: false, configurable: true });
  return acc;
}
function none() { return { admin: false, roles: [], names: [], level: () => 0, has: () => false, boards: () => ({ all: false, map: new Map() }), can: () => false }; }

// A sign-in with no roles yet: the roles picked for their person record, or Family (parents) / Athlete (own athlete record).
async function settle(user) {
  if ((await query(`SELECT 1 FROM user_roles WHERE user_id=$1 LIMIT 1`, [user.id])).rowCount) return;
  const picked = (await query(`SELECT role_ids FROM athletes WHERE (self_user_id=$1 OR lower(email)=lower($2)) AND archived_at IS NULL AND role_ids IS NOT NULL ORDER BY id LIMIT 1`, [user.id, user.email])).rows[0];
  const ids = picked && picked.role_ids ? (await query(`SELECT id FROM roles WHERE id = ANY($1) AND scope <> 'board' AND archived_at IS NULL`, [picked.role_ids])).rows.map((r) => r.id) : [];
  if (ids.length) { for (const r of ids) await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, r]); return; }
  if ((await query(`SELECT 1 FROM parent_athletes WHERE user_id=$1 LIMIT 1`, [user.id])).rowCount) await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, await roleId("family")]);
  if ((await query(`SELECT 1 FROM athletes WHERE self_user_id=$1 AND kind='athlete' AND archived_at IS NULL LIMIT 1`, [user.id])).rowCount) await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, await roleId("athlete")]);
}

// ---------- changing ----------
// a user's Everywhere and Own roles (per-board roles are set with setBoardRoles). Administrator mirrors App Settings → Administrators.
async function setUserRoles(userId, roleIds) {
  await ensure();
  const u = (await query(`SELECT id, email FROM users WHERE id=$1`, [userId])).rows[0]; if (!u) return;
  const valid = (await query(`SELECT id, key FROM roles WHERE id = ANY($1) AND archived_at IS NULL AND scope <> 'board'`, [roleIds.map(Number).filter(Boolean)])).rows;
  const adminId = await roleId("admin"), wantsAdmin = valid.some((r) => r.key === "admin");
  if (!wantsAdmin && (await query(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2`, [userId, adminId])).rowCount) {
    const others = (await query(`SELECT count(*)::int AS n FROM user_roles WHERE role_id=$1 AND user_id<>$2`, [adminId, userId])).rows[0].n;
    if (!others && !env().length) throw new Error("This is the last administrator. Give someone else the Administrator role first.");
  }
  await query(`DELETE FROM user_roles WHERE user_id=$1 AND NOT (role_id = ANY($2))`, [userId, valid.map((r) => r.id)]);
  for (const r of valid) await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, r.id]);
  if (wantsAdmin) await query(`INSERT INTO app_admins (email) VALUES (lower($1)) ON CONFLICT DO NOTHING`, [u.email]).catch(() => {});
  else await query(`DELETE FROM app_admins WHERE lower(email)=lower($1)`, [u.email]).catch(() => {});
  await require("./auth").loadAdmins();
}
async function setPersonRoles(athleteId, roleIds) {
  await ensure();
  const p = (await query(`SELECT id, email, self_user_id FROM athletes WHERE id=$1`, [athleteId])).rows[0]; if (!p) return;
  const ids = (await query(`SELECT id FROM roles WHERE id = ANY($1) AND scope <> 'board'`, [roleIds.map(Number).filter(Boolean)])).rows.map((r) => r.id);
  await query(`UPDATE athletes SET role_ids=$2 WHERE id=$1`, [p.id, ids]);
  const uid = p.self_user_id || (p.email ? ((await query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [p.email])).rows[0] || {}).id : null);
  if (uid) await setUserRoles(uid, ids);
}
// a per-board role for someone: the boards (and teams) they have it on. Coach → the board coaches lists; Team manager → Team manager cards.
async function setBoardRoles(email, roleId_, boards) {
  await ensure(); email = String(email || "").trim().toLowerCase(); if (!email) return;
  const r = (await query(`SELECT * FROM roles WHERE id=$1 AND scope='board' AND archived_at IS NULL`, [roleId_])).rows[0]; if (!r) return;
  const list = boards.map((b) => ({ id: Number(b.id), teams: (b.teams || []).map((t) => String(t).trim()).filter(Boolean) })).filter((b) => b.id);
  if (r.key === "coach") {
    await query(`DELETE FROM schedule_coaches WHERE lower(email)=$1 AND NOT (schedule_id = ANY($2))`, [email, list.map((b) => b.id)]);
    for (const b of list) { const n = (await query(`UPDATE schedule_coaches SET teams=$3 WHERE schedule_id=$1 AND lower(email)=$2`, [b.id, email, b.teams])).rowCount;
      if (!n) await query(`INSERT INTO schedule_coaches (schedule_id, email, teams) VALUES ($1,$2,$3)`, [b.id, email, b.teams]); }
  } else if (r.key === "manager") {
    await query(`DELETE FROM board_managers WHERE lower(email)=$1 AND NOT (schedule_id = ANY($2))`, [email, list.map((b) => b.id)]);
    for (const b of list) await query(`INSERT INTO board_managers (schedule_id, email, teams) VALUES ($1,$2,$3) ON CONFLICT (schedule_id, email) DO UPDATE SET teams=EXCLUDED.teams`, [b.id, email, b.teams]);
  } else {
    await query(`DELETE FROM role_boards WHERE lower(email)=$1 AND role_id=$2`, [email, r.id]);
    for (const b of list) await query(`INSERT INTO role_boards (email, role_id, schedule_id, teams) VALUES ($1,$2,$3,$4)`, [email, r.id, b.id, b.teams]);
  }
}
// Emails by role (App Settings → Roles → Notifications): tell everyone whose role covers this board (and team).
async function roleAlert(event, claimId) {
  if (!NOTIFY[event]) return 0;
  await ensure();
  const c = (await query(`SELECT c.status, c.athlete_id, a.first_name, a.last_name, i.id AS item_id, i.schedule_id, i.title, i.starts_at, i.ends_at, i.capacity, sc.name AS board, coalesce(sc.board_type,'training') AS btype, m.group_name AS team,
      (SELECT count(*)::int FROM board_claims x WHERE x.item_id=i.id AND x.status='confirmed' AND x.counts) AS taken
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id
    LEFT JOIN schedule_members m ON m.schedule_id=i.schedule_id AND m.athlete_id=c.athlete_id WHERE c.id=$1`, [claimId])).rows[0];
  if (!c) return 0;
  const roles = (await query(`SELECT * FROM roles WHERE archived_at IS NULL AND (notify->>$1)::boolean`, [event])).rows; if (!roles.length) return 0;
  const to = new Set();
  for (const r of roles) {
    if (r.scope === "everywhere" || (r.scope === "type" && (r.board_type || "training") === c.btype)) for (const u of (await query(`SELECT u.email FROM user_roles ur JOIN users u ON u.id=ur.user_id WHERE ur.role_id=$1`, [r.id])).rows) to.add(u.email.toLowerCase());
    if (r.scope === "board") {
      const rows = r.key === "coach" ? (await query(`SELECT email, teams FROM schedule_coaches WHERE schedule_id=$1`, [c.schedule_id])).rows : r.key === "manager" ? (await query(`SELECT email, teams FROM board_managers WHERE schedule_id=$1`, [c.schedule_id])).rows
        : (await query(`SELECT email, teams FROM role_boards WHERE schedule_id=$1 AND role_id=$2`, [c.schedule_id, r.id])).rows;
      for (const x of rows) if (!(x.teams || []).length || (x.teams || []).includes(c.team)) to.add(String(x.email).toLowerCase());
    }
  }
  if (!to.size) return 0;
  const when = c.starts_at ? new Date(c.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const what = { claimed: c.status === "waitlisted" ? "joined the waitlist for" : "claimed", released: "released their spot on", full: "filled the last spot on", opened: "released a spot, so this session has an opening:" }[event];
  const vars = { event: NOTIFY[event], person_name: `${c.first_name} ${c.last_name || ""}`.trim(), what, session: [c.title, when].filter(Boolean).join(" · "), board_name: c.board, team: c.team || "",
    spots: `${Math.max(0, c.capacity - c.taken)} of ${c.capacity} open`, session_link: `${require("./config").APP_URL || ""}/admin/b/${c.schedule_id}/items/${c.item_id}/people` };
  let n = 0; for (const e of to) { try { await require("./emailTemplates").send("role_alert", e, vars); n++; } catch (err) { console.error("role_alert:", err.message); } }
  return n;
}
module.exports = { NOTIFY, BOARD_TYPES, roleAlert, PERMS, KIND, ALL, LV, SCOPE, REPORTS, REPORT_CATS, BUILTIN, ensure, list, rolesOf, assignmentsOf, forUser, setUserRoles, setPersonRoles, setBoardRoles, settle, grantsOf };
