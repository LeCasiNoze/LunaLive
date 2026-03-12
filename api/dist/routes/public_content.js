import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { tryGetAuthUser } from "../auth.js";
export const publicContentRouter = Router();
function roleRank(role) {
    const r = String(role || "viewer").toLowerCase();
    if (r === "admin")
        return 3;
    if (r === "streamer")
        return 2;
    if (r === "moderator" || r === "mod")
        return 1;
    return 0; // viewer
}
function minRoleRank(minRole) {
    const r = String(minRole || "viewer").toLowerCase();
    if (r === "streamer")
        return 2;
    if (r === "moderator" || r === "mod")
        return 1;
    return 0;
}
function canSee(userRole, minRole) {
    return roleRank(userRole) >= minRoleRank(minRole);
}
/**
 * PUBLIC: liste des contenus (filtrée selon rôle)
 * GET /public/content?prefix=guide_
 */
publicContentRouter.get("/public/content", a(async (req, res) => {
    const u = tryGetAuthUser(req);
    const userRole = u?.role || "viewer";
    const prefix = String(req.query?.prefix || "").trim();
    const like = prefix ? `${prefix}%` : `%`;
    const { rows } = await pool.query(`SELECT key, title, min_role, updated_at
       FROM site_content
       WHERE key LIKE $1
       ORDER BY updated_at DESC
       LIMIT 500`, [like]);
    const items = (rows || []).filter((it) => canSee(userRole, it?.min_role));
    res.json({ ok: true, items });
}));
/**
 * PUBLIC: lecture d'un contenu HTML par key
 * GET /public/content/:key
 */
publicContentRouter.get("/public/content/:key", a(async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!key)
        return res.status(400).json({ ok: false, error: "missing_key" });
    const u = tryGetAuthUser(req);
    const userRole = u?.role || "viewer";
    const { rows } = await pool.query(`SELECT key, title, html, min_role, updated_at
       FROM site_content
       WHERE key = $1`, [key]);
    const item = rows[0] || null;
    if (!item)
        return res.json({ ok: true, item: null });
    if (!canSee(userRole, item.min_role)) {
        // ✅ on ne leak pas (pas de 403, juste "null")
        return res.json({ ok: true, item: null });
    }
    res.json({ ok: true, item });
}));
