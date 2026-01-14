import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const uploadsRouter = Router();

// Sert les images de commentaires casinos depuis Postgres (bytea)
uploadsRouter.get(
  "/casino_comments/:commentId/:filename",
  a(async (req, res) => {
    const commentId = Number(req.params.commentId);
    const filename = String(req.params.filename || "").trim();

    if (!Number.isFinite(commentId) || !filename) {
      return res.status(400).send("bad_request");
    }

    const r = await pool.query(
      `
      SELECT mime, data
      FROM casino_comment_images
      WHERE comment_id = $1
        AND filename = $2
      LIMIT 1
      `,
      [commentId, filename]
    );

    const row = r.rows[0];
    if (!row?.data) return res.status(404).send("not_found");

    res.setHeader("content-type", row.mime || "application/octet-stream");
    res.setHeader("cache-control", "public, max-age=604800, immutable"); // 7 jours
    return res.status(200).send(row.data);
  })
);
