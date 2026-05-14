const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-expose-headers":
    "content-type,content-length,accept-ranges,content-range,cache-control"
};

function hostMatches(host: string, pattern: string) {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase().trim();
  if (!p) return false;
  if (p.startsWith("*.")) return h === p.slice(2) || h.endsWith(p.slice(1));
  return h === p;
}

const DEFAULT_ALLOWED = [
  // DLive
  "live.prd.dlive.tv", "*.dlive.tv", "*.dlivecdn.com", "dlivecdn.com",
  // Rumble
  "rumble.com", "*.rumble.com",
  "1a-1791.com", "*.1a-1791.com",
  // Rumble CDN secondaire (ex: hugh.cdn.rumble.cloud)
  "rumble.cloud", "*.rumble.cloud",
];

function isAllowedHost(host: string) {
  return DEFAULT_ALLOWED.some((p) => hostMatches(host, p));
}


function proxyUrl(origin: string, abs: string) {
  return `${origin}/hls?u=${encodeURIComponent(abs)}`;
}

function rewriteM3u8(text: string, base: URL, origin: string) {

  const lines = text.split("\n");

  return lines
    .map((line) => {
      const s = line.trim();
      if (!s) return line;

      // Rewrite URI="..." in tags (keys/maps)
      if (s.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const u = new URL(uri, base);
          const swapped = trySwapLivestreamHost(u);
          const abs = (swapped ?? u).toString();
          return `URI="${proxyUrl(origin, abs)}"`;
        });
      }

      // Segment / playlist URL line
      const u = new URL(s, base);
      const swapped = trySwapLivestreamHost(u);
      const abs = (swapped ?? u).toString();
      return proxyUrl(origin, abs);

    })
    .join("\n");
}

function isPlaylist(url: URL) {
  return url.pathname.endsWith(".m3u8");
}

function isLikelyM3u8(ct: string, text?: string) {
  const c = (ct || "").toLowerCase();
  if (c.includes("application/vnd.apple.mpegurl")) return true;
  if (c.includes("application/x-mpegurl")) return true;
  if (typeof text === "string" && text.trimStart().startsWith("#EXTM3U")) return true;
  return false;
}

function isSignedMissingKey(status: number, ct: string, bodyText: string) {
  if (status !== 403) return false;
  const c = (ct || "").toLowerCase();
  if (!c.includes("xml") && !c.includes("text")) return false;
  const t = bodyText || "";
  return (
    t.includes("MissingKey") ||
    t.includes("Missing Key-Pair-Id") ||
    t.includes("Key-Pair-Id")
  );
}

function trySwapLivestreamHost(u: URL): URL | null {
  const h = u.hostname;
  // ✅ ONLY: livestreams.* -> livestreamt.*
  if (h.startsWith("livestreams.")) {
    const v = new URL(u.toString());
    v.hostname = h.replace(/^livestreams\./, "livestreamt.");
    return v;
  }
  return null;
}


function withCors(h: Headers) {
  const out = new Headers(h);
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.set(k, v);
  out.set("x-hls-worker-ver", "2026-04-09-a"); // change à chaque deploy
  return out;
}


export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors(new Headers()) });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method_not_allowed", {
        status: 405,
        headers: withCors(new Headers({ "content-type": "text/plain" }))
      });
    }

    // ────────────────────────────────────────────────────────
    // /rumble-live?user=X → resolve current live slug
    // CF Worker → CF Rumble = pas de 403 anti-bot.
    // Permet à Render de découvrir le slug du live courant sans relay local.
    // ────────────────────────────────────────────────────────
    if (url.pathname === "/rumble-live") {
      const raw = (url.searchParams.get("user") || "").trim();
      if (!raw || !/^[A-Za-z0-9_-]{1,64}$/.test(raw)) {
        return new Response(JSON.stringify({ ok: false, error: "bad_user" }), {
          status: 400,
          headers: withCors(new Headers({ "content-type": "application/json" }))
        });
      }
      const isChannelId = /^c-\d+$/i.test(raw);
      const paths = isChannelId
        ? [`/c/${encodeURIComponent(raw)}/live`, `/user/${encodeURIComponent(raw)}/live`]
        : [`/user/${encodeURIComponent(raw)}/live`, `/c/${encodeURIComponent(raw)}/live`];

      const browserUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
      const browserHeaders: Record<string, string> = {
        "user-agent": browserUa,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "accept-encoding": "gzip, deflate, br",
        "sec-ch-ua": '"Chromium";v="124", "Not.A/Brand";v="24", "Google Chrome";v="124"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "cache-control": "no-cache",
        "pragma": "no-cache",
      };
      let foundSlug: string | null = null;
      let foundPath: string | null = null;
      let lastStatus = 0;

      for (const p of paths) {
        try {
          const r = await fetch(`https://rumble.com${p}`, {
            method: "GET",
            headers: browserHeaders,
            redirect: "follow",
          });
          lastStatus = r.status;
          if (!r.ok) continue;
          const html = await r.text();
          const m = html.match(/"video":\s*"(v[a-z0-9]{6})"/);
          if (m?.[1]) {
            foundSlug = m[1];
            foundPath = p;
            break;
          }
          foundPath = p;
          break;
        } catch { /* try next */ }
      }

      const body = JSON.stringify({
        ok: true,
        user: raw,
        slug: foundSlug,
        path: foundPath,
        lastStatus,
      });
      return new Response(body, {
        status: 200,
        headers: withCors(new Headers({
          "content-type": "application/json",
          "cache-control": "public, max-age=10",
        })),
      });
    }

    // We support: /hls?u=<encodedUrl>
    if (url.pathname !== "/hls") {
      return new Response("not_found", {
        status: 404,
        headers: withCors(new Headers({ "content-type": "text/plain" }))
      });
    }

    const raw = url.searchParams.get("u") || "";
    if (!raw) {
      return new Response("missing_u", {
        status: 400,
        headers: withCors(new Headers({ "content-type": "text/plain" }))
      });
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return new Response("bad_url", {
        status: 400,
        headers: withCors(new Headers({ "content-type": "text/plain" }))
      });
    }

    if (target.protocol !== "https:") {
      return new Response("bad_protocol", {
        status: 400,
        headers: withCors(new Headers({ "content-type": "text/plain" }))
      });
    }

    if (!isAllowedHost(target.hostname)) {
      return new Response("host_not_allowed", {
        status: 400,
        headers: withCors(new Headers({ "content-type": "text/plain" }))
      });
    }
    // ✅ DLive: livestreams.* est parfois signé (403 MissingKey). On force livestreamt.*
    const swapped = trySwapLivestreamHost(target);
    if (swapped) target = swapped;


    const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    const headers = new Headers();
    headers.set("accept", "application/vnd.apple.mpegurl, application/x-mpegurl, */*;q=0.9");
    headers.set("accept-language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7");
    headers.set("accept-encoding", "gzip, deflate, br");
    headers.set("user-agent", BROWSER_UA);

    // browser-like headers (souvent requis)
    const isRumble = target.hostname.includes('rumble') || target.hostname.includes('1a-1791');
    const isLiveDvr = target.pathname.includes('live-hls-dvr');
    headers.set('referer', isRumble ? 'https://rumble.com/' : 'https://dlive.tv/');
    // Ne pas envoyer origin pour live-hls-dvr — rumble bloque origin cross-site sur cet endpoint
    if (!isLiveDvr) {
      headers.set('origin', isRumble ? 'https://rumble.com' : 'https://dlive.tv');
    }
    // Sec-* headers requis par Cloudflare Bot Management pour ne pas être flaggé bot
    headers.set('sec-ch-ua', '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"Windows"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', isRumble ? 'same-origin' : 'cross-site');

    // Range (pour segments)
    const range = request.headers.get("range");
    if (range) headers.set("range", range);

    const playlist = isPlaylist(target);

    // ✅ Cloudflare edge cache via fetch options
    let upstream = await fetch(target.toString(), {
      headers,
      redirect: "follow",
      cf: {
        cacheEverything: true,
        cacheTtl: playlist ? 1 : 3600
      } as any
    });

    let ct = upstream.headers.get("content-type") || "";

    // Playlist ?
    if (playlist) {
      const text = await upstream.text();

      // ✅ Si ce n'est pas une VRAIE m3u8 (ex: XML erreur), on renvoie tel quel (plus de rewrite débile)
      if (!upstream.ok || !isLikelyM3u8(ct, text)) {
        const outHeaders = new Headers();
        outHeaders.set("content-type", ct || "text/plain; charset=utf-8");
        outHeaders.set("cache-control", "no-store");
        return new Response(text, {
          status: upstream.status,
          headers: withCors(outHeaders)
        });
      }
      const origin = new URL(request.url).origin;
      const rewritten = rewriteM3u8(text, target, origin);


      const outHeaders = new Headers();
      outHeaders.set("content-type", ct || "application/vnd.apple.mpegurl");
      outHeaders.set("cache-control", "public, max-age=1, s-maxage=2, must-revalidate");
      return new Response(rewritten, {
        status: upstream.status,
        headers: withCors(outHeaders)
      });
    }

    // Content-type playlist même si URL ne finit pas par .m3u8 (rare mais safe)
    if (isLikelyM3u8(ct)) {
      const text = await upstream.text();
      if (!upstream.ok) {
        const outHeaders = new Headers();
        outHeaders.set("content-type", ct || "text/plain; charset=utf-8");
        outHeaders.set("cache-control", "no-store");
        return new Response(text, {
          status: upstream.status,
          headers: withCors(outHeaders)
        });
      }
      const rewritten = rewriteM3u8(text, target, origin);

      const outHeaders = new Headers();
      outHeaders.set("content-type", ct || "application/vnd.apple.mpegurl");
      outHeaders.set("cache-control", "public, max-age=1, s-maxage=2, must-revalidate");
      return new Response(rewritten, {
        status: upstream.status,
        headers: withCors(outHeaders)
      });
    }


    // Binary segments
    const outHeaders = new Headers();
    if (ct) outHeaders.set("content-type", ct);

    // Live segments: no cache. VOD segments: short cache.
    const isLiveSegment = target.hostname.includes("1a-1791") || target.pathname.includes("chunklist");
    outHeaders.set("cache-control", isLiveSegment ? "no-store" : "public, max-age=60, s-maxage=120");

    // Pass-through useful headers
    const passthrough = [
      "content-length",
      "accept-ranges",
      "content-range"
    ];
    for (const k of passthrough) {
      const v = upstream.headers.get(k);
      if (v) outHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: withCors(outHeaders)
    });
  }
};
