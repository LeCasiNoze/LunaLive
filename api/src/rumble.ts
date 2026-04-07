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

// Fonction pour résoudre l'URL HLS depuis la page embed Rumble
async function resolveRumbleHlsUrl(embedUrl: string): Promise<string | null> {
  try {
    console.log(`[rumble] Scraping embed page: ${embedUrl}`);
    
    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Chercher les URLs HLS dans le HTML de la page embed
    const hlsPatterns = [
      /["']([^"']*\.m3u8[^"']*)["']/gi,
      /["']([^"']*\/live-hls\/[^"']*)["']/gi,
      /["']([^"']*\/hls\/[^"']*)["']/gi,
      /hls["\s]*:\s*["']([^"']+)["']/gi,
      /source["\s]*:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
    ];
    
    for (const pattern of hlsPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          const url = match.replace(/["']/g, '');
          if (url.includes('.m3u8') && url.startsWith('http')) {
            console.log(`[rumble] Found HLS URL: ${url}`);
            return url;
          }
        }
      }
    }
    
    // Chercher aussi dans les scripts JavaScript
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        const jsContent = script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        
        for (const pattern of hlsPatterns) {
          const matches = jsContent.match(pattern);
          if (matches) {
            for (const match of matches) {
              const url = match.replace(/["']/g, '');
              if (url.includes('.m3u8') && url.startsWith('http')) {
                console.log(`[rumble] Found HLS URL in script: ${url}`);
                return url;
              }
            }
          }
        }
      }
    }
    
    console.log(`[rumble] No HLS URL found in embed page`);
    return null;
    
  } catch (error) {
    console.error(`[rumble] Error scraping HLS URL:`, error);
    return null;
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
    
    // Résoudre la vraie URL HLS depuis la Static Video URL stable
    let hlsUrl = null;
    let publicUrl = videoUrl;
    let embedUrl = null;
    
    // Stratégie LeCasiNoze : utiliser la Static Video URL stable
    // https://rumble.com/user/LeCasiNoze/live
    const staticVideoUrl = "https://rumble.com/user/LeCasiNoze/live";
    
    console.log(`[rumble] Using Static Video URL strategy: ${staticVideoUrl}`);
    
    if (staticVideoUrl) {
      publicUrl = staticVideoUrl;
      embedUrl = staticVideoUrl.replace('/user/', '/embed/');
      
      console.log(`[rumble] Generated embedUrl from static URL: ${embedUrl}`);
      console.log(`[rumble] Generated publicUrl: ${publicUrl}`);
      
      try {
        // Scraper la page static pour trouver la vraie URL HLS du live courant
        hlsUrl = await resolveRumbleHlsUrl(embedUrl);
        console.log(`[rumble] Resolved hlsUrl: ${hlsUrl}`);
      } catch (error) {
        console.error(`[rumble] Error resolving HLS URL from static URL:`, error);
        
        // Fallback : essayer avec l'ID de l'API si disponible
        const fallbackId = userStream?.id;
        if (fallbackId) {
          const fallbackEmbedUrl = `https://rumble.com/embed/${fallbackId}`;
          console.log(`[rumble] Trying fallback with API ID: ${fallbackEmbedUrl}`);
          
          try {
            hlsUrl = await resolveRumbleHlsUrl(fallbackEmbedUrl);
            console.log(`[rumble] Resolved fallback hlsUrl: ${hlsUrl}`);
          } catch (fallbackError) {
            console.error(`[rumble] Fallback also failed:`, fallbackError);
          }
        }
      }
    }
    
    console.log(`[rumble] Final URLs - publicUrl: ${publicUrl}, embedUrl: ${embedUrl}, hlsUrl: ${hlsUrl}`);

    console.log(`[rumble] Stream info - isLive: ${isLive}, title: "${title}", viewers: ${viewersCount}`);

    return {
      username: username,
      isLive: isLive,
      viewersCount: viewersCount,
      title: title,
      thumbnailUrl: thumbnailUrl,
      videoUrl: videoUrl,
      hlsUrl: hlsUrl,
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
