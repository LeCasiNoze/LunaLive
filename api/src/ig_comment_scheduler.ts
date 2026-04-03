// api/src/ig_comment_scheduler.ts
//
// Scheduler de réponse aux commentaires Instagram.
//
// Poll toutes les 10 minutes les posts dans ig_comment_tracking.
// Pour chaque post actif (track_until > NOW()), vérifie les nouveaux commentaires
// contenant le trigger_word du streamer, répond publiquement et envoie un DM.
//
// Variables d'environnement requises :
//   INSTAGRAM_ACCESS_TOKEN
//   INSTAGRAM_USER_ID

import { pool } from "./db.js";

const LOG = "[IG COMMENT SCHEDULER]";
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DISCORD_LUNALIVE = "https://discord.gg/VSbCZQ4gyT";

// ─────────────────────────────────────────────────────────────────────────────
// Phrases aléatoires
// ─────────────────────────────────────────────────────────────────────────────

const SENT   = ["C'est envoyé", "Check tes DM", "Bien reçu", "Ça part", "Hop, c'est parti", "Dans ta boîte"];
const FOLLOW = [
  "hésite pas à follow pour ne rien rater",
  "un p'tit follow ça fait plaisir",
  "pense à follow pour les prochains clips",
  "le follow c'est gratuit et ça aide",
  "follow pour rester dans la boucle",
  "abonne-toi pour ne pas louper la suite",
];
const EMOJIS = ["👀", "🎰", "🔥", "💬", "✅", "👇", "🙌"];
const SALUT  = ["Salut {{username}} !", "Yo {{username}} !", "Hey {{username}} !"];
const MERCI  = [
  "Merci pour ton soutien 🙌",
  "Bonne chance à toi 🎰",
  "On se retrouve sur le live !",
  "À bientôt sur LunaLive 🔥",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildCommentReply(): string {
  return `${pick(SENT)}, ${pick(FOLLOW)} ${pick(EMOJIS)}`;
}

function buildDm(opts: {
  username: string;
  streamerSlug: string;
  offerLabel: string | null;
  processInfo: string | null;
  discordUrl: string | null;
  extraUrl: string | null;
}): string {
  const { username, streamerSlug, offerLabel, processInfo, discordUrl, extraUrl } = opts;

  const header = pick(SALUT).replace("{{username}}", "@" + username);
  const offerLine = offerLabel ? ` (${offerLabel})` : "";
  const processLine = processInfo
    ? processInfo
    : "Tu pourras retrouver l'éventuel processus sur son discord :\n👇";

  return [
    header,
    "",
    `Comme promis, voilà le DM pour profiter de l'offre ${streamerSlug}${offerLine} :`,
    processLine,
    extraUrl ?? "",
    "",
    "Tu auras peut-être besoin d'ouvrir un ticket sur son Discord pour qu'il s'occupe de toi :",
    discordUrl ?? "",
    "",
    "Retrouve-le en live ici :",
    `https://lunalive.onrender.com/s/${streamerSlug}`,
    "",
    `Rejoins aussi le Discord LunaLive pour être au courant de tout :`,
    DISCORD_LUNALIVE,
    "",
    pick(MERCI),
  ]
    .join("\n")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers Meta Graph API
// ─────────────────────────────────────────────────────────────────────────────

async function metaPost(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://graph.facebook.com/v19.0${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json()) as any;
  if (data?.error) {
    throw new Error(`Meta API error [${data.error.code}] ${data.error.type}: ${data.error.message}`);
  }
  return data;
}

async function metaGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://graph.facebook.com/v19.0${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = (await res.json()) as any;
  if (data?.error) {
    throw new Error(`Meta API error [${data.error.code}] ${data.error.type}: ${data.error.message}`);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types DB
// ─────────────────────────────────────────────────────────────────────────────

type TrackingRow = {
  id: number;
  publish_job_id: number;
  clip_id: number;
  streamer_slug: string;
  media_id: string;
  track_until: Date;
};

type StreamerConfig = {
  trigger_word: string;
  offer_label: string | null;
  process_info: string | null;
  discord_url: string | null;
  extra_url: string | null;
};

type IgComment = {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  from?: { id: string; username: string };
};

// ─────────────────────────────────────────────────────────────────────────────
// Traitement d'un post
// ─────────────────────────────────────────────────────────────────────────────

async function processTrackedPost(
  row: TrackingRow,
  config: StreamerConfig,
  accessToken: string,
  userId: string
): Promise<void> {
  // Récupérer les commentaires du post
  let commentsData: any;
  try {
    commentsData = await metaGet(`/${row.media_id}/comments`, {
      fields: "id,text,username,timestamp,from",
      access_token: accessToken,
    });
  } catch (e: any) {
    console.error(`${LOG} [tracking #${row.id}] failed to fetch comments: ${e?.message ?? e}`);
    return;
  }

  const comments: IgComment[] = commentsData?.data ?? [];
  const triggerLower = config.trigger_word.toLowerCase();

  for (const comment of comments) {
    const commentText = String(comment.text ?? "");
    const commentId   = String(comment.id ?? "");
    const username    = String(comment.username ?? comment.from?.username ?? "");

    if (!commentId || !username) continue;

    // Anti-doublon
    const already = await pool.query(
      `SELECT 1 FROM ig_comment_replies WHERE comment_id = $1 LIMIT 1`,
      [commentId]
    );
    if ((already.rowCount ?? 0) > 0) continue;

    // Filtre trigger_word (case insensitive)
    if (!commentText.toLowerCase().includes(triggerLower)) continue;

    console.log(
      `${LOG} [tracking #${row.id}] comment matched — id=${commentId} user=${username} text="${commentText.slice(0, 60)}"`
    );

    // ── Répondre au commentaire publiquement ──────────────────────────────
    const replyText = buildCommentReply();
    try {
      await metaPost(`/${row.media_id}/replies`, {
        message: replyText,
        access_token: accessToken,
      });
      console.log(`${LOG} [tracking #${row.id}] public reply sent — comment=${commentId}`);
    } catch (e: any) {
      console.error(`${LOG} [tracking #${row.id}] public reply failed: ${e?.message ?? e}`);
      // On continue quand même pour tenter le DM
    }

    // ── Envoyer un DM ─────────────────────────────────────────────────────
    let dmSent = false;
    let dmSentAt: Date | null = null;

    const fromId = comment.from?.id;
    if (fromId) {
      const dmText = buildDm({
        username,
        streamerSlug: row.streamer_slug,
        offerLabel:   config.offer_label,
        processInfo:  config.process_info,
        discordUrl:   config.discord_url,
        extraUrl:     config.extra_url,
      });

      try {
        await metaPost(`/${userId}/messages`, {
          recipient: JSON.stringify({ id: fromId }),
          message:   JSON.stringify({ text: dmText }),
          access_token: accessToken,
        });
        dmSent   = true;
        dmSentAt = new Date();
        console.log(`${LOG} [tracking #${row.id}] DM sent — user=${username} (${fromId})`);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("200") || msg.includes("permission") || msg.includes("instagram_manage_messages")) {
          console.log(`${LOG} [tracking #${row.id}] DM SKIPPED — permission: ${msg.slice(0, 120)}`);
        } else {
          console.error(`${LOG} [tracking #${row.id}] DM failed: ${msg.slice(0, 200)}`);
        }
      }
    } else {
      console.log(`${LOG} [tracking #${row.id}] DM SKIPPED — no from.id on comment ${commentId}`);
    }

    // ── Enregistrer le commentaire traité ─────────────────────────────────
    await pool.query(
      `INSERT INTO ig_comment_replies
         (comment_id, media_id, username, comment_text, dm_sent, dm_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (comment_id) DO NOTHING`,
      [commentId, row.media_id, username, commentText.slice(0, 1000), dmSent, dmSentAt]
    );
  }

  // Mettre à jour last_checked_at
  await pool.query(
    `UPDATE ig_comment_tracking SET last_checked_at = NOW() WHERE id = $1`,
    [row.id]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick principal
// ─────────────────────────────────────────────────────────────────────────────

async function tick(accessToken: string, userId: string): Promise<void> {
  // Posts encore dans la fenêtre de monitoring
  const { rows } = await pool.query<TrackingRow>(`
    SELECT id, publish_job_id, clip_id, streamer_slug, media_id, track_until
    FROM   ig_comment_tracking
    WHERE  track_until > NOW()
    ORDER BY last_checked_at ASC NULLS FIRST
  `);

  if (rows.length === 0) return;

  console.log(`${LOG} tick — ${rows.length} post(s) to check`);

  for (const row of rows) {
    // Vérifier config streamer active
    const cfgResult = await pool.query<StreamerConfig>(`
      SELECT trigger_word, offer_label, process_info, discord_url, extra_url
      FROM   streamer_ig_config
      WHERE  LOWER(streamer_slug) = LOWER($1)
        AND  active = true
      LIMIT 1
    `, [row.streamer_slug]);

    if ((cfgResult.rowCount ?? 0) === 0) continue; // skip silencieux

    const config = cfgResult.rows[0];

    try {
      await processTrackedPost(row, config, accessToken, userId);
    } catch (e: any) {
      console.error(
        `${LOG} [tracking #${row.id}] unexpected error: ${e?.message ?? e}`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────

export function startIgCommentScheduler(): void {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const userId      = process.env.INSTAGRAM_USER_ID ?? "";

  if (!accessToken || !userId) {
    console.log(`${LOG} skipped — INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set`);
    return;
  }

  let running = false;

  const safeTick = async () => {
    if (running) return;
    running = true;
    try {
      await tick(accessToken, userId);
    } catch (e: any) {
      console.error(`${LOG} tick error: ${e?.message ?? e}`);
    } finally {
      running = false;
    }
  };

  // Délai de 15s au démarrage — laisser les migrations finir
  setTimeout(
    () => safeTick().catch((e) => console.error(`${LOG} first tick failed:`, e)),
    15_000
  );

  const id = setInterval(
    () => safeTick().catch((e) => console.error(`${LOG} tick failed:`, e)),
    POLL_INTERVAL_MS
  );
  (id as any).unref?.();

  console.log(`${LOG} started — polling every ${POLL_INTERVAL_MS / 60000}min`);
}
