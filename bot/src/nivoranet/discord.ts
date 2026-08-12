import { Client, Events, GatewayIntentBits, SlashCommandBuilder } from "discord.js";
import type { BotEnv } from "../env.js";

// Client NivoraNet isolé : aucune dépendance fonctionnelle avec LunaLive, à
// part le processus Render partagé. Les fonctionnalités métier viendront après
// le cadrage du serveur ; ce socle valide déjà connexion + commandes.
export async function startNivoraDiscordBot(env: BotEnv): Promise<() => Promise<void>> {
  if (!env.NIVORA_DISCORD_BOT_TOKEN && !env.NIVORA_DISCORD_GUILD_ID) {
    console.log("[nivora-discord] disabled (configuration absente)");
    return async () => {};
  }
  if (!env.NIVORA_DISCORD_BOT_TOKEN || !env.NIVORA_DISCORD_GUILD_ID) {
    throw new Error("Nivora Discord requires both token and guild ID.");
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const command = new SlashCommandBuilder()
    .setName("nivora")
    .setDescription("Outils NivoraNet")
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Vérifie que le bot est prêt"));

  client.once(Events.ClientReady, async (readyClient) => {
    const guild = await readyClient.guilds.fetch(env.NIVORA_DISCORD_GUILD_ID!);
    await readyClient.application?.commands.set([command.toJSON()], guild.id);
    console.log(`[nivora-discord] connected as ${readyClient.user.tag} on ${guild.name} (${guild.id})`);
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "nivora") return;
    if (interaction.options.getSubcommand() === "status") {
      await interaction.reply({ content: "NivoraNet est connecté et prêt.", ephemeral: true });
    }
  });
  client.on(Events.Error, (error) => console.error("[nivora-discord] client error", error));
  await client.login(env.NIVORA_DISCORD_BOT_TOKEN);
  return async () => client.destroy();
}
