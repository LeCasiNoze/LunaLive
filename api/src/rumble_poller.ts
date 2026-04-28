// api/src/rumble_poller.ts
// Polling Rumble pour tous les streamers ayant un rumble_account assigné.

import { pool } from "./db.js";
import {
  fetchRumbleLiveInfo,
  fetchRumbleLiveInfoFromUsername,
  listAssignedRumbleStreamers,
  listScrapedRumbleStreamers,
  resolveRumbleVodFromVid,
} from "./rumble.js";
import type { Server as IOServer } from "socket.io";
import { notifyFollowersGoLive } from "./notify_go_live.js";

/**
 * Archive un live terminé dans rumble_vods + programme la résolution du VOD permanent.
 * Rumble convertit le live en VOD permanent en quelques minutes — on retry à 5/15/45min puis 2h.
 */
async function archiveAndResolveVod(streamerId: number, videoId: string, videoIdNumeric: string | null, title: string | null, thumbnailUrl: string | null, startedAtMs: number | null) {
  // Insert dans l'historique (ou no-op si déjà présent — un live unique par video_id)
  const startedAtIso = startedAtMs && Number.isFinite(startedAtMs) ? new Date(startedAtMs).toISOString() : null;
  const durationSec = startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : null;
  await pool.query(
    `INSERT INTO rumble_vods (streamer_id, video_id, video_id_numeric, title, thumbnail_url, started_at, ended_at, duration_sec)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
     ON CONFLICT (streamer_id, video_id) DO NOTHING`,
    [streamerId, videoId, videoIdNumeric, title, thumbnailUrl, startedAtIso, durationSec]
  ).catch((e) => console.warn("[rumble-poller] archive VOD failed", e?.message || e));

  // Schedule resolve
  const delays = [5 * 60_000, 15 * 60_000, 45 * 60_000, 2 * 60 * 60_000];
  let attempt = 0;
  const tryOne = async () => {
    attempt++;
    try {
      const { mp4Url, hlsUrl } = await resolveRumbleVodFromVid(videoId);
      await pool.query(
        `UPDATE streamer_rumble_info
         SET vod_resolve_attempts = COALESCE(vod_resolve_attempts, 0) + 1
         WHERE streamer_id = $1`,
        [streamerId]
      ).catch(() => {});
      if (mp4Url) {
        await pool.query(
          `UPDATE streamer_rumble_info
           SET vod_mp4_url = $2, vod_hls_url = $3, vod_resolved_at = NOW()
           WHERE streamer_id = $1`,
          [streamerId, mp4Url, hlsUrl]
        );
        await pool.query(
          `UPDATE rumble_vods
           SET vod_mp4_url = $3, vod_hls_url = $4, vod_resolved_at = NOW()
           WHERE streamer_id = $1 AND video_id = $2`,
          [streamerId, videoId, mp4Url, hlsUrl]
        ).catch(() => {});
        console.log(`[rumble-poller] VOD résolu streamerId=${streamerId} videoId=${videoId} attempt=${attempt}`);
        return;
      }
    } catch (e: any) {
      console.warn(`[rumble-poller] VOD resolve attempt=${attempt} streamerId=${streamerId}`, e?.message || e);
    }
    if (attempt < delays.length) {
      setTimeout(() => void tryOne(), delays[attempt]);
    } else {
      console.warn(`[rumble-poller] VOD resolve abandoned streamerId=${streamerId} videoId=${videoId}`);
    }
  };
  setTimeout(() => void tryOne(), delays[0]);
}

const INTERVAL_MS = Number(process.env.RUMBLE_POLL_INTERVAL_MS || 30_000);

type StreamerState = { isLive: boolean; title: string | null; offlineStreak: number };
const lastState = new Map<number, StreamerState>();
// Hystérésis désactivée (=1) : détection offline immédiate. Le check "no HLS"
// dans fetchRumbleLiveInfoFromUsername est déjà fiable pour distinguer placeholder vs vraie fin.
const OFFLINE_HYSTERESIS = 1;

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

      // Archive + programme la résolution du VOD permanent (5min, 15min, 45min, 2h)
      // On lit l'état figé du live qui vient de finir avant qu'il soit overwrite par le tick offline.
      const r = await pool.query(
        `SELECT live_id, live_video_id_numeric, title, thumbnail_url, live_started_at
         FROM streamer_rumble_info WHERE streamer_id = $1`,
        [streamerId]
      ).catch(() => null);
      const row = r?.rows?.[0];
      const lastVid = row?.live_id ? String(row.live_id) : null;
      if (lastVid) {
        await archiveAndResolveVod(
          streamerId,
          lastVid,
          row.live_video_id_numeric ? String(row.live_video_id_numeric) : null,
          row.title ? String(row.title) : null,
          row.thumbnail_url ? String(row.thumbnail_url) : null,
          row.live_started_at ? Number(row.live_started_at) : null
        );
      }

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

  lastState.set(streamerId, { isLive: effectiveIsLive, title, offlineStreak: effectiveIsLive ? 0 : (prev.offlineStreak + 1) });
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

async function pollOneScraped(
  streamerId: number,
  slug: string,
  username: string,
  io?: IOServer
) {
  try {
    const info = await fetchRumbleLiveInfoFromUsername(username, streamerId);
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
    console.error(`[rumble-poller] Error scrape-polling ${slug}:`, e);
  }
}

async function pollAll(io?: IOServer) {
  const [accounts, scraped] = await Promise.all([
    listAssignedRumbleStreamers().catch((e) => {
      console.error("[rumble-poller] listAssignedRumbleStreamers failed", e);
      return [] as Array<{ streamerId: number; slug: string; username: string; apiKey: string }>;
    }),
    listScrapedRumbleStreamers().catch((e) => {
      console.error("[rumble-poller] listScrapedRumbleStreamers failed", e);
      return [] as Array<{ streamerId: number; slug: string; username: string }>;
    }),
  ]);

  if (accounts.length === 0 && scraped.length === 0) return;

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
 * on garde son rumble_username actuel tant que ce streamer est encore live.
 * Si offline, on bascule sur un autre streamer Rumble actuellement live
 * (priorité : viewers DESC, puis ordre déterministe par streamer_id).
 * Quand on bascule, le prochain tick poll le nouveau pseudo et résout HLS.
 */
async function rotateRadioTarget(io?: IOServer) {
  // Vérifie que la radio est bien en mode rumble
  const radioRow = await pool.query(
    `SELECT platform, rumble_username FROM streamers WHERE id = $1 LIMIT 1`,
    [RADIO_STREAMER_ID]
  );
  const radio = radioRow.rows[0];
  if (!radio || String(radio.platform || "").toLowerCase() !== "rumble") return;
  const currentUsername = radio.rumble_username ? String(radio.rumble_username) : null;

  // L'état actuel du streamer-source courant : est-il toujours live ?
  let currentStillLive = false;
  if (currentUsername) {
    const cur = await pool.query(
      `SELECT ri.is_live FROM streamers s
       JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       WHERE s.id <> $1 AND lower(s.rumble_username) = lower($2)
       LIMIT 1`,
      [RADIO_STREAMER_ID, currentUsername]
    );
    currentStillLive = !!cur.rows[0]?.is_live;
  }

  if (currentStillLive) return; // sticky : on garde

  // Cherche un nouveau candidat live (excluant la radio elle-même)
  const cand = await pool.query(
    `SELECT s.id, s.slug, s.rumble_username, ra.username AS api_username,
            ri.is_live, ri.viewers_count
     FROM streamers s
     LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
     LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
     WHERE s.id <> $1
       AND ri.is_live = true
     ORDER BY COALESCE(ri.viewers_count, 0) DESC, s.id ASC
     LIMIT 1`,
    [RADIO_STREAMER_ID]
  );
  const pick = cand.rows[0];
  const newUsername = pick?.rumble_username || pick?.api_username || null;

  if (!newUsername) {
    // Personne en live : on remet la radio offline
    if (currentUsername !== null) {
      await pool.query(
        `UPDATE streamers SET rumble_username = NULL, updated_at = NOW() WHERE id = $1`,
        [RADIO_STREAMER_ID]
      );
      // Force radio offline state
      await pool.query(
        `UPDATE streamer_rumble_info
         SET is_live=false, hls_url=NULL, updated_at=NOW()
         WHERE streamer_id=$1`,
        [RADIO_STREAMER_ID]
      ).catch(() => {});
      console.log(`[rumble-poller] radio rotation: aucun streamer live → radio offline`);
    }
    return;
  }

  if (newUsername.toLowerCase() === (currentUsername || "").toLowerCase()) return;

  await pool.query(
    `UPDATE streamers SET rumble_username = $1, updated_at = NOW() WHERE id = $2`,
    [newUsername, RADIO_STREAMER_ID]
  );
  console.log(`[rumble-poller] radio rotation: ${currentUsername || "(aucun)"} → ${newUsername} (slug=${pick.slug})`);

  // Re-poll immédiat de la radio pour ne pas attendre 30s
  void pollOneScraped(RADIO_STREAMER_ID, RADIO_SLUG, newUsername, io);
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
