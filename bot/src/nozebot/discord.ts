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
  Routes,
  REST,
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
import {fetchAutomodProfile,coinRequest,fetchLinkedCoinNames,coinSupportRewards,acknowledgeSupportRewards} from './lunalive-api.js';
import { startLeCasiNozeLiveAlerts, type LiveAlertConfig } from "./live-alerts.js";
import {startPublicationAnnouncements} from './publication-announcements.js';
import { cnzRoleChange } from './cnz-role.js';
import {
  handleNozeBotCommand,
  registerNozeBotCommands,
  type NozeBotCommandConfig,
} from "./commands.js";

const DEFAULTS = {
  guildId: "1188913226990235800",
  memberRoleId: "1544429206400802896",
  rulesAcceptedRoleId: "1562348964378841118",
  notificationChannelId: "1217876409406586900",
  moderatorRoleId: "1188939890344329379",
  adminRoleId: "1188940226358415443",
  startHereChannelId: "1188914815561891990",
  generalChannelId: "1188913389125255198",
  commandsChannelId: "1304110217419559026",
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
    "1556031808603291689", // AutoMod: opt-in AutoMod / Auto Hunt announcements.
    "1188926242519523328",
    "1188926088852799578",
    "1217875557631393923",
    "1188926393946484783",
  ],
} as const;

const BUTTON_ACCEPT_RULES = "nozebot:rules:accept";
const SELECT_NOTIFICATIONS = "nozebot:notifications";
const BUTTON_NO_NOTIFICATIONS = "nozebot:notifications:none";
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
  rulesAcceptedRoleId: string;
  notificationChannelId: string;
  moderatorRoleId: string;
  adminRoleId: string;
  startHereChannelId: string;
  generalChannelId: string;
  leaveLogChannelId: string;
  botLogChannelId: string;
  supportCategoryId: string;
  ticketOpenerChannelId: string;
  notificationRoleIds: readonly string[];
  liveAlerts: LiveAlertConfig;
  commands: NozeBotCommandConfig;
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
    rulesAcceptedRoleId: process.env.NOZEBOT_RULES_ACCEPTED_ROLE_ID?.trim() || DEFAULTS.rulesAcceptedRoleId,
    notificationChannelId: process.env.NOZEBOT_NOTIFICATION_CHANNEL_ID?.trim() || DEFAULTS.notificationChannelId,
    moderatorRoleId: process.env.NOZEBOT_MODERATOR_ROLE_ID?.trim() || DEFAULTS.moderatorRoleId,
    adminRoleId: process.env.NOZEBOT_ADMIN_ROLE_ID?.trim() || DEFAULTS.adminRoleId,
    startHereChannelId: process.env.NOZEBOT_START_HERE_CHANNEL_ID?.trim() || DEFAULTS.startHereChannelId,
    generalChannelId: process.env.NOZEBOT_GENERAL_CHANNEL_ID?.trim() || DEFAULTS.generalChannelId,
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
    commands: {
      guildId: process.env.NOZEBOT_GUILD_ID?.trim() || DEFAULTS.guildId,
      commandsChannelId: process.env.NOZEBOT_COMMANDS_CHANNEL_ID?.trim() || DEFAULTS.commandsChannelId,
      lunaLive: {
        baseUrl: process.env.BOT_API_BASE?.trim() || "https://lunalive-api.onrender.com",
        internalKey: process.env.BOT_INTERNAL_KEY?.trim() || "",
        guildId: process.env.NOZEBOT_GUILD_ID?.trim() || DEFAULTS.guildId,
      },
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

export function buildMemberWelcomeMessage(userId: string) {
  return {
    content: `<@${userId}>, bienvenue dans la maison !`,
    allowedMentions: { parse: [] as never[], users: [userId] },
  };
}

async function welcomeNewMember(member: GuildMember, config: NozeBotConfig): Promise<void> {
  if (member.guild.id !== config.guildId || member.user.bot) return;
  const channel = await member.guild.channels.fetch(config.generalChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const message = await channel.send(buildMemberWelcomeMessage(member.id));
  await message.react("🔥");
}

async function handleRulesAcceptance(interaction: Interaction, config: NozeBotConfig): Promise<boolean> {
  if (!interaction.isButton() || interaction.customId !== BUTTON_ACCEPT_RULES) return false;
  if (!interaction.guild || interaction.guildId !== config.guildId) return true;

  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(config.memberRoleId) && !member.roles.cache.has(config.rulesAcceptedRoleId)) {
    await member.roles.add(config.rulesAcceptedRoleId, "Règlement LeCasiNoze accepté, préférences à choisir");
  }
  await interaction.editReply({
    content: member.roles.cache.has(config.memberRoleId)
      ? `✅ Tu as déjà accès au serveur. Tes notifications restent modifiables dans <#${config.notificationChannelId}>.`
      : `✅ Règlement accepté ! Dernière étape : choisis tes notifications dans <#${config.notificationChannelId}> ou continue sans notification. Le serveur s’ouvrira ensuite.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Choisir mes notifications").setURL(`https://discord.com/channels/${config.guildId}/${config.notificationChannelId}`)
    )],
    allowedMentions: { parse: [] },
  });
  return true;
}

async function handleNotificationSelection(interaction: Interaction, config: NozeBotConfig): Promise<boolean> {
  if (!(interaction.isStringSelectMenu() && interaction.customId === SELECT_NOTIFICATIONS) &&
      !(interaction.isButton() && interaction.customId === BUTTON_NO_NOTIFICATIONS)) return false;
  if (!interaction.guild || interaction.guildId !== config.guildId) return true;

  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(config.memberRoleId) && !member.roles.cache.has(config.rulesAcceptedRoleId)) {
    await interaction.editReply("Accepte d’abord le règlement dans <#1188914844909441204> pour continuer.");
    return true;
  }
  const allowed = new Set<string>(config.notificationRoleIds);
  const selected = interaction.isStringSelectMenu() ? interaction.values.filter((roleId) => allowed.has(roleId)) : [];
  const toRemove = config.notificationRoleIds.filter(
    (roleId) => member.roles.cache.has(roleId) && !selected.includes(roleId)
  );
  const toAdd = selected.filter((roleId) => !member.roles.cache.has(roleId));

  if (toRemove.length) await member.roles.remove(toRemove, "Préférences de notifications NozeBot");
  if (toAdd.length) await member.roles.add(toAdd, "Préférences de notifications NozeBot");
  if (!member.roles.cache.has(config.memberRoleId)) {
    await member.roles.add(config.memberRoleId, "Parcours terminé : règlement accepté et notifications choisies");
  }

  const summary = selected.length
    ? selected.map((roleId) => `<@&${roleId}>`).join(", ")
    : "aucune notification";
  await interaction.editReply({
    content: `✅ Tes préférences sont enregistrées : ${summary}. Le serveur est ouvert ! Retrouve-nous dans <#${config.generalChannelId}>.`,
    allowedMentions: { parse: [] },
  });
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
    if (await handleNozeBotCommand(interaction, config.commands)) return;
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

  // Only request privileged message content when the existing application allows it.
  const application=await new REST({version:'10'}).setToken(config.token).get(Routes.currentApplication()) as {flags?:number};
  const prefixEnabled=Boolean(Number(application.flags??0)&((1<<18)|(1<<19)));
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,
      ...(prefixEnabled?[GatewayIntentBits.MessageContent]:[])],
  });
  const profileCooldown=new Map<string,number>();
  client.on(Events.MessageCreate,message=>{
    if(message.author.bot||message.guildId!==config.guildId||!/^!(?:(profil|solde|points|shop|help)\s*|ameliorer (claim|cooldown|rain|slot) [1-3])$/i.test(message.content))return;
    const now=Date.now();if(now-(profileCooldown.get(message.author.id)??0)<15000)return;
    for(const [uid,at] of profileCooldown)if(now-at>60000)profileCooldown.delete(uid);
    profileCooldown.set(message.author.id,now);
    void (async()=>{
      const command=message.content.trim().toLowerCase();
      if(process.env.NOZECOINS_ENABLED==='true'){
       const purchase=/^!ameliorer (claim|cooldown|rain|slot) ([1-3])$/i.exec(command);
       if(purchase){
        if(message.channelId!==config.commands.commandsChannelId){await message.reply({content:`Colle cette commande dans <#${config.commands.commandsChannelId}>.`,allowedMentions:{parse:[],repliedUser:false}});return;}
        try{const r=await coinRequest(config.commands.lunaLive,message.author.id,'upgrade',message.id,purchase[1],Number(purchase[2])-1);
         await message.reply({content:`Amélioration achetée · Solde : ${r.balance} NozeCoins.`,allowedMentions:{parse:[],repliedUser:false}});
        }catch(e){const err=e as {code?:string;details?:Record<string,unknown>};const d=err.details??{};
         await message.reply({content:err.code==='insufficient_coins'?`Solde : ${d.balance} · Prix : ${d.cost} · Il manque ${d.missing} NozeCoins. Rien n’a été débité.`:err.code==='stale_shop'?'Palier incorrect : consulte /profil et choisis le prochain palier sur le site.':err.code==='rumble_not_linked'?'Lie ton compte avec /link avant d’acheter.':'Achat non confirmé. Consulte /solde avant de réessayer.',allowedMentions:{parse:[],repliedUser:false}});
        }return;
       }
       if(command==='!shop'){await message.reply({content:'Shop : https://lecasinoze.onrender.com/shop/',allowedMentions:{parse:[],repliedUser:false}});return;}
       const result=await coinRequest(config.commands.lunaLive,message.author.id,'profile');const p=result.profile;
       const content=command==='!shop'?'Utilise /shop pour le menu privé des améliorations NozeCoins.'
        :command==='!help'?'NozeCoins : /link · /claim · /solde · /profil · /slot · /shop. Rain : !rain sur Rumble uniquement.'
        :p?`${p.username} : ${p.balance} NozeCoins · ${p.automod} points Automod disponibles.`:'Lie ton compte Rumble avec /link.';
       await message.reply({content,allowedMentions:{parse:[],repliedUser:false}});return;
      }
      const content=command==='!shop'?'Shop Automod : https://lecasinoze.onrender.com/automod-shop/'
        :command==='!help'?'Sur Rumble : !call + slot · !points · !profil · !shop · !music. Ici : /automodlink pour lier ton compte, puis !profil.'
        :(await fetchAutomodProfile(config.commands.lunaLive,message.author.id)).profile?.message
          ??'Lie ton compte Rumble avec /automodlink, puis utilise !profil.';
      await message.reply({content,allowedMentions:{parse:[],repliedUser:false}});
    })().catch(()=>message.reply({content:'Profil temporairement indisponible. Réessaie dans un instant.',allowedMentions:{parse:[],repliedUser:false}}).catch(()=>{}));
  });
  if(!prefixEnabled)console.warn('[nozebot] commandes texte sans accès MessageContent ; /automodprofil et /automodhelp restent disponibles');

  let stopped = false;
  let gatewayUnavailableSince = 0;
  let nicknameSyncRunning=false,nicknameCursor='';
  let supportRunning=false,supportLastRun=0;
  const supportSync=setInterval(()=>{
   if(stopped||supportRunning||!client.isReady()||process.env.NOZECOINS_ENABLED!=='true'||process.env.NOZEBOT_CNZ_ENABLED!=='true'||Date.now()-supportLastRun<600_000)return;
   supportRunning=true;supportLastRun=Date.now();
   void(async()=>{
    const channel=await client.channels.fetch('1260676129673576479');
    if(!channel||!('messages' in channel)||!('send' in channel))return;
    const result=await coinSupportRewards(config.commands.lunaLive,client.user!.id);
    const groups=new Map<string,typeof result.rewards>();for(const r of result.rewards){const group=groups.get(r.week)??[];group.push(r);groups.set(r.week,group);}
    for(const [week,rewards] of groups){
     const receipt=`CNZ ${week} / ${rewards.map(r=>r.rumbleId).sort().join(',')}`;
     const recent=await channel.messages.fetch({limit:100});
     if(!recent.some(m=>m.author.id===client.user!.id&&m.embeds.some(e=>e.footer?.text===receipt))){
      await channel.send({content:rewards.map(r=>`<@${r.discordId}>`).join(' · '),embeds:[new EmbedBuilder().setColor(0xd64065).setTitle('CNZ · Merci pour votre soutien').setDescription(rewards.map(r=>`<@${r.discordId}> · **+${r.amount??25} NozeCoins**`).join('\n')+'\n\nPseudo CNZ vérifié cette semaine. Une récompense par semaine et par compte. Points gratuits, sans valeur monétaire.').setFooter({text:receipt})],allowedMentions:{parse:[],users:rewards.map(r=>r.discordId)}});
     }
     await acknowledgeSupportRewards(config.commands.lunaLive,client.user!.id,week,rewards.map(r=>r.rumbleId));
    }
   })().catch(()=>console.warn('[nozebot] soutien CNZ temporairement indisponible')).finally(()=>{supportRunning=false;});
  },60_000);
  const nicknameSync=setInterval(()=>{
   if(stopped||nicknameSyncRunning||!client.isReady()||process.env.NOZECOINS_ENABLED!=='true')return;
   nicknameSyncRunning=true;
   void(async()=>{
    const guild=await client.guilds.fetch(config.guildId);const me=await guild.members.fetchMe();
    const linkedRole=process.env.NOZEBOT_LINKED_ROLE_ID;
    const cnzRoleId=process.env.NOZEBOT_CNZ_ROLE_ID?.trim() || '1281868087330869260';
    const cnzRole=await guild.roles.fetch(cnzRoleId).catch(()=>null);
    const canManageCnz=cnzRole && !cnzRole.managed && cnzRole.permissions.bitfield===0n &&
      me.permissions.has(PermissionFlagsBits.ManageRoles) && me.roles.highest.comparePositionTo(cnzRole)>0;
    const result=await fetchLinkedCoinNames(config.commands.lunaLive,client.user!.id,nicknameCursor);
    for(const link of result.links){
     const member=await guild.members.fetch(link.discordId).catch(()=>null);
     if(member&&linkedRole&&me.permissions.has(PermissionFlagsBits.ManageRoles)&&!member.roles.cache.has(linkedRole))await member.roles.add(linkedRole,'Compte Rumble vérifié').catch(()=>undefined);
     if(member && canManageCnz){
      const change=cnzRoleChange({...link,hasRole:member.roles.cache.has(cnzRoleId)});
      if(change==='add')await member.roles.add(cnzRoleId,'Marque CNZ dans le dernier pseudo Rumble vérifié');
      if(change==='remove')await member.roles.remove(cnzRoleId,'Marque CNZ retirée du dernier pseudo Rumble vérifié');
     }
     const nickname=link.username.replace(/[\r\n\u0000-\u001f]/g,'').trim().slice(0,32);
     if(me.permissions.has(PermissionFlagsBits.ManageNicknames)&&member?.manageable&&nickname&&member.nickname!==nickname){
      await member.setNickname(nickname,'Pseudo du compte Rumble vérifié').catch(()=>undefined);
     }
    }
    nicknameCursor=result.nextCursor??'';
   })().catch(()=>console.warn('[nozebot] synchronisation surnoms indisponible')).finally(()=>{nicknameSyncRunning=false;});
  },60_000);

  client.once(Events.ClientReady, (readyClient) => {
    gatewayUnavailableSince = 0;
    console.log(`[nozebot] connecté: ${readyClient.user.tag} (${readyClient.user.id})`);
  });
  client.on(Events.InteractionCreate, (interaction) => {
    console.log("[nozebot] interaction reçue", {
      id: interaction.id,
      kind: interaction.type,
      command: interaction.isChatInputCommand() ? interaction.commandName : undefined,
      customId: interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()
        ? interaction.customId
        : undefined,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
    });
    void routeInteraction(interaction, config);
  });
  client.on(Events.GuildMemberAdd, (member) => void welcomeNewMember(member, config).catch((error) => {
    console.error("[nozebot] member welcome failed", error);
  }));
  client.on(Events.GuildMemberRemove, (member) => void logMemberDeparture(member, config).catch((error) => {
    console.error("[nozebot] leave log failed", error);
  }));
  client.on(Events.Error, (error) => console.error("[nozebot] client error", error));
  client.on(Events.Warn, (message) => console.warn("[nozebot] client warning", message));
  client.on(Events.ShardDisconnect, (event, shardId) => {
    if (!gatewayUnavailableSince) gatewayUnavailableSince = Date.now();
    console.warn(`[nozebot] gateway déconnectée (shard=${shardId}, code=${event.code}, raison=${event.reason || "aucune"})`);
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    console.warn(`[nozebot] gateway en reconnexion (shard=${shardId})`);
  });
  client.on(Events.ShardError, (error, shardId) => {
    if (!gatewayUnavailableSince) gatewayUnavailableSince = Date.now();
    console.error(`[nozebot] erreur gateway (shard=${shardId})`, error);
  });
  client.on(Events.ShardReady, (shardId) => {
    gatewayUnavailableSince = 0;
    console.log(`[nozebot] gateway prête (shard=${shardId})`);
  });
  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    gatewayUnavailableSince = 0;
    console.log(`[nozebot] gateway reprise (shard=${shardId}, événements rejoués=${replayedEvents})`);
  });

  await client.login(config.token);
  try {
    const application = await client.rest.get(Routes.currentApplication()) as {
      interactions_endpoint_url?: string | null;
    };
    if (application.interactions_endpoint_url) {
      console.warn("[nozebot] ancienne URL HTTP d'interactions détectée, retour au mode Gateway");
      await client.rest.patch(Routes.currentApplication(), {
        body: { interactions_endpoint_url: null },
      });
      console.log("[nozebot] URL HTTP d'interactions supprimée");
    } else {
      console.log("[nozebot] réception des interactions configurée sur la Gateway");
    }
  } catch (error) {
    console.error("[nozebot] vérification du mode de réception des interactions impossible", error);
  }
  await registerNozeBotCommands(client, config.commands).catch((error) => {
    console.error("[nozebot] enregistrement des commandes LunaLive impossible", error);
  });
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
  let stopPublications: () => void = () => undefined;
  let publicationStarting=false,publicationReady=false;
  const ensurePublications=async()=>{if(!pool||stopped||publicationStarting||publicationReady)return;publicationStarting=true;
    try{stopPublications=await startPublicationAnnouncements(client,pool);publicationReady=true;if(stopped)stopPublications();}
    catch{console.warn('[nozebot][publications] startup unavailable; retry in 60s');}finally{publicationStarting=false;}};
  const publicationStartup=setInterval(()=>void ensurePublications(),60000);
  void ensurePublications();
  const gatewayWatchdog = setInterval(() => {
    if (stopped || client.isReady()) {
      gatewayUnavailableSince = 0;
      return;
    }
    if (!gatewayUnavailableSince) gatewayUnavailableSince = Date.now();
    const unavailableForMs = Date.now() - gatewayUnavailableSince;
    console.warn(`[nozebot] gateway indisponible depuis ${Math.round(unavailableForMs / 1000)}s`);
    if (unavailableForMs >= 60_000) {
      console.error("[nozebot] gateway indisponible depuis 60s, arrêt pour redémarrage automatique Render");
      process.exitCode = 1;
      void Promise.resolve().then(() => process.exit(1));
    }
  }, 15_000);
  return async () => {
    stopped = true;
    clearInterval(gatewayWatchdog);
    clearInterval(nicknameSync);
    clearInterval(supportSync);
    stopLiveAlerts();
    stopPublications();
    clearInterval(publicationStartup);
    client.destroy();
  };
}
