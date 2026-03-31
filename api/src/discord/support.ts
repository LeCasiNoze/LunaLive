// api/src/discord/support.ts
// Module support V1 — tickets privés + assistant local (zéro LLM, zéro dépendance externe).

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel,
} from "discord.js";

import { pool } from "../db.js";
import { slugify } from "../slug.js";
import { findBestMatch } from "./support_search.js";
import { hasAnyRole } from "./sync.js";
import { type BotCtx } from "./utils.js";
import {
  CID_SUPPORT_CLOSE,
  CID_SUPPORT_ESCALATE,
  CID_SUPPORT_OPEN,
  STAFF_DECISIONS_CHANNEL_ID,
  STAFF_ROLE_IDS,
  STAFF_TICKETS_CATEGORY_ID,
  SUPPORT_CHANNEL_ID,
} from "./constants.js";

// ─────────────────────────────────────────────────────────────
// Limites Discord (safe caps)
// ─────────────────────────────────────────────────────────────
const LIMITS = {
  channelName: 95,
  channelTopic: 1024,
  embedTitle: 256,
  embedDesc: 4096,
  buttonLabel: 80,
  customId: 100,
};

function clamp(v: any, max: number) {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

function supportChannelName(username: string, discordId: string) {
  const base = slugify(username || "user").slice(0, 16) || "user";
  const suf = String(discordId || "").slice(-4);
  return clamp(`ticket-support-${base}-${suf}`, LIMITS.channelName);
}

// ─────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────

export async function getOpenTicketForUser(discordUserId: string) {
  const r = await pool.query(
    `SELECT id, channel_id FROM support_tickets
     WHERE discord_user_id = $1 AND status = 'open'
     ORDER BY created_at DESC LIMIT 1`,
    [discordUserId]
  );
  return r.rows[0] ?? null;
}

export async function getTicketByChannel(channelId: string) {
  const r = await pool.query(
    `SELECT id, discord_user_id, lunalive_user_id, status
     FROM support_tickets
     WHERE channel_id = $1 AND status IN ('open', 'escalated')
     LIMIT 1`,
    [channelId]
  );
  return r.rows[0] ?? null;
}

async function insertTicket(discordUserId: string, channelId: string) {
  // Récupère le compte LunaLive lié si disponible
  const link = await pool.query(
    `SELECT user_id FROM discord_links WHERE discord_user_id = $1 LIMIT 1`,
    [discordUserId]
  );
  const lunaUserId = link.rows[0]?.user_id ? Number(link.rows[0].user_id) : null;

  const r = await pool.query(
    `INSERT INTO support_tickets (discord_user_id, lunalive_user_id, channel_id, status)
     VALUES ($1, $2, $3, 'open')
     RETURNING id`,
    [discordUserId, lunaUserId, channelId]
  );
  return r.rows[0].id as number;
}

async function logMessage(ticketId: number, senderType: "user" | "bot" | "staff", content: string) {
  await pool.query(
    `INSERT INTO support_messages (ticket_id, sender_type, content)
     VALUES ($1, $2, $3)`,
    [ticketId, senderType, content.slice(0, 4000)]
  );
}

async function closeTicketDb(ticketId: number) {
  await pool.query(
    `UPDATE support_tickets SET status = 'closed', closed_at = NOW() WHERE id = $1`,
    [ticketId]
  );
}

async function escalateTicketDb(ticketId: number) {
  await pool.query(
    `UPDATE support_tickets SET status = 'escalated' WHERE id = $1`,
    [ticketId]
  );
}

// ─────────────────────────────────────────────────────────────
// Composants Discord réutilisables
// ─────────────────────────────────────────────────────────────

function buildSupportActionRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(clamp(CID_SUPPORT_CLOSE, LIMITS.customId))
      .setLabel(clamp("✅ C'est résolu", LIMITS.buttonLabel))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(clamp(CID_SUPPORT_ESCALATE, LIMITS.customId))
      .setLabel(clamp("👤 Parler à un humain", LIMITS.buttonLabel))
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildEscalateOnlyRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(clamp(CID_SUPPORT_ESCALATE, LIMITS.customId))
      .setLabel(clamp("👤 Contacter le staff", LIMITS.buttonLabel))
      .setStyle(ButtonStyle.Danger)
  );
}

// ─────────────────────────────────────────────────────────────
// Création du salon support privé
// ─────────────────────────────────────────────────────────────

export async function createSupportChannel(guild: Guild, member: GuildMember, ctx: BotCtx) {
  const name = supportChannelName(member.user.username, member.id);

  const overwrites: any[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: guild.client.user!.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  for (const rid of STAFF_ROLE_IDS) {
    overwrites.push({
      id: rid,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const topic = clamp(
    `Support LunaLive | user=${member.user.tag} (${member.id})`,
    LIMITS.channelTopic
  );

  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: STAFF_TICKETS_CATEGORY_ID,
    topic,
    permissionOverwrites: overwrites,
    reason: "Support ticket LunaLive",
  });

  ctx.log(`[support] ticket created channel=${ch.id} user=${member.id}`);
  return ch;
}

// ─────────────────────────────────────────────────────────────
// Poste / met à jour le message bouton dans le salon public
// ─────────────────────────────────────────────────────────────

export async function ensureSupportMessage(guild: Guild, ctx: BotCtx) {
  try {
    if (!SUPPORT_CHANNEL_ID) {
      ctx.log("[support] SUPPORT_CHANNEL_ID not configured — skipping ensureSupportMessage");
      return;
    }

    const ch = await guild.channels.fetch(SUPPORT_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
      ctx.log(`[support] support channel not found or not text: ${SUPPORT_CHANNEL_ID}`);
      return;
    }
    const channel = ch as TextChannel;

    const embed = new EmbedBuilder()
      .setTitle(clamp("🎫 Support LunaLive", LIMITS.embedTitle))
      .setDescription(
        clamp(
          [
            "Besoin d'aide ? Clique sur le bouton ci-dessous pour ouvrir un ticket privé.",
            "",
            "Notre assistant répondra immédiatement à tes questions sur :",
            "• Les **rubis** et comment en gagner",
            "• Les **calls** et comment les rejoindre",
            "• Les **abonnements** streamers",
            "• Le **chat pop-up** pour OBS",
            "• La **liaison DLive** de ta chaîne",
            "",
            "Si l'assistant ne peut pas répondre, le staff prendra le relais.",
            "",
            "⚠️ **1 ticket ouvert maximum par utilisateur.**",
          ].join("\n"),
          LIMITS.embedDesc
        )
      )
      .setFooter({ text: "LunaLive — Support" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(clamp(CID_SUPPORT_OPEN, LIMITS.customId))
        .setLabel(clamp("🎫 Ouvrir un ticket support", LIMITS.buttonLabel))
        .setStyle(ButtonStyle.Primary)
    );

    const msgs = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    const existing = msgs?.find(
      (m) => m.author?.id === guild.client.user?.id && (m.components?.length ?? 0) > 0 &&
        m.embeds?.[0]?.title?.includes("Support LunaLive")
    );

    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] }).catch(() => null);
      ctx.log("[support] support message updated");
    } else {
      await channel.send({ embeds: [embed], components: [row] });
      ctx.log("[support] support message sent");
    }
  } catch (e: any) {
    ctx.log(`[support] ensureSupportMessage failed: ${e?.message || e}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Handler : bouton "Ouvrir un ticket"
// ─────────────────────────────────────────────────────────────

export async function handleSupportOpen(
  interaction: any,
  ctx: BotCtx
) {
  const guild: Guild = interaction.guild;
  const member: GuildMember = interaction.member;

  if (!guild || !member) {
    await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
    return;
  }

  // Vérifier s'il y a déjà un ticket ouvert
  const existing = await getOpenTicketForUser(String(member.id));
  if (existing) {
    await interaction.reply({
      ephemeral: true,
      content: `Tu as déjà un ticket ouvert : <#${existing.channel_id}>\n\nPose ta question directement là-bas.`,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const ch = await createSupportChannel(guild, member, ctx);

    const ticketId = await insertTicket(String(member.id), String(ch.id));

    // Récupérer le contexte utilisateur (lié ou non)
    const link = await pool.query(
      `SELECT user_id, username, role FROM discord_links dl
       JOIN users u ON u.id = dl.user_id
       WHERE dl.discord_user_id = $1 LIMIT 1`,
      [String(member.id)]
    );
    const lunaUser = link.rows[0] ?? null;

    // Personnaliser le message selon le profil utilisateur
    const isStreamer = String(lunaUser?.role ?? "").includes("streamer");
    const contextLine = lunaUser
      ? isStreamer
        ? "Tu es streamer LunaLive — si ta question est liée à ton tableau de bord ou à ta chaîne, précise-le."
        : "Ton compte LunaLive est bien lié à ce Discord."
      : "Si tu n'as pas encore lié ton compte LunaLive, commence par `/link` dans ce serveur.";

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(clamp("👋 Support LunaLive", LIMITS.embedTitle))
      .setDescription(
        clamp(
          [
            `Bonjour <@${member.id}> !`,
            "",
            contextLine,
            "",
            "Pose ta question directement ici — je vais chercher une réponse.",
            "",
            "Je peux t'aider sur :",
            "• **Rubis** — solde, gagner, dépenser, /claim",
            "• **Calls** — rejoindre, conditions, activer",
            "• **Abonnements** — soutenir un streamer, offrir",
            "• **Chat overlay** — OBS, setup",
            "• **DLive** — lier ta chaîne, problèmes de sync",
            "• **Compte** — lier Discord, rôles, inscription",
            "",
            "Si je ne connais pas la réponse, je te mets en contact avec le staff.",
          ].join("\n"),
          LIMITS.embedDesc
        )
      )
      .setFooter({ text: `Ticket #${ticketId} · LunaLive Support` });

    await (ch as TextChannel).send({
      content: `<@${member.id}>`,
      embeds: [welcomeEmbed],
    });

    await logMessage(ticketId, "bot", "Ticket ouvert — message de bienvenue envoyé.");

    await interaction.editReply({
      content: `✅ Ton ticket a été créé : <#${ch.id}>\n\nPose ta question là-bas.`,
    });
  } catch (e: any) {
    ctx.log(`[support] handleSupportOpen failed: ${e?.message || e}`);
    await interaction.editReply("❌ Impossible de créer le ticket. Réessaie plus tard.");
  }
}

// ─────────────────────────────────────────────────────────────
// Handler : message utilisateur dans un salon support
// ─────────────────────────────────────────────────────────────

export async function handleSupportMessage(message: Message, ctx: BotCtx) {
  // Ignorer les messages du bot lui-même
  if (message.author.bot) return;

  // Guard rapide : éviter la query DB sur les salons qui ne sont pas des tickets support
  const channelName = (message.channel as any)?.name ?? "";
  if (!channelName.startsWith("ticket-support-")) return;

  const ticket = await getTicketByChannel(String(message.channelId));
  if (!ticket) return;

  // Ignorer si c'est un message du staff (pas du propriétaire du ticket)
  if (String(message.author.id) !== String(ticket.discord_user_id)) {
    // Le staff peut répondre librement, on ne log que brièvement
    await logMessage(Number(ticket.id), "staff", message.content.slice(0, 4000));
    return;
  }

  // Une fois escaladé, le bot ne répond plus — c'est le staff qui prend la main
  if (ticket.status !== "open") return;

  const userContent = message.content.trim();
  if (!userContent) return;

  await logMessage(Number(ticket.id), "user", userContent);

  try {
    // Recherche dans la base de connaissance
    const result = findBestMatch(userContent);

    if (!result || !result.confident) {
      // Pas de réponse fiable → proposer escalade
      const noMatchEmbed = new EmbedBuilder()
        .setTitle(clamp("🤔 Je n'ai pas trouvé de réponse", LIMITS.embedTitle))
        .setDescription(
          clamp(
            [
              "Je n'ai pas de réponse claire sur ce sujet pour l'instant.",
              "",
              "Tu peux :",
              "• **Reformuler** ta question avec d'autres mots",
              "• **Contacter directement le staff** via le bouton ci-dessous — quelqu'un prendra le relais",
            ].join("\n"),
            LIMITS.embedDesc
          )
        )
        .setFooter({ text: "LunaLive Support" });

      await message.reply({
        embeds: [noMatchEmbed],
        components: [buildEscalateOnlyRow()],
      });

      await logMessage(Number(ticket.id), "bot", "Aucune réponse trouvée — escalade proposée.");
      return;
    }

    // Réponse trouvée
    const entry = result.entry;

    const responseEmbed = new EmbedBuilder()
      .setTitle(clamp(entry.title, LIMITS.embedTitle))
      .setDescription(clamp(entry.answer, LIMITS.embedDesc))
      .setFooter({ text: "LunaLive Support — cette réponse t'a-t-elle aidé ?" });

    if (entry.links && entry.links.length > 0) {
      const linksText = entry.links.map((l) => `[${l.label}](${l.url})`).join(" · ");
      responseEmbed.addFields({ name: "🔗 Liens utiles", value: clamp(linksText, 1024) });
    }

    await message.reply({
      embeds: [responseEmbed],
      components: [buildSupportActionRow()],
    });

    await logMessage(Number(ticket.id), "bot", `Réponse envoyée: ${entry.id} (score=${result.score.toFixed(2)})`);
  } catch (e: any) {
    ctx.log(`[support] handleSupportMessage failed: ${e?.message || e}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Handler : bouton "C'est résolu"
// ─────────────────────────────────────────────────────────────

export async function handleSupportClose(interaction: any, ctx: BotCtx) {
  const ticket = await getTicketByChannel(String(interaction.channelId));

  if (!ticket) {
    await interaction.reply({ ephemeral: true, content: "Ticket introuvable ou déjà fermé." });
    return;
  }

  // Seul le propriétaire du ticket ou le staff peut fermer
  const member: GuildMember = interaction.member;
  const isOwner = String(interaction.user.id) === String(ticket.discord_user_id);
  const isStaff = hasAnyRole(member, STAFF_ROLE_IDS);

  if (!isOwner && !isStaff) {
    await interaction.reply({ ephemeral: true, content: "❌ Tu ne peux pas fermer ce ticket." });
    return;
  }

  await closeTicketDb(Number(ticket.id));
  await logMessage(Number(ticket.id), "bot", `Ticket fermé par ${interaction.user.tag}`);

  const closedEmbed = new EmbedBuilder()
    .setTitle(clamp("✅ Ticket fermé", LIMITS.embedTitle))
    .setDescription(
      clamp(
        [
          "Parfait, ce ticket est maintenant fermé.",
          "",
          "Si tu as une autre question, tu peux ouvrir un nouveau ticket depuis le salon support à tout moment.",
        ].join("\n"),
        LIMITS.embedDesc
      )
    )
    .setFooter({ text: "LunaLive Support" });

  await interaction.reply({ embeds: [closedEmbed] });

  // Rendre le salon en lecture seule après fermeture
  try {
    const ch = interaction.channel;
    if (ch) {
      await ch.permissionOverwrites.edit(ticket.discord_user_id, {
        SendMessages: false,
      });
    }
  } catch (e: any) {
    ctx.log(`[support] close permissions update failed: ${e?.message || e}`);
  }

  ctx.log(`[support] ticket #${ticket.id} closed by ${interaction.user.id}`);
}

// ─────────────────────────────────────────────────────────────
// Handler : bouton "Parler à un humain"
// ─────────────────────────────────────────────────────────────

export async function handleSupportEscalate(
  interaction: any,
  ctx: BotCtx
) {
  const ticket = await getTicketByChannel(String(interaction.channelId));

  if (!ticket) {
    await interaction.reply({ ephemeral: true, content: "Ticket introuvable." });
    return;
  }

  if (ticket.status === "escalated") {
    await interaction.reply({
      ephemeral: true,
      content: "Ce ticket est déjà en attente de réponse du staff.",
    });
    return;
  }

  await escalateTicketDb(Number(ticket.id));
  await logMessage(Number(ticket.id), "bot", `Escalade demandée par ${interaction.user.tag}`);

  // Notifier dans le salon décisions staff
  try {
    const guild = interaction.guild;
    if (guild && STAFF_DECISIONS_CHANNEL_ID) {
      const decisionCh = await guild.channels.fetch(STAFF_DECISIONS_CHANNEL_ID).catch(() => null);
      if (decisionCh && decisionCh.type === ChannelType.GuildText) {
        await (decisionCh as TextChannel).send({
          content:
            `📩 **Support — ticket #${ticket.id}** : <@${ticket.discord_user_id}> demande à parler au staff.\n` +
            `→ <#${ticket.channel_id}>`,
        });
      }
    }
  } catch (e: any) {
    ctx.log(`[support] escalate notification failed: ${e?.message || e}`);
  }

  const escalateEmbed = new EmbedBuilder()
    .setTitle(clamp("👤 Un membre du staff va t'aider", LIMITS.embedTitle))
    .setDescription(
      clamp(
        [
          "Ta demande a été transmise au staff LunaLive.",
          "",
          "Reste disponible dans ce salon — quelqu'un reviendra vers toi dès que possible.",
        ].join("\n"),
        LIMITS.embedDesc
      )
    )
    .setFooter({ text: "LunaLive Support" });

  await interaction.reply({ embeds: [escalateEmbed] });

  ctx.log(`[support] ticket #${ticket.id} escalated by ${interaction.user.id}`);
}

// ─────────────────────────────────────────────────────────────
// Vérifie si le bot staff peut décider (réutilise le même check que apply)
// ─────────────────────────────────────────────────────────────

export function isStaffMember(member: GuildMember) {
  return hasAnyRole(member, STAFF_ROLE_IDS);
}
