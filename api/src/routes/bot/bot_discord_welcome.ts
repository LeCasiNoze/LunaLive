import { Router } from "express";
import { pool } from "../../db.js";
import { requireAuth } from "../../auth.js";
import { a } from "../../utils/async.js";

export const botDiscordWelcomeRouter = Router();

/**
 * On stocke la config dans: bot_discord_guilds.config.discordWelcome
 * {
 *   welcomeEnabled: boolean,
 *   welcomeChannelId: string|null,
 *   welcomeMessage: string|null,
 *   goodbyeEnabled: boolean,
 *   goodbyeChannelId: string|null,
 *   goodbyeMessage: string|null
 * }
 */

const DEFAULT_WELCOME = "Bienvenue {user} sur **{server}** !";
const DEFAULT_GOODBYE = "{username} a quitté **{server}**.";

function normalizeText(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normalizeBool(v: any, def: boolean) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
}

function pickWelcomeConfig(configJson: any) {
  const dw = (configJson?.discordWelcome ?? {}) as any;
  return {
    welcomeEnabled: normalizeBool(dw.welcomeEnabled, true),
    welcomeChannelId: normalizeText(dw.welcomeChannelId),
    welcomeMessage: normalizeText(dw.welcomeMessage),
    goodbyeEnabled: normalizeBool(dw.goodbyeEnabled, false),
    goodbyeChannelId: normalizeText(dw.goodbyeChannelId),
    goodbyeMessage: normalizeText(dw.goodbyeMessage),
  };
}

/**
 * GET /api/bot/discord/welcome
 * -> config welcome/goodbye pour le guild claim par ce streamer
 */
botDiscordWelcomeRouter.get(
  "/bot/discord/welcome",
  requireAuth,
  a(async (req, res) => {
    const userId = Number((req as any).user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows?.[0]?.id ? Number(s.rows[0].id) : 0;
    if (!streamerId) return res.json({ ok: true, guildId: null, config: null });

    const r = await pool.query(
      `SELECT guild_id, config FROM bot_discord_guilds WHERE streamer_id=$1 LIMIT 1`,
      [streamerId]
    );

    if (!r.rows?.[0]) return res.json({ ok: true, guildId: null, config: null });

    const guildId = String(r.rows[0].guild_id);
    const cfg = pickWelcomeConfig(r.rows[0].config ?? {});

    return res.json({
      ok: true,
      guildId,
      config: {
        ...cfg,
        // defaults côté API pour simplifier l’UI
        welcomeMessage: cfg.welcomeMessage ?? DEFAULT_WELCOME,
        goodbyeMessage: cfg.goodbyeMessage ?? DEFAULT_GOODBYE,
      },
    });
  })
);

/**
 * POST /api/bot/discord/welcome
 * body: {
 *  welcomeEnabled, welcomeChannelId, welcomeMessage,
 *  goodbyeEnabled, goodbyeChannelId, goodbyeMessage
 * }
 */
botDiscordWelcomeRouter.post(
  "/bot/discord/welcome",
  requireAuth,
  a(async (req, res) => {
    const userId = Number((req as any).user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows?.[0]?.id ? Number(s.rows[0].id) : 0;
    if (!streamerId) return res.status(409).json({ ok: false, error: "not_streamer" });

    const row = await pool.query(
      `SELECT guild_id, config FROM bot_discord_guilds WHERE streamer_id=$1 LIMIT 1`,
      [streamerId]
    );
    if (!row.rows?.[0]) return res.status(409).json({ ok: false, error: "no_guild_claimed" });

    const guildId = String(row.rows[0].guild_id);
    const prev = row.rows[0].config ?? {};
    const prevDW = (prev.discordWelcome ?? {}) as any;

    const nextDW = {
      ...prevDW,

      welcomeEnabled: normalizeBool((req.body as any)?.welcomeEnabled, true),
      welcomeChannelId: normalizeText((req.body as any)?.welcomeChannelId),
      welcomeMessage: normalizeText((req.body as any)?.welcomeMessage),

      goodbyeEnabled: normalizeBool((req.body as any)?.goodbyeEnabled, false),
      goodbyeChannelId: normalizeText((req.body as any)?.goodbyeChannelId),
      goodbyeMessage: normalizeText((req.body as any)?.goodbyeMessage),
    };

    const next = { ...prev, discordWelcome: nextDW };

    await pool.query(
      `UPDATE bot_discord_guilds SET config=$2, updated_at=NOW() WHERE guild_id=$1`,
      [guildId, next]
    );

    const cfg = pickWelcomeConfig(next);

    return res.json({
      ok: true,
      guildId,
      config: {
        ...cfg,
        welcomeMessage: cfg.welcomeMessage ?? DEFAULT_WELCOME,
        goodbyeMessage: cfg.goodbyeMessage ?? DEFAULT_GOODBYE,
      },
    });
  })
);
