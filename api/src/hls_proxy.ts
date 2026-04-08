// api/src/hls_proxy.ts
import type { Express, Request, Response as ExResponse } from "express";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isIOSUA(ua: string) {
  const s = (ua || "").toLowerCase();
  // iPhone/iPad/iPod + iPadOS qui se présente comme Mac
  const isi = /iphone|ipad|ipod/.test(s);
  const isIpadOs = /macintosh/.test(s) && /mobile/.test(s);
  return isi || isIpadOs;
}

function isDliveHost(host: string) {
  const h = host.toLowerCase();
  return h.endsWith("dlive.tv") || h.endsWith("dlivecdn.com") || h === "live.prd.dlive.tv";
}

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
  // Rumble CDN
  "*.rumble.cloud", "rumble.cloud",
  "*.rumble.com", "rumble.com",
  "1a-1791.com", "*.1a-1791.com", // CDN réel Rumble (segments HLS)
];

function isAllowedHost(host: string) {
  const extra = String(process.env.HLS_PROXY_ALLOW_HOSTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const patterns = [...DEFAULT_ALLOWED, ...extra];
  return patterns.some((p) => hostMatches(host, p));
}

// Hosts dont les segments ont CORS * → le browser peut les charger directement
const DIRECT_CDN_HOSTS = ["1a-1791.com"];

function isDirectCdnHost(host: string) {
  return DIRECT_CDN_HOSTS.some(h => host === h || host.endsWith("." + h));
}

function proxyUrl(u: string) {
  return `/hls?u=${encodeURIComponent(u)}`;
}

function rewriteM3u8(text: string, base: URL) {
  const lines = text.split("\n");

  return lines
    .map((line) => {
      const s = line.trim();
      if (!s) return line;

      // rewrite URI="..." inside tags
      if (s.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const abs = new URL(uri, base).toString();
          const host = new URL(abs).hostname;
          // CORS * sur ce CDN → URL directe, pas de proxy
          if (isDirectCdnHost(host)) return `URI="${abs}"`;
          return `URI="${proxyUrl(abs)}"`;
        });
      }

      // rewrite segment / child playlist lines
      const abs = new URL(s, base).toString();
      const host = new URL(abs).hostname;
      // Playlists enfants (chunklist) sur CDN direct → URL directe
      if (isDirectCdnHost(host)) return abs;
      return proxyUrl(abs);
    })
    .join("\n");
}

/**
 * CORS: évite le wildcard sur Allow-Headers (pas fiable partout),
 * et cache le preflight pour éviter la tempête d'OPTIONS (souvent déclenchée par Range).
 */
function setCors(req: Request, res: ExResponse) {
  const acrh = String(req.headers["access-control-request-headers"] || "").trim();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");

  // IMPORTANT: mieux que "*" => écho des headers demandés (Range, etc.)
  res.setHeader(
    "Access-Control-Allow-Headers",
    acrh || "range,content-type,accept,origin,user-agent"
  );

  // Cache du preflight
  res.setHeader("Access-Control-Max-Age", "86400");

  // Expose utile pour hls.js / debug
  res.setHeader(
    "Access-Control-Expose-Headers",
    "content-type,content-length,accept-ranges,content-range,cache-control,etag,last-modified"
  );

  // évite des soucis de caches/proxies en présence de preflight
  res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
}

function isPlaylist(target: URL, contentType: string) {
  const ct = (contentType || "").toLowerCase();
  return (
    ct.includes("application/vnd.apple.mpegurl") ||
    ct.includes("application/x-mpegurl") ||
    target.pathname.toLowerCase().endsWith(".m3u8")
  );
}

export function registerHlsProxy(app: Express) {
  app.options("/hls", (req, res: ExResponse) => {
    setCors(req, res);
    return res.status(204).end();
  });

  // Optionnel mais pratique
  app.head("/hls", (req, res: ExResponse) => {
    setCors(req, res);
    return res.status(204).end();
  });

  app.get("/hls", async (req: Request, res: ExResponse) => {
    setCors(req, res);

    const raw = String(req.query.u || "");
    if (!raw) return res.status(400).send("missing_u");

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return res.status(400).send("bad_url");
    }

    if (target.protocol !== "https:") return res.status(400).send("bad_protocol");
    if (!isAllowedHost(target.hostname)) return res.status(400).send("host_not_allowed");

    // iOS + Dlive: user-agent desktop pour éviter certains comportements
    const uaIn = String(req.headers["user-agent"] || "Mozilla/5.0");
    const ua = isIOSUA(uaIn) && isDliveHost(target.hostname) ? DESKTOP_UA : uaIn;

    const isRumble = target.hostname.includes("rumble");
    const headers: Record<string, string> = {
      accept: String(req.headers.accept || "*/*"),
      "user-agent": ua,
      referer: isRumble ? "https://rumble.com/" : "https://dlive.tv/",
      origin: isRumble ? "https://rumble.com" : "https://dlive.tv",
    };

    // Range passthrough (hls.js peut l'utiliser selon navigateur)
    const range = req.headers.range ? String(req.headers.range) : "";
    if (range) headers.range = range;

    // Abort upstream si le client coupe (évite congestion + stalls)
    const ac = new AbortController();
    const onClose = () => {
      try {
        ac.abort();
      } catch {
        // ignore
      }
    };
    req.on("close", onClose);
    req.on("aborted", onClose);

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(target.toString(), {
        headers,
        redirect: "follow",
        signal: ac.signal,
      });
    } catch {
      // client a coupé ou upstream down
      if (!res.headersSent) return res.status(502).send("upstream_fetch_failed");
      return;
    }

    res.status(upstream.status);
    res.setHeader("x-hls-proxy-upstream", target.hostname);

    const ct = upstream.headers.get("content-type") || "";
    if (ct) res.setHeader("content-type", ct);

    const playlist = isPlaylist(target, ct);

    if (playlist) {
      // En live: la playlist doit être fraîche => pas de cache
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, target);
      return res.send(rewritten);
    }

    // Segments TS / audio:
    // Sur du live: éviter immutable/max-age long, et surtout éviter les caches bizarres avec Range/206.
    res.setHeader("Cache-Control", "no-store");

    // Passe quelques headers utiles
    for (const k of ["content-length", "accept-ranges", "content-range", "etag", "last-modified"]) {
      const v = upstream.headers.get(k);
      if (v) res.setHeader(k, v);
    }

    if (!upstream.body) return res.status(502).end();

    // Flush tôt (utile en prod avec proxies)
    (res as any).flushHeaders?.();

    try {
      const nodeStream = Readable.fromWeb(upstream.body as any);
      await pipeline(nodeStream, res);
    } catch {
      // Client coupé / abort / pipeline interrompue => normal
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  });
}
