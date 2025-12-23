// api/src/routes/earnings.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const earningsRouter = express.Router();

function floorInt(n: number) {
  return Math.floor(n);
}

earningsRouter.get("/streamer/me/earnings", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const s = await pool.query(`SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`, [req.user!.id]);
    const streamer = s.rows?.[0];
    if (!streamer) return res.json({ ok: true, streamer: null });

    const streamerId = Number(streamer.id);
    const streamerOwnerUserId = Number(req.user!.id);

    // 1) solde rubis visibles (compte user)
    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [streamerOwnerUserId]);
    const rubis = Number(u.rows?.[0]?.rubis ?? 0);

    // 2) breakdown lots + estimation valeur en centimes
    const lots = await pool.query(
      `SELECT origin, weight_bp, SUM(amount_remaining)::bigint AS n
       FROM rubis_lots
       WHERE user_id=$1 AND amount_remaining>0
       GROUP BY origin, weight_bp
       ORDER BY weight_bp DESC, origin ASC`,
      [streamerOwnerUserId]
    );

    const breakdown = lots.rows.map((r: any) => {
      const amount = Number(r.n);
      const weightBp = Number(r.weight_bp);
      const valueCents = floorInt((amount * weightBp) / 10000);
      return { origin: String(r.origin), weightBp, amount, valueCents };
    });

    const totalValueCents = breakdown.reduce((sum: number, b: any) => sum + Number(b.valueCents || 0), 0);

    // 3) historique support
    const last = await pool.query(
      `SELECT
          id::text AS id,
          purpose,
          amount,
          support_value,
          streamer_amount,
          platform_amount,
          burn_amount,
          created_at
       FROM rubis_tx
       WHERE kind='support'
         AND streamer_id=$1
         AND status='succeeded'
       ORDER BY created_at DESC
       LIMIT 50`,
      [streamerId]
    );

    // 4) cashout requests
    const cashouts = await pool.query(
      `SELECT id::text AS id, amount_rubis, status, note, created_at, tx_id
       FROM cashout_requests
       WHERE streamer_id=$1
       ORDER BY created_at DESC
       LIMIT 30`,
      [streamerId]
    );

    res.json({
      ok: true,
      streamer: { id: String(streamerId), slug: String(streamer.slug) },
      wallet: {
        rubis,
        valueCents: totalValueCents,
        valueEur: totalValueCents / 100,
        breakdown,
      },
      last: last.rows,
      cashouts: cashouts.rows,
    });
  } catch (err) {
    next(err);
  }
});
