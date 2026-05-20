// DM Discord envoyés au viewer apres /celsius (confirmation),
// validation (verified) ou refus (rejected) par l'equipe Aurix.
//
// Test mode : si la kv 'celsius_dm_test_user_id' est definie, tous les
// DMs sont rediriges vers ce user_id avec un header de prefix.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  EmbedBuilder,
} from "discord.js";
import * as cfg from "./config.js";
import { kvGet } from "./db.js";

const VIP_THRESHOLD_EUR = 750;

type ResolvedTarget = { userId: string; isTest: boolean; realViewerId: string };

async function resolveTarget(realViewerId: string): Promise<ResolvedTarget> {
  const testTarget = (await kvGet("celsius_dm_test_user_id")) || "";
  const trimmed = testTarget.trim();
  if (trimmed && trimmed !== realViewerId) {
    return { userId: trimmed, isTest: true, realViewerId };
  }
  return { userId: realViewerId, isTest: false, realViewerId };
}

function testPrefix(t: ResolvedTarget): string {
  if (!t.isTest) return "";
  return `🧪 *[Mode test — destinataire réel : <@${t.realViewerId}>]*\n\n`;
}

async function safeDm(
  client: Client,
  userId: string,
  payload: { embeds: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] }
): Promise<void> {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    console.error("[aurix.celsius.dm] target user introuvable:", userId);
    return;
  }
  try {
    await user.send(payload);
  } catch (e) {
    console.warn("[aurix.celsius.dm] DM bloqué pour", userId, String(e));
  }
}

// ─────────── 1. Confirmation post-/celsius (status=pending) ───────────

export async function sendCelsiusConfirmationDM(
  client: Client,
  args: {
    viewerUserId: string;
    viewerTag: string;
    pseudo: string;
    email: string;
    monthlyDeposit: string;
    guildName: string;
  }
): Promise<void> {
  const t = await resolveTarget(args.viewerUserId);

  const lines: string[] = [];
  lines.push(testPrefix(t));
  lines.push(`Salut <@${args.viewerUserId}> 👋`);
  lines.push("");
  lines.push(
    `Ton inscription Celsius vient d'être **enregistrée** par ${cfg.BRAND.NAME}. Voici ce qu'on a reçu :`
  );
  lines.push("");
  lines.push(`• 🎰 Pseudo Celsius : \`${args.pseudo}\``);
  lines.push(`• ✉️ Email : \`${args.email}\``);
  lines.push(`• 💰 Dépôt moyen / mois : \`${args.monthlyDeposit}\``);
  lines.push(`• 🎙️ Serveur d'origine : *${args.guildName}*`);
  lines.push("");
  lines.push(
    `L'équipe ${cfg.BRAND.NAME} va vérifier que ton compte est bien **affilié** sous peu. Tu seras notifié dès que c'est validé.`
  );
  lines.push("");
  lines.push(`Si tu veux modifier tes infos, retape simplement \`/celsius\` sur ton serveur.`);
  lines.push("");
  lines.push(`À très vite ${cfg.EMOJI.diamond}`);
  lines.push(`— ${cfg.BRAND.NAME}`);

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.check}  Inscription Celsius enregistrée`)
    .setDescription(lines.join("\n"))
    .setColor(cfg.COLOR.SUCCESS)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  await safeDm(client, t.userId, { embeds: [embed] });
}

// ─────────── 2. Validation (status=verified) ───────────
// Si le dépôt mensuel >= 750€, envoi du DM premium VIP avec bouton
// Telegram (si vip_telegram_contact configuré).

export async function sendCelsiusValidatedDM(
  client: Client,
  args: {
    viewerUserId: string;
    pseudo: string;
    monthlyDeposit: string;
    monthlyDepositAmount: number | null;
    guildName: string;
  }
): Promise<void> {
  const t = await resolveTarget(args.viewerUserId);
  const isVip = (args.monthlyDepositAmount ?? 0) >= VIP_THRESHOLD_EUR;

  if (isVip) {
    await sendVipValidatedDM(client, t, args);
  } else {
    await sendStandardValidatedDM(client, t, args);
  }
}

async function sendStandardValidatedDM(
  client: Client,
  t: ResolvedTarget,
  args: { viewerUserId: string; pseudo: string; guildName: string }
): Promise<void> {
  const lines: string[] = [];
  lines.push(testPrefix(t));
  lines.push(`Salut <@${args.viewerUserId}> 👋`);
  lines.push("");
  lines.push(
    `Bonne nouvelle — ton compte Celsius **\`${args.pseudo}\`** vient d'être **vérifié** par l'équipe ${cfg.BRAND.NAME}.`
  );
  lines.push(
    `Tu es désormais **affilié** via le serveur de *${args.guildName}*. ${cfg.EMOJI.fire}`
  );
  lines.push("");
  lines.push(`Bon jeu — et à très vite ${cfg.EMOJI.diamond}`);
  lines.push(`— ${cfg.BRAND.NAME}`);

  const embed = new EmbedBuilder()
    .setTitle("🟢  Compte Celsius vérifié")
    .setDescription(lines.join("\n"))
    .setColor(cfg.COLOR.SUCCESS)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  await safeDm(client, t.userId, { embeds: [embed] });
}

async function sendVipValidatedDM(
  client: Client,
  t: ResolvedTarget,
  args: { viewerUserId: string; pseudo: string; guildName: string }
): Promise<void> {
  // Contact Telegram VIP optionnel — bouton ajoute seulement si configure.
  const vipTgContact = ((await kvGet("vip_telegram_contact")) || "").trim();
  const tgLink = vipTgContact ? toTelegramLink(vipTgContact) : null;

  const lines: string[] = [];
  lines.push(testPrefix(t));
  lines.push(`Salut <@${args.viewerUserId}>,`);
  lines.push("");
  lines.push(
    `Ton compte Celsius **\`${args.pseudo}\`** vient d'être validé par l'équipe ${cfg.BRAND.NAME} — et tu rejoins notre **Club VIP** ${cfg.EMOJI.diamond}`
  );
  lines.push("");
  lines.push(`Concrètement, en tant que VIP tu bénéficies de :`);
  lines.push(`• Un **host dédié** joignable directement sur Telegram`);
  lines.push(`• Des **offres et bonus exclusifs** réservés aux gros joueurs`);
  lines.push(`• Un **suivi personnalisé** sur tes jeux et tes sessions`);
  lines.push(`• Des **avantages prioritaires** sur les promos Aurix`);
  lines.push("");
  if (tgLink) {
    lines.push(`Clique sur le bouton ci-dessous pour entrer en conversation directe avec ton host VIP sur Telegram.`);
  } else {
    lines.push(`Ton host VIP va te contacter sous peu pour faire connaissance.`);
  }
  lines.push("");
  lines.push(`Bienvenue dans le Club ${cfg.EMOJI.diamond}`);
  lines.push(`— ${cfg.BRAND.NAME}`);

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.diamond}  Bienvenue dans le Club VIP Aurix`)
    .setDescription(lines.join("\n"))
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (tgLink) {
    const btn = new ButtonBuilder()
      .setLabel("Contacter mon host VIP")
      .setStyle(ButtonStyle.Link)
      .setURL(tgLink)
      .setEmoji("💬");
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn));
  }

  await safeDm(client, t.userId, { embeds: [embed], components });
}

function toTelegramLink(contact: string): string {
  const c = contact.trim();
  if (c.startsWith("http://") || c.startsWith("https://")) return c;
  const handle = c.replace(/^@/, "");
  return `https://t.me/${handle}`;
}

// ─────────── 3. Refus (status=rejected) ───────────

export async function sendCelsiusRejectedDM(
  client: Client,
  args: {
    viewerUserId: string;
    pseudo: string;
    rejectReason: string | null;
  }
): Promise<void> {
  const t = await resolveTarget(args.viewerUserId);

  const lines: string[] = [];
  lines.push(testPrefix(t));
  lines.push(`Salut <@${args.viewerUserId}>,`);
  lines.push("");
  lines.push(
    `Ta demande de validation Celsius (compte **\`${args.pseudo}\`**) a malheureusement été **refusée** par l'équipe ${cfg.BRAND.NAME}.`
  );
  if (args.rejectReason) {
    lines.push("");
    lines.push(`**Raison :** *${args.rejectReason}*`);
  }
  lines.push("");
  lines.push(
    `Si tu penses qu'il s'agit d'une erreur ou si tu veux retenter avec de nouvelles infos, retape \`/celsius\` sur ton serveur.`
  );
  lines.push("");
  lines.push(`— ${cfg.BRAND.NAME}`);

  const embed = new EmbedBuilder()
    .setTitle("🔴  Inscription Celsius refusée")
    .setDescription(lines.join("\n"))
    .setColor(cfg.COLOR.DANGER)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  await safeDm(client, t.userId, { embeds: [embed] });
}
