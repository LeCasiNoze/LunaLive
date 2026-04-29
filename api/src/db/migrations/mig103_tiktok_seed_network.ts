import type { Pool } from "pg";

export async function mig103_tiktok_seed_network(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_seed_accounts (
      id BIGSERIAL PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NULL,
      avatar_url TEXT NULL,
      notes TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_network_fetch_at TIMESTAMPTZ NULL,
      last_network_status TEXT NULL,
      last_network_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Lien faible : "candidate_handle" est mentionné par/lié à un seed
  // signal_type: 'comment' (a commenté une vidéo du seed)
  //            | 'mention'  (mentionné dans la description/tag d'une vidéo du seed)
  //            | 'duet'     (duet/stitch d'une vidéo du seed)
  // count: nombre d'apparitions agrégées (incrémenté à chaque refresh)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_network_links (
      id BIGSERIAL PRIMARY KEY,
      seed_id BIGINT NOT NULL REFERENCES tiktok_seed_accounts(id) ON DELETE CASCADE,
      candidate_handle TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tiktok_network_links_signal_check CHECK (
        signal_type IN ('comment','mention','duet')
      ),
      CONSTRAINT tiktok_network_links_unique UNIQUE (seed_id, candidate_handle, signal_type)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_network_links_handle
      ON tiktok_network_links (candidate_handle);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_network_links_seed
      ON tiktok_network_links (seed_id);
  `);
}
