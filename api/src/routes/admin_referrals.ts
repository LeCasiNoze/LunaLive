import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const adminReferralsRouter = Router();

/**
 * GET /admin/referrals/summary
 * => stats globales + par streamer
 */
adminReferralsRouter.get(
  "/summary",
  a(async (_req, res) => {
    const totalsQ = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT user_id)::int AS "uniqueUsers"
      FROM user_referrals
    `);

    const byStreamerQ = await pool.query(`
      SELECT
        s.slug AS "streamerSlug",
        s.display_name AS "streamerName",
        COUNT(*)::int AS count,
        COUNT(DISTINCT r.user_id)::int AS "uniqueUsers"
      FROM user_referrals r
      JOIN streamers s ON s.id = r.streamer_id
      GROUP BY s.slug, s.display_name
      ORDER BY COUNT(*) DESC, s.slug ASC
      LIMIT 500
    `);

    res.json({
      ok: true,
      totals: totalsQ.rows[0] || { total: 0, uniqueUsers: 0 },
      byStreamer: byStreamerQ.rows || [],
    });
  })
);

/**
 * GET /admin/referrals?limit=200&offset=0
 * => liste user -> streamer
 */
adminReferralsRouter.get(
  "/",
  a(async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number((req.query as any)?.limit ?? 200) || 200));
    const offset = Math.max(0, Number((req.query as any)?.offset ?? 0) || 0);

    const q = await pool.query(
      `
      SELECT
        u.id AS "userId",
        u.username,
        s.slug AS "streamerSlug",
        s.display_name AS "streamerName",
        r.created_at AS "createdAt"
      FROM user_referrals r
      JOIN users u ON u.id = r.user_id
      JOIN streamers s ON s.id = r.streamer_id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    res.json({ ok: true, items: q.rows });
  })
);
