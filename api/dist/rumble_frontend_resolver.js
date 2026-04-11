// api/src/rumble_frontend_resolver.ts
// Fallback architectural : résolution playback Rumble côté frontend
/**
 * Résout la playback Rumble depuis le frontend (bypass Render)
 * Utilise la même logique que le backend mais exécutée côté client
 */
export async function resolveRumblePlaybackFrontend(staticLiveUrl) {
    try {
        console.log(`[rumble-frontend] Resolving playback from frontend: ${staticLiveUrl}`);
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
            console.error(`[rumble-frontend] Static page fetch failed: HTTP ${response.status}`);
            console.error(`[rumble-frontend] Response headers:`, Object.fromEntries(response.headers.entries()));
            console.error(`[rumble-frontend] CF-Ray: ${response.headers.get('cf-ray') || 'none'}`);
            return { videoId: null, hlsUrl: null, watchUrl: null };
        }
        console.log(`[rumble-frontend] Static page fetch success: HTTP ${response.status}`);
        console.log(`[rumble-frontend] Response headers:`, Object.fromEntries(response.headers.entries()));
        console.log(`[rumble-frontend] CF-Ray: ${response.headers.get('cf-ray') || 'none'}`);
        console.log(`[rumble-frontend] Content-Type: ${response.headers.get('content-type') || 'none'}`);
        const html = await response.text();
        console.log(`[rumble-frontend] Static page fetched (${html.length} chars)`);
        // 2. Extraire le videoId depuis Rumble("play", {...})
        const videoIdPatterns = [
            /Rumble\s*\(\s*["']play["']\s*,\s*\{[^}]*["']video["']\s*:\s*["'](v[a-zA-Z0-9]+)["'][^}]*\}/gi,
            /Rumble\s*\(\s*["']play["']\s*,\s*\{[^}]*video\s*:\s*["'](v[a-zA-Z0-9]+)["']/gi,
            /["']video["']\s*:\s*["'](v[a-zA-Z0-9]+)["']/gi
        ];
        let videoId = null;
        for (const pattern of videoIdPatterns) {
            const match = html.match(pattern);
            if (match) {
                const videoIdMatch = match[0].match(/["'](v[a-zA-Z0-9]+)["']/);
                if (videoIdMatch) {
                    videoId = videoIdMatch[1];
                    console.log(`[rumble-frontend] Found videoId: ${videoId}`);
                    break;
                }
            }
        }
        if (!videoId) {
            console.log(`[rumble-frontend] No videoId found in static page`);
            return { videoId: null, hlsUrl: null, watchUrl: null };
        }
        // 3. Appeler l'endpoint embedJS pour récupérer les URLs de playback
        const embedJsUrl = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${videoId}&ad_wt=0`;
        console.log(`[rumble-frontend] Fetching embedJS: ${embedJsUrl}`);
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
            console.error(`[rumble-frontend] EmbedJS fetch failed: HTTP ${embedResponse.status}`);
            return { videoId, hlsUrl: null, watchUrl: null };
        }
        const embedData = await embedResponse.json();
        console.log(`[rumble-frontend] EmbedJS response received`);
        // 4. Extraire l'URL HLS depuis la réponse JSON
        let hlsUrl = null;
        if (embedData?.u?.hls?.url) {
            hlsUrl = embedData.u.hls.url;
            console.log(`[rumble-frontend] Found HLS URL (u.hls.url): ${hlsUrl}`);
        }
        else if (embedData?.ua?.hls?.auto?.url) {
            hlsUrl = embedData.ua.hls.auto.url;
            console.log(`[rumble-frontend] Found HLS URL (ua.hls.auto.url): ${hlsUrl}`);
        }
        // 5. Essayer de construire une watch URL si possible
        let watchUrl = null;
        if (embedData?.l) {
            watchUrl = `https://rumble.com/${embedData.l}`;
            console.log(`[rumble-frontend] Constructed watch URL: ${watchUrl}`);
        }
        else if (videoId) {
            watchUrl = `https://rumble.com/${videoId}`;
            console.log(`[rumble-frontend] Fallback watch URL: ${watchUrl}`);
        }
        console.log(`[rumble-frontend] Playback resolution complete - videoId: ${videoId}, hlsUrl: ${hlsUrl ? 'FOUND' : 'NULL'}, watchUrl: ${watchUrl}`);
        return {
            videoId,
            hlsUrl,
            watchUrl
        };
    }
    catch (error) {
        console.error(`[rumble-frontend] Error resolving playback from frontend:`, error);
        return { videoId: null, hlsUrl: null, watchUrl: null };
    }
}
