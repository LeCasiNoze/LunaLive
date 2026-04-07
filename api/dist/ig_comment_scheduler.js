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
const POLL_INTERVAL_MS = 60 * 1000; // 1 minute
// ─────────────────────────────────────────────────────────────────────────────
// Phrases aléatoires
// ─────────────────────────────────────────────────────────────────────────────
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
// ─── Construction de la réponse publique au commentaire ───────────────────────
// Chaque partie est choisie aléatoirement pour éviter les doublons.
function buildCommentReply(streamerSlug) {
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
async function metaPost(path, params) {
    const res = await fetch(`https://graph.instagram.com/v19.0${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
    });
    const data = (await res.json());
    if (data?.error) {
        throw new Error(`Meta API error [${data.error.code}] ${data.error.type}: ${data.error.message}`);
    }
    return data;
}
// Token invalidity codes — [190] = expired/logged out, [102] = session expired
const TOKEN_INVALID_CODES = new Set([190, 102, 463, 467]);
class MetaTokenError extends Error {
    constructor(code, message) {
        super(`Meta API error [${code}]: ${message}`);
        this.name = "MetaTokenError";
    }
}
async function metaGet(path, params) {
    const url = new URL(`https://graph.instagram.com/v19.0${path}`);
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    const res = await fetch(url.toString());
    const data = (await res.json());
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
async function verifyInstagramConnectivity(accessToken, userId) {
    const userData = await metaGet(`/${userId}`, {
        fields: "id,username",
        access_token: accessToken,
    });
    console.log(`${LOG} ✅ Connecté — @${userData.username} (id=${userData.id})`);
    return String(userData.username ?? "");
}
// ─────────────────────────────────────────────────────────────────────────────
// Traitement d'un post
// ─────────────────────────────────────────────────────────────────────────────
async function processTrackedPost(row, config, accessToken, userId, botUsername // username du compte bot — ses propres commentaires sont ignorés
) {
    // Récupérer les commentaires du post
    let commentsData;
    try {
        commentsData = await metaGet(`/${row.media_id}/comments`, {
            fields: "id,text,username,timestamp,from",
            access_token: accessToken,
        });
    }
    catch (e) {
        console.error(`${LOG} [tracking #${row.id}] ❌ fetch comments: ${e?.message ?? e}`);
        return;
    }
    const comments = commentsData?.data ?? [];
    const triggerLower = config.trigger_word.toLowerCase();
    let processedCount = 0;
    let skippedCount = 0;
    for (const comment of comments) {
        const commentText = String(comment.text ?? "");
        const commentId = String(comment.id ?? "");
        const username = String(comment.username ?? comment.from?.username ?? "");
        if (!commentId || !username) {
            skippedCount++;
            continue;
        }
        // Ignorer les commentaires du bot lui-même (par userId ou username)
        const fromId = String(comment.from?.id ?? "");
        if ((fromId && fromId === userId) || (botUsername && username === botUsername)) {
            skippedCount++;
            continue;
        }
        // Anti-doublon
        const already = await pool.query(`SELECT 1 FROM ig_comment_replies WHERE comment_id = $1 LIMIT 1`, [commentId]);
        if ((already.rowCount ?? 0) > 0) {
            skippedCount++;
            continue;
        }
        // Filtre trigger_word
        if (!commentText.toLowerCase().includes(triggerLower)) {
            skippedCount++;
            continue;
        }
        console.log(`${LOG} [tracking #${row.id}] 🎯 COMMENT MATCH — id=${commentId} user=${username} text="${commentText.slice(0, 60)}"`);
        // ── Enregistrer d'abord (anti-doublon) — si rowCount=0 déjà traité ───
        let claimed = false;
        try {
            const insertResult = await pool.query(`INSERT INTO ig_comment_replies
           (comment_id, media_id, username, comment_text, dm_sent, dm_sent_at)
         VALUES ($1, $2, $3, $4, false, null)
         ON CONFLICT (comment_id) DO NOTHING`, [commentId, row.media_id, username, commentText.slice(0, 1000)]);
            claimed = (insertResult.rowCount ?? 0) > 0;
        }
        catch (e) {
            console.error(`${LOG} [tracking #${row.id}] ❌ anti-doublon INSERT échoué: ${e?.message ?? e}`);
            skippedCount++;
            continue;
        }
        if (!claimed) {
            skippedCount++;
            continue;
        }
        processedCount++;
        // ── Répondre au commentaire publiquement ──────────────────────────────
        const replyText = buildCommentReply(row.streamer_slug);
        try {
            await metaPost(`/${commentId}/replies`, {
                message: replyText,
                access_token: accessToken,
            });
            console.log(`${LOG} ✅ Reply — @${username} (comment=${commentId})`);
        }
        catch (e) {
            console.error(`${LOG} ❌ Reply échoué — comment=${commentId}: ${e?.message ?? e}`);
        }
    }
    if (processedCount > 0) {
        console.log(`${LOG} [tracking #${row.id}] ${processedCount} réponse(s) envoyée(s)`);
    }
    // Mettre à jour last_checked_at
    await pool.query(`UPDATE ig_comment_tracking SET last_checked_at = NOW() WHERE id = $1`, [row.id]);
}
// ─────────────────────────────────────────────────────────────────────────────
// Tick principal
// ─────────────────────────────────────────────────────────────────────────────
async function tick(accessToken, userId, botUsername) {
    // Posts encore dans la fenêtre de monitoring
    const { rows } = await pool.query(`
    SELECT id, publish_job_id, clip_id, streamer_slug, media_id, track_until
    FROM   ig_comment_tracking
    WHERE  track_until > NOW()
    ORDER BY last_checked_at ASC NULLS FIRST
  `);
    if (rows.length === 0)
        return;
    console.log(`${LOG} tick — ${rows.length} post(s) to check`);
    for (const row of rows) {
        // Vérifier config streamer active
        const cfgResult = await pool.query(`
      SELECT trigger_word, offer_label, process_info, discord_url, extra_url
      FROM   streamer_ig_config
      WHERE  LOWER(streamer_slug) = LOWER($1)
        AND  active = true
      LIMIT 1
    `, [row.streamer_slug]);
        if ((cfgResult.rowCount ?? 0) === 0)
            continue; // skip silencieux
        const config = cfgResult.rows[0];
        try {
            await processTrackedPost(row, config, accessToken, userId, botUsername);
        }
        catch (e) {
            console.error(`${LOG} [tracking #${row.id}] unexpected error: ${e?.message ?? e}`);
        }
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────
export function startIgCommentScheduler() {
    console.log(`${LOG} init...`);
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
    const userId = process.env.INSTAGRAM_USER_ID ?? "";
    if (!accessToken || !userId) {
        console.log(`${LOG} skipped — INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set`);
        return;
    }
    let running = false;
    let botUsername = "";
    let intervalId = null;
    const stopDueToTokenError = (err) => {
        console.error(`${LOG} 🔴 TOKEN EXPIRÉ — polling arrêté définitivement.`);
        console.error(`${LOG} 👉 Génère un nouveau long-lived token Meta et mets à jour INSTAGRAM_ACCESS_TOKEN sur Render.`);
        console.error(`${LOG}    Détail: ${err.message}`);
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
    const safeTick = async () => {
        if (running)
            return;
        running = true;
        try {
            await tick(accessToken, userId, botUsername);
        }
        catch (e) {
            if (e instanceof MetaTokenError) {
                stopDueToTokenError(e);
            }
            else {
                console.error(`${LOG} tick error: ${e?.message ?? e}`);
            }
        }
        finally {
            running = false;
        }
    };
    const initialChecks = async () => {
        try {
            botUsername = await verifyInstagramConnectivity(accessToken, userId);
        }
        catch (e) {
            if (e instanceof MetaTokenError)
                stopDueToTokenError(e);
            else
                console.error(`${LOG} ⚠️ Vérification initiale échouée: ${e?.message ?? e}`);
        }
    };
    // Démarrer les vérifications après 5s, puis le premier tick après 15s total
    setTimeout(initialChecks, 5_000);
    setTimeout(() => safeTick().catch((e) => {
        if (e instanceof MetaTokenError)
            stopDueToTokenError(e);
        else
            console.error(`${LOG} first tick failed:`, e);
    }), 15_000);
    intervalId = setInterval(() => safeTick().catch((e) => {
        if (e instanceof MetaTokenError)
            stopDueToTokenError(e);
        else
            console.error(`${LOG} tick failed:`, e);
    }), POLL_INTERVAL_MS);
    intervalId.unref?.();
    console.log(`${LOG} started — polling every ${POLL_INTERVAL_MS / 1000}s`);
}
