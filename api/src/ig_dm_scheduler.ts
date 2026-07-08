// api/src/ig_dm_scheduler.ts
//
// Webhook Instagram pour recevoir les DMs et répondre automatiquement.
//
// Variables d'environnement requises :
//   INSTAGRAM_WEBHOOK_TOKEN  — token de vérification Meta (ex: "lunalive_webhook_secret")
//   INSTAGRAM_PAGE_ID        — ex: "999659743241159"
//   INSTAGRAM_PAGE_TOKEN     — Page Access Token (long-lived)

import { Router } from "express";
import { pool } from "./db.js";

const LOG = "[IG DM SCHEDULER]";
const DISCORD_LUNALIVE = "https://discord.gg/VSbCZQ4gyT";

export const igWebhookRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction du DM
// ─────────────────────────────────────────────────────────────────────────────

type StreamerConfig = {
  streamer_slug: string;
  offer_label: string | null;
  offer_detail: string | null;
  process_info: string | null;
  discord_url: string | null;
  extra_url: string | null;
};

function buildDmText(cfg: StreamerConfig): string {
  const GREETINGS = ["Salut !", "Yo !", "Hey !", "Coucou !", "Wesh !"];
  const INTROS = [
    `Voilà les infos pour profiter de l'offre de @${cfg.streamer_slug} 👇`,
    `Comme demandé, voilà tout ce qu'il faut savoir sur l'offre 🎁`,
    `Je t'explique tout pour l'offre de @${cfg.streamer_slug} ⬇️`,
    `Tiens, les détails de l'offre — ça va prendre 2 min à lire 😊`,
  ];
  const CLOSINGS = [
    "Hésite pas à revenir si t'as des questions 🙌",
    "Bonne chance et à bientôt sur le live ! 🔥",
    "On se retrouve en live, profite bien de l'offre 🎰",
    "Des questions ? Réponds juste ici, je suis là 👌",
  ];

  const lines: string[] = [];

  lines.push(`${pick(GREETINGS)} ${pick(INTROS)}`);
  lines.push("");

  // Offre
  if (cfg.offer_label) {
    lines.push(`🎁 Offre : ${cfg.offer_label}`);
  }
  if (cfg.offer_detail) {
    lines.push(cfg.offer_detail);
  }
  lines.push("");

  // Processus
  if (cfg.process_info) {
    lines.push("📋 Comment en profiter :");
    lines.push(cfg.process_info);
    lines.push("");
  }

  // Lien offre
  if (cfg.extra_url) {
    lines.push(`👉 Lien pour créer ton compte : ${cfg.extra_url}`);
    lines.push("");
  }

  // Page offre LunaLive
  lines.push(`📄 Page complète : https://lunalive.win/offres_streamers/${cfg.streamer_slug}`);
  lines.push("");

  // Discord streamer
  if (cfg.discord_url) {
    lines.push(`💬 Discord de @${cfg.streamer_slug} (pour ouvrir un ticket) :`);
    lines.push(cfg.discord_url);
    lines.push("");
  }

  // Discord LunaLive
  lines.push(`🌙 Communauté LunaLive : ${DISCORD_LUNALIVE}`);
  lines.push("");

  lines.push(pick(CLOSINGS));

  return lines.join("\n").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Envoi DM via Messenger API for Instagram
// ─────────────────────────────────────────────────────────────────────────────

async function sendInstagramDm(senderId: string, text: string): Promise<void> {
  const pageId    = process.env.INSTAGRAM_PAGE_ID ?? "";
  const pageToken = process.env.INSTAGRAM_PAGE_TOKEN ?? "";

  if (!pageId || !pageToken) {
    throw new Error("INSTAGRAM_PAGE_ID ou INSTAGRAM_PAGE_TOKEN non défini");
  }

  const res = await fetch(`https://graph.instagram.com/v19.0/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: senderId },
      message: { text },
      messaging_type: "RESPONSE",
      access_token: pageToken,
    }),
  });

  const data = (await res.json()) as any;
  if (data?.error) {
    throw new Error(`Meta API error [${data.error.code}] ${data.error.type}: ${data.error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Traitement d'un DM entrant
// ─────────────────────────────────────────────────────────────────────────────

async function processIncomingDm(senderId: string, text: string): Promise<void> {
  const textLower = text.toLowerCase().trim();

  // Chercher un streamer dont le trigger_word est dans le message
  const { rows } = await pool.query<StreamerConfig>(`
    SELECT streamer_slug, offer_label, offer_detail, process_info, discord_url, extra_url
    FROM   streamer_ig_config
    WHERE  active = true
      AND  LOWER($1) LIKE '%' || LOWER(trigger_word) || '%'
    LIMIT 1
  `, [textLower]);

  if (rows.length === 0) {
    console.log(`${LOG} DM sender=${senderId} — aucun trigger_word reconnu dans: "${text.slice(0, 60)}"`);
    return;
  }

  const cfg = rows[0];

  // Anti-doublon — un DM par sender par streamer
  const already = await pool.query(
    `SELECT 1 FROM ig_dm_replies WHERE sender_id = $1 AND streamer_slug = $2 LIMIT 1`,
    [senderId, cfg.streamer_slug]
  );
  if ((already.rowCount ?? 0) > 0) {
    console.log(`${LOG} DM sender=${senderId} — déjà répondu pour @${cfg.streamer_slug}, skip`);
    return;
  }

  // Envoyer le DM
  const dmText = buildDmText(cfg);
  try {
    await sendInstagramDm(senderId, dmText);
    console.log(`${LOG} ✅ DM envoyé — sender=${senderId} streamer=@${cfg.streamer_slug}`);
  } catch (e: any) {
    console.error(`${LOG} ❌ DM échoué — sender=${senderId}: ${e?.message ?? e}`);
    return; // Ne pas marquer comme traité si l'envoi a échoué
  }

  // Enregistrer l'anti-doublon
  await pool.query(
    `INSERT INTO ig_dm_replies (sender_id, streamer_slug)
     VALUES ($1, $2)
     ON CONFLICT (sender_id, streamer_slug) DO NOTHING`,
    [senderId, cfg.streamer_slug]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes webhook
// ─────────────────────────────────────────────────────────────────────────────

// GET /webhook/instagram — vérification Meta (subscribe)
igWebhookRouter.get("/webhook/instagram", (req, res) => {
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_TOKEN ?? "";
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log(`${LOG} ✅ Webhook vérifié`);
    return void res.status(200).send(challenge);
  }

  console.warn(`${LOG} ❌ Vérification webhook échouée — token=${token}`);
  res.sendStatus(403);
});

// POST /webhook/instagram — réception des événements
igWebhookRouter.post("/webhook/instagram", (req, res) => {
  // Répondre immédiatement 200 pour éviter le timeout Meta
  res.sendStatus(200);

  const body = req.body as any;

  if (body?.object !== "instagram") return;

  const entries: any[] = body?.entry ?? [];

  for (const entry of entries) {
    const messagingEvents: any[] = entry?.messaging ?? [];

    for (const event of messagingEvents) {
      const senderId  = event?.sender?.id as string | undefined;
      const messageText = event?.message?.text as string | undefined;

      if (!senderId || !messageText) continue;

      // Ignorer les messages echo (le bot se répond à lui-même)
      if (event?.message?.is_echo) continue;

      console.log(`${LOG} DM reçu — sender=${senderId} text="${messageText.slice(0, 80)}"`);

      processIncomingDm(senderId, messageText).catch((e: any) => {
        console.error(`${LOG} processIncomingDm error: ${e?.message ?? e}`);
      });
    }
  }
});
