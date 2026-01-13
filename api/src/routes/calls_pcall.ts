import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";

export const callsPcallRouter = Router();

async function ensurePcallSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_pcall_cooldowns (
      streamer_id INT NOT NULL,
      user_id INT NOT NULL,
      next_at_ms BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (streamer_id, user_id)
    );
  `);
}

async function getStreamerIdBySlug(slug: string): Promise<number | null> {
  const s = String(slug || "").trim();
  if (!s) return null;
  const r = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [s]);
  const id = r.rows?.[0]?.id;
  return id != null ? Number(id) : null;
}

async function getTalentLevel(userId: number, code: string): Promise<number> {
  try {
    const r = await pool.query<{ level: number }>(
      `SELECT level FROM user_talents WHERE user_id=$1 AND talent_code=$2 LIMIT 1`,
      [userId, code]
    );
    return Math.max(0, Number(r.rows?.[0]?.level || 0));
  } catch {
    return 0;
  }
}

async function getNextAtMs(streamerId: number, userId: number): Promise<number> {
  await ensurePcallSchema();
  const r = await pool.query<{ next_at_ms: string | number }>(
    `SELECT next_at_ms FROM calls_pcall_cooldowns WHERE streamer_id=$1 AND user_id=$2 LIMIT 1`,
    [streamerId, userId]
  );
  return Number(r.rows?.[0]?.next_at_ms || 0);
}

// GET /calls/:slug/pcall/status
callsPcallRouter.get(
  "/:slug/pcall/status",
  requireAuth,
  a(async (req: any, res: any) => {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const slug = String(req.params?.slug || "").trim();
    const streamerId = await getStreamerIdBySlug(slug);
    if (!streamerId) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const level = await getTalentLevel(userId, "talent_calls_limit");
    const unlocked = level >= 3;

    const nextAtMs = await getNextAtMs(streamerId, userId);

    return res.json({
      ok: true,
      unlocked,
      level,
      nextAtMs,
      serverNowMs: Date.now(),
    });
  })
);
