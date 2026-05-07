// api/src/bot_clips/store.ts
import { pool } from "../db.js";
let ensured = false;
export async function ensureBotClips() {
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
      created_ts BIGINT NOT NULL,         -- ms
      vod_url TEXT,
      vod_permlink TEXT,
      vod_created_ts BIGINT               -- ms
    );
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS hidden_by_streamer BOOLEAN NOT NULL DEFAULT false;
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS deleted_ts BIGINT;
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS mp4_key TEXT;
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS mp4_ready_ts BIGINT;
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS mp4_size BIGINT;
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS mp4_error TEXT;
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS mp4_rendering BOOLEAN NOT NULL DEFAULT false;
  `);
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_start_ts BIGINT;`);
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_permlink TEXT;`);
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS source_displayname TEXT;`);
    await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'dlive';`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_clips_live_permlink ON bot_clips(live_permlink) WHERE live_permlink IS NOT NULL;`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_clips_source_displayname ON bot_clips(source_displayname) WHERE source_displayname IS NOT NULL;`);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_created
      ON bot_clips(streamer_id, created_ts DESC, id DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_vod_pending
      ON bot_clips(streamer_id)
      WHERE vod_url IS NULL AND deleted_ts IS NULL AND hidden_by_streamer = false;
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_deleted
      ON bot_clips(streamer_id, deleted_ts);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_mp4_pending
      ON bot_clips(created_ts DESC, id DESC)
      WHERE deleted_ts IS NULL
        AND hidden_by_streamer = false
        AND vod_url IS NOT NULL
        AND (mp4_key IS NULL OR mp4_key = '')
        AND mp4_rendering = false;
  `);
    ensured = true;
}
/**
 * LIST dashboard (module bot):
 * - visible uniquement si pas hidden_by_streamer
 * - et pas deleted_ts
 */
export async function listClipsForStreamer(streamerId, limit = 200) {
    const lim = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 200)));
    const r = await pool.query(`SELECT id, streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts,
            vod_url, vod_permlink, vod_created_ts,
            hidden_by_streamer, deleted_ts,
            mp4_key, mp4_ready_ts, mp4_size, mp4_error, mp4_rendering
     FROM bot_clips
     WHERE streamer_id=$1
       AND deleted_ts IS NULL
       AND hidden_by_streamer = false
     ORDER BY created_ts DESC, id DESC
     LIMIT $2`, [streamerId, lim]);
    return r.rows;
}
export async function getClipForStreamer(streamerId, clipId) {
    const r = await pool.query(`SELECT id, streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts,
            vod_url, vod_permlink, vod_created_ts,
            hidden_by_streamer, deleted_ts,
            mp4_key, mp4_ready_ts, mp4_size, mp4_error, mp4_rendering
     FROM bot_clips
     WHERE streamer_id=$1 AND id=$2
       AND deleted_ts IS NULL
     LIMIT 1`, [streamerId, clipId]);
    return r.rows?.[0] ?? null;
}
/**
 * IMPORTANT: "Supprimer" depuis le module bot = juste HIDE (pas delete DB)
 */
export async function removeClipForStreamer(streamerId, clipId) {
    const r = await pool.query(`UPDATE bot_clips
     SET hidden_by_streamer = true
     WHERE streamer_id=$1 AND id=$2
       AND deleted_ts IS NULL`, [streamerId, clipId]);
    return Number(r.rowCount || 0);
}
/**
 * Delete "public" (page streamer) = deleted_ts + hide
 */
export async function markClipDeletedById(clipId, nowTs) {
    const r = await pool.query(`UPDATE bot_clips
     SET deleted_ts = $2,
         hidden_by_streamer = true
     WHERE id = $1 AND deleted_ts IS NULL`, [clipId, nowTs]);
    return Number(r.rowCount || 0);
}
export async function listStreamersWithPendingVodClips() {
    const r = await pool.query(`SELECT DISTINCT streamer_id
     FROM bot_clips
     WHERE vod_url IS NULL
       AND deleted_ts IS NULL
       AND hidden_by_streamer = false
     LIMIT 1000`);
    return (r.rows || []).map((x) => Number(x.streamer_id));
}
export async function listPendingClipsForStreamer(streamerId, limit = 500) {
    const lim = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 500)));
    const r = await pool.query(`SELECT id, streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts,
            vod_url, vod_permlink, vod_created_ts,
            live_start_ts, live_permlink,
            source_displayname
     FROM bot_clips
     WHERE streamer_id=$1
       AND vod_url IS NULL
       AND deleted_ts IS NULL
       AND hidden_by_streamer = false
     ORDER BY created_ts ASC, id ASC
     LIMIT $2`, [streamerId, lim]);
    return r.rows;
}
export async function setClipVodInfo(streamerId, clipId, info) {
    if (info.corrected_at_sec != null) {
        await pool.query(`UPDATE bot_clips
       SET vod_url=$1, vod_permlink=$2, vod_created_ts=$3, at_sec=$4
       WHERE streamer_id=$5 AND id=$6
         AND deleted_ts IS NULL`, [info.vod_url, info.vod_permlink ?? null, info.vod_created_ts ?? null, info.corrected_at_sec, streamerId, clipId]);
    }
    else {
        await pool.query(`UPDATE bot_clips
       SET vod_url=$1, vod_permlink=$2, vod_created_ts=$3
       WHERE streamer_id=$4 AND id=$5
         AND deleted_ts IS NULL`, [info.vod_url, info.vod_permlink ?? null, info.vod_created_ts ?? null, streamerId, clipId]);
    }
}
/**
 * ✅ NEW: renderer claims one pending clip
 * - robust PG pattern: CTE + FOR UPDATE SKIP LOCKED
 */
export async function claimOneClipToRenderMp4(opts) {
    const now = Date.now();
    const minTs = Math.max(0, Number(opts.minCreatedTs || 0));
    const maxAge = Math.max(1, Number(opts.maxAgeMs || 30 * 24 * 3600 * 1000));
    const oldestAllowed = now - maxAge;
    // Buffer pour laisser les segments HLS post-clip arriver dans la playlist DVR.
    // On doit couvrir : post_sec (+15s par défaut) + HLS live edge lag (~15s, encoder+CDN)
    // + marge sécurité. Sinon target_end est past la live edge actuelle de la playlist
    // → segments manquants → clip tronqué côté post. 30s est un compromis raisonnable
    // (pas trop de wait pour l'utilisateur, mais largement assez pour HLS).
    const POST_SEGMENT_BUFFER_SEC = 30;
    const r = await pool.query(`
    WITH picked AS (
      SELECT id
      FROM bot_clips
      WHERE deleted_ts IS NULL
        AND hidden_by_streamer = false
        AND vod_url IS NOT NULL
        AND (mp4_key IS NULL OR mp4_key = '')
        AND mp4_rendering = false
        AND created_ts >= $1
        AND created_ts >= $2
        AND (created_ts + (COALESCE(post_sec, 0) + $3) * 1000) <= $4
      ORDER BY created_ts DESC, id DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE bot_clips b
    SET mp4_rendering = true,
        mp4_error = NULL
    FROM picked
    WHERE b.id = picked.id
    RETURNING
      b.id, b.streamer_id, b.title, b.author, b.at_sec, b.pre_sec, b.post_sec, b.created_ts,
      b.vod_url, b.vod_permlink, b.vod_created_ts,
      b.live_start_ts, b.live_permlink, b.platform,
      b.hidden_by_streamer, b.deleted_ts,
      b.mp4_key, b.mp4_ready_ts, b.mp4_size, b.mp4_error, b.mp4_rendering
    `, [minTs, oldestAllowed, POST_SEGMENT_BUFFER_SEC, now]);
    return r.rows?.[0] ?? null;
}
export async function setClipMp4Success(clipId, info) {
    await pool.query(`
    UPDATE bot_clips
    SET mp4_key = $2,
        mp4_ready_ts = $3,
        mp4_size = $4,
        mp4_error = NULL,
        mp4_rendering = false
    WHERE id = $1
    `, [clipId, String(info.mp4_key || "").slice(0, 500), Date.now(), Math.max(0, Number(info.mp4_size || 0))]);
    // ✅ Générer thumbnail après MP4 prêt
    (async () => {
        try {
            // Import dynamique pour éviter dépendances circulaires
            const { r2Enabled, buildPublicUrl, putR2Buffer } = await import("../clips/r2.js");
            const { spawn } = await import("child_process");
            const { FFMPEG_BIN, FFMPEG_OK } = await import("../routes/thumbs.js");
            if (!FFMPEG_OK || !r2Enabled())
                return;
            const mp4Url = buildPublicUrl(info.mp4_key);
            if (!mp4Url)
                return;
            // Extraire thumbnail avec FFMPEG
            const args = [
                "-hide_banner", "-loglevel", "error", "-y", "-nostdin", "-rw_timeout", "10000000",
                "-ss", "1", "-i", mp4Url,
                "-an", "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "5",
                "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"
            ];
            const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
            const chunks = [];
            let stderr = "";
            const killTimer = setTimeout(() => {
                try {
                    p.kill("SIGKILL");
                }
                catch { }
            }, 10_000);
            p.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
            p.stderr.on("data", (d) => (stderr += String(d)));
            p.on("error", (e) => {
                clearTimeout(killTimer);
                console.warn(`[store] thumbnail ffmpeg spawn error clipId=${clipId}`, e);
            });
            p.on("close", async (code, signal) => {
                clearTimeout(killTimer);
                const buf = Buffer.concat(chunks);
                const ok = code === 0 && buf.length > 5_000;
                if (!ok) {
                    console.warn(`[store] thumbnail ffmpeg failed clipId=${clipId} code=${code} bytes=${buf.length}`);
                    return;
                }
                try {
                    // Stocker dans R2
                    const r2Key = `clips/thumbnails/${clipId}.jpg`;
                    const uploadOk = await putR2Buffer({ key: r2Key, buffer: buf, contentType: "image/jpeg" });
                    if (!uploadOk) {
                        console.warn(`[store] thumbnail R2 upload failed clipId=${clipId}`);
                        return;
                    }
                    // Générer URL publique
                    const publicUrl = buildPublicUrl(r2Key);
                    if (!publicUrl) {
                        console.warn(`[store] thumbnail URL build failed clipId=${clipId}`);
                        return;
                    }
                    // Mettre à jour BDD
                    await pool.query(`UPDATE bot_clips SET thumbnail_url = $1 WHERE id = $2`, [publicUrl, clipId]);
                    console.log(`[store] thumbnail generated clipId=${clipId} url=${publicUrl}`);
                }
                catch (err) {
                    console.warn(`[store] thumbnail storage failed clipId=${clipId}`, err);
                }
            });
        }
        catch (err) {
            console.warn(`[store] thumbnail generation exception clipId=${clipId}`, err);
        }
    })();
}
export async function setClipMp4Error(clipId, error) {
    await pool.query(`
    UPDATE bot_clips
    SET mp4_error = $2,
        mp4_rendering = false
    WHERE id = $1
    `, [clipId, String(error || "render_failed").slice(0, 500)]);
}
export async function listMp4KeysToCleanup(cutoffMs, limit = 500) {
    const lim = Math.min(2000, Math.max(1, Math.floor(Number(limit) || 500)));
    const r = await pool.query(`
    SELECT id, mp4_key
    FROM bot_clips
    WHERE mp4_key IS NOT NULL
      AND mp4_key <> ''
      AND (
        deleted_ts IS NOT NULL
        OR created_ts < $1
      )
    ORDER BY id DESC
    LIMIT $2
    `, [cutoffMs, lim]);
    return (r.rows || []).map((x) => ({ id: Number(x.id), mp4_key: String(x.mp4_key || "") }));
}
export async function clearMp4Key(clipId) {
    await pool.query(`
    UPDATE bot_clips
    SET mp4_key = NULL,
        mp4_ready_ts = NULL,
        mp4_size = NULL,
        mp4_error = NULL,
        mp4_rendering = false
    WHERE id = $1
    `, [clipId]);
}
export async function getDliveChannelSlugForStreamer(streamerId) {
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
        return null;
    const useLinked = !!row.useLinked;
    const linked = row.linkedDisplayname ? String(row.linkedDisplayname) : "";
    const provider = row.providerChannelSlug ? String(row.providerChannelSlug) : "";
    const channelSlug = useLinked && linked ? linked : provider;
    return channelSlug.trim() ? channelSlug.trim() : null;
}
