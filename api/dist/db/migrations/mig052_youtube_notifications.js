export async function mig052_youtube_notifications(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_notifications (
        id SERIAL PRIMARY KEY,
        video_id VARCHAR(50) NOT NULL UNIQUE,
        title TEXT,
        url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        notified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_youtube_notifications_video_id 
    ON youtube_notifications(video_id)
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_youtube_notifications_created_at 
    ON youtube_notifications(created_at)
  `);
    await pool.query(`
    CREATE OR REPLACE FUNCTION cleanup_youtube_notifications()
    RETURNS void AS $$
    BEGIN
        DELETE FROM youtube_notifications 
        WHERE id < (
            SELECT COALESCE(MAX(id), 0) - 1000 
            FROM youtube_notifications
        );
    END;
    $$ LANGUAGE plpgsql
  `);
    await pool.query(`
    COMMENT ON TABLE youtube_notifications IS 
    'Stocke les vidéos YouTube déjà notifiées pour éviter les doublons'
  `);
    await pool.query(`
    COMMENT ON COLUMN youtube_notifications.video_id IS 
    'ID unique de la vidéo YouTube'
  `);
    await pool.query(`
    COMMENT ON COLUMN youtube_notifications.title IS 
    'Titre de la vidéo (optionnel)'
  `);
    await pool.query(`
    COMMENT ON COLUMN youtube_notifications.url IS 
    'URL complète de la vidéo (optionnel)'
  `);
    await pool.query(`
    COMMENT ON COLUMN youtube_notifications.created_at IS 
    'Date de création de l''entrée'
  `);
    await pool.query(`
    COMMENT ON COLUMN youtube_notifications.notified_at IS 
    'Date de notification Discord'
  `);
    console.log("[migration] mig052_youtube_notifications applied");
}
