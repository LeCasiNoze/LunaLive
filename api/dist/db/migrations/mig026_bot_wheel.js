export async function mig026_bot_wheel(pool) {
    // Tables dédiées au module "bot_wheel" (tirage stream)
    // ⚠️ Ne pas confondre avec la roue quotidienne (mig013_daily_caps_wheels)
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_wheel_cfg (
      streamer_id BIGINT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      enroll_open BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_wheel_entries (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      username_lc TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (streamer_id, username_lc)
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS bot_wheel_entries_streamer_id_idx
      ON bot_wheel_entries(streamer_id);
  `);
    await pool.query(`
    ALTER TABLE bot_wheel_entries
      ADD COLUMN IF NOT EXISTS user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS bot_wheel_entries_unique_user
      ON bot_wheel_entries(streamer_id, user_id)
      WHERE user_id IS NOT NULL;
  `);
}
