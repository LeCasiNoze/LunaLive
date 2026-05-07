// Preview DM Discord pour création auto d'un clip LunaClip (streamer SANS IG lié).
// Cible : LeCasiNoze.

const path = require("path");
const fs = require("fs");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } =
  require(path.resolve(__dirname, "../api/node_modules/discord.js"));

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.argv[2];
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN manquant"); process.exit(1); }

const PREVIEW_USER_ID = "682472610868887567";

const data = {
  streamerDisplayName: "LAMISE",
  streamerSlug: "lamise",
  realRecipientId: "1233323981998915615",
  clipTitle: "3VS WANTED x1.400",
  clipThumbUrl: "https://pub-8163baf5847b4f8999b7c2c6af9c0350.r2.dev/clips/thumbnails/160.jpg",
  webBase: "https://lunalive.fr",
};

const STREAMER_PAGE = `${data.webBase}/s/${data.streamerSlug}`;
const COLLAB_REQUEST_CHANNEL_ID = "1467142337460437255";
const DISCORD_INVITE = "https://discord.gg/VSbCZQ4gyT";
const SEPARATOR = "─────────────────────────";

async function fetchClipThumb() {
  const r = await fetch(data.clipThumbUrl);
  return Buffer.from(await r.arrayBuffer());
}
const logoBuffer = fs.readFileSync(path.resolve(__dirname, "../web/public/logo.png"));

const embed = new EmbedBuilder()
  .setColor(0x9D4BFF)
  .setAuthor({ name: "LunaLive  •  Nouveau clip généré", iconURL: "attachment://logo.png", url: data.webBase })
  .setTitle(`🎬   Un clip de ton stream vient d'être créé !`)
  .setURL(STREAMER_PAGE)
  .setThumbnail("attachment://logo.png")
  .setImage("attachment://clip_preview.jpg")
  .setDescription(
    `Salut **${data.streamerDisplayName}**  👋\n\n` +
    `Notre système **LunaClip** vient de générer automatiquement un clip à partir de ton stream. ` +
    `Une fois validé par notre équipe, il pourra être publié sur le compte Instagram officiel de **LunaLive** ([@lunalive_tv](https://www.instagram.com/lunalive_tv)).\n` +
    `​`
  )
  .addFields(
    { name: "🎞️   Clip généré", value: `**${data.clipTitle}**`, inline: true },
    { name: "📺   Streamer",    value: `**${data.streamerDisplayName}**\n[Voir la page](${STREAMER_PAGE})`, inline: true },
    { name: "​", value: SEPARATOR, inline: false },
    {
      name: "🤝   Tu veux apparaître sur tes propres clips ?",
      value:
        `Demande à être **mentionné(e)** ou ajouté(e) en **collaborateur officiel** sur les Reels qui te concernent : ` +
        `tes clips s'afficheront alors aussi automatiquement sur **ton propre profil Instagram**, dès leur publication.\n\n` +
        `👉 Fais ta demande dans <#${COLLAB_REQUEST_CHANNEL_ID}>  •  un admin te répondra rapidement.`,
      inline: false,
    },
  )
  .setFooter({ text: "LunaLive  •  Notification automatique de création de clip", iconURL: "attachment://logo.png" })
  .setTimestamp(new Date());

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📺  Ma page LunaLive").setURL(STREAMER_PAGE),
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("💬  Discord LunaLive").setURL(DISCORD_INVITE),
);

const previewBanner =
  `⚠️  **APERÇU INTERNE** (variante "création auto")  —  destinataire final en prod : <@${data.realRecipientId}>\n​`;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });
client.once("clientReady", async () => {
  console.log("✓ bot connecté");
  try {
    const user = await client.users.fetch(PREVIEW_USER_ID);
    const clipBuf = await fetchClipThumb();
    await user.send({
      content: previewBanner,
      embeds: [embed],
      components: [row],
      files: [
        new AttachmentBuilder(clipBuf,    { name: "clip_preview.jpg" }),
        new AttachmentBuilder(logoBuffer, { name: "logo.png" }),
      ],
    });
    console.log("✅ Preview envoyée à", user.tag);
  } catch (e) { console.error("❌", e?.message || e); process.exit(1); }
  finally { client.destroy(); }
});
client.login(TOKEN).catch(e => { console.error("❌", e?.message); process.exit(1); });
