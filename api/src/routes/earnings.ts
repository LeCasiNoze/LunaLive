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

    // ✅ Solde cashable = wallet d'earnings (ledger vivant), PAS users.rubis.
    // Crédité par spendRubisTx(support) = part streamer déjà pondérée.
    const w = await pool.query(
      `SELECT available_rubis, lifetime_rubis
       FROM streamer_wallets
       WHERE streamer_id=$1
       LIMIT 1`,
      [streamerId]
    );
    const availableRubis = Number(w.rows?.[0]?.available_rubis ?? 0);
    const lifetimeRubis = Number(w.rows?.[0]?.lifetime_rubis ?? 0);

    // available_rubis est déjà net/pondéré : 1 rubis cashable = 1 centime.
    const valueCents = availableRubis;
    const breakdownByWeight: Record<string, number> = availableRubis > 0 ? { "10000": availableRubis } : {};

    // ✅ Historique des gains support (ledger vivant)
    const last = await pool.query(
      `SELECT
         spend_type,
         spent_rubis,
         support_rubis,
         streamer_earn_rubis,
         platform_cut_rubis,
         created_at
       FROM streamer_earnings_ledger
       WHERE streamer_id=$1
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
        availableRubis,         // cashable dispo (streamer_wallets)
        lifetimeRubis,          // cumul historique gagné
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
