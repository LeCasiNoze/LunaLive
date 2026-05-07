// One-shot : crée la catégorie privée AGENCE avec ses 2 salons sur LunaLive,
// et supprime l'ancien salon orphelin frais-agence.
//
// Usage : DISCORD_BOT_TOKEN=xxx node scripts/setup-agence-category.cjs

const path = require("path");
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, OverwriteType } =
  require(path.resolve(__dirname, "../api/node_modules/discord.js"));

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.argv[2];
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN manquant"); process.exit(1); }

const GUILD_ID = "1467139956249067717";

const ALLOWED_USER_IDS = [
  "682472610868887567", // LeCasiNoze
  "406965568755728395", // Fabiozsis
];

const CATEGORY_NAME = "╭─ 💼 AGENCE";
const QG_CHANNEL_NAME = "┊💀・qg-de-l-ombre-de-la-mort-qui-tue";
const FEES_CHANNEL_NAME = "┊💰・frais";
const OLD_ORPHAN_NAME = "frais-agence";

const READ_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
];
const WRITE_PERMS = [
  ...READ_PERMS,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseExternalEmojis,
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  console.log("✓ bot connecté en tant que", client.user.tag);
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new Error("Bot sans permission ManageChannels");
    }

    const channels = await guild.channels.fetch();

    // Vérifie membres
    for (const uid of ALLOWED_USER_IDS) {
      const m = await guild.members.fetch(uid).catch(() => null);
      console.log(m ? `✓ membre OK : ${m.user.tag}` : `⚠️  ${uid} pas membre`);
    }

    // Permission overwrites pour la catégorie (héritées par les salons enfants)
    const categoryOverwrites = [
      { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: READ_PERMS },
      { id: me.id, type: OverwriteType.Member, allow: WRITE_PERMS },
      ...ALLOWED_USER_IDS.map(uid => ({
        id: uid, type: OverwriteType.Member, allow: WRITE_PERMS,
      })),
    ];

    // 1) Catégorie
    let category = [...channels.values()].find(
      c => c?.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME
    );
    if (category) {
      console.log(`⚠️  catégorie existe déjà : ${category.id}`);
    } else {
      category = await guild.channels.create({
        name: CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        permissionOverwrites: categoryOverwrites,
      });
      console.log(`✅ catégorie créée : "${category.name}" (${category.id})`);
    }

    // Helper : crée un salon texte sous la catégorie (hérite des perms)
    async function createChild(name, topic) {
      const existing = [...channels.values()].find(
        c => c?.type === ChannelType.GuildText && c.name === name && c.parentId === category.id
      );
      if (existing) {
        console.log(`⚠️  salon "${name}" existe déjà : ${existing.id}`);
        return existing;
      }
      const ch = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic,
        // Pas de permissionOverwrites → hérite de la catégorie
      });
      console.log(`✅ salon créé : #${ch.name} (${ch.id})`);
      return ch;
    }

    const qg = await createChild(
      QG_CHANNEL_NAME,
      "QG privé — discussion agence + commandes site + alertes auto (frais, paiements, etc.)"
    );
    const fees = await createChild(
      FEES_CHANNEL_NAME,
      "📊 Tableau frais d'agence (auto-actualisé toutes les 24h, avec bouton refresh)"
    );

    // 2) Supprime l'ancien orphan frais-agence
    const orphan = [...channels.values()].find(
      c => c?.type === ChannelType.GuildText && c.name === OLD_ORPHAN_NAME && !c.parentId
    );
    if (orphan) {
      await orphan.delete("Remplacé par la catégorie AGENCE");
      console.log(`🗑️  ancien #${OLD_ORPHAN_NAME} supprimé (${orphan.id})`);
    } else {
      console.log(`(pas d'orphan #${OLD_ORPHAN_NAME} à supprimer)`);
    }

    console.log("\n=== IDs à reporter dans le code ===");
    console.log(`CATEGORY_AGENCE_ID = "${category.id}"`);
    console.log(`QG_CHANNEL_ID      = "${qg.id}"`);
    console.log(`FEES_CHANNEL_ID    = "${fees.id}"`);
  } catch (e) {
    console.error("❌", e?.message || e);
    process.exit(1);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN).catch(e => { console.error("❌ login:", e?.message); process.exit(1); });
