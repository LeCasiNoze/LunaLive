// api/src/db/migrations/mig091_rumble_send_queue.ts
// Queue de messages bot à envoyer dans le chat Rumble.
// Render écrit dedans (via mirror), le relay local pioche et exécute via cycletls
// depuis l'IP résidentielle (cookies cf_clearance valides).
import type { Pool } from "pg";

export async function mig091_rumble_send_queue(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_send_queue (
      id              BIGSERIAL PRIMARY KEY,
      video_id_numeric TEXT NOT NULL,
      text            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
      attempts        INT NOT NULL DEFAULT 0,
      last_error      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempted_at    TIMESTAMPTZ,
      completed_at    TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_send_queue_pending
      ON rumble_send_queue (created_at)
      WHERE status = 'pending';
  `);
}
