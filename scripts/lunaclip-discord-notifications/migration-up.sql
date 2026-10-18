
CREATE TABLE IF NOT EXISTS lunaclip_discord_config (
 channel_id text PRIMARY KEY, activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO lunaclip_discord_config(channel_id) VALUES ('1544429390723682396') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS lunaclip_discord_outbox (
 id bigserial PRIMARY KEY, platform text NOT NULL CHECK(platform IN ('instagram','youtube')),
 media_id text NOT NULL, channel_id text NOT NULL, payload jsonb NOT NULL,
 published_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','uncertain','sent','blocked')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 send_started_at timestamptz, message_id text, sent_at timestamptz, error_code text,
 UNIQUE(platform,media_id,channel_id)
);
CREATE INDEX IF NOT EXISTS lunaclip_discord_pending ON lunaclip_discord_outbox(next_attempt_at) WHERE state IN ('queued','sending','uncertain');