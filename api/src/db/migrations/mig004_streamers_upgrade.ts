// api/src/db/migrations/mig004_streamers_upgrade.ts
import type { Pool } from "pg";

export async function mig004_streamers_upgrade(pool: Pool) {
  // Streamers upgrades + index
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS user_id INT;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS streamers_user_id_uq ON streamers(user_id);`);

  // Appearance JSONB
  await pool.query(`
    ALTER TABLE streamers
    ADD COLUMN IF NOT EXISTS appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  // thumb/liveStartedAt
  await pool.query(`ALTER TABLE streamers ADD COLUMN IF NOT EXISTS thumb_url TEXT;`);
  await pool.query(`ALTER TABLE streamers ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ;`);

  await pool.query(`
    ALTER TABLE IF EXISTS streamers
    ADD COLUMN IF NOT EXISTS offline_bg_path TEXT;
  `);

  // mods percent
  await pool.query(`
    ALTER TABLE streamers
    ADD COLUMN IF NOT EXISTS mods_percent_bp INT NOT NULL DEFAULT 0;
  `);
}
