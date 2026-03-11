import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { VIEWER_WEEK } from "../events/viewer_week.js";
export const eventsViewerWeekRouter = Router();
// GET /api/events/current/viewer-week
eventsViewerWeekRouter.get("/events/current/viewer-week", requireAuth, a(async (req, res) => {
    const userId = Number(req.user?.id || 0);
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
    const top = await pool.query(`
    SELECT s.user_id, s.points,
            u.username
    FROM event_scores_viewer_week s
    JOIN users u ON u.id = s.user_id
    WHERE s.event_id=$1
    ORDER BY s.points DESC, s.updated_at DESC
    LIMIT $2
    `, [event.id, VIEWER_WEEK.TOP_N]);
    const me = await pool.query(`
      SELECT s.*,
             (
               SELECT 1 + COUNT(*)
               FROM event_scores_viewer_week s2
               WHERE s2.event_id=s.event_id AND s2.points > s.points
             ) AS rank
      FROM event_scores_viewer_week s
      WHERE s.event_id=$1 AND s.user_id=$2
      LIMIT 1
      `, [event.id, userId]);
    res.json({
        ok: true,
        event,
        rules: {
            pointsPerMinute: VIEWER_WEEK.P.MINUTE,
            capsPerDay: VIEWER_WEEK.CAP_PER_DAY,
            values: VIEWER_WEEK.P,
            topN: VIEWER_WEEK.TOP_N,
        },
        top: top.rows || [],
        me: me.rows?.[0] ?? null,
    });
}));
