import express, { type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { pool } from "../db.js";

export const thumbsRouter = express.Router();

const CACHE_MS = 60_000;
const cache = new Map<string, { exp: number; buf: Buffer; contentType: string }>();

function dliveM3u8For(username: string) {
  const u = String(username || "").trim();
  return `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(u)}.m3u8?mobileweb`;
}

function svgFallback(label: string) {
  const text = String(label || "live").slice(0, 20);
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

async function resolveHlsUsernameFromStreamerSlug(streamerSlug: string): Promise<string | null> {
  // on tente: provider_accounts.channel_username, sinon channel_slug, sinon streamer.slug
  const { rows } = await pool.query(
    `SELECT
       COALESCE(pa.channel_username, pa.channel_slug, s.slug) AS "hlsUser"
     FROM streamers s
     LEFT JOIN provider_accounts pa
       ON pa.assigned_to_streamer_id = s.id
      AND pa.provider = 'dlive'
     WHERE lower(s.slug) = lower($1)
     LIMIT 1`,
    [streamerSlug]
  );

  const u = String(rows?.[0]?.hlsUser || "").trim();
  return u ? u : null;
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

  if (!ffmpegPath) {
    res.set("Cache-Control", "public, max-age=30");
    return res.type("image/svg+xml").send(svgFallback(slug));
  }

  let hlsUser: string | null = null;
  try {
    hlsUser = await resolveHlsUsernameFromStreamerSlug(slug);
  } catch (e) {
    console.warn("[thumbs] resolve user failed", slug, e);
  }

  // si pas trouvé en DB, on tente quand même avec le slug (cas wayzebi)
  const username = hlsUser || slug;
  const url = dliveM3u8For(username);

  const args = [
    "-hide_banner",
    "-loglevel", "warning",

    // utile sur HLS HTTPS
    "-protocol_whitelist", "file,crypto,data,https,tcp,tls,http",
    "-rw_timeout", "20000000", // 20s (microseconds)

    // parfois DLive est relou => user-agent
    "-user_agent", "Mozilla/5.0",

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

  const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
  const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

  const chunks: Buffer[] = [];
  let stderr = "";
  let timedOut = false;

  const killTimer = setTimeout(() => {
    timedOut = true;
    try { p.kill("SIGKILL"); } catch {}
  }, 20_000);

  p.on("error", (e) => {
    clearTimeout(killTimer);
    console.warn(`[thumbs] spawn error slug=${slug} user=${username}`, e);
    res.set("Cache-Control", "public, max-age=30");
    return res.type("image/svg+xml").send(svgFallback(slug));
  });

  p.stdout.on("data", (d: Buffer) => chunks.push(d));
  p.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));

  p.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
    clearTimeout(killTimer);

    const buf = Buffer.concat(chunks);
    if (code === 0 && buf.length > 10_000) {
      cache.set(key, { exp: Date.now() + CACHE_MS, buf, contentType: "image/jpeg" });
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=30");
      return res.send(buf);
    }

    const reason = timedOut ? "timeout" : signal ? `signal:${signal}` : `code:${code}`;
    console.warn(
      `[thumbs] ffmpeg failed slug=${slug} user=${username} reason=${reason} bytes=${buf.length} err=${stderr.slice(0, 400)}`
    );

    res.set("Cache-Control", "public, max-age=30");
    return res.type("image/svg+xml").send(svgFallback(slug));
  });
});
