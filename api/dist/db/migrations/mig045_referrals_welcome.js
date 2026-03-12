export async function mig045_referrals_welcome(pool) {
    await pool.query(`
    -- 1) Lock du referral du viewer (table utilisée par /me/referral/set et welcome)
    CREATE TABLE IF NOT EXISTS user_referrals (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS user_referrals_streamer_idx
      ON user_referrals(streamer_id);

    -- 2) Welcome reward lock (anti double claim)
    CREATE TABLE IF NOT EXISTS welcome_rewards (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      viewer_tx_id BIGINT NULL, -- ton earnRubisTx ne renvoie pas txId => reste NULL
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 3) Promo perks (7 jours "sub" light)
    CREATE TABLE IF NOT EXISTS user_promo_perks (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, code)
    );

    CREATE INDEX IF NOT EXISTS user_promo_perks_ends_idx
      ON user_promo_perks(ends_at DESC);

    -- 4) Historique payouts streamer (cap hebdo + anti double payout par referred_user_id)
    CREATE TABLE IF NOT EXISTS referral_streamer_payouts (
      referred_user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      amount INT NOT NULL,
      tx_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS referral_streamer_payouts_streamer_week_idx
      ON referral_streamer_payouts(streamer_id, week_start);

    -- 5) calls_actions (car ton welcome/state & claim COUNT dessus)
    -- Si tu n’as pas déjà une table équivalente.
    CREATE TABLE IF NOT EXISTS calls_actions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      streamer_id BIGINT NULL REFERENCES streamers(id) ON DELETE SET NULL,
      action TEXT NOT NULL DEFAULT 'call',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS calls_actions_user_idx
      ON calls_actions(user_id, created_at DESC);
  `);
}
