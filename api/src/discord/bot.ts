// api/src/discord/bot.ts
import { pool } from "../db.js";

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type Interaction,
  type GuildMember,
} from "discord.js";

import { GUILD_ID, SLASH_COMMANDS, CID_APPLY_DECIDE_PREFIX, CID_APPLY_MODAL, CID_APPLY_OPEN } from "./constants.js";
import { maskEmail, maskSecret, safeDm, type BotCtx } from "./utils.js";
import { createLinkCode, getLinkedUser } from "./link.js";
import { ensureApplyMessage, buildApplyModal, dbUpsertStreamerRequest, createTicketChannel, buildStaffActionsRow, validateRulesInput, staffCanDecide, handleStaffDecisionButton } from "./apply.js";
import { isRestricted, isVerified, syncUserEverywhere } from "./sync.js";

let discordClient: Client | null = null;

export async function startDiscordBot(ctx: BotCtx) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID || GUILD_ID;

  if (!token) throw new Error("Missing env DISCORD_BOT_TOKEN");
  if (!guildId) throw new Error("Missing env DISCORD_GUILD_ID");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });

  discordClient = client;

  client.once("clientReady", async () => {
    ctx.log(`[discord] logged in as ${client.user?.tag ?? "unknown"}`);
    const g = await client.guilds.fetch(guildId).catch(() => null);
    ctx.log(`[discord] guild=${g?.name ?? "unknown"} (${guildId})`);
    ctx.log(`[discord] env DISCORD_LINK_CODE_SECRET=${maskSecret(process.env.DISCORD_LINK_CODE_SECRET)}`);

    const rest = new REST({ version: "10" }).setToken(token);
    if (!client.user?.id) throw new Error("Missing client.user.id");
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: [...SLASH_COMMANDS] });
    ctx.log(`[discord] slash commands registered (${SLASH_COMMANDS.length})`);

    if (g) await ensureApplyMessage(g, ctx);

    setInterval(() => {
      pool
        .query(`SELECT discord_user_id FROM discord_links ORDER BY updated_at DESC LIMIT 5000`)
        .then(async (r) => {
          for (const it of r.rows) await syncUserEverywhere(discordClient, String(it.discord_user_id), ctx);
        })
        .catch((e) => ctx.log(`[discord] periodic sync failed: ${e?.message || e}`));
    }, 6 * 3600_000);
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      const linked = await pool.query(`SELECT 1 FROM discord_links WHERE discord_user_id = $1 LIMIT 1`, [String(member.id)]);
      if (linked.rowCount) {
        await syncUserEverywhere(discordClient, String(member.id), ctx);
        await safeDm(
          discordClient,
          String(member.id),
          `Bienvenue.\nVotre compte Discord est déjà lié à LunaLive : synchronisation appliquée (pseudo + rôles).`,
          ctx
        );
      }
    } catch (e: any) {
      ctx.log(`[discord] guildMemberAdd failed: ${e?.message || e}`);
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      // ───────── Slash commands
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "help") {
          await interaction.reply({
            ephemeral: true,
            content: "LunaBot — commandes :\n• /link : lier votre compte LunaLive\n• /whoami : afficher votre statut\n",
          });
          return;
        }

        if (interaction.commandName === "whoami") {
          const linked = await getLinkedUser(String(interaction.user.id));
          if (!linked) {
            await interaction.reply({ ephemeral: true, content: "Statut : non lié." });
            return;
          }
          const mail = maskEmail((linked as any).email ?? null);
          await interaction.reply({
            ephemeral: true,
            content:
              `Statut : lié ✅\n` +
              `Pseudo LunaLive : **${linked.username}**\n` +
              (mail ? `Email : **${mail}**\n` : "") +
              `Rôle LunaLive : **${linked.role}**`,
          });
          return;
        }

        if (interaction.commandName === "link") {
          const already = await getLinkedUser(String(interaction.user.id));
          if (already) {
            const mail = maskEmail((already as any).email ?? null);
            await interaction.reply({
              ephemeral: true,
              content:
                `Votre compte est déjà lié ✅\n` +
                `Pseudo LunaLive : **${already.username}**\n` +
                (mail ? `Email : **${mail}**\n` : "") +
                `Rôle LunaLive : **${already.role}**`,
            });
            return;
          }

          const secretPresent = String(process.env.DISCORD_LINK_CODE_SECRET ?? "").trim();
          if (!secretPresent) {
            await interaction.reply({
              ephemeral: true,
              content: "Configuration manquante côté serveur (DISCORD_LINK_CODE_SECRET). Contactez un administrateur.",
            });
            await safeDm(
              discordClient,
              String(interaction.user.id),
              "Impossible de générer un code pour le moment : DISCORD_LINK_CODE_SECRET n'est pas chargé sur le serveur.",
              ctx
            );
            return;
          }

          const { code, expiresAt } = await createLinkCode(String(interaction.user.id), ctx);

          await interaction.reply({
            ephemeral: true,
            content:
              `Code de liaison généré ✅\n` +
              `➡️ **${code}**\n\n` +
              `Rendez-vous sur LunaLive → Profil → Lier Discord, puis collez ce code.\n` +
              `Expiration : ${expiresAt.toLocaleString("fr-FR")}`,
          });

          await safeDm(
            discordClient,
            String(interaction.user.id),
            `🔗 Liaison LunaLive — Code\n\nVotre code : **${code}**\nExpiration : ${expiresAt.toLocaleString(
              "fr-FR"
            )}\n\nÀ faire : allez sur LunaLive → Profil → Lier Discord et collez ce code.\n\nAprès validation, votre pseudo et vos rôles seront synchronisés automatiquement.`,
            ctx
          );
          return;
        }
      }

      // ───────── Button open modal
      if (interaction.isButton() && interaction.customId === CID_APPLY_OPEN) {
        const guild = interaction.guild;
        const member = interaction.member as GuildMember | null;
        if (!guild || !member) return void interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });

        if (isRestricted(member)) {
          await interaction.reply({ ephemeral: true, content: "⛔ Vous ne pouvez pas faire de demande (Restricted)." });
          return;
        }
        if (!isVerified(member)) {
          await interaction.reply({
            ephemeral: true,
            content:
              "❌ Tu ne peux pas faire de demande streamer tant que tu n'es pas **vérifié**.\n\n➡️ Fais d'abord **/link** (liaison LunaLive) puis réessaye.",
          });
          return;
        }

        await interaction.showModal(buildApplyModal());
        return;
      }

      // ───────── Modal submit
      if (interaction.isModalSubmit() && interaction.customId === CID_APPLY_MODAL) {
        const guild = interaction.guild;
        const member = interaction.member as GuildMember | null;
        if (!guild || !member) return void interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });

        if (!isVerified(member)) {
          await interaction.reply({
            ephemeral: true,
            content: "❌ Tu dois être **vérifié** (commande **/link**) avant de faire une demande streamer.",
          });
          return;
        }
        if (isRestricted(member)) {
          await interaction.reply({ ephemeral: true, content: "⛔ Vous ne pouvez pas faire de demande (Restricted)." });
          return;
        }

        const discord = interaction.fields.getTextInputValue("f_discord") || "";
        const dliveUrl = interaction.fields.getTextInputValue("f_dlive") || "";
        const otherLinks = interaction.fields.getTextInputValue("f_links") || "";
        const experience = interaction.fields.getTextInputValue("f_exp") || "";
        const rules = interaction.fields.getTextInputValue("f_rules") || "";

        if (!validateRulesInput(rules)) {
          await interaction.reply({
            ephemeral: true,
            content: "❌ Règlement non accepté.\n\nDans le champ règlement, tu dois taper exactement : **J'ACCEPTE**",
          });
          return;
        }

        const payload = {
          discord: discord.trim(),
          dliveUrl: dliveUrl.trim(),
          otherLinks: otherLinks.trim(),
          experience: experience.trim(),
          rulesAccepted: true,
          discordUserId: String(member.id),
          discordGuildId: String(guild.id),
          submittedAt: new Date().toISOString(),
        };

        const up = await dbUpsertStreamerRequest(String(member.id), payload);
        if (!up.ok) {
          await interaction.reply({
            ephemeral: true,
            content: "❌ Ton compte Discord n'est pas lié à un compte LunaLive.\n\n➡️ Fais **/link** puis réessaye.",
          });
          return;
        }

        const requestId = Number(up.request.id);

        const ticket = await createTicketChannel(guild, member, ctx);

        const recap = {
          embeds: [
            {
              title: "📩 Demande Streamer — Récap",
              description: "Discussion ici avec le staff. Merci de rester disponible.",
              fields: [
                { name: "Utilisateur", value: `<@${member.id}> (${member.user.tag})`, inline: false },
                { name: "Contact (Discord/Telegram)", value: discord.trim() ? discord.trim() : "—", inline: false },
                { name: "DLive", value: dliveUrl.trim() ? dliveUrl.trim() : "—", inline: false },
                { name: "Autres liens", value: otherLinks.trim() ? otherLinks.trim().slice(0, 1000) : "—", inline: false },
                { name: "Expérience / Projet", value: experience.trim() ? experience.trim().slice(0, 1000) : "—", inline: false },
                { name: "Règlement", value: "✅ Accepté", inline: true },
                { name: "Request ID", value: String(requestId), inline: true },
              ],
              footer: { text: "LunaLive — streamer requests" },
            },
          ],
        };

        await (ticket as any).send({ content: `<@${member.id}>`, ...recap });

        await (ticket as any).send({
          content: `Staff: utilisez les boutons ci-dessous.`,
          components: [buildStaffActionsRow(requestId)],
        });

        await interaction.reply({ ephemeral: true, content: `✅ Demande envoyée ! Un ticket a été créé : <#${ticket.id}>` });
        return;
      }

      // ───────── Staff approve/reject buttons
      if (interaction.isButton() && interaction.customId.startsWith(CID_APPLY_DECIDE_PREFIX)) {
        const guild = interaction.guild;
        const member = interaction.member as GuildMember | null;
        if (!guild || !member) return void interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });

        if (!staffCanDecide(member)) {
          await interaction.reply({ ephemeral: true, content: "❌ Tu n'as pas la permission (staff requis)." });
          return;
        }

        const rest = interaction.customId.slice(CID_APPLY_DECIDE_PREFIX.length);
        const [action, idStr] = rest.split(":");
        const requestId = Number(idStr || 0);
        if (!requestId || (action !== "approve" && action !== "reject")) {
          await interaction.reply({ ephemeral: true, content: "Erreur: action/id invalide." });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const result = await handleStaffDecisionButton({
          client: discordClient,
          guild,
          staffMember: member,
          requestId,
          action,
          ctx,
          interactionChannelId: interaction.channelId,
          interactionMessageEdit: async (p) => interaction.message.edit(p as any),
        });

        if (!result.ok) {
          await interaction.editReply(`❌ Impossible: ${result.error}`);
          return;
        }

        // Important: sync role after decision
        if (result.applicantDiscordUserId) {
          await syncUserEverywhere(discordClient, result.applicantDiscordUserId, ctx);
        }

        await interaction.editReply(
          action === "approve"
            ? "✅ Approuvé. Message envoyé dans le salon de décisions."
            : "✅ Refusé. Message envoyé dans le salon de décisions."
        );
        return;
      }
    } catch (e: any) {
      ctx.log(`[discord] interaction error: ${e?.message || e}`);
      try {
        if ((interaction as any)?.isRepliable?.()) {
          const payload = { ephemeral: true as const, content: "Erreur interne. Réessayez plus tard." };
          if ((interaction as any).deferred || (interaction as any).replied) await (interaction as any).followUp(payload);
          else await (interaction as any).reply(payload);
        }
      } catch {}
    }
  });

  client.on("error", (e) => ctx.log(`[discord] error: ${String(e)}`));
  client.on("warn", (m) => ctx.log(`[discord] warn: ${m}`));

  await client.login(token);
  return client;
}

// Exposé pour que la route consume déclenche la sync instant
export async function discordSyncNow(discordUserId: string) {
  if (!discordClient) return;
  await syncUserEverywhere(discordClient, String(discordUserId), { log: (m) => console.log(m) });
}
