export async function mig087_tiktok_outreach(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_influencers (
      id BIGSERIAL PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      profile_url TEXT NOT NULL,
      display_name TEXT NULL,
      bio TEXT NULL,
      email TEXT NULL,
      follower_count BIGINT NULL,
      following_count BIGINT NULL,
      heart_count BIGINT NULL,
      video_count BIGINT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      country TEXT NULL,
      avatar_url TEXT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT NULL,
      last_email_sent_at TIMESTAMPTZ NULL,
      reply_received_at TIMESTAMPTZ NULL,
      reply_excerpt TEXT NULL,
      raw JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tiktok_influencers_status_check CHECK (
        status IN ('new', 'no_email', 'queued', 'contacted', 'replied', 'interested', 'declined', 'blacklisted')
      )
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_influencers_status
      ON tiktok_influencers (status);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_influencers_created
      ON tiktok_influencers (created_at DESC);
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_outreach_messages (
      id BIGSERIAL PRIMARY KEY,
      influencer_id BIGINT NOT NULL REFERENCES tiktok_influencers(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      subject TEXT NULL,
      body TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      success BOOLEAN NOT NULL DEFAULT TRUE,
      error_message TEXT NULL,
      CONSTRAINT tiktok_outreach_messages_direction_check CHECK (direction IN ('out', 'in'))
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_outreach_messages_influencer
      ON tiktok_outreach_messages (influencer_id, sent_at DESC);
  `);
}
