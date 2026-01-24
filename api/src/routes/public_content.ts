import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const publicContentRouter = Router();

// PUBLIC: lecture d'un contenu HTML par key
publicContentRouter.get(
  "/public/content/:key",
  a(async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "bad_key" });

    // ⚠️ IMPORTANT: mets ici LE MÊME NOM DE TABLE que ton admin_content_router utilise
    // (ex: "content_items" / "content" / etc.)
    const { rows } = await pool.query(
      `SELECT key, title, html, updated_at
       FROM content_items
       WHERE key = $1
       LIMIT 1`,
      [key]
    );

    const row = rows[0] || null;

    return res.json({
      ok: true,
      item: row
        ? {
            key: row.key,
            title: row.title,
            html: row.html,
            updatedAt: row.updated_at,
          }
        : null,
    });
  })
);
