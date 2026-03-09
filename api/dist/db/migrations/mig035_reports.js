export async function mig035_reports(pool) {
    // Table reports (signalement / feedback)
    await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      -- auteur
      author_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      author_username TEXT NULL,

      -- contenu
      kind TEXT NOT NULL CHECK (kind IN ('report','feedback')),
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,

      -- cible (optionnelle)
      target_type TEXT NULL,
      target_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      target_username TEXT NULL,
      target_slug TEXT NULL,
      target_url TEXT NULL,

      -- pièces jointes (dataUrl base64 pour l’instant)
      attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

      -- legacy: ton router l’envoie encore
      allow_contact BOOLEAN NOT NULL DEFAULT true,

      -- modération admin
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','closed')),
      admin_notes TEXT NULL,
      handled_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      handled_at TIMESTAMPTZ NULL
    );
  `);
    // Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_status_created_at ON reports (status, created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_kind_created_at ON reports (kind, created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_author_user_id ON reports (author_user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_target_user_id ON reports (target_user_id);`);
    // JSONB helpers (optionnel mais pratique)
    await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reports_attachments_gin'
      ) THEN
        CREATE INDEX idx_reports_attachments_gin ON reports USING GIN (attachments);
      END IF;
    END $$;
  `);
}
