// Aurix bot — entry point.
import {
  ActivityType,
  Client,
  type ChatInputCommandInteraction,
  Events,
  GatewayIntentBits,
  type Interaction,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { loadEnv } from "./env.js";
import * as cfg from "./config.js";
import { kvSet } from "./db.js";
import { runMigrations } from "./migrate.js";
import { commandDefinitions } from "./commands.js";
import { runSetup } from "./setup.js";
import {
  handleOpenTicketButton,
  handleCloseTicketButton,
  onMemberRemove,
  onMemberUpdate,
} from "./tickets.js";
import {
  handleRefillCommand,
  handleRefillCancelCommand,
  handleRefillSentCommand,
  handleCompteCommand,
  handleCompteModal,
  handleFirstRefillEmailModal,
  startCutoffTask,
} from "./refill.js";
import { handleConfig, handlePing } from "./admin.js";

async function main(): Promise<void> {
  const env = loadEnv();

  console.log("[aurix] Running migrations…");
  await runMigrations();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
    partials: [Partials.GuildMember],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[aurix] Connecté : ${c.user.tag} (id=${c.user.id})`);

    // Auto-detect guild si non fourni
    let guildId = env.GUILD_ID;
    if (!guildId && c.guilds.cache.size === 1) {
      guildId = c.guilds.cache.first()!.id;
      console.log(`[aurix] GUILD_ID auto-détecté : ${guildId}`);
    }

    // Enregistre les slash commands
    try {
      const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(env.DISCORD_APP_ID, guildId), {
          body: commandDefinitions,
        });
        console.log(`[aurix] Slash commands enregistrées sur guild ${guildId} : ${commandDefinitions.length}`);
      } else {
        await rest.put(Routes.applicationCommands(env.DISCORD_APP_ID), { body: commandDefinitions });
        console.log(`[aurix] Slash commands enregistrées globalement : ${commandDefinitions.length}`);
      }
    } catch (e) {
      console.error("[aurix] Erreur enregistrement commands :", e);
    }

    // Auto-setup la première fois
    if (guildId) {
      const guild = c.guilds.cache.get(guildId);
      if (guild) {
        try {
          // Vérifie un flag KV pour faire le setup une seule fois
          const { one } = await import("./db.js");
          const flag = await one<{ value: string }>("SELECT value FROM aurix_kv WHERE key=$1", [
            "initial_setup_done",
          ]);
          if (!flag) {
            console.log("[aurix] Auto-setup lancé sur", guild.name);
            await runSetup(guild);
            await kvSet("initial_setup_done", "1");
            console.log("[aurix] Auto-setup terminé.");
          }
        } catch (e) {
          console.error("[aurix] Auto-setup a échoué :", e);
        }
      }
    }

    // Démarre la tâche cutoff
    startCutoffTask(c);

    await c.user.setPresence({
      activities: [{ name: `${cfg.BRAND.NAME} ${cfg.EMOJI.diamond}`, type: ActivityType.Watching }],
      status: "online",
    });
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      // Buttons
      if (interaction.isButton()) {
        if (interaction.customId === "aurix:ticket:open") {
          await handleOpenTicketButton(interaction);
          return;
        }
        if (interaction.customId === "aurix:ticket:close") {
          await handleCloseTicketButton(interaction);
          return;
        }
        return;
      }

      // Modals
      if (interaction.isModalSubmit()) {
        if (interaction.customId === "aurix:refill:firstEmail") {
          await handleFirstRefillEmailModal(interaction);
          return;
        }
        if (interaction.customId === "aurix:compte:save") {
          await handleCompteModal(interaction);
          return;
        }
        return;
      }

      // Slash commands
      if (interaction.isChatInputCommand()) {
        const ci = interaction as ChatInputCommandInteraction;
        switch (ci.commandName) {
          case "setup-server": {
            if (!ci.guild) {
              await ci.reply({ content: "Serveur uniquement.", ephemeral: true });
              return;
            }
            await ci.deferReply({ ephemeral: true });
            const info = await runSetup(ci.guild);
            await kvSet("initial_setup_done", "1");
            await ci.editReply({
              content: [
                `${cfg.EMOJI.check} **Setup terminé.**`,
                `• Rôles : ${info.roleDirection} ${info.roleModerateur} ${info.roleStreamer}`,
                `• Panel ticket : ${info.chOpenTicket}`,
                `• Liste refills : ${info.chRefills}`,
                `• Logs : ${info.chLogs}`,
                ``,
                `⚠️ Place les rôles \`Aurix Affiliate\` (bot), \`${cfg.ROLES.DIRECTION}\` et \`${cfg.ROLES.MODERATEUR}\` **au-dessus** de \`${cfg.ROLES.STREAMER}\` dans la hiérarchie.`,
              ].join("\n"),
            });
            return;
          }
          case "refill":
            await handleRefillCommand(ci);
            return;
          case "refill-cancel":
            await handleRefillCancelCommand(ci);
            return;
          case "refill-sent":
            await handleRefillSentCommand(ci);
            return;
          case "compte":
            await handleCompteCommand(ci);
            return;
          case "config":
            await handleConfig(ci);
            return;
          case "ping":
            await handlePing(ci);
            return;
        }
      }
    } catch (e) {
      console.error("[aurix] interaction error:", e);
      try {
        if (interaction.isRepliable()) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Erreur interne.", ephemeral: true });
          }
        }
      } catch {
        /* ignore */
      }
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.partial) {
      try {
        await member.fetch();
      } catch {
        return;
      }
    }
    await onMemberRemove(member as any);
  });

  client.on(Events.GuildMemberUpdate, async (before, after) => {
    await onMemberUpdate(before as any, after as any);
  });

  await client.login(env.DISCORD_TOKEN);
}

main().catch((e) => {
  console.error("[aurix] fatal:", e);
  process.exit(1);
});
