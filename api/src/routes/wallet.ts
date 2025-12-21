// api/src/routes/wallet.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth, requireAdminKey } from "../auth.js";
import { earnRubis } from "../wallet_engine.js";

export const walletRouter = express.Router();

walletRouter.get("/wallet", requireAuth, async (req, res) => {
  const userId = Number(req.user!.id);

  const tot = await pool.query(
    `SELECT COALESCE(SUM(amount_remaining),0)::bigint AS n
     FROM wallet_lots
     WHERE user_id=$1 AND amount_remaining>0`,
    [userId]
  );

  const by = await pool.query(
    `SELECT origin, COALESCE(SUM(amount_remaining),0)::bigint AS n
     FROM wallet_lots
     WHERE user_id=$1 AND amount_remaining>0
     GROUP BY origin
     ORDER BY origin ASC`,
    [userId]
  );

  res.json({
    ok: true,
    rubis: Number(tot.rows?.[0]?.n ?? 0),
    breakdown: by.rows.map((r) => ({ origin: r.origin, amount: Number(r.n) })),
  });
});

// Admin util: créditer un user (pour test wheel/farm/topup)
walletRouter.post("/admin/wallet/credit", requireAdminKey, async (req, res) => {
  const userId = Number(req.body?.userId);
  const origin = String(req.body?.origin || "event_platform");
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note || "");

  if (!userId || !Number.isFinite(userId)) return res.status(400).json({ ok: false, error: "bad_userId" });
  if (!amount || !Number.isFinite(amount)) return res.status(400).json({ ok: false, error: "bad_amount" });

  await earnRubis(userId, origin, Math.floor(amount), { note, by: "admin" });
  res.json({ ok: true });
});
