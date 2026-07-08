import { Router } from "express";
import jwt from "jsonwebtoken";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
import { VIEWER_WEEK_SCORING } from "../events/viewer_week.js";
import { eventRewardEligibilitySql } from "../events/eligibility.js";
export const eventsViewerWeekRouter = Router();
// Le TOP est public (SEO/attractivité) ; "me" n'apparaît que si un JWT valide
// est fourni. Même pattern que decodeOptionalUser dans stats_routes.ts.
function getJwtSecret() {
    const s = process.env.JWT_SECRET;
    if (!s)
        throw new Error("JWT_SECRET missing");
    return s;
}
function decodeOptionalUser(req) {
    const h = String(req.headers.authorization || "");
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m)
        return null;
    try {
        return jwt.verify(m[1], getJwtSecret());
    }
    catch {
        return null;
    }
}
function mapRow(row) {
    return {
        rank: row.rank != null ? Number(row.rank) : null,
        userId: Number(row.user_id),
        username: String(row.username ?? ""),
        points: Number(row.points ?? 0),
        minutesPoints: Number(row.minutes_points ?? 0),
        dayBonusPoints: Number(row.day_bonus_points ?? 0),
        claimPoints: Number(row.claim_points ?? 0),
        wheelPoints: Number(row.wheel_points ?? 0),
        callsPoints: Number(row.calls_points ?? 0),
        predJoinPoints: Number(row.pred_join_points ?? 0),
        predWinPoints: Number(row.pred_win_points ?? 0),
        chatPoints: Number(row.chat_points ?? 0),
    };
}
// GET /api/events/current/viewer-week
// Auth optionnelle : le top est public, "me" n'apparaît que si connecté.
eventsViewerWeekRouter.get("/events/current/viewer-week", a(async (req, res) => {
    const user = decodeOptionalUser(req);
    const userId = Number(user?.id || 0);
    const ev = await pool.query(`
      SELECT *
      FROM events
      WHERE start_at <= NOW() AND NOW() < end_at
      ORDER BY start_at DESC
      LIMIT 1
      `);
    const event = ev.rows?.[0] ?? null;
    if (!event)
        return res.json({ ok: true, event: null });
    // Rang calculé uniquement parmi les users éligibles (classement = apparition filtrée).
    const top = await pool.query(`
      WITH ranked AS (
        SELECT s.*, ROW_NUMBER() OVER (ORDER BY s.points DESC, s.updated_at ASC) AS rank
        FROM event_scores_viewer_week s
        WHERE s.event_id = $1
          AND ${eventRewardEligibilitySql("s.user_id")}
      )
      SELECT r.*, u.username
      FROM ranked r
      JOIN users u ON u.id = r.user_id
      ORDER BY r.rank ASC
      LIMIT $2
      `, [event.id, VIEWER_WEEK_SCORING.TOP_N]);
    // "me" : uniquement si connecté. Mes points comptent toujours ; mon rang
    // n'existe que si je suis éligible.
    let meRow = null;
    if (userId) {
        const me = await pool.query(`
        WITH ranked AS (
          SELECT s.*, ROW_NUMBER() OVER (ORDER BY s.points DESC, s.updated_at ASC) AS rank
          FROM event_scores_viewer_week s
          WHERE s.event_id = $1
            AND ${eventRewardEligibilitySql("s.user_id")}
        )
        SELECT s.*, u.username, ranked.rank
        FROM event_scores_viewer_week s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN ranked ON ranked.user_id = s.user_id
        WHERE s.event_id = $1 AND s.user_id = $2
        LIMIT 1
        `, [event.id, userId]);
        meRow = me.rows?.[0] ?? null;
    }
    res.json({
        ok: true,
        event,
        rules: {
            pointsPerMinute: VIEWER_WEEK_SCORING.P.MINUTE,
            capsPerDay: VIEWER_WEEK_SCORING.CAP_PER_DAY,
            values: VIEWER_WEEK_SCORING.P,
            topN: VIEWER_WEEK_SCORING.TOP_N,
        },
        top: (top.rows || []).map(mapRow),
        me: meRow ? mapRow(meRow) : null,
    });
}));
