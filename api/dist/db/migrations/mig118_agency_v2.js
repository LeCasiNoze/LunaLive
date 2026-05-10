/**
 * Agency v2 — modèle snapshot.
 *
 * - Ajoute agency_stat_snapshots : valeurs cumulées datées saisies par l'agence
 *   (signups, ftd_count, ftd_sum_dep, total_deposits, rs_amount), plus un bonus
 *   signé (positif = agence prend, négatif = agence donne) avec son split CPA/RS.
 * - Ajoute tiktok_influencer_id sur agency_streamers (lien depuis l'outreach TikTok).
 *
 * Les anciennes tables (agency_streamer_assignment_stats) restent en place pour
 * compatibilité descendante mais ne sont plus alimentées par la nouvelle UI.
 */
export async function mig118_agency_v2(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_stat_snapshots (
      id BIGSERIAL PRIMARY KEY,
      assignment_id BIGINT NOT NULL REFERENCES agency_streamer_assignments(id) ON DELETE CASCADE,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signups INT NULL CHECK (signups IS NULL OR signups >= 0),
      ftd_count INT NULL CHECK (ftd_count IS NULL OR ftd_count >= 0),
      ftd_sum_dep NUMERIC(12, 2) NULL CHECK (ftd_sum_dep IS NULL OR ftd_sum_dep >= 0),
      total_deposits NUMERIC(12, 2) NULL CHECK (total_deposits IS NULL OR total_deposits >= 0),
      rs_amount NUMERIC(12, 2) NULL CHECK (rs_amount IS NULL OR rs_amount >= 0),
      bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      bonus_cpa_split NUMERIC(12, 2) NOT NULL DEFAULT 0,
      bonus_rs_split NUMERIC(12, 2) NOT NULL DEFAULT 0,
      bonus_ftd_removed INT NOT NULL DEFAULT 0,
      note TEXT NULL,
      created_by_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT agency_stat_snapshots_bonus_split_consistent CHECK (
        ABS(bonus_amount - (bonus_cpa_split + bonus_rs_split)) < 0.02
      )
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS agency_stat_snapshots_assignment_idx
      ON agency_stat_snapshots (assignment_id, captured_at DESC, id DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS agency_stat_snapshots_captured_idx
      ON agency_stat_snapshots (captured_at DESC, id DESC);
  `);
    await pool.query(`
    ALTER TABLE agency_streamers
    ADD COLUMN IF NOT EXISTS tiktok_influencer_id BIGINT NULL
      REFERENCES tiktok_influencers(id) ON DELETE SET NULL;
  `);
    await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS agency_streamers_tiktok_uq
      ON agency_streamers (tiktok_influencer_id)
      WHERE tiktok_influencer_id IS NOT NULL;
  `);
}
