// api/src/routes/internal_bot.ts
import express from "express";
import { pool } from "../db.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";

export const internalBotRouter = express.Router();

function requireBotKey(req: express.Request, res: express.Response): boolean {
  const expected = String(process.env.BOT_INTERNAL_KEY || "");
  const got = String(req.header("x-bot-key") || "");
  if (!expected || got !== expected) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

internalBotRouter.post(
  "/internal/bot/chat/send",
  express.json(),
  async (req, res) => {
    if (!requireBotKey(req, res)) return;

    const streamerId = Number((req.body as any)?.streamerId || 0);
    const bodyRaw = String((req.body as any)?.body || "").replace(/\r/g, "").trim();
    const body = bodyRaw.length > 200 ? bodyRaw.slice(0, 200) : bodyRaw;

    if (!streamerId || !body) {
      return res.status(400).json({ ok: false, error: "bad_request" });
    }

    // streamer meta (slug + appearance)
    const s = await pool.query(
      `SELECT slug, appearance
       FROM streamers
       WHERE id=$1
       LIMIT 1`,
      [streamerId]
    );
    const meta = s.rows?.[0];
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const slug = String(meta.slug);
    const appearance = normalizeAppearance(meta.appearance || {});

    // bot identity
    const botUserId = Number(process.env.BOT_USER_ID || 0);
    const botUsername = String(process.env.BOT_USERNAME || "LunaBot");

    if (!botUserId) {
      return res.status(500).json({ ok: false, error: "BOT_USER_ID_missing" });
    }

    // INSERT message (DB)
    const ins = await pool.query(
      `INSERT INTO chat_messages (streamer_id, user_id, username, body)
       VALUES ($1,$2,$3,$4)
       RETURNING id, created_at AS "createdAt"`,
      [streamerId, botUserId, botUsername, body]
    );

    const row = ins.rows?.[0];

    // cosmetics (optionnel, mais utile)
    const cosmeticsByUser = await getChatCosmeticsForUsers([botUserId]);
    const cosmetics = cosmeticsByUser.get(botUserId) ?? null;

    const msg = {
      id: Number(row.id),
      userId: botUserId,
      username: botUsername,
      body,
      createdAt: new Date(row.createdAt).toISOString(),
      cosmetics,
      style: {
        nameColor: appearance.chat.usernameColor,
        msgColor: appearance.chat.messageColor,
      },
    };

    // socket broadcast LIVE
    const io = req.app.locals.io;
    if (io) io.to(`chat:${slug}`).emit("chat:message", msg);

    return res.json({ ok: true, id: msg.id });
  }
);
