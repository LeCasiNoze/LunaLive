// api/src/routes/xp.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import {
  getLevelInfo,
  getUnlockedPerks,
  getUpcomingPerks,
  getShopGrade,
  MAX_LEVEL,
  XP_THRESHOLDS,
} from "../economy/xp.js";

export const xpRouter = Router();

/**
 * GET /me/xp — état XP du user courant
 * Retourne level, progress, perks débloqués + à venir, grade shop.
 */
xpRouter.get(
  "/me/xp",
  requireAuth,
  a(async (req, res) => {
    const userId = Number((req as any).user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const r = await pool.query(`SELECT xp::bigint AS xp FROM users WHERE id = $1`, [userId]);
    const xp = Number(r.rows[0]?.xp || 0);
    const info = getLevelInfo(xp);
    const unlocked = getUnlockedPerks(info.level);
    const upcoming = getUpcomingPerks(info.level, 3);
    const shopGrade = getShopGrade(info.level);
    return res.json({
      ok: true,
      ...info,
      maxLevel: MAX_LEVEL,
      shopGrade,
      unlockedPerks: unlocked,
      upcomingPerks: upcoming,
    });
  })
);

/**
 * GET /me/xp/events — derniers events XP du user (audit / page profile)
 */
xpRouter.get(
  "/me/xp/events",
  requireAuth,
  a(async (req, res) => {
    const userId = Number((req as any).user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit) || 50));
    const r = await pool.query(
      `SELECT id, delta, source, reason, meta, created_at
         FROM xp_events
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT $2`,
      [userId, limit]
    );
    return res.json({
      ok: true,
      events: r.rows.map((row: any) => ({
        id: String(row.id),
        delta: Number(row.delta),
        source: String(row.source),
        reason: row.reason || null,
        meta: row.meta || null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
    });
  })
);

/**
 * GET /xp/curve — courbe XP publique (cumulative thresholds par level)
 * Pas authentifié, utile pour pages info/leaderboard.
 */
xpRouter.get(
  "/xp/curve",
  a(async (_req, res) => {
    return res.json({
      ok: true,
      maxLevel: MAX_LEVEL,
      thresholds: XP_THRESHOLDS,
    });
  })
);

/**
 * GET /xp/leaderboard — top users par XP (public)
 */
xpRouter.get(
  "/xp/leaderboard",
  a(async (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 20));
    const r = await pool.query(
      `SELECT u.id, u.username, u.avatar_path, u.xp::bigint AS xp
         FROM users u
        WHERE u.role IN ('viewer','streamer')
          AND u.xp > 0
        ORDER BY u.xp DESC
        LIMIT $1`,
      [limit]
    );
    const out = r.rows.map((row: any) => {
      const xp = Number(row.xp || 0);
      const info = getLevelInfo(xp);
      return {
        userId: Number(row.id),
        username: String(row.username || ""),
        avatarPath: row.avatar_path || null,
        xp,
        level: info.level,
        title: info.fullTitle,
      };
    });
    return res.json({ ok: true, leaderboard: out });
  })
);
