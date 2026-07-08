// api/src/lunaclip/notify_streamer.ts
//
// Notifie un streamer (DM Discord uniquement) à CHAQUE création automatique
// d'un clip LunaClip — tant qu'il n'a pas lié son compte Instagram dans
// `streamer_ig_config`.
//
// Règles :
//  - On ignore le compte radio LunaLive (slugs "lunalive" / "lunalive-2424").
//  - On envoie le DM tant que `streamer_ig_config.instagram_username` est
//    absent ou inactif. Une fois le compte IG lié → silence (le streamer
//    recevra à la place le DM "publication" avec invite collab).
//  - Pas de dédoublonnage lifetime : 1 DM par clip auto créé.
//
// Idempotent / silencieux : ne fait jamais planter la création de clip.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, } from "discord.js";
const LOG = "[clip-create-notify]";
const LUNALIVE_RADIO_SLUGS = new Set(["lunalive", "lunalive-2424"]);
const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");
const COLLAB_REQUEST_CHANNEL_ID = "1467142337460437255";
const DISCORD_INVITE_URL = "https://discord.gg/VSbCZQ4gyT";
const SEPARATOR = "─────────────────────────";
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
        console.warn(`${LOG} logo introuvable: ${e?.message}`);
        return null;
    }
}
async function loadStreamerInfo(pool, streamerId) {
    const r = await pool.query(`SELECT
       s.slug                                              AS slug,
       s.display_name                                      AS display_name,
       dl.discord_user_id                                  AS discord_user_id,
       (sic.instagram_username IS NOT NULL AND sic.active) AS has_ig_config
     FROM streamers s
     LEFT JOIN discord_links dl  ON dl.user_id = s.user_id
     LEFT JOIN streamer_ig_config sic
       ON LOWER(sic.streamer_slug) = LOWER(s.slug)
     WHERE s.id = $1
     LIMIT 1`, [streamerId]);
    const row = r.rows?.[0];
    if (!row)
        return null;
    return {
        slug: String(row.slug || "").toLowerCase(),
        displayName: String(row.display_name || row.slug || ""),
        discordUserId: row.discord_user_id ? String(row.discord_user_id) : null,
        hasIgConfig: !!row.has_ig_config,
    };
}
async function loadClipInfo(pool, clipId) {
    const r = await pool.query(`SELECT title, thumb_url FROM clip_inbox WHERE clip_id = $1 LIMIT 1`, [clipId]);
    const row = r.rows?.[0];
    if (!row)
        return null;
    return {
        title: String(row.title || "Clip sans titre"),
        thumbUrl: row.thumb_url ? String(row.thumb_url) : null,
    };
}
async function fetchBuffer(url) {
    if (!url)
        return null;
    try {
        const r = await fetch(url);
        if (!r.ok)
            return null;
        return Buffer.from(await r.arrayBuffer());
    }
    catch {
        return null;
    }
}
function buildEmbed(opts) {
    const STREAMER_PAGE = `${PUBLIC_WEB_BASE}/s/${opts.streamerSlug}`;
    const embed = new EmbedBuilder()
        .setColor(0x9D4BFF)
        .setAuthor({
        name: "LunaLive  •  Nouveau clip généré",
        ...(opts.hasLogo ? { iconURL: "attachment://logo.png" } : {}),
        url: PUBLIC_WEB_BASE,
    })
        .setTitle(`🎬   Un clip de ton stream vient d'être créé !`)
        .setURL(STREAMER_PAGE)
        .setDescription(`Salut **${opts.streamerDisplayName}**  👋\n\n` +
        `Notre système **LunaClip** vient de générer automatiquement un clip à partir de ton stream. ` +
        `Une fois validé par notre équipe, il pourra être publié sur le compte Instagram officiel de **LunaLive** ([@lunalive_tv](https://www.instagram.com/lunalive_tv)).\n` +
        `​`)
        .addFields({ name: "🎞️   Clip généré", value: `**${opts.clipTitle}**`, inline: true }, { name: "📺   Streamer", value: `**${opts.streamerDisplayName}**\n[Voir la page](${STREAMER_PAGE})`, inline: true }, { name: "​", value: SEPARATOR, inline: false }, {
        name: "🤝   Tu veux apparaître sur tes propres clips ?",
        value: `Demande à être **mentionné(e)** ou ajouté(e) en **collaborateur officiel** sur les Reels qui te concernent : ` +
            `tes clips s'afficheront alors aussi automatiquement sur **ton propre profil Instagram**, dès leur publication.\n\n` +
            `👉 Fais ta demande dans <#${COLLAB_REQUEST_CHANNEL_ID}>  •  un admin te répondra rapidement.`,
        inline: false,
    })
        .setFooter({
        text: "LunaLive  •  Notification automatique de création de clip",
        ...(opts.hasLogo ? { iconURL: "attachment://logo.png" } : {}),
    })
        .setTimestamp(new Date());
    if (opts.hasLogo)
        embed.setThumbnail("attachment://logo.png");
    if (opts.hasThumb)
        embed.setImage("attachment://clip_preview.jpg");
    return embed;
}
function buildButtons(streamerSlug) {
    const STREAMER_PAGE = `${PUBLIC_WEB_BASE}/s/${streamerSlug}`;
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📺  Ma page LunaLive").setURL(STREAMER_PAGE), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("💬  Discord LunaLive").setURL(DISCORD_INVITE_URL));
}
/**
 * À appeler après chaque création réussie d'un clip auto par LunaClip.
 * Silencieux en cas d'erreur — ne doit jamais faire planter la création de clip.
 *
 * Dédup : aucune (1 DM par clip auto), sauf si le streamer a déjà lié son IG
 * (`streamer_ig_config.instagram_username` actif) → dans ce cas, silence
 * (il recevra le DM "publication + collab" plus tard).
 */
export async function notifyStreamerOfAutoClip(pool, streamerId, clipId) {
    try {
        const info = await loadStreamerInfo(pool, streamerId);
        if (!info)
            return;
        if (LUNALIVE_RADIO_SLUGS.has(info.slug))
            return;
        if (info.hasIgConfig) {
            console.log(`${LOG} ${info.slug} a déjà un IG config — silence à la création`);
            return;
        }
        if (!info.discordUserId) {
            console.log(`${LOG} ${info.slug} sans discord_links — DM impossible`);
            return;
        }
        const client = global.discordClient;
        if (!client) {
            console.warn(`${LOG} Discord client absent — skip`);
            return;
        }
        const clip = await loadClipInfo(pool, clipId);
        if (!clip) {
            console.warn(`${LOG} clip ${clipId} introuvable — skip`);
            return;
        }
        const [logoBuf, thumbBuf] = await Promise.all([
            Promise.resolve(getLogoBuffer()),
            fetchBuffer(clip.thumbUrl),
        ]);
        const files = [];
        if (logoBuf)
            files.push(new AttachmentBuilder(logoBuf, { name: "logo.png" }));
        if (thumbBuf)
            files.push(new AttachmentBuilder(thumbBuf, { name: "clip_preview.jpg" }));
        const embed = buildEmbed({
            streamerDisplayName: info.displayName,
            streamerSlug: info.slug,
            clipTitle: clip.title,
            hasLogo: !!logoBuf,
            hasThumb: !!thumbBuf,
        });
        const row = buildButtons(info.slug);
        const user = await client.users.fetch(info.discordUserId);
        await user.send({ embeds: [embed], components: [row], files });
        console.log(`${LOG} ✅ DM envoyé à ${info.slug} (${user.tag}) — clip #${clipId}`);
    }
    catch (e) {
        console.warn(`${LOG} échec (streamer=${streamerId} clip=${clipId}): ${e?.message || e}`);
    }
}
// Alias rétro-compat — l'ancien nom `notifyStreamerOfFirstAutoClip` est encore
// importé dans api/src/shared/clip_service.ts. Le comportement a changé (plus
// de dédup lifetime), mais la signature est la même.
export const notifyStreamerOfFirstAutoClip = notifyStreamerOfAutoClip;
