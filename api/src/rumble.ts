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
async function resolveFromEmbedJs(videoIdWithV: string): Promise<{ hlsUrl: string | null; vidNumeric: string | null }> {
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
    if (!r.ok) return { hlsUrl: null, vidNumeric: null };
    const d = await r.json();

    const hlsU = d?.u?.hls?.url ?? null;
    const hlsAuto = d?.ua?.hls?.auto?.url ?? null;
    const vidNumeric = d?.vid != null ? String(d.vid) : null;
    const allKeys = d ? Object.keys(d) : [];
    console.log(`[rumble][embedJS] keys=${JSON.stringify(allKeys)} vid=${vidNumeric}`);
    if (d?.u) console.log(`[rumble][embedJS] u.keys=${JSON.stringify(Object.keys(d.u))}`);
    if (d?.ua) console.log(`[rumble][embedJS] ua.keys=${JSON.stringify(Object.keys(d.ua))}`);
    console.log(`[rumble][embedJS] u.hls.url=${hlsU} | ua.hls.auto.url=${hlsAuto}`);

    return { hlsUrl: hlsU || hlsAuto || null, vidNumeric };
  } catch (e) {
    console.error(`[rumble][embedJS] error:`, e);
    return { hlsUrl: null, vidNumeric: null };
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

    if (isLive && rawId && videoId) {
      videoUrl = `https://rumble.com/user/${username}/live`;

      // 1. embedJS → URL HLS + video_id numérique (utilisé pour le chat)
      const { hlsUrl: embedHls, vidNumeric } = await resolveFromEmbedJs(videoId);
      videoIdNumeric = vidNumeric;
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
      thumbnailUrl: null,
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
 * Récupère le live actuel d'une chaine Rumble à partir de son pseudo,
 * sans api_key. Scrape la page channel/user (cookies bot pour passer CF
 * si nécessaire), liste les data-video-id, et confirme via embedJS lequel
 * est en live (`live: 1`).
 *
 * Heuristique : on tente le plus grand id en premier (le plus récent), puis les
 * suivants. Première video qui retourne `live: 1` → c'est le live courant.
 *
 * Renvoie `null` si pas de live trouvé.
 */
export async function fetchRumbleLiveInfoFromUsername(username: string): Promise<RumbleLiveInfo> {
  const offline = offlineInfo(username);
  if (!username) return offline;

  // Cookies bot (optionnels) pour passer Cloudflare
  let cookieHeader: string | undefined;
  let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  try {
    const { getRumbleBotSession } = await import("./rumble_chat_session.js");
    const session = await getRumbleBotSession();
    if (session.cookie) cookieHeader = session.cookie;
    if (session.userAgent) userAgent = session.userAgent;
  } catch { /* no session, on continue sans */ }

  // Scrape via cycletls (TLS-impersonate Chrome) pour passer Cloudflare.
  // Headers browser-like complets. On essaie d'abord SANS cookies (cf_clearance
  // du bot est IP-bound → invalide depuis Render). Si 403, on retry avec.
  const { cycleFetch } = await import("./rumble_http.js");
  const browserHeaders: Record<string, string> = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": '"Chromium";v="124", "Not.A/Brand";v="24", "Google Chrome";v="124"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
  };

  let html = "";
  const attempts: Array<{ cookie?: string; label: string }> = [
    { label: "no-cookie" },
    ...(cookieHeader ? [{ cookie: cookieHeader, label: "with-cookie" }] : []),
  ];

  outer: for (const path of [`/c/${encodeURIComponent(username)}`, `/user/${encodeURIComponent(username)}`]) {
    for (const att of attempts) {
      const r = await cycleFetch(`https://rumble.com${path}`, {
        method: "get",
        userAgent,
        cookie: att.cookie,
        headers: browserHeaders,
      });
      if (r.status >= 200 && r.status < 300 && r.body) {
        html = r.body;
        console.log(`[rumble][scrape] ${username}: ${path} ${att.label} OK (${html.length} bytes)`);
        break outer;
      }
      console.log(`[rumble][scrape] ${username}: ${path} ${att.label} → http=${r.status}`);
    }
  }
  if (!html) {
    console.warn(`[rumble][scrape] ${username}: scrape failed (CF block ?)`);
    return offline;
  }

  // Extraire les couples (slug court, vid numérique) — on associe les `/v76xxxx-titre.html`
  // au `data-video-id="123456789"` qui les précèdent dans le HTML.
  // Plus robuste que d'extraire séparément : on capture les slugs et les ids dans l'ordre HTML.
  const videoIds = Array.from(html.matchAll(/data-video-id="(\d+)"/g)).map(m => m[1]);
  const slugMatches = Array.from(html.matchAll(/href=["'](\/v[a-z0-9]{5,})-[^"']+\.html["']/gi)).map(m => m[1]);

  if (videoIds.length === 0) {
    console.log(`[rumble][scrape] ${username}: no video-id on page`);
    return offline;
  }

  // On tente les 3 plus grands video-ids (les plus récents)
  const sortedNumeric = [...new Set(videoIds)].sort((a, b) => Number(b) - Number(a)).slice(0, 3);

  for (const vidNumeric of sortedNumeric) {
    // On a besoin du slug court (vXXXX) pour appeler embedJS. On utilise les
    // slugs trouvés sur la page dans l'ordre — heuristique : le slug le plus
    // proche d'un data-video-id donné est généralement le bon.
    // Plus simple : on tente chaque slug court extrait, premier qui retourne
    // un embedJS avec vid numérique correspondant gagne.
    for (const vSlug of slugMatches) {
      const { hlsUrl, vidNumeric: gotNumeric } = await resolveFromEmbedJs(vSlug);
      if (gotNumeric === vidNumeric && hlsUrl) {
        // On a un match, vérifier si c'est en live
        const url = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${vSlug}&ad_wt=0`;
        try {
          const r = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/json", referer: "https://rumble.com/", origin: "https://rumble.com" } });
          if (!r.ok) continue;
          const d: any = await r.json();
          const isLive = d?.live === 1 || d?.live === true || d?.livestream_has_dvr === 1;
          if (!isLive) {
            console.log(`[rumble][scrape] ${username}: ${vSlug} (vid=${vidNumeric}) pas en live`);
            break; // ce vid n'est pas en live, essayer le suivant
          }

          // C'est le live. Résoudre HLS comme dans fetchRumbleLiveInfo
          const rawHls = hlsUrl;
          let finalHls = rawHls;
          if (rawHls.includes("live-hls-dvr")) {
            const cdnHls = await resolveRedirectToCdn(rawHls);
            finalHls = cdnHls || rawHls;
          }

          const title = String(d?.title || `Live de ${username}`);
          const createdOn = d?.pubDate || null;

          console.log(`[rumble][scrape] ${username}: LIVE — vid=${vSlug} (numeric=${vidNumeric}), hls=${finalHls}`);
          return {
            username,
            isLive: true,
            viewersCount: null,
            title,
            thumbnailUrl: null,
            videoUrl: `https://rumble.com/user/${username}/live`,
            hlsUrl: finalHls,
            videoId: vSlug,
            videoIdNumeric: vidNumeric,
            createdAt: createdOn,
          };
        } catch (e) {
          console.warn(`[rumble][scrape] ${username}: embedJS error`, e);
          continue;
        }
      }
    }
  }

  console.log(`[rumble][scrape] ${username}: aucun live actif détecté`);
  return offline;
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
