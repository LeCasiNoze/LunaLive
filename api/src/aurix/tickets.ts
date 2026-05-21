// Tickets : ouverture (bouton), fermeture (bouton staff), close auto si membre part / perd le rôle Streamer.
import {
  ActionRowBuilder,
  ButtonInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type OverwriteResolvable,
  PermissionsBitField,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import * as cfg from "./config.js";
import { all, kvGet, one, query } from "./db.js";

// ─── Tickets liés (binomes) ───
// Un user peut soit etre proprietaire de son ticket, soit etre partner
// d'un autre ticket (binome qui partage le ticket + le refill).

/** Retourne owner + tous les partners pour un ticket donne. */
export async function getLinkedUserIds(channelId: string): Promise<string[]> {
  const owner = await one<{ user_id: string }>(
    "SELECT user_id FROM aurix_tickets WHERE channel_id=$1 AND status='open'",
    [channelId]
  );
  if (!owner) return [];
  const partners = await all<{ partner_user_id: string }>(
    "SELECT partner_user_id FROM aurix_ticket_partners WHERE ticket_channel_id=$1",
    [channelId]
  );
  return [owner.user_id, ...partners.map((p) => p.partner_user_id)];
}

/** Cherche le channel_id du ticket ou ce user est owner ou partner. */
export async function findUserTicketChannel(userId: string): Promise<string | null> {
  const owned = await one<{ channel_id: string }>(
    "SELECT channel_id FROM aurix_tickets WHERE user_id=$1 AND status='open' LIMIT 1",
    [userId]
  );
  if (owned) return owned.channel_id;
  const partner = await one<{ ticket_channel_id: string }>(
    `SELECT p.ticket_channel_id FROM aurix_ticket_partners p
       JOIN aurix_tickets t ON t.channel_id=p.ticket_channel_id
      WHERE p.partner_user_id=$1 AND t.status='open' LIMIT 1`,
    [userId]
  );
  return partner ? partner.ticket_channel_id : null;
}

type TicketType = "deal" | "apply";

async function createTicketChannel(
  guild: Guild,
  member: GuildMember,
  type: TicketType
): Promise<TextChannel | null> {
  const catId = await kvGet("category_tickets_open_id");
  if (!catId) return null;
  const category = guild.channels.cache.get(catId);
  if (!category || category.type !== ChannelType.GuildCategory) return null;

  const roleDirectionId = (await kvGet("role_direction_id")) ?? "0";
  const roleModerateurId = (await kvGet("role_moderateur_id")) ?? "0";
  const me = guild.members.me!;

  const display = member.displayName || member.user.username;
  const safe =
    display
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "streamer";
  const prefix = type === "apply" ? "📝" : "💎";
  const channelName = `${prefix}-${safe}`;

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

  const topicPrefix = type === "apply" ? "Candidature de" : "Ticket privé de";
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `${topicPrefix} ${member.user.tag} (ID: ${member.id})`,
    permissionOverwrites: overwrites,
    reason: `Ticket ${type} ouvert par ${member.user.tag}`,
  });

  return channel;
}

async function ensureNoOpenTicket(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  guild: Guild,
  member: GuildMember
): Promise<boolean> {
  // Owner ou partner d'un ticket existant ?
  const existingChannelId = await findUserTicketChannel(member.id);
  if (existingChannelId) {
    const ch = guild.channels.cache.get(existingChannelId);
    if (ch) {
      await interaction.reply({
        content: `${cfg.EMOJI.info} Tu as déjà un ticket ouvert (ou tu y es rattaché en binôme) : ${ch.toString()}`,
        ephemeral: true,
      });
      return false;
    }
    // Salon supprimé manuellement — nettoie la DB.
    await query("DELETE FROM aurix_tickets WHERE channel_id=$1", [existingChannelId]);
    await query("DELETE FROM aurix_ticket_partners WHERE ticket_channel_id=$1", [existingChannelId]);
  }
  return true;
}

export async function handleOpenTicketDealButton(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }
  if (!(await ensureNoOpenTicket(interaction, guild, member))) return;

  await interaction.deferReply({ ephemeral: true });

  const channel = await createTicketChannel(guild, member, "deal");
  if (!channel) {
    await interaction.editReply({
      content: "Setup serveur incomplet ou catégorie tickets introuvable. Demande à un admin de lancer `/setup-server`.",
    });
    return;
  }

  await query(
    "INSERT INTO aurix_tickets(channel_id,user_id,status,type) VALUES($1,$2,'open','deal')",
    [channel.id, member.id]
  );

  const roleDirectionId = (await kvGet("role_direction_id")) ?? "0";

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

  const mentionParts = [`<@${member.id}>`];
  if (roleDirectionId !== "0") mentionParts.push(`<@&${roleDirectionId}>`);

  await channel.send({
    content: mentionParts.join(" "),
    embeds: [embed],
    allowedMentions: { users: [member.id], roles: roleDirectionId !== "0" ? [roleDirectionId] : [] },
  });

  await interaction.editReply({
    content: `${cfg.EMOJI.check} Ticket ouvert : ${channel.toString()}`,
  });

  await logEvent(guild, `${cfg.EMOJI.ticket} Ticket deal ouvert par <@${member.id}> → ${channel.toString()}`);
}

export async function handleOpenTicketApplyButton(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }
  if (!(await ensureNoOpenTicket(interaction, guild, member))) return;

  const modal = new ModalBuilder()
    .setCustomId("aurix:ticket:apply:modal")
    .setTitle("Candidature Aurix");

  const emailInput = new TextInputBuilder()
    .setCustomId("email")
    .setLabel("Adresse email")
    .setPlaceholder("exemple@mail.com")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(120);
  const telegramInput = new TextInputBuilder()
    .setCustomId("telegram")
    .setLabel("Pseudo Telegram (@pseudo)")
    .setPlaceholder("@MonPseudo")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);
  const depositInput = new TextInputBuilder()
    .setCustomId("total_deposit")
    .setLabel("Total déposé à ce jour (€)")
    .setPlaceholder("Ex : 12 500 €")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(telegramInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(depositInput)
  );

  await interaction.showModal(modal);
}

export async function handleApplyTicketModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }
  if (!(await ensureNoOpenTicket(interaction, guild, member))) return;

  const email = interaction.fields.getTextInputValue("email").trim();
  const telegram = interaction.fields.getTextInputValue("telegram").trim();
  const totalDeposit = interaction.fields.getTextInputValue("total_deposit").trim();

  await interaction.deferReply({ ephemeral: true });

  const channel = await createTicketChannel(guild, member, "apply");
  if (!channel) {
    await interaction.editReply({
      content: "Setup serveur incomplet ou catégorie tickets introuvable. Demande à un admin de lancer `/setup-server`.",
    });
    return;
  }

  await query(
    `INSERT INTO aurix_tickets(channel_id,user_id,status,type,apply_email,apply_telegram,apply_total_deposit)
     VALUES($1,$2,'open','apply',$3,$4,$5)`,
    [channel.id, member.id, email, telegram, totalDeposit]
  );

  const roleDirectionId = (await kvGet("role_direction_id")) ?? "0";

  const embed = new EmbedBuilder()
    .setTitle(`📝  Candidature de ${member.displayName}`)
    .setDescription(
      [
        `Salut <@${member.id}> — merci pour ta candidature chez **${cfg.BRAND.NAME}** ${cfg.EMOJI.diamond}`,
        "",
        "**Infos fournies :**",
        `• ✉️ Email : \`${email}\``,
        `• 💬 Telegram : \`${telegram}\``,
        `• 💰 Total déposé : \`${totalDeposit}\``,
        "",
        "**Dernière étape — pour valider ta candidature** :",
        "📹 Envoie ici **une vidéo de ton dashboard casino** prouvant tes dépôts et stats.",
        "Sans cette vidéo, la candidature ne peut pas être traitée.",
        "",
        "La direction te répondra dès la vidéo reçue.",
      ].join("\n")
    )
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • Candidature #${channel.id}` });

  const mentionParts = [`<@${member.id}>`];
  if (roleDirectionId !== "0") mentionParts.push(`<@&${roleDirectionId}>`);

  await channel.send({
    content: mentionParts.join(" "),
    embeds: [embed],
    allowedMentions: { users: [member.id], roles: roleDirectionId !== "0" ? [roleDirectionId] : [] },
  });

  await interaction.editReply({
    content: `${cfg.EMOJI.check} Candidature envoyée : ${channel.toString()}`,
  });

  await logEvent(
    guild,
    `📝 Candidature ouverte par <@${member.id}> → ${channel.toString()} (email \`${email}\`, telegram \`${telegram}\`, total \`${totalDeposit}\`)`
  );
}

export async function handleMemberJoin(member: GuildMember): Promise<void> {
  try {
    const chId = await kvGet("channel_bienvenue_id");
    if (!chId) return;
    const ch = member.guild.channels.cache.get(chId);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    const openTicketId = await kvGet("channel_open_ticket_id");
    const aLireId = await kvGet("channel_a_lire_id");
    const reglementId = await kvGet("channel_reglement_id");
    const openTicketMention = openTicketId ? `<#${openTicketId}>` : "**✅-ouvrir-un-ticket**";
    const aLireMention = aLireId ? `<#${aLireId}>` : "**📖-à-lire**";
    const reglementMention = reglementId ? `<#${reglementId}>` : "**📌-règlement**";

    const embed = new EmbedBuilder()
      .setTitle(`👋  Bienvenue ${member.user.username} chez ${cfg.BRAND.NAME}`)
      .setDescription(
        [
          `Salut <@${member.id}>, content de te voir ici ${cfg.EMOJI.diamond}`,
          "",
          `1️⃣  Lis ${aLireMention} pour comprendre comment ça marche.`,
          `2️⃣  Lis ${reglementMention} (c'est court).`,
          `3️⃣  Ouvre ton ticket dans ${openTicketMention} :`,
          "      • **💎 J'ai déjà un deal** — on crée directement ta room privée.",
          "      • **📝 Je veux postuler** — formulaire rapide + vidéo dashboard.",
          "",
          "À tout de suite 👇",
        ].join("\n")
      )
      .setColor(cfg.COLOR.PRIMARY)
      .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

    await (ch as TextChannel).send({
      content: `<@${member.id}>`,
      embeds: [embed],
      allowedMentions: { users: [member.id] },
    });
  } catch (e) {
    console.error("[aurix.tickets] welcome failed:", e);
  }
}

async function closeTicketCore(
  interaction: ButtonInteraction | ChatInputCommandInteraction
): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  const channel = interaction.channel;
  if (!guild || !member || !channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }

  const roleDirectionId = (await kvGet("role_direction_id")) ?? "0";
  const roleModerateurId = (await kvGet("role_moderateur_id")) ?? "0";
  const staff =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.has(roleDirectionId) ||
    member.roles.cache.has(roleModerateurId);
  if (!staff) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Seul un **admin** peut fermer un ticket.`,
      ephemeral: true,
    });
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

// Legacy : ancien bouton "Fermer le ticket" sur les tickets posés avant le deploy.
// Refuse les non-staff comme avant.
export async function handleCloseTicketButton(interaction: ButtonInteraction): Promise<void> {
  await closeTicketCore(interaction);
}

// Nouveau : slash command admin/staff only — seule façon de fermer un ticket désormais.
export async function handleCloseTicketCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await closeTicketCore(interaction);
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
  const streamerRoleId = (await kvGet("role_streamer_id")) ?? "0";
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
  const chId = await kvGet("channel_logs_id");
  if (!chId) return;
  const ch = guild.channels.cache.get(chId);
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

// ─────────── /link-partner (admin) — rattache un binome au ticket courant ───────────
export async function handleLinkPartnerCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }

  const ticket = await one<{ user_id: string }>(
    "SELECT user_id FROM aurix_tickets WHERE channel_id=$1 AND status='open'",
    [channel.id]
  );
  if (!ticket) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Cette commande s'utilise dans un **ticket Aurix ouvert**.`,
      ephemeral: true,
    });
    return;
  }

  const partnerUser = interaction.options.getUser("user", true);
  if (partnerUser.id === ticket.user_id) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Le propriétaire ne peut pas être son propre binôme.`,
      ephemeral: true,
    });
    return;
  }

  // Verifie que le partner n'est pas deja rattache a un autre ticket.
  const existingForPartner = await findUserTicketChannel(partnerUser.id);
  if (existingForPartner && existingForPartner !== channel.id) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} <@${partnerUser.id}> est déjà rattaché à un autre ticket : <#${existingForPartner}>. Ferme-le d'abord (\`/close-ticket\` dedans).`,
      ephemeral: true,
    });
    return;
  }

  await query(
    "INSERT INTO aurix_ticket_partners(ticket_channel_id, partner_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [channel.id, partnerUser.id]
  );

  // Ajoute l'overwrite permission pour le partner sur ce salon.
  try {
    await (channel as TextChannel).permissionOverwrites.create(
      partnerUser.id,
      new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ]).toJSON() as any,
      { reason: `Aurix: binome lie par ${interaction.user.tag}` }
    );
  } catch (e) {
    console.error("[aurix.tickets] link-partner perms failed:", e);
  }

  await interaction.reply({
    content: `${cfg.EMOJI.check} <@${partnerUser.id}> est désormais **rattaché à ce ticket en binôme**.\n• Il peut écrire ici et utiliser \`/refill\`.\n• Une seule demande \`/refill\` par jour pour le binôme (ils partagent l'email).`,
    allowedMentions: { users: [] },
  });

  await logEvent(
    guild,
    `🔗 <@${partnerUser.id}> rattaché en binôme à ${(channel as TextChannel).toString()} par <@${interaction.user.id}>`
  );
}
