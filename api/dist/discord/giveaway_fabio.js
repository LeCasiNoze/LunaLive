// api/src/discord/giveaway_fabio.ts
// Système de giveaway pour le serveur Fabiozsis
import { ChannelType, REST, Routes, } from "discord.js";
import { pool } from "../db.js";
import { FABIO_GUILD_ID, FABIO_CAT_INFOS_ID, FABIO_ROLE_MOD_ID, FABIO_ROLE_CHEF_ID, CID_FABIO_GIVEAWAY_ENTER, } from "./constants.js";
// ─── State ────────────────────────────────────────────────────────────────────
let giveawayChannelId = null;
// ─── Slash command definition (enregistrée sur Fabiozsis guild uniquement) ───
export const GIVEAWAY_COMMAND = {
    name: "giveaway",
    description: "Créer un giveaway [mod]",
    options: [
        {
            type: 3, name: "prize",
            description: "Somme ou prix à gagner (ex: 25€ USDC, PS5, Abonnement...)",
            required: true,
        },
        {
            type: 4, name: "winners",
            description: "Nombre de gagnants",
            required: true, min_value: 1, max_value: 20,
        },
        {
            type: 3, name: "duration",
            description: "Durée: 30m · 1h · 5d · 1w · 3d5h · ou date exacte: 2026-04-20 18:00",
            required: true,
        },
        {
            type: 8, name: "role1",
            description: "Rôle éligible — laisser vide = tout le monde peut participer",
            required: false,
        },
        {
            type: 8, name: "role2",
            description: "2ème rôle éligible (optionnel)",
            required: false,
        },
        {
            type: 8, name: "role3",
            description: "3ème rôle éligible (optionnel)",
            required: false,
        },
        {
            type: 3, name: "conditions",
            description: "Conditions de participation (optionnel)",
            required: false,
        },
    ],
};
// ─── Setup canal & enregistrement commande ────────────────────────────────────
export async function ensureGiveawaySetup(client, ctx) {
    const guild = await client.guilds.fetch(FABIO_GUILD_ID).catch(() => null);
    if (!guild)
        return;
    // Trouver ou créer le salon giveaway (public, dans catégorie INFOS)
    const channels = await guild.channels.fetch().catch(() => null);
    let ch = channels?.find((c) => c?.parentId === FABIO_CAT_INFOS_ID && c?.name?.includes("giveaway"));
    if (!ch) {
        ch = await guild.channels.create({
            name: "〈🎉〉｜giveaways",
            type: ChannelType.GuildText,
            parent: FABIO_CAT_INFOS_ID,
            topic: "Participez aux giveaways du serveur ! 🎁",
        }).catch((e) => { ctx.log(`[giveaway] create channel: ${e?.message}`); return null; });
    }
    if (ch)
        giveawayChannelId = ch.id;
    // Enregistrer /giveaway uniquement sur la guild Fabiozsis
    try {
        const token = process.env.DISCORD_BOT_TOKEN;
        if (!token || !client.user?.id)
            return;
        const rest = new REST({ version: "10" }).setToken(token);
        await rest.post(Routes.applicationGuildCommands(client.user.id, FABIO_GUILD_ID), { body: GIVEAWAY_COMMAND });
        ctx.log("[giveaway] /giveaway registered on Fabiozsis guild");
    }
    catch (e) {
        ctx.log(`[giveaway] command register failed: ${e?.message}`);
    }
}
// ─── Parsing durée ────────────────────────────────────────────────────────────
export function parseDuration(input) {
    const str = input.trim();
    // Format date absolue : YYYY-MM-DD HH:mm ou DD/MM/YYYY HH:mm
    const absMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/) ||
        str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (absMatch) {
        const d = new Date(str.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1"));
        return isNaN(d.getTime()) || d <= new Date() ? null : d;
    }
    // Format relatif : [Nw][Nd][Nh][Nm]
    const relMatch = str.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/i);
    if (!relMatch || !str)
        return null;
    const [, weeks, days, hours, minutes] = relMatch;
    const ms = (parseInt(weeks || "0") * 7 * 24 * 3600 +
        parseInt(days || "0") * 24 * 3600 +
        parseInt(hours || "0") * 3600 +
        parseInt(minutes || "0") * 60) * 1000;
    if (!ms || ms <= 0)
        return null;
    return new Date(Date.now() + ms);
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function isMod(member) {
    return member.roles.cache.has(FABIO_ROLE_MOD_ID) || member.roles.cache.has(FABIO_ROLE_CHEF_ID);
}
function discordTimestamp(date, style = "R") {
    return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
function buildGiveawayEmbed(opts) {
    const rolesText = opts.eligibleRoleIds.length
        ? opts.eligibleRoleIds.map((id) => `<@&${id}>`).join(", ")
        : "@everyone";
    const statusLine = opts.ended
        ? `🏁 **Terminé** — ${discordTimestamp(opts.endsAt, "F")}`
        : `⏰ Se termine ${discordTimestamp(opts.endsAt, "R")} (${discordTimestamp(opts.endsAt, "F")})`;
    const winnersField = opts.ended && opts.winners?.length
        ? `\n\n🏆 **Gagnant${opts.winners.length > 1 ? "s" : ""} :** ${opts.winners.map((id) => `<@${id}>`).join(", ")}`
        : "";
    return {
        title: opts.ended ? "🎊 GIVEAWAY TERMINÉ" : "🎉 GIVEAWAY",
        description: `### 🎁 ${opts.prize}\n\n` +
            `${statusLine}\n` +
            `👥 **Gagnants :** ${opts.winnerCount}\n` +
            `🎟️ **Participants :** ${opts.entryCount}\n` +
            `🔓 **Éligible :** ${rolesText}` +
            (opts.conditions ? `\n\n📋 **Conditions :** ${opts.conditions}` : "") +
            winnersField,
        color: opts.ended ? 0x99AAB5 : 0xF1C40F,
        footer: { text: opts.ended ? "Giveaway terminé" : "Clique sur 🎉 pour participer !" },
        timestamp: new Date().toISOString(),
    };
}
function buildGiveawayComponents(giveawayId, entryCount, ended = false) {
    if (ended)
        return [];
    return [{
            type: 1,
            components: [{
                    type: 2, style: 3,
                    custom_id: `${CID_FABIO_GIVEAWAY_ENTER}${giveawayId}`,
                    label: `🎉 Participer (${entryCount})`,
                    disabled: false,
                }],
        }];
}
// ─── Handler : /giveaway ──────────────────────────────────────────────────────
export async function handleGiveawayCommand(interaction, ctx) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    const prize = interaction.options.getString("prize", true);
    const winners = interaction.options.getInteger("winners", true);
    const durationStr = interaction.options.getString("duration", true);
    const role1 = interaction.options.getRole("role1");
    const role2 = interaction.options.getRole("role2");
    const role3 = interaction.options.getRole("role3");
    const conditions = interaction.options.getString("conditions");
    const endsAt = parseDuration(durationStr);
    if (!endsAt) {
        await interaction.reply({
            ephemeral: true,
            content: "❌ Format de durée invalide.\n\n" +
                "**Exemples valides :**\n" +
                "`30m` · `1h` · `5d` · `1w` · `3d5h` · `2026-04-20 18:00`",
        });
        return;
    }
    const eligibleRoleIds = [role1?.id, role2?.id, role3?.id].filter(Boolean);
    await interaction.deferReply({ ephemeral: true });
    const channelId = giveawayChannelId;
    if (!channelId) {
        await interaction.editReply({ content: "❌ Salon giveaway introuvable. Redémarrez le bot." });
        return;
    }
    try {
        // Insérer en DB
        const r = await pool.query(`INSERT INTO discord_giveaways
         (guild_id, channel_id, prize, winner_count, ends_at, eligible_role_ids, conditions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`, [FABIO_GUILD_ID, channelId, prize, winners, endsAt, eligibleRoleIds, conditions, interaction.user.id]);
        const giveawayId = r.rows[0].id;
        // Poster dans le salon giveaway
        const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (!ch) {
            await interaction.editReply({ content: "❌ Impossible d'accéder au salon giveaway." });
            return;
        }
        const embed = buildGiveawayEmbed({ prize, winnerCount: winners, endsAt, eligibleRoleIds, conditions, entryCount: 0 });
        const components = buildGiveawayComponents(giveawayId, 0);
        const msg = await ch.send({
            content: "@everyone 🎉 Un nouveau giveaway vient de commencer !",
            embeds: [embed],
            components,
            allowedMentions: { parse: ["everyone"] },
        });
        // Enregistrer le message_id
        await pool.query(`UPDATE discord_giveaways SET message_id = $1 WHERE id = $2`, [msg.id, giveawayId]);
        await interaction.editReply({
            content: `✅ Giveaway créé dans <#${channelId}> — se termine ${discordTimestamp(endsAt, "R")}.`,
        });
        ctx.log(`[giveaway] created ${giveawayId} — prize="${prize}" ends=${endsAt.toISOString()}`);
    }
    catch (e) {
        ctx.log(`[giveaway] handleGiveawayCommand error: ${e?.message}`);
        await interaction.editReply({ content: "❌ Erreur lors de la création du giveaway." });
    }
}
// ─── Handler : bouton participer ──────────────────────────────────────────────
export async function handleGiveawayEnter(interaction, giveawayId, ctx) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const r = await pool.query(`SELECT * FROM discord_giveaways WHERE id = $1 LIMIT 1`, [giveawayId]);
        const giveaway = r.rows[0];
        if (!giveaway) {
            await interaction.editReply({ content: "❌ Giveaway introuvable." });
            return;
        }
        if (giveaway.state !== "active") {
            await interaction.editReply({ content: "❌ Ce giveaway est terminé." });
            return;
        }
        if (new Date(giveaway.ends_at) <= new Date()) {
            await interaction.editReply({ content: "❌ Ce giveaway est terminé." });
            return;
        }
        // Vérifier éligibilité
        if (giveaway.eligible_role_ids?.length > 0) {
            const member = interaction.member;
            const hasRole = giveaway.eligible_role_ids.some((id) => member.roles.cache.has(id));
            if (!hasRole) {
                const roleList = giveaway.eligible_role_ids.map((id) => `<@&${id}>`).join(", ");
                await interaction.editReply({
                    content: `❌ Tu n'as pas le rôle requis pour participer.\nRôles éligibles : ${roleList}`,
                });
                return;
            }
        }
        // Vérifier si déjà inscrit
        const existing = await pool.query(`SELECT 1 FROM discord_giveaway_entries WHERE giveaway_id = $1 AND discord_user_id = $2`, [giveawayId, interaction.user.id]);
        if ((existing.rowCount ?? 0) > 0) {
            // Retrait
            await pool.query(`DELETE FROM discord_giveaway_entries WHERE giveaway_id = $1 AND discord_user_id = $2`, [giveawayId, interaction.user.id]);
            const countRes = await pool.query(`SELECT COUNT(*) AS c FROM discord_giveaway_entries WHERE giveaway_id = $1`, [giveawayId]);
            const count = parseInt(countRes.rows[0].c);
            await updateGiveawayMessage(interaction.client, giveaway, count, ctx);
            await interaction.editReply({ content: "↩️ Tu t'es retiré du giveaway." });
            return;
        }
        // Inscription
        await pool.query(`INSERT INTO discord_giveaway_entries (giveaway_id, discord_user_id) VALUES ($1, $2)`, [giveawayId, interaction.user.id]);
        const countRes = await pool.query(`SELECT COUNT(*) AS c FROM discord_giveaway_entries WHERE giveaway_id = $1`, [giveawayId]);
        const count = parseInt(countRes.rows[0].c);
        await updateGiveawayMessage(interaction.client, giveaway, count, ctx);
        await interaction.editReply({ content: `✅ Tu participes au giveaway ! Bonne chance 🍀\n*(Reclique pour te retirer.)*` });
    }
    catch (e) {
        ctx.log(`[giveaway] enter error: ${e?.message}`);
        await interaction.editReply({ content: "❌ Erreur." });
    }
}
// ─── Mettre à jour le message giveaway ───────────────────────────────────────
async function updateGiveawayMessage(client, giveaway, entryCount, ctx, ended = false, winners = []) {
    try {
        const ch = await client.channels.fetch(giveaway.channel_id).catch(() => null);
        if (!ch || !giveaway.message_id)
            return;
        const msg = await ch.messages.fetch(giveaway.message_id).catch(() => null);
        if (!msg)
            return;
        const embed = buildGiveawayEmbed({
            prize: giveaway.prize,
            winnerCount: giveaway.winner_count,
            endsAt: new Date(giveaway.ends_at),
            eligibleRoleIds: giveaway.eligible_role_ids ?? [],
            conditions: giveaway.conditions ?? null,
            entryCount,
            ended,
            winners,
        });
        const components = ended ? [] : buildGiveawayComponents(giveaway.id, entryCount, false);
        await msg.edit({ embeds: [embed], components });
    }
    catch (e) {
        ctx.log(`[giveaway] updateMessage error: ${e?.message}`);
    }
}
// ─── Handler : bouton annuler (mod) ──────────────────────────────────────────
export async function handleGiveawayCancel(interaction, giveawayId, ctx) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
        const r = await pool.query(`UPDATE discord_giveaways SET state = 'cancelled' WHERE id = $1 AND state = 'active' RETURNING *`, [giveawayId]);
        if (!r.rowCount) {
            await interaction.editReply({ content: "❌ Giveaway introuvable ou déjà terminé." });
            return;
        }
        const giveaway = r.rows[0];
        const countRes = await pool.query(`SELECT COUNT(*) AS c FROM discord_giveaway_entries WHERE giveaway_id = $1`, [giveawayId]);
        await updateGiveawayMessage(interaction.client, giveaway, parseInt(countRes.rows[0].c), ctx, true, []);
        await interaction.editReply({ content: "✅ Giveaway annulé." });
        ctx.log(`[giveaway] cancelled ${giveawayId} by ${interaction.user.id}`);
    }
    catch (e) {
        ctx.log(`[giveaway] cancel error: ${e?.message}`);
        await interaction.editReply({ content: "❌ Erreur lors de l'annulation." });
    }
}
// ─── Cron : terminer les giveaways expirés ────────────────────────────────────
export async function checkExpiredGiveaways(client, ctx) {
    try {
        const expired = await pool.query(`SELECT * FROM discord_giveaways
       WHERE state = 'active' AND ends_at <= now()
       LIMIT 10`);
        for (const giveaway of expired.rows) {
            try {
                // Marquer terminé
                await pool.query(`UPDATE discord_giveaways SET state = 'ended' WHERE id = $1`, [giveaway.id]);
                // Tirer les gagnants au sort
                const entries = await pool.query(`SELECT discord_user_id FROM discord_giveaway_entries WHERE giveaway_id = $1 ORDER BY random() LIMIT $2`, [giveaway.id, giveaway.winner_count]);
                const winnerIds = entries.rows.map((r) => r.discord_user_id);
                const entryCount = (await pool.query(`SELECT COUNT(*) AS c FROM discord_giveaway_entries WHERE giveaway_id = $1`, [giveaway.id])).rows[0].c;
                await pool.query(`UPDATE discord_giveaways SET winner_ids = $1 WHERE id = $2`, [winnerIds, giveaway.id]);
                // Mettre à jour le message (sans bouton, avec gagnants)
                await updateGiveawayMessage(client, giveaway, parseInt(entryCount), ctx, true, winnerIds);
                // Annonce dans le salon
                const ch = await client.channels.fetch(giveaway.channel_id).catch(() => null);
                if (ch) {
                    if (winnerIds.length === 0) {
                        await ch.send({
                            embeds: [{
                                    title: "🎊 Giveaway terminé — Aucun participant",
                                    description: `Le giveaway **${giveaway.prize}** est terminé mais personne n'a participé. Dommage !`,
                                    color: 0x99AAB5,
                                }],
                        });
                    }
                    else {
                        const winnerMentions = winnerIds.map((id) => `<@${id}>`).join(" ");
                        const plural = winnerIds.length > 1;
                        await ch.send({
                            content: `${winnerMentions} 🎉`,
                            embeds: [{
                                    title: `🏆 Félicitations ${plural ? "aux gagnants" : "au gagnant"} !`,
                                    description: `${winnerMentions} ${plural ? "ont remporté" : "a remporté"} **${giveaway.prize}** ! 🎁\n\n` +
                                        `*${plural ? "Contactez" : "Contacte"} un modérateur pour récupérer ${plural ? "vos" : "ton"} gains.*`,
                                    color: 0xF1C40F,
                                    footer: { text: `${entryCount} participant${entryCount > 1 ? "s" : ""}` },
                                    timestamp: new Date().toISOString(),
                                }],
                            allowedMentions: { users: winnerIds },
                        });
                    }
                }
                ctx.log(`[giveaway] ended ${giveaway.id} — ${winnerIds.length} winner(s)`);
            }
            catch (e) {
                ctx.log(`[giveaway] end error ${giveaway.id}: ${e?.message}`);
            }
        }
    }
    catch (e) {
        ctx.log(`[giveaway] checkExpired error: ${e?.message}`);
    }
}
