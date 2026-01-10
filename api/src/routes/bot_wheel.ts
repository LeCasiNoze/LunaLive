// api/src/routes/bot_wheel.ts
import express from "express";
import { pool } from "../db.js";

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

  await pool.query(
    `UPDATE bot_wheel_cfg
     SET enroll_open=$2, updated_at=NOW()
     WHERE streamer_id=$1`,
    [streamerId, open]
  );

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
