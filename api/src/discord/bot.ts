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
} from "discord.js";

type BotCtx = { log: (msg: string) => void };

let discordClient: Client | null = null;

/**
 * ─────────────────────────────────────────────
 * CONFIG (IDs)
 * ─────────────────────────────────────────────
 */
const CFG = {
  // Guild officiel
  guildId: String(process.env.DISCORD_GUILD_ID || "1467139956249067717"),

  // Où poster le bouton + message
  applyChannelId: String(process.env.APPLY_CHANNEL_ID || "1467142148431413370"),

  // Catégorie où créer les tickets
  staffTicketsCategoryId: String(process.env.STAFF_TICKETS_CATEGORY_ID || "1467141806922666034"),

  // Roles (IDs)
  roleVerifiedId: String(process.env.ROLE_VERIFIED_ID || "1467140844233556231"),
  roleViewerId: String(process.env.ROLE_VIEWER_ID || "1467140868288024742"),
  roleStreamerId: String(process.env.ROLE_STREAMER_ID || "1467140886793027656"),
  rolePartnerId: String(process.env.ROLE_PARTNER_ID || "1467140935954726984"),
  roleModId: String(process.env.ROLE_MOD_LUNALIVE_ID || "1467140910771994801"),
  roleRestrictedId: String(process.env.ROLE_RESTRICTED_ID || "1467140964773794005"),

  // Qui peut approve/reject
  staffRoleIds: String(process.env.STAFF_ROLE_IDS || "1467140769436405981,1467140795105546441")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

/**
 * ─────────────────────────────────────────────
 * IDs Custom components
 * ─────────────────────────────────────────────
 */
const APPLY_BUTTON_ID = "streamer_apply:open";
const APPLY_MODAL_ID = "streamer_apply:modal";
// format: streamer_req:approve:<requestId>:<discordUserId>
const STAFF_BTN_PREFIX = "streamer_req";

/**
 * ─────────────────────────────────────────────
 * Helpers (mask / secrets / codes)
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

/**
 * ─────────────────────────────────────────────
 * Discord role helpers (IDs)
 * ─────────────────────────────────────────────
 */
function memberHasRole(member: any, roleId: string) {
  try {
    return !!roleId && member?.roles?.cache?.has?.(roleId);
  } catch {
    return false;
  }
}

function isStaff(member: any) {
  try {
    const cache = member?.roles?.cache;
    if (!cache) return false;
    return CFG.staffRoleIds.some((rid) => cache.has(rid));
  } catch {
    return false;
  }
}

/**
 * Applique UNIQUEMENT les rôles "gérés par le bot" :
 * Verified / Viewer / Streamer / Partner / Mod / Restricted
 * => on ajoute ET on retire pour que ça colle au rôle LunaLive
 */
async function applyRolesAndNick(guild: Guild, member: GuildMember, userRow: any, ctx: BotCtx) {
  const managed = new Set<string>(
    [
      CFG.roleVerifiedId,
      CFG.roleViewerId,
      CFG.roleStreamerId,
      CFG.rolePartnerId,
      CFG.roleModId,
      CFG.roleRestrictedId,
    ].filter(Boolean)
  );

  const want = new Set<string>();

  // Verified toujours si le compte est lié (on est en syncUserEverywhere)
  if (CFG.roleVerifiedId) want.add(CFG.roleVerifiedId);

  const role = String(userRow?.role || "viewer");

  // rôle principal
  if (role.includes("streamer")) {
    if (CFG.roleStreamerId) want.add(CFG.roleStreamerId);
  } else {
    if (CFG.roleViewerId) want.add(CFG.roleViewerId);
  }

  if (role.includes("mod") && CFG.roleModId) want.add(CFG.roleModId);
  if (role.includes("partner") && CFG.rolePartnerId) want.add(CFG.rolePartnerId);

  // Restricted si ton backend le signale via role strict "restricted"
  const isRestricted = role === "restricted";
  if (isRestricted && CFG.roleRestrictedId) want.add(CFG.roleRestrictedId);

  // add/remove proprement (sans toucher aux autres rôles)
  try {
    const current = new Set(member.roles.cache.map((r: any) => r.id));
    const toAdd = [...want].filter((id) => !current.has(id));
    const toRemove = [...managed].filter((id) => current.has(id) && !want.has(id));

    if (toAdd.length) await member.roles.add(toAdd).catch(() => {});
    if (toRemove.length) await member.roles.remove(toRemove).catch(() => {});
  } catch (e: any) {
    ctx.log(`[discord] roles sync failed guild=${guild.id} user=${member.id}: ${e?.message || e}`);
  }

  // Nick strict
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

  // 1) essayer strict
  if (await trySet(targetBase)) return;

  // 2) collision/refus → suffix stable
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

/**
 * Sync pseudo+rôles sur tous les serveurs où le bot est présent.
 * Source de vérité: DB LunaLive.
 */
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

  // Ban site (source de vérité LunaLive)
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
 * Streamer requests DB logic (copie de ton internal router)
 * ─────────────────────────────────────────────
 */
async function upsertStreamerRequestPending(userId: number, discordUserId: string, dliveUrl: string | null, notes: any) {
  // On tente le schéma "complet", sinon fallback minimal
  try {
    const up = await pool.query(
      `
      INSERT INTO streamer_requests (user_id, status, discord, channel_url, rules_accepted, updated_at)
      VALUES ($1, 'pending', $2, $3, TRUE, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET status='pending', discord=EXCLUDED.discord, channel_url=EXCLUDED.channel_url, updated_at=NOW()
      RETURNING id, user_id, status, created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [userId, `discord:${discordUserId}`, dliveUrl]
    );

    // notes (optionnel)
    if (notes) {
      try {
        await pool.query(`UPDATE streamer_requests SET notes = $2 WHERE user_id = $1`, [userId, JSON.stringify(notes)]);
      } catch {
        // ignore si colonne inexistante
      }
    }

    return up.rows?.[0] || null;
  } catch {
    // fallback ultra-minimal
    const up = await pool.query(
      `
      INSERT INTO streamer_requests (user_id, status)
      VALUES ($1, 'pending')
      ON CONFLICT (user_id)
      DO UPDATE SET status='pending', updated_at=NOW()
      RETURNING id, user_id, status, created_at AS "createdAt"
      `,
      [userId]
    );
    return up.rows?.[0] || null;
  }
}

async function approveRequestDb(requestId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `
      UPDATE streamer_requests
      SET status='approved', updated_at=NOW()
      WHERE id=$1
      RETURNING user_id
      `,
      [requestId]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "not_found" };
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
      return { ok: false as const, error: "streamer_missing" };
    }

    const conn = await ensureAssignedDliveAccount(client, streamerId);
    if (!conn) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "no_free_provider_account" };
    }

    await client.query("COMMIT");
    return { ok: true as const, userId, username, streamerId, streamerSlug: String(s.rows[0]?.slug || slug) };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function rejectRequestDb(requestId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `
      UPDATE streamer_requests
      SET status='rejected', updated_at=NOW()
      WHERE id=$1
      RETURNING user_id
      `,
      [requestId]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "not_found" };
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
 * Apply message (bouton) dans APPLY_CHANNEL_ID
 * ─────────────────────────────────────────────
 */
async function ensureApplyMessage(ctx: BotCtx, client: Client) {
  const g = await client.guilds.fetch(CFG.guildId).catch(() => null);
  if (!g) return;

  const ch = await g.channels.fetch(CFG.applyChannelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) {
    ctx.log(`[discord] APPLY_CHANNEL_ID invalid: ${CFG.applyChannelId}`);
    return;
  }

  // éviter doublons: on check les derniers msgs du bot
    const msgs = await ch.messages.fetch({ limit: 15 }).catch(() => null);
    if (msgs) {
    const already = msgs.find((m: any) => {
        if (m?.author?.id !== client.user?.id) return false;

        // Typings discord.js parfois pénibles: on cast en any
        const rows = (m as any).components ?? [];
        return rows.some((row: any) => (row?.components ?? []).some((c: any) => c?.customId === APPLY_BUTTON_ID));
    });

    if (already) return;
    }

  const embed = new EmbedBuilder()
    .setTitle("Demande Streamer")
    .setDescription(
      [
        "Tu veux streamer sur **LunaLive** ?",
        "",
        "✅ Avant tout : fais **/link** pour lier ton compte LunaLive à Discord.",
        "Ensuite clique sur le bouton ci-dessous.",
      ].join("\n")
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(APPLY_BUTTON_ID).setLabel("Faire une demande").setStyle(ButtonStyle.Primary)
  );

  await ch.send({ embeds: [embed], components: [row] });
  ctx.log(`[discord] apply message posted in #${(ch as any).name}`);
}

/**
 * ─────────────────────────────────────────────
 * Main start
 * ─────────────────────────────────────────────
 */
export async function startDiscordBot(ctx: BotCtx) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID || CFG.guildId;

  if (!token) throw new Error("Missing env DISCORD_BOT_TOKEN");
  if (!guildId) throw new Error("Missing env DISCORD_GUILD_ID");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });

  discordClient = client;

  client.once("ready", async () => {
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

    // ✅ message bouton apply (guild officiel)
    await ensureApplyMessage(ctx, client);

    // sync sécurité toutes les 6h (liens existants)
    setInterval(() => {
      pool
        .query(`SELECT discord_user_id FROM discord_links ORDER BY updated_at DESC LIMIT 5000`)
        .then(async (r) => {
          for (const it of r.rows) {
            await syncUserEverywhere(String(it.discord_user_id), ctx);
          }
        })
        .catch((e) => ctx.log(`[discord] periodic sync failed: ${e?.message || e}`));
    }, 6 * 3600_000);
  });

  // Sync immédiat quand un membre rejoint (si déjà lié)
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

  // Interactions: slash + boutons + modals
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      // ─────────────────────────
      // Slash commands
      // ─────────────────────────
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

        return;
      }

      // ─────────────────────────
      // Bouton "Faire une demande"
      // ─────────────────────────
      if (interaction.isButton() && interaction.customId === APPLY_BUTTON_ID) {
        if (!interaction.inGuild()) return;

        // règle: doit être Verified
        if (!memberHasRole(interaction.member, CFG.roleVerifiedId)) {
          await interaction.reply({
            ephemeral: true,
            content: "❌ Tu ne peux pas faire de demande streamer tant que tu n’as pas fait **/link**.",
          });
          return;
        }

        const modal = new ModalBuilder().setCustomId(APPLY_MODAL_ID).setTitle("Demande Streamer (rapide)");

        const dlive = new TextInputBuilder()
          .setCustomId("dlive")
          .setLabel("DLive (URL ou username) — requis")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
          .setPlaceholder("ex: https://dlive.tv/MonChannel  ou  MonChannel");

        const other = new TextInputBuilder()
          .setCustomId("other")
          .setLabel("Autres plateformes (optionnel)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(800)
          .setPlaceholder("Kick: ...\nYouTube: ...\nTwitch: ...");

        const exp = new TextInputBuilder()
          .setCustomId("exp")
          .setLabel("Infos utiles (rapide)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(800)
          .setPlaceholder("Déjà des lives ? moyenne viewers ? fréquence ?");

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(dlive),
          new ActionRowBuilder<TextInputBuilder>().addComponents(other),
          new ActionRowBuilder<TextInputBuilder>().addComponents(exp)
        );

        await interaction.showModal(modal);
        return;
      }

      // ─────────────────────────
      // Modal submit: create request + ticket
      // ─────────────────────────
      if (interaction.isModalSubmit() && interaction.customId === APPLY_MODAL_ID) {
        if (!interaction.inGuild()) return;

        // re-check Verified
        if (!memberHasRole(interaction.member, CFG.roleVerifiedId)) {
          await interaction.reply({
            ephemeral: true,
            content: "❌ Tu ne peux pas faire de demande streamer tant que tu n’as pas fait **/link**.",
          });
          return;
        }

        const discordUserId = String(interaction.user.id);

        // doit être lié côté DB
        const linked = await getLinkedUser(discordUserId);
        if (!linked?.id) {
          await interaction.reply({
            ephemeral: true,
            content: "❌ Je ne trouve pas ton compte LunaLive lié. Fais **/link** puis réessaie.",
          });
          return;
        }

        const dliveRaw = String(interaction.fields.getTextInputValue("dlive") || "").trim();
        const otherLinks = String(interaction.fields.getTextInputValue("other") || "").trim();
        const experience = String(interaction.fields.getTextInputValue("exp") || "").trim();

        const dliveUrl = dliveRaw ? dliveRaw.slice(0, 200) : null;

        const reqRow = await upsertStreamerRequestPending(
          Number(linked.id),
          discordUserId,
          dliveUrl,
          { otherLinks: otherLinks || null, experience: experience || null }
        );

        const requestId = Number(reqRow?.id || 0);
        if (!requestId) {
          await interaction.reply({ ephemeral: true, content: "⚠️ Erreur: impossible de créer la demande." });
          return;
        }

        // Ticket channel
        const guild = interaction.guild!;
        const parent = await guild.channels.fetch(CFG.staffTicketsCategoryId).catch(() => null);
        if (!parent || parent.type !== ChannelType.GuildCategory) {
          await interaction.reply({ ephemeral: true, content: "⚠️ Config invalide: STAFF_TICKETS_CATEGORY_ID." });
          return;
        }

        const safeName =
          `ticket-streamer-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 85) ||
          `ticket-streamer-${discordUserId}`;

        const overwrites: any[] = [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: discordUserId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
        ];

        for (const rid of CFG.staffRoleIds) {
          overwrites.push({
            id: rid,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          });
        }

        const ticket = await guild.channels.create({
          name: safeName,
          type: ChannelType.GuildText,
          parent: parent.id,
          permissionOverwrites: overwrites,
        });

        const embed = new EmbedBuilder()
          .setTitle("📩 Demande Streamer")
          .addFields(
            { name: "Discord", value: `<@${discordUserId}> (${discordUserId})`, inline: false },
            { name: "LunaLive", value: `${linked.username} (id ${linked.id})`, inline: false },
            { name: "DLive", value: dliveUrl || "—", inline: false },
            { name: "Autres", value: otherLinks ? otherLinks.slice(0, 900) : "—", inline: false },
            { name: "Infos", value: experience ? experience.slice(0, 900) : "—", inline: false },
            { name: "Request ID", value: String(requestId), inline: true }
          );

        const approveId = `${STAFF_BTN_PREFIX}:approve:${requestId}:${discordUserId}`;
        const rejectId = `${STAFF_BTN_PREFIX}:reject:${requestId}:${discordUserId}`;

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(approveId).setLabel("✅ Approve").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(rejectId).setLabel("⛔ Reject").setStyle(ButtonStyle.Danger)
        );

        await ticket.send({ embeds: [embed], components: [row] });

        await interaction.reply({
          ephemeral: true,
          content: `✅ Demande envoyée au staff. Ticket créé : <#${ticket.id}>`,
        });

        return;
      }

      // ─────────────────────────
      // Staff buttons approve/reject
      // ─────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith(`${STAFF_BTN_PREFIX}:`)) {
        if (!interaction.inGuild()) return;

        if (!isStaff(interaction.member)) {
          await interaction.reply({ ephemeral: true, content: "❌ Staff uniquement." });
          return;
        }

        const parts = interaction.customId.split(":");
        const action = parts[1]; // approve/reject
        const requestId = Number(parts[2] || 0);
        const targetDiscordUserId = String(parts[3] || "");

        if (!requestId || !targetDiscordUserId) {
          await interaction.reply({ ephemeral: true, content: "⚠️ Bouton invalide." });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        if (action === "approve") {
          const r = await approveRequestDb(requestId);
          if (!r.ok) return interaction.editReply({ content: `⚠️ Approve impossible: ${r.error}` });

          // sync rôles/nick partout (dont serveur officiel)
          await syncUserEverywhere(targetDiscordUserId, ctx).catch(() => {});

          // disable buttons message
          await interaction.message.edit({ components: [] }).catch(() => {});
          await interaction.editReply({ content: `✅ Approved. LunaLive=${r.username} | streamer=${r.streamerSlug}` });

          await (interaction.channel as any)
            ?.send?.(`✅ Demande approuvée. <@${targetDiscordUserId}> est maintenant **Streamer**.`)
            .catch(() => {});
          return;
        }

        if (action === "reject") {
          const r = await rejectRequestDb(requestId);
          if (!r.ok) return interaction.editReply({ content: `⚠️ Reject impossible: ${r.error}` });

          await syncUserEverywhere(targetDiscordUserId, ctx).catch(() => {});

          await interaction.message.edit({ components: [] }).catch(() => {});
          await interaction.editReply({ content: `⛔ Rejected.` });

          await (interaction.channel as any)
            ?.send?.(`⛔ Demande refusée. <@${targetDiscordUserId}> reste **Viewer**.`)
            .catch(() => {});
          return;
        }

        return interaction.editReply({ content: "⚠️ Action inconnue." });
      }
    } catch (e: any) {
      ctx.log(`[discord] interaction error: ${e?.message || e}`);

      if ((interaction as any).isRepliable?.()) {
        try {
          const payload = { ephemeral: true as const, content: "Erreur interne. Réessayez plus tard." };
          if ((interaction as any).deferred || (interaction as any).replied) {
            await (interaction as any).followUp(payload);
          } else {
            await (interaction as any).reply(payload);
          }
        } catch {}
      }
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
