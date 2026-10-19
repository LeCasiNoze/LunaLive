import type { Pool } from "pg";

/** Restore audit rows for credits already paid by the wallet engine.
 * Never credits a wallet, changes a quest claim, or assigns a new payout date.
 */
export async function mig153_chest_payout_history(pool: Pool) {
  await pool.query(`
    INSERT INTO streamer_chest_payouts
      (opening_id, user_id, amount, breakdown, created_at)
    SELECT o.id, w.user_id, SUM(w.amount)::int,
           jsonb_build_object('chest_streamer', SUM(w.amount)), MIN(w.created_at)
      FROM wallet_tx w
      JOIN streamer_chest_openings o ON w.meta->>'openingId' = o.id::text
      JOIN streamer_chest_participants p ON p.opening_id=o.id AND p.user_id=w.user_id
     WHERE w.kind='earn' AND w.origin='chest_streamer' AND w.amount>0
     GROUP BY o.id, w.user_id
    ON CONFLICT (opening_id, user_id) DO NOTHING
  `);
}
