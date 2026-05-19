// api/src/routes/thumbs.ts
import express from "express";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pool } from "../db.js";
import { fetchDliveLiveInfo } from "../dlive.js";
export const thumbsRouter = express.Router();
/* ───────────────────────────────────────────────────────────── */
/* ffmpeg: préfère le binaire système sur Render (évite SIGSEGV)  */
/* ───────────────────────────────────────────────────────────── */
const require = createRequire(import.meta.url);
const ffmpegStatic = (() => {
    try {
        // @ffmpeg-installer/ffmpeg: binaire embarqué dans le tarball npm
        // (pas de DL externe au postinstall, contrairement à ffmpeg-static).
        return require("@ffmpeg-installer/ffmpeg").path;
    }
    catch {
        return null;
    }
})();
function canRun(bin) {
    try {
        const r = spawnSync(bin, ["-version"], { stdio: "ignore" });
        return r.status === 0;
    }
    catch {
        return false;
    }
}
const candidates = [
    (process.env.FFMPEG_PATH || "").trim() || null,
    "ffmpeg",
    ffmpegStatic,
].filter(Boolean);
export const FFMPEG_BIN = (candidates.find(canRun) || candidates[0] || "ffmpeg").trim();
export const FFMPEG_OK = canRun(FFMPEG_BIN);
console.log(`[thumbs] ffmpeg selected bin=${FFMPEG_BIN} ok=${FFMPEG_OK}`);
/* ───────────────────────────────────────────────────────────── */
/* cache + fallback                                               */
/* ───────────────────────────────────────────────────────────── */
const LIVE_CACHE_MS = 60_000; // 1 min
const LIVE_CACHE_SECONDS = Math.max(1, Math.floor(LIVE_CACHE_MS / 1000));
const cache = new Map();
const inFlight = new Map();
function sendCached(res, hit) {
    res.set("Content-Type", hit.contentType);
    res.set("Cache-Control", `public, max-age=${LIVE_CACHE_SECONDS}`);
    return res.end(hit.buf);
}
function sendSvg(res, svg) {
    res.set("Content-Type", "image/svg+xml; charset=utf-8");
    res.set("Cache-Control", `public, max-age=${LIVE_CACHE_SECONDS}`);
    return res.end(svg);
}
function svgFallback(label) {
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
function isJpeg(buf) {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
// parse largeur/hauteur d’un JPEG (SOF0/SOF2)
function jpegSize(buf) {
    try {
        if (!isJpeg(buf))
            return null;
        let i = 2;
        while (i < buf.length) {
            if (buf[i] !== 0xff) {
                i++;
                continue;
            }
            const marker = buf[i + 1];
            if (marker === 0xc0 || marker === 0xc2) {
                const h = buf.readUInt16BE(i + 5);
                const w = buf.readUInt16BE(i + 7);
                if (w > 0 && h > 0)
                    return { w, h };
                return null;
            }
            const len = buf.readUInt16BE(i + 2);
            if (!len || len < 2)
                break;
            i += 2 + len;
        }
        return null;
    }
    catch {
        return null;
    }
}
function normalizeUrl(u) {
    const s = String(u || "").trim();
    if (!s)
        return "";
    if (s.startsWith("//"))
        return `https:${s}`;
    return s;
}
async function fetchImageToBuffer(url, opts) {
    const u = normalizeUrl(url);
    if (!u)
        return { ok: false, buf: Buffer.alloc(0), ct: "", status: 0 };
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6500);
    try {
        const r = await fetch(u, {
            method: "GET",
            redirect: "follow",
            signal: ac.signal,
            headers: {
                accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "user-agent": "Mozilla/5.0",
                ...(opts?.referer ? { referer: opts.referer } : {}),
                ...(opts?.origin ? { origin: opts.origin } : {}),
            },
        });
        clearTimeout(t);
        const ct = r.headers.get("content-type") || "";
        const status = r.status;
        if (!r.ok)
            return { ok: false, buf: Buffer.alloc(0), ct, status };
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        // garde-fous: il faut une vraie image
        const looksImage = ct.startsWith("image/");
        if (!looksImage || buf.length < 1500)
            return { ok: false, buf, ct, status };
        return { ok: true, buf, ct, status };
    }
    catch {
        clearTimeout(t);
        return { ok: false, buf: Buffer.alloc(0), ct: "", status: 0 };
    }
}
/**
 * IMPORTANT:
 * - slug (site) != displayname DLive
 * - on récupère channel_slug côté provider_accounts (displayname)
 * - support dlive_use_linked (si tu l’utilises)
 */
async function resolveDliveDisplaynameFromSlug(slug) {
    try {
        const { rows } = await pool.query(`
      SELECT
        CASE
          WHEN s.dlive_use_linked = TRUE AND s.dlive_link_displayname IS NOT NULL
            THEN s.dlive_link_displayname
          ELSE COALESCE(pa.channel_slug, s.slug)
        END AS displayname
      FROM streamers s
      LEFT JOIN provider_accounts pa
        ON pa.provider='dlive'
       AND pa.assigned_to_streamer_id = s.id
      WHERE s.slug = $1
      LIMIT 1
      `, [slug]);
        const dn = rows?.[0]?.displayname;
        return String(dn || slug).trim();
    }
    catch {
        return slug;
    }
}
async function resolveThumbMetaFromSlug(slug) {
    try {
        const { rows } = await pool.query(`
      SELECT
        COALESCE(LOWER(s.platform), '') AS platform,
        COALESCE(ri.thumbnail_url, s.thumb_url) AS fallback_thumb_url,
        COALESCE(ri.is_live, FALSE) AS rumble_is_live,
        ri.hls_url AS rumble_hls_url
      FROM streamers s
      LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
      WHERE s.slug = $1
      LIMIT 1
      `, [slug]);
        const row = rows?.[0];
        return {
            platform: String(row?.platform || "").trim().toLowerCase(),
            fallbackThumbUrl: row?.fallback_thumb_url ? String(row.fallback_thumb_url) : null,
            rumbleIsLive: row?.rumble_is_live === true,
            rumbleHlsUrl: row?.rumble_hls_url ? String(row.rumble_hls_url) : null,
        };
    }
    catch {
        return {
            platform: "",
            fallbackThumbUrl: null,
            rumbleIsLive: false,
            rumbleHlsUrl: null,
        };
    }
}
async function captureLiveFrameFromHls(hlsUrl) {
    if (!FFMPEG_OK)
        return null;
    return await new Promise((resolve) => {
        const args = [
            "-hide_banner",
            "-loglevel", "error",
            "-live_start_index", "-2",
            "-rw_timeout", "12000000",
            "-i", hlsUrl,
            "-an",
            "-frames:v", "1",
            "-q:v", "3",
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "pipe:1",
        ];
        const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        const out = [];
        let stderr = "";
        const timer = setTimeout(() => {
            try {
                proc.kill("SIGKILL");
            }
            catch { }
        }, 15_000);
        proc.stdout.on("data", (chunk) => out.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        proc.stderr.on("data", (chunk) => {
            stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        });
        proc.on("error", () => {
            clearTimeout(timer);
            resolve(null);
        });
        proc.on("close", (code) => {
            clearTimeout(timer);
            const buf = Buffer.concat(out);
            if (code === 0 && isJpeg(buf))
                return resolve(buf);
            if (stderr.trim()) {
                console.warn(`[thumbs] live frame ffmpeg failed code=${code} url=${hlsUrl} err=${stderr.trim().slice(0, 280)}`);
            }
            resolve(null);
        });
    });
}
async function getOrCreateLiveThumb(key, producer) {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now())
        return hit;
    const pending = inFlight.get(key);
    if (pending)
        return pending;
    const task = (async () => {
        try {
            const made = await producer();
            if (!made)
                return null;
            const cached = { exp: Date.now() + LIVE_CACHE_MS, buf: made.buf, contentType: made.contentType };
            cache.set(key, cached);
            return cached;
        }
        finally {
            inFlight.delete(key);
        }
    })();
    inFlight.set(key, task);
    return task;
}
/* ───────────────────────────────────────────────────────────── */
/* route LIVE : utilise thumbnailUrl (robuste)                    */
/* ───────────────────────────────────────────────────────────── */
thumbsRouter.get("/thumbs/:slug.jpg", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug)
        return res.status(400).end();
    const key = `live:${slug.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now())
        return sendCached(res, hit);
    const meta = await resolveThumbMetaFromSlug(slug);
    if (meta.platform === "rumble") {
        const liveThumb = await getOrCreateLiveThumb(key, async () => {
            if (meta.rumbleIsLive && meta.rumbleHlsUrl) {
                const frame = await captureLiveFrameFromHls(meta.rumbleHlsUrl);
                if (frame)
                    return { buf: frame, contentType: "image/jpeg" };
            }
            const fallbackUrl = normalizeUrl(meta.fallbackThumbUrl);
            if (!fallbackUrl)
                return null;
            const img = await fetchImageToBuffer(fallbackUrl);
            if (!img.ok) {
                console.warn(`[thumbs] rumble fallback fetch failed slug=${slug} status=${img.status} ct=${img.ct} url=${fallbackUrl}`);
                return null;
            }
            return { buf: img.buf, contentType: img.ct || "image/jpeg" };
        });
        if (liveThumb)
            return sendCached(res, liveThumb);
        return sendSvg(res, svgFallback(slug));
    }
    const displayname = await resolveDliveDisplaynameFromSlug(slug);
    const liveThumb = await getOrCreateLiveThumb(key, async () => {
        let info = null;
        try {
            info = await fetchDliveLiveInfo(displayname);
        }
        catch (e) {
            console.warn(`[thumbs] dlive fetch failed slug=${slug} displayname=${displayname}`, String(e?.message || e));
            return null;
        }
        const thumbUrl = normalizeUrl(info?.thumbnailUrl);
        if (!thumbUrl)
            return null;
        const img = await fetchImageToBuffer(thumbUrl, {
            referer: "https://dlive.tv/",
            origin: "https://dlive.tv",
        });
        if (!img.ok) {
            console.warn(`[thumbs] thumbnail fetch failed slug=${slug} displayname=${displayname} status=${img.status} ct=${img.ct} url=${thumbUrl}`);
            return null;
        }
        return { buf: img.buf, contentType: img.ct || "image/jpeg" };
    });
    if (liveThumb)
        return sendCached(res, liveThumb);
    return sendSvg(res, svgFallback(slug));
});
/* ───────────────────────────────────────────────────────────── */
/* route CLIPS : inchangé (mp4 r2 -> vod hls)                     */
/* ───────────────────────────────────────────────────────────── */
thumbsRouter.get("/thumbs/clips/:id.jpg", async (req, res) => {
    const clipId = Number(req.params.id || 0);
    if (!Number.isFinite(clipId) || clipId <= 0)
        return res.status(400).end();
    // ✅ GARDE-FOU TEMPORAIRE: vérifier thumbnail_url en BDD d'abord
    const { rows } = await pool.query(`SELECT thumbnail_url FROM bot_clips WHERE id = $1 AND deleted_ts IS NULL LIMIT 1`, [clipId]);
    const clip = rows?.[0];
    if (!clip)
        return res.status(404).end();
    // ✅ Si thumbnail_url existe, rediriger vers l'URL stockée (pas de FFMPEG)
    if (clip.thumbnail_url) {
        try {
            return res.redirect(302, clip.thumbnail_url);
        }
        catch {
            // Si redirection échoue, continuer vers fallback
        }
    }
    // ✅ GARDE-FOU TEMPORAIRE: désactiver fallback FFMPEG pour éviter les spawns massifs
    // Retourner SVG placeholder au lieu de générer dynamiquement
    console.warn(`[thumbs] Fallback désactivé pour clip ${clipId} - pas de thumbnail_url`);
    return sendSvg(res, svgFallback(`clip ${clipId}`));
});
