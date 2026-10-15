const { Pool, types } = require("pg");

// Return DATE columns as plain "YYYY-MM-DD" strings (no timezone shifting)
types.setTypeParser(1082, (v) => v);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add a Postgres database in Railway and reference it.");
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1|\.railway\.internal/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const query = (text, params) => pool.query(text, params);

// Creates tables if they don't exist. Safe to run on every startup.
async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS login_tokens (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS athletes (
      id          SERIAL PRIMARY KEY,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      team        TEXT,
      se_member_id TEXT UNIQUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS parent_athletes (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, athlete_id)
    );

    CREATE INDEX IF NOT EXISTS idx_login_tokens_user ON login_tokens(user_id, created_at);

    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS age_group TEXT;

    CREATE TABLE IF NOT EXISTS seasons (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      starts_on    DATE NOT NULL,
      ends_on      DATE NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id                SERIAL PRIMARY KEY,
      name              TEXT NOT NULL,
      starts_on         DATE NOT NULL,
      ends_on           DATE NOT NULL,
      booking_opens_at  TIMESTAMPTZ,
      priority_ends_at  TIMESTAMPTZ,
      priority_limit    INTEGER NOT NULL DEFAULT 2,
      cancel_hours      INTEGER NOT NULL DEFAULT 24,
      location          TEXT,
      activity_defaults JSONB NOT NULL DEFAULT '{}',
      published_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS programs (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      activity         TEXT NOT NULL,
      age_groups       TEXT[] NOT NULL,
      description      TEXT,
      priority_limit   INTEGER NOT NULL DEFAULT 2,
      priority_ends_at TIMESTAMPTZ,
      booking_opens_at TIMESTAMPTZ,
      cancel_hours     INTEGER NOT NULL DEFAULT 24,
      archived         BOOLEAN NOT NULL DEFAULT false,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS training_sessions (
      id          SERIAL PRIMARY KEY,
      program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      starts_at   TIMESTAMPTZ NOT NULL,
      ends_at     TIMESTAMPTZ NOT NULL,
      location    TEXT,
      coach       TEXT,
      capacity    INTEGER NOT NULL CHECK (capacity > 0),
      notes       TEXT,
      canceled_at TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id          SERIAL PRIMARY KEY,
      session_id  INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      booked_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status      TEXT NOT NULL CHECK (status IN ('confirmed','waitlisted','canceled')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      promoted_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      canceled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_res_active
      ON reservations(session_id, athlete_id) WHERE status <> 'canceled';
    CREATE INDEX IF NOT EXISTS idx_res_session ON reservations(session_id, status, created_at);
    ALTER TABLE programs ADD COLUMN IF NOT EXISTS round_id INTEGER REFERENCES rounds(id) ON DELETE CASCADE;
    ALTER TABLE programs ADD COLUMN IF NOT EXISTS default_capacity INTEGER;
    ALTER TABLE programs ADD COLUMN IF NOT EXISTS default_coach TEXT;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS time_slots JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS activity_limits JSONB;
    ALTER TABLE programs ADD COLUMN IF NOT EXISTS block_minutes INTEGER;
    -- Locked sessions honor the per-activity limits; they unlock this many hours before they start (NULL = never)
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS unlock_hours INTEGER DEFAULT 168;
    ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ;
    -- Waitlists are optional: per round (default off), with a per-session override (NULL = use the round's)
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS waitlist BOOLEAN NOT NULL DEFAULT false;

    -- Schedules: separate sign-up instances (e.g. Training, Concessions), each naming its own levels
    CREATE TABLE IF NOT EXISTS schedules (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      labels     JSONB NOT NULL DEFAULT '{}',
      activities TEXT[],            -- which activities this schedule offers (NULL = all)
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE seasons ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE;
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE;
    -- Who can sign up for a sheet: roster (linked athletes in matching groups), family (signed-in
    -- users for themselves or their kids), public (anyone with the link)
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS signup_mode TEXT NOT NULL DEFAULT 'roster';
    ALTER TABLE rounds ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
    ALTER TABLE rounds ALTER COLUMN share_token SET DEFAULT md5(random()::text || clock_timestamp()::text);
    UPDATE rounds SET share_token = md5(random()::text || clock_timestamp()::text || id) WHERE share_token IS NULL;
    -- A participant can be an adult signing up themselves (linked to their own login)
    ALTER TABLE athletes ADD COLUMN IF NOT EXISTS self_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_self_participant ON athletes(self_user_id) WHERE self_user_id IS NOT NULL;

    -- Each schedule has its own groups, group shortcuts, and members (people who can use it)
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS groups TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS presets JSONB NOT NULL DEFAULT '[]';
    CREATE TABLE IF NOT EXISTS schedule_members (
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      group_name  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (schedule_id, athlete_id)
    );
    CREATE INDEX IF NOT EXISTS idx_members_athlete ON schedule_members(athlete_id);
    -- Archived schedules are hidden from families and listed separately in Settings
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    ALTER TABLE programs ADD COLUMN IF NOT EXISTS waitlist BOOLEAN;
    -- Spots taken from unlocked sessions don't use up an athlete's limit
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS counts_toward_limit BOOLEAN NOT NULL DEFAULT true;
    -- Earlier builds flagged bookings of unlimited activities as "open spots"; they're regular bookings
    UPDATE reservations x SET counts_toward_limit = true
      FROM training_sessions s JOIN programs p ON p.id=s.program_id JOIN rounds r ON r.id=p.round_id
      WHERE x.session_id=s.id AND NOT x.counts_toward_limit
        AND r.activity_limits ? p.activity AND r.activity_limits -> p.activity = 'null'::jsonb;
    -- Older rounds: carry their single limit over to every activity; Cage Time unlimited
    UPDATE rounds SET activity_limits = jsonb_build_object('Hitting', priority_limit, 'Pitching', priority_limit,
      'Catching', priority_limit, 'Defense', priority_limit, 'Cage Time', NULL) WHERE activity_limits IS NULL;

    CREATE INDEX IF NOT EXISTS idx_sessions_program ON training_sessions(program_id, starts_at);
  `);
}

module.exports = { pool, query, migrate };
