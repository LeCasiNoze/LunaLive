export async function mig069_agency_stat_fields(pool) {
    await pool.query(`
    ALTER TABLE agency_streamer_assignment_stats
    ADD COLUMN IF NOT EXISTS deposit_count INT NULL CHECK (deposit_count IS NULL OR deposit_count >= 0);
  `);
    await pool.query(`
    ALTER TABLE agency_streamer_assignment_stats
    ADD COLUMN IF NOT EXISTS cpa_value NUMERIC(12, 2) NULL CHECK (cpa_value IS NULL OR cpa_value >= 0);
  `);
    await pool.query(`
    ALTER TABLE agency_streamer_assignment_stats
    ADD COLUMN IF NOT EXISTS rs_value NUMERIC(12, 2) NULL CHECK (rs_value IS NULL OR rs_value >= 0);
  `);
    await pool.query(`
    ALTER TABLE agency_streamer_assignment_stats
    ADD COLUMN IF NOT EXISTS show_cpa_to_streamer BOOLEAN NOT NULL DEFAULT TRUE;
  `);
    await pool.query(`
    ALTER TABLE agency_streamer_assignment_stats
    ADD COLUMN IF NOT EXISTS show_rs_to_streamer BOOLEAN NOT NULL DEFAULT TRUE;
  `);
    await pool.query(`
    UPDATE agency_streamer_assignment_stats
    SET deposit_count = COALESCE(deposit_count, ftd)
    WHERE deposit_count IS NULL
      AND ftd IS NOT NULL;
  `);
    await pool.query(`
    UPDATE agency_streamer_assignment_stats st
    SET
      cpa_value = COALESCE(
        st.cpa_value,
        ROUND(GREATEST(COALESCE(st.deposit_count, st.ftd, 0) * GREATEST(COALESCE(d.cpa_amount, 0) - COALESCE(d.cpa_agency_cut, 0), 0), 0)::numeric, 2)
      ),
      rs_value = COALESCE(
        st.rs_value,
        ROUND(GREATEST(COALESCE(st.total_deposits, 0) * GREATEST(COALESCE(d.ers_percent, 0) - COALESCE(d.ers_agency_percent, 0), 0) / 100, 0)::numeric, 2)
      )
    FROM agency_streamer_assignments asa
    JOIN agency_deals d
      ON d.id = asa.deal_id
    WHERE asa.id = st.assignment_id
      AND (st.cpa_value IS NULL OR st.rs_value IS NULL);
  `);
}
