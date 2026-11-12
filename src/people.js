// The People directory: everyone in the app. Athletes, and adults (parents, coaches, volunteers / outside
// participants). Adults with an email sign in with it. Coach is a role, so a parent can also be a coach.
const { query, pool } = require("./db");

async function migrate() {
  await query(`
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'athlete';   -- athlete | adult
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS birth_year INTEGER;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS jersey TEXT;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS organization TEXT;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{}';     -- parent, coach, volunteer
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_people_email ON athletes (lower(email));
    -- Lists: named groups of people managed in bulk (2026 Season Athletes, Board Members...)
    CREATE TABLE IF NOT EXISTS people_lists (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_people_list_name ON people_lists (lower(name));
    CREATE TABLE IF NOT EXISTS people_list_members (
      list_id INTEGER NOT NULL REFERENCES people_lists(id) ON DELETE CASCADE,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (list_id, athlete_id)
    );
    -- an athlete who signs in themselves: does their family see/manage their claims, and get the emails?
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS family_access BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS family_emails BOOLEAN NOT NULL DEFAULT true;
    -- Report access for non-admins: { mode: "none" | "coached" | "boards", boards: [ids], teams: [names] }
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS report_access JSONB;
    -- adults who signed up for themselves are adults
    -- one-time (v0.x) cleanup: people who signed in before "kind" existed were adults. Runs once, never again,
    -- because athletes can now sign in themselves (they must stay athletes).
    CREATE TABLE IF NOT EXISTS app_flags (name TEXT PRIMARY KEY);
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM app_flags WHERE name='kind_adult_fix_v1') THEN
        UPDATE athletes SET kind='adult' WHERE self_user_id IS NOT NULL AND kind <> 'adult'
          AND NOT EXISTS (SELECT 1 FROM parent_athletes pa WHERE pa.athlete_id = athletes.id) AND birth_year IS NULL;
        INSERT INTO app_flags (name) VALUES ('kind_adult_fix_v1');
      END IF;
    END $$;
    -- SportsEngine group is retired: any values become lists of the same name (once), then the column is dropped
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='athletes' AND column_name='se_group' AND table_schema=current_schema()) THEN
        INSERT INTO people_lists (name) SELECT DISTINCT ON (lower(trim(se_group))) trim(se_group) FROM athletes
          WHERE coalesce(trim(se_group), '') <> '' AND NOT EXISTS (SELECT 1 FROM people_lists l WHERE lower(l.name) = lower(trim(athletes.se_group)));
        INSERT INTO people_list_members (list_id, athlete_id) SELECT l.id, a.id FROM athletes a JOIN people_lists l ON lower(l.name) = lower(trim(a.se_group))
          WHERE coalesce(trim(a.se_group), '') <> '' ON CONFLICT DO NOTHING;
        ALTER TABLE athletes DROP COLUMN se_group;
      END IF;
    END $$;
  `);
}

// The adult record for an email (made if needed), linked to their sign-in, with a role added
async function ensureAdult(email, { first = "", last = "", role = null } = {}) {
  const auth = require("./auth");
  const e = auth.normalizeEmail(email);
  const u = await auth.findOrCreateUser(e);
  let p = (await query(`SELECT * FROM athletes WHERE self_user_id=$1 AND archived_at IS NULL ORDER BY id LIMIT 1`, [u.id])).rows[0]
    || (await query(`SELECT * FROM athletes WHERE lower(email)=$1 AND self_user_id IS NULL AND archived_at IS NULL ORDER BY (kind='adult') DESC, id LIMIT 1`, [e])).rows[0];   // an athlete with her own email counts too
  if (!p) p = (await query(`INSERT INTO athletes (first_name, last_name, kind, email, self_user_id, roles) VALUES ($1,$2,'adult',$3,$4,$5) RETURNING *`,
    [first, last, e, u.id, role ? [role] : []])).rows[0];
  else {
    await query(`UPDATE athletes SET email=COALESCE(email,$2), self_user_id=COALESCE(self_user_id,$3),
        first_name = CASE WHEN first_name='' THEN $4 ELSE first_name END, last_name = CASE WHEN last_name='' THEN $5 ELSE last_name END,
        roles = CASE WHEN $6::text IS NULL OR $6 = ANY(roles) THEN roles ELSE array_append(roles, $6) END WHERE id=$1`, [p.id, e, u.id, first, last, role]);
  }
  return { person: p, user: u };
}

// Link a parent (by email) to an athlete
async function linkParent(athleteId, email) {
  const { user } = await ensureAdult(email, { role: "parent" });
  await query(`INSERT INTO parent_athletes (user_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user.id, athleteId]);
}

// Lists
async function lists() {
  return (await query(`SELECT l.*, (SELECT count(*)::int FROM people_list_members m JOIN athletes a ON a.id=m.athlete_id
      WHERE m.list_id=l.id AND a.archived_at IS NULL) AS n FROM people_lists l ORDER BY lower(l.name)`)).rows;
}
// A list by name (made if needed)
async function listNamed(name) {
  const n = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!n) return null;
  return (await query(`SELECT * FROM people_lists WHERE lower(name)=lower($1)`, [n])).rows[0]
    || (await query(`INSERT INTO people_lists (name) VALUES ($1) RETURNING *`, [n])).rows[0];
}
async function addToList(listId, ids) {
  for (const id of ids) await query(`INSERT INTO people_list_members (list_id, athlete_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [listId, id]);
}

// Which boards (and teams) a user may see reports for. Admins: everything. Others: what they've been given.
async function reportScope(user) {
  if (!user) return null;
  if (require("./auth").isAdmin(user)) return { all: true, boards: null, teams: [] };
  const p = (await query(`SELECT * FROM athletes WHERE kind='adult' AND (self_user_id=$1 OR lower(email)=lower($2)) AND archived_at IS NULL ORDER BY id LIMIT 1`, [user.id, user.email])).rows[0];
  const a = p && p.report_access;
  if (!a || !a.mode || a.mode === "none") return null;
  let boards = [];
  if (a.mode === "coached") boards = (await query(`SELECT schedule_id FROM schedule_coaches WHERE lower(email)=lower($1)`, [user.email])).rows.map((r) => r.schedule_id);
  if (a.mode === "boards") boards = (a.boards || []).map(Number).filter(Boolean);
  return boards.length ? { all: false, boards, teams: (a.teams || []).filter(Boolean) } : null;
}

// A person's status in People: what (if anything) needs attention
const STATUS = { active: "Active", invited: "Invited", notinvited: "Not invited", setup: "Needs setup", noemail: "No email", ready: "Ready", noparent: "No parent/guardian" };
// 18 or older (by birth year): an athlete who can change their own family sharing
const isAdultAge = (p) => !!(p && p.birth_year && new Date().getFullYear() - p.birth_year >= 18);
function statusOf(p) {
  if (p.kind === "athlete" && !p.email && !p.self_user_id) return (p.parents || []).length ? "ready" : "noparent";
  if (!p.email) return "noemail";
  if (p.setup_required && p.last_login_at) return "setup";
  if (p.last_login_at) return "active";
  if (p.invited_at) return "invited";
  return "notinvited";
}

const display = (p) => (`${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "(no name)");

// ---------- merge a duplicate into the person you keep ----------
// what would move (for the preview)
async function mergePreview(keepId, dupId) {
  const q = async (sql) => (await query(sql, [dupId, keepId])).rows[0].n;
  return {
    claims: await q(`SELECT count(*)::int AS n FROM board_claims WHERE athlete_id=$1 AND item_id NOT IN (SELECT item_id FROM board_claims WHERE athlete_id=$2 AND status<>'canceled')`),
    sameClaims: await q(`SELECT count(*)::int AS n FROM board_claims WHERE athlete_id=$1 AND item_id IN (SELECT item_id FROM board_claims WHERE athlete_id=$2 AND status<>'canceled')`),
    boards: await q(`SELECT count(*)::int AS n FROM schedule_members WHERE athlete_id=$1 AND schedule_id NOT IN (SELECT schedule_id FROM schedule_members WHERE athlete_id=$2)`),
    parents: await q(`SELECT count(*)::int AS n FROM parent_athletes WHERE athlete_id=$1 AND user_id NOT IN (SELECT user_id FROM parent_athletes WHERE athlete_id=$2)`),
    lists: await q(`SELECT count(*)::int AS n FROM people_list_members WHERE athlete_id=$1 AND list_id NOT IN (SELECT list_id FROM people_list_members WHERE athlete_id=$2)`),
  };
}
async function merge(keepId, dupId) {
  if (keepId === dupId) throw new Error("Pick a different person.");
  const [k, d] = await Promise.all([keepId, dupId].map(async (id) => (await query(`SELECT * FROM athletes WHERE id=$1 AND archived_at IS NULL`, [id])).rows[0]));
  if (!k || !d) throw new Error("One of them isn't in People anymore.");
  if (false && k.kind !== d.kind) throw new Error(`Only the same kind can be merged (${k.kind === "athlete" ? "athlete" : "adult"} with ${k.kind === "athlete" ? "athlete" : "adult"}).`);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // claims: move theirs over; where both claimed the same spot, keep the one you're keeping
    await c.query(`UPDATE board_claims SET athlete_id=$2 WHERE athlete_id=$1 AND item_id NOT IN (SELECT item_id FROM board_claims WHERE athlete_id=$2 AND status<>'canceled')`, [dupId, keepId]);
    await c.query(`DELETE FROM board_claims WHERE athlete_id=$1`, [dupId]);
    // boards (their group and tags come along where the kept person isn't on that board yet)
    await c.query(`INSERT INTO schedule_members (schedule_id, athlete_id, group_name, tags) SELECT schedule_id, $2, group_name, tags FROM schedule_members WHERE athlete_id=$1 ON CONFLICT DO NOTHING`, [dupId, keepId]);
    await c.query(`DELETE FROM schedule_members WHERE athlete_id=$1`, [dupId]);
    // parents/guardians, lists
    await c.query(`INSERT INTO parent_athletes (user_id, athlete_id) SELECT user_id, $2 FROM parent_athletes WHERE athlete_id=$1 ON CONFLICT DO NOTHING`, [dupId, keepId]);
    await c.query(`DELETE FROM parent_athletes WHERE athlete_id=$1`, [dupId]);
    await c.query(`INSERT INTO people_list_members (list_id, athlete_id) SELECT list_id, $2 FROM people_list_members WHERE athlete_id=$1 ON CONFLICT DO NOTHING`, [dupId, keepId]);
    await c.query(`DELETE FROM people_list_members WHERE athlete_id=$1`, [dupId]);
    if ((await c.query(`SELECT to_regclass('public.reservations') IS NOT NULL AS x`)).rows[0].x) await c.query(`UPDATE reservations SET athlete_id=$2 WHERE athlete_id=$1`, [dupId, keepId]);
    // sign-in: if only the duplicate had one, the kept person gets it; if both did, the duplicate's family links move to the kept sign-in
    if (d.self_user_id && !k.self_user_id) { await c.query(`UPDATE athletes SET self_user_id=NULL WHERE id=$1`, [dupId]);   // a sign-in belongs to one person: release it first
      await c.query(`UPDATE athletes SET self_user_id=$2, email=COALESCE(email,$3) WHERE id=$1`, [keepId, d.self_user_id, d.email]); }
    else if (d.self_user_id && k.self_user_id && d.self_user_id !== k.self_user_id) {
      await c.query(`INSERT INTO parent_athletes (user_id, athlete_id) SELECT $2, athlete_id FROM parent_athletes WHERE user_id=$1 ON CONFLICT DO NOTHING`, [d.self_user_id, k.self_user_id]);
      await c.query(`DELETE FROM parent_athletes WHERE user_id=$1`, [d.self_user_id]);
    }
    // fill in what the kept person is missing
    await c.query(`UPDATE athletes SET team=COALESCE(NULLIF(team,''),$2), birth_year=COALESCE(birth_year,$3), jersey=COALESCE(NULLIF(jersey,''),$4), phone=COALESCE(NULLIF(phone,''),$5),
      notes=CASE WHEN coalesce(notes,'')='' THEN $6 WHEN coalesce($6,'')='' OR notes=$6 THEN notes ELSE notes || E'\n' || $6 END, organization=COALESCE(NULLIF(organization,''),$7),
      roles=(SELECT ARRAY(SELECT DISTINCT unnest(coalesce(roles,'{}') || coalesce($8::text[],'{}')))) WHERE id=$1`,
      [keepId, d.team, d.birth_year, d.jersey, d.phone, d.notes, d.organization, d.roles || []]);
    await c.query(`UPDATE athletes SET archived_at=now(), self_user_id=NULL, notes=trim(coalesce(notes,'') || E'\nMerged into #' || $2) WHERE id=$1`, [dupId, keepId]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
// ---------- clean up: people with a sign-in who haven't used it in a year (or never, set up over a year ago) ----------
async function cleanupList(meId) {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cleanup_kept_at TIMESTAMPTZ`);
  const rows = (await query(`SELECT u.id AS user_id, u.email, u.created_at, u.last_login_at, a.id AS person_id, a.kind, a.first_name, a.last_name, a.roles,
      ARRAY(SELECT k.first_name || ' ' || coalesce(k.last_name,'') FROM parent_athletes pa JOIN athletes k ON k.id=pa.athlete_id AND k.archived_at IS NULL WHERE pa.user_id=u.id ORDER BY k.first_name) AS kids,
      ARRAY(SELECT k.first_name FROM parent_athletes pa JOIN athletes k ON k.id=pa.athlete_id AND k.archived_at IS NULL
        WHERE pa.user_id=u.id AND NOT EXISTS (SELECT 1 FROM parent_athletes o WHERE o.athlete_id=k.id AND o.user_id<>u.id)) AS only_parent_of,
      (SELECT count(*)::int FROM board_claims c WHERE c.athlete_id=a.id) AS claims,
      (SELECT max(i.starts_at) FROM board_claims c JOIN board_items i ON i.id=c.item_id WHERE c.athlete_id=a.id) AS last_claim
    FROM users u LEFT JOIN LATERAL (SELECT * FROM athletes x WHERE x.self_user_id=u.id AND x.archived_at IS NULL ORDER BY (x.kind='athlete') DESC LIMIT 1) a ON true
    WHERE u.id <> $1 AND coalesce(u.last_login_at, u.created_at) < now() - interval '1 year'
      AND (u.cleanup_kept_at IS NULL OR u.cleanup_kept_at < now() - interval '1 year')
    ORDER BY coalesce(u.last_login_at, u.created_at)`, [meId])).rows;
  const isAdmin = require("./auth").isAdmin;
  return rows.filter((r) => !isAdmin({ email: r.email }) && !(r.roles || []).includes("admin"));
}
async function cleanupKeep(userIds) {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cleanup_kept_at TIMESTAMPTZ`);
  return (await query(`UPDATE users SET cleanup_kept_at=now() WHERE id = ANY($1)`, [userIds.map(Number).filter(Boolean)])).rowCount;
}
// delete: the sign-in goes; the person goes too, unless they have claims (then they're archived so Reports keeps their history)
async function cleanupDelete(userIds, meId) {
  let deleted = 0, archived = 0;
  const isAdmin = require("./auth").isAdmin;
  for (const uid of userIds.map(Number).filter(Boolean)) {
    if (uid === meId) continue;
    const u = (await query(`SELECT * FROM users WHERE id=$1`, [uid])).rows[0]; if (!u || isAdmin({ email: u.email })) continue;
    const people = (await query(`SELECT a.id, (SELECT count(*)::int FROM board_claims c WHERE c.athlete_id=a.id) AS claims FROM athletes a WHERE a.self_user_id=$1`, [uid])).rows;
    for (const p of people) {
      if (p.claims > 0) { await query(`UPDATE athletes SET self_user_id=NULL, archived_at=COALESCE(archived_at, now()) WHERE id=$1`, [p.id]); archived++; }
      else { await query(`DELETE FROM people_list_members WHERE athlete_id=$1`, [p.id]); await query(`DELETE FROM schedule_members WHERE athlete_id=$1`, [p.id]); await query(`DELETE FROM athletes WHERE id=$1`, [p.id]); deleted++; }
    }
    await query(`DELETE FROM users WHERE id=$1`, [uid]);   // sign-in, sessions, tokens and parent/guardian links go with it
    if (!people.length) deleted++;
  }
  return { deleted, archived };
}
module.exports = { cleanupList, cleanupKeep, cleanupDelete, mergePreview, merge, STATUS, statusOf, isAdultAge, migrate, ensureAdult, linkParent, display, lists, listNamed, addToList, reportScope };
