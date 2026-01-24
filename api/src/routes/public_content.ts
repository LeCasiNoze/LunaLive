import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const publicContentRouter = Router();

/**
 * PUBLIC: lecture d'un contenu HTML par key
 * GET /public/content/:key
 */
publicContentRouter.get(
  "/public/content/:key",
  a(async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "missing_key" });

    const { rows } = await pool.query(
      `SELECT key, title, html, updated_at
       FROM site_content
       WHERE key = $1`,
      [key]
    );

    res.json({ ok: true, item: rows[0] || null });
  })
);
