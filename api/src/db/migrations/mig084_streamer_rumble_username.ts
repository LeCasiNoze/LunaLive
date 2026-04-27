// api/src/db/migrations/mig084_streamer_rumble_username.ts
// Lien Rumble par pseudo (sans api_key). Permet aux streamers Luna dont la chaine
// Rumble n'a pas partagé son api_key d'être quand même affichés en live via scraping
// public de leur page Rumble.
import type { Pool } from "pg";

export async function mig084_streamer_rumble_username(pool: Pool) {
  await pool.query(`
    ALTER TABLE streamers
      ADD COLUMN IF NOT EXISTS rumble_username TEXT;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_streamers_rumble_username
      ON streamers (lower(rumble_username))
      WHERE rumble_username IS NOT NULL;
  `);
}
