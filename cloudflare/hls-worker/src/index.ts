const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-expose-headers":
    "content-type,content-length,accept-ranges,content-range,cache-control"
};

function isAllowedHost(host: string) {
  const h = host.toLowerCase();
  return h === "live.prd.dlive.tv" || h.endsWith("dlivecdn.com");
}

function proxyUrl(abs: string) {
  return `/hls?u=${encodeURIComponent(abs)}`;
}

function rewriteM3u8(text: string, base: URL) {
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
          return `URI="${proxyUrl(abs)}"`;
        });
      }

      // Segment / playlist URL line
      const u = new URL(s, base);
      const swapped = trySwapLivestreamHost(u);
      const abs = (swapped ?? u).toString();
      return proxyUrl(abs);

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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    const headers = new Headers();
    headers.set("accept", "*/*");
    headers.set("accept-language", "en-US,en;q=0.9");
    headers.set("user-agent", BROWSER_UA);

    // “browser-like” (souvent requis)
    headers.set("referer", "https://dlive.tv/");
    headers.set("origin", "https://dlive.tv");

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

      const rewritten = rewriteM3u8(text, target);
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
      const rewritten = rewriteM3u8(text, target);
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

    // ✅ Long cache for segments (immutable-ish)
    outHeaders.set("cache-control", "public, max-age=600, s-maxage=3600, immutable");

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
