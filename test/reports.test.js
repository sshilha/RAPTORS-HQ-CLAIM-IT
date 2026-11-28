// npm run test:reports: checks every report for every role, without a browser.
// Needs TEST_DATABASE_URL (in .env or the environment): an EMPTY database just for this test. It is never your real
// data: the test refuses to run unless the database is empty, or holds only this test's own data (which it clears and
// rebuilds). It starts its own copy of the app on port 3998, builds test data (test/seed-reports.js), and checks:
//   every report loads for admin, coach, team manager and parent, with the Reports layout and no broken values;
//   CSV headings match the page, and only admins get email addresses;
//   each role only sees what it should (boards, teams, family);
//   every old report address redirects to its new home;
//   key numbers match the database (active claims, a limit, an RSVP response rate).
const { spawn } = require("child_process");
const path = require("path");
const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) { console.error("Set TEST_DATABASE_URL to an empty database (for example postgres://…/claimit_test) and run again."); process.exit(1); }
if (process.env.DATABASE_URL && TEST_DB === process.env.DATABASE_URL) { console.error("TEST_DATABASE_URL is the same as DATABASE_URL. Use a separate, empty database for the test."); process.exit(1); }
process.env.DATABASE_URL = TEST_DB;
const PORT = 3998, BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
const BAD = /\b(undefined|NaN|Invalid Date|\[object Object\])\b/;
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const heads = (html) => { const m = /<table class="r-table[^"]*"[^>]*>[\s\S]*?<thead>([\s\S]*?)<\/thead>/.exec(html); return m ? [...m[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => text(x[1]).trim()).filter(Boolean) : []; };
const REPORTS = ["overview", "claims", "claims&group=claim", "attend", "attend&group=session", "attend&ashow=noshow", "attend&group=session&ashow=unrec", "teams", "limits", "waitlists",
  "sess", "signups", "signups&sshow=notrack&sw=today", "sess&group=location", "sess&group=time", "week", "engagement", "engagement&group=family", "volunteer", "volunteer&group=shift", "emails",
  "assessResults", "assessDay", "assessDay&ag=age", "assessLeaders&ag=team", "assessProgress", "assessProgress&cmp=days", "assessLeaders", "assessLeaders&rank=records", "assessTeam", "assessTeam&tshow=improve", "rsvp", "rsvp&group=athlete", "rsvp&group=answer"];
const OLD = { person: "r=claims", all: "group=claim", attendance: "r=attend", attSessions: "group=session", noshows: "ashow=noshow", unchecked: "ashow=unrec", fill: "r=sess", upcoming: "view=upcoming",
  busiest: "group=time", locations: "group=location", notSignedIn: "fview=never", notSignedUp: "fview=noclaims", rsvpAnswers: "group=answer", rsvpAthletes: "group=athlete", coverage: "group=shift",
  assessImprove: "cmp=days", assessAttend: "cmp=days", assessRecords: "rank=records", assessTeamBest: "r=assessTeam", assessTeamProgress: "tshow=improve", assessTeams: "cmp=days" };

async function main() {
  const app = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, DATABASE_URL: TEST_DB, PORT: String(PORT), ADMIN_EMAILS: "admin@test.local", NO_REMINDERS: "1", DEV_SHOW_LINK: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; app.stdout.on("data", (d) => (log += d)); app.stderr.on("data", (d) => (log += d));
  const { query, pool } = require("../src/db"), auth = require("../src/auth");
  try {
    for (let i = 0; i < 80 && !/running on port/.test(log); i++) await wait(250);
    if (!/running on port/.test(log)) throw new Error("The app didn't start:\n" + log.slice(-800));
    // only an empty database, or one holding just this test's data
    const u = (await query(`SELECT count(*) FILTER (WHERE email NOT LIKE '%@test.local')::int AS other, count(*)::int AS n FROM users`)).rows[0];
    // the app makes an empty "Training" board on first start; that one is fine
    const s = (await query(`SELECT count(*) FILTER (WHERE name NOT LIKE 'Test %' AND NOT (name='Training' AND NOT EXISTS (SELECT 1 FROM board_items i WHERE i.schedule_id=schedules.id)))::int AS other, count(*) FILTER (WHERE name LIKE 'Test %')::int AS n FROM schedules`)).rows[0];
    if (u.other || s.other) throw new Error("TEST_DATABASE_URL holds real data (users or boards that aren't this test's). Point it at an empty database.");
    if (u.n || s.n) { for (const t of ["board_claims", "board_items", "board_nodes", "schedule_members", "schedule_coaches", "board_managers", "parent_athletes", "schedules", "assess_results", "assess_days", "assess_drills", "assessments", "email_log", "app_kv", "athletes", "users"])
      await query(`DO $$ BEGIN IF to_regclass('${t}') IS NOT NULL THEN EXECUTE 'TRUNCATE ${t} RESTART IDENTITY CASCADE'; END IF; END $$`); }
    const D = await require("./seed-reports")(query);
    const cookie = {};
    for (const [k, id] of Object.entries(D.users)) await auth.createSession({ cookie: (n, v) => (cookie[k] = `${n}=${v}`) }, id);
    const get = async (url, who) => { const r = await fetch(BASE + url, { headers: who ? { cookie: cookie[who] } : {}, redirect: "manual" }); return { status: r.status, loc: r.headers.get("location") || "", html: r.status === 200 ? await r.text() : "" }; };

    // 1. every report, every management role: loads, has the layout, no broken values; CSV headings match the page
    for (const who of ["admin", "coach", "manager"]) {
      for (const q of REPORTS) {
        const r = await get(`/reports?view=mgmt&r=${q}`, who), t = text(r.html), name = `${who}: ${q}`;
        if (who !== "admin" && q === "emails") { ok(`${name} (admin only)`, r.status === 200 && !/bounce@test\.local/.test(t)); continue; }
        ok(`${name} loads`, r.status === 200 && /class="bh2 r-bh/.test(r.html), `status ${r.status}`);
        const bad = BAD.exec(t); ok(`${name} has no broken values`, !bad, bad && bad[0]);
        if (/csv=1/.test(r.html)) {
          const c = await fetch(`${BASE}/reports?view=mgmt&r=${q}&csv=1`, { headers: { cookie: cookie[who] } }), csv = (await c.text()).replace(/^\ufeff/, "");
          const ch = (csv.split(/\r?\n/)[0] || "").split('","').map((x) => x.replace(/"/g, "").toLowerCase());
          const missing = heads(r.html).map((h) => h.toLowerCase()).filter((h) => !ch.includes(h));
          ok(`${name} CSV matches the page`, c.status === 200 && !missing.length, missing.join(", "));
          if (who !== "admin") ok(`${name} CSV has no email addresses`, !/@/.test(csv));
        }
      }
    }
    // 2. what each role may see
    const coachBoards = [...(await get("/reports?view=mgmt&r=claims", "coach")).html.matchAll(/<option value="(\d+)"[^>]*>([^<]+)</g)].map((m) => m[2].trim());
    ok("coach: only their board in the Board filter", coachBoards.includes("Test Program") && !coachBoards.includes("Test Volunteers") && !coachBoards.includes("Test Meetings"), coachBoards.join(", "));
    ok("coach: another board's id is ignored", !/Test Volunteers/.test(text((await get(`/reports?view=mgmt&r=claims&group=claim&s=${D.B.vol}`, "coach")).html).replace(/<option[\s\S]*?<\/option>/g, "")));
    const mgr = text((await get(`/reports?view=mgmt&r=claims&s=${D.B.prog}`, "manager")).html);
    ok("team manager (10U): only 10U athletes", /Ava Adams/.test(mgr) && !/Dee Diaz|Eve Evans|Fay Fox/.test(mgr));
    const par = await get("/reports", "parent"); ok("parent: Reports opens My Family", par.status === 200 && /My Family/.test(par.html));
    const other = text((await get(`/reports?view=family&r=fClaims&a=${D.A.Bea}`, "parent")).html);
    ok("parent: another family's athlete is ignored", !/Bea Brooks|Bea ·/.test(other));
    ok("parent: management reports show My Family instead", /My Family/.test((await get("/reports?r=claims", "parent")).html));
    const pcsv = await (await fetch(`${BASE}/reports?view=family&r=fClaims&show=all&csv=1`, { headers: { cookie: cookie.parent } })).text();
    const who = [...new Set(pcsv.split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split('","')[0].replace(/^\ufeff?"/, "")))];
    ok("parent: CSV holds only their family", who.length && who.every((n) => ["Ava", "Dee", "Pat"].includes(n)), who.join(", "));
    for (const sec of ["fOverview", "fClaims", "fAttendance", "fProgress", "fSchedule", "fSchedule&mode=cal"]) { const r = await get(`/reports?view=family&r=${sec}`, "parent"); ok(`parent: ${sec} loads`, r.status === 200 && !BAD.test(text(r.html))); }
    const nb = await get("/reports", "newbie"); ok("new account without a family or access: no Reports", nb.status === 302 && /dashboard/.test(nb.loc), `${nb.status} ${nb.loc}`);
    // 3. every old report address redirects to its new home
    for (const [old, want] of Object.entries(OLD)) { const r = await get(`/reports?view=mgmt&r=${old}`, "admin"); ok(`old address r=${old}`, r.status === 302 && r.loc.includes(want), r.loc); }
    // 4. key numbers match the database
    const ov = (await get("/reports?view=mgmt&r=overview", "admin")).html, kpi = /Active claims<\/span><b>(\d+)<\/b>/.exec(ov);
    const db = (await query(`SELECT count(*)::int AS n FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules s ON s.id=i.schedule_id WHERE c.status='confirmed' AND coalesce(s.board_type,'training') <> 'rsvp' AND i.canceled_at IS NULL`)).rows[0].n;
    ok("Overview active claims = database", kpi && Number(kpi[1]) === db, `${kpi && kpi[1]} vs ${db}`);
    const lim = await (await fetch(`${BASE}/reports?view=mgmt&r=limits&csv=1`, { headers: { cookie: cookie.admin } })).text();
    const row = lim.split(/\r?\n/).find((l) => l.startsWith('"Ava Adams"') && /Batting Cage/.test(l)) || "", used = Number((row.split('","')[5] || "").replace(/"/g, ""));
    const dbUsed = (await query(`SELECT count(*)::int AS n FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE c.athlete_id=$1 AND i.schedule_id=$2 AND c.status<>'canceled' AND c.counts`, [D.A.Ava, D.B.prog])).rows[0].n;
    ok("Limits: Ava's Batting Cage used = database", used === dbUsed, `${used} vs ${dbUsed}`);
    // extra spots (claimed past a reached limit) take a seat, as on the sign-up page
    const ex = (await query(`INSERT INTO board_items (schedule_id, title, starts_at, ends_at, capacity, location) VALUES ($1,'Extra-spot test', now() + interval '2 days', now() + interval '2 days 1 hour', 3, 'Gym') RETURNING id`, [D.B.prog])).rows[0].id;
    for (const [k, counts] of [["Ava", true], ["Bea", true], ["Fay", false]]) await query(`INSERT INTO board_claims (item_id, athlete_id, status, counts) VALUES ($1,$2,'confirmed',$3)`, [ex, D.A[k], counts]);
    const exRow = (await (await fetch(`${BASE}/reports?view=mgmt&r=sess&csv=1&q=Extra-spot`, { headers: { cookie: cookie.admin } })).text()).split(/\r?\n/).find((l) => l.includes("Extra-spot test")) || "";
    const exCsv = await (await fetch(`${BASE}/reports?view=mgmt&r=claims&group=claim&ext=extra&when=all&csv=1`, { headers: { cookie: cookie.admin } })).text();
    ok("Claims → Type: Extra spots only lists the extra claim (Fay), not regular ones (Ava)", /Fay/.test(exCsv) && !/Ava Adams/.test(exCsv), exCsv.split(/\r?\n/).slice(0, 3).join(" / ").slice(0, 200));
    ok("Sessions: extra spots take a seat (3 of 3, Full)", /"3","3"/.test(exRow) && /Full/.test(exRow), exRow.slice(0, 160));
    const rs = text((await get("/reports?view=mgmt&r=rsvp", "admin")).html);
    ok("RSVP: Kickoff 6 on the list, 5 answered (83%)", /Kickoff Test Meetings 6 5 83%/.test(rs.replace(/\s+/g, " ")), (/Kickoff[^%]*%/.exec(rs) || [""])[0]);
  } catch (e) { ok("test run", false, e.message); }
  finally { try { app.kill(); } catch (e) {} await pool.end().catch(() => {}); }
  const failed = results.filter((r) => !r.pass);
  for (const r of failed) console.log(`  FAIL  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failed.length} of ${results.length} report checks passed${failed.length ? "" : " · every report, role, export and redirect OK"}`);
  process.exit(failed.length ? 1 : 0);
}
main();
