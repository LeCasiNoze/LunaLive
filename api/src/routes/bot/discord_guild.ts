// api/src/routes/bot/discord_guild.ts
import { Router } from "express";
import { pool } from "../../db.js";
import { requireAuth } from "../../auth.js";
import { a } from "../../utils/async.js";

export const botDiscordGuildRouter = Router();

/**
 * GET /api/bot/discord/guild
 */
botDiscordGuildRouter.get(
  "/discord/guild",
  requireAuth,
  a(async (req, res) => {
    const userId = Number((req as any).user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows?.[0]?.id ? Number(s.rows[0].id) : 0;
    if (!streamerId) return res.json({ ok: true, guild: null });

    const r = await pool.query(
      `SELECT guild_id, claimed_at, updated_at, config FROM bot_discord_guilds WHERE streamer_id=$1 LIMIT 1`,
      [streamerId]
    );

    if (!r.rows?.[0]) return res.json({ ok: true, guild: null });

    return res.json({
      ok: true,
      guild: {
        guildId: String(r.rows[0].guild_id),
        claimedAt: r.rows[0].claimed_at,
        updatedAt: r.rows[0].updated_at,
        config: r.rows[0].config ?? {},
      },
    });
  })
);

/**
 * POST /api/bot/discord/unclaim
 */
botDiscordGuildRouter.post(
  "/discord/unclaim",
  requireAuth,
  a(async (req, res) => {
    const userId = Number((req as any).user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const s = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
    const streamerId = s.rows?.[0]?.id ? Number(s.rows[0].id) : 0;
    if (!streamerId) return res.status(409).json({ ok: false, error: "not_streamer" });

    await pool.query(`DELETE FROM bot_discord_guilds WHERE streamer_id=$1`, [streamerId]);
    return res.json({ ok: true });
  })
);
