// api/src/services/profile_stats.ts
//
// Agrégateur de stats user pour les commandes /profil chat & Discord.
// Lit les tables existantes pour produire un résumé riche.

import { pool } from "../db.js";
import { getLevelInfo } from "../economy/xp.js";
import { computeAchievementsSummary } from "../routes/achievements.js";

export type ProfileStats = {
  userId: number;
  username: string;
  rubis: number;
  xp: number;
  level: number;
  levelTitle: string;
  pctToNext: number;
  xpToNext: number;
  isMaxLevel: boolean;
  // Engagement
  watchSecondsTotal: number;
  chatMessagesTotal: number;
  callsTotal: number;
  predictionsTotal: number;
  predictionWinsTotal: number;
  wheelSpinsTotal: number;
  dailyBonusClaimsTotal: number;
  // Économie
  rubisEarnedTotal: number;
  rubisSpentTotal: number;
  // Récompenses
  achievementsByTier: { bronze: { unlocked: number; total: number }; silver: { unlocked: number; total: number }; gold: { unlocked: number; total: number }; master: { unlocked: number; total: number } };
  achievementsTotalUnlocked: number;
  achievementsTotalAll: number;
  entitlementsTotal: number;
  questsCompletedTotal: number;
  // Compte
  createdAt: string | null;
  lastLoginAt: string | null;
  // Titre équipé
  equippedTitleCode: string | null;
  // Streamers suivis
  followsCount: number;
};

async function safeCount(sql: string, params: any[] = []): Promise<number> {
  try {
    const r = await pool.query(sql, params);
    return Number(r.rows[0]?.n || r.rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

async function safeSum(sql: string, params: any[] = []): Promise<number> {
  try {
    const r = await pool.query(sql, params);
    return Number(r.rows[0]?.s || 0);
  } catch {
    return 0;
  }
}

export async function getProfileStats(userId: number): Promise<ProfileStats | null> {
  const u = await pool.query(
    `SELECT id, username, rubis, xp::bigint AS xp, created_at, last_login_at
       FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = u.rows[0];
  if (!row) return null;

  const xp = Number(row.xp || 0);
  const info = getLevelInfo(xp);

  // Watchtime: 1 bucket = 1 min
  const watchMins = await safeCount(
    `SELECT COUNT(DISTINCT bucket_ts)::int AS n FROM stream_viewer_minutes WHERE user_id = $1`,
    [userId]
  );

  const chatMessagesTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM chat_messages WHERE user_id = $1`,
    [userId]
  );

  const callsTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM calls_actions WHERE user_id = $1`,
    [userId]
  );

  const predictionsTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM prediction_bets WHERE user_id = $1`,
    [userId]
  );

  const predictionWinsTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM wallet_tx WHERE user_id = $1 AND kind = 'earn' AND origin = 'prediction_win'`,
    [userId]
  );

  const wheelSpinsTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM daily_wheel_spins WHERE user_id = $1`,
    [userId]
  );

  const dailyBonusClaimsTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM daily_bonus_claims WHERE user_id = $1`,
    [userId]
  );

  const rubisEarnedTotal = await safeSum(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS s FROM wallet_tx WHERE user_id = $1 AND kind = 'earn'`,
    [userId]
  );

  const rubisSpentTotal = await safeSum(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS s FROM wallet_tx WHERE user_id = $1 AND kind = 'spend'`,
    [userId]
  );

  const entitlementsTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM user_entitlements WHERE user_id = $1`,
    [userId]
  );

  const questsCompletedTotal = await safeCount(
    `SELECT COUNT(*)::int AS n FROM quest_progress WHERE user_id = $1 AND claimed_at IS NOT NULL`,
    [userId]
  );

  const followsCount = await safeCount(
    `SELECT COUNT(*)::int AS n FROM streamer_follows WHERE user_id = $1`,
    [userId]
  );

  let equippedTitleCode: string | null = null;
  try {
    const r = await pool.query(
      `SELECT title_code FROM user_equipped_cosmetics WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    equippedTitleCode = r.rows[0]?.title_code || null;
  } catch {}

  let achievementsSummary;
  try {
    achievementsSummary = await computeAchievementsSummary(userId);
  } catch {
    achievementsSummary = {
      byTier: {
        bronze: { unlocked: 0, total: 0 },
        silver: { unlocked: 0, total: 0 },
        gold: { unlocked: 0, total: 0 },
        master: { unlocked: 0, total: 0 },
      },
      totalUnlocked: 0,
      totalAll: 0,
    };
  }

  return {
    userId,
    username: String(row.username),
    rubis: Number(row.rubis || 0),
    xp,
    level: info.level,
    levelTitle: info.fullTitle,
    pctToNext: info.pctToNext,
    xpToNext: info.xpToNext,
    isMaxLevel: info.isMax,
    watchSecondsTotal: watchMins * 60,
    chatMessagesTotal,
    callsTotal,
    predictionsTotal,
    predictionWinsTotal,
    wheelSpinsTotal,
    dailyBonusClaimsTotal,
    rubisEarnedTotal,
    rubisSpentTotal,
    achievementsByTier: achievementsSummary.byTier,
    achievementsTotalUnlocked: achievementsSummary.totalUnlocked,
    achievementsTotalAll: achievementsSummary.totalAll,
    entitlementsTotal,
    questsCompletedTotal,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    equippedTitleCode,
    followsCount,
  };
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h${remM}` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}j${remH}h` : `${d}j`;
}

export function fmtInt(n: number): string {
  return Number(n).toLocaleString("fr-FR");
}

/** Barre de progression style blocks pour les embeds Discord. */
export function progressBar(pct: number, width = 14): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((p / 100) * width);
  return `${"▰".repeat(filled)}${"▱".repeat(width - filled)} ${p}%`;
}

export function fmtTitlePills(byTier: ProfileStats["achievementsByTier"]): string {
  const b = byTier.bronze;
  const s = byTier.silver;
  const g = byTier.gold;
  const m = byTier.master;
  return `🥉 ${b.unlocked}/${b.total} · 🥈 ${s.unlocked}/${s.total} · 🥇 ${g.unlocked}/${g.total} · 👑 ${m.unlocked}/${m.total}`;
}
