import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder,
  Events, GatewayIntentBits, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} from "discord.js";
import type { BotEnv } from "../env.js";

const GOLD = 0xDDB65A;
const APPLY_BUTTON = "nivora:apply";

export type NivoraDiscordEnv = Pick<BotEnv,
  "NIVORA_DISCORD_BOT_TOKEN" | "NIVORA_DISCORD_GUILD_ID" | "NIVORA_API_BASE" |
  "NIVORA_BOT_INTERNAL_KEY" | "NIVORA_TELEGRAM_BOT_TOKEN" | "NIVORA_TELEGRAM_REFILL_CHAT_ID"
>;

const refillsViaAurix = process.env.NIVORA_REFILLS_VIA_AURIX === "1";

type RefillBrand = { id: string; name: string; account: { casino_email: string | null; casino_username: string | null; refill_amount: number | string | null } | null };
type RefillContext = { profileId: string; ticketChannelId: string | null; brands: RefillBrand[] };
type RefillBatch = {
  batch: { id: string; cutoff_at: string };
  requests: Array<{ amount: number | string; wager: string | null; casino_email: string; casino_username: string; brand: { name: string } | null; profile: { username: string } | null }>;
};
type RefillCompletion = { empty: boolean; notifications?: Array<{ brandName: string; amount: number; discordUserId: string; ticketChannelId: string }> };
type NotificationSettings = { ticket_channel_id: string | null; notify_registration: boolean; notify_ftd: boolean; notify_deposit: boolean };
type PerformanceNotification = { id: string; type: "registration" | "ftd" | "deposit"; amount: number; depositNumber: number | null; playerTotal: number | null; brandName: string; discordUserId: string | null; ticketChannelId: string | null; enabled: boolean };
type AffiliateStats = { profileName: string; ticketChannelId: string | null; monthStart: string; brands: Array<{ brandName: string; clicks: number; registrations: number; ftd: number; deposits: number; depositVolume: number; rs: number; earnings: number }> };

function applicationModal() {
  const field = (id: string, label: string, style: TextInputStyle, required = true, placeholder?: string) =>
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setPlaceholder(placeholder ?? "");
  return new ModalBuilder().setCustomId("nivora:application").setTitle("Apply to NivoraNet").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("username", "Username / Creator name", TextInputStyle.Short)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("email", "Email", TextInputStyle.Short, true, "you@example.com")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("password", "Password for your NivoraNet account", TextInputStyle.Short, true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("twitch", "Twitch channel link", TextInputStyle.Short, true, "https://twitch.tv/...")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("language", "Preferred language", TextInputStyle.Short, true, "English / French / German")),
  );
}

function linkExistingModal() {
  const field = (id: string, label: string, placeholder: string) => new TextInputBuilder()
    .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(placeholder);
  return new ModalBuilder().setCustomId("nivora:link-existing").setTitle("Link existing NivoraNet account").addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("email", "NivoraNet account email", "you@example.com")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("password", "NivoraNet account password", "Your password")),
  );
}

function refillAccountModal(brandId: string, brandName: string) {
  const field = (id: string, label: string, placeholder: string) => new TextInputBuilder()
    .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(placeholder);
  return new ModalBuilder().setCustomId(`nivora:refill-account:${brandId}`).setTitle(`Refill details · ${brandName}`).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("casino_email", "Casino account email", "email@example.com")),
    new ActionRowBuilder<TextInputBuilder>().addComponents(field("casino_username", "Casino account username", "Your casino username")),
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
  const embed = new EmbedBuilder().setColor(GOLD).setTitle("New affiliate application").addFields(
    { name: "Creator", value: data.username, inline: true }, { name: "Language", value: data.language, inline: true },
    { name: "Discord", value: data.discordUsername, inline: true }, { name: "Twitch", value: data.twitchUrl },
  ).setFooter({ text: `Profile ${data.profileId}` });
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`nivora:approve:${data.profileId}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`nivora:reject:${data.profileId}`).setLabel("Reject").setStyle(ButtonStyle.Danger),
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

async function createPrivateTicket(client: Client, env: NivoraDiscordEnv, profileId: string, discordUserId: string, username: string) {
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
  await channel.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle("Welcome to NivoraNet").setDescription("This is your permanent private ticket for support, refills and performance alerts.\n\nUseful commands:\n`/refill` - request your daily refill\n`/notifications` - choose performance alerts\n`/stats` - view the current month, from the 1st to today\n`/help` - view this guide again\n\nYour dashboard uses the email and password from your application.")] });
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

function hasRefillDetails(brand: RefillBrand) {
  return Boolean(brand.account?.casino_email && brand.account?.casino_username);
}

async function queueRefill(interaction: any, env: NivoraDiscordEnv, brandId: string) {
  await interaction.deferReply({ ephemeral: true });
  const result = await api<{ brandName: string; amount: number; cutoffAt: string }>(env, {
    action: "request-refill", discordUserId: interaction.user.id, brandId,
  });
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.cutoffAt));
  const channel = interaction.channel;
  if (channel?.isTextBased()) await channel.send({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle("Refill requested").setDescription(`**${result.brandName}** · **$${result.amount.toFixed(2)}**\nQueued for the next refill batch: **${when} (Paris)**.`).setFooter({ text: "One refill per brand per day" })],
  });
  await interaction.editReply("Your refill request has been added to the next batch.");
}

async function beginRefill(interaction: any, env: NivoraDiscordEnv, brandId?: string) {
  const context = await api<RefillContext>(env, { action: "refill-context", discordUserId: interaction.user.id });
  if (!context.ticketChannelId || interaction.channelId !== context.ticketChannelId) {
    await interaction.reply({ content: "Use `/refill` in your private NivoraNet ticket.", ephemeral: true });
    return;
  }
  if (!context.brands.length) {
    await interaction.reply({ content: "No active brand is assigned to your account yet.", ephemeral: true });
    return;
  }
  if (!brandId && context.brands.length > 1) {
    const menu = new StringSelectMenuBuilder().setCustomId("nivora:refill-brand").setPlaceholder("Choose the brand for this refill").addOptions(
      context.brands.map((brand) => ({ label: brand.name, value: brand.id, description: hasRefillDetails(brand) ? "Request your daily refill" : "Account details required first" })),
    );
    await interaction.reply({ content: "Choose the brand you want to refill.", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], ephemeral: true });
    return;
  }
  const brand = context.brands.find((item) => item.id === (brandId ?? context.brands[0].id));
  if (!brand) throw new Error("Brand not found.");
  if (!hasRefillDetails(brand)) {
    await interaction.showModal(refillAccountModal(brand.id, brand.name));
    return;
  }
  await queueRefill(interaction, env, brand.id);
}

function notificationPanel(settings: NotificationSettings) {
  const selected = new Set([
    settings.notify_registration ? "registration" : null,
    settings.notify_ftd ? "ftd" : null,
    settings.notify_deposit ? "deposit" : null,
  ]);
  const menu = new StringSelectMenuBuilder().setCustomId("nivora:notification-settings").setPlaceholder("Choose your performance alerts").setMinValues(0).setMaxValues(3).addOptions(
    { label: "Registrations", value: "registration", description: "New casino registrations", default: selected.has("registration") },
    { label: "FTDs", value: "ftd", description: "First-time deposits", default: selected.has("ftd") },
    { label: "Deposits", value: "deposit", description: "Later player deposits", default: selected.has("deposit") },
  );
  return {
    content: "Performance alerts\nSelect every alert you want to receive in this private ticket. Leave all choices empty to turn alerts off.",
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  };
}

async function openNotificationSettings(interaction: any, env: NivoraDiscordEnv) {
  const settings = await api<NotificationSettings>(env, { action: "notification-settings", discordUserId: interaction.user.id });
  if (!settings.ticket_channel_id || interaction.channelId !== settings.ticket_channel_id) {
    await interaction.reply({ content: "Use `/notifications` in your private NivoraNet ticket.", ephemeral: true });
    return;
  }
  await interaction.reply({ ...notificationPanel(settings), ephemeral: true });
}

function currency(value: number) { return `$${value.toFixed(2)}`; }

async function sendStats(interaction: any, env: NivoraDiscordEnv, targetDiscordUserId?: string) {
  const target = targetDiscordUserId ?? interaction.user.id;
  const stats = await api<AffiliateStats>(env, { action: "affiliate-stats", discordUserId: interaction.user.id, targetDiscordUserId: target });
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && (!stats.ticketChannelId || interaction.channelId !== stats.ticketChannelId)) {
    await interaction.reply({ content: "Use `/stats` in your private NivoraNet ticket.", ephemeral: true });
    return;
  }
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", month: "long", year: "numeric" }).format(new Date(stats.monthStart));
  const fields = stats.brands.map((brand) => ({
    name: brand.brandName,
    value: `Clicks: **${brand.clicks}** | Registrations: **${brand.registrations}** | FTDs: **${brand.ftd}**\nDeposits: **${brand.deposits}** | Volume: **${currency(brand.depositVolume)}** | RS: **${currency(brand.rs)}** | Earnings: **${currency(brand.earnings)}**`,
  }));
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`Current month statistics - ${stats.profileName}`).setDescription(`From 1 ${month} to now.`).addFields(fields.length ? fields : [{ name: "No active brands", value: "No deal is currently assigned." }])],
    ephemeral: !isAdmin,
  });
}

async function sendHelp(interaction: any) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle("NivoraNet commands").setDescription("Use these commands in your permanent private ticket.").addFields(
      { name: "/refill", value: "Request your daily fake balance for each eligible brand." },
      { name: "/notifications", value: "Choose registration, FTD and deposit alerts." },
      { name: "/stats", value: "View your performance from the 1st of the current month until today." },
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
      `${index + 1}. ${request.casino_username} - ${request.casino_email} - $${Number(request.amount).toFixed(2)}`,
    );
    return `${brand}\n${lines.join("\n")}`;
  });
  return [
    "Hello Sam,",
    `Here is today's refill list - ${date}:`,
    `${batch.requests.length} request${batch.requests.length === 1 ? "" : "s"} - total refill: $${total.toFixed(2)}`,
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
    if (!channel?.isSendable()) continue;
    await channel.send({
      content: `<@${notification.discordUserId}>`,
      embeds: [new EmbedBuilder().setColor(0x35D6B5).setTitle("Refill completed").setDescription(`Your ${notification.brandName} refill of $${notification.amount.toFixed(2)} has been completed.`)],
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
  if (notification.type === "registration") return { title: "New registration", description: `A new registration has been detected for ${notification.brandName}.` };
  if (notification.type === "ftd") return { title: "New FTD", description: `A first-time deposit of $${notification.amount.toFixed(2)} has been detected for ${notification.brandName}.` };
  if (notification.depositNumber && notification.playerTotal !== null) {
    return { title: "New deposit", description: `A player made their ${notification.depositNumber}${notification.depositNumber === 1 ? "st" : notification.depositNumber === 2 ? "nd" : notification.depositNumber === 3 ? "rd" : "th"} deposit: $${notification.amount.toFixed(2)} / Total: $${notification.playerTotal.toFixed(2)}.` };
  }
  return { title: "New deposit", description: `A player made a deposit of $${notification.amount.toFixed(2)} for ${notification.brandName}.` };
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
        if (!channel?.isSendable()) continue;
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
  let stopped = false;
  let connecting = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void connect(); }, 5_000);
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
        const ready = () => { cleanup(); resolve(); };
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
    new SlashCommandBuilder().setName("nivora").setDescription("NivoraNet tools").addSubcommand((s) => s.setName("status").setDescription("Check bot status")),
    new SlashCommandBuilder().setName("link").setDescription("Link an existing NivoraNet account"),
    new SlashCommandBuilder().setName("refill").setDescription("Request your daily casino refill"),
    new SlashCommandBuilder().setName("refill-batch").setDescription("Send the current refill batch to Telegram"),
    new SlashCommandBuilder().setName("notifications").setDescription("Choose your performance alerts"),
    new SlashCommandBuilder().setName("stats").setDescription("View current month performance").addUserOption((option) => option.setName("affiliate").setDescription("Affiliate to view (admin only)").setRequired(false)),
    new SlashCommandBuilder().setName("help").setDescription("View NivoraNet commands"),
  ];
  client.once(Events.ClientReady, async (ready) => {
    try {
      const guild = await ready.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
      await ready.application?.commands.set(commands.map((command) => command.toJSON()), guild.id);
      await syncTicketNames(client, env);
      console.log(`[nivora-discord] connected as ${ready.user.tag} on ${guild.name}`);
    } catch (error) { console.error("[nivora-discord] startup failed", error); }
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "nivora") {
        await interaction.reply({ content: "NivoraNet is connected and ready.", ephemeral: true });
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
        if (target && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void interaction.reply({ content: "Admin only.", ephemeral: true });
        await sendStats(interaction, env, target?.id);
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "help") {
        await sendHelp(interaction);
        return;
      }
      if (interaction.isStringSelectMenu() && interaction.customId === "nivora:notification-settings") {
        await api(env, { action: "update-notification-settings", discordUserId: interaction.user.id, values: interaction.values });
        const settings = await api<NotificationSettings>(env, { action: "notification-settings", discordUserId: interaction.user.id });
        await interaction.update(notificationPanel(settings));
        return;
      }
        if (interaction.isChatInputCommand() && interaction.commandName === "refill-batch") {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void interaction.reply({ content: "Admin only.", ephemeral: true });
          if (refillsViaAurix) return void interaction.reply({ content: "NivoraNet refills are included in the shared Aurix batch sent at 10:00 Paris time.", ephemeral: true });
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
      if (interaction.isModalSubmit() && interaction.customId === "nivora:application") {
        await interaction.deferReply({ ephemeral: true });
        const result = await api<{ profileId: string; username: string; twitchUrl: string; language: string }>(env, { action: "apply", discordUserId: interaction.user.id, discordUsername: interaction.user.username, username: interaction.fields.getTextInputValue("username"), email: interaction.fields.getTextInputValue("email"), password: interaction.fields.getTextInputValue("password"), twitchUrl: interaction.fields.getTextInputValue("twitch"), language: interaction.fields.getTextInputValue("language") });
        await publishApplicationEntry(client, env, { ...result, discordUsername: interaction.user.username });
        return void interaction.editReply("Your application has been received. You will be notified here once it has been reviewed.");
      }
      if (interaction.isModalSubmit() && interaction.customId === "nivora:link-existing") {
        await interaction.deferReply({ ephemeral: true });
        const result = await api<{ profileId: string; username: string; status: string }>(env, {
          action: "link-existing", discordUserId: interaction.user.id, discordUsername: interaction.user.username,
          email: interaction.fields.getTextInputValue("email"), password: interaction.fields.getTextInputValue("password"),
        });
        if (result.status !== "approved") return void interaction.editReply("Your NivoraNet account is linked. It is still awaiting admin approval.");
        const guild = interaction.guild!;
        const member = await guild.members.fetch(interaction.user.id);
        const affiliateRole = guild.roles.cache.find((role) => role.name === "Affiliate");
        if (affiliateRole) await member.roles.add(affiliateRole);
        await createPrivateTicket(client, env, result.profileId, interaction.user.id, result.username);
        return void interaction.editReply(`Your **${result.username}** account is linked. Your private ticket is ready.`);
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("nivora:refill-account:")) {
        await interaction.deferReply({ ephemeral: true });
        const brandId = interaction.customId.split(":")[2];
        await api(env, {
          action: "save-refill-account", discordUserId: interaction.user.id, brandId,
          casinoEmail: interaction.fields.getTextInputValue("casino_email"), casinoUsername: interaction.fields.getTextInputValue("casino_username"),
        });
        const result = await api<{ brandName: string; amount: number; cutoffAt: string }>(env, { action: "request-refill", discordUserId: interaction.user.id, brandId });
        const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.cutoffAt));
        const channel = interaction.channel;
        if (channel?.isSendable()) await channel.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle("Refill requested").setDescription(`**${result.brandName}** · **$${result.amount.toFixed(2)}**\nQueued for the next refill batch: **${when} (Paris)**.`).setFooter({ text: "One refill per brand per day" })] });
        return void interaction.editReply("Your casino details were saved and your refill request was added to the next batch.");
      }
      if (interaction.isButton() && interaction.customId.startsWith("nivora:approve:")) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void interaction.reply({ content: "Admin only.", ephemeral: true });
        await interaction.deferUpdate(); const profileId = interaction.customId.split(":")[2]; const result = await api<{ discordUserId: string }>(env, { action: "approve", profileId });
        const guild = interaction.guild!; const member = await guild.members.fetch(result.discordUserId); const affiliateRole = guild.roles.cache.find((role) => role.name === "Affiliate"); if (affiliateRole) await member.roles.add(affiliateRole);
        const account = await api<{ profileName: string }>(env, { action: "affiliate-stats", discordUserId: result.discordUserId });
        await createPrivateTicket(client, env, profileId, result.discordUserId, account.profileName);
        return void interaction.editReply({ components: [], embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x35D6B5).setTitle("Application approved")] });
      }
      if (interaction.isButton() && interaction.customId.startsWith("nivora:reject:")) return void interaction.reply({ content: "Application rejected. The refusal workflow will be added with the operational panel.", ephemeral: true });
    } catch (error) { console.error("[nivora-discord] interaction failed", error); if (interaction.isRepliable()) { const reply = { content: `Unable to complete this action: ${error instanceof Error ? error.message : "unknown error"}`, ephemeral: true }; if (interaction.deferred || interaction.replied) await interaction.editReply(reply); else await interaction.reply(reply); } }
  });
  client.on("shardDisconnect", () => { console.warn("[nivora-discord] gateway disconnected"); scheduleReconnect(); });
  client.on("shardError", (error) => console.error("[nivora-discord] gateway error", error));
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
