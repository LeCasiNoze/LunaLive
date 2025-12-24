// api/src/routes/daily_bonus_routes.ts
import { Router } from "express";
import { pool } from "../db.js";
import {
  getDailyBonusState,
  claimDailyBonusToday,
  claimDailyBonusMilestone,
} from "../services/dailyBonus.js";

export const dailyBonusRoutes = Router();

function getUserId(req: any) {
  return Number(req?.user?.id ?? 0);
}

// GET state (agenda)
dailyBonusRoutes.get("/state", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    const r = await getDailyBonusState(pool, userId);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || "Erreur") });
  }
});

// POST claim today
dailyBonusRoutes.post("/claim", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    const r = await claimDailyBonusToday(pool, userId);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || "Erreur") });
  }
});

// POST claim milestone (5/10/20/30)
dailyBonusRoutes.post("/claim-milestone", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const milestone = Number(req?.body?.milestone);
  if (![5, 10, 20, 30].includes(milestone)) {
    return res.status(400).json({ ok: false, error: "invalid_milestone" });
  }

  try {
    const r = await claimDailyBonusMilestone(pool, userId, milestone as any);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || "Erreur") });
  }
});
