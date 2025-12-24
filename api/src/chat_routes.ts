// api/src/chat_routes.ts
import type { Express, Request, Response } from "express";
import { pool } from "./db.js";
import { chatStore } from "./chat_store.js";
import { getChatCosmeticsForUsers } from "./chat_cosmetics.js";

function clamp(n: any, min: number, max: number) {
  const raw = Array.isArray(n) ? n[0] : n;
  const x = Number(raw);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export function registerChatRoutes(app: Express) {
  // GET last messages (DB-backed)
  app.get("/chat/:slug/messages", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const limit = clamp(req.query.limit ?? 50, 1, 200);

    // resolve streamer_id
    const s = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
    const streamerId = s.rows?.[0]?.id ? Number(s.rows[0].id) : 0;
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const r = await pool.query(
      `SELECT
         id,
         user_id AS "userId",
         username,
         body,
         created_at AS "createdAt",
         deleted_at
       FROM chat_messages
       WHERE streamer_id=$1
       ORDER BY id DESC
       LIMIT $2`,
      [streamerId, limit]
    );

    // messages chronologiques
    const rows = (r.rows || []).reverse();

    // cosmetics batch
    const userIds = rows
      .map((m: any) => Number(m.userId))
      .filter((x: number) => Number.isFinite(x) && x > 0);
    const cosmeticsByUser = await getChatCosmeticsForUsers(userIds);

    const messages = rows.map((m: any) => {
      const userId = Number(m.userId);
      const deleted = !!m.deleted_at;
      return {
        id: Number(m.id),
        userId,
        username: String(m.username || ""),
        body: deleted ? "" : String(m.body || ""),
        deleted,
        createdAt: new Date(m.createdAt).toISOString(),
        cosmetics: userId > 0 ? (cosmeticsByUser.get(userId) ?? null) : null,
      };
    });

    return res.json({ ok: true, messages });
  });

  // GET mention suggestions
  app.get("/chat/:slug/mentions", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim();
    const q = String(req.query.q || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });
    if (!q) return res.json({ ok: true, users: [] });

    // 1) d’abord users récents du chat (ultra rapide)
    const local = chatStore.listRecentUsers(slug, q, 10);

    // 2) complète avec DB users (prefix)
    const need = Math.max(0, 10 - local.length);
    let dbUsers: { id: number; username: string }[] = [];
    if (need > 0) {
      const like = q.toLowerCase() + "%";
      const r = await pool.query(
        `SELECT id, username
         FROM users
         WHERE lower(username) LIKE $1
         ORDER BY username ASC
         LIMIT $2`,
        [like, need]
      );
      dbUsers = r.rows || [];
    }

    // merge unique
    const seen = new Set(local.map((u) => u.username.toLowerCase()));
    const merged = [...local];
    for (const u of dbUsers) {
      const k = String(u.username).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push({ id: Number(u.id), username: String(u.username) });
      if (merged.length >= 10) break;
    }

    return res.json({ ok: true, users: merged });
  });
}
