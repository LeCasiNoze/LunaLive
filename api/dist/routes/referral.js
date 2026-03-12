import { Router } from "express";
import { a } from "../utils/async.js";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
export const referralRouter = Router();
referralRouter.post("/me/referral/set", requireAuth, a(async (req, res) => {
    const slug = String(req.body?.code || req.body?.slug || "").trim();
    if (!slug)
        return res.status(400).json({ ok: false, error: "missing_code" });
    const st = await pool.query(`SELECT id, slug FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
    const streamerId = st.rows?.[0]?.id ? Number(st.rows[0].id) : 0;
    const streamerSlug = st.rows?.[0]?.slug ? String(st.rows[0].slug) : "";
    if (!streamerId)
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
    const cur = await pool.query(`SELECT streamer_id FROM user_referrals WHERE user_id=$1 LIMIT 1`, [req.user.id]);
    if (cur.rows?.[0]) {
        const existing = Number(cur.rows[0].streamer_id);
        if (existing === streamerId) {
            return res.json({ ok: true, status: "already_same", streamerId, streamerSlug });
        }
        return res.status(409).json({ ok: false, error: "already_other" });
    }
    await pool.query(`INSERT INTO user_referrals(user_id, streamer_id, source)
       VALUES ($1,$2,'manual')
       ON CONFLICT (user_id) DO NOTHING`, [req.user.id, streamerId]);
    return res.json({ ok: true, status: "set", streamerId, streamerSlug });
}));
