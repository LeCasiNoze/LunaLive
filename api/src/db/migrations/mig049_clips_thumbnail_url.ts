// api/src/db/migrations/mig049_clips_thumbnail_url.ts
// Ajouter thumbnail_url pour stocker les thumbnails persistées

import type { Pool } from "pg";

export async function mig049_clips_thumbnail_url(pool: Pool) {
  await pool.query(`
    -- Ajouter thumbnail_url pour stocker les thumbnails persistées
    ALTER TABLE bot_clips 
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

    -- Index pour performances (optionnel)
    CREATE INDEX IF NOT EXISTS idx_bot_clips_thumbnail_url 
    ON bot_clips(thumbnail_url) 
    WHERE thumbnail_url IS NOT NULL;
  `);
}
