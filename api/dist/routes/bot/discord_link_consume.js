// api/src/routes/bot/discord_link_consume.ts
import { Router } from "express";
import crypto from "crypto";
import { pool } from "../../db.js";
import { requireAuth } from "../../auth.js";
import { discordSyncNow } from "../../discord/bot.js";
export const discordLinkConsumeRouter = Router();
// ─────────────────────────────────────────────
// Hash helper (même algo que le bot)
// ─────────────────────────────────────────────
function getLinkCodeSecret() {
    const s = String(process.env.DISCORD_LINK_CODE_SECRET || "").trim();
    if (!s)
        throw new Error("DISCORD_LINK_CODE_SECRET missing");
    return s;
}
function hashCode(code) {
    const secret = getLinkCodeSecret();
    return crypto.createHash("sha256").update(`${code}::${secret}`).digest("hex");
}
function normCode(code) {
    return String(code || "").trim().toUpperCase();
}
// POST /api/discord/link/consume
// body: { code: "LL-XXXXXX" }
// auth: requireAuth (JWT LunaLive)
discordLinkConsumeRouter.post("/discord/link/consume", requireAuth, async (req, res) => {
    const userId = Number(req.user?.id || 0);
    if (!userId)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    const code = normCode(req.body?.code);
    if (!code || code.length < 6)
        return res.status(400).json({ ok: false, error: "bad_code" });
    const codeHash = hashCode(code);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // lock la ligne code
        const r = await client.query(`
      SELECT id, discord_user_id, expires_at, consumed_at
      FROM discord_link_codes
      WHERE code_hash = $1
      FOR UPDATE
      `, [codeHash]);
        const row = r.rows?.[0];
        if (!row) {
            await client.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "code_not_found" });
        }
        if (row.consumed_at) {
            await client.query("ROLLBACK");
            return res.status(409).json({ ok: false, error: "code_already_used" });
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            await client.query("ROLLBACK");
            return res.status(410).json({ ok: false, error: "code_expired" });
        }
        const discordUserId = String(row.discord_user_id);
        // consume
        await client.query(`UPDATE discord_link_codes SET consumed_at = NOW() WHERE id = $1`, [row.id]);
        // upsert lien (1 discord <-> 1 user)
        await client.query(`
      INSERT INTO discord_links (discord_user_id, user_id, linked_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (discord_user_id)
      DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()
      `, [discordUserId, userId]);
        await client.query("COMMIT");
        // sync immédiat (pseudo + rôles + sanctions) sur tous les serveurs où le bot est présent
        discordSyncNow(discordUserId).catch(() => { });
        return res.json({ ok: true, discordUserId });
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        console.warn("[discord-link] consume failed", e?.message || e);
        return res.status(500).json({ ok: false, error: "server_error" });
    }
    finally {
        client.release();
    }
});
