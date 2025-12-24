// api/src/routes/daily_bonus_routes.ts
import { Router } from "express";
import { pool } from "../db";
import { claimDailyBonus } from "../services/dailyBonus";

// ⚠️ suppose que tu as déjà un middleware auth qui met req.user
// adapte la ligne userId si ton projet utilise req.user.id / req.auth.userId etc.
function getUserId(req: any) {
  return Number(req?.user?.id ?? req?.auth?.userId ?? 0);
}

export const dailyBonusRoutes = Router();

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
