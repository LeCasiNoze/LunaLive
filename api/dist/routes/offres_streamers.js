// api/src/routes/offres_streamers.ts
import { Router } from "express";
import { pool } from "../db.js";
export const offresStreamersRouter = Router();
// GET /api/offres-streamers/:slug
offresStreamersRouter.get("/offres-streamers/:slug", async (req, res) => {
    const slug = String(req.params.slug ?? "").toLowerCase();
    if (!slug)
        return void res.status(400).json({ ok: false, error: "missing_slug" });
    try {
        const { rows } = await pool.query(`SELECT streamer_slug, offer_label, offer_detail, process_info, discord_url, extra_url
       FROM streamer_ig_config
       WHERE LOWER(streamer_slug) = $1 AND active = true
       LIMIT 1`, [slug]);
        if (rows.length === 0)
            return void res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true, data: rows[0] });
    }
    catch (e) {
        console.error("[offres-streamers] error:", e?.message ?? e);
        res.status(500).json({ ok: false, error: "server_error" });
    }
});
