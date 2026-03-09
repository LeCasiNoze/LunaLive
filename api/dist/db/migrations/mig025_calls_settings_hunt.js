export async function mig025_calls_settings_hunt(pool) {
    await pool.query(`
    DO $$
    BEGIN
      -- calls_settings: ajout option sync_hunt
      IF to_regclass('public.calls_settings') IS NOT NULL THEN
        BEGIN
          ALTER TABLE calls_settings ADD COLUMN IF NOT EXISTS sync_hunt BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION WHEN duplicate_column THEN
          -- ignore
        END;
      END IF;
    END $$;
  `);
}
