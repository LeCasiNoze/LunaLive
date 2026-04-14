// api/src/discord/stats_fabio.ts
// Salon stats + commande /stats (mod only, éphémère)

import { ChannelType, type Client, type GuildMember, type TextChannel } from "discord.js";
import { pool } from "../db.js";
import type { BotCtx } from "./utils.js";
import {
  FABIO_GUILD_ID,
  FABIO_CAT_MODO_ID,
  FABIO_ROLE_MOD_ID,
  FABIO_ROLE_CHEF_ID,
  FABIO_ROLE_NOTIF_STREAM,
  FABIO_ROLE_NOTIF_INSTA,
  FABIO_ROLE_NOTIF_YT,
  FABIO_ROLE_NOTIF_TW,
  FABIO_NOTIF_CHANNEL_ID,
  CID_FABIO_TICKET_APPROVE,
} from "./constants.js";

export const CID_STATS_LIST = "fabio:stats:list:"; // + casino slug

let statsChannelId: string | null = null;

// ─── Setup ────────────────────────────────────────────────────────────────────
export async function ensureStatsChannel(client: Client, ctx: BotCtx) {
  const guild = await client.guilds.fetch(FABIO_GUILD_ID).catch(() => null);
  if (!guild) return;

  const channels = await guild.channels.fetch().catch(() => null);
  let ch = channels?.find(
    (c) => c?.parentId === FABIO_CAT_MODO_ID && c?.name?.includes("stats")
  );

  if (!ch) {
    ch = await guild.channels.create({
      name: "〈📊〉｜stats",
      type: ChannelType.GuildText,
      parent: FABIO_CAT_MODO_ID,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
        { id: FABIO_ROLE_MOD_ID,  allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        { id: FABIO_ROLE_CHEF_ID, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
      ],
    }).catch((e) => { ctx.log(`[stats_fabio] create channel: ${e?.message}`); return null; });
  }

  if (ch) {
    statsChannelId = ch.id;
    ctx.log(`[stats_fabio] stats channel ready: ${ch.id}`);
  }

  // Renommer le salon notifs
  try {
    const notifCh = await client.channels.fetch(FABIO_NOTIF_CHANNEL_ID).catch(() => null) as TextChannel | null;
    if (notifCh && !notifCh.name.includes("notif")) {
      await notifCh.setName("〈🔔〉｜notifs").catch(() => {});
    }
  } catch { /* ignore */ }
}

// ─── Handler /stats ───────────────────────────────────────────────────────────
export async function handleStatsCommand(interaction: any, ctx: BotCtx) {
  // Restriction : seulement dans le salon stats, seulement les mods
  if (statsChannelId && interaction.channelId !== statsChannelId) {
    await interaction.reply({
      ephemeral: true,
      content: `❌ Cette commande est réservée au salon <#${statsChannelId}>.`,
    });
    return;
  }

  const member = interaction.member as GuildMember;
  const isMod = member.roles.cache.has(FABIO_ROLE_MOD_ID) || member.roles.cache.has(FABIO_ROLE_CHEF_ID);
  if (!isMod) {
    await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = await interaction.client.guilds.fetch(FABIO_GUILD_ID);
    await guild.members.fetch(); // charge le cache complet

    // ── Membres serveur ──────────────────────────────────────────────────────
    const totalMembers = guild.memberCount;
    const countRole = (roleId: string) =>
      guild.members.cache.filter((m) => m.roles.cache.has(roleId)).size;

    const nbStream = countRole(FABIO_ROLE_NOTIF_STREAM);
    const nbInsta  = countRole(FABIO_ROLE_NOTIF_INSTA);
    const nbYT     = countRole(FABIO_ROLE_NOTIF_YT);
    const nbTW     = countRole(FABIO_ROLE_NOTIF_TW);

    // ── Tickets ──────────────────────────────────────────────────────────────
    const ticketStats = await pool.query(`
      SELECT
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE status = 'approved')    AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')    AS rejected,
        COUNT(*) FILTER (WHERE status = 'pending')     AS pending,
        COALESCE(SUM(deposit_amount)  FILTER (WHERE status = 'approved'), 0) AS total_deposited,
        COALESCE(SUM(reimburse_amount) FILTER (WHERE status = 'approved'), 0) AS total_reimbursed
      FROM discord_casino_tickets
      WHERE guild_id = $1
    `, [FABIO_GUILD_ID]);
    const ts = ticketStats.rows[0];

    // ── Par casino ───────────────────────────────────────────────────────────
    const byCasino = await pool.query(`
      SELECT casino,
        COUNT(*)                                     AS total,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
        COALESCE(SUM(deposit_amount) FILTER (WHERE status = 'approved'), 0) AS deposited
      FROM discord_casino_tickets
      WHERE guild_id = $1
      GROUP BY casino
      ORDER BY approved DESC
    `, [FABIO_GUILD_ID]);

    const casinoLines = byCasino.rows.map((r) =>
      `▸ **${r.casino}** — ${r.approved} validés · ${r.rejected} refusés · ${r.pending} en attente · ${r.deposited}€ déposés`
    ).join("\n") || "_Aucun ticket pour l'instant._";

    // ── Boutons liste par casino ─────────────────────────────────────────────
    const casinoButtons = byCasino.rows.slice(0, 5).map((r) => ({
      type: 2, style: 2,
      custom_id: `${CID_STATS_LIST}${r.casino}`,
      label: `📋 Liste ${r.casino}`,
    }));

    const components = casinoButtons.length ? [{
      type: 1,
      components: casinoButtons,
    }] : [];

    await interaction.editReply({
      embeds: [{
        title: "📊 Statistiques — Fabiozsis",
        color: 0x2F3136,
        fields: [
          {
            name: "👥 Serveur",
            value:
              `Total membres : **${totalMembers}**\n` +
              `🔴 Stream : **${nbStream}** · 📸 Insta : **${nbInsta}** · ▶️ YT : **${nbYT}** · 🐦 Twitter : **${nbTW}**`,
            inline: false,
          },
          {
            name: "🎫 Tickets",
            value:
              `Total : **${ts.total}** — ` +
              `✅ Validés : **${ts.approved}** · ❌ Refusés : **${ts.rejected}** · ⏳ En attente : **${ts.pending}**`,
            inline: false,
          },
          {
            name: "💰 Montants",
            value:
              `Total déposé (validés) : **${ts.total_deposited}€**\n` +
              `Total remboursé : **${ts.total_reimbursed}€**`,
            inline: false,
          },
          {
            name: "🎰 Par casino",
            value: casinoLines,
            inline: false,
          },
        ],
        footer: { text: `Données en temps réel · ${new Date().toLocaleString("fr-FR")}` },
        timestamp: new Date().toISOString(),
      }],
      components,
    });
  } catch (e: any) {
    ctx.log(`[stats_fabio] handleStatsCommand error: ${e?.message}`);
    await interaction.editReply({ content: "❌ Erreur lors du chargement des stats." });
  }
}

// ─── Handler bouton liste déposants par casino ────────────────────────────────
export async function handleStatsList(interaction: any, casino: string, ctx: BotCtx) {
  const member = interaction.member as GuildMember;
  const isMod = member.roles.cache.has(FABIO_ROLE_MOD_ID) || member.roles.cache.has(FABIO_ROLE_CHEF_ID);
  if (!isMod) { await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." }); return; }

  await interaction.deferReply({ ephemeral: true });

  try {
    const rows = await pool.query(`
      SELECT discord_username, casino_email, casino_pseudo,
             deposit_amount, reimburse_amount, status, decided_at
      FROM discord_casino_tickets
      WHERE guild_id = $1 AND casino = $2 AND status = 'approved'
      ORDER BY decided_at DESC
      LIMIT 25
    `, [FABIO_GUILD_ID, casino]);

    if (!rows.rows.length) {
      await interaction.editReply({ content: `_Aucun ticket validé pour **${casino}**._` });
      return;
    }

    const lines = rows.rows.map((r, i) =>
      `**${i + 1}.** ${r.discord_username} — \`${r.casino_email}\` — ` +
      `dépôt **${r.deposit_amount}€** → remboursé **${r.reimburse_amount ?? "?"}€** ` +
      `_(${r.decided_at ? new Date(r.decided_at).toLocaleDateString("fr-FR") : "—"})_`
    );

    await interaction.editReply({
      embeds: [{
        title: `📋 Déposants validés — ${casino}`,
        description: lines.join("\n").slice(0, 4096),
        color: 0x57F287,
        footer: { text: `25 derniers · ${new Date().toLocaleString("fr-FR")}` },
      }],
    });
  } catch (e: any) {
    ctx.log(`[stats_fabio] handleStatsList error: ${e?.message}`);
    await interaction.editReply({ content: "❌ Erreur." });
  }
}
