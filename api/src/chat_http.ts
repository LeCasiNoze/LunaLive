import type { Express, Request, Response } from "express";
import { db } from "./db.js"; // ⚠️ doit exposer db.query(sql, params)

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function getStreamerBySlug(slug: string) {
  const r = await db.query(
    `select id, slug, user_id as owner_user_id
     from streamers
     where slug = $1
     limit 1`,
    [slug]
  );
  return r.rows[0] || null;
}

async function cleanupOldMessages(streamerId: number) {
  // rétention 3 jours => après 3 jours sans activité, chat vide
  await db.query(
    `delete from chat_messages
     where streamer_id = $1
       and created_at < now() - interval '3 days'`,
    [streamerId]
  );
}

export function registerChatHttp(app: Express) {
  // 50 derniers messages (pas d’historique long)
  app.get("/chat/:slug/messages", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || "").trim();
      const limit = clamp(Number(req.query.limit || 50), 1, 100);

      const st = await getStreamerBySlug(slug);
      if (!st) return res.status(404).json({ ok: false, error: "streamer_not_found" });

      await cleanupOldMessages(st.id);

      const r = await db.query(
        `select id, user_id, username, body, created_at, deleted_at
         from chat_messages
         where streamer_id = $1
         order by created_at desc
         limit $2`,
        [st.id, limit]
      );

      const messages = r.rows.reverse().map((m: any) => ({
        id: Number(m.id),
        userId: Number(m.user_id),
        username: String(m.username),
        body: m.deleted_at ? "" : String(m.body),
        deleted: !!m.deleted_at,
        createdAt: m.created_at,
      }));

      return res.json({ ok: true, messages });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: "chat_messages_failed" });
    }
  });

  // Autocomplete @ sur les gens actifs dans le chat (3 jours) + mods
  app.get("/chat/:slug/mentions", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || "").trim();
      const q = String(req.query.q || "").trim().toLowerCase();
      if (!q) return res.json({ ok: true, users: [] });

      const st = await getStreamerBySlug(slug);
      if (!st) return res.status(404).json({ ok: false, error: "streamer_not_found" });

      const r = await db.query(
        `
        with candidates as (
          select distinct user_id
          from chat_messages
          where streamer_id = $1
            and created_at >= now() - interval '3 days'
          union
          select user_id
          from streamer_mods
          where streamer_id = $1
          union
          select $2::bigint as user_id
        )
        select u.id, u.username
        from candidates c
        join users u on u.id = c.user_id
        where lower(u.username) like $3 || '%'
        order by u.username asc
        limit 10
        `,
        [st.id, st.owner_user_id || 0, q]
      );

      return res.json({
        ok: true,
        users: r.rows.map((x: any) => ({ id: Number(x.id), username: String(x.username) })),
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: "mentions_failed" });
    }
  });
}
