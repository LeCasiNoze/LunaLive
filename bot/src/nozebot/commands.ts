import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type Client,
  type Interaction,
} from "discord.js";
import {
  LunaLiveApiError,
  coinRequest,
  actLunaLiveBlackjack,
  claimLunaLiveDaily,
  fetchLunaLiveProfile,
  fetchAutomodProfile,
  requestAutomodLink,
  playLunaLiveSlot,
  requestLunaLiveLink,
  startLunaLiveBlackjack,
  type LunaLiveBlackjack,
  type LunaLiveApiConfig,
  type LunaLiveProfile,
  type LunaLiveSlot,
} from "./lunalive-api.js";
import { renderBlackjackTable } from "./blackjack-renderer.js";
import { renderSlotMachine } from "./slot-renderer.js";

export type NozeBotCommandConfig = {
  guildId: string;
  commandsChannelId: string;
  lunaLive: LunaLiveApiConfig;
};

const COMMANDS = [
  new SlashCommandBuilder().setName('automodprofil').setDescription('Ton profil Automod, points et progression Rumble'),
  new SlashCommandBuilder().setName('automodlink').setDescription('Lier ton compte Rumble au profil Automod'),
  new SlashCommandBuilder().setName('automodhelp').setDescription('Commandes, shop et règles Automod'),
  new SlashCommandBuilder().setName("link").setDescription("Lier ton compte Discord à LunaLive"),
  new SlashCommandBuilder().setName("claim").setDescription("Récupérer tes Rubis LunaLive quotidiens"),
  new SlashCommandBuilder().setName("solde").setDescription("Afficher tes Rubis et ton niveau LunaLive"),
  new SlashCommandBuilder().setName("profil").setDescription("Afficher ton profil LunaLive complet"),
  new SlashCommandBuilder().setName("succes").setDescription("Afficher tes succès LunaLive"),
  new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Jouer au blackjack avec tes Rubis LunaLive")
    .addStringOption((option) => option
      .setName("mode")
      .setDescription("Classique (20 Rubis) ou Blackjack+ avec side bets (25 Rubis)")
      .setRequired(false)
      .addChoices(
        { name: "Classique · 20 Rubis", value: "classic" },
        { name: "Blackjack+ · 25 Rubis", value: "plus" }
      )),
  new SlashCommandBuilder().setName("slot").setDescription("Lancer la machine à sous avec tes Rubis LunaLive"),
];

const COMMAND_NAMES = new Set(COMMANDS.map((command) => command.name));
const COIN_COMMANDS=[
 new SlashCommandBuilder().setName('link').setDescription('Lier ton compte Rumble à ton profil LeCasiNoze'),
 new SlashCommandBuilder().setName('claim').setDescription('Récupérer tes NozeCoins quotidiens'),
 new SlashCommandBuilder().setName('slot').setDescription('Mini-jeu gratuit en NozeCoins, sans valeur monétaire'),
 new SlashCommandBuilder().setName('solde').setDescription('Tes NozeCoins et tes points Automod'),
 new SlashCommandBuilder().setName('profil').setDescription('Ton profil, tes soldes et tes améliorations'),
 new SlashCommandBuilder().setName('shop').setDescription('Consulter et acheter des améliorations en NozeCoins'),
 new SlashCommandBuilder().setName('ameliorer').setDescription('Acheter un palier préparé sur le site').addStringOption(o=>o.setName('branche').setDescription('Branche à améliorer').setRequired(true).addChoices(...['claim','cooldown','rain','slot'].map(value=>({name:value,value})))).addIntegerOption(o=>o.setName('palier').setDescription('Palier souhaité').setRequired(true).setMinValue(1).setMaxValue(3)),
 new SlashCommandBuilder().setName('regles').setDescription('Règles, délais et probabilités des NozeCoins'),
];
const COIN_NAMES=new Set(COIN_COMMANDS.map(c=>c.name));
export async function handleCoinCommand(interaction:ChatInputCommandInteraction|ButtonInteraction,config:NozeBotCommandConfig){
 await interaction.deferReply({ephemeral:true});
 const button=interaction.isButton();
 if(button&&interaction.customId.split(':')[2]!==interaction.user.id){await interaction.editReply('Ce menu appartient à un autre compte. Utilise /shop.');return;}
  const command=button?'upgrade':interaction.commandName;
  try{
  if(button){await interaction.editReply('Ce menu a été remplacé. Ouvre https://lecasinoze.onrender.com/shop/ pour préparer ton achat.');return;}
  if(command==='shop'){
   await interaction.editReply({content:'**Le shop LeCasiNoze**\nChoisis une amélioration sur le site, copie sa commande puis colle-la dans le salon jeux et commandes. Le bot vérifie ton solde avant tout achat.',components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Ouvrir le shop').setStyle(ButtonStyle.Link).setURL('https://lecasinoze.onrender.com/shop/'))]});return;
  }
  if(command==='regles'){
   await interaction.editReply('**NozeCoins · V1**\nPoints gratuits, non achetables, non transférables, sans valeur monétaire ni conversion en Rubis.\n'
    +'Claim : 100 / 24 h, jusqu’à 175 / 20 h avec améliorations. Rain sur Rumble uniquement : toutes les 30 min de live personnel, fenêtre 2 min, 25 à 40 points.\n'
    +'Mini-jeu : mise fixe 20 (améliorable jusqu’à 50), délai 30 minutes, pas de mise personnalisée. Les améliorations ne changent pas les probabilités.\n'
    +'Retours bruts : [XXX XXX] 55 % → ×0 ; [0XX XXX] 25 % → ×1 ; [00X XXX] 12 % → ×2 ; [000 XXX] 5 % → ×3 ; [000 0XX] 2 % → ×5 ; [000 00X] 0,8 % → ×10 ; [000 000] 0,18 % → ×25 ; [777 777] 0,019 % → ×100 ; [MAX WIN] 0,001 % → ×250. La mise est débitée avant le retour.\n'
    +'Les soldes Automod restent séparés. Aucun reset du portefeuille. /link · /claim · /solde · /profil · /slot · /shop');return;
  }
  if(command==='link'){
   const link=await requestAutomodLink(config.lunaLive,interaction.user.id);
   await interaction.editReply(link.linked?`Compte Rumble lié : **${link.username}**. /claim · /solde · /shop`
    :`Dans le chat Rumble de LeCasiNoze, colle ce code privé (10 minutes, usage unique) :\n\`${link.command}\``);return;
  }
  const upgrade=command==='ameliorer'&&!interaction.isButton()?interaction.options.getString('branche',true):undefined;
  const expectedTier=command==='ameliorer'&&!interaction.isButton()?interaction.options.getInteger('palier',true)-1:undefined;
  const action=command==='ameliorer'?'upgrade':command;
  const result=await coinRequest(config.lunaLive,interaction.user.id,['claim','slot','upgrade'].includes(action)?action as 'claim'|'slot'|'upgrade':'profile',interaction.id,upgrade,expectedTier);
  if(!result.ok){await interaction.editReply(`Délai en cours. Prochaine récupération : ${result.nextAt?discordTimestamp(result.nextAt):'plus tard'}.`);return;}
  const p=result.profile;
  if(p){
   // Native Rumble username is provided by the trusted account-link API, not by the viewer.
   const guild=interaction.guild;
   if(guild){const member=await guild.members.fetch(interaction.user.id).catch(()=>null);
    const nickname=p.username.replace(/[\r\n\u0000-\u001f]/g,'').trim().slice(0,32);
    if(member?.manageable&&nickname&&member.nickname!==nickname)await member.setNickname(nickname,'Synchronisation du compte Rumble lié').catch(()=>undefined);
   }
   const fields=[{name:'NozeCoins',value:String(p.balance),inline:true},{name:'Points Automod disponibles',value:String(p.automod),inline:true},
    {name:'Claim',value:`${p.rules.claim} NozeCoins / ${p.rules.claimMs/3600000} h`,inline:true},
    {name:'Rain',value:`${p.rules.rain} NozeCoins`,inline:true},{name:'Mise du mini-jeu',value:`${p.rules.bet} NozeCoins`,inline:true}];
   const embed=new EmbedBuilder().setColor(0xd64065).setTitle(`${p.username} · LeCasiNoze`).addFields(fields)
    .setFooter({text:'NozeCoins gratuits, non achetables, non transférables et sans conversion en argent ou Rubis.'});
   await interaction.editReply({embeds:[embed]});
  }else await interaction.editReply(command==='slot'?`**${formatCoinSlot(String(result.art))}**\nMise : ${result.bet} · Retour : ${result.payout} NozeCoins\nSolde : **${result.balance}** NozeCoins`
   :`${action==='upgrade'?'Amélioration achetée':`+${result.delta} NozeCoins`} · Solde : **${result.balance}** NozeCoins${result.nextAt?`\nProchain claim : ${discordTimestamp(result.nextAt)}`:''}`);
 }catch(e){
  const code=e instanceof LunaLiveApiError?e.code:'';
  await interaction.editReply(code==='rumble_not_linked'?'Lie ton compte Rumble avec /link pour utiliser les NozeCoins.'
   :code==='cooldown'&&e instanceof LunaLiveApiError?`Délai en cours. Prochaine récupération : ${typeof e.details.nextAt==='string'?discordTimestamp(e.details.nextAt):'plus tard'}.`
   :code==='insufficient_coins'&&e instanceof LunaLiveApiError?`Pas assez de NozeCoins : solde ${e.details.balance??'insuffisant'}, prix ${e.details.cost??'non disponible'}, il manque ${e.details.missing??'des'} points. Rien n’a été débité.`
   :code==='max_tier'?'Cette amélioration est déjà au maximum.'
   :code==='stale_shop'?'Ce menu n’est plus à jour. Rouvre /shop avant d’acheter.'
   :code==='coins_disabled'?'Les NozeCoins ne sont pas encore activés.'
   :'Opération non confirmée. Consulte /solde avant de réessayer.');
 }
}

export function formatCoinSlot(art:string){return art==='MAX WIN'?'[MAX WIN]':`[${art.slice(0,3)} ${art.slice(3)}]`;}

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

function blackjackButtons(game: LunaLiveBlackjack): ActionRowBuilder<ButtonBuilder> {
  const id = game.sessionId;
  const locked = game.status === "finished";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`nz:b:${id}:hit`).setLabel("Piocher").setEmoji("🃏").setStyle(ButtonStyle.Primary).setDisabled(locked || !game.actions.hit),
    new ButtonBuilder().setCustomId(`nz:b:${id}:stand`).setLabel("Rester").setEmoji("✋").setStyle(ButtonStyle.Secondary).setDisabled(locked || !game.actions.stand),
    new ButtonBuilder().setCustomId(`nz:b:${id}:double`).setLabel("Doubler").setEmoji("💎").setStyle(ButtonStyle.Success).setDisabled(locked || !game.actions.double),
    new ButtonBuilder().setCustomId(`nz:b:${id}:split`).setLabel("Splitter").setEmoji("⚡").setStyle(ButtonStyle.Secondary).setDisabled(locked || !game.actions.split)
  );
}

function blackjackResultText(game: LunaLiveBlackjack): string {
  const result = game.result;
  if (!result) return "À toi de jouer. La partie est enregistrée : tu peux reprendre avec ces boutons même après un redémarrage du bot.";
  const net = `${result.totalNet >= 0 ? "+" : "−"}${fmt(Math.abs(result.totalNet))}`;
  const hands = result.perHand.map((hand) => {
    const label = hand.kind === "win" ? "Victoire" : hand.kind === "push" ? "Égalité" : hand.kind === "bust" ? "BUST" : "Défaite";
    return `**Main ${hand.i}** · ${label} · ${hand.total}`;
  }).join("\n");
  return `${hands}\n\n## ${net} Rubis\nSolde : **${fmt(result.balance)} Rubis** · **+${result.xpGained} XP**`;
}

export async function buildBlackjackMessage(game: LunaLiveBlackjack, username: string) {
  const imageName = `nozebot-blackjack-${game.sessionId}.png`;
  const image = await renderBlackjackTable(game, username);
  const color = !game.result ? 0x9d7cff : game.result.totalNet > 0 ? 0x45e0a8 : game.result.totalNet < 0 ? 0xff5470 : 0xe4c866;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(game.status === "finished" ? "La table a tranché" : "Faites vos jeux")
    .setDescription(blackjackResultText(game))
    .setImage(`attachment://${imageName}`)
    .addFields(
      { name: "Mode", value: game.mode === "plus" ? "Blackjack+ · mise 25" : "Classique · mise 20", inline: true },
      {
        name: "Cooldown partagé",
        value: new Date(game.cooldownEndsAt).getTime() <= Date.now()
          ? "Désactivé pour les tests"
          : discordTimestamp(game.cooldownEndsAt),
        inline: true,
      }
    )
    .setFooter({ text: "LeCasiNoze × LunaLive • Rubis, XP et succès synchronisés" });
  if (game.mode === "plus" && game.sideBetLines.length) {
    embed.addFields({ name: "Side bets", value: game.sideBetLines.join("\n").slice(0, 1024), inline: false });
  }
  return {
    embeds: [embed],
    components: [blackjackButtons(game)],
    files: [new AttachmentBuilder(image, { name: imageName })],
  };
}

async function handleBlackjackCommand(
  interaction: ChatInputCommandInteraction,
  config: NozeBotCommandConfig
): Promise<void> {
  await interaction.deferReply();
  try {
    const selected = interaction.options.getString("mode");
    const mode = selected === "plus" ? "plus" : "classic";
    const game = await startLunaLiveBlackjack(config.lunaLive, interaction.user.id, mode);
    await interaction.editReply(await buildBlackjackMessage(game, interaction.user.username));
  } catch (error) {
    if (error instanceof LunaLiveApiError && error.code === "cooldown") {
      const nextAt = typeof error.details.nextAt === "string" ? error.details.nextAt : "";
      await sendPrivateError(interaction, `⏳ Ta table LunaLive est en cooldown. Reviens ${discordTimestamp(nextAt)}.`);
      return;
    }
    if (error instanceof LunaLiveApiError && error.code === "insufficient_rubis") {
      await sendPrivateError(interaction, "💎 Tu n’as pas assez de Rubis pour cette mise.");
      return;
    }
    if (error instanceof LunaLiveApiError && error.code === "not_linked") {
      await sendPrivateError(interaction, "🔗 Lie d’abord ton compte LunaLive avec **/link**.");
      return;
    }
    throw error;
  }
}

async function handleBlackjackButton(
  interaction: ButtonInteraction,
  config: NozeBotCommandConfig
): Promise<void> {
  const match = /^nz:b:([0-9a-f-]{36}):(hit|stand|double|split)$/i.exec(interaction.customId);
  if (!match) return;
  await interaction.deferUpdate();
  try {
    const game = await actLunaLiveBlackjack(
      config.lunaLive,
      interaction.user.id,
      match[1],
      match[2] as "hit" | "stand" | "double" | "split"
    );
    await interaction.editReply({
      ...(await buildBlackjackMessage(game, interaction.user.username)),
      attachments: [],
    });
  } catch (error) {
    const message = error instanceof LunaLiveApiError && error.code === "insufficient_rubis"
      ? "💎 Il te manque des Rubis pour cette action."
      : error instanceof LunaLiveApiError && error.code === "session_forbidden"
        ? "⛔ Cette table appartient à un autre joueur."
        : "NozeBot n’arrive pas à jouer cette action pour le moment.";
    await interaction.followUp({ content: message, ephemeral: true }).catch(() => undefined);
  }
}

export async function buildSlotMessage(slot: LunaLiveSlot, username: string) {
  const imageName = `nozebot-slot-${Date.now()}.png`;
  const image = await renderSlotMachine(slot, username);
  const color = slot.net > 0 ? 0x45e0a8 : slot.net < 0 ? 0xff5470 : 0xe4c866;
  const net = `${slot.net >= 0 ? "+" : "−"}${fmt(Math.abs(slot.net))}`;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(slot.net > 0 ? "La machine régale" : slot.net === 0 ? "Mise remboursée" : "La maison prend cette manche")
    .setDescription(`## ${net} Rubis\nNouveau solde : **${fmt(slot.balance)} Rubis**`)
    .setImage(`attachment://${imageName}`)
    .addFields(
      { name: "Mise", value: `**${fmt(slot.bet)}**`, inline: true },
      { name: "Gain brut", value: `**${fmt(slot.payout)}**`, inline: true },
      { name: "Prochain spin", value: discordTimestamp(slot.nextAt), inline: true }
    )
    .setFooter({ text: "LeCasiNoze × LunaLive • Solde et cooldown partagés" });
  if (slot.penalty > 0) embed.addFields({ name: "Malus", value: `**−${fmt(slot.penalty)} Rubis**`, inline: true });
  return { embeds: [embed], files: [new AttachmentBuilder(image, { name: imageName })] };
}

async function handleSlotCommand(
  interaction: ChatInputCommandInteraction,
  config: NozeBotCommandConfig
): Promise<void> {
  await interaction.deferReply();
  try {
    const slot = await playLunaLiveSlot(config.lunaLive, interaction.user.id);
    await interaction.editReply(await buildSlotMessage(slot, interaction.user.username));
  } catch (error) {
    if (error instanceof LunaLiveApiError && error.code === "cooldown") {
      const nextAt = typeof error.details.nextAt === "string" ? error.details.nextAt : "";
      await sendPrivateError(interaction, `⏳ La machine recharge. Prochain spin ${discordTimestamp(nextAt)}.`);
      return;
    }
    if (error instanceof LunaLiveApiError && error.code === "insufficient_rubis") {
      await sendPrivateError(interaction, "💎 Il te faut **10 Rubis** pour lancer la machine.");
      return;
    }
    if (error instanceof LunaLiveApiError && error.code === "not_linked") {
      await sendPrivateError(interaction, "🔗 Lie d’abord ton compte LunaLive avec **/link**.");
      return;
    }
    throw error;
  }
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
  const commands=process.env.NOZECOINS_ENABLED==='true'?COIN_COMMANDS:COMMANDS;
  await guild.commands.set(commands.map((command) => command.toJSON()));
  console.log("[nozebot] commandes LunaLive enregistrées", {
    guildId: config.guildId,
    commands: [...(process.env.NOZECOINS_ENABLED==='true'?COIN_NAMES:COMMAND_NAMES)],
  });
}

export async function handleNozeBotCommand(
  interaction: Interaction,
  config: NozeBotCommandConfig
): Promise<boolean> {
  if(process.env.NOZECOINS_ENABLED==='true'){
   if(interaction.guildId!==config.guildId)return false;
   if(interaction.isButton()&&interaction.customId.startsWith('nz:c:')){await handleCoinCommand(interaction,config);return true;}
   if(interaction.isChatInputCommand()&&COIN_NAMES.has(interaction.commandName)){await handleCoinCommand(interaction,config);return true;}
   return false;
  }
  if (interaction.isButton() && interaction.customId.startsWith("nz:b:")) {
    if (interaction.guildId === config.guildId) await handleBlackjackButton(interaction, config);
    return true;
  }
  if (!interaction.isChatInputCommand() || !COMMAND_NAMES.has(interaction.commandName)) return false;
  if (interaction.guildId !== config.guildId) return true;

  try {
    if(interaction.commandName.startsWith('automod')){
      await interaction.deferReply({ephemeral:true});
      if(interaction.commandName==='automodlink'){
        const link=await requestAutomodLink(config.lunaLive,interaction.user.id);
        await interaction.editReply(link.linked?`Compte lié : ${link.username}. Utilise /automodprofil.`
          :`Dans le chat Rumble de LeCasiNoze, colle cette commande (valable 10 minutes) :\n\`${link.command}\``);
      }else if(interaction.commandName==='automodprofil'){
        const result=await fetchAutomodProfile(config.lunaLive,interaction.user.id);
        await interaction.editReply(result.profile?.message??'Lie ton compte Rumble avec /automodlink pour retrouver tes points et ta progression.');
      }else await interaction.editReply('Sur Rumble : !call + slot · !points · !profil · !shop · !music · !parrainer.\nShop : https://lecasinoze.onrender.com/automod-shop/');
      return true;
    }
    if (interaction.channelId !== config.commandsChannelId && interaction.commandName !== "link") {
      await interaction.reply({
        content: `🎮 Utilise cette commande dans <#${config.commandsChannelId}> pour garder le serveur propre.`,
        ephemeral: true,
      });
      return true;
    }
    if (interaction.commandName === "link") await handleLink(interaction, config);
    else if (interaction.commandName === "claim") await handleClaim(interaction, config);
    else if (interaction.commandName === "blackjack") await handleBlackjackCommand(interaction, config);
    else if (interaction.commandName === "slot") await handleSlotCommand(interaction, config);
    else await handleProfileCommand(interaction, config);
  } catch (error) {
    console.error(`[nozebot] commande /${interaction.commandName} échouée`, error);
    await sendPrivateError(interaction, "NozeBot n’arrive pas à joindre LunaLive pour le moment. Réessaie dans quelques instants.")
      .catch(() => undefined);
  }
  return true;
}
