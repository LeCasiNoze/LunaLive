// api/src/rumble_yt_redirect_poller.ts
// Poller qui scrute rumble_vods pour trouver les VODs resolus (vod_mp4_url present)
// non encore upload sur YouTube, pour la liste blanche de streamers (LeCasinoze, Fabiozsis),
// et les uploade sur la chaine @fabiozsis.
//
// Le pipeline VOD existant (rumble_poller.archiveAndResolveVod) populate vod_mp4_url
// 5-45min apres la fin du live. On pick ensuite ici pour la rediff YouTube.
//
// Numero de stream = count(yt_uploaded_at IS NOT NULL) pour ce streamer + 1.

import { pool } from "./db.js";
import { uploadVodToYouTube, formatRediffTitle } from "./youtube_uploader.js";

const TICK_MS = Number(process.env.YT_REDIFF_POLL_INTERVAL_MS || 5 * 60_000);
const MAX_ATTEMPTS = Number(process.env.YT_REDIFF_MAX_ATTEMPTS || 5);

// Slugs des streamers eligibles a la rediff auto sur YouTube.
// Override via env: YT_REDIFF_STREAMER_SLUGS=lecasinoze,fabiozsis
function eligibleSlugs(): string[] {
  const raw = String(process.env.YT_REDIFF_STREAMER_SLUGS || "lecasinoze,fabiozsis");
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function listPendingVods(): Promise<Array<{
  id: number;
  streamerId: number;
  streamerSlug: string;
  streamerDisplay: string;
  videoId: string;
  videoIdNumeric: string | null;
  title: string | null;
  vodMp4Url: string;
  endedAt: Date;
  attempts: number;
}>> {
  const slugs = eligibleSlugs();
  if (slugs.length === 0) return [];
  const r = await pool.query(
    `SELECT v.id, v.streamer_id, s.slug, s.display_name,
            v.video_id, v.video_id_numeric, v.title, v.vod_mp4_url,
            v.ended_at, v.yt_upload_attempts
       FROM rumble_vods v
       JOIN streamers s ON s.id = v.streamer_id
      WHERE v.yt_uploaded_at IS NULL
        AND v.vod_mp4_url IS NOT NULL
        AND v.yt_upload_attempts < $2
        AND lower(s.slug) = ANY($1::text[])
      ORDER BY v.ended_at ASC
      LIMIT 5`,
    [slugs, MAX_ATTEMPTS]
  );
  return r.rows.map((row: any) => ({
    id: Number(row.id),
    streamerId: Number(row.streamer_id),
    streamerSlug: String(row.slug),
    streamerDisplay: String(row.display_name || row.slug),
    videoId: String(row.video_id),
    videoIdNumeric: row.video_id_numeric ? String(row.video_id_numeric) : null,
    title: row.title ? String(row.title) : null,
    vodMp4Url: String(row.vod_mp4_url),
    endedAt: new Date(row.ended_at),
    attempts: Number(row.yt_upload_attempts || 0),
  }));
}

async function nextStreamNumber(streamerId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM rumble_vods WHERE streamer_id = $1 AND yt_uploaded_at IS NOT NULL`,
    [streamerId]
  );
  return Number(r.rows[0]?.n || 0) + 1;
}

async function processOne(vod: Awaited<ReturnType<typeof listPendingVods>>[number]) {
  const streamNumber = await nextStreamNumber(vod.streamerId);
  const ytTitle = formatRediffTitle(streamNumber, vod.endedAt);
  const description = [
    `Rediff du live de ${vod.streamerDisplay} sur Rumble.`,
    vod.title ? `\nTitre original : ${vod.title}` : "",
    vod.videoId ? `\nVOD Rumble : https://rumble.com/${vod.videoId}.html` : "",
    `\n\nUpload automatique LunaLive.`,
  ].join("");

  console.log(`[yt-rediff] Upload start streamer=${vod.streamerSlug} vod=${vod.videoId} stream#${streamNumber} title="${ytTitle}"`);

  // Increment attempts BEFORE l'upload pour eviter qu'un crash boucle.
  await pool.query(
    `UPDATE rumble_vods SET yt_upload_attempts = yt_upload_attempts + 1 WHERE id = $1`,
    [vod.id]
  );

  try {
    const { videoId } = await uploadVodToYouTube({
      mp4Url: vod.vodMp4Url,
      title: ytTitle,
      description,
      tags: ["rumble", "rediff", "casino", "stream", vod.streamerSlug],
    });
    await pool.query(
      `UPDATE rumble_vods
          SET yt_video_id = $2, yt_uploaded_at = NOW(), yt_stream_number = $3, yt_upload_error = NULL
        WHERE id = $1`,
      [vod.id, videoId, streamNumber]
    );
    console.log(`[yt-rediff] Upload OK streamer=${vod.streamerSlug} vod=${vod.videoId} -> https://youtu.be/${videoId}`);
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 1000);
    console.error(`[yt-rediff] Upload echec streamer=${vod.streamerSlug} vod=${vod.videoId}: ${msg}`);
    await pool.query(
      `UPDATE rumble_vods SET yt_upload_error = $2 WHERE id = $1`,
      [vod.id, msg]
    ).catch(() => {});
  }
}

async function tick() {
  if (!process.env.YT_REFRESH_TOKEN) return; // pas configure -> on dort
  try {
    const pending = await listPendingVods();
    for (const vod of pending) {
      await processOne(vod);
    }
  } catch (e) {
    console.error("[yt-rediff] tick error", e);
  }
}

export function startRumbleYtRedirectPoller() {
  if (!process.env.YT_REFRESH_TOKEN) {
    console.log("[yt-rediff] YT_REFRESH_TOKEN absent, poller desactive");
    return () => {};
  }
  console.log(`[yt-rediff] Poller demarre (interval=${TICK_MS}ms, slugs=${eligibleSlugs().join(",")})`);
  tick().catch((e) => console.error("[yt-rediff] first tick", e));
  const t = setInterval(() => tick().catch((e) => console.error("[yt-rediff] tick", e)), TICK_MS);
  return () => clearInterval(t);
}
