export async function mig028_user_talents(pool) {
    /**
     * Module Talents (Shop Améliorations)
     *
     * - Talents persistants par utilisateur
     * - Niveau 0 → 3
     * - Achetés via shop_talents
     * - Dépense = SINK (wallet_engine)
     * - Consommation lots faible poids en priorité
     */
    // ──────────────────────────────────────────
    // Table user_talents
    // ──────────────────────────────────────────
    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_talents (
      user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      talent_code TEXT NOT NULL,

      level INTEGER NOT NULL DEFAULT 0
        CHECK (level >= 0),

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      PRIMARY KEY (user_id, talent_code)
    );
  `);
    // ──────────────────────────────────────────
    // Index utile (lookup rapide par talent)
    // ──────────────────────────────────────────
    await pool.query(`
    CREATE INDEX IF NOT EXISTS user_talents_talent_code_idx
      ON user_talents(talent_code);
  `);
    // ──────────────────────────────────────────
    // Trigger updated_at (comme le reste du projet)
    // ──────────────────────────────────────────
    await pool.query(`
    CREATE OR REPLACE FUNCTION user_talents_touch_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
    await pool.query(`
    DROP TRIGGER IF EXISTS trg_user_talents_updated ON user_talents;
  `);
    await pool.query(`
    CREATE TRIGGER trg_user_talents_updated
    BEFORE UPDATE ON user_talents
    FOR EACH ROW
    EXECUTE FUNCTION user_talents_touch_updated_at();
  `);
}
