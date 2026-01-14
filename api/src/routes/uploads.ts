// api/src/routes/uploads.ts
import { Router } from "express";
import { pool } from "../db.js";

export const uploadsRouter = Router();

function safeInt(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/**
 * ✅ Casino comment images served from DB (bytes)
 * Mounted at /uploads
 * GET /uploads/casino_comments/:commentId/:file
 *
 * IMPORTANT:
 * - We look up by (comment_id, url) where url is exactly what is stored in DB.
 * - If not found OR bytes is null -> next() so express.static can try (legacy disk).
 */
uploadsRouter.get("/casino_comments/:commentId/:file", async (req, res, next) => {
  try {
    const commentId = safeInt(req.params.commentId);
    const file = String(req.params.file || "").trim();
    if (!commentId || !file) return next();

    const url = `/uploads/casino_comments/${commentId}/${file}`;

    const r = await pool.query(
      `
      SELECT mime, bytes, created_at
      FROM casino_comment_images
      WHERE comment_id = $1 AND url = $2
      LIMIT 1
      `,
      [commentId, url]
    );

    const row = r.rows?.[0];
    if (!row) return next();

    // Legacy rows might exist without bytes -> let static handle it
    if (!row.bytes) return next();

    const mime = String(row.mime || "image/webp");
    res.setHeader("Content-Type", mime);

    // URL is unique per upload => immutable cache is fine
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    if (row.created_at) res.setHeader("Last-Modified", new Date(row.created_at).toUTCString());

    return res.status(200).send(row.bytes);
  } catch (e) {
    // If DB fails, don't break the whole /uploads route -> fallback to static
    return next();
  }
});
