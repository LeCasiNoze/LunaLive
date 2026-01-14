// api/src/routes/casinos_me.ts
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth } from "../auth.js";

export const casinosMeRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: 6 * 1024 * 1024 },
});

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const ALLOWED_MIME = new Set(Object.keys(MIME_EXT));

async function tryLoadSharp(): Promise<any | null> {
  try {
    const mod: any = await import("sharp");
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

function toInt(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * Compat routes:
 * - If mounted at /me/casinos:   PUT  /:casinoId/rating
 * - If mounted at /me:          PUT  /casinos/:casinoId/rating
 */
const RATING_PATHS = ["/:casinoId/rating", "/casinos/:casinoId/rating"];
const COMMENTS_PATHS = ["/:casinoId/comments", "/casinos/:casinoId/comments"];
const REACT_PATHS = ["/comments/:commentId/reaction", "/casinos/comments/:commentId/reaction"];

// PUT rating
casinosMeRouter.put(
  RATING_PATHS,
  requireAuth,
  a(async (req, res) => {
    const casinoId = toInt(req.params.casinoId);
    if (casinoId == null) return res.status(400).json({ ok: false, error: "bad_casino_id" });

    const rating = Number(req.body?.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, error: "bad_rating" });
    }

    await pool.query(
      `
      INSERT INTO casino_user_ratings (casino_id, user_id, rating)
      VALUES ($1,$2,$3)
      ON CONFLICT (casino_id, user_id)
      DO UPDATE SET rating = EXCLUDED.rating, updated_at=NOW()
      `,
      [casinoId, Number(req.user!.id), rating]
    );

    res.json({ ok: true });
  })
);

// POST comment (multipart) -> images en DB
casinosMeRouter.post(
  COMMENTS_PATHS,
  requireAuth,
  upload.array("images", 3),
  a(async (req: any, res) => {
    const casinoId = toInt(req.params.casinoId);
    if (casinoId == null) return res.status(400).json({ ok: false, error: "bad_casino_id" });

    const body = String(req.body?.body ?? "").trim();
    const files = (req.files ?? []) as Array<{ buffer: Buffer; mimetype: string }>;

    if (!body) return res.status(400).json({ ok: false, error: "empty_body" });

    for (const f of files) {
      const mt = String(f.mimetype || "").toLowerCase();
      if (!ALLOWED_MIME.has(mt)) return res.status(400).json({ ok: false, error: "bad_image_type" });
    }

    const hasImages = files.length > 0;
    const status = hasImages ? "pending" : "published";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const ins = await client.query(
        `INSERT INTO casino_comments (casino_id, user_id, body, status, has_images)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id::text AS id`,
        [casinoId, Number(req.user!.id), body, status, hasImages]
      );

      const commentId = String(ins.rows[0].id);

      if (hasImages) {
        const sharp = await tryLoadSharp();

        for (let i = 0; i < files.length; i++) {
          const f = files[i];

          let outBuf: Buffer;
          let mime: string;
          let sizeBytes: number | null = null;
          let w: number | null = null;
          let h: number | null = null;

          const base = `img_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${i}`;

          if (sharp) {
            const img = sharp(f.buffer).rotate();
            const meta = await img.metadata();
            w = meta.width ?? null;
            h = meta.height ?? null;

            const pipeline =
              meta.width && meta.width > 1280 ? img.resize({ width: 1280, withoutEnlargement: true }) : img;

            outBuf = await pipeline.webp({ quality: 75 }).toBuffer();
            mime = "image/webp";
            sizeBytes = outBuf.length;
          } else {
            outBuf = f.buffer;
            mime = String(f.mimetype || "application/octet-stream").toLowerCase();
            sizeBytes = outBuf.length;
          }

          const ext = mime === "image/webp" ? "webp" : MIME_EXT[String(f.mimetype || "").toLowerCase()] || "bin";
          const outRel = `/uploads/casino_comments/${commentId}/${base}.${ext}`;

          await client.query(
            `INSERT INTO casino_comment_images (comment_id, url, w, h, size_bytes, mime, bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [Number(commentId), outRel, w, h, sizeBytes, mime, outBuf]
          );
        }
      }

      await client.query("COMMIT");
      return res.json({ ok: true, id: commentId, status });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("[casinos_me] post comment error", e);
      return res.status(500).json({ ok: false, error: "server_error" });
    } finally {
      client.release();
    }
  })
);

// POST reaction
casinosMeRouter.post(
  REACT_PATHS,
  requireAuth,
  a(async (req, res) => {
    const commentId = toInt(req.params.commentId);
    if (commentId == null) return res.status(400).json({ ok: false, error: "bad_comment_id" });

    const kind = req.body?.kind ?? null;

    if (kind === null) {
      await pool.query(`DELETE FROM casino_comment_reactions WHERE comment_id=$1 AND user_id=$2`, [
        commentId,
        Number(req.user!.id),
      ]);
      return res.json({ ok: true });
    }

    if (kind !== "up" && kind !== "down") {
      return res.status(400).json({ ok: false, error: "bad_kind" });
    }

    await pool.query(
      `
      INSERT INTO casino_comment_reactions (comment_id, user_id, kind)
      VALUES ($1,$2,$3)
      ON CONFLICT (comment_id, user_id)
      DO UPDATE SET kind=EXCLUDED.kind, created_at=NOW()
      `,
      [commentId, Number(req.user!.id), kind]
    );

    res.json({ ok: true });
  })
);
