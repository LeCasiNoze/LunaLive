// One-shot : liste catégories + salons du serveur LunaLive pour repérer la
// convention de typo (emojis, séparateurs, etc.).

const path = require("path");
const { Client, GatewayIntentBits, ChannelType } =
  require(path.resolve(__dirname, "../api/node_modules/discord.js"));

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.argv[2];
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN manquant"); process.exit(1); }

const GUILD_ID = "1467139956249067717";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once("clientReady", async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    // Group by parent
    const cats = [];
    const orphans = [];
    for (const ch of channels.values()) {
      if (!ch) continue;
      if (ch.type === ChannelType.GuildCategory) {
        cats.push(ch);
      }
    }
    cats.sort((a, b) => a.position - b.position);
    for (const cat of cats) {
      console.log(`\n══ CATEGORY: "${cat.name}" (${cat.id}) pos=${cat.position}`);
      const children = [...channels.values()].filter(c => c?.parentId === cat.id);
      children.sort((a, b) => a.position - b.position);
      for (const c of children) {
        const typeLabel = c.type === ChannelType.GuildText ? "text"
                        : c.type === ChannelType.GuildVoice ? "voice"
                        : c.type === ChannelType.GuildAnnouncement ? "news"
                        : c.type === ChannelType.GuildForum ? "forum"
                        : `t${c.type}`;
        console.log(`   [${typeLabel}] "${c.name}"  pos=${c.position}`);
      }
    }
    for (const ch of channels.values()) {
      if (ch && !ch.parentId && ch.type !== ChannelType.GuildCategory) {
        orphans.push(ch);
      }
    }
    if (orphans.length) {
      console.log("\n══ ORPHELINS (pas de catégorie):");
      for (const c of orphans) console.log(`   "${c.name}" type=${c.type}`);
    }
  } catch (e) { console.error("❌", e?.message || e); process.exit(1); }
  finally { client.destroy(); }
});
client.login(TOKEN).catch(e => { console.error("❌", e?.message); process.exit(1); });
