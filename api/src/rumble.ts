// api/src/rumble.ts
// Service Rumble Live API pour détecter les streams

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
};

const RUMBLE_API_BASE = "https://rumble.com/-livestream-api/get-data";

// Fonction pour résoudre le playback Rumble depuis la page statique
async function resolveRumblePlaybackFromStaticPage(staticLiveUrl: string): Promise<{
  videoId: string | null;
  hlsUrl: string | null;
  watchUrl: string | null;
}> {
  try {
    console.log(`[rumble] Resolving playback from static page: ${staticLiveUrl}`);
    
    // 1. Fetch la page statique du streamer
    const response = await fetch(staticLiveUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Referer": "https://rumble.com/"
      }
    });
    
    if (!response.ok) {
      console.error(`[rumble] Static page fetch failed: HTTP ${response.status}`);
      console.error(`[rumble] Response headers:`, Object.fromEntries(response.headers.entries()));
      console.error(`[rumble] CF-Ray: ${response.headers.get('cf-ray') || 'none'}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log(`[rumble] Static page fetch success: HTTP ${response.status}`);
    console.log(`[rumble] Response headers:`, Object.fromEntries(response.headers.entries()));
    console.log(`[rumble] CF-Ray: ${response.headers.get('cf-ray') || 'none'}`);
    console.log(`[rumble] Content-Type: ${response.headers.get('content-type') || 'none'}`);
    
    const html = await response.text();
    console.log(`[rumble] Static page fetched (${html.length} chars)`);
    
    // 2. Extraire le videoId depuis Rumble("play", {...})
    // Pattern robuste pour trouver: Rumble("play", {"video":"v75zwfe", ...})
    const videoIdPatterns = [
      /Rumble\s*\(\s*["']play["']\s*,\s*\{[^}]*["']video["']\s*:\s*["'](v[a-zA-Z0-9]+)["'][^}]*\}/gi,
      /Rumble\s*\(\s*["']play["']\s*,\s*\{[^}]*video\s*:\s*["'](v[a-zA-Z0-9]+)["'][^}]*\}/gi,
      /["']video["']\s*:\s*["'](v[a-zA-Z0-9]+)["']/gi
    ];
    
    let videoId = null;
    for (const pattern of videoIdPatterns) {
      const match = html.match(pattern);
      if (match) {
        const videoIdMatch = match[0].match(/["'](v[a-zA-Z0-9]+)["']/);
        if (videoIdMatch) {
          videoId = videoIdMatch[1];
          console.log(`[rumble] Found videoId: ${videoId}`);
          break;
        }
      }
    }
    
    if (!videoId) {
      console.log(`[rumble] No videoId found in static page`);
      return { videoId: null, hlsUrl: null, watchUrl: null };
    }
    
    // 3. Appeler l'endpoint embedJS pour récupérer les URLs de playback
    const embedJsUrl = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${videoId}&ad_wt=0`;
    console.log(`[rumble] Fetching embedJS: ${embedJsUrl}`);
    
    const embedResponse = await fetch(embedJsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://rumble.com/",
        "Origin": "https://rumble.com"
      }
    });
    
    if (!embedResponse.ok) {
      throw new Error(`EmbedJS HTTP ${embedResponse.status}`);
    }
    
    const embedData = await embedResponse.json();
    console.log(`[rumble] EmbedJS response received`);
    
    // 4. Extraire l'URL HLS depuis la réponse JSON
    // Priorité 1: u.hls.url, Fallback: ua.hls.auto.url
    let hlsUrl = null;
    
    if (embedData?.u?.hls?.url) {
      hlsUrl = embedData.u.hls.url;
      console.log(`[rumble] Found HLS URL (u.hls.url): ${hlsUrl}`);
    } else if (embedData?.ua?.hls?.auto?.url) {
      hlsUrl = embedData.ua.hls.auto.url;
      console.log(`[rumble] Found HLS URL (ua.hls.auto.url): ${hlsUrl}`);
    }
    
    // 5. Essayer de construire une watch URL si possible
    let watchUrl = null;
    if (embedData?.l) {
      watchUrl = `https://rumble.com/${embedData.l}`;
      console.log(`[rumble] Constructed watch URL: ${watchUrl}`);
    } else if (videoId) {
      watchUrl = `https://rumble.com/${videoId}`;
      console.log(`[rumble] Fallback watch URL: ${watchUrl}`);
    }
    
    console.log(`[rumble] Playback resolution complete - videoId: ${videoId}, hlsUrl: ${hlsUrl ? 'FOUND' : 'NULL'}, watchUrl: ${watchUrl}`);
    
    return {
      videoId,
      hlsUrl,
      watchUrl
    };
    
  } catch (error) {
    console.error(`[rumble] Error resolving playback from static page:`, error);
    return { videoId: null, hlsUrl: null, watchUrl: null };
  }
}

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
    // La structure peut être soit data.livestreams soit directement un tableau
    let livestreams = [];
    
    if (Array.isArray(data?.livestreams)) {
      livestreams = data.livestreams;
    } else if (Array.isArray(data)) {
      livestreams = data;
    }
    
    console.log(`[rumble] Found ${livestreams.length} livestreams in API response`);
    
    if (livestreams.length === 0) {
      console.log(`[rumble] No livestreams found`);
      return {
        username: username,
        isLive: false,
        viewersCount: null,
        title: null,
        thumbnailUrl: null,
        videoUrl: null,
        hlsUrl: null,
        videoId: null,
        createdAt: null,
      };
    }
    
    // Log du premier item pour debugging
    console.log(`[rumble] First livestream data:`, JSON.stringify(livestreams[0], null, 2));
    
    // Prendre en priorité le premier item avec is_live = true, sinon le premier
    const userStream = livestreams.find((stream: any) => stream?.is_live === true) || livestreams[0];
    
    console.log(`[rumble] Selected stream:`, JSON.stringify(userStream, null, 2));

    // Extraire les URLs du stream
    const videoUrl = userStream?.url || userStream?.watch_url || userStream?.video_url || null;
    const thumbnailUrl = userStream?.thumbnail || userStream?.image || userStream?.thumb || null;
    const createdAt = userStream?.created_at || userStream?.published_at || userStream?.date || null;
    const title = userStream?.title || userStream?.name || `Live de ${username}`;
    const isLive = userStream?.is_live === true;
    const viewersCount = userStream?.watching_now || userStream?.viewers || userStream?.viewer_count || null;
    
    // Résolution du playback depuis la page statique
    const staticVideoUrl = "https://rumble.com/user/LeCasiNoze/live";
    
    let hlsUrl = null;
    let videoId = null;
    let watchUrl = null;
    
    if (isLive) {
      console.log(`[rumble] Stream is live, resolving playback from static page`);
      const playback = await resolveRumblePlaybackFromStaticPage(staticVideoUrl);
      hlsUrl = playback.hlsUrl;
      videoId = playback.videoId;
      watchUrl = playback.watchUrl;
    } else {
      console.log(`[rumble] Stream is offline, skipping playback resolution`);
    }
    
    const publicUrl = watchUrl || staticVideoUrl;
    const embedUrl = null;
    
    console.log(`[rumble] Final URLs - publicUrl: ${publicUrl}, embedUrl: ${embedUrl}, hlsUrl: ${hlsUrl}, videoId: ${videoId}`);

    console.log(`[rumble] Stream info - isLive: ${isLive}, title: "${title}", viewers: ${viewersCount}`);

    return {
      username: username,
      isLive: isLive,
      viewersCount: viewersCount,
      title: title,
      thumbnailUrl: thumbnailUrl,
      videoUrl: videoUrl,
      hlsUrl: hlsUrl,
      videoId: videoId,  // Ajout du videoId résolu
      createdAt: createdAt,
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
      videoId: null,
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
      videoId: null,
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
      videoId: null,
      createdAt: null,
    };
  }

  return await fetchRumbleLiveInfo(username, apiKey);
}
