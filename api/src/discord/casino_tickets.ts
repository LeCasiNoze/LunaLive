// api/src/discord/casino_tickets.ts
// Système de tickets offre casino — pipeline complète

import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type GuildMember,
  type Message,
  type TextChannel,
} from "discord.js";
import { pool } from "../db.js";
import { getActiveOffers, getOfferById, type CasinoOffer } from "./casino_offers.js";
import { type BotCtx } from "./utils.js";
import {
  FABIO_GUILD_ID,
  FABIO_CAT_TICKETS_ID,
  FABIO_LOGS_TICKETS_ID,
  FABIO_ROLE_MOD_ID,
  FABIO_ROLE_CHEF_ID,
  CID_FABIO_TICKET_OPEN,
  CID_FABIO_TICKET_TYPE,
  CID_FABIO_TICKET_OFFER,
  CID_FABIO_TICKET_MODAL,
  CID_FABIO_TICKET_APPROVE,
  CID_FABIO_TICKET_REJECT,
  CID_FABIO_TICKET_REJECT_MODAL,
  CID_FABIO_TICKET_REIMBURSE,
  CID_FABIO_TICKET_VIREMENT,
  CID_FABIO_TICKET_APPEAL,
  CID_FABIO_TICKET_APPEAL_ACK,
} from "./constants.js";

// ─── ID du channel vérif-tickets (MODÉRATEURS) ────────────────────────────────
const VERIF_TICKETS_CH = "1493585231805157416";
// ID du channel preuve-dépôt-giveaway
const PREUVE_DEPOT_CH  = "1431607831206957116";
// ID du channel panel ticket (renommé aide → réclamation)
const PANEL_CH         = "1469707812081766463";

// ─── Types ───────────────────────────────────────────────────────────────────
type TicketRow = {
  id: string;
  guild_id: string;
  channel_id: string;
  offer_id: string;
  casino: string;
  discord_user_id: string;
  discord_username: string;
  casino_email: string;
  casino_pseudo: string;
  deposit_amount: number;
  deposit_screenshot_url: string | null;
  state: string;
  status: string;
  reject_reason: string | null;
  moderator_id: string | null;
  moderator_username: string | null;
  verif_msg_id: string | null;
  reimburse_method: string | null;
  reimburse_type: string | null;
  reimburse_address: string | null;
  reimburse_amount: number | null;
  casino_wallet_url: string | null;
  casino_wallet_crypto: string | null;
  casino_wallet_network: string | null;
  dup_email: boolean;
  dup_wallet: boolean;
  dup_discord: boolean;
  close_at: Date | null;
  decided_at: Date | null;
};

// ─── Regex validation wallets ─────────────────────────────────────────────────
const WALLET_PATTERNS: Record<string, RegExp> = {
  USDT_TRC20: /^T[A-Za-z1-9]{33}$/,
  ETH:        /^0x[a-fA-F0-9]{40}$/,
  USDC:       /^0x[a-fA-F0-9]{40}$/,
  BTC:        /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/,
  SOL:        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  BNB:        /^0x[a-fA-F0-9]{40}$/,
  LTC:        /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/,
};

function validateWallet(address: string, crypto: string): boolean {
  const key = crypto.toUpperCase().replace("-", "_");
  const pattern = WALLET_PATTERNS[key] ?? WALLET_PATTERNS[`${key}_TRC20`];
  if (!pattern) {
    // Crypto inconnue : format générique (alphanum 26-64 chars)
    return /^[a-zA-Z0-9]{26,64}$/.test(address.trim());
  }
  return pattern.test(address.trim());
}

function extractWalletFromMessage(text: string): string | null {
  // Cherche tous les patterns connus
  for (const pat of Object.values(WALLET_PATTERNS)) {
    const m = text.match(pat);
    if (m) return m[0];
  }
  return null;
}

function extractUrlFromMessage(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : null;
}

function extractCryptoFromMessage(text: string): string | null {
  const cryptos = ["USDT", "ETH", "USDC", "BTC", "SOL", "BNB", "LTC", "TRX", "XRP", "MATIC"];
  for (const c of cryptos) {
    if (text.toUpperCase().includes(c)) return c;
  }
  return null;
}

function extractNetworkFromMessage(text: string): string | null {
  const networks = ["ERC-20", "TRC-20", "BEP-20", "SOL", "POLYGON", "ARBITRUM", "OPTIMISM"];
  for (const n of networks) {
    if (text.toUpperCase().includes(n.toUpperCase())) return n;
  }
  return null;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getTicketByChannel(channelId: string): Promise<TicketRow | null> {
  const r = await pool.query<TicketRow>(
    `SELECT * FROM discord_casino_tickets WHERE channel_id = $1 LIMIT 1`,
    [channelId]
  );
  return r.rows[0] ?? null;
}

async function getTicketById(id: string): Promise<TicketRow | null> {
  const r = await pool.query<TicketRow>(
    `SELECT * FROM discord_casino_tickets WHERE id = $1 LIMIT 1`,
    [id]
  );
  return r.rows[0] ?? null;
}

async function updateTicket(id: string, data: Partial<Record<string, any>>) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const vals = keys.map((k) => data[k]);
  await pool.query(
    `UPDATE discord_casino_tickets SET ${sets} WHERE id = $1`,
    [id, ...vals]
  );
}

async function checkDuplicates(casino: string, email: string, discordId: string): Promise<{
  dup_email: boolean; dup_discord: boolean;
}> {
  const [emailRes, discordRes] = await Promise.all([
    pool.query(
      `SELECT 1 FROM discord_casino_tickets WHERE casino=$1 AND casino_email=$2 AND status='approved' LIMIT 1`,
      [casino, email.toLowerCase()]
    ),
    pool.query(
      `SELECT 1 FROM discord_casino_tickets WHERE casino=$1 AND discord_user_id=$2 AND status='approved' LIMIT 1`,
      [casino, discordId]
    ),
  ]);
  return {
    dup_email: (emailRes.rowCount ?? 0) > 0,
    dup_discord: (discordRes.rowCount ?? 0) > 0,
  };
}

// ─── Helpers Discord ──────────────────────────────────────────────────────────
function isMod(member: GuildMember): boolean {
  return (
    member.roles.cache.has(FABIO_ROLE_MOD_ID) ||
    member.roles.cache.has(FABIO_ROLE_CHEF_ID)
  );
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 20);
}

function fmtDupWarning(t: TicketRow): string {
  const lines: string[] = [];
  if (t.dup_email)   lines.push("⚠️ **DOUBLON EMAIL** — cet email a déjà un ticket approuvé sur ce casino.");
  if (t.dup_discord) lines.push("⚠️ **DOUBLON DISCORD** — cet utilisateur a déjà un ticket approuvé sur ce casino.");
  return lines.join("\n");
}

// ─── Panel ────────────────────────────────────────────────────────────────────
export async function ensureTicketPanel(client: Client, ctx: BotCtx) {
  try {
    // Renommer le channel aide → réclamation
    const ch = await client.channels.fetch(PANEL_CH).catch(() => null) as TextChannel | null;
    if (!ch) return;

    if (!ch.name.includes("réclam")) {
      await ch.setName("〈🎫〉｜réclamation").catch(() => {});
    }

    // Vérifier si le panel existe déjà
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    const exists = msgs?.find(
      (m) => m.author.id === client.user?.id && m.components.length > 0
    );
    if (exists) return;

    await ch.send({
      embeds: [{
        title: "🎫 Réclamation & Support",
        description:
          "Tu souhaites réclamer un remboursement suite à un dépôt casino ?\n\n" +
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
  } catch (e: any) {
    ctx.log(`[casino_tickets] ensureTicketPanel error: ${e?.message}`);
  }
}

// ─── Handler: bouton type ─────────────────────────────────────────────────────
export async function handleFabioTicketType(interaction: any) {
  const type = interaction.customId.split(":").pop(); // 'offer' | 'support'

  if (type === "support") {
    await interaction.reply({
      ephemeral: true,
      content:
        "Pour un autre problème, merci de décrire brièvement votre situation.\n" +
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
export async function handleFabioOfferSelect(interaction: any) {
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
export async function handleFabioTicketModal(interaction: any, offerId: string, ctx: BotCtx) {
  const offer = await getOfferById(offerId);
  if (!offer) {
    await interaction.reply({ ephemeral: true, content: "❌ Offre introuvable." });
    return;
  }

  const email  = interaction.fields.getTextInputValue("email").trim().toLowerCase();
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
  const user  = interaction.user;

  // Vérifier doublon ticket en cours
  const existing = await pool.query(
    `SELECT 1 FROM discord_casino_tickets WHERE discord_user_id=$1 AND casino=$2 AND status='pending' LIMIT 1`,
    [user.id, offer.casino]
  );
  if ((existing.rowCount ?? 0) > 0) {
    await interaction.editReply({ content: "❌ Tu as déjà un ticket en cours pour ce casino." });
    return;
  }

  // Anti-fraude
  const dups = await checkDuplicates(offer.casino, email, user.id);

  // Créer channel privé
  const channelName = `offre-${slugify(offer.casino)}-${slugify(user.username)}`;
  const everyoneId = guild.roles.everyone.id;

  let ticketChannel: TextChannel;
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
    }) as TextChannel;
  } catch (e: any) {
    ctx.log(`[casino_tickets] channel create error: ${e?.message}`);
    await interaction.editReply({ content: "❌ Impossible de créer le ticket. Contacte un modérateur." });
    return;
  }

  // Insérer en DB
  const r = await pool.query<TicketRow>(
    `INSERT INTO discord_casino_tickets
       (guild_id, channel_id, offer_id, casino, discord_user_id, discord_username,
        casino_email, casino_pseudo, deposit_amount, dup_email, dup_discord, state,
        reimburse_type, reimburse_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_screenshot',$12,$13)
     RETURNING *`,
    [
      FABIO_GUILD_ID, ticketChannel.id, offerId, offer.casino,
      user.id, user.username, email, pseudo, amount,
      dups.dup_email, dups.dup_discord,
      offer.reimburse_type, offer.reimburse_amt,
    ]
  );
  const ticket = r.rows[0];

  // Message dans le channel ticket
  const dupWarn = fmtDupWarning(ticket);
  await ticketChannel.send({
    embeds: [{
      title: `📋 Réclamation — ${offer.label}`,
      description:
        `**@${user.username}** — Bienvenue dans votre ticket.\n\n` +
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
export async function handleFabioTicketMessage(message: Message, ctx: BotCtx) {
  if (message.author.bot) return;

  const ticket = await getTicketByChannel(message.channelId);
  if (!ticket) return;

  const isOwner = message.author.id === ticket.discord_user_id;
  const member  = message.member;
  const mod     = member ? isMod(member) : false;

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
    await (message.channel as TextChannel).send({
      embeds: [{
        title: "✅ Screenshot reçu — Dossier en cours d'examen",
        description:
          `Votre dossier est en cours de vérification par notre équipe.\n` +
          `Vous serez contacté dans ce salon sous **48h maximum**.\n\n` +
          `Merci de patienter sans envoyer d'autres messages.`,
        color: 0x57F287,
      }],
    });

    // Post dans vérif-tickets
    await postToVerif(message.client, ticket, screenshotUrl, ctx);
    return;
  }

  // ── État: pending_wallet (remboursement wallet) ───────────────────────────
  if (ticket.state === "pending_wallet" && isOwner) {
    const text    = message.content.trim();
    const wallet  = extractWalletFromMessage(text) || text;
    const crypto  = ticket.reimburse_type === "wallet" ? (await getOfferById(ticket.offer_id))?.crypto ?? "USDT" : "USDT";
    const valid   = validateWallet(wallet, crypto);

    if (!valid) {
      await message.reply(
        `⚠️ Cette adresse ne semble pas être une adresse **${crypto}** valide.\n` +
        `Vérifiez et renvoyez uniquement l'adresse, sans autre texte.`
      );
      return;
    }

    await updateTicket(ticket.id, { reimburse_address: wallet, state: "pending_virement" });
    await (message.channel as TextChannel).send({
      embeds: [{
        title: "✅ Adresse reçue",
        description: `\`${wallet}\`\n\nVotre adresse ${crypto} est enregistrée. Le virement va être traité.`,
        color: 0x57F287,
      }],
    });

    // Mise à jour verif-tickets
    await updateVerifMessage(message.client, ticket, `💳 Adresse ${crypto} reçue : \`${wallet}\``, ctx);
    return;
  }

  // ── État: pending_casino_url ──────────────────────────────────────────────
  if (ticket.state === "pending_casino_url" && isOwner) {
    const text    = message.content.trim();
    const url     = extractUrlFromMessage(text);
    const crypto  = extractCryptoFromMessage(text);
    const network = extractNetworkFromMessage(text);

    if (!url) {
      await message.reply(
        "⚠️ Je n'ai pas reconnu l'URL de votre wallet casino.\n" +
        "Envoyez le lien direct de votre adresse (ex: `https://razed.com/wallet/0x...`)."
      );
      return;
    }

    await updateTicket(ticket.id, {
      casino_wallet_url: url,
      casino_wallet_crypto: crypto,
      casino_wallet_network: network,
      state: "pending_casino_screenshot",
    });

    await (message.channel as TextChannel).send({
      embeds: [{
        title: "✅ URL reçue",
        description:
          `URL : \`${url}\`\n` +
          (crypto  ? `Crypto : **${crypto}**\n` : "") +
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
    await (message.channel as TextChannel).send({
      embeds: [{
        title: "✅ Screenshot wallet reçu",
        description: "Tout est en ordre. Le virement va être traité par notre équipe.",
        color: 0x57F287,
      }],
    });

    await updateVerifMessage(
      message.client, ticket,
      `🎰 Wallet casino reçu\nURL: \`${ticket.casino_wallet_url}\`\n` +
      (ticket.casino_wallet_crypto ? `Crypto: **${ticket.casino_wallet_crypto}**` : ""),
      ctx
    );
    return;
  }
}

// ─── Handler: bouton Approuver ────────────────────────────────────────────────
export async function handleFabioApprove(interaction: any, ticketId: string) {
  const member = interaction.member as GuildMember;
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
export async function handleFabioReimburseSelect(interaction: any, ticketId: string, ctx: BotCtx) {
  const member = interaction.member as GuildMember;
  if (!isMod(member)) {
    await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." });
    return;
  }

  const method = interaction.values[0] as "wallet" | "casino";
  const ticket = await getTicketById(ticketId);
  if (!ticket) { await interaction.reply({ ephemeral: true, content: "❌ Ticket introuvable." }); return; }

  const offer = await getOfferById(ticket.offer_id);
  const crypto = offer?.crypto ?? "USDT";

  await updateTicket(ticketId, {
    status: "approved",
    moderator_id: interaction.user.id,
    moderator_username: interaction.user.username,
    decided_at: new Date(),
    reimburse_method: method,
    state: method === "wallet" ? "pending_wallet" : "pending_casino_url",
  });

  await interaction.update({ content: "✅ Validé.", components: [] });

  // Message dans le channel ticket
  const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null) as TextChannel | null;
  if (ch) {
    if (method === "wallet") {
      await ch.send({
        embeds: [{
          title: "✅ Dossier validé !",
          description:
            `Félicitations <@${ticket.discord_user_id}> !\n\n` +
            `Pour recevoir votre remboursement de **${ticket.reimburse_amount ?? offer?.reimburse_amt}€** en **${crypto}**, ` +
            `envoyez votre adresse **${crypto}** dans ce salon.\n\n` +
            `*Assurez-vous d'envoyer la bonne adresse — les transactions crypto sont irréversibles.*`,
          color: 0x57F287,
        }],
        content: `<@${ticket.discord_user_id}>`,
      });
    } else {
      await ch.send({
        embeds: [{
          title: "✅ Dossier validé !",
          description:
            `Félicitations <@${ticket.discord_user_id}> !\n\n` +
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
export async function handleFabioReject(interaction: any, ticketId: string) {
  const member = interaction.member as GuildMember;
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
export async function handleFabioRejectModal(interaction: any, ticketId: string, ctx: BotCtx) {
  const member = interaction.member as GuildMember;
  if (!isMod(member)) { await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." }); return; }

  const reason = interaction.fields.getTextInputValue("reason").trim();
  const ticket = await getTicketById(ticketId);
  if (!ticket) { await interaction.reply({ ephemeral: true, content: "❌ Ticket introuvable." }); return; }

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

  const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null) as TextChannel | null;
  if (ch) {
    await ch.send({
      embeds: [{
        title: "❌ Dossier refusé",
        description:
          `<@${ticket.discord_user_id}>\n\n` +
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

  // Mettre à jour vérif-tickets
  await updateVerifMessage(interaction.client, ticket, `❌ Refusé par ${interaction.user.username}\nMotif: ${reason}`, ctx);
}

// ─── Handler: bouton Appel ────────────────────────────────────────────────────
export async function handleFabioAppeal(interaction: any, ticketId: string, ctx: BotCtx) {
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

  // Notif dans vérif-tickets
  const verifCh = await interaction.client.channels.fetch(VERIF_TICKETS_CH).catch(() => null) as TextChannel | null;
  if (verifCh) {
    await verifCh.send({
      embeds: [{
        title: "🔔 Demande d'appel",
        description:
          `**${ticket.discord_username}** (<@${ticket.discord_user_id}>) souhaite faire appel.\n\n` +
          `**Casino :** ${ticket.casino}\n` +
          `**Motif refus :** ${ticket.reject_reason ?? "—"}\n` +
          `**Ticket :** <#${ticket.channel_id}>`,
        color: 0xFEE75C,
      }],
      content: `<@&${FABIO_ROLE_MOD_ID}>`,
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: `${CID_FABIO_TICKET_APPEAL_ACK}${ticketId}:accept`, label: "✅ Accepter l'appel" },
          { type: 2, style: 4, custom_id: `${CID_FABIO_TICKET_APPEAL_ACK}${ticketId}:reject`, label: "❌ Rejeter l'appel" },
        ],
      }],
    });
  }
}

// ─── Handler: décision appel ──────────────────────────────────────────────────
export async function handleFabioAppealAck(interaction: any, ticketId: string, decision: "accept" | "reject", ctx: BotCtx) {
  const member = interaction.member as GuildMember;
  if (!isMod(member)) { await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." }); return; }

  const ticket = await getTicketById(ticketId);
  if (!ticket) { await interaction.reply({ ephemeral: true, content: "❌ Ticket introuvable." }); return; }

  const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null) as TextChannel | null;

  if (decision === "accept") {
    await updateTicket(ticketId, { state: "pending_decision", status: "pending", close_at: null });
    await interaction.update({ content: "✅ Appel accepté — ticket rouvert.", components: [] });

    if (ch) {
      await ch.send({
        embeds: [{
          title: "✅ Appel accepté",
          description:
            `<@${ticket.discord_user_id}> Votre appel a été accepté.\n` +
            `Un modérateur va vous recontacter dans ce salon sous peu.`,
          color: 0x57F287,
        }],
        content: `<@${ticket.discord_user_id}>`,
      });
    }
  } else {
    await updateTicket(ticketId, { state: "refused", close_at: new Date(Date.now() + 24 * 3600 * 1000) });
    await interaction.update({ content: "✅ Appel rejeté.", components: [] });

    if (ch) {
      await ch.send({
        embeds: [{
          title: "❌ Appel refusé",
          description:
            `<@${ticket.discord_user_id}> Votre appel a été refusé.\n` +
            `Ce dossier sera archivé dans 24h.\n\n` +
            `Si vous avez d'autres questions, ouvrez un ticket via <#${PANEL_CH}>.`,
          color: 0xED4245,
        }],
        content: `<@${ticket.discord_user_id}>`,
      });
    }
  }
}

// ─── Handler: bouton Virement envoyé ─────────────────────────────────────────
export async function handleFabioVirement(interaction: any, ticketId: string, ctx: BotCtx) {
  const member = interaction.member as GuildMember;
  if (!isMod(member)) { await interaction.reply({ ephemeral: true, content: "❌ Réservé aux modérateurs." }); return; }

  const ticket = await getTicketById(ticketId);
  if (!ticket || ticket.state !== "pending_virement") {
    await interaction.reply({ ephemeral: true, content: "❌ Ce ticket n'est pas en attente de virement." });
    return;
  }

  const offer  = await getOfferById(ticket.offer_id);
  const crypto = offer?.crypto ?? "USDT";

  await updateTicket(ticketId, {
    state: "closed",
    status: "approved",
    close_at: new Date(Date.now() + 24 * 3600 * 1000),
  });

  await interaction.update({ content: "✅ Virement marqué comme envoyé.", components: [] });

  const ch = await interaction.client.channels.fetch(ticket.channel_id).catch(() => null) as TextChannel | null;
  if (ch) {
    await ch.send({
      embeds: [{
        title: "🎉 Remboursement envoyé !",
        description:
          `<@${ticket.discord_user_id}>\n\n` +
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

  // Log dans logs-tickets
  await postClosingLog(interaction.client, ticket, "approved", ctx);
}

// ─── Post dans vérif-tickets ──────────────────────────────────────────────────
async function postToVerif(client: Client, ticket: TicketRow, screenshotUrl: string, ctx: BotCtx) {
  try {
    const ch = await client.channels.fetch(VERIF_TICKETS_CH).catch(() => null) as TextChannel | null;
    if (!ch) return;

    const dupWarn = fmtDupWarning(ticket);
    const msg = await ch.send({
      embeds: [{
        title: `🎫 Nouveau dossier — ${ticket.casino.charAt(0).toUpperCase() + ticket.casino.slice(1)}`,
        description:
          `👤 **${ticket.discord_username}** (<@${ticket.discord_user_id}>) \`${ticket.discord_user_id}\`\n` +
          `📧 **Email casino :** \`${ticket.casino_email}\`\n` +
          `🎭 **Pseudo casino :** \`${ticket.casino_pseudo}\`\n` +
          `💶 **Montant déclaré :** **${ticket.deposit_amount}€**\n\n` +
          `🔗 Ticket : <#${ticket.channel_id}>\n` +
          (dupWarn ? `\n${dupWarn}` : ""),
        image: { url: screenshotUrl },
        color: dupWarn ? 0xFF4444 : 0x5865F2,
        footer: { text: `Ticket ID: ${ticket.id}` },
        timestamp: new Date().toISOString(),
      }],
      content: `<@&${FABIO_ROLE_MOD_ID}>`,
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: `${CID_FABIO_TICKET_APPROVE}${ticket.id}`, label: "✅ Valider" },
          { type: 2, style: 4, custom_id: `${CID_FABIO_TICKET_REJECT}${ticket.id}`, label: "❌ Refuser" },
        ],
      }],
    });

    await updateTicket(ticket.id, { verif_msg_id: msg.id });
  } catch (e: any) {
    ctx.log(`[casino_tickets] postToVerif error: ${e?.message}`);
  }
}

// ─── Mettre à jour message vérif-tickets ──────────────────────────────────────
async function updateVerifMessage(client: Client, ticket: TicketRow, addedInfo: string, ctx: BotCtx) {
  try {
    if (!ticket.verif_msg_id) return;
    const ch = await client.channels.fetch(VERIF_TICKETS_CH).catch(() => null) as TextChannel | null;
    if (!ch) return;

    const msg = await ch.messages.fetch(ticket.verif_msg_id).catch(() => null);
    if (!msg) return;

    const existing = msg.embeds[0];
    const updatedDesc = (existing?.description ?? "") + `\n\n---\n${addedInfo}`;

    const virementBtn = ticket.state === "pending_virement" || addedInfo.includes("reçu") || addedInfo.includes("reçue")
      ? [{
          type: 1,
          components: [{
            type: 2, style: 3,
            custom_id: `${CID_FABIO_TICKET_VIREMENT}${ticket.id}`,
            label: "✅ Virement envoyé",
          }],
        }]
      : msg.components;

    await msg.edit({
      embeds: [{ ...existing?.data, description: updatedDesc.slice(0, 4096) }],
      components: virementBtn as any,
    });
  } catch (e: any) {
    ctx.log(`[casino_tickets] updateVerifMessage error: ${e?.message}`);
  }
}

// ─── Log fermeture dans logs-tickets ─────────────────────────────────────────
async function postClosingLog(client: Client, ticket: TicketRow, finalStatus: string, ctx: BotCtx) {
  try {
    const ch = await client.channels.fetch(FABIO_LOGS_TICKETS_ID).catch(() => null) as TextChannel | null;
    if (!ch) return;

    const statusEmoji = finalStatus === "approved" ? "✅ APPROUVÉ" : "❌ REFUSÉ";
    await ch.send({
      embeds: [{
        title: `📋 Ticket fermé — ${ticket.casino}`,
        description:
          `👤 **${ticket.discord_username}** (<@${ticket.discord_user_id}>)\n` +
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
  } catch (e: any) {
    ctx.log(`[casino_tickets] postClosingLog error: ${e?.message}`);
  }
}

// ─── Auto-close cron ──────────────────────────────────────────────────────────
export async function autoCloseExpiredTickets(client: Client, ctx: BotCtx) {
  try {
    const r = await pool.query<TicketRow>(
      `SELECT * FROM discord_casino_tickets WHERE close_at < now() AND state != 'closed' LIMIT 20`
    );

    for (const ticket of r.rows) {
      try {
        const ch = await client.channels.fetch(ticket.channel_id).catch(() => null) as TextChannel | null;
        if (ch) {
          await ch.send({
            embeds: [{
              title: "🔒 Ticket fermé",
              description: "Ce ticket est maintenant archivé et sera supprimé dans quelques instants.",
              color: 0x99AAB5,
            }],
          });
          await new Promise((r) => setTimeout(r, 2000));
          await ch.delete("Auto-close ticket expiré").catch(() => {});
        }

        await updateTicket(ticket.id, { state: "closed", closed_at: new Date() });
        await postClosingLog(client, ticket, ticket.status, ctx);
      } catch (e: any) {
        ctx.log(`[casino_tickets] auto-close ${ticket.id} error: ${e?.message}`);
      }
    }
  } catch (e: any) {
    ctx.log(`[casino_tickets] autoCloseExpiredTickets error: ${e?.message}`);
  }
}
