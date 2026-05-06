// api/src/lunaclip/notify_streamer_ig_publish.ts
//
// Notifie un streamer (DM Discord uniquement) à CHAQUE publication réussie
// d'un de ses clips sur l'Instagram officiel de LunaLive.
//
// Règle de dédoublonnage :
//   - On envoie le DM tant que le streamer n'a PAS de compte Instagram lié
//     (`streamer_ig_config.instagram_username` absent ou ligne désactivée).
//   - Une fois le compte IG configuré → silence total.
//   - On ignore les comptes radio LunaLive.
//
// Idempotent / silencieux : ne fait jamais planter le scheduler.
//
// Hook : appelé depuis api/src/instagram_scheduler.ts juste après la publication.
//        Le `thumbnailUrl` (cover Reel renvoyée par Meta Graph API) est passé
//        en argument pour servir d'image principale dans l'embed.
//
// Logo : api/assets/logo.png (joint au message comme attachment Discord).
//        Path résolu via __dirname → fonctionne en dev (tsx) et en prod (dist).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  type Client,
} from "discord.js";

type Pool = any;

const LOG = "[ig-publish-notify]";
const LUNALIVE_RADIO_SLUGS = new Set(["lunalive", "lunalive-2424"]);

const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.fr").replace(/\/$/, "");
const COLLAB_REQUEST_CHANNEL_ID = "1467142337460437255";
const DISCORD_INVITE_URL = "https://discord.gg/VSbCZQ4gyT";

// dist/lunaclip/notify_streamer_ig_publish.js → ../../assets/logo.png
// src/lunaclip/notify_streamer_ig_publish.ts (tsx)  → ../../assets/logo.png
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirnameLocal, "../../assets/logo.png");

let _logoBuffer: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (_logoBuffer) return _logoBuffer;
  try {
    _logoBuffer = fs.readFileSync(LOGO_PATH);
    return _logoBuffer;
  } catch (e: any) {
    console.warn(`${LOG} logo introuvable à ${LOGO_PATH}: ${e?.message || e}`);
    return null;
  }
}

type StreamerInfo = {
  slug: string;
  displayName: string;
  discordUserId: string | null;
  hasIgConfig: boolean;
};

async function loadStreamerInfo(pool: Pool, streamerSlug: string): Promise<StreamerInfo | null> {
  const r = await pool.query(
    `SELECT
       s.slug                                      AS slug,
       s.display_name                              AS display_name,
       dl.discord_user_id                          AS discord_user_id,
       (sic.instagram_username IS NOT NULL
        AND sic.active = true)                     AS has_ig_config
     FROM streamers s
     LEFT JOIN discord_links dl  ON dl.user_id = s.user_id
     LEFT JOIN streamer_ig_config sic
       ON LOWER(sic.streamer_slug) = LOWER(s.slug)
     WHERE LOWER(s.slug) = LOWER($1)
     LIMIT 1`,
    [streamerSlug]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    slug:           String(row.slug || "").toLowerCase(),
    displayName:    String(row.display_name || row.slug || ""),
    discordUserId:  row.discord_user_id ? String(row.discord_user_id) : null,
    hasIgConfig:    !!row.has_ig_config,
  };
}

async function fetchThumbnailBuffer(thumbnailUrl: string | null): Promise<Buffer | null> {
  if (!thumbnailUrl) return null;
  try {
    const r = await fetch(thumbnailUrl);
    if (!r.ok) {
      console.warn(`${LOG} thumbnail fetch ${r.status} ${thumbnailUrl}`);
      return null;
    }
    return Buffer.from(await r.arrayBuffer());
  } catch (e: any) {
    console.warn(`${LOG} thumbnail fetch error: ${e?.message || e}`);
    return null;
  }
}

function buildEmbed(opts: {
  streamerDisplayName: string;
  streamerSlug: string;
  reelUrl: string;
  clipTitle: string;
  hasLogo: boolean;
  hasThumb: boolean;
}) {
  const SEPARATOR = "─────────────────────────";
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
    .setDescription(
      `Salut **${opts.streamerDisplayName}**  👋\n\n` +
      `Notre système **LunaClip** vient de publier automatiquement un clip extrait de ton stream sur le compte Instagram officiel de **LunaLive**.\n` +
      `​`
    )
    .addFields(
      {
        name: "🎞️   Clip publié",
        value: `**${opts.clipTitle}**`,
        inline: true,
      },
      {
        name: "📺   Streamer",
        value: `**${opts.streamerDisplayName}**\n[Voir la page](${STREAMER_PAGE})`,
        inline: true,
      },
      {
        name: "​",
        value: SEPARATOR,
        inline: false,
      },
      {
        name: "🤝   Tu veux apparaître sur tes propres clips ?",
        value:
          `Demande à être **mentionné(e)** ou ajouté(e) en **collaborateur officiel** : ` +
          `tes clips s'afficheront alors aussi automatiquement sur **ton propre profil Instagram**, ` +
          `dès leur publication.\n\n` +
          `👉 Fais ta demande dans <#${COLLAB_REQUEST_CHANNEL_ID}>  •  un admin te répondra rapidement.`,
        inline: false,
      },
    )
    .setFooter({
      text: "LunaLive  •  Notification automatique de publication Instagram",
      ...(opts.hasLogo ? { iconURL: "attachment://logo.png" } : {}),
    })
    .setTimestamp(new Date());

  if (opts.hasLogo)  embed.setThumbnail("attachment://logo.png");
  if (opts.hasThumb) embed.setImage("attachment://clip_preview.jpg");

  return embed;
}

function buildButtons(reelUrl: string, streamerSlug: string) {
  const STREAMER_PAGE = `${PUBLIC_WEB_BASE}/s/${streamerSlug}`;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📸  Voir le Reel").setURL(reelUrl),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📺  Ma page LunaLive").setURL(STREAMER_PAGE),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("💬  Discord LunaLive").setURL(DISCORD_INVITE_URL),
  );
}

/**
 * À appeler après chaque publication IG réussie.
 * Silencieux en cas d'erreur — ne doit jamais faire planter le scheduler IG.
 */
export async function notifyStreamerOfIgPublish(opts: {
  pool: Pool;
  streamerSlug: string;
  clipTitle: string;
  reelUrl: string;
  thumbnailUrl: string | null;
  jobId: number;
}): Promise<void> {
  const { pool, streamerSlug, clipTitle, reelUrl, thumbnailUrl, jobId } = opts;
  try {
    if (LUNALIVE_RADIO_SLUGS.has(streamerSlug.toLowerCase())) return;

    const info = await loadStreamerInfo(pool, streamerSlug);
    if (!info) {
      console.log(`${LOG} [job #${jobId}] streamer ${streamerSlug} introuvable — skip`);
      return;
    }

    if (info.hasIgConfig) {
      console.log(`${LOG} [job #${jobId}] ${streamerSlug} a déjà un IG config — silence`);
      return;
    }

    if (!info.discordUserId) {
      console.log(`${LOG} [job #${jobId}] ${streamerSlug} sans discord_links — DM impossible`);
      return;
    }

    const client = (global as any).discordClient as Client | null | undefined;
    if (!client) {
      console.warn(`${LOG} [job #${jobId}] Discord client absent — skip`);
      return;
    }

    const [logoBuf, thumbBuf] = await Promise.all([
      Promise.resolve(getLogoBuffer()),
      fetchThumbnailBuffer(thumbnailUrl),
    ]);

    const files: AttachmentBuilder[] = [];
    if (logoBuf)  files.push(new AttachmentBuilder(logoBuf,  { name: "logo.png" }));
    if (thumbBuf) files.push(new AttachmentBuilder(thumbBuf, { name: "clip_preview.jpg" }));

    const embed = buildEmbed({
      streamerDisplayName: info.displayName,
      streamerSlug: info.slug,
      reelUrl,
      clipTitle,
      hasLogo:  !!logoBuf,
      hasThumb: !!thumbBuf,
    });

    const row = buildButtons(reelUrl, info.slug);

    const user = await client.users.fetch(info.discordUserId);
    await user.send({ embeds: [embed], components: [row], files });

    console.log(`${LOG} [job #${jobId}] ✅ DM envoyé à ${info.slug} (${user.tag})`);
  } catch (e: any) {
    console.warn(`${LOG} [job #${opts.jobId}] échec: ${e?.message || e}`);
  }
}
