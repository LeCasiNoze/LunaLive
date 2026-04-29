// api/src/rumble_poller.ts
// Polling Rumble pour tous les streamers ayant un rumble_account assigné.
import { pool } from "./db.js";
import { fetchRumbleLiveInfo, fetchRumbleLiveInfoFromUsername, listAssignedRumbleStreamers, listScrapedRumbleStreamers, resolveRumbleVodFromVid, } from "./rumble.js";
import { notifyFollowersGoLive } from "./notify_go_live.js";
/**
 * Archive un live terminé dans rumble_vods + programme la résolution du VOD permanent.
 * Rumble convertit le live en VOD permanent en quelques minutes — on retry à 5/15/45min puis 2h.
 */
async function archiveAndResolveVod(streamerId, videoId, videoIdNumeric, title, thumbnailUrl, startedAtMs) {
    // Insert dans l'historique (ou no-op si déjà présent — un live unique par video_id)
    const startedAtIso = startedAtMs && Number.isFinite(startedAtMs) ? new Date(startedAtMs).toISOString() : null;
    const durationSec = startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : null;
    await pool.query(`INSERT INTO rumble_vods (streamer_id, video_id, video_id_numeric, title, thumbnail_url, started_at, ended_at, duration_sec)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
     ON CONFLICT (streamer_id, video_id) DO NOTHING`, [streamerId, videoId, videoIdNumeric, title, thumbnailUrl, startedAtIso, durationSec]).catch((e) => console.warn("[rumble-poller] archive VOD failed", e?.message || e));
    // Schedule resolve
    const delays = [5 * 60_000, 15 * 60_000, 45 * 60_000, 2 * 60 * 60_000];
    let attempt = 0;
    const tryOne = async () => {
        attempt++;
        try {
            const { mp4Url, hlsUrl } = await resolveRumbleVodFromVid(videoId);
            await pool.query(`UPDATE streamer_rumble_info
         SET vod_resolve_attempts = COALESCE(vod_resolve_attempts, 0) + 1
         WHERE streamer_id = $1`, [streamerId]).catch(() => { });
            if (mp4Url) {
                await pool.query(`UPDATE streamer_rumble_info
           SET vod_mp4_url = $2, vod_hls_url = $3, vod_resolved_at = NOW()
           WHERE streamer_id = $1`, [streamerId, mp4Url, hlsUrl]);
                await pool.query(`UPDATE rumble_vods
           SET vod_mp4_url = $3, vod_hls_url = $4, vod_resolved_at = NOW()
           WHERE streamer_id = $1 AND video_id = $2`, [streamerId, videoId, mp4Url, hlsUrl]).catch(() => { });
                console.log(`[rumble-poller] VOD résolu streamerId=${streamerId} videoId=${videoId} attempt=${attempt}`);
                return;
            }
        }
        catch (e) {
            console.warn(`[rumble-poller] VOD resolve attempt=${attempt} streamerId=${streamerId}`, e?.message || e);
        }
        if (attempt < delays.length) {
            setTimeout(() => void tryOne(), delays[attempt]);
        }
        else {
            console.warn(`[rumble-poller] VOD resolve abandoned streamerId=${streamerId} videoId=${videoId}`);
        }
    };
    setTimeout(() => void tryOne(), delays[0]);
}
const INTERVAL_MS = Number(process.env.RUMBLE_POLL_INTERVAL_MS || 30_000);
const lastState = new Map();
// Hystérésis désactivée (=1) : détection offline immédiate. Le check "no HLS"
// dans fetchRumbleLiveInfoFromUsername est déjà fiable pour distinguer placeholder vs vraie fin.
const OFFLINE_HYSTERESIS = 1;
async function updateRumbleInfo(streamerId, slug, isLive, title, viewersCount, hlsUrl, videoUrl, thumbnailUrl, videoId, videoIdNumeric, io, liveCreatedAt // ISO string from Rumble API (created_on)
) {
    const now = new Date();
    const liveStartedAtMs = liveCreatedAt
        ? (() => { try {
            const ms = new Date(liveCreatedAt).getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        catch {
            return null;
        } })()
        : null;
    const room = `stream:${slug.toLowerCase()}`;
    const prev = lastState.get(streamerId) ?? { isLive: false, title: null, offlineStreak: 0 };
    const wasLive = prev.isLive;
    // Hystérésis : si on était live et qu'on reçoit un tick offline, on attend
    // OFFLINE_HYSTERESIS ticks consécutifs avant de réellement basculer offline.
    // Évite le clignotement quand Rumble glitche 1 tick.
    let effectiveIsLive = isLive;
    if (!isLive && wasLive) {
        const newStreak = prev.offlineStreak + 1;
        if (newStreak < OFFLINE_HYSTERESIS) {
            console.log(`[rumble-poller] ${slug}: tick offline ${newStreak}/${OFFLINE_HYSTERESIS} — on reste live (hystérésis)`);
            lastState.set(streamerId, { isLive: true, title: prev.title, offlineStreak: newStreak });
            return; // pas d'update DB ce tick
        }
        // streak atteint → on bascule offline
    }
    if (effectiveIsLive) {
        await pool.query(`UPDATE streamers
       SET is_live = true,
           live_started_at = COALESCE(live_started_at, $2),
           title = COALESCE($3, title, 'Live sur Rumble'),
           viewers = COALESCE($4, viewers),
           updated_at = NOW()
       WHERE id = $1`, [streamerId, now, title, viewersCount]);
        await pool.query(`INSERT INTO streamer_rumble_info (
         streamer_id, is_live, title, viewers_count,
         hls_url, video_url, thumbnail_url, live_id, live_video_id_numeric, live_started_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (streamer_id) DO UPDATE SET
         is_live = EXCLUDED.is_live,
         title = EXCLUDED.title,
         viewers_count = EXCLUDED.viewers_count,
         hls_url = EXCLUDED.hls_url,
         video_url = EXCLUDED.video_url,
         thumbnail_url = EXCLUDED.thumbnail_url,
         live_id = EXCLUDED.live_id,
         live_video_id_numeric = EXCLUDED.live_video_id_numeric,
         live_started_at = EXCLUDED.live_started_at,
         updated_at = NOW()`, [streamerId, isLive, title, viewersCount, hlsUrl, videoUrl, thumbnailUrl, videoId, videoIdNumeric, liveStartedAtMs]);
        if (!wasLive) {
            console.log(`[rumble-poller] ${slug} went LIVE: "${title}"`);
            await pool.query(`INSERT INTO live_sessions (streamer_id, started_at)
         VALUES ($1, NOW())
         ON CONFLICT (streamer_id) WHERE ended_at IS NULL
         DO NOTHING`, [streamerId]).catch(() => { });
            io?.to(room).emit("stream:viewers", {
                slug,
                isLive: true,
                viewers: viewersCount ?? 0,
            });
            await notifyFollowersGoLive(io, streamerId);
        }
        else {
            io?.to(room).emit("stream:viewers", {
                slug,
                isLive: true,
                viewers: viewersCount ?? 0,
            });
        }
    }
    else {
        await pool.query(`UPDATE streamers
       SET is_live = false,
           title = 'Hors ligne',
           viewers = 0,
           live_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1`, [streamerId]);
        // NE PAS écraser live_id (utile pour les VODs)
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
        if (wasLive) {
            console.log(`[rumble-poller] ${slug} went OFFLINE`);
            // Archive + programme la résolution du VOD permanent (5min, 15min, 45min, 2h)
            // On lit l'état figé du live qui vient de finir avant qu'il soit overwrite par le tick offline.
            const r = await pool.query(`SELECT live_id, live_video_id_numeric, title, thumbnail_url, live_started_at
         FROM streamer_rumble_info WHERE streamer_id = $1`, [streamerId]).catch(() => null);
            const row = r?.rows?.[0];
            const lastVid = row?.live_id ? String(row.live_id) : null;
            if (lastVid) {
                await archiveAndResolveVod(streamerId, lastVid, row.live_video_id_numeric ? String(row.live_video_id_numeric) : null, row.title ? String(row.title) : null, row.thumbnail_url ? String(row.thumbnail_url) : null, row.live_started_at ? Number(row.live_started_at) : null);
            }
            await pool.query(`UPDATE live_sessions SET ended_at = NOW()
         WHERE streamer_id = $1 AND ended_at IS NULL`, [streamerId]).catch(() => { });
            await pool.query(`UPDATE viewer_sessions
         SET ended_at = COALESCE(last_heartbeat_at, NOW())
         WHERE streamer_id = $1 AND ended_at IS NULL`, [streamerId]).catch(() => { });
            io?.to(room).emit("stream:viewers", {
                slug,
                isLive: false,
                viewers: 0,
            });
        }
    }
    lastState.set(streamerId, { isLive: effectiveIsLive, title, offlineStreak: effectiveIsLive ? 0 : (prev.offlineStreak + 1) });
}
async function pollOne(streamerId, slug, username, apiKey, io) {
    try {
        const info = await fetchRumbleLiveInfo(username, apiKey);
        await updateRumbleInfo(streamerId, slug, info.isLive, info.title, info.viewersCount, info.hlsUrl, info.videoUrl, info.thumbnailUrl, info.videoId, info.videoIdNumeric, io, info.createdAt);
    }
    catch (e) {
        console.error(`[rumble-poller] Error polling ${slug}:`, e);
    }
}
async function pollOneScraped(streamerId, slug, username, io) {
    try {
        const info = await fetchRumbleLiveInfoFromUsername(username, streamerId);
        await updateRumbleInfo(streamerId, slug, info.isLive, info.title, info.viewersCount, info.hlsUrl, info.videoUrl, info.thumbnailUrl, info.videoId, info.videoIdNumeric, io, info.createdAt);
    }
    catch (e) {
        console.error(`[rumble-poller] Error scrape-polling ${slug}:`, e);
    }
}
async function pollAll(io) {
    const [accounts, scraped] = await Promise.all([
        listAssignedRumbleStreamers().catch((e) => {
            console.error("[rumble-poller] listAssignedRumbleStreamers failed", e);
            return [];
        }),
        listScrapedRumbleStreamers().catch((e) => {
            console.error("[rumble-poller] listScrapedRumbleStreamers failed", e);
            return [];
        }),
    ]);
    if (accounts.length === 0 && scraped.length === 0)
        return;
    await Promise.all([
        ...accounts.map((a) => pollOne(a.streamerId, a.slug, a.username, a.apiKey, io)),
        ...scraped.map((s) => pollOneScraped(s.streamerId, s.slug, s.username, io)),
    ]);
    // Rotation auto de la radio (id=32) : si le streamer actuellement assigné
    // n'est plus en live, on bascule sur un autre Rumble live (sticky-then-pick).
    await rotateRadioTarget(io).catch((e) => console.warn("[rumble-poller] rotateRadio failed", e?.message || e));
}
const RADIO_STREAMER_ID = 32;
const RADIO_SLUG = "lunalive";
/**
 * Si la radio (id=32, slug=lunalive) est en mode platform=rumble,
 * - Si la radio est elle-même live (sa source est toujours en stream) → keep
 * - Sinon, cherche un autre streamer Rumble live et bascule dessus
 * - Si personne d'autre n'est live, garde le pseudo courant (la source pourrait
 *   revenir live, et le relay continuera à le tester)
 *
 * On ne reset JAMAIS rumble_username à NULL (sinon la radio sort du polling et
 * ne peut plus jamais redétecter sa source).
 */
async function rotateRadioTarget(io) {
    const radioRow = await pool.query(`SELECT s.platform, s.rumble_username, ri.is_live, ri.viewers_count
     FROM streamers s
     LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
     WHERE s.id = $1 LIMIT 1`, [RADIO_STREAMER_ID]);
    const radio = radioRow.rows[0];
    if (!radio || String(radio.platform || "").toLowerCase() !== "rumble")
        return;
    const currentUsername = radio.rumble_username ? String(radio.rumble_username) : null;
    const radioIsLive = !!radio.is_live;
    const radioViewers = Number(radio.viewers_count || 0);
    // Sticky : la source actuelle est encore live → keep
    // (sauf si rumble_username=null, car alors is_live est juste un état figé
    // de la précédente source qui n'est plus polled)
    if (radioIsLive && currentUsername)
        return;
    // La radio rotate parmi des créateurs Rumble externes curated (table
    // rumble_radio_sources) — ekanos, vitapvpey, put4, etc. — qui ne sont PAS
    // dans la table streamers. Stratégie : cycler à travers la liste à chaque
    // tick où la source courante n'est pas live. Le poll suivant détermine si
    // la nouvelle source est live ; sinon on rebascule encore une fois au tick
    // d'après. Naturellement la radio finit sur quelqu'un de vraiment live.
    void radioViewers;
    const sources = await pool.query(`SELECT username FROM rumble_radio_sources WHERE active = TRUE ORDER BY id ASC`);
    if (sources.rows.length === 0)
        return;
    const usernames = sources.rows.map((r) => String(r.username));
    let nextIndex = 0;
    if (currentUsername) {
        const i = usernames.findIndex((u) => u.toLowerCase() === currentUsername.toLowerCase());
        nextIndex = i >= 0 ? (i + 1) % usernames.length : 0;
    }
    const newUsername = usernames[nextIndex];
    if (!newUsername)
        return;
    if (newUsername.toLowerCase() === (currentUsername || "").toLowerCase())
        return;
    await pool.query(`UPDATE streamers SET rumble_username = $1, updated_at = NOW() WHERE id = $2`, [newUsername, RADIO_STREAMER_ID]);
    console.log(`[rumble-poller] radio rotation: ${currentUsername || "(aucun)"} → ${newUsername}`);
    void pollOneScraped(RADIO_STREAMER_ID, RADIO_SLUG, newUsername, io);
}
async function ensureRumbleInfoColumns() {
    await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_id TEXT;`).catch(() => { });
    await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_started_at BIGINT;`).catch(() => { });
    await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_video_id_numeric TEXT;`).catch(() => { });
}
export function startRumblePoller(io) {
    ensureRumbleInfoColumns().catch(e => console.error("[rumble-poller] ensureColumns failed", e));
    console.log(`[rumble-poller] Starting polling for all assigned Rumble accounts every ${INTERVAL_MS}ms`);
    pollAll(io).catch(e => console.error("[rumble-poller] first tick failed", e));
    const interval = setInterval(() => pollAll(io).catch(e => console.error("[rumble-poller] tick failed", e)), INTERVAL_MS);
    return () => {
        clearInterval(interval);
        console.log("[rumble-poller] Stopped");
    };
}
