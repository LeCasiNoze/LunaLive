// api/src/routes/bot/me_discord_link.ts
import { Router } from "express";
import crypto from "crypto";
import { pool } from "../../db.js";
import { requireAuth } from "../../auth.js";
import { discordSyncNow } from "../../discord/bot.js";
export const meDiscordLinkRouter = Router();
function getSecret() {
    const s = String(process.env.DISCORD_LINK_CODE_SECRET || "").trim();
    if (!s)
        throw new Error("DISCORD_LINK_CODE_SECRET missing");
    return s;
}
function normCode(v) {
    return String(v ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}
function hashCode(code) {
    const secret = getSecret();
    return crypto.createHash("sha256").update(`${code}::${secret}`).digest("hex");
}
// GET /me/discord-link -> statut
meDiscordLinkRouter.get("/me/discord-link", requireAuth, async (req, res) => {
    const userId = Number(req.user.id);
    const r = await pool.query(`
    SELECT discord_user_id, linked_at, updated_at, last_sync_at
    FROM discord_links
    WHERE user_id = $1
    LIMIT 1
    `, [userId]);
    const row = r.rows?.[0] || null;
    return res.json({
        ok: true,
        linked: !!row,
        link: row
            ? {
                discordUserId: String(row.discord_user_id),
                linkedAt: row.linked_at,
                updatedAt: row.updated_at,
                lastSyncAt: row.last_sync_at ?? null,
            }
            : null,
    });
});
// POST /me/discord-link/consume { code }
meDiscordLinkRouter.post("/me/discord-link/consume", requireAuth, async (req, res) => {
    const userId = Number(req.user.id);
    const code = normCode(req.body?.code);
    if (!/^LL-[A-Z0-9]{6,12}$/.test(code)) {
        return res.status(400).json({ ok: false, error: "bad_code_format" });
    }
    const codeHash = hashCode(code);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // ✅ atomique: supprime le code en le "consommant" et récupère le discord_user_id
        const del = await client.query(`
      DELETE FROM discord_link_codes
      WHERE code_hash = $1
        AND expires_at > NOW()
      RETURNING discord_user_id
      `, [codeHash]);
        const row = del.rows?.[0];
        if (!row) {
            await client.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "code_not_found_or_expired" });
        }
        const discordUserId = String(row.discord_user_id);
        // one-to-one : on nettoie avant d'insérer
        await client.query(`DELETE FROM discord_links WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM discord_links WHERE discord_user_id = $1`, [discordUserId]);
        // ✅ linked_at existe (pas created_at)
        await client.query(`
      INSERT INTO discord_links (discord_user_id, user_id, linked_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      `, [discordUserId, userId]);
        // one-shot : supprime les autres codes potentiels de ce discord_user_id
        await client.query(`DELETE FROM discord_link_codes WHERE discord_user_id = $1`, [discordUserId]);
        await client.query("COMMIT");
        // ✅ sync instant mais sans bloquer la réponse
        discordSyncNow(discordUserId).catch(() => { });
        return res.json({ ok: true, linked: true, discordUserId });
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        return res.status(500).json({ ok: false, error: e?.message || "server_error" });
    }
    finally {
        client.release();
    }
});
// POST /me/discord-link/sync -> resync manuel
meDiscordLinkRouter.post("/me/discord-link/sync", requireAuth, async (_req, res) => {
    const userId = Number(_req.user.id);
    const r = await pool.query(`SELECT discord_user_id FROM discord_links WHERE user_id = $1 LIMIT 1`, [userId]);
    const row = r.rows?.[0];
    if (!row)
        return res.status(404).json({ ok: false, error: "not_linked" });
    const discordUserId = String(row.discord_user_id);
    await discordSyncNow(discordUserId).catch(() => { });
    return res.json({ ok: true });
});
// POST /me/discord-link/unlink
meDiscordLinkRouter.post("/me/discord-link/unlink", requireAuth, async (req, res) => {
    const userId = Number(req.user.id);
    await pool.query(`DELETE FROM discord_links WHERE user_id = $1`, [userId]);
    return res.json({ ok: true, linked: false });
});
