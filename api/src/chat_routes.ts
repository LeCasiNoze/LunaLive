import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { chatStore } from "./chat_store";

export function registerChatRoutes(app: Express) {
  // GET last messages
  app.get("/chat/:slug/messages", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const limit = Number(req.query.limit || 50);
    const messages = chatStore.getMessages(slug, limit);
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
