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

function isRumbleMasterPlaylistUrl(url: string): boolean {
  return /https:\/\/rumble\.com\/live-hls(?:-dvr)?\//i.test(String(url || ""));
}

/**
 * Suit la redirection de live-hls-dvr côté serveur pour obtenir l'URL CDN réelle (1a-1791.com).
 * Le Worker Cloudflare est bloqué par Rumble's Cloudflare WAF avant la redirection.
 * Render (AWS IPs) n'est pas bloqué → peut suivre le redirect et stocker l'URL CDN publique.
 */
/**
 * Check définitif "stream encore live ou terminé (DVR replay) ?" :
 * fetch la chunklist HLS et regarde la présence de #EXT-X-ENDLIST.
 * - Présent → stream finalisé, plus de nouveaux segments ajoutés → DVR/VOD
 * - Absent → stream encore actif (segments ajoutés en live)
 *
 * Plus fiable qu'embedJS qui peut continuer à reporter `live: 1` plusieurs
 * minutes après la fin réelle quand DVR est activé.
 */
async function isChunklistEnded(chunklistUrl: string): Promise<boolean> {
  if (!chunklistUrl) return false;
  try {
    const r = await fetch(chunklistUrl, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "accept": "application/vnd.apple.mpegurl, application/x-mpegurl, */*",
      },
    });
    if (!r.ok) return false;
    const text = await r.text();
    if (!text.startsWith("#EXTM3U")) return false;
    return text.includes("#EXT-X-ENDLIST");
  } catch {
    return false;
  }
}

async function isActiveChunklist(chunklistUrl: string): Promise<boolean> {
  if (!chunklistUrl) return false;
  try {
    const r = await fetch(chunklistUrl, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "accept": "application/vnd.apple.mpegurl, application/x-mpegurl, */*",
        "referer": "https://rumble.com/",
      },
    });
    if (!r.ok) return false;
    const text = await r.text();
    return text.trimStart().startsWith("#EXTM3U") && !text.includes("#EXT-X-ENDLIST");
  } catch {
    return false;
  }
}

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
    if (finalUrl && !isRumbleMasterPlaylistUrl(finalUrl)) {
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

async function resolveActiveHlsFromSlug(vSlug: string, cachedHlsUrl?: string | null): Promise<string | null> {
  const rawId = String(vSlug || "").replace(/^v/i, "");
  if (!/^[a-z0-9]{6,}$/i.test(rawId)) return null;

  const candidates = [
    cachedHlsUrl || null,
    `https://rumble.com/live-hls/${rawId}/playlist.m3u8`,
    `https://rumble.com/live-hls-dvr/${rawId}/playlist.m3u8`,
  ].filter((value, index, all): value is string => !!value && all.indexOf(value) === index);

  for (const candidate of candidates) {
    const directUrl = isRumbleMasterPlaylistUrl(candidate)
      ? await resolveRedirectToCdn(candidate)
      : candidate;
    if (directUrl && await isActiveChunklist(directUrl)) return directUrl;
  }
  return null;
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

    let isLiveFinal = isLive;
    if (isLive && rawId && videoId) {
      videoUrl = `https://rumble.com/user/${username}/live`;

      // 1. embedJS → URL HLS + video_id numérique + thumbnail
      const { hlsUrl: embedHls, vidNumeric, thumbnailUrl: thumb } = await resolveFromEmbedJs(videoId);
      videoIdNumeric = vidNumeric;
      thumbnailUrl = thumb;
      const rawHls = embedHls || buildRumbleHlsUrl(rawId);

      // 2. Si live-hls-dvr : suivre la redirection côté serveur (Render) pour obtenir l'URL CDN
      //    Le Worker CF est bloqué par Cloudflare WAF sur rumble.com, Render (AWS) ne l'est pas
      if (isRumbleMasterPlaylistUrl(rawHls)) {
        const cdnHls = await resolveRedirectToCdn(rawHls);
        hlsUrl = cdnHls || rawHls;
      } else {
        hlsUrl = rawHls;
      }

      // 3. Check définitif via la chunklist : si #EXT-X-ENDLIST → stream
      //    finalisé (DVR replay), considérer offline. Rumble met parfois 5-10
      //    minutes à passer `live: 1` → `live: 0` côté API, mais la chunklist
      //    réagit immédiatement.
      if (hlsUrl && hlsUrl.includes("1a-1791.com")) {
        const ended = await isChunklistEnded(hlsUrl);
        if (ended) {
          console.log(`[rumble] ${username}: ENDLIST détecté → stream terminé (DVR)`);
          isLiveFinal = false;
          hlsUrl = null;
        }
      }

      if (isLiveFinal) {
        console.log(`[rumble] ${username}: LIVE — videoId=${videoId}, vidNumeric=${videoIdNumeric}, hlsUrl=${hlsUrl}`);
      } else {
        console.log(`[rumble] ${username}: offline (chunklist ENDLIST)`);
      }
    } else {
      console.log(`[rumble] ${username}: offline`);
    }

    return {
      username,
      isLive: isLiveFinal,
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
export async function resolveRumbleVodFromVid(videoIdWithV: string): Promise<{
  mp4Url: string | null; hlsUrl: string | null;
  title: string | null; thumbnailUrl: string | null;
  durationSec: number | null; videoIdNumeric: string | null;
}> {
  const empty = { mp4Url: null, hlsUrl: null, title: null, thumbnailUrl: null, durationSec: null, videoIdNumeric: null };
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
    if (!r.ok) return empty;
    const d: any = await r.json().catch(() => null);
    if (!d) return empty;

    const mp4 = d?.ua?.mp4?.auto?.url
      || d?.ua?.mp4?.["1080"]?.url
      || d?.ua?.mp4?.["720"]?.url
      || d?.ua?.mp4?.["480"]?.url
      || d?.u?.mp4?.url
      || null;
    const hls: string | null = d?.u?.hls?.url || d?.ua?.hls?.auto?.url || null;

    // VOD prêt = `live: 0` ET (HLS VOD permanent `hls-vod/` OU MP4 CDN hors rumble.com).
    // Rumble ne renvoie quasiment plus de MP4 simple — le HLS VOD `rumble.com/hls-vod/{vid}/playlist.m3u8`
    // est l'URL canonique playable et c'est ça qu'on doit stocker.
    const isLiveStill = !!d?.live;
    const isHlsPermanent = !!(hls && hls.includes("/hls-vod/"));
    const isMp4Permanent = !!(mp4 && !mp4.includes("rumble.com/live-hls-dvr"));
    const ready = !isLiveStill && (isHlsPermanent || isMp4Permanent);

    if (!ready) {
      console.log(`[rumble][vod] ${videoIdWithV}: VOD pas encore prêt (live=${d?.live}, hls=${hls?.includes("/live-hls-dvr/") ? "live-dvr" : (isHlsPermanent ? "vod" : "—")})`);
      return empty;
    }

    const title = d?.title ? String(d.title) : null;
    const thumb = d?.i ? String(d.i) : null;
    const duration = Number(d?.duration) || null;
    const vidNum = d?.vid != null ? String(d.vid) : null;

    console.log(`[rumble][vod] ${videoIdWithV}: VOD prêt hls=${isHlsPermanent ? "vod" : "n/a"} mp4=${isMp4Permanent ? "yes" : "no"}`);
    return { mp4Url: mp4 || null, hlsUrl: hls, title, thumbnailUrl: thumb, durationSec: duration, videoIdNumeric: vidNum };
  } catch (e) {
    console.error(`[rumble][vod] resolveRumbleVodFromVid error`, e);
    return empty;
  }
}

/**
 * Récupère le slug du live courant en fetchant `/user/{username}/live`
 * et en extrayant `"video":"vXXXXXX"` du player init JS. Cette URL est
 * spécifique au live courant (pas la liste de VODs qui est CF-bloquée).
 * Renvoie null si pas de live actif ou si CF bloque.
 */
async function findCurrentLiveSlugFromLivePage(username: string): Promise<string | null> {
  // Cloudflare bloque les fetch standard depuis Render IPs.
  // Solution: passer par notre CF Worker (lunalive-hls.lunalive.workers.dev)
  // qui tourne dans le réseau Cloudflare → fetch interne CF→CF, pas de WAF anti-bot.
  // Le worker fait le scrape et nous renvoie juste le slug en JSON.
  const workerBase = String(process.env.RUMBLE_WORKER_BASE || "https://lunalive-hls.lunalive.workers.dev").replace(/\/$/, "");
  const url = `${workerBase}/rumble-live?user=${encodeURIComponent(username)}`;
  try {
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    if (!r.ok) {
      console.log(`[rumble][live-page] ${username}: worker http=${r.status}`);
      return null;
    }
    const j: any = await r.json().catch(() => null);
    if (!j?.ok) {
      console.log(`[rumble][live-page] ${username}: worker error ${j?.error || ""}`);
      return null;
    }
    if (j.slug) {
      console.log(`[rumble][live-page] ${username}: worker→slug=${j.slug} (path=${j.path})`);
      return j.slug;
    }
    console.log(`[rumble][live-page] ${username}: worker no slug (path=${j.path}, lastStatus=${j.lastStatus})`);
    return null;
  } catch (e: any) {
    console.warn(`[rumble][live-page] ${username}: worker fetch error`, e?.message || e);
    return null;
  }
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

  let cachedLiveId: string | null = null;
  let cachedHlsUrl: string | null = null;
  let cachedVideoIdNumeric: string | null = null;
  if (streamerId) {
    const cached = await pool.query(
      `SELECT live_id, hls_url, live_video_id_numeric
       FROM streamer_rumble_info WHERE streamer_id = $1 LIMIT 1`,
      [streamerId]
    ).catch(() => null);
    cachedLiveId = cached?.rows?.[0]?.live_id ? String(cached.rows[0].live_id) : null;
    cachedHlsUrl = cached?.rows?.[0]?.hls_url ? String(cached.rows[0].hls_url) : null;
    cachedVideoIdNumeric = cached?.rows?.[0]?.live_video_id_numeric
      ? String(cached.rows[0].live_video_id_numeric)
      : null;
  }

  // 1. Tentative directe via /user/{name}/live
  let vSlug: string | null = await findCurrentLiveSlugFromLivePage(username);

  // 2. Fallback : live_id pushé par le relay local
  if (!vSlug) vSlug = cachedLiveId;

  if (!vSlug) {
    return offline;
  }

  // Valide via embedJS quand Rumble l'autorise encore.
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
    const d: any = r2.ok ? await r2.json() : null;
    // `live: 1/2` = stream actuellement en cours.
    // `live: 0` = stream fini (peut encore renvoyer URL DVR pour rewatch).
    // `livestream_has_dvr` n'est PAS un indicateur d'état (juste un flag config).
    // Si l'URL HLS est `hls-vod/...` c'est aussi un signal de fin.
    const hlsCandidatePeek = d?.u?.hls?.url || d?.ua?.hls?.auto?.url || "";
    const isVodUrl = typeof hlsCandidatePeek === "string" && hlsCandidatePeek.includes("/hls-vod/");
    const isLive = !!d?.live && !isVodUrl;
    if (isLive && hlsCandidatePeek) {
      const finalHls = await resolveActiveHlsFromSlug(vSlug, hlsCandidatePeek);
      if (finalHls) {
        const vidNumeric = d?.vid != null ? String(d.vid) : cachedVideoIdNumeric;
        const thumbnailUrl = d?.i ? String(d.i) : null;
        console.log(`[rumble][pseudo-only] ${username}: LIVE via embedJS — vid=${vSlug}, hls=${finalHls}`);
        return {
          username,
          isLive: true,
          viewersCount: typeof d?.watching_now === "number" ? d.watching_now : null,
          title: String(d?.title || `Live de ${username}`),
          thumbnailUrl,
          videoUrl: `https://rumble.com/user/${username}/live`,
          hlsUrl: finalHls,
          videoId: vSlug,
          videoIdNumeric: vidNumeric,
          createdAt: d?.pubDate || null,
        };
      }
    }
  } catch (e) {
    console.warn(`[rumble][pseudo-only] ${username}: embedJS indisponible`, e);
  }

  // Rumble peut repondre 403 sur embedJS tout en servant normalement le live.
  // Une chunklist CDN sans ENDLIST est alors notre source de verite.
  const matchingCachedHls = cachedLiveId?.toLowerCase() === vSlug.toLowerCase() ? cachedHlsUrl : null;
  const fallbackHls = await resolveActiveHlsFromSlug(vSlug, matchingCachedHls);
  if (!fallbackHls) {
    console.log(`[rumble][pseudo-only] ${username}: ${vSlug} pas de chunklist live active`);
    return offline;
  }

  console.log(`[rumble][pseudo-only] ${username}: LIVE via HLS fallback — vid=${vSlug}, hls=${fallbackHls}`);
  return {
    username,
    isLive: true,
    viewersCount: null,
    title: `Live de ${username}`,
    thumbnailUrl: null,
    videoUrl: `https://rumble.com/user/${username}/live`,
    hlsUrl: fallbackHls,
    videoId: vSlug,
    videoIdNumeric: cachedVideoIdNumeric,
    createdAt: null,
  };
}

/** Récupère l'info Rumble pour un streamer donné. Essaie d'abord le path
 *  api_key (rumble_accounts), puis le pseudo-only (streamers.rumble_username). */
export async function fetchRumbleInfoForStreamerSlug(slug: string): Promise<RumbleLiveInfo> {
  const streamerResult = await pool.query(
    `SELECT id, rumble_username FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
    [slug]
  );

  if (!streamerResult.rows[0]) {
    console.error(`[rumble] Streamer ${slug} not found`);
    return offlineInfo(slug);
  }

  const streamerId = Number(streamerResult.rows[0].id);
  const pseudoUsername: string | null = streamerResult.rows[0].rumble_username || null;

  // 1. api_key path
  const { username, apiKey } = await getRumbleAccountForStreamer(streamerId);
  if (apiKey && username) {
    return await fetchRumbleLiveInfo(username, apiKey);
  }

  // 2. pseudo-only path
  if (pseudoUsername) {
    return await fetchRumbleLiveInfoFromUsername(pseudoUsername, streamerId);
  }

  console.error(`[rumble] No Rumble account/pseudo configured for ${slug}`);
  return offlineInfo(slug);
}
