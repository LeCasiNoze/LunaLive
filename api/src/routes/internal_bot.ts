// api/src/routes/internal_bot.ts
import express from "express";
import { pool } from "../db.js";
import { createAutoClipForStreamer } from "../shared/clip_service.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";

export const internalBotRouter = express.Router();

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

    return res.json({ ok: true, id: msg.id });
  }
);

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
// 5) ✅ Utility functions
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
    keyLength: key.length
  });

  if (!candidates.length || !candidates.includes(key)) {
    res.status(401).json({ ok: false, error: "invalid_bot_key" });
    return false;
  }
  return true;
}

function emitChatAll(io: any, slug: string, event: string, data: any) {
  try {
    io.to(`streamer:${slug}`).emit(event, data);
  } catch (e) {
    console.error("emitChatAll error:", e);
  }
}
