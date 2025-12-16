// api/src/hls_proxy.ts
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

export function registerHlsProxy(app: Express) {
  app.get("/hls", async (req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "content-type,content-length,accept-ranges,content-range");

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
    };

    const range = req.headers.range ? String(req.headers.range) : "";
    if (range) headers.range = range;

    const upstream = await fetch(target.toString(), { headers, redirect: "follow" });

    res.status(upstream.status);
    res.setHeader("cache-control", "no-store");

    const ct = upstream.headers.get("content-type") || "";
    if (ct) res.setHeader("content-type", ct);

    // If playlist, rewrite to proxy all sub-urls
    if (ct.includes("application/vnd.apple.mpegurl") || target.pathname.endsWith(".m3u8")) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, target);
      return res.send(rewritten);
    }

    // Otherwise stream binary (segments)
    if (!upstream.body) return res.status(502).end();

    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.pipe(res);
  });
}
