// api/src/db/migrations/mig011_rubis_ledger.ts
import type { Pool } from "pg";

export async function mig011_rubis_ledger(pool: Pool) {
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

  // compat: rubis_tx manquait de streamer_id
  await pool.query(`
    ALTER TABLE rubis_tx
    ADD COLUMN IF NOT EXISTS streamer_id INT NULL REFERENCES streamers(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rubis_tx_streamer_idx
    ON rubis_tx(streamer_id, created_at DESC);
  `);

  // Backfill: si un user a déjà rubis > 0 mais aucun lot, on met tout en "legacy"
  await pool.query(`
    INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
    SELECT u.id, 'legacy', 3500, u.rubis, u.rubis, jsonb_build_object('note','backfill from users.rubis')
    FROM users u
    WHERE u.rubis > 0
      AND NOT EXISTS (SELECT 1 FROM rubis_lots l WHERE l.user_id = u.id);
  `);
}
