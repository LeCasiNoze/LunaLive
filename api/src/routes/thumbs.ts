import express, { type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";

export const thumbsRouter = express.Router();

const CACHE_MS = 60_000;
const cache = new Map<string, { exp: number; buf: Buffer; contentType: string }>();

function workerBase() {
  return (process.env.HLS_BASE || "https://lunalive-hls.lunalive.workers.dev").replace(/\/+$/, "");
}

// DLive m3u8 (comme ton request qui marche)
function dliveM3u8For(username: string) {
  const u = String(username || "").trim();
  return `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(u)}.m3u8?mobileweb`;
}

// Worker URL: /hls?u=<encoded m3u8>
function hlsUrlFor(slug: string) {
  const base = workerBase();
  const m3u8 = dliveM3u8For(slug);
  return `${base}/hls?u=${encodeURIComponent(m3u8)}`;
}

function svgFallback(slug: string) {
  const text = String(slug || "live").slice(0, 20);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0b12"/>
      <stop offset="1" stop-color="#4b2bbd"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <text x="60" y="390" fill="rgba(255,255,255,0.92)" font-size="72" font-family="Inter, Arial" font-weight="800">
    ${text}
  </text>
</svg>`;
}

thumbsRouter.get("/thumbs/:slug.jpg", async (req: ExpressRequest, res: ExpressResponse) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).end();

  const key = slug.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) {
    res.set("Content-Type", hit.contentType);
    res.set("Cache-Control", "public, max-age=30");
    return res.send(hit.buf);
  }

  // fallback si pas de binaire ffmpeg
  if (!ffmpegPath) {
    res.set("Cache-Control", "public, max-age=30");
    return res.type("image/svg+xml").send(svgFallback(slug));
  }

  const url = hlsUrlFor(slug);

  const args = [
    "-hide_banner",
    "-loglevel", "error",

    // (souvent utile sur HLS https)
    "-protocol_whitelist", "file,crypto,data,https,tcp,tls,http",
    "-rw_timeout", "8000000",

    "-y",
    "-i", url,
    "-an",
    "-frames:v", "1",
    "-vf", "scale=640:-1",
    "-q:v", "5",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];

  const p = spawn(ffmpegPath as string, args, { stdio: ["ignore", "pipe", "pipe"] });

  const chunks: Buffer[] = [];
  let stderr = "";

  const killTimer = setTimeout(() => {
    try { p.kill("SIGKILL"); } catch {}
  }, 8000);

  p.stdout.on("data", (d: Buffer) => chunks.push(d));
  p.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));

  p.on("close", (code: number | null) => {
    clearTimeout(killTimer);

    const buf = Buffer.concat(chunks);
    if (code === 0 && buf.length > 10_000) {
      cache.set(key, { exp: Date.now() + CACHE_MS, buf, contentType: "image/jpeg" });
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=30");
      return res.send(buf);
    }

    console.warn(`[thumbs] ffmpeg failed slug=${slug} code=${code} bytes=${buf.length} err=${stderr.slice(0, 300)}`);
    res.set("Cache-Control", "public, max-age=30");
    return res.type("image/svg+xml").send(svgFallback(slug));
  });
});
