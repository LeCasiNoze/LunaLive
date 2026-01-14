import { Router } from "express";
import { pool } from "../db.js";

export const casinoCommentImagesRouter = Router();

function safeInt(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

// Monté sur /uploads
// GET /uploads/casino_comments/:commentId/:file
casinoCommentImagesRouter.get("/casino_comments/:commentId/:file", async (req, res, next) => {
  try {
    const commentId = safeInt(req.params.commentId);
    const file = String(req.params.file || "").trim();

    if (!commentId || !file) return next();

    // IMPORTANT: on reconstruit exactement le même URL que tu stockes en DB
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

    // Si anciennes rows encore "disk only", bytes peut être NULL -> fallback static
    if (!row.bytes) return next();

    const mime = String(row.mime || "image/webp");
    res.setHeader("Content-Type", mime);

    // cache ok (tu bust déjà côté front si besoin, sinon ok car URL unique)
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");

    if (row.created_at) {
      res.setHeader("Last-Modified", new Date(row.created_at).toUTCString());
    }

    return res.status(200).send(row.bytes);
  } catch {
    // en cas de souci DB, on laisse le static tenter (au pire 404)
    return next();
  }
});
