// api/src/lunaclip/notify_streamer.ts
//
// Notifie un streamer (email + DM Discord) la première fois que LunaClip
// crée automatiquement un clip pour lui — afin qu'il puisse soumettre les
// informations nécessaires pour être identifié / ajouté en collaborateur
// sur la page Instagram officielle de LunaLive.
//
// Règles :
//  - On ignore le compte radio LunaLive (slug "lunalive" / "lunalive-2424").
//  - On n'envoie rien si le streamer a déjà une config Instagram enregistrée
//    dans `streamer_ig_config` (= il est déjà au courant / déjà configuré).
//  - On dédoublonne via la table `clip_streamer_notifications` :
//    une seule notification par streamer, jamais répétée.
import { isMailReady, sendMail } from "../utils/mailer.js";
const LUNALIVE_RADIO_SLUGS = new Set(["lunalive", "lunalive-2424"]);
const DISCORD_INVITE_URL = "https://discord.gg/VSbCZQ4gyT";
const INSTAGRAM_URL = "https://www.instagram.com/lunalive_tv";
const PLATFORM_NAME = "LunaLive";
async function loadStreamerInfo(pool, streamerId) {
    const r = await pool.query(`SELECT
       s.slug                  AS slug,
       s.display_name          AS display_name,
       s.user_id               AS user_id,
       u.email                 AS email,
       u.email_verified        AS email_verified,
       dl.discord_user_id      AS discord_user_id
     FROM streamers s
     LEFT JOIN users u           ON u.id  = s.user_id
     LEFT JOIN discord_links dl  ON dl.user_id = s.user_id
     WHERE s.id = $1
     LIMIT 1`, [streamerId]);
    const row = r.rows?.[0];
    if (!row)
        return null;
    return {
        slug: String(row.slug || "").toLowerCase(),
        displayName: String(row.display_name || row.slug || ""),
        userId: row.user_id ? Number(row.user_id) : null,
        email: row.email ? String(row.email) : null,
        emailVerified: !!row.email_verified,
        discordUserId: row.discord_user_id ? String(row.discord_user_id) : null,
    };
}
async function hasIgConfig(pool, slug) {
    const r = await pool.query(`SELECT 1 FROM streamer_ig_config WHERE LOWER(streamer_slug) = $1 LIMIT 1`, [slug]);
    return !!r.rows?.[0];
}
async function alreadyNotified(pool, streamerId) {
    const r = await pool.query(`SELECT 1 FROM clip_streamer_notifications WHERE streamer_id = $1 LIMIT 1`, [streamerId]);
    return !!r.rows?.[0];
}
async function recordNotification(pool, streamerId, clipId, emailSent, discordSent) {
    await pool.query(`INSERT INTO clip_streamer_notifications(streamer_id, first_clip_id, email_sent, discord_sent)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (streamer_id) DO NOTHING`, [streamerId, clipId, emailSent, discordSent]);
}
function buildEmail(displayName) {
    const subject = `Un clip de votre stream a été créé automatiquement sur ${PLATFORM_NAME}`;
    const text = `Bonjour ${displayName},

Notre système de clip automatique LunaClip vient de générer un clip à partir de votre stream.
Ce clip pourra être publié sur le compte Instagram officiel de ${PLATFORM_NAME} : ${INSTAGRAM_URL}

Si vous souhaitez être identifié(e) sur la publication (mention / collaborateur), merci de contacter un administrateur sur notre Discord officiel : ${DISCORD_INVITE_URL}

Vous pourrez également y transmettre les informations utiles (compte Instagram, nom à afficher, préférences de mise en avant).

Ce message est automatique — vous ne le recevrez qu'une seule fois.

L'équipe ${PLATFORM_NAME}`;
    const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.5">
      <h2 style="margin:0 0 12px 0">Un clip de votre stream a été créé</h2>
      <p>Bonjour <strong>${escapeHtml(displayName)}</strong>,</p>
      <p>Notre système de clip automatique <strong>LunaClip</strong> vient de générer un clip à partir de votre stream.</p>
      <p>
        Ce clip pourra être publié sur le compte Instagram officiel de ${PLATFORM_NAME} :
        <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener">${INSTAGRAM_URL}</a>.
      </p>
      <p>
        Si vous souhaitez être <strong>identifié(e)</strong> sur la publication (mention / collaborateur),
        merci de contacter un administrateur sur notre Discord officiel :
        <a href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener">${DISCORD_INVITE_URL}</a>.
      </p>
      <p>Vous pourrez y transmettre les informations utiles (compte Instagram, nom à afficher, préférences de mise en avant).</p>
      <p style="color:#666;font-size:13px;margin-top:24px">
        Ce message est automatique — vous ne le recevrez qu'une seule fois.
      </p>
      <p style="margin-top:16px">— L'équipe ${PLATFORM_NAME}</p>
    </div>
  `;
    return { subject, text, html };
}
function buildDiscordMessage(displayName) {
    return [
        `Bonjour **${displayName}**,`,
        ``,
        `Notre système de clip automatique **LunaClip** vient de générer un clip à partir de votre stream.`,
        `Ce clip pourra être publié sur le compte Instagram officiel de ${PLATFORM_NAME} : ${INSTAGRAM_URL}`,
        ``,
        `Si vous souhaitez être identifié(e) sur la publication (mention / collaborateur), merci de contacter un administrateur sur le Discord officiel : ${DISCORD_INVITE_URL}`,
        ``,
        `Vous pouvez aussi y transmettre vos informations (compte Instagram, nom à afficher, préférences de mise en avant).`,
        ``,
        `_Ce message est automatique — vous ne le recevrez qu'une seule fois._`,
    ].join("\n");
}
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
async function trySendEmail(to, displayName) {
    if (!isMailReady())
        return false;
    const { subject, text, html } = buildEmail(displayName);
    try {
        await sendMail(to, subject, text, html);
        return true;
    }
    catch (e) {
        console.warn(`[clip-notify] email failed to ${to}: ${e?.message || e}`);
        return false;
    }
}
async function trySendDiscordDm(discordUserId, displayName) {
    const client = global.discordClient;
    if (!client)
        return false;
    try {
        const u = await client.users.fetch(discordUserId);
        await u.send(buildDiscordMessage(displayName));
        return true;
    }
    catch (e) {
        console.warn(`[clip-notify] discord DM failed to ${discordUserId}: ${e?.message || e}`);
        return false;
    }
}
/**
 * À appeler après la création réussie d'un clip auto par LunaClip.
 * Idempotent : n'envoie qu'une seule notification par streamer (jamais).
 * Silencieux en cas d'erreur — ne doit jamais faire planter la création de clip.
 */
export async function notifyStreamerOfFirstAutoClip(pool, streamerId, clipId) {
    try {
        const info = await loadStreamerInfo(pool, streamerId);
        if (!info)
            return;
        if (LUNALIVE_RADIO_SLUGS.has(info.slug))
            return;
        if (await alreadyNotified(pool, streamerId))
            return;
        if (await hasIgConfig(pool, info.slug)) {
            // déjà configuré → on enregistre quand même pour ne plus repasser ici
            await recordNotification(pool, streamerId, clipId, false, false);
            return;
        }
        let emailSent = false;
        let discordSent = false;
        if (info.email) {
            emailSent = await trySendEmail(info.email, info.displayName);
        }
        if (info.discordUserId) {
            discordSent = await trySendDiscordDm(info.discordUserId, info.displayName);
        }
        await recordNotification(pool, streamerId, clipId, emailSent, discordSent);
    }
    catch (e) {
        console.warn(`[clip-notify] notifyStreamerOfFirstAutoClip failed (streamer=${streamerId}): ${e?.message || e}`);
    }
}
