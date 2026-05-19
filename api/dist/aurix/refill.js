// Refill : /refill (montant fixe), /refill-cancel, /refill-sent, /compte, cutoff quotidien.
import { ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, } from "discord.js";
import * as cfg from "./config.js";
import { all, kvGet, kvGetInt, one, query } from "./db.js";
import { loadEnv } from "./env.js";
import { logEvent } from "./tickets.js";
const log = (...a) => console.log("[aurix.refill]", ...a);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// ───────────── Time helpers ─────────────
function tz() {
    return loadEnv().TIMEZONE;
}
function nowParts(zone) {
    // Convertit "maintenant" en heure locale via Intl.
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    return {
        y: Number(parts.year),
        m: Number(parts.month),
        d: Number(parts.day),
        h: Number(parts.hour === "24" ? "00" : parts.hour),
        mi: Number(parts.minute),
    };
}
/** Date UTC correspondant à HH:MM heure locale demandée — résolu via essai/erreur (offset stable). */
function localToUtc(year, month, day, hour, minute, zone) {
    // Approche : on prend une date UTC candidate, on regarde quelle heure locale elle représente, et on ajuste l'écart.
    const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const local = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(candidate);
    const p = Object.fromEntries(local.map((x) => [x.type, x.value]));
    const ly = Number(p.year);
    const lm = Number(p.month);
    const ld = Number(p.day);
    const lh = Number(p.hour === "24" ? "00" : p.hour);
    const lmin = Number(p.minute);
    const asLocalAsUtcMs = Date.UTC(ly, lm - 1, ld, lh, lmin, 0);
    const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const offsetMs = asLocalAsUtcMs - wantedMs;
    return new Date(candidate.getTime() - offsetMs);
}
async function cutoffHM() {
    const h = (await kvGetInt("refill_cutoff_hour", cfg.DEFAULTS.REFILL_CUTOFF_HOUR)) ?? cfg.DEFAULTS.REFILL_CUTOFF_HOUR;
    const m = (await kvGetInt("refill_cutoff_minute", cfg.DEFAULTS.REFILL_CUTOFF_MINUTE)) ?? cfg.DEFAULTS.REFILL_CUTOFF_MINUTE;
    return { h, m };
}
async function nextCutoffUtc() {
    const zone = tz();
    const np = nowParts(zone);
    const { h, m } = await cutoffHM();
    let target = localToUtc(np.y, np.m, np.d, h, m, zone);
    if (target.getTime() <= Date.now()) {
        const next = new Date(target.getTime() + 24 * 3600_000);
        target = next;
    }
    return target;
}
function humanDay(d, zone) {
    const today = nowParts(zone);
    const that = (() => {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(d);
        const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
        return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
    })();
    const a = Date.UTC(today.y, today.m - 1, today.d);
    const b = Date.UTC(that.y, that.m - 1, that.d);
    const diff = Math.round((b - a) / (24 * 3600_000));
    if (diff === 0)
        return "aujourd'hui";
    if (diff === 1)
        return "demain";
    if (diff === 2)
        return "après-demain";
    return `le ${String(that.d).padStart(2, "0")}/${String(that.m).padStart(2, "0")}`;
}
function fmtHHhMM(d, zone) {
    const f = new Intl.DateTimeFormat("fr-FR", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    return f.format(d).replace(":", "h");
}
function fmtFull(d, zone) {
    const f = new Intl.DateTimeFormat("fr-FR", {
        timeZone: zone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    return f.format(d).replace(", ", " à ").replace(":", "h");
}
function refillWindowText(cutoff) {
    const zone = tz();
    const end = new Date(cutoff.getTime() + 24 * 3600_000);
    return `entre **${fmtHHhMM(cutoff, zone)} ${humanDay(cutoff, zone)}** et **${fmtHHhMM(end, zone)} ${humanDay(end, zone)}**`;
}
async function getOpenBatch() {
    return one("SELECT * FROM aurix_refill_batches WHERE status='open' ORDER BY id DESC LIMIT 1");
}
async function getRequests(batchId) {
    return all("SELECT * FROM aurix_refill_requests WHERE batch_id=$1 ORDER BY id ASC", [batchId]);
}
async function getAccount(userId) {
    return one("SELECT * FROM aurix_user_accounts WHERE user_id=$1", [userId]);
}
async function saveAccount(userId, partial) {
    const existing = (await getAccount(userId)) ?? {
        telegram: null,
        email: null,
        casino_username: null,
    };
    const next = {
        telegram: partial.telegram !== undefined ? partial.telegram : existing.telegram,
        email: partial.email !== undefined ? partial.email : existing.email,
        casino_username: partial.casino_username !== undefined ? partial.casino_username : existing.casino_username,
    };
    await query(`INSERT INTO aurix_user_accounts(user_id, telegram, email, casino_username, updated_at)
     VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(user_id) DO UPDATE SET
       telegram=EXCLUDED.telegram,
       email=EXCLUDED.email,
       casino_username=EXCLUDED.casino_username,
       updated_at=NOW()`, [userId, next.telegram, next.email, next.casino_username]);
    return (await getAccount(userId));
}
function normalizeTelegram(v) {
    const t = v.trim();
    if (!t)
        return t;
    return t.startsWith("@") ? t : "@" + t;
}
// ───────────── Embed builder ─────────────
function buildBatchEmbed(batch, reqs) {
    const zone = tz();
    const cutoffLocal = fmtFull(batch.cutoff_at, zone);
    const statusLabel = batch.status === "open"
        ? "🟢 En cours d'accumulation"
        : batch.status === "locked"
            ? "🟡 Verrouillé — à envoyer au manager"
            : "✅ Envoyé";
    const color = batch.status === "open"
        ? cfg.COLOR.PRIMARY
        : batch.status === "locked"
            ? cfg.COLOR.WARNING
            : cfg.COLOR.SUCCESS;
    const embed = new EmbedBuilder()
        .setTitle(`${cfg.EMOJI.list}  Batch refill #${batch.id}`)
        .setDescription([
        `**Cutoff :** \`${cutoffLocal}\` (${zone})`,
        `**Montant unitaire :** \`${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}\``,
        `**Statut :** ${statusLabel}`,
        `**Total demandes :** \`${reqs.length}\``,
    ].join("\n"))
        .setColor(color)
        .setFooter({ text: `${cfg.BRAND.NAME} • Mise à jour automatique` });
    if (reqs.length === 0) {
        embed.addFields({ name: "—", value: "*Aucune demande pour l'instant.*" });
    }
    else {
        const lines = reqs.map((r, i) => {
            const parts = [`**${i + 1}.** <@${r.user_id}>`];
            if (r.casino_username)
                parts.push(`🎰 \`${r.casino_username}\``);
            if (r.email)
                parts.push(`✉️ \`${r.email}\``);
            if (r.notes)
                parts.push(`📝 *${r.notes}*`);
            return parts.join(" · ");
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
            embed.addFields({ name: "Demandes", value: chunk.join("\n") });
    }
    return embed;
}
function buildPlainListForManager(reqs) {
    if (reqs.length === 0)
        return "(aucune demande)";
    const lines = [
        `Demandes de refill du jour (${cfg.DEFAULTS.REFILL_FIXED_AMOUNT} chacun) :`,
        "",
    ];
    reqs.forEach((r, i) => {
        const chunks = [`${i + 1}. ${r.username}`];
        if (r.casino_username)
            chunks.push(`pseudo casino : ${r.casino_username}`);
        if (r.email)
            chunks.push(`email : ${r.email}`);
        if (r.notes)
            chunks.push(`note : ${r.notes}`);
        lines.push(chunks.join(" — "));
    });
    return lines.join("\n");
}
// ───────────── Public API ─────────────
export async function ensureOpenBatch(guild) {
    const existing = await getOpenBatch();
    if (existing)
        return existing;
    const chId = await kvGet("channel_refills_id");
    if (!chId) {
        log("Salon refills introuvable.");
        return null;
    }
    const ch = guild.channels.cache.get(chId);
    if (!ch || ch.type !== 0 /* GuildText */)
        return null;
    const channel = ch;
    const cutoff = await nextCutoffUtc();
    const insert = await one("INSERT INTO aurix_refill_batches(cutoff_at, status, channel_id) VALUES($1,'open',$2) RETURNING id", [cutoff, channel.id]);
    if (!insert)
        return null;
    const batch = {
        id: insert.id,
        cutoff_at: cutoff,
        status: "open",
        message_id: null,
        channel_id: channel.id,
        created_at: new Date(),
        sent_at: null,
    };
    const msg = await channel.send({ embeds: [buildBatchEmbed(batch, [])] });
    await query("UPDATE aurix_refill_batches SET message_id=$1 WHERE id=$2", [msg.id, batch.id]);
    batch.message_id = msg.id;
    log(`Nouveau batch #${batch.id} créé (cutoff ${cutoff.toISOString()})`);
    return batch;
}
async function refreshBatchMessage(client, batch) {
    if (!batch.channel_id || !batch.message_id)
        return;
    const ch = client.channels.cache.get(batch.channel_id);
    if (!ch || ch.type !== 0)
        return;
    const channel = ch;
    try {
        const msg = await channel.messages.fetch(batch.message_id);
        const reqs = await getRequests(batch.id);
        const enriched = [];
        for (const r of reqs) {
            const acc = await getAccount(r.user_id);
            enriched.push({ ...r, email: acc?.email ?? null });
        }
        await msg.edit({ embeds: [buildBatchEmbed(batch, enriched)] });
    }
    catch {
        /* ignore */
    }
}
// ───────────── Guards ─────────────
async function ensureInOwnTicket(interaction) {
    const ch = interaction.channel;
    if (!ch || ch.type !== 0) {
        await interaction.reply({ content: "Commande utilisable uniquement en salon.", ephemeral: true });
        return false;
    }
    const row = await one("SELECT user_id FROM aurix_tickets WHERE channel_id=$1 AND status='open'", [ch.id]);
    if (!row) {
        await interaction.reply({
            content: `${cfg.EMOJI.cross} \`/refill\` n'est utilisable que dans **ton ticket privé**.`,
            ephemeral: true,
        });
        return false;
    }
    if (row.user_id !== interaction.user.id) {
        await interaction.reply({
            content: `${cfg.EMOJI.cross} Seul le streamer propriétaire de ce ticket peut faire la demande.`,
            ephemeral: true,
        });
        return false;
    }
    return true;
}
// ───────────── /refill ─────────────
export async function handleRefillCommand(interaction) {
    if (!(await ensureInOwnTicket(interaction)))
        return;
    const batch = await getOpenBatch();
    if (batch) {
        const dup = await one("SELECT id FROM aurix_refill_requests WHERE batch_id=$1 AND user_id=$2", [batch.id, interaction.user.id]);
        if (dup) {
            await interaction.reply({
                content: `${cfg.EMOJI.info} Tu as déjà une demande en attente pour ce batch. Utilise \`/refill-cancel\` puis recommence si besoin.`,
                ephemeral: true,
            });
            return;
        }
    }
    const acc = await getAccount(interaction.user.id);
    if (acc?.email) {
        await submitRefill(interaction, acc.email);
        return;
    }
    // Modal pour la 1ère fois
    const modal = new ModalBuilder()
        .setCustomId("aurix:refill:firstEmail")
        .setTitle("Première demande de refill");
    const emailInput = new TextInputBuilder()
        .setCustomId("email")
        .setLabel("Adresse email du compte casino")
        .setPlaceholder("exemple@mail.com")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(120);
    modal.addComponents(new ActionRowBuilder().addComponents(emailInput));
    await interaction.showModal(modal);
}
export async function handleFirstRefillEmailModal(interaction) {
    const email = interaction.fields.getTextInputValue("email").trim();
    if (!EMAIL_RE.test(email)) {
        await interaction.reply({
            content: `${cfg.EMOJI.cross} Adresse email invalide.`,
            ephemeral: true,
        });
        return;
    }
    await saveAccount(interaction.user.id, { email });
    await submitRefillFromModal(interaction, email);
}
async function submitRefill(interaction, email) {
    await submitRefillCore(interaction, email);
}
async function submitRefillFromModal(interaction, email) {
    await submitRefillCore(interaction, email);
}
async function submitRefillCore(interaction, email) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    if (!guild || !channel || channel.type !== 0) {
        await replySmart(interaction, { content: "Contexte invalide.", ephemeral: true });
        return;
    }
    const batch = await ensureOpenBatch(guild);
    if (!batch) {
        await replySmart(interaction, {
            content: "Impossible d'enregistrer ta demande : configuration incomplète. Préviens un admin.",
            ephemeral: true,
        });
        return;
    }
    const acc = await getAccount(interaction.user.id);
    await query(`INSERT INTO aurix_refill_requests(batch_id, user_id, username, casino_username, email, amount, notes, ticket_channel_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(batch_id, user_id) DO NOTHING`, [
        batch.id,
        interaction.user.id,
        interaction.user.tag,
        acc?.casino_username ?? null,
        email,
        cfg.DEFAULTS.REFILL_FIXED_AMOUNT,
        null,
        channel.id,
    ]);
    const fresh = (await getOpenBatch()) ?? batch;
    await refreshBatchMessage(interaction.client, fresh);
    const embed = new EmbedBuilder()
        .setTitle(`${cfg.EMOJI.check}  Demande de refill effectuée`)
        .setDescription([
        `💰 Montant : **${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}**`,
        `✉️ Email : \`${email}\``,
        "",
        `📅 Refill prévu ${refillWindowText(fresh.cutoff_at)}`,
    ].join("\n"))
        .setColor(cfg.COLOR.SUCCESS)
        .setFooter({ text: `${cfg.BRAND.NAME} • Batch #${fresh.id}` });
    await replySmart(interaction, { embeds: [embed], ephemeral: false });
    await logEvent(guild, `💰 <@${interaction.user.id}> → refill ${cfg.DEFAULTS.REFILL_FIXED_AMOUNT} (\`${email}\`) — batch #${fresh.id}`);
}
async function replySmart(interaction, payload) {
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
    }
    else {
        await interaction.reply(payload);
    }
}
// ───────────── /refill-cancel ─────────────
export async function handleRefillCancelCommand(interaction) {
    if (!(await ensureInOwnTicket(interaction)))
        return;
    const batch = await getOpenBatch();
    if (!batch) {
        await interaction.reply({ content: "Aucun batch ouvert.", ephemeral: true });
        return;
    }
    const row = await one("SELECT id FROM aurix_refill_requests WHERE batch_id=$1 AND user_id=$2", [batch.id, interaction.user.id]);
    if (!row) {
        await interaction.reply({ content: "Tu n'as pas de demande en cours.", ephemeral: true });
        return;
    }
    await query("DELETE FROM aurix_refill_requests WHERE id=$1", [row.id]);
    await refreshBatchMessage(interaction.client, batch);
    await interaction.reply({ content: `${cfg.EMOJI.check} Demande annulée.`, ephemeral: true });
    if (interaction.guild) {
        await logEvent(interaction.guild, `↩️ <@${interaction.user.id}> a annulé sa demande (batch #${batch.id})`);
    }
}
// ───────────── /refill-sent ─────────────
export async function handleRefillSentCommand(interaction) {
    const batch = await one("SELECT * FROM aurix_refill_batches WHERE status='locked' ORDER BY id DESC LIMIT 1");
    if (!batch) {
        await interaction.reply({ content: "Aucun batch verrouillé.", ephemeral: true });
        return;
    }
    await query("UPDATE aurix_refill_batches SET status='sent', sent_at=NOW() WHERE id=$1", [batch.id]);
    batch.status = "sent";
    await refreshBatchMessage(interaction.client, batch);
    await interaction.reply({
        content: `${cfg.EMOJI.check} Batch #${batch.id} marqué comme envoyé.`,
        ephemeral: true,
    });
    if (interaction.guild) {
        await logEvent(interaction.guild, `📤 Batch #${batch.id} marqué envoyé par <@${interaction.user.id}>`);
    }
}
// ───────────── /compte ─────────────
export async function handleCompteCommand(interaction) {
    const acc = await getAccount(interaction.user.id);
    const modal = new ModalBuilder().setCustomId("aurix:compte:save").setTitle("Mes informations");
    const tg = new TextInputBuilder()
        .setCustomId("telegram")
        .setLabel("Pseudo Telegram (@pseudo)")
        .setPlaceholder("@MonPseudo")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(64);
    if (acc?.telegram)
        tg.setValue(acc.telegram);
    const email = new TextInputBuilder()
        .setCustomId("email")
        .setLabel("Adresse email du compte casino")
        .setPlaceholder("exemple@mail.com")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(120);
    if (acc?.email)
        email.setValue(acc.email);
    const casino = new TextInputBuilder()
        .setCustomId("casino")
        .setLabel("Pseudo joueur (sur le casino)")
        .setPlaceholder("Ex : SpinKing92")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(64);
    if (acc?.casino_username)
        casino.setValue(acc.casino_username);
    modal.addComponents(new ActionRowBuilder().addComponents(tg), new ActionRowBuilder().addComponents(email), new ActionRowBuilder().addComponents(casino));
    await interaction.showModal(modal);
}
export async function handleCompteModal(interaction) {
    const tgRaw = interaction.fields.getTextInputValue("telegram").trim();
    const emailRaw = interaction.fields.getTextInputValue("email").trim();
    const casinoRaw = interaction.fields.getTextInputValue("casino").trim();
    const tg = tgRaw ? normalizeTelegram(tgRaw) : null;
    const emailVal = emailRaw || null;
    const casinoVal = casinoRaw || null;
    if (emailVal && !EMAIL_RE.test(emailVal)) {
        await interaction.reply({
            content: `${cfg.EMOJI.cross} Adresse email invalide.`,
            ephemeral: true,
        });
        return;
    }
    const acc = await saveAccount(interaction.user.id, {
        telegram: tg,
        email: emailVal,
        casino_username: casinoVal,
    });
    const embed = new EmbedBuilder()
        .setTitle(`${cfg.EMOJI.check}  Infos enregistrées`)
        .setColor(cfg.COLOR.SUCCESS)
        .addFields({ name: "Telegram", value: acc.telegram ?? "*(non défini)*" }, { name: "Email", value: acc.email ?? "*(non défini)*" }, { name: "Pseudo joueur", value: acc.casino_username ?? "*(non défini)*" })
        .setFooter({ text: `${cfg.BRAND.NAME} • Tu peux relancer /compte pour modifier` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
// ───────────── Cutoff task ─────────────
let cutoffTimer = null;
export function startCutoffTask(client) {
    if (cutoffTimer)
        return;
    cutoffTimer = setInterval(() => {
        void tickCutoff(client).catch((e) => console.error("[aurix.refill] cutoff tick error", e));
    }, 30_000);
    log("Cutoff task démarré (poll 30s).");
}
async function tickCutoff(client) {
    const batch = await getOpenBatch();
    if (!batch)
        return;
    if (Date.now() < batch.cutoff_at.getTime())
        return;
    await triggerCutoff(client, batch);
}
async function triggerCutoff(client, batch) {
    await query("UPDATE aurix_refill_batches SET status='locked' WHERE id=$1", [batch.id]);
    batch.status = "locked";
    await refreshBatchMessage(client, batch);
    const env = loadEnv();
    let guild;
    if (env.GUILD_ID)
        guild = client.guilds.cache.get(env.GUILD_ID);
    if (!guild)
        guild = client.guilds.cache.first();
    if (!guild)
        return;
    const staffChatId = await kvGet("channel_staff_chat_id");
    const staffChat = staffChatId ? guild.channels.cache.get(staffChatId) : null;
    if (!staffChat || staffChat.type !== 0) {
        log("staff-chat introuvable pour cutoff.");
    }
    else {
        const roleDirectionId = await kvGet("role_direction_id");
        const roleModerateurId = await kvGet("role_moderateur_id");
        const managerMention = (await kvGet("manager_mention")) ?? "*(à configurer via /config manager)*";
        const reqs = await getRequests(batch.id);
        const enriched = [];
        for (const r of reqs) {
            const acc = await getAccount(r.user_id);
            enriched.push({ ...r, email: acc?.email ?? null });
        }
        const plain = buildPlainListForManager(enriched);
        const mentions = [];
        if (roleDirectionId)
            mentions.push(`<@&${roleDirectionId}>`);
        if (roleModerateurId)
            mentions.push(`<@&${roleModerateurId}>`);
        const embed = new EmbedBuilder()
            .setTitle("⏰  Heure du cutoff — envoyez la liste au manager")
            .setDescription([
            `Le batch refill **#${batch.id}** est **verrouillé**.`,
            `**Manager à ping :** ${managerMention}`,
            `**Nombre de demandes :** \`${reqs.length}\` × \`${cfg.DEFAULTS.REFILL_FIXED_AMOUNT}\``,
            "",
            `📋 Liste prête à copier-coller :`,
            "```",
            plain.slice(0, 1800),
            "```",
        ].join("\n"))
            .setColor(cfg.COLOR.WARNING)
            .setFooter({ text: `${cfg.BRAND.NAME} • Une fois envoyé, fais /refill-sent` });
        await staffChat.send({
            content: mentions.join(" ") || undefined,
            embeds: [embed],
            allowedMentions: { roles: mentions.length ? [roleDirectionId, roleModerateurId].filter((x) => !!x) : [] },
        });
    }
    await ensureOpenBatch(guild);
}
