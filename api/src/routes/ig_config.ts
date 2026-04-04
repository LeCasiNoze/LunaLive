// api/src/routes/ig_config.ts
// CRUD sur streamer_ig_config (configuration Instagram par streamer).
// Protégé par requireAdminKey.

import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";

export const igConfigRouter = Router();

// GET /api/ig-config — liste toutes les configs
igConfigRouter.get("/ig-config", requireAdminKey, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id, streamer_slug, trigger_word,
        offer_label, offer_detail,
        process_info, discord_url, extra_url, active,
        created_at
      FROM streamer_ig_config
      ORDER BY streamer_slug ASC
    `);
    res.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error("[ig-config] GET error:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/ig-config/:slug — config d'un streamer
igConfigRouter.get("/ig-config/:slug", requireAdminKey, async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  try {
    const { rows } = await pool.query(
      `SELECT id, streamer_slug, trigger_word,
              offer_label, offer_detail,
              process_info, discord_url, extra_url, active
       FROM streamer_ig_config
       WHERE LOWER(streamer_slug) = $1
       LIMIT 1`,
      [slug]
    );
    if (rows.length === 0) return void res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, data: rows[0] });
  } catch (e: any) {
    console.error("[ig-config] GET/:slug error:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// POST /api/ig-config — créer ou mettre à jour (upsert par streamer_slug)
igConfigRouter.post("/ig-config", requireAdminKey, async (req, res) => {
  const {
    streamer_slug,
    trigger_word,
    offer_label    = null,
    offer_detail   = null,
    process_info   = null,
    discord_url    = null,
    extra_url      = null,
    active         = true,
  } = req.body ?? {};

  if (!streamer_slug || !trigger_word) {
    return void res.status(400).json({ ok: false, error: "streamer_slug et trigger_word sont requis" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO streamer_ig_config
         (streamer_slug, trigger_word, offer_label, offer_detail, process_info, discord_url, extra_url, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (streamer_slug) DO UPDATE SET
         trigger_word  = EXCLUDED.trigger_word,
         offer_label   = EXCLUDED.offer_label,
         offer_detail  = EXCLUDED.offer_detail,
         process_info  = EXCLUDED.process_info,
         discord_url   = EXCLUDED.discord_url,
         extra_url     = EXCLUDED.extra_url,
         active        = EXCLUDED.active
       RETURNING id, streamer_slug, trigger_word, offer_label, offer_detail,
                 process_info, discord_url, extra_url, active`,
      [streamer_slug, trigger_word, offer_label, offer_detail, process_info, discord_url, extra_url, active]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (e: any) {
    console.error("[ig-config] POST error:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// PATCH /api/ig-config/:slug — mise à jour partielle
igConfigRouter.patch("/ig-config/:slug", requireAdminKey, async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const allowed = ["trigger_word", "offer_label", "offer_detail", "process_info", "discord_url", "extra_url", "active"];

  const fields: string[] = [];
  const values: any[]    = [];

  for (const key of allowed) {
    if (key in req.body) {
      fields.push(`${key} = $${values.length + 2}`);
      values.push(req.body[key]);
    }
  }

  if (fields.length === 0) {
    return void res.status(400).json({ ok: false, error: "aucun champ valide fourni" });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE streamer_ig_config
       SET ${fields.join(", ")}
       WHERE LOWER(streamer_slug) = $1
       RETURNING id, streamer_slug, trigger_word, offer_label, offer_detail,
                 process_info, discord_url, extra_url, active`,
      [slug, ...values]
    );
    if (rows.length === 0) return void res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, data: rows[0] });
  } catch (e: any) {
    console.error("[ig-config] PATCH error:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// DELETE /api/ig-config/:slug — désactiver (soft delete)
igConfigRouter.delete("/ig-config/:slug", requireAdminKey, async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  try {
    await pool.query(
      `UPDATE streamer_ig_config SET active = false WHERE LOWER(streamer_slug) = $1`,
      [slug]
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[ig-config] DELETE error:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});
