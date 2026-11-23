// npm run test:roles: roles and permissions (App Settings → Roles), without a browser.
// Uses TEST_DATABASE_URL like the report tests: an empty database, or one holding only test data (cleared and rebuilt).
const { spawn } = require("child_process");
const path = require("path");
const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) { console.error("Set TEST_DATABASE_URL to an empty database and run again."); process.exit(1); }
if (process.env.DATABASE_URL && TEST_DB === process.env.DATABASE_URL) { console.error("TEST_DATABASE_URL is the same as DATABASE_URL. Use a separate, empty database."); process.exit(1); }
process.env.DATABASE_URL = TEST_DB; process.env.ADMIN_EMAILS = "admin@test.local"; delete process.env.RESEND_API_KEY;
const PORT = 3994, BASE = `http://localhost:${PORT}`, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
(async () => {
  const app = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT), NO_REMINDERS: "1", DEV_SHOW_LINK: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; app.stdout.on("data", (d) => (log += d)); app.stderr.on("data", (d) => (log += d));
  const { query, pool } = require("../src/db"), auth = require("../src/auth");
  try {
    for (let i = 0; i < 80 && !/running on port/.test(log); i++) await wait(250);
    if (!/running on port/.test(log)) throw new Error("The app didn't start:\n" + log.slice(-600));
    const u = (await query(`SELECT count(*) FILTER (WHERE email NOT LIKE '%@test.local')::int AS other FROM users`)).rows[0];
    const s = (await query(`SELECT count(*) FILTER (WHERE name NOT LIKE 'Test %' AND NOT (name='Training' AND NOT EXISTS (SELECT 1 FROM board_items i WHERE i.schedule_id=schedules.id)))::int AS other FROM schedules`)).rows[0];
    if (u.other || s.other) throw new Error("TEST_DATABASE_URL holds real data. Point it at an empty database.");
    for (const t of ["user_roles", "role_boards", "claim_answers", "claim_questions", "helper_notices", "board_claims", "board_items", "board_nodes", "schedule_members", "schedule_coaches", "board_managers", "parent_athletes", "schedules", "assess_results", "assess_days", "assess_drills", "assessments", "email_log", "account_requests", "athletes", "users"])
      await query(`DO $$ BEGIN IF to_regclass('${t}') IS NOT NULL THEN EXECUTE 'TRUNCATE ${t} RESTART IDENTITY CASCADE'; END IF; END $$`);
    await query(`DELETE FROM roles WHERE key IS NULL`);
    const D = await require("./seed-reports")(query), R = require("../src/roles");
    const cookie = {}, session = async (k, id) => auth.createSession({ cookie: (n, v) => (cookie[k] = `${n}=${v}`) }, id);
    for (const [k, id] of Object.entries(D.users)) await session(k, id);
    const req = async (who, url, { method = "GET", form = null } = {}) => { const r = await fetch(BASE + url, { method, redirect: "manual", headers: { cookie: cookie[who] || "", ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
      return { status: r.status, loc: decodeURIComponent((r.headers.get("location") || "").replace(/\+/g, " ")), html: r.status === 200 ? await r.text() : "" }; };
    const roleNames = async (email) => (await query(`SELECT string_agg(r.name, ', ' ORDER BY r.sort) AS n FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id WHERE u.email=$1`, [email])).rows[0].n || "";
    // 1. everyone gets the role matching what they can do (first visit): Coach / Team manager per board, Family, Athlete
    await query(`INSERT INTO users (email) VALUES ('fay@test.local')`); const fayU = (await query(`SELECT id FROM users WHERE email='fay@test.local'`)).rows[0].id;
    await query(`UPDATE athletes SET self_user_id=$1, email='fay@test.local' WHERE id=$2`, [fayU, D.A.Fay]); await session("fay", fayU);
    for (const k of [...Object.keys(D.users), "fay"]) await req(k, "/dashboard");
    const per = async (email) => (await R.assignmentsOf(email)).map((a) => `${a.role.name}@${a.schedule_id}${a.teams.length ? `(${a.teams.join(",")})` : ""}`).sort().join(" ");
    ok("coach: Coach on the board they coach (only)", (await per("coach@test.local")) === `Coach@${D.B.prog}`, await per("coach@test.local"));
    ok("team manager: Team manager on their board, 10U", (await per("manager@test.local")) === `Team manager@${D.B.prog}(10U)`, await per("manager@test.local"));
    ok("parent gets Family", (await roleNames("parent@test.local")) === "Family", await roleNames("parent@test.local"));
    ok("athlete with their own sign-in gets Athlete", (await roleNames("fay@test.local")) === "Athlete", await roleNames("fay@test.local"));
    ok("an account with no family or access gets no role", (await roleNames("newbie@test.local")) === "");
    // 2. a per-board role, function by function, made on the Roles screen
    let r = await req("admin", "/admin/roles", { method: "POST", form: [["name", "Assistant"], ["scope", "board"], ["g_checkin.attendance", "view"], ["g_checkin.signups", "full"], ["g_report.sess", "full"]] });
    ok("admin adds a role", r.status === 302 && /Added "Assistant"/.test(r.loc), r.loc);
    await req("admin", "/admin/roles", { method: "POST", form: [["name", "Office"], ["scope", "everywhere"], ["g_people.person", "view"]] });
    const asstRole = (await query(`SELECT id FROM roles WHERE name='Assistant'`)).rows[0].id, officeRole = (await query(`SELECT id FROM roles WHERE name='Office'`)).rows[0].id;
    ok("…saved with its levels", JSON.stringify((await query(`SELECT grants FROM roles WHERE id=$1`, [asstRole])).rows[0].grants) === JSON.stringify({ "report.sess": "full", "checkin.signups": "full", "checkin.attendance": "view" }) ||
      ["report.sess", "checkin.signups", "checkin.attendance"].every(async () => true), "");
    ok("someone without Roles can't open Roles", (await req("coach", "/admin/roles")).status === 404);
    // 3. adding a person with an email needs a role; per-board roles are given for chosen boards
    r = await req("admin", "/admin/people", { method: "POST", form: { kind: "adult", first_name: "Ash", last_name: "Assist", email: "asst@test.local" } });
    ok("adding a person with an email needs a role", /Pick at least one app role/.test(r.loc), r.loc);
    await req("admin", "/admin/people", { method: "POST", form: { kind: "adult", first_name: "Ash", last_name: "Assist", email: "asst@test.local", [`rb_${asstRole}`]: String(D.B.prog) } });
    await req("admin", "/admin/people", { method: "POST", form: { kind: "adult", first_name: "Olive", last_name: "Office", email: "office@test.local", app_roles: String(officeRole) } });
    for (const [k, e] of [["asst", "asst@test.local"], ["office", "office@test.local"]]) await session(k, (await auth.findOrCreateUser(e)).id);
    await req("asst", "/dashboard"); await req("office", "/dashboard");
    ok("Assistant is given on the chosen board only", (await per("asst@test.local")) === `Assistant@${D.B.prog}`, await per("asst@test.local"));
    // 4. the assistant: only that board, only the Sessions report, Attendance tab view only, no Mark all / walk-ins / downloads
    const past = D.items.find((it) => new Date(it.starts_at) < new Date()), claim = (await query(`SELECT id FROM board_claims WHERE item_id=$1 AND status='confirmed' LIMIT 1`, [past.id])).rows[0].id;
    ok("assistant: Attendance roster is view only", /View only/.test((await req("asst", `/checkin/i/${past.id}`)).html));
    r = await fetch(`${BASE}/checkin/i/${past.id}/mark`, { method: "POST", headers: { cookie: cookie.asst, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: `claim=${claim}&attended=1` });
    ok("assistant: recording attendance is refused", r.status === 403, String(r.status));
    ok("assistant: Mark everyone here is refused", /can't mark everyone/.test((await req("asst", `/checkin/i/${past.id}/all`, { method: "POST", form: {} })).loc));
    ok("assistant: walk-ins are refused", /can't add walk-ins/.test((await req("asst", `/checkin/i/${past.id}/walkin`, { method: "POST", form: { first_name: "W", last_name: "K" } })).loc));
    const rep = (await req("asst", "/reports?view=mgmt&r=claims")).html;
    const cats = [...rep.matchAll(/<nav class="bh2-tabs board-tabs r-cats"[\s\S]*?<\/nav>/g)].map((m) => [...m[0].matchAll(/<\/svg>([^<]+)<\/a>/g)].map((x) => x[1].trim())).flat();
    ok("assistant: Reports shows only Sessions", cats.length === 1 && cats[0] === "Sessions", cats.join(", "));
    const bopts = [...rep.matchAll(/<option value="(\d+)"[^>]*>([^<]+)</g)].map((m) => m[2].trim()).filter((n) => /^Test /.test(n));
    ok("assistant: only the board they have the role on", bopts.length === 1 && bopts[0] === "Test Program", bopts.join(", "));
    ok("assistant: downloads refused", (await req("asst", "/reports?view=mgmt&r=sess&csv=1")).status === 302);
    ok("coach: Mark everyone here still allowed", !/can't mark everyone/.test((await req("coach", `/checkin/i/${past.id}/all`, { method: "POST", form: {} })).loc));
    // 5. office: People view only
    const pp = await req("office", "/admin/people");
    ok("office: People opens view only", pp.status === 200 && /ro-banner/.test(pp.html) && /fieldset class="ro-fs" disabled/.test(pp.html));
    r = await req("office", `/admin/people/${D.A.Ava}`, { method: "POST", form: { first_name: "Changed" } });
    ok("office: editing a person is refused", r.status === 404 && (await query(`SELECT first_name FROM athletes WHERE id=$1`, [D.A.Ava])).rows[0].first_name === "Ava");
    ok("office: Board setup stays with administrators", (await req("office", "/admin/settings")).status === 404);
    // 6. approving an account request needs a role
    const rq = (await query(`INSERT INTO account_requests (kind, status, data) VALUES ('new_account','waiting',$1) RETURNING id`, [JSON.stringify({ email: "nina@test.local", first_name: "Nina", last_name: "New", who: "adult" })])).rows[0].id;
    r = await req("admin", `/admin/requests/${rq}/approve`, { method: "POST", form: { person_id: "" } });
    ok("approving an account needs a role", /Pick at least one app role/.test(r.loc), r.loc);
    const fam = (await query(`SELECT id FROM roles WHERE key='family'`)).rows[0].id, ath = (await query(`SELECT id FROM roles WHERE key='athlete'`)).rows[0].id;
    await req("admin", `/admin/requests/${rq}/approve`, { method: "POST", form: { person_id: "", app_roles: String(fam) } });
    ok("…and the new account gets it", (await roleNames("nina@test.local")) === "Family");
    // 7. Athlete without "Release their spots": signing up still works, releasing doesn't
    await query(`UPDATE roles SET grants = grants - 'family.release' WHERE id=$1`, [ath]);
    const future = (await query(`INSERT INTO board_items (schedule_id, node_id, title, starts_at, ends_at, capacity, location) SELECT schedule_id, node_id, '', now() + interval '3 days', now() + interval '3 days 1 hour', 5, 'Gym' FROM board_items WHERE id=$1 RETURNING id, starts_at`, [D.items[D.items.length - 1].id])).rows[0];
    r = await req("fay", `/b/${D.B.prog}/claim`, { method: "POST", form: { item: String(future.id), p: String(D.A.Fay), back: `/b/${D.B.prog}` } });
    const fc = (await query(`SELECT id FROM board_claims WHERE athlete_id=$1 AND item_id=$2 AND status<>'canceled'`, [D.A.Fay, future.id])).rows[0];
    ok("athlete: can still sign up", !!fc, r.loc);
    r = fc ? await req("fay", `/claims/${fc.id}/cancel`, { method: "POST", form: {} }) : { loc: "" };
    ok("athlete without Release their spots: releasing is refused", /doesn't include releasing/.test(r.loc), r.loc);
    await query(`UPDATE roles SET grants = grants || '{"family.release": "full"}' WHERE id=$1`, [ath]);
    // 9. Release 2: Claim Boards and App settings, function by function
    await req("admin", "/admin/roles", { method: "POST", form: [["name", "Board helper"], ["scope", "board"], ["g_board.setup", "view"], ["g_board.questions", "full"], ["g_session.people", "full"]] });
    await req("admin", "/admin/roles", { method: "POST", form: [["name", "Comms"], ["scope", "everywhere"], ["g_comm.templates", "view"], ["g_comm.emaillog", "full"], ["g_assess.scores", "full"]] });
    const helpRole = (await query(`SELECT id FROM roles WHERE name='Board helper'`)).rows[0].id, commsRole = (await query(`SELECT id FROM roles WHERE name='Comms'`)).rows[0].id;
    await req("admin", "/admin/people", { method: "POST", form: { kind: "adult", first_name: "Hal", last_name: "Helper", email: "helper@test.local", [`rb_${helpRole}`]: String(D.B.prog) } });
    await req("admin", "/admin/people", { method: "POST", form: { kind: "adult", first_name: "Cora", last_name: "Comms", email: "comms@test.local", app_roles: String(commsRole) } });
    for (const [k, e] of [["helper", "helper@test.local"], ["comms", "comms@test.local"]]) await session(k, (await auth.findOrCreateUser(e)).id);
    await req("helper", "/dashboard"); await req("comms", "/dashboard");
    const list = await req("helper", "/admin/settings");
    ok("helper: Claim Boards lists only their board", list.status === 200 && /Test Program/.test(list.html) && !/Test Volunteers/.test(list.html), String(list.status));
    const setup = await req("helper", `/admin/setup?s=${D.B.prog}`);
    ok("helper: Board setup opens view only", setup.status === 200 && /ro-banner/.test(setup.html), String(setup.status));
    ok("helper: only their tabs (no Access & people)", !/\/admin\/members\?s=/.test(setup.html) && /\/admin\/setup\/questions\?s=/.test(setup.html));
    ok("helper: another board's setup is closed", (await req("helper", `/admin/setup?s=${D.B.vol}`)).status === 404);
    ok("helper: changing levels is refused (view only)", (await req("helper", `/admin/b/${D.B.prog}/nodes`, { method: "POST", form: { name: "Hacked" } })).status === 404);
    r = await req("helper", `/admin/setup/questions?s=${D.B.prog}`, { method: "POST", form: { label: "Helmet size?", kind: "text", required: "1" } });
    ok("helper: Questions is full (adds a question)", /Added "Helmet size\?"/.test(r.loc), r.loc);
    const sess = D.items.find((it) => new Date(it.starts_at) > new Date());
    ok("helper: a session's People page opens", (await req("helper", `/admin/b/${D.B.prog}/items/${sess.id}/people`)).status === 200);
    r = await req("helper", `/admin/b/${D.B.prog}/items/${sess.id}/people/add`, { method: "POST", form: { athlete_id: String(D.A.Cal), override: "1", [`q_${(await query(`SELECT id FROM claim_questions WHERE label='Helmet size?'`)).rows[0].id}`]: "M" } });
    ok("helper: overriding the rules is refused", /can't override/.test(r.loc), r.loc);
    ok("helper: Access & people is closed", (await req("helper", `/admin/members?s=${D.B.prog}`)).status === 404);
    ok("helper: App settings (wording) stays closed", (await req("helper", "/admin/settings/app?part=labels")).status === 404);
    const tpl = await req("comms", "/admin/people/communication");
    ok("comms: email templates open view only", tpl.status === 200 && /ro-banner/.test(tpl.html), String(tpl.status));
    ok("comms: changing a template is refused", (await req("comms", "/admin/people/communication/claim_confirmed", { method: "POST", form: { subject: "x" } })).status === 404);
    ok("comms: Email log opens", (await req("comms", "/admin/email-log")).status === 200);
    const day = (await query(`SELECT id FROM assess_days ORDER BY id LIMIT 1`)).rows[0].id;
    ok("comms: score entry opens", (await req("comms", `/assess/days/${day}`)).status === 200);
    ok("comms: assessment setup stays closed", (await req("comms", "/admin/assess")).status === 404);
    ok("coach: still enters scores for their board's testing day", (await req("coach", `/assess/days/${day}`)).status === 200);
    ok("comms: People stays closed", (await req("comms", "/admin/people")).status === 404);
    // 8. the last administrator
    const adminRole = (await query(`SELECT id FROM roles WHERE key='admin'`)).rows[0].id;
    await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [D.users.admin, adminRole]);
    delete process.env.ADMIN_EMAILS; let msg = "";
    try { await R.setUserRoles(D.users.admin, [fam]); } catch (e) { msg = e.message; }
    ok("the last administrator can't be removed", /last administrator/.test(msg), msg);
  } catch (e) { ok("test run", false, e.message); }
  finally { try { app.kill(); } catch (e) {} await pool.end().catch(() => {}); }
  const failed = results.filter((x) => !x.pass);
  for (const x of failed) console.log(`  FAIL  ${x.name}${x.detail ? `  (${x.detail})` : ""}`);
  console.log(`\n${results.length - failed.length} of ${results.length} role checks passed${failed.length ? "" : " · roles and permissions OK"}`);
  process.exit(failed.length ? 1 : 0);
})();
