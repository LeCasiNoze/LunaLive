import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
export const adminReferralsRouter = Router();
/**
 * GET /admin/referrals/summary
 * => stats globales + par streamer + split pending/validated
 */
adminReferralsRouter.get("/summary", a(async (req, res) => {
    // Global totals + split
    const totalsQ = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT r.user_id)::int AS "uniqueUsers",

        COUNT(*) FILTER (WHERE wr.user_id IS NULL)::int AS pending,
        COUNT(DISTINCT r.user_id) FILTER (WHERE wr.user_id IS NULL)::int AS "pendingUniqueUsers",

        COUNT(*) FILTER (WHERE wr.user_id IS NOT NULL)::int AS validated,
        COUNT(DISTINCT r.user_id) FILTER (WHERE wr.user_id IS NOT NULL)::int AS "validatedUniqueUsers"
      FROM user_referrals r
      LEFT JOIN welcome_rewards wr ON wr.user_id = r.user_id
    `);
    // By streamer totals + split
    const byStreamerQ = await pool.query(`
      SELECT
        s.slug AS "streamerSlug",
        s.display_name AS "streamerName",

        COUNT(*)::int AS count,
        COUNT(DISTINCT r.user_id)::int AS "uniqueUsers",

        COUNT(*) FILTER (WHERE wr.user_id IS NULL)::int AS pending,
        COUNT(DISTINCT r.user_id) FILTER (WHERE wr.user_id IS NULL)::int AS "pendingUniqueUsers",

        COUNT(*) FILTER (WHERE wr.user_id IS NOT NULL)::int AS validated,
        COUNT(DISTINCT r.user_id) FILTER (WHERE wr.user_id IS NOT NULL)::int AS "validatedUniqueUsers"
      FROM user_referrals r
      JOIN streamers s ON s.id = r.streamer_id
      LEFT JOIN welcome_rewards wr ON wr.user_id = r.user_id
      GROUP BY s.slug, s.display_name
      ORDER BY COUNT(*) DESC, s.slug ASC
      LIMIT 500
    `);
    res.json({
        ok: true,
        totals: totalsQ.rows[0] || {
            total: 0,
            uniqueUsers: 0,
            pending: 0,
            pendingUniqueUsers: 0,
            validated: 0,
            validatedUniqueUsers: 0,
        },
        byStreamer: byStreamerQ.rows || [],
    });
}));
/**
 * GET /admin/referrals?limit=200&offset=0&status=pending|validated|all
 * => liste user -> streamer + statut
 */
adminReferralsRouter.get("/", a(async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query?.limit ?? 200) || 200));
    const offset = Math.max(0, Number(req.query?.offset ?? 0) || 0);
    const statusRaw = String(req.query?.status ?? "all").toLowerCase();
    const status = statusRaw === "pending" ? "pending" : statusRaw === "validated" ? "validated" : "all";
    const where = status === "pending"
        ? `WHERE wr.user_id IS NULL`
        : status === "validated"
            ? `WHERE wr.user_id IS NOT NULL`
            : ``;
    const q = await pool.query(`
      SELECT
        u.id AS "userId",
        u.username,
        s.slug AS "streamerSlug",
        s.display_name AS "streamerName",
        r.created_at AS "createdAt",

        CASE WHEN wr.user_id IS NULL THEN 'pending' ELSE 'validated' END AS status,
        wr.created_at AS "validatedAt"
      FROM user_referrals r
      JOIN users u ON u.id = r.user_id
      JOIN streamers s ON s.id = r.streamer_id
      LEFT JOIN welcome_rewards wr ON wr.user_id = r.user_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
      `, [limit, offset]);
    res.json({ ok: true, items: q.rows });
}));
