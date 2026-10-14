import type { Pool } from "pg";
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type ChatInputCommandInteraction, type ButtonInteraction } from "discord.js";
import { startNozeBotBlackjack, actOnNozeBotBlackjack, NozeBotBlackjackError,
  type NozeBotBlackjackView, type NozeBotBlackjackAction } from "../services/nozebot_blackjack.js";
import { renderBlackjackTable } from "./blackjack-renderer.js";
import { getLinkedUser } from "./link.js";
function fmt(value: number): string { return Number(value || 0).toLocaleString("fr-FR"); }
function discordTimestamp(value: string, style: "R" | "F" = "R"): string {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? `<t:${Math.floor(timestamp / 1000)}:${style}>` : "bientôt";
}
function blackjackButtons(game: NozeBotBlackjackView): ActionRowBuilder<ButtonBuilder> {
  const id = game.sessionId;
  const locked = game.status === "finished";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`bj:${id}:hit`).setLabel("Piocher").setEmoji("🃏").setStyle(ButtonStyle.Primary).setDisabled(locked || !game.actions.hit),
    new ButtonBuilder().setCustomId(`bj:${id}:stand`).setLabel("Rester").setEmoji("✋").setStyle(ButtonStyle.Secondary).setDisabled(locked || !game.actions.stand),
    new ButtonBuilder().setCustomId(`bj:${id}:double`).setLabel("Doubler").setEmoji("💎").setStyle(ButtonStyle.Success).setDisabled(locked || !game.actions.double),
    new ButtonBuilder().setCustomId(`bj:${id}:split`).setLabel("Splitter").setEmoji("⚡").setStyle(ButtonStyle.Secondary).setDisabled(locked || !game.actions.split)
  );
}

function blackjackResultText(game: NozeBotBlackjackView): string {
  const result = game.result;
  if (!result) return "À toi de jouer. La partie est enregistrée : tu peux reprendre avec ces boutons même après un redémarrage du bot.";
  const net = `${result.totalNet >= 0 ? "+" : "−"}${fmt(Math.abs(result.totalNet))}`;
  const hands = result.perHand.map((hand) => {
    const label = hand.kind === "win" ? "Victoire" : hand.kind === "push" ? "Égalité" : hand.kind === "bust" ? "BUST" : "Défaite";
    return `**Main ${hand.i}** · ${label} · ${hand.total}`;
  }).join("\n");
  return `${hands}\n\n## ${net} Rubis\nSolde : **${fmt(result.balance)} Rubis** · **+${result.xpGained} XP**`;
}

export async function buildBlackjackMessage(game: NozeBotBlackjackView, username: string) {
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


function errorText(error: unknown): string {
  if (!(error instanceof NozeBotBlackjackError)) return "LunaBot n’arrive pas à jouer cette action pour le moment.";
  if (error.code === "cooldown") return `⏳ Ta table LunaLive est en cooldown. Reviens ${discordTimestamp(String(error.details.nextAt || ""))}.`;
  if (error.code === "insufficient_rubis") return "💎 Tu n’as pas assez de Rubis pour cette mise.";
  if (error.code === "session_forbidden") return "⛔ Cette table appartient à un autre joueur.";
  if (error.code === "session_other_guild") return "Ta partie est déjà ouverte sur l’autre serveur Discord. Termine-la là-bas avant de rejouer ici.";
  return "❌ Partie introuvable ou indisponible. Relance /blackjack.";
}
export async function handleBlackjackCommand(_pool: Pool, it: ChatInputCommandInteraction, plusMode: boolean,
  lunaUser: { userId: number; username: string }) {
  try {
    const game = await startNozeBotBlackjack({discordUserId: it.user.id, discordGuildId: String(it.guildId),
      userId: lunaUser.userId, mode: plusMode ? "plus" : "classic"});
    await it.editReply(await buildBlackjackMessage(game, it.user.username));
  } catch (error) {
    if (!(error instanceof NozeBotBlackjackError)) console.error("[lunabot-blackjack] start failed", error);
    await it.deleteReply().catch(() => undefined);
    await it.followUp({content: errorText(error), ephemeral: true});
  }
}
export async function handleBlackjackButton(_pool: Pool, it: ButtonInteraction) {
  const match = /^bj:([0-9a-f-]{36}):(hit|stand|double|split)$/i.exec(it.customId);
  if (!match) { await it.reply({content: "Cette ancienne table a expiré. Relance **/blackjack**.", ephemeral: true}); return; }
  await it.deferUpdate();
  try {
    const linked = await getLinkedUser(it.user.id);
    if (!linked) { await it.followUp({content: "🔗 Lie d’abord ton compte LunaLive avec **/link**.", ephemeral: true}); return; }
    const game = await actOnNozeBotBlackjack({discordUserId: it.user.id, discordGuildId: String(it.guildId),
      userId: Number(linked.id), sessionId: match[1], action: match[2] as NozeBotBlackjackAction});
    await it.editReply({...(await buildBlackjackMessage(game, it.user.username)), attachments: []});
  } catch (error) {
    if (!(error instanceof NozeBotBlackjackError)) console.error("[lunabot-blackjack] action failed", error);
    await it.followUp({content: errorText(error), ephemeral: true}).catch(() => undefined);
  }
}
