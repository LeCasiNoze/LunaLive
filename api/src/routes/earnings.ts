// api/src/routes/earnings.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const earningsRouter = express.Router();

function clampInt(n: number, min: number, max: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

/**
 * GET /streamer/me/earnings
 * - wallet.availableRubis: earnings dispo (lifetime - cashouts pending/approved/paid)
 * - wallet.lifetimeRubis: total gagné (streamer_amount sum)
 * - wallet.breakdownByWeight: répartition (poids -> rubis) (approx) via rubis_tx_lots
 * - last[]: 50 dernières tx support (format attendu par le front)
 * - modsPercentBp: settings stored on streamers table
 */
earningsRouter.get("/streamer/me/earnings", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const s = await pool.query(
      `SELECT id, slug, mods_percent_bp
       FROM streamers
       WHERE user_id=$1
       LIMIT 1`,
      [req.user!.id]
    );

    const streamer = s.rows?.[0];
    if (!streamer) return res.json({ ok: true, streamer: null, wallet: { availableRubis: 0, lifetimeRubis: 0 }, last: [] });

    const streamerId = Number(streamer.id);
    const modsPercentBp = Number(streamer.mods_percent_bp ?? 0);
    const modsPercent = modsPercentBp / 100;

    // lifetime = somme des streamer_amount (tx support succeeded)
    const lifetimeRes = await pool.query(
      `SELECT COALESCE(SUM(streamer_amount),0)::bigint AS n
       FROM rubis_tx
       WHERE kind='support'
         AND status='succeeded'
         AND streamer_id=$1`,
      [streamerId]
    );
    const lifetimeRubis = Number(lifetimeRes.rows?.[0]?.n ?? 0);

    // reserved = cashouts en cours / validés / payés
    const reservedRes = await pool.query(
      `SELECT COALESCE(SUM(amount_rubis),0)::bigint AS n
       FROM cashout_requests
       WHERE streamer_id=$1
         AND status IN ('pending','approved','paid')`,
      [streamerId]
    );
    const reservedRubis = Number(reservedRes.rows?.[0]?.n ?? 0);

    const availableRubis = Math.max(0, lifetimeRubis - reservedRubis);

    // Répartition du solde (poids -> rubis) (approx) depuis les lots consommés
    // earn part ~= (amount_used * weight_bp / 10000) * 0.90
    const byWeight = await pool.query(
      `SELECT
         l.weight_bp::int AS weight_bp,
         COALESCE(SUM((l.amount_used::numeric * l.weight_bp::numeric * 0.90) / 10000), 0)::bigint AS earn_rubis
       FROM rubis_tx_lots l
       JOIN rubis_tx t ON t.id=l.tx_id
       WHERE t.kind='support'
         AND t.status='succeeded'
         AND t.streamer_id=$1
       GROUP BY l.weight_bp
       ORDER BY l.weight_bp DESC`,
      [streamerId]
    );

    const breakdownByWeight: Record<string, number> = {};
    for (const r of byWeight.rows || []) {
      breakdownByWeight[String(r.weight_bp)] = Number(r.earn_rubis ?? 0);
    }

    // Dernières entrées (format attendu front)
    const last = await pool.query(
      `SELECT
         purpose        AS spend_type,
         amount         AS spent_rubis,
         support_value  AS support_rubis,
         streamer_amount AS streamer_earn_rubis,
         platform_amount AS platform_cut_rubis,
         created_at
       FROM rubis_tx
       WHERE kind='support'
         AND status='succeeded'
         AND streamer_id=$1
       ORDER BY created_at DESC
       LIMIT 50`,
      [streamerId]
    );

    res.json({
      ok: true,
      streamer: {
        id: String(streamerId),
        slug: String(streamer.slug),
        modsPercentBp,
        modsPercent,
      },
      wallet: {
        availableRubis,
        lifetimeRubis,
        reservedRubis,
        breakdownByWeight,
      },
      last: last.rows || [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /streamer/me/mods-percent
 * body: { percent: number }  // ex: 12.5
 * stocké en bp dans streamers.mods_percent_bp (ex: 1250)
 */
earningsRouter.post("/streamer/me/mods-percent", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [req.user!.id]);
    const streamer = s.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const pct = Number(req.body?.percent);
    if (!Number.isFinite(pct) || pct < 0) return res.status(400).json({ ok: false, error: "bad_amount" });

    // cap simple (0% -> 50%)
    const bp = clampInt(Math.round(pct * 100), 0, 5000);

    await pool.query(
      `UPDATE streamers
       SET mods_percent_bp=$2, updated_at=NOW()
       WHERE id=$1`,
      [Number(streamer.id), bp]
    );

    return res.json({ ok: true, modsPercentBp: bp, modsPercent: bp / 100 });
  } catch (err) {
    next(err);
  }
});
