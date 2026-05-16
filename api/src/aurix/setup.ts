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
import { ensureWatcherBoard } from "./watcher.js";

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
  const chReglement = await getOrCreateTextChannel(
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
  const chALire = await getOrCreateTextChannel(
    guild,
    catInfo,
    cfg.CHANNELS.A_LIRE,
    "📖 Panneau d'information — comment fonctionne l'agence Aurix.",
    ow.public
  );
  await kvSet("channel_annonces_id", chAnnonces.id);
  await kvSet("channel_bienvenue_id", chBienvenue.id);
  await kvSet("channel_a_lire_id", chALire.id);
  await kvSet("channel_reglement_id", chReglement.id);

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
  const chWatcher = await getOrCreateTextChannel(
    guild,
    catStaff,
    cfg.CHANNELS.WATCHER,
    "🕵️ Supervision des inscriptions /celsius (validation / refus).",
    ow.staffOnly
  );

  await kvSet("channel_staff_chat_id", chStaffChat.id);
  await kvSet("channel_refills_id", chRefills.id);
  await kvSet("channel_logs_id", chLogs.id);
  await kvSet("channel_gestion_id", chGestion.id);
  await kvSet("channel_watcher_id", chWatcher.id);

  // ─── Panel ticket message + persistent button ───
  await postWelcomePanel(chALire, {
    openTicketId: chOpenTicket.id,
    reglementId: chReglement.id,
    botStreamersId: chBotStreamers.id,
  });
  await postRulesPanel(chReglement, { annoncesId: chAnnonces.id });
  await postTicketPanel(chOpenTicket);
  await postBotInvitePanel(chBotStreamers);

  // ─── Watcher board (list + stats sticky messages) ───
  await ensureWatcherBoard(guild);

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
        "Invite le bot Aurix sur ton propre serveur Discord pour **valider que tes viewers sont bien affiliés** sur Celsius via toi — et suivre ton vivier en direct.",
        "",
        "**Commandes disponibles sur ton serveur** :",
        "",
        "• `/celsius` — *pour tes viewers*",
        "   Chaque viewer enregistre son **pseudo Celsius** et son **email**. L'équipe Aurix vérifie ensuite que le compte est **bien affilié à toi** ; une fois validé, le viewer apparaît dans tes stats comme **vérifié**.",
        "",
        "• `/aurix` — *réservé à toi (owner du serveur)*",
        "   Affiche en temps réel : nb de viewers **en cours de validation** et nb **vérifiés**.",
        "   Le bot te reconnaît automatiquement comme streamer Aurix via ton compte Discord (owner du serveur).",
        "",
        "**Pour inviter le bot, clique sur le bouton ci-dessous**, autorise sur ton serveur, puis tape `/aurix` pour vérifier que tout fonctionne.",
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

async function postWelcomePanel(
  channel: TextChannel,
  refs: { openTicketId: string; reglementId: string; botStreamersId: string }
): Promise<void> {
  await purgeBotMessages(channel);

  const openTicketMention = `<#${refs.openTicketId}>`;
  const reglementMention = `<#${refs.reglementId}>`;
  const botStreamersMention = `<#${refs.botStreamersId}>`;

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.diamond}  Bienvenue chez ${cfg.BRAND.NAME}`)
    .setDescription(
      [
        "Ce Discord est l'**espace privé de l'agence Aurix** pour ses streamers et candidats.",
        "C'est ici qu'on échange directement, qu'on traite tes refills, et qu'on partage les promos et deals exclusifs.",
      ].join("\n")
    )
    .setColor(cfg.COLOR.PRIMARY)
    .addFields(
      {
        name: "🎯  À quoi ça sert",
        value: [
          `• **Discuter directement avec la direction** ${cfg.BRAND.NAME}`,
          `• **Demander tes refills** (\`${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}\` par demande, ${cfg.EMOJI.diamond} en quotidien)`,
          "• **Échanger avec les autres streamers** affiliés",
          "• **Recevoir les deals & promotions exclusives** réservés à l'agence",
        ].join("\n"),
      },
      {
        name: "🎫  Comment ça démarre",
        value: [
          `1. Ouvre ton ticket dans ${openTicketMention}`,
          "   • **💎 J'ai déjà un deal** → ta room privée est créée tout de suite",
          "   • **📝 Je veux postuler** → formulaire rapide (email / Telegram / total dépôt + vidéo dashboard)",
          "2. La direction te répond dans ton ticket",
        ].join("\n"),
      },
      {
        name: `💰  Comment demander un refill (\`/refill\`)`,
        value: [
          "Une fois ton ticket ouvert :",
          "• Tape `/refill` **dans ton ticket** pour déclencher une demande",
          `• **${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}** par demande, **une demande / jour**`,
          "• La 1ʳᵉ fois tu renseignes ton **email casino** ; ensuite c'est mémorisé, plus rien à retaper",
          "• Si tu te trompes ou changes d'avis : `/refill-cancel` annule la demande **avant le cutoff**",
          "• Le batch du jour est envoyé au manager après le cutoff — tu n'as rien à faire de plus",
          "",
          "**Astuce :** `/compte` te permet de mettre à jour ton **Telegram**, ton **email** et ton **pseudo casino** quand tu veux.",
        ].join("\n"),
      },
      {
        name: `🤖  Le bot Aurix sur ton propre Discord`,
        value: [
          `Tu es streamer ? Tu peux **inviter le bot Aurix sur ton serveur Discord** pour offrir à tes viewers une commande de **validation d'affiliation Celsius** — et suivre ton vivier en direct.`,
          "",
          "• `/celsius` (tes viewers) → ils renseignent **pseudo Celsius + email** ; l'équipe Aurix vérifie ensuite qu'ils sont bien affiliés à toi.",
          "• `/aurix` (toi, owner du serveur) → **stats en temps réel** : en cours de validation / vérifiés.",
          "",
          `👉 Toutes les infos + bouton d'invitation : ${botStreamersMention}`,
        ].join("\n"),
      },
      {
        name: "📜  Avant de commencer",
        value: `**Lis le règlement** dans ${reglementMention}. C'est court, c'est clair, ça évite les malentendus.`,
      }
    )
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  await channel.send({ embeds: [embed] });
}

async function postRulesPanel(
  channel: TextChannel,
  refs: { annoncesId: string }
): Promise<void> {
  await purgeBotMessages(channel);
  const annoncesMention = `<#${refs.annoncesId}>`;

  const embed = new EmbedBuilder()
    .setTitle(`📌  Règlement ${cfg.BRAND.NAME}`)
    .setDescription(
      "Règles à respecter pour tous les membres de l'agence. Le non-respect peut entraîner des sanctions allant du simple rappel à la **rupture immédiate du contrat**."
    )
    .setColor(cfg.COLOR.WARNING)
    .addFields(
      {
        name: "1. 🤝  Comportement général",
        value: [
          "• Respect mutuel entre membres et avec la direction.",
          "• Pas d'insulte, pas de harcèlement, pas de discrimination.",
          "• Pas de spam, ni d'auto-promo non autorisée (autres agences, autres casinos, etc.).",
          "• Pas de partage de liens douteux / NSFW / scams.",
        ].join("\n"),
      },
      {
        name: "2. 🔒  Confidentialité",
        value: [
          "• Ce qui est dit dans ton **ticket privé** reste entre toi et la direction.",
          "• Ne partage **aucun screenshot** des salons internes (deals, promos, refills, staff-chat) en dehors du serveur.",
          "• Les codes promo et offres exclusives sont **strictement réservés à l'agence**.",
        ].join("\n"),
      },
      {
        name: `3. 💰  Refills`,
        value: [
          `• **\`${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}\` par demande**, **une demande maximum par jour** via \`/refill\`.`,
          "• Le **cutoff quotidien** (heure de verrouillage du batch) est annoncé par la direction — toute demande après le cutoff passe au lendemain.",
          "• Pas de double demande, pas de demande pour un tiers.",
          "• L'email renseigné doit être **celui de ton compte casino** — toute info fausse bloque ton refill.",
        ].join("\n"),
      },
      {
        name: "4. 💎  Deals & affiliation",
        value: [
          "• En rejoignant l'agence, tu t'engages à respecter **les termes de ton deal personnel**.",
          "• Tu joues **uniquement avec le compte casino renseigné à la direction**.",
          "• **Toute fraude est détectée et entraîne la rupture immédiate du contrat** :",
          "  – **Auto-affiliation** : créer un compte casino sous ton propre lien d'affiliation pour toucher la commission sur tes propres dépôts.",
          "  – **Multi-comptes** : un de tes affiliés qui crée plusieurs comptes, ou des comptes ouverts uniquement pour gonfler tes stats.",
          "  – **Faux justificatifs / dashboards trafiqués / dépôts gonflés**.",
        ].join("\n"),
      },
      {
        name: "5. 📹  Preuves & dashboards",
        value: [
          "• Lors d'une candidature, la **vidéo de ton dashboard casino** doit être authentique et complète.",
          "• Toute capture éditée, masquée ou trafiquée est un motif de refus définitif.",
          "• La direction peut te demander des **preuves complémentaires** à tout moment (statement officiel du casino, etc.).",
        ].join("\n"),
      },
      {
        name: "6. 📺  Stream & mentions",
        value: [
          "• Tu respectes la **fréquence de stream** et les **mentions de marque** prévues dans ton deal.",
          "• Les **promotions et codes exclusifs Aurix** sont à utiliser uniquement après validation par la direction.",
          "• Aucune communication officielle au nom de l'agence sans accord préalable.",
        ].join("\n"),
      },
      {
        name: "7. 📣  Mises à jour",
        value: `Ce règlement peut évoluer. Les changements seront annoncés dans ${annoncesMention} et appliqués immédiatement.`,
      }
    )
    .setFooter({ text: `${cfg.BRAND.NAME} • Si tu as un doute, ouvre un ticket et demande.` });

  await channel.send({ embeds: [embed] });
}
