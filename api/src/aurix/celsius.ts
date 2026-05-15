// /celsius (viewers) + /autrix (streamer-owner) — fonctionnent sur N'IMPORTE QUEL serveur où le bot est invité.
import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import * as cfg from "./config.js";
import { one, query } from "./db.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const VIP_THRESHOLD_LABEL = "💎 Les gros joueurs avérés bénéficient d'un **HOST VIP attitré**.";

// ───────────── /celsius ─────────────
export async function handleCelsiusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Commande utilisable uniquement en serveur.", ephemeral: true });
    return;
  }

  const existing = await one<{
    celsius_pseudo: string;
    celsius_email: string;
    monthly_deposit: string;
    status: string;
  }>(
    `SELECT celsius_pseudo, celsius_email, monthly_deposit, status
       FROM aurix_celsius_submissions
       WHERE guild_id=$1 AND viewer_user_id=$2`,
    [guild.id, interaction.user.id]
  );

  const modal = new ModalBuilder()
    .setCustomId("aurix:celsius:save")
    .setTitle("Inscription Celsius");

  const pseudo = new TextInputBuilder()
    .setCustomId("pseudo")
    .setLabel("Pseudo Celsius")
    .setPlaceholder("Ex : Casinoze92")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);
  if (existing?.celsius_pseudo) pseudo.setValue(existing.celsius_pseudo);

  const email = new TextInputBuilder()
    .setCustomId("email")
    .setLabel("Email de création du compte Celsius")
    .setPlaceholder("exemple@mail.com")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(120);
  if (existing?.celsius_email) email.setValue(existing.celsius_email);

  const deposit = new TextInputBuilder()
    .setCustomId("monthly_deposit")
    .setLabel("Dépôt moyen / mois (€)")
    .setPlaceholder("Ex : 500 € — les gros joueurs ont un HOST VIP attitré")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);
  if (existing?.monthly_deposit) deposit.setValue(existing.monthly_deposit);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(pseudo),
    new ActionRowBuilder<TextInputBuilder>().addComponents(email),
    new ActionRowBuilder<TextInputBuilder>().addComponents(deposit)
  );

  await interaction.showModal(modal);
}

export async function handleCelsiusModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }

  const pseudo = interaction.fields.getTextInputValue("pseudo").trim();
  const email = interaction.fields.getTextInputValue("email").trim();
  const monthlyDeposit = interaction.fields.getTextInputValue("monthly_deposit").trim();

  if (!EMAIL_RE.test(email)) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Adresse email invalide.`,
      ephemeral: true,
    });
    return;
  }

  const streamerUserId = guild.ownerId;

  await query(
    `INSERT INTO aurix_celsius_submissions
       (guild_id, guild_name, streamer_user_id, viewer_user_id, viewer_username,
        celsius_pseudo, celsius_email, monthly_deposit, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
     ON CONFLICT (guild_id, viewer_user_id) DO UPDATE SET
       guild_name=EXCLUDED.guild_name,
       streamer_user_id=EXCLUDED.streamer_user_id,
       viewer_username=EXCLUDED.viewer_username,
       celsius_pseudo=EXCLUDED.celsius_pseudo,
       celsius_email=EXCLUDED.celsius_email,
       monthly_deposit=EXCLUDED.monthly_deposit,
       status='pending',
       verified_at=NULL`,
    [
      guild.id,
      guild.name,
      streamerUserId,
      interaction.user.id,
      interaction.user.tag,
      pseudo,
      email,
      monthlyDeposit,
    ]
  );

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.check}  Infos enregistrées`)
    .setColor(cfg.COLOR.SUCCESS)
    .setDescription(
      [
        `Merci <@${interaction.user.id}> — tes infos ont bien été transmises pour vérification.`,
        "",
        `• 🎰 Pseudo Celsius : \`${pseudo}\``,
        `• ✉️ Email : \`${email}\``,
        `• 💰 Dépôt moyen / mois : \`${monthlyDeposit}\``,
        "",
        VIP_THRESHOLD_LABEL,
        "",
        `Tu seras notifié dès que ton compte est **vérifié** par ${cfg.BRAND.NAME}.`,
      ].join("\n")
    )
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ───────────── /autrix ─────────────
export async function handleAutrixCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Commande utilisable uniquement en serveur.", ephemeral: true });
    return;
  }

  if (guild.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: `${cfg.EMOJI.cross} Cette commande est réservée à l'**owner** du serveur (le streamer).`,
      ephemeral: true,
    });
    return;
  }

  const row = await one<{ pending: string; verified: string; rejected: string; total: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status='pending')  AS pending,
       COUNT(*) FILTER (WHERE status='verified') AS verified,
       COUNT(*) FILTER (WHERE status='rejected') AS rejected,
       COUNT(*)                                  AS total
     FROM aurix_celsius_submissions
     WHERE guild_id=$1`,
    [guild.id]
  );

  const pending = Number(row?.pending ?? 0);
  const verified = Number(row?.verified ?? 0);
  const rejected = Number(row?.rejected ?? 0);
  const total = Number(row?.total ?? 0);

  const embed = new EmbedBuilder()
    .setTitle(`📊  Stats Aurix — ${guild.name}`)
    .setColor(cfg.COLOR.PRIMARY)
    .addFields(
      { name: "⏳ En cours de validation", value: `\`${pending}\``, inline: true },
      { name: "✅ Vérifiés", value: `\`${verified}\``, inline: true },
      { name: "❌ Rejetés", value: `\`${rejected}\``, inline: true },
      { name: "📈 Total inscriptions", value: `\`${total}\`` }
    )
    .setFooter({ text: `${cfg.BRAND.NAME} • Mise à jour en temps réel` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
