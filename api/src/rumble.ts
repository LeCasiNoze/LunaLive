// api/src/rumble.ts

import { pool } from "./db.js";

export interface RumbleLiveInfo {
  username: string;
  isLive: boolean;
  viewersCount: number | null;
  title: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  hlsUrl: string | null;
  videoId: string | null;
  createdAt: string | null;
}

const RUMBLE_API_BASE = "https://rumble.com/-livestream-api/get-data";

function esc(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

async function fetchRumbleData(apiKey: string) {
  const url = `${RUMBLE_API_BASE}?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      origin: "https://rumble.com",
      referer: "https://rumble.com/",
    },
  });
  if (!r.ok) throw new Error(`rumble_api_http_${r.status}`);
  return (await r.json()) as any;
}

/**
 * Construit l'URL HLS live depuis un videoId Rumble.
 * L'ID vient de l'API (ex: "761ke6"), le préfixe "v" est ajouté si absent.
 * L'URL HLS est: https://rumble.com/live-hls-dvr/{id}/playlist.m3u8
 */
function buildRumbleHlsUrl(rawId: string): string {
  const id = rawId.startsWith("v") ? rawId.slice(1) : rawId;
  return `https://rumble.com/live-hls-dvr/${id}/playlist.m3u8`;
}

/**
 * Fallback: appelle embedJS pour récupérer l'URL HLS si la construction directe échoue.
 * Nécessite le videoId avec préfixe "v".
 */
async function resolveHlsFromEmbedJs(videoIdWithV: string): Promise<string | null> {
  const url = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${videoIdWithV}&ad_wt=0`;
  try {
    const r = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        accept: "application/json",
        referer: "https://rumble.com/",
        origin: "https://rumble.com",
      },
    });
    if (!r.ok) return null;
    const d = await r.json();

    // Log complet pour debug — on cherche une URL CDN (1a-1791.com) au lieu de live-hls-dvr
    const hlsU = d?.u?.hls?.url ?? null;
    const hlsAuto = d?.ua?.hls?.auto?.url ?? null;
    const allKeys = d ? Object.keys(d) : [];
    console.log(`[rumble][embedJS] keys=${JSON.stringify(allKeys)}`);
    if (d?.u) console.log(`[rumble][embedJS] u.keys=${JSON.stringify(Object.keys(d.u))}`);
    if (d?.ua) console.log(`[rumble][embedJS] ua.keys=${JSON.stringify(Object.keys(d.ua))}`);
    console.log(`[rumble][embedJS] u.hls.url=${hlsU} | ua.hls.auto.url=${hlsAuto}`);

    return hlsU || hlsAuto || null;
  } catch (e) {
    console.error(`[rumble][embedJS] error:`, e);
    return null;
  }
}

export async function fetchRumbleLiveInfo(username: string, apiKey: string): Promise<RumbleLiveInfo> {
  const offline: RumbleLiveInfo = {
    username,
    isLive: false,
    viewersCount: null,
    title: null,
    thumbnailUrl: null,
    videoUrl: null,
    hlsUrl: null,
    videoId: null,
    createdAt: null,
  };

  try {
    const data = await fetchRumbleData(apiKey);

    const livestreams: any[] = Array.isArray(data?.livestreams) ? data.livestreams : [];

    if (livestreams.length === 0) {
      console.log(`[rumble] ${username}: offline (no livestreams)`);
      return offline;
    }

    const stream = livestreams.find((s: any) => s?.is_live === true) || livestreams[0];

    const isLive: boolean = stream?.is_live === true;
    const title: string | null = stream?.title || `Live de ${username}`;
    const viewersCount: number | null = stream?.watching_now ?? null;
    const createdAt: string | null = stream?.created_on || null;

    // videoId depuis l'API (sans préfixe "v", ex: "761ke6")
    const rawId: string | null = stream?.id ? String(stream.id) : null;
    const videoId: string | null = rawId ? (rawId.startsWith("v") ? rawId : `v${rawId}`) : null;

    let hlsUrl: string | null = null;
    let videoUrl: string | null = null;

    if (isLive && rawId && videoId) {
      // Priorité : embedJS → URL CDN directe (1a-1791.com), accessible sans session Rumble
      // Fallback : construction directe live-hls-dvr (peut 403 si non authentifié)
      const embedHls = await resolveHlsFromEmbedJs(videoId);
      hlsUrl = embedHls || buildRumbleHlsUrl(rawId);
      videoUrl = `https://rumble.com/user/${username}/live`;

      console.log(`[rumble] ${username}: LIVE — videoId=${videoId}, hlsUrl=${hlsUrl} (source: ${embedHls ? "embedJS" : "direct"})`);
    } else {
      console.log(`[rumble] ${username}: offline`);
    }

    return {
      username,
      isLive,
      viewersCount,
      title,
      thumbnailUrl: null,
      videoUrl,
      hlsUrl,
      videoId,
      createdAt,
    };
  } catch (e) {
    console.error(`[rumble] Error fetching live info for ${username}:`, e);
    return offline;
  }
}

// Récupère le compte Rumble d'un streamer
async function getRumbleAccountForStreamer(streamerId: number): Promise<{ username: string | null; apiKey: string | null }> {
  const { rows } = await pool.query(
    `SELECT username, api_key FROM rumble_accounts WHERE assigned_to_streamer_id = $1 LIMIT 1`,
    [streamerId]
  );
  const account = rows[0];
  if (!account) return { username: null, apiKey: null };
  return { username: account.username, apiKey: account.api_key };
}

export async function fetchLeCasiNozeRumbleInfo(): Promise<RumbleLiveInfo> {
  const streamerResult = await pool.query(
    `SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
    ["lecasinoze"]
  );

  if (!streamerResult.rows[0]) {
    console.error("[rumble] Streamer LeCasiNoze not found");
    return {
      username: "LeCasiNoze", isLive: false, viewersCount: null, title: null,
      thumbnailUrl: null, videoUrl: null, hlsUrl: null, videoId: null, createdAt: null,
    };
  }

  const streamerId = streamerResult.rows[0].id;
  const { username, apiKey } = await getRumbleAccountForStreamer(streamerId);

  if (!apiKey || !username) {
    console.error("[rumble] No Rumble account configured for LeCasiNoze");
    return {
      username: "LeCasiNoze", isLive: false, viewersCount: null, title: null,
      thumbnailUrl: null, videoUrl: null, hlsUrl: null, videoId: null, createdAt: null,
    };
  }

  return await fetchRumbleLiveInfo(username, apiKey);
}
