// api/src/routes/casinos_me.ts
import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
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

async function tryLoadSharp(): Promise<any | null> {
  try {
    const mod: any = await import("sharp");
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

// PUT /casinos/:casinoId/rating
casinosMeRouter.put(
  "/casinos/:casinoId/rating",
  requireAuth,
  a(async (req, res) => {
    const casinoId = Number(req.params.casinoId);
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

// POST /casinos/:casinoId/comments  (multipart: body + images[])
casinosMeRouter.post(
  "/casinos/:casinoId/comments",
  requireAuth,
  upload.array("images", 3),
  a(async (req: any, res) => {
    const casinoId = Number(req.params.casinoId);
    const body = String(req.body?.body ?? "").trim();
    const files = (req.files ?? []) as Array<{ buffer: Buffer; mimetype: string }>;

    if (!body) return res.status(400).json({ ok: false, error: "empty_body" });

    for (const f of files) {
      if (!MIME_EXT[f.mimetype]) return res.status(400).json({ ok: false, error: "bad_image_type" });
    }

    const hasImages = files.length > 0;
    const status = hasImages ? "pending" : "published";

    const ins = await pool.query(
      `INSERT INTO casino_comments (casino_id, user_id, body, status, has_images)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id::text AS id`,
      [casinoId, Number(req.user!.id), body, status, hasImages]
    );

    const commentId = String(ins.rows[0].id);

    if (hasImages) {
      const outDir = path.resolve(process.cwd(), "uploads", "casino_comments", commentId);
      ensureDir(outDir);

      const sharp = await tryLoadSharp();

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const base = `img_${Date.now()}_${i}`;

        let outAbs: string;
        let outRel: string;
        let sizeBytes: number | null = null;
        let w: number | null = null;
        let h: number | null = null;

        if (sharp) {
          const img = sharp(f.buffer).rotate();
          const meta = await img.metadata();
          w = meta.width ?? null;
          h = meta.height ?? null;

          const pipeline =
            meta.width && meta.width > 1280 ? img.resize({ width: 1280, withoutEnlargement: true }) : img;

          const outBuf = await pipeline.webp({ quality: 75 }).toBuffer();
          outAbs = path.join(outDir, `${base}.webp`);
          outRel = `/uploads/casino_comments/${commentId}/${base}.webp`;
          fs.writeFileSync(outAbs, outBuf);
          sizeBytes = outBuf.length;
        } else {
          const ext = MIME_EXT[f.mimetype];
          outAbs = path.join(outDir, `${base}.${ext}`);
          outRel = `/uploads/casino_comments/${commentId}/${base}.${ext}`;
          fs.writeFileSync(outAbs, f.buffer);
          sizeBytes = f.buffer.length;
        }

        await pool.query(
          `INSERT INTO casino_comment_images (comment_id, url, w, h, size_bytes)
           VALUES ($1,$2,$3,$4,$5)`,
          [Number(commentId), outRel, w, h, sizeBytes]
        );
      }
    }

    res.json({ ok: true, id: commentId, status });
  })
);

// POST /casinos/comments/:commentId/reaction { kind: "up"|"down"|null }
casinosMeRouter.post(
  "/casinos/comments/:commentId/reaction",
  requireAuth,
  a(async (req, res) => {
    const commentId = Number(req.params.commentId);
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
