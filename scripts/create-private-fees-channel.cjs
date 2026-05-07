// Crée un salon textuel privé sur le serveur LunaLive, visible uniquement par
// LeCasiNoze + Fabiozsis (Samyzsis sera ajouté manuellement quand il rejoint).
//
// Usage : DISCORD_BOT_TOKEN=xxx node scripts/create-private-fees-channel.cjs

const path = require("path");
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, OverwriteType } =
  require(path.resolve(__dirname, "../api/node_modules/discord.js"));

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.argv[2];
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN manquant"); process.exit(1); }

const LUNALIVE_GUILD_ID = "1467139956249067717";
const CHANNEL_NAME      = "frais-agence";
const ALLOWED_USER_IDS  = [
  "682472610868887567", // LeCasiNoze
  "406965568755728395", // Fabiozsis
  // Samyzsis : ajouté manuellement quand il rejoint le serveur
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  console.log("✓ bot connecté en tant que", client.user.tag);
  try {
    const guild = await client.guilds.fetch(LUNALIVE_GUILD_ID);
    console.log(`✓ guild trouvée : ${guild.name}`);

    // Vérifie permissions du bot
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new Error("Le bot n'a pas la permission ManageChannels sur ce serveur");
    }

    // Vérifie si un channel du même nom existe déjà
    const existing = guild.channels.cache.find(
      c => c.name === CHANNEL_NAME && c.type === ChannelType.GuildText
    );
    if (existing) {
      console.log(`⚠️  un salon "${CHANNEL_NAME}" existe déjà — id=${existing.id}`);
      console.log(`    URL : https://discord.com/channels/${LUNALIVE_GUILD_ID}/${existing.id}`);
      return;
    }

    // Vérifie que les utilisateurs autorisés sont bien membres du serveur
    const validMembers = [];
    for (const uid of ALLOWED_USER_IDS) {
      const m = await guild.members.fetch(uid).catch(() => null);
      if (m) {
        console.log(`✓ membre OK : ${m.user.tag} (${uid})`);
        validMembers.push(uid);
      } else {
        console.log(`⚠️  ${uid} pas (encore) membre du serveur — sera ajouté manuellement plus tard`);
      }
    }

    // Construit les permission overwrites (avec OverwriteType explicite)
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: me.id,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      ...validMembers.map(uid => ({
        id: uid,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AddReactions,
        ],
      })),
    ];

    const channel = await guild.channels.create({
      name: CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: "💰 Rappels frais d'agence (privé : LeCasiNoze, Fabiozsis, Samyzsis)",
      permissionOverwrites: overwrites,
    });

    console.log(`✅ salon créé : #${channel.name}`);
    console.log(`   id  : ${channel.id}`);
    console.log(`   url : https://discord.com/channels/${LUNALIVE_GUILD_ID}/${channel.id}`);
  } catch (e) {
    console.error("❌", e?.message || e);
    process.exit(1);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN).catch(e => { console.error("❌ login:", e?.message); process.exit(1); });
