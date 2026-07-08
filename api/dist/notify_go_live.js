import { pool } from "./db.js";
import webpush from "web-push";
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, } from "discord.js";
import { FABIO_STREAMER_ID, FABIO_NOTIF_CHANNEL_ID, FABIO_ROLE_NOTIF_STREAM } from "./discord/constants.js";
import { sendMail, isMailReady } from "./utils/mailer.js";
// Cooldown Discord/email persistant en DB (colonne streamers.discord_notif_last_sent_at).
// Survit aux redeploys et bloque les fausses transitions offline→online des pollers.
// Configurable via env DISCORD_NOTIF_COOLDOWN_MIN, default 120 min (2h).
// Une seule fenêtre partagée pour les 3 canaux "annonce" (Fabio dédié, Discord
// générique LunaLive, email followers) — le toast socket et le Web Push ne
// sont PAS concernés par ce cooldown (voir bas de fichier).
function getDiscordNotifCooldownMin() {
    const raw = Number(process.env.DISCORD_NOTIF_COOLDOWN_MIN);
    if (!Number.isFinite(raw) || raw <= 0)
        return 120;
    return Math.max(1, Math.floor(raw));
}
/**
 * Tente de "claim" le slot de notification pour un streamer de façon atomique.
 * Renvoie true si la notif peut être envoyée (et marque le timestamp), false sinon.
 */
async function claimDiscordNotifSlot(streamerId) {
    const cooldownMin = getDiscordNotifCooldownMin();
    const r = await pool.query(`UPDATE streamers
     SET discord_notif_last_sent_at = NOW()
     WHERE id = $1
       AND (
         discord_notif_last_sent_at IS NULL
         OR discord_notif_last_sent_at < NOW() - ($2::int * INTERVAL '1 minute')
       )
     RETURNING 1`, [streamerId, cooldownMin]);
    return (r.rowCount ?? 0) > 0;
}
let vapidReady = false;
function ensureVapid() {
    if (vapidReady)
        return;
    vapidReady = true;
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
        console.warn("[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing => system push disabled");
        return;
    }
    const subject = process.env.VAPID_SUBJECT ||
        (process.env.MAIL_FROM ? `mailto:${process.env.MAIL_FROM}` : "mailto:admin@localhost");
    webpush.setVapidDetails(subject, pub, priv);
}
// ─── Annonce Discord générique — serveur communautaire LunaLive ────────────
let goLiveChannelWarnLogged = false;
async function sendGenericGoLiveAnnouncement(discordClient, opts) {
    const channelId = String(process.env.DISCORD_GOLIVE_CHANNEL_ID || "").trim();
    if (!channelId) {
        if (!goLiveChannelWarnLogged) {
            goLiveChannelWarnLogged = true;
            console.warn("[notify_go_live] DISCORD_GOLIVE_CHANNEL_ID absent — annonce Discord générique désactivée");
        }
        return;
    }
    if (!discordClient)
        return;
    try {
        const channel = await discordClient.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased())
            return;
        const streamUrl = `${opts.webBase}/s/${encodeURIComponent(opts.slug)}`;
        const roleId = String(process.env.DISCORD_GOLIVE_ROLE_ID || "").trim();
        const embed = new EmbedBuilder()
            .setColor(0xa78bfa)
            .setTitle(`🔴 ${opts.displayName} est en live !`)
            .setURL(streamUrl)
            .setTimestamp(new Date());
        if (opts.title)
            embed.setDescription(`**${opts.title}**`);
        if (opts.thumbnailUrl)
            embed.setThumbnail(opts.thumbnailUrl);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Regarder sur LunaLive").setURL(streamUrl));
        const sendPayload = { embeds: [embed], components: [row] };
        if (roleId) {
            sendPayload.content = `<@&${roleId}>`;
            sendPayload.allowedMentions = { parse: ["roles"] };
        }
        await channel.send(sendPayload);
    }
    catch (e) {
        console.warn("[notify_go_live] annonce Discord générique échouée:", e?.message);
    }
}
// ─── Email go-live aux followers (DA LunaLive) ──────────────────────────────
const EMAIL_RECIPIENTS_CAP = 500;
const EMAIL_SEND_DELAY_MS = 150;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function buildGoLiveEmailHtml(displayName, title, slug) {
    const streamUrl = `https://lunalive.win/s/${encodeURIComponent(slug)}?utm_source=email&utm_medium=golive`;
    const safeDisplayName = escapeHtml(displayName);
    const safeTitle = title ? escapeHtml(title) : "";
    return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#0b0a12;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0a12;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#16121f;border-radius:16px;overflow:hidden;border:1px solid rgba(167,139,250,0.2);">
            <tr>
              <td style="padding:28px 28px 0 28px;text-align:center;">
                <span style="font-size:22px;font-weight:700;color:#c4b5fd;">🌙 LunaLive</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px 28px;text-align:center;">
                <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;font-weight:700;">
                  ${safeDisplayName} vient de lancer son live
                </h1>
              </td>
            </tr>
            ${safeTitle ? `<tr>
              <td style="padding:0 28px 24px 28px;text-align:center;">
                <p style="margin:0;font-size:15px;line-height:1.5;color:#c9c4d8;">${safeTitle}</p>
              </td>
            </tr>` : ""}
            <tr>
              <td style="padding:8px 28px 32px 28px;text-align:center;">
                <a href="${streamUrl}" style="display:inline-block;padding:14px 32px;border-radius:12px;background:linear-gradient(135deg,#a78bfa,#7c5cf0);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                  Regarder le live
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid rgba(167,139,250,0.15);text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#71697f;">
                  Tu reçois cet email car tu as activé la cloche pour ce streamer sur LunaLive. Gère tes notifications depuis la page du streamer.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
async function sendGoLiveEmails(streamerId, opts) {
    if (!isMailReady())
        return;
    const r = await pool.query(`SELECT u.id AS user_id, u.email
     FROM streamer_follows sf
     JOIN users u ON u.id = sf.user_id
     WHERE sf.streamer_id = $1
       AND sf.notify_enabled = TRUE
       AND u.email IS NOT NULL
       AND u.email_verified = TRUE
     ORDER BY sf.created_at ASC
     LIMIT ${EMAIL_RECIPIENTS_CAP}`, [streamerId]);
    if (!r.rows.length)
        return;
    const subject = `🔴 ${opts.displayName} est en live sur LunaLive !`;
    const html = buildGoLiveEmailHtml(opts.displayName, opts.title, opts.slug);
    const text = `${opts.displayName} vient de lancer son live sur LunaLive !` +
        (opts.title ? ` ${opts.title}` : "") +
        ` Regarde ici : https://lunalive.win/s/${encodeURIComponent(opts.slug)}?utm_source=email&utm_medium=golive`;
    let ok = 0;
    let fail = 0;
    for (const row of r.rows) {
        const email = String(row.email || "").trim();
        if (!email)
            continue;
        try {
            await sendMail(email, subject, text, html);
            ok++;
        }
        catch (e) {
            fail++;
            console.warn(`[notify_go_live] email go-live échoué (user ${row.user_id}):`, e?.message || e);
        }
        await sleep(EMAIL_SEND_DELAY_MS);
    }
    console.log(`[notify_go_live] emails go-live streamer ${streamerId}: ${ok} envoyés, ${fail} échecs`);
}
export async function notifyFollowersGoLive(io, streamerId) {
    const s = await pool.query(`SELECT id, slug, display_name AS "displayName", title
     FROM streamers
     WHERE id=$1
     LIMIT 1`, [streamerId]);
    const streamer = s.rows?.[0];
    if (!streamer)
        return;
    const slug = String(streamer.slug || "").trim();
    const displayName = String(streamer.displayName || slug);
    const title = String(streamer.title || "").trim();
    // URL vers le site (à adapter à ton routing front)
    const baseWeb = String(process.env.PUBLIC_WEB_BASE || "").replace(/\/$/, "");
    const url = baseWeb
        ? `${baseWeb}/s/${encodeURIComponent(slug)}`
        : `/s/${encodeURIComponent(slug)}`;
    // Variante toujours absolue (avec fallback), utilisée par les canaux Discord.
    const webBase = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");
    const payload = {
        type: "go_live",
        streamerId: Number(streamer.id),
        slug,
        displayName,
        title,
        url,
        ts: new Date().toISOString(),
    };
    // followers avec cloche activée
    const f = await pool.query(`SELECT user_id
     FROM streamer_follows
     WHERE streamer_id=$1 AND notify_enabled=TRUE`, [streamerId]);
    // ─── Discord (Fabio dédié + annonce générique) + email followers ───────────
    // Cooldown partagé (colonne streamers.discord_notif_last_sent_at) : une seule
    // vérification/màj gate les 3 canaux, pour ne pas spam sur des transitions
    // offline→online qui flappent (poller instable / redeploy).
    const claimed = await claimDiscordNotifSlot(streamerId);
    if (!claimed) {
        console.log(`[notify_go_live] notifs Discord/email skipped for streamer ${streamerId} (cooldown ${getDiscordNotifCooldownMin()}min)`);
    }
    else {
        const rumbleRow = await pool.query(`SELECT thumbnail_url FROM streamer_rumble_info WHERE streamer_id = $1 LIMIT 1`, [streamerId]);
        const thumbnailUrl = rumbleRow.rows[0]?.thumbnail_url ?? null;
        const discordClient = global.discordClient;
        // Fabiozsis (indépendant des followers LunaLive) — vers SON propre serveur
        if (streamerId === FABIO_STREAMER_ID && discordClient) {
            try {
                const ch = await discordClient.channels.fetch(FABIO_NOTIF_CHANNEL_ID).catch(() => null);
                if (ch?.isTextBased?.()) {
                    await ch.send({
                        content: `@everyone <@&${FABIO_ROLE_NOTIF_STREAM}>`,
                        embeds: [{
                                title: `🔴 ${displayName} est en live !`,
                                description: (title ? `**${title}**\n\n` : "") +
                                    `Viens nous rejoindre en stream, c'est parti ! 🎰\n\n` +
                                    `🌐 [Regarder sur LunaLive](${webBase}/s/${encodeURIComponent(slug)})\n` +
                                    `📺 [Regarder sur Rumble](https://rumble.com/user/FabiozsisTV/live)`,
                                color: 0xFF0000,
                                ...(thumbnailUrl ? { image: { url: thumbnailUrl } } : {}),
                                footer: { text: "Fabiozsis • Live Casino" },
                                timestamp: new Date().toISOString(),
                            }],
                        allowedMentions: { parse: ["everyone", "roles"] },
                    });
                }
            }
            catch (e) {
                console.warn("[notify_go_live] Fabiozsis Discord notif failed:", e?.message);
            }
        }
        // Annonce Discord générique — serveur communautaire LunaLive (tous les streamers)
        await sendGenericGoLiveAnnouncement(discordClient, { displayName, title, slug, webBase, thumbnailUrl });
        // Email aux followers ayant la cloche activée
        await sendGoLiveEmails(streamerId, { displayName, title, slug });
    }
    const userIds = f.rows.map((r) => Number(r.user_id)).filter((n) => Number.isFinite(n) && n > 0);
    if (!userIds.length)
        return;
    // ✅ A) toast socket (uniquement si site ouvert / socket connecté)
    if (io) {
        for (const uid of userIds) {
            io.to(`user:${uid}`).emit("notify:go_live", payload);
        }
    }
    // ✅ B) system push (même si site fermé) si VAPID + subscriptions
    ensureVapid();
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
        return;
    const subs = await pool.query(`SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = ANY($1::int[])`, [userIds]);
    const body = JSON.stringify(payload);
    for (const row of subs.rows) {
        const subscription = {
            endpoint: String(row.endpoint),
            keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
        };
        try {
            await webpush.sendNotification(subscription, body, { TTL: 60 });
        }
        catch (e) {
            const status = e?.statusCode ?? e?.status;
            // 410/404 => subscription morte => cleanup
            if (status === 404 || status === 410) {
                await pool.query(`DELETE FROM push_subscriptions WHERE id=$1`, [row.id]);
            }
            else {
                console.warn("[push] send failed", status, e?.message || e);
            }
        }
    }
}
