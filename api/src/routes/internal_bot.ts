// api/src/routes/internal_bot.ts
import express from "express";
import { pool } from "../db.js";
import { createAutoClipForStreamer } from "../shared/clip_service.js";
import { markClipDeletedById } from "../bot_clips/store.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";
import { sendRumbleMessageReliable } from "../rumble_chat_bridge.js";

export const internalBotRouter = express.Router();

// ─── Dédoublonnage central des envois bot ────────────────────────────────────
// Plusieurs sources peuvent appeler /internal/bot/chat/send pour le même
// (streamerId, body) en quasi-simultané : multi-instance bot, redeploys qui
// se chevauchent, etc. Sans cette garde, le bot écrit 2 fois la même phrase
// dans chat_messages (et donc dans Luna chat + mirror Rumble) à chaque commande.
const BOT_SEND_DEDUP_MS = 10_000;
const recentBotSends = new Map<string, number>();
function botSendDedupKey(streamerId: number, body: string): string {
  return `${streamerId}|${body.trim().slice(0, 200)}`;
}
function shouldSkipBotSend(key: string): boolean {
  const now = Date.now();
  const last = recentBotSends.get(key) ?? 0;
  if (now - last < BOT_SEND_DEDUP_MS) return true;
  recentBotSends.set(key, now);
  if (recentBotSends.size > 500) {
    const cutoff = now - BOT_SEND_DEDUP_MS * 2;
    for (const [k, ts] of recentBotSends) {
      if (ts < cutoff) recentBotSends.delete(k);
    }
  }
  return false;
}

// --------------------  
// 1) ✅ Auto clip creation (force 75/15, ignore external durations)
// --------------------  
internalBotRouter.post(
  "/internal/bot/clip/create",
  express.json(),
  async (req, res) => {
    const body: any = req.body || {};
    const streamerId = Number(body.streamerId || 0);
    const title = String(body.title || "").trim() || null;
    const author = String(body.author || "").trim() || null;

    // ❌ IGNORER complètement les durées externes pour les auto-clips
    // Le detector ne contrôle PAS la durée finale
    // const preSec = body.preSec != null ? Number(body.preSec) : undefined;
    // const postSec = body.postSec != null ? Number(body.postSec) : undefined;

    if (!streamerId) {
      return res.status(400).json({ ok: false, error: "streamerId required" });
    }

    try {
      // 🎯 Utiliser la fonction auto-clip dédiée qui force 75/15
      const result = await createAutoClipForStreamer({
        pool,
        streamerId,
        title,
        author,
      });

      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.reason });
      }

      return res.json({ ok: true, id: result.id });
    } catch (e: any) {
      console.error("Auto clip creation error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }
);

// --------------------
// 1b) ✅ Update clip title (utilisé par lunaclip-local pour éditer un clip)
// --------------------
internalBotRouter.patch(
  "/internal/bot/clip/:id",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const clipId = Number(req.params.id || 0);
    const body: any = req.body || {};
    const newTitle = String(body.title ?? "").trim();

    if (!clipId) {
      return res.status(400).json({ ok: false, error: "clipId required" });
    }
    if (!newTitle) {
      return res.status(400).json({ ok: false, error: "title required" });
    }

    try {
      const r = await pool.query(
        `UPDATE bot_clips
         SET title = $2
         WHERE id = $1 AND deleted_ts IS NULL
         RETURNING id, title`,
        [clipId, newTitle.slice(0, 200)]
      );
      if (!r.rowCount) {
        return res.status(404).json({ ok: false, error: "clip not found or deleted" });
      }
      return res.json({ ok: true, clip: r.rows[0] });
    } catch (e: any) {
      console.error("[internal_bot] patch clip title error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }
);

// --------------------
// 1c) ✅ Delete clip (soft delete: deleted_ts + hidden_by_streamer)
// --------------------
internalBotRouter.delete(
  "/internal/bot/clip/:id",
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const clipId = Number(req.params.id || 0);
    if (!clipId) {
      return res.status(400).json({ ok: false, error: "clipId required" });
    }

    try {
      const affected = await markClipDeletedById(clipId, Math.floor(Date.now() / 1000));
      if (!affected) {
        // already deleted or not found — idempotent: still return ok
        return res.json({ ok: true, alreadyDeleted: true });
      }
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[internal_bot] delete clip error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }
);

// --------------------
// 2) ✅ Bot chat message injection
// --------------------
internalBotRouter.post(
  "/internal/bot/chat/inject",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const body: any = req.body || {};
    const slug = String(body.slug || "").trim();
    const botUsername = String(body.botUsername || "").trim();
    const botMessage = String(body.message || "").trim();

    if (!slug || !botUsername || !botMessage) {
      return res.status(400).json({ ok: false, error: "slug, botUsername, and message required" });
    }

    // Récupérer l'apparence du streamer pour les couleurs
    const appearance = await normalizeAppearance(slug);
    if (!appearance) {
      return res.status(404).json({ ok: false, error: "streamer not found" });
    }

    // Récupérer l'ID utilisateur du bot
    const botUserRes = await pool.query(
      `SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`,
      [botUsername]
    );
    if (!botUserRes.rows?.[0]?.id) {
      return res.status(404).json({ ok: false, error: "bot user not found" });
    }
    const botUserId = Number(botUserRes.rows[0].id);

    // Insérer le message dans la table chat_messages
    const ins = await pool.query(
      `INSERT INTO chat_messages(streamer_slug, user_id, username, body, created_at)
       VALUES($1, $2, $3, $4, NOW())
       RETURNING id, created_at AS "createdAt"`,
      [slug, botUserId, botUsername, botMessage]
    );

    const row = ins.rows?.[0];

    // cosmetics (optionnel, mais utile)
    const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
    const cosmetics = cosmeticsByUser.get(botUserId) ?? null;

    const msg = {
      id: Number(row.id),
      userId: botUserId,
      username: botUsername,
      body: botMessage,
      createdAt: new Date(row.createdAt).toISOString(),
      cosmetics,
      style: {
        nameColor: appearance.chat.usernameColor,
        msgColor: appearance.chat.messageColor,
      },
    };

    const io = req.app.locals.io;
    if (io) emitChatAll(io, slug, "chat:message", msg);

    return res.json({ ok: true, id: msg.id });
  }
);

// --------------------  
// 2b) ✅ Bot chat message send (format original du bot)
// --------------------  
internalBotRouter.post(
  "/internal/bot/chat/send",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const body: any = req.body || {};
    const streamerId = Number(body.streamerId || 0);
    const messageText = String(body.body || "").trim();

    if (!streamerId || !messageText) {
      return res.status(400).json({ ok: false, error: "streamerId and body required" });
    }

    // ✅ Dédoublonnage : bloque les envois identiques dans une fenêtre de 10s
    // (couvre le double-fire des dispatch bot Luna + Rumble + multi-instances).
    const dedupKey = botSendDedupKey(streamerId, messageText);
    if (shouldSkipBotSend(dedupKey)) {
      console.log(`[internal_bot] chat/send skipped (duplicate within ${BOT_SEND_DEDUP_MS}ms) streamerId=${streamerId} body=${messageText.slice(0, 60)}`);
      return res.json({ ok: true, dedup: true });
    }

    // Récupérer le streamer
    const streamerRes = await pool.query(
      `SELECT slug, display_name FROM streamers WHERE id=$1 LIMIT 1`,
      [streamerId]
    );
    if (!streamerRes.rows?.[0]?.slug) {
      return res.status(404).json({ ok: false, error: "streamer not found" });
    }
    const slug = String(streamerRes.rows[0].slug);

    // Récupérer l'apparence du streamer pour les couleurs
    const appearance = await normalizeAppearance(slug);
    if (!appearance) {
      return res.status(404).json({ ok: false, error: "streamer appearance not found" });
    }

    // Bot user info depuis env ou fallback
    const botUsername = String(process.env.BOT_USERNAME || "LunaBot").trim();
    const botUserRes = await pool.query(
      `SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`,
      [botUsername]
    );
    if (!botUserRes.rows?.[0]?.id) {
      return res.status(404).json({ ok: false, error: "bot user not found" });
    }
    const botUserId = Number(botUserRes.rows[0].id);

    // Insérer le message dans la table chat_messages
    const ins = await pool.query(
      `INSERT INTO chat_messages(streamer_id, user_id, username, body, created_at)
       VALUES($1, $2, $3, $4, NOW())
       RETURNING id, created_at AS "createdAt"`,
      [streamerId, botUserId, botUsername, messageText]
    );

    const row = ins.rows?.[0];

    // cosmetics (optionnel, mais utile)
    const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
    const cosmetics = cosmeticsByUser.get(botUserId) ?? null;

    const msg = {
      id: Number(row.id),
      userId: botUserId,
      username: botUsername,
      body: messageText,
      createdAt: new Date(row.createdAt).toISOString(),
      cosmetics,
      style: {
        nameColor: appearance.chat.usernameColor,
        msgColor: appearance.chat.messageColor,
      },
    };

    const io = req.app.locals.io;
    if (io) emitChatAll(io, slug, "chat:message", msg);

    // Mirror sur Rumble, avec fallback relay résidentiel si Render est refusé.
    void mirrorBotMessageToRumble(streamerId, messageText);

    return res.json({ ok: true, id: msg.id });
  }
);

async function mirrorBotMessageToRumble(streamerId: number, text: string) {
  // Envoi direct depuis Render, puis fallback relay si nécessaire.
  try {
    const r = await pool.query(
      `SELECT s.platform, ri.is_live, ri.live_video_id_numeric
       FROM streamers s
       LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
       WHERE s.id = $1`,
      [streamerId]
    );
    const row = r.rows?.[0];
    if (!row) return;
    if (String(row.platform || "").toLowerCase() !== "rumble") return;
    if (!row.is_live) return;
    const vid = row.live_video_id_numeric ? String(row.live_video_id_numeric) : null;
    if (!vid) return;
    await sendRumbleMessageReliable(pool, vid, String(text || "").slice(0, 200));
  } catch (e: any) {
    console.warn("[internal_bot] mirrorBotMessageToRumble error", e?.message || e);
  }
}

// --------------------  
// 3) ✅ Bot settings management
// --------------------  
internalBotRouter.post(
  "/internal/bot/streamer/settings",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const body: any = req.body || {};

    // accepte streamerId OU slug
    let streamerId = Number(body.streamerId || 0);
    const slug = String(body.slug || "").trim();

    if (!streamerId && slug) {
      const r = await pool.query(
        `SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,
        [slug]
      );
      streamerId = Number(r.rows?.[0]?.id || 0);
    }

    if (!streamerId) {
      return res.status(400).json({ ok: false, error: "streamerId or slug required" });
    }

    const enabled = !!body.enabled;
    const prefix = String(body.prefix || "!").trim();
    const liveOnly = !!body.liveOnly;

    try {
      await pool.query(
        `INSERT INTO bot_settings(streamer_id, enabled, prefix, live_only)
         VALUES($1, $2, $3, $4)
         ON CONFLICT(streamer_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           prefix = EXCLUDED.prefix,
           live_only = EXCLUDED.live_only`,
        [streamerId, enabled, prefix, liveOnly]
      );

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Bot settings error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }
);

// --------------------  
// 4) ✅ Bot settings retrieval
// --------------------  
internalBotRouter.get(
  "/internal/bot/streamer/:streamerIdOrSlug/settings",
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const streamerIdOrSlug = String(req.params.streamerIdOrSlug || "").trim();
    if (!streamerIdOrSlug) {
      return res.status(400).json({ ok: false, error: "streamerId or slug required" });
    }

    let streamerId: number;
    if (/^\d+$/.test(streamerIdOrSlug)) {
      streamerId = Number(streamerIdOrSlug);
    } else {
      const r = await pool.query(
        `SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`,
        [streamerIdOrSlug]
      );
      streamerId = Number(r.rows?.[0]?.id || 0);
    }

    if (!streamerId) {
      return res.status(404).json({ ok: false, error: "streamer not found" });
    }

    try {
      const r = await pool.query(
        `SELECT enabled, prefix, live_only FROM bot_settings WHERE streamer_id=$1`,
        [streamerId]
      );

      const settings = r.rows?.[0] || {
        enabled: false,
        prefix: "!",
        live_only: false,
      };

      return res.json({ ok: true, settings });
    } catch (e: any) {
      console.error("Bot settings retrieval error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }
);

// --------------------  
// 6) ✅ Discord message send (pour notifications YouTube)
// --------------------  
internalBotRouter.post(
  "/internal/bot/discord/send",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const body: any = req.body || {};
    const channelId = String(body.channelId || "").trim();
    const content = String(body.content || "").trim();
    const embeds = Array.isArray(body.embeds) ? body.embeds : [];
    const components = Array.isArray(body.components) ? body.components : [];

    if (!channelId) {
      return res.status(400).json({ ok: false, error: "channelId required" });
    }

    try {
      // Import dynamique pour éviter les dépendances circulaires
      const { startDiscordBot } = await import("../discord/bot.js");
      
      // Le bot Discord doit être démarré pour envoyer des messages
      // On utilise le client Discord existant
      const discordClient = (global as any).discordClient;
      
      if (!discordClient) {
        console.log("[api] discord client not available");
        return res.status(503).json({ ok: false, error: "Discord client not available" });
      }

      const channel = await discordClient.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        console.log("[api] discord channel not found or not text-based:", channelId);
        return res.status(404).json({ ok: false, error: "Channel not found or not text-based" });
      }

      // Construire le payload Discord
      const payload: any = {};
      
      if (content) payload.content = content;
      if (embeds.length > 0) payload.embeds = embeds;
      if (components.length > 0) payload.components = components;

      console.log("[api] discord message payload:", {
        hasContent: !!payload.content,
        embedCount: payload.embeds?.length || 0,
        componentCount: payload.components?.length || 0,
        channelId
      });

      await (channel as any).send(payload);
      console.log("[api] discord premium message sent successfully to channel:", channelId);
      
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[api] discord send error:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }
);

// --------------------
// 6b) ✅ Special event message (emit-only : socket uniquement, pas de DB, pas de mirror Rumble)
//     Sert à afficher les cartes spéciales (raid/follow/sub/don/coffre/rain/roue/prédiction/boss/level)
//     dans le chat live. Le body reste vide : tout passe par { type, data }.
// --------------------
const SPECIAL_TYPES = new Set([
  "raid", "follow", "combo", "sub", "don", "chest", "rain", "wheel", "predict", "boss", "level",
]);
let __specialSeq = 0;
internalBotRouter.post(
  "/internal/bot/chat/special",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const body: any = req.body || {};
    const type = String(body.type || "").trim();
    if (!SPECIAL_TYPES.has(type)) {
      return res.status(400).json({ ok: false, error: "invalid_type" });
    }
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const username = String(body.username || "LunaLive").trim() || "LunaLive";

    // Accepte slug direct OU streamerId
    let slug = String(body.slug || "").trim().toLowerCase();
    const streamerId = Number(body.streamerId || 0);
    if (!slug && streamerId) {
      const r = await pool.query(`SELECT slug FROM streamers WHERE id = $1 LIMIT 1`, [streamerId]);
      slug = String(r.rows?.[0]?.slug || "").trim().toLowerCase();
    }
    if (!slug) return res.status(400).json({ ok: false, error: "missing_slug" });

    // id synthétique négatif : jamais en collision avec les BIGSERIAL (positifs) de chat_messages,
    // et unique pour le dédoublonnage par id côté front.
    __specialSeq = (__specialSeq + 1) % 100000;
    const id = -(Date.now() * 100000 + __specialSeq);

    const msg = {
      id,
      userId: 0,
      username,
      body: "",
      createdAt: new Date().toISOString(),
      type,
      data,
    };

    const io = req.app.locals.io;
    if (io) emitChatAll(io, slug, "chat:message", msg);

    return res.json({ ok: true, id, slug, type });
  }
);

// --------------------
// 7) ✅ Utility functions
// --------------------
function requireBotKey(req: express.Request, res: express.Response): boolean {
  const key = String(req.headers["x-bot-key"] || "").trim();

  const candidates = [
    process.env.INTERNAL_BOT_KEY,
    process.env.BOT_INTERNAL_KEY,
  ]
    .map(v => String(v || "").trim())
    .filter(Boolean);

  // DEBUG: diagnostic auth sécurisé
  console.log("[api] requireBotKey debug", {
    hasInternalBotKey: !!process.env.INTERNAL_BOT_KEY,
    hasBotInternalKey: !!process.env.BOT_INTERNAL_KEY,
    internalBotKeyLength: process.env.INTERNAL_BOT_KEY?.length || 0,
    botInternalKeyLength: process.env.BOT_INTERNAL_KEY?.length || 0,
    candidatesCount: candidates.length,
    keyLength: key.length,
    keyPrefix: key.length > 8 ? `${key.slice(0, 3)}***${key.slice(-3)}` : '***',
    receivedKey: key.length > 0 ? `[${key.length} chars]` : 'EMPTY',
    candidates: candidates.map(k => k.length > 8 ? `${k.slice(0, 3)}***${k.slice(-3)}` : '***')
  });

  if (!candidates.length || !candidates.includes(key)) {
    console.log("[api] auth failed: key not found in candidates");
    res.status(401).json({ ok: false, error: "invalid_bot_key" });
    return false;
  }
  
  console.log("[api] auth success");
  return true;
}

function emitChatAll(io: any, slug: string, event: string, data: any) {
  try {
    const s = String(slug || "").trim().toLowerCase();
    if (!s) return;
    io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit(event, data);
  } catch (e) {
    console.error("emitChatAll error:", e);
  }
}
