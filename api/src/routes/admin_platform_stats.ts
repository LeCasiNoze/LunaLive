// api/src/routes/admin_platform_stats.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
import { a } from "../utils/async.js";

export const adminPlatformStatsRouter = Router();

async function safeCount(sql: string, params: any[] = []): Promise<number> {
  try {
    const r = await pool.query(sql, params);
    return Number(r.rows?.[0]?.count ?? r.rows?.[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

async function safeScalar<T>(sql: string, params: any[] = [], key: string = "v"): Promise<T | null> {
  try {
    const r = await pool.query(sql, params);
    const v = r.rows?.[0]?.[key];
    return v == null ? null : (v as T);
  } catch {
    return null;
  }
}

adminPlatformStatsRouter.get(
  "/admin/platform-stats",
  requireAdminKey,
  a(async (_req, res) => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const som = startOfMonth.toISOString();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sod = startOfToday.toISOString();

    const [
      totalUsers,
      newUsersMonth,
      newUsersToday,
      totalStreamers,
      streamersLive,
      publishedCasinos,

      currentViewers,
      uniqueViewersMonth,
      totalViewerSessionsMonth,
      avgSessionSecMonth,

      streamSessionsMonth,
      totalStreamMinutesMonth,

      dbPool,
      mem,
      uptime,
    ] = await Promise.all([
      // ── Users ──────────────────────────────────────
      safeCount(`SELECT COUNT(*) AS count FROM users`),
      safeCount(`SELECT COUNT(*) AS count FROM users WHERE created_at >= $1`, [som]),
      safeCount(`SELECT COUNT(*) AS count FROM users WHERE created_at >= $1`, [sod]),

      // ── Streamers ──────────────────────────────────
      safeCount(`SELECT COUNT(*) AS count FROM streamers`),
      safeCount(`SELECT COUNT(*) AS count FROM streamers WHERE is_live = TRUE`),

      // ── Casinos ────────────────────────────────────
      safeCount(`SELECT COUNT(*) AS count FROM casino_listings WHERE status = 'published'`),

      // ── Viewers live (heartbeat < 45s) ─────────────
      safeCount(`
        SELECT COUNT(DISTINCT vs.viewer_key) AS count
        FROM viewer_sessions vs
        WHERE vs.ended_at IS NULL
          AND vs.last_heartbeat_at >= NOW() - INTERVAL '45 seconds'
      `),

      // ── Unique viewers ce mois ─────────────────────
      safeCount(`
        SELECT COUNT(DISTINCT viewer_key) AS count
        FROM viewer_sessions
        WHERE started_at >= $1
      `, [som]),

      // ── Sessions viewers ce mois ───────────────────
      safeCount(`
        SELECT COUNT(*) AS count
        FROM viewer_sessions
        WHERE started_at >= $1
      `, [som]),

      // ── Durée moyenne session (secondes) ───────────
      safeScalar<number>(`
        SELECT ROUND(AVG(
          EXTRACT(EPOCH FROM (COALESCE(ended_at, last_heartbeat_at, NOW()) - started_at))
        ))::int AS v
        FROM viewer_sessions
        WHERE started_at >= $1
          AND started_at < NOW()
      `, [som], "v"),

      // ── Sessions stream ce mois ────────────────────
      safeCount(`
        SELECT COUNT(*) AS count
        FROM live_sessions
        WHERE started_at >= $1
      `, [som]),

      // ── Minutes totales streamées ce mois ─────────
      safeScalar<number>(`
        SELECT ROUND(SUM(
          EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60
        ))::int AS v
        FROM live_sessions
        WHERE started_at >= $1
      `, [som], "v"),

      // ── DB pool ────────────────────────────────────
      Promise.resolve({
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      }),

      // ── Mémoire process ───────────────────────────
      Promise.resolve(process.memoryUsage()),

      // ── Uptime process ────────────────────────────
      Promise.resolve(Math.floor(process.uptime())),
    ]);

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      users: {
        total: totalUsers,
        newThisMonth: newUsersMonth,
        newToday: newUsersToday,
      },
      streamers: {
        total: totalStreamers,
        live: streamersLive,
      },
      casinos: {
        published: publishedCasinos,
      },
      viewers: {
        current: currentViewers,
        uniqueThisMonth: uniqueViewersMonth,
        sessionsThisMonth: totalViewerSessionsMonth,
        avgSessionSec: avgSessionSecMonth ?? 0,
      },
      streams: {
        sessionsThisMonth: streamSessionsMonth,
        totalMinutesThisMonth: totalStreamMinutesMonth ?? 0,
      },
      server: {
        uptimeSeconds: uptime,
        memoryMb: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
        db: dbPool,
      },
    });
  })
);
