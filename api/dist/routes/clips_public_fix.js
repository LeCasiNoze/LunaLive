// api/src/routes/clips_public_fix.ts
// Fix minimal pour API clips - utilisation thumbnail_url persistée
import { pool } from "../db";
import { r2Enabled } from "../clips/r2";
const API_BASE = (process.env.API_BASE || "https://lunalive-api.onrender.com").replace(/\/$/, "");
function apiBaseFromReq(req) {
    const proto = req.protocol;
    const host = req.get("host");
    return `${proto}://${host}`;
}
export function setupClipsPublicFix(app) {
    /**
     * GET /clips/top?range=month|30d&limit=24
     * Version corrigée: utilise thumbnail_url persistée优先
     */
    app.get("/clips/top", async (req, res) => {
        const range = String(req.query.range || "month");
        const limit = Math.max(1, Math.min(50, Number(req.query.limit || 24)));
        const authUser = req.user || null;
        const myUserId = authUser?.id != null ? Number(authUser.id) : null;
        const now = Date.now();
        let startMs = 0;
        if (range === "30d") {
            startMs = now - 30 * 24 * 3600 * 1000;
        }
        else {
            const d = new Date(now);
            startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
        }
        // Total count
        const totalQ = await pool.query(`SELECT COUNT(*)::int AS n
       FROM bot_clips bc
       WHERE bc.deleted_ts IS NULL
         AND bc.hidden_by_streamer = false
         AND bc.created_ts >= $1`, [startMs]);
        const total = Number(totalQ.rows?.[0]?.n ?? 0);
        const base = apiBaseFromReq(req);
        // Clips avec thumbnail_url优先
        const r = await pool.query(`SELECT
         bc.id,
         bc.title,
         bc.created_ts,
         bc.vod_url,
         bc.at_sec,
         bc.pre_sec,
         bc.post_sec,
         bc.mp4_key,
         bc.thumbnail_url, -- ✅ AJOUT: colonne thumbnail_url

         s.slug AS streamer_slug,
         s.display_name AS streamer_display_name,
         s.user_id AS owner_user_id,

         COALESCE(cnt.cnt,0)::int AS likes_count,
         CASE WHEN ul.user_id IS NULL THEN false ELSE true END AS my_liked,

         CASE WHEN ua.user_id IS NOT NULL THEN true ELSE false END AS has_avatar

       FROM bot_clips bc
       JOIN streamers s ON s.id = bc.streamer_id

       LEFT JOIN (
         SELECT clip_id, COUNT(*)::int AS cnt
         FROM clip_likes
         GROUP BY clip_id
       ) cnt ON cnt.clip_id = bc.id

       LEFT JOIN clip_likes ul
         ON ul.clip_id = bc.id
        AND ul.user_id = $1

       LEFT JOIN user_avatars ua
         ON ua.user_id = s.user_id

       WHERE bc.deleted_ts IS NULL
         AND bc.hidden_by_streamer = false
         AND bc.created_ts >= $2

       ORDER BY COALESCE(cnt.cnt,0) DESC, bc.created_ts DESC, bc.id DESC
       LIMIT $3`, [myUserId, startMs, limit]);
        const clips = (r.rows || []).map((x) => {
            const at = Math.max(0, Number(x.at_sec || 0));
            const pre = Math.max(0, Number(x.pre_sec || 105));
            const post = Math.max(0, Number(x.post_sec || 15));
            const startSec = Math.max(0, at - pre);
            const durationSec = Math.max(1, pre + post);
            const ownerUserId = x.owner_user_id != null ? Number(x.owner_user_id) : null;
            const avatarUrl = ownerUserId && x.has_avatar ? `${base}/avatars/u/${ownerUserId}` : null;
            const mp4Key = String(x.mp4_key || "").trim();
            const clipUrl = mp4Key && r2Enabled() ? `${base}/public/clips/${Number(x.id)}/mp4?proxy=1` : null;
            return {
                id: Number(x.id),
                streamerSlug: String(x.streamer_slug || ""),
                streamerDisplayName: String(x.streamer_display_name || ""),
                ownerUserId,
                title: x.title ?? null,
                createdAtMs: Number(x.created_ts || 0),
                vodUrl: x.vod_url ?? null,
                startSec,
                durationSec,
                clipUrl,
                // ✅ FIX: thumbnail_url优先, fallback vers URL générée
                thumbUrl: x.thumbnail_url || `${base}/thumbs/clips/${Number(x.id)}.jpg`,
                likesCount: Number(x.likes_count || 0),
                myLiked: !!x.my_liked,
                avatarUrl,
            };
        });
        return res.json({ ok: true, total, clips });
    });
}
