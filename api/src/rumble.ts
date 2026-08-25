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

export type RumbleCategoryLive = {
  username: string;
  videoId: string;
  videoIdNumeric: string | null;
  viewersCount: number;
  title: string | null;
  thumbnailUrl: string | null;
  videoUrl: string;
  profileUrl: string;
  followers: number;
  createdAt: string | null;
};

export type RumbleCategorySnapshot = {
  lives: Map<string, RumbleCategoryLive>;
  fetchedAt: number;
  complete: boolean;
};

const RUMBLE_GAMBLING_CATEGORY_URL = "https://rumble.com/category/gambling-slots";
const CATEGORY_CACHE_MS = 20_000;
const CATEGORY_MAX_PAGES = 5;
let categoryCache: { expiresAt: number; snapshot: RumbleCategorySnapshot } | null = null;
let categoryRequest: Promise<RumbleCategorySnapshot | null> | null = null;

type RumbleCategoryPage = {
  lives: Map<string, RumbleCategoryLive>;
  itemCount: number;
  limit: number;
};

function parseRumbleCategoryLives(html: string): RumbleCategoryPage {
  const gridStart = html.indexOf("<rum-videos-grid");
  if (gridStart < 0) throw new Error("rumble_category_grid_missing");
  const gridEnd = html.indexOf(">", gridStart);
  if (gridEnd < 0) throw new Error("rumble_category_grid_unclosed");
  const gridTag = html.slice(gridStart, gridEnd + 1).replaceAll("&amp;", "&");
  if (!/collection=["']category\.videos["']/i.test(gridTag) ||
      !/filter=["'][^"']*category=gambling-slots[^"']*video_type=live/i.test(gridTag)) {
    throw new Error("rumble_category_grid_unexpected");
  }
  const limit = Math.max(1, Math.min(100, Number(gridTag.match(/\blimit=["'](\d+)["']/i)?.[1] || 24)));
  const scriptStart = html.indexOf('<script type="application/json">', gridStart);
  if (scriptStart < 0) throw new Error("rumble_category_json_missing");
  const jsonStart = html.indexOf(">", scriptStart) + 1;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  if (jsonEnd < 0) throw new Error("rumble_category_json_unclosed");
  const payload = JSON.parse(html.slice(jsonStart, jsonEnd)) as { items?: unknown };
  if (!Array.isArray(payload.items)) throw new Error("rumble_category_items_missing");
  const items = payload.items as any[];
  const lives = new Map<string, RumbleCategoryLive>();
  for (const item of items) {
    if (item?.object_type !== "video" || item?.live !== true) continue;
    const profilePath = String(item?.by?.relative_url || "");
    const username = profilePath.split("/").filter(Boolean).at(-1) || String(item?.by?.name || "");
    const videoId = String(item?.permalink_id || "").toLowerCase();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(username) || !/^v[a-z0-9]{5,}$/i.test(videoId)) continue;
    const viewers = Number(item?.watching_now);
    const followers = Number(item?.by?.followers);
    lives.set(username.toLowerCase(), {
      username,
      videoId,
      videoIdNumeric: Number.isFinite(Number(item?.id)) ? String(item.id) : null,
      viewersCount: Number.isFinite(viewers) ? Math.max(0, Math.round(viewers)) : 0,
      title: typeof item?.title === "string" ? item.title : null,
      thumbnailUrl: typeof item?.thumb === "string" ? item.thumb : null,
      videoUrl: typeof item?.url === "string" ? item.url : `https://rumble.com/${videoId}.html`,
      profileUrl: typeof item?.by?.url === "string" ? item.by.url : `https://rumble.com/user/${username}`,
      followers: Number.isFinite(followers) ? Math.max(0, Math.round(followers)) : 0,
      createdAt: typeof item?.live_streamed_on === "string" ? item.live_streamed_on : null,
    });
  }
  return { lives, itemCount: items.length, limit };
}

async function fetchRumbleCategoryPage(page: number): Promise<RumbleCategoryPage> {
  const url = page === 1 ? RUMBLE_GAMBLING_CATEGORY_URL : `${RUMBLE_GAMBLING_CATEGORY_URL}?page=${page}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`rumble_category_http_${response.status}`);
    return parseRumbleCategoryLives(await response.text());
  } catch (directError) {
    const base = String(process.env.NIVORA_API_BASE || "").replace(/\/$/, "");
    const key = String(process.env.NIVORA_BOT_INTERNAL_KEY || "");
    if (!base || !key) throw directError;
    const response = await fetch(`${base}/api/internal/recruitment/rumble?page=${page}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: "application/json", "x-nivora-bot-key": key },
    });
    if (!response.ok) throw new Error(`rumble_category_relay_http_${response.status}`);
    const payload = await response.json() as { ok?: unknown; lives?: unknown; itemCount?: unknown; limit?: unknown };
    if (payload.ok !== true || !Array.isArray(payload.lives)) throw new Error("rumble_category_relay_invalid");
    const lives = new Map<string, RumbleCategoryLive>();
    for (const raw of payload.lives as any[]) {
      const username = String(raw?.username || "");
      const videoId = String(raw?.videoId || "").toLowerCase();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(username) || !/^v[a-z0-9]{5,}$/i.test(videoId)) continue;
      lives.set(username.toLowerCase(), {
        username,
        videoId,
        videoIdNumeric: typeof raw?.videoIdNumeric === "string" ? raw.videoIdNumeric : null,
        viewersCount: Math.max(0, Math.round(Number(raw?.viewersCount) || 0)),
        title: typeof raw?.title === "string" ? raw.title : null,
        thumbnailUrl: typeof raw?.thumbnailUrl === "string" ? raw.thumbnailUrl : null,
        videoUrl: typeof raw?.videoUrl === "string" ? raw.videoUrl : `https://rumble.com/${videoId}.html`,
        profileUrl: typeof raw?.profileUrl === "string" ? raw.profileUrl : `https://rumble.com/user/${username}`,
        followers: Math.max(0, Math.round(Number(raw?.followers) || 0)),
        createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : null,
      });
    }
    const itemCount = Number(payload.itemCount);
    const limit = Number(payload.limit);
    if (!Number.isInteger(itemCount) || itemCount < 0 || !Number.isInteger(limit) || limit < 1) {
      throw new Error("rumble_category_relay_counts_invalid");
    }
    return { lives, itemCount, limit };
  }
}

/**
 * One lightweight request discovers every current Gambling & Slots live.
 * Unlike profile pages, this category index is accessible from Render.
 */
export async function fetchRumbleGamblingCategoryLives(): Promise<RumbleCategorySnapshot | null> {
  if (categoryCache && categoryCache.expiresAt > Date.now()) return categoryCache.snapshot;
  if (categoryRequest) return categoryRequest;
  categoryRequest = (async () => {
    try {
      const lives = new Map<string, RumbleCategoryLive>();
      let complete = false;
      for (let page = 1; page <= CATEGORY_MAX_PAGES; page += 1) {
        let parsed: RumbleCategoryPage;
        try {
          parsed = await fetchRumbleCategoryPage(page);
        } catch (error: any) {
          if (page === 1) throw error;
          console.warn(`[rumble][category] page ${page} unavailable; keeping a partial snapshot`, error?.message || error);
          break;
        }
        for (const [username, live] of parsed.lives) lives.set(username, live);
        if (parsed.itemCount < parsed.limit) {
          complete = true;
          break;
        }
      }
      const snapshot: RumbleCategorySnapshot = { lives, fetchedAt: Date.now(), complete };
      categoryCache = { expiresAt: Date.now() + CATEGORY_CACHE_MS, snapshot };
      console.log(`[rumble][category] ${snapshot.lives.size} live(s), complete=${snapshot.complete}`);
      return snapshot;
    } catch (error: any) {
      console.warn("[rumble][category] fetch failed", error?.message || error);
      return null;
    } finally {
      categoryRequest = null;
    }
  })();
  return categoryRequest;
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
 * Valide le master live-hls-dvr côté serveur et extrait une sous-playlist CDN
 * pour la sonde ENDLIST. Le navigateur reçoit le master CORS afin que HLS.js
 * conserve toutes les qualités adaptatives.
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
    if (!text.trimStart().startsWith("#EXTM3U") || text.includes("#EXT-X-ENDLIST")) return false;

    // Rumble may keep a stale chunklist online after every media segment has
    // expired. Checking only ENDLIST then leaves channels falsely live for
    // hours and gives the thumbnail renderer nothing but 404s.
    const segments = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .slice(-4);
    if (!segments.length) return false;

    const probes = await Promise.all(segments.map(async (segment) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      try {
        const response = await fetch(new URL(segment, chunklistUrl), {
          signal: controller.signal,
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            accept: "video/mp2t,video/*,*/*",
            referer: "https://rumble.com/",
            range: "bytes=0-0",
          },
        });
        await response.body?.cancel().catch(() => {});
        return response.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    }));
    return probes.some(Boolean);
  } catch {
    return false;
  }
}

type ResolvedLivePlaylist = {
  /** URL chargée par HLS.js. On conserve le master pour laisser l'ABR choisir. */
  playbackUrl: string;
  /** Sous-playlist utilisée uniquement pour détecter #EXT-X-ENDLIST. */
  probeUrl: string | null;
};

async function resolveRedirectToCdn(liveHlsDvrUrl: string): Promise<ResolvedLivePlaylist | null> {
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
      return { playbackUrl: finalUrl, probeUrl: finalUrl };
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
      // Le master Rumble est CORS et ne pèse que quelques centaines d'octets.
      // Le transmettre au navigateur rend enfin disponibles 360p/720p/1080p
      // et évite de forcer la variante source la plus lourde à chaque viewer.
      return { playbackUrl: finalUrl, probeUrl: chosen.url };
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
    const resolved = isRumbleMasterPlaylistUrl(candidate)
      ? await resolveRedirectToCdn(candidate)
      : { playbackUrl: candidate, probeUrl: candidate };
    const directUrl = resolved?.probeUrl || resolved?.playbackUrl || null;
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
    let liveProbeUrl: string | null = null;
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

      // 2. Valider le master côté serveur et conserver son URL pour l'ABR.
      //    La sous-playlist CDN sert uniquement de sonde ENDLIST.
      if (isRumbleMasterPlaylistUrl(rawHls)) {
        const resolvedHls = await resolveRedirectToCdn(rawHls);
        hlsUrl = resolvedHls?.playbackUrl || rawHls;
        liveProbeUrl = resolvedHls?.probeUrl || null;
      } else {
        hlsUrl = rawHls;
        liveProbeUrl = rawHls;
      }

      // 3. Check définitif via la chunklist : si #EXT-X-ENDLIST → stream
      //    finalisé (DVR replay), considérer offline. Rumble met parfois 5-10
      //    minutes à passer `live: 1` → `live: 0` côté API, mais la chunklist
      //    réagit immédiatement.
      if (liveProbeUrl) {
        const ended = await isChunklistEnded(liveProbeUrl);
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

/** Resolve a Rumble DVR master server-side so browsers never hit its CF-blocked URL. */
export async function resolveRumbleDvrPlaybackUrl(videoId: string): Promise<string | null> {
  const rawId = String(videoId || "").trim().replace(/^v/i, "");
  if (!/^[a-z0-9]{6,}$/i.test(rawId)) return null;
  const resolved = await resolveRedirectToCdn(
    `https://rumble.com/live-hls-dvr/${rawId}/playlist.m3u8`
  );
  const url = resolved?.probeUrl || null;
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.apple.mpegurl, application/x-mpegurl, */*",
        referer: "https://rumble.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.trimStart().startsWith("#EXTM3U") ? url : null;
  } catch {
    return null;
  }
}

export type RumbleVodCandidate = {
  permlink: string;
  title: string;
  hlsUrl: string | null;
  mp4Url: string | null;
  thumbnailUrl: string | null;
  createdAtMs: number;
  durationSec: number;
  videoIdNumeric: string | null;
  legacyLiveRef: string;
};

function decodeRumbleHtmlText(value: string) {
  return value
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/**
 * Jina Reader can reach Rumble's public embed page from Render and returns
 * the finalized player configuration. The old live id is deliberately used:
 * Rumble keeps it as the embed id even after assigning a new VOD permlink.
 */
export async function resolveRumbleVodViaReaderFromEmbed(
  videoIdWithV: string
): Promise<RumbleVodCandidate | null> {
  const videoId = String(videoIdWithV || "").trim().toLowerCase();
  if (!/^v[a-z0-9]{5,}$/i.test(videoId)) return null;

  const response = await fetch(`https://r.jina.ai/http://rumble.com/embed/${encodeURIComponent(videoId)}/`, {
    signal: AbortSignal.timeout(45_000),
    headers: {
      accept: "application/json",
      "x-return-format": "html",
    },
  });
  if (!response.ok) throw new Error(`rumble_reader_embed_http_${response.status}`);
  const payload = await response.json() as { data?: { html?: unknown } };
  const html = String(payload?.data?.html || "").replace(/\\\//g, "/");
  const hlsUrl = html.match(/https:\/\/rumble\.com\/hls-vod\/[A-Za-z0-9_-]+\/playlist\.m3u8/i)?.[0] || null;
  if (!hlsUrl) return null;

  const permanentPath = html.match(/"l":"(\/v[a-z0-9]+-[^"?]+\.html)"/i)?.[1] || "";
  const permlink = permanentPath.match(/\/(v[a-z0-9]+)-/i)?.[1] || videoId;
  const title = decodeRumbleHtmlText(html.match(/"title":"([^"]*)"/i)?.[1] || "");
  const thumbnailUrl = html.match(/"i":"(https:\/\/[^"\\]+)"/i)?.[1] || null;
  const durationSec = Math.max(0, Number(html.match(/"duration":(\d+)/i)?.[1]) || 0);
  const videoIdNumeric = html.match(/"vid":(\d+)/i)?.[1] || null;

  return {
    permlink,
    title,
    hlsUrl,
    mp4Url: null,
    thumbnailUrl,
    // The embed exposes upload time, not the actual live start. Keep zero so
    // the clip worker retains its captured at_sec instead of shifting it.
    createdAtMs: 0,
    durationSec,
    videoIdNumeric,
    legacyLiveRef: videoId,
  };
}

/**
 * Rumble changes a live permlink when it publishes the permanent VOD. The
 * profile grid keeps both the permanent HLS URL and a log reference to the
 * original live id, so it is a more reliable post-live source than embedJS.
 */
export async function fetchRecentRumbleVodsForUsername(
  username: string,
  limit = 30
): Promise<RumbleVodCandidate[]> {
  const safeUsername = String(username || "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(safeUsername)) return [];
  const cappedLimit = Math.max(1, Math.min(100, limit));

  const parseProfile = (html: string): RumbleVodCandidate[] => {
    const payloads = Array.from(
      html.matchAll(/<rum-videos-grid\b[^>]*>[\s\S]*?<script\s+type=["']application\/json["']>\s*([\s\S]*?)<\/script>/gi)
    );
    const out: RumbleVodCandidate[] = [];
    for (const match of payloads) {
      let parsed: any = null;
      try { parsed = JSON.parse(match[1]); } catch { continue; }
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      for (const item of items) {
        if (item?.object_type !== "video" || item?.live === true) continue;
        const videos = Array.isArray(item?.videos) ? item.videos : [];
        const hls = videos.find((video: any) => video?.type === "hls" && typeof video?.url === "string")?.url || null;
        const mp4 = videos.find((video: any) => video?.type === "mp4" && typeof video?.url === "string")?.url || null;
        if (!hls && !mp4) continue;
        const createdAtMs = Date.parse(String(item?.live_streamed_on || item?.upload_date || ""));
        out.push({
          permlink: String(item?.permalink_id || ""),
          title: String(item?.title || ""),
          hlsUrl: hls ? String(hls) : null,
          mp4Url: mp4 ? String(mp4) : null,
          thumbnailUrl: item?.thumb ? String(item.thumb) : null,
          createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
          durationSec: Math.max(0, Number(item?.duration) || 0),
          videoIdNumeric: Number.isFinite(Number(item?.id)) ? String(item.id) : null,
          legacyLiveRef: JSON.stringify(item?.log || {}),
        });
        if (out.length >= cappedLimit) return out;
      }
    }
    return out;
  };

  try {
    const response = await fetch(`https://rumble.com/user/${encodeURIComponent(safeUsername)}`, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`rumble_profile_http_${response.status}`);
    const direct = parseProfile(await response.text());
    if (direct.length) return direct;
  } catch (error: any) {
    console.warn(`[rumble][vod-profile] direct fetch failed user=${safeUsername}`, error?.message || error);
  }

  throw new Error(`rumble_profile_vods_unavailable_${safeUsername}`);
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
    } else {
      const j: any = await r.json().catch(() => null);
      if (!j?.ok) {
      console.log(`[rumble][live-page] ${username}: worker error ${j?.error || ""}`);
      } else if (j.slug) {
        console.log(`[rumble][live-page] ${username}: worker→slug=${j.slug} (path=${j.path})`);
        return j.slug;
      } else {
        console.log(`[rumble][live-page] ${username}: worker no slug (path=${j.path}, lastStatus=${j.lastStatus})`);
      }
    }
  } catch (e: any) {
    console.warn(`[rumble][live-page] ${username}: worker fetch error`, e?.message || e);
  }

  // Rumble can block the Cloudflare-to-Cloudflare route with a 403. The public
  // profile remains readable through Jina's text renderer and contains a
  // distinct "N LIVE" video card. We try both Rumble profile kinds because
  // recorded discovery can return either /user/ or /c/ creators.
  const profileKinds = ["user", "c"] as const;
  const results = await Promise.all(profileKinds.map(async (kind) => {
    const profileUrl = `https://r.jina.ai/http://rumble.com/${kind}/${encodeURIComponent(username)}`;
    try {
      const response = await fetch(profileUrl, {
        signal: AbortSignal.timeout(20_000),
        headers: { accept: "text/plain" },
      });
      if (!response.ok) return null;
      const text = await response.text();
      const live = text.match(/\bLIVE\]\(http:\/\/rumble\.com\/(v[a-z0-9]+)[^)]*\)/i);
      return live?.[1] ? { slug: live[1], kind } : null;
    } catch {
      return null;
    }
  }));
  const live = results.find(Boolean);
  if (live) {
    console.log(`[rumble][live-page] ${username}: reader→slug=${live.slug} (path=${live.kind})`);
    return live.slug;
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
        const rawViewers = d?.watching_now ?? d?.watching ?? d?.viewer_count ?? d?.viewers ?? null;
        const viewersCount = Number.isFinite(Number(rawViewers))
          ? Math.max(0, Math.round(Number(rawViewers)))
          : null;
        const thumbnailUrl = d?.i ? String(d.i) : null;
        console.log(`[rumble][pseudo-only] ${username}: LIVE via embedJS — vid=${vSlug}, hls=${finalHls}`);
        return {
          username,
          isLive: true,
          viewersCount,
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
