import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
export const adminAuthRouter = Router();
/**
 * GET /admin/auth/pending-registrations?limit=200
 * -> liste des inscriptions en attente (pending_registrations)
 */
adminAuthRouter.get("/pending-registrations", a(async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query?.limit ?? 200) || 200));
    // cleanup des expirées (évite d'afficher des lignes mortes)
    try {
        await pool.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);
    }
    catch { }
    const q = await pool.query(`
      SELECT
        pr.id,
        pr.username,
        pr.email,
        pr.created_at AS "createdAt",
        pr.expires_at AS "expiresAt",
        pr.created_ip AS "createdIp",
        pr.ref_slug AS "refSlug"
      FROM pending_registrations pr
      ORDER BY pr.created_at DESC
      LIMIT $1
      `, [limit]);
    const now = Date.now();
    const items = (q.rows || []).map((r) => {
        const expiresAtMs = r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
        const remainingMs = expiresAtMs ? Math.max(0, expiresAtMs - now) : 0;
        return {
            id: Number(r.id),
            username: String(r.username || ""),
            email: String(r.email || ""),
            createdAt: r.createdAt ?? null,
            // compat UI existante
            codeCreatedAt: r.createdAt ?? null,
            attempts: null,
            // bonus
            expiresAt: r.expiresAt ?? null,
            remainingSec: Math.floor(remainingMs / 1000),
            createdIp: r.createdIp ?? null,
            refSlug: r.refSlug ?? null,
        };
    });
    res.json({ ok: true, items });
}));
/**
 * DELETE /admin/auth/pending-registrations/:id
 * -> supprime une inscription pending (débloque already_pending)
 */
adminAuthRouter.delete("/pending-registrations/:id", a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "bad_id" });
    }
    const r = await pool.query(`DELETE FROM pending_registrations WHERE id=$1`, [id]);
    if (!r.rowCount)
        return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
}));
/**
 * (Optionnel) DELETE /admin/auth/pending-registrations
 * -> purge toutes les expirées + (optionnel) toutes les pendings
 * ⚠️ utile si tu veux un bouton "Purger expirées"
 */
adminAuthRouter.delete("/pending-registrations", a(async (req, res) => {
    const mode = String(req.query?.mode || "expired"); // expired | all
    if (mode === "all") {
        const r = await pool.query(`DELETE FROM pending_registrations`);
        return res.json({ ok: true, deleted: r.rowCount || 0 });
    }
    const r = await pool.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);
    res.json({ ok: true, deleted: r.rowCount || 0 });
}));
