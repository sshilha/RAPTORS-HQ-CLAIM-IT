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

    CREATE INDEX IF NOT EXISTS idx_sessions_program ON training_sessions(program_id, starts_at);
  `);
}

module.exports = { pool, query, migrate };
