import type { Pool } from "pg";

export async function mig140_automod_service(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automod_service_credentials (
      service_id TEXT PRIMARY KEY,
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      secret_hash CHAR(64) NOT NULL,
      credential_version INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rotated_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    ALTER TABLE automod_service_credentials ADD COLUMN IF NOT EXISTS credential_version INTEGER NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_automod_service_streamer
      ON automod_service_credentials(streamer_id) WHERE active = TRUE;
    CREATE TABLE IF NOT EXISTS automod_session_sync (
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(streamer_id, session_id)
    );
    CREATE TABLE IF NOT EXISTS automod_call_requests (
      service_id TEXT NOT NULL REFERENCES automod_service_credentials(service_id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      call_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(service_id, request_id)
    );
  `);
}
