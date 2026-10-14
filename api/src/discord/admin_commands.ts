// Modération Discord uniquement. Les anciennes commandes agence sont retirées.
import type { ChatInputCommandInteraction, Interaction } from "discord.js";

const ALLOWED_USER_IDS = new Set([
  "682472610868887567", // LeCasiNoze
  "406965568755728395", // Fabiozsis
  "992099046472831066", // Samyzsis
]);

async function checkAllowedUser(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!ALLOWED_USER_IDS.has(interaction.user.id)) {
    await interaction.reply({ ephemeral: true, content: "🚫 Cette commande est réservée à la modération." });
    return false;
  }
  return true;
}

async function handlePurge(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!await checkAllowedUser(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    const x = interaction.options.getInteger("x", true);
    const channel = interaction.channel;
    if (!channel || !("bulkDelete" in channel)) {
      await interaction.editReply({ content: "❌ Salon non textuel ou bulkDelete indisponible." });
      return;
    }
    // Discord bulkDelete : max 100 messages, < 14 jours
    const deleted = await (channel as any).bulkDelete(Math.min(Math.max(1, x), 100), true);
    const count = deleted?.size ?? 0;
    await interaction.editReply({
      content: `🗑️ ${count} message${count > 1 ? "s" : ""} supprimé${count > 1 ? "s" : ""}.` +
        (count < x ? ` (Discord ne peut pas supprimer les messages > 14 jours)` : ""),
    });
  } catch (e: any) {
    await interaction.editReply({ content: `❌ ${e?.message || e}` });
  }
}


export async function routeAdminInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "purge") return false;
  try {
    await handlePurge(interaction);
  } catch (error) {
    console.error("[discord-moderation] purge failed:", error instanceof Error ? error.message : error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ephemeral: true, content: "La commande de modération n’a pas pu être exécutée." }).catch(() => {});
    }
  }
  return true;
}
