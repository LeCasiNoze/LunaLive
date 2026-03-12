// api/src/routes/overlay_api.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
export const overlayApiRouter = Router();
function getAuthUserFromReq(req) {
    const h = String(req.headers?.authorization || "");
    const m = h.match(/^Bearer\s+(.+)$/i);
    const token = m?.[1] || String(req.query?.token || "");
    if (!token)
        return null;
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            return null;
        const u = jwt.verify(token, secret);
        const id = Number(u?.id);
        if (!Number.isFinite(id) || id <= 0)
            return null;
        return { id, role: u?.role };
    }
    catch {
        return null;
    }
}
async function getStreamerBySlug(slug) {
    const s = String(slug || "").trim();
    if (!s)
        return null;
    const r = await pool.query(`SELECT
       id,
       slug,
       user_id AS "ownerUserId",
       COALESCE(viewers, 0)::int AS viewers,
       COALESCE(is_live, FALSE) AS "isLive",
       updated_at AS "updatedAt",
       live_started_at AS "liveStartedAt"
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`, [s]);
    const row = r.rows?.[0];
    if (!row)
        return null;
    return {
        id: Number(row.id),
        slug: String(row.slug),
        ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
        isLive: !!row.isLive,
        viewers: Number(row.viewers ?? 0) || 0,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        liveStartedAt: row.liveStartedAt ? new Date(row.liveStartedAt).toISOString() : null,
    };
}
function assertOwnerOrAdmin(me, ownerUserId) {
    if (me.role === "admin")
        return true;
    if (ownerUserId != null && Number(ownerUserId) === Number(me.id))
        return true;
    return false;
}
// GET /overlay/api/followers?slug=lecasinoze
overlayApiRouter.get("/followers", async (req, res) => {
    const me = getAuthUserFromReq(req);
    if (!me)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    const slug = String(req.query?.slug || "").trim();
    if (!slug)
        return res.status(400).json({ ok: false, error: "bad_request" });
    const st = await getStreamerBySlug(slug);
    if (!st)
        return res.status(404).json({ ok: false, error: "not_found" });
    if (!assertOwnerOrAdmin(me, st.ownerUserId)) {
        return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const q = await pool.query(`SELECT
        COUNT(*)::int AS count,
        MAX(created_at) AS "lastFollowAt"
     FROM streamer_follows
     WHERE streamer_id=$1`, [st.id]);
    return res.json({
        ok: true,
        count: Number(q.rows?.[0]?.count ?? 0),
        lastFollowAt: q.rows?.[0]?.lastFollowAt ?? null,
    });
});
// ✅ NEW
// GET /overlay/api/viewers?slug=lecasinoze
// (lit juste streamers.viewers, mis à jour par dlive_poller => économique)
overlayApiRouter.get("/viewers", async (req, res) => {
    const me = getAuthUserFromReq(req);
    if (!me)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    const slug = String(req.query?.slug || "").trim();
    if (!slug)
        return res.status(400).json({ ok: false, error: "bad_request" });
    const st = await getStreamerBySlug(slug);
    if (!st)
        return res.status(404).json({ ok: false, error: "not_found" });
    if (!assertOwnerOrAdmin(me, st.ownerUserId)) {
        return res.status(403).json({ ok: false, error: "forbidden" });
    }
    // compat: renvoie viewers + count
    return res.json({
        ok: true,
        viewers: Number(st.viewers ?? 0) || 0,
        count: Number(st.viewers ?? 0) || 0,
        isLive: !!st.isLive,
        updatedAt: st.updatedAt,
        liveStartedAt: st.liveStartedAt,
    });
});
