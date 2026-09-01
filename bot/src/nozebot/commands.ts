import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
} from "discord.js";
import {
  LunaLiveApiError,
  claimLunaLiveDaily,
  fetchLunaLiveProfile,
  requestLunaLiveLink,
  type LunaLiveApiConfig,
  type LunaLiveProfile,
} from "./lunalive-api.js";

export type NozeBotCommandConfig = {
  guildId: string;
  commandsChannelId: string;
  lunaLive: LunaLiveApiConfig;
};

const COMMANDS = [
  new SlashCommandBuilder().setName("link").setDescription("Lier ton compte Discord à LunaLive"),
  new SlashCommandBuilder().setName("claim").setDescription("Récupérer tes Rubis LunaLive quotidiens"),
  new SlashCommandBuilder().setName("solde").setDescription("Afficher tes Rubis et ton niveau LunaLive"),
  new SlashCommandBuilder().setName("profil").setDescription("Afficher ton profil LunaLive complet"),
  new SlashCommandBuilder().setName("succes").setDescription("Afficher tes succès LunaLive"),
];

const COMMAND_NAMES = new Set(COMMANDS.map((command) => command.name));

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("fr-FR");
}

function fmtDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h${minutes}` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}j${remainingHours}h` : `${days}j`;
}

function progressBar(percent: number, width = 12): string {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent || 0))));
  const filled = Math.round((value / 100) * width);
  return `${"▰".repeat(filled)}${"▱".repeat(width - filled)} **${value}%**`;
}

function discordTimestamp(value: string, style: "R" | "F" = "R"): string {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? `<t:${Math.floor(timestamp / 1000)}:${style}>` : "bientôt";
}

function achievementLine(profile: LunaLiveProfile): string {
  const tiers = profile.achievementsByTier;
  return `🥉 ${tiers.bronze.unlocked}/${tiers.bronze.total} · ` +
    `🥈 ${tiers.silver.unlocked}/${tiers.silver.total} · ` +
    `🥇 ${tiers.gold.unlocked}/${tiers.gold.total} · ` +
    `👑 ${tiers.master.unlocked}/${tiers.master.total}`;
}

export function buildProfileEmbed(profile: LunaLiveProfile, avatarUrl: string): EmbedBuilder {
  const created = profile.createdAt ? discordTimestamp(profile.createdAt) : "—";
  return new EmbedBuilder()
    .setColor(0x9d7cff)
    .setAuthor({
      name: "LUNALIVE • PROFIL CONNECTÉ",
      iconURL: "https://lunalive.win/lunalive_logo_sphere_512.png",
    })
    .setTitle(profile.username)
    .setThumbnail(avatarUrl)
    .setDescription(
      `**Niveau ${profile.level}** · ${profile.levelTitle}\n` +
      `${progressBar(profile.pctToNext)}\n` +
      (profile.isMaxLevel ? "⭐ Niveau maximal" : `Encore **${fmt(profile.xpToNext)} XP** avant le niveau ${profile.level + 1}`)
    )
    .addFields(
      {
        name: "💎 Économie",
        value: `**${fmt(profile.rubis)} Rubis**\n+${fmt(profile.rubisEarnedTotal)} gagnés\n−${fmt(profile.rubisSpentTotal)} dépensés`,
        inline: true,
      },
      {
        name: "🏆 Récompenses",
        value: `**${profile.achievementsTotalUnlocked}/${profile.achievementsTotalAll} succès**\n${achievementLine(profile)}\n🎁 ${fmt(profile.entitlementsTotal)} cosmétiques`,
        inline: true,
      },
      {
        name: "🎮 Activité",
        value: `👁️ ${fmtDuration(profile.watchSecondsTotal)} regardées\n💬 ${fmt(profile.chatMessagesTotal)} messages\n📞 ${fmt(profile.callsTotal)} calls`,
        inline: true,
      },
      {
        name: "🎰 Engagement",
        value: `🎡 ${fmt(profile.wheelSpinsTotal)} spins\n🗓️ ${fmt(profile.dailyBonusClaimsTotal)} bonus\n✅ ${fmt(profile.questsCompletedTotal)} quêtes`,
        inline: true,
      },
      {
        name: "📊 Compte",
        value: `❤️ ${fmt(profile.followsCount)} streamer${profile.followsCount > 1 ? "s" : ""} suivi${profile.followsCount > 1 ? "s" : ""}\n📅 Inscrit ${created}`,
        inline: true,
      },
      {
        name: "🌙 LunaLive",
        value: "[Ouvrir mon profil complet](https://lunalive.win/profile)",
        inline: true,
      }
    )
    .setFooter({ text: "LeCasiNoze × LunaLive • Données synchronisées en temps réel" })
    .setTimestamp();
}

function buildBalanceEmbed(profile: LunaLiveProfile, avatarUrl: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9d7cff)
    .setAuthor({ name: profile.username, iconURL: avatarUrl })
    .setTitle("💎 Ton solde LunaLive")
    .setDescription(`## ${fmt(profile.rubis)} Rubis\n**Niveau ${profile.level}** · ${profile.levelTitle}`)
    .addFields(
      { name: "XP", value: fmt(profile.xp), inline: true },
      { name: "Prochain niveau", value: profile.isMaxLevel ? "⭐ MAX" : `${fmt(profile.xpToNext)} XP`, inline: true }
    )
    .setFooter({ text: "LeCasiNoze × LunaLive • /profil pour tout voir" });
}

function buildAchievementsEmbed(profile: LunaLiveProfile, avatarUrl: string): EmbedBuilder {
  const totalPercent = profile.achievementsTotalAll > 0
    ? Math.round((profile.achievementsTotalUnlocked / profile.achievementsTotalAll) * 100)
    : 0;
  const fields = Object.entries(profile.achievementsByTier).map(([tier, value]) => ({
    name: ({ bronze: "🥉 Bronze", silver: "🥈 Silver", gold: "🥇 Gold", master: "👑 Master" } as Record<string, string>)[tier],
    value: `**${value.unlocked}/${value.total}**`,
    inline: true,
  }));
  return new EmbedBuilder()
    .setColor(0xf7c948)
    .setAuthor({ name: profile.username, iconURL: avatarUrl })
    .setTitle("🏆 Succès LunaLive")
    .setDescription(`**${profile.achievementsTotalUnlocked}/${profile.achievementsTotalAll} débloqués**\n${progressBar(totalPercent)}`)
    .addFields(fields)
    .setFooter({ text: "LeCasiNoze × LunaLive • Progression partagée" });
}

async function sendPrivateError(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  if (interaction.deferred) {
    await interaction.deleteReply().catch(() => undefined);
    await interaction.followUp({ content: message, ephemeral: true });
    return;
  }
  await interaction.reply({ content: message, ephemeral: true });
}

async function handleLink(interaction: ChatInputCommandInteraction, config: NozeBotCommandConfig): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const result = await requestLunaLiveLink(config.lunaLive, interaction.user.id);
  if (result.linked) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Compte déjà connecté")
        .setDescription(`Ton Discord est lié à **${result.user.username}** sur LunaLive.\n\nTes Rubis, cooldowns, niveaux et succès sont partagés.`)
        .setFooter({ text: "LeCasiNoze × LunaLive" })],
    });
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Ouvrir mon profil LunaLive")
      .setEmoji("🌙")
      .setURL("https://lunalive.win/profile")
  );
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0x9d7cff)
      .setTitle("🔗 Connecte ton compte LunaLive")
      .setDescription(
        `Ton code personnel :\n## \`${result.code}\`\n` +
        `Il expire ${discordTimestamp(result.expiresAt)}. Ouvre ton profil LunaLive, choisis **Lier Discord**, puis colle ce code.`
      )
      .setFooter({ text: "Ce message est visible uniquement par toi" })],
    components: [row],
  });
}

async function handleClaim(interaction: ChatInputCommandInteraction, config: NozeBotCommandConfig): Promise<void> {
  await interaction.deferReply();
  try {
    const claim = await claimLunaLiveDaily(config.lunaLive, interaction.user.id);
    const milestone = claim.bonus > 0;
    const embed = new EmbedBuilder()
      .setColor(milestone ? 0xf7c948 : 0x22c55e)
      .setAuthor({ name: "LUNALIVE • DAILY CLAIM", iconURL: interaction.user.displayAvatarURL({ size: 128 }) })
      .setTitle(milestone ? "🔥 PALIER MENSUEL DÉBLOQUÉ" : "✅ Claim récupéré")
      .setDescription(`## +${fmt(claim.amount)} Rubis\nTon nouveau solde : **${fmt(claim.balance)} Rubis**`)
      .addFields(
        { name: "Série du mois", value: `**${claim.countThisMonth} claims**`, inline: true },
        { name: "XP gagné", value: `**+${claim.xpGained} XP**`, inline: true },
        { name: "Prochain claim", value: discordTimestamp(claim.nextAt), inline: true }
      )
      .setFooter({ text: `Niveau ${claim.level} • ${claim.levelTitle} • LeCasiNoze × LunaLive` })
      .setTimestamp();
    await interaction.editReply({
      content: `<@${interaction.user.id}>`,
      embeds: [embed],
      allowedMentions: { users: [interaction.user.id] },
    });
  } catch (error) {
    if (error instanceof LunaLiveApiError && error.code === "cooldown") {
      const nextAt = typeof error.details.nextAt === "string" ? error.details.nextAt : "";
      await sendPrivateError(interaction, `⏳ Tu as déjà récupéré ton claim. Reviens ${discordTimestamp(nextAt)}.`);
      return;
    }
    if (error instanceof LunaLiveApiError && error.code === "not_linked") {
      await sendPrivateError(interaction, "🔗 Ton compte n’est pas encore lié. Utilise **/link** puis réessaie.");
      return;
    }
    throw error;
  }
}

async function handleProfileCommand(
  interaction: ChatInputCommandInteraction,
  config: NozeBotCommandConfig
): Promise<void> {
  await interaction.deferReply();
  try {
    const profile = await fetchLunaLiveProfile(config.lunaLive, interaction.user.id);
    const avatar = interaction.user.displayAvatarURL({ size: 256 });
    const embed = interaction.commandName === "solde"
      ? buildBalanceEmbed(profile, avatar)
      : interaction.commandName === "succes"
        ? buildAchievementsEmbed(profile, avatar)
        : buildProfileEmbed(profile, avatar);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof LunaLiveApiError && error.code === "not_linked") {
      await sendPrivateError(interaction, "🔗 Ton compte n’est pas encore lié. Utilise **/link** pour connecter LunaLive.");
      return;
    }
    throw error;
  }
}

export async function registerNozeBotCommands(client: Client, config: NozeBotCommandConfig): Promise<void> {
  const guild = await client.guilds.fetch(config.guildId);
  await guild.commands.set(COMMANDS.map((command) => command.toJSON()));
  console.log("[nozebot] commandes LunaLive enregistrées", {
    guildId: config.guildId,
    commands: [...COMMAND_NAMES],
  });
}

export async function handleNozeBotCommand(
  interaction: Interaction,
  config: NozeBotCommandConfig
): Promise<boolean> {
  if (!interaction.isChatInputCommand() || !COMMAND_NAMES.has(interaction.commandName)) return false;
  if (interaction.guildId !== config.guildId) return true;

  try {
    if (interaction.channelId !== config.commandsChannelId && interaction.commandName !== "link") {
      await interaction.reply({
        content: `🎮 Utilise cette commande dans <#${config.commandsChannelId}> pour garder le serveur propre.`,
        ephemeral: true,
      });
      return true;
    }
    if (interaction.commandName === "link") await handleLink(interaction, config);
    else if (interaction.commandName === "claim") await handleClaim(interaction, config);
    else await handleProfileCommand(interaction, config);
  } catch (error) {
    console.error(`[nozebot] commande /${interaction.commandName} échouée`, error);
    await sendPrivateError(interaction, "NozeBot n’arrive pas à joindre LunaLive pour le moment. Réessaie dans quelques instants.")
      .catch(() => undefined);
  }
  return true;
}
