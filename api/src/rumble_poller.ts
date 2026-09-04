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
      const r = await resolveRumbleVodFromVid(videoId);
      const { mp4Url, hlsUrl } = r;
      await pool.query(
        `UPDATE streamer_rumble_info
         SET vod_resolve_attempts = COALESCE(vod_resolve_attempts, 0) + 1
         WHERE streamer_id = $1`,
        [streamerId]
      ).catch(() => {});
      // Résolu si on a au moins un HLS VOD permanent ou un MP4 permanent.
      const resolved = !!(hlsUrl && hlsUrl.includes("/hls-vod/")) || !!mp4Url;
      if (resolved) {
        await pool.query(
          `UPDATE streamer_rumble_info
           SET vod_mp4_url = $2, vod_hls_url = $3, vod_resolved_at = NOW()
           WHERE streamer_id = $1`,
          [streamerId, mp4Url, hlsUrl]
        );
        await pool.query(
          `UPDATE rumble_vods
           SET vod_mp4_url = COALESCE($3, vod_mp4_url),
               vod_hls_url = COALESCE($4, vod_hls_url),
               title = COALESCE(title, $5),
               thumbnail_url = COALESCE(thumbnail_url, $6),
               duration_sec = COALESCE(duration_sec, $7),
               video_id_numeric = COALESCE(video_id_numeric, $8),
               vod_resolved_at = NOW()
           WHERE streamer_id = $1 AND video_id = $2`,
          [streamerId, videoId, mp4Url, hlsUrl, r.title, r.thumbnailUrl, r.durationSec, r.videoIdNumeric]
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
// Deux confirmations espacées de 30 s absorbent une panne CDN ponctuelle tout
// en retirant un live terminé de LunaLive en une minute au maximum.
const OFFLINE_HYSTERESIS = 2;

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
  let previousRumbleRow: any = null;
  let prev = lastState.get(streamerId);
  if (!prev) {
    const persisted = await pool.query(
      `SELECT is_live, title, live_id, live_video_id_numeric, thumbnail_url, live_started_at
       FROM streamer_rumble_info
       WHERE streamer_id = $1
       LIMIT 1`,
      [streamerId]
    ).catch(() => null);
    previousRumbleRow = persisted?.rows?.[0] || null;
    prev = {
      isLive: previousRumbleRow?.is_live === true,
      title: previousRumbleRow?.title ? String(previousRumbleRow.title) : null,
      offlineStreak: 0,
    };
  }
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
    if (wasLive && !previousRumbleRow) {
      const previous = await pool.query(
        `SELECT live_id, live_video_id_numeric, title, thumbnail_url, live_started_at
         FROM streamer_rumble_info WHERE streamer_id = $1 LIMIT 1`,
        [streamerId]
      ).catch(() => null);
      previousRumbleRow = previous?.rows?.[0] || null;
    }

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
      // L'état a été capturé avant l'UPDATE offline, afin de ne pas perdre les
      // métadonnées nécessaires à la VOD et au clip final.
      const row = previousRumbleRow;
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

  const jobs = [
    ...accounts.map((account) => () => pollOne(account.streamerId, account.slug, account.username, account.apiKey, io)),
    ...scraped.map((streamer) => () => pollOneScraped(streamer.streamerId, streamer.slug, streamer.username, io)),
  ];
  const rawConcurrency = Number(process.env.RUMBLE_POLL_CONCURRENCY || 6);
  const concurrency = Number.isFinite(rawConcurrency)
    ? Math.max(1, Math.min(12, Math.floor(rawConcurrency)))
    : 6;
  for (let index = 0; index < jobs.length; index += concurrency) {
    await Promise.allSettled(jobs.slice(index, index + concurrency).map((job) => job()));
  }

  // Rotation auto de la radio (id=32) : si le streamer actuellement assigné
  // n'est plus en live, on bascule sur un autre Rumble live (sticky-then-pick).
  await rotateRadioTarget(io).catch((e) => console.warn("[rumble-poller] rotateRadio failed", e?.message || e));
}

const RADIO_STREAMER_ID = 32;
const RADIO_SLUG = "lunalive";

function buildRadioProbeOrder(usernames: string[], currentUsername: string | null): string[] {
  if (!currentUsername) return [...usernames];
  const idx = usernames.findIndex((u) => u.toLowerCase() === currentUsername.toLowerCase());
  if (idx < 0) return [...usernames];
  return [...usernames.slice(idx), ...usernames.slice(0, idx)];
}

async function findLiveRadioSource(usernames: string[], currentUsername: string | null) {
  const ordered = buildRadioProbeOrder(usernames, currentUsername);
  for (const username of ordered) {
    try {
      const info = await fetchRumbleLiveInfoFromUsername(username);
      if (info.isLive) return { username, info };
    } catch (e: any) {
      console.warn(`[rumble-poller] radio probe failed for ${username}`, e?.message || e);
    }
  }
  return null;
}

async function switchRadioSource(username: string) {
  await pool.query(
    `WITH switched AS (
       UPDATE streamers
       SET rumble_username = $1,
           is_live = FALSE,
           live_started_at = NULL,
           title = 'Hors ligne',
           viewers = 0,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id
     )
     UPDATE streamer_rumble_info
     SET is_live = FALSE,
         title = NULL,
         viewers_count = 0,
         hls_url = NULL,
         video_url = NULL,
         thumbnail_url = NULL,
         live_id = NULL,
         live_video_id_numeric = NULL,
         live_started_at = NULL,
         updated_at = NOW()
     WHERE streamer_id IN (SELECT id FROM switched)`,
    [username, RADIO_STREAMER_ID]
  );
  lastState.delete(RADIO_STREAMER_ID);
}

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
async function rotateRadioTarget(io?: IOServer) {
  const radioRow = await pool.query(
    `SELECT s.platform, s.rumble_username, s.updated_at AS rotated_at,
            ri.is_live, ri.live_id, ri.viewers_count
     FROM streamers s
     LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
     WHERE s.id = $1 LIMIT 1`,
    [RADIO_STREAMER_ID]
  );
  const radio = radioRow.rows[0];
  if (!radio || String(radio.platform || "").toLowerCase() !== "rumble") return;
  const currentUsername = radio.rumble_username ? String(radio.rumble_username) : null;
  const radioIsLive = !!radio.is_live;
  const radioViewers = Number(radio.viewers_count || 0);

  // Sticky : la source actuelle est encore live → keep
  // (sauf si rumble_username=null, car alors is_live est juste un état figé
  // de la précédente source qui n'est plus polled)
  if (radioIsLive && currentUsername) return;

  // Grace period : si la radio a été rotated il y a moins de 90s ET qu'on n'a
  // pas encore de live_id, on attend que le relay push le slug. Sans ça, on
  // rotate trop vite et on saute la source actuelle avant que le relay ait
  // eu le temps (relay tick = 60s) de découvrir son slug live.
  const rotatedAt = radio.rotated_at ? new Date(radio.rotated_at).getTime() : 0;
  const sinceRotationMs = Date.now() - rotatedAt;
  const hasLiveId = !!radio.live_id;
  if (currentUsername && !hasLiveId && sinceRotationMs < 90_000) return;

  // La radio rotate parmi des créateurs Rumble externes curated (table
  // rumble_radio_sources) — ekanos, vitapvpey, put4, etc. — qui ne sont PAS
  // dans la table streamers. Stratégie : cycler à travers la liste à chaque
  // tick où la source courante n'est pas live. Le poll suivant détermine si
  // la nouvelle source est live ; sinon on rebascule encore une fois au tick
  // d'après. Naturellement la radio finit sur quelqu'un de vraiment live.
  void radioViewers;
  const sources = await pool.query(
    `SELECT username FROM rumble_radio_sources WHERE active = TRUE ORDER BY id ASC`
  );
  if (sources.rows.length === 0) return;
  const usernames: string[] = sources.rows.map((r: any) => String(r.username));

  // Fast path: probe la liste curated et saute directement sur une vraie source live.
  // On garde la rotation séquentielle ci-dessous uniquement comme fallback quand
  // la détection directe ne trouve rien (ex: worker bloqué, relay local en secours).
  const liveSource = await findLiveRadioSource(usernames, currentUsername);
  if (liveSource) {
    if (liveSource.username.toLowerCase() !== (currentUsername || "").toLowerCase()) {
      await switchRadioSource(liveSource.username);
      console.log(`[rumble-poller] radio live pick: ${currentUsername || "(aucun)"} -> ${liveSource.username}`);
    }

    await updateRumbleInfo(
      RADIO_STREAMER_ID,
      RADIO_SLUG,
      liveSource.info.isLive,
      liveSource.info.title,
      liveSource.info.viewersCount,
      liveSource.info.hlsUrl,
      liveSource.info.videoUrl,
      liveSource.info.thumbnailUrl,
      liveSource.info.videoId,
      liveSource.info.videoIdNumeric,
      io,
      liveSource.info.createdAt
    );
    return;
  }

  let nextIndex = 0;
  if (currentUsername) {
    const i = usernames.findIndex((u) => u.toLowerCase() === currentUsername.toLowerCase());
    nextIndex = i >= 0 ? (i + 1) % usernames.length : 0;
  }
  const newUsername = usernames[nextIndex];
  if (!newUsername) return;
  if (newUsername.toLowerCase() === (currentUsername || "").toLowerCase()) return;

  // Clear every source-specific field atomically with the username switch.
  // Until the new probe succeeds the radio is cleanly offline, never a mix
  // of the old preview and the new video.
  await switchRadioSource(newUsername);
  console.log(`[rumble-poller] radio rotation: ${currentUsername || "(aucun)"} → ${newUsername}`);

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

  let tickRunning = false;
  const tick = async () => {
    if (tickRunning) {
      console.warn("[rumble-poller] skipped overlapping tick");
      return;
    }
    tickRunning = true;
    try {
      await pollAll(io);
    } finally {
      tickRunning = false;
    }
  };

  tick().catch(e => console.error("[rumble-poller] first tick failed", e));

  const interval = setInterval(
    () => tick().catch(e => console.error("[rumble-poller] tick failed", e)),
    INTERVAL_MS
  );

  return () => {
    clearInterval(interval);
    console.log("[rumble-poller] Stopped");
  };
}
