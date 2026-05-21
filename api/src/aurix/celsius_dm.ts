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
    `Ton compte Celsius **\`${args.pseudo}\`** vient d'être validé par l'équipe ${cfg.BRAND.NAME}. ${cfg.EMOJI.check}`
  );
  lines.push("");
  lines.push(
    `D'après les infos que tu as renseignées, **ton profil pourrait correspondre à notre Club VIP** ${cfg.EMOJI.diamond}`
  );
  lines.push("");
  lines.push(`Concrètement, en tant que VIP tu bénéficierais de :`);
  lines.push(`• Un **host dédié** joignable directement sur Telegram`);
  lines.push(`• Des **offres et bonus exclusifs** réservés aux gros joueurs`);
  lines.push(`• Un **suivi personnalisé** sur tes jeux et tes sessions`);
  lines.push(`• Des **avantages prioritaires** sur les promos Aurix`);
  lines.push("");
  lines.push(
    `Pour activer ces avantages, une **dernière étape de vérification** est nécessaire : on contrôle rapidement les stats que tu as déclarées, et si tout est OK, tu reçois ton **host VIP attitré** dans la foulée.`
  );
  lines.push("");
  if (tgLink) {
    lines.push(
      `Clique sur le bouton ci-dessous pour me contacter directement sur Telegram — je m'occupe de la vérification et de l'attribution du host.`
    );
  } else {
    lines.push(
      `Un membre de l'équipe va te contacter sous peu pour finaliser la vérification.`
    );
  }
  lines.push("");
  lines.push(`À très vite ${cfg.EMOJI.diamond}`);
  lines.push(`— ${cfg.BRAND.NAME}`);

  const embed = new EmbedBuilder()
    .setTitle(`${cfg.EMOJI.diamond}  Ton profil pourrait correspondre au Club VIP`)
    .setDescription(lines.join("\n"))
    .setColor(cfg.COLOR.PRIMARY)
    .setFooter({ text: `${cfg.BRAND.NAME} • ${cfg.BRAND.TAGLINE}` });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (tgLink) {
    const btn = new ButtonBuilder()
      .setLabel("Me contacter sur Telegram")
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

// ─────────── Admin /celsius-vip-invite ───────────
// DM le template VIP a tous les viewers verified avec depot >= 750€ qui
// n'ont pas encore recu (flag vip_invited_at en DB pour eviter le spam).

export async function sendVipInviteBlast(
  client: Client
): Promise<{ candidates: number; sent: number; skipped: number; failed: number }> {
  const { all, query } = await import("./db.js");
  const candidates = await all<{
    id: number;
    viewer_user_id: string;
    celsius_pseudo: string;
    guild_name: string | null;
    vip_invited_at: Date | null;
  }>(
    `SELECT id, viewer_user_id, celsius_pseudo, guild_name, vip_invited_at
       FROM aurix_celsius_submissions
      WHERE status='verified' AND monthly_deposit_amount >= 750
      ORDER BY monthly_deposit_amount DESC`
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    if (c.vip_invited_at) {
      skipped++;
      continue;
    }
    try {
      // Bypass test_mode pour cette campagne — on envoie au vrai viewer.
      // Pour ca on fake un target "non test" en passant le viewer comme cible.
      await sendVipValidatedDM(
        client,
        { userId: c.viewer_user_id, isTest: false, realViewerId: c.viewer_user_id },
        {
          viewerUserId: c.viewer_user_id,
          pseudo: c.celsius_pseudo,
          guildName: c.guild_name ?? "ton serveur",
        }
      );
      await query(
        "UPDATE aurix_celsius_submissions SET vip_invited_at=NOW() WHERE id=$1",
        [c.id]
      );
      sent++;
    } catch (e) {
      failed++;
      console.warn("[aurix.celsius.dm] VIP invite failed:", c.viewer_user_id, String(e));
    }
  }

  return { candidates: candidates.length, sent, skipped, failed };
}

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
