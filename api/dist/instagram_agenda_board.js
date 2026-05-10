// api/src/instagram_agenda_board.ts
//
// Tableau auto-actualisé des Reels Instagram publiés (catégorie AGENCE,
// salon ┊📸・instagram-agenda). Mode "1 message édité en place" + bouton
// refresh, comme agency_fees_board.
//
// Source : table publish_jobs (status='done', platform='instagram') filtrée
// sur les 30 derniers jours. Les stats (views, likes, comments) sont fetchées
// en live via Meta Graph API à chaque refresh — c'est le pipeline LunaClip
// qui a publié, mais les insights sont accessibles publiquement avec le token.
//
// Singleton stocké dans `instagram_agenda_board` (mig111).
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, } from "discord.js";
import { pool } from "./db.js";
const LOG = "[ig-agenda-board]";
export const IG_AGENDA_CHANNEL_ID = "1501899168082559146";
export const IG_AGENDA_REFRESH_CID = "instagram_agenda_board:refresh";
const REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
const FIRST_REFRESH_DELAY_MS = 90_000;
const WINDOW_DAYS = 30;
const REELS_LIMIT = 12;
const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.onrender.com").replace(/\/$/, "");
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirnameLocal, "../assets/logo.png");
let _logoBuffer = null;
function getLogoBuffer() {
    if (_logoBuffer)
        return _logoBuffer;
    try {
        _logoBuffer = fs.readFileSync(LOGO_PATH);
        return _logoBuffer;
    }
    catch {
        return null;
    }
}
const num = (n) => new Intl.NumberFormat("fr-FR").format(n);
function frenchDate(d) {
    return new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris", weekday: "short", day: "2-digit", month: "short",
    }).format(d);
}
// ── Meta API helper ──────────────────────────────────────────────────────────
async function metaGet(path, params) {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!token)
        return null;
    const url = new URL(`https://graph.instagram.com/v19.0${path}`);
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);
    try {
        const res = await fetch(url.toString());
        const data = await res.json();
        if (data?.error)
            return null;
        return data;
    }
    catch {
        return null;
    }
}
async function loadRecentReels() {
    const r = await pool.query(`
    SELECT
      pj.id::int          AS job_id,
      pj.clip_id::int     AS clip_id,
      pj.platform_url     AS permalink,
      pj.platform_id      AS platform_id,
      pj.title            AS title,
      pj.description      AS caption,
      pj.finished_at      AS finished_at,
      ci.streamer_slug    AS streamer_slug
    FROM publish_jobs pj
    LEFT JOIN clip_inbox ci ON ci.clip_id = pj.clip_id
    WHERE pj.platform = 'instagram'
      AND pj.status   = 'done'
      AND pj.finished_at >= NOW() - INTERVAL '${WINDOW_DAYS} days'
    ORDER BY pj.finished_at DESC
    LIMIT $1
    `, [REELS_LIMIT]);
    return r.rows.map((row) => ({
        jobId: Number(row.job_id),
        clipId: Number(row.clip_id),
        permalink: String(row.permalink || ""),
        platform_id: row.platform_id ? String(row.platform_id) : null,
        caption: row.caption ? String(row.caption) : (row.title || null),
        finished_at: new Date(row.finished_at),
        streamerSlug: String(row.streamer_slug || ""),
    }));
}
async function loadScheduled() {
    const r = await pool.query(`
    SELECT
      pj.id::int                 AS job_id,
      COALESCE(pj.title, ci.title, '(sans titre)') AS clip_title,
      ci.streamer_slug           AS streamer_slug,
      pj.scheduled_at            AS scheduled_at
    FROM publish_jobs pj
    LEFT JOIN clip_inbox ci ON ci.clip_id = pj.clip_id
    WHERE pj.platform = 'instagram'
      AND pj.status IN ('scheduled', 'uploading')
      AND (pj.scheduled_at IS NULL OR pj.scheduled_at <= NOW() + INTERVAL '60 days')
    ORDER BY pj.scheduled_at ASC NULLS LAST
    LIMIT 15
    `);
    return r.rows.map((row) => ({
        jobId: Number(row.job_id),
        clipTitle: String(row.clip_title || ""),
        streamerSlug: String(row.streamer_slug || ""),
        scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : new Date(),
    }));
}
async function enrichWithMetaStats(reels) {
    // Pour chaque Reel : 1 appel Meta Graph API (parallèle, max 6 simultanés)
    const concurrency = 6;
    for (let i = 0; i < reels.length; i += concurrency) {
        const batch = reels.slice(i, i + concurrency);
        await Promise.all(batch.map(async (r) => {
            if (!r.platform_id)
                return;
            const data = await metaGet(`/${r.platform_id}`, {
                fields: "like_count,comments_count,thumbnail_url",
            });
            if (!data)
                return;
            r.likes = Number(data.like_count ?? 0);
            r.comments = Number(data.comments_count ?? 0);
            r.thumbnailUrl = data.thumbnail_url || null;
            // Insights (plays/views) — endpoint séparé
            const ins = await metaGet(`/${r.platform_id}/insights`, {
                metric: "plays",
            });
            const plays = ins?.data?.find((x) => x.name === "plays")?.values?.[0]?.value;
            if (typeof plays === "number")
                r.views = plays;
        }));
    }
}
// ── Embed ────────────────────────────────────────────────────────────────────
function shortCaption(text, max = 80) {
    if (!text)
        return "_(sans titre)_";
    const first = text.split("\n")[0].replace(/#\S+/g, "").replace(/@\S+/g, "").trim();
    const out = first.length > max ? first.slice(0, max - 1) + "…" : first;
    return out || "_(sans titre)_";
}
function frenchDateTime(d) {
    return new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris", weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit",
    }).format(d);
}
function buildEmbed(reels, scheduled, hasLogo) {
    const totalLikes = reels.reduce((s, r) => s + (r.likes ?? 0), 0);
    const totalComments = reels.reduce((s, r) => s + (r.comments ?? 0), 0);
    const totalViews = reels.reduce((s, r) => s + (r.views ?? 0), 0);
    const embed = new EmbedBuilder()
        .setColor(0xE4405F)
        .setAuthor({
        name: "LunaLive  •  Instagram",
        ...(hasLogo ? { iconURL: "attachment://logo.png" } : {}),
        url: "https://www.instagram.com/lunalive_tv",
    })
        .setTitle(`📸   Agenda Instagram`)
        .setURL("https://www.instagram.com/lunalive_tv");
    if (hasLogo)
        embed.setThumbnail("attachment://logo.png");
    // ── Stats globales ──────────────────────────────────────────────────────
    embed.addFields({
        name: `📊   Stats des ${WINDOW_DAYS} derniers jours`,
        value: reels.length === 0
            ? "_Aucun Reel publié sur la période._"
            : `**${reels.length} Reel${reels.length > 1 ? "s" : ""} publié${reels.length > 1 ? "s" : ""}**\n` +
                `👁️  **${num(totalViews)}** vues   •   ❤️  **${num(totalLikes)}** likes   •   💬  **${num(totalComments)}** comments`,
        inline: false,
    });
    // ── Sorties prévues ─────────────────────────────────────────────────────
    if (scheduled.length === 0) {
        embed.addFields({
            name: "🗓️   Sorties prévues",
            value: "_Aucun Reel programmé pour le moment._",
            inline: false,
        });
    }
    else {
        const lines = scheduled.map((s) => {
            const slug = s.streamerSlug ? `**@${s.streamerSlug}** — ` : "";
            const when = s.scheduledAt
                ? frenchDateTime(s.scheduledAt)
                : "_(date non définie)_";
            return `• \`${when}\`  ·  ${slug}${shortCaption(s.clipTitle)}`;
        });
        embed.addFields({
            name: `🗓️   Sorties prévues  (${scheduled.length})`,
            value: lines.join("\n").slice(0, 1024),
            inline: false,
        });
    }
    // Image grande = thumbnail du Reel le plus récent (s'il existe)
    const lastWithThumb = reels.find(r => r.thumbnailUrl);
    if (lastWithThumb?.thumbnailUrl)
        embed.setImage(lastWithThumb.thumbnailUrl);
    embed.setFooter({
        text: "LunaLive  •  Refresh auto toutes les 24h",
        ...(hasLogo ? { iconURL: "attachment://logo.png" } : {}),
    })
        .setTimestamp(new Date());
    return embed;
}
function buildButtons() {
    return new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(IG_AGENDA_REFRESH_CID)
        .setLabel("🔄  Actualiser maintenant")
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("📸  Profil Instagram")
        .setURL("https://www.instagram.com/lunalive_tv"));
}
// ── Refresh ──────────────────────────────────────────────────────────────────
let _inFlight = false;
export async function refreshInstagramAgenda() {
    if (_inFlight)
        return;
    _inFlight = true;
    try {
        const client = global.discordClient;
        if (!client)
            return;
        const channel = await client.channels.fetch(IG_AGENDA_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased())
            return;
        const [reels, scheduled] = await Promise.all([loadRecentReels(), loadScheduled()]);
        if (reels.length > 0)
            await enrichWithMetaStats(reels);
        const logoBuf = getLogoBuffer();
        const embedCreate = buildEmbed(reels, scheduled, !!logoBuf);
        const row = buildButtons();
        const files = [];
        if (logoBuf)
            files.push(new AttachmentBuilder(logoBuf, { name: "logo.png" }));
        const stored = await pool.query(`SELECT message_id FROM instagram_agenda_board WHERE id = 1 LIMIT 1`);
        const existingMsgId = stored.rows[0]?.message_id ? String(stored.rows[0].message_id) : null;
        if (existingMsgId) {
            try {
                const msg = await channel.messages.fetch(existingMsgId);
                const editEmbed = buildEmbed(reels, scheduled, false); // pas de réf attachment en edit
                await msg.edit({ embeds: [editEmbed], components: [row] });
                await pool.query(`UPDATE instagram_agenda_board SET last_refreshed_at = NOW() WHERE id = 1`);
                console.log(`${LOG} ✅ message édité (${existingMsgId}) — ${reels.length} Reels`);
                return;
            }
            catch (e) {
                console.warn(`${LOG} edit échoué (${e?.message || e}) — recréation`);
            }
        }
        const sent = await channel.send({ embeds: [embedCreate], components: [row], files });
        await pool.query(`
      INSERT INTO instagram_agenda_board (id, channel_id, message_id, last_refreshed_at)
      VALUES (1, $1, $2, NOW())
      ON CONFLICT (id) DO UPDATE
        SET channel_id = EXCLUDED.channel_id, message_id = EXCLUDED.message_id, last_refreshed_at = NOW()
      `, [IG_AGENDA_CHANNEL_ID, sent.id]);
        console.log(`${LOG} ✅ message créé (${sent.id}) — ${reels.length} Reels`);
    }
    catch (e) {
        console.error(`${LOG} refresh failed: ${e?.message || e}`);
    }
    finally {
        _inFlight = false;
    }
}
export async function handleIgAgendaRefreshButton(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        await refreshInstagramAgenda();
        await interaction.editReply({ content: "✅ Agenda Instagram actualisé." });
    }
    catch (e) {
        try {
            if (interaction.deferred)
                await interaction.editReply({ content: "❌ " + (e?.message || e) });
        }
        catch { }
    }
}
export function startInstagramAgendaBoard() {
    setTimeout(() => { void refreshInstagramAgenda(); }, FIRST_REFRESH_DELAY_MS);
    const id = setInterval(() => { void refreshInstagramAgenda(); }, REFRESH_INTERVAL_MS);
    id.unref?.();
    console.log(`${LOG} started — refresh toutes les ${REFRESH_INTERVAL_MS / 3600_000}h`);
}
