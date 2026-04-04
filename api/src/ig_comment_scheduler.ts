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
const POLL_INTERVAL_MS = 10_000; // DEBUG — 10s (remettre à 10 * 60 * 1000 après les tests)
const DISCORD_LUNALIVE = "https://discord.gg/VSbCZQ4gyT";

// ─────────────────────────────────────────────────────────────────────────────
// Phrases aléatoires
// ─────────────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Construction de la réponse publique au commentaire ───────────────────────
// Chaque partie est choisie aléatoirement pour éviter les doublons.

function buildCommentReply(streamerSlug: string): string {
  const GREETINGS = [
    "Salut !",
    "Yo !",
    "Wesh !",
    "Hey !",
    "Coucou !",
  ];
  const DESOLE = [
    `Désolé les liens marchent pas dans les comms, envoie-moi "${streamerSlug}" en DM 😅`,
    `Les liens cliquables c'est pas possible ici, MP-moi "${streamerSlug}" en DM 🙏`,
    `Impossible de mettre un lien ici, balance-moi "${streamerSlug}" en DM :/`,
    `Les liens passent pas dans les commentaires, envoie "${streamerSlug}" en DM 😬`,
    `Je peux pas mettre de lien ici, envoie-moi "${streamerSlug}" en MP 😊`,
  ];
  const FOLLOWS = [
    "hésite pas à follow pour ne rien rater !",
    "un follow c'est gratuit et ça aide vraiment !",
    "pense à follow pour les prochains clips !",
    "abonne-toi pour pas louper la suite !",
    "le follow c'est toujours dispo !",
  ];

  return `${pick(GREETINGS)} ${pick(DESOLE)}\n${pick(FOLLOWS)}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers Meta Graph API
// ─────────────────────────────────────────────────────────────────────────────

async function metaPost(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://graph.instagram.com/v19.0${path}`, {
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

// Token invalidity codes — [190] = expired/logged out, [102] = session expired
const TOKEN_INVALID_CODES = new Set([190, 102, 463, 467]);

class MetaTokenError extends Error {
  constructor(code: number, message: string) {
    super(`Meta API error [${code}]: ${message}`);
    this.name = "MetaTokenError";
  }
}

async function metaGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://graph.instagram.com/v19.0${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = (await res.json()) as any;
  if (data?.error) {
    const code = Number(data.error.code ?? 0);
    if (TOKEN_INVALID_CODES.has(code)) {
      throw new MetaTokenError(code, data.error.message);
    }
    throw new Error(`Meta API error [${code}] ${data.error.type}: ${data.error.message}`);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vérification des permissions et connectivité
// ─────────────────────────────────────────────────────────────────────────────

async function verifyInstagramConnectivity(accessToken: string, userId: string): Promise<void> {
  const userData = await metaGet(`/${userId}`, {
    fields: "id,username",
    access_token: accessToken,
  });
  console.log(`${LOG} ✅ Connectivité OK — user: @${userData.username}`);
}

async function checkDatabaseState(): Promise<void> {
  console.log(`${LOG} Vérification de l'état de la base de données...`);
  
  try {
    // Vérification table ig_comment_tracking
    const trackingResult = await pool.query(`
      SELECT COUNT(*) as total, 
             COUNT(CASE WHEN track_until > NOW() THEN 1 END) as active
      FROM ig_comment_tracking
    `);
    const { total, active } = trackingResult.rows[0];
    console.log(`${LOG} 📊 Tracking: ${active}/${total} posts actifs`);

    // Vérification table streamer_ig_config
    const configResult = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN active = true THEN 1 END) as active
      FROM streamer_ig_config
    `);
    const { total: configTotal, active: configActive } = configResult.rows[0];
    console.log(`${LOG} 📊 Configs: ${configActive}/${configTotal} streamers actifs`);

    // Détail des streamers actifs
    if (configActive > 0) {
      const streamersResult = await pool.query(`
        SELECT streamer_slug, trigger_word, active
        FROM streamer_ig_config
        WHERE active = true
      `);
      console.log(`${LOG} 📝 Streamers configurés:`);
      streamersResult.rows.forEach(row => {
        console.log(`${LOG}    - @${row.streamer_slug}: trigger="${row.trigger_word}"`);
      });
    }

    // Vérification table ig_comment_replies (pour éviter les doublons)
    const repliesResult = await pool.query(`
      SELECT COUNT(*) as total,
             MAX(created_at) as last_reply
      FROM ig_comment_replies
    `);
    const { total: repliesTotal, last_reply } = repliesResult.rows[0];
    console.log(`${LOG} 📊 Réponses envoyées: ${repliesTotal}${last_reply ? ` (dernière: ${last_reply})` : ""}`);
  } catch (e: any) {
    console.error(`${LOG} ❌ Erreur de vérification DB: ${e?.message ?? e}`);
  }
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
  console.log(`${LOG} [tracking #${row.id}] 📝 Traitement du post @${row.streamer_slug} (media: ${row.media_id})`);
  
  // Récupérer les commentaires du post
  let commentsData: any;
  try {
    console.log(`${LOG} [tracking #${row.id}] 🔍 Récupération des commentaires...`);
    commentsData = await metaGet(`/${row.media_id}/comments`, {
      fields: "id,text,username,timestamp,from",
      access_token: accessToken,
    });
    console.log(`${LOG} [tracking #${row.id}] ✅ ${commentsData?.data?.length ?? 0} commentaire(s) trouvé(s)`);
  } catch (e: any) {
    console.error(`${LOG} [tracking #${row.id}] ❌ failed to fetch comments: ${e?.message ?? e}`);
    return;
  }

  const comments: IgComment[] = commentsData?.data ?? [];
  const triggerLower = config.trigger_word.toLowerCase();
  console.log(`${LOG} [tracking #${row.id}] 🎯 Trigger word: "${config.trigger_word}" (${comments.length} commentaires à analyser)`);

  let processedCount = 0;
  let skippedCount = 0;

  for (const comment of comments) {
    const commentText = String(comment.text ?? "");
    const commentId   = String(comment.id ?? "");
    const username    = String(comment.username ?? comment.from?.username ?? "");

    if (!commentId || !username) {
      skippedCount++;
      continue;
    }

    // Anti-doublon
    const already = await pool.query(
      `SELECT 1 FROM ig_comment_replies WHERE comment_id = $1 LIMIT 1`,
      [commentId]
    );
    if ((already.rowCount ?? 0) > 0) {
      console.log(`${LOG} [tracking #${row.id}] ⏭️ Commentaire ${commentId} déjà traité`);
      skippedCount++;
      continue;
    }

    // Filtre trigger_word (case insensitive)
    if (!commentText.toLowerCase().includes(triggerLower)) {
      console.log(`${LOG} [tracking #${row.id}] ⏭️ Commentaire ${commentId} ne contient pas le trigger`);
      skippedCount++;
      continue;
    }

    console.log(
      `${LOG} [tracking #${row.id}] 🎯 COMMENT MATCH — id=${commentId} user=${username} text="${commentText.slice(0, 60)}"`
    );

    // ── Enregistrer d'abord (anti-doublon) — si rowCount=0 déjà traité ───
    let claimed = false;
    try {
      const insertResult = await pool.query(
        `INSERT INTO ig_comment_replies
           (comment_id, media_id, username, comment_text, dm_sent, dm_sent_at)
         VALUES ($1, $2, $3, $4, false, null)
         ON CONFLICT (comment_id) DO NOTHING`,
        [commentId, row.media_id, username, commentText.slice(0, 1000)]
      );
      claimed = (insertResult.rowCount ?? 0) > 0;
      console.log(`${LOG} [tracking #${row.id}] 💾 anti-doublon INSERT — rows=${insertResult.rowCount} claimed=${claimed}`);
    } catch (e: any) {
      console.error(`${LOG} [tracking #${row.id}] ❌ anti-doublon INSERT échoué: ${e?.message ?? e}`);
      skippedCount++;
      continue;
    }

    if (!claimed) {
      console.log(`${LOG} [tracking #${row.id}] ⏭️ Commentaire ${commentId} déjà en base (INSERT conflict), skip`);
      skippedCount++;
      continue;
    }

    processedCount++;

    // ── Répondre au commentaire publiquement ──────────────────────────────
    const replyText = buildCommentReply(row.streamer_slug);
    try {
      console.log(`${LOG} [tracking #${row.id}] 💬 reply sur commentId=${commentId}`);
      await metaPost(`/${commentId}/replies`, {
        message: replyText,
        access_token: accessToken,
      });
      console.log(`${LOG} [tracking #${row.id}] ✅ Réponse publique envoyée — comment=${commentId}`);
    } catch (e: any) {
      console.error(`${LOG} [tracking #${row.id}] ❌ Réponse publique échouée: ${e?.message ?? e}`);
    }
  }

  console.log(`${LOG} [tracking #${row.id}] 📊 Bilan: ${processedCount} traité(s), ${skippedCount} ignoré(s)`);

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
  console.log(`${LOG} init...`);
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const userId      = process.env.INSTAGRAM_USER_ID ?? "";

  if (!accessToken || !userId) {
    console.log(`${LOG} skipped — INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set`);
    return;
  }

  let running = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stopDueToTokenError = (err: MetaTokenError) => {
    console.error(`${LOG} 🔴 TOKEN EXPIRÉ — polling arrêté définitivement.`);
    console.error(`${LOG} 👉 Génère un nouveau long-lived token Meta et mets à jour INSTAGRAM_ACCESS_TOKEN sur Render.`);
    console.error(`${LOG}    Détail: ${err.message}`);
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  };

  const safeTick = async () => {
    if (running) return;
    running = true;
    try {
      await tick(accessToken, userId);
    } catch (e: any) {
      if (e instanceof MetaTokenError) { stopDueToTokenError(e); }
      else { console.error(`${LOG} tick error: ${e?.message ?? e}`); }
    } finally {
      running = false;
    }
  };

  // Vérifications initiales au démarrage (asynchrones, non bloquantes)
  const initialChecks = async () => {
    try {
      console.log(`${LOG} 🔍 Démarrage des vérifications initiales...`);
      await checkDatabaseState();
      await verifyInstagramConnectivity(accessToken, userId);
      console.log(`${LOG} ✅ Vérifications initiales terminées — démarrage du scheduler`);
    } catch (e: any) {
      if (e instanceof MetaTokenError) {
        stopDueToTokenError(e);
      } else {
        console.error(`${LOG} ⚠️ Vérifications initiales échouées mais démarrage quand même: ${e?.message ?? e}`);
      }
    }
  };

  // Démarrer les vérifications après 5s, puis le premier tick après 15s total
  setTimeout(initialChecks, 5_000);
  setTimeout(
    () => safeTick().catch((e) => {
      if (e instanceof MetaTokenError) stopDueToTokenError(e);
      else console.error(`${LOG} first tick failed:`, e);
    }),
    15_000
  );

  intervalId = setInterval(
    () => safeTick().catch((e) => {
      if (e instanceof MetaTokenError) stopDueToTokenError(e);
      else console.error(`${LOG} tick failed:`, e);
    }),
    POLL_INTERVAL_MS
  );
  (intervalId as any).unref?.();

  console.log(`${LOG} started — polling every ${POLL_INTERVAL_MS / 1000}s (DEBUG MODE)`);
}
