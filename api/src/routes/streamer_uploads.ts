import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";

export const streamerUploadsRouter = express.Router();

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (mais côté web on va compresser en 1600x900 jpg)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

function getUploadsDir() {
  return path.resolve(process.cwd(), "uploads", "streamers");
}

function ensureUploadsDir() {
  fs.mkdirSync(getUploadsDir(), { recursive: true });
}

function safeUnlink(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function publicBase(req: express.Request) {
  const base = (process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  return base;
}

async function getMyStreamerRow(userId: number) {
  const r = await pool.query(
    `SELECT id, slug, offline_bg_path
     FROM streamers
     WHERE user_id=$1
     LIMIT 1`,
    [userId]
  );
  return r.rows?.[0] || null;
}

function buildOfflineBgUrl(req: express.Request, filename: string | null) {
  if (!filename) return null;
  return `${publicBase(req)}/uploads/streamers/${encodeURIComponent(filename)}`;
}

/**
 * POST /streamer/me/offline-bg
 * multipart/form-data: image=<file>
 */
streamerUploadsRouter.post(
  "/streamer/me/offline-bg",
  requireAuth,
  upload.single("image"),
  async (req: any, res) => {
    if (req.user?.role !== "streamer" && req.user?.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ ok: false, error: "file_required" });

    // basic mime check (front envoie du jpeg normalement)
    const mime = String(file.mimetype || "");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      return res.status(400).json({ ok: false, error: "bad_file_type" });
    }

    const me = await getMyStreamerRow(req.user.id);
    if (!me) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    ensureUploadsDir();

    // on force stockage en .jpg (le front va déjà envoyer jpeg compressé)
    const filename = `offline_${me.id}_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`;
    const abs = path.join(getUploadsDir(), filename);

    // write file
    fs.writeFileSync(abs, file.buffer);

    // delete previous file if exists
    const prev = me.offline_bg_path ? String(me.offline_bg_path) : "";
    if (prev) {
      const prevAbs = path.join(getUploadsDir(), path.basename(prev));
      // sécurité: reste dans le dossier uploads/streamers
      if (prevAbs.startsWith(getUploadsDir())) safeUnlink(prevAbs);
    }

    await pool.query(
      `UPDATE streamers
       SET offline_bg_path=$1, updated_at=NOW()
       WHERE id=$2`,
      [filename, Number(me.id)]
    );

    return res.json({
      ok: true,
      offlineBgUrl: buildOfflineBgUrl(req, filename),
    });
  }
);

/**
 * DELETE /streamer/me/offline-bg
 */
streamerUploadsRouter.delete("/streamer/me/offline-bg", requireAuth, async (req: any, res) => {
  if (req.user?.role !== "streamer" && req.user?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const me = await getMyStreamerRow(req.user.id);
  if (!me) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const prev = me.offline_bg_path ? String(me.offline_bg_path) : "";
  if (prev) {
    const prevAbs = path.join(getUploadsDir(), path.basename(prev));
    if (prevAbs.startsWith(getUploadsDir())) safeUnlink(prevAbs);
  }

  await pool.query(
    `UPDATE streamers
     SET offline_bg_path=NULL, updated_at=NOW()
     WHERE id=$1`,
    [Number(me.id)]
  );

  res.json({ ok: true });
});
