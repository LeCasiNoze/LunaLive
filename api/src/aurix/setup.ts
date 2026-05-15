// Création idempotente de la structure Aurix.
import {
  CategoryChannel,
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  OverwriteType,
  PermissionFlagsBits,
  type PermissionOverwrites,
  PermissionsBitField,
  Role,
  TextChannel,
  type OverwriteResolvable,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import * as cfg from "./config.js";
import { kvGet, kvSet } from "./db.js";
import { ensureOpenBatch } from "./refill.js";

const log = (...a: unknown[]) => console.log("[aurix.setup]", ...a);

async function getOrCreateRole(
  guild: Guild,
  name: string,
  opts: { color: number; hoist?: boolean; permissions?: bigint }
): Promise<Role> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return guild.roles.create({
    name,
    color: opts.color,
    hoist: opts.hoist ?? true,
    mentionable: true,
    permissions: opts.permissions ? new PermissionsBitField(opts.permissions) : new PermissionsBitField(0n),
    reason: "Aurix setup",
  });
}

function findCategory(guild: Guild, name: string): CategoryChannel | undefined {
  return guild.channels.cache.find(
    (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === name
  );
}

function findTextChannel(category: CategoryChannel, name: string): TextChannel | undefined {
  const norm = name.toLowerCase().replace(/\s+/g, "-");
  return category.children.cache.find(
    (c): c is TextChannel => c.type === ChannelType.GuildText && c.name === norm
  );
}

async function getOrCreateCategory(
  guild: Guild,
  name: string,
  overwrites: OverwriteResolvable[]
): Promise<CategoryChannel> {
  const existing = findCategory(guild, name);
  if (existing) {
    await existing.permissionOverwrites.set(overwrites, "Aurix setup sync");
    return existing;
  }
  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: "Aurix setup",
  });
}

async function getOrCreateTextChannel(
  guild: Guild,
  category: CategoryChannel,
  name: string,
  topic: string,
  overwrites: OverwriteResolvable[]
): Promise<TextChannel> {
  const existing = findTextChannel(category, name);
  if (existing) {
    await existing.edit({ topic, permissionOverwrites: overwrites });
    return existing;
  }
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: overwrites,
    reason: "Aurix setup",
  });
}

export type SetupResult = {
  roleDirection: Role;
  roleModerateur: Role;
  roleStreamer: Role;
  chOpenTicket: TextChannel;
  chRefills: TextChannel;
  chLogs: TextChannel;
  chStaffChat: TextChannel;
};

export async function runSetup(guild: Guild): Promise<SetupResult> {
  const me = guild.members.me;
  if (!me) throw new Error("guild.members.me unavailable");

  // ─── Rôles ───
  const roleDirection = await getOrCreateRole(guild, cfg.ROLES.DIRECTION, {
    color: 0xffd700,
    permissions: PermissionFlagsBits.Administrator,
  });
  const roleModerateur = await getOrCreateRole(guild, cfg.ROLES.MODERATEUR, {
    color: 0x5865f2,
    permissions:
      PermissionFlagsBits.ManageMessages |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.ViewAuditLog |
      PermissionFlagsBits.ManageThreads,
  });
  const roleStreamer = await getOrCreateRole(guild, cfg.ROLES.STREAMER, {
    color: 0x1fa2ff,
  });

  await kvSet("role_direction_id", roleDirection.id);
  await kvSet("role_moderateur_id", roleModerateur.id);
  await kvSet("role_streamer_id", roleStreamer.id);

  const everyone = guild.roles.everyone;

  // ─── Overwrite sets ───
  const ow = {
    public: [
      { id: everyone.id, deny: [PermissionFlagsBits.SendMessages] },
      { id: roleStreamer.id, deny: [PermissionFlagsBits.SendMessages] },
      { id: roleModerateur.id, allow: [PermissionFlagsBits.SendMessages] },
      { id: roleDirection.id, allow: [PermissionFlagsBits.SendMessages] },
      {
        id: me.id,
        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
      },
    ] satisfies OverwriteResolvable[],
    staffOnly: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: roleStreamer.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: roleModerateur.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: roleDirection.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ] satisfies OverwriteResolvable[],
    streamersOnly: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: roleStreamer.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: roleModerateur.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: roleDirection.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ] satisfies OverwriteResolvable[],
    streamersReadOnly: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: roleStreamer.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: roleModerateur.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: roleDirection.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ] satisfies OverwriteResolvable[],
    ticketsRoot: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: roleStreamer.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: roleModerateur.id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: roleDirection.id, allow: [PermissionFlagsBits.ViewChannel] },
      {
        id: me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
      },
    ] satisfies OverwriteResolvable[],
    openTicketPanel: [
      {
        id: everyone.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
      {
        id: roleStreamer.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ] satisfies OverwriteResolvable[],
  };

  // ─── Catégories ───
  const catInfo = await getOrCreateCategory(guild, cfg.CATEGORIES.INFO, ow.public);
  const catTickets = await getOrCreateCategory(guild, cfg.CATEGORIES.TICKETS, ow.public);
  const catTicketsOpen = await getOrCreateCategory(guild, cfg.CATEGORIES.TICKETS_OPEN, ow.ticketsRoot);
  const catStreamers = await getOrCreateCategory(guild, cfg.CATEGORIES.STREAMERS, ow.streamersOnly);
  const catStaff = await getOrCreateCategory(guild, cfg.CATEGORIES.STAFF, ow.staffOnly);

  await kvSet("category_tickets_open_id", catTicketsOpen.id);
  await kvSet("category_staff_id", catStaff.id);

  // ─── Info salons ───
  await getOrCreateTextChannel(
    guild,
    catInfo,
    cfg.CHANNELS.REGLEMENT,
    "📌 Règlement de l'agence Aurix. À lire impérativement.",
    ow.public
  );
  const chAnnonces = await getOrCreateTextChannel(
    guild,
    catInfo,
    cfg.CHANNELS.ANNONCES,
    "📣 Annonces officielles Aurix.",
    ow.public
  );
  await getOrCreateTextChannel(
    guild,
    catInfo,
    cfg.CHANNELS.BIENVENUE,
    "🎉 Bienvenue dans la famille Aurix.",
    ow.public
  );
  await kvSet("channel_annonces_id", chAnnonces.id);

  // ─── Ouvrir-ticket ───
  const chOpenTicket = await getOrCreateTextChannel(
    guild,
    catTickets,
    cfg.CHANNELS.OUVRIR_TICKET,
    "✅ Clique sur le bouton ci-dessous pour ouvrir un ticket privé avec la direction Aurix.",
    ow.openTicketPanel
  );
  await kvSet("channel_open_ticket_id", chOpenTicket.id);

  // ─── Streamers ───
  await getOrCreateTextChannel(
    guild,
    catStreamers,
    cfg.CHANNELS.ANNONCES_STREAMERS,
    "📢 Annonces réservées aux streamers Aurix.",
    ow.streamersReadOnly
  );
  await getOrCreateTextChannel(
    guild,
    catStreamers,
    cfg.CHANNELS.CHAT_STREAMERS,
    "💬 Discutez entre streamers Aurix.",
    ow.streamersOnly
  );
  await getOrCreateTextChannel(
    guild,
    catStreamers,
    cfg.CHANNELS.PROMOTIONS,
    "🎁 Promotions, deals et codes exclusifs Aurix.",
    ow.streamersReadOnly
  );

  // ─── Staff ───
  const chStaffChat = await getOrCreateTextChannel(
    guild,
    catStaff,
    cfg.CHANNELS.STAFF_CHAT,
    "💬 Discussions internes staff Aurix.",
    ow.staffOnly
  );
  const chRefills = await getOrCreateTextChannel(
    guild,
    catStaff,
    cfg.CHANNELS.REFILLS,
    "📋 Liste des demandes de refill en cours. Mise à jour en temps réel.",
    ow.staffOnly
  );
  const chLogs = await getOrCreateTextChannel(
    guild,
    catStaff,
    cfg.CHANNELS.LOGS,
    "🔔 Audit log Aurix.",
    ow.staffOnly
  );
  const chGestion = await getOrCreateTextChannel(
    guild,
    catStaff,
    cfg.CHANNELS.GESTION,
    "🗂️ Gestion interne.",
    ow.staffOnly
  );

  await kvSet("channel_staff_chat_id", chStaffChat.id);
  await kvSet("channel_refills_id", chRefills.id);
  await kvSet("channel_logs_id", chLogs.id);
  await kvSet("channel_gestion_id", chGestion.id);

  // ─── Panel ticket message + persistent button ───
  await postTicketPanel(chOpenTicket);

  // ─── Refill batch initial ───
  await ensureOpenBatch(guild);

  log("Setup terminé.");
  return {
    roleDirection,
    roleModerateur,
    roleStreamer,
    chOpenTicket,
    chRefills,
    chLogs,
    chStaffChat,
  };
}

async function postTicketPanel(channel: TextChannel): Promise<void> {
  const me = channel.guild.members.me;
  if (!me) return;

  // Purge anciens messages du bot
  const recent = await channel.messages.fetch({ limit: 20 });
  for (const msg of recent.values()) {
    if (msg.author.id === me.id) {
      try {
        await msg.delete();
      } catch {
        /* ignore */
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.ticket}  Ouvrir un ticket privé`)
    .setDescription(
      [
        `Bienvenue chez **${cfg.BRAND.NAME}** ${cfg.EMOJI.diamond}`,
        "",
        "Clique sur le bouton ci-dessous pour ouvrir un **salon privé** avec la direction.",
        "Ce salon te sera dédié tant que tu fais partie de l'agence — utilise-le pour :",
        "• Poser tes questions",
        `• Demander un **refill** (${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}) via la commande \`/refill\``,
        "• Échanger directement avec ton manager",
        "",
        `${cfg.EMOJI.lock}  *Seuls toi et la direction Aurix avez accès à ce ticket.*`,
      ].join("\n")
    )
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  const button = new ButtonBuilder()
    .setCustomId("aurix:ticket:open")
    .setLabel("Ouvrir un ticket")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🎫");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await channel.send({ embeds: [embed], components: [row] });
}
