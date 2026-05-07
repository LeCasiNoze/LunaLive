// One-shot rétroactif : envoie le DM Discord "ton clip vient d'être publié" à
// Lamise pour le Reel publié manuellement aujourd'hui (clip 160), puisque le
// scheduler prod n'avait pas encore le hook de notif au moment de la publish.
//
// Usage : DISCORD_BOT_TOKEN=xxx node scripts/send-ig-notif-lamise-real.cjs

const path = require("path");
const fs = require("fs");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } =
  require(path.resolve(__dirname, "../api/node_modules/discord.js"));

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.argv[2];
if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN manquant");
  process.exit(1);
}

const TARGET_USER_ID = "1233323981998915615"; // Lamise

const data = {
  streamerDisplayName: "LAMISE",
  streamerSlug: "lamise",
  reelUrl: "https://www.instagram.com/reel/DX_xH1Ngs26/",
  clipTitle: "3VS WANTED x1.400",
  webBase: "https://lunalive.fr",
};

const STREAMER_PAGE = `${data.webBase}/s/${data.streamerSlug}`;
const COLLAB_REQUEST_CHANNEL_ID = "1467142337460437255";
const DISCORD_INVITE = "https://discord.gg/VSbCZQ4gyT";
const SEPARATOR = "─────────────────────────";

async function fetchReelThumb() {
  const html = await fetch(data.reelUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  }).then(r => r.text());
  const m = html.match(/property="og:image"\s+content="([^"]+)"/);
  if (!m) throw new Error("og:image introuvable");
  const imgUrl = m[1].replace(/&amp;/g, "&");
  const r = await fetch(imgUrl);
  if (!r.ok) throw new Error(`reel thumb fetch ${r.status}`);
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
    `Notre système **LunaClip** vient de publier automatiquement un clip extrait de ton stream sur le compte Instagram officiel de **LunaLive**.\n` +
    `​`
  )
  .addFields(
    { name: "🎞️   Clip publié", value: `**${data.clipTitle}**`, inline: true },
    { name: "📺   Streamer", value: `**${data.streamerDisplayName}**\n[Voir la page](${STREAMER_PAGE})`, inline: true },
    { name: "​", value: SEPARATOR, inline: false },
    {
      name: "🤝   Tu veux apparaître sur tes propres clips ?",
      value:
        `Demande à être **mentionné(e)** ou ajouté(e) en **collaborateur officiel** : ` +
        `tes clips s'afficheront alors aussi automatiquement sur **ton propre profil Instagram**, ` +
        `dès leur publication.\n\n` +
        `👉 Fais ta demande dans <#${COLLAB_REQUEST_CHANNEL_ID}>  •  un admin te répondra rapidement.`,
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
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📺  Ma page LunaLive").setURL(STREAMER_PAGE),
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("💬  Discord LunaLive").setURL(DISCORD_INVITE),
);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });

client.once("clientReady", async () => {
  console.log("✓ bot connecté en tant que", client.user.tag);
  try {
    const user = await client.users.fetch(TARGET_USER_ID);
    const clipBuf = await fetchReelThumb();
    await user.send({
      embeds: [embed],
      components: [row],
      files: [
        new AttachmentBuilder(clipBuf,    { name: "clip_preview.jpg" }),
        new AttachmentBuilder(logoBuffer, { name: "logo.png" }),
      ],
    });
    console.log("✅ DM envoyé à", user.tag, `(${TARGET_USER_ID})`);
  } catch (e) {
    console.error("❌ envoi DM échoué :", e?.message || e);
    process.exit(1);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN).catch((e) => {
  console.error("❌ login échoué :", e?.message || e);
  process.exit(1);
});
