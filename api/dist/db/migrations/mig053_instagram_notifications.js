export async function mig053_instagram_notifications(pool) {
    console.log("[migration] Creating instagram_notifications table...");
    await pool.query(`
    CREATE TABLE IF NOT EXISTS instagram_notifications (
      id SERIAL PRIMARY KEY,
      video_id VARCHAR(50) NOT NULL UNIQUE,
      title TEXT,
      url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      notified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
    // Index pour optimisation
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_instagram_notifications_video_id ON instagram_notifications(video_id)
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_instagram_notifications_created_at ON instagram_notifications(created_at)
  `);
    // Fonction de nettoyage (similaire à YouTube)
    await pool.query(`
    CREATE OR REPLACE FUNCTION cleanup_instagram_notifications()
    RETURNS void AS $$
    BEGIN
      DELETE FROM instagram_notifications 
      WHERE id < (
        SELECT COALESCE(MAX(id), 0) - 1000 
        FROM instagram_notifications
      );
    END;
    $$ LANGUAGE plpgsql;
  `);
    console.log("[migration] instagram_notifications table created successfully");
}
