// Builds the data the report tests use: three boards (a program with limits, a volunteer board, an RSVP board), six
// athletes on two teams, claims with attendance, a waitlist and cancellations, an assessment, and one person per role.
// Only ever run against an EMPTY test database (test/reports.test.js checks that before calling this).
module.exports = async function seed(query) {
  const one = async (sql, args = []) => (await query(sql, args)).rows[0];
  const day = (d, h = 16) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0); return t; };
  // people with sign-ins: admin, coach, 10U team manager, parent of two athletes, and a brand-new account
  const users = {};
  for (const e of ["admin@test.local", "coach@test.local", "manager@test.local", "parent@test.local", "newbie@test.local"])
    users[e.split("@")[0]] = (await one(`INSERT INTO users (email, last_login_at) VALUES ($1, now() - interval '1 day') RETURNING id`, [e])).id;
  await one(`INSERT INTO athletes (first_name, last_name, kind, email, self_user_id) VALUES ('Pat','Parent','adult','parent@test.local',$1) RETURNING id`, [users.parent]);
  const A = {};
  for (const [f, l, t] of [["Ava", "Adams", "10U"], ["Bea", "Brooks", "10U"], ["Cal", "Cruz", "10U"], ["Dee", "Diaz", "12U"], ["Eve", "Evans", "12U"], ["Fay", "Fox", "12U"]])
    A[f] = (await one(`INSERT INTO athletes (first_name, last_name, kind, team, family_access) VALUES ($1,$2,'athlete',$3,true) RETURNING id`, [f, l, t])).id;
  for (const k of ["Ava", "Dee"]) await query(`INSERT INTO parent_athletes (user_id, athlete_id) VALUES ($1,$2)`, [users.parent, A[k]]);
  // boards
  // RSVP boards are always "only people on the board's list" in the app (claim_mode roster)
  const board = async (name, type, settings = {}) => (await one(`INSERT INTO schedules (name, board_type, track_attendance, published_at, settings, claim_mode) VALUES ($1,$2,true,now(),$3,$4) RETURNING id`, [name, type, JSON.stringify(settings), type === "rsvp" ? "roster" : "family"])).id;
  const B = { prog: await board("Test Program", "training", { limit: 8 }), vol: await board("Test Volunteers", "volunteer"), rsvp: await board("Test Meetings", "rsvp", { members_only: true }) };
  for (const b of Object.values(B)) for (const [f, id] of Object.entries(A)) await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name) VALUES ($1,$2,$3)`, [b, id, ["Ava", "Bea", "Cal"].includes(f) ? "10U" : "12U"]);
  await query(`INSERT INTO schedule_coaches (schedule_id, email) VALUES ($1,'coach@test.local')`, [B.prog]);
  await require("../src/people").ensureManagers();
  await query(`INSERT INTO board_managers (schedule_id, email, teams) VALUES ($1,'manager@test.local','{10U}')`, [B.prog]);
  // the program: a level with its own limit, 8 sessions (4 past, 4 upcoming)
  const lvl = (await one(`INSERT INTO board_nodes (schedule_id, name, sort, settings) VALUES ($1,'Batting Cage',1,'{"limit": 3}') RETURNING id`, [B.prog])).id;
  const items = [];
  for (let d = -8; d <= 6; d += 2) items.push((await one(`INSERT INTO board_items (schedule_id, node_id, title, starts_at, ends_at, capacity, location) VALUES ($1,$2,'',$3,$4,3,'Test Gym') RETURNING id, starts_at`, [B.prog, lvl, day(d), day(d, 17)])));
  for (const [i, it] of items.entries()) {
    const past = new Date(it.starts_at) < new Date();
    for (const [j, f] of ["Ava", "Bea", "Dee", "Eve"].entries()) {
      if ((i + j) % 3 === 0) continue;
      await query(`INSERT INTO board_claims (item_id, athlete_id, status, counts, attended, created_at) VALUES ($1,$2,'confirmed',true,$3, now() - interval '10 days')`,
        [it.id, A[f], past ? (f === "Eve" ? false : j === 1 && i === 0 ? null : true) : null]);
    }
  }
  await query(`INSERT INTO board_claims (item_id, athlete_id, status, counts, created_at) VALUES ($1,$2,'waitlisted',true, now() - interval '1 day')`, [items[items.length - 1].id, A.Fay]);
  await query(`INSERT INTO board_claims (item_id, athlete_id, status, counts, created_at, canceled_at) VALUES ($1,$2,'canceled',true, now() - interval '5 days', now() - interval '2 days')`, [items[items.length - 2].id, A.Cal]);
  // volunteers: two shifts
  for (const d of [-3, 4]) { const s = (await one(`INSERT INTO board_items (schedule_id, title, starts_at, ends_at, capacity, location) VALUES ($1,'Grill',$2,$3,2,'Park') RETURNING id`, [B.vol, day(d), day(d, 18)])).id;
    await query(`INSERT INTO board_claims (item_id, athlete_id, status, counts, attended) VALUES ($1,$2,'confirmed',true,$3)`, [s, A.Dee, d < 0 ? true : null]); }
  // RSVP: one past event, one upcoming; two "can't make it", one no answer
  for (const d of [-5, 6]) { const ev = (await one(`INSERT INTO board_items (schedule_id, title, starts_at, ends_at, capacity, location) VALUES ($1,$2,$3,$4,100,'Clubhouse') RETURNING id`, [B.rsvp, d < 0 ? "Kickoff" : "Parent night", day(d, 18), day(d, 19)])).id;
    for (const f of ["Ava", "Bea", "Cal", "Dee", "Eve"]) { const no = ["Bea", "Eve"].includes(f);
      await query(`INSERT INTO board_claims (item_id, athlete_id, status, counts, rsvp, attended) VALUES ($1,$2,$3,true,$4,$5)`, [ev, A[f], no ? "canceled" : "confirmed", no ? "no" : "yes", d < 0 && !no ? f !== "Cal" : null]); } }
  // an assessment: Baseline and Final, shared with families
  await require("../src/assess").ensure();
  const as = (await one(`INSERT INTO assessments (name) VALUES ('Test Speed') RETURNING id`)).id;
  const dr = {};
  for (const [n, u, b, s] of [["Sprint", "sec", "lower", 1], ["Jump", "in", "higher", 2]]) dr[n] = (await one(`INSERT INTO assess_drills (assessment_id, name, unit, better, attempts, sort) VALUES ($1,$2,$3,$4,1,$5) RETURNING id`, [as, n, u, b, s])).id;
  for (const [k, d] of [["Baseline", -14], ["Final", -1]]) { const dd = (await one(`INSERT INTO assess_days (assessment_id, day, kind, board_id, shared) VALUES ($1,$2,$3,$4,true) RETURNING id`, [as, day(d), k, B.prog])).id;
    for (const [f, id] of Object.entries(A)) { await query(`INSERT INTO assess_results (day_id, athlete_id, drill_id, attempt, value) VALUES ($1,$2,$3,1,$4)`, [dd, id, dr.Sprint, k === "Final" ? 4.8 : 5.0]);
      await query(`INSERT INTO assess_results (day_id, athlete_id, drill_id, attempt, value) VALUES ($1,$2,$3,1,$4)`, [dd, id, dr.Jump, k === "Final" ? (f === "Fay" ? 14 : 18) : 16]); } }
  await require("../src/emailLog").ensure();
  await query(`INSERT INTO email_log (to_addr, email_key, subject, status, delivery, board_id) VALUES ('bounce@test.local','claim_reminder','Reminder','sent','bounced',$1)`, [B.prog]);
  return { users, A, B, items };
};
