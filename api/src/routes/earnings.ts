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

earningsRouter.get("/streamer/me/earnings", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const s = await pool.query(
      `SELECT id, slug, COALESCE(mods_percent_bp,0) AS mods_percent_bp
       FROM streamers
       WHERE user_id=$1
       LIMIT 1`,
      [req.user!.id]
    );
    const streamer = s.rows?.[0];
    if (!streamer) {
      return res.json({
        ok: true,
        streamer: null,
        wallet: { availableRubis: 0, lifetimeRubis: 0, reservedRubis: 0, breakdownByWeight: {}, valueCents: 0, valueEur: 0 },
        last: [],
      });
    }

    const streamerId = Number(streamer.id);
    const modsPercentBp = Number(streamer.mods_percent_bp ?? 0);

    // ✅ Solde visible
    const u = await pool.query(`SELECT rubis FROM users WHERE id=$1 LIMIT 1`, [req.user!.id]);
    const availableRubis = Number(u.rows?.[0]?.rubis ?? 0);

    // ✅ Lots restants => breakdown + valeur €
    const lots = await pool.query(
      `SELECT weight_bp::int AS weight_bp, COALESCE(SUM(amount_remaining),0)::bigint AS n
       FROM rubis_lots
       WHERE user_id=$1 AND amount_remaining>0
       GROUP BY weight_bp
       ORDER BY weight_bp DESC`,
      [req.user!.id]
    );

    const breakdownByWeight: Record<string, number> = {};
    let valueCents = 0;

    for (const r of lots.rows || []) {
      const w = Number(r.weight_bp ?? 0);
      const n = Number(r.n ?? 0);
      breakdownByWeight[String(w)] = n;
      // 1 rubis @ weight 1.00 => 1 cent => valueCents += n * w / 10000
      valueCents += Math.floor((n * w) / 10000);
    }

    // ✅ Historique support (pour "répartition revenus" si tu veux)
    const last = await pool.query(
      `SELECT
         purpose         AS spend_type,
         amount          AS spent_rubis,
         support_value   AS support_rubis,
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
        modsPercent: modsPercentBp / 100,
      },
      wallet: {
        availableRubis,         // ✅ 957
        lifetimeRubis: availableRubis, // placeholder UI (on affinera plus tard si besoin)
        reservedRubis: 0,
        breakdownByWeight,
        valueCents,
        valueEur: valueCents / 100,
      },
      last: last.rows || [],
    });
  } catch (err) {
    next(err);
  }
});

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

    const bp = clampInt(Math.round(pct * 100), 0, 5000); // cap 50%
    await pool.query(`UPDATE streamers SET mods_percent_bp=$2, updated_at=NOW() WHERE id=$1`, [Number(streamer.id), bp]);

    res.json({ ok: true, modsPercentBp: bp, modsPercent: bp / 100 });
  } catch (err) {
    next(err);
  }
});
