import type { Pool } from "pg";

export async function mig047_event_viewer_week(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_scores_viewer_week (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      points INT NOT NULL DEFAULT 0,

      minutes_points INT NOT NULL DEFAULT 0,
      chat_points INT NOT NULL DEFAULT 0, -- (pas branché MVP)
      claim_points INT NOT NULL DEFAULT 0,
      wheel_points INT NOT NULL DEFAULT 0,
      pred_join_points INT NOT NULL DEFAULT 0,
      pred_win_points INT NOT NULL DEFAULT 0,
      calls_points INT NOT NULL DEFAULT 0,

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS event_scores_viewer_week_event_points_idx
      ON event_scores_viewer_week(event_id, points DESC, updated_at DESC);
  `);
}
