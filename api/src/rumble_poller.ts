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
  io?: IOServer,
  liveCreatedAt?: string | null   // ISO string from Rumble API (created_on)
) {
  const now = new Date();
  // Convertit created_on en ms pour le vod_linker (at_sec calculation)
  const liveStartedAtMs: number | null = liveCreatedAt
    ? (() => { try { const ms = new Date(liveCreatedAt).getTime(); return Number.isFinite(ms) ? ms : null; } catch { return null; } })()
    : null;

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
         updated_at = NOW()`,
      [streamerId, isLive, title, viewersCount, hlsUrl, videoUrl, thumbnailUrl, videoId, liveStartedAtMs]
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

    // Mettre à jour les infos Rumble — NE PAS écraser live_id (utile pour les VODs)
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
    // live_id et live_started_at restent inchangés (dernier live connu → utile pour VOD)

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
      io,
      info.createdAt
    );
  } catch (e) {
    console.error(`[rumble-poller] Error polling ${LE_CASINOZE_SLUG}:`, e);
    // Ne pas re-tenter des appels DB ici — si la DB est down, ça crasherait le process
  }
}

async function ensureRumbleInfoColumns() {
  await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_started_at BIGINT;`).catch(() => {});
}

export function startRumblePoller(io?: IOServer) {
  // Assure les colonnes supplémentaires au démarrage
  ensureRumbleInfoColumns().catch(e => console.error("[rumble-poller] ensureColumns failed", e));

  console.log(`[rumble-poller] Starting polling for ${LE_CASINOZE_SLUG} every ${INTERVAL_MS}ms`);
  
  // Premier poll immédiat
  pollLeCasiNoze(io).catch(e => console.error("[rumble-poller] first tick failed", e));

  // Polling régulier
  const interval = setInterval(
    () => pollLeCasiNoze(io).catch(e => console.error("[rumble-poller] tick failed", e)),
    INTERVAL_MS
  );
  
  return () => {
    clearInterval(interval);
    console.log("[rumble-poller] Stopped");
  };
}
