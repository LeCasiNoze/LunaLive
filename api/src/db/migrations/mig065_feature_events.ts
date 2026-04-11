import type { Pool } from "pg";

export async function mig065_feature_events(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_feature_events (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      count INT NOT NULL DEFAULT 1,
      meta JSONB NULL,
      first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, session_id, kind, subject)
    );

    CREATE INDEX IF NOT EXISTS user_feature_events_user_kind_idx
      ON user_feature_events (user_id, kind);

    CREATE INDEX IF NOT EXISTS user_feature_events_user_session_idx
      ON user_feature_events (user_id, session_id, kind);
  `);
}
