// api/src/calls/schema.ts
import type { Pool } from "pg";

export async function ensureCallsSchema(pool: Pool) {
  // Queue
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_queue (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL,
      slot_name TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      provider TEXT NULL,
      user_id BIGINT NOT NULL,
      username TEXT NOT NULL,
      pos BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS calls_queue_unique_slot
    ON calls_queue(streamer_id, slot_key);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS calls_queue_by_streamer_pos
    ON calls_queue(streamer_id, pos);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS calls_queue_by_streamer_user
    ON calls_queue(streamer_id, user_id);
  `);

  // Settings
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_settings (
      streamer_id BIGINT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      show_cmd_in_chat BOOLEAN NOT NULL DEFAULT FALSE,   -- si true: on laisse afficher la commande brute (option future)
      show_accept_public BOOLEAN NOT NULL DEFAULT TRUE,  -- message bot quand accepté
      allow_listec BOOLEAN NOT NULL DEFAULT TRUE,
      listec_max INT NOT NULL DEFAULT 10,                -- défaut 10 (Q11)
      per_user_limit INT NOT NULL DEFAULT 2,             -- free=2 (0/ >10 => infini géré logique)
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Bans (future / déjà utile)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_user_bans (
      streamer_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by BIGINT NULL,
      reason TEXT NULL,
      PRIMARY KEY(streamer_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_banned_slots (
      streamer_id BIGINT NOT NULL,
      slot_key TEXT NOT NULL,
      slot_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by BIGINT NULL,
      PRIMARY KEY(streamer_id, slot_key)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_banned_providers (
      streamer_id BIGINT NOT NULL,
      provider TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by BIGINT NULL,
      PRIMARY KEY(streamer_id, provider)
    );
  `);

  // Catalogue slots
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slots_catalog (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      provider TEXT NULL,
      provider_norm TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS slots_catalog_unique_key
    ON slots_catalog(name_key);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS slots_catalog_provider
    ON slots_catalog(provider_norm);
  `);

  // ✅ “miroir” futur avec chat_settings (Q12)
  // On ajoute une colonne sans casser l’existant.
  await pool.query(`
    ALTER TABLE chat_settings
    ADD COLUMN IF NOT EXISTS show_call_commands BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}
