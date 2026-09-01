import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type PartialGuildMember,
  type StringSelectMenuInteraction,
  type TextChannel,
} from "discord.js";
import type { Pool } from "pg";
import { startLeCasiNozeLiveAlerts, type LiveAlertConfig } from "./live-alerts.js";

const DEFAULTS = {
  guildId: "1188913226990235800",
  memberRoleId: "1544429206400802896",
  moderatorRoleId: "1188939890344329379",
  adminRoleId: "1188940226358415443",
  startHereChannelId: "1188914815561891990",
  leaveLogChannelId: "1424038747950813234",
  botLogChannelId: "1193268118345240669",
  supportCategoryId: "1544429387754246185",
  ticketOpenerChannelId: "1544429389415063604",
  liveAlertsChannelId: "1188913451062534295",
  liveRoleId: "1188926242519523328",
  streamerSlug: "lecasinoze",
  lunaLiveUrl: "https://lunalive.win/s/lecasinoze",
  rumbleUrl: "https://rumble.com/user/LeCasiNoze/live",
  notificationRoleIds: [
    "1188926242519523328",
    "1188926088852799578",
    "1217875557631393923",
    "1188926393946484783",
  ],
} as const;

const BUTTON_ACCEPT_RULES = "nozebot:rules:accept";
const SELECT_NOTIFICATIONS = "nozebot:notifications";
const SELECT_NEW_TICKET = "nozebot:tickets:new";
const MODAL_OTHER_TICKET = "nozebot:tickets:other";
const INPUT_OTHER_SUBJECT = "nozebot:tickets:other:subject";
const INPUT_OTHER_DETAILS = "nozebot:tickets:other:details";
const BUTTON_CLOSE_TICKET = "nozebot:tickets:close";

const TICKET_LABELS: Record<string, { emoji: string; label: string; description: string }> = {
  affiliation: {
    emoji: "🔎",
    label: "Vérification d’affiliation",
    description: "Vérification d’une inscription ou d’un compte partenaire.",
  },
  support: {
    emoji: "🛟",
    label: "Aide et problème",
    description: "Aide concernant le serveur, NozeBot ou un autre service.",
  },
  partnership: {
    emoji: "🤝",
    label: "Partenariat",
    description: "Proposition professionnelle ou prise de contact.",
  },
  vip_host: {
    emoji: "💎",
    label: "Demande VIP host",
    description: "Demande de mise en relation et d’accompagnement personnalisé.",
  },
  other: {
    emoji: "📝",
    label: "Autre demande",
    description: "Demande libre ne correspondant pas aux autres catégories.",
  },
};

type NozeBotConfig = {
  token: string;
  guildId: string;
  memberRoleId: string;
  moderatorRoleId: string;
  adminRoleId: string;
  startHereChannelId: string;
  leaveLogChannelId: string;
  botLogChannelId: string;
  supportCategoryId: string;
  ticketOpenerChannelId: string;
  notificationRoleIds: readonly string[];
  liveAlerts: LiveAlertConfig;
};

function livePollMs(): number {
  const value = Number(process.env.NOZEBOT_LIVE_POLL_MS || 20_000);
  if (!Number.isFinite(value)) return 20_000;
  return Math.min(300_000, Math.max(10_000, Math.floor(value)));
}

function loadConfig(): NozeBotConfig | null {
  const token = process.env.NOZEBOT_DISCORD_TOKEN?.trim();
  if (!token) return null;

  return {
    token,
    guildId: process.env.NOZEBOT_GUILD_ID?.trim() || DEFAULTS.guildId,
    memberRoleId: process.env.NOZEBOT_MEMBER_ROLE_ID?.trim() || DEFAULTS.memberRoleId,
    moderatorRoleId: process.env.NOZEBOT_MODERATOR_ROLE_ID?.trim() || DEFAULTS.moderatorRoleId,
    adminRoleId: process.env.NOZEBOT_ADMIN_ROLE_ID?.trim() || DEFAULTS.adminRoleId,
    startHereChannelId: process.env.NOZEBOT_START_HERE_CHANNEL_ID?.trim() || DEFAULTS.startHereChannelId,
    leaveLogChannelId: process.env.NOZEBOT_LEAVE_LOG_CHANNEL_ID?.trim() || DEFAULTS.leaveLogChannelId,
    botLogChannelId: process.env.NOZEBOT_BOT_LOG_CHANNEL_ID?.trim() || DEFAULTS.botLogChannelId,
    supportCategoryId: process.env.NOZEBOT_SUPPORT_CATEGORY_ID?.trim() || DEFAULTS.supportCategoryId,
    ticketOpenerChannelId: process.env.NOZEBOT_TICKET_OPENER_CHANNEL_ID?.trim() || DEFAULTS.ticketOpenerChannelId,
    notificationRoleIds: DEFAULTS.notificationRoleIds,
    liveAlerts: {
      guildId: process.env.NOZEBOT_GUILD_ID?.trim() || DEFAULTS.guildId,
      channelId: process.env.NOZEBOT_LIVE_ALERTS_CHANNEL_ID?.trim() || DEFAULTS.liveAlertsChannelId,
      roleId: process.env.NOZEBOT_LIVE_ROLE_ID?.trim() || DEFAULTS.liveRoleId,
      streamerSlug: process.env.NOZEBOT_LIVE_SLUG?.trim() || DEFAULTS.streamerSlug,
      apiBase: process.env.NOZEBOT_LIVE_API_BASE?.trim() || process.env.BOT_API_BASE?.trim() || "https://lunalive-api.onrender.com",
      lunaLiveUrl: process.env.NOZEBOT_LUNALIVE_URL?.trim() || DEFAULTS.lunaLiveUrl,
      rumbleUrl: process.env.NOZEBOT_RUMBLE_URL?.trim() || DEFAULTS.rumbleUrl,
      pollMs: livePollMs(),
    },
  };
}

function discordTimestamp(date: Date | null, style: "F" | "R" = "F"): string {
  if (!date) return "Inconnue";
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function durationSince(date: Date | null): string {
  if (!date) return "Durée inconnue";
  const totalDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (totalDays < 1) return "Moins d’un jour";
  if (totalDays < 30) return `${totalDays} jour${totalDays > 1 ? "s" : ""}`;
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  return `${months} mois${days ? ` et ${days} jour${days > 1 ? "s" : ""}` : ""}`;
}

function hasStaffRole(member: GuildMember, config: NozeBotConfig): boolean {
  return member.roles.cache.has(config.moderatorRoleId) ||
    member.roles.cache.has(config.adminRoleId) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels);
}

async function handleRulesAcceptance(interaction: Interaction, config: NozeBotConfig): Promise<boolean> {
  if (!interaction.isButton() || interaction.customId !== BUTTON_ACCEPT_RULES) return false;
  if (!interaction.guild || interaction.guildId !== config.guildId) return true;

  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(config.memberRoleId)) {
    await member.roles.add(config.memberRoleId, "Règlement LeCasiNoze accepté");
  }
  await interaction.editReply(
    `✅ Règlement accepté. Le serveur est ouvert : passe maintenant dans <#${config.startHereChannelId}>.`
  );
  return true;
}

async function handleNotificationSelection(interaction: Interaction, config: NozeBotConfig): Promise<boolean> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== SELECT_NOTIFICATIONS) return false;
  if (!interaction.guild || interaction.guildId !== config.guildId) return true;

  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const allowed = new Set<string>(config.notificationRoleIds);
  const selected = interaction.values.filter((roleId) => allowed.has(roleId));
  const toRemove = config.notificationRoleIds.filter(
    (roleId) => member.roles.cache.has(roleId) && !selected.includes(roleId)
  );
  const toAdd = selected.filter((roleId) => !member.roles.cache.has(roleId));

  if (toRemove.length) await member.roles.remove(toRemove, "Préférences de notifications NozeBot");
  if (toAdd.length) await member.roles.add(toAdd, "Préférences de notifications NozeBot");

  const summary = selected.length
    ? selected.map((roleId) => `<@&${roleId}>`).join(", ")
    : "aucune notification";
  await interaction.editReply(`✅ Tes préférences sont enregistrées : ${summary}.`);
  return true;
}

function ticketMarker(userId: string, status: "open" | "closed"): string {
  return `nozebot-ticket-owner:${userId};status:${status}`;
}

function ticketOwnerFromTopic(topic: string | null): string | null {
  return topic?.match(/nozebot-ticket-owner:(\d+);status:(?:open|closed)/)?.[1] || null;
}

type TicketOpenInteraction = StringSelectMenuInteraction | ModalSubmitInteraction;

async function openTicket(
  interaction: TicketOpenInteraction,
  config: NozeBotConfig,
  kind: string,
  customSubject?: string,
  customDetails?: string
): Promise<void> {
  const ticket = TICKET_LABELS[kind];
  if (!ticket) {
    await interaction.editReply("Ce type de demande n’existe plus. Recharge le salon et réessaie.");
    return;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply("Le ticket doit être ouvert depuis le serveur LeCasiNoze.");
    return;
  }

  const channels = await guild.channels.fetch();
  const existing = channels.find(
    (channel) => channel?.type === ChannelType.GuildText &&
      channel.topic?.includes(ticketMarker(interaction.user.id, "open"))
  );
  if (existing) {
    await interaction.editReply(`Tu as déjà un ticket ouvert : <#${existing.id}>.`);
    return;
  }

  const suffix = interaction.user.id.slice(-6);
  const channel = await guild.channels.create({
    name: `〈🎫〉┃𝗧𝗜𝗖𝗞𝗘𝗧-${suffix}`,
    type: ChannelType.GuildText,
    parent: config.supportCategoryId,
    topic: `${ticketMarker(interaction.user.id, "open")};type:${kind}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: config.moderatorRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: config.adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
    reason: `${ticket.label} ouvert par ${interaction.user.username}`,
  });

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_CLOSE_TICKET)
      .setLabel("Fermer le ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
  );
  const description = customSubject
    ? `**Sujet :** ${customSubject}\n\n${customDetails || "Aucun détail supplémentaire."}\n\n` +
      "L’équipe te répondra directement dans ce salon privé."
    : `${ticket.description}\n\nExplique ta demande avec les informations utiles. ` +
      "L’équipe te répondra directement dans ce salon privé.";
  const embed = new EmbedBuilder()
    .setColor(0x4cc9f0)
    .setTitle(`${ticket.emoji} ${ticket.label}`)
    .setDescription(description)
    .addFields(
      { name: "Demandeur", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Identifiant", value: `\`${interaction.user.id}\``, inline: true }
    )
    .setFooter({ text: "LeCasiNoze • Support privé" })
    .setTimestamp();

  await channel.send({
    content: `<@${interaction.user.id}> <@&${config.moderatorRoleId}>`,
    embeds: [embed],
    components: [closeRow],
    allowedMentions: { users: [interaction.user.id], roles: [config.moderatorRoleId] },
  });
  await interaction.editReply(`✅ Ton ticket privé est ouvert : <#${channel.id}>.`);
}

async function handleTicketCreation(interaction: Interaction, config: NozeBotConfig): Promise<boolean> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== SELECT_NEW_TICKET) return false;
  if (!interaction.guild || interaction.guildId !== config.guildId) return true;

  const kind = interaction.values[0];
  if (kind === "other") {
    const modal = new ModalBuilder()
      .setCustomId(MODAL_OTHER_TICKET)
      .setTitle("Ouvrir une autre demande")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(INPUT_OTHER_SUBJECT)
            .setLabel("Sujet de ta demande")
            .setPlaceholder("Ex. Question concernant le serveur")
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(100)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(INPUT_OTHER_DETAILS)
            .setLabel("Détails")
            .setPlaceholder("Explique ta demande avec les informations utiles…")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1500)
            .setRequired(false)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  await openTicket(interaction, config, kind);
  return true;
}

async function handleOtherTicketModal(interaction: Interaction, config: NozeBotConfig): Promise<boolean> {
  if (!interaction.isModalSubmit() || interaction.customId !== MODAL_OTHER_TICKET) return false;
  if (!interaction.guild || interaction.guildId !== config.guildId) return true;

  await interaction.deferReply({ ephemeral: true });
  const subject = interaction.fields.getTextInputValue(INPUT_OTHER_SUBJECT).trim();
  const details = interaction.fields.getTextInputValue(INPUT_OTHER_DETAILS).trim();
  await openTicket(interaction, config, "other", subject, details);
  return true;
}

async function handleTicketClosure(interaction: Interaction, config: NozeBotConfig): Promise<boolean> {
  if (!interaction.isButton() || interaction.customId !== BUTTON_CLOSE_TICKET) return false;
  if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) return true;

  const channel = interaction.channel as TextChannel;
  const ownerId = ticketOwnerFromTopic(channel.topic);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!ownerId || (ownerId !== interaction.user.id && !hasStaffRole(member, config))) {
    await interaction.reply({ content: "Tu ne peux pas fermer ce ticket.", ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  await channel.permissionOverwrites.edit(ownerId, {
    ViewChannel: false,
    SendMessages: false,
  }, { reason: `Ticket fermé par ${interaction.user.username}` });
  await channel.setName(`〈🔒〉┃𝗙𝗘𝗥𝗠𝗘́-${ownerId.slice(-6)}`);
  await channel.setTopic((channel.topic || "").replace(";status:open", ";status:closed"));
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x94a3b8)
      .setDescription(`🔒 Ticket fermé par <@${interaction.user.id}>.`)
      .setTimestamp()],
    allowedMentions: { parse: [] },
  });
  await interaction.editReply("Ticket fermé et archivé pour l’équipe.");
  return true;
}

async function logMemberDeparture(member: GuildMember | PartialGuildMember, config: NozeBotConfig): Promise<void> {
  if (member.guild.id !== config.guildId || member.user.bot) return;
  const channel = await member.guild.channels.fetch(config.leaveLogChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.roles.everyone.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`)
    .slice(0, 12);

  const embed = new EmbedBuilder()
    .setColor(0xe63946)
    .setTitle("Un membre a quitté le serveur")
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Membre", value: `${member.user.tag}\n<@${member.user.id}>`, inline: true },
      { name: "Identifiant", value: `\`${member.user.id}\``, inline: true },
      { name: "Arrivée", value: discordTimestamp(member.joinedAt), inline: true },
      { name: "Temps passé", value: durationSince(member.joinedAt), inline: true },
      { name: "Compte créé", value: discordTimestamp(member.user.createdAt), inline: true },
      { name: "Rôles au départ", value: roles.join(" ") || "Aucun rôle", inline: false }
    )
    .setFooter({ text: "LeCasiNoze • Journal privé de modération" })
    .setTimestamp();

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function routeInteraction(interaction: Interaction, config: NozeBotConfig): Promise<void> {
  try {
    if (await handleRulesAcceptance(interaction, config)) return;
    if (await handleNotificationSelection(interaction, config)) return;
    if (await handleTicketCreation(interaction, config)) return;
    if (await handleOtherTicketModal(interaction, config)) return;
    if (await handleTicketClosure(interaction, config)) return;
  } catch (error) {
    console.error("[nozebot] interaction failed", error);
    const message = "NozeBot a rencontré un problème. Réessaie dans quelques instants.";
    if (!interaction.isRepliable()) return;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => undefined);
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
    }
  }
}

export async function startLeCasiNozeDiscordBot(pool?: Pool): Promise<() => Promise<void>> {
  const config = loadConfig();
  if (!config) {
    console.log("[nozebot] NOZEBOT_DISCORD_TOKEN absent, client LeCasiNoze désactivé");
    return async () => undefined;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`[nozebot] connecté: ${readyClient.user.tag} (${readyClient.user.id})`);
  });
  client.on(Events.InteractionCreate, (interaction) => void routeInteraction(interaction, config));
  client.on(Events.GuildMemberRemove, (member) => void logMemberDeparture(member, config).catch((error) => {
    console.error("[nozebot] leave log failed", error);
  }));
  client.on(Events.Error, (error) => console.error("[nozebot] client error", error));

  await client.login(config.token);
  let stopLiveAlerts: () => void = () => undefined;
  if (pool) {
    try {
      stopLiveAlerts = await startLeCasiNozeLiveAlerts(client, pool, config.liveAlerts);
    } catch (error) {
      console.error("[nozebot][live] démarrage impossible", error);
    }
  } else {
    console.warn("[nozebot][live] pool PostgreSQL absent, alertes désactivées");
  }
  return async () => {
    stopLiveAlerts();
    client.destroy();
  };
}
