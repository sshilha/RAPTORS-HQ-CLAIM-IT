// npm run test:questions: claim questions and answer rules (the "Do you have a catcher?" helper spot), without a browser.
// Uses TEST_DATABASE_URL like the report tests: an empty database, or one holding only test data (cleared and rebuilt).
const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) { console.error("Set TEST_DATABASE_URL to an empty database and run again."); process.exit(1); }
if (process.env.DATABASE_URL && TEST_DB === process.env.DATABASE_URL) { console.error("TEST_DATABASE_URL is the same as DATABASE_URL. Use a separate, empty database."); process.exit(1); }
process.env.DATABASE_URL = TEST_DB; delete process.env.RESEND_API_KEY;   // never email anyone from a test
const results = []; const ok = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  // start a copy of the app once, so it creates its tables, then stop it
  const app = require("child_process").spawn(process.execPath, [require("path").join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: "3996", NO_REMINDERS: "1", ADMIN_EMAILS: "admin@test.local" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; app.stdout.on("data", (d) => (log += d)); app.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 80 && !/running on port/.test(log); i++) await wait(250);
  app.kill();
  const { query, pool } = require("../src/db");
  const E = require("../src/engine"), Q = require("../src/questions");
  try {
    const u = (await query(`SELECT count(*) FILTER (WHERE email NOT LIKE '%@test.local')::int AS other FROM users`)).rows[0];
    const s = (await query(`SELECT count(*) FILTER (WHERE name NOT LIKE 'Test %' AND NOT (name='Training' AND NOT EXISTS (SELECT 1 FROM board_items i WHERE i.schedule_id=schedules.id)))::int AS other FROM schedules`)).rows[0];
    if (u.other || s.other) throw new Error("TEST_DATABASE_URL holds real data. Point it at an empty database.");
    for (const t of ["claim_answers", "claim_questions", "helper_notices", "board_claims", "board_items", "board_nodes", "schedule_members", "schedule_coaches", "board_managers", "parent_athletes", "schedules", "assess_results", "assess_days", "assess_drills", "assessments", "email_log", "app_kv", "athletes", "users"])
      await query(`DO $$ BEGIN IF to_regclass('${t}') IS NOT NULL THEN EXECUTE 'TRUNCATE ${t} RESTART IDENTITY CASCADE'; END IF; END $$`);
    const D = await require("./seed-reports")(query), B = D.B.prog, uid = D.users.parent, day = (d, h) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0); return t; };
    // a Pitching level, and a Catching level only athletes tagged Catcher can claim
    const P = (await query(`INSERT INTO board_nodes (schedule_id, name, sort) VALUES ($1,'Pitching',2) RETURNING id`, [B])).rows[0].id;
    const C = (await query(`INSERT INTO board_nodes (schedule_id, name, sort, settings) VALUES ($1,'Catching',3,'{"who": {"mode": "teams", "tags": ["Catcher"]}}') RETURNING id`, [B])).rows[0].id;
    const ps = (await query(`INSERT INTO board_items (schedule_id, node_id, title, starts_at, ends_at, capacity, location) VALUES ($1,$2,'',$3,$4,4,'Bullpen') RETURNING id`, [B, P, day(1, 18), day(1, 19)])).rows[0].id;
    await query(`UPDATE schedule_members SET tags='{Catcher}' WHERE schedule_id=$1 AND athlete_id=$2`, [B, D.A.Dee]);
    await Q.ensure();
    const qid = (await query(`INSERT INTO claim_questions (schedule_id, node_id, label, kind, options, required, rules) VALUES ($1,$2,'Do you have a catcher?','choice',$3,true,$4) RETURNING id`,
      [B, P, JSON.stringify([{ key: "o0", label: "I have a catcher" }, { key: "o1", label: "I need a catcher" }]), JSON.stringify([{ when: "o1", action: "helper", node: C, label: "Catch for a pitcher: {athlete}", spots: 1 }])])).rows[0].id;
    const ava = { group_name: "10U", tags: null }, dee = { group_name: "12U", tags: ["Catcher"] };
    const open = async (claimId) => (await query(`SELECT * FROM board_items WHERE (settings->>'helper_claim')::int=$1 AND canceled_at IS NULL`, [claimId])).rows;
    // 1. required
    let msg = ""; try { await E.claim({ itemId: ps, athleteId: D.A.Ava, userId: uid, member: ava }); } catch (e) { msg = e.message; }
    ok("a required question must be answered", /Please answer: Do you have a catcher/.test(msg), msg);
    // 2. "I need a catcher" opens a helper spot in Catching, same time and place
    const pc = await E.claim({ itemId: ps, athleteId: D.A.Ava, userId: uid, member: ava, answers: { [qid]: ["o1"] } }); await wait(800);
    const h = (await open(pc.id))[0];
    ok("the answer is saved", (await query(`SELECT value FROM claim_answers WHERE claim_id=$1`, [pc.id])).rows[0]?.value === "o1");
    ok("a helper spot opens in Catching", h && h.node_id === C && /Catch for a pitcher: Ava Adams/.test(h.title), h && h.title);
    const pitch = (await query(`SELECT starts_at, location FROM board_items WHERE id=$1`, [ps])).rows[0];
    ok("at the pitcher's time and place", h && +new Date(h.starts_at) === +new Date(pitch.starts_at) && h.location === pitch.location);
    // 3. only catchers can see it; the pitcher can't take their own
    const see = async (athleteId, member) => (await E.personView(B, { athleteId, userId: uid, member })).items.some((r) => r.item.id === h.id);
    ok("a non-catcher can't see the helper spot", !(await see(D.A.Ava, ava)));
    ok("a catcher can see it", await see(D.A.Dee, dee));
    // 4. a catcher at her limit can still take it, and it doesn't count
    await query(`UPDATE schedules SET settings = settings || '{"limit": 1}' WHERE id=$1`, [B]);
    let dc = null; try { dc = await E.claim({ itemId: h.id, athleteId: D.A.Dee, userId: uid, member: dee }); } catch (e) { msg = e.message; }
    ok("a catcher past her limit can take it", !!dc, dc ? "" : msg); ok("it doesn't count toward limits", dc && dc.counts === false);
    await query(`UPDATE schedules SET settings = settings - 'limit' WHERE id=$1`, [B]); await wait(800);
    // 5. the catcher cancels: the spot stays open (and helpers will be emailed again)
    await E.cancel({ claimId: dc.id, admin: true }); await wait(800);
    ok("a helper canceling reopens the spot", (await open(pc.id)).length === 1 && !(await query(`SELECT 1 FROM helper_notices WHERE item_id=$1`, [h.id])).rowCount);
    // 6. changing the answer closes the spot (and releases whoever had it)
    const dc2 = await E.claim({ itemId: h.id, athleteId: D.A.Dee, userId: uid, member: dee }); await wait(800);
    await Q.save(pc.id, { [qid]: "o0" }); await Q.afterClaim(pc.id);
    ok("'I have a catcher' closes the helper spot", (await open(pc.id)).length === 0);
    ok("…and releases the catcher", (await query(`SELECT status FROM board_claims WHERE id=$1`, [dc2.id])).rows[0].status === "canceled");
    // 7. back to "I need", then the pitcher cancels: the spot closes
    await Q.save(pc.id, { [qid]: "o1" }); await Q.afterClaim(pc.id);
    ok("answering 'I need a catcher' again opens a new spot", (await open(pc.id)).length === 1);
    await E.cancel({ claimId: pc.id, admin: true }); await wait(800);
    ok("the pitcher canceling closes the helper spot", (await open(pc.id)).length === 0);
    // 8. follow-ups: "I have a catcher" → "Who is your catcher?" (required only when asked); cleared when the answer changes
    const fq = (await query(`INSERT INTO claim_questions (schedule_id, node_id, parent_id, parent_when, label, kind, required) VALUES ($1,$2,$3,'o0','Who is your catcher?','text',true) RETURNING id`, [B, P, qid])).rows[0].id;
    msg = ""; try { await E.claim({ itemId: ps, athleteId: D.A.Ava, userId: uid, member: ava, answers: { [qid]: ["o0"] } }); } catch (e) { msg = e.message; }
    ok("a follow-up is required once its answer is picked", /Please answer: Who is your catcher/.test(msg), msg);
    const c2 = await E.claim({ itemId: ps, athleteId: D.A.Ava, userId: uid, member: ava, answers: { [qid]: ["o1"], [fq]: ["ignored"] } }); await wait(800);
    ok("a follow-up that isn't asked is ignored", !(await query(`SELECT 1 FROM claim_answers WHERE claim_id=$1 AND question_id=$2`, [c2.id, fq])).rowCount);
    const qs2 = await Q.forItem(ps);
    await Q.save(c2.id, Q.clean(qs2, { [qid]: ["o0"], [fq]: ["Kira"] }), undefined, qs2);
    ok("answering the follow-up saves it", (await query(`SELECT value FROM claim_answers WHERE claim_id=$1 AND question_id=$2`, [c2.id, fq])).rows[0]?.value === "Kira");
    await Q.save(c2.id, Q.clean(qs2, { [qid]: ["o1"] }), undefined, qs2);
    ok("changing the answer clears the follow-up", !(await query(`SELECT 1 FROM claim_answers WHERE claim_id=$1 AND question_id=$2`, [c2.id, fq])).rowCount);
  } catch (e) { ok("test run", false, e.message); }
  finally { await pool.end().catch(() => {}); }
  const failed = results.filter((r) => !r.pass);
  for (const r of failed) console.log(`  FAIL  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failed.length} of ${results.length} question checks passed${failed.length ? "" : " · questions, helper spots and rules OK"}`);
  process.exit(failed.length ? 1 : 0);
})();
