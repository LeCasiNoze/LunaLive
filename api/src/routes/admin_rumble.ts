// api/src/routes/admin_rumble.ts
// Admin endpoints pour le debug / re-poll Rumble
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
import { fetchLeCasiNozeRumbleInfo } from "../rumble.js";

export const adminRumbleRouter = Router();

/**
 * POST /admin/rumble/repoll
 * Force un re-poll immédiat de l'état Rumble de LeCasiNoze et met à jour la DB.
 * Utile quand la hls_url en cache est mauvaise (403) sans attendre les 30s.
 */
adminRumbleRouter.post("/admin/rumble/repoll", requireAdminKey, async (_req, res) => {
  try {
    const info = await fetchLeCasiNozeRumbleInfo();

    const streamerResult = await pool.query(
      `SELECT id FROM streamers WHERE lower(slug) = lower('lecasinoze') LIMIT 1`
    );
    const streamerId = streamerResult.rows[0]?.id;
    if (!streamerId) {
      return res.status(404).json({ ok: false, error: "streamer_not_found" });
    }

    if (info.isLive) {
      await pool.query(
        `UPDATE streamer_rumble_info
         SET hls_url = $1, video_url = $2, thumbnail_url = $3,
             is_live = true, title = $4, updated_at = NOW()
         WHERE streamer_id = $5`,
        [info.hlsUrl, info.videoUrl, info.thumbnailUrl, info.title, streamerId]
      );
    } else {
      await pool.query(
        `UPDATE streamer_rumble_info
         SET hls_url = NULL, is_live = false, updated_at = NOW()
         WHERE streamer_id = $1`,
        [streamerId]
      );
    }

    return res.json({
      ok: true,
      isLive: info.isLive,
      hlsUrl: info.hlsUrl,
      videoId: info.videoId,
      title: info.title,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

/**
 * GET /admin/rumble/status
 * Retourne le dernier état Rumble en DB + infos fraîches depuis l'API.
 */
adminRumbleRouter.get("/admin/rumble/status", requireAdminKey, async (_req, res) => {
  try {
    const cached = await pool.query(
      `SELECT ri.is_live, ri.hls_url, ri.video_url, ri.title, ri.viewers_count, ri.updated_at,
              ra.username, ra.api_key IS NOT NULL AS has_api_key
       FROM streamer_rumble_info ri
       JOIN streamers s ON s.id = ri.streamer_id
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       WHERE lower(s.slug) = 'lecasinoze'
       LIMIT 1`
    );

    return res.json({
      ok: true,
      cached: cached.rows[0] ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});
