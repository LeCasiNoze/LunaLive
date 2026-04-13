export async function mig071_agency_public_note_and_negative_rs(pool) {
    await pool.query(`
    ALTER TABLE agency_streamers
    ADD COLUMN IF NOT EXISTS public_note TEXT NULL;
  `);
    await pool.query(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT con.conname
      INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel
        ON rel.oid = con.conrelid
      JOIN pg_namespace nsp
        ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'agency_streamer_assignment_stats'
        AND pg_get_constraintdef(con.oid) ILIKE '%rs_value%'
        AND con.contype = 'c'
      LIMIT 1;

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE agency_streamer_assignment_stats DROP CONSTRAINT %I', constraint_name);
      END IF;
    END $$;
  `);
    await pool.query(`
    ALTER TABLE agency_streamer_assignment_stats
    ADD CONSTRAINT agency_streamer_assignment_stats_rs_value_range_check
    CHECK (rs_value IS NULL OR rs_value >= -1000000::numeric);
  `).catch(() => undefined);
}
