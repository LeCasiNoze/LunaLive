import { db } from "./db.js"; // ⚠️ doit exposer db.query(sql, params)
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
async function getStreamerBySlug(slug) {
    const r = await db.query(`select id, slug, user_id as owner_user_id
     from streamers
     where slug = $1
     limit 1`, [slug]);
    return r.rows[0] || null;
}
async function cleanupOldMessages(streamerId) {
    // 1. Agréger les stats dans chat_message_stats AVANT de supprimer,
    //    pour ne pas perdre le compte des messages envoyés/reçus.
    //    On n'agrège que les messages non-supprimés (deleted_at IS NULL)
    //    car les suppressions mod ne doivent pas compter dans les stats positives.
    await db.query(`INSERT INTO chat_message_stats
       (user_id, streamer_id, messages_sent, first_message_at, last_message_at)
     SELECT
       user_id,
       streamer_id,
       COUNT(*)                AS messages_sent,
       MIN(created_at)         AS first_message_at,
       MAX(created_at)         AS last_message_at
     FROM chat_messages
     WHERE streamer_id = $1
       AND created_at < now() - interval '7 days'
       AND deleted_at IS NULL
     GROUP BY user_id, streamer_id
     ON CONFLICT (user_id, streamer_id) DO UPDATE SET
       messages_sent    = chat_message_stats.messages_sent    + EXCLUDED.messages_sent,
       last_message_at  = GREATEST(chat_message_stats.last_message_at,  EXCLUDED.last_message_at),
       first_message_at = LEAST(chat_message_stats.first_message_at, EXCLUDED.first_message_at)`, [streamerId]);
    // 2. Supprimer les messages (non-supprimés et supprimés) de plus de 7 jours
    await db.query(`DELETE FROM chat_messages
     WHERE streamer_id = $1
       AND created_at < now() - interval '7 days'`, [streamerId]);
}
export function registerChatHttp(app) {
    // 50 derniers messages (pas d’historique long)
    app.get("/chat/:slug/messages", async (req, res) => {
        try {
            const slug = String(req.params.slug || "").trim();
            const limit = clamp(Number(req.query.limit || 50), 1, 100);
            const st = await getStreamerBySlug(slug);
            if (!st)
                return res.status(404).json({ ok: false, error: "streamer_not_found" });
            await cleanupOldMessages(st.id);
            const r = await db.query(`select id, user_id, username, body, created_at, deleted_at
         from chat_messages
         where streamer_id = $1
         order by created_at desc
         limit $2`, [st.id, limit]);
            const messages = r.rows.reverse().map((m) => ({
                id: Number(m.id),
                userId: Number(m.user_id),
                username: String(m.username),
                body: m.deleted_at ? "" : String(m.body),
                deleted: !!m.deleted_at,
                createdAt: m.created_at,
            }));
            return res.json({ ok: true, messages });
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: "chat_messages_failed" });
        }
    });
    // Autocomplete @ sur les gens actifs dans le chat (3 jours) + mods
    app.get("/chat/:slug/mentions", async (req, res) => {
        try {
            const slug = String(req.params.slug || "").trim();
            const q = String(req.query.q || "").trim().toLowerCase();
            if (!q)
                return res.json({ ok: true, users: [] });
            const st = await getStreamerBySlug(slug);
            if (!st)
                return res.status(404).json({ ok: false, error: "streamer_not_found" });
            const r = await db.query(`
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
        `, [st.id, st.owner_user_id || 0, q]);
            return res.json({
                ok: true,
                users: r.rows.map((x) => ({ id: Number(x.id), username: String(x.username) })),
            });
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: "mentions_failed" });
        }
    });
}
