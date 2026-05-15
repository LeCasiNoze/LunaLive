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
  const chBienvenue = await getOrCreateTextChannel(
    guild,
    catInfo,
    cfg.CHANNELS.BIENVENUE,
    "🎉 Bienvenue dans la famille Aurix.",
    ow.public
  );
  await kvSet("channel_annonces_id", chAnnonces.id);
  await kvSet("channel_bienvenue_id", chBienvenue.id);

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
  const chBotStreamers = await getOrCreateTextChannel(
    guild,
    catStreamers,
    cfg.CHANNELS.BOT_STREAMERS,
    "🤖 Invite le bot Aurix sur ton Discord pour offrir /celsius à tes viewers.",
    ow.streamersReadOnly
  );
  await kvSet("channel_bot_streamers_id", chBotStreamers.id);

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
  await postBotInvitePanel(chBotStreamers);

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

async function purgeBotMessages(channel: TextChannel): Promise<void> {
  const me = channel.guild.members.me;
  if (!me) return;
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
}

async function postTicketPanel(channel: TextChannel): Promise<void> {
  await purgeBotMessages(channel);

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.ticket}  Ouvre ton ticket Aurix`)
    .setDescription(
      [
        `Bienvenue chez **${cfg.BRAND.NAME}** ${cfg.EMOJI.diamond}`,
        "",
        "**Tu as déjà un deal avec nous ?** → ouvre directement ta room privée.",
        "**Tu veux nous rejoindre ?** → ouvre un ticket de candidature.",
        "",
        "Ton salon te sera dédié tant que tu fais partie de l'agence — tu peux y :",
        "• Poser tes questions",
        `• Demander un **refill** (${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}) via \`/refill\``,
        "• Échanger directement avec ton manager",
        "",
        `${cfg.EMOJI.lock}  *Seuls toi et la direction Aurix avez accès à ton ticket.*`,
      ].join("\n")
    )
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  const btnDeal = new ButtonBuilder()
    .setCustomId("aurix:ticket:open:deal")
    .setLabel("J'ai déjà un deal")
    .setStyle(ButtonStyle.Success)
    .setEmoji("💎");
  const btnApply = new ButtonBuilder()
    .setCustomId("aurix:ticket:open:apply")
    .setLabel("Je veux postuler")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("📝");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnDeal, btnApply);

  await channel.send({ embeds: [embed], components: [row] });
}

async function postBotInvitePanel(channel: TextChannel): Promise<void> {
  await purgeBotMessages(channel);

  const appId = channel.client.application?.id ?? channel.client.user?.id ?? "";
  const inviteUrl =
    `https://discord.com/api/oauth2/authorize?client_id=${appId}` +
    `&permissions=274877974528` + // View Channel + Send Messages + Use Slash + Embed Links + Read History + Mention
    `&scope=bot%20applications.commands`;

  const embed = new EmbedBuilder()
    .setTitle("🤖  Bot Aurix pour streamers")
    .setDescription(
      [
        "Tu peux **inviter le bot Aurix sur ton propre serveur Discord** pour offrir à tes viewers une commande de validation Celsius — et suivre tes stats d'inscriptions en direct.",
        "",
        "**Commandes disponibles sur ton serveur** :",
        "",
        "• `/celsius` — *pour tes viewers*",
        "   Permet à chaque viewer d'enregistrer son **pseudo Celsius**, son **email** et son **dépôt mensuel moyen**.",
        "   Les gros joueurs avérés se voient attribuer un **HOST VIP attitré**.",
        "",
        "• `/autrix` — *réservé à toi (owner du serveur)*",
        "   Affiche en temps réel : nb de viewers **en cours de validation** et nb **vérifiés**.",
        "   Le bot reconnaît automatiquement que tu es streamer Aurix via ton compte Discord.",
        "",
        "**Pour inviter le bot, clique sur le bouton ci-dessous**, autorise sur ton serveur, et tape `/autrix` pour vérifier que tout fonctionne.",
      ].join("\n")
    )
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  const btnInvite = new ButtonBuilder()
    .setLabel("Inviter le bot Aurix")
    .setStyle(ButtonStyle.Link)
    .setURL(inviteUrl)
    .setEmoji("🤖");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnInvite);

  await channel.send({ embeds: [embed], components: [row] });
}
