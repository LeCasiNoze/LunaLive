// api/src/db/migrations/mig030_comment_images_blob.ts
import type { Pool } from "pg";

export async function mig030_comment_images_blob(pool: Pool) {
  await pool.query(`
    ALTER TABLE casino_comment_images
      ADD COLUMN IF NOT EXISTS mime TEXT,
      ADD COLUMN IF NOT EXISTS bytes BYTEA;

    -- optionnel: index utile si tu fais du cleanup / stats
    CREATE INDEX IF NOT EXISTS idx_casino_comment_images_comment_id
      ON casino_comment_images(comment_id);
  `);
}
