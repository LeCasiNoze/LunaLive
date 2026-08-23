// api/src/emotes/streamer_emotes.router.ts
import express from "express";
import multer from "multer";
import sharp from "sharp";

import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { r2Enabled, putR2Buffer, buildPublicUrl, deleteFromR2 } from "../clips/r2.js";

export const streamerEmotesRouter = express.Router();
streamerEmotesRouter.use(requireAuth);

const SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const EMOJI_MAX_BYTES = 160_000;
const GIF_MAX_BYTES = 600_000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: SOURCE_MAX_BYTES },
});

function normName(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

async function getMyStreamerId(userId: number): Promise<number | null> {
  const r = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
  return r.rows?.[0]?.id ? Number(r.rows[0].id) : null;
}

function parseDataUrl(dataUrl: string) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("bad_dataurl");
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  return { mime, buf };
}

function validImageSignature(mime: string, buffer: Buffer) {
  const head = buffer.subarray(0, 16);
  if (mime === "image/png") return head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(head.subarray(0, 6).toString("ascii"));
  if (mime === "image/webp") return head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function detectImageMime(buffer: Buffer, declaredMime = "") {
  const supported = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  const preferred = supported.includes(declaredMime) ? declaredMime : "";
  if (preferred && validImageSignature(preferred, buffer)) return preferred;
  return supported.find((mime) => validImageSignature(mime, buffer)) || null;
}

async function optimizeImage(buffer: Buffer) {
  const metadata = await sharp(buffer, {
    animated: true,
    pages: -1,
    limitInputPixels: 32_000_000,
  }).metadata();
  const animated = Number(metadata.pages || 1) > 1;
  const kind: "emoji" | "gif" = animated ? "gif" : "emoji";
  const maxBytes = animated ? GIF_MAX_BYTES : EMOJI_MAX_BYTES;
  const candidates = animated
    ? [[360, 82], [320, 76], [280, 70], [240, 64], [200, 58], [160, 50]]
    : [[256, 88], [224, 82], [192, 76], [160, 70], [128, 64]];

  let smallest: Buffer | null = null;
  for (const [edge, quality] of candidates) {
    const source = sharp(buffer, {
      animated,
      pages: animated ? -1 : 1,
      limitInputPixels: 32_000_000,
    });
    const result = await (animated ? source : source.rotate())
      .resize({
        width: edge,
        height: edge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality,
        alphaQuality: Math.max(60, quality),
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();

    if (!smallest || result.length < smallest.length) smallest = result;
    if (result.length <= maxBytes) {
      return { buffer: result, kind, mime: "image/webp", ext: "webp", originalBytes: buffer.length };
    }
  }

  if (!smallest || smallest.length > maxBytes) throw new Error("file_too_large_after_optimization");
  return { buffer: smallest, kind, mime: "image/webp", ext: "webp", originalBytes: buffer.length };
}

async function persistEmote(params: {
  userId: number;
  streamerId: number;
  name: string;
  input: Buffer;
  declaredMime: string;
}) {
  if (!params.input.length) throw new Error("empty_file");
  if (params.input.length > SOURCE_MAX_BYTES) throw new Error("source_file_too_large");

  const detectedMime = detectImageMime(params.input, params.declaredMime);
  if (!detectedMime) throw new Error("unsupported_mime");
  const optimized = await optimizeImage(params.input);
  const cap = optimized.kind === "gif" ? 20 : 40;
  const usage = await pool.query(
    `SELECT COUNT(*)::int AS count,
            BOOL_OR(lower(name)=lower($3)) AS replacing
     FROM emotes
     WHERE scope='channel' AND streamer_id=$1 AND kind=$2 AND status <> 'deleted'`,
    [params.streamerId, optimized.kind, params.name]
  );
  if (Number(usage.rows?.[0]?.count || 0) >= cap && !usage.rows?.[0]?.replacing) {
    throw Object.assign(new Error("limit_reached"), { status: 403 });
  }

  if (!r2Enabled()) throw new Error("r2_required_for_emotes");

  const previous = await pool.query(
    `SELECT asset_key
     FROM emotes
     WHERE scope='channel' AND streamer_id=$1 AND kind=$2
       AND lower(name)=lower($3) AND status <> 'deleted'
     LIMIT 1`,
    [params.streamerId, optimized.kind, params.name]
  );
  const previousKey = String(previous.rows?.[0]?.asset_key || "");
  const assetKey = `emotes/channel/${params.streamerId}/${optimized.kind}/${params.name}-${Date.now()}.${optimized.ext}`;
  const uploaded = await putR2Buffer({
    key: assetKey,
    contentType: optimized.mime,
    buffer: optimized.buffer,
  });
  if (!uploaded) throw new Error("r2_upload_failed");

  try {
    const up = await pool.query(
      `INSERT INTO emotes(kind, scope, streamer_id, name, label, asset_key, url, mime, size_bytes, status, created_by)
       VALUES($1,'channel',$2,$3,$4,$5,$6,$7,$8,'active',$9)
       ON CONFLICT (scope, kind, streamer_id, name)
       WHERE (scope='channel' AND status <> 'deleted')
       DO UPDATE SET label=EXCLUDED.label,
                     asset_key=EXCLUDED.asset_key,
                     url=EXCLUDED.url,
                     mime=EXCLUDED.mime,
                     size_bytes=EXCLUDED.size_bytes,
                     status='active',
                     updated_at=now()
       RETURNING id, kind, scope, streamer_id, name, label, url, mime, size_bytes, status`,
      [
        optimized.kind,
        params.streamerId,
        params.name,
        null,
        assetKey,
        buildPublicUrl(assetKey),
        optimized.mime,
        optimized.buffer.length,
        params.userId,
      ]
    );

    if (previousKey && previousKey !== assetKey) {
      void deleteFromR2(previousKey).catch(() => {});
    }
    return {
      item: up.rows[0],
      optimization: {
        originalBytes: optimized.originalBytes,
        outputBytes: optimized.buffer.length,
        savedBytes: Math.max(0, optimized.originalBytes - optimized.buffer.length),
      },
    };
  } catch (error) {
    void deleteFromR2(assetKey).catch(() => {});
    throw error;
  }
}

// List mes emotes (dashboard streamer)
streamerEmotesRouter.get("/me/streamer/emotes", async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const streamerId = await getMyStreamerId(userId);
    if (!streamerId) return res.status(404).json({ ok: false, error: "no_streamer" });

    const r = await pool.query(
      `SELECT id, kind, scope, streamer_id, name, label, url, mime, size_bytes, status, created_at
       FROM emotes
       WHERE scope='channel' AND streamer_id=$1 AND status <> 'deleted'
       ORDER BY kind ASC, name ASC`,
      [streamerId]
    );

    res.json({ ok: true, items: r.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Upload (emoji/gif) scope=channel
streamerEmotesRouter.post(
  "/me/streamer/emotes",
  // ⚠️ le global JSON limit peut bloquer si trop bas => mets 3mb globalement dans app.ts
  express.json({ limit: "3mb" }),
  async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const streamerId = await getMyStreamerId(userId);
      if (!streamerId) return res.status(404).json({ ok: false, error: "no_streamer" });

      const name = normName(req.body?.name);
      if (!name) return res.status(400).json({ ok: false, error: "bad_name" });

      const dataUrl = String(req.body?.dataUrl || "");
      const { mime, buf } = parseDataUrl(dataUrl);
      const result = await persistEmote({ userId, streamerId, name, input: buf, declaredMime: mime });
      res.json({ ok: true, ...result });
    } catch (e: any) {
      res.status(e?.status || 400).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

// Upload multipart recommande : limite la memoire et evite le surcout base64.
streamerEmotesRouter.post(
  "/me/streamer/emotes/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (error: any) => {
      if (!error) return next();
      const reason = error?.code === "LIMIT_FILE_SIZE" ? "source_file_too_large" : "upload_failed";
      res.status(error?.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ ok: false, error: reason });
    });
  },
  async (req, res) => {
    try {
      const userId = Number((req as any).user.id);
      const streamerId = await getMyStreamerId(userId);
      if (!streamerId) return res.status(404).json({ ok: false, error: "no_streamer" });

      const name = normName(req.body?.name);
      if (!name) return res.status(400).json({ ok: false, error: "bad_name" });
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.buffer?.length) return res.status(400).json({ ok: false, error: "empty_file" });

      const result = await persistEmote({
        userId,
        streamerId,
        name,
        input: file.buffer,
        declaredMime: String(file.mimetype || ""),
      });
      res.json({ ok: true, ...result });
    } catch (e: any) {
      res.status(e?.status || 400).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

// Delete (soft delete)
streamerEmotesRouter.delete("/me/streamer/emotes/:id", async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const streamerId = await getMyStreamerId(userId);
    if (!streamerId) return res.status(404).json({ ok: false, error: "no_streamer" });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    await pool.query(
      `UPDATE emotes SET status='deleted', updated_at=now()
       WHERE id=$1 AND scope='channel' AND streamer_id=$2`,
      [id, streamerId]
    );

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
