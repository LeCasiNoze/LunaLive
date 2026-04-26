// api/src/rumble_poller.ts
// Polling Rumble pour tous les streamers ayant un rumble_account assigné.

import { pool } from "./db.js";
import { fetchRumbleLiveInfo, listAssignedRumbleStreamers } from "./rumble.js";
import type { Server as IOServer } from "socket.io";
import { notifyFollowersGoLive } from "./notify_go_live.js";

const INTERVAL_MS = Number(process.env.RUMBLE_POLL_INTERVAL_MS || 30_000);

type StreamerState = { isLive: boolean; title: string | null };
const lastState = new Map<number, StreamerState>();

async function updateRumbleInfo(
  streamerId: number,
  slug: string,
  isLive: boolean,
  title: string | null,
  viewersCount: number | null,
  hlsUrl: string | null,
  videoUrl: string | null,
  thumbnailUrl: string | null,
  videoId: string | null,
  videoIdNumeric: string | null,
  io?: IOServer,
  liveCreatedAt?: string | null   // ISO string from Rumble API (created_on)
) {
  const now = new Date();
  const liveStartedAtMs: number | null = liveCreatedAt
    ? (() => { try { const ms = new Date(liveCreatedAt).getTime(); return Number.isFinite(ms) ? ms : null; } catch { return null; } })()
    : null;

  const room = `stream:${slug.toLowerCase()}`;
  const prev = lastState.get(streamerId) ?? { isLive: false, title: null };
  const wasLive = prev.isLive;

  if (isLive) {
    await pool.query(
      `UPDATE streamers
       SET is_live = true,
           live_started_at = COALESCE(live_started_at, $2),
           title = COALESCE($3, title, 'Live sur Rumble'),
           viewers = COALESCE($4, viewers),
           updated_at = NOW()
       WHERE id = $1`,
      [streamerId, now, title, viewersCount]
    );

    await pool.query(
      `INSERT INTO streamer_rumble_info (
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
         updated_at = NOW()`,
      [streamerId, isLive, title, viewersCount, hlsUrl, videoUrl, thumbnailUrl, videoId, videoIdNumeric, liveStartedAtMs]
    );

    if (!wasLive) {
      console.log(`[rumble-poller] ${slug} went LIVE: "${title}"`);

      await pool.query(
        `INSERT INTO live_sessions (streamer_id, started_at)
         VALUES ($1, NOW())
         ON CONFLICT (streamer_id) WHERE ended_at IS NULL
         DO NOTHING`,
        [streamerId]
      ).catch(() => {});

      io?.to(room).emit("stream:viewers", {
        slug,
        isLive: true,
        viewers: viewersCount ?? 0,
      });

      await notifyFollowersGoLive(io, streamerId);
    } else {
      io?.to(room).emit("stream:viewers", {
        slug,
        isLive: true,
        viewers: viewersCount ?? 0,
      });
    }
  } else {
    await pool.query(
      `UPDATE streamers
       SET is_live = false,
           title = 'Hors ligne',
           viewers = 0,
           live_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [streamerId]
    );

    // NE PAS écraser live_id (utile pour les VODs)
    await pool.query(
      `INSERT INTO streamer_rumble_info (
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
         updated_at = NOW()`,
      [streamerId, isLive, null, null, null, null, null]
    );

    if (wasLive) {
      console.log(`[rumble-poller] ${slug} went OFFLINE`);

      await pool.query(
        `UPDATE live_sessions SET ended_at = NOW()
         WHERE streamer_id = $1 AND ended_at IS NULL`,
        [streamerId]
      ).catch(() => {});

      await pool.query(
        `UPDATE viewer_sessions
         SET ended_at = COALESCE(last_heartbeat_at, NOW())
         WHERE streamer_id = $1 AND ended_at IS NULL`,
        [streamerId]
      ).catch(() => {});

      io?.to(room).emit("stream:viewers", {
        slug,
        isLive: false,
        viewers: 0,
      });
    }
  }

  lastState.set(streamerId, { isLive, title });
}

async function pollOne(
  streamerId: number,
  slug: string,
  username: string,
  apiKey: string,
  io?: IOServer
) {
  try {
    const info = await fetchRumbleLiveInfo(username, apiKey);
    await updateRumbleInfo(
      streamerId,
      slug,
      info.isLive,
      info.title,
      info.viewersCount,
      info.hlsUrl,
      info.videoUrl,
      info.thumbnailUrl,
      info.videoId,
      info.videoIdNumeric,
      io,
      info.createdAt
    );
  } catch (e) {
    console.error(`[rumble-poller] Error polling ${slug}:`, e);
  }
}

async function pollAll(io?: IOServer) {
  const accounts = await listAssignedRumbleStreamers().catch((e) => {
    console.error("[rumble-poller] listAssignedRumbleStreamers failed", e);
    return [];
  });

  if (accounts.length === 0) return;

  await Promise.all(
    accounts.map((a) => pollOne(a.streamerId, a.slug, a.username, a.apiKey, io))
  );
}

async function ensureRumbleInfoColumns() {
  await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_started_at BIGINT;`).catch(() => {});
  await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_video_id_numeric TEXT;`).catch(() => {});
}

export function startRumblePoller(io?: IOServer) {
  ensureRumbleInfoColumns().catch(e => console.error("[rumble-poller] ensureColumns failed", e));

  console.log(`[rumble-poller] Starting polling for all assigned Rumble accounts every ${INTERVAL_MS}ms`);

  pollAll(io).catch(e => console.error("[rumble-poller] first tick failed", e));

  const interval = setInterval(
    () => pollAll(io).catch(e => console.error("[rumble-poller] tick failed", e)),
    INTERVAL_MS
  );

  return () => {
    clearInterval(interval);
    console.log("[rumble-poller] Stopped");
  };
}
