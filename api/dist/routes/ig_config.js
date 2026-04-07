// api/src/routes/ig_config.ts
// CRUD sur streamer_ig_config (configuration Instagram par streamer).
// Protégé par requireAdminKey.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAdminKey } from "../auth.js";
export const igConfigRouter = Router();
const SELECT_FIELDS = "id, streamer_slug, trigger_word, offer_label, offer_detail, " +
    "process_info, discord_url, extra_url, instagram_username, active, created_at";
// ─── GET /api/ig-config ───────────────────────────────────────────────────────
igConfigRouter.get("/ig-config", requireAdminKey, async (_req, res) => {
    try {
        const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM streamer_ig_config ORDER BY streamer_slug ASC`);
        res.json({ ok: true, data: rows });
    }
    catch (e) {
        console.error("[ig-config] GET error:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
// ─── GET /api/ig-config/:slug ─────────────────────────────────────────────────
igConfigRouter.get("/ig-config/:slug", requireAdminKey, async (req, res) => {
    const slug = String(req.params.slug).toLowerCase();
    try {
        const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM streamer_ig_config WHERE LOWER(streamer_slug) = $1 LIMIT 1`, [slug]);
        if (rows.length === 0)
            return void res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true, data: rows[0] });
    }
    catch (e) {
        console.error("[ig-config] GET/:slug error:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
// ─── POST /api/ig-config — upsert par streamer_slug ──────────────────────────
igConfigRouter.post("/ig-config", requireAdminKey, async (req, res) => {
    const { streamer_slug, trigger_word, offer_label = null, offer_detail = null, process_info = null, discord_url = null, extra_url = null, instagram_username = null, active = true, } = req.body ?? {};
    if (!streamer_slug || !trigger_word) {
        return void res.status(400).json({ ok: false, error: "streamer_slug et trigger_word sont requis" });
    }
    const slugLower = String(streamer_slug).toLowerCase();
    try {
        // 1. Tenter un UPDATE
        const updateQ = `UPDATE streamer_ig_config SET
         trigger_word       = $2,
         offer_label        = $3,
         offer_detail       = $4,
         process_info       = $5,
         discord_url        = $6,
         extra_url          = $7,
         instagram_username = $8,
         active             = $9
       WHERE LOWER(streamer_slug) = $1
       RETURNING ${SELECT_FIELDS}`;
        const updateParams = [
            slugLower, trigger_word, offer_label, offer_detail,
            process_info, discord_url, extra_url, instagram_username, active,
        ];
        const updateResult = await pool.query(updateQ, updateParams);
        if ((updateResult.rowCount ?? 0) > 0) {
            return void res.json({ ok: true, data: updateResult.rows[0] });
        }
        // 2. Aucune ligne existante → INSERT
        const insertQ = `INSERT INTO streamer_ig_config
         (streamer_slug, trigger_word, offer_label, offer_detail, process_info,
          discord_url, extra_url, instagram_username, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_FIELDS}`;
        const insertParams = [
            streamer_slug, trigger_word, offer_label, offer_detail,
            process_info, discord_url, extra_url, instagram_username, active,
        ];
        const insertResult = await pool.query(insertQ, insertParams);
        res.json({ ok: true, data: insertResult.rows[0] });
    }
    catch (e) {
        console.error("[ig-config] POST error:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error", detail: e?.message });
    }
});
// ─── PATCH /api/ig-config/:slug — mise à jour partielle ──────────────────────
igConfigRouter.patch("/ig-config/:slug", requireAdminKey, async (req, res) => {
    const slug = String(req.params.slug).toLowerCase();
    const allowed = [
        "trigger_word", "offer_label", "offer_detail", "process_info",
        "discord_url", "extra_url", "instagram_username", "active",
    ];
    const fields = [];
    const values = [];
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
        const { rows } = await pool.query(`UPDATE streamer_ig_config
       SET ${fields.join(", ")}
       WHERE LOWER(streamer_slug) = $1
       RETURNING ${SELECT_FIELDS}`, [slug, ...values]);
        if (rows.length === 0)
            return void res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true, data: rows[0] });
    }
    catch (e) {
        console.error("[ig-config] PATCH error:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
// ─── DELETE /api/ig-config/:slug — soft delete ───────────────────────────────
igConfigRouter.delete("/ig-config/:slug", requireAdminKey, async (req, res) => {
    const slug = String(req.params.slug).toLowerCase();
    try {
        await pool.query(`UPDATE streamer_ig_config SET active = false WHERE LOWER(streamer_slug) = $1`, [slug]);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[ig-config] DELETE error:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
