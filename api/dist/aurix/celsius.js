// /celsius (viewers) + /aurix (streamer-owner) — fonctionnent sur N'IMPORTE QUEL serveur où le bot est invité.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, } from "discord.js";
import * as cfg from "./config.js";
import { all, one } from "./db.js";
import { refreshWatcherBoard } from "./watcher.js";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VIP_THRESHOLD_LABEL = "💎 Les gros joueurs avérés bénéficient d'un **HOST VIP attitré**.";
const DEPOSIT_EXPLAIN = "ℹ️ *Pourquoi le dépôt moyen ?* On l'utilise pour proposer aux **gros joueurs avérés** un **HOST VIP attitré** et leur ouvrir un suivi prioritaire chez Aurix. Aucune donnée n'est partagée publiquement.";
function parseDepositAmount(s) {
    const m = s.match(/[\d][\d\s.,]*/);
    if (!m)
        return null;
    const raw = m[0].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
}
function statusEmbed(sub, userId) {
    const base = new EmbedBuilder()
        .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` })
        .addFields({ name: "🎰 Pseudo Celsius", value: `\`${sub.celsius_pseudo}\``, inline: true }, { name: "✉️ Email", value: `\`${sub.celsius_email}\``, inline: true }, { name: "💰 Dépôt / mois", value: `\`${sub.monthly_deposit}\``, inline: true });
    if (sub.status === "verified") {
        return base
            .setTitle(`🟢  Compte vérifié — bienvenue !`)
            .setColor(cfg.COLOR.SUCCESS)
            .setDescription([
            `<@${userId}>, ton compte Celsius a été **validé** par l'équipe ${cfg.BRAND.NAME}.`,
            "",
            VIP_THRESHOLD_LABEL,
        ].join("\n"));
    }
    if (sub.status === "rejected") {
        return base
            .setTitle(`🔴  Inscription refusée`)
            .setColor(cfg.COLOR.DANGER)
            .setDescription([
            `<@${userId}>, ta demande a été **refusée**.`,
            sub.reject_reason ? `\n**Raison :** *${sub.reject_reason}*` : "",
            "",
            "Tu peux corriger tes infos et **renvoyer une demande** ci-dessous.",
        ]
            .filter(Boolean)
            .join("\n"));
    }
    return base
        .setTitle(`🟡  Demande en cours de validation`)
        .setColor(cfg.COLOR.WARNING)
        .setDescription([
        `<@${userId}>, ta demande est **en attente de vérification** par l'équipe ${cfg.BRAND.NAME}.`,
        "",
        VIP_THRESHOLD_LABEL,
        "",
        "Tu peux **modifier** tes infos tant que la validation n'est pas faite.",
    ].join("\n"));
}
function buildModal(prefill) {
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
    if (prefill?.pseudo)
        pseudo.setValue(prefill.pseudo);
    const email = new TextInputBuilder()
        .setCustomId("email")
        .setLabel("Email de création du compte Celsius")
        .setPlaceholder("exemple@mail.com")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(120);
    if (prefill?.email)
        email.setValue(prefill.email);
    const deposit = new TextInputBuilder()
        .setCustomId("monthly_deposit")
        .setLabel("Dépôt moyen / mois (€) — pour HOST VIP")
        .setPlaceholder("Ex : 500 — utilisé pour l'éligibilité HOST VIP")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(64);
    if (prefill?.deposit)
        deposit.setValue(prefill.deposit);
    modal.addComponents(new ActionRowBuilder().addComponents(pseudo), new ActionRowBuilder().addComponents(email), new ActionRowBuilder().addComponents(deposit));
    return modal;
}
// ───────────── /celsius ─────────────
export async function handleCelsiusCommand(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({ content: "Commande utilisable uniquement en serveur.", ephemeral: true });
        return;
    }
    const existing = await one(`SELECT id, celsius_pseudo, celsius_email, monthly_deposit, status, reject_reason, created_at
       FROM aurix_celsius_submissions
       WHERE guild_id=$1 AND viewer_user_id=$2`, [guild.id, interaction.user.id]);
    // 2e appel : afficher l'état + boutons selon statut.
    if (existing) {
        const embed = statusEmbed(existing, interaction.user.id);
        let row = null;
        if (existing.status === "pending") {
            row = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId("aurix:celsius:modify")
                .setLabel("Modifier mes infos")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("✏️"));
        }
        else if (existing.status === "rejected") {
            row = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId("aurix:celsius:resubmit")
                .setLabel("Renvoyer une demande")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🔁"));
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
export async function handleCelsiusModifyButton(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({ content: "Erreur de contexte.", ephemeral: true });
        return;
    }
    const existing = await one(`SELECT celsius_pseudo, celsius_email, monthly_deposit
       FROM aurix_celsius_submissions
       WHERE guild_id=$1 AND viewer_user_id=$2`, [guild.id, interaction.user.id]);
    await interaction.showModal(buildModal({
        pseudo: existing?.celsius_pseudo,
        email: existing?.celsius_email,
        deposit: existing?.monthly_deposit,
    }));
}
export async function handleCelsiusModal(interaction) {
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
    const inserted = await one(`INSERT INTO aurix_celsius_submissions
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
     RETURNING id`, [
        guild.id,
        guild.name,
        streamerUserId,
        interaction.user.id,
        interaction.user.tag,
        pseudo,
        email,
        monthlyDeposit,
        amount,
    ]);
    const embed = new EmbedBuilder()
        .setTitle(`${cfg.EMOJI.check}  Infos enregistrées`)
        .setColor(cfg.COLOR.SUCCESS)
        .setDescription([
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
    ].join("\n"))
        .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    if (inserted) {
        try {
            await refreshWatcherBoard(interaction.client);
        }
        catch (e) {
            console.error("[aurix.celsius] watcher refresh failed:", e);
        }
    }
}
function statusEmoji(s) {
    if (s === "verified")
        return "🟢";
    if (s === "rejected")
        return "🔴";
    return "🟡";
}
function buildSectionField(title, rows) {
    if (rows.length === 0)
        return { name: title, value: "*(personne)*" };
    const lines = rows.map((r) => `• <@${r.viewer_user_id}> · \`${r.celsius_email}\``);
    let chunk = "";
    let used = 0;
    for (const line of lines) {
        const next = chunk ? `${chunk}\n${line}` : line;
        if (next.length > 980)
            break;
        chunk = next;
        used++;
    }
    if (used < lines.length) {
        chunk += `\n*… et **${lines.length - used}** autre(s)*`;
    }
    return { name: title, value: chunk };
}
export async function handleAurixCommand(interaction) {
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
    const targetUser = interaction.options.getUser("viewer");
    // ─── Mode 1 : recherche d'un viewer précis ───
    if (targetUser) {
        const sub = await one(`SELECT viewer_user_id, viewer_username, celsius_pseudo, celsius_email,
              monthly_deposit, status, reject_reason, created_at
         FROM aurix_celsius_submissions
        WHERE guild_id=$1 AND viewer_user_id=$2`, [guild.id, targetUser.id]);
        if (!sub) {
            const embed = new EmbedBuilder()
                .setTitle(`👤  ${targetUser.tag}`)
                .setDescription([
                `<@${targetUser.id}>`,
                "",
                "⚪  **Aucune inscription `/celsius`** sur ce serveur.",
                "",
                "Ce viewer n'a pas (encore) fait la commande `/celsius` chez toi.",
            ].join("\n"))
                .setColor(cfg.COLOR.NEUTRAL)
                .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }
        const statusLabel = sub.status === "verified"
            ? "🟢  **Vérifié**"
            : sub.status === "rejected"
                ? "🔴  **Refusé**"
                : "🟡  **En cours de validation**";
        const color = sub.status === "verified"
            ? cfg.COLOR.SUCCESS
            : sub.status === "rejected"
                ? cfg.COLOR.DANGER
                : cfg.COLOR.WARNING;
        const fields = [
            { name: "🎰 Pseudo Celsius", value: `\`${sub.celsius_pseudo}\``, inline: true },
            { name: "✉️ Email", value: `\`${sub.celsius_email}\``, inline: true },
            { name: "💰 Dépôt / mois", value: `\`${sub.monthly_deposit}\``, inline: true },
        ];
        if (sub.status === "rejected" && sub.reject_reason) {
            fields.push({ name: "Raison du refus", value: sub.reject_reason });
        }
        const embed = new EmbedBuilder()
            .setTitle(`👤  ${targetUser.tag}`)
            .setDescription(`<@${targetUser.id}>\n\n${statusLabel}`)
            .setColor(color)
            .addFields(fields)
            .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }
    // ─── Mode 2 : stats globales + liste enrichie ───
    const subs = await all(`SELECT viewer_user_id, viewer_username, celsius_pseudo, celsius_email,
            monthly_deposit, status
       FROM aurix_celsius_submissions
      WHERE guild_id=$1
      ORDER BY status ASC, created_at DESC`, [guild.id]);
    const verifiedRows = subs.filter((s) => s.status === "verified");
    const pendingRows = subs.filter((s) => s.status === "pending");
    const rejectedRows = subs.filter((s) => s.status === "rejected");
    const total = subs.length;
    const embed = new EmbedBuilder()
        .setTitle(`📊  Stats Aurix — ${guild.name}`)
        .setDescription([
        `**Total inscriptions :** \`${total}\``,
        `${statusEmoji("pending")}  En cours : \`${pendingRows.length}\`   ` +
            `${statusEmoji("verified")}  Vérifiés : \`${verifiedRows.length}\`   ` +
            `${statusEmoji("rejected")}  Refusés : \`${rejectedRows.length}\``,
    ].join("\n"))
        .setColor(cfg.COLOR.PRIMARY)
        .addFields(buildSectionField(`🟢  Vérifiés (${verifiedRows.length})`, verifiedRows), buildSectionField(`🟡  En cours de validation (${pendingRows.length})`, pendingRows), buildSectionField(`🔴  Refusés (${rejectedRows.length})`, rejectedRows))
        .setFooter({
        text: `${cfg.BRAND.NAME} • Astuce : /aurix viewer:@user pour vérifier un viewer précis`,
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
