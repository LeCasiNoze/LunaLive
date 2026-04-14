import type { Pool } from "pg";

/**
 * Correctif : l'index unique expenses_source_agency_month_uq n'a pas été créé
 * correctement (probablement car des doublons existaient lors du mig072).
 * Ce migration :
 *   1. Déduplique les lignes agency_streamer_payout en gardant la plus récente
 *   2. Drop l'index si présent (potentiellement corrompu / partiel)
 *   3. Recrée l'index proprement
 */
export async function mig075_expenses_agency_unique_fix(pool: Pool) {
  // 1. Supprimer les doublons : pour chaque (agency_assignment_id, agency_month_key),
  //    garder uniquement la ligne avec l'id le plus élevé (la plus récente).
  await pool.query(`
    DELETE FROM expenses
    WHERE source_type = 'agency_streamer_payout'
      AND id NOT IN (
        SELECT DISTINCT ON (agency_assignment_id, agency_month_key) id
        FROM expenses
        WHERE source_type = 'agency_streamer_payout'
          AND agency_assignment_id IS NOT NULL
          AND agency_month_key IS NOT NULL
        ORDER BY agency_assignment_id, agency_month_key, updated_at DESC NULLS LAST, id DESC
      )
      AND agency_assignment_id IS NOT NULL
      AND agency_month_key IS NOT NULL
  `);

  // 2. Drop l'ancien index s'il existe (il peut exister mais être invalide ou partiel).
  await pool.query(`
    DROP INDEX IF EXISTS expenses_source_agency_month_uq
  `);

  // 3. Recréer l'index unique sur les colonnes attendues par ON CONFLICT.
  //    Pas de clause WHERE partielle : PostgreSQL traite les NULL comme distincts
  //    donc les lignes 'manual' (agency_assignment_id IS NULL) ne causent pas de
  //    violation, et ON CONFLICT (source_type, agency_assignment_id, agency_month_key)
  //    fonctionne sans predicate supplémentaire.
  await pool.query(`
    CREATE UNIQUE INDEX expenses_source_agency_month_uq
      ON expenses (source_type, agency_assignment_id, agency_month_key)
  `);
}
