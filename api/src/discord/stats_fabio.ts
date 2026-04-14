// api/src/discord/stats_fabio.ts
// Salon stats — message épinglé auto-mis-à-jour (pas de slash command)

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
  FABIO_STATS_CHANNEL_ID,
} from "./constants.js";

export const CID_STATS_LIST = "fabio:stats:list:"; // + casino slug

let statsChannelId: string | null = null;
let statsMsgId: string | null = null;

// ─── Setup ────────────────────────────────────────────────────────────────────
export async function ensureStatsChannel(client: Client, ctx: BotCtx) {
  const guild = await client.guilds.fetch(FABIO_GUILD_ID).catch(() => null);
  if (!guild) return;

  // Utiliser l'ID constant si on le connaît déjà
  let ch: TextChannel | null = null;

  if (FABIO_STATS_CHANNEL_ID) {
    ch = await client.channels.fetch(FABIO_STATS_CHANNEL_ID).catch(() => null) as TextChannel | null;
  }

  if (!ch) {
    const channels = await guild.channels.fetch().catch(() => null);
    const found = channels?.find(
      (c) => c?.parentId === FABIO_CAT_MODO_ID && c?.name?.includes("stats")
    );
    if (found) {
      ch = await client.channels.fetch(found.id).catch(() => null) as TextChannel | null;
    }
  }

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

  if (!ch) return;
  statsChannelId = ch.id;
  ctx.log(`[stats_fabio] stats channel ready: ${ch.id}`);

  // Renommer le salon notifs si besoin
  try {
    const notifCh = await client.channels.fetch(FABIO_NOTIF_CHANNEL_ID).catch(() => null) as TextChannel | null;
    if (notifCh && !notifCh.name.includes("notif")) {
      await notifCh.setName("〈🔔〉｜notifs").catch(() => {});
    }
  } catch { /* ignore */ }

  // Trouver ou créer le message stats épinglé
  try {
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    const existing = msgs?.find(
      (m) => m.author.id === client.user?.id && m.embeds[0]?.title?.includes("Statistiques")
    );
    if (existing) {
      statsMsgId = existing.id;
    } else {
      const sent = await ch.send({
        embeds: [buildLoadingEmbed()],
        components: [],
      });
      statsMsgId = sent.id;
      await sent.pin().catch(() => {});
    }
  } catch (e: any) {
    ctx.log(`[stats_fabio] message setup error: ${e?.message}`);
  }

  // Premier refresh
  await refreshStatsMessage(client, ctx);
}

function buildLoadingEmbed() {
  return {
    title: "📊 Statistiques — Fabiozsis",
    description: "_Chargement en cours..._",
    color: 0x2F3136,
  };
}

// ─── Refresh du message stats ─────────────────────────────────────────────────
export async function refreshStatsMessage(client: Client, ctx: BotCtx) {
  if (!statsChannelId || !statsMsgId) return;

  try {
    const guild = await client.guilds.fetch(FABIO_GUILD_ID).catch(() => null);
    if (!guild) return;

    await guild.members.fetch().catch(() => {}); // charge le cache

    // ── Membres serveur ──────────────────────────────────────────────────────
    const totalMembers = guild.memberCount;
    const countRole = (roleId: string) =>
      guild.members.cache.filter((m: any) => m.roles.cache.has(roleId)).size;

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
        COUNT(*) FILTER (WHERE status = 'pending'
          AND state NOT IN ('closed','refused','appeal_pending'))  AS pending,
        COALESCE(SUM(deposit_amount)   FILTER (WHERE status = 'approved'), 0) AS total_deposited,
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
        COUNT(*) FILTER (WHERE status = 'pending'
          AND state NOT IN ('closed','refused','appeal_pending')) AS pending,
        COALESCE(SUM(deposit_amount)   FILTER (WHERE status = 'approved'), 0) AS deposited,
        COALESCE(SUM(reimburse_amount) FILTER (WHERE status = 'approved'), 0) AS reimbursed
      FROM discord_casino_tickets
      WHERE guild_id = $1
      GROUP BY casino
      ORDER BY total DESC
    `, [FABIO_GUILD_ID]);

    const casinoLines = byCasino.rows.map((r) =>
      `▸ **${r.casino}** — ✅ ${r.approved} · ❌ ${r.rejected} · ⏳ ${r.pending} en attente — déposé **${r.deposited}€** · remboursé **${r.reimbursed}€**`
    ).join("\n") || "_Aucun ticket pour l'instant._";

    // ── Giveaways actifs ─────────────────────────────────────────────────────
    const giveawayStats = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE state = 'active') AS active,
             COUNT(*) FILTER (WHERE state = 'ended')  AS ended
      FROM discord_giveaways WHERE guild_id = $1
    `, [FABIO_GUILD_ID]);
    const gs = giveawayStats.rows[0];

    // ── Boutons par casino ───────────────────────────────────────────────────
    const casinoButtons = byCasino.rows.slice(0, 5).map((r) => ({
      type: 2, style: 2,
      custom_id: `${CID_STATS_LIST}${r.casino}`,
      label: `📋 ${r.casino}`,
    }));
    const components = casinoButtons.length ? [{ type: 1, components: casinoButtons }] : [];

    const embed = {
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
            `Déposé (validés) : **${ts.total_deposited}€** · Remboursé : **${ts.total_reimbursed}€**`,
          inline: false,
        },
        {
          name: "🎰 Par casino",
          value: casinoLines,
          inline: false,
        },
        {
          name: "🎉 Giveaways",
          value: `En cours : **${gs.active}** · Terminés : **${gs.ended}**`,
          inline: false,
        },
      ],
      footer: { text: `Mis à jour` },
      timestamp: new Date().toISOString(),
    };

    const ch = await client.channels.fetch(statsChannelId).catch(() => null) as TextChannel | null;
    if (!ch) return;

    const msg = await ch.messages.fetch(statsMsgId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components } as any);
    } else {
      const sent = await ch.send({ embeds: [embed], components } as any);
      statsMsgId = sent.id;
      await sent.pin().catch(() => {});
    }
  } catch (e: any) {
    ctx.log(`[stats_fabio] refreshStatsMessage error: ${e?.message}`);
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
