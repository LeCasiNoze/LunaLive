// api/src/db.ts
import { Pool, type QueryResult } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render Postgres est quasi toujours en TLS en prod
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

// Petit alias pratique (si tu veux faire: db.query(...) ailleurs)
export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

export async function migrate() {
  // 1) Tables de base (version minimale, safe si déjà existant)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      rubis INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS streamer_requests (
      id SERIAL PRIMARY KEY,
      user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS streamers (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      user_id INT UNIQUE NULL REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      viewers INT NOT NULL DEFAULT 0,
      is_live BOOLEAN NOT NULL DEFAULT FALSE,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      suspended_until TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pending_registrations (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_ip INET NULL
    );

    CREATE TABLE IF NOT EXISTS provider_accounts (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'dlive',
      channel_slug TEXT NOT NULL,          -- displayname (URL dlive.tv/{displayname})
      channel_username TEXT NULL,          -- username (HLS)
      rtmp_url TEXT NOT NULL,
      stream_key TEXT NOT NULL,
      assigned_to_streamer_id INT NULL REFERENCES streamers(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ NULL,
      released_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 1bis) CHAT TABLES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      deleted_by INT NULL REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chat_bans (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NULL,
      PRIMARY KEY (streamer_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS chat_timeouts (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS streamer_mods (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      removed_at TIMESTAMPTZ NULL,
      removed_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (streamer_id, user_id)
    );
  `);

  // 2) Upgrade users (ajout de colonnes si elles n'existent pas)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_ip INET NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip INET NULL;`);

  // provider_accounts upgrade (si existait avant)
  await pool.query(`ALTER TABLE provider_accounts ADD COLUMN IF NOT EXISTS channel_username TEXT;`);

  // On garde username/password_hash non null pour la logique auth
  await pool.query(`ALTER TABLE users ALTER COLUMN username SET NOT NULL;`);
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;`);

  // 3) Backfill pour les users déjà existants
  await pool.query(`
    UPDATE users
    SET email = COALESCE(email, ('legacy+' || id::text || '@lunalive.invalid')),
        email_verified = TRUE
    WHERE email IS NULL OR email = '';
  `);

  // 4) Index uniques case-insensitive
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (lower(username));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS pending_username_lower_uq ON pending_registrations (lower(username));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS pending_email_lower_uq ON pending_registrations (lower(email));`);

  // 5) Streamers upgrades + index
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS user_id INT;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS streamers_user_id_uq ON streamers(user_id);`);

  // ✅ Appearance JSONB
  await pool.query(`
    ALTER TABLE streamers
    ADD COLUMN IF NOT EXISTS appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  // ✅ thumb/liveStartedAt (tu les avais en top-level await)
  await pool.query(`ALTER TABLE streamers ADD COLUMN IF NOT EXISTS thumb_url TEXT;`);
  await pool.query(`ALTER TABLE streamers ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ;`);

  await pool.query(`
    ALTER TABLE IF EXISTS streamers
    ADD COLUMN IF NOT EXISTS offline_bg_path TEXT;
  `);

  // 6) Provider accounts indexes
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS provider_accounts_provider_slug_uq
    ON provider_accounts (provider, lower(channel_slug));
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS provider_accounts_assigned_idx
    ON provider_accounts (assigned_to_streamer_id);
  `);

  // 7) Chat indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_streamer_created_idx
    ON chat_messages(streamer_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_streamer_user_created_idx
    ON chat_messages(streamer_id, user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_timeouts_streamer_user_expires_idx
    ON chat_timeouts(streamer_id, user_id, expires_at DESC);
  `);

  // 8) streamer_mods indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS streamer_mods_streamer_active_idx
    ON streamer_mods(streamer_id)
    WHERE removed_at IS NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS streamer_mods_streamer_removed_idx
    ON streamer_mods(streamer_id, removed_at DESC)
    WHERE removed_at IS NOT NULL;
  `);

  // 9) LIVE / STATS (sessions + samples + minutes)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_sessions (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_open_uq
    ON live_sessions(streamer_id)
    WHERE ended_at IS NULL;

    CREATE INDEX IF NOT EXISTS live_sessions_streamer_started_idx
    ON live_sessions(streamer_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS viewer_sessions (
      id BIGSERIAL PRIMARY KEY,
      live_session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      viewer_key TEXT NOT NULL,
      user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      anon_id TEXT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ NULL,
      user_agent TEXT NULL,
      ip INET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS viewer_sessions_live_viewer_uq
    ON viewer_sessions(live_session_id, viewer_key);

    CREATE INDEX IF NOT EXISTS viewer_sessions_streamer_last_idx
    ON viewer_sessions(streamer_id, last_heartbeat_at DESC);

    CREATE INDEX IF NOT EXISTS viewer_sessions_live_active_idx
    ON viewer_sessions(live_session_id)
    WHERE ended_at IS NULL;

    CREATE TABLE IF NOT EXISTS stream_viewer_samples (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      live_session_id BIGINT NULL REFERENCES live_sessions(id) ON DELETE SET NULL,
      bucket_ts TIMESTAMPTZ NOT NULL,
      viewers INT NOT NULL,
      PRIMARY KEY (streamer_id, bucket_ts)
    );

    CREATE INDEX IF NOT EXISTS stream_viewer_samples_bucket_idx
    ON stream_viewer_samples(bucket_ts DESC);

    CREATE TABLE IF NOT EXISTS stream_viewer_minutes (
      live_session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      bucket_ts TIMESTAMPTZ NOT NULL,
      viewer_key TEXT NOT NULL,
      user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      anon_id TEXT NULL,
      PRIMARY KEY (live_session_id, bucket_ts, viewer_key)
    );

    CREATE INDEX IF NOT EXISTS stream_viewer_minutes_streamer_bucket_idx
    ON stream_viewer_minutes(streamer_id, bucket_ts DESC);

    CREATE INDEX IF NOT EXISTS stream_viewer_minutes_streamer_viewer_idx
    ON stream_viewer_minutes(streamer_id, viewer_key);

    CREATE INDEX IF NOT EXISTS stream_viewer_minutes_live_bucket_idx
    ON stream_viewer_minutes(live_session_id, bucket_ts DESC);
  `);

  // ──────────────────────────────────────────
  // FOLLOWS
  // ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_follows (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (streamer_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS streamer_follows_streamer_idx
      ON streamer_follows(streamer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS streamer_follows_user_idx
      ON streamer_follows(user_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE streamer_follows
    ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  // ──────────────────────────────────────────
  // PUSH NOTIFS
  // ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(endpoint)
    );

    CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
      ON push_subscriptions(user_id, updated_at DESC);
  `);

  // ──────────────────────────────────────────
  // 💎 ECONOMY / RUBIS LEDGER (V1)
  // ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_lots (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,
      amount_remaining BIGINT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS wallet_lots_user_idx
      ON wallet_lots(user_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS wallet_lots_user_origin_idx
      ON wallet_lots(user_id, origin);

    CREATE TABLE IF NOT EXISTS wallet_tx (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,           -- earn|spend|adjust
      origin TEXT NULL,             -- pour earn/adjust
      spend_kind TEXT NULL,         -- support|sink
      spend_type TEXT NULL,         -- sub|tip|cosmetic|...
      streamer_id INT NULL REFERENCES streamers(id) ON DELETE SET NULL,
      amount BIGINT NOT NULL,
      breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      support_rubis BIGINT NULL,
      streamer_earn_rubis BIGINT NULL,
      platform_cut_rubis BIGINT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS wallet_tx_user_idx
      ON wallet_tx(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS wallet_tx_streamer_idx
      ON wallet_tx(streamer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS streamer_earnings_ledger (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      payer_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      spend_type TEXT NOT NULL, -- sub|tip|gift_sub
      spent_rubis BIGINT NOT NULL,
      support_rubis BIGINT NOT NULL,
      streamer_earn_rubis BIGINT NOT NULL,
      platform_cut_rubis BIGINT NOT NULL,
      breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS streamer_earnings_streamer_idx
      ON streamer_earnings_ledger(streamer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS streamer_wallets (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      available_rubis BIGINT NOT NULL DEFAULT 0,
      lifetime_rubis BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cashout_requests (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      amount_rubis BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|paid|rejected
      note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS cashout_requests_streamer_idx
      ON cashout_requests(streamer_id, created_at DESC);

    -- subs (MVP)
    CREATE TABLE IF NOT EXISTS streamer_subscriptions (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (streamer_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS streamer_subscriptions_user_idx
      ON streamer_subscriptions(user_id, expires_at DESC);
  `);
  
  // ✅ lien vers le ledger rubis_tx pour breakdown cashout
  await pool.query(`
    ALTER TABLE cashout_requests
    ADD COLUMN IF NOT EXISTS tx_id BIGINT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS cashout_requests_tx_idx
    ON cashout_requests(tx_id);
  `);

    // ──────────────────────────────────────────────────────────
  // RUBIS LEDGER (lots + transactions + breakdown)
  // ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rubis_lots (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,
      weight_bp INT NOT NULL,              -- ex: 10000 = 1.00, 3500 = 0.35
      amount_total INT NOT NULL,
      amount_remaining INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS rubis_lots_user_idx
      ON rubis_lots(user_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS rubis_lots_user_weight_idx
      ON rubis_lots(user_id, weight_bp);

    CREATE TABLE IF NOT EXISTS rubis_tx (
      id BIGSERIAL PRIMARY KEY,

      kind TEXT NOT NULL,                  -- mint | support | sink | transfer | adjust
      purpose TEXT NOT NULL,               -- sub | tip | gift | skin_achat | prediction | ...
      status TEXT NOT NULL DEFAULT 'succeeded', -- pending | succeeded | failed

      from_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      to_user_id   INT NULL REFERENCES users(id) ON DELETE SET NULL,

      amount INT NOT NULL,                 -- montant visible débité du user (ex 2500)
      support_value INT NOT NULL DEFAULT 0, -- valeur calculée via weights (pour support)
      streamer_amount INT NOT NULL DEFAULT 0,
      platform_amount INT NOT NULL DEFAULT 0,
      burn_amount INT NOT NULL DEFAULT 0,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      error TEXT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS rubis_tx_from_idx
      ON rubis_tx(from_user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS rubis_tx_to_idx
      ON rubis_tx(to_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS rubis_tx_lots (
      tx_id BIGINT NOT NULL REFERENCES rubis_tx(id) ON DELETE CASCADE,
      lot_id BIGINT NOT NULL REFERENCES rubis_lots(id) ON DELETE RESTRICT,
      origin TEXT NOT NULL,
      weight_bp INT NOT NULL,
      amount_used INT NOT NULL,
      PRIMARY KEY (tx_id, lot_id)
    );

    CREATE TABLE IF NOT EXISTS rubis_tx_entries (
      id BIGSERIAL PRIMARY KEY,
      tx_id BIGINT NOT NULL REFERENCES rubis_tx(id) ON DELETE CASCADE,

      entity TEXT NOT NULL,                -- user | platform_fee | platform_burn
      user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      delta INT NOT NULL,                  -- + / - (en rubis visibles)

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS rubis_tx_entries_tx_idx
      ON rubis_tx_entries(tx_id);
  `);

  // Backfill: si un user a déjà rubis > 0 mais aucun lot, on met tout en "legacy"
  await pool.query(`
    INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
    SELECT u.id, 'legacy', 3500, u.rubis, u.rubis, jsonb_build_object('note','backfill from users.rubis')
    FROM users u
    WHERE u.rubis > 0
      AND NOT EXISTS (SELECT 1 FROM rubis_lots l WHERE l.user_id = u.id);
  `);

  // Backfill: si des users ont déjà rubis>0, on les met en lot "legacy"
  await pool.query(`
    INSERT INTO wallet_lots (user_id, origin, amount_remaining, meta)
    SELECT u.id, 'legacy', u.rubis, jsonb_build_object('note','backfill from users.rubis')
    FROM users u
    WHERE u.rubis > 0
      AND NOT EXISTS (SELECT 1 FROM wallet_lots wl WHERE wl.user_id = u.id)
  `);
  
    await pool.query(`
    ALTER TABLE streamers
    ADD COLUMN IF NOT EXISTS mods_percent_bp INT NOT NULL DEFAULT 0;
  `);

}

export async function seedIfEmpty() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM streamers;`);
  if ((rows[0]?.n ?? 0) > 0) return;

  await pool.query(`
    INSERT INTO streamers (slug, display_name, title, viewers, is_live) VALUES
    ('wayzebi','Wayzebi','Slots session — bonus hunt',842,true),
    ('sinisterzs','Sinisterzs','Morning grind — chill',510,true),
    ('nico-carasso','Nico Carasso','Big balance / risky spins',321,true),
    ('teoman','Teoman','Community picks — let’s go',205,true),
    ('bryan-cars','BryanCars','Late session — last shots',96,true);
  `);
}
