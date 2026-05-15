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
import { guildCommandDefinitions, globalCommandDefinitions } from "./commands.js";
import { runSetup } from "./setup.js";
import {
  handleOpenTicketDealButton,
  handleOpenTicketApplyButton,
  handleApplyTicketModal,
  handleCloseTicketButton,
  handleCloseTicketCommand,
  handleMemberJoin,
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
import {
  handleCelsiusCommand,
  handleCelsiusModal,
  handleCelsiusModifyButton,
  handleAutrixCommand,
} from "./celsius.js";
import {
  handleWatcherSort,
  handleWatcherValidate,
  handleWatcherRejectButton,
  handleWatcherRejectModal,
  handleQueueAccept,
  handleQueuePass,
  handleQueueRejectButton,
  handleQueueFilterSelect,
} from "./watcher.js";

export async function startAurixBot(): Promise<void> {
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

    // Enregistre les slash commands : Aurix guild (commandes agence) + global (celsius/autrix)
    try {
      const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(env.DISCORD_APP_ID, guildId), {
          body: guildCommandDefinitions,
        });
        console.log(
          `[aurix] Guild commands enregistrées sur ${guildId} : ${guildCommandDefinitions.length}`
        );
      }
      await rest.put(Routes.applicationCommands(env.DISCORD_APP_ID), {
        body: globalCommandDefinitions,
      });
      console.log(
        `[aurix] Global commands enregistrées : ${globalCommandDefinitions.length} (celsius / autrix)`
      );
    } catch (e) {
      console.error("[aurix] Erreur enregistrement commands :", e);
    }

    // Auto-setup: relance si la version du setup en DB est < SETUP_VERSION.
    // Le setup est idempotent (getOrCreate*) — sûr à ré-exécuter.
    const SETUP_VERSION = "5";
    if (guildId) {
      const guild = c.guilds.cache.get(guildId);
      if (guild) {
        try {
          const { one } = await import("./db.js");
          const flag = await one<{ value: string }>("SELECT value FROM aurix_kv WHERE key=$1", [
            "initial_setup_done",
          ]);
          if (!flag || flag.value !== SETUP_VERSION) {
            console.log(`[aurix] Auto-setup lancé sur ${guild.name} (version ${SETUP_VERSION})`);
            await runSetup(guild);
            await kvSet("initial_setup_done", SETUP_VERSION);
            console.log("[aurix] Auto-setup terminé.");
          }
        } catch (e) {
          console.error("[aurix] Auto-setup a échoué :", e);
        }
      }
    }

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
        const cid = interaction.customId;
        if (cid === "aurix:ticket:open" || cid === "aurix:ticket:open:deal") {
          await handleOpenTicketDealButton(interaction);
          return;
        }
        if (cid === "aurix:ticket:open:apply") {
          await handleOpenTicketApplyButton(interaction);
          return;
        }
        if (cid === "aurix:ticket:close") {
          await handleCloseTicketButton(interaction);
          return;
        }
        if (cid === "aurix:celsius:modify" || cid === "aurix:celsius:resubmit") {
          await handleCelsiusModifyButton(interaction);
          return;
        }
        if (cid.startsWith("aurix:watcher:sort:")) {
          await handleWatcherSort(interaction);
          return;
        }
        if (cid.startsWith("aurix:watcher:queue:accept:")) {
          await handleQueueAccept(interaction);
          return;
        }
        if (cid.startsWith("aurix:watcher:queue:pass:")) {
          await handleQueuePass(interaction);
          return;
        }
        if (cid.startsWith("aurix:watcher:queue:reject:")) {
          await handleQueueRejectButton(interaction);
          return;
        }
        if (cid.startsWith("aurix:watcher:validate:")) {
          await handleWatcherValidate(interaction);
          return;
        }
        if (cid.startsWith("aurix:watcher:reject:")) {
          await handleWatcherRejectButton(interaction);
          return;
        }
        return;
      }

      // Select menus
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "aurix:watcher:queue:filter") {
          await handleQueueFilterSelect(interaction);
          return;
        }
        return;
      }

      // Modals
      if (interaction.isModalSubmit()) {
        const cid = interaction.customId;
        if (cid === "aurix:refill:firstEmail") {
          await handleFirstRefillEmailModal(interaction);
          return;
        }
        if (cid === "aurix:compte:save") {
          await handleCompteModal(interaction);
          return;
        }
        if (cid === "aurix:ticket:apply:modal") {
          await handleApplyTicketModal(interaction);
          return;
        }
        if (cid === "aurix:celsius:save") {
          await handleCelsiusModal(interaction);
          return;
        }
        if (cid.startsWith("aurix:watcher:reject:modal:")) {
          await handleWatcherRejectModal(interaction);
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
          case "close-ticket":
            await handleCloseTicketCommand(ci);
            return;
          case "celsius":
            await handleCelsiusCommand(ci);
            return;
          case "autrix":
            await handleAutrixCommand(ci);
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

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.partial) {
      try {
        await member.fetch();
      } catch {
        return;
      }
    }
    if (env.GUILD_ID && member.guild.id !== env.GUILD_ID) return;
    await handleMemberJoin(member as any);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.partial) {
      try {
        await member.fetch();
      } catch {
        return;
      }
    }
    if (env.GUILD_ID && member.guild.id !== env.GUILD_ID) return;
    await onMemberRemove(member as any);
  });

  client.on(Events.GuildMemberUpdate, async (before, after) => {
    if (env.GUILD_ID && after.guild.id !== env.GUILD_ID) return;
    await onMemberUpdate(before as any, after as any);
  });

  client.on(Events.GuildCreate, (guild) => {
    console.log(`[aurix] Joined new guild: ${guild.name} (${guild.id}) — owner=${guild.ownerId}`);
  });

  await client.login(env.DISCORD_TOKEN);
}
