// api/src/shared/clip_service.ts
// Service local pour la création de clips (API uniquement)
import { notifyStreamerOfFirstAutoClip } from "../lunaclip/notify_streamer.js";
/**
 * Au moment du !clip, snapshot la durée totale de la playlist HLS DVR.
 * Sur Rumble (MEDIA-SEQUENCE:1, full DVR), cette durée correspond à la
 * position exacte du !clip dans la playlist (live edge = !clip moment).
 * C'est la valeur la plus fiable pour at_sec : elle ne dépend pas de
 * live_started_at qui peut être décalé de plusieurs minutes.
 */
async function snapshotHlsPlaylistDuration(m3u8Url) {
    if (!/^https?:\/\//i.test(m3u8Url) || !/\.m3u8(\?|$)/i.test(m3u8Url))
        return null;
    // 3 tentatives avec timeout progressif (10s, 12s, 15s)
    for (let attempt = 1; attempt <= 3; attempt++) {
        const timeoutMs = 8_000 + attempt * 2_000;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const r = await fetch(m3u8Url, {
                signal: ctrl.signal,
                headers: {
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
                    "accept": "application/vnd.apple.mpegurl,application/x-mpegurl,*/*",
                },
            }).finally(() => clearTimeout(t));
            if (!r.ok) {
                console.warn(`[clip] snapshotHls attempt ${attempt}/3 HTTP=${r.status} url=${m3u8Url.slice(0, 80)}`);
                continue;
            }
            const text = await r.text();
            let total = 0;
            const re = /#EXTINF:([\d.]+)/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                const d = Number(m[1]);
                if (Number.isFinite(d) && d > 0)
                    total += d;
            }
            if (total > 0) {
                console.log(`[clip] snapshotHls OK attempt=${attempt} dur=${Math.floor(total)}s`);
                return Math.floor(total);
            }
            console.warn(`[clip] snapshotHls attempt ${attempt}/3 parsed 0 segments`);
        }
        catch (e) {
            console.warn(`[clip] snapshotHls attempt ${attempt}/3 error: ${e?.message || e}`);
        }
    }
    console.warn(`[clip] snapshotHls FAILED après 3 tentatives — fallback vers (now - liveStartedAt)`);
    return null;
}
const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
const LATENCY_PAD_SEC = 0; // Pas de compensation latence (cible: 1m45 avant / 15s après la commande)
const DEFAULT_PRE_SEC = 105; // 1m45 avant la commande/détection
const DEFAULT_POST_SEC = 15; // 15s après la commande/détection → clip total 2m00
async function dliveGql(query, variables) {
    const r = await fetch(DLIVE_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            origin: "https://dlive.tv",
            referer: "https://dlive.tv/",
        },
        body: JSON.stringify(variables ? { query, variables } : { query }),
    });
    if (!r.ok)
        throw new Error(`dlive_gql_http_${r.status}`);
    return (await r.json());
}
async function fetchLiveStart(displayName) {
    const query = "query UserLiveStart($name:String!){ userByDisplayName(displayname:$name){ username livestream{ createdAt permlink watchingCount } } }";
    const j = await dliveGql(query, { name: displayName });
    const ls = j?.data?.userByDisplayName?.livestream;
    if (!ls?.createdAt)
        return null;
    const createdAtMs = Number(ls.createdAt);
    if (!Number.isFinite(createdAtMs))
        return null;
    return { createdAtMs, permlink: String(ls.permlink || "") };
}
export async function getDliveChannelSlugForStreamer(pool, streamerId) {
    const r = await pool.query(`SELECT
       s.dlive_use_linked AS "useLinked",
       s.dlive_link_displayname AS "linkedDisplayname",
       pa.channel_slug AS "providerChannelSlug"
     FROM streamers s
     LEFT JOIN provider_accounts pa
       ON pa.provider='dlive'
      AND pa.assigned_to_streamer_id = s.id
     WHERE s.id=$1
     LIMIT 1`, [streamerId]);
    const row = r.rows?.[0] || null;
    if (!row)
        return { channelSlug: null, sourceDisplayname: null };
    const useLinked = !!row.useLinked;
    const linked = row.linkedDisplayname ? String(row.linkedDisplayname) : "";
    const provider = row.providerChannelSlug ? String(row.providerChannelSlug) : "";
    const channelSlug = useLinked && linked ? linked : provider;
    // ✅ Pour LunaLive radio, on snapshotne la source réelle (displayname uniquement)
    const sourceDisplayname = useLinked && linked ? linked : null;
    return {
        channelSlug: channelSlug.trim() ? channelSlug.trim() : null,
        sourceDisplayname
    };
}
let ensured = false;
const TS_MS_THRESHOLD = 100000000000; // 1e11
async function ensureBotClipsTable(pool) {
    if (ensured)
        return;
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_clips (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL,
      title TEXT,
      author TEXT,
      at_sec INTEGER NOT NULL,
      pre_sec INTEGER NOT NULL DEFAULT 105,
      post_sec INTEGER NOT NULL DEFAULT 15,
      created_ts BIGINT NOT NULL,
      vod_url TEXT,
      vod_permlink TEXT,
      vod_created_ts BIGINT
    );
  `);
    await pool.query(`ALTER TABLE bot_clips ALTER COLUMN created_ts TYPE BIGINT USING created_ts::bigint;`).catch(() => { });
    await pool.query(`ALTER TABLE bot_clips ALTER COLUMN vod_created_ts TYPE BIGINT USING vod_created_ts::bigint;`).catch(() => { });
    // ✅ Nouvelle colonne : timestamp exact du début du live courant au moment du clip
    // Permet au vod_linker de trouver la VOD exacte sans estimation approximative
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_start_ts BIGINT;`);
    // ✅ Nouvelle colonne : permlink du live pour matching exact VOD
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_permlink TEXT;`);
    // ✅ source LunaLive radio (snapshot)
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS source_displayname TEXT;`);
    // Index pour recherche rapide par permlink
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_clips_live_permlink ON bot_clips(live_permlink) WHERE live_permlink IS NOT NULL;`);
    // Index pour recherche rapide par source displayname
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_clips_source_displayname ON bot_clips(source_displayname) WHERE source_displayname IS NOT NULL;`);
    await pool.query(`UPDATE bot_clips SET created_ts = created_ts * 1000 WHERE created_ts < $1`, [TS_MS_THRESHOLD]).catch(() => { });
    await pool.query(`UPDATE bot_clips SET vod_created_ts = vod_created_ts * 1000 WHERE vod_created_ts IS NOT NULL AND vod_created_ts < $1`, [TS_MS_THRESHOLD]).catch(() => { });
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_created
      ON bot_clips(streamer_id, created_ts DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_vod_pending
      ON bot_clips(streamer_id)
      WHERE vod_url IS NULL;
  `);
    ensured = true;
}
const CLIPS_LIMIT_NO_SUB = 10;
async function getStreamerOwnerUserId(pool, streamerId) {
    const r = await pool.query(`SELECT user_id FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
    const id = Number(r.rows?.[0]?.user_id || 0);
    return id > 0 ? id : null;
}
async function hasActiveStreamerSub(pool, userId) {
    const uid = Number(userId || 0);
    if (!uid)
        return false;
    try {
        const r = await pool.query(`SELECT 1 FROM user_subscriptions us
       WHERE us.user_id=$1 AND us.plan_code='streamer'
         AND us.status IN ('active','trialing')
         AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
       LIMIT 1`, [uid]);
        return !!r.rows?.[0];
    }
    catch {
        return false;
    }
}
async function streamerHasUnlimitedClips(pool, streamerId) {
    const ownerId = await getStreamerOwnerUserId(pool, streamerId);
    if (!ownerId)
        return false;
    return hasActiveStreamerSub(pool, ownerId);
}
export async function addClipPg(p) {
    const { pool, streamerId } = p;
    await ensureBotClipsTable(pool);
    const nowMs = Date.now();
    const at = Math.max(0, Math.floor(p.atSec));
    const pre = Math.max(0, Math.floor(p.preSec));
    const post = Math.max(0, Math.floor(p.postSec));
    const unlimited = await streamerHasUnlimitedClips(pool, streamerId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const dup = await client.query(`SELECT id FROM bot_clips
       WHERE streamer_id=$1 AND ABS(at_sec - $2) <= 20 AND created_ts >= $3
       LIMIT 1`, [streamerId, at, nowMs - 6 * 3600 * 1000]);
        if (dup.rows?.[0]?.id) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "duplicate" };
        }
        const platform = p.platform || "dlive";
        const vodUrl = p.vodUrl || null;
        const ins = await client.query(`INSERT INTO bot_clips(streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts, live_start_ts, live_permlink, source_displayname, platform, vod_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`, [streamerId, p.title, p.author, at, pre, post, nowMs, p.liveStartTs, p.livePermlink, p.sourceDisplayname, platform, vodUrl]);
        const newId = Number(ins.rows?.[0]?.id || 0);
        if (!unlimited) {
            await client.query(`WITH to_del AS (
           SELECT id FROM bot_clips WHERE streamer_id=$1
           ORDER BY created_ts DESC OFFSET $2
         )
         DELETE FROM bot_clips WHERE id IN (SELECT id FROM to_del)`, [streamerId, CLIPS_LIMIT_NO_SUB]);
        }
        await client.query("COMMIT");
        return { ok: true, id: newId };
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
/**
 * Crée un clip auto pour un streamer (trigger detector)
 * Force toujours 75s avant / 15s après, ignore les paramètres externes
 */
export async function createAutoClipForStreamer(p) {
    // 🎯 Force toujours 75/15 pour les auto-clips, peu importe le payload
    return createClipForStreamer({
        pool: p.pool,
        streamerId: p.streamerId,
        title: p.title,
        author: p.author,
        preSec: DEFAULT_PRE_SEC, // 75s fixe
        postSec: DEFAULT_POST_SEC, // 15s fixe
        forcedOffsetSec: p.forcedOffsetSec,
    });
}
/**
 * Crée un clip pour un streamer (commande !clip ou création automatique)
 * Utilise la logique unifiée pour les deux cas d'usage
 */
export async function createClipForStreamer(p) {
    const { pool, streamerId, title, author, preSec, postSec, forcedOffsetSec } = p;
    try {
        const platform = await getStreamerPlatform(pool, streamerId);
        // ── Rumble path ────────────────────────────────────────────────────────────
        if (platform === "rumble") {
            const rumble = await getRumbleLiveInfoForClip(pool, streamerId);
            if (!rumble)
                return { ok: false, reason: "live_not_active" };
            // Source VOD : pendant le live → hls_url (DVR live) ; après → vod_mp4_url permanent
            const sourceUrl = rumble.isLive
                ? rumble.hlsUrl
                : (rumble.vodMp4Url || rumble.vodHlsUrl || rumble.hlsUrl);
            if (!sourceUrl)
                return { ok: false, reason: rumble.isLive ? "live_not_active" : "vod_not_ready" };
            // Calcul de l'offset (= position du !clip dans la playlist HLS).
            //
            // ❶ Méthode préférée : snapshot la playlistDuration en LIVE — la live
            //    edge à l'instant du !clip = playlistDuration. C'est la valeur la
            //    plus fiable car indépendante de live_started_at (potentiellement
            //    décalé de plusieurs minutes par le poller).
            // ❷ Fallback : forcedOffsetSec (commande !clip avec offset explicite).
            // ❸ Fallback : (now - live_started_at) si playlist injoignable.
            let offset;
            if (forcedOffsetSec !== undefined) {
                offset = Math.max(0, forcedOffsetSec);
            }
            else {
                // Tentative snapshot playlistDuration depuis le HLS DVR
                const snap = rumble.isLive && sourceUrl ? await snapshotHlsPlaylistDuration(sourceUrl) : null;
                if (snap != null) {
                    offset = snap;
                }
                else if (rumble.liveStartedAtMs) {
                    const nowSec = Math.floor(Date.now() / 1000);
                    const startSec = Math.floor(rumble.liveStartedAtMs / 1000);
                    offset = Math.max(0, nowSec - startSec);
                }
                else {
                    offset = 0;
                }
            }
            const isAutoClip = !author || author === "lunaclip";
            const finalPreSec = isAutoClip ? DEFAULT_PRE_SEC : Math.min(Math.max(0, Math.floor(preSec || DEFAULT_PRE_SEC)), 300);
            const finalPostSec = isAutoClip ? DEFAULT_POST_SEC : Math.min(Math.max(0, Math.floor(postSec || DEFAULT_POST_SEC)), 60);
            const res = await addClipPg({
                pool,
                streamerId,
                title: title || rumble.title || null,
                author: author || null,
                atSec: offset,
                preSec: finalPreSec,
                postSec: finalPostSec,
                liveStartTs: rumble.liveStartedAtMs || Date.now(),
                livePermlink: rumble.liveId || "",
                platform: "rumble",
                vodUrl: sourceUrl, // HLS live pendant le stream, MP4 VOD après
            });
            if (!res.ok && res.reason === "duplicate")
                return { ok: false, reason: "duplicate" };
            if (res.ok && (author || null) === "lunaclip") {
                void notifyStreamerOfFirstAutoClip(pool, streamerId, res.id);
            }
            return res;
        }
        // ── DLive path (existant) ──────────────────────────────────────────────────
        const { channelSlug, sourceDisplayname } = await getDliveChannelSlugForStreamer(pool, streamerId);
        if (!channelSlug) {
            return { ok: false, reason: "streamer_dlive_not_found" };
        }
        const live = await fetchLiveStart(channelSlug).catch(() => null);
        if (!live) {
            return { ok: false, reason: "live_not_active" };
        }
        let offset;
        if (forcedOffsetSec !== undefined) {
            offset = Math.max(0, forcedOffsetSec);
        }
        else {
            const nowSec = Math.floor(Date.now() / 1000);
            const startSec = Math.floor(live.createdAtMs / 1000);
            offset = Math.max(0, nowSec - startSec + LATENCY_PAD_SEC);
        }
        const isAutoClip = !p.author || p.author === "lunaclip";
        let finalPreSec, finalPostSec;
        if (isAutoClip) {
            finalPreSec = DEFAULT_PRE_SEC;
            finalPostSec = DEFAULT_POST_SEC;
        }
        else {
            finalPreSec = Math.min(Math.max(0, Math.floor(preSec || DEFAULT_PRE_SEC)), 300);
            finalPostSec = Math.min(Math.max(0, Math.floor(postSec || DEFAULT_POST_SEC)), 60);
        }
        const res = await addClipPg({
            pool,
            streamerId,
            title: title || null,
            author: author || null,
            atSec: offset,
            preSec: finalPreSec,
            postSec: finalPostSec,
            liveStartTs: live.createdAtMs,
            livePermlink: live.permlink,
            sourceDisplayname,
            platform: "dlive",
        });
        if (!res.ok && res.reason === "duplicate") {
            return { ok: false, reason: "duplicate" };
        }
        if (res.ok && (p.author || null) === "lunaclip") {
            void notifyStreamerOfFirstAutoClip(pool, streamerId, res.id);
        }
        return res;
    }
    catch (e) {
        return { ok: false, reason: e?.message || "unknown_error" };
    }
}
async function getStreamerPlatform(pool, streamerId) {
    const r = await pool.query(`SELECT platform FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
    return r.rows?.[0]?.platform ? String(r.rows[0].platform) : null;
}
async function getRumbleLiveInfoForClip(pool, streamerId) {
    const r = await pool.query(`SELECT is_live, hls_url, vod_mp4_url, vod_hls_url, live_id, live_started_at, title
     FROM streamer_rumble_info WHERE streamer_id=$1 LIMIT 1`, [streamerId]);
    const row = r.rows?.[0];
    if (!row)
        return null;
    return {
        isLive: !!row.is_live,
        hlsUrl: row.hls_url ? String(row.hls_url) : null,
        vodMp4Url: row.vod_mp4_url ? String(row.vod_mp4_url) : null,
        vodHlsUrl: row.vod_hls_url ? String(row.vod_hls_url) : null,
        liveId: row.live_id ? String(row.live_id) : null,
        liveStartedAtMs: row.live_started_at ? Number(row.live_started_at) : null,
        title: row.title ? String(row.title) : null,
    };
}
export function formatClipTime(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return ((h > 0 ? String(h).padStart(2, "0") + ":" : "") +
        String(m).padStart(2, "0") +
        ":" +
        String(sec).padStart(2, "0"));
}
export function normalizeClipTitle(s) {
    return String(s || "").trim().slice(0, 140);
}
