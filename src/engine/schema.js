// The container engine's tables. Every board is: board -> containers (up to 3 deep) -> items -> claims.
// Runs on startup after the main migration; safe to run again.
const { query } = require("../db");

async function migrate() {
  await query(`
    -- Board-wide defaults (inherited by every container and item), one Publish, and the claim question
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS question JSONB;

    -- Containers (Round 1, Hitting 12U-18U, Concessions...). parent_id NULL = directly under the board.
    CREATE TABLE IF NOT EXISTS board_nodes (
      id           SERIAL PRIMARY KEY,
      schedule_id  INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      parent_id    INTEGER REFERENCES board_nodes(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      sort         INTEGER NOT NULL DEFAULT 0,
      color        TEXT,
      settings     JSONB NOT NULL DEFAULT '{}',
      visible_from TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON board_nodes(schedule_id, parent_id, sort);

    -- What people claim. node_id NULL = directly under the board (1-level boards).
    CREATE TABLE IF NOT EXISTS board_items (
      id           SERIAL PRIMARY KEY,
      schedule_id  INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      node_id      INTEGER REFERENCES board_nodes(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      starts_at    TIMESTAMPTZ,
      ends_at      TIMESTAMPTZ,
      capacity     INTEGER NOT NULL CHECK (capacity > 0),
      location     TEXT,
      settings     JSONB NOT NULL DEFAULT '{}',
      sort         INTEGER NOT NULL DEFAULT 0,
      unlocked_at  TIMESTAMPTZ,
      canceled_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_items_node ON board_items(schedule_id, node_id, starts_at);

    -- A person's claim on an item
    CREATE TABLE IF NOT EXISTS board_claims (
      id           SERIAL PRIMARY KEY,
      item_id      INTEGER NOT NULL REFERENCES board_items(id) ON DELETE CASCADE,
      athlete_id   INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      booked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status       TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'canceled')),
      counts       BOOLEAN NOT NULL DEFAULT true,       -- false = an open leftover spot (doesn't use up a limit)
      note         TEXT,                                -- answer to the board's question
      attended     BOOLEAN,
      attended_at  TIMESTAMPTZ,
      attended_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      walk_in      BOOLEAN NOT NULL DEFAULT false,
      promoted_at  TIMESTAMPTZ,
      canceled_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_board_claim_active ON board_claims(item_id, athlete_id) WHERE status <> 'canceled';
    CREATE INDEX IF NOT EXISTS idx_claims_athlete ON board_claims(athlete_id, status);
    -- the public link for "Anyone with the link" boards, and a private cancel link per public claim
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS share_code TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_schedules_share ON schedules (share_code) WHERE share_code IS NOT NULL;
    ALTER TABLE board_claims ADD COLUMN IF NOT EXISTS cancel_token TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_claims_cancel ON board_claims (cancel_token) WHERE cancel_token IS NOT NULL;
  `);
}

module.exports = { migrate };
