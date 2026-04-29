export async function mig090_calls_drop_fk(pool) {
    // Drop la FK calls_actions → users (le 0 est un sentinel pour viewer external)
    const r = await pool.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'calls_actions'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%REFERENCES users(id)%'
  `);
    for (const row of r.rows) {
        await pool.query(`ALTER TABLE calls_actions DROP CONSTRAINT IF EXISTS "${row.conname}"`);
    }
}
