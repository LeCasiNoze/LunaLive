// api/src/rankup.ts
// XP de watchtime (crédité au heartbeat, palier faible + plafonné/jour) +
// détection de passage de niveau → broadcast pop-up (socket user:{id}) +
// "pending rank-up" pour le prompt d'annonce dans le chat (fenêtre 10 min).
import type { Server } from "socket.io";
import { pool } from "./db.js";
import { awardXpTx, getLevelInfo } from "./economy/xp.js";

// Palier : 1 XP toutes les 5 minutes de watch. Le plafond quotidien est déjà
// appliqué par awardXpTx (XP_DAILY_CAPS.watch_minute = 100 → 500 min/j max).
const MINUTES_PER_XP = 5;
const RANKUP_WINDOW_MIN = 10; // fenêtre du prompt d'annonce dans le chat

let __schemaReady = false;
async function ensureSchema() {
  if (__schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_rankup_pending (
      user_id    INTEGER PRIMARY KEY,
      level      INTEGER NOT NULL,
      leveled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dismissed  BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);
  __schemaReady = true;
}

async function recordLevelUp(userId: number, level: number) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO user_rankup_pending (user_id, level, leveled_at, dismissed)
     VALUES ($1,$2,NOW(),FALSE)
     ON CONFLICT (user_id) DO UPDATE
       SET level=EXCLUDED.level, leveled_at=NOW(), dismissed=FALSE`,
    [userId, level]
  );
}

/** Rank-up encore "annonçable" (dans la fenêtre, non traité) → sinon null. */
export async function getPendingRankUp(userId: number): Promise<{ level: number } | null> {
  await ensureSchema();
  const r = await pool.query(
    `SELECT level FROM user_rankup_pending
     WHERE user_id=$1 AND dismissed=FALSE
       AND leveled_at > NOW() - ($2 || ' minutes')::interval
     LIMIT 1`,
    [userId, String(RANKUP_WINDOW_MIN)]
  );
  return r.rows?.[0] ? { level: Number(r.rows[0].level) } : null;
}

/** Marque le rank-up courant comme traité (oui annoncé / non refusé) → ne
    réapparaît plus pour CE niveau. */
export async function dismissRankUp(userId: number, level: number) {
  await ensureSchema();
  await pool.query(
    `UPDATE user_rankup_pending SET dismissed=TRUE WHERE user_id=$1 AND level=$2`,
    [userId, level]
  );
}

/** Appelé au heartbeat quand une NOUVELLE minute de watch est comptée. Crédite
    l'XP au bon rythme, détecte le level-up → pop-up + pending. */
export async function creditWatchMinute(io: Server | null | undefined, userId: number) {
  if (!userId) return;
  // Minutes de watch aujourd'hui (la ligne de cette minute est déjà insérée).
  const cntR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM stream_viewer_minutes
     WHERE user_id=$1 AND bucket_ts >= date_trunc('day', NOW())`,
    [userId]
  );
  const minutesToday = Number(cntR.rows?.[0]?.n ?? 0);
  if (minutesToday <= 0 || minutesToday % MINUTES_PER_XP !== 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await awardXpTx(client, userId, 1, "watch_minute", "watch");
    await client.query("COMMIT");
    if (r.leveledUp) {
      await recordLevelUp(userId, r.newLevel);
      const info = getLevelInfo(r.newXp);
      io?.to(`user:${userId}`).emit("xp:levelup", { level: r.newLevel, title: info.fullTitle, tier: info.tier });
    }
  } catch {
    try { await client.query("ROLLBACK"); } catch {}
  } finally {
    client.release();
  }
}
