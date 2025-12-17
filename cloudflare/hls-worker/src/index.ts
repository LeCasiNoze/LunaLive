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
          const abs = new URL(uri, base).toString();
          return `URI="${proxyUrl(abs)}"`;
        });
      }

      // Segment / playlist URL line
      const abs = new URL(s, base).toString();
      return proxyUrl(abs);
    })
    .join("\n");
}

function isPlaylist(url: URL) {
  return url.pathname.endsWith(".m3u8");
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
    const upstream = await fetch(target.toString(), {
      headers,
      redirect: "follow",
      cf: {
        cacheEverything: true,
        cacheTtl: playlist ? 1 : 3600
      } as any
    });

    const ct = upstream.headers.get("content-type") || "";

    // If playlist (m3u8), rewrite URLs to point back to this worker
    if (playlist || ct.includes("application/vnd.apple.mpegurl")) {
      const text = await upstream.text();
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
