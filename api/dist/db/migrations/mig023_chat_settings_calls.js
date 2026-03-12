export async function mig023_chat_settings_calls(pool) {
    // Ajout non-bloquant : si chat_settings n'existe pas, on ne crash pas.
    await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.chat_settings') IS NOT NULL THEN
        ALTER TABLE chat_settings
        ADD COLUMN IF NOT EXISTS show_call_commands BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;
    END $$;
  `);
}
