var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-expose-headers": "content-type,content-length,accept-ranges,content-range,cache-control"
};
function hostMatches(host, pattern) {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase().trim();
  if (!p) return false;
  if (p.startsWith("*.")) return h === p.slice(2) || h.endsWith(p.slice(1));
  return h === p;
}
__name(hostMatches, "hostMatches");
var DEFAULT_ALLOWED = [
  // DLive
  "live.prd.dlive.tv",
  "*.dlive.tv",
  "*.dlivecdn.com",
  "dlivecdn.com",
  // Rumble
  "rumble.com",
  "*.rumble.com",
  "1a-1791.com",
  "*.1a-1791.com"
];
function isAllowedHost(host) {
  return DEFAULT_ALLOWED.some((p) => hostMatches(host, p));
}
__name(isAllowedHost, "isAllowedHost");
function proxyUrl(origin2, abs) {
  return `${origin2}/hls?u=${encodeURIComponent(abs)}`;
}
__name(proxyUrl, "proxyUrl");
function rewriteM3u8(text, base, origin2) {
  const lines = text.split("\n");
  return lines.map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const u2 = new URL(uri, base);
        const swapped2 = trySwapLivestreamHost(u2);
        const abs2 = (swapped2 ?? u2).toString();
        return `URI="${proxyUrl(origin2, abs2)}"`;
      });
    }
    const u = new URL(s, base);
    const swapped = trySwapLivestreamHost(u);
    const abs = (swapped ?? u).toString();
    return proxyUrl(origin2, abs);
  }).join("\n");
}
__name(rewriteM3u8, "rewriteM3u8");
function isPlaylist(url) {
  return url.pathname.endsWith(".m3u8");
}
__name(isPlaylist, "isPlaylist");
function isLikelyM3u8(ct, text) {
  const c = (ct || "").toLowerCase();
  if (c.includes("application/vnd.apple.mpegurl")) return true;
  if (c.includes("application/x-mpegurl")) return true;
  if (typeof text === "string" && text.trimStart().startsWith("#EXTM3U")) return true;
  return false;
}
__name(isLikelyM3u8, "isLikelyM3u8");
function trySwapLivestreamHost(u) {
  const h = u.hostname;
  if (h.startsWith("livestreams.")) {
    const v = new URL(u.toString());
    v.hostname = h.replace(/^livestreams\./, "livestreamt.");
    return v;
  }
  return null;
}
__name(trySwapLivestreamHost, "trySwapLivestreamHost");
function withCors(h) {
  const out = new Headers(h);
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.set(k, v);
  out.set("x-hls-worker-ver", "2026-02-19-a");
  return out;
}
__name(withCors, "withCors");
var index_default = {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors(new Headers()) });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method_not_allowed", {
        status: 405,
        headers: withCors(new Headers({ "content-type": "text/plain" }))
      });
    }
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
    let target;
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
    const swapped = trySwapLivestreamHost(target);
    if (swapped) target = swapped;
    const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    const headers = new Headers();
    headers.set("accept", "*/*");
    headers.set("accept-language", "en-US,en;q=0.9");
    headers.set("user-agent", BROWSER_UA);
    const isRumble = target.hostname.includes("rumble") || target.hostname.includes("1a-1791");
    headers.set("referer", isRumble ? "https://rumble.com/" : "https://dlive.tv/");
    headers.set("origin", isRumble ? "https://rumble.com" : "https://dlive.tv");
    const range = request.headers.get("range");
    if (range) headers.set("range", range);
    const playlist = isPlaylist(target);
    let upstream = await fetch(target.toString(), {
      headers,
      redirect: "follow",
      cf: {
        cacheEverything: true,
        cacheTtl: playlist ? 1 : 3600
      }
    });
    let ct = upstream.headers.get("content-type") || "";
    if (playlist) {
      const text = await upstream.text();
      if (!upstream.ok || !isLikelyM3u8(ct, text)) {
        const outHeaders3 = new Headers();
        outHeaders3.set("content-type", ct || "text/plain; charset=utf-8");
        outHeaders3.set("cache-control", "no-store");
        return new Response(text, {
          status: upstream.status,
          headers: withCors(outHeaders3)
        });
      }
      const origin2 = new URL(request.url).origin;
      const rewritten = rewriteM3u8(text, target, origin2);
      const outHeaders2 = new Headers();
      outHeaders2.set("content-type", ct || "application/vnd.apple.mpegurl");
      outHeaders2.set("cache-control", "public, max-age=1, s-maxage=2, must-revalidate");
      return new Response(rewritten, {
        status: upstream.status,
        headers: withCors(outHeaders2)
      });
    }
    if (isLikelyM3u8(ct)) {
      const text = await upstream.text();
      if (!upstream.ok) {
        const outHeaders3 = new Headers();
        outHeaders3.set("content-type", ct || "text/plain; charset=utf-8");
        outHeaders3.set("cache-control", "no-store");
        return new Response(text, {
          status: upstream.status,
          headers: withCors(outHeaders3)
        });
      }
      const rewritten = rewriteM3u8(text, target, origin);
      const outHeaders2 = new Headers();
      outHeaders2.set("content-type", ct || "application/vnd.apple.mpegurl");
      outHeaders2.set("cache-control", "public, max-age=1, s-maxage=2, must-revalidate");
      return new Response(rewritten, {
        status: upstream.status,
        headers: withCors(outHeaders2)
      });
    }
    const outHeaders = new Headers();
    if (ct) outHeaders.set("content-type", ct);
    const isLiveSegment = target.hostname.includes("1a-1791") || target.pathname.includes("chunklist");
    outHeaders.set("cache-control", isLiveSegment ? "no-store" : "public, max-age=60, s-maxage=120");
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
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
