import type { Express, Request, Response as ExResponse } from "express";
import { Readable } from "stream";

function hostMatches(host: string, pattern: string) {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase().trim();
  if (!p) return false;
  if (p.startsWith("*.")) return h === p.slice(2) || h.endsWith(p.slice(1)); // "*.dlive.tv"
  return h === p;
}

const DEFAULT_ALLOWED = [
  "live.prd.dlive.tv",
  "*.dlive.tv", // ✅ important (segments/keys peuvent venir d’un autre subdomain)
  "*.dlivecdn.com",
  "dlivecdn.com",
];

function isAllowedHost(host: string) {
  const h = host.toLowerCase();

  // env optionnelle: "a.com,*.b.com"
  const extra = String(process.env.HLS_PROXY_ALLOW_HOSTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const patterns = [...DEFAULT_ALLOWED, ...extra];
  return patterns.some((p) => hostMatches(h, p));
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

      if (s.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const abs = new URL(uri, base).toString();
          return `URI="${proxyUrl(abs)}"`;
        });
      }

      const abs = new URL(s, base).toString();
      return proxyUrl(abs);
    })
    .join("\n");
}

/** decode “u” si jamais on reçoit encore un string encodé (selon runtime/query parser) */
function normalizeRawU(raw: string) {
  let s = String(raw || "").trim();
  if (!s) return s;

  // certains runtimes donnent déjà décodé, d’autres non → on tente 1-2 passes “safe”
  for (let i = 0; i < 2; i++) {
    if (/^https?:\/\//i.test(s)) break;
    if (!/%[0-9a-f]{2}/i.test(s)) break;
    try {
      s = decodeURIComponent(s);
    } catch {
      break;
    }
  }
  return s;
}

export function registerHlsProxy(app: Express) {
  app.options("/hls", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    res.status(204).end();
  });

  app.get("/hls", async (req: Request, res: ExResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "content-type,content-length,accept-ranges,content-range,cache-control"
    );

    const raw0 = String(req.query.u || "");
    if (!raw0) return res.status(400).send("missing_u");

    const raw = normalizeRawU(raw0);

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return res.status(400).send("bad_url");
    }

    if (target.protocol !== "https:") return res.status(400).send("bad_protocol");
    if (!isAllowedHost(target.hostname)) return res.status(400).send("host_not_allowed");

    // ✅ IMPORTANT: on FORCE un “browser-like” UA au lieu de relayer Lavf/ffmpeg
    const headers: Record<string, string> = {
      accept:
        "application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream, */*",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://dlive.tv/",
      origin: "https://dlive.tv",
    };

    const range = req.headers.range ? String(req.headers.range) : "";
    if (range) headers.range = range;

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(target.toString(), { headers, redirect: "follow" });
    } catch {
      return res.status(502).send("upstream_fetch_failed");
    }

    res.status(upstream.status);

    const ct = upstream.headers.get("content-type") || "";
    if (ct) res.setHeader("content-type", ct);

    // ✅ cache-friendly (playlist court, segments long)
    const isPlaylist =
      ct.includes("application/vnd.apple.mpegurl") ||
      ct.includes("application/x-mpegurl") ||
      target.pathname.endsWith(".m3u8");

    if (isPlaylist) {
      res.setHeader("Cache-Control", "public, max-age=1, s-maxage=2, must-revalidate");
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, target);
      return res.send(rewritten);
    }

    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600, immutable");

    // Pass-through useful headers
    const passthrough = ["content-length", "accept-ranges", "content-range"];
    for (const k of passthrough) {
      const v = upstream.headers.get(k);
      if (v) res.setHeader(k, v);
    }

    if (!upstream.body) return res.status(502).end();

    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.pipe(res);
  });
}
