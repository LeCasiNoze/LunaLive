import express from "express";
import type { Request, Response } from "express";
import { pool } from "../db.js";

export const moderationRouter = express.Router();

function requireStreamerOrAdmin(req: any, res: Response) {
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

async function getMyStreamerId(userId: number): Promise<number | null> {
  const { rows } = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
  return rows[0]?.id ? Number(rows[0].id) : null;
}

function normLimit(v: any, def = 30, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(max, Math.floor(n));
}

/* ───────────────────────────────────────────────────────────── */
/* Modérateurs                                                     */
/* ───────────────────────────────────────────────────────────── */

moderationRouter.get("/streamer/me/moderators", async (req: Request, res: Response) => {
  if (!requireStreamerOrAdmin(req as any, res)) return;

  const streamerId = await getMyStreamerId((req as any).user.id);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const { rows } = await pool.query(
    `
    SELECT
      u.id,
      u.username,
      sm.created_at AS "createdAt"
    FROM streamer_moderators sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.streamer_id = $1
    ORDER BY lower(u.username) ASC
    `,
    [streamerId]
  );

  res.json({ ok: true, moderators: rows });
});

moderationRouter.get("/streamer/me/moderators/search", async (req: Request, res: Response) => {
  if (!requireStreamerOrAdmin(req as any, res)) return;

  const streamerId = await getMyStreamerId((req as any).user.id);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const q = String((req.query.q ?? "") as any).trim();
  if (q.length < 2) return res.json({ ok: true, users: [] });

  const limit = normLimit(req.query.limit, 8, 20);

  // On évite de proposer ceux déjà modos
  const { rows } = await pool.query(
    `
    SELECT u.id, u.username
    FROM users u
    WHERE lower(u.username) LIKE lower($1)
      AND u.id NOT IN (
        SELECT sm.user_id FROM streamer_moderators sm WHERE sm.streamer_id=$2
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
});

moderationRouter.post("/streamer/me/moderators", async (req: Request, res: Response) => {
  if (!requireStreamerOrAdmin(req as any, res)) return;

  const streamerId = await getMyStreamerId((req as any).user.id);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const userId = Number(req.body?.userId || 0);
  const username = String(req.body?.username || "").trim();

  let targetId = userId;

  if (!targetId && username) {
    const u = await pool.query(`SELECT id FROM users WHERE lower(username)=lower($1) LIMIT 1`, [username]);
    targetId = Number(u.rows[0]?.id || 0);
  }

  if (!targetId) return res.status(400).json({ ok: false, error: "user_required" });

  // Insert modo
  const ins = await pool.query(
    `
    INSERT INTO streamer_moderators (streamer_id, user_id, added_by_user_id)
    VALUES ($1,$2,$3)
    ON CONFLICT (streamer_id, user_id) DO NOTHING
    RETURNING id
    `,
    [streamerId, targetId, (req as any).user.id]
  );

  // Log event seulement si vraiment ajouté
  if (ins.rows[0]) {
    await pool.query(
      `
      INSERT INTO moderation_events (streamer_id, type, actor_user_id, target_user_id, meta)
      VALUES ($1,'mod_add',$2,$3,$4)
      `,
      [
        streamerId,
        (req as any).user.id,
        targetId,
        JSON.stringify({ source: "dashboard" }),
      ]
    );
  }

  res.json({ ok: true });
});

moderationRouter.delete("/streamer/me/moderators/:userId", async (req: Request, res: Response) => {
  if (!requireStreamerOrAdmin(req as any, res)) return;

  const streamerId = await getMyStreamerId((req as any).user.id);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const targetId = Number(req.params.userId || 0);
  if (!targetId) return res.status(400).json({ ok: false, error: "bad_user_id" });

  const del = await pool.query(
    `
    DELETE FROM streamer_moderators
    WHERE streamer_id=$1 AND user_id=$2
    RETURNING id
    `,
    [streamerId, targetId]
  );

  if (del.rows[0]) {
    await pool.query(
      `
      INSERT INTO moderation_events (streamer_id, type, actor_user_id, target_user_id, meta)
      VALUES ($1,'mod_remove',$2,$3,$4)
      `,
      [
        streamerId,
        (req as any).user.id,
        targetId,
        JSON.stringify({ source: "dashboard" }),
      ]
    );
  }

  res.json({ ok: true });
});

/* ───────────────────────────────────────────────────────────── */
/* Events                                                          */
/* ───────────────────────────────────────────────────────────── */

moderationRouter.get("/streamer/me/moderation-events", async (req: Request, res: Response) => {
  if (!requireStreamerOrAdmin(req as any, res)) return;

  const streamerId = await getMyStreamerId((req as any).user.id);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const limit = normLimit(req.query.limit, 30, 100);

  const { rows } = await pool.query(
    `
    SELECT
      e.id::text AS id,
      e.type,
      e.created_at AS "createdAt",
      a.username AS "actorUsername",
      t.username AS "targetUsername",
      CASE
        WHEN e.message_content IS NULL THEN NULL
        ELSE left(e.message_content, 140)
      END AS "messagePreview"
    FROM moderation_events e
    LEFT JOIN users a ON a.id = e.actor_user_id
    LEFT JOIN users t ON t.id = e.target_user_id
    WHERE e.streamer_id = $1
    ORDER BY e.created_at DESC
    LIMIT $2
    `,
    [streamerId, limit]
  );

  res.json({ ok: true, events: rows });
});

moderationRouter.get("/streamer/me/moderation-events/:id", async (req: Request, res: Response) => {
  if (!requireStreamerOrAdmin(req as any, res)) return;

  const streamerId = await getMyStreamerId((req as any).user.id);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

  const { rows } = await pool.query(
    `
    SELECT
      e.id::text AS id,
      e.type,
      e.created_at AS "createdAt",
      a.username AS "actorUsername",
      t.username AS "targetUsername",
      e.message_id AS "messageId",
      e.message_content AS "messageContent",
      e.meta
    FROM moderation_events e
    LEFT JOIN users a ON a.id = e.actor_user_id
    LEFT JOIN users t ON t.id = e.target_user_id
    WHERE e.streamer_id = $1 AND e.id::text = $2
    LIMIT 1
    `,
    [streamerId, id]
  );

  if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, event: rows[0] });
});
