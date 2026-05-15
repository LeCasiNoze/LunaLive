// Tickets : ouverture (bouton), fermeture (bouton staff), close auto si membre part / perd le rôle Streamer.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type Interaction,
  OverwriteType,
  PermissionFlagsBits,
  type OverwriteResolvable,
  TextChannel,
} from "discord.js";
import * as cfg from "./config.js";
import { all, kvGetInt, one, query } from "./db.js";

const log = (...a: unknown[]) => console.log("[aurix.tickets]", ...a);

export async function handleOpenTicketButton(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }

  // Existing open ticket ?
  const existing = await one<{ channel_id: string }>(
    "SELECT channel_id FROM aurix_tickets WHERE user_id=$1 AND status='open' LIMIT 1",
    [member.id]
  );
  if (existing) {
    const ch = guild.channels.cache.get(existing.channel_id);
    if (ch) {
      await interaction.reply({
        content: `${cfg.EMOJI.info} Tu as déjà un ticket ouvert : ${ch.toString()}`,
        ephemeral: true,
      });
      return;
    }
    await query("DELETE FROM aurix_tickets WHERE channel_id=$1", [existing.channel_id]);
  }

  const catId = await kvGetInt("category_tickets_open_id");
  if (!catId) {
    await interaction.reply({
      content: "Setup serveur incomplet. Demande à un admin de lancer `/setup-server`.",
      ephemeral: true,
    });
    return;
  }

  const category = guild.channels.cache.get(String(catId));
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.reply({ content: "Catégorie tickets introuvable.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const roleDirectionId = String((await kvGetInt("role_direction_id")) ?? 0);
  const roleModerateurId = String((await kvGetInt("role_moderateur_id")) ?? 0);
  const me = guild.members.me!;

  const safe = member.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 25) || "streamer";
  const channelName = `💎-${safe}`;

  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];
  if (roleDirectionId !== "0") {
    overwrites.push({
      id: roleDirectionId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }
  if (roleModerateurId !== "0") {
    overwrites.push({
      id: roleModerateurId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Ticket privé de ${member.user.tag} (ID: ${member.id})`,
    permissionOverwrites: overwrites,
    reason: `Ticket ouvert par ${member.user.tag}`,
  });

  await query(
    "INSERT INTO aurix_tickets(channel_id,user_id,status) VALUES($1,$2,'open')",
    [channel.id, member.id]
  );

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.diamond}  Bienvenue ${member.displayName}`)
    .setDescription(
      [
        `Ce salon est ton **espace privé** chez **${cfg.BRAND.NAME}**.`,
        `Il restera ouvert tant que tu fais partie de l'agence.`,
        "",
        "**Commandes disponibles ici :**",
        "• `/compte` — renseigner / modifier tes infos (Telegram, email, pseudo joueur)",
        `• \`/refill\` — demander un refill de **${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}** sur ton compte casino`,
        "• `/refill-cancel` — annuler ta demande de refill en cours (avant cutoff)",
        "",
        `La direction te répondra dès que possible. ${cfg.EMOJI.fire}`,
      ].join("\n")
    )
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • Ticket #${channel.id}` });

  const closeBtn = new ButtonBuilder()
    .setCustomId("aurix:ticket:close")
    .setLabel("Fermer le ticket")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🔒");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn);

  const mentionParts = [`<@${member.id}>`];
  if (roleDirectionId !== "0") mentionParts.push(`<@&${roleDirectionId}>`);

  await channel.send({
    content: mentionParts.join(" "),
    embeds: [embed],
    components: [row],
    allowedMentions: { users: [member.id], roles: roleDirectionId !== "0" ? [roleDirectionId] : [] },
  });

  await interaction.editReply({
    content: `${cfg.EMOJI.check} Ticket ouvert : ${channel.toString()}`,
  });

  await logEvent(guild, `🎫 Ticket ouvert par <@${member.id}> → ${channel.toString()}`);
}

export async function handleCloseTicketButton(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  const channel = interaction.channel;
  if (!guild || !member || !channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }

  const roleDirectionId = String((await kvGetInt("role_direction_id")) ?? 0);
  const roleModerateurId = String((await kvGetInt("role_moderateur_id")) ?? 0);
  const staff =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.has(roleDirectionId) ||
    member.roles.cache.has(roleModerateurId);
  if (!staff) {
    await interaction.reply({ content: "Seul le staff peut fermer un ticket.", ephemeral: true });
    return;
  }

  const row = await one<{ user_id: string }>(
    "SELECT user_id FROM aurix_tickets WHERE channel_id=$1",
    [channel.id]
  );
  if (!row) {
    await interaction.reply({ content: "Ce salon n'est pas un ticket suivi.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `${cfg.EMOJI.lock} Ticket fermé par <@${member.id}>. Le salon sera supprimé dans 5 secondes.`,
  });

  await query("UPDATE aurix_tickets SET status='closed' WHERE channel_id=$1", [channel.id]);
  await logEvent(guild, `🔒 Ticket ${(channel as TextChannel).name} fermé par <@${member.id}>`);

  setTimeout(async () => {
    try {
      await (channel as TextChannel).delete(`Ticket fermé par ${member.user.tag}`);
    } catch {
      /* ignore */
    }
  }, 5000);
}

export async function onMemberRemove(member: GuildMember): Promise<void> {
  const row = await one<{ channel_id: string }>(
    "SELECT channel_id FROM aurix_tickets WHERE user_id=$1 AND status='open'",
    [member.id]
  );
  if (!row) return;
  const ch = member.guild.channels.cache.get(row.channel_id);
  if (ch && ch.type === ChannelType.GuildText) {
    try {
      await ch.send(`${cfg.EMOJI.cross} ${member.user.tag} a quitté le serveur. Ticket auto-archivé.`);
      await ch.delete("Membre parti");
    } catch {
      /* ignore */
    }
  }
  await query("UPDATE aurix_tickets SET status='closed' WHERE channel_id=$1", [row.channel_id]);
  await logEvent(member.guild, `🚪 ${member.user.tag} a quitté → ticket auto-fermé.`);
}

export async function onMemberUpdate(before: GuildMember, after: GuildMember): Promise<void> {
  const streamerRoleId = String((await kvGetInt("role_streamer_id")) ?? 0);
  if (streamerRoleId === "0") return;
  const had = before.roles.cache.has(streamerRoleId);
  const has = after.roles.cache.has(streamerRoleId);
  if (had && !has) {
    const row = await one<{ channel_id: string }>(
      "SELECT channel_id FROM aurix_tickets WHERE user_id=$1 AND status='open'",
      [after.id]
    );
    if (!row) return;
    const ch = after.guild.channels.cache.get(row.channel_id);
    if (ch && ch.type === ChannelType.GuildText) {
      try {
        await ch.send(`${cfg.EMOJI.cross} Rôle Streamer retiré. Ticket archivé.`);
        await ch.delete("Streamer retiré de l'agence");
      } catch {
        /* ignore */
      }
    }
    await query("UPDATE aurix_tickets SET status='closed' WHERE channel_id=$1", [row.channel_id]);
    await logEvent(after.guild, `💔 ${after.user.tag} n'est plus Streamer → ticket fermé.`);
  }
}

export async function logEvent(guild: Guild, message: string): Promise<void> {
  const chId = await kvGetInt("channel_logs_id");
  if (!chId) return;
  const ch = guild.channels.cache.get(String(chId));
  if (ch && ch.type === ChannelType.GuildText) {
    try {
      await (ch as TextChannel).send({
        content: message,
        allowedMentions: { parse: [] },
      });
    } catch {
      /* ignore */
    }
  }
}
