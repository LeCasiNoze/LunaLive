import express from "express";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";

export const thumbsRouter = express.Router();

const CACHE_MS = 60_000;
const cache = new Map<string, { exp: number; buf: Buffer; contentType: string }>();

function hlsUrlFor(slug: string) {
  // ⚠️ adapte uniquement si ton worker n'est pas /<slug>/index.m3u8
  const base = (process.env.HLS_BASE || "https://lunalive-hls.lunalive.workers.dev").replace(/\/+$/, "");
  const suffix = process.env.HLS_SUFFIX || "/index.m3u8";
  return `${base}/${encodeURIComponent(slug)}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
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

thumbsRouter.get("/thumbs/:slug.jpg", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).end();

  const key = slug.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) {
    res.setHeader("Content-Type", hit.contentType);
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.end(hit.buf);
  }

  // fallback si pas de binaire
  if (!ffmpegPath) {
    const svg = svgFallback(slug);
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.end(svg);
  }

  const url = hlsUrlFor(slug);

  // ffmpeg -> jpeg en mémoire
  const args = [
    "-hide_banner",
    "-loglevel", "error",
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

  p.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
  p.stderr.on("data", (d) => (stderr += String(d)));

  p.on("close", (code) => {
    clearTimeout(killTimer);

    const buf = Buffer.concat(chunks);
    if (code === 0 && buf.length > 10_000) {
      cache.set(key, { exp: Date.now() + CACHE_MS, buf, contentType: "image/jpeg" });
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=30");
      return res.end(buf);
    }

    // fallback svg si ffmpeg fail
    const svg = svgFallback(slug);
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=30");
    return res.end(svg);
  });
});
