import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const adminContentRouter = Router();

/* LIST */
adminContentRouter.get(
  "/content",
  a(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT key, title, updated_at
       FROM site_content
       ORDER BY updated_at DESC`
    );
    res.json({ ok: true, items: rows });
  })
);

/* GET ONE */
adminContentRouter.get(
  "/content/:key",
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

/* UPSERT */
adminContentRouter.put(
  "/content/:key",
  a(async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "missing_key" });

    const title = String(req.body?.title ?? "").trim() || null;
    const html = String(req.body?.html ?? "");

    const { rows } = await pool.query(
      `INSERT INTO site_content(key, title, html, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (key)
       DO UPDATE SET
         title = EXCLUDED.title,
         html = EXCLUDED.html,
         updated_at = now()
       RETURNING key, title, html, updated_at`,
      [key, title, html]
    );

    res.json({ ok: true, item: rows[0] });
  })
);

/* DELETE */
adminContentRouter.delete(
  "/content/:key",
  a(async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "missing_key" });

    await pool.query(`DELETE FROM site_content WHERE key = $1`, [key]);
    res.json({ ok: true });
  })
);
