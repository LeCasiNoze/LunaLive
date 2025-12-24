// api/src/routes/daily_bonus_routes.ts
import { Router } from "express";
import { pool } from "../db.js";
import { claimDailyBonus } from "../services/dailyBonus.js";

export const dailyBonusRoutes = Router();

// adapte si ton auth met req.user ailleurs
function getUserId(req: any) {
  return Number(req?.user?.id ?? 0);
}

dailyBonusRoutes.post("/claim", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    const r = await claimDailyBonus(pool, userId);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || "Erreur") });
  }
});
