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
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS se_group TEXT;                          -- SportsEngine group
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS organization TEXT;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{}';     -- parent, coach, volunteer
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_people_email ON athletes (lower(email));
    -- adults who signed up for themselves are adults
    UPDATE athletes SET kind='adult' WHERE self_user_id IS NOT NULL AND kind <> 'adult';
  `);
}

// The adult record for an email (made if needed), linked to their sign-in, with a role added
async function ensureAdult(email, { first = "", last = "", role = null } = {}) {
  const auth = require("./auth");
  const e = auth.normalizeEmail(email);
  const u = await auth.findOrCreateUser(e);
  let p = (await query(`SELECT * FROM athletes WHERE kind='adult' AND (self_user_id=$1 OR lower(email)=$2) ORDER BY id LIMIT 1`, [u.id, e])).rows[0];
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

const display = (p) => (`${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "(no name)");

module.exports = { migrate, ensureAdult, linkParent, display };
