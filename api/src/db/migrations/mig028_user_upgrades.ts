// api/src/db/migrations/mig0xx_user_upgrades.ts
import type { Pool } from "pg";

export async function up(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_upgrades (
      user_id INT NOT NULL,
      upgrade_key VARCHAR(64) NOT NULL,
      level INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, upgrade_key)
    );
  `);
}

export async function down(pool: Pool) {
  await pool.query(`DROP TABLE IF EXISTS user_upgrades;`);
}
