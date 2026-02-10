// api/src/routes/admin_auth.ts
import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const adminAuthRouter = Router();

/**
 * GET /admin/auth/pending-registrations?limit=200
 * -> liste des inscriptions en attente de vérification email (table pending_registrations)
 *
 * Note:
 * - attempts n'existe pas dans ton schéma actuel => renvoyé à null
 * - codeCreatedAt = createdAt (tu peux changer si tu ajoutes une colonne dédiée un jour)
 */
adminAuthRouter.get(
  "/pending-registrations",
  a(async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number((req.query as any)?.limit ?? 200) || 200));

    // Optionnel : cleanup comme dans /auth/register
    // (pratique pour ne pas afficher des lignes mortes)
    try {
      await pool.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);
    } catch {}

    // pending_registrations (schéma vu dans auth.ts)
    // colonnes: id, username, email, password_hash, code_hash, expires_at, created_ip, ref_slug
    // + très probablement created_at (selon tes migrations), sinon on fallback sur NOW()
    const q = await pool.query(
      `
      SELECT
        pr.id,
        pr.username,
        pr.email,
        COALESCE(pr.created_at, NOW()) AS "createdAt",
        pr.expires_at AS "expiresAt",
        pr.created_ip AS "createdIp",
        pr.ref_slug AS "refSlug"
      FROM pending_registrations pr
      WHERE pr.expires_at > NOW()
      ORDER BY COALESCE(pr.created_at, pr.expires_at) DESC
      LIMIT $1
      `,
      [limit]
    );

    const items = (q.rows || []).map((r: any) => {
      const expiresAt = r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
      const now = Date.now();
      const remainingMs = expiresAt > 0 ? Math.max(0, expiresAt - now) : 0;

      return {
        id: Number(r.id),
        username: String(r.username || ""),
        email: String(r.email || ""),
        createdAt: r.createdAt ?? null,

        // compat front
        codeCreatedAt: r.createdAt ?? null,
        attempts: null,

        // bonus utile côté UI (si tu veux l'afficher)
        expiresAt: r.expiresAt ?? null,
        remainingSec: remainingMs ? Math.floor(remainingMs / 1000) : 0,
        createdIp: r.createdIp ?? null,
        refSlug: r.refSlug ?? null,
      };
    });

    res.json({ ok: true, items });
  })
);
