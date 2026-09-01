import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Guild,
  Events, GatewayIntentBits, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} from "discord.js";
import type { BotEnv } from "../env.js";
import { nivoraLanguage, t, ticketGuide } from "./i18n.js";

const GOLD = 0xDDB65A;
const APPLY_BUTTON = "nivora:apply";
const LINK_EXISTING_BUTTON = "nivora:link-existing-button";

export type NivoraDiscordEnv = Pick<BotEnv,
  "NIVORA_DISCORD_BOT_TOKEN" | "NIVORA_DISCORD_GUILD_ID" | "NIVORA_API_BASE" |
  "NIVORA_BOT_INTERNAL_KEY" | "NIVORA_TELEGRAM_BOT_TOKEN" | "NIVORA_TELEGRAM_REFILL_CHAT_ID"
>;

const refillsViaAurix = process.env.NIVORA_REFILLS_VIA_AURIX === "1";

type RefillBrand = { id: string; name: string; account: { casino_email: string | null; casino_username: string | null; refill_amount: number | string | null } | null };
type RefillContext = { profileId: string; ticketChannelId: string | null; language?: string | null; brands: RefillBrand[] };
type RefillBatch = {
  batch: { id: string; cutoff_at: string };
  requests: Array<{ amount: number | string; wager: string | null; casino_email: string; casino_username: string; brand: { name: string } | null; profile: { username: string } | null }>;
};
type RefillCompletion = { empty: boolean; notifications?: Array<{ brandName: string; amount: number; discordUserId: string; ticketChannelId: string; language?: string | null }> };
type NotificationSettings = { ticket_channel_id: string | null; notify_registration: boolean; notify_ftd: boolean; notify_deposit: boolean; language?: string | null };
type PerformanceNotification = { id: string; type: "registration" | "ftd" | "deposit"; amount: number; depositNumber: number | null; playerTotal: number | null; brandName: string; discordUserId: string | null; ticketChannelId: string | null; language?: string | null; enabled: boolean };
type AffiliateStats = { profileName: string; ticketChannelId: string | null; monthStart: string; language?: string | null; brands: Array<{ brandName: string; clicks: number; registrations: number; ftd: number; deposits: number; depositVolume: number; rs: number; earnings: number }> };

function applicationModal() {
  const field = (id: string, label: string, style: TextInputStyle, required = true, placeholder?: string) =>
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setPlaceholder(placeholder ?? "");
  return new ModalBuilder().setCustomId("nivora:application").setTitle("NivoraNet application · Candidature · Bewerbung").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("username", "Creator name / Nom / Creator-Name", TextInputStyle.Short)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("email", "Email / E-mail", TextInputStyle.Short, true, "you@example.com")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("password", "Account password / Mot de passe / Passwort", TextInputStyle.Short, true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("twitch", "Twitch channel link / Lien Twitch", TextInputStyle.Short, true, "https://twitch.tv/...")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("language", "Language / Langue / Sprache", TextInputStyle.Short, true, "English / Français / Deutsch")),
  );
}

function linkExistingModal() {
  const field = (id: string, label: string, placeholder: string) => new TextInputBuilder()
    .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(placeholder);
  return new ModalBuilder().setCustomId("nivora:link-existing").setTitle("Link account · Lier un compte · Konto verknüpfen").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("email", "NivoraNet account email / E-mail", "you@example.com")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("password", "Password / Mot de passe / Passwort", "Your password")),
  );
}

function applyPanel() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(GOLD)
      .setTitle("Join NivoraNet")
      .setDescription(
        "**EN — New here?** Submit your application and the team will review it. Already have an account? Link it to access your private ticket, refills, alerts and statistics.\n\n" +
        "**FR — Nouveau ?** Envoie ta candidature : l’équipe la vérifiera. Tu as déjà un compte ? Lie-le à Discord pour accéder à ton ticket privé, tes refills, alertes et statistiques.\n\n" +
        "**DE — Neu hier?** Reiche deine Bewerbung ein; das Team prüft sie. Du hast bereits ein Konto? Verknüpfe es mit Discord für dein privates Ticket, Refills, Benachrichtigungen und Statistiken."
      )],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(APPLY_BUTTON).setLabel("Apply · Candidater · Bewerben").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(LINK_EXISTING_BUTTON).setLabel("Link account · Lier · Verknüpfen").setStyle(ButtonStyle.Secondary),
    )],
  };
}

function publicEmbed(title: string, description: string, key: string) {
  return new EmbedBuilder().setColor(GOLD).setTitle(title).setDescription(description).setFooter({ text: `NIVORA:panel:${key}` });
}

function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(GOLD)
    .setTitle("Affiliate Rules · Règlement affilié · Affiliate-Regeln")
    .setDescription(
      "These rules protect creators, players, casino partners and the long-term stability of every deal.\n" +
      "Ces règles protègent les créateurs, les joueurs, nos partenaires et la stabilité de chaque collaboration."
    )
    .addFields(
      {
        name: "🇬🇧 English",
        value: [
          "• One Discord and one NivoraNet account per creator. Keep credentials, private tickets, tracking links and deal terms confidential.",
          "• Follow all platform, advertising and casino rules. Fake traffic, self-referrals, multi-accounting, misleading promotion and harassment are prohibited.",
          "• A stable, long-term deal requires sufficient **average deposits per player** and genuine player value—not FTD volume alone.",
          "• Repeated minimum-threshold deposits, artificial deposit splitting or abnormal patterns intended only to validate FTDs will be treated as suspected fraud.",
          "• Fraud, manipulated statistics or deliberately unprofitable traffic may result in immediate suspension and termination of the partnership.",
        ].join("\n"),
      },
      {
        name: "🇫🇷 Français",
        value: [
          "• Un compte Discord et un compte NivoraNet par créateur. Les identifiants, tickets privés, liens de tracking et conditions du deal restent confidentiels.",
          "• Les règles des plateformes, de la publicité et des casinos doivent être respectées. Faux trafic, auto-affiliation, multi-comptes, promotion trompeuse et harcèlement sont interdits.",
          "• Un deal stable et durable exige un **dépôt moyen par joueur suffisant** et des joueurs de qualité, pas uniquement du volume de FTD.",
          "• Des dépôts répétés au seuil minimum, un fractionnement artificiel ou des schémas anormaux visant uniquement à valider des FTD seront considérés comme une suspicion de fraude.",
          "• Toute fraude, statistique manipulée ou trafic volontairement non rentable peut entraîner la suspension immédiate et la rupture du contrat.",
        ].join("\n"),
      },
      {
        name: "🇩🇪 Deutsch",
        value: [
          "• Pro Creator sind ein Discord- und ein NivoraNet-Konto erlaubt. Zugangsdaten, private Tickets, Tracking-Links und Deal-Konditionen bleiben vertraulich.",
          "• Plattform-, Werbe- und Casino-Regeln sind einzuhalten. Fake-Traffic, Eigenwerbung über den eigenen Affiliate-Link, Multi-Accounts, irreführende Werbung und Belästigung sind verboten.",
          "• Ein stabiler, langfristiger Deal setzt einen ausreichenden **durchschnittlichen Einzahlungsbetrag pro Spieler** und echten Spielerwert voraus, nicht nur FTD-Volumen.",
          "• Wiederholte Mindesteinzahlungen, künstliche Aufteilung oder auffällige Muster nur zur FTD-Validierung gelten als Betrugsverdacht.",
          "• Betrug, manipulierte Statistiken oder absichtlich unrentabler Traffic können zur sofortigen Sperrung und Beendigung der Zusammenarbeit führen.",
        ].join("\n"),
      }
    )
    .setFooter({ text: "NIVORA:panel:rules" });
}

function publicPanels() {
  return [
    {
      key: "welcome", aliases: ["welcome", "bienvenue"], embed: publicEmbed("Welcome to NivoraNet", [
        "**EN** — Creator management, deals, tracking and daily support in one place.",
        "**FR** — Gestion créateur, deals, tracking et support quotidien au même endroit.",
        "**DE** — Creator-Management, Deals, Tracking und täglicher Support an einem Ort.",
        "", "1. Read `#📌・règlement` · 2. Read `#📖・à-lire` · 3. Open `#📝・apply`.",
      ].join("\n"), "welcome"),
    },
    {
      key: "rules", aliases: ["rules", "reglement", "regel"], embed: rulesEmbed(),
    },
    {
      key: "read", aliases: ["a-lire", "alire", "read", "help", "guide"], embed: publicEmbed("How it works · Comment ça marche · So funktioniert es", [
        "**1. New creator:** open `#📝・apply`, submit the form, then wait for approval.",
        "**2. Existing creator:** use **Link existing account** in `#📝・apply`.",
        "**3. After approval:** your private ticket is created. Your deal and tracking link are configured by the team.",
        "**4. In your ticket:** `/refill` for your daily fake balance, `/notifications` for alerts, `/stats` for the current month.",
        "", "**FR / DE:** Le même parcours s’applique : candidature ou liaison du compte, validation, ticket privé, puis commandes. / Derselbe Ablauf gilt: Bewerbung oder Kontoverknüpfung, Freigabe, privates Ticket, dann Befehle.",
      ].join("\n"), "read"),
    },
  ];
}

function normalizedChannelName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function findPublicChannel(guild: Guild, aliases: string[]) {
  return guild.channels.cache.find((item) => {
    if (item.type !== ChannelType.GuildText) return false;
    const name = normalizedChannelName(item.name);
    return aliases.some((alias) => name === alias || name.includes(alias));
  });
}

export async function syncNivoraRulesPanelViaRest(env: NivoraDiscordEnv) {
  if (!env.NIVORA_DISCORD_BOT_TOKEN || !env.NIVORA_DISCORD_GUILD_ID) {
    throw new Error("Nivora Discord token or guild ID missing");
  }
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
      ...init,
      headers: {
        authorization: `Bot ${env.NIVORA_DISCORD_BOT_TOKEN}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`Discord ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.status === 204 ? null : response.json();
  };
  const [botUser, channels] = await Promise.all([
    request("/users/@me") as Promise<{ id: string }>,
    request(`/guilds/${env.NIVORA_DISCORD_GUILD_ID}/channels`) as Promise<Array<{ id: string; name: string; type: number }>>,
  ]);
  const channel = channels.find((item) => {
    if (item.type !== 0) return false;
    const name = normalizedChannelName(item.name);
    return ["rules", "reglement", "regel"].some((alias) => name === alias || name.includes(alias));
  });
  if (!channel) throw new Error("Nivora rules channel not found");
  const messages = await request(`/channels/${channel.id}/messages?limit=100`) as Array<{
    id: string; author?: { id?: string }; embeds?: Array<{ footer?: { text?: string } }>; components?: unknown[];
  }>;
  const existing = messages.find((message) =>
    message.author?.id === botUser.id && message.embeds?.some((embed) => embed.footer?.text === "NIVORA:panel:rules")
  ) ?? messages.find((message) => message.author?.id === botUser.id && (message.components?.length || 0) === 0);
  const payload = JSON.stringify({ embeds: [rulesEmbed().toJSON()] });
  if (existing) {
    await request(`/channels/${channel.id}/messages/${existing.id}`, { method: "PATCH", body: payload });
  } else {
    await request(`/channels/${channel.id}/messages`, { method: "POST", body: payload });
  }
  console.log(`[nivora-discord] rules panel synchronized via REST (channel=${channel.id})`);
}

function refillAccountModal(brandId: string, brandName: string, language?: string | null) {
  const field = (id: string, label: string, placeholder: string) => new TextInputBuilder()
    .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(placeholder);
  const label = nivoraLanguage(language) === "fr" ? "Informations refill" : nivoraLanguage(language) === "de" ? "Refill-Daten" : "Refill details";
  return new ModalBuilder().setCustomId(`nivora:refill-account:${brandId}`).setTitle(`${label} · ${brandName}`).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("casino_email", "Casino email / E-mail casino", "email@example.com")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("casino_username", "Casino username / Pseudo casino", "Casino username")),
  );
}

async function api<T>(env: NivoraDiscordEnv, body: Record<string, unknown>): Promise<T> {
  if (!env.NIVORA_API_BASE || !env.NIVORA_BOT_INTERNAL_KEY) throw new Error("Nivora API configuration missing.");
  const response = await fetch(`${env.NIVORA_API_BASE}/api/internal/discord`, {
    method: "POST", headers: { "content-type": "application/json", "x-nivora-bot-key": env.NIVORA_BOT_INTERNAL_KEY }, body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Nivora API error.");
  return data as T;
}

async function publishApplicationEntry(client: Client, env: NivoraDiscordEnv, data: { profileId: string; username: string; twitchUrl: string; language: string; discordUsername: string }) {
  const guild = await client.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
  const channel = guild.channels.cache.find((item) => item.name === "📥・applications" && item.type === ChannelType.GuildText);
  if (!channel?.isTextBased()) throw new Error("Applications channel not found.");
  const embed = new EmbedBuilder().setColor(GOLD).setTitle("New affiliate application · Nouvelle candidature · Neue Bewerbung").addFields(
    { name: "Creator · Créateur", value: data.username, inline: true }, { name: "Language · Langue · Sprache", value: data.language, inline: true },
    { name: "Discord", value: data.discordUsername, inline: true }, { name: "Twitch", value: data.twitchUrl },
  ).setFooter({ text: `Profile ${data.profileId}` });
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`nivora:approve:${data.profileId}`).setLabel("Approve · Valider · Genehmigen").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`nivora:reject:${data.profileId}`).setLabel("Reject · Refuser · Ablehnen").setStyle(ButtonStyle.Danger),
  );
  await channel.send({ embeds: [embed], components: [buttons] });
}

function ticketChannelName(username: string, fallback: string) {
  const safe = username
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `ticket-${safe || fallback}`;
}

async function createPrivateTicket(client: Client, env: NivoraDiscordEnv, profileId: string, discordUserId: string, username: string, language?: string | null) {
  const guild = await client.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
  const category = guild.channels.cache.find((item) => item.name === "━━ PRIVATE TICKETS ━━" && item.type === ChannelType.GuildCategory);
  if (!category) throw new Error("Ticket category not found.");
  const channel = await guild.channels.create({
    name: ticketChannelName(username, discordUserId), type: ChannelType.GuildText, parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: discordUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });
  const text = t(language);
  await channel.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle(text.ticketTitle).setDescription(ticketGuide(nivoraLanguage(language)))] });
  await api(env, { action: "set-ticket", profileId, ticketChannelId: channel.id });
}

async function syncTicketNames(client: Client, env: NivoraDiscordEnv) {
  const result = await api<{ tickets: Array<{ channelId: string; username: string }> }>(env, { action: "ticket-links" });
  for (const ticket of result.tickets ?? []) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased() && "setName" in channel) {
      const name = ticketChannelName(ticket.username, ticket.channelId);
      if (channel.name !== name) await channel.setName(name, "Use the NivoraNet affiliate username").catch(() => {});
    }
  }
}

/** Updates the single persistent #apply message instead of posting duplicates on deploy. */
async function syncApplyPanel(client: Client, env: NivoraDiscordEnv) {
  const guild = await client.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
  const channel = guild.channels.cache.find((item) => item.name === "📝・apply" && item.type === ChannelType.GuildText);
  if (!channel?.isTextBased() || !("messages" in channel) || !client.user) {
    console.warn("[nivora-discord] apply channel or bot user not available for panel sync");
    return;
  }
  const messages = await channel.messages.fetch({ limit: 100 });
  const panel = messages.find((message) =>
    message.author.id === client.user!.id &&
    message.components.some((row) =>
      (row as { components?: Array<{ customId?: string }> }).components?.some((component) => component.customId === APPLY_BUTTON)
    )
  );
  if (!panel) {
    console.warn("[nivora-discord] existing apply panel not found; no duplicate was created");
    return;
  }
  await panel.edit(applyPanel());
  console.log("[nivora-discord] apply panel synchronized");
}

/** Keep one editable, bot-owned information message per public channel. */
async function syncPublicPanels(client: Client, env: NivoraDiscordEnv) {
  const guild = await client.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
  for (const panel of publicPanels()) {
    const channel = findPublicChannel(guild, panel.aliases);
    if (!channel?.isTextBased() || !("messages" in channel) || !client.user) {
      console.warn(`[nivora-discord] public channel not found for: ${panel.aliases.join(", ")}`);
      continue;
    }
    const messages = await channel.messages.fetch({ limit: 100 });
    const existing = messages.find((message) => message.author.id === client.user!.id && message.embeds.some((embed) => embed.footer?.text === `NIVORA:panel:${panel.key}`))
      // These are dedicated information channels. Adopting the existing bot
      // post once prevents a second panel appearing after this upgrade.
      ?? messages.find((message) => message.author.id === client.user!.id && message.components.length === 0);
    if (existing) await existing.edit({ embeds: [panel.embed] });
    else await channel.send({ embeds: [panel.embed] });
  }
  await syncApplyPanel(client, env);
  console.log("[nivora-discord] public information panels synchronized");
}

function hasRefillDetails(brand: RefillBrand) {
  return Boolean(brand.account?.casino_email && brand.account?.casino_username);
}

async function queueRefill(interaction: any, env: NivoraDiscordEnv, brandId: string) {
  await interaction.deferReply({ ephemeral: true });
  const context = await api<RefillContext>(env, { action: "refill-context", discordUserId: interaction.user.id });
  const text = t(context.language);
  const result = await api<{ brandName: string; amount: number; cutoffAt: string }>(env, {
    action: "request-refill", discordUserId: interaction.user.id, brandId,
  });
  const language = nivoraLanguage(context.language);
  const when = new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : "en-GB", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.cutoffAt));
  const channel = interaction.channel;
  if (channel?.isTextBased()) await channel.send({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle(text.refillRequested).setDescription(`**${result.brandName}** · **${currency(result.amount)}**\n${text.queued}: **${when} (Paris)**.`).setFooter({ text: text.dailyLimit })],
  });
  await interaction.editReply(text.refillAdded);
}

async function beginRefill(interaction: any, env: NivoraDiscordEnv, brandId?: string) {
  const context = await api<RefillContext>(env, { action: "refill-context", discordUserId: interaction.user.id });
  const text = t(context.language);
  if (!context.ticketChannelId || interaction.channelId !== context.ticketChannelId) {
    await interaction.reply({ content: ["/refill", "—", text.privateOnly].join(" "), ephemeral: true });
    return;
  }
  if (!context.brands.length) {
    await interaction.reply({ content: text.noBrand, ephemeral: true });
    return;
  }
  if (!brandId && context.brands.length > 1) {
    const menu = new StringSelectMenuBuilder().setCustomId("nivora:refill-brand").setPlaceholder(text.selectBrand).addOptions(
      context.brands.map((brand) => ({ label: brand.name, value: brand.id, description: hasRefillDetails(brand) ? text.requestDailyRefill : text.accountDetailsRequired })),
    );
    await interaction.reply({ content: text.selectBrand, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], ephemeral: true });
    return;
  }
  const brand = context.brands.find((item) => item.id === (brandId ?? context.brands[0].id));
  if (!brand) throw new Error("Brand not found.");
  if (!hasRefillDetails(brand)) {
    await interaction.showModal(refillAccountModal(brand.id, brand.name, context.language));
    return;
  }
  await queueRefill(interaction, env, brand.id);
}

function notificationPanel(settings: NotificationSettings) {
  const language = nivoraLanguage(settings.language);
  const labels = language === "fr"
    ? { title: "Alertes de performances", intro: "Sélectionne les alertes que tu souhaites recevoir dans ce ticket privé. Laisse tout vide pour les désactiver.", registrations: "Inscriptions", registrationHint: "Nouvelles inscriptions casino", ftd: "FTD", ftdHint: "Premiers dépôts", deposits: "Dépôts", depositHint: "Dépôts suivants" }
    : language === "de"
      ? { title: "Performance-Benachrichtigungen", intro: "Wähle alle Benachrichtigungen, die du in diesem privaten Ticket erhalten möchtest. Lasse alles leer, um sie zu deaktivieren.", registrations: "Registrierungen", registrationHint: "Neue Casino-Registrierungen", ftd: "FTDs", ftdHint: "Ersteinzahlungen", deposits: "Einzahlungen", depositHint: "Weitere Einzahlungen" }
      : { title: "Performance alerts", intro: "Select every alert you want to receive in this private ticket. Leave all choices empty to turn alerts off.", registrations: "Registrations", registrationHint: "New casino registrations", ftd: "FTDs", ftdHint: "First-time deposits", deposits: "Deposits", depositHint: "Later player deposits" };
  const selected = new Set([
    settings.notify_registration ? "registration" : null,
    settings.notify_ftd ? "ftd" : null,
    settings.notify_deposit ? "deposit" : null,
  ]);
  const menu = new StringSelectMenuBuilder().setCustomId("nivora:notification-settings").setPlaceholder(labels.title).setMinValues(0).setMaxValues(3).addOptions(
    { label: labels.registrations, value: "registration", description: labels.registrationHint, default: selected.has("registration") },
    { label: labels.ftd, value: "ftd", description: labels.ftdHint, default: selected.has("ftd") },
    { label: labels.deposits, value: "deposit", description: labels.depositHint, default: selected.has("deposit") },
  );
  return {
    content: `${labels.title}\n${labels.intro}`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  };
}

async function openNotificationSettings(interaction: any, env: NivoraDiscordEnv) {
  const settings = await api<NotificationSettings>(env, { action: "notification-settings", discordUserId: interaction.user.id });
  if (!settings.ticket_channel_id || interaction.channelId !== settings.ticket_channel_id) {
    await interaction.reply({ content: ["/notifications", "—", t(settings.language).privateOnly].join(" "), ephemeral: true });
    return;
  }
  await interaction.reply({ ...notificationPanel(settings), ephemeral: true });
}

function currency(value: number) { return `€${value.toFixed(2)}`; }

async function sendStats(interaction: any, env: NivoraDiscordEnv, targetDiscordUserId?: string) {
  const target = targetDiscordUserId ?? interaction.user.id;
  const stats = await api<AffiliateStats>(env, { action: "affiliate-stats", discordUserId: interaction.user.id, targetDiscordUserId: target });
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && (!stats.ticketChannelId || interaction.channelId !== stats.ticketChannelId)) {
    await interaction.reply({ content: ["/stats", "—", t(stats.language).privateOnly].join(" "), ephemeral: true });
    return;
  }
  const language = nivoraLanguage(stats.language);
  const month = new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : "en-GB", { timeZone: "Europe/Paris", month: "long", year: "numeric" }).format(new Date(stats.monthStart));
  const labels = language === "fr"
    ? { title: "Statistiques du mois en cours", period: "Du 1", to: "à aujourd’hui.", clicks: "Clics", registrations: "Inscriptions", ftd: "FTD", deposits: "Dépôts", volume: "Volume", rs: "RS", earnings: "Gains", empty: "Aucune marque active", emptyText: "Aucun deal n’est attribué actuellement." }
    : language === "de"
      ? { title: "Statistiken des aktuellen Monats", period: "Vom 1.", to: "bis heute.", clicks: "Klicks", registrations: "Registrierungen", ftd: "FTDs", deposits: "Einzahlungen", volume: "Volumen", rs: "RS", earnings: "Einnahmen", empty: "Keine aktive Marke", emptyText: "Derzeit ist kein Deal zugewiesen." }
      : { title: "Current month statistics", period: "From 1", to: "to now.", clicks: "Clicks", registrations: "Registrations", ftd: "FTDs", deposits: "Deposits", volume: "Volume", rs: "RS", earnings: "Earnings", empty: "No active brands", emptyText: "No deal is currently assigned." };
  const fields = stats.brands.map((brand) => ({
    name: brand.brandName,
    value: `${labels.clicks}: **${brand.clicks}** | ${labels.registrations}: **${brand.registrations}** | ${labels.ftd}: **${brand.ftd}**\n${labels.deposits}: **${brand.deposits}** | ${labels.volume}: **${currency(brand.depositVolume)}** | ${labels.rs}: **${currency(brand.rs)}** | ${labels.earnings}: **${currency(brand.earnings)}**`,
  }));
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`${labels.title} - ${stats.profileName}`).setDescription(`${labels.period} ${month} ${labels.to}`).addFields(fields.length ? fields : [{ name: labels.empty, value: labels.emptyText }])],
    ephemeral: !isAdmin,
  });
}

async function sendHelp(interaction: any, env: NivoraDiscordEnv) {
  const context = await api<AffiliateStats>(env, { action: "affiliate-stats", discordUserId: interaction.user.id });
  const text = t(context.language);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle(text.helpTitle).setDescription(text.helpIntro).addFields(
      { name: "/refill", value: text.refill },
      { name: "/notifications", value: text.notifications },
      { name: "/stats", value: text.stats },
    )], ephemeral: true,
  });
}

function refillBatchMessage(batch: RefillBatch) {
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(batch.batch.cutoff_at));
  const byBrand = new Map<string, RefillBatch["requests"]>();
  for (const request of batch.requests) {
    const name = request.brand?.name ?? "Unknown brand";
    byBrand.set(name, [...(byBrand.get(name) ?? []), request]);
  }
  const total = batch.requests.reduce((sum, request) => sum + Number(request.amount), 0);
  const compactGroups = [...byBrand.entries()].map(([brand, requests]) => {
    const lines = requests.map((request, index) =>
      `${index + 1}. ${request.casino_username} - ${request.casino_email} - €${Number(request.amount).toFixed(2)}`,
    );
    return `${brand}\n${lines.join("\n")}`;
  });
  return [
    "Hello Sam,",
    `Here is today's refill list - ${date}:`,
    `${batch.requests.length} request${batch.requests.length === 1 ? "" : "s"} - total refill: €${total.toFixed(2)}`,
    compactGroups.join("\n\n"),
    "Thank you in advance for processing these refills.\nWhen every refill is completed, reply with /done.\n\nHave a great day!",
  ].join("\n\n");

  const groups = [...byBrand.entries()].map(([brand, requests]) => {
    const lines = requests.map((request, index) => {
      const wager = request.wager?.trim() ? request.wager.trim() : "no wager";
      return `${index + 1}. ${request.profile?.username ?? "Affiliate"} · ${request.casino_email} — $${Number(request.amount).toFixed(2)} (${wager})\n   Casino username: ${request.casino_username}`;
    });
    return `🎰 ${brand}\n${lines.join("\n")}`;
  });
  return [
    "Hello Sam 👋",
    `Here is today's refill list — ${date}:`,
    `💰 ${batch.requests.length} request${batch.requests.length === 1 ? "" : "s"} — total refill: $${total.toFixed(2)}`,
    groups.join("\n\n"),
    "Thank you in advance for processing these refills.\nOnce completed, please let us know.\n\nHave a great day! ☀️",
  ].join("\n\n");
}

async function dispatchRefillBatch(env: NivoraDiscordEnv, includeFuture = false) {
  if (!env.NIVORA_TELEGRAM_BOT_TOKEN || !env.NIVORA_TELEGRAM_REFILL_CHAT_ID) throw new Error("Telegram refill destination is not configured.");
  const result = await api<RefillBatch & { empty?: boolean }>(env, { action: "refill-batch", includeFuture });
  if (result.empty || !result.requests?.length) return { empty: true };
  const response = await fetch(`https://api.telegram.org/bot${env.NIVORA_TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.NIVORA_TELEGRAM_REFILL_CHAT_ID, text: refillBatchMessage(result) }),
  });
  const telegram = await response.json().catch(() => ({})) as { ok?: boolean; description?: string };
  if (!response.ok || !telegram.ok) throw new Error(telegram.description ?? "Telegram delivery failed.");
  await api(env, { action: "mark-refill-batch-sent", batchId: result.batch.id });
  return { empty: false, count: result.requests.length };
}

async function completeRefillBatch(client: Client, env: NivoraDiscordEnv) {
  const result = await api<RefillCompletion>(env, { action: "complete-refill-batch" });
  if (result.empty) return { empty: true, count: 0 };
  let count = 0;
  for (const notification of result.notifications ?? []) {
    const channel = await client.channels.fetch(notification.ticketChannelId).catch(() => null);
    if (channel?.type !== ChannelType.GuildText) continue;
    await channel.send({
      content: `<@${notification.discordUserId}>`,
      embeds: [new EmbedBuilder().setColor(0x35D6B5).setTitle(t(notification.language).refillCompleted).setDescription(t(notification.language).refillCompletedText(notification.brandName, currency(notification.amount)))],
    });
    count += 1;
  }
  return { empty: false, count };
}

function startTelegramDoneListener(client: Client, env: NivoraDiscordEnv) {
  if (!env.NIVORA_TELEGRAM_BOT_TOKEN || !env.NIVORA_TELEGRAM_REFILL_CHAT_ID) return () => {};
  let offset = 0;
  let polling = false;
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.NIVORA_TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=0`);
      const body = await response.json() as { ok?: boolean; result?: Array<{ update_id: number; message?: { chat?: { id?: number }; text?: string } }> };
      if (!body.ok) throw new Error("Telegram update polling failed.");
      for (const update of body.result ?? []) {
        offset = Math.max(offset, update.update_id + 1);
        const message = update.message;
        if (String(message?.chat?.id) !== env.NIVORA_TELEGRAM_REFILL_CHAT_ID || message?.text?.trim().toLowerCase() !== "/done") continue;
        const result = await completeRefillBatch(client, env);
        const confirmation = result.empty
          ? "There is no sent refill batch awaiting confirmation."
          : `Done. ${result.count} affiliate ticket${result.count === 1 ? " was" : "s were"} notified.`;
        await fetch(`https://api.telegram.org/bot${env.NIVORA_TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: env.NIVORA_TELEGRAM_REFILL_CHAT_ID, text: confirmation }),
        });
      }
    } catch (error) { console.error("[nivora-discord] Telegram /done listener failed", error); }
    finally { polling = false; }
  };
  void poll();
  const timer = setInterval(() => { void poll(); }, 10_000);
  return () => clearInterval(timer);
}

function performanceMessage(notification: PerformanceNotification) {
  const text = t(notification.language);
  if (notification.type === "registration") return { title: text.registration, description: text.registrationText(notification.brandName) };
  if (notification.type === "ftd") return { title: text.ftd, description: text.ftdText(currency(notification.amount), notification.brandName) };
  if (notification.depositNumber && notification.playerTotal !== null) {
    return { title: text.deposit, description: text.depositText(notification.depositNumber, currency(notification.amount), currency(notification.playerTotal)) };
  }
  return { title: text.deposit, description: text.depositSimple(currency(notification.amount), notification.brandName) };
}

function startPerformanceNotifier(client: Client, env: NivoraDiscordEnv) {
  let running = false;
  const flush = async () => {
    if (running) return;
    running = true;
    try {
      const result = await api<{ notifications: PerformanceNotification[] }>(env, { action: "pending-discord-notifications" });
      const sentIds: string[] = [];
      for (const notification of result.notifications ?? []) {
        if (!notification.enabled) { sentIds.push(notification.id); continue; }
        const channel = await client.channels.fetch(notification.ticketChannelId!).catch(() => null);
        if (channel?.type !== ChannelType.GuildText) continue;
        const message = performanceMessage(notification);
        await channel.send({
          content: `<@${notification.discordUserId}>`,
          embeds: [new EmbedBuilder().setColor(0x35D6B5).setTitle(message.title).setDescription(message.description)],
        });
        sentIds.push(notification.id);
      }
      if (sentIds.length) await api(env, { action: "mark-discord-notifications-sent", ids: sentIds });
    } catch (error) { console.error("[nivora-discord] performance notifier failed", error); }
    finally { running = false; }
  };
  void flush();
  const timer = setInterval(() => { void flush(); }, 5_000);
  return () => clearInterval(timer);
}

export async function startNivoraDiscordBot(env: NivoraDiscordEnv): Promise<() => Promise<void>> {
  console.log("[nivora-discord] configuration", {
    hasToken: Boolean(env.NIVORA_DISCORD_BOT_TOKEN),
    hasGuildId: Boolean(env.NIVORA_DISCORD_GUILD_ID),
    hasApiBase: Boolean(env.NIVORA_API_BASE),
    hasInternalKey: Boolean(env.NIVORA_BOT_INTERNAL_KEY),
  });
  if (!env.NIVORA_DISCORD_BOT_TOKEN && !env.NIVORA_DISCORD_GUILD_ID) {
    console.warn("[nivora-discord] disabled: missing token and guild ID");
    return async () => {};
  }
  if (!env.NIVORA_DISCORD_BOT_TOKEN || !env.NIVORA_DISCORD_GUILD_ID) throw new Error("Nivora Discord requires token and guild ID.");
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  // These handlers must exist before login: otherwise a disconnect before the
  // READY payload gets flattened into an unhelpful 90-second timeout.
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`[nivora-discord] gateway disconnected (shard=${shardId}, code=${event.code}, reason=${event.reason || "none"})`);
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    console.warn(`[nivora-discord] gateway reconnecting (shard=${shardId})`);
  });
  client.on(Events.ShardError, (error, shardId) => {
    console.error(`[nivora-discord] gateway error (shard=${shardId})`, error);
  });
  client.on(Events.Debug, (message) => {
    if (/gateway|identif|ready|invalid|disconnect/i.test(message)) console.log(`[nivora-discord] ${message}`);
  });
  let stopped = false;
  let connecting = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    // A 429/1015 from Discord's edge is an IP-level temporary block. Retrying
    // every few seconds only extends it, so back off from one minute to 15 min.
    const delay = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(reconnectAttempts, 4));
    reconnectAttempts += 1;
    console.warn(`[nivora-discord] next gateway attempt in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void connect(); }, delay);
  };
  const connect = async () => {
    if (stopped || connecting || client.isReady()) return;
    connecting = true;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => fail(new Error("Gateway did not become ready after 90 seconds")), 90_000);
        const cleanup = () => {
          clearTimeout(timeout);
          client.off(Events.ClientReady, ready);
          client.off(Events.Error, fail);
        };
        const ready = () => { reconnectAttempts = 0; cleanup(); resolve(); };
        const fail = (error: Error) => { cleanup(); reject(error); };
        client.once(Events.ClientReady, ready);
        client.once(Events.Error, fail);
        void client.login(env.NIVORA_DISCORD_BOT_TOKEN).catch(fail);
      });
    } catch (error) {
      console.error("[nivora-discord] login failed", error);
      client.destroy();
      scheduleReconnect();
    } finally { connecting = false; }
  };
  const commands = [
    new SlashCommandBuilder().setName("nivora").setDescription("NivoraNet tools").setDescriptionLocalizations({ fr: "Outils NivoraNet", de: "NivoraNet-Tools" }).addSubcommand((s) => s.setName("status").setDescription("Check bot status").setDescriptionLocalizations({ fr: "Vérifier le statut du bot", de: "Bot-Status prüfen" })),
    new SlashCommandBuilder().setName("link").setDescription("Link an existing NivoraNet account").setDescriptionLocalizations({ fr: "Lier un compte NivoraNet existant", de: "Bestehendes NivoraNet-Konto verknüpfen" }),
    new SlashCommandBuilder().setName("refill").setDescription("Request your daily casino refill").setDescriptionLocalizations({ fr: "Demander ton refill casino quotidien", de: "Täglichen Casino-Refill anfordern" }),
    new SlashCommandBuilder().setName("refill-batch").setDescription("Send the current refill batch to Telegram").setDescriptionLocalizations({ fr: "Envoyer le batch actuel vers Telegram", de: "Aktuellen Refill-Batch an Telegram senden" }),
    new SlashCommandBuilder().setName("notifications").setDescription("Choose your performance alerts").setDescriptionLocalizations({ fr: "Choisir les alertes de performance", de: "Performance-Benachrichtigungen wählen" }),
    new SlashCommandBuilder().setName("stats").setDescription("View current month performance").setDescriptionLocalizations({ fr: "Voir les performances du mois", de: "Performance dieses Monats ansehen" }).addUserOption((option) => option.setName("affiliate").setDescription("Affiliate to view (admin only)").setDescriptionLocalizations({ fr: "Affilié à consulter (admin)", de: "Affiliate anzeigen (Admin)" }).setRequired(false)),
    new SlashCommandBuilder().setName("help").setDescription("View NivoraNet commands").setDescriptionLocalizations({ fr: "Voir les commandes NivoraNet", de: "NivoraNet-Befehle ansehen" }),
  ];
  client.once(Events.ClientReady, async (ready) => {
    try {
      const guild = await ready.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
      await ready.application?.commands.set(commands.map((command) => command.toJSON()), guild.id);
      // Public information must remain available even if the internal API is
      // temporarily unavailable during a deploy or a key rotation.
      await syncPublicPanels(client, env).catch((error) => console.error("[nivora-discord] public panel sync failed", error));
      await syncTicketNames(client, env).catch((error) => console.error("[nivora-discord] ticket name sync failed", error));
      console.log(`[nivora-discord] connected as ${ready.user.tag} on ${guild.name}`);
    } catch (error) { console.error("[nivora-discord] startup failed", error); }
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "nivora") {
        await interaction.reply({ content: "NivoraNet is connected and ready.\nNivoraNet est connecté et prêt.\nNivoraNet ist verbunden und bereit.", ephemeral: true });
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "link") {
        await interaction.showModal(linkExistingModal());
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "refill") {
        await beginRefill(interaction, env);
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "notifications") {
        await openNotificationSettings(interaction, env);
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "stats") {
        const target = interaction.options.getUser("affiliate");
        if (target && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void interaction.reply({ content: "Admin only. / Réservé aux administrateurs. / Nur für Administratoren.", ephemeral: true });
        await sendStats(interaction, env, target?.id);
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "help") {
        await sendHelp(interaction, env);
        return;
      }
      if (interaction.isStringSelectMenu() && interaction.customId === "nivora:notification-settings") {
        await api(env, { action: "update-notification-settings", discordUserId: interaction.user.id, values: interaction.values });
        const settings = await api<NotificationSettings>(env, { action: "notification-settings", discordUserId: interaction.user.id });
        await interaction.update(notificationPanel(settings));
        return;
      }
        if (interaction.isChatInputCommand() && interaction.commandName === "refill-batch") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void interaction.reply({ content: "Admin only. / Réservé aux administrateurs. / Nur für Administratoren.", ephemeral: true });
          if (refillsViaAurix) return void interaction.reply({ content: "NivoraNet refills are included in the shared Aurix batch sent at 10:00 Paris time.\nLes refills NivoraNet sont inclus dans le batch Aurix partagé envoyé à 10h, heure de Paris.\nNivoraNet-Refills sind im gemeinsamen Aurix-Batch um 10:00 Uhr (Paris) enthalten.", ephemeral: true });
          await interaction.deferReply({ ephemeral: true });
        const result = await dispatchRefillBatch(env, true);
        return void interaction.editReply(result.empty ? "There is no open refill batch to send." : `Sent ${result.count} refill request${result.count === 1 ? "" : "s"} to Telegram.`);
      }
      if (interaction.isStringSelectMenu() && interaction.customId === "nivora:refill-brand") {
        await beginRefill(interaction, env, interaction.values[0]);
        return;
      }
      if (interaction.isButton() && interaction.customId === APPLY_BUTTON) {
        await interaction.showModal(applicationModal());
        return;
      }
      if (interaction.isButton() && interaction.customId === LINK_EXISTING_BUTTON) {
        await interaction.showModal(linkExistingModal());
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId === "nivora:application") {
        await interaction.deferReply({ ephemeral: true });
        const submittedLanguage = interaction.fields.getTextInputValue("language");
        const result = await api<{ profileId: string; username: string; twitchUrl: string; language: string }>(env, { action: "apply", discordUserId: interaction.user.id, discordUsername: interaction.user.username, username: interaction.fields.getTextInputValue("username"), email: interaction.fields.getTextInputValue("email"), password: interaction.fields.getTextInputValue("password"), twitchUrl: interaction.fields.getTextInputValue("twitch"), language: submittedLanguage });
        await publishApplicationEntry(client, env, { ...result, discordUsername: interaction.user.username });
        return void interaction.editReply(t(submittedLanguage).applicationReceived);
      }
      if (interaction.isModalSubmit() && interaction.customId === "nivora:link-existing") {
        await interaction.deferReply({ ephemeral: true });
        const result = await api<{ profileId: string; username: string; status: string; language?: string }>(env, {
          action: "link-existing", discordUserId: interaction.user.id, discordUsername: interaction.user.username,
          email: interaction.fields.getTextInputValue("email"), password: interaction.fields.getTextInputValue("password"),
        });
        if (result.status !== "approved") return void interaction.editReply(t(result.language).linkedPending);
        const guild = interaction.guild!;
        const member = await guild.members.fetch(interaction.user.id);
        const affiliateRole = guild.roles.cache.find((role) => role.name === "Affiliate");
        if (affiliateRole) await member.roles.add(affiliateRole);
        await createPrivateTicket(client, env, result.profileId, interaction.user.id, result.username, result.language);
        return void interaction.editReply(t(result.language).linkedReady(result.username));
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("nivora:refill-account:")) {
        await interaction.deferReply({ ephemeral: true });
        const brandId = interaction.customId.split(":")[2];
        await api(env, {
          action: "save-refill-account", discordUserId: interaction.user.id, brandId,
          casinoEmail: interaction.fields.getTextInputValue("casino_email"), casinoUsername: interaction.fields.getTextInputValue("casino_username"),
        });
        const result = await api<{ brandName: string; amount: number; cutoffAt: string }>(env, { action: "request-refill", discordUserId: interaction.user.id, brandId });
        const context = await api<RefillContext>(env, { action: "refill-context", discordUserId: interaction.user.id });
        const text = t(context.language);
        const language = nivoraLanguage(context.language);
        const when = new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : language === "de" ? "de-DE" : "en-GB", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.cutoffAt));
        const channel = interaction.channel;
        if (channel?.type === ChannelType.GuildText) await channel.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle(text.refillRequested).setDescription(`**${result.brandName}** · **${currency(result.amount)}**\n${text.queued}: **${when} (Paris)**.`).setFooter({ text: text.dailyLimit })] });
        return void interaction.editReply(text.refillSaved);
      }
      if (interaction.isButton() && interaction.customId.startsWith("nivora:approve:")) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void interaction.reply({ content: "Admin only. / Réservé aux administrateurs. / Nur für Administratoren.", ephemeral: true });
        await interaction.deferUpdate(); const profileId = interaction.customId.split(":")[2]; const result = await api<{ discordUserId: string; language?: string }>(env, { action: "approve", profileId });
        const guild = interaction.guild!; const member = await guild.members.fetch(result.discordUserId); const affiliateRole = guild.roles.cache.find((role) => role.name === "Affiliate"); if (affiliateRole) await member.roles.add(affiliateRole);
        const account = await api<{ profileName: string; language?: string }>(env, { action: "affiliate-stats", discordUserId: result.discordUserId });
        await createPrivateTicket(client, env, profileId, result.discordUserId, account.profileName, result.language ?? account.language);
        return void interaction.editReply({ components: [], embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x35D6B5).setTitle("Application approved · Candidature validée · Bewerbung genehmigt")] });
      }
      if (interaction.isButton() && interaction.customId.startsWith("nivora:reject:")) return void interaction.reply({ content: "Application rejected. / Candidature refusée. / Bewerbung abgelehnt.", ephemeral: true });
    } catch (error) {
      console.error("[nivora-discord] interaction failed", error);
      if (interaction.isRepliable()) {
        const reply = { content: "Unable to complete this action. Please try again or ask the team in your ticket.\nImpossible d’effectuer cette action. Réessaie ou contacte l’équipe dans ton ticket.\nAktion konnte nicht abgeschlossen werden. Bitte versuche es erneut oder frage das Team in deinem Ticket.", ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.editReply(reply); else await interaction.reply(reply);
      }
    }
  });
  client.on(Events.ShardDisconnect, () => scheduleReconnect());
    const stopTelegramDoneListener = refillsViaAurix ? () => {} : startTelegramDoneListener(client, env);
    const stopPerformanceNotifier = startPerformanceNotifier(client, env);
    const refillTimer = refillsViaAurix ? null : setInterval(() => {
    void dispatchRefillBatch(env).then((result) => {
      if (!result.empty) console.log(`[nivora-discord] dispatched ${result.count} refill request(s)`);
    }).catch((error) => console.error("[nivora-discord] automatic refill dispatch failed", error));
  }, 60_000);
  void connect();
  return async () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refillTimer) clearInterval(refillTimer);
    stopTelegramDoneListener();
    stopPerformanceNotifier();
    client.destroy();
  };
}
