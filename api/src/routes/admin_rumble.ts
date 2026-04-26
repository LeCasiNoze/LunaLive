// api/src/routes/admin_rumble.ts
// Admin endpoints pour le debug / re-poll Rumble
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
import { fetchRumbleInfoForStreamerSlug } from "../rumble.js";
import { getRumbleBotSession, setRumbleBotSession, hasRumbleBotSession } from "../rumble_chat_session.js";
import { sendRumbleMessage } from "../rumble_chat_bridge.js";

export const adminRumbleRouter = Router();

function pickSlug(req: any): string {
  const raw = (req.query?.slug ?? req.body?.slug ?? "").toString().trim();
  return raw || "lecasinoze";
}

/**
 * POST /admin/rumble/repoll?slug=xxx
 * Force un re-poll immédiat de l'état Rumble d'un streamer et met à jour la DB.
 */
adminRumbleRouter.post("/admin/rumble/repoll", requireAdminKey, async (req, res) => {
  try {
    const slug = pickSlug(req);
    const info = await fetchRumbleInfoForStreamerSlug(slug);

    const streamerResult = await pool.query(
      `SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
      [slug]
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
      slug,
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
 * GET /admin/rumble/status?slug=xxx
 * Retourne le dernier état Rumble en DB pour un streamer.
 */
adminRumbleRouter.get("/admin/rumble/status", requireAdminKey, async (req, res) => {
  try {
    const slug = pickSlug(req);
    const cached = await pool.query(
      `SELECT ri.is_live, ri.hls_url, ri.video_url, ri.title, ri.viewers_count, ri.updated_at,
              ra.username, ra.api_key IS NOT NULL AS has_api_key
       FROM streamer_rumble_info ri
       JOIN streamers s ON s.id = ri.streamer_id
       LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
       WHERE lower(s.slug) = lower($1)
       LIMIT 1`,
      [slug]
    );

    return res.json({
      ok: true,
      slug,
      cached: cached.rows[0] ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

/**
 * GET /admin/rumble/bot
 * Inspecte la session bot Rumble (sans révéler le cookie).
 */
adminRumbleRouter.get("/admin/rumble/bot", requireAdminKey, async (_req, res) => {
  try {
    const s = await getRumbleBotSession(true);
    return res.json({
      ok: true,
      username: s.username,
      hasCookie: hasRumbleBotSession(s),
      cookieLength: s.cookie?.length ?? 0,
      userAgent: s.userAgent,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

/**
 * POST /admin/rumble/bot
 * Body: { username?, cookie?, userAgent? }
 * Met à jour la session du bot Rumble (singleton). Le cookie est l'entête `Cookie`
 * complet capturé depuis les DevTools (Network → request headers d'une requête
 * authentifiée sur rumble.com après login).
 */
adminRumbleRouter.post("/admin/rumble/bot", requireAdminKey, async (req, res) => {
  try {
    const { username, cookie, userAgent } = req.body ?? {};
    if (
      (username !== undefined && typeof username !== "string") ||
      (cookie !== undefined && typeof cookie !== "string") ||
      (userAgent !== undefined && typeof userAgent !== "string")
    ) {
      return res.status(400).json({ ok: false, error: "bad_payload" });
    }
    await setRumbleBotSession({
      username: username ?? null,
      cookie: cookie ?? null,
      userAgent: userAgent ?? null,
    });
    const s = await getRumbleBotSession(true);
    return res.json({
      ok: true,
      username: s.username,
      hasCookie: hasRumbleBotSession(s),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

/**
 * POST /admin/rumble/send-test
 * Body: { videoIdNumeric: string, text?: string }
 * Envoie un message de test dans un chat Rumble via le bot. Utile pour valider
 * le pipeline cycletls + cookies sans attendre qu'un live LunaLive démarre.
 */
adminRumbleRouter.post("/admin/rumble/send-test", requireAdminKey, async (req, res) => {
  try {
    const { videoIdNumeric, text } = req.body ?? {};
    if (!videoIdNumeric || typeof videoIdNumeric !== "string") {
      return res.status(400).json({ ok: false, error: "videoIdNumeric_required" });
    }
    const body = (typeof text === "string" && text.trim()) ? text : "test LunaLive_Bot";
    const result = await sendRumbleMessage(String(videoIdNumeric), body);
    if (!result) {
      return res.status(502).json({ ok: false, error: "send_failed" });
    }
    return res.json({ ok: true, sentId: result.id, userId: result.userId });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});
