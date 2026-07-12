// api/src/routes/bot_wheel.ts
import express from "express";
import { pool } from "../db.js";
import normalizeAppearance from "../appearance.js";
import { getChatCosmeticsForUsers } from "../chat_cosmetics.js";
import { requireAuth } from "../auth.js";
import { emitSpecialCard, emitChatLine, emitChatAll } from "../socket_emit.js";

async function wheelSlug(streamerId: number): Promise<string> {
  const r = await pool.query(`SELECT slug FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
  return String(r.rows?.[0]?.slug || "");
}

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

    // Ouverture des inscriptions → carte v2 "roue" (participation réelle,
    // tirage partagé au /draw). Fermeture → clôture des inscriptions.
    const io = req.app.locals.io;
    const slug = out?.slug || (await wheelSlug(streamerId));
    if (open) {
      emitSpecialCard(io, slug, "wheel", { round: streamerId, real: true });
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

  // Résultat PARTAGÉ : la roue apparaît et tourne vers le MÊME gagnant sur
  // l'écran de tous les viewers, puis le gagnant est annoncé dans le chat.
  try {
    const io = req.app.locals.io;
    const slug = await wheelSlug(streamerId);
    const names = list.map((x) => x.username);
    emitChatAll(io, slug, "act:wheel", { round: streamerId, names, winner, resolved: true });
    if (winner) emitChatLine(io, slug, "recap", `🎡 <b>${winner}</b> remporte le tirage 🎉`);
    // vide les inscriptions pour le prochain tour
    await pool.query(`DELETE FROM bot_wheel_entries WHERE streamer_id=$1`, [streamerId]);
    await pool.query(`UPDATE bot_wheel_cfg SET enroll_open=FALSE, updated_at=NOW() WHERE streamer_id=$1`, [streamerId]);
  } catch {}

  res.json({ ok: true, winner, index });
});

// GET /me/bot/bot_wheel/public?slug=...
botWheelRouter.get("/public", async (req: any, res) => {
  const slug = String(req.query?.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const metaR = await pool.query(
    `SELECT id
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [slug]
  );
  const streamerId = Number(metaR.rows?.[0]?.id || 0);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  await ensureCfg(streamerId);

  const cfgR = await pool.query(
    `SELECT enroll_open
     FROM bot_wheel_cfg
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );
  const enrollOpen = Boolean(cfgR.rows?.[0]?.enroll_open);

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM bot_wheel_entries
     WHERE streamer_id=$1`,
    [streamerId]
  );
  const n = Number(countR.rows?.[0]?.n || 0);

  // si authed, dire s'il est déjà inscrit
  let joined = false;
  const u = (req as any).user;
  if (u?.id) {
    const userId = Number(u.id);

    // essaie avec user_id, fallback username_lc si pas de colonne
    try {
      const jr = await pool.query(
        `SELECT 1 FROM bot_wheel_entries WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
        [streamerId, userId]
      );
      joined = !!jr.rows?.[0];
    } catch {
      const usernameLc = String(u.username || "").trim().toLowerCase();
      if (usernameLc) {
        const jr = await pool.query(
          `SELECT 1 FROM bot_wheel_entries WHERE streamer_id=$1 AND username_lc=$2 LIMIT 1`,
          [streamerId, usernameLc]
        );
        joined = !!jr.rows?.[0];
      }
    }
  }

  res.set("Cache-Control", "no-store");
  return res.json({
    ok: true,
    cfg: { enroll_open: enrollOpen },
    counts: { entries: n },
    me: { joined },
    // TODO conditions future: follow-only / sub-only / etc
  });
});

// POST /me/bot/bot_wheel/join { slug }
botWheelRouter.post("/join", requireAuth, express.json(), async (req: any, res) => {
  const slug = String(req.body?.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

  const u = req.user;
  if (!u?.id) return res.status(401).json({ ok: false, error: "unauthorized" });

  const metaR = await pool.query(
    `SELECT id
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [slug]
  );
  const streamerId = Number(metaR.rows?.[0]?.id || 0);
  if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

  await ensureCfg(streamerId);

  const cfgR = await pool.query(
    `SELECT enroll_open
     FROM bot_wheel_cfg
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );
  const open = Boolean(cfgR.rows?.[0]?.enroll_open);

  if (!open) {
    return res.status(409).json({ ok: false, error: "closed" });
  }

  // TODO conditions future: follow-only / sub-only / etc (mêmes règles que !join)
  const userId = Number(u.id);
  const username = String(u.username || "").trim();
  const usernameLc = username.toLowerCase();

  let joined = false;
  let already = false;

  try {
    const ins = await pool.query(
      `INSERT INTO bot_wheel_entries(streamer_id, user_id, username, username_lc)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (streamer_id, user_id) DO NOTHING
       RETURNING id`,
      [streamerId, userId, username, usernameLc]
    );
    joined = !!ins.rows?.[0];
    already = !joined;
  } catch {
    const ins = await pool.query(
      `INSERT INTO bot_wheel_entries(streamer_id, username, username_lc)
       VALUES ($1,$2,$3)
       ON CONFLICT (streamer_id, username_lc) DO NOTHING
       RETURNING id`,
      [streamerId, username, usernameLc]
    );
    joined = !!ins.rows?.[0];
    already = !joined;
  }

  // État partagé : compteur + message système diffusés (sur un vrai nouveau join).
  if (joined) {
    try {
      const io = req.app.locals.io;
      const cntR = await pool.query(
        `SELECT COUNT(*)::int AS n FROM bot_wheel_entries WHERE streamer_id=$1`,
        [streamerId]
      );
      const count = Number(cntR.rows?.[0]?.n || 0);
      emitChatAll(io, slug, "act:wheel", { round: streamerId, count });
      emitChatLine(io, slug, "sys", `🎡 <b>${username}</b> participe à la roue`);
    } catch {}
  }

  return res.json({ ok: true, status: joined ? "joined" : "already" });
});
