// api/src/routes/ig_comments.ts
// Endpoints de monitoring Instagram comments

import { Router } from "express";
import { pool } from "../db.js";

export const igCommentsRouter = Router();

// GET /api/ig-comment-tracking
// Liste des posts en cours de monitoring
igCommentsRouter.get("/ig-comment-tracking", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.publish_job_id,
        t.clip_id,
        t.streamer_slug,
        t.media_id,
        t.track_until,
        t.last_checked_at,
        t.created_at,
        COUNT(r.id)::int AS replies_count
      FROM ig_comment_tracking t
      LEFT JOIN ig_comment_replies r ON r.media_id = t.media_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    res.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error("[ig-comments] GET /ig-comment-tracking failed:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/ig-comment-replies?media_id=XXX
// Historique des réponses (filtre optionnel par media_id)
igCommentsRouter.get("/ig-comment-replies", async (req, res) => {
  try {
    const mediaId = req.query.media_id ? String(req.query.media_id) : null;

    const { rows } = mediaId
      ? await pool.query(
          `SELECT id, comment_id, media_id, username, comment_text, replied_at, dm_sent, dm_sent_at
           FROM ig_comment_replies
           WHERE media_id = $1
           ORDER BY replied_at DESC
           LIMIT 200`,
          [mediaId]
        )
      : await pool.query(
          `SELECT id, comment_id, media_id, username, comment_text, replied_at, dm_sent, dm_sent_at
           FROM ig_comment_replies
           ORDER BY replied_at DESC
           LIMIT 200`
        );

    res.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error("[ig-comments] GET /ig-comment-replies failed:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});
