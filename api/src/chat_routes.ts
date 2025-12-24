// api/src/chat_routes.ts
import type { Express, Request, Response } from "express";
import { pool } from "./db.js";
import { chatStore } from "./chat_store.js";
import { getChatCosmeticsForUsers } from "./chat_cosmetics.js";

function clampAny(n: any, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

async function resolveStreamerId(slug: string): Promise<number> {
  const s = await pool.query(
    `SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,
    [slug]
  );
  return s.rows?.[0]?.id ? Number(s.rows[0].id) : 0;
}

function getCosmeticsFromMapLike(mapLike: any, userId: number) {
  if (!mapLike) return null;
  if (mapLike instanceof Map) return mapLike.get(userId) ?? null;
  return mapLike[userId] ?? mapLike[String(userId)] ?? null;
}

export function registerChatRoutes(app: Express) {
  // ─────────────────────────────────────────────
  // GET last messages (DB-backed) + cosmetics
  // ─────────────────────────────────────────────
  app.get("/chat/:slug/messages", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || "").trim();
      if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

      const limit = clampAny((req.query as any)?.limit ?? 50, 1, 200);

      const streamerId = await resolveStreamerId(slug);
      if (!streamerId) {
        return res.status(404).json({ ok: false, error: "streamer_not_found" });
      }

      const r = await pool.query(
        `SELECT
           id,
           user_id AS "userId",
           username,
           body,
           created_at AS "createdAt"
         FROM chat_messages
         WHERE streamer_id=$1
           AND deleted_at IS NULL
         ORDER BY id DESC
         LIMIT $2`,
        [streamerId, limit]
      );

      // chronologique (ancien -> récent)
      const rows = (r.rows || []).reverse();

      // cosmetics bulk
      const userIds = Array.from(
        new Set(rows.map((m: any) => Number(m.userId)).filter((x: number) => x > 0))
      );

      const cosmeticsByUserId = userIds.length ? await getChatCosmeticsForUsers(userIds) : null;

      const messages = rows.map((m: any) => {
        const uid = Number(m.userId);
        return {
          id: Number(m.id),
          userId: uid,
          username: String(m.username || ""),
          body: String(m.body || ""),
          createdAt: new Date(m.createdAt).toISOString(),
          cosmetics: uid > 0 ? getCosmeticsFromMapLike(cosmeticsByUserId, uid) : null,
        };
      });

      return res.json({ ok: true, messages });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "chat_messages_failed" });
    }
  });

  // ─────────────────────────────────────────────
  // GET mention suggestions
  // ─────────────────────────────────────────────
  app.get("/chat/:slug/mentions", async (req: Request, res: Response) => {
    try {
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
      const seen = new Set(local.map((u: any) => String(u.username).toLowerCase()));
      const merged = [...local];
      for (const u of dbUsers) {
        const k = String(u.username).toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push({ id: Number(u.id), username: String(u.username) });
        if (merged.length >= 10) break;
      }

      return res.json({ ok: true, users: merged });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "mentions_failed" });
    }
  });
}
