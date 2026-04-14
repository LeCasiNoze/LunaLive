import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://lunalive_db_user:gSIR5ZD1Bf3dcKlYYmVkobKYjkjYxY4q@dpg-d505pcu3jp1c73f1t7e0-a/lunalive_db' });
const [s, a, d] = await Promise.all([
  pool.query("SELECT id, slug, display_name FROM streamers WHERE slug ILIKE '%fabio%' OR display_name ILIKE '%fabio%' LIMIT 5"),
  pool.query("SELECT id, display_name, deal_id, linked_streamer_id FROM agency_streamers LIMIT 10"),
  pool.query("SELECT id, name, cpa_amount FROM agency_deals LIMIT 10"),
]);
console.log('STREAMERS:', JSON.stringify(s.rows, null, 2));
console.log('AGENCY:', JSON.stringify(a.rows, null, 2));
console.log('DEALS:', JSON.stringify(d.rows, null, 2));
await pool.end();
