// api/src/routes/streamer_uploads.ts
import express from "express";
import multer from "multer";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";

export const streamerUploadsRouter = express.Router();

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function publicBase(req: express.Request) {
  return (process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function toInt(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
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

/**
 * ✅ Public: sert le fond offline depuis DB
 * GET /uploads/streamers/offline_<streamerId>.jpg
 */
streamerUploadsRouter.get("/uploads/streamers/:filename", async (req, res, next) => {
  try {
    const filename = String(req.params.filename || "");
    const m = filename.match(/^offline_(\d+)\.jpg$/i);
    if (!m) return next();

    const streamerId = toInt(m[1]);
    if (!streamerId) return res.status(400).end();

    const r = await pool.query(
      `SELECT mime, bytes, updated_at
       FROM streamer_offline_bg_blobs
       WHERE streamer_id=$1
       LIMIT 1`,
      [streamerId]
    );

    const row = r.rows?.[0];
    if (!row || !row.bytes) return res.status(404).end();

    res.setHeader("Content-Type", String(row.mime || "image/jpeg"));
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Last-Modified", new Date(row.updated_at || Date.now()).toUTCString());

    return res.status(200).send(row.bytes);
  } catch (e) {
    console.error("[streamer_uploads] public offline bg error", e);
    return res.status(500).end();
  }
});

/**
 * POST /streamer/me/offline-bg
 * multipart/form-data: image=<file>
 * -> stocke en DB + met offline_bg_path = offline_<id>.jpg (compat)
 */
streamerUploadsRouter.post("/streamer/me/offline-bg", requireAuth, upload.single("image"), async (req: any, res) => {
  if (req.user?.role !== "streamer" && req.user?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const file = req.file as Express.Multer.File | undefined;
  if (!file?.buffer) return res.status(400).json({ ok: false, error: "file_required" });

  const mime = String(file.mimetype || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return res.status(400).json({ ok: false, error: "bad_file_type" });
  }

  const me = await getMyStreamerRow(req.user.id);
  if (!me) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const stableFilename = `offline_${me.id}.jpg`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO streamer_offline_bg_blobs (streamer_id, mime, bytes, updated_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (streamer_id)
      DO UPDATE SET mime=EXCLUDED.mime, bytes=EXCLUDED.bytes, updated_at=NOW()
      `,
      [Number(me.id), mime, file.buffer]
    );

    // ✅ compat: ton code existant qui lit streamers.offline_bg_path continue de fonctionner
    await client.query(
      `UPDATE streamers
       SET offline_bg_path=$1, updated_at=NOW()
       WHERE id=$2`,
      [stableFilename, Number(me.id)]
    );

    await client.query("COMMIT");

    const v = Date.now();
    return res.json({
      ok: true,
      offlineBgUrl: `${publicBase(req)}/uploads/streamers/${encodeURIComponent(stableFilename)}?v=${v}`,
    });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("[streamer_uploads] save offline bg error", e);
    return res.status(500).json({ ok: false, error: "offline_bg_save_failed" });
  } finally {
    client.release();
  }
});

/**
 * DELETE /streamer/me/offline-bg
 */
streamerUploadsRouter.delete("/streamer/me/offline-bg", requireAuth, async (req: any, res) => {
  if (req.user?.role !== "streamer" && req.user?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const me = await getMyStreamerRow(req.user.id);
  if (!me) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM streamer_offline_bg_blobs WHERE streamer_id=$1`, [Number(me.id)]);
    await client.query(
      `UPDATE streamers
       SET offline_bg_path=NULL, updated_at=NOW()
       WHERE id=$1`,
      [Number(me.id)]
    );

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("[streamer_uploads] delete offline bg error", e);
    return res.status(500).json({ ok: false, error: "offline_bg_delete_failed" });
  } finally {
    client.release();
  }
});
