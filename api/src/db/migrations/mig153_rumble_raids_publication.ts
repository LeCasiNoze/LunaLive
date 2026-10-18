import type {Pool} from 'pg';
export async function mig153_rumble_raids_publication(pool:Pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automod_control(
      streamer_id BIGINT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      desired_enabled BOOLEAN NOT NULL DEFAULT FALSE,updated_by BIGINT,dashboard_settings JSONB,runtime_status JSONB,
      captcha_active BOOLEAN NOT NULL DEFAULT FALSE,captcha_detected_at TIMESTAMPTZ,
      captcha_notified_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS publication_owner TEXT CHECK(publication_owner IN ('manual','automod'));
    ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS publication_revision BIGINT;
    CREATE TABLE IF NOT EXISTS rumble_raid_requests(
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      request_id UUID NOT NULL, source_video_id TEXT NOT NULL, target_url TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','confirmed','failed','uncertain')),
      error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ,
      PRIMARY KEY(streamer_id,request_id));
    CREATE INDEX IF NOT EXISTS rumble_raid_requests_recent ON rumble_raid_requests(streamer_id,created_at DESC);
  `);
}
