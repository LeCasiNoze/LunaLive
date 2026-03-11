// api/src/discord/sync.ts
import crypto from "crypto";
import { pool } from "../db.js";
import { getActiveSiteUserBan } from "../auth.js";
import { ROLE_MOD_LUNALIVE_ID, ROLE_PARTNER_ID, ROLE_RESTRICTED_ID, ROLE_STREAMER_ID, ROLE_VERIFIED_ID, ROLE_VIEWER_ID, } from "./constants.js";
import { safeDm } from "./utils.js";
export function hasAnyRole(member, roleIds) {
    return roleIds.some((rid) => member.roles.cache.has(rid));
}
export function isVerified(member) {
    return member.roles.cache.has(ROLE_VERIFIED_ID);
}
export function isRestricted(member) {
    return member.roles.cache.has(ROLE_RESTRICTED_ID);
}
export async function applyRolesAndNick(client, guild, member, userRow, ctx) {
    const want = new Set();
    want.add(ROLE_VERIFIED_ID);
    const role = String(userRow?.role || "viewer");
    if (role.includes("streamer"))
        want.add(ROLE_STREAMER_ID);
    else
        want.add(ROLE_VIEWER_ID);
    if (role.includes("mod"))
        want.add(ROLE_MOD_LUNALIVE_ID);
    if (role.includes("partner"))
        want.add(ROLE_PARTNER_ID);
    if (role === "restricted")
        want.add(ROLE_RESTRICTED_ID);
    try {
        const current = new Set(member.roles.cache.map((r) => r.id));
        const toAdd = [...want].filter((id) => id && !current.has(id));
        if (toAdd.length)
            await member.roles.add(toAdd);
    }
    catch (e) {
        ctx.log(`[discord] roles add failed guild=${guild.id} user=${member.id}: ${e?.message || e}`);
    }
    const targetBase = String(userRow?.username || "").trim();
    if (!targetBase)
        return;
    const trySet = async (nick) => {
        try {
            if (member.nickname !== nick)
                await member.setNickname(nick, "LunaLive sync");
            return true;
        }
        catch {
            return false;
        }
    };
    if (await trySet(targetBase))
        return;
    const suffix = crypto.createHash("sha1").update(String(member.id)).digest("hex").slice(0, 4).toUpperCase();
    const fallback = `${targetBase} · ${suffix}`.slice(0, 32);
    const ok = await trySet(fallback);
    if (ok) {
        await safeDm(client, String(member.id), `Votre nom Discord a été synchronisé avec LunaLive.\n\nNom appliqué : **${fallback}**\n(Raison : un autre membre utilise déjà **${targetBase}** sur ce serveur.)`, ctx);
    }
    else {
        await safeDm(client, String(member.id), `Nous n'avons pas pu renommer votre compte automatiquement (permissions Discord / restrictions serveur).\nMerci de contacter un administrateur si besoin.`, ctx);
    }
}
export async function syncUserEverywhere(client, discordUserId, ctx) {
    if (!client)
        return;
    const link = await pool.query(`
    SELECT dl.user_id, u.username, u.role
    FROM discord_links dl
    JOIN users u ON u.id = dl.user_id
    WHERE dl.discord_user_id = $1
    LIMIT 1
    `, [discordUserId]);
    const row = link.rows?.[0];
    if (!row)
        return;
    const ban = await getActiveSiteUserBan(Number(row.user_id));
    const isBanned = !!ban?.banned;
    for (const [, guild] of client.guilds.cache) {
        try {
            const g = await client.guilds.fetch(guild.id);
            const member = await g.members.fetch(discordUserId).catch(() => null);
            if (!member)
                continue;
            if (isBanned) {
                await g.members.ban(discordUserId, { reason: "LunaLive ban" }).catch(() => null);
                continue;
            }
            await applyRolesAndNick(client, g, member, row, ctx);
        }
        catch (e) {
            ctx.log(`[discord] sync failed guild=${guild.id} user=${discordUserId}: ${e?.message || e}`);
        }
    }
    await pool
        .query(`UPDATE discord_links SET last_sync_at = NOW(), updated_at = NOW() WHERE discord_user_id = $1`, [discordUserId])
        .catch(() => { });
}
