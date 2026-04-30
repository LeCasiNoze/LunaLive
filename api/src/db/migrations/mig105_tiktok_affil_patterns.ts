import type { Pool } from "pg";

export async function mig105_tiktok_affil_patterns(pool: Pool) {
  // Patterns libres à matcher dans les descriptions TikTok pour identifier
  // les vidéos contenant un lien d'affiliation (taap.it/..., lunalive.win/r/...,
  // ou n'importe quoi qu'on veut tracker).
  //
  // pattern : substring case-insensitive à chercher dans la description.
  // label   : nom lisible (optionnel).
  // landing_id : lien futur vers affi_landing_pages quand on couplera (nullable).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_affil_patterns (
      id BIGSERIAL PRIMARY KEY,
      pattern TEXT NOT NULL,
      label TEXT NULL,
      landing_id BIGINT NULL REFERENCES affi_landing_pages(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_affil_patterns_pattern_lower
      ON tiktok_affil_patterns (LOWER(pattern));
  `);
}
