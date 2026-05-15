// /celsius (viewers) + /aurix (streamer-owner) — fonctionnent sur N'IMPORTE QUEL serveur où le bot est invité.
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import * as cfg from "./config.js";
import { one, query } from "./db.js";
import { postSubmissionReview, refreshWatcherBoard } from "./watcher.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const VIP_THRESHOLD_LABEL = "💎 Les gros joueurs avérés bénéficient d'un **HOST VIP attitré**.";

const DEPOSIT_EXPLAIN =
  "ℹ️ *Pourquoi le dépôt moyen ?* On l'utilise pour proposer aux **gros joueurs avérés** un **HOST VIP attitré** et leur ouvrir un suivi prioritaire chez Aurix. Aucune donnée n'est partagée publiquement.";

function parseDepositAmount(s: string): number | null {
  const m = s.match(/[\d][\d\s.,]*/);
  if (!m) return null;
  const raw = m[0].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

type ExistingSubmission = {
  id: number;
  celsius_pseudo: string;
  celsius_email: string;
  monthly_deposit: string;
  status: "pending" | "verified" | "rejected";
  reject_reason: string | null;
  created_at: Date;
};

function statusEmbed(sub: ExistingSubmission, userId: string): EmbedBuilder {
  const base = new EmbedBuilder()
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` })
    .addFields(
      { name: "🎰 Pseudo Celsius", value: `\`${sub.celsius_pseudo}\``, inline: true },
      { name: "✉️ Email", value: `\`${sub.celsius_email}\``, inline: true },
      { name: "💰 Dépôt / mois", value: `\`${sub.monthly_deposit}\``, inline: true }
    );

  if (sub.status === "verified") {
    return base
      .setTitle(`🟢  Compte vérifié — bienvenue !`)
      .setColor(cfg.COLOR.SUCCESS)
      .setDescription(
        [
          `<@${userId}>, ton compte Celsius a été **validé** par l'équipe ${cfg.BRAND.NAME}.`,
          "",
          VIP_THRESHOLD_LABEL,
        ].join("\n")
      );
  }
  if (sub.status === "rejected") {
    return base
      .setTitle(`🔴  Inscription refusée`)
      .setColor(cfg.COLOR.DANGER)
      .setDescription(
        [
          `<@${userId}>, ta demande a été **refusée**.`,
          sub.reject_reason ? `\n**Raison :** *${sub.reject_reason}*` : "",
          "",
          "Tu peux corriger tes infos et **renvoyer une demande** ci-dessous.",
        ]
          .filter(Boolean)
          .join("\n")
      );
  }
  return base
    .setTitle(`🟡  Demande en cours de validation`)
    .setColor(cfg.COLOR.WARNING)
    .setDescription(
      [
        `<@${userId}>, ta demande est **en attente de vérification** par l'équipe ${cfg.BRAND.NAME}.`,
        "",
        VIP_THRESHOLD_LABEL,
        "",
        "Tu peux **modifier** tes infos tant que la validation n'est pas faite.",
      ].join("\n")
    );
}

function buildModal(prefill?: { pseudo?: string; email?: string; deposit?: string }): ModalBuilder {
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
  if (prefill?.pseudo) pseudo.setValue(prefill.pseudo);

  const email = new TextInputBuilder()
    .setCustomId("email")
    .setLabel("Email de création du compte Celsius")
    .setPlaceholder("exemple@mail.com")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(120);
  if (prefill?.email) email.setValue(prefill.email);

  const deposit = new TextInputBuilder()
    .setCustomId("monthly_deposit")
    .setLabel("Dépôt moyen / mois (€) — pour HOST VIP")
    .setPlaceholder("Ex : 500 — utilisé pour l'éligibilité HOST VIP")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);
  if (prefill?.deposit) deposit.setValue(prefill.deposit);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(pseudo),
    new ActionRowBuilder<TextInputBuilder>().addComponents(email),
    new ActionRowBuilder<TextInputBuilder>().addComponents(deposit)
  );
  return modal;
}

// ───────────── /celsius ─────────────
export async function handleCelsiusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Commande utilisable uniquement en serveur.", ephemeral: true });
    return;
  }

  const existing = await one<ExistingSubmission>(
    `SELECT id, celsius_pseudo, celsius_email, monthly_deposit, status, reject_reason, created_at
       FROM aurix_celsius_submissions
       WHERE guild_id=$1 AND viewer_user_id=$2`,
    [guild.id, interaction.user.id]
  );

  // 2e appel : afficher l'état + boutons selon statut.
  if (existing) {
    const embed = statusEmbed(existing, interaction.user.id);

    let row: ActionRowBuilder<ButtonBuilder> | null = null;
    if (existing.status === "pending") {
      row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("aurix:celsius:modify")
          .setLabel("Modifier mes infos")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("✏️")
      );
    } else if (existing.status === "rejected") {
      row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("aurix:celsius:resubmit")
          .setLabel("Renvoyer une demande")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🔁")
      );
    }

    await interaction.reply({
      embeds: [embed],
      components: row ? [row] : [],
      ephemeral: true,
    });
    return;
  }

  // 1er appel : ouvrir le modal + petit hint visible sur le placeholder.
  await interaction.showModal(buildModal());
}

// Bouton "Modifier" (pending) ou "Renvoyer" (rejected) → ré-ouvre modal pré-rempli.
export async function handleCelsiusModifyButton(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
    return;
  }
  const existing = await one<{
    celsius_pseudo: string;
    celsius_email: string;
    monthly_deposit: string;
  }>(
    `SELECT celsius_pseudo, celsius_email, monthly_deposit
       FROM aurix_celsius_submissions
       WHERE guild_id=$1 AND viewer_user_id=$2`,
    [guild.id, interaction.user.id]
  );
  await interaction.showModal(
    buildModal({
      pseudo: existing?.celsius_pseudo,
      email: existing?.celsius_email,
      deposit: existing?.monthly_deposit,
    })
  );
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
  if (!pseudo) {
    await interaction.reply({ content: `${cfg.EMOJI.cross} Pseudo Celsius requis.`, ephemeral: true });
    return;
  }
  if (!monthlyDeposit) {
    await interaction.reply({ content: `${cfg.EMOJI.cross} Dépôt mensuel requis.`, ephemeral: true });
    return;
  }

  const streamerUserId = guild.ownerId;
  const amount = parseDepositAmount(monthlyDeposit);

  const inserted = await one<{ id: number }>(
    `INSERT INTO aurix_celsius_submissions
       (guild_id, guild_name, streamer_user_id, viewer_user_id, viewer_username,
        celsius_pseudo, celsius_email, monthly_deposit, monthly_deposit_amount, status, reject_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NULL)
     ON CONFLICT (guild_id, viewer_user_id) DO UPDATE SET
       guild_name              = EXCLUDED.guild_name,
       streamer_user_id        = EXCLUDED.streamer_user_id,
       viewer_username         = EXCLUDED.viewer_username,
       celsius_pseudo          = EXCLUDED.celsius_pseudo,
       celsius_email           = EXCLUDED.celsius_email,
       monthly_deposit         = EXCLUDED.monthly_deposit,
       monthly_deposit_amount  = EXCLUDED.monthly_deposit_amount,
       status                  = 'pending',
       reject_reason           = NULL,
       verified_at             = NULL
     RETURNING id`,
    [
      guild.id,
      guild.name,
      streamerUserId,
      interaction.user.id,
      interaction.user.tag,
      pseudo,
      email,
      monthlyDeposit,
      amount,
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
        DEPOSIT_EXPLAIN,
        "",
        VIP_THRESHOLD_LABEL,
        "",
        `Tu seras notifié dès que ton compte est **vérifié** par ${cfg.BRAND.NAME}.`,
      ].join("\n")
    )
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });

  if (inserted) {
    try {
      await postSubmissionReview(interaction.client, inserted.id);
      await refreshWatcherBoard(interaction.client);
    } catch (e) {
      console.error("[aurix.celsius] watcher refresh failed:", e);
    }
  }
}

// ───────────── /aurix ─────────────
export async function handleAurixCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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
