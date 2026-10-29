// Run: DATABASE_URL=postgres://... node test/engine.test.js   (uses a scratch database; wipes the engine tables)
const assert = require("node:assert/strict");
const { query, migrate, pool } = require("../src/db");
const E = require("../src/engine");
const H = 3600e3, inH = (h) => new Date(Date.now() + h * H);
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log("  ✓", name); } catch (e) { fail++; console.log("  ✗", name, "\n     ", e.message); } }
const rejects = async (p, re) => { try { await p; } catch (e) { if (!(e instanceof E.ClaimError)) throw e; if (re && !re.test(e.message)) throw new Error(`wrong message: ${e.message}`); return e.message; } throw new Error("expected it to be refused"); };

(async () => {
  await migrate(); await require("../src/engine/schema").migrate();
  await query(`TRUNCATE board_claims, board_items, board_nodes RESTART IDENTITY CASCADE`);
  const person = async (first, last, boardId, group, tags = [], userEmail = null) => {
    const a = (await query(`INSERT INTO athletes (first_name, last_name) VALUES ($1,$2) RETURNING id`, [first, last])).rows[0].id;
    if (boardId) await query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags) VALUES ($1,$2,$3,$4)`, [boardId, a, group, tags]);
    const u = userEmail ? (await query(`INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`, [userEmail])).rows[0].id : null;
    return { a, u };
  };
  const publish = (id) => query(`UPDATE schedules SET published_at=now() WHERE id=$1`, [id]);

  console.log("1-level board (anyone with the link)");
  const picnic = await E.createBoard({ name: "Picnic", depth: 1, claimMode: "public", question: { label: "What will you bring?", required: true } });
  const water = await E.addItem({ boardId: picnic.id, title: "Water", capacity: 2 });
  await t("items go right on the board; containers aren't allowed", async () => {
    await rejects(E.addNode({ boardId: picnic.id, name: "Food" }), /no room/);
  });
  const guest = await person("Gina", "Guest", null, null);
  await t("unpublished boards can't be claimed", async () => rejects(E.claim({ itemId: water.id, athleteId: guest.a, note: "x" }), /isn't published/));
  await publish(picnic.id);
  await t("the question is required", async () => rejects(E.claim({ itemId: water.id, athleteId: guest.a }), /Please answer/));
  await t("a public visitor (not signed in) can claim, with an answer", async () => {
    const c = await E.claim({ itemId: water.id, athleteId: guest.a, note: "  2 cases " }); assert.equal(c.status, "confirmed"); assert.equal(c.note, "2 cases");
  });
  await t("claiming twice is refused", async () => rejects(E.claim({ itemId: water.id, athleteId: guest.a, note: "x" }), /Already/));

  console.log("Training (3 levels, only people I add)");
  const tr = await E.createBoard({ name: "Winter Training", depth: 3, claimMode: "roster", settings: { cancel_hours: 24 } });
  await publish(tr.id);
  const r1 = await E.addNode({ boardId: tr.id, name: "Round 1", settings: { limit: 4, location: "Turn Two", leftover_hours: 24 } });
  const hit = await E.addNode({ boardId: tr.id, parentId: r1.id, name: "Hitting 12U–18U", settings: { limit: 2, attendance: true, waitlist: true, who: { mode: "teams", groups: ["12U", "14U", "16U", "18U"] } } });
  const cage = await E.addNode({ boardId: tr.id, parentId: r1.id, name: "Cage Time" });
  const catching = await E.addNode({ boardId: tr.id, parentId: r1.id, name: "Catching", settings: { who: { mode: "teams", tags: ["Catcher"] } } });
  await t("a 3-level board allows 2 levels of containers, no more", async () => rejects(E.addNode({ boardId: tr.id, parentId: hit.id, name: "Too deep" }), /no room/));
  await t("items only go in the last container level", async () => rejects(E.addItem({ boardId: tr.id, nodeId: r1.id, title: "x", capacity: 1 }), /last level/));
  const H1 = await E.addItem({ boardId: tr.id, nodeId: hit.id, title: "Mon 6 PM", capacity: 1, startsAt: inH(72) });
  const H2 = await E.addItem({ boardId: tr.id, nodeId: hit.id, title: "Wed 6 PM", capacity: 5, startsAt: inH(120) });
  const H3 = await E.addItem({ boardId: tr.id, nodeId: hit.id, title: "Fri 6 PM", capacity: 5, startsAt: inH(168) });
  const C1 = await E.addItem({ boardId: tr.id, nodeId: cage.id, title: "Cage A", capacity: 5, startsAt: inH(80) });
  const C2 = await E.addItem({ boardId: tr.id, nodeId: cage.id, title: "Cage B", capacity: 5, startsAt: inH(90) });
  const K1 = await E.addItem({ boardId: tr.id, nodeId: catching.id, title: "Catching Tue", capacity: 5, startsAt: inH(100), location: "CVTC" });
  const SOON = await E.addItem({ boardId: tr.id, nodeId: hit.id, title: "Tonight", capacity: 5, startsAt: inH(10) });

  await t("settings flow down: location from Round 1, attendance + waitlist from Hitting, cancel 24h from the board", async () => {
    const eff = E.effective(await E.chainFor(H1.id));
    assert.equal(eff.location, "Turn Two"); assert.equal(eff.from.location, "Round 1");
    assert.equal(eff.attendance, true); assert.equal(eff.waitlist, true); assert.equal(eff.cancel_hours, 24); assert.equal(eff.from.cancel_hours, "Winter Training");
    assert.deepEqual(eff.limits.map((l) => l.limit), [4, 2]);
  });
  await t("an item's own location wins", async () => assert.equal(E.effective(await E.chainFor(K1.id)).location, "CVTC"));

  const ava = await person("Ava", "Smith", tr.id, "12U", ["Catcher"], "jane@ex.com");
  const bea = await person("Bea", "Jones", tr.id, "10U", [], "bob@ex.com");
  const out = await person("Olly", "Outsider", null, null, [], "olly@ex.com");
  await t("only people I add: someone not on the list can't claim", async () => rejects(E.claim({ itemId: C1.id, athleteId: out.a, userId: out.u }), /signed in \(or on the list\)/));
  await t("who narrows: Bea (10U) can't claim Hitting 12U–18U", async () => rejects(E.claim({ itemId: H2.id, athleteId: bea.a, userId: bea.u }), /only for 12U/));
  await t("...and is hidden from her", async () => { const c = await E.chainFor(H2.id); assert.equal(E.check(c, E.effective(c), { athleteId: bea.a, userId: bea.u, member: { group_name: "10U", tags: [] } }).hidden, true); });
  await t("tags: Bea isn't a Catcher; Ava is", async () => {
    await rejects(E.claim({ itemId: K1.id, athleteId: bea.a, userId: bea.u }), /only for Catcher/);
  });
  await t("Ava claims 2 Hitting (Hitting's limit is 2)", async () => {
    assert.equal((await E.claim({ itemId: H1.id, athleteId: ava.a, userId: ava.u })).status, "confirmed");
    assert.equal((await E.claim({ itemId: H2.id, athleteId: ava.a, userId: ava.u })).status, "confirmed");
  });
  await t("a 3rd Hitting is refused by Hitting's limit", async () => rejects(E.claim({ itemId: H3.id, athleteId: ava.a, userId: ava.u }), /2 per person in Hitting/));
  await t("Cage Time has no limit of its own, but Round 1's 4 still applies", async () => {
    await E.claim({ itemId: C1.id, athleteId: ava.a, userId: ava.u });
    await E.claim({ itemId: C2.id, athleteId: ava.a, userId: ava.u });
    await rejects(E.claim({ itemId: K1.id, athleteId: ava.a, userId: ava.u }), /4 per person in Round 1/);
  });
  await t("open leftover spots: something starting within 24h can be claimed past the limits, and doesn't count", async () => {
    const c = await E.claim({ itemId: SOON.id, athleteId: ava.a, userId: ava.u }); assert.equal(c.counts, false);
  });
  await t("waitlist (on for Hitting): when it is full, a 14U teammate joins the waitlist", async () => {
    const mia = await person("Mia", "Klein", tr.id, "14U", [], "mia@ex.com");
    const c = await E.claim({ itemId: H1.id, athleteId: mia.a, userId: mia.u }); assert.equal(c.status, "waitlisted");
    global.mia = mia;
  });
  await t("Cage Time has no waitlist: full means full", async () => {
    await E.setCapacity(C1.id, 1);
    const zoe = await person("Zoe", "Peters", tr.id, "12U", [], "zoe@ex.com");
    await rejects(E.claim({ itemId: C1.id, athleteId: zoe.a, userId: zoe.u }), /full/);
  });
  await t("cancel deadline (24h, from the board): Ava can't cancel tonight's session in the app; an admin can", async () => {
    const c = (await query(`SELECT id FROM board_claims WHERE item_id=$1 AND athlete_id=$2`, [SOON.id, ava.a])).rows[0];
    await rejects(E.cancel({ claimId: c.id }), /Too late/);
    const r = await E.cancel({ claimId: c.id, admin: true }); assert.equal(r.canceled.id, c.id);
  });
  await t("canceling a full Hitting session moves the waitlist in", async () => {
    const c = (await query(`SELECT id FROM board_claims WHERE item_id=$1 AND athlete_id=$2`, [H1.id, ava.a])).rows[0];
    const r = await E.cancel({ claimId: c.id }); assert.equal(r.promoted.length, 1); assert.equal(r.promoted[0].athlete_id, global.mia.a);
  });
  await t("raising spots moves the waitlist in too", async () => {
    const lee = await person("Lee", "Ward", tr.id, "16U", [], "lee@ex.com");
    await E.claim({ itemId: H1.id, athleteId: lee.a, userId: lee.u }); // H1 is full again (Mia) -> waitlisted
    const p = await E.setCapacity(H1.id, 2); assert.equal(p.length, 1); assert.equal(p[0].athlete_id, lee.a);
  });

  console.log("Leftover window + limits");
  const lw = await E.createBoard({ name: "Leftover window", depth: 2, claimMode: "family", settings: { leftover_hours: 168 } });
  await publish(lw.id);
  const dz = await E.addNode({ boardId: lw.id, name: "Defense", settings: { limit: 1 } });
  const D1 = await E.addItem({ boardId: lw.id, nodeId: dz.id, title: "", capacity: 5, startsAt: inH(72), endsAt: inH(74) });
  const D2 = await E.addItem({ boardId: lw.id, nodeId: dz.id, title: "", capacity: 5, startsAt: inH(96), endsAt: inH(98) });
  const kid = await person("Kai", "Lane", null, null, [], "kai.parent@ex.com");
  await t("inside a leftover window, a claim under the limit still counts", async () => {
    const c = await E.claim({ itemId: D1.id, athleteId: kid.a, userId: kid.u }); assert.equal(c.counts, true);
    const v = await E.personView(lw.id, { athleteId: kid.a, userId: kid.u, member: null });
    assert.equal(v.limits.find((L) => L.name === "Defense").left, 0);
  });
  await t("...and once the limit is reached, a leftover spot is an extra that doesn't count", async () => {
    const c = await E.claim({ itemId: D2.id, athleteId: kid.a, userId: kid.u }); assert.equal(c.counts, false);
  });

  console.log("Timing and visibility");
  const r2 = await E.addNode({ boardId: tr.id, name: "Round 2", settings: { opens_at: inH(48).toISOString() } });
  const r2c = await E.addNode({ boardId: tr.id, parentId: r2.id, name: "Cage Time" });
  const R2 = await E.addItem({ boardId: tr.id, nodeId: r2c.id, title: "Cage C", capacity: 5, startsAt: inH(200) });
  await t("claiming opens: Round 2 isn't open yet", async () => rejects(E.claim({ itemId: R2.id, athleteId: bea.a, userId: bea.u }), /Claiming opens/));
  const r3 = await E.addNode({ boardId: tr.id, name: "Round 3", visibleFrom: inH(24) });
  const r3c = await E.addNode({ boardId: tr.id, parentId: r3.id, name: "Cage Time" });
  const R3 = await E.addItem({ boardId: tr.id, nodeId: r3c.id, title: "Cage D", capacity: 5, startsAt: inH(300) });
  await t("visible from: Round 3 is hidden until its date", async () => {
    const m = await rejects(E.claim({ itemId: R3.id, athleteId: bea.a, userId: bea.u }), /isn't open yet/);
    const c = await E.chainFor(R3.id); assert.equal(E.check(c, E.effective(c), { athleteId: bea.a, userId: bea.u, member: {} }).hidden, true);
  });

  console.log("Signed-in boards");
  const vol = await E.createBoard({ name: "Rumble Volunteers", depth: 2, claimMode: "public" });
  await publish(vol.id);
  const conc = await E.addNode({ boardId: vol.id, name: "Concessions" });
  const bar = await E.addNode({ boardId: vol.id, name: "Beer Garden", settings: { who: { mode: "signed_in" } } });
  const G1 = await E.addItem({ boardId: vol.id, nodeId: conc.id, title: "Grill 9-11", capacity: 3 });
  const B1 = await E.addItem({ boardId: vol.id, nodeId: bar.id, title: "Bar 12-3", capacity: 2 });
  const anon = await person("Pat", "Public", null, null);
  await t("public board: a visitor claims Concessions", async () => assert.equal((await E.claim({ itemId: G1.id, athleteId: anon.a })).status, "confirmed"));
  await t("...but the Beer Garden is narrowed to signed-in people", async () => rejects(E.claim({ itemId: B1.id, athleteId: anon.a }), /only for people who are signed in/));
  await t("a signed-in person can claim the Beer Garden", async () => assert.equal((await E.claim({ itemId: B1.id, athleteId: out.a, userId: out.u })).status, "confirmed"));

  console.log(`\n${pass} passed, ${fail} failed`);
  await pool.end(); process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
