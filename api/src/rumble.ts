// api/src/rumble.ts
// Service Rumble Live API pour détecter les streams

import { pool } from "./db.js";

type RumbleLiveInfo = {
  username: string | null;
  isLive: boolean;
  viewersCount: number | null;
  title: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  hlsUrl: string | null;
  createdAt: string | null;
};

const RUMBLE_API_BASE = "https://rumble.com/-livestream-api/get-data";

function esc(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

async function fetchRumbleData(apiKey: string) {
  const url = `${RUMBLE_API_BASE}?key=${encodeURIComponent(apiKey)}`;
  
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "origin": "https://rumble.com",
      "referer": "https://rumble.com/",
    },
  });

  if (!r.ok) throw new Error(`rumble_api_http_${r.status}`);
  return (await r.json()) as any;
}

export async function fetchRumbleLiveInfo(username: string, apiKey: string): Promise<RumbleLiveInfo> {
  try {
    const data = await fetchRumbleData(apiKey);
    
    // Parser la réponse Rumble Live API
    const livestreams = data?.livestreams || [];
    const userStream = livestreams.find((stream: any) => 
      stream?.username?.toLowerCase() === username.toLowerCase()
    );

    if (!userStream) {
      return {
        username: username,
        isLive: false,
        viewersCount: null,
        title: null,
        thumbnailUrl: null,
        videoUrl: null,
        hlsUrl: null,
        createdAt: null,
      };
    }

    // Extraire les URLs du stream
    const videoUrl = userStream?.url || null;
    const thumbnailUrl = userStream?.thumbnail || null;
    const createdAt = userStream?.created_at || null;
    
    // Construire l'URL HLS si disponible
    let hlsUrl = null;
    if (videoUrl) {
      // Rumble utilise généralement des URLs HLS avec .m3u8
      // On essaie de construire l'URL HLS à partir de l'URL vidéo
      const videoId = videoUrl.match(/\/([^\/]+)$/)?.[1];
      if (videoId) {
        hlsUrl = `https://1a-1791.com/live/${videoId}/live-hls/*/chunklist_i1.m3u8`;
      }
    }

    return {
      username: username,
      isLive: true,
      viewersCount: typeof userStream?.viewers === "number" ? userStream.viewers : null,
      title: typeof userStream?.title === "string" ? userStream.title : null,
      thumbnailUrl,
      videoUrl,
      hlsUrl,
      createdAt,
    };
  } catch (e) {
    console.error(`[rumble] Error fetching live info for ${username}:`, e);
    
    // En cas d'erreur, retourner un état offline
    return {
      username: username,
      isLive: false,
      viewersCount: null,
      title: null,
      thumbnailUrl: null,
      videoUrl: null,
      hlsUrl: null,
      createdAt: null,
    };
  }
}

// Fonction pour récupérer les infos Rumble d'un streamer depuis la base
async function getRumbleAccountForStreamer(streamerId: number): Promise<{ username: string | null; apiKey: string | null }> {
  const { rows } = await pool.query(
    `SELECT username, api_key
     FROM rumble_accounts
     WHERE assigned_to_streamer_id = $1
     LIMIT 1`,
    [streamerId]
  );
  
  const account = rows[0];
  if (!account) {
    return { username: null, apiKey: null };
  }
  
  return {
    username: account.username,
    apiKey: account.api_key
  };
}

// Fonction pour récupérer les infos Rumble pour LeCasiNoze spécifiquement
export async function fetchLeCasiNozeRumbleInfo(): Promise<RumbleLiveInfo> {
  // Récupérer l'ID du streamer LeCasiNoze
  const streamerResult = await pool.query(
    `SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
    ["lecasinoze"]
  );
  
  if (!streamerResult.rows[0]) {
    console.error("[rumble] Streamer LeCasiNoze not found");
    return {
      username: "LeCasiNoze",
      isLive: false,
      viewersCount: null,
      title: null,
      thumbnailUrl: null,
      videoUrl: null,
      hlsUrl: null,
      createdAt: null,
    };
  }
  
  const streamerId = streamerResult.rows[0].id;
  const { username, apiKey } = await getRumbleAccountForStreamer(streamerId);
  
  if (!apiKey || !username) {
    console.error("[rumble] No Rumble account configured for LeCasiNoze");
    return {
      username: "LeCasiNoze",
      isLive: false,
      viewersCount: null,
      title: null,
      thumbnailUrl: null,
      videoUrl: null,
      hlsUrl: null,
      createdAt: null,
    };
  }

  return await fetchRumbleLiveInfo(username, apiKey);
}
