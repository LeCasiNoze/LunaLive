import crypto from "crypto";
import { pool } from "../db.js";
import { getActiveSiteUserBan } from "../auth.js";

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";

type BotCtx = { log: (msg: string) => void };

let discordClient: Client | null = null;

function getLinkCodeSecret() {
  const s = String(process.env.DISCORD_LINK_CODE_SECRET || "").trim();
  if (!s) throw new Error("DISCORD_LINK_CODE_SECRET missing");
  return s;
}

function hashCode(code: string) {
  const secret = getLinkCodeSecret();
  return crypto.createHash("sha256").update(`${code}::${secret}`).digest("hex");
}

function codeAlphabet() {
  // sans O/0, I/1 pour éviter confusion
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

async function findRoleByName(guild: any, roleName: string) {
  const roles = await guild.roles.fetch();
  return roles.find((r: any) => r?.name === roleName) || null;
}

async function applyRolesAndNick(guild: any, member: any, userRow: any, ctx: BotCtx) {
  // rôles par NOMS (simple et portable)
  const roleVerified = await findRoleByName(guild, "✅ Verified");
  const roleViewer = await findRoleByName(guild, "👤 Viewer");
  const roleStreamer = await findRoleByName(guild, "🎥 Streamer");
  const roleMod = await findRoleByName(guild, "🛡️ Mod LunaLive");
  const rolePartner = await findRoleByName(guild, "🤝 Partenaire");
  const roleRestricted = await findRoleByName(guild, "⛔ Restricted");

  const want = new Set<string>();
  if (roleVerified) want.add(roleVerified.id);

  const role = String(userRow?.role || "viewer");
  if (role.includes("streamer") && roleStreamer) want.add(roleStreamer.id);
  else if (roleViewer) want.add(roleViewer.id);

  if (role.includes("mod") && roleMod) want.add(roleMod.id);
  if (role.includes("partner") && rolePartner) want.add(rolePartner.id);

  // Restricted (si ton backend le signale via role)
  const isRestricted = role === "restricted";
  if (isRestricted && roleRestricted) want.add(roleRestricted.id);

  // Ajoute les rôles manquants (sans retirer des rôles “externes” au bot)
  try {
    const current = new Set(member.roles.cache.map((r: any) => r.id));
    const toAdd = [...want].filter((id) => !current.has(id));
    if (toAdd.length) await member.roles.add(toAdd);
  } catch (e: any) {
    ctx.log(`[discord] roles add failed guild=${guild.id} user=${member.id}: ${e?.message || e}`);
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

  // 2) collision / refus → suffix court stable
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

  // Cherche le lien + user
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

  // Ban site ? (source de vérité LunaLive)
  const ban = await getActiveSiteUserBan(Number(row.user_id));
  const isBanned = !!ban?.banned;

  for (const [, guild] of discordClient.guilds.cache) {
    try {
      const g = await discordClient.guilds.fetch(guild.id);
      const member = await g.members.fetch(discordUserId).catch(() => null);
      if (!member) continue;

      if (isBanned) {
        // ban global (si le bot a la perm)
        await g.members.ban(discordUserId, { reason: "LunaLive ban" }).catch(() => null);
        continue;
      }

      await applyRolesAndNick(g, member, row, ctx);
    } catch (e: any) {
      ctx.log(`[discord] sync failed guild=${guild.id} user=${discordUserId}: ${e?.message || e}`);
    }
  }

  await pool.query(
    `UPDATE discord_links SET last_sync_at = NOW(), updated_at = NOW() WHERE discord_user_id = $1`,
    [discordUserId]
  ).catch(() => {});
}

async function createLinkCode(discordUserId: string) {
  const code = genCode(6);
  const codeHash = hashCode(code);
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
  // email peut exister ou non selon ton schéma : on tente, sinon null
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

export async function startDiscordBot(ctx: BotCtx) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

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

    // petit job de sync toutes les 6h (filet de sécurité)
    setInterval(() => {
      // on sync seulement les liens existants
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
      const linked = await pool.query(
        `SELECT 1 FROM discord_links WHERE discord_user_id = $1 LIMIT 1`,
        [String(member.id)]
      );
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

  // Slash interactions
  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === "help") {
        await interaction.reply({
          ephemeral: true,
          content:
            "LunaBot — commandes :\n• /link : lier votre compte LunaLive\n• /whoami : afficher votre statut\n",
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
        // déjà lié ?
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

        const { code, expiresAt } = await createLinkCode(String(interaction.user.id));

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
          `🔗 Liaison LunaLive — Code\n\nVotre code : **${code}**\nExpiration : ${expiresAt.toLocaleString("fr-FR")}\n\nÀ faire : allez sur LunaLive → Profil → Lier Discord et collez ce code.\n\nAprès validation, votre pseudo et vos rôles seront synchronisés automatiquement.`,
          ctx
        );
        return;
      }
    } catch (e: any) {
      ctx.log(`[discord] interaction error: ${e?.message || e}`);
      if (interaction.isRepliable()) {
        try {
          await interaction.reply({ ephemeral: true, content: "Erreur interne. Réessayez plus tard." });
        } catch {}
      }
    }
  });

  // Quand un code est consommé, l’API ne “pousse” pas d’event ici (simple V1).
  // On appliquera la sync en appelant syncUserEverywhere depuis la route consume (voir étape 4).

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
