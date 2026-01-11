// api/src/routes/shop_talents.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { spendRubis } from "../wallet_engine.js";

export const shopTalentsRouter = Router();

/**
 * Talents officiels (codes définitifs)
 */
export const TALENTS = [
  "talent_shop_discount",
  "talent_xp_boost",
  "talent_rain_boost",
  "talent_prediction_bet_cap",
  "talent_prediction_shield",
  "talent_calls_limit",
] as const;

export type TalentCode = (typeof TALENTS)[number];

const MAX_LEVEL = 3;

const LEVEL_PRICES: Record<number, number> = {
  1: 500,
  2: 2000,
  3: 5000,
};

// ──────────────────────────────────────────
// helpers
// ──────────────────────────────────────────

async function getUserTalents(userId: number) {
  const r = await pool.query<{ talent_code: string; level: number }>(
    `
    SELECT talent_code, level
    FROM user_talents
    WHERE user_id = $1
  `,
    [userId]
  );

  const map: Record<string, number> = {};
  for (const row of r.rows) {
    map[row.talent_code] = Number(row.level) || 0;
  }

  // ensure all talents exist
  for (const t of TALENTS) {
    if (map[t] == null) map[t] = 0;
  }

  return map;
}

async function getUserRubis(userId: number) {
  const r = await pool.query<{ rubis: number }>(
    `SELECT rubis FROM users WHERE id=$1 LIMIT 1`,
    [userId]
  );
  return Number(r.rows?.[0]?.rubis ?? 0);
}

// ──────────────────────────────────────────
// GET /shop/talents
// ──────────────────────────────────────────

shopTalentsRouter.get(
  "/",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const talents = await getUserTalents(userId);
    const rubis = await getUserRubis(userId);

    const items = TALENTS.map((code) => {
      const level = talents[code] ?? 0;
      const nextLevel = level < MAX_LEVEL ? level + 1 : null;

      return {
        code,
        level,
        maxLevel: MAX_LEVEL,
        nextLevel,
        nextPrice: nextLevel ? LEVEL_PRICES[nextLevel] : null,
      };
    });

    res.json({
      ok: true,
      availableRubis: rubis,
      talents: items,
    });
  })
);

// ──────────────────────────────────────────
// POST /shop/talents/buy
// ──────────────────────────────────────────

shopTalentsRouter.post(
  "/buy",
  requireAuth,
  a(async (req: any, res) => {
    const userId = Number(req.user?.id);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const code = String(req.body?.code || "").trim() as TalentCode;
    if (!TALENTS.includes(code)) {
      return res.status(400).json({ ok: false, error: "unknown_talent" });
    }

    const talents = await getUserTalents(userId);
    const currentLevel = talents[code] ?? 0;

    if (currentLevel >= MAX_LEVEL) {
      return res.status(400).json({ ok: false, error: "already_max_level" });
    }

    const nextLevel = currentLevel + 1;
    const price = LEVEL_PRICES[nextLevel];

    try {
      await spendRubis({
        userId,
        amount: price,
        spendKind: "sink",
        spendType: "talent",
        meta: { talent: code, level: nextLevel },
        });
    } catch (e: any) {
      if (String(e?.message) === "insufficient_funds") {
        return res.status(400).json({ ok: false, error: "insufficient_funds" });
      }
      return res.status(500).json({ ok: false, error: "buy_failed" });
    }

    await pool.query(
      `
      INSERT INTO user_talents (user_id, talent_code, level)
      VALUES ($1,$2,$3)
      ON CONFLICT (user_id, talent_code)
      DO UPDATE SET level = EXCLUDED.level, updated_at = NOW()
    `,
      [userId, code, nextLevel]
    );

    const rubis = await getUserRubis(userId);

    res.json({
      ok: true,
      talent: {
        code,
        level: nextLevel,
        maxLevel: MAX_LEVEL,
      },
      availableRubis: rubis,
    });
  })
);
