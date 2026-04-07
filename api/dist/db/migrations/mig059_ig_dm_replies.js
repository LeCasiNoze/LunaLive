// api/src/db/migrations/mig059_ig_dm_replies.ts
// Table anti-doublon pour les DMs Instagram envoyés via webhook.
// Une entrée = un sender_id a déjà reçu le DM pour un streamer donné.
export async function mig059_ig_dm_replies(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS ig_dm_replies (
      id            SERIAL PRIMARY KEY,
      sender_id     TEXT NOT NULL,
      streamer_slug VARCHAR(100) NOT NULL,
      sent_at       TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (sender_id, streamer_slug)
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ig_dm_replies_sender
      ON ig_dm_replies (sender_id, streamer_slug);
  `);
}
