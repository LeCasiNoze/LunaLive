// api/src/discord/bot.ts
import { pool } from "../db.js";

import {
  handleBlackjackCommand,
  handleBlackjackButton,
} from "./blackjack.js";

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type Interaction,
  type GuildMember,
} from "discord.js";
import { earnRubisTx } from "../wallet_engine.js";
import { discordDailyClaimTxClient, fmtRemaining, monthKeyParis } from "../routes/bot/games_claim.js";
import {
  SLOT_BET_RUBIS,
  SLOT_COOLDOWN_MS,
  rollSlotOutcome,
  slotCheckAndTouchCooldownTx,
  buildSpinFrames,
  fmtRemaining as fmtRemainingSlot,
} from "./games_slot.js";

import {
  GUILD_ID,
  SLASH_COMMANDS,
  CID_APPLY_DECIDE_PREFIX,
  CID_APPLY_MODAL,
  CID_APPLY_OPEN,

  OFFICIAL_WELCOME_CHANNEL_ID,
  OFFICIAL_GOODBYE_CHANNEL_ID,
  OFFICIAL_LINK_CHANNEL_ID,
  OFFICIAL_GAMES_CHANNEL_ID,
  OFFICIAL_REACTION_ROLES_CHANNEL_ID,
  ROLE_RESEAUX_GLOBAL_ID,
  ROLE_YOUTUBE_ID,
  ROLE_INSTA_ID,
  ROLE_TIKTOK_ID,
  CID_RR_PREFIX,
} from "./constants.js";

import { maskEmail, maskSecret, safeDm, type BotCtx } from "./utils.js";
import { createLinkCode, getLinkedUser } from "./link.js";
import { ensureApplyMessage, buildApplyModal, dbUpsertStreamerRequest, createTicketChannel, buildStaffActionsRow, validateRulesInput, staffCanDecide, handleStaffDecisionButton } from "./apply.js";
import { isRestricted, isVerified, syncUserEverywhere } from "./sync.js";

let discordClient: Client | null = null;

const DEFAULT_WELCOME =
  `Bienvenue à {user} sur le serveur officiel de LunaLive\n` +
  `N'oublie pas de te linker juste ici <#${OFFICIAL_LINK_CHANNEL_ID}>`;

const DEFAULT_GOODBYE = "{username} a quitté **{server}**.";

type DiscordWelcomeCfg = {
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string | null;
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeMessage: string | null;
};

function normText(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normBool(v: any, def: boolean) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
}

async function loadWelcomeCfg(guildId: string): Promise<DiscordWelcomeCfg | null> {
  // ✅ Serveur officiel : hardcode (pas besoin de claim DB)
  if (String(guildId) === String(GUILD_ID)) {
    return {
      welcomeEnabled: true,
      welcomeChannelId: OFFICIAL_WELCOME_CHANNEL_ID,
      welcomeMessage: DEFAULT_WELCOME,
      goodbyeEnabled: true,
      goodbyeChannelId: OFFICIAL_GOODBYE_CHANNEL_ID,
      goodbyeMessage: DEFAULT_GOODBYE,
    };
  }

  // ✅ Autres serveurs : config DB (quand on fera claim + invitations)
  const r = await pool.query(`SELECT config FROM bot_discord_guilds WHERE guild_id=$1 LIMIT 1`, [guildId]);
  const config = r.rows?.[0]?.config ?? null;
  if (!config) return null;

  const dw = (config.discordWelcome ?? {}) as any;

  return {
    welcomeEnabled: normBool(dw.welcomeEnabled, true),
    welcomeChannelId: normText(dw.welcomeChannelId),
    welcomeMessage: normText(dw.welcomeMessage),
    goodbyeEnabled: normBool(dw.goodbyeEnabled, false),
    goodbyeChannelId: normText(dw.goodbyeChannelId),
    goodbyeMessage: normText(dw.goodbyeMessage),
  };
}

function renderTpl(tpl: string, p: { userId: string; username: string; server: string; memberCount?: number }) {
  return tpl
    .replaceAll("{user}", `<@${p.userId}>`)
    .replaceAll("{username}", p.username)
    .replaceAll("{server}", p.server)
    .replaceAll("{memberCount}", String(p.memberCount ?? ""));
}

async function sendWelcomeLike(opts: {
  client: Client;
  channelId: string;
  kind: "welcome" | "goodbye";
  username: string;
  userTag?: string | null;
  avatarUrl?: string | null;
  serverName: string;
  text: string;
  ctx: BotCtx;
}) {
  const ch = await opts.client.channels.fetch(opts.channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const title = opts.kind === "welcome" ? "👋 Bienvenue !" : "👋 Au revoir !";

  const embed: any = {
    title,
    description: opts.text.slice(0, 4000),
    timestamp: new Date().toISOString(),
    footer: { text: `Serveur: ${opts.serverName}` },
    author: {
      name: opts.userTag ? `${opts.username} (${opts.userTag})` : opts.username,
      icon_url: opts.avatarUrl ?? undefined,
    },
  };

  if (opts.avatarUrl) embed.thumbnail = { url: opts.avatarUrl };

  try {
    await (ch as any).send({ embeds: [embed] });
  } catch (e: any) {
    opts.ctx.log(`[discord] send ${opts.kind} failed: ${e?.message || e}`);
  }
}

function rrRoleIdFromKey(key: string): string | null {
  if (key === "reseaux") return ROLE_RESEAUX_GLOBAL_ID;
  if (key === "youtube") return ROLE_YOUTUBE_ID;
  if (key === "insta") return ROLE_INSTA_ID;
  if (key === "tiktok") return ROLE_TIKTOK_ID;
  return null;
}

function buildReactionRolesComponents() {
  // payload brut (discord.js ok)
  return [
    {
      type: 1, // ACTION_ROW
      components: [
        { type: 2, style: 1, custom_id: `${CID_RR_PREFIX}youtube`, label: "YouTube" },
        { type: 2, style: 1, custom_id: `${CID_RR_PREFIX}insta`, label: "Insta" },
        { type: 2, style: 1, custom_id: `${CID_RR_PREFIX}tiktok`, label: "TikTok" },
      ],
    },
    {
      type: 1,
      components: [{ type: 2, style: 2, custom_id: `${CID_RR_PREFIX}reseaux`, label: "Réseaux (global)" }],
    },
  ];
}

async function ensureReactionRolesMessage(guild: any, ctx: BotCtx, client: Client) {
  // uniquement serveur officiel
  if (String(guild.id) !== String(GUILD_ID)) return;

  const ch = await client.channels.fetch(OFFICIAL_REACTION_ROLES_CHANNEL_ID).catch(() => null);
  if (!ch || !ch.isTextBased()) {
    ctx.log(`[discord] reaction roles channel not found or not text-based (${OFFICIAL_REACTION_ROLES_CHANNEL_ID})`);
    return;
  }

  // si message déjà posté par le bot -> on ne reposte pas
  const msgs = await (ch as any).messages.fetch({ limit: 50 }).catch(() => null);
  const found = msgs?.find((m: any) => {
    const isBot = String(m.author?.id || "") === String(client.user?.id || "");
    const title = String(m.embeds?.[0]?.title || "");
    return isBot && title === "🎯 Rôles Réseaux";
  });
  if (found) return;

  const payload: any = {
    embeds: [
      {
        title: "🎯 Rôles Réseaux",
        description:
          "Clique sur les boutons pour **activer / désactiver** tes rôles.\n\n" +
          "• **YouTube / Insta / TikTok** : accès aux salons associés.\n" +
          "• **Réseaux (global)** : opt-in global (notifications générales). Indépendant des rôles ci-dessus.",
      },
    ],
    components: buildReactionRolesComponents(),
  };

  await (ch as any).send(payload).catch((e: any) => {
    ctx.log(`[discord] ensureReactionRolesMessage send failed: ${e?.message || e}`);
  });
}

async function toggleRole(member: GuildMember, roleId: string): Promise<{ added: boolean }> {
  const has = member.roles.cache.has(roleId);
  if (has) {
    await member.roles.remove(roleId).catch(() => {});
    return { added: false };
  } else {
    await member.roles.add(roleId).catch(() => {});
    return { added: true };
  }
}

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

    if (g) await ensureReactionRolesMessage(g, ctx, client);
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
      // 1) Welcome (si guild claim + config active + channel défini)
      const cfg = await loadWelcomeCfg(String(member.guild.id));
      if (cfg?.welcomeEnabled && cfg.welcomeChannelId) {
        const tpl = (cfg.welcomeMessage ?? DEFAULT_WELCOME).trim() || DEFAULT_WELCOME;
        const text = renderTpl(tpl, {
          userId: String(member.id),
          username: member.user.username,
          server: member.guild.name,
          memberCount: member.guild.memberCount,
        });

        await sendWelcomeLike({
          client,
          channelId: cfg.welcomeChannelId,
          kind: "welcome",
          username: member.user.username,
          userTag: member.user.tag ?? null,
          avatarUrl: member.user.displayAvatarURL({ size: 256 }),
          serverName: member.guild.name,
          text,
          ctx,
        });
      }

      // 2) Ton comportement existant: si déjà lié => sync + DM
      const linked = await pool.query(
        `SELECT 1 FROM discord_links WHERE discord_user_id = $1 LIMIT 1`,
        [String(member.id)]
      );

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

  client.on("guildMemberRemove", async (member) => {
    try {
      const cfg = await loadWelcomeCfg(String(member.guild.id));
      if (!cfg?.goodbyeEnabled || !cfg.goodbyeChannelId) return;

      const username =
        (member as any)?.user?.username ??
        (member as any)?.displayName ??
        "Un membre";

      const tpl = (cfg.goodbyeMessage ?? DEFAULT_GOODBYE).trim() || DEFAULT_GOODBYE;

      const text = renderTpl(tpl, {
        userId: String(member.id),
        username,
        server: member.guild.name,
        memberCount: member.guild.memberCount,
      });

      const avatarUrl =
        (member as any)?.user?.displayAvatarURL?.({ size: 256 }) ?? null;

      await sendWelcomeLike({
        client,
        channelId: cfg.goodbyeChannelId,
        kind: "goodbye",
        username,
        userTag: (member as any)?.user?.tag ?? null,
        avatarUrl,
        serverName: member.guild.name,
        text,
        ctx,
      });
    } catch (e: any) {
      ctx.log(`[discord] guildMemberRemove failed: ${e?.message || e}`);
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      // ───────── Reaction roles buttons (serveur officiel)
      if (interaction.isButton() && interaction.customId.startsWith(CID_RR_PREFIX)) {
        const guild = interaction.guild;
        const member = interaction.member as GuildMember | null;
        if (!guild || !member) {
          await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
          return;
        }

        // sécurité: seulement serveur officiel
        if (String(guild.id) !== String(GUILD_ID)) {
          await interaction.reply({ ephemeral: true, content: "Non disponible sur ce serveur." });
          return;
        }

        const key = interaction.customId.slice(CID_RR_PREFIX.length); // youtube/insta/tiktok/reseaux
        const roleId = rrRoleIdFromKey(key);
        if (!roleId) {
          await interaction.reply({ ephemeral: true, content: "Rôle inconnu." });
          return;
        }

        const { added } = await toggleRole(member, roleId);

        await interaction.reply({ ephemeral: true, content: added ? "✅ Rôle ajouté." : "✅ Rôle retiré." });
        return;
      }

      // ───────── Slash commands
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "help") {
          await interaction.reply({
            ephemeral: true,
            content: "LunaBot — commandes :\n• /link : lier votre compte LunaLive\n• /whoami : afficher votre statut\n",
          });
          return;
        }

        if (interaction.commandName === "claim") {
          const guild = interaction.guild;
          const member = interaction.member as GuildMember | null;

          if (!guild || !member) {
            await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
            return;
          }

          // ✅ Officiel only
          if (String(guild.id) !== String(GUILD_ID)) {
            await interaction.reply({ ephemeral: true, content: "Non disponible sur ce serveur." });
            return;
          }

          // ✅ Salon jeux only
          if (String(interaction.channelId) !== String(OFFICIAL_GAMES_CHANNEL_ID)) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Cette commande est dispo uniquement dans <#${OFFICIAL_GAMES_CHANNEL_ID}>.`,
            });
            return;
          }

          // ✅ Verified only
          if (!isVerified(member)) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Tu dois être **vérifié**.\n➡️ Va dans <#${OFFICIAL_LINK_CHANNEL_ID}> et fais **/link**.`,
            });
            return;
          }

          // ✅ être lié à un user LunaLive (pour créditer les rubis)
          const linked = await getLinkedUser(String(interaction.user.id));
          if (!linked) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Ton Discord n'est pas lié à un compte LunaLive.\n➡️ Fais **/link** dans <#${OFFICIAL_LINK_CHANNEL_ID}>.`,
            });
            return;
          }

          await interaction.deferReply({ ephemeral: false });

          const clientPg = await pool.connect();
          try {
            await clientPg.query("BEGIN");

            // 1) cooldown + compteur mois (lock row)
            const cr = await discordDailyClaimTxClient(clientPg, String(interaction.user.id));

            if (!cr.ok) {
              await clientPg.query("ROLLBACK");

              if (cr.error === "cooldown") {
                await interaction.editReply({
                  embeds: [
                    {
                      title: "⏳ Claim déjà utilisé",
                      description:
                        `Tu as déjà claim il y a moins de 24h.\n\n` +
                        `Reviens dans **${fmtRemaining((cr as any).remainingMs)}**.`,
                    },
                  ],
                });
                return;
              }

              await interaction.editReply("❌ Erreur interne. Réessaie plus tard.");
              return;
            }

            const userId = Number((linked as any).id);
            const amount = Number(cr.amount);
            const countThisMonth = Number(cr.countThisMonth);
            const bonus = Number(cr.bonus);

            // 2) crédit rubis avec poids 0.2 => origin "discord_claim"
            await earnRubisTx(clientPg, userId, "discord_claim", amount, {
              source: "discord",
              kind: "claim",
              monthKey: (cr as any).monthKey ?? monthKeyParis(new Date()),
              countThisMonth,
              bonus,
              discordUserId: String(interaction.user.id),
              discordGuildId: String(guild.id),
            });

            await clientPg.query("COMMIT");

            const isMilestone = bonus > 0;
            const title =
              countThisMonth === 30 ? "🏆 30e CLAIM DU MOIS !"
              : countThisMonth === 20 ? "🔥 20e CLAIM DU MOIS !"
              : countThisMonth === 10 ? "✨ 10e CLAIM DU MOIS !"
              : "✅ Claim validé";

            const desc =
              `**+${amount} rubis** (${isMilestone ? `5 + ${bonus} bonus` : "5"})\n\n` +
              `📅 Claim du mois : **${countThisMonth}**`;

          await interaction.editReply({
            content: `<@${interaction.user.id}>`,
            embeds: [
              {
                title,
                description: desc,
                footer: { text: "LunaLive — mini-jeux (serveur officiel)" },
                timestamp: new Date().toISOString(),
              },
            ],
          });

            return;
          } catch (e: any) {
            try { await clientPg.query("ROLLBACK"); } catch {}
            ctx.log(`[discord] claim failed: ${e?.message || e}`);
            await interaction.editReply("❌ Erreur interne. Réessaie plus tard.");
            return;
          } finally {
            clientPg.release();
          }
        }

        if (interaction.commandName === "blackjack" || interaction.commandName === "blackjack_plus") {
          const guild = interaction.guild;
          const member = interaction.member as GuildMember | null;

          if (!guild || !member) {
            await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
            return;
          }

          // ✅ Officiel only
          if (String(guild.id) !== String(GUILD_ID)) {
            await interaction.reply({ ephemeral: true, content: "Non disponible sur ce serveur." });
            return;
          }

          // ✅ Salon jeux only
          if (String(interaction.channelId) !== String(OFFICIAL_GAMES_CHANNEL_ID)) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Cette commande est dispo uniquement dans <#${OFFICIAL_GAMES_CHANNEL_ID}>.`,
            });
            return;
          }

          // ✅ Verified only
          if (!isVerified(member)) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Tu dois être **vérifié**.\n➡️ Va dans <#${OFFICIAL_LINK_CHANNEL_ID}> et fais **/link**.`,
            });
            return;
          }

          // ✅ Linked LunaLive user
          const linked = await getLinkedUser(String(interaction.user.id));
          if (!linked) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Ton Discord n'est pas lié à un compte LunaLive.\n➡️ Fais **/link** dans <#${OFFICIAL_LINK_CHANNEL_ID}>.`,
            });
            return;
          }

          // IMPORTANT: répondre vite
          await interaction.deferReply({ ephemeral: false });

          const plusMode = interaction.commandName === "blackjack_plus";

          // Tu passes au handler (il fait: cooldown 12h + debit + jeu + UI boutons)
          const lunaUser = {
            userId: Number((linked as any).id),
            username: String((linked as any).username),
          };

          await handleBlackjackCommand(pool, interaction, plusMode, lunaUser);

          return;
        }

        if (interaction.commandName === "slot") {
          const guild = interaction.guild;
          const member = interaction.member as GuildMember | null;

          if (!guild || !member) {
            await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
            return;
          }

          // ✅ Officiel only
          if (String(guild.id) !== String(GUILD_ID)) {
            await interaction.reply({ ephemeral: true, content: "Non disponible sur ce serveur." });
            return;
          }

          // ✅ Salon jeux only
          if (String(interaction.channelId) !== String(OFFICIAL_GAMES_CHANNEL_ID)) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Cette commande est dispo uniquement dans <#${OFFICIAL_GAMES_CHANNEL_ID}>.`,
            });
            return;
          }

          // ✅ Verified only
          if (!isVerified(member)) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Tu dois être **vérifié**.\n➡️ Va dans <#${OFFICIAL_LINK_CHANNEL_ID}> et fais **/link**.`,
            });
            return;
          }

          const linked = await getLinkedUser(String(interaction.user.id));
          if (!linked) {
            await interaction.reply({
              ephemeral: true,
              content: `❌ Ton Discord n'est pas lié à un compte LunaLive.\n➡️ Fais **/link** dans <#${OFFICIAL_LINK_CHANNEL_ID}>.`,
            });
            return;
          }

          // IMPORTANT: répondre vite
          await interaction.deferReply({ ephemeral: false });

          const pg = await pool.connect();
          try {
            await pg.query("BEGIN");

            // 1) Cooldown (lock)
            const cd = await slotCheckAndTouchCooldownTx(pg, String(interaction.user.id), SLOT_COOLDOWN_MS);
            if (!cd.ok) {
              await pg.query("ROLLBACK");

              if (cd.error === "cooldown") {
                await interaction.editReply({
                  content: `<@${interaction.user.id}>`,
                  embeds: [
                    {
                      title: "⏳ Slot déjà utilisé",
                      description: `Reviens dans **${fmtRemainingSlot(cd.remainingMs)}**.`,
                    },
                  ],
                });
                return;
              }

              await interaction.editReply("❌ Erreur interne. Réessaie plus tard.");
              return;
            }

            // 2) Roll outcome
            const out = rollSlotOutcome();

            // ⚠️ Ici il manque la partie “débit 10 rubis + payout”.
            // Pour l’instant on répond juste visuellement pour confirmer que ça marche
            // (sinon on bloque sur la signature de wallet_engine).
            await pg.query("COMMIT");

            const frames = buildSpinFrames(out.art);

            // message initial
            await interaction.editReply({
              content: `<@${interaction.user.id}> 🎰 **SLOT** — mise **${SLOT_BET_RUBIS} rubis**`,
              embeds: [
                {
                  title: "🎰 Spin...",
                  description: `\`${frames[0]}\``,
                },
              ],
            });

            // petites animations (edits rapides)
            for (let i = 1; i < frames.length; i++) {
              await new Promise((r) => setTimeout(r, 700));
              await interaction.editReply({
                content: `<@${interaction.user.id}> 🎰 **SLOT** — mise **${SLOT_BET_RUBIS} rubis**`,
                embeds: [
                  {
                    title: "🎰 Spin...",
                    description: `\`${frames[i]}\``,
                  },
                ],
              });
            }

            // final
            await new Promise((r) => setTimeout(r, 700));
            await interaction.editReply({
              content: `<@${interaction.user.id}>`,
              embeds: [
                {
                  title: "🎰 Résultat",
                  description:
                    `${out.label}\n\n` +
                    `🎟️ Mise: **${SLOT_BET_RUBIS}**\n` +
                    `🏆 Payout: **${out.payoutRubis}**\n` +
                    (out.extraLossRubis ? `💥 Malus: **-${out.extraLossRubis}**` : ""),
                  footer: { text: "LunaLive — mini-jeux (serveur officiel)" },
                  timestamp: new Date().toISOString(),
                },
              ],
            });

            return;
          } catch (e: any) {
            try { await pg.query("ROLLBACK"); } catch {}
            ctx.log(`[discord] slot failed: ${e?.message || e}`);
            await interaction.editReply("❌ Erreur interne. Réessaie plus tard.");
            return;
          } finally {
            pg.release();
          }
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

      if (interaction.isButton() && interaction.customId.startsWith("bj:")) {
        await handleBlackjackButton(pool, interaction);
        return;
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
