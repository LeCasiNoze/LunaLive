import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAdminKey } from "../auth.js";
import jwt from "jsonwebtoken";
export const adminImpersonateRouter = Router();
/**
 * GET /admin/users/:id/impersonate
 * Header: x-admin-key: <ADMIN_KEY>
 * -> { ok:true, token }
 *
 * Token volontairement COURT (2 min) car il passe dans l'URL.
 */
adminImpersonateRouter.get("/admin/users/:id/impersonate", requireAdminKey, a(async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ ok: false, error: "bad_user_id" });
    }
    const { rows } = await pool.query(`SELECT id, username, role
       FROM users
       WHERE id=$1
       LIMIT 1`, [userId]);
    const u = rows[0];
    if (!u)
        return res.status(404).json({ ok: false, error: "user_not_found" });
    const secret = process.env.JWT_SECRET;
    if (!secret)
        return res.status(500).json({ ok: false, error: "JWT_SECRET missing" });
    const payload = { id: Number(u.id), username: String(u.username), role: String(u.role) };
    const token = jwt.sign(payload, secret, { expiresIn: "2m" });
    return res.json({ ok: true, token });
}));
