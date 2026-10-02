import type { Pool } from "pg";
export async function mig142_automod_points(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automod_points_accounts (
      streamer_id BIGINT NOT NULL REFERENCES streamers(id), rumble_user_id TEXT NOT NULL,
      username TEXT NOT NULL, balance BIGINT NOT NULL DEFAULT 0 CHECK(balance>=0),
      reserved BIGINT NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=balance),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(streamer_id,rumble_user_id)
    );
    CREATE TABLE IF NOT EXISTS automod_points_ledger (
      id BIGSERIAL PRIMARY KEY, streamer_id BIGINT NOT NULL, rumble_user_id TEXT NOT NULL,
      event_key TEXT NOT NULL, delta BIGINT NOT NULL, reserved_delta BIGINT NOT NULL DEFAULT 0,
      reason TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY(streamer_id,rumble_user_id) REFERENCES automod_points_accounts(streamer_id,rumble_user_id),
      UNIQUE(streamer_id,event_key)
    );
    CREATE INDEX IF NOT EXISTS automod_points_user_history ON automod_points_ledger(streamer_id,rumble_user_id,id DESC);
    CREATE TABLE IF NOT EXISTS automod_shop_orders (
      id UUID PRIMARY KEY, streamer_id BIGINT NOT NULL REFERENCES streamers(id), rumble_user_id TEXT NOT NULL,
      username TEXT NOT NULL, request_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('buy','stake','duration','globalstake')),
      slot_key TEXT NOT NULL, slot_name TEXT NOT NULL, provider TEXT NOT NULL, tier INT,
      offer_id TEXT, offers JSONB, selected_offer JSONB, call_id BIGINT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','opening','offered','chosen','purchase-sent','bonus','done','expired','refunded','uncertain')),
      reserved_points BIGINT NOT NULL DEFAULT 0 CHECK(reserved_points>=0), spent_points BIGINT NOT NULL DEFAULT 0 CHECK(spent_points>=0),
      result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ, purchase_sent_at TIMESTAMPTZ, UNIQUE(streamer_id,request_key)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS automod_shop_one_buy_per_user ON automod_shop_orders(streamer_id,rumble_user_id)
      WHERE kind='buy' AND status IN ('pending','opening','offered','chosen','purchase-sent','bonus','uncertain');
    CREATE INDEX IF NOT EXISTS automod_shop_pending_order ON automod_shop_orders(streamer_id,created_at)
      WHERE status NOT IN ('done','expired','refunded');
    CREATE UNIQUE INDEX IF NOT EXISTS automod_shop_one_global_stake ON automod_shop_orders(streamer_id)
      WHERE kind='globalstake' AND status IN ('pending','opening','done');
    CREATE TABLE IF NOT EXISTS automod_bonus_catalog (
      streamer_id BIGINT NOT NULL REFERENCES streamers(id), slot_key TEXT NOT NULL, slot_name TEXT NOT NULL,
      provider TEXT NOT NULL, base_stake_cents INT NOT NULL CHECK(base_stake_cents>0), offers JSONB NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(streamer_id,slot_key,base_stake_cents)
    );
    CREATE TABLE IF NOT EXISTS automod_points_events (
      streamer_id BIGINT NOT NULL REFERENCES streamers(id), event_key TEXT NOT NULL, kind TEXT NOT NULL,
      payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(streamer_id,event_key)
    );
    CREATE TABLE IF NOT EXISTS automod_points_rains (
      id UUID PRIMARY KEY, streamer_id BIGINT NOT NULL REFERENCES streamers(id), points INT NOT NULL CHECK(points>0),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), closes_at TIMESTAMPTZ NOT NULL,
      announcement_video TEXT, announced_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS automod_points_rain_recent ON automod_points_rains(streamer_id,opened_at DESC);
  `);
}
