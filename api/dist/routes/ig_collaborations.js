// api/src/routes/ig_collaborations.ts
// Endpoints pour monitorer les collaborations Instagram
import { Router } from "express";
import { pool } from "../db.js";
export const igCollaborationsRouter = Router();
// GET /api/ig-collaborations
// Liste des collaborations (avec filtres optionnels)
igCollaborationsRouter.get("/ig-collaborations", async (req, res) => {
    try {
        const status = req.query.status;
        const streamerSlug = req.query.streamer_slug;
        const limit = Math.min(Number(req.query.limit ?? 100), 500);
        let whereClause = "1=1";
        const params = [];
        let paramIndex = 1;
        if (status) {
            whereClause += ` AND ic.status = $${paramIndex++}`;
            params.push(status);
        }
        if (streamerSlug) {
            whereClause += ` AND LOWER(ic.streamer_slug) = LOWER($${paramIndex++})`;
            params.push(streamerSlug);
        }
        const { rows } = await pool.query(`
      SELECT 
        ic.id,
        ic.publish_job_id,
        ic.streamer_slug,
        ic.instagram_username,
        ic.status,
        ic.media_id,
        ic.permalink,
        ic.error_msg,
        ic.started_at,
        ic.completed_at,
        ic.timeout_sec,
        ic.fallback_to_mention,
        pj.title,
        pj.description,
        pj.platform_url as job_permalink
      FROM instagram_collaborations ic
      LEFT JOIN publish_jobs pj ON pj.id = ic.publish_job_id
      WHERE ${whereClause}
      ORDER BY ic.started_at DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);
        res.json({ ok: true, data: rows });
    }
    catch (e) {
        console.error("[ig-collaborations] GET failed:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
// GET /api/ig-collaborations/stats
// Statistiques sur les collaborations
igCollaborationsRouter.get("/ig-collaborations/stats", async (_req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT 
        status,
        COUNT(*)::int as count,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_sec
      FROM instagram_collaborations
      WHERE started_at >= NOW() - INTERVAL '7 days'
      GROUP BY status
      ORDER BY status
    `);
        const totalResult = await pool.query(`
      SELECT COUNT(*)::int as total_collaborations
      FROM instagram_collaborations
      WHERE started_at >= NOW() - INTERVAL '7 days'
    `);
        const timeoutResult = await pool.query(`
      SELECT COUNT(*)::int as timeouts_count
      FROM instagram_collaborations
      WHERE status = 'timeout' 
        AND started_at >= NOW() - INTERVAL '7 days'
    `);
        res.json({
            ok: true,
            data: {
                by_status: rows,
                total_7_days: totalResult.rows[0]?.total_collaborations || 0,
                timeouts_7_days: timeoutResult.rows[0]?.timeouts_count || 0
            }
        });
    }
    catch (e) {
        console.error("[ig-collaborations] GET /stats failed:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
// POST /api/ig-collaborations/:jobId/retry
// Retenter une collaboration échouée ou timeout
igCollaborationsRouter.post("/ig-collaborations/:jobId/retry", async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (!jobId || isNaN(jobId)) {
        return res.status(400).json({ ok: false, error: "invalid_job_id" });
    }
    try {
        // Vérifier que le job existe et est en état d'échec
        const jobResult = await pool.query(`
      SELECT pj.id, pj.status, pj.collaboration_status, pj.collaboration_username
      FROM publish_jobs pj
      WHERE pj.id = $1 AND pj.platform = 'instagram'
    `, [jobId]);
        if (jobResult.rows.length === 0) {
            return res.status(404).json({ ok: false, error: "job_not_found" });
        }
        const job = jobResult.rows[0];
        if (job.status !== 'scheduled') {
            return res.status(400).json({ ok: false, error: "job_not_scheduled" });
        }
        if (!['failed', 'timeout'].includes(job.collaboration_status)) {
            return res.status(400).json({ ok: false, error: "job_not_failed_or_timeout" });
        }
        // Réinitialiser la collaboration
        await pool.query(`
      UPDATE publish_jobs 
      SET collaboration_status = 'pending',
          collaboration_started_at = NOW(),
          collaboration_error_msg = NULL,
          collaboration_media_id = NULL
      WHERE id = $1
    `, [jobId]);
        await pool.query(`
      UPDATE instagram_collaborations 
      SET status = 'pending',
          started_at = NOW(),
          completed_at = NULL,
          error_msg = NULL,
          media_id = NULL,
          permalink = NULL
      WHERE publish_job_id = $1
    `, [jobId]);
        console.log(`[ig-collaborations] job #${jobId} retry triggered for @${job.collaboration_username}`);
        res.json({ ok: true, message: "collaboration_retry_scheduled" });
    }
    catch (e) {
        console.error("[ig-collaborations] POST /retry failed:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
// DELETE /api/ig-collaborations/:jobId/cancel
// Annuler une collaboration en attente
igCollaborationsRouter.delete("/ig-collaborations/:jobId/cancel", async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (!jobId || isNaN(jobId)) {
        return res.status(400).json({ ok: false, error: "invalid_job_id" });
    }
    try {
        const result = await pool.query(`
      UPDATE instagram_collaborations 
      SET status = 'cancelled',
          completed_at = NOW(),
          error_msg = 'Cancelled by admin'
      WHERE publish_job_id = $1 AND status = 'pending'
      RETURNING id
    `, [jobId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false, error: "no_pending_collaboration" });
        }
        await pool.query(`
      UPDATE publish_jobs 
      SET collaboration_status = 'cancelled',
          collaboration_error_msg = 'Cancelled by admin'
      WHERE id = $1
    `, [jobId]);
        console.log(`[ig-collaborations] job #${jobId} collaboration cancelled`);
        res.json({ ok: true, message: "collaboration_cancelled" });
    }
    catch (e) {
        console.error("[ig-collaborations] DELETE /cancel failed:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
