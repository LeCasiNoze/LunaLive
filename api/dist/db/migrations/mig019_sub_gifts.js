export async function mig019_sub_gifts(pool) {
    await pool.query(`
    -- Pools de subs offerts (pack)
    CREATE TABLE IF NOT EXISTS sub_gift_pools (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      gifter_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total INT NOT NULL,
      remaining INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_sub_gift_pools_streamer
      ON sub_gift_pools(streamer_id);

    CREATE INDEX IF NOT EXISTS idx_sub_gift_pools_streamer_remaining
      ON sub_gift_pools(streamer_id, remaining);

    -- Claims (un viewer claim un sub depuis un pool)
    CREATE TABLE IF NOT EXISTS sub_gift_claims (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      pool_id BIGINT NOT NULL REFERENCES sub_gift_pools(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- MVP: 1 claim max par user/streamer (vu qu’on n’a pas encore de durée)
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_gift_claims_streamer_user
      ON sub_gift_claims(streamer_id, user_id);

    CREATE INDEX IF NOT EXISTS idx_sub_gift_claims_pool
      ON sub_gift_claims(pool_id);
  `);
    // garde-fous optionnels (propre)
    await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sub_gift_pools_total_chk'
      ) THEN
        ALTER TABLE sub_gift_pools
          ADD CONSTRAINT sub_gift_pools_total_chk CHECK (total > 0);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sub_gift_pools_remaining_chk'
      ) THEN
        ALTER TABLE sub_gift_pools
          ADD CONSTRAINT sub_gift_pools_remaining_chk CHECK (remaining >= 0 AND remaining <= total);
      END IF;
    END $$;
  `);
}
