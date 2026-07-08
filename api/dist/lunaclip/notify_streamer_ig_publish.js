// api/src/lunaclip/notify_streamer_ig_publish.ts
//
// Notifie un streamer (DM Discord uniquement) à CHAQUE publication réussie
// d'un de ses clips sur l'Instagram officiel de LunaLive.
//
// Deux variantes selon l'état du compte IG du streamer :
//
//   ┌──────────────────────────┬─────────────────────────────────────────────┐
//   │ collabInvited = true     │ Meta a bien envoyé une invitation collab.   │
//   │                          │ → DM "accepte l'invitation sur Instagram"   │
//   ├──────────────────────────┼─────────────────────────────────────────────┤
//   │ collabInvited = false    │ Pas de compte IG lié (ou collab rejetée).   │
//   │                          │ → DM "demande la mention via #salon"        │
//   └──────────────────────────┴─────────────────────────────────────────────┘
//
// Idempotent / silencieux : ne fait jamais planter le scheduler.
//
// Logo : api/assets/logo.png joint en attachment Discord (rendu fiable).
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, } from "discord.js";
const LOG = "[ig-publish-notify]";
const LUNALIVE_RADIO_SLUGS = new Set(["lunalive", "lunalive-2424"]);
const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");
const COLLAB_REQUEST_CHANNEL_ID = "1467142337460437255";
const DISCORD_INVITE_URL = "https://discord.gg/VSbCZQ4gyT";
const IG_ACTIVITY_URL = "https://www.instagram.com/accounts/activity/";
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirnameLocal, "../../assets/logo.png");
let _logoBuffer = null;
function getLogoBuffer() {
    if (_logoBuffer)
        return _logoBuffer;
    try {
        _logoBuffer = fs.readFileSync(LOGO_PATH);
        return _logoBuffer;
    }
    catch (e) {
        console.warn(`${LOG} logo introuvable à ${LOGO_PATH}: ${e?.message}`);
        return null;
    }
}
async function loadStreamerInfo(pool, streamerSlug) {
    const r = await pool.query(`SELECT
       s.slug                    AS slug,
       s.display_name            AS display_name,
       dl.discord_user_id        AS discord_user_id,
       sic.instagram_username    AS instagram_username
     FROM streamers s
     LEFT JOIN discord_links dl ON dl.user_id = s.user_id
     LEFT JOIN streamer_ig_config sic
       ON LOWER(sic.streamer_slug) = LOWER(s.slug) AND sic.active = true
     WHERE LOWER(s.slug) = LOWER($1)
     LIMIT 1`, [streamerSlug]);
    const row = r.rows?.[0];
    if (!row)
        return null;
    return {
        slug: String(row.slug || "").toLowerCase(),
        displayName: String(row.display_name || row.slug || ""),
        discordUserId: row.discord_user_id ? String(row.discord_user_id) : null,
        instagramUsername: row.instagram_username ? String(row.instagram_username) : null,
    };
}
async function fetchThumbnailBuffer(thumbnailUrl) {
    if (!thumbnailUrl)
        return null;
    try {
        const r = await fetch(thumbnailUrl);
        if (!r.ok)
            return null;
        return Buffer.from(await r.arrayBuffer());
    }
    catch {
        return null;
    }
}
const SEPARATOR = "─────────────────────────";
function buildEmbedMentionVariant(opts) {
    const STREAMER_PAGE = `${PUBLIC_WEB_BASE}/s/${opts.streamerSlug}`;
    const embed = new EmbedBuilder()
        .setColor(0x9D4BFF)
        .setAuthor({
        name: "LunaLive  •  Nouveau Reel publié",
        ...(opts.hasLogo ? { iconURL: "attachment://logo.png" } : {}),
        url: PUBLIC_WEB_BASE,
    })
        .setTitle(`🎬   Ton clip vient d'être publié sur Instagram !`)
        .setURL(opts.reelUrl)
        .setDescription(`Salut **${opts.streamerDisplayName}**  👋\n\n` +
        `Notre système **LunaClip** vient de publier automatiquement un clip extrait de ton stream sur le compte Instagram officiel de **LunaLive**.\n` +
        `​`)
        .addFields({ name: "🎞️   Clip publié", value: `**${opts.clipTitle}**`, inline: true }, { name: "📺   Streamer", value: `**${opts.streamerDisplayName}**\n[Voir la page](${STREAMER_PAGE})`, inline: true }, { name: "​", value: SEPARATOR, inline: false }, {
        name: "🤝   Tu veux apparaître sur tes propres clips ?",
        value: `Demande à être **mentionné(e)** ou ajouté(e) en **collaborateur officiel** : ` +
            `tes clips s'afficheront alors aussi automatiquement sur **ton propre profil Instagram**, ` +
            `dès leur publication.\n\n` +
            `👉 Fais ta demande dans <#${COLLAB_REQUEST_CHANNEL_ID}>  •  un admin te répondra rapidement.`,
        inline: false,
    })
        .setFooter({
        text: "LunaLive  •  Notification automatique de publication Instagram",
        ...(opts.hasLogo ? { iconURL: "attachment://logo.png" } : {}),
    })
        .setTimestamp(new Date());
    if (opts.hasLogo)
        embed.setThumbnail("attachment://logo.png");
    if (opts.hasThumb)
        embed.setImage("attachment://clip_preview.jpg");
    return embed;
}
function buildEmbedCollabVariant(opts) {
    const STREAMER_PAGE = `${PUBLIC_WEB_BASE}/s/${opts.streamerSlug}`;
    const embed = new EmbedBuilder()
        .setColor(0x9D4BFF)
        .setAuthor({
        name: "LunaLive  •  Nouveau Reel publié",
        ...(opts.hasLogo ? { iconURL: "attachment://logo.png" } : {}),
        url: PUBLIC_WEB_BASE,
    })
        .setTitle(`🎬   Ton clip vient d'être publié sur Instagram !`)
        .setURL(opts.reelUrl)
        .setDescription(`Salut **${opts.streamerDisplayName}**  👋\n\n` +
        `Notre système **LunaClip** vient de publier un clip extrait de ton stream sur le compte Instagram officiel de **LunaLive**, ` +
        `et on t'a invité(e) comme **collaborateur officiel** (@${opts.instagramUsername}).\n` +
        `​`)
        .addFields({ name: "🎞️   Clip publié", value: `**${opts.clipTitle}**`, inline: true }, { name: "📺   Streamer", value: `**${opts.streamerDisplayName}**\n[Voir la page](${STREAMER_PAGE})`, inline: true }, { name: "​", value: SEPARATOR, inline: false }, {
        name: "✅   Action requise — accepte l'invitation collab",
        value: `Pour que ce Reel apparaisse aussi **sur ton propre profil Instagram**, il faut accepter ` +
            `l'invitation de collaboration que **@lunalive_tv** vient de t'envoyer.\n\n` +
            `📲 Ouvre Instagram → onglet **Activité** (cœur en haut) → section **Demandes** ou **Tags**\n` +
            `*ou bien ouvre directement le Reel ci-dessous, l'invite y apparaît aussi.*\n\n` +
            `Une fois accepté, le clip sera visible sur ton feed et bénéficiera de la double audience 🚀`,
        inline: false,
    })
        .setFooter({
        text: "LunaLive  •  Notification automatique de publication Instagram",
        ...(opts.hasLogo ? { iconURL: "attachment://logo.png" } : {}),
    })
        .setTimestamp(new Date());
    if (opts.hasLogo)
        embed.setThumbnail("attachment://logo.png");
    if (opts.hasThumb)
        embed.setImage("attachment://clip_preview.jpg");
    return embed;
}
function buildButtonsMention(reelUrl, streamerSlug) {
    const STREAMER_PAGE = `${PUBLIC_WEB_BASE}/s/${streamerSlug}`;
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📸  Voir le Reel").setURL(reelUrl), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📺  Ma page LunaLive").setURL(STREAMER_PAGE), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("💬  Discord LunaLive").setURL(DISCORD_INVITE_URL));
}
function buildButtonsCollab(reelUrl, streamerSlug) {
    const STREAMER_PAGE = `${PUBLIC_WEB_BASE}/s/${streamerSlug}`;
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📸  Voir le Reel").setURL(reelUrl), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("🔔  Activité Instagram").setURL(IG_ACTIVITY_URL), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📺  Ma page LunaLive").setURL(STREAMER_PAGE));
}
/**
 * À appeler après chaque publication IG réussie.
 *
 * - `collabInvited=true`  → variante "accepte la collab Instagram"
 *                           (Meta a bien envoyé l'invitation à @instagramUsername).
 * - `collabInvited=false` → variante "demande la mention via Discord"
 *                           (pas de compte IG lié, ou Meta a rejeté la collab).
 *
 * Silencieux en cas d'erreur — ne doit jamais faire planter le scheduler.
 */
export async function notifyStreamerOfIgPublish(opts) {
    const { pool, streamerSlug, clipTitle, reelUrl, thumbnailUrl, collabInvited, jobId } = opts;
    try {
        if (LUNALIVE_RADIO_SLUGS.has(streamerSlug.toLowerCase()))
            return;
        const info = await loadStreamerInfo(pool, streamerSlug);
        if (!info) {
            console.log(`${LOG} [job #${jobId}] streamer ${streamerSlug} introuvable — skip`);
            return;
        }
        if (!info.discordUserId) {
            console.log(`${LOG} [job #${jobId}] ${streamerSlug} sans discord_links — DM impossible`);
            return;
        }
        const client = global.discordClient;
        if (!client) {
            console.warn(`${LOG} [job #${jobId}] Discord client absent — skip`);
            return;
        }
        const [logoBuf, thumbBuf] = await Promise.all([
            Promise.resolve(getLogoBuffer()),
            fetchThumbnailBuffer(thumbnailUrl),
        ]);
        const files = [];
        if (logoBuf)
            files.push(new AttachmentBuilder(logoBuf, { name: "logo.png" }));
        if (thumbBuf)
            files.push(new AttachmentBuilder(thumbBuf, { name: "clip_preview.jpg" }));
        const useCollab = collabInvited && !!info.instagramUsername;
        const embed = useCollab
            ? buildEmbedCollabVariant({
                streamerDisplayName: info.displayName,
                streamerSlug: info.slug,
                instagramUsername: info.instagramUsername,
                reelUrl, clipTitle,
                hasLogo: !!logoBuf, hasThumb: !!thumbBuf,
            })
            : buildEmbedMentionVariant({
                streamerDisplayName: info.displayName,
                streamerSlug: info.slug,
                reelUrl, clipTitle,
                hasLogo: !!logoBuf, hasThumb: !!thumbBuf,
            });
        const row = useCollab
            ? buildButtonsCollab(reelUrl, info.slug)
            : buildButtonsMention(reelUrl, info.slug);
        const user = await client.users.fetch(info.discordUserId);
        await user.send({ embeds: [embed], components: [row], files });
        console.log(`${LOG} [job #${jobId}] ✅ DM envoyé à ${info.slug} (${user.tag}) variant=${useCollab ? "collab" : "mention"}`);
    }
    catch (e) {
        console.warn(`${LOG} [job #${opts.jobId}] échec: ${e?.message || e}`);
    }
}
