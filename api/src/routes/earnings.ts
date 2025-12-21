// api/src/routes/earnings.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const earningsRouter = express.Router();

earningsRouter.get("/streamer/me/earnings", requireAuth, async (req, res) => {
  if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const s = await pool.query(`SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`, [req.user!.id]);
  const streamer = s.rows?.[0];
  if (!streamer) return res.json({ ok: true, streamer: null });

  const streamerId = Number(streamer.id);

  const w = await pool.query(
    `SELECT available_rubis::bigint AS available, lifetime_rubis::bigint AS lifetime
     FROM streamer_wallets
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );

  const last = await pool.query(
    `SELECT spend_type, spent_rubis, support_rubis, streamer_earn_rubis, platform_cut_rubis, created_at
     FROM streamer_earnings_ledger
     WHERE streamer_id=$1
     ORDER BY created_at DESC
     LIMIT 30`,
    [streamerId]
  );

  res.json({
    ok: true,
    streamer: { id: String(streamerId), slug: String(streamer.slug) },
    wallet: {
      availableRubis: Number(w.rows?.[0]?.available ?? 0),
      lifetimeRubis: Number(w.rows?.[0]?.lifetime ?? 0),
    },
    last: last.rows,
  });
});
