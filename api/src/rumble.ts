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
  videoId: string | null;          // alphanumeric ex "v76pubk"
  videoIdNumeric: string | null;   // numérique ex "434546624" — utilisé pour le chat
  createdAt: string | null;
}

const RUMBLE_API_BASE = "https://rumble.com/-livestream-api/get-data";


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
 * Suit la redirection de live-hls-dvr côté serveur pour obtenir l'URL CDN réelle (1a-1791.com).
 * Le Worker Cloudflare est bloqué par Rumble's Cloudflare WAF avant la redirection.
 * Render (AWS IPs) n'est pas bloqué → peut suivre le redirect et stocker l'URL CDN publique.
 */
async function resolveRedirectToCdn(liveHlsDvrUrl: string): Promise<string | null> {
  try {
    const r = await fetch(liveHlsDvrUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "application/vnd.apple.mpegurl, application/x-mpegurl, */*;q=0.9",
        "accept-language": "en-US,en;q=0.9",
        "referer": "https://rumble.com/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    const finalUrl = r.url; // URL après redirections
    console.log(`[rumble][redirect] ${liveHlsDvrUrl} → status=${r.status} finalUrl=${finalUrl}`);

    if (!r.ok) return null;

    // Si on a été redirigé vers le CDN (pas rumble.com), c'est notre URL
    if (finalUrl && !finalUrl.includes("rumble.com/live-hls-dvr")) {
      return finalUrl;
    }

    // Sinon, parser le m3u8 pour trouver les URLs CDN dans les sous-playlists
    const text = await r.text();
    if (!text.startsWith("#EXTM3U")) return null;

    // Collecter toutes les chunklist URLs CDN avec leur bandwidth.
    // On préfère une variante NON-DVR (latence plus faible) à qualité égale.
    // Fallback sur la meilleure DVR si aucune non-DVR n'est exposée.
    let bestNonDvr: { url: string; bw: number } | null = null;
    let bestDvr: { url: string; bw: number } | null = null;
    let lastBandwidth = -1;
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      if (s.startsWith("#EXT-X-STREAM-INF")) {
        const bwMatch = s.match(/BANDWIDTH=(\d+)/);
        lastBandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
        continue;
      }
      if (s.startsWith("#")) continue;
      try {
        const u = new URL(s, finalUrl);
        if (!u.hostname.includes("rumble.com")) {
          const urlStr = u.toString();
          const isDvr = /_DVR\.m3u8(\?|$)/i.test(urlStr);
          const bw = lastBandwidth;
          if (isDvr) {
            if (!bestDvr || bw > bestDvr.bw) bestDvr = { url: urlStr, bw };
          } else {
            if (!bestNonDvr || bw > bestNonDvr.bw) bestNonDvr = { url: urlStr, bw };
          }
        }
      } catch {}
      lastBandwidth = -1;
    }

    const chosen = bestNonDvr ?? bestDvr;
    if (chosen) {
      const kind = bestNonDvr ? "non-DVR" : "DVR";
      console.log(`[rumble][redirect] CDN chunklist (${kind}, bw=${chosen.bw}): ${chosen.url}`);
      return chosen.url;
    }

    return null;
  } catch (e) {
    console.error(`[rumble][redirect] error:`, e);
    return null;
  }
}

/**
 * Fallback: appelle embedJS pour récupérer l'URL HLS si la construction directe échoue.
 * Nécessite le videoId avec préfixe "v".
 */
async function resolveFromEmbedJs(videoIdWithV: string): Promise<{ hlsUrl: string | null; vidNumeric: string | null; thumbnailUrl: string | null }> {
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

    if (!r.ok) return { hlsUrl: null, vidNumeric: null, thumbnailUrl: null };
    const d = await r.json();

    const hlsU = d?.u?.hls?.url ?? null;
    const hlsAuto = d?.ua?.hls?.auto?.url ?? null;
    const vidNumeric = d?.vid != null ? String(d.vid) : null;
    const thumbnailUrl = d?.i ? String(d.i) : null;
    const allKeys = d ? Object.keys(d) : [];
    console.log(`[rumble][embedJS] keys=${JSON.stringify(allKeys)} vid=${vidNumeric}`);
    if (d?.u) console.log(`[rumble][embedJS] u.keys=${JSON.stringify(Object.keys(d.u))}`);
    if (d?.ua) console.log(`[rumble][embedJS] ua.keys=${JSON.stringify(Object.keys(d.ua))}`);
    console.log(`[rumble][embedJS] u.hls.url=${hlsU} | ua.hls.auto.url=${hlsAuto}`);

    return { hlsUrl: hlsU || hlsAuto || null, vidNumeric, thumbnailUrl };
  } catch (e) {
    console.error(`[rumble][embedJS] error:`, e);
    return { hlsUrl: null, vidNumeric: null, thumbnailUrl: null };
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
    videoIdNumeric: null,
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
    let videoIdNumeric: string | null = null;
    let thumbnailUrl: string | null = null;

    if (isLive && rawId && videoId) {
      videoUrl = `https://rumble.com/user/${username}/live`;

      // 1. embedJS → URL HLS + video_id numérique + thumbnail
      const { hlsUrl: embedHls, vidNumeric, thumbnailUrl: thumb } = await resolveFromEmbedJs(videoId);
      videoIdNumeric = vidNumeric;
      thumbnailUrl = thumb;
      const rawHls = embedHls || buildRumbleHlsUrl(rawId);

      // 2. Si live-hls-dvr : suivre la redirection côté serveur (Render) pour obtenir l'URL CDN
      //    Le Worker CF est bloqué par Cloudflare WAF sur rumble.com, Render (AWS) ne l'est pas
      if (rawHls.includes("live-hls-dvr")) {
        const cdnHls = await resolveRedirectToCdn(rawHls);
        hlsUrl = cdnHls || rawHls;
      } else {
        hlsUrl = rawHls;
      }

      console.log(`[rumble] ${username}: LIVE — videoId=${videoId}, vidNumeric=${videoIdNumeric}, hlsUrl=${hlsUrl}`);
    } else {
      console.log(`[rumble] ${username}: offline`);
    }

    return {
      username,
      isLive,
      viewersCount,
      title,
      thumbnailUrl,
      videoUrl,
      hlsUrl,
      videoId,
      videoIdNumeric,
      createdAt,
    };
  } catch (e) {
    console.error(`[rumble] Error fetching live info for ${username}:`, e);
    return offline;
  }
}

// Récupère le compte Rumble d'un streamer
export async function getRumbleAccountForStreamer(streamerId: number): Promise<{ username: string | null; apiKey: string | null }> {
  const { rows } = await pool.query(
    `SELECT username, api_key FROM rumble_accounts WHERE assigned_to_streamer_id = $1 LIMIT 1`,
    [streamerId]
  );
  const account = rows[0];
  if (!account) return { username: null, apiKey: null };
  return { username: account.username, apiKey: account.api_key };
}

function offlineInfo(username: string): RumbleLiveInfo {
  return {
    username, isLive: false, viewersCount: null, title: null,
    thumbnailUrl: null, videoUrl: null, hlsUrl: null, videoId: null, videoIdNumeric: null, createdAt: null,
  };
}

/** Liste tous les streamers ayant un rumble_account assigné. */
export async function listAssignedRumbleStreamers(): Promise<Array<{ streamerId: number; slug: string; username: string; apiKey: string }>> {
  const { rows } = await pool.query(
    `SELECT s.id AS streamer_id, s.slug, ra.username, ra.api_key
     FROM rumble_accounts ra
     JOIN streamers s ON s.id = ra.assigned_to_streamer_id
     WHERE ra.api_key IS NOT NULL AND ra.username IS NOT NULL`
  );
  return rows.map((r: any) => ({
    streamerId: Number(r.streamer_id),
    slug: String(r.slug),
    username: String(r.username),
    apiKey: String(r.api_key),
  }));
}

/**
 * Liste les streamers ayant un `rumble_username` mais SANS api_key (pas de
 * rumble_account assigné). Le poller scrape leur page Rumble pour détecter le live.
 */
export async function listScrapedRumbleStreamers(): Promise<Array<{ streamerId: number; slug: string; username: string }>> {
  const { rows } = await pool.query(
    `SELECT s.id AS streamer_id, s.slug, s.rumble_username AS username
     FROM streamers s
     LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
     WHERE s.rumble_username IS NOT NULL
       AND s.rumble_username <> ''
       AND ra.id IS NULL`
  );
  return rows.map((r: any) => ({
    streamerId: Number(r.streamer_id),
    slug: String(r.slug),
    username: String(r.username),
  }));
}

/**
 * Post-live, Rumble convertit la diffusion en VOD permanent (généralement 2-5 min après
 * la fin). On appelle embedJS qui retourne alors `u.mp4.url` (MP4 CDN permanent) et
 * `u.hls.url` (HLS VOD non-DVR). Pendant le live, ces URLs pointent encore vers le live-hls-dvr.
 * Renvoie les URLs si on a bien obtenu un MP4 permanent (host CDN ≠ rumble.com).
 */
export async function resolveRumbleVodFromVid(videoIdWithV: string): Promise<{ mp4Url: string | null; hlsUrl: string | null }> {
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
    if (!r.ok) return { mp4Url: null, hlsUrl: null };
    const d: any = await r.json();

    const mp4 = d?.ua?.mp4?.auto?.url
      || d?.ua?.mp4?.["1080"]?.url
      || d?.ua?.mp4?.["720"]?.url
      || d?.ua?.mp4?.["480"]?.url
      || d?.u?.mp4?.url
      || null;
    const hls = d?.u?.hls?.url || d?.ua?.hls?.auto?.url || null;

    // Pendant le live, hls pointe vers `rumble.com/live-hls-dvr/...` — pas un VOD permanent.
    // On considère qu'on a un VOD valide si on a un MP4 hors rumble.com (CDN 1a-1791.com).
    const isMp4Permanent = !!(mp4 && !mp4.includes("rumble.com/live-hls-dvr"));
    if (!isMp4Permanent) {
      console.log(`[rumble][vod] ${videoIdWithV}: VOD pas encore prêt (mp4=${mp4 ? "live-hls" : "absent"})`);
      return { mp4Url: null, hlsUrl: null };
    }

    console.log(`[rumble][vod] ${videoIdWithV}: VOD prêt mp4=${mp4}`);
    return { mp4Url: mp4, hlsUrl: hls };
  } catch (e) {
    console.error(`[rumble][vod] resolveRumbleVodFromVid error`, e);
    return { mp4Url: null, hlsUrl: null };
  }
}

/**
 * Récupère le slug du live courant en fetchant `/user/{username}/live`
 * et en extrayant `"video":"vXXXXXX"` du player init JS. Cette URL est
 * spécifique au live courant (pas la liste de VODs qui est CF-bloquée).
 * Renvoie null si pas de live actif ou si CF bloque.
 */
async function findCurrentLiveSlugFromLivePage(username: string): Promise<string | null> {
  // Rumble a deux formats : /user/{name}/live (utilisateurs) et /c/{name}/live
  // (channels créés par un user, parfois avec ID type c-1234567). On essaie les deux.
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "accept-language": "fr-FR,fr;q=0.9",
  };

  // Heuristique: si username commence par "c-" c'est un channel ID Rumble → priorité /c/
  const isChannelId = /^c-\d+$/i.test(username);
  const paths = isChannelId
    ? [`/c/${encodeURIComponent(username)}/live`, `/user/${encodeURIComponent(username)}/live`]
    : [`/user/${encodeURIComponent(username)}/live`, `/c/${encodeURIComponent(username)}/live`];

  for (const path of paths) {
    try {
      const r = await fetch(`https://rumble.com${path}`, { headers });
      if (!r.ok) {
        console.log(`[rumble][live-page] ${username}: ${path} http=${r.status}`);
        continue;
      }
      const html = await r.text();
      const m = html.match(/"video":\s*"(v[a-z0-9]{6})"/);
      if (m?.[1]) {
        console.log(`[rumble][live-page] ${username}: ${path} → slug=${m[1]}`);
        return m[1];
      }
      // Page rendue mais pas de player init: pas de live actif
      console.log(`[rumble][live-page] ${username}: ${path} no player init`);
      // Si on a 200 sans live, pas la peine d'essayer l'autre format
      return null;
    } catch (e) {
      console.warn(`[rumble][live-page] ${username}: ${path} fetch error`, e);
    }
  }
  return null;
}

/**
 * Récupère le live actuel d'une chaine Rumble en mode pseudo-only.
 *
 * Stratégie :
 *  1. Tente `/user/{username}/live` (URL canonique du live courant) depuis Render.
 *     Si CF laisse passer → extrait le slug, appelle embedJS pour HLS/titre/etc.
 *  2. Sinon, fallback sur `streamer_rumble_info.live_id` qu'un relay local aurait pushé.
 *  3. Si rien des deux : offline.
 */
export async function fetchRumbleLiveInfoFromUsername(username: string, streamerId?: number): Promise<RumbleLiveInfo> {
  const offline = offlineInfo(username);
  if (!username) return offline;

  // 1. Tentative directe via /user/{name}/live
  let vSlug: string | null = await findCurrentLiveSlugFromLivePage(username);

  // 2. Fallback : live_id pushé par le relay local
  if (!vSlug && streamerId) {
    const r = await pool.query(
      `SELECT live_id FROM streamer_rumble_info WHERE streamer_id = $1 LIMIT 1`,
      [streamerId]
    ).catch(() => null);
    vSlug = r?.rows?.[0]?.live_id ? String(r.rows[0].live_id) : null;
  }

  if (!vSlug) {
    return offline;
  }

  // Valide via embedJS
  const url = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${vSlug}&ad_wt=0`;
  try {
    const r2 = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        accept: "application/json",
        referer: "https://rumble.com/",
        origin: "https://rumble.com",
      },
    });
    if (!r2.ok) return offline;
    const d: any = await r2.json();
    // Rumble retourne `live: 1` ou `live: 2` selon le type de live, et
    // `livestream_has_dvr` peut être boolean true ou number 1. On accepte tout
    // ce qui est truthy.
    const isLive = !!d?.live || !!d?.livestream_has_dvr;
    if (!isLive) {
      console.log(`[rumble][pseudo-only] ${username}: ${vSlug} pas en live`);
      return offline;
    }

    const hlsCandidate = d?.u?.hls?.url || d?.ua?.hls?.auto?.url || null;
    const vidNumeric = d?.vid != null ? String(d.vid) : null;
    const thumbnailUrl = d?.i ? String(d.i) : null;

    let finalHls: string | null = hlsCandidate;
    if (finalHls && finalHls.includes("live-hls-dvr")) {
      const cdnHls = await resolveRedirectToCdn(finalHls);
      finalHls = cdnHls || finalHls;
    }

    const title = String(d?.title || `Live de ${username}`);
    const createdOn = d?.pubDate || null;

    console.log(`[rumble][pseudo-only] ${username}: LIVE — vid=${vSlug} (numeric=${vidNumeric}), hls=${finalHls}`);
    return {
      username,
      isLive: true,
      viewersCount: null,
      title,
      thumbnailUrl,
      videoUrl: `https://rumble.com/user/${username}/live`,
      hlsUrl: finalHls,
      videoId: vSlug,
      videoIdNumeric: vidNumeric,
      createdAt: createdOn,
    };
  } catch (e) {
    console.warn(`[rumble][pseudo-only] ${username}: embedJS error`, e);
    return offline;
  }
}

/** Récupère l'info Rumble pour un streamer donné (via son compte assigné). */
export async function fetchRumbleInfoForStreamerSlug(slug: string): Promise<RumbleLiveInfo> {
  const streamerResult = await pool.query(
    `SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
    [slug]
  );

  if (!streamerResult.rows[0]) {
    console.error(`[rumble] Streamer ${slug} not found`);
    return offlineInfo(slug);
  }

  const streamerId = streamerResult.rows[0].id;
  const { username, apiKey } = await getRumbleAccountForStreamer(streamerId);

  if (!apiKey || !username) {
    console.error(`[rumble] No Rumble account configured for ${slug}`);
    return offlineInfo(slug);
  }

  return await fetchRumbleLiveInfo(username, apiKey);
}
