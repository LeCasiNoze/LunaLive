// api/src/routes/thumbs_clips_fix.ts
// Fix minimal pour thumbnails clips - génération à la création + stockage persisté

import type { Request, Response as ExResponse } from "express";
import { pool } from "../db";
import { r2Enabled, buildPublicUrl, putR2Buffer } from "../clips/r2";
import { spawn } from "child_process";
import { FFMPEG_BIN, FFMPEG_OK } from "./thumbs";

const CACHE_MS = 3_600_000; // 1h

// Helper: générer thumbnail et stocker dans R2 + BDD
export async function generateAndStoreThumbnail(clipId: number, mp4Url: string): Promise<string | null> {
  if (!FFMPEG_OK || !r2Enabled()) return null;

  try {
    // 1) Extraire thumbnail avec FFMPEG
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-nostdin", "-rw_timeout", "10000000",
      "-ss", "1", "-i", mp4Url,
      "-an", "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "5",
      "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"
    ];

    const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";

    const killTimer = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch {}
    }, 10_000); // 10s timeout

    return new Promise((resolve) => {
      p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
      p.stderr.on("data", (d: Buffer) => (stderr += String(d)));

      p.on("error", (e) => {
        clearTimeout(killTimer);
        console.warn(`[thumbs] generateThumbnail ffmpeg spawn error clipId=${clipId}`, e);
        resolve(null);
      });

      p.on("close", async (code, signal) => {
        clearTimeout(killTimer);
        const buf = Buffer.concat(chunks);
        const ok = code === 0 && buf.length > 5_000;

        if (!ok) {
          console.warn(`[thumbs] generateThumbnail ffmpeg failed clipId=${clipId} code=${code} bytes=${buf.length}`);
          resolve(null);
          return;
        }

        try {
          // 2) Stocker dans R2
          const r2Key = `clips/thumbnails/${clipId}.jpg`;
          const uploadOk = await putR2Buffer({ key: r2Key, buffer: buf, contentType: "image/jpeg" });
          
          if (!uploadOk) {
            console.warn(`[thumbs] generateThumbnail R2 upload failed clipId=${clipId}`);
            resolve(null);
            return;
          }

          // 3) Générer URL publique
          const publicUrl = buildPublicUrl(r2Key);
          if (!publicUrl) {
            console.warn(`[thumbs] generateThumbnail URL build failed clipId=${clipId}`);
            resolve(null);
            return;
          }

          // 4) Mettre à jour BDD
          await pool.query(
            `UPDATE bot_clips SET thumbnail_url = $1 WHERE id = $2`,
            [publicUrl, clipId]
          );

          console.log(`[thumbs] generateThumbnail success clipId=${clipId} url=${publicUrl}`);
          resolve(publicUrl);
        } catch (err) {
          console.warn(`[thumbs] generateThumbnail storage failed clipId=${clipId}`, err);
          resolve(null);
        }
      });
    });
  } catch (err) {
    console.warn(`[thumbs] generateThumbnail exception clipId=${clipId}`, err);
    return null;
  }
}

// Route modifiée pour servir thumbnail stockée优先
export function setupClipsThumbsRoute(app: any) {
  app.get("/thumbs/clips/:id.jpg", async (req: Request, res: ExResponse) => {
    const clipId = Number(req.params.id || 0);
    if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).end();

    // 1) Vérifier thumbnail_url en BDD
    const { rows } = await pool.query(
      `SELECT thumbnail_url, mp4_key FROM bot_clips WHERE id = $1 AND deleted_ts IS NULL LIMIT 1`,
      [clipId]
    );

    const clip = rows?.[0];
    if (!clip) return res.status(404).end();

    // 2) Si thumbnail_url existe, rediriger vers l'URL stockée
    if (clip.thumbnail_url) {
      try {
        // Rediriger vers l'URL R2 directe
        return res.redirect(302, clip.thumbnail_url);
      } catch {
        // Si redirection échoue, continuer vers FFMPEG fallback
      }
    }

    // 3) Fallback: générer à la volée (ancien comportement)
    if (!FFMPEG_OK) return res.status(404).end();

    const mp4Key = clip.mp4_key ? String(clip.mp4_key).trim() : "";
    const mp4Url = mp4Key && r2Enabled() ? buildPublicUrl(mp4Key) : null;

    if (!mp4Url) return res.status(404).end();

    // FFMPEG extraction (ancien code)
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-nostdin", "-rw_timeout", "15000000",
      "-ss", "1", "-i", mp4Url,
      "-an", "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "5",
      "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"
    ];

    const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";

    const killTimer = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch {}
    }, 15_000);

    req.on("close", () => {
      try { p.kill("SIGKILL"); } catch {}
    });

    p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
    p.stderr.on("data", (d: Buffer) => (stderr += String(d)));

    p.on("error", (e) => {
      clearTimeout(killTimer);
      console.warn(`[thumbs] clip(mp4) ffmpeg spawn error clipId=${clipId}`, e);
      return res.status(500).end();
    });

    p.on("close", (code, signal) => {
      clearTimeout(killTimer);
      const buf = Buffer.concat(chunks);
      const ok = code === 0 && buf.length > 5_000;

      if (ok) {
        res.set("Content-Type", "image/jpeg");
        res.set("Cache-Control", "public, max-age=300");
        return res.end(buf);
      }

      console.warn(`[thumbs] clip(mp4) ffmpeg failed clipId=${clipId} code=${code} bytes=${buf.length}`);
      return res.status(500).end();
    });
  });
}
