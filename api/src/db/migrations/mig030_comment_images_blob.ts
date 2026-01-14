import type { Pool } from "pg";

export async function mig030_comment_images_blob(pool: Pool) {
  await pool.query(`
    ALTER TABLE casino_comment_images
      ADD COLUMN IF NOT EXISTS mime TEXT,
      ADD COLUMN IF NOT EXISTS bytes BYTEA;

    CREATE INDEX IF NOT EXISTS idx_casino_comment_images_url
      ON casino_comment_images(url);
  `);
}
