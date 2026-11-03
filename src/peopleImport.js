// People import: read a file into rows, match them to People, explain what will happen, import, and undo.
// Nothing is saved until commit(); the review screen can edit rows and re-run analyze() as often as needed.
const { query } = require("./db");
const PP = require("./people");
const auth = require("./auth");

const PARENTS = 4;                       // up to four parents/guardians per row (SportsEngine allows 4)
const ROLE_WORDS = { coach: "coach", volunteer: "volunteer", parent: "parent", admin: "admin", staff: "volunteer" };
const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const low = (s) => norm(s).toLowerCase();
const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const nowYear = () => new Date().getFullYear();
const listNames = (v) => [...new Set(String(v == null ? "" : v).split(/[;|]+/).map(norm).filter(Boolean))];   // "Spring 2027; Pitching Clinic"

let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS import_maps (sig TEXT PRIMARY KEY, map JSONB NOT NULL, kind TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await query(`CREATE TABLE IF NOT EXISTS import_batches (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT,
    summary JSONB, people INT[] NOT NULL DEFAULT '{}', created INT[] NOT NULL DEFAULT '{}', undo JSONB, undone_at TIMESTAMPTZ)`);
  ready = true;
}

// ---------- columns ----------
const blankMap = () => ({ first: -1, last: -1, name: -1, kind: -1, birth: -1, jersey: -1, team: -1, lists: -1, phone: -1, email: -1, notes: -1, roles: -1,
  parents: Array.from({ length: PARENTS }, () => ({ first: -1, last: -1, name: -1, email: -1, phone: -1 })), emails: [] });
const sigOf = (headers) => headers.map(low).filter(Boolean).sort().join("|");

// Guess the columns from their names (SportsEngine exports, Google Forms, hand-made sheets)
function guess(headers) {
  const m = blankMap(), H = headers.map(low), used = new Set();
  const find = (test) => { const i = H.findIndex((h, k) => !used.has(k) && test(h)); if (i >= 0) used.add(i); return i; };
  // parents first, so "Parent 1 Email" isn't taken as the person's own email
  for (let n = 1; n <= PARENTS; n++) {
    const p = m.parents[n - 1];
    const isP = (h) => new RegExp(`(parent|guardian|contact)\\s*#?\\s*${n}\\b|\\b(parent|guardian)${n}\\b`).test(h) || (n === 1 && /^(mother|mom)\b/.test(h)) || (n === 2 && /^(father|dad)\b/.test(h));
    p.first = find((h) => isP(h) && /first/.test(h));
    p.last = find((h) => isP(h) && /last/.test(h));
    p.email = find((h) => isP(h) && /e-?mail/.test(h));
    p.phone = find((h) => isP(h) && /(phone|cell|mobile)/.test(h));
    if (p.first < 0 && p.last < 0) p.name = find((h) => isP(h) && /name/.test(h) && !/user/.test(h));
  }
  m.first = find((h) => /^(player |athlete |participant |member )?first( name)?$|^first ?name|^given/.test(h));
  m.last = find((h) => /^(player |athlete |participant |member )?last( name)?$|^last ?name|^surname|^family name/.test(h));
  if (m.first < 0 && m.last < 0) m.name = find((h) => /^(full )?name$|^(player|athlete|participant|member) name$/.test(h));
  m.kind = find((h) => /^(type|kind|person type|role type|participant type)$/.test(h));
  m.birth = find((h) => /birth|dob|^born|^grad.*year|birth ?year/.test(h));
  m.jersey = find((h) => /jersey|uniform|^number$|^no\.?$|^#$/.test(h));
  m.team = find((h) => /^(current )?team( name)?$|^age group$|^division$/.test(h));
  m.lists = find((h) => /program|registration|sportsengine|season|^group$|^list$/.test(h));
  m.roles = find((h) => /^roles?$|^position$/.test(h));
  m.email = find((h) => /^(player |athlete |participant |member |own |your )?e-?mail( address)?$/.test(h));
  m.phone = find((h) => /^(player |athlete |participant |member |your )?(phone|cell|mobile)( number)?$/.test(h));
  m.notes = find((h) => /note|comment|allerg|medical/.test(h));
  // any other column with "email" in it: more parent emails
  H.forEach((h, i) => { if (!used.has(i) && /e-?mail/.test(h)) { m.emails.push(i); used.add(i); } });
  return m;
}
// the map from the column-matching form
function mapFrom(body, headers) {
  const n = (v) => { const x = parseInt(v, 10); return Number.isInteger(x) && x >= 0 && x < headers.length ? x : -1; };
  const m = blankMap();
  for (const k of ["first", "last", "name", "kind", "birth", "jersey", "team", "lists", "phone", "email", "notes", "roles"]) m[k] = n(body[`col_${k}`]);
  for (let i = 0; i < PARENTS; i++) for (const k of ["first", "last", "name", "email", "phone"]) m.parents[i][k] = n(body[`col_p${i + 1}_${k}`]);
  m.emails = [].concat(body.col_emails || []).map(n).filter((x) => x >= 0);
  return m;
}
async function savedMap(headers) { await ensure(); const r = (await query(`SELECT map, kind FROM import_maps WHERE sig=$1`, [sigOf(headers)])).rows[0]; return r || null; }
async function saveMap(headers, map, kind) { await ensure(); await query(`INSERT INTO import_maps (sig, map, kind) VALUES ($1,$2,$3) ON CONFLICT (sig) DO UPDATE SET map=EXCLUDED.map, kind=EXCLUDED.kind, updated_at=now()`, [sigOf(headers), JSON.stringify(map), kind]); }

// ---------- rows ----------
const splitName = (s) => { const t = norm(s); if (!t) return ["", ""]; if (t.includes(",")) { const [l, f] = t.split(",").map(norm); return [f, l]; } const p = t.split(" "); return [p.slice(0, -1).join(" ") || p[0], p.length > 1 ? p[p.length - 1] : ""]; };
function yearOf(v) {
  const s = norm(v); if (!s) return null;
  const y4 = /(19|20)\d{2}/.exec(s); if (y4) return Number(y4[0]);
  const m = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.](\d{2})$/.exec(s); if (m) { const y = Number(m[1]); return y + (y > (nowYear() % 100) ? 1900 : 2000); }
  return null;
}
function kindOf(v, fallback) {
  const s = low(v);
  if (/athlete|player|kid|child|student|participant|camper/.test(s)) return "athlete";
  if (/coach|volunteer|parent|adult|staff|guardian|admin/.test(s)) return "adult";
  return fallback;
}
// file rows → editable row objects (the shape the review screen edits and sends back)
function toRows(data, map, kind) {
  const cell = (r, i) => (i >= 0 ? norm(r[i]) : "");
  return data.map((r, idx) => {
    let first = cell(r, map.first), last = cell(r, map.last);
    if (!first && !last && map.name >= 0) [first, last] = splitName(cell(r, map.name));
    const k = kind === "mixed" ? kindOf(cell(r, map.kind), "athlete") : kind;
    const roles = (cell(r, map.roles) + " " + (kind === "mixed" ? cell(r, map.kind) : "")).toLowerCase().split(/[^a-z]+/).map((w) => ROLE_WORDS[w]).filter(Boolean);
    const parents = map.parents.map((p) => {
      let pf = cell(r, p.first), pl = cell(r, p.last); if (!pf && !pl && p.name >= 0) [pf, pl] = splitName(cell(r, p.name));
      return { first: pf, last: pl, email: cell(r, p.email).toLowerCase(), phone: cell(r, p.phone) };
    }).filter((p) => p.first || p.last || p.email || p.phone);
    for (const i of map.emails) { const e = cell(r, i).toLowerCase(); if (e && !parents.some((p) => p.email === e)) parents.push({ first: "", last: "", email: e, phone: "" }); }
    return { i: idx, include: true, kind: k, first, last, birth: cell(r, map.birth), jersey: cell(r, map.jersey), team: cell(r, map.team), lists: cell(r, map.lists),
      phone: cell(r, map.phone), email: cell(r, map.email).toLowerCase(), notes: cell(r, map.notes), roles: [...new Set(roles)], parents, choice: "" };
  }).filter((r) => r.first || r.last || r.email || r.parents.length);
}

// ---------- analysis: match each row and explain what will happen ----------
async function analyze(rows) {
  await ensure();
  const people = (await query(`SELECT a.id, a.kind, a.first_name, a.last_name, a.birth_year, a.team, a.jersey, a.phone, a.email, a.notes, a.roles, a.self_user_id,
      ARRAY(SELECT lower(u.email) FROM parent_athletes pa JOIN users u ON u.id=pa.user_id WHERE pa.athlete_id=a.id) AS parent_emails,
      ARRAY(SELECT lower(l.name) FROM people_list_members m JOIN people_lists l ON l.id=m.list_id WHERE m.athlete_id=a.id) AS lists
    FROM athletes a WHERE a.archived_at IS NULL`)).rows;
  const byName = new Map(), byEmail = new Map();
  for (const p of people) {
    const k = `${low(p.first_name)}|${low(p.last_name)}`; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p);
    if (p.email) byEmail.set(low(p.email), p);
  }
  const label = (p) => [`${p.first_name} ${p.last_name}`.trim(), p.birth_year, p.team, (p.parent_emails || []).slice(0, 2).join(", ")].filter(Boolean).join(" · ");
  const seen = new Map();
  for (const r of rows) {
    r.first = norm(r.first); r.last = norm(r.last); r.email = low(r.email); r.parents = (r.parents || []).map((p) => ({ first: norm(p.first), last: norm(p.last), email: low(p.email), phone: norm(p.phone) }));
    const msgs = [], problems = [], warns = [];
    const by = yearOf(r.birth);
    if (!r.first || !r.last) problems.push(`Missing ${!r.first && !r.last ? "name" : !r.first ? "first name" : "last name"}`);
    if (norm(r.birth) && !by) warns.push(`“${norm(r.birth)}” isn't a birth year or date, so it's left out`);
    if (by && (by < 1930 || by > nowYear())) warns.push(`Birth year ${by} looks wrong, so it's left out`);
    if (r.email && !isEmail(r.email)) warns.push(`${r.email} isn't a valid email, so it's left out`);
    r.parents.forEach((p) => { if (p.email && !isEmail(p.email)) warns.push(`Parent/guardian email ${p.email} isn't valid, so it's left out`); });
    if (r.kind === "adult" && r.parents.length) warns.push(`Adults don't have parents/guardians in People, so those columns are left out`);
    const key = `${low(r.first)}|${low(r.last)}|${by || ""}`;
    if (r.first && seen.has(key)) warns.push(`Appears twice in this file (also row ${seen.get(key) + 2})`); else seen.set(key, r.i);
    // find who this is
    const pe = r.kind === "athlete" ? r.parents.map((p) => p.email).filter(isEmail) : [];
    let match = null, cands = [];
    const sameName = (byName.get(`${low(r.first)}|${low(r.last)}`) || []).filter((p) => p.kind === r.kind);
    if (r.choice === "new") match = null;
    else if (r.choice && people.some((p) => String(p.id) === String(r.choice))) match = people.find((p) => String(p.id) === String(r.choice));
    else if (r.email && isEmail(r.email) && byEmail.has(r.email) && byEmail.get(r.email).kind === r.kind) match = byEmail.get(r.email);
    else if (r.first && r.last) {
      const ok = sameName.filter((p) => !(by && p.birth_year && p.birth_year !== by));
      const shared = ok.filter((p) => pe.some((e) => (p.parent_emails || []).includes(e)));
      if (shared.length === 1) match = shared[0];
      else if (ok.length === 1 && (by || !sameName.some((p) => p !== ok[0]))) match = ok[0];
      else if (ok.length) cands = ok;
      else if (sameName.length) { cands = sameName; msgs.push("Same name as someone in People, but a different birth year"); }
      else if (r.kind === "athlete") {   // a nickname? same last name and birth year with a shared parent
        cands = people.filter((p) => p.kind === "athlete" && low(p.last_name) === low(r.last) && by && p.birth_year === by && pe.some((e) => (p.parent_emails || []).includes(e)));
      }
    }
    r.candidates = cands.map((p) => ({ id: p.id, label: label(p) }));
    r.matchId = match ? match.id : null;
    // what will change
    const changes = [];
    if (match) {
      const ch = (field, label, now, next) => { if (next && String(next) !== String(now || "")) changes.push(`${label}: ${now || "(none)"} → ${next}`); };
      ch("team", "Team", match.team, r.team); if (by && by >= 1930 && by <= nowYear()) ch("birth", "Birth year", match.birth_year, by);
      ch("jersey", "Jersey", match.jersey, r.jersey); ch("phone", "Phone", match.phone, r.phone);
      if (r.notes && r.notes !== norm(match.notes)) changes.push("Updates notes");
      if (r.email && isEmail(r.email) && r.email !== low(match.email)) changes.push(match.email ? `Email stays ${match.email} (the file has ${r.email})` : `${r.kind === "athlete" ? "Signs in themselves with" : "Adds email"} ${r.email}`);
      for (const role of r.roles || []) if (!(match.roles || []).includes(role)) changes.push(`Adds role ${role}`);
      for (const p of r.parents) if (isEmail(p.email) && !(match.parent_emails || []).includes(p.email) && r.kind === "athlete") changes.push(`Adds parent/guardian ${[p.first, p.last].filter(Boolean).join(" ") || p.email}${p.first || p.last ? ` (${p.email})` : ""}`);
      const add = listNames(r.lists).filter((L) => !(match.lists || []).includes(low(L)));
      if (add.length) changes.push(`Adds to list${add.length === 1 ? "" : "s"} ${add.join(", ")}`);
    } else {
      const ps = r.kind === "athlete" ? r.parents.filter((p) => isEmail(p.email)) : [];
      const newPs = ps.filter((p) => !byEmail.has(p.email)).length;
      msgs.push(`New ${r.kind === "athlete" ? "athlete" : "adult"}${ps.length ? ` · ${ps.length} ${ps.length === 1 ? "parent/guardian" : "parents/guardians"}${newPs ? ` (${newPs} new to People)` : ""}` : ""}${listNames(r.lists).length ? ` · list${listNames(r.lists).length === 1 ? "" : "s"} ${listNames(r.lists).join(", ")}` : ""}`);
      if (r.kind === "athlete" && !ps.length && !(r.email && isEmail(r.email))) warns.push("No parent/guardian email, so nobody can claim for them yet");
    }
    r.status = problems.length ? "problem" : cands.length && !match && r.choice !== "new" ? "match" : match ? (changes.length ? "update" : "same") : "new";
    if (r.status === "same") msgs.push("Already in People, nothing to change");
    if (r.status === "match") msgs.unshift(`Possible match in People. Choose who this is.`);
    r.messages = [...problems, ...msgs, ...changes]; r.warnings = warns; r.problems = problems; r.changes = changes;
    if (r.include == null) r.include = true;
    // a problem leaves the row out; once it's fixed it comes back in (unless you'd left it out yourself)
    if (problems.length) { if (r.include) r.autoOut = true; r.include = false; }
    else if (r.autoOut) { r.include = true; r.autoOut = false; }
  }
  return rows;
}
const counts = (rows) => {
  const c = { all: rows.length, new: 0, update: 0, same: 0, match: 0, problem: 0, out: 0, in: 0 };
  for (const r of rows) { c[r.status]++; if (r.include) c.in++; else c.out++; }
  return c;
};

// ---------- import ----------
async function commit(rows, { toLists = [], newLists = "", pLists = [], pNewLists = "", by = "" } = {}) {
  await ensure();
  rows = await analyze(rows);
  const todo = rows.filter((r) => r.include);
  if (todo.some((r) => r.status === "problem")) throw new Error("Fix or leave out the rows with problems first.");
  if (todo.some((r) => r.status === "match")) throw new Error("Choose who each possible match is first.");
  const undo = { updates: [], links: [], listAdds: [], listsMade: [], emails: [] }, created = [], touched = [];
  let added = 0, updated = 0, parentsNew = 0;
  const listFor = async (name) => { const before = (await query(`SELECT id FROM people_lists WHERE lower(name)=lower($1)`, [norm(name)])).rows[0]; const l = await PP.listNamed(name); if (l && !before) undo.listsMade.push(l.id); return l; };
  const putOn = async (list, id) => { if (!list) return; const r = await query(`INSERT INTO people_list_members (list_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [list.id, id]); if (r.rowCount) undo.listAdds.push([list.id, id]); };
  // everyone imported also goes on these lists (existing ones ticked, plus any new names)
  const everyone = [...(await query(`SELECT * FROM people_lists WHERE id = ANY($1)`, [[].concat(toLists).map(Number).filter(Boolean)])).rows];
  for (const n of String(newLists || "").split(/[,;]+/).map(norm).filter(Boolean)) { const l = await listFor(n); if (l && !everyone.some((x) => x.id === l.id)) everyone.push(l); }
  // their parents/guardians go on these lists (separately from the athletes)
  const pEveryone = [...(await query(`SELECT * FROM people_lists WHERE id = ANY($1)`, [[].concat(pLists).map(Number).filter(Boolean)])).rows];
  for (const n of String(pNewLists || "").split(/[,;]+/).map(norm).filter(Boolean)) { const l = await listFor(n); if (l && !pEveryone.some((x) => x.id === l.id)) pEveryone.push(l); }
  for (const r of todo) {
    const by = yearOf(r.birth), byOk = by && by >= 1930 && by <= nowYear() ? by : null;
    const email = r.email && isEmail(r.email) ? r.email : null;
    let id = r.matchId;
    if (!id) {
      if (r.kind === "adult" && email) {
        const pre = (await query(`SELECT id FROM athletes WHERE kind='adult' AND lower(email)=$1`, [email])).rows[0];
        const { person } = await PP.ensureAdult(email, { first: r.first, last: r.last });
        id = person.id; if (!pre) { created.push(id); added++; } else updated++;
        await query(`UPDATE athletes SET phone=COALESCE(NULLIF($2,''),phone), notes=COALESCE(NULLIF($3,''),notes), roles=(SELECT ARRAY(SELECT DISTINCT unnest(roles || $4::text[]))) WHERE id=$1`, [id, r.phone, r.notes, r.roles || []]);
      } else {
        id = (await query(`INSERT INTO athletes (kind, first_name, last_name, team, birth_year, jersey, phone, notes, roles) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [r.kind, r.first, r.last, r.team || null, byOk, r.jersey || null, r.phone || null, r.notes || null, r.roles || []])).rows[0].id;
        created.push(id); added++;
      }
    } else {
      const before = (await query(`SELECT team, birth_year, jersey, phone, notes, roles FROM athletes WHERE id=$1`, [id])).rows[0];
      await query(`UPDATE athletes SET team=COALESCE(NULLIF($2,''),team), birth_year=COALESCE($3,birth_year), jersey=COALESCE(NULLIF($4,''),jersey), phone=COALESCE(NULLIF($5,''),phone),
        notes=COALESCE(NULLIF($6,''),notes), roles=(SELECT ARRAY(SELECT DISTINCT unnest(roles || $7::text[]))) WHERE id=$1`, [id, r.team, byOk, r.jersey, r.phone, r.notes, r.roles || []]);
      undo.updates.push({ id, before }); if (r.status === "update") updated++;
    }
    touched.push(id);
    // an athlete's own sign-in email (or an adult's email, when they had none)
    if (email) {
      const cur = (await query(`SELECT email, self_user_id FROM athletes WHERE id=$1`, [id])).rows[0];
      if (!cur.email) {
        const u = await auth.findOrCreateUser(email);
        const other = (await query(`SELECT id FROM athletes WHERE self_user_id=$1 AND id<>$2 AND archived_at IS NULL`, [u.id, id])).rows[0];
        if (!other) { await query(`UPDATE athletes SET email=$2, self_user_id=$3 WHERE id=$1`, [id, email, u.id]); undo.emails.push({ id, before: cur }); }
      }
    }
    // parents
    if (r.kind === "athlete") for (const p of r.parents || []) {
      if (!p.email || !isEmail(p.email)) continue;
      const pre = (await query(`SELECT id FROM athletes WHERE kind='adult' AND lower(email)=$1`, [p.email])).rows[0];
      const { person, user } = await PP.ensureAdult(p.email, { first: p.first, last: p.last, role: "parent" });
      if (!pre) { created.push(person.id); parentsNew++; }
      if (p.phone) await query(`UPDATE athletes SET phone=COALESCE(phone,$2) WHERE id=$1`, [person.id, p.phone]);
      const l = await query(`INSERT INTO parent_athletes (user_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, id]);
      if (l.rowCount) undo.links.push([user.id, id]);
      for (const pl of pEveryone) await putOn(pl, person.id);
    }
    for (const L of listNames(r.lists)) await putOn(await listFor(L), id);
    for (const l of everyone) await putOn(l, id);
  }
  const summary = { rows: rows.length, imported: todo.length, added, updated, parentsNew, left: rows.length - todo.length, lists: everyone.map((l) => l.name), pLists: pEveryone.map((l) => l.name) };
  const b = (await query(`INSERT INTO import_batches (created_by, summary, people, created, undo) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [by, JSON.stringify(summary), [...new Set(touched)], [...new Set(created)], JSON.stringify(undo)])).rows[0];
  return { batch: b.id, summary };
}

// ---------- after: the batch, invites, undo ----------
async function batch(id) { await ensure(); return (await query(`SELECT * FROM import_batches WHERE id=$1`, [id])).rows[0] || null; }
const canUndo = (b) => b && !b.undone_at && Date.now() - new Date(b.created_at).getTime() < 24 * 3600e3;
// new adults (people added, and new parents) with an email who haven't been invited or signed in
async function invitable(b) {
  return (await query(`SELECT a.id, a.self_user_id AS user_id, a.email FROM athletes a JOIN users u ON u.id=a.self_user_id
    WHERE a.id = ANY($1) AND a.email IS NOT NULL AND u.invited_at IS NULL AND u.last_login_at IS NULL`, [b.created])).rows;
}
async function undoBatch(id) {
  const b = await batch(id);
  if (!canUndo(b)) throw new Error("This import can't be undone anymore.");
  const u = b.undo || {};
  for (const [uid, aid] of u.links || []) await query(`DELETE FROM parent_athletes WHERE user_id=$1 AND athlete_id=$2`, [uid, aid]);
  for (const [lid, aid] of u.listAdds || []) await query(`DELETE FROM people_list_members WHERE list_id=$1 AND athlete_id=$2`, [lid, aid]);
  for (const e of u.emails || []) await query(`UPDATE athletes SET email=$2, self_user_id=$3 WHERE id=$1`, [e.id, e.before.email, e.before.self_user_id]);
  for (const x of u.updates || []) { const f = x.before; await query(`UPDATE athletes SET team=$2, birth_year=$3, jersey=$4, phone=$5, notes=$6, roles=$7 WHERE id=$1`, [x.id, f.team, f.birth_year, f.jersey, f.phone, f.notes, f.roles || []]); }
  // people it added go away, unless they've been used since (on a board, claimed something, linked to other family)
  let removed = 0, kept = 0;
  for (const aid of b.created) {
    const used = (await query(`SELECT (SELECT count(*) FROM board_claims WHERE athlete_id=$1) + (SELECT count(*) FROM schedule_members WHERE athlete_id=$1)
      + (SELECT count(*) FROM parent_athletes WHERE athlete_id=$1) + (SELECT count(*) FROM parent_athletes pa JOIN athletes a ON a.self_user_id=pa.user_id WHERE a.id=$1) AS n`, [aid])).rows[0].n;
    if (Number(used) > 0) { kept++; continue; }
    await query(`DELETE FROM people_list_members WHERE athlete_id=$1`, [aid]);
    await query(`DELETE FROM athletes WHERE id=$1`, [aid]); removed++;
  }
  for (const lid of u.listsMade || []) await query(`DELETE FROM people_lists l WHERE l.id=$1 AND NOT EXISTS (SELECT 1 FROM people_list_members m WHERE m.list_id=l.id)`, [lid]);
  await query(`UPDATE import_batches SET undone_at=now() WHERE id=$1`, [id]);
  return { removed, kept };
}
// people of the same kind who weren't in this import: on a chosen list, or anyone in People
async function missing(b, compare) {
  const kinds = (await query(`SELECT DISTINCT kind FROM athletes WHERE id = ANY($1)`, [b.people])).rows.map((r) => r.kind).filter(Boolean);
  if (!kinds.length) return [];
  const onList = compare && compare !== "all" ? Number(compare) : null;
  return (await query(`SELECT a.id, a.kind, a.first_name, a.last_name, a.team, a.birth_year, a.email,
      ARRAY(SELECT coalesce(nullif(trim(p.first_name || ' ' || coalesce(p.last_name,'')),''), u.email) FROM parent_athletes pa JOIN users u ON u.id=pa.user_id
        LEFT JOIN athletes p ON p.self_user_id=u.id AND p.archived_at IS NULL WHERE pa.athlete_id=a.id) AS parents,
      ARRAY(SELECT l.name FROM people_list_members m JOIN people_lists l ON l.id=m.list_id WHERE m.athlete_id=a.id ORDER BY l.id DESC) AS lists
    FROM athletes a WHERE a.archived_at IS NULL AND a.kind = ANY($1) AND NOT (a.id = ANY($2)) AND a.created_at < $3
      AND ($4::int IS NULL OR EXISTS (SELECT 1 FROM people_list_members m WHERE m.athlete_id=a.id AND m.list_id=$4))
    ORDER BY lower(a.last_name), lower(a.first_name)`, [kinds, b.people, b.created_at, onList])).rows;
}
// archive them (and, if asked, their parents/guardians who have no other athletes left)
async function archiveMissing(ids, alsoParents) {
  ids = ids.map(Number).filter(Boolean); if (!ids.length) return { people: 0, parents: 0 };
  let parents = 0;
  if (alsoParents) {
    const lone = (await query(`SELECT DISTINCT p.id FROM parent_athletes pa JOIN athletes p ON p.self_user_id=pa.user_id AND p.archived_at IS NULL AND p.kind='adult'
      WHERE pa.athlete_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM parent_athletes o JOIN athletes k ON k.id=o.athlete_id AND k.archived_at IS NULL
        WHERE o.user_id=pa.user_id AND NOT (o.athlete_id = ANY($1)))`, [ids])).rows.map((r) => r.id);
    if (lone.length) parents = (await query(`UPDATE athletes SET archived_at=now() WHERE id = ANY($1) AND archived_at IS NULL`, [lone])).rowCount;
  }
  const n = (await query(`UPDATE athletes SET archived_at=now() WHERE id = ANY($1) AND archived_at IS NULL`, [ids])).rowCount;
  return { people: n, parents };
}
async function listMissing(ids, listId, newName) {
  ids = ids.map(Number).filter(Boolean); if (!ids.length) return null;
  const l = listId ? (await query(`SELECT * FROM people_lists WHERE id=$1`, [Number(listId)])).rows[0] : newName ? await PP.listNamed(newName) : null;
  if (!l) throw new Error("Pick a list, or name a new one.");
  for (const id of ids) await query(`INSERT INTO people_list_members (list_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [l.id, id]);
  return l;
}
module.exports = { missing, archiveMissing, listMissing, PARENTS, guess, mapFrom, savedMap, saveMap, toRows, analyze, counts, commit, batch, canUndo, invitable, undoBatch, yearOf };
