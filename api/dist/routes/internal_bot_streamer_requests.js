// api/src/routes/internal_bot_streamer_requests.ts
import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { ensureAssignedDliveAccount, releaseAccountForStreamerId } from "../provider_accounts.js";
import { slugify } from "../slug.js";
export const internalBotStreamerRequestsRouter = Router();
/**
 * Auth interne: x-access-token doit matcher INTERNAL_BOT_TOKEN
 */
function requireInternalBot(req, res, next) {
    const got = String(req.headers["x-access-token"] || "");
    const want = String(process.env.INTERNAL_BOT_TOKEN || "");
    if (!want || got !== want)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    next();
}
internalBotStreamerRequestsRouter.post("/internal/bot/streamer-requests/create", requireInternalBot, a(async (req, res) => {
    const body = (req.body || {});
    const discordUserId = String(body.discordUserId || "").trim();
    const discordGuildId = String(body.discordGuildId || "").trim();
    if (!discordUserId || !discordGuildId)
        return res.status(400).json({ ok: false, error: "bad_input" });
    // On retrouve le user LunaLive via ton lien Discord (table à toi).
    // ⚠️ ADAPTE ICI si ta table/colonnes diffèrent.
    // Je pars sur une table "discord_links" (discord_user_id, discord_guild_id, user_id).
    const link = await pool.query(`
      SELECT user_id
      FROM discord_links
      WHERE discord_user_id = $1 AND discord_guild_id = $2
      LIMIT 1
      `, [discordUserId, discordGuildId]);
    const userId = link.rows?.[0]?.user_id ? Number(link.rows[0].user_id) : null;
    if (!userId)
        return res.status(409).json({ ok: false, error: "not_linked" });
    // Upsert request -> pending
    // ⚠️ ADAPTE si ta table streamer_requests n’a pas ces colonnes.
    const dliveUrl = body.dliveUrl != null ? String(body.dliveUrl).slice(0, 300) : null;
    const otherLinks = body.otherLinks != null ? String(body.otherLinks).slice(0, 1200) : null;
    const experience = body.experience != null ? String(body.experience).slice(0, 1200) : null;
    const up = await pool.query(`
      INSERT INTO streamer_requests (user_id, status, discord, channel_url, rules_accepted, updated_at)
      VALUES ($1, 'pending', $2, $3, TRUE, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET status='pending', discord=EXCLUDED.discord, channel_url=EXCLUDED.channel_url, updated_at=NOW()
      RETURNING id, user_id, status, created_at AS "createdAt", updated_at AS "updatedAt"
      `, [
        userId,
        // discord: on met juste l’id (tu peux mettre tag si tu veux côté bot)
        `discord:${discordUserId}`,
        dliveUrl,
    ]);
    // On stocke le reste dans une table meta si tu veux, sinon on met en "notes" si tu as une colonne.
    // Ici: on tente un UPDATE safe si une colonne "notes" existe.
    try {
        await pool.query(`UPDATE streamer_requests SET notes = $2 WHERE user_id = $1`, [userId, JSON.stringify({ otherLinks, experience })]);
    }
    catch {
        // ignore si colonne inexistante
    }
    const u = await pool.query(`SELECT id, username, role FROM users WHERE id=$1 LIMIT 1`, [userId]);
    res.json({
        ok: true,
        request: up.rows[0],
        user: u.rows[0] ? { id: u.rows[0].id, username: u.rows[0].username, role: u.rows[0].role } : null,
    });
}));
/**
 * APPROVE : fait EXACTEMENT la logique de ton /admin/requests/:id/approve :
 * - streamer_requests => approved
 * - users.role => streamer
 * - streamers create/reactive
 * - assign provider account
 */
internalBotStreamerRequestsRouter.post("/internal/bot/streamer-requests/:id/approve", requireInternalBot, a(async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ ok: false, error: "bad_id" });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const upd = await client.query(`
        UPDATE streamer_requests
        SET status='approved', updated_at=NOW()
        WHERE id=$1
        RETURNING user_id
        `, [id]);
        if (!upd.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "not_found" });
        }
        const userId = Number(upd.rows[0].user_id);
        await client.query(`UPDATE users SET role='streamer' WHERE id=$1`, [userId]);
        const u = await client.query(`SELECT username FROM users WHERE id=$1 LIMIT 1`, [userId]);
        const username = String(u.rows[0]?.username || `user-${userId}`);
        let slug = slugify(username);
        const exists = await client.query(`SELECT 1 FROM streamers WHERE slug=$1`, [slug]);
        if (exists.rows[0])
            slug = `${slug}-${userId}`;
        await client.query(`
        INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live)
        VALUES ($1,$2,$3,'',0,false)
        ON CONFLICT (user_id) DO NOTHING
        `, [slug, username, userId]);
        await client.query(`UPDATE streamers SET suspended_until=NULL, updated_at=NOW() WHERE user_id=$1`, [userId]);
        const s = await client.query(`SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
        const streamerId = Number(s.rows[0]?.id || 0);
        if (!streamerId) {
            await client.query("ROLLBACK");
            return res.status(500).json({ ok: false, error: "streamer_missing" });
        }
        const conn = await ensureAssignedDliveAccount(client, streamerId);
        if (!conn) {
            await client.query("ROLLBACK");
            return res.status(409).json({ ok: false, error: "no_free_provider_account" });
        }
        await client.query("COMMIT");
        res.json({
            ok: true,
            userId,
            username,
            streamer: { id: String(streamerId), slug: String(s.rows[0]?.slug || slug) },
        });
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}));
internalBotStreamerRequestsRouter.post("/internal/bot/streamer-requests/:id/reject", requireInternalBot, a(async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ ok: false, error: "bad_id" });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const upd = await client.query(`
        UPDATE streamer_requests
        SET status='rejected', updated_at=NOW()
        WHERE id=$1
        RETURNING user_id
        `, [id]);
        if (!upd.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "not_found" });
        }
        const userId = Number(upd.rows[0].user_id);
        await client.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);
        const s = await client.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
        const streamerId = s.rows[0]?.id ? Number(s.rows[0].id) : null;
        if (streamerId) {
            await releaseAccountForStreamerId(client, streamerId);
            await client.query(`UPDATE streamers SET suspended_until='infinity'::timestamptz, featured=false, updated_at=NOW() WHERE id=$1`, [streamerId]);
        }
        await client.query("COMMIT");
        res.json({ ok: true, userId });
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}));
