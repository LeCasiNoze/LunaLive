import type { Pool } from "pg";

export async function mig057_ig_comment_replies(pool: Pool): Promise<void> {
  console.log("[migration] Creating ig_comment_replies table...");
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ig_comment_replies (
      id SERIAL PRIMARY KEY,
      comment_id VARCHAR(100) NOT NULL UNIQUE,
      media_id VARCHAR(50) NOT NULL,
      username VARCHAR(100) NOT NULL,
      comment_text TEXT,
      replied_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      dm_sent BOOLEAN DEFAULT FALSE,
      dm_sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Index pour optimisation
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ig_comment_replies_comment_id ON ig_comment_replies(comment_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ig_comment_replies_media_id ON ig_comment_replies(media_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ig_comment_replies_created_at ON ig_comment_replies(created_at)
  `);

  console.log("[migration] ig_comment_replies table created successfully");
}
