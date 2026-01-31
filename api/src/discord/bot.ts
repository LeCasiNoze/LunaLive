// api/src/discord/bot.ts
import crypto from "crypto";
import { pool } from "../db.js";
import { getActiveSiteUserBan } from "../auth.js";
import { ensureAssignedDliveAccount, releaseAccountForStreamerId } from "../provider_accounts.js";
import { slugify } from "../slug.js";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type GuildMember,
  type Interaction,
  type TextChannel,
} from "discord.js";

type BotCtx = { log: (msg: string) => void };

let discordClient: Client | null = null;

/**
 * ─────────────────────────────────────────────
 * IDs (tu m’as donné ces valeurs)
 * ─────────────────────────────────────────────
 * Tu peux aussi les mettre en env si tu veux,
 * mais là c'est “ready-to-run” direct.
 */
const GUILD_ID = "1467139956249067717";

// Tickets
const STAFF_TICKETS_CATEGORY_ID = "1467141806922666034";

// Channel où il y a le bouton “Faire une demande streamer”
const APPLY_CHANNEL_ID = "1467142148431413370";

// Channel où on envoie UNIQUEMENT le message de décision (accept/refuse)
const STAFF_DECISIONS_CHANNEL_ID = "1467142397816209530";
const STAFF_DECISIONS_PING_ROLE_ID = "1467140795105546441";

// Roles
const ROLE_VERIFIED_ID = "1467140844233556231";
const ROLE_VIEWER_ID = "1467140868288024742";
const ROLE_STREAMER_ID = "1467140886793027656";
const ROLE_PARTNER_ID = "1467140935954726984";
const ROLE_MOD_LUNALIVE_ID = "1467140910771994801";
const ROLE_RESTRICTED_ID = "1467140964773794005";

// Qui peut approuver/rejeter (dans le ticket)
const STAFF_ROLE_IDS = ["1467140769436405981", "1467140795105546441"];

/**
 * ─────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────
 */
function maskSecret(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "(missing)";
  if (s.length <= 6) return `*** (len=${s.length})`;
  return `${s.slice(0, 2)}***${s.slice(-2)} (len=${s.length})`;
}

function getLinkCodeSecret(ctx?: BotCtx) {
  const raw = process.env.DISCORD_LINK_CODE_SECRET;
  const s = String(raw ?? "").trim();

  if (!s) {
    ctx?.log?.(
      `[discord] DISCORD_LINK_CODE_SECRET=${maskSecret(raw)} | DISCORD_* keys=` +
        Object.keys(process.env)
          .filter((k) => k.startsWith("DISCORD_"))
          .sort()
          .join(",")
    );
    throw new Error("DISCORD_LINK_CODE_SECRET missing");
  }
  return s;
}

function hashCode(code: string, ctx?: BotCtx) {
  const secret = getLinkCodeSecret(ctx);
  return crypto.createHash("sha256").update(`${code}::${secret}`).digest("hex");
}

function codeAlphabet() {
  return "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
}

function genCode(len = 6) {
  const A = codeAlphabet();
  const b = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += A[b[i] % A.length];
  return `LL-${s}`;
}

function getTtlMin() {
  const n = Number(process.env.DISCORD_LINK_CODE_TTL_MIN || 12);
  return Number.isFinite(n) ? Math.max(5, Math.min(30, n)) : 12;
}

function maskEmail(email: string | null) {
  if (!email) return null;
  const e = String(email);
  const at = e.indexOf("@");
  if (at <= 1) return "***";
  const name = e.slice(0, at);
  const dom = e.slice(at + 1);
  return `${name[0]}***@${dom}`;
}

async function safeDm(userId: string, content: string, ctx: BotCtx) {
  if (!discordClient) return;
  try {
    const u = await discordClient.users.fetch(userId);
    await u.send(content);
  } catch (e: any) {
    ctx.log(`[discord] dm failed to ${userId}: ${e?.message || e}`);
  }
}

function hasAnyRole(member: GuildMember, roleIds: string[]) {
  return roleIds.some((rid) => member.roles.cache.has(rid));
}

function isVerified(member: GuildMember) {
  return member.roles.cache.has(ROLE_VERIFIED_ID);
}

function isRestricted(member: GuildMember) {
  return member.roles.cache.has(ROLE_RESTRICTED_ID);
}

async function applyRolesAndNick(guild: Guild, member: GuildMember, userRow: any, ctx: BotCtx) {
  const want = new Set<string>();

  // Always verified once linked
  want.add(ROLE_VERIFIED_ID);

  const role = String(userRow?.role || "viewer");

  // viewer/streamer
  if (role.includes("streamer")) want.add(ROLE_STREAMER_ID);
  else want.add(ROLE_VIEWER_ID);

  // mod/partner (si applicable)
  if (role.includes("mod")) want.add(ROLE_MOD_LUNALIVE_ID);
  if (role.includes("partner")) want.add(ROLE_PARTNER_ID);

  // Restricted
  if (role === "restricted") want.add(ROLE_RESTRICTED_ID);

  // add roles (don’t remove externals)
  try {
    const current = new Set(member.roles.cache.map((r) => r.id));
    const toAdd = [...want].filter((id) => id && !current.has(id));
    if (toAdd.length) await member.roles.add(toAdd);
  } catch (e: any) {
    ctx.log(`[discord] roles add failed guild=${guild.id} user=${member.id}: ${e?.message || e}`);
  }

  // nickname
  const targetBase = String(userRow?.username || "").trim();
  if (!targetBase) return;

  const trySet = async (nick: string) => {
    try {
      if (member.nickname !== nick) await member.setNickname(nick, "LunaLive sync");
      return true;
    } catch {
      return false;
    }
  };

  if (await trySet(targetBase)) return;

  const suffix = crypto.createHash("sha1").update(String(member.id)).digest("hex").slice(0, 4).toUpperCase();
  const fallback = `${targetBase} · ${suffix}`.slice(0, 32);
  const ok = await trySet(fallback);

  if (ok) {
    await safeDm(
      String(member.id),
      `Votre nom Discord a été synchronisé avec LunaLive.\n\nNom appliqué : **${fallback}**\n(Raison : un autre membre utilise déjà **${targetBase}** sur ce serveur.)`,
      ctx
    );
  } else {
    await safeDm(
      String(member.id),
      `Nous n'avons pas pu renommer votre compte automatiquement (permissions Discord / restrictions serveur).\nMerci de contacter un administrateur si besoin.`,
      ctx
    );
  }
}

async function syncUserEverywhere(discordUserId: string, ctx: BotCtx) {
  if (!discordClient) return;

  const link = await pool.query(
    `
    SELECT dl.user_id, u.username, u.role
    FROM discord_links dl
    JOIN users u ON u.id = dl.user_id
    WHERE dl.discord_user_id = $1
    LIMIT 1
    `,
    [discordUserId]
  );

  const row = link.rows?.[0];
  if (!row) return;

  const ban = await getActiveSiteUserBan(Number(row.user_id));
  const isBanned = !!ban?.banned;

  for (const [, guild] of discordClient.guilds.cache) {
    try {
      const g = await discordClient.guilds.fetch(guild.id);
      const member = await g.members.fetch(discordUserId).catch(() => null);
      if (!member) continue;

      if (isBanned) {
        await g.members.ban(discordUserId, { reason: "LunaLive ban" }).catch(() => null);
        continue;
      }

      await applyRolesAndNick(g, member, row, ctx);
    } catch (e: any) {
      ctx.log(`[discord] sync failed guild=${guild.id} user=${discordUserId}: ${e?.message || e}`);
    }
  }

  await pool
    .query(`UPDATE discord_links SET last_sync_at = NOW(), updated_at = NOW() WHERE discord_user_id = $1`, [
      discordUserId,
    ])
    .catch(() => {});
}

async function createLinkCode(discordUserId: string, ctx: BotCtx) {
  const code = genCode(6);
  const codeHash = hashCode(code, ctx);
  const ttl = getTtlMin();
  const expiresAt = new Date(Date.now() + ttl * 60_000);

  await pool.query(
    `
    INSERT INTO discord_link_codes (discord_user_id, code_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [discordUserId, codeHash, expiresAt.toISOString()]
  );

  return { code, expiresAt };
}

async function getLinkedUser(discordUserId: string) {
  try {
    const r = await pool.query(
      `
      SELECT u.id, u.username, u.role, u.email
      FROM discord_links dl
      JOIN users u ON u.id = dl.user_id
      WHERE dl.discord_user_id = $1
      LIMIT 1
      `,
      [discordUserId]
    );
    return r.rows?.[0] || null;
  } catch {
    const r = await pool.query(
      `
      SELECT u.id, u.username, u.role
      FROM discord_links dl
      JOIN users u ON u.id = dl.user_id
      WHERE dl.discord_user_id = $1
      LIMIT 1
      `,
      [discordUserId]
    );
    return r.rows?.[0] || null;
  }
}

/**
 * ─────────────────────────────────────────────
 * Streamer apply (Discord button + modal)
 * ─────────────────────────────────────────────
 *
 * IMPORTANT :
 * Discord "Modal" ne supporte PAS du texte statique / checkbox.
 * Donc on fait une section "Règlement" via un champ obligatoire
 * où l'utilisateur doit taper exactement : J'ACCEPTE
 * (et on met les règles en placeholder / label).
 */

const CID_APPLY_OPEN = "apply:open";
const CID_APPLY_MODAL = "apply:modal";
const CID_APPLY_DECIDE_PREFIX = "apply:decide:"; // apply:decide:approve:<requestId> | reject

function rulesShortText() {
  return [
    "📜 RÈGLEMENT (résumé) :",
    "• Communauté casino FR respectueuse et croissante.",
    "• Interdit : triche, détournement d’affiliation, pub non autorisée, botting/stats boosting.",
    "• Interdit : dépôts offerts qui poussent multi-comptes / toxicité.",
    "  ✅ Toléré : 1er dépôt remboursé jusqu’à 50% (max 50€).",
    "• Places limitées : être actif, ne pas gaspiller sa place.",
    "• Non-respect => révocation possible à tout moment.",
  ].join("\n");
}

function buildApplyModal() {
  const modal = new ModalBuilder().setCustomId(CID_APPLY_MODAL).setTitle("Demande Streamer LunaLive");

  const discordInput = new TextInputBuilder()
    .setCustomId("f_discord")
    .setLabel("Ton contact (Discord/Telegram) — OBLIGATOIRE")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: LeCasiNoze / LeCasiNoze#1234 / @telegram")
    .setRequired(true)
    .setMaxLength(120);

  const dliveInput = new TextInputBuilder()
    .setCustomId("f_dlive")
    .setLabel("Lien DLive (si tu en as déjà un)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://dlive.tv/LeCasinoze (ou vide si pas encore)")
    .setRequired(false)
    .setMaxLength(300);

  const linksInput = new TextInputBuilder()
    .setCustomId("f_links")
    .setLabel("Autres liens utiles (optionnel)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Twitch / YouTube / X / Insta / Kick / autres… (optionnel)")
    .setRequired(false)
    .setMaxLength(1200);

  const expInput = new TextInputBuilder()
    .setCustomId("f_exp")
    .setLabel("Ton expérience + ce que tu veux faire (optionnel)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Décris ton contenu, fréquence, type de slots/casinos, objectifs…")
    .setRequired(false)
    .setMaxLength(1200);

  const rulesInput = new TextInputBuilder()
    .setCustomId("f_rules")
    .setLabel('Règlement — tape exactement : J\'ACCEPTE (obligatoire)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(rulesShortText() + "\n\n=> Tape: J'ACCEPTE")
    .setRequired(true)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(discordInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(dliveInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(linksInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(expInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(rulesInput)
  );

  return modal;
}

function normalizeAccept(v: string) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function ticketName(username: string, discordId: string) {
  const base = slugify(username || "user").slice(0, 16) || "user";
  const suf = discordId.slice(-4);
  return `ticket-streamer-${base}-${suf}`.slice(0, 95);
}

async function ensureApplyMessage(guild: Guild, ctx: BotCtx) {
  try {
    const ch = await guild.channels.fetch(APPLY_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
      ctx.log(`[discord] apply channel not found / not text: ${APPLY_CHANNEL_ID}`);
      return;
    }
    const channel = ch as TextChannel;

    const embed = new EmbedBuilder()
      .setTitle("🎥 Faire une demande Streamer")
      .setDescription(
        [
          "Clique sur le bouton ci-dessous pour ouvrir le formulaire.",
          "",
          "⚠️ Conditions :",
          "• Être **vérifié** (faire `/link` d’abord).",
          "• Accepter le **règlement** (obligatoire).",
        ].join("\n")
      )
      .setFooter({ text: "LunaLive — demandes streamers" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(CID_APPLY_OPEN).setLabel("Faire une demande streamer").setStyle(ButtonStyle.Primary)
    );

    // Try to find and edit existing bot message (last 30)
    const msgs = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    const existing = msgs?.find((m) => m.author?.id === guild.client.user?.id && m.components?.length);

    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] }).catch(() => null);
      ctx.log("[discord] apply message updated");
    } else {
      await channel.send({ embeds: [embed], components: [row] });
      ctx.log("[discord] apply message sent");
    }
  } catch (e: any) {
    ctx.log(`[discord] ensureApplyMessage failed: ${e?.message || e}`);
  }
}

async function createTicketChannel(guild: Guild, member: GuildMember, ctx: BotCtx) {
  const name = ticketName(member.user.username, member.id);

  // perms : only user + staff roles + bot
  const overwrites: any[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
  ];

  for (const rid of STAFF_ROLE_IDS) {
    overwrites.push({
      id: rid,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: STAFF_TICKETS_CATEGORY_ID,
    topic: `Streamer apply ticket | user=${member.user.tag} (${member.id})`,
    permissionOverwrites: overwrites,
    reason: "Streamer apply ticket",
  });

  ctx.log(`[discord] ticket created ${ch.id} for user=${member.id}`);
  return ch;
}

async function dbUpsertStreamerRequest(discordUserId: string, payload: any) {
  // user id must exist via discord_links
  const link = await pool.query(`SELECT user_id FROM discord_links WHERE discord_user_id=$1 LIMIT 1`, [discordUserId]);
  const userId = link.rows?.[0]?.user_id ? Number(link.rows[0].user_id) : null;
  if (!userId) return { ok: false as const, error: "not_linked" as const };

  // We use streamer_requests table (mig040 compatible)
  const discord = String(payload.discord || "").slice(0, 200);
  const channelUrl = String(payload.dliveUrl || "").slice(0, 300);

  const up = await pool.query(
    `
    INSERT INTO streamer_requests (user_id, status, discord, channel_url, rules_accepted, payload, updated_at)
    VALUES ($1, 'pending', $2, $3, TRUE, $4::jsonb, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET status='pending', discord=EXCLUDED.discord, channel_url=EXCLUDED.channel_url, rules_accepted=TRUE, payload=EXCLUDED.payload, updated_at=NOW()
    RETURNING id, user_id, status, created_at, updated_at
    `,
    [userId, discord, channelUrl, JSON.stringify(payload)]
  );

  return { ok: true as const, request: up.rows[0], userId };
}

async function sendDecisionLog(guild: Guild, content: string, ctx: BotCtx) {
  try {
    const ch = await guild.channels.fetch(STAFF_DECISIONS_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
      ctx.log(`[discord] decisions channel not found / not text: ${STAFF_DECISIONS_CHANNEL_ID}`);
      return;
    }
    await (ch as TextChannel).send({
      content: `<@&${STAFF_DECISIONS_PING_ROLE_ID}> ${content}`,
      allowedMentions: { roles: [STAFF_DECISIONS_PING_ROLE_ID] },
    });
  } catch (e: any) {
    ctx.log(`[discord] sendDecisionLog failed: ${e?.message || e}`);
  }
}

async function approveRequest(requestId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `UPDATE streamer_requests SET status='approved', updated_at=NOW() WHERE id=$1 RETURNING user_id`,
      [requestId]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "not_found" as const };
    }

    const userId = Number(upd.rows[0].user_id);

    await client.query(`UPDATE users SET role='streamer' WHERE id=$1`, [userId]);

    const u = await client.query(`SELECT username FROM users WHERE id=$1 LIMIT 1`, [userId]);
    const username = String(u.rows[0]?.username || `user-${userId}`);
    let slug = slugify(username);

    const exists = await client.query(`SELECT 1 FROM streamers WHERE slug=$1`, [slug]);
    if (exists.rows[0]) slug = `${slug}-${userId}`;

    await client.query(
      `
      INSERT INTO streamers (slug, display_name, user_id, title, viewers, is_live)
      VALUES ($1,$2,$3,'',0,false)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [slug, username, userId]
    );

    await client.query(`UPDATE streamers SET suspended_until=NULL, updated_at=NOW() WHERE user_id=$1`, [userId]);

    const s = await client.query(`SELECT id, slug FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = Number(s.rows[0]?.id || 0);
    if (!streamerId) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "streamer_missing" as const };
    }

    const conn = await ensureAssignedDliveAccount(client, streamerId);
    if (!conn) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "no_free_provider_account" as const };
    }

    await client.query("COMMIT");
    return { ok: true as const, userId, username, streamer: { id: streamerId, slug: String(s.rows[0]?.slug || slug) } };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function rejectRequest(requestId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `UPDATE streamer_requests SET status='rejected', updated_at=NOW() WHERE id=$1 RETURNING user_id`,
      [requestId]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "not_found" as const };
    }

    const userId = Number(upd.rows[0].user_id);

    await client.query(`UPDATE users SET role='viewer' WHERE id=$1`, [userId]);

    const s = await client.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows[0]?.id ? Number(s.rows[0].id) : null;
    if (streamerId) {
      await releaseAccountForStreamerId(client, streamerId);
      await client.query(
        `UPDATE streamers SET suspended_until='infinity'::timestamptz, featured=false, updated_at=NOW() WHERE id=$1`,
        [streamerId]
      );
    }

    await client.query("COMMIT");
    return { ok: true as const, userId };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * ─────────────────────────────────────────────
 * Start bot
 * ─────────────────────────────────────────────
 */
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

    // Slash commands (guild scoped)
    const rest = new REST({ version: "10" }).setToken(token);
    const commands = [
      { name: "help", description: "Aide LunaLive" },
      { name: "whoami", description: "Afficher votre statut de liaison LunaLive" },
      { name: "link", description: "Lier votre Discord à votre compte LunaLive" },
    ];

    if (!client.user?.id) throw new Error("Missing client.user.id");
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    ctx.log(`[discord] slash commands registered (${commands.length})`);

    // Apply panel message in APPLY_CHANNEL_ID
    if (g) await ensureApplyMessage(g, ctx);

    // periodic sync safety net
    setInterval(() => {
      pool
        .query(`SELECT discord_user_id FROM discord_links ORDER BY updated_at DESC LIMIT 5000`)
        .then(async (r) => {
          for (const it of r.rows) await syncUserEverywhere(String(it.discord_user_id), ctx);
        })
        .catch((e) => ctx.log(`[discord] periodic sync failed: ${e?.message || e}`));
    }, 6 * 3600_000);
  });

  // Sync immediate when member joins
  client.on("guildMemberAdd", async (member) => {
    try {
      const linked = await pool.query(`SELECT 1 FROM discord_links WHERE discord_user_id = $1 LIMIT 1`, [
        String(member.id),
      ]);
      if (linked.rowCount) {
        await syncUserEverywhere(String(member.id), ctx);
        await safeDm(
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
      // ─────────────── Slash commands ───────────────
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
            String(interaction.user.id),
            `🔗 Liaison LunaLive — Code\n\nVotre code : **${code}**\nExpiration : ${expiresAt.toLocaleString(
              "fr-FR"
            )}\n\nÀ faire : allez sur LunaLive → Profil → Lier Discord et collez ce code.\n\nAprès validation, votre pseudo et vos rôles seront synchronisés automatiquement.`,
            ctx
          );
          return;
        }
      }

      // ─────────────── Button: open apply modal ───────────────
      if (interaction.isButton() && interaction.customId === CID_APPLY_OPEN) {
        const guild = interaction.guild;
        const member = interaction.member as GuildMember | null;

        if (!guild || !member) {
          await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
          return;
        }

        if (isRestricted(member)) {
          await interaction.reply({ ephemeral: true, content: "⛔ Vous ne pouvez pas faire de demande (Restricted)." });
          return;
        }

        // Condition demandée : si pas vérifié -> message “fais /link”
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

      // ─────────────── Modal submit ───────────────
      if (interaction.isModalSubmit() && interaction.customId === CID_APPLY_MODAL) {
        const guild = interaction.guild;
        const member = interaction.member as GuildMember | null;

        if (!guild || !member) {
          await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
          return;
        }

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

        // Validation règlement
        const okRules = normalizeAccept(rules) === normalizeAccept("J'ACCEPTE");
        if (!okRules) {
          await interaction.reply({
            ephemeral: true,
            content:
              "❌ Règlement non accepté.\n\nDans le champ règlement, tu dois taper exactement : **J'ACCEPTE**",
          });
          return;
        }

        // Crée request en DB (doit être lié)
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
            content:
              "❌ Ton compte Discord n'est pas lié à un compte LunaLive.\n\n➡️ Fais **/link** puis réessaye.",
          });
          return;
        }

        const requestId = Number(up.request.id);

        // Crée le ticket (conversation)
        const ticket = await createTicketChannel(guild, member, ctx);

        const recap = new EmbedBuilder()
          .setTitle("📩 Demande Streamer — Récap")
          .setDescription("Discussion ici avec le staff. Merci de rester disponible.")
          .addFields(
            { name: "Utilisateur", value: `<@${member.id}> (${member.user.tag})`, inline: false },
            { name: "Contact (Discord/Telegram)", value: discord.trim() ? discord.trim() : "—", inline: false },
            { name: "DLive", value: dliveUrl.trim() ? dliveUrl.trim() : "—", inline: false },
            { name: "Autres liens", value: otherLinks.trim() ? otherLinks.trim().slice(0, 1000) : "—", inline: false },
            { name: "Expérience / Projet", value: experience.trim() ? experience.trim().slice(0, 1000) : "—", inline: false },
            { name: "Règlement", value: "✅ Accepté", inline: true },
            { name: "Request ID", value: String(requestId), inline: true }
          )
          .setFooter({ text: "LunaLive — streamer requests" });

        await (ticket as TextChannel).send({ content: `<@${member.id}>`, embeds: [recap] });

        // Message d’actions staff (dans le ticket)
        const actionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${CID_APPLY_DECIDE_PREFIX}approve:${requestId}`)
            .setLabel("✅ Approuver")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${CID_APPLY_DECIDE_PREFIX}reject:${requestId}`)
            .setLabel("❌ Refuser")
            .setStyle(ButtonStyle.Danger)
        );

        await (ticket as TextChannel).send({
          content: `Staff: utilisez les boutons ci-dessous.`,
          components: [actionsRow],
        });

        // Réponse à l'utilisateur (ephemeral)
        await interaction.reply({
          ephemeral: true,
          content: `✅ Demande envoyée ! Un ticket a été créé : <#${ticket.id}>`,
        });

        return;
      }

      // ─────────────── Staff approve/reject buttons ───────────────
      if (interaction.isButton() && interaction.customId.startsWith(CID_APPLY_DECIDE_PREFIX)) {
        const guild = interaction.guild;
        const member = interaction.member as GuildMember | null;
        if (!guild || !member) {
          await interaction.reply({ ephemeral: true, content: "Erreur: guild/member manquant." });
          return;
        }

        if (!hasAnyRole(member, STAFF_ROLE_IDS)) {
          await interaction.reply({ ephemeral: true, content: "❌ Tu n'as pas la permission (staff requis)." });
          return;
        }

        const rest = interaction.customId.slice(CID_APPLY_DECIDE_PREFIX.length); // approve:<id> or reject:<id>
        const [action, idStr] = rest.split(":");
        const requestId = Number(idStr || 0);
        if (!requestId || (action !== "approve" && action !== "reject")) {
          await interaction.reply({ ephemeral: true, content: "Erreur: action/id invalide." });
          return;
        }

        // Avoid double-click issues
        await interaction.deferReply({ ephemeral: true });

        // Who is the applicant? Try from DB payload (best effort)
        const r = await pool.query(
          `SELECT user_id, discord, channel_url, payload FROM streamer_requests WHERE id=$1 LIMIT 1`,
          [requestId]
        );
        if (!r.rows[0]) {
          await interaction.editReply("❌ Request introuvable en DB.");
          return;
        }

        const payload = r.rows[0]?.payload || {};
        const applicantDiscordUserId = String(payload?.discordUserId || "").trim();

        if (action === "approve") {
          const res = await approveRequest(requestId);
          if (!res.ok) {
            await interaction.editReply(`❌ Approve impossible: ${res.error}`);
            return;
          }

          // ✅ DECISION MESSAGE => STAFF_DECISIONS_CHANNEL_ID (ping role)
          await sendDecisionLog(
            guild,
            `✅ **APPROUVÉ** — request #${requestId} — par <@${member.id}>` +
              (applicantDiscordUserId ? ` — user <@${applicantDiscordUserId}>` : ""),
            ctx
          );

          // Dans le ticket: on n'envoie PAS le message de décision, on désactive juste
          const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("noop1").setLabel("✅ Approuvé").setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId("noop2").setLabel("❌ Refuser").setStyle(ButtonStyle.Danger).setDisabled(true)
          );

          await interaction.message.edit({
            content: `✅ Décision traitée. (Log envoyé dans <#${STAFF_DECISIONS_CHANNEL_ID}>)`,
            components: [disabledRow],
          });

          if (applicantDiscordUserId) {
            await safeDm(
              applicantDiscordUserId,
              `✅ Ta demande Streamer LunaLive a été **approuvée**.\nTu peux suivre le ticket si besoin : <#${interaction.channelId}>`,
              ctx
            );
            // sync roles now (streamer)
            await syncUserEverywhere(applicantDiscordUserId, ctx);
          }

          await interaction.editReply("✅ Approuvé. Message envoyé dans le salon de décisions.");
          return;
        }

        if (action === "reject") {
          const res = await rejectRequest(requestId);
          if (!res.ok) {
            await interaction.editReply(`❌ Reject impossible: ${res.error}`);
            return;
          }

          // ✅ DECISION MESSAGE => STAFF_DECISIONS_CHANNEL_ID (ping role)
          await sendDecisionLog(
            guild,
            `❌ **REFUSÉ** — request #${requestId} — par <@${member.id}>` +
              (applicantDiscordUserId ? ` — user <@${applicantDiscordUserId}>` : ""),
            ctx
          );

          const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("noop1").setLabel("✅ Approuver").setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId("noop2").setLabel("❌ Refusé").setStyle(ButtonStyle.Danger).setDisabled(true)
          );

          await interaction.message.edit({
            content: `✅ Décision traitée. (Log envoyé dans <#${STAFF_DECISIONS_CHANNEL_ID}>)`,
            components: [disabledRow],
          });

          if (applicantDiscordUserId) {
            await safeDm(
              applicantDiscordUserId,
              `❌ Ta demande Streamer LunaLive a été **refusée**.\nTu peux répondre dans le ticket si tu veux des précisions : <#${interaction.channelId}>`,
              ctx
            );
            // sync roles now (back to viewer)
            await syncUserEverywhere(applicantDiscordUserId, ctx);
          }

          await interaction.editReply("✅ Refusé. Message envoyé dans le salon de décisions.");
          return;
        }
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
  await syncUserEverywhere(String(discordUserId), { log: (m) => console.log(m) });
}
