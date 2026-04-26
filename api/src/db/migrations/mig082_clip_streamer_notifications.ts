// api/src/db/migrations/mig082_clip_streamer_notifications.ts
import type { Pool } from "pg";

export async function mig082_clip_streamer_notifications(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clip_streamer_notifications (
      streamer_id   BIGINT PRIMARY KEY,
      first_clip_id BIGINT NOT NULL,
      email_sent    BOOLEAN NOT NULL DEFAULT false,
      discord_sent  BOOLEAN NOT NULL DEFAULT false,
      notified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
