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
      created_ts BIGINT NOT NULL,
      vod_url TEXT,
      vod_permlink TEXT,
      vod_created_ts BIGINT
    );
  `);
    // ✅ nouvelles colonnes (pour tes règles)
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS hidden_by_streamer BOOLEAN NOT NULL DEFAULT false;
  `);
    await pool.query(`
    ALTER TABLE bot_clips
      ADD COLUMN IF NOT EXISTS deleted_ts BIGINT;
  `);
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
    ensured = true;
}
/**
 * ✅ LIST dashboard (module bot):
 * - visible uniquement si pas hidden_by_streamer
 * - et pas deleted_ts
 */
export async function listClipsForStreamer(streamerId, limit = 200) {
    const lim = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 200)));
    const r = await pool.query(`SELECT id, streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts,
            vod_url, vod_permlink, vod_created_ts,
            hidden_by_streamer, deleted_ts
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
            hidden_by_streamer, deleted_ts
     FROM bot_clips
     WHERE streamer_id=$1 AND id=$2
       AND deleted_ts IS NULL
     LIMIT 1`, [streamerId, clipId]);
    return r.rows?.[0] ?? null;
}
/**
 * ✅ IMPORTANT: "Supprimer" depuis le module bot = juste HIDE (pas delete DB)
 */
export async function removeClipForStreamer(streamerId, clipId) {
    const r = await pool.query(`UPDATE bot_clips
     SET hidden_by_streamer = true
     WHERE streamer_id=$1 AND id=$2
       AND deleted_ts IS NULL`, [streamerId, clipId]);
    return Number(r.rowCount || 0);
}
/**
 * ✅ Delete "public" (page streamer) = delete_ts + hide
 * (utilisé par /clips/:id/delete côté routes public)
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
            vod_url, vod_permlink, vod_created_ts
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
    await pool.query(`UPDATE bot_clips
     SET vod_url=$1, vod_permlink=$2, vod_created_ts=$3
     WHERE streamer_id=$4 AND id=$5
       AND deleted_ts IS NULL`, [info.vod_url, info.vod_permlink ?? null, info.vod_created_ts ?? null, streamerId, clipId]);
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
