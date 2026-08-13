import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder,
  Events, GatewayIntentBits, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  TextInputBuilder, TextInputStyle,
} from "discord.js";
import type { BotEnv } from "../env.js";

const GOLD = 0xDDB65A;
const APPLY_BUTTON = "nivora:apply";

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

async function api<T>(env: BotEnv, body: Record<string, unknown>): Promise<T> {
  if (!env.NIVORA_API_BASE || !env.NIVORA_BOT_INTERNAL_KEY) throw new Error("Nivora API configuration missing.");
  const response = await fetch(`${env.NIVORA_API_BASE}/api/internal/discord`, {
    method: "POST", headers: { "content-type": "application/json", "x-nivora-bot-key": env.NIVORA_BOT_INTERNAL_KEY }, body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Nivora API error.");
  return data as T;
}

async function publishApplicationEntry(client: Client, env: BotEnv, data: { profileId: string; username: string; twitchUrl: string; language: string; discordUsername: string }) {
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

async function createPrivateTicket(client: Client, env: BotEnv, profileId: string, discordUserId: string) {
  const guild = await client.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
  const category = guild.channels.cache.find((item) => item.name === "━━ PRIVATE TICKETS ━━" && item.type === ChannelType.GuildCategory);
  if (!category) throw new Error("Ticket category not found.");
  const channel = await guild.channels.create({
    name: `💎・${discordUserId}`, type: ChannelType.GuildText, parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: discordUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });
  await channel.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle("Welcome to NivoraNet").setDescription("This is your permanent private ticket. Use it for support and refill operations.\n\nYour NivoraNet dashboard is ready with the email and password used during your application.")] });
  await api(env, { action: "set-ticket", profileId, ticketChannelId: channel.id });
}

export async function startNivoraDiscordBot(env: BotEnv): Promise<() => Promise<void>> {
  if (!env.NIVORA_DISCORD_BOT_TOKEN && !env.NIVORA_DISCORD_GUILD_ID) return async () => {};
  if (!env.NIVORA_DISCORD_BOT_TOKEN || !env.NIVORA_DISCORD_GUILD_ID) throw new Error("Nivora Discord requires token and guild ID.");
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const connectionWatchdog = setTimeout(() => {
    if (!client.isReady()) console.error("[nivora-discord] gateway connection is still pending after 15 seconds");
  }, 15_000);
  const command = new SlashCommandBuilder().setName("nivora").setDescription("NivoraNet tools").addSubcommand((s) => s.setName("status").setDescription("Check bot status"));
  client.once(Events.ClientReady, async (ready) => {
    try {
      clearTimeout(connectionWatchdog);
      const guild = await ready.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
      await ready.application?.commands.set([command.toJSON()], guild.id);
      console.log(`[nivora-discord] connected as ${ready.user.tag} on ${guild.name}`);
    } catch (error) { console.error("[nivora-discord] startup failed", error); }
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "nivora") {
        await interaction.reply({ content: "NivoraNet is connected and ready.", ephemeral: true });
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
      if (interaction.isButton() && interaction.customId.startsWith("nivora:approve:")) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void interaction.reply({ content: "Admin only.", ephemeral: true });
        await interaction.deferUpdate(); const profileId = interaction.customId.split(":")[2]; const result = await api<{ discordUserId: string }>(env, { action: "approve", profileId });
        const guild = interaction.guild!; const member = await guild.members.fetch(result.discordUserId); const affiliateRole = guild.roles.cache.find((role) => role.name === "Affiliate"); if (affiliateRole) await member.roles.add(affiliateRole);
        await createPrivateTicket(client, env, profileId, result.discordUserId);
        return void interaction.editReply({ components: [], embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x35D6B5).setTitle("Application approved")] });
      }
      if (interaction.isButton() && interaction.customId.startsWith("nivora:reject:")) return void interaction.reply({ content: "Application rejected. The refusal workflow will be added with the operational panel.", ephemeral: true });
    } catch (error) { console.error("[nivora-discord] interaction failed", error); if (interaction.isRepliable()) { const reply = { content: `Unable to complete this action: ${error instanceof Error ? error.message : "unknown error"}`, ephemeral: true }; if (interaction.deferred || interaction.replied) await interaction.editReply(reply); else await interaction.reply(reply); } }
  });
  void client.login(env.NIVORA_DISCORD_BOT_TOKEN).catch((error) => console.error("[nivora-discord] login failed", error));
  return async () => { clearTimeout(connectionWatchdog); client.destroy(); };
}
