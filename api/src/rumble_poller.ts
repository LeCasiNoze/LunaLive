// api/src/rumble_poller.ts
// Polling Rumble pour LeCasiNoze uniquement

import { pool } from "./db.js";
import { fetchLeCasiNozeRumbleInfo } from "./rumble.js";
import type { Server as IOServer } from "socket.io";
import { notifyFollowersGoLive } from "./notify_go_live.js";

const INTERVAL_MS = Number(process.env.RUMBLE_POLL_INTERVAL_MS || 30_000);

// Streamer cible : LeCasiNoze
const LE_CASINOZE_SLUG = "lecasinoze"; // slug LunaLive de LeCasiNoze

let lastLiveState = false;
let lastTitle: string | null = null;

async function getStreamerIdBySlug(slug: string): Promise<number | null> {
  const r = await pool.query(
    `SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,
    [slug]
  );
  const id = r.rows?.[0]?.id;
  return id != null ? Number(id) : null;
}

async function updateRumbleInfo(
  streamerId: number,
  isLive: boolean,
  title: string | null,
  viewersCount: number | null,
  hlsUrl: string | null,
  videoUrl: string | null,
  thumbnailUrl: string | null,
  videoId: string | null,
  io?: IOServer
) {
  const now = new Date();

  if (isLive) {
    // Mettre à jour l'état live
    await pool.query(
      `UPDATE streamers
       SET 
         is_live = true,
         live_started_at = COALESCE(live_started_at, $2),
         title = COALESCE($3, title, 'Live sur Rumble'),
         viewers = COALESCE($4, viewers),
         updated_at = NOW()
       WHERE id = $1`,
      [streamerId, now, title, viewersCount]
    );

    // Stocker les infos Rumble dans une table séparée pour LeCasiNoze
    await pool.query(
      `INSERT INTO streamer_rumble_info (
         streamer_id, is_live, title, viewers_count, 
         hls_url, video_url, thumbnail_url, live_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (streamer_id) DO UPDATE SET
         is_live = EXCLUDED.is_live,
         title = EXCLUDED.title,
         viewers_count = EXCLUDED.viewers_count,
         hls_url = EXCLUDED.hls_url,
         video_url = EXCLUDED.video_url,
         thumbnail_url = EXCLUDED.thumbnail_url,
         live_id = EXCLUDED.live_id,
         updated_at = NOW()`,
      [streamerId, isLive, title, viewersCount, hlsUrl, videoUrl, thumbnailUrl, videoId]
    );

    console.log(`[rumble-poller] ${LE_CASINOZE_SLUG} is LIVE: "${title}" (${viewersCount} viewers)`);

    // Notifier les followers si c'est un nouveau live
    if (!lastLiveState) {
      await notifyFollowersGoLive(io, streamerId);
    }
  } else {
    // Mettre à jour l'état offline
    await pool.query(
      `UPDATE streamers
       SET 
         is_live = false,
         title = 'Hors ligne',
         viewers = 0,
         updated_at = NOW()
       WHERE id = $1`,
      [streamerId]
    );

    // Mettre à jour les infos Rumble
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

    console.log(`[rumble-poller] ${LE_CASINOZE_SLUG} is OFFLINE`);
  }

  lastLiveState = isLive;
  lastTitle = title;
}

async function pollLeCasiNoze(io?: IOServer) {
  const streamerId = await getStreamerIdBySlug(LE_CASINOZE_SLUG);
  if (!streamerId) {
    console.error(`[rumble-poller] Streamer ${LE_CASINOZE_SLUG} not found`);
    return;
  }

  try {
    const info = await fetchLeCasiNozeRumbleInfo();
    
    await updateRumbleInfo(
      streamerId,
      info.isLive,
      info.title,
      info.viewersCount,
      info.hlsUrl,
      info.videoUrl,
      info.thumbnailUrl,
      info.videoId,
      io
    );
  } catch (e) {
    console.error(`[rumble-poller] Error polling ${LE_CASINOZE_SLUG}:`, e);
    
    // En cas d'erreur, considérer comme offline
    const streamerId = await getStreamerIdBySlug(LE_CASINOZE_SLUG);
    if (streamerId) {
      await updateRumbleInfo(streamerId, false, null, null, null, null, null, null, io);
    }
  }
}

export function startRumblePoller(io?: IOServer) {
  console.log(`[rumble-poller] Starting polling for ${LE_CASINOZE_SLUG} every ${INTERVAL_MS}ms`);
  
  // Premier poll immédiat
  pollLeCasiNoze(io);
  
  // Polling régulier
  const interval = setInterval(() => pollLeCasiNoze(io), INTERVAL_MS);
  
  return () => {
    clearInterval(interval);
    console.log("[rumble-poller] Stopped");
  };
}
