// api/src/bot_clips/store.ts
import { pool } from "../db.js";

export type BotClipRow = {
  id: number;
  streamer_id: number;
  title: string | null;
  author: string | null;
  at_sec: number;
  pre_sec: number;
  post_sec: number;
  created_ts: number;
  vod_url: string | null;
  vod_permlink: string | null;
  vod_created_ts: number | null;
};

let ensured = false;

export async function ensureBotClips() {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_clips (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL,
      title TEXT,
      author TEXT,
      at_sec INTEGER NOT NULL,
      pre_sec INTEGER NOT NULL DEFAULT 105,
      post_sec INTEGER NOT NULL DEFAULT 15,
      created_ts INTEGER NOT NULL,
      vod_url TEXT,
      vod_permlink TEXT,
      vod_created_ts INTEGER
    );
  `);

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

export async function listClipsForStreamer(streamerId: number, limit = 200) {
  const lim = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 200)));
  const r = await pool.query(
    `SELECT id, streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts,
            vod_url, vod_permlink, vod_created_ts
     FROM bot_clips
     WHERE streamer_id=$1
     ORDER BY created_ts DESC
     LIMIT $2`,
    [streamerId, lim]
  );
  return r.rows as BotClipRow[];
}

export async function getClipForStreamer(streamerId: number, clipId: number) {
  const r = await pool.query(
    `SELECT id, streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts,
            vod_url, vod_permlink, vod_created_ts
     FROM bot_clips
     WHERE streamer_id=$1 AND id=$2
     LIMIT 1`,
    [streamerId, clipId]
  );
  return (r.rows?.[0] as BotClipRow | undefined) ?? null;
}

export async function removeClipForStreamer(streamerId: number, clipId: number) {
  const r = await pool.query(
    `DELETE FROM bot_clips WHERE streamer_id=$1 AND id=$2`,
    [streamerId, clipId]
  );
  return Number(r.rowCount || 0);
}

export async function listStreamersWithPendingVodClips(): Promise<number[]> {
  const r = await pool.query(
    `SELECT DISTINCT streamer_id
     FROM bot_clips
     WHERE vod_url IS NULL
     LIMIT 1000`
  );
  return (r.rows || []).map((x: any) => Number(x.streamer_id));
}

export async function listPendingClipsForStreamer(streamerId: number, limit = 500) {
  const lim = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 500)));
  const r = await pool.query(
    `SELECT id, streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts,
            vod_url, vod_permlink, vod_created_ts
     FROM bot_clips
     WHERE streamer_id=$1 AND vod_url IS NULL
     ORDER BY created_ts ASC
     LIMIT $2`,
    [streamerId, lim]
  );
  return r.rows as BotClipRow[];
}

export async function setClipVodInfo(
  streamerId: number,
  clipId: number,
  info: { vod_url: string; vod_permlink?: string | null; vod_created_ts?: number | null }
) {
  await pool.query(
    `UPDATE bot_clips
     SET vod_url=$1, vod_permlink=$2, vod_created_ts=$3
     WHERE streamer_id=$4 AND id=$5`,
    [info.vod_url, info.vod_permlink ?? null, info.vod_created_ts ?? null, streamerId, clipId]
  );
}

export async function getDliveChannelSlugForStreamer(streamerId: number): Promise<string | null> {
  const r = await pool.query(
    `SELECT
       s.dlive_use_linked AS "useLinked",
       s.dlive_link_displayname AS "linkedDisplayname",
       pa.channel_slug AS "providerChannelSlug"
     FROM streamers s
     LEFT JOIN provider_accounts pa
       ON pa.provider='dlive'
      AND pa.assigned_to_streamer_id = s.id
     WHERE s.id=$1
     LIMIT 1`,
    [streamerId]
  );

  const row = r.rows?.[0] || null;
  if (!row) return null;

  const useLinked = !!row.useLinked;
  const linked = row.linkedDisplayname ? String(row.linkedDisplayname) : "";
  const provider = row.providerChannelSlug ? String(row.providerChannelSlug) : "";

  const channelSlug = (useLinked && linked) ? linked : provider;
  return channelSlug.trim() ? channelSlug.trim() : null;
}
