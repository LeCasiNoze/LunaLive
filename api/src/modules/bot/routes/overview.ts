import express from "express";
import { pool } from "../../../db.js";
import { mustGetMyStreamer } from "../ctx.js";
import { BOT_TEXT_MAX } from "../schemas.js";

export const overviewRouter = express.Router();

function isMissingTable(e: any) {
  return String(e?.code || "") === "42P01";
}

async function countLogs(streamerId: number) {
  // try bot_logs then bot_events
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM bot_logs WHERE streamer_id=$1`, [streamerId]);
    return Number(r.rows?.[0]?.n || 0);
  } catch (e: any) {
    if (!isMissingTable(e)) throw e;
  }

  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM bot_events WHERE streamer_id=$1`, [streamerId]);
    return Number(r.rows?.[0]?.n || 0);
  } catch (e: any) {
    if (isMissingTable(e)) return 0;
    throw e;
  }
}

overviewRouter.get("/overview", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const s = await mustGetMyStreamer(req);

    const [cmds, autos, logs] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM bot_commands WHERE streamer_id=$1`, [s.id]),
      pool.query(`SELECT COUNT(*)::int AS n FROM bot_autoposts WHERE streamer_id=$1`, [s.id]),
      countLogs(s.id),
    ]);

    res.json({
      ok: true,
      streamer: { id: String(s.id), slug: s.slug },
      counts: {
        commands: Number(cmds.rows?.[0]?.n || 0),
        autoposts: Number(autos.rows?.[0]?.n || 0),
        logs: Number(logs || 0),
      },
      limits: { textMax: BOT_TEXT_MAX },
    });
  } catch (e: any) {
    res.status(e?.status || 500).json({ ok: false, reason: e?.message || "server_error" });
  }
});
