// api/src/db/migrations/mig048_lunaclip_admin_ipc.ts
import type { Pool } from "pg";

export async function mig048_lunaclip_admin_ipc(pool: Pool) {
  await pool.query(`
    -- Snapshot global (1 ligne)
    CREATE TABLE IF NOT EXISTS lunaclip_admin_state (
      id         INT PRIMARY KEY DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload    JSONB NOT NULL
    );

    -- Logs persistés (ring buffer côté bot, mais stock en DB)
    CREATE TABLE IF NOT EXISTS lunaclip_admin_logs (
      id         BIGSERIAL PRIMARY KEY,
      ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      slug       TEXT NOT NULL,
      source     TEXT NOT NULL,
      msg        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lunaclip_admin_logs_ts_idx
      ON lunaclip_admin_logs(ts DESC);

    -- Commandes API -> bot
    CREATE TABLE IF NOT EXISTS lunaclip_admin_commands (
      id          BIGSERIAL PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      action      TEXT NOT NULL,
      payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
      status      TEXT NOT NULL DEFAULT 'pending', -- pending | done | error
      result      JSONB,
      handled_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS lunaclip_admin_commands_pending_idx
      ON lunaclip_admin_commands(status, created_at);
  `);
}