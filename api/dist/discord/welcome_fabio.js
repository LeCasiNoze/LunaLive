// api/src/discord/welcome_fabio.ts
// Messages de bienvenue et départ pour le serveur Fabiozsis
import { ChannelType } from "discord.js";
import { getActiveOffers } from "./casino_offers.js";
import { FABIO_GUILD_ID, FABIO_CAT_INFOS_ID, FABIO_CAT_MODO_ID, FABIO_ROLE_MOD_ID, FABIO_ROLE_CHEF_ID, } from "./constants.js";
// ─── State ────────────────────────────────────────────────────────────────────
let welcomeChannelId = null;
let goodbyeChannelId = null;
// Liens réseaux — à mettre à jour si les URLs changent
const LINKS = {
    rumble: "https://rumble.com/c/fabiozsis",
    lunalive: "https://lunalive.fr/s/fabiozsis",
    instagram: "https://www.instagram.com/fabiozsis",
    twitter: "https://twitter.com/fabiozsis",
    tiktok: "https://www.tiktok.com/@fabiozsis",
};
// ─── Ensure channels ──────────────────────────────────────────────────────────
export async function ensureFabioWelcomeChannels(client, ctx) {
    const guild = await client.guilds.fetch(FABIO_GUILD_ID).catch(() => null);
    if (!guild)
        return;
    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels)
        return;
    // ── Salon bienvenue (public, catégorie INFOS) ──────────────────────────────
    let welcome = channels.find((c) => c?.parentId === FABIO_CAT_INFOS_ID && c?.name?.includes("bienvenue"));
    if (!welcome) {
        welcome = await guild.channels.create({
            name: "〈👋〉｜bienvenue",
            type: ChannelType.GuildText,
            parent: FABIO_CAT_INFOS_ID,
            topic: "Bienvenue à tous les nouveaux membres ! 🎰",
            position: 0,
        }).catch((e) => {
            ctx.log(`[welcome_fabio] create welcome channel failed: ${e?.message}`);
            return null;
        });
    }
    if (welcome)
        welcomeChannelId = welcome.id;
    // ── Salon départs (privé, catégorie MODÉRATEURS) ──────────────────────────
    let goodbye = channels.find((c) => c?.parentId === FABIO_CAT_MODO_ID && c?.name?.includes("départ"));
    if (!goodbye) {
        goodbye = await guild.channels.create({
            name: "〈🚪〉｜départs",
            type: ChannelType.GuildText,
            parent: FABIO_CAT_MODO_ID,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
                { id: FABIO_ROLE_MOD_ID, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
                { id: FABIO_ROLE_CHEF_ID, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
            ],
        }).catch((e) => {
            ctx.log(`[welcome_fabio] create goodbye channel failed: ${e?.message}`);
            return null;
        });
    }
    if (goodbye)
        goodbyeChannelId = goodbye.id;
    ctx.log(`[welcome_fabio] channels ready — welcome:${welcomeChannelId} goodbye:${goodbyeChannelId}`);
}
// ─── Membre rejoint ───────────────────────────────────────────────────────────
export async function handleFabioMemberJoin(member, client, ctx) {
    if (!welcomeChannelId)
        return;
    try {
        const ch = await client.channels.fetch(welcomeChannelId).catch(() => null);
        if (!ch)
            return;
        // Offres actives depuis la DB
        const offers = await getActiveOffers(FABIO_GUILD_ID);
        const offresText = offers.length
            ? offers.map((o) => `▸ **${o.label}** — Dépôt min. **${o.min_deposit}€** → Remboursement **${o.reimburse_amt}€**`).join("\n")
            : "_Aucune offre active pour le moment._";
        const memberCount = member.guild.memberCount;
        const ordinal = memberCount % 10 === 1 && memberCount % 100 !== 11 ? "er" : "ème";
        await ch.send({
            content: `<@${member.id}>`,
            embeds: [{
                    author: {
                        name: `Bienvenue sur le serveur de Fabiozsis !`,
                        icon_url: member.guild.iconURL({ size: 64 }) ?? undefined,
                    },
                    title: `🎰 ${member.displayName} vient de rejoindre !`,
                    description: `Tu es le **${memberCount}${ordinal} membre** du serveur.\n\n` +
                        `Fabiozsis est un streamer casino — retrouve-le en live sur Rumble & LunaLive, ` +
                        `et rejoins la communauté pour ne rien rater ! 🎲`,
                    thumbnail: { url: member.user.displayAvatarURL({ size: 256 }) },
                    fields: [
                        {
                            name: "📺 Réseaux",
                            value: `🔴 [Stream — Rumble](${LINKS.rumble})\n` +
                                `🌐 [Stream — LunaLive](${LINKS.lunalive})\n` +
                                `📸 [Instagram](${LINKS.instagram})\n` +
                                `🐦 [Twitter / X](${LINKS.twitter})\n` +
                                `🎵 [TikTok](${LINKS.tiktok})`,
                            inline: true,
                        },
                        {
                            name: "🎫 Offres de remboursement",
                            value: offresText + `\n\n→ Fais ta demande dans <#1469707812081766463>`,
                            inline: false,
                        },
                        {
                            name: "🔔 Notifications",
                            value: "Choisis tes alertes (stream, Instagram, YouTube…) dans <#1493585239782723584>",
                            inline: false,
                        },
                    ],
                    color: 0xF1C40F,
                    footer: {
                        text: "Bonne chance sur les tables ! 🎰",
                        icon_url: member.guild.iconURL({ size: 32 }) ?? undefined,
                    },
                    timestamp: new Date().toISOString(),
                }],
        });
    }
    catch (e) {
        ctx.log(`[welcome_fabio] memberJoin error: ${e?.message}`);
    }
}
// ─── Membre parti ─────────────────────────────────────────────────────────────
export async function handleFabioMemberLeave(member, client, ctx) {
    if (!goodbyeChannelId)
        return;
    try {
        const ch = await client.channels.fetch(goodbyeChannelId).catch(() => null);
        if (!ch)
            return;
        const username = member.user?.username ?? member.displayName ?? "Membre inconnu";
        const tag = member.user?.tag ?? username;
        const avatar = member.user?.displayAvatarURL({ size: 128 }) ?? undefined;
        // Durée sur le serveur
        const joinedAt = member.joinedAt;
        const durationMs = joinedAt ? Date.now() - joinedAt.getTime() : null;
        let durationStr = "inconnue";
        if (durationMs !== null) {
            const days = Math.floor(durationMs / 86_400_000);
            const hours = Math.floor((durationMs % 86_400_000) / 3_600_000);
            durationStr = days > 0 ? `${days}j ${hours}h` : `${hours}h`;
        }
        // Rôles (sauf @everyone et rôles système)
        const roles = member.roles instanceof Map
            ? [...member.roles.values()]
                .filter((r) => r.id !== member.guild.roles.everyone.id && !r.managed)
                .map((r) => `\`${r.name}\``)
                .join(", ")
            : "—";
        await ch.send({
            embeds: [{
                    author: { name: tag, icon_url: avatar },
                    title: "🚪 Un membre a quitté le serveur",
                    description: `**${username}** (<@${member.id}>) vient de partir.`,
                    fields: [
                        { name: "🕐 Présence", value: durationStr, inline: true },
                        { name: "👥 Membres restants", value: `${member.guild.memberCount}`, inline: true },
                        { name: "🎭 Rôles", value: roles || "_aucun_", inline: false },
                        { name: "🆔 ID", value: `\`${member.id}\``, inline: false },
                    ],
                    color: 0x99AAB5,
                    footer: { text: "Fabiozsis • Départs", icon_url: member.guild.iconURL({ size: 32 }) ?? undefined },
                    timestamp: new Date().toISOString(),
                }],
        });
    }
    catch (e) {
        ctx.log(`[welcome_fabio] memberLeave error: ${e?.message}`);
    }
}
