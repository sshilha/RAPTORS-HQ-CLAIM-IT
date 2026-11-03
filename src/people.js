// The People directory: everyone in the app. Athletes, and adults (parents, coaches, volunteers / outside
// participants). Adults with an email sign in with it. Coach is a role, so a parent can also be a coach.
const { query } = require("./db");

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
    || (await query(`SELECT * FROM athletes WHERE kind='adult' AND lower(email)=$1 ORDER BY id LIMIT 1`, [e])).rows[0];
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
const STATUS = { active: "Active", invited: "Invited", notinvited: "Not invited", setup: "Needs setup", noemail: "No email", ready: "Ready", noparent: "No parent" };
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

module.exports = { STATUS, statusOf, isAdultAge, migrate, ensureAdult, linkParent, display, lists, listNamed, addToList, reportScope };
