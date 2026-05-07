// Preview du DM "rappel frais d'agence" envoyé à Fabiozsis.
// Cible : LeCasiNoze pour validation visuelle. Données simulées.
//
// Usage : DISCORD_BOT_TOKEN=xxx node scripts/send-agency-fee-reminder-preview.cjs

const path = require("path");
const fs = require("fs");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } =
  require(path.resolve(__dirname, "../api/node_modules/discord.js"));

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.argv[2];
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN manquant"); process.exit(1); }

const PREVIEW_USER_ID = "682472610868887567"; // LeCasiNoze
const REAL_TARGET_ID  = "406965568755728395"; // Fabiozsis (en prod)
const FSB_BOARD_URL   = "https://lunalive.fr/FSB_Board";

// Si on pose CHANNEL_ID, le post va dans le salon (test prod) plutôt qu'en DM.
const FEES_CHANNEL_ID = process.env.FEES_CHANNEL_ID || "";
const PING_USER_IDS   = ["682472610868887567", "406965568755728395"];

// Simulés : 1 en retard, 2 aujourd'hui, 1 dans 2j, 1 dans 7j, 1 à venir (12j)
const fees = [
  { description: "Paiement affi - INKO - GalaxyBets",      amount: 175.0, due_date: "2026-04-30", days_until: -7 },
  { description: "Paiement affi - LAMISE - WildTokyo",     amount: 320.0, due_date: "2026-05-07", days_until: 0  },
  { description: "Paiement affi - DOCSTREAMS - BetVictor", amount: 145.5, due_date: "2026-05-07", days_until: 0  },
  { description: "Paiement affi - INKO - Stake",           amount: 480.0, due_date: "2026-05-09", days_until: 2  },
  { description: "Paiement affi - LAMISE - GalaxyBets",    amount: 215.0, due_date: "2026-05-14", days_until: 7  },
  { description: "Paiement affi - DOCSTREAMS - WildTokyo", amount: 90.0,  due_date: "2026-05-19", days_until: 12 },
];

const eur = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const frenchDate = (yyyymmdd) => {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "long" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)));
};

const bucketOf = (d) => d < 0 ? "overdue" : d === 0 ? "today" : d === 2 ? "j2" : d === 7 ? "j7" : "upcoming";
const BUCKET_META = {
  overdue:  { order: 0, label: (n) => `⚠️   En retard  •  ${n} frais non payé${n > 1 ? "s" : ""}` },
  today:    { order: 1, label: ()  => `🔴   Aujourd'hui` },
  j2:       { order: 2, label: ()  => `🟠   Dans 2 jours` },
  j7:       { order: 3, label: ()  => `🟡   Dans 7 jours` },
  upcoming: { order: 4, label: ()  => `📅   À venir (autres échéances)` },
};

const grouped = { overdue: [], today: [], j2: [], j7: [], upcoming: [] };
for (const f of fees) grouped[bucketOf(f.days_until)].push(f);

const total = fees.reduce((s, f) => s + f.amount, 0);
const overdueTotal = grouped.overdue.reduce((s, f) => s + f.amount, 0);

const overdueLine = (f) => {
  const late = -f.days_until;
  return `• **${eur(f.amount)}** — ${f.description}\n   *${frenchDate(f.due_date)} — en retard de ${late} jour${late > 1 ? "s" : ""}*`;
};
const normalLine = (f) => `• **${eur(f.amount)}** — ${f.description}\n   *${frenchDate(f.due_date)}*`;

const titlePrefix = grouped.overdue.length > 0 ? `⚠️ ${grouped.overdue.length} en retard  •  ` : "";

const logoBuffer = fs.readFileSync(path.resolve(__dirname, "../web/public/logo.png"));

const embed = new EmbedBuilder()
  .setColor(grouped.overdue.length > 0 ? 0xE53935 : 0x9D4BFF)
  .setAuthor({ name: "LunaLive  •  Rappel frais d'agence", iconURL: "attachment://logo.png", url: FSB_BOARD_URL })
  .setTitle(`💰   Frais d'agence à payer — ${titlePrefix}${fees.length} échéance${fees.length > 1 ? "s" : ""}`)
  .setURL(FSB_BOARD_URL)
  .setThumbnail("attachment://logo.png")
  .setDescription(
    `Salut **Fabiozsis**  👋\n\n` +
    (grouped.overdue.length > 0
      ? `🚨 **${grouped.overdue.length} frais en retard** pour un total de **${eur(overdueTotal)}** — à régler en priorité.\n\n`
      : `Voici les paiements à prévoir, regroupés par échéance.\n\n`) +
    `**Total cumulé impayé :** ${eur(total)}\n` +
    `​`
  );

for (const key of ["overdue", "today", "j2", "j7", "upcoming"]) {
  const list = grouped[key];
  if (!list.length) continue;
  const render = key === "overdue" ? overdueLine : normalLine;
  const sub = list.reduce((s, f) => s + f.amount, 0);
  embed.addFields({
    name: `${BUCKET_META[key].label(list.length)}  •  ${eur(sub)}`,
    value: list.map(render).join("\n\n"),
    inline: false,
  });
}

embed.setFooter({ text: "LunaLive  •  Rappel automatique — retards + J-7 / J-2 / J-0", iconURL: "attachment://logo.png" })
     .setTimestamp(new Date());

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📊  Ouvrir le FSB Board").setURL(FSB_BOARD_URL),
);

const previewBanner = FEES_CHANNEL_ID
  ? `🧪  **[TEST]** données simulées — vérification du salon privé. ${PING_USER_IDS.map(id => `<@${id}>`).join(" ")}\n​`
  : `⚠️  **APERÇU INTERNE** — destinataire final en prod : <@${REAL_TARGET_ID}> (Fabiozsis)\n​`;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });
client.once("clientReady", async () => {
  console.log("✓ bot connecté");
  try {
    const payload = {
      content: previewBanner,
      embeds: [embed],
      components: [row],
      files: [new AttachmentBuilder(logoBuffer, { name: "logo.png" })],
    };
    if (FEES_CHANNEL_ID) {
      const ch = await client.channels.fetch(FEES_CHANNEL_ID);
      if (!ch || !ch.isTextBased()) throw new Error("channel introuvable");
      await ch.send({ ...payload, allowedMentions: { users: PING_USER_IDS } });
      console.log("✅ Test post envoyé dans #" + (ch.name || FEES_CHANNEL_ID));
    } else {
      const user = await client.users.fetch(PREVIEW_USER_ID);
      await user.send(payload);
      console.log("✅ Preview envoyée à", user.tag);
    }
  } catch (e) { console.error("❌", e?.message || e); process.exit(1); }
  finally { client.destroy(); }
});
client.login(TOKEN).catch(e => { console.error("❌", e?.message); process.exit(1); });
