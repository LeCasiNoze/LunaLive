// api/src/discord/casino_tickets.ts
// Système de tickets offre casino — pipeline complète
import { ChannelType, PermissionFlagsBits, } from "discord.js";
import { pool } from "../db.js";
import { getActiveOffers, getOfferById } from "./casino_offers.js";
import { refreshStatsMessage } from "./stats_fabio.js";
import { FABIO_GUILD_ID, FABIO_CAT_TICKETS_ID, FABIO_LOGS_TICKETS_ID, FABIO_ROLE_MOD_ID, FABIO_ROLE_CHEF_ID, CID_FABIO_TICKET_TYPE, CID_FABIO_TICKET_OFFER, CID_FABIO_TICKET_MODAL, CID_FABIO_TICKET_APPROVE, CID_FABIO_TICKET_REJECT, CID_FABIO_TICKET_REJECT_MODAL, CID_FABIO_TICKET_REIMBURSE, CID_FABIO_TICKET_VIREMENT, CID_FABIO_TICKET_APPEAL, CID_FABIO_TICKET_APPEAL_ACK, } from "./constants.js";
// ─── ID du channel vérif-tickets (MODÉRATEURS) ────────────────────────────────
const VERIF_TICKETS_CH = "1493585231805157416";
// ID du channel preuve-dépôt-giveaway
const PREUVE_DEPOT_CH = "1431607831206957116";
// ID du channel panel ticket (renommé aide → réclamation)
const PANEL_CH = "1469707812081766463";
// ─── Regex validation wallets ─────────────────────────────────────────────────
const WALLET_PATTERNS = {
    USDT_TRC20: /^T[A-Za-z1-9]{33}$/,
    ETH: /^0x[a-fA-F0-9]{40}$/,
    USDC: /^0x[a-fA-F0-9]{40}$/,
    BTC: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/,
    SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    BNB: /^0x[a-fA-F0-9]{40}$/,
    LTC: /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/,
};
function validateWallet(address, crypto) {
    const key = crypto.toUpperCase().replace("-", "_");
    const pattern = WALLET_PATTERNS[key] ?? WALLET_PATTERNS[`${key}_TRC20`];
    if (!pattern) {
        // Crypto inconnue : format générique (alphanum 26-64 chars)
        return /^[a-zA-Z0-9]{26,64}$/.test(address.trim());
    }
    return pattern.test(address.trim());
}
function extractWalletFromMessage(text) {
    // Cherche tous les patterns connus
    for (const pat of Object.values(WALLET_PATTERNS)) {
        const m = text.match(pat);
        if (m)
            return m[0];
    }
    return null;
}
function extractUrlFromMessage(text) {
    const m = text.match(/https?:\/\/[^\s]+/);
    return m ? m[0] : null;
}
function extractCryptoFromMessage(text) {
    const cryptos = ["USDT", "ETH", "USDC", "BTC", "SOL", "BNB", "LTC", "TRX", "XRP", "MATIC"];
    for (const c of cryptos) {
        if (text.toUpperCase().includes(c))
            return c;
    }
    return null;
}
function extractNetworkFromMessage(text) {
    const networks = ["ERC-20", "TRC-20", "BEP-20", "SOL", "POLYGON", "ARBITRUM", "OPTIMISM"];
    for (const n of networks) {
        if (text.toUpperCase().includes(n.toUpperCase()))
            return n;
    }
    return null;
}
// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getTicketByChannel(channelId) {
    const r = await pool.query(`SELECT * FROM discord_casino_tickets WHERE channel_id = $1 LIMIT 1`, [channelId]);
    return r.rows[0] ?? null;
}
async function getTicketById(id) {
    const r = await pool.query(`SELECT * FROM discord_casino_tickets WHERE id = $1 LIMIT 1`, [id]);
    return r.rows[0] ?? null;
}
async function updateTicket(id, data) {
    const keys = Object.keys(data);
    if (!keys.length)
        return;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const vals = keys.map((k) => data[k]);
    await pool.query(`UPDATE discord_casino_tickets SET ${sets} WHERE id = $1`, [id, ...vals]);
}
async function checkDuplicates(casino, email, discordId) {
    const [emailRes, discordRes] = await Promise.all([
        pool.query(`SELECT 1 FROM discord_casino_tickets WHERE casino=$1 AND casino_email=$2 AND status='approved' LIMIT 1`, [casino, email.toLowerCase()]),
        pool.query(`SELECT 1 FROM discord_casino_tickets WHERE casino=$1 AND discord_user_id=$2 AND status='approved' LIMIT 1`, [casino, discordId]),
    ]);
    return {
        dup_email: (emailRes.rowCount ?? 0) > 0,
        dup_discord: (discordRes.rowCount ?? 0) > 0,
    };
}
// ─── Helpers Discord ──────────────────────────────────────────────────────────
function isMod(member) {
    return (member.roles.cache.has(FABIO_ROLE_MOD_ID) ||
        member.roles.cache.has(FABIO_ROLE_CHEF_ID));
}
function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 20);
}
function fmtDupWarning(t) {
    const lines = [];
    if (t.dup_email)
        lines.push("⚠️ **DOUBLON EMAIL** — cet email a déjà un ticket approuvé sur ce casino.");
    if (t.dup_discord)
        lines.push("⚠️ **DOUBLON DISCORD** — cet utilisateur a déjà un ticket approuvé sur ce casino.");
    return lines.join("\n");
}
// ─── Panel ────────────────────────────────────────────────────────────────────
export async function ensureTicketPanel(client, ctx) {
    try {
        // Renommer le channel aide → réclamation
        const ch = await client.channels.fetch(PANEL_CH).catch(() => null);
        if (!ch)
            return;
        if (!ch.name.includes("réclam")) {
            await ch.setName("〈🎫〉｜réclamation").catch(() => { });
        }
        // Vérifier si le panel existe déjà
        const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
        const exists = msgs?.find((m) => m.author.id === client.user?.id && m.components.length > 0);
        if (exists)
            return;
        await ch.send({
            embeds: [{
                    title: "🎫 Réclamation & Support",
                    description: "Tu souhaites réclamer un remboursement suite à un dépôt casino ?\n\n" +
                        "Clique sur **🎰 Réclamer un remboursement** ci-dessous.\n\n" +
                        "Pour toute autre question, clique sur **❓ Autre problème**.",
                    color: 0x2F3136,
                    footer: { text: "Un modérateur traitera votre demande sous 48h." },
                }],
            components: [{
                    type: 1,
                    components: [
                        { type: 2, style: 3, custom_id: `${CID_FABIO_TICKET_TYPE}:offer`, label: "🎰 Réclamer un remboursement" },
                        { type: 2, style: 2, custom_id: `${CID_FABIO_TICKET_TYPE}:support`, label: "❓ Autre problème" },
                    ],
                }],
        });
        ctx.log("[casino_tickets] panel posted");
    }
    catch (e) {
        ctx.log(`[casino_tickets] ensureTicketPanel error: ${e?.message}`);
    }
}
// ─── Handler: bouton type ─────────────────────────────────────────────────────
export async function handleFabioTicketType(interaction) {
    const type = interaction.customId.split(":").pop(); // 'offer' | 'support'
    if (type === "support") {
        await interaction.reply({
            ephemeral: true,
            content: "Pour un autre problème, merci de décrire brièvement votre situation.\n" +
                "Un modérateur ouvrira un ticket manuellement. *(Fonctionnalité automatique bientôt disponible.)*",
        });
        return;
    }
    // Offre → afficher les offres actives
    const offers = await getActiveOffers(FABIO_GUILD_ID);
    if (!offers.length) {
        await interaction.reply({
            ephemeral: true,
            content: "❌ Aucune offre de remboursement n'est disponible pour le moment.",
        });
        return;
    }
    await interaction.reply({
        ephemeral: true,
        embeds: [{
                title: "🎰 Choisir une offre",
                description: "Sélectionne l'offre pour laquelle tu fais une réclamation :",
                color: 0x2F3136,
            }],
        components: [{
                type: 1,
                components: [{
                        type: 3, // SELECT_MENU
                        custom_id: CID_FABIO_TICKET_OFFER,
                        placeholder: "Sélectionner une offre...",
                        options: offers.map((o) => ({
                            label: o.label,
                            value: o.id,
                            description: `Dépôt min: ${o.min_deposit}€ → Remboursement: ${o.reimburse_amt}€`,
                            emoji: { name: "💎" },
                        })),
                    }],
            }],
    });
}
// ─── Handler: select offre → modal ───────────────────────────────────────────
export async function handleFabioOfferSelect(interaction) {
    const offerId = interaction.values[0];
    const offer = await getOfferById(offerId);
    if (!offer) {
        await interaction.reply({ ephemeral: true, content: "❌ Offre introuvable." });
        return;
    }
    await interaction.showModal({
        title: `Réclamation — ${offer.casino.charAt(0).toUpperCase() + offer.casino.slice(1)}`,
        custom_id: `${CID_FABIO_TICKET_MODAL}${offerId}`,
        components: [
            { type: 1, components: [{ type: 4, custom_id: "email", label: `Email du compte ${offer.casino}`, style: 1, required: true, placeholder: "votre@email.com", max_length: 100 }] },
            { type: 1, components: [{ type: 4, custom_id: "pseudo", label: `Pseudo sur ${offer.casino}`, style: 1, required: true, max_length: 80 }] },
            { type: 1, components: [{ type: 4, custom_id: "amount", label: `Montant déposé en € (min: ${offer.min_deposit}€)`, style: 1, required: true, placeholder: `Ex: ${offer.min_deposit}`, max_length: 10 }] },
        ],
    });
}
// ─── Handler: modal submit → créer ticket ────────────────────────────────────
export async function handleFabioTicketModal(interaction, offerId, ctx) {
    const offer = await getOfferById(offerId);
    if (!offer) {
        await interaction.reply({ ephemeral: true, content: "❌ Offre introuvable." });
        return;
    }
    const email = interaction.fields.getTextInputValue("email").trim().toLowerCase();
    const pseudo = interaction.fields.getTextInputValue("pseudo").trim();
    const amountStr = interaction.fields.getTextInputValue("amount").trim();
    const amount = parseInt(amountStr.replace(/[^0-9]/g, ""));
    if (isNaN(amount) || amount < offer.min_deposit) {
        await interaction.reply({
            ephemeral: true,
            content: `❌ Le montant minimum pour cette offre est de **${offer.min_deposit}€**.\nMontant saisi : ${amountStr}`,
        });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const user = interaction.user;
    // Vérifier doublon ticket en cours
    const existing = await pool.query(`SELECT 1 FROM discord_casino_tickets WHERE discord_user_id=$1 AND casino=$2 AND status='pending' LIMIT 1`, [user.id, offer.casino]);
    if ((existing.rowCount ?? 0) > 0) {
        await interaction.editReply({ content: "❌ Tu as déjà un ticket en cours pour ce casino." });
        return;
    }
    // Anti-fraude
    const dups = await checkDuplicates(offer.casino, email, user.id);
    // Récupère le displayname (pseudo serveur > pseudo global > username)
    const displayName = interaction.member?.displayName ?? user.globalName ?? user.username;
    // Créer channel privé
    const channelName = `offre-${slugify(offer.casino)}-${slugify(displayName)}`;
    const everyoneId = guild.roles.everyone.id;
    let ticketChannel;
    try {
        ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: FABIO_CAT_TICKETS_ID,
            permissionOverwrites: [
                { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
                { id: FABIO_ROLE_MOD_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
                { id: FABIO_ROLE_CHEF_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
            ],
        });
    }
    catch (e) {
        ctx.log(`[casino_tickets] channel create error: ${e?.message}`);
        await interaction.editReply({ content: "❌ Impossible de créer le ticket. Contacte un modérateur." });
        return;
    }
    // Insérer en DB
    const r = await pool.query(`INSERT INTO discord_casino_tickets
       (guild_id, channel_id, offer_id, casino, discord_user_id, discord_username,
        casino_email, casino_pseudo, deposit_amount, dup_email, dup_discord, state,
        reimburse_type, reimburse_amount, close_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_screenshot',$12,$13, now() + interval '2 hours')
     RETURNING *`, [
        FABIO_GUILD_ID, ticketChannel.id, offerId, offer.casino,
        user.id, displayName, email, pseudo, amount,
        dups.dup_email, dups.dup_discord,
        offer.reimburse_type, offer.reimburse_amt,
    ]);
    const ticket = r.rows[0];
    // Message dans le channel ticket
    const dupWarn = fmtDupWarning(ticket);
    await ticketChannel.send({
        embeds: [{
                title: `📋 Réclamation — ${offer.label}`,
                description: `**${displayName}** — Bienvenue dans votre ticket.\n\n` +
                    (dupWarn ? `${dupWarn}\n\n` : "") +
                    `Merci d'**envoyer un screenshot de votre dépôt** dans ce salon.\n` +
                    `La capture doit montrer clairement **le montant et votre pseudo**.\n\n` +
                    `*Ne rien envoyer d'autre avant le screenshot.*`,
                color: dupWarn ? 0xFF4444 : 0x5865F2,
                footer: { text: `Ticket ID: ${ticket.id}` },
            }],
        content: `<@${user.id}>`,
    });
    await interaction.editReply({
        content: `✅ Votre ticket a été créé ! Rendez-vous dans <#${ticketChannel.id}> et envoyez votre screenshot.`,
    });
}
// ─── Handler: message dans un channel ticket ──────────────────────────────────
export async function handleFabioTicketMessage(message, ctx) {
    if (message.author.bot)
        return;
    const ticket = await getTicketByChannel(message.channelId);
    if (!ticket)
        return;
    const isOwner = message.author.id === ticket.discord_user_id;
    const member = message.member;
    const mod = member ? isMod(member) : false;
    // ── État: pending_screenshot ──────────────────────────────────────────────
    if (ticket.state === "pending_screenshot" && isOwner) {
        const hasImage = message.attachments.some((a) => a.contentType?.startsWith("image/"));
        if (!hasImage) {
            await message.reply("⚠️ Merci d'envoyer **uniquement un screenshot** (image) de votre dépôt.");
            return;
        }
        const screenshotUrl = message.attachments.first()?.url ?? "";
        await updateTicket(ticket.id, { deposit_screenshot_url: screenshotUrl, state: "pending_decision" });
        // Message dans le channel
        await message.channel.send({
            embeds: [{
                    title: "✅ Screenshot reçu — Dossier en cours d'examen",
                    description: `Votre dossier est en cours de vérification par notre équipe.\n` +
                        `Vous serez contacté dans ce salon sous **48h maximum**.\n\n` +
                        `Merci de patienter sans envoyer d'autres messages.`,
                    color: 0x57F287,
                }],
        });
        // Sync message vérif-tickets
        await syncVerifMessage(message.client, ticket.id, ctx);
        return;
    }
    // ── État: pending_wallet (remboursement wallet) ───────────────────────────
    if (ticket.state === "pending_wallet" && isOwner) {
        const text = message.content.trim();
        const wallet = extractWalletFromMessage(text) || text;
        const crypto = ticket.reimburse_type === "wallet" ? (await getOfferById(ticket.offer_id))?.crypto ?? "USDT" : "USDT";
        const valid = validateWallet(wallet, crypto);
        if (!valid) {
            await message.reply(`⚠️ Cette adresse ne semble pas être une adresse **${crypto}** valide.\n` +
                `Vérifiez et renvoyez uniquement l'adresse, sans autre texte.`);
            return;
        }
        await updateTicket(ticket.id, { reimburse_address: wallet, state: "pending_virement" });
        await message.channel.send({
            embeds: [{
                    title: "✅ Adresse reçue",
                    description: `\`${wallet}\`\n\nVotre adresse ${crypto} est enregistrée. Le virement va être traité.`,
                    color: 0x57F287,
                }],
        });
        // Sync message vérif-tickets
        await syncVerifMessage(message.client, ticket.id, ctx);
        return;
    }
    // ── État: pending_casino_url ──────────────────────────────────────────────
    if (ticket.state === "pending_casino_url" && isOwner) {
        const text = message.content.trim();
        const url = extractUrlFromMessage(text);
        const crypto = extractCryptoFromMessage(text);
        const network = extractNetworkFromMessage(text);
        if (!url) {
            await message.reply("⚠️ Je n'ai pas reconnu l'URL de votre wallet casino.\n" +
                "Envoyez le lien direct de votre adresse (ex: `https://razed.com/wallet/0x...`).");
            return;
        }
        await updateTicket(ticket.id, {
            casino_wallet_url: url,
            casino_wallet_crypto: crypto,
            casino_wallet_network: network,
            state: "pending_casino_screenshot",
        });
        await message.channel.send({
            embeds: [{
                    title: "✅ URL reçue",
                    description: `URL : \`${url}\`\n` +
                        (crypto ? `Crypto : **${crypto}**\n` : "") +
                        (network ? `Réseau : **${network}**\n` : "") +
                        "\nMerci d'envoyer maintenant un **screenshot de ce wallet** pour vérification.",
                    color: 0x57F287,
                }],
        });
        return;
    }
    // ── État: pending_casino_screenshot ──────────────────────────────────────
    if (ticket.state === "pending_casino_screenshot" && isOwner) {
        const hasImage = message.attachments.some((a) => a.contentType?.startsWith("image/"));
        if (!hasImage) {
            await message.reply("⚠️ Merci d'envoyer un **screenshot** de votre wallet casino.");
            return;
        }
        await updateTicket(ticket.id, { state: "pending_virement" });
        await message.channel.send({
            embeds: [{
                    title: "✅ Screenshot wallet reçu",
                    description: "Tout est en ordre. Le virement va être traité par notre équipe.",
                    color: 0x57F287,
                }],
        });
        await syncVerifMessage(message.client, ticket.id, ctx);
        return;
    }
}
// ─── Handler: bouton Approuver ────────────────────────────────────────────────
export async function handleFabioApprove(interaction, ticketId) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    const ticket = await getTicketById(ticketId);
    if (!ticket || ticket.state !== "pending_decision") {
        await interaction.reply({ ephemeral: true, content: "❌ Ce ticket n'est plus en attente de décision." });
        return;
    }
    // Choisir méthode de remboursement
    await interaction.reply({
        ephemeral: true,
        embeds: [{ title: "💳 Méthode de remboursement", description: "Comment vas-tu rembourser cet utilisateur ?", color: 0x2F3136 }],
        components: [{
                type: 1,
                components: [{
                        type: 3,
                        custom_id: `${CID_FABIO_TICKET_REIMBURSE}${ticketId}`,
                        placeholder: "Sélectionner la méthode...",
                        options: [
                            { label: "💳 Wallet personnel (crypto)", value: "wallet", description: `Remboursement en ${ticket.reimburse_type === "wallet" ? "crypto" : "crypto"}` },
                            { label: "🎰 Crédit sur le casino", value: "casino", description: "Remboursement direct sur le compte casino" },
                        ],
                    }],
            }],
    });
}
// ─── Handler: select méthode remboursement ────────────────────────────────────
export async function handleFabioReimburseSelect(interaction, ticketId, ctx) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    const method = interaction.values[0];
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
        await interaction.reply({ ephemeral: true, content: "❌ Ticket introuvable." });
        return;
    }
    const offer = await getOfferById(ticket.offer_id);
    const crypto = "USDC"; // Toujours USDC pour les wallets privés
    await updateTicket(ticketId, {
        status: "approved",
        moderator_id: interaction.user.id,
        moderator_username: interaction.user.username,
        decided_at: new Date(),
        reimburse_method: method,
        state: method === "wallet" ? "pending_wallet" : "pending_casino_url",
    });
    await interaction.update({ content: "✅ Validé.", components: [] });
    // Sync message vérif-tickets (méthode choisie, nouveau statut)
    await syncVerifMessage(interaction.client, ticketId, ctx);
    // Message dans le channel ticket
    const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null);
    if (ch) {
        if (method === "wallet") {
            await ch.send({
                embeds: [{
                        title: "✅ Dossier validé !",
                        description: `Félicitations <@${ticket.discord_user_id}> !\n\n` +
                            `Pour recevoir votre remboursement de **${ticket.reimburse_amount ?? offer?.reimburse_amt}€** en **${crypto}**, ` +
                            `envoyez votre adresse **${crypto}** dans ce salon.\n\n` +
                            `*Assurez-vous d'envoyer la bonne adresse — les transactions crypto sont irréversibles.*`,
                        color: 0x57F287,
                    }],
                content: `<@${ticket.discord_user_id}>`,
            });
        }
        else {
            await ch.send({
                embeds: [{
                        title: "✅ Dossier validé !",
                        description: `Félicitations <@${ticket.discord_user_id}> !\n\n` +
                            `Pour recevoir votre remboursement directement sur votre compte **${ticket.casino}**, ` +
                            `envoyez dans ce salon :\n\n` +
                            `1️⃣ **L'URL de votre wallet** (ex: \`https://${ticket.casino}.com/wallet/0x...\`)\n` +
                            `2️⃣ **La crypto souhaitée** (ETH, USDC, SOL…) et le réseau si applicable (ERC-20, TRC-20…)\n\n` +
                            `*Envoyez ces informations en un seul message si possible.*`,
                        color: 0x57F287,
                    }],
                content: `<@${ticket.discord_user_id}>`,
            });
        }
    }
}
// ─── Handler: bouton Refuser ──────────────────────────────────────────────────
export async function handleFabioReject(interaction, ticketId) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    await interaction.showModal({
        title: "Motif du refus",
        custom_id: `${CID_FABIO_TICKET_REJECT_MODAL}${ticketId}`,
        components: [{
                type: 1,
                components: [{
                        type: 4,
                        custom_id: "reason",
                        label: "Motif (sera communiqué à l'utilisateur)",
                        style: 2,
                        required: true,
                        max_length: 500,
                        placeholder: "Ex: Dépôt non conforme, double compte détecté...",
                    }],
            }],
    });
}
// ─── Handler: modal refus submit ─────────────────────────────────────────────
export async function handleFabioRejectModal(interaction, ticketId, ctx) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    const reason = interaction.fields.getTextInputValue("reason").trim();
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
        await interaction.reply({ ephemeral: true, content: "❌ Ticket introuvable." });
        return;
    }
    await updateTicket(ticketId, {
        status: "rejected",
        state: "refused",
        reject_reason: reason,
        moderator_id: interaction.user.id,
        moderator_username: interaction.user.username,
        decided_at: new Date(),
        close_at: new Date(Date.now() + 48 * 3600 * 1000), // 48h pour appel
    });
    await interaction.reply({ ephemeral: true, content: "✅ Refus enregistré." });
    const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null);
    if (ch) {
        await ch.send({
            embeds: [{
                    title: "❌ Dossier refusé",
                    description: `<@${ticket.discord_user_id}>\n\n` +
                        `Votre demande de remboursement a été refusée.\n\n` +
                        `**Motif :** ${reason}\n\n` +
                        `Si vous estimez que cette décision est une erreur, vous pouvez faire appel ci-dessous.\n` +
                        `*Sans action de votre part, ce ticket sera fermé dans 48h.*`,
                    color: 0xED4245,
                }],
            content: `<@${ticket.discord_user_id}>`,
            components: [{
                    type: 1,
                    components: [{
                            type: 2, style: 4,
                            custom_id: `${CID_FABIO_TICKET_APPEAL}${ticketId}`,
                            label: "📣 Faire appel",
                        }],
                }],
        });
    }
    // Sync message vérif-tickets (motif refus, boutons retirés)
    await syncVerifMessage(interaction.client, ticketId, ctx);
    // Rafraîchir les stats
    refreshStatsMessage(interaction.client, ctx).catch(() => { });
}
// ─── Handler: bouton Appel ────────────────────────────────────────────────────
export async function handleFabioAppeal(interaction, ticketId, ctx) {
    if (interaction.user.id !== (await getTicketById(ticketId))?.discord_user_id) {
        await interaction.reply({ ephemeral: true, content: "❌ Seul l'auteur du ticket peut faire appel." });
        return;
    }
    const ticket = await getTicketById(ticketId);
    if (!ticket || ticket.state !== "refused") {
        await interaction.reply({ ephemeral: true, content: "❌ Appel non disponible." });
        return;
    }
    await updateTicket(ticketId, { state: "appeal_pending" });
    await interaction.reply({ ephemeral: true, content: "✅ Votre appel a été transmis. Nous vous répondons sous peu." });
    // Mettre à jour le message vérif-tickets → statut + boutons décision appel
    await syncVerifMessage(interaction.client, ticketId, ctx);
}
// ─── Handler: décision appel ──────────────────────────────────────────────────
export async function handleFabioAppealAck(interaction, ticketId, decision, ctx) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
        await interaction.reply({ ephemeral: true, content: "❌ Ticket introuvable." });
        return;
    }
    const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null);
    if (decision === "accept") {
        await updateTicket(ticketId, { state: "pending_decision", status: "pending", close_at: null });
        await interaction.update({ content: "✅ Appel accepté — ticket rouvert.", components: [] });
        if (ch) {
            await ch.send({
                embeds: [{
                        title: "✅ Appel accepté",
                        description: `<@${ticket.discord_user_id}> Votre appel a été accepté.\n` +
                            `Un modérateur va vous recontacter dans ce salon sous peu.`,
                        color: 0x57F287,
                    }],
                content: `<@${ticket.discord_user_id}>`,
            });
        }
        // Remettre les boutons Valider/Refuser dans vérif-tickets
        await syncVerifMessage(interaction.client, ticketId, ctx);
    }
    else {
        await interaction.update({ content: "✅ Appel rejeté — fermeture du ticket.", components: [] });
        if (ch) {
            await ch.send({
                embeds: [{
                        title: "❌ Appel refusé — Ticket fermé",
                        description: `<@${ticket.discord_user_id}> Votre appel a été refusé.\n` +
                            `Ce dossier est maintenant clôturé.\n\n` +
                            `Si vous avez d'autres questions, ouvrez un ticket via <#${PANEL_CH}>.`,
                        color: 0xED4245,
                    }],
                content: `<@${ticket.discord_user_id}>`,
            });
            // Attendre 5s pour que l'user lise le message, puis supprimer
            await new Promise((r) => setTimeout(r, 5000));
            await ch.delete("Appel refusé — fermeture automatique").catch(() => { });
        }
        await updateTicket(ticketId, { state: "closed", closed_at: new Date() });
        // Retirer les boutons du message vérif-tickets
        await syncVerifMessage(interaction.client, ticketId, ctx);
        await postClosingLog(interaction.client, { ...ticket, status: "rejected" }, "rejected", ctx);
    }
}
// ─── Handler: bouton Virement envoyé ─────────────────────────────────────────
export async function handleFabioVirement(interaction, ticketId, ctx) {
    const member = interaction.member;
    if (!isMod(member)) {
        await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
        return;
    }
    const ticket = await getTicketById(ticketId);
    if (!ticket || ticket.state !== "pending_virement") {
        await interaction.reply({ ephemeral: true, content: "❌ Ce ticket n'est pas en attente de virement." });
        return;
    }
    const offer = await getOfferById(ticket.offer_id);
    const crypto = offer?.crypto ?? "USDT";
    await updateTicket(ticketId, {
        state: "closed",
        status: "approved",
        close_at: new Date(Date.now() + 24 * 3600 * 1000),
    });
    // ── Frais de société (expenses) ───────────────────────────────────────────
    const reimbAmt = ticket.reimburse_amount ?? offer?.reimburse_amt ?? 0;
    await pool.query(`INSERT INTO expenses (description, category, amount, date, is_recurring, source_type)
     VALUES ($1, 'offres', $2, CURRENT_DATE, false, 'manual')`, [
        `Remboursement ${ticket.casino} — ${ticket.discord_username} (ticket ${ticket.id.slice(0, 8)})`,
        reimbAmt,
    ]).catch((e) => ctx.log(`[casino_tickets] expense insert failed: ${e?.message}`));
    // ── Attribution rôle casino ───────────────────────────────────────────────
    if (offer?.discord_role_id) {
        try {
            const guild = await interaction.client.guilds.fetch(FABIO_GUILD_ID).catch(() => null);
            const member = await guild?.members.fetch(ticket.discord_user_id).catch(() => null);
            if (member && !member.roles.cache.has(offer.discord_role_id)) {
                await member.roles.add(offer.discord_role_id, `Remboursement ${ticket.casino} validé`);
            }
        }
        catch (e) {
            ctx.log(`[casino_tickets] role add failed: ${e?.message}`);
        }
    }
    await interaction.update({ content: "✅ Virement marqué comme envoyé.", components: [] });
    const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null);
    if (ch) {
        await ch.send({
            embeds: [{
                    title: "🎉 Remboursement envoyé !",
                    description: `<@${ticket.discord_user_id}>\n\n` +
                        `Votre remboursement de **${ticket.reimburse_amount ?? offer?.reimburse_amt}€** ` +
                        (ticket.reimburse_method === "wallet" ? `en **${crypto}** ` : `sur votre compte **${ticket.casino}** `) +
                        `est en route. Vous devriez le recevoir sous peu.\n\n` +
                        `📸 N'oubliez pas de partager votre preuve de dépôt dans <#${PREUVE_DEPOT_CH}> !\n\n` +
                        `Merci pour votre confiance et bonne chance sur les tables ! 🎰\n` +
                        `*Ce ticket sera fermé automatiquement dans 24h.*`,
                    color: 0x57F287,
                }],
            content: `<@${ticket.discord_user_id}>`,
        });
    }
    // Retirer bouton virement, marquer résolu dans vérif-tickets
    await syncVerifMessage(interaction.client, ticketId, ctx);
    // Log dans logs-tickets
    await postClosingLog(interaction.client, ticket, "approved", ctx);
    // Rafraîchir les stats
    refreshStatsMessage(interaction.client, ctx).catch(() => { });
}
// ─── Vérif-tickets : embed dynamique ─────────────────────────────────────────
function buildVerifEmbed(ticket) {
    const dupWarn = fmtDupWarning(ticket);
    const STATE_LABELS = {
        pending_screenshot: "⏳ En attente de screenshot",
        pending_decision: "🔍 En attente de décision",
        pending_wallet: "💳 En attente d'adresse wallet",
        pending_casino_url: "🔗 En attente d'URL casino",
        pending_casino_screenshot: "📸 En attente de screenshot wallet",
        pending_virement: "💸 En attente de virement",
        refused: "❌ Refusé",
        appeal_pending: "🔔 Appel en cours",
        closed: ticket.status === "approved" ? "✅ Résolu" : "🔒 Clôturé",
    };
    let desc = `👤 **${ticket.discord_username}** (<@${ticket.discord_user_id}>) \`${ticket.discord_user_id}\`\n` +
        `📧 **Email casino :** \`${ticket.casino_email}\`\n` +
        `🎭 **Pseudo casino :** \`${ticket.casino_pseudo}\`\n` +
        `💶 **Montant déclaré :** **${ticket.deposit_amount}€**\n` +
        `🔗 Ticket : <#${ticket.channel_id}>\n` +
        `📊 **Statut :** ${STATE_LABELS[ticket.state] ?? ticket.state}`;
    if (dupWarn)
        desc += `\n\n${dupWarn}`;
    if (ticket.moderator_username) {
        desc += `\n\n🛡️ **Mod :** ${ticket.moderator_username}`;
    }
    if (ticket.reimburse_method) {
        desc += `\n💳 **Méthode :** ${ticket.reimburse_method === "wallet" ? "Wallet USDC" : "Crédit casino"}`;
    }
    if (ticket.reimburse_address) {
        desc += `\n📬 **Adresse wallet :** \`${ticket.reimburse_address}\``;
    }
    if (ticket.casino_wallet_url) {
        desc += `\n🔗 **URL casino wallet :** \`${ticket.casino_wallet_url}\``;
        if (ticket.casino_wallet_crypto)
            desc += ` (${ticket.casino_wallet_crypto})`;
    }
    if (ticket.reject_reason) {
        desc += `\n\n❌ **Motif refus :** ${ticket.reject_reason}`;
    }
    const color = ticket.status === "approved" ? 0x57F287 :
        ticket.status === "rejected" ? 0xED4245 :
            (ticket.dup_email || ticket.dup_discord) ? 0xFF4444 : 0x5865F2;
    return {
        title: `🎫 Dossier — ${ticket.casino.charAt(0).toUpperCase() + ticket.casino.slice(1)}`,
        description: desc.slice(0, 4096),
        ...(ticket.deposit_screenshot_url ? { image: { url: ticket.deposit_screenshot_url } } : {}),
        color,
        footer: { text: `Ticket ID: ${ticket.id}` },
        timestamp: new Date().toISOString(),
    };
}
function buildVerifComponents(ticket) {
    switch (ticket.state) {
        case "pending_decision":
            return [{
                    type: 1,
                    components: [
                        { type: 2, style: 3, custom_id: `${CID_FABIO_TICKET_APPROVE}${ticket.id}`, label: "✅ Valider" },
                        { type: 2, style: 4, custom_id: `${CID_FABIO_TICKET_REJECT}${ticket.id}`, label: "❌ Refuser" },
                    ],
                }];
        case "pending_virement":
            return [{
                    type: 1,
                    components: [
                        { type: 2, style: 3, custom_id: `${CID_FABIO_TICKET_VIREMENT}${ticket.id}`, label: "✅ Virement envoyé" },
                    ],
                }];
        case "appeal_pending":
            return [{
                    type: 1,
                    components: [
                        { type: 2, style: 3, custom_id: `${CID_FABIO_TICKET_APPEAL_ACK}${ticket.id}:accept`, label: "✅ Accepter l'appel" },
                        { type: 2, style: 4, custom_id: `${CID_FABIO_TICKET_APPEAL_ACK}${ticket.id}:reject`, label: "❌ Rejeter l'appel" },
                    ],
                }];
        default:
            return []; // closed, refused, autres → aucun bouton
    }
}
// ─── Sync unique message vérif-tickets ───────────────────────────────────────
async function syncVerifMessage(client, ticketId, ctx) {
    try {
        const ticket = await getTicketById(ticketId);
        if (!ticket)
            return;
        const ch = await client.channels.fetch(VERIF_TICKETS_CH).catch(() => null);
        if (!ch)
            return;
        const embed = buildVerifEmbed(ticket);
        const components = buildVerifComponents(ticket);
        if (ticket.verif_msg_id) {
            const msg = await ch.messages.fetch(ticket.verif_msg_id).catch(() => null);
            if (msg) {
                await msg.edit({ embeds: [embed], components });
                return;
            }
        }
        // Pas encore de message → en créer un (screenshot initial)
        const msg = await ch.send({
            embeds: [embed],
            content: ticket.state === "pending_decision" ? `<@&${FABIO_ROLE_MOD_ID}>` : undefined,
            components,
        });
        await updateTicket(ticket.id, { verif_msg_id: msg.id });
    }
    catch (e) {
        ctx.log(`[casino_tickets] syncVerifMessage error: ${e?.message}`);
    }
}
// ─── Log fermeture dans logs-tickets ─────────────────────────────────────────
async function postClosingLog(client, ticket, finalStatus, ctx) {
    try {
        const ch = await client.channels.fetch(FABIO_LOGS_TICKETS_ID).catch(() => null);
        if (!ch)
            return;
        const statusEmoji = finalStatus === "approved" ? "✅ APPROUVÉ" : "❌ REFUSÉ";
        await ch.send({
            embeds: [{
                    title: `📋 Ticket fermé — ${ticket.casino}`,
                    description: `👤 **${ticket.discord_username}** (<@${ticket.discord_user_id}>)\n` +
                        `📧 Email : \`${ticket.casino_email}\`\n` +
                        `🎭 Pseudo : \`${ticket.casino_pseudo}\`\n` +
                        `💶 Montant : **${ticket.deposit_amount}€**\n` +
                        `💳 Méthode : ${ticket.reimburse_method ?? "—"}\n` +
                        `📊 Statut : **${statusEmoji}**\n` +
                        (ticket.reject_reason ? `📝 Motif : ${ticket.reject_reason}\n` : "") +
                        `🛡️ Mod : ${ticket.moderator_username ?? "—"}\n`,
                    color: finalStatus === "approved" ? 0x57F287 : 0xED4245,
                    footer: { text: `Ticket ID: ${ticket.id}` },
                    timestamp: new Date().toISOString(),
                }],
        });
    }
    catch (e) {
        ctx.log(`[casino_tickets] postClosingLog error: ${e?.message}`);
    }
}
// ─── Relances inactivité (pending_screenshot sans réponse) ───────────────────
export async function checkInactiveTickets(client, ctx) {
    try {
        // Tickets en attente de screenshot depuis plus de 10 min et jamais relancés
        const toRemind1 = await pool.query(`SELECT * FROM discord_casino_tickets
       WHERE state = 'pending_screenshot'
         AND COALESCE(reminder_count, 0) = 0
         AND created_at < now() - interval '10 minutes'
         AND created_at > now() - interval '2 hours'
       LIMIT 20`);
        for (const ticket of toRemind1.rows) {
            try {
                const ch = await client.channels.fetch(ticket.channel_id).catch(() => null);
                if (ch) {
                    await ch.send({
                        content: `<@${ticket.discord_user_id}>`,
                        embeds: [{
                                title: "⏰ On attend encore votre screenshot !",
                                description: `Votre ticket est ouvert mais nous n'avons pas encore reçu votre **capture d'écran de dépôt**.\n\n` +
                                    `Merci de l'envoyer dans ce salon dès que possible pour que votre demande puisse être traitée.\n\n` +
                                    `*Si vous n'avez plus besoin de ce ticket, vous pouvez simplement l'ignorer — il se fermera automatiquement.*`,
                                color: 0xFEE75C,
                            }],
                    });
                }
                await updateTicket(ticket.id, { reminder_count: 1 });
            }
            catch (e) {
                ctx.log(`[casino_tickets] remind1 ${ticket.id}: ${e?.message}`);
            }
        }
        // Deuxième relance après 1h
        const toRemind2 = await pool.query(`SELECT * FROM discord_casino_tickets
       WHERE state = 'pending_screenshot'
         AND COALESCE(reminder_count, 0) = 1
         AND created_at < now() - interval '1 hour'
         AND created_at > now() - interval '2 hours'
       LIMIT 20`);
        for (const ticket of toRemind2.rows) {
            try {
                const ch = await client.channels.fetch(ticket.channel_id).catch(() => null);
                if (ch) {
                    await ch.send({
                        content: `<@${ticket.discord_user_id}>`,
                        embeds: [{
                                title: "⚠️ Dernière relance — ticket bientôt fermé",
                                description: `Votre ticket sera **automatiquement fermé dans 1 heure** si nous ne recevons pas votre screenshot.\n\n` +
                                    `Pour valider votre remboursement, envoyez simplement une **capture d'écran de votre dépôt** dans ce salon.\n\n` +
                                    `*La capture doit afficher clairement le montant et votre pseudo casino.*`,
                                color: 0xED4245,
                            }],
                    });
                }
                await updateTicket(ticket.id, { reminder_count: 2 });
            }
            catch (e) {
                ctx.log(`[casino_tickets] remind2 ${ticket.id}: ${e?.message}`);
            }
        }
    }
    catch (e) {
        ctx.log(`[casino_tickets] checkInactiveTickets error: ${e?.message}`);
    }
}
// ─── Auto-close cron ──────────────────────────────────────────────────────────
export async function autoCloseExpiredTickets(client, ctx) {
    try {
        const r = await pool.query(`SELECT * FROM discord_casino_tickets
       WHERE state != 'closed'
         AND (
           (close_at IS NOT NULL AND close_at < now())
           OR
           (state = 'pending_screenshot' AND created_at < now() - interval '2 hours')
         )
       LIMIT 20`);
        for (const ticket of r.rows) {
            try {
                const isInactivity = ticket.state === "pending_screenshot";
                const ch = await client.channels.fetch(ticket.channel_id).catch(() => null);
                if (ch) {
                    await ch.send({
                        embeds: [{
                                title: isInactivity ? "🔒 Ticket fermé — inactivité" : "🔒 Ticket fermé",
                                description: isInactivity
                                    ? "Ce ticket est fermé en raison d'une **absence de réponse**. Il sera supprimé dans quelques instants."
                                    : "Ce ticket est maintenant archivé et sera supprimé dans quelques instants.",
                                color: 0x99AAB5,
                            }],
                    });
                    await new Promise((r) => setTimeout(r, 2000));
                    await ch.delete("Auto-close ticket expiré").catch(() => { });
                }
                // DM si fermeture pour inactivité
                if (isInactivity) {
                    try {
                        const user = await client.users.fetch(ticket.discord_user_id);
                        await user.send({
                            embeds: [{
                                    title: "🔒 Votre ticket a été fermé",
                                    description: `Bonjour **${ticket.discord_username}**,\n\n` +
                                        `Votre ticket de remboursement **${ticket.casino}** a été fermé automatiquement car aucun screenshot n'a été reçu dans les délais impartis.\n\n` +
                                        `Si vous souhaitez toujours bénéficier de l'offre, vous pouvez ouvrir un **nouveau ticket** à tout moment depuis le salon réclamation.\n\n` +
                                        `N'hésitez pas à revenir quand vous êtes prêt ! 🎰`,
                                    color: 0x99AAB5,
                                    footer: { text: "LunaBot — Système de remboursement" },
                                }],
                        });
                    }
                    catch {
                        // DMs désactivés — on ignore silencieusement
                    }
                }
                await updateTicket(ticket.id, { state: "closed", closed_at: new Date() });
                await syncVerifMessage(client, ticket.id, ctx);
                await postClosingLog(client, ticket, ticket.status, ctx);
            }
            catch (e) {
                ctx.log(`[casino_tickets] auto-close ${ticket.id} error: ${e?.message}`);
            }
        }
    }
    catch (e) {
        ctx.log(`[casino_tickets] autoCloseExpiredTickets error: ${e?.message}`);
    }
}
