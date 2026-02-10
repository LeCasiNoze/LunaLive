import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const adminAuthRouter = Router();

async function regclassExists(name: string): Promise<boolean> {
  const full = name.includes(".") ? name : `public.${name}`;
  const r = await pool.query(`SELECT to_regclass($1) AS reg`, [full]);
  return !!r.rows?.[0]?.reg;
}

/**
 * GET /admin/auth/pending-registrations?limit=200
 * => liste des users email_verified=false
 * + si on trouve une table de codes, on remonte created_at + attempts
 */
adminAuthRouter.get(
  "/pending-registrations",
  a(async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number((req.query as any)?.limit ?? 200) || 200));

    // base: users non vérifiés
    const base = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.created_at AS "createdAt"
      FROM users u
      WHERE COALESCE(u.email_verified,false) = false
        AND u.email IS NOT NULL
        AND u.email <> ''
      ORDER BY u.created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    // 🔎 optionnel: trouver la table de codes (si elle existe)
    // adapte ici si tu connais le nom exact, sinon on teste plusieurs candidats.
    const candidates = [
      "email_verify_codes",
      "user_email_verify_codes",
      "register_verify_codes",
      "users_email_codes",
      "email_verification_codes",
    ];

    let codeTable: string | null = null;
    for (const t of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await regclassExists(t)) {
        codeTable = t;
        break;
      }
    }

    // si aucune table, on renvoie juste la base
    if (!codeTable) {
      return res.json({
        ok: true,
        items: base.rows.map((u) => ({
          ...u,
          codeCreatedAt: null,
          attempts: null,
        })),
        meta: { codeTable: null },
      });
    }

    // On essaie de join au plus simple:
    // attendu: user_id, created_at, attempts (ou try_count)
    // -> on prend le dernier code par user
    const join = await pool.query(
      `
      WITH last_code AS (
        SELECT DISTINCT ON (c.user_id)
          c.user_id,
          c.created_at,
          COALESCE(c.attempts, c.try_count, c.tries, NULL)::int AS attempts
        FROM ${codeTable} c
        ORDER BY c.user_id, c.created_at DESC
      )
      SELECT
        u.id,
        u.username,
        u.email,
        u.created_at AS "createdAt",
        lc.created_at AS "codeCreatedAt",
        lc.attempts
      FROM users u
      LEFT JOIN last_code lc ON lc.user_id = u.id
      WHERE COALESCE(u.email_verified,false) = false
        AND u.email IS NOT NULL
        AND u.email <> ''
      ORDER BY u.created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return res.json({
      ok: true,
      items: join.rows,
      meta: { codeTable },
    });
  })
);
