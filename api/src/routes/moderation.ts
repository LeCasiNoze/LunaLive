import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Server as IOServer } from "socket.io";
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

function getIO(req: Request): IOServer | null {
  return ((req.app as any)?.locals?.io as IOServer) || null;
}

async function getMyStreamerMeta(userId: number): Promise<{ id: number; slug: string } | null> {
  const { rows } = await pool.query(`SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
  if (!rows[0]?.id) return null;
  return { id: Number(rows[0].id), slug: String(rows[0].slug) };
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

    const meta = await getMyStreamerMeta((req as any).user.id);
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

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
      [meta.id]
    );

    res.json({ ok: true, moderators: rows });
  })
);

moderationRouter.get(
  "/streamer/me/moderators/search",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const meta = await getMyStreamerMeta((req as any).user.id);
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ ok: true, users: [] });

    const limit = normLimit(req.query.limit, 8, 20);

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
      [`%${q}%`, meta.id, q, limit]
    );

    res.json({ ok: true, users: rows });
  })
);

moderationRouter.post(
  "/streamer/me/moderators",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const meta = await getMyStreamerMeta((req as any).user.id);
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.body?.userId || 0);
    if (!userId) return res.status(400).json({ ok: false, error: "userId_required" });

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
      [meta.id, userId, (req as any).user.id]
    );

    // (optionnel) prévenir le chat de refresh perms
    const io = getIO(req as any);
    io?.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "mod_add", userId });

    res.json({ ok: true });
  })
);

moderationRouter.delete(
  "/streamer/me/moderators/:userId",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const meta = await getMyStreamerMeta((req as any).user.id);
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

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
      [meta.id, userId, (req as any).user.id]
    );

    const io = getIO(req as any);
    io?.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "mod_remove", userId });

    res.json({ ok: true });
  })
);

/* ───────────────────────────────────────────── */
/* ACTIONS : DEMUTE / DEBAN (dashboard)           */
/* ───────────────────────────────────────────── */

moderationRouter.post(
  "/streamer/me/moderation/untimeout",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const meta = await getMyStreamerMeta((req as any).user.id);
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.body?.userId || 0);
    const timeoutId = Number(req.body?.timeoutId || 0);

    if (!userId && !timeoutId) return res.status(400).json({ ok: false, error: "userId_or_timeoutId_required" });

    // ✅ on “termine” le timeout (on garde l’historique)
    let rowCount = 0;

    if (timeoutId) {
      const r = await pool.query(
        `
        UPDATE chat_timeouts
        SET expires_at = NOW()
        WHERE streamer_id = $1
          AND id = $2
          AND expires_at > NOW()
        `,
        [meta.id, timeoutId]
      );
      rowCount = r.rowCount || 0;
    } else {
      const r = await pool.query(
        `
        UPDATE chat_timeouts
        SET expires_at = NOW()
        WHERE streamer_id = $1
          AND user_id = $2
          AND expires_at > NOW()
        `,
        [meta.id, userId]
      );
      rowCount = r.rowCount || 0;
    }

    const io = getIO(req as any);
    io?.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "unmute", userId: userId || null, timeoutId: timeoutId || null });

    res.json({ ok: true, changed: rowCount > 0 });
  })
);

moderationRouter.post(
  "/streamer/me/moderation/unban",
  requireAuth,
  a(async (req, res) => {
    if (!mustBeStreamerOrAdmin(req as any, res)) return;

    const meta = await getMyStreamerMeta((req as any).user.id);
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const userId = Number(req.body?.userId || 0);
    if (!userId) return res.status(400).json({ ok: false, error: "userId_required" });

    const r = await pool.query(`DELETE FROM chat_bans WHERE streamer_id=$1 AND user_id=$2`, [meta.id, userId]);

    const io = getIO(req as any);
    io?.to(`chat:${meta.slug}`).emit("chat:moderation_changed", { type: "unban", userId });

    res.json({ ok: true, changed: (r.rowCount || 0) > 0 });
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

    const meta = await getMyStreamerMeta((req as any).user.id);
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const limit = normLimit(req.query.limit, 40, 120);

    const { rows } = await pool.query(
      `
      SELECT * FROM (
        -- mod ajouté
        SELECT
          ('mod_add|' || sm.user_id::text) AS id,
          'mod_add' AS type,
          sm.created_at AS "createdAt",
          a.username AS "actorUsername",
          t.username AS "targetUsername",
          sm.user_id AS "targetUserId",
          NULL::text AS "messagePreview",
          NULL::boolean AS "isActive"
        FROM streamer_mods sm
        LEFT JOIN users a ON a.id = sm.created_by
        LEFT JOIN users t ON t.id = sm.user_id
        WHERE sm.streamer_id = $1

        UNION ALL

        -- mod retiré
        SELECT
          ('mod_remove|' || sm.user_id::text) AS id,
          'mod_remove' AS type,
          sm.removed_at AS "createdAt",
          a.username AS "actorUsername",
          t.username AS "targetUsername",
          sm.user_id AS "targetUserId",
          NULL::text AS "messagePreview",
          NULL::boolean AS "isActive"
        FROM streamer_mods sm
        LEFT JOIN users a ON a.id = sm.removed_by
        LEFT JOIN users t ON t.id = sm.user_id
        WHERE sm.streamer_id = $1
          AND sm.removed_at IS NOT NULL

        UNION ALL

        -- message supprimé
        SELECT
          ('msgdel|' || cm.id::text) AS id,
          'message_delete' AS type,
          cm.deleted_at AS "createdAt",
          a.username AS "actorUsername",
          COALESCE(u.username, cm.username) AS "targetUsername",
          cm.user_id AS "targetUserId",
          left(cm.body, 140) AS "messagePreview",
          NULL::boolean AS "isActive"
        FROM chat_messages cm
        LEFT JOIN users a ON a.id = cm.deleted_by
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE cm.streamer_id = $1
          AND cm.deleted_at IS NOT NULL

        UNION ALL

        -- ban (actif tant que la ligne existe)
        SELECT
          ('ban|' || b.user_id::text) AS id,
          'ban' AS type,
          b.created_at AS "createdAt",
          a.username AS "actorUsername",
          u.username AS "targetUsername",
          b.user_id AS "targetUserId",
          CASE WHEN b.reason IS NULL THEN NULL ELSE left(b.reason, 140) END AS "messagePreview",
          TRUE AS "isActive"
        FROM chat_bans b
        LEFT JOIN users a ON a.id = b.created_by
        LEFT JOIN users u ON u.id = b.user_id
        WHERE b.streamer_id = $1

        UNION ALL

        -- mute/timeout
        SELECT
          ('mute|' || t.id::text) AS id,
          'mute' AS type,
          t.created_at AS "createdAt",
          a.username AS "actorUsername",
          u.username AS "targetUsername",
          t.user_id AS "targetUserId",
          CASE WHEN t.reason IS NULL THEN NULL ELSE left(t.reason, 140) END AS "messagePreview",
          (t.expires_at > NOW()) AS "isActive"
        FROM chat_timeouts t
        LEFT JOIN users a ON a.id = t.created_by
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.streamer_id = $1
      ) x
      ORDER BY "createdAt" DESC NULLS LAST
      LIMIT $2
      `,
      [meta.id, limit]
    );

    res.json({ ok: true, events: rows });
  })
);
