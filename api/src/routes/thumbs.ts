import express from "express";
import type { Request as ExRequest, Response as ExResponse } from "express";
import { spawn, spawnSync } from "node:child_process";
import { pool } from "../db.js";

export const thumbsRouter = express.Router();

const CACHE_MS = 60_000;
const cache = new Map<string, { exp: number; buf: Buffer; contentType: string }>();

function hasFfmpeg() {
  try {
    const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}
const FFMPEG_OK = hasFfmpeg();

function svgFallback(label: string) {
  const text = String(label || "live").slice(0, 24);
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

/**
 * IMPORTANT:
 * - slug (site) != username DLive (HLS)
 * - on récupère channel_username si dispo (provider_accounts), sinon slug.
 */
async function resolveDliveUsernameFromSlug(slug: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        COALESCE(pa.channel_username, pa.channel_slug, s.slug) AS u
      FROM streamers s
      LEFT JOIN provider_accounts pa
        ON pa.assigned_to_streamer_id = s.id
       AND pa.provider = 'dlive'
      WHERE s.slug = $1
      LIMIT 1
      `,
      [slug]
    );
    const u = rows[0]?.u;
    return String(u || slug).trim();
  } catch {
    return slug;
  }
}

function proxiedHlsUrl(dliveUsername: string) {
  // ton worker actuel : https://lunalive-hls.lunalive.workers.dev/hls?u=...
  const proxyBase = (process.env.HLS_PROXY_BASE || "https://lunalive-hls.lunalive.workers.dev/hls").replace(
    /\/$/,
    ""
  );

  const manifest = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(dliveUsername)}.m3u8?mobileweb`;
  const u = encodeURIComponent(manifest);

  return proxyBase.includes("?") ? `${proxyBase}&u=${u}` : `${proxyBase}?u=${u}`;
}

thumbsRouter.get("/thumbs/:slug.jpg", async (req: ExRequest, res: ExResponse) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).end();

  const key = slug.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) {
    res.set("Content-Type", hit.contentType);
    res.set("Cache-Control", "public, max-age=30");
    return res.end(hit.buf);
  }

  // pas de ffmpeg => SVG
  if (!FFMPEG_OK) {
    res.set("Content-Type", "image/svg+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=30");
    return res.end(svgFallback(slug));
  }

  // slug -> username HLS
  const dliveUser = await resolveDliveUsernameFromSlug(slug);
  const hlsUrl = proxiedHlsUrl(dliveUser);

  // ffmpeg => jpeg en mémoire
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",

    // évite de rester bloqué trop longtemps
    "-rw_timeout",
    "8000000",

    "-i",
    hlsUrl,

    "-an",
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-1",
    "-q:v",
    "5",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  ];

  const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

  const chunks: Buffer[] = [];
  let stderr = "";

  const killTimer = setTimeout(() => {
    try {
      p.kill("SIGKILL");
    } catch {}
  }, 9000);

  p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
  p.stderr.on("data", (d: Buffer) => (stderr += String(d)));

  p.on("error", (e) => {
    clearTimeout(killTimer);
    console.warn(`[thumbs] ffmpeg spawn error slug=${slug} user=${dliveUser}`, e);
    res.set("Content-Type", "image/svg+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=30");
    return res.end(svgFallback(slug));
  });

  p.on("close", (code, signal) => {
    clearTimeout(killTimer);

    const buf = Buffer.concat(chunks);
    const ok = code === 0 && buf.length > 10_000;

    if (ok) {
      cache.set(key, { exp: Date.now() + CACHE_MS, buf, contentType: "image/jpeg" });
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=30");
      return res.end(buf);
    }

    console.warn(
      `[thumbs] ffmpeg failed slug=${slug} user=${dliveUser} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(
        0,
        400
      ) || ""}`
    );

    res.set("Content-Type", "image/svg+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=30");
    return res.end(svgFallback(slug));
  });
});
