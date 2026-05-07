// Preview DM Discord pour streamer AVEC compte Instagram lié.
// Cible : LeCasiNoze (validation visuelle).
//
// Usage : DISCORD_BOT_TOKEN=xxx node scripts/send-ig-notif-collab-preview.cjs

const path = require("path");
const fs = require("fs");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } =
  require(path.resolve(__dirname, "../api/node_modules/discord.js"));

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.argv[2];
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN manquant"); process.exit(1); }

const PREVIEW_USER_ID = "682472610868887567"; // LeCasiNoze

const data = {
  streamerDisplayName: "LAMISE",
  streamerSlug: "lamise",
  instagramUsername: "lamiseofficiel", // simulé pour la preview
  realRecipientId: "1233323981998915615",
  reelUrl: "https://www.instagram.com/reel/DX_xH1Ngs26/",
  clipTitle: "3VS WANTED x1.400",
  webBase: "https://lunalive.fr",
};

const STREAMER_PAGE = `${data.webBase}/s/${data.streamerSlug}`;
const IG_ACTIVITY_URL = "https://www.instagram.com/accounts/activity/";
const SEPARATOR = "─────────────────────────";

async function fetchReelThumb() {
  const html = await fetch(data.reelUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then(r => r.text());
  const m = html.match(/property="og:image"\s+content="([^"]+)"/);
  if (!m) throw new Error("og:image introuvable");
  const r = await fetch(m[1].replace(/&amp;/g, "&"));
  return Buffer.from(await r.arrayBuffer());
}

const logoBuffer = fs.readFileSync(path.resolve(__dirname, "../web/public/logo.png"));

const embed = new EmbedBuilder()
  .setColor(0x9D4BFF)
  .setAuthor({ name: "LunaLive  •  Nouveau Reel publié", iconURL: "attachment://logo.png", url: data.webBase })
  .setTitle(`🎬   Ton clip vient d'être publié sur Instagram !`)
  .setURL(data.reelUrl)
  .setThumbnail("attachment://logo.png")
  .setImage("attachment://clip_preview.jpg")
  .setDescription(
    `Salut **${data.streamerDisplayName}**  👋\n\n` +
    `Notre système **LunaClip** vient de publier un clip extrait de ton stream sur le compte Instagram officiel de **LunaLive**, ` +
    `et on t'a invité(e) comme **collaborateur officiel** (@${data.instagramUsername}).\n` +
    `​`
  )
  .addFields(
    { name: "🎞️   Clip publié", value: `**${data.clipTitle}**`, inline: true },
    { name: "📺   Streamer",    value: `**${data.streamerDisplayName}**\n[Voir la page](${STREAMER_PAGE})`, inline: true },
    { name: "​", value: SEPARATOR, inline: false },
    {
      name: "✅   Action requise — accepte l'invitation collab",
      value:
        `Pour que ce Reel apparaisse aussi **sur ton propre profil Instagram**, il faut accepter ` +
        `l'invitation de collaboration que **@lunalive_tv** vient de t'envoyer.\n\n` +
        `📲 Ouvre Instagram → onglet **Activité** (cœur en haut) → section **Demandes** ou **Tags**\n` +
        `*ou bien ouvre directement le Reel ci-dessous, l'invite y apparaît aussi.*\n\n` +
        `Une fois accepté, le clip sera visible sur ton feed et bénéficiera de la double audience 🚀`,
      inline: false,
    },
  )
  .setFooter({
    text: "LunaLive  •  Notification automatique de publication Instagram",
    iconURL: "attachment://logo.png",
  })
  .setTimestamp(new Date());

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📸  Voir le Reel").setURL(data.reelUrl),
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("🔔  Activité Instagram").setURL(IG_ACTIVITY_URL),
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📺  Ma page LunaLive").setURL(STREAMER_PAGE),
);

const previewBanner =
  `⚠️  **APERÇU INTERNE** (variante "compte IG lié")  —  destinataire final en prod : <@${data.realRecipientId}>\n​`;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });

client.once("clientReady", async () => {
  console.log("✓ bot connecté en tant que", client.user.tag);
  try {
    const user = await client.users.fetch(PREVIEW_USER_ID);
    const clipBuf = await fetchReelThumb();
    await user.send({
      content: previewBanner,
      embeds: [embed],
      components: [row],
      files: [
        new AttachmentBuilder(clipBuf,    { name: "clip_preview.jpg" }),
        new AttachmentBuilder(logoBuffer, { name: "logo.png" }),
      ],
    });
    console.log("✅ Preview collab envoyée à", user.tag);
  } catch (e) {
    console.error("❌", e?.message || e);
    process.exit(1);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN).catch(e => { console.error("❌ login:", e?.message); process.exit(1); });
