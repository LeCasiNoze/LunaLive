// api/src/rumble_poller.ts
// Polling Rumble pour LeCasiNoze uniquement
import { pool } from "./db.js";
import { fetchLeCasiNozeRumbleInfo } from "./rumble.js";
import { notifyFollowersGoLive } from "./notify_go_live.js";
const INTERVAL_MS = Number(process.env.RUMBLE_POLL_INTERVAL_MS || 30_000);
// Streamer cible : LeCasiNoze
const LE_CASINOZE_SLUG = "lecasinoze"; // slug LunaLive de LeCasiNoze
let lastLiveState = false;
let lastTitle = null;
async function getStreamerIdBySlug(slug) {
    const r = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
    const id = r.rows?.[0]?.id;
    return id != null ? Number(id) : null;
}
async function updateRumbleInfo(streamerId, isLive, title, viewersCount, hlsUrl, videoUrl, thumbnailUrl, videoId, io, liveCreatedAt // ISO string from Rumble API (created_on)
) {
    const now = new Date();
    // Convertit created_on en ms pour le vod_linker (at_sec calculation)
    const liveStartedAtMs = liveCreatedAt
        ? (() => { try {
            const ms = new Date(liveCreatedAt).getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        catch {
            return null;
        } })()
        : null;
    const slug = LE_CASINOZE_SLUG;
    const room = `stream:${slug.toLowerCase()}`;
    const wasLive = lastLiveState;
    if (isLive) {
        // Mettre à jour streamers
        await pool.query(`UPDATE streamers
       SET is_live = true,
           live_started_at = COALESCE(live_started_at, $2),
           title = COALESCE($3, title, 'Live sur Rumble'),
           viewers = COALESCE($4, viewers),
           updated_at = NOW()
       WHERE id = $1`, [streamerId, now, title, viewersCount]);
        // Stocker les infos Rumble
        await pool.query(`INSERT INTO streamer_rumble_info (
         streamer_id, is_live, title, viewers_count,
         hls_url, video_url, thumbnail_url, live_id, live_started_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (streamer_id) DO UPDATE SET
         is_live = EXCLUDED.is_live,
         title = EXCLUDED.title,
         viewers_count = EXCLUDED.viewers_count,
         hls_url = EXCLUDED.hls_url,
         video_url = EXCLUDED.video_url,
         thumbnail_url = EXCLUDED.thumbnail_url,
         live_id = EXCLUDED.live_id,
         live_started_at = EXCLUDED.live_started_at,
         updated_at = NOW()`, [streamerId, isLive, title, viewersCount, hlsUrl, videoUrl, thumbnailUrl, videoId, liveStartedAtMs]);
        // ── Transition OFF → ON ──────────────────────────────────────────────────
        if (!wasLive) {
            console.log(`[rumble-poller] ${slug} went LIVE: "${title}"`);
            // Ouvrir une live_session (comme DLive)
            await pool.query(`INSERT INTO live_sessions (streamer_id, started_at)
         VALUES ($1, NOW())
         ON CONFLICT (streamer_id) WHERE ended_at IS NULL
         DO NOTHING`, [streamerId]).catch(() => { });
            // Émettre sur le socket room (fait apparaître dans la liste Lives)
            io?.to(room).emit("stream:viewers", {
                slug,
                isLive: true,
                viewers: viewersCount ?? 0,
            });
            // Notifier les followers (toast + push)
            await notifyFollowersGoLive(io, streamerId);
        }
        else {
            // Juste update viewers
            io?.to(room).emit("stream:viewers", {
                slug,
                isLive: true,
                viewers: viewersCount ?? 0,
            });
        }
    }
    else {
        // Mettre à jour streamers
        await pool.query(`UPDATE streamers
       SET is_live = false,
           title = 'Hors ligne',
           viewers = 0,
           live_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1`, [streamerId]);
        // Mettre à jour les infos Rumble — NE PAS écraser live_id (utile pour les VODs)
        await pool.query(`INSERT INTO streamer_rumble_info (
         streamer_id, is_live, title, viewers_count,
         hls_url, video_url, thumbnail_url, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (streamer_id) DO UPDATE SET
         is_live = EXCLUDED.is_live,
         title = EXCLUDED.title,
         viewers_count = EXCLUDED.viewers_count,
         hls_url = EXCLUDED.hls_url,
         video_url = EXCLUDED.video_url,
         thumbnail_url = EXCLUDED.thumbnail_url,
         updated_at = NOW()`, [streamerId, isLive, null, null, null, null, null]);
        // ── Transition ON → OFF ──────────────────────────────────────────────────
        if (wasLive) {
            console.log(`[rumble-poller] ${slug} went OFFLINE`);
            // Fermer la live_session (comme DLive)
            await pool.query(`UPDATE live_sessions SET ended_at = NOW()
         WHERE streamer_id = $1 AND ended_at IS NULL`, [streamerId]).catch(() => { });
            // Fermer les viewer_sessions encore ouvertes
            await pool.query(`UPDATE viewer_sessions
         SET ended_at = COALESCE(last_heartbeat_at, NOW())
         WHERE streamer_id = $1 AND ended_at IS NULL`, [streamerId]).catch(() => { });
            // Émettre offline sur le socket room
            io?.to(room).emit("stream:viewers", {
                slug,
                isLive: false,
                viewers: 0,
            });
        }
    }
    lastLiveState = isLive;
    lastTitle = title;
}
async function pollLeCasiNoze(io) {
    const streamerId = await getStreamerIdBySlug(LE_CASINOZE_SLUG);
    if (!streamerId) {
        console.error(`[rumble-poller] Streamer ${LE_CASINOZE_SLUG} not found`);
        return;
    }
    try {
        const info = await fetchLeCasiNozeRumbleInfo();
        await updateRumbleInfo(streamerId, info.isLive, info.title, info.viewersCount, info.hlsUrl, info.videoUrl, info.thumbnailUrl, info.videoId, io, info.createdAt);
    }
    catch (e) {
        console.error(`[rumble-poller] Error polling ${LE_CASINOZE_SLUG}:`, e);
        // Ne pas re-tenter des appels DB ici — si la DB est down, ça crasherait le process
    }
}
async function ensureRumbleInfoColumns() {
    await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_id TEXT;`).catch(() => { });
    await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_started_at BIGINT;`).catch(() => { });
}
export function startRumblePoller(io) {
    // Assure les colonnes supplémentaires au démarrage
    ensureRumbleInfoColumns().catch(e => console.error("[rumble-poller] ensureColumns failed", e));
    console.log(`[rumble-poller] Starting polling for ${LE_CASINOZE_SLUG} every ${INTERVAL_MS}ms`);
    // Premier poll immédiat
    pollLeCasiNoze(io).catch(e => console.error("[rumble-poller] first tick failed", e));
    // Polling régulier
    const interval = setInterval(() => pollLeCasiNoze(io).catch(e => console.error("[rumble-poller] tick failed", e)), INTERVAL_MS);
    return () => {
        clearInterval(interval);
        console.log("[rumble-poller] Stopped");
    };
}
