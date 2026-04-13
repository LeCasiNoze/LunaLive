export async function mig070_agency_access_code(pool) {
    await pool.query(`
    ALTER TABLE agency_streamers
    ADD COLUMN IF NOT EXISTS access_code_plain TEXT NULL;
  `);
}
