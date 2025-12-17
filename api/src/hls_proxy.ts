import type { Express, Request, Response } from "express";
import { Readable } from "stream";

function isAllowedHost(host: string) {
  const h = host.toLowerCase();
  return h === "live.prd.dlive.tv" || h.endsWith("dlivecdn.com");
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

export function registerHlsProxy(app: Express) {
  app.options("/hls", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    res.status(204).end();
  });

  app.get("/hls", async (req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "content-type,content-length,accept-ranges,content-range,cache-control"
    );

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

    const headers: Record<string, string> = {
      accept: String(req.headers.accept || "*/*"),
      "user-agent": String(req.headers["user-agent"] || "Mozilla/5.0"),
      referer: "https://dlive.tv/",
      origin: "https://dlive.tv"
    };

    const range = req.headers.range ? String(req.headers.range) : "";
    if (range) headers.range = range;

    const upstream = await fetch(target.toString(), { headers, redirect: "follow" });

    res.status(upstream.status);

    const ct = upstream.headers.get("content-type") || "";
    if (ct) res.setHeader("content-type", ct);

    // ✅ cache-friendly (playlist court, segments long)
    const isPlaylist = ct.includes("application/vnd.apple.mpegurl") || target.pathname.endsWith(".m3u8");
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
