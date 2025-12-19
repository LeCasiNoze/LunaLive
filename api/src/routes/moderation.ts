import express from "express";
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const moderationRouter = express.Router();

const a =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function normLimit(v: any, def = 30, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(max, Math.floor(n));
}

async function getMyStreamerId(userId: number): Promise<number | null> {
  const { rows } = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
  return rows[0]?.id ? Number(rows[0].id) : null;
}

function mustBeStreamerOrAdmin(req: any, res: Response) {
  if (!req.user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  if (req.user.role !== "streamer" && req.user.role !== "admin") {
    res.status(403).json({ ok: false, error: "forbidden" });
    return false;
  }
  return true;
}

/* ───────────────────────────────────────────── */
/* MODÉRATEURS                                   */
/* ───────────────────────────────────────────── */

moderationRouter.get(
  "/streamer/me/moderators",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const streamerId = await getMyStreamerId((req as any).user.id);
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const { rows } = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        sm.created_at AS "createdAt"
      FROM streamer_mods sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.streamer_id = $1
        AND sm.removed_at IS NULL
      ORDER BY lower(u.username) ASC
      `,
      [streamerId]
    );

    res.json({ ok: true, moderators: rows });
  })
);

moderationRouter.get(
  "/streamer/me/moderators/search",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const streamerId = await getMyStreamerId((req as any).user.id);
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ ok: true, users: [] });

    const limit = normLimit(req.query.limit, 8, 20);

    // Exclure les modos actifs
    const { rows } = await pool.query(
      `
      SELECT u.id, u.username
      FROM users u
      WHERE lower(u.username) LIKE lower($1)
        AND u.id NOT IN (
          SELECT sm.user_id
          FROM streamer_mods sm
          WHERE sm.streamer_id = $2
            AND sm.removed_at IS NULL
        )
      ORDER BY
        (lower(u.username) = lower($3)) DESC,
        position(lower($3) in lower(u.username)) ASC,
        lower(u.username) ASC
      LIMIT $4
      `,
      [`%${q}%`, streamerId, q, limit]
    );

    res.json({ ok: true, users: rows });
  })
);

moderationRouter.post(
  "/streamer/me/moderators",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const streamerId = await getMyStreamerId((req as any).user.id);
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.body?.userId || 0);
    if (!userId) return res.status(400).json({ ok: false, error: "userId_required" });

    // ✅ upsert: (re)active le modo si déjà présent mais removed
    await pool.query(
      `
      INSERT INTO streamer_mods (streamer_id, user_id, created_by, created_at, removed_at, removed_by)
      VALUES ($1,$2,$3,NOW(),NULL,NULL)
      ON CONFLICT (streamer_id, user_id) DO UPDATE
        SET created_at = NOW(),
            created_by = EXCLUDED.created_by,
            removed_at = NULL,
            removed_by = NULL
      `,
      [streamerId, userId, (req as any).user.id]
    );

    res.json({ ok: true });
  })
);

moderationRouter.delete(
  "/streamer/me/moderators/:userId",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const streamerId = await getMyStreamerId((req as any).user.id);
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.params.userId || 0);
    if (!userId) return res.status(400).json({ ok: false, error: "bad_user_id" });

    await pool.query(
      `
      UPDATE streamer_mods
      SET removed_at = NOW(),
          removed_by = $3
      WHERE streamer_id = $1
        AND user_id = $2
        AND removed_at IS NULL
      `,
      [streamerId, userId, (req as any).user.id]
    );

    res.json({ ok: true });
  })
);

/* ───────────────────────────────────────────── */
/* EVENTS (feed)                                 */
/* ───────────────────────────────────────────── */

moderationRouter.get(
  "/streamer/me/moderation-events",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const streamerId = await getMyStreamerId((req as any).user.id);
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const limit = normLimit(req.query.limit, 40, 120);

    const { rows } = await pool.query(
      `
      SELECT * FROM (
        -- ✅ mod ajouté
        SELECT
          ('mod_add|' || sm.user_id::text) AS id,
          'mod_add' AS type,
          sm.created_at AS "createdAt",
          a.username AS "actorUsername",
          t.username AS "targetUsername",
          NULL::text AS "messagePreview"
        FROM streamer_mods sm
        LEFT JOIN users a ON a.id = sm.created_by
        LEFT JOIN users t ON t.id = sm.user_id
        WHERE sm.streamer_id = $1

        UNION ALL

        -- ✅ mod retiré (soft remove)
        SELECT
          ('mod_remove|' || sm.user_id::text) AS id,
          'mod_remove' AS type,
          sm.removed_at AS "createdAt",
          a.username AS "actorUsername",
          t.username AS "targetUsername",
          NULL::text AS "messagePreview"
        FROM streamer_mods sm
        LEFT JOIN users a ON a.id = sm.removed_by
        LEFT JOIN users t ON t.id = sm.user_id
        WHERE sm.streamer_id = $1
          AND sm.removed_at IS NOT NULL

        UNION ALL

        -- ✅ message supprimé
        SELECT
          ('msgdel|' || cm.id::text) AS id,
          'message_delete' AS type,
          cm.deleted_at AS "createdAt",
          a.username AS "actorUsername",
          COALESCE(u.username, cm.username) AS "targetUsername",
          left(cm.body, 140) AS "messagePreview"
        FROM chat_messages cm
        LEFT JOIN users a ON a.id = cm.deleted_by
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE cm.streamer_id = $1
          AND cm.deleted_at IS NOT NULL

        UNION ALL

        -- ✅ ban
        SELECT
          ('ban|' || b.user_id::text) AS id,
          'ban' AS type,
          b.created_at AS "createdAt",
          a.username AS "actorUsername",
          u.username AS "targetUsername",
          CASE WHEN b.reason IS NULL THEN NULL ELSE left(b.reason, 140) END AS "messagePreview"
        FROM chat_bans b
        LEFT JOIN users a ON a.id = b.created_by
        LEFT JOIN users u ON u.id = b.user_id
        WHERE b.streamer_id = $1

        UNION ALL

        -- ✅ mute/timeout
        SELECT
          ('mute|' || t.id::text) AS id,
          'mute' AS type,
          t.created_at AS "createdAt",
          a.username AS "actorUsername",
          u.username AS "targetUsername",
          CASE WHEN t.reason IS NULL THEN NULL ELSE left(t.reason, 140) END AS "messagePreview"
        FROM chat_timeouts t
        LEFT JOIN users a ON a.id = t.created_by
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.streamer_id = $1
      ) x
      ORDER BY "createdAt" DESC NULLS LAST
      LIMIT $2
      `,
      [streamerId, limit]
    );

    res.json({ ok: true, events: rows });
  })
);

moderationRouter.get(
  "/streamer/me/moderation-events/:id",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const streamerId = await getMyStreamerId((req as any).user.id);
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const raw = String(req.params.id || "");
    const [kind, key] = raw.split("|");
    if (!kind || !key) return res.status(400).json({ ok: false, error: "bad_id" });

    // helpers
    const base = (event: any) => res.json({ ok: true, event });

    if (kind === "msgdel") {
      const id = Number(key);
      const { rows } = await pool.query(
        `
        SELECT
          ('msgdel|' || cm.id::text) AS id,
          'message_delete' AS type,
          cm.deleted_at AS "createdAt",
          a.username AS "actorUsername",
          COALESCE(u.username, cm.username) AS "targetUsername",
          cm.id::text AS "messageId",
          cm.body AS "messageContent",
          jsonb_build_object('source','chat_messages') AS meta
        FROM chat_messages cm
        LEFT JOIN users a ON a.id = cm.deleted_by
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE cm.streamer_id = $1 AND cm.id = $2 AND cm.deleted_at IS NOT NULL
        LIMIT 1
        `,
        [streamerId, id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      return base(rows[0]);
    }

    if (kind === "ban") {
      const userId = Number(key);
      const { rows } = await pool.query(
        `
        SELECT
          ('ban|' || b.user_id::text) AS id,
          'ban' AS type,
          b.created_at AS "createdAt",
          a.username AS "actorUsername",
          u.username AS "targetUsername",
          NULL::text AS "messageId",
          NULL::text AS "messageContent",
          jsonb_build_object('reason', b.reason, 'source','chat_bans') AS meta
        FROM chat_bans b
        LEFT JOIN users a ON a.id = b.created_by
        LEFT JOIN users u ON u.id = b.user_id
        WHERE b.streamer_id = $1 AND b.user_id = $2
        LIMIT 1
        `,
        [streamerId, userId]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      return base(rows[0]);
    }

    if (kind === "mute") {
      const id = Number(key);
      const { rows } = await pool.query(
        `
        SELECT
          ('mute|' || t.id::text) AS id,
          'mute' AS type,
          t.created_at AS "createdAt",
          a.username AS "actorUsername",
          u.username AS "targetUsername",
          t.id::text AS "messageId",
          NULL::text AS "messageContent",
          jsonb_build_object('reason', t.reason, 'expiresAt', t.expires_at, 'source','chat_timeouts') AS meta
        FROM chat_timeouts t
        LEFT JOIN users a ON a.id = t.created_by
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.streamer_id = $1 AND t.id = $2
        LIMIT 1
        `,
        [streamerId, id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
      return base(rows[0]);
    }

    if (kind === "mod_add" || kind === "mod_remove") {
      const userId = Number(key);

      const { rows } = await pool.query(
        `
        SELECT
          ($3 || '|' || sm.user_id::text) AS id,
          $3 AS type,
          CASE WHEN $3='mod_add' THEN sm.created_at ELSE sm.removed_at END AS "createdAt",
          CASE WHEN $3='mod_add' THEN a1.username ELSE a2.username END AS "actorUsername",
          u.username AS "targetUsername",
          NULL::text AS "messageId",
          NULL::text AS "messageContent",
          jsonb_build_object('source','streamer_mods') AS meta
        FROM streamer_mods sm
        LEFT JOIN users a1 ON a1.id = sm.created_by
        LEFT JOIN users a2 ON a2.id = sm.removed_by
        LEFT JOIN users u ON u.id = sm.user_id
        WHERE sm.streamer_id = $1 AND sm.user_id = $2
        LIMIT 1
        `,
        [streamerId, userId, kind]
      );

      if (!rows[0] || !rows[0].createdAt) return res.status(404).json({ ok: false, error: "not_found" });
      return base(rows[0]);
    }

    return res.status(400).json({ ok: false, error: "unknown_kind" });
  })
);
