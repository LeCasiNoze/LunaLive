import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
  type NewsChannel,
  type TextChannel,
} from "discord.js";
import type { Pool } from "pg";

export type LiveAlertConfig = {
  guildId: string;
  channelId: string;
  roleId: string;
  streamerSlug: string;
  apiBase: string;
  lunaLiveUrl: string;
  rumbleUrl: string;
  pollMs: number;
};

export type LiveSnapshot = {
  liveKey: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
  startedAt: Date | null;
  thumbnailUrl: string | null;
  avatarUrl: string | null;
};

type StoredLiveState = {
  isLive: boolean;
  liveKey: string | null;
  messageId: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  claimToken: string | null;
};

type LiveAlertMessage = {
  content: string;
  allowedMentions: { roles: string[] } | { parse: never[] };
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

type LunaLiveEntry = {
  slug?: unknown;
  displayName?: unknown;
  title?: unknown;
  viewers?: unknown;
  liveStartedAt?: unknown;
  thumbUrl?: unknown;
  avatarUrl?: unknown;
};

const STATE_TABLE = "nozebot_live_alert_state";
const CLAIM_TIMEOUT_MINUTES = 3;
const OFFLINE_CONFIRMATION_POLLS = 3;

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function absoluteUrl(base: string, value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  try {
    return new URL(raw, `${cleanBaseUrl(base)}/`).toString();
  } catch {
    return null;
  }
}

function withVersion(url: string | null, version: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("v", version);
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeTitle(value: unknown): string {
  const title = optionalString(value) || "Le live est lancé";
  return title.length > 240 ? `${title.slice(0, 237)}…` : title;
}

export function parseLunaLivePayload(
  payload: unknown,
  config: Pick<LiveAlertConfig, "streamerSlug" | "apiBase">
): LiveSnapshot | null {
  if (!Array.isArray(payload)) throw new Error("Réponse /lives invalide : tableau attendu");
  const wantedSlug = config.streamerSlug.toLowerCase();
  const entry = payload.find((candidate: LunaLiveEntry) =>
    optionalString(candidate?.slug)?.toLowerCase() === wantedSlug
  ) as LunaLiveEntry | undefined;
  if (!entry) return null;

  const startedAt = parseDate(entry.liveStartedAt);
  const liveKey = `${wantedSlug}:${startedAt?.toISOString() || "active"}`;
  const version = startedAt ? String(Math.floor(startedAt.getTime() / 1000)) : "active";
  return {
    liveKey,
    slug: optionalString(entry.slug) || config.streamerSlug,
    displayName: optionalString(entry.displayName) || "LeCasiNoze",
    title: safeTitle(entry.title),
    viewers: Math.max(0, Number(entry.viewers) || 0),
    startedAt,
    thumbnailUrl: withVersion(absoluteUrl(config.apiBase, entry.thumbUrl), version),
    avatarUrl: absoluteUrl(config.apiBase, entry.avatarUrl),
  };
}

function discordTime(date: Date | null): string {
  if (!date) return "À l’instant";
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function buildLiveAlertMessage(
  snapshot: LiveSnapshot,
  config: Pick<LiveAlertConfig, "roleId" | "lunaLiveUrl" | "rumbleUrl">,
  pingRole: boolean
): LiveAlertMessage {
  const embed = new EmbedBuilder()
    .setColor(0x9d7cff)
    .setAuthor({
      name: "LECASINOZE • EN DIRECT",
      ...(snapshot.avatarUrl ? { iconURL: snapshot.avatarUrl } : {}),
    })
    .setTitle(`🔴 ${snapshot.title}`)
    .setURL(config.lunaLiveUrl)
    .setDescription(
      "Le live vient de commencer. Choisis ta plateforme et rejoins-nous maintenant.\n\n" +
      "**Deux plateformes, un seul direct : Rumble + LunaLive.**"
    )
    .addFields(
      {
        name: "🌙 LunaLive",
        value: "Le live, le chat et l’expérience communautaire.",
        inline: true,
      },
      {
        name: "🟢 Rumble",
        value: "Retrouve directement la diffusion sur Rumble.",
        inline: true,
      },
      {
        name: "⏱️ Lancement",
        value: discordTime(snapshot.startedAt),
        inline: false,
      }
    )
    .setFooter({ text: "LeCasiNoze • Alerte live officielle" })
    .setTimestamp(snapshot.startedAt || new Date());

  if (snapshot.thumbnailUrl) embed.setImage(snapshot.thumbnailUrl);

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Regarder sur LunaLive")
      .setEmoji("🌙")
      .setURL(config.lunaLiveUrl),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Regarder sur Rumble")
      .setEmoji("🟢")
      .setURL(config.rumbleUrl)
  );

  return {
    content: `<@&${config.roleId}> **LeCasiNoze est en direct — on se retrouve maintenant.**`,
    embeds: [embed],
    components: [buttons],
    allowedMentions: pingRole ? { roles: [config.roleId] } : { parse: [] },
  };
}

async function ensureStateTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
      guild_id TEXT NOT NULL,
      streamer_slug TEXT NOT NULL,
      is_live BOOLEAN NOT NULL DEFAULT FALSE,
      live_key TEXT,
      message_id TEXT,
      source_title TEXT,
      source_thumbnail_url TEXT,
      started_at TIMESTAMPTZ,
      claim_token TEXT,
      claimed_at TIMESTAMPTZ,
      announced_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, streamer_slug)
    )
  `);
}

async function loadState(pool: Pool, config: LiveAlertConfig): Promise<StoredLiveState | null> {
  const result = await pool.query(
    `SELECT
       is_live AS "isLive",
       live_key AS "liveKey",
       message_id AS "messageId",
       source_title AS title,
       source_thumbnail_url AS "thumbnailUrl",
       claim_token AS "claimToken"
     FROM ${STATE_TABLE}
     WHERE guild_id = $1 AND streamer_slug = $2
     LIMIT 1`,
    [config.guildId, config.streamerSlug]
  );
  return (result.rows[0] as StoredLiveState | undefined) || null;
}

async function markOffline(pool: Pool, config: LiveAlertConfig): Promise<void> {
  await pool.query(
    `INSERT INTO ${STATE_TABLE} (
       guild_id, streamer_slug, is_live, last_seen_at, updated_at
     ) VALUES ($1, $2, FALSE, NOW(), NOW())
     ON CONFLICT (guild_id, streamer_slug) DO UPDATE SET
       is_live = FALSE,
       claim_token = NULL,
       claimed_at = NULL,
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [config.guildId, config.streamerSlug]
  );
}

async function touchLive(pool: Pool, config: LiveAlertConfig, snapshot: LiveSnapshot): Promise<void> {
  await pool.query(
    `UPDATE ${STATE_TABLE}
     SET is_live = TRUE,
         source_title = $3,
         source_thumbnail_url = $4,
         started_at = $5,
         last_seen_at = NOW(),
         updated_at = NOW()
     WHERE guild_id = $1 AND streamer_slug = $2 AND live_key = $6`,
    [
      config.guildId,
      config.streamerSlug,
      snapshot.title,
      snapshot.thumbnailUrl,
      snapshot.startedAt,
      snapshot.liveKey,
    ]
  );
}

async function claimLiveAlert(
  pool: Pool,
  config: LiveAlertConfig,
  snapshot: LiveSnapshot
): Promise<string | null> {
  const claimToken = randomUUID();
  const result = await pool.query(
    `INSERT INTO ${STATE_TABLE} (
       guild_id, streamer_slug, is_live, live_key, source_title,
       source_thumbnail_url, started_at, claim_token, claimed_at,
       last_seen_at, updated_at
     ) VALUES ($1, $2, TRUE, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
     ON CONFLICT (guild_id, streamer_slug) DO UPDATE SET
       is_live = TRUE,
       live_key = EXCLUDED.live_key,
       message_id = CASE
         WHEN ${STATE_TABLE}.is_live = FALSE
           OR ${STATE_TABLE}.live_key IS DISTINCT FROM EXCLUDED.live_key
         THEN NULL
         ELSE ${STATE_TABLE}.message_id
       END,
       source_title = EXCLUDED.source_title,
       source_thumbnail_url = EXCLUDED.source_thumbnail_url,
       started_at = EXCLUDED.started_at,
       claim_token = EXCLUDED.claim_token,
       claimed_at = NOW(),
       last_seen_at = NOW(),
       updated_at = NOW()
     WHERE ${STATE_TABLE}.is_live = FALSE
        OR ${STATE_TABLE}.live_key IS DISTINCT FROM EXCLUDED.live_key
        OR (
          ${STATE_TABLE}.message_id IS NULL
          AND (
            ${STATE_TABLE}.claimed_at IS NULL
            OR ${STATE_TABLE}.claimed_at < NOW() - ($8::int * INTERVAL '1 minute')
          )
        )
     RETURNING claim_token AS "claimToken"`,
    [
      config.guildId,
      config.streamerSlug,
      snapshot.liveKey,
      snapshot.title,
      snapshot.thumbnailUrl,
      snapshot.startedAt,
      claimToken,
      CLAIM_TIMEOUT_MINUTES,
    ]
  );
  return result.rows[0]?.claimToken === claimToken ? claimToken : null;
}

async function completeClaim(
  pool: Pool,
  config: LiveAlertConfig,
  snapshot: LiveSnapshot,
  claimToken: string,
  messageId: string
): Promise<void> {
  await pool.query(
    `UPDATE ${STATE_TABLE}
     SET message_id = $4,
         source_title = $5,
         source_thumbnail_url = $6,
         started_at = $7,
         claim_token = NULL,
         claimed_at = NULL,
         announced_at = NOW(),
         last_seen_at = NOW(),
         updated_at = NOW()
     WHERE guild_id = $1
       AND streamer_slug = $2
       AND live_key = $3
       AND claim_token = $8`,
    [
      config.guildId,
      config.streamerSlug,
      snapshot.liveKey,
      messageId,
      snapshot.title,
      snapshot.thumbnailUrl,
      snapshot.startedAt,
      claimToken,
    ]
  );
}

async function releaseClaim(
  pool: Pool,
  config: LiveAlertConfig,
  snapshot: LiveSnapshot,
  claimToken: string
): Promise<void> {
  await pool.query(
    `UPDATE ${STATE_TABLE}
     SET claim_token = NULL, claimed_at = NULL, updated_at = NOW()
     WHERE guild_id = $1 AND streamer_slug = $2 AND live_key = $3 AND claim_token = $4`,
    [config.guildId, config.streamerSlug, snapshot.liveKey, claimToken]
  );
}

async function clearMissingMessage(
  pool: Pool,
  config: LiveAlertConfig,
  snapshot: LiveSnapshot,
  messageId: string
): Promise<void> {
  await pool.query(
    `UPDATE ${STATE_TABLE}
     SET message_id = NULL, claim_token = NULL, claimed_at = NULL, updated_at = NOW()
     WHERE guild_id = $1 AND streamer_slug = $2 AND live_key = $3 AND message_id = $4`,
    [config.guildId, config.streamerSlug, snapshot.liveKey, messageId]
  );
}

async function fetchLiveSnapshot(config: LiveAlertConfig): Promise<LiveSnapshot | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${cleanBaseUrl(config.apiBase)}/lives?_=${Date.now()}`, {
      headers: { accept: "application/json", "user-agent": "NozeBotLiveAlerts/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`LunaLive /lives HTTP ${response.status}`);
    return parseLunaLivePayload(await response.json(), config);
  } finally {
    clearTimeout(timeout);
  }
}

type AlertChannel = TextChannel | NewsChannel;

async function getAlertChannel(client: Client, config: LiveAlertConfig): Promise<AlertChannel> {
  const channel = await client.channels.fetch(config.channelId);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    throw new Error(`Salon live invalide ou introuvable: ${config.channelId}`);
  }
  return channel;
}

class LeCasiNozeLiveAlerts {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private offlineStreak = 0;
  private consecutiveErrors = 0;
  private verifiedLiveKey: string | null = null;
  private channel: AlertChannel | null = null;

  constructor(
    private readonly client: Client,
    private readonly pool: Pool,
    private readonly config: LiveAlertConfig
  ) {}

  async start(): Promise<void> {
    await ensureStateTable(this.pool);
    this.timer = setInterval(() => void this.poll(), this.config.pollMs);
    await this.poll();
    console.log("[nozebot][live] surveillance LunaLive active", {
      slug: this.config.streamerSlug,
      pollMs: this.config.pollMs,
      channelId: this.config.channelId,
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const snapshot = await fetchLiveSnapshot(this.config);
      this.consecutiveErrors = 0;
      if (!snapshot) {
        this.offlineStreak += 1;
        if (this.offlineStreak >= OFFLINE_CONFIRMATION_POLLS) {
          const previous = await loadState(this.pool, this.config);
          await markOffline(this.pool, this.config);
          if (previous?.isLive) console.log("[nozebot][live] passage hors ligne confirmé");
          this.verifiedLiveKey = null;
        }
        return;
      }

      this.offlineStreak = 0;
      await this.handleLive(snapshot);
    } catch (error) {
      this.consecutiveErrors += 1;
      if (this.consecutiveErrors === 1 || this.consecutiveErrors % 10 === 0) {
        console.error("[nozebot][live] poll LunaLive échoué", error);
      }
    } finally {
      this.polling = false;
    }
  }

  private async handleLive(snapshot: LiveSnapshot): Promise<void> {
    const channel = await this.getChannel();
    let state = await loadState(this.pool, this.config);
    const sameLive = state?.isLive && state.liveKey === snapshot.liveKey;

    if (sameLive && state?.messageId && this.verifiedLiveKey !== snapshot.liveKey) {
      const exists = await channel.messages.fetch(state.messageId).catch(() => null);
      if (!exists) {
        await clearMissingMessage(this.pool, this.config, snapshot, state.messageId);
        state = await loadState(this.pool, this.config);
      } else {
        this.verifiedLiveKey = snapshot.liveKey;
      }
    }

    if (state?.isLive && state.liveKey === snapshot.liveKey && state.messageId) {
      const changed = state.title !== snapshot.title || state.thumbnailUrl !== snapshot.thumbnailUrl;
      if (changed) {
        const message = await channel.messages.fetch(state.messageId).catch(() => null);
        if (!message) {
          await clearMissingMessage(this.pool, this.config, snapshot, state.messageId);
          state = await loadState(this.pool, this.config);
        } else {
          await message.edit(buildLiveAlertMessage(snapshot, this.config, false));
          await touchLive(this.pool, this.config, snapshot);
          console.log("[nozebot][live] carte mise à jour sans nouveau ping", {
            messageId: state.messageId,
          });
          return;
        }
      } else {
        await touchLive(this.pool, this.config, snapshot);
        return;
      }
    }

    const claimToken = await claimLiveAlert(this.pool, this.config, snapshot);
    if (!claimToken) return;

    try {
      const message = await channel.send(buildLiveAlertMessage(snapshot, this.config, true));
      await completeClaim(this.pool, this.config, snapshot, claimToken, message.id);
      this.verifiedLiveKey = snapshot.liveKey;
      console.log("[nozebot][live] alerte publiée", {
        messageId: message.id,
        liveKey: snapshot.liveKey,
      });
    } catch (error) {
      await releaseClaim(this.pool, this.config, snapshot, claimToken).catch(() => undefined);
      throw error;
    }
  }

  private async getChannel(): Promise<AlertChannel> {
    if (!this.channel) this.channel = await getAlertChannel(this.client, this.config);
    return this.channel;
  }
}

export async function startLeCasiNozeLiveAlerts(
  client: Client,
  pool: Pool,
  config: LiveAlertConfig
): Promise<() => void> {
  const liveAlerts = new LeCasiNozeLiveAlerts(client, pool, config);
  await liveAlerts.start();
  return () => liveAlerts.stop();
}
