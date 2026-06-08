// Watcher : board d'admin pour superviser les inscriptions /celsius.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextInputBuilder, TextInputStyle, } from "discord.js";
import * as cfg from "./config.js";
import { all, kvGet, kvSet, one, query } from "./db.js";
import { sendCelsiusValidatedDM, sendCelsiusRejectedDM } from "./celsius_dm.js";
const DEFAULT_SORT = "date_desc";
const WATCHER_CHANNEL_FALLBACK_ID = "1504883037249208340";
const QUEUE_FILTER_ALL = "__ALL__";
const AUTO_VALIDATE_SELECT_ID = "aurix:watcher:auto-validate:toggle";
function sortClause(mode) {
    switch (mode) {
        case "date_asc":
            return "ORDER BY created_at ASC";
        case "deposit_desc":
            return "ORDER BY monthly_deposit_amount DESC NULLS LAST, created_at DESC";
        case "deposit_asc":
            return "ORDER BY monthly_deposit_amount ASC NULLS LAST, created_at DESC";
        case "date_desc":
        default:
            return "ORDER BY created_at DESC";
    }
}
async function fetchSubmissions(sort, limit = 40) {
    return all(`SELECT * FROM aurix_celsius_submissions ${sortClause(sort)} LIMIT ${limit}`);
}
async function fetchStats() {
    const counts = await all("SELECT status, COUNT(*)::text AS count FROM aurix_celsius_submissions GROUP BY status");
    let pending = 0, verified = 0, rejected = 0;
    for (const r of counts) {
        const n = Number(r.count) || 0;
        if (r.status === "pending")
            pending = n;
        else if (r.status === "verified")
            verified = n;
        else if (r.status === "rejected")
            rejected = n;
    }
    const aggRow = await one("SELECT AVG(monthly_deposit_amount)::text AS avg, SUM(monthly_deposit_amount)::text AS sum FROM aurix_celsius_submissions WHERE monthly_deposit_amount IS NOT NULL");
    const multiRow = await one(`SELECT COUNT(*)::text AS n FROM (
       SELECT viewer_user_id FROM aurix_celsius_submissions
       GROUP BY viewer_user_id HAVING COUNT(DISTINCT guild_id) > 1
     ) t`);
    return {
        total: pending + verified + rejected,
        pending,
        verified,
        rejected,
        avgDeposit: aggRow?.avg ? Number(aggRow.avg) : null,
        totalDeposit: aggRow?.sum ? Number(aggRow.sum) : null,
        multiServer: multiRow ? Number(multiRow.n) : 0,
    };
}
async function fetchMultiServerUserIds() {
    const rows = await all(`SELECT viewer_user_id FROM aurix_celsius_submissions
     GROUP BY viewer_user_id HAVING COUNT(DISTINCT guild_id) > 1`);
    return new Set(rows.map((r) => r.viewer_user_id));
}
export async function isStreamerAutoValidateEnabled(guildId) {
    const row = await one("SELECT auto_validate_celsius FROM aurix_streamer_settings WHERE guild_id=$1", [guildId]);
    return row?.auto_validate_celsius === true;
}
async function upsertStreamerName(guildId, guildName) {
    await query(`INSERT INTO aurix_streamer_settings(guild_id, guild_name)
     VALUES($1, $2)
     ON CONFLICT(guild_id) DO UPDATE SET
       guild_name = COALESCE(EXCLUDED.guild_name, aurix_streamer_settings.guild_name)`, [guildId, guildName]);
}
async function toggleStreamerAutoValidate(guildId, guildName, updatedBy) {
    await upsertStreamerName(guildId, guildName);
    const row = await one(`UPDATE aurix_streamer_settings
        SET auto_validate_celsius = NOT auto_validate_celsius,
            guild_name = COALESCE($2, guild_name),
            updated_by = $3,
            updated_at = NOW()
      WHERE guild_id = $1
      RETURNING auto_validate_celsius`, [guildId, guildName, updatedBy]);
    return row?.auto_validate_celsius === true;
}
async function fetchStreamerAutoValidateSettings() {
    const rows = await all(`WITH known AS (
       SELECT guild_id, MAX(guild_name) AS guild_name
         FROM aurix_celsius_submissions
        GROUP BY guild_id
       UNION
       SELECT guild_id, guild_name
         FROM aurix_streamer_settings
     )
     SELECT k.guild_id::text AS guild_id,
            MAX(k.guild_name) AS guild_name,
            COALESCE(BOOL_OR(s.auto_validate_celsius), FALSE) AS auto_validate_celsius
       FROM known k
       LEFT JOIN aurix_streamer_settings s ON s.guild_id = k.guild_id
      GROUP BY k.guild_id
      ORDER BY COALESCE(MAX(k.guild_name), k.guild_id::text) ASC`);
    return rows.map((r) => ({
        guild_id: String(r.guild_id),
        guild_name: r.guild_name,
        auto_validate_celsius: r.auto_validate_celsius === true,
    }));
}
function statusBadge(s) {
    if (s === "verified")
        return "🟢";
    if (s === "rejected")
        return "🔴";
    return "🟡";
}
function fmtAmount(s) {
    if (s.monthly_deposit_amount != null) {
        const n = Number(s.monthly_deposit_amount);
        if (Number.isFinite(n))
            return `${n.toLocaleString("fr-FR")}€`;
    }
    return s.monthly_deposit;
}
function buildListEmbed(submissions, sort, multi) {
    const sortLabel = {
        date_desc: "📅 Date ↓ (récent → ancien)",
        date_asc: "📅 Date ↑ (ancien → récent)",
        deposit_desc: "💰 Dépôt ↓ (gros → petit)",
        deposit_asc: "💰 Dépôt ↑ (petit → gros)",
    };
    const embed = new EmbedBuilder()
        .setTitle("🕵️  The Watcher — Inscriptions /celsius")
        .setColor(cfg.COLOR.PRIMARY)
        .setFooter({ text: `Tri : ${sortLabel[sort]} • ${submissions.length} entrées affichées` });
    if (submissions.length === 0) {
        embed.setDescription("*Aucune inscription pour l'instant.*");
        return embed;
    }
    const lines = submissions.map((s) => {
        const flag = multi.has(s.viewer_user_id) ? " ⚠️" : "";
        const guild = s.guild_name ? s.guild_name.slice(0, 22) : `guild ${s.guild_id.slice(-4)}`;
        return `${statusBadge(s.status)} <@${s.viewer_user_id}> · \`${s.celsius_pseudo}\` · ${fmtAmount(s)} · *${guild}*${flag}`;
    });
    let chunk = [];
    let size = 0;
    for (const line of lines) {
        if (size + line.length + 1 > 1000) {
            embed.addFields({ name: "​", value: chunk.join("\n") });
            chunk = [];
            size = 0;
        }
        chunk.push(line);
        size += line.length + 1;
    }
    if (chunk.length)
        embed.addFields({ name: "​", value: chunk.join("\n") });
    return embed;
}
function buildStatsEmbed(stats) {
    const avg = stats.avgDeposit != null ? `${Math.round(stats.avgDeposit).toLocaleString("fr-FR")}€` : "—";
    const sum = stats.totalDeposit != null ? `${Math.round(stats.totalDeposit).toLocaleString("fr-FR")}€` : "—";
    return new EmbedBuilder()
        .setTitle("📊  Récap Watcher")
        .setColor(cfg.COLOR.NEUTRAL)
        .addFields({ name: "Inscriptions totales", value: `\`${stats.total}\``, inline: true }, { name: "🟡 En attente", value: `\`${stats.pending}\``, inline: true }, { name: "🟢 Vérifiés", value: `\`${stats.verified}\``, inline: true }, { name: "🔴 Refusés", value: `\`${stats.rejected}\``, inline: true }, { name: "Dépôt moyen", value: `\`${avg}\``, inline: true }, { name: "Dépôt total cumulé", value: `\`${sum}\``, inline: true }, { name: "Comptes multi-serveurs ⚠️", value: `\`${stats.multiServer}\``, inline: true })
        .setFooter({ text: `${cfg.BRAND.NAME} • Mise à jour automatique` });
}
function buildSortRow() {
    const mk = (mode, label, emoji) => new ButtonBuilder()
        .setCustomId(`aurix:watcher:sort:${mode}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji);
    return new ActionRowBuilder().addComponents(mk("date_desc", "Date ↓", "📅"), mk("date_asc", "Date ↑", "📅"), mk("deposit_desc", "Dépôt ↓", "💰"), mk("deposit_asc", "Dépôt ↑", "💰"));
}
async function getWatcherChannel(guild) {
    const storedId = await kvGet("channel_watcher_id");
    const candidates = [storedId, process.env.AURIX_WATCHER_CHANNEL_ID, WATCHER_CHANNEL_FALLBACK_ID]
        .map((id) => String(id || "").trim())
        .filter(Boolean);
    const unique = [...new Set(candidates)];
    for (const id of unique) {
        const ch = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
        if (ch && ch.type === ChannelType.GuildText) {
            if (id !== storedId)
                await kvSet("channel_watcher_id", id);
            return ch;
        }
    }
    return null;
}
// ───────────── Board (sticky list + stats) ─────────────
export async function ensureWatcherBoard(guild) {
    const ch = await getWatcherChannel(guild);
    if (!ch)
        return;
    const me = guild.members.me;
    if (!me)
        return;
    let listId = await kvGet("watcher_list_message_id");
    let statsId = await kvGet("watcher_stats_message_id");
    const me2 = me.id;
    const ensureMsg = async (existingId, payload) => {
        if (existingId) {
            try {
                const m = await ch.messages.fetch(existingId);
                if (m.author.id === me2) {
                    await m.edit(payload);
                    return m.id;
                }
            }
            catch {
                /* not found, fall through */
            }
        }
        const m = await ch.send(payload);
        return m.id;
    };
    const sort = (await kvGet("watcher_sort")) || DEFAULT_SORT;
    const [subs, stats, multi] = await Promise.all([
        fetchSubmissions(sort),
        fetchStats(),
        fetchMultiServerUserIds(),
    ]);
    const newListId = await ensureMsg(listId, {
        embeds: [buildListEmbed(subs, sort, multi)],
        components: [buildSortRow()],
    });
    const newStatsId = await ensureMsg(statsId, {
        embeds: [buildStatsEmbed(stats)],
    });
    if (newListId !== listId)
        await kvSet("watcher_list_message_id", newListId);
    if (newStatsId !== statsId)
        await kvSet("watcher_stats_message_id", newStatsId);
    // 3e message sticky : file de traitement (1 demande à la fois + boutons).
    await ensureQueueMessage(guild);
    // 4e message sticky : configuration auto-validation par streamer.
    await ensureAutoValidateConfigMessage(guild);
    // Notif ping owner dans 🗂️-gestion (delete+repost pour eviter l'accumulation).
    await ensureGestionNotification(guild);
}
export async function refreshWatcherBoard(client) {
    const guildId = process.env.AURIX_GUILD_ID;
    let guild;
    if (guildId)
        guild = client.guilds.cache.get(guildId);
    if (!guild)
        guild = client.guilds.cache.first();
    if (!guild)
        return;
    await ensureWatcherBoard(guild);
}
// ───────────── New submission review post (one per /celsius) ─────────────
export async function postSubmissionReview(client, submissionId) {
    const sub = await one("SELECT * FROM aurix_celsius_submissions WHERE id=$1", [submissionId]);
    if (!sub)
        return;
    const guildId = process.env.AURIX_GUILD_ID;
    let aurixGuild;
    if (guildId)
        aurixGuild = client.guilds.cache.get(guildId);
    if (!aurixGuild)
        aurixGuild = client.guilds.cache.first();
    if (!aurixGuild)
        return;
    const ch = await getWatcherChannel(aurixGuild);
    if (!ch)
        return;
    const multi = await fetchMultiServerUserIds();
    const isMulti = multi.has(sub.viewer_user_id);
    const guildLabel = sub.guild_name ? sub.guild_name : `guild ${sub.guild_id}`;
    const embed = new EmbedBuilder()
        .setTitle(`${statusBadge(sub.status)}  Inscription /celsius #${sub.id}`)
        .setDescription([
        `**Viewer :** <@${sub.viewer_user_id}> (\`${sub.viewer_username}\`)`,
        `**Pseudo Celsius :** \`${sub.celsius_pseudo}\``,
        `**Email :** \`${sub.celsius_email}\``,
        `**Dépôt moyen / mois :** \`${fmtAmount(sub)}\``,
        `**Serveur d'origine :** *${guildLabel}*`,
        isMulti ? "\n⚠️ *Ce viewer a soumis sur **plusieurs serveurs** — à examiner.*" : "",
    ]
        .filter(Boolean)
        .join("\n"))
        .setColor(cfg.COLOR.WARNING)
        .setFooter({ text: `${cfg.BRAND.NAME} • Submission #${sub.id}` });
    const validateBtn = new ButtonBuilder()
        .setCustomId(`aurix:watcher:validate:${sub.id}`)
        .setLabel("Valider")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🟢");
    const rejectBtn = new ButtonBuilder()
        .setCustomId(`aurix:watcher:reject:${sub.id}`)
        .setLabel("Refuser")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔴");
    const row = new ActionRowBuilder().addComponents(validateBtn, rejectBtn);
    // S'il y avait déjà un message de review (renvoi), on l'édite ; sinon on en poste un nouveau.
    if (sub.review_message_id) {
        try {
            const old = await ch.messages.fetch(String(sub.review_message_id));
            await old.edit({ embeds: [embed], components: [row] });
            return;
        }
        catch {
            /* deleted, fall through */
        }
    }
    const msg = await ch.send({ embeds: [embed], components: [row] });
    await query("UPDATE aurix_celsius_submissions SET review_message_id=$1 WHERE id=$2", [msg.id, sub.id]);
}
async function editReviewToDecision(client, submissionId, decidedBy) {
    const sub = await one("SELECT * FROM aurix_celsius_submissions WHERE id=$1", [submissionId]);
    if (!sub || !sub.review_message_id)
        return;
    const guildId = process.env.AURIX_GUILD_ID;
    let aurixGuild;
    if (guildId)
        aurixGuild = client.guilds.cache.get(guildId);
    if (!aurixGuild)
        aurixGuild = client.guilds.cache.first();
    if (!aurixGuild)
        return;
    const ch = await getWatcherChannel(aurixGuild);
    if (!ch)
        return;
    const color = sub.status === "verified" ? cfg.COLOR.SUCCESS : sub.status === "rejected" ? cfg.COLOR.DANGER : cfg.COLOR.WARNING;
    const embed = new EmbedBuilder()
        .setTitle(`${statusBadge(sub.status)}  Inscription /celsius #${sub.id}`)
        .setDescription([
        `**Viewer :** <@${sub.viewer_user_id}> (\`${sub.viewer_username}\`)`,
        `**Pseudo Celsius :** \`${sub.celsius_pseudo}\``,
        `**Email :** \`${sub.celsius_email}\``,
        `**Dépôt moyen / mois :** \`${fmtAmount(sub)}\``,
        `**Serveur :** ${sub.guild_name ?? sub.guild_id}`,
        "",
        sub.status === "verified"
            ? `🟢 **Validé** par <@${decidedBy}>`
            : sub.status === "rejected"
                ? `🔴 **Refusé** par <@${decidedBy}>${sub.reject_reason ? `\n**Raison :** *${sub.reject_reason}*` : ""}`
                : "",
    ]
        .filter(Boolean)
        .join("\n"))
        .setColor(color)
        .setFooter({ text: `${cfg.BRAND.NAME} • Submission #${sub.id}` });
    try {
        const msg = await ch.messages.fetch(String(sub.review_message_id));
        await msg.edit({ embeds: [embed], components: [] });
    }
    catch {
        /* ignore */
    }
}
// ───────────── Interaction handlers ─────────────
export async function handleWatcherSort(interaction) {
    const mode = interaction.customId.split(":").pop();
    await kvSet("watcher_sort", mode);
    await interaction.deferUpdate();
    if (interaction.guild)
        await ensureWatcherBoard(interaction.guild);
}
/** Envoie le DM viewer apres une decision (verified / rejected). */
async function dmAfterDecision(client, submissionId, decision) {
    const sub = await one(`SELECT viewer_user_id, celsius_pseudo, monthly_deposit, monthly_deposit_amount, guild_name, reject_reason
       FROM aurix_celsius_submissions WHERE id=$1`, [submissionId]);
    if (!sub)
        return;
    try {
        if (decision === "verified") {
            const amt = sub.monthly_deposit_amount != null ? Number(sub.monthly_deposit_amount) : null;
            await sendCelsiusValidatedDM(client, {
                viewerUserId: sub.viewer_user_id,
                pseudo: sub.celsius_pseudo,
                monthlyDeposit: sub.monthly_deposit,
                monthlyDepositAmount: Number.isFinite(amt) ? amt : null,
                guildName: sub.guild_name ?? "ton serveur",
            });
        }
        else {
            await sendCelsiusRejectedDM(client, {
                viewerUserId: sub.viewer_user_id,
                pseudo: sub.celsius_pseudo,
                rejectReason: sub.reject_reason,
            });
        }
    }
    catch (e) {
        console.error("[aurix.watcher] dmAfterDecision failed:", e);
    }
}
export async function handleWatcherValidate(interaction) {
    const submissionId = Number(interaction.customId.split(":").pop());
    if (!Number.isFinite(submissionId)) {
        await interaction.reply({ content: "Submission invalide.", ephemeral: true });
        return;
    }
    if (!isModerator(interaction)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
    }
    await interaction.deferUpdate();
    await query("UPDATE aurix_celsius_submissions SET status='verified', decided_by=$1, verified_at=NOW(), reject_reason=NULL WHERE id=$2", [interaction.user.id, submissionId]);
    await editReviewToDecision(interaction.client, submissionId, interaction.user.id);
    await dmAfterDecision(interaction.client, submissionId, "verified");
    if (interaction.guild)
        await ensureWatcherBoard(interaction.guild);
}
export async function handleWatcherRejectButton(interaction) {
    const submissionId = interaction.customId.split(":").pop();
    if (!isModerator(interaction)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
    }
    const modal = new ModalBuilder()
        .setCustomId(`aurix:watcher:reject:modal:${submissionId}`)
        .setTitle("Refuser la demande");
    const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Raison du refus (visible par le viewer)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);
    modal.addComponents(new ActionRowBuilder().addComponents(reason));
    await interaction.showModal(modal);
}
export async function handleWatcherRejectModal(interaction) {
    const submissionId = Number(interaction.customId.split(":").pop());
    if (!Number.isFinite(submissionId)) {
        await interaction.reply({ content: "Submission invalide.", ephemeral: true });
        return;
    }
    const reason = interaction.fields.getTextInputValue("reason").trim();
    await interaction.deferReply({ ephemeral: true });
    await query("UPDATE aurix_celsius_submissions SET status='rejected', decided_by=$1, verified_at=NOW(), reject_reason=$2 WHERE id=$3", [interaction.user.id, reason, submissionId]);
    await editReviewToDecision(interaction.client, submissionId, interaction.user.id);
    await dmAfterDecision(interaction.client, submissionId, "rejected");
    if (interaction.guild)
        await ensureWatcherBoard(interaction.guild);
    await interaction.editReply({ content: "🔴 Demande refusée." });
}
function isModerator(interaction) {
    const member = interaction.member;
    if (!member)
        return false;
    const perms = member.permissions;
    if (!perms || typeof perms.has !== "function")
        return false;
    return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageMessages);
}
// ═════════════════════════════════════════════════════════
// File de traitement (3e message sticky)
// ═════════════════════════════════════════════════════════
async function getQueueFilter() {
    return (await kvGet("watcher_queue_filter")) || QUEUE_FILTER_ALL;
}
async function fetchPendingGuilds() {
    const rows = await all(`SELECT guild_id, MAX(guild_name) AS guild_name, COUNT(*)::text AS count
       FROM aurix_celsius_submissions
       WHERE status='pending'
       GROUP BY guild_id
       ORDER BY COUNT(*) DESC`);
    return rows.map((r) => ({ guild_id: r.guild_id, guild_name: r.guild_name, count: Number(r.count) || 0 }));
}
async function fetchNextPending(filterGuildId) {
    const useFilter = filterGuildId && filterGuildId !== QUEUE_FILTER_ALL;
    const where = useFilter ? "WHERE status='pending' AND guild_id=$1" : "WHERE status='pending'";
    const params = useFilter ? [filterGuildId] : [];
    return one(`SELECT * FROM aurix_celsius_submissions
       ${where}
       ORDER BY COALESCE(skipped_at, created_at) ASC, id ASC
       LIMIT 1`, params);
}
async function countPendingForFilter(filterGuildId) {
    const useFilter = filterGuildId && filterGuildId !== QUEUE_FILTER_ALL;
    const row = useFilter
        ? await one("SELECT COUNT(*)::text AS n FROM aurix_celsius_submissions WHERE status='pending' AND guild_id=$1", [filterGuildId])
        : await one("SELECT COUNT(*)::text AS n FROM aurix_celsius_submissions WHERE status='pending'");
    return row ? Number(row.n) || 0 : 0;
}
function buildQueueEmbed(sub, filterGuildName, remaining, isMulti) {
    const filterLabel = filterGuildName ? `🎯 Filtre actif : **${filterGuildName}**` : "🌐 Tous les streamers";
    if (!sub) {
        return new EmbedBuilder()
            .setTitle("🎯  File de traitement")
            .setColor(cfg.COLOR.SUCCESS)
            .setDescription([
            filterLabel,
            "",
            "🎉 **Plus aucune demande en attente** sur ce filtre.",
            "",
            "Sélectionne un autre streamer ou attends qu'une nouvelle demande arrive.",
        ].join("\n"))
            .setFooter({ text: `${cfg.BRAND.NAME} • File vide` });
    }
    const guildLabel = sub.guild_name ? sub.guild_name : `guild ${sub.guild_id}`;
    return new EmbedBuilder()
        .setTitle("🎯  File de traitement — demande à traiter")
        .setColor(cfg.COLOR.WARNING)
        .setDescription([
        filterLabel,
        `📊 **${remaining}** demande${remaining > 1 ? "s" : ""} en attente`,
        "",
        "─────────────────────",
        "",
        `👤 **Viewer :** <@${sub.viewer_user_id}> · \`${sub.viewer_username}\``,
        `🎰 **Pseudo Celsius :** \`${sub.celsius_pseudo}\``,
        `✉️ **Email :** \`${sub.celsius_email}\``,
        `💰 **Dépôt moyen / mois :** \`${fmtAmount(sub)}\``,
        `🌐 **Serveur d'origine :** *${guildLabel}*`,
        isMulti ? "\n⚠️ *Ce viewer est inscrit sur **plusieurs serveurs** — à examiner.*" : "",
    ]
        .filter(Boolean)
        .join("\n"))
        .setFooter({ text: `${cfg.BRAND.NAME} • Submission #${sub.id}` });
}
function buildQueueActionRows(sub, pendingGuilds, currentFilter) {
    const rows = [];
    // Row 1: select menu pour filtrer par streamer
    const select = new StringSelectMenuBuilder()
        .setCustomId("aurix:watcher:queue:filter")
        .setPlaceholder("Filtrer par streamer…");
    const opts = [
        new StringSelectMenuOptionBuilder()
            .setLabel("🌐 Tous les streamers")
            .setValue(QUEUE_FILTER_ALL)
            .setDefault(currentFilter === QUEUE_FILTER_ALL),
    ];
    for (const g of pendingGuilds.slice(0, 24)) {
        const name = (g.guild_name || `Guild ${g.guild_id.slice(-4)}`).slice(0, 60);
        opts.push(new StringSelectMenuOptionBuilder()
            .setLabel(`${name} · ${g.count} en attente`.slice(0, 100))
            .setValue(g.guild_id)
            .setDefault(currentFilter === g.guild_id));
    }
    select.addOptions(opts);
    rows.push(new ActionRowBuilder().addComponents(select));
    // Row 2: boutons d'action (uniquement si une demande à traiter)
    if (sub) {
        const acceptBtn = new ButtonBuilder()
            .setCustomId(`aurix:watcher:queue:accept:${sub.id}`)
            .setLabel("Accepter")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🟢");
        const passBtn = new ButtonBuilder()
            .setCustomId(`aurix:watcher:queue:pass:${sub.id}`)
            .setLabel("Passer")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⏭️");
        const rejectBtn = new ButtonBuilder()
            .setCustomId(`aurix:watcher:queue:reject:${sub.id}`)
            .setLabel("Refuser")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔴");
        rows.push(new ActionRowBuilder().addComponents(acceptBtn, passBtn, rejectBtn));
    }
    return rows;
}
export async function ensureQueueMessage(guild) {
    const ch = await getWatcherChannel(guild);
    if (!ch)
        return;
    const me = guild.members.me;
    if (!me)
        return;
    const filter = await getQueueFilter();
    const [next, pendingGuilds, multi] = await Promise.all([
        fetchNextPending(filter),
        fetchPendingGuilds(),
        fetchMultiServerUserIds(),
    ]);
    // Si le filtre actif n'a plus rien, on retombe sur "Tous" automatiquement.
    let effectiveFilter = filter;
    if (!next && filter !== QUEUE_FILTER_ALL) {
        effectiveFilter = QUEUE_FILTER_ALL;
        await kvSet("watcher_queue_filter", QUEUE_FILTER_ALL);
    }
    const finalNext = effectiveFilter === filter ? next : await fetchNextPending(effectiveFilter);
    const remaining = await countPendingForFilter(effectiveFilter);
    const filterName = (() => {
        if (effectiveFilter === QUEUE_FILTER_ALL)
            return null;
        const g = pendingGuilds.find((g) => g.guild_id === effectiveFilter);
        return g?.guild_name ?? `Guild ${effectiveFilter.slice(-4)}`;
    })();
    const isMulti = finalNext ? multi.has(finalNext.viewer_user_id) : false;
    const payload = {
        embeds: [buildQueueEmbed(finalNext, filterName, remaining, isMulti)],
        components: buildQueueActionRows(finalNext, pendingGuilds, effectiveFilter),
    };
    const existingId = await kvGet("watcher_queue_message_id");
    if (existingId) {
        try {
            const m = await ch.messages.fetch(existingId);
            if (m.author.id === me.id) {
                await m.edit(payload);
                return;
            }
        }
        catch {
            /* not found, fall through */
        }
    }
    const msg = await ch.send(payload);
    await kvSet("watcher_queue_message_id", msg.id);
}
function buildAutoValidateConfigEmbed(settings) {
    const enabled = settings.filter((s) => s.auto_validate_celsius);
    const disabled = settings.filter((s) => !s.auto_validate_celsius);
    const lines = settings.slice(0, 35).map((s) => {
        const name = s.guild_name || `Guild ${s.guild_id.slice(-4)}`;
        const state = s.auto_validate_celsius ? "ON auto-validation" : "OFF validation manuelle";
        return `${s.auto_validate_celsius ? "🟢" : "⚪"} **${name}** · \`${state}\``;
    });
    return new EmbedBuilder()
        .setTitle("⚙️  Auto-validation Celsius par streamer")
        .setColor(cfg.COLOR.NEUTRAL)
        .setDescription([
        "Active l'auto-validation uniquement pour les deals où les joueurs doivent être validés sans passage manuel.",
        "",
        `🟢 Auto : \`${enabled.length}\` · ⚪ Manuel : \`${disabled.length}\``,
        "",
        lines.length ? lines.join("\n") : "*Aucun streamer connu pour l'instant.*",
        settings.length > 35 ? `\n… ${settings.length - 35} streamer(s) non affiché(s).` : "",
    ]
        .filter(Boolean)
        .join("\n"))
        .setFooter({ text: `${cfg.BRAND.NAME} • Sélectionne un streamer ci-dessous pour basculer ON/OFF` });
}
function buildAutoValidateConfigRows(settings) {
    if (settings.length === 0)
        return [];
    const select = new StringSelectMenuBuilder()
        .setCustomId(AUTO_VALIDATE_SELECT_ID)
        .setPlaceholder("Basculer l'auto-validation d'un streamer…");
    for (const s of settings.slice(0, 25)) {
        const name = (s.guild_name || `Guild ${s.guild_id.slice(-4)}`).slice(0, 72);
        select.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(`${s.auto_validate_celsius ? "ON" : "OFF"} · ${name}`.slice(0, 100))
            .setDescription(s.auto_validate_celsius
            ? "Clique pour repasser en validation manuelle."
            : "Clique pour valider automatiquement les futurs joueurs.")
            .setValue(s.guild_id));
    }
    return [new ActionRowBuilder().addComponents(select)];
}
export async function ensureAutoValidateConfigMessage(guild) {
    const ch = await getWatcherChannel(guild);
    if (!ch)
        return;
    const me = guild.members.me;
    if (!me)
        return;
    const settings = await fetchStreamerAutoValidateSettings();
    const payload = {
        embeds: [buildAutoValidateConfigEmbed(settings)],
        components: buildAutoValidateConfigRows(settings),
    };
    const existingId = await kvGet("watcher_auto_validate_message_id");
    if (existingId) {
        try {
            const m = await ch.messages.fetch(existingId);
            if (m.author.id === me.id) {
                await m.edit(payload);
                return;
            }
        }
        catch {
            /* not found, fall through */
        }
    }
    const msg = await ch.send(payload);
    await kvSet("watcher_auto_validate_message_id", msg.id);
}
export async function handleAutoValidateConfigSelect(interaction) {
    if (!isModerator(interaction)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
    }
    const guildId = interaction.values[0];
    const settings = await fetchStreamerAutoValidateSettings();
    const current = settings.find((s) => s.guild_id === guildId);
    if (!guildId || !current) {
        await interaction.reply({ content: "Streamer introuvable dans la configuration.", ephemeral: true });
        return;
    }
    const enabled = await toggleStreamerAutoValidate(guildId, current.guild_name, interaction.user.id);
    await interaction.deferUpdate();
    if (interaction.guild)
        await ensureWatcherBoard(interaction.guild);
    await interaction.followUp({
        content: `${enabled ? "🟢" : "⚪"} Auto-validation Celsius **${enabled ? "activée" : "désactivée"}** pour **${current.guild_name || guildId}**.`,
        ephemeral: true,
    });
}
// ───────────── Queue handlers ─────────────
export async function handleQueueAccept(interaction) {
    const submissionId = Number(interaction.customId.split(":").pop());
    if (!Number.isFinite(submissionId)) {
        await interaction.reply({ content: "Submission invalide.", ephemeral: true });
        return;
    }
    if (!isModerator(interaction)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
    }
    await interaction.deferUpdate();
    await query("UPDATE aurix_celsius_submissions SET status='verified', decided_by=$1, verified_at=NOW(), reject_reason=NULL WHERE id=$2", [interaction.user.id, submissionId]);
    await editReviewToDecision(interaction.client, submissionId, interaction.user.id);
    await dmAfterDecision(interaction.client, submissionId, "verified");
    if (interaction.guild)
        await ensureWatcherBoard(interaction.guild);
}
export async function handleQueuePass(interaction) {
    const submissionId = Number(interaction.customId.split(":").pop());
    if (!Number.isFinite(submissionId)) {
        await interaction.reply({ content: "Submission invalide.", ephemeral: true });
        return;
    }
    if (!isModerator(interaction)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
    }
    await interaction.deferUpdate();
    await query("UPDATE aurix_celsius_submissions SET skipped_at=NOW() WHERE id=$1 AND status='pending'", [submissionId]);
    if (interaction.guild)
        await ensureWatcherBoard(interaction.guild);
}
export async function handleQueueRejectButton(interaction) {
    const submissionId = interaction.customId.split(":").pop();
    if (!isModerator(interaction)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
    }
    const modal = new ModalBuilder()
        .setCustomId(`aurix:watcher:reject:modal:${submissionId}`)
        .setTitle("Refuser la demande");
    const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Raison du refus (visible par le viewer)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);
    modal.addComponents(new ActionRowBuilder().addComponents(reason));
    await interaction.showModal(modal);
}
export async function handleQueueFilterSelect(interaction) {
    if (!isModerator(interaction)) {
        await interaction.reply({ content: "Réservé au staff.", ephemeral: true });
        return;
    }
    const value = interaction.values[0] || QUEUE_FILTER_ALL;
    await kvSet("watcher_queue_filter", value);
    await interaction.deferUpdate();
    if (interaction.guild)
        await ensureWatcherBoard(interaction.guild);
}
// ═════════════════════════════════════════════════════════
// Notif 🗂️-gestion : ping owner quand une nouvelle demande arrive
// (delete + repost pour ne jamais accumuler).
// ═════════════════════════════════════════════════════════
async function ensureGestionNotification(guild) {
    const gestionId = await kvGet("channel_gestion_id");
    const watcherId = await kvGet("channel_watcher_id");
    if (!gestionId)
        return;
    const ch = guild.channels.cache.get(gestionId);
    if (!ch || ch.type !== ChannelType.GuildText)
        return;
    const me = guild.members.me;
    if (!me)
        return;
    // Supprime l'ancien message s'il existe (pour eviter l'accumulation).
    const oldId = await kvGet("gestion_notif_message_id");
    if (oldId) {
        try {
            const old = await ch.messages.fetch(oldId);
            if (old.author.id === me.id)
                await old.delete();
        }
        catch {
            /* deja supprime */
        }
        await kvSet("gestion_notif_message_id", "");
    }
    // Recupere la prochaine demande dans la file (en respectant le filtre actuel).
    const filter = await getQueueFilter();
    const next = await fetchNextPending(filter);
    const remaining = await countPendingForFilter(filter);
    // Si rien a traiter, on n'a rien a notifier.
    if (!next || remaining === 0)
        return;
    const guildLabel = next.guild_name || `Guild ${next.guild_id.slice(-4)}`;
    const watcherMention = watcherId ? `<#${watcherId}>` : "**🕵️-the-watcher**";
    const ownerMention = `<@${guild.ownerId}>`;
    const multi = await fetchMultiServerUserIds();
    const isMulti = multi.has(next.viewer_user_id);
    const embed = new EmbedBuilder()
        .setTitle("🔔  Nouvelle demande de vérification Celsius")
        .setColor(cfg.COLOR.WARNING)
        .setDescription([
        `Une demande de vérification vient d'être soumise.`,
        `**Total en attente :** \`${remaining}\``,
        "",
        `**Dernière demande :**`,
        `👤 Viewer : <@${next.viewer_user_id}> (\`${next.viewer_username}\`)`,
        `🎰 Pseudo Celsius : \`${next.celsius_pseudo}\``,
        `💰 Dépôt moyen / mois : \`${fmtAmount(next)}\``,
        `🎙️ Serveur d'origine : *${guildLabel}*`,
        isMulti ? `\n⚠️ *Viewer présent sur plusieurs Discord — à examiner.*` : "",
        "",
        `→ Traiter dans ${watcherMention}`,
    ]
        .filter(Boolean)
        .join("\n"))
        .setFooter({ text: `${cfg.BRAND.NAME} • Submission #${next.id}` });
    try {
        const msg = await ch.send({
            content: ownerMention,
            embeds: [embed],
            allowedMentions: { users: [guild.ownerId] },
        });
        await kvSet("gestion_notif_message_id", msg.id);
    }
    catch (e) {
        console.error("[aurix.watcher] gestion notif post failed:", e);
    }
}
