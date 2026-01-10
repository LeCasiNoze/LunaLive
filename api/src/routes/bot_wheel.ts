// api/src/routes/bot_wheel.ts
import express from "express";
import { pool } from "../db.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";

export const botWheelRouter = express.Router();

type AuthedReq = any;

async function requireStreamer(req: AuthedReq, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const r = await pool.query(
    `SELECT id
     FROM streamers
     WHERE user_id=$1
     LIMIT 1`,
    [userId]
  );

  const streamerId = r.rows?.[0]?.id;
  if (!streamerId) return res.status(403).json({ ok: false, error: "not_streamer" });

  req.streamerId = Number(streamerId);
  next();
}

function normName(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.slice(0, 50);
}
function normKey(v: any) {
  return normName(v).toLowerCase();
}

async function ensureCfg(streamerId: number) {
  await pool.query(
    `INSERT INTO bot_wheel_cfg(streamer_id, enroll_open)
     VALUES ($1, FALSE)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId]
  );
}

async function sendBotChatMessage(streamerId: number, bodyRaw: string) {
  const body0 = String(bodyRaw || "").replace(/\r/g, "").trim();
  const body = body0.length > 200 ? body0.slice(0, 200) : body0;
  if (!body) return;

  const botUserId = Number(process.env.BOT_USER_ID || 0);
  const botUsername = String(process.env.BOT_USERNAME || "LunaBot");
  if (!botUserId) {
    // on ne casse pas la route, mais on log en console
    console.log("[bot_wheel] BOT_USER_ID_missing (cannot send bot message)");
    return;
  }

  // streamer meta (slug + appearance + live)
  const s = await pool.query(
    `SELECT slug, appearance, is_live AS "isLive"
     FROM streamers
     WHERE id=$1
     LIMIT 1`,
    [streamerId]
  );
  const meta = s.rows?.[0];
  if (!meta) return;

  const slug = String(meta.slug || "");
  const isLive = Boolean(meta.isLive);

  // On envoie le message seulement si live (sinon inutile)
  if (!slug || !isLive) return;

  const appearance = normalizeAppearance(meta.appearance || {});

  // INSERT DB
  const ins = await pool.query(
    `INSERT INTO chat_messages (streamer_id, user_id, username, body)
     VALUES ($1,$2,$3,$4)
     RETURNING id, created_at AS "createdAt"`,
    [streamerId, botUserId, botUsername, body]
  );

  const row = ins.rows?.[0];
  if (!row) return;

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

  // broadcast socket
  // (comme internal_bot.ts / test-send)
  const io = (botWheelRouter as any).app?.locals?.io; // fallback si appelé autrement
  // mieux: req.app.locals.io dans les handlers (voir plus bas)
  // ici on renvoie msg et on emit dans le handler avec req.app.locals.io
  return { slug, msg };
}

// GET /me/bot/bot_wheel/state
botWheelRouter.get("/state", requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId);
  await ensureCfg(streamerId);

  const cfgR = await pool.query(
    `SELECT enroll_open
     FROM bot_wheel_cfg
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );

  const entriesR = await pool.query(
    `SELECT username
     FROM bot_wheel_entries
     WHERE streamer_id=$1
     ORDER BY created_at ASC, id ASC`,
    [streamerId]
  );

  res.json({
    ok: true,
    cfg: { enroll_open: Boolean(cfgR.rows?.[0]?.enroll_open) },
    entries: entriesR.rows.map((r: any) => ({ username: String(r.username) })),
  });
});

// POST /me/bot/bot_wheel/enroll { open: boolean }
botWheelRouter.post("/enroll", requireStreamer, express.json(), async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId);
  await ensureCfg(streamerId);

  const open = Boolean(req.body?.open);

  // read previous state
  const prevR = await pool.query(
    `SELECT enroll_open
     FROM bot_wheel_cfg
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );
  const prevOpen = Boolean(prevR.rows?.[0]?.enroll_open);

  await pool.query(
    `UPDATE bot_wheel_cfg
     SET enroll_open=$2, updated_at=NOW()
     WHERE streamer_id=$1`,
    [streamerId, open]
  );

  // ✅ BOT MESSAGE on change (only if live)
  if (prevOpen !== open) {
    const text = open
      ? "🎡 Inscriptions à la roue OUVERTES ! Tape !wheel pour participer."
      : "🎡 Inscriptions à la roue FERMÉES.";

    const out = await sendBotChatMessage(streamerId, text);
    if (out?.slug && out?.msg) {
      const io = req.app.locals.io;
      if (io) io.to(`chat:${out.slug}`).emit("chat:message", out.msg);
    }
  }

  res.json({ ok: true });
});

// POST /me/bot/bot_wheel/add { username }
botWheelRouter.post("/add", requireStreamer, express.json(), async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId);
  const username = normName(req.body?.username);
  const usernameLc = normKey(username);

  if (!username) return res.status(400).json({ ok: false, error: "username_required" });

  await ensureCfg(streamerId);

  await pool.query(
    `INSERT INTO bot_wheel_entries(streamer_id, username, username_lc)
     VALUES ($1, $2, $3)
     ON CONFLICT (streamer_id, username_lc) DO NOTHING`,
    [streamerId, username, usernameLc]
  );

  res.json({ ok: true });
});

// POST /me/bot/bot_wheel/remove { username }
botWheelRouter.post("/remove", requireStreamer, express.json(), async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId);
  const username = normName(req.body?.username);
  const usernameLc = normKey(username);

  if (!username) return res.status(400).json({ ok: false, error: "username_required" });

  await pool.query(
    `DELETE FROM bot_wheel_entries
     WHERE streamer_id=$1 AND username_lc=$2`,
    [streamerId, usernameLc]
  );

  res.json({ ok: true });
});

// POST /me/bot/bot_wheel/clear
botWheelRouter.post("/clear", requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId);
  await pool.query(`DELETE FROM bot_wheel_entries WHERE streamer_id=$1`, [streamerId]);
  res.json({ ok: true });
});

// POST /me/bot/bot_wheel/draw
botWheelRouter.post("/draw", requireStreamer, async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId);

  const r = await pool.query(
    `SELECT id, username
     FROM bot_wheel_entries
     WHERE streamer_id=$1
     ORDER BY created_at ASC, id ASC`,
    [streamerId]
  );

  const list = r.rows.map((x: any) => ({ id: Number(x.id), username: String(x.username) }));
  if (!list.length) return res.json({ ok: true, winner: null, index: null });

  const index = Math.floor(Math.random() * list.length);
  const winner = list[index]?.username ?? null;

  res.json({ ok: true, winner, index });
});
