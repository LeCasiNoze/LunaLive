// api/src/services/global_commands.ts
//
// Commandes globales utilisables sur le chat de tout streamer LunaLive:
//   !solde    — rubis + niveau + titre palier
//   !profil   — fiche stats complète
//   !watch / /watchtime — temps cumul sur ce streamer
//   !succes   — pills bronze/silver/gold/master (V1: total dispo, détail à venir)
//
// La commande peut être tapée par n'importe quel viewer, le bot LunaBot
// répond en chat avec les stats publiques de l'auteur.

import type { Pool } from "pg";
import type { Server } from "socket.io";
import { sendBotChat } from "../calls/commands.js";
import { getLevelInfo } from "../economy/xp.js";
import { computeAchievementsSummary } from "../routes/achievements.js";

const GLOBAL_CMDS = new Set(["solde", "profil", "watch", "watchtime", "succes", "succès"]);

export function isGlobalCommand(cmd: string): boolean {
  return GLOBAL_CMDS.has(String(cmd || "").toLowerCase());
}

type Ctx = {
  pool: Pool;
  io: Server;
  slug: string;
  streamerId: number;
  actorUserId: number;
  actorUsername: string;
  cmd: string;
};

/** Format: "12 j 4 h" / "3 h 24 min" / "8 min" */
function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h ${remM}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}j ${remH}h` : `${d}j`;
}

function fmtRelative(date: Date | null): string {
  if (!date) return "—";
  const diff = Math.max(0, Date.now() - date.getTime());
  return fmtDuration(diff / 1000);
}

async function getUserStats(pool: Pool, userId: number, streamerId: number) {
  // 1) rubis + xp
  const u = await pool.query(
    `SELECT username, rubis, xp::bigint AS xp FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = u.rows[0];
  if (!row) return null;

  const xp = Number(row.xp || 0);
  const info = getLevelInfo(xp);

  // 2) watchtime sur ce streamer (1 bucket = 1 min)
  let watchMins = 0;
  try {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT bucket_ts)::int AS n
         FROM stream_viewer_minutes
        WHERE user_id = $1 AND streamer_id = $2`,
      [userId, streamerId]
    );
    watchMins = Number(r.rows[0]?.n || 0);
  } catch {}

  // 3) Follow date (si suit ce streamer)
  let followDate: Date | null = null;
  try {
    const r = await pool.query(
      `SELECT created_at FROM streamer_follows
        WHERE user_id = $1 AND streamer_id = $2 LIMIT 1`,
      [userId, streamerId]
    );
    followDate = r.rows[0]?.created_at ? new Date(r.rows[0].created_at) : null;
  } catch {}

  // 4) Achievements unlock count (proxy via user_entitlements pour l'instant)
  let entitlementsCount = 0;
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM user_entitlements WHERE user_id = $1`,
      [userId]
    );
    entitlementsCount = Number(r.rows[0]?.n || 0);
  } catch {}

  // 5) Streamer name pour le watch
  let streamerName = "ce stream";
  try {
    const r = await pool.query(
      `SELECT display_name, slug FROM streamers WHERE id = $1 LIMIT 1`,
      [streamerId]
    );
    streamerName = String(r.rows[0]?.display_name || r.rows[0]?.slug || streamerName);
  } catch {}

  return {
    username: String(row.username),
    rubis: Number(row.rubis || 0),
    xp,
    level: info.level,
    title: info.fullTitle,
    watchMins,
    followDate,
    entitlementsCount,
    streamerName,
  };
}

export async function handleGlobalCommand(
  ctx: Ctx
): Promise<{ handled: boolean }> {
  const cmd = String(ctx.cmd || "").toLowerCase();
  if (!isGlobalCommand(cmd)) return { handled: false };

  const stats = await getUserStats(ctx.pool, ctx.actorUserId, ctx.streamerId);
  if (!stats) return { handled: false };

  const optsBot = { streamerId: ctx.streamerId, slug: ctx.slug };
  const u = stats.username;

  if (cmd === "solde") {
    await sendBotChat(
      ctx.pool,
      ctx.io,
      optsBot,
      `💎 ${u} → ${stats.rubis.toLocaleString("fr-FR")} rubis · Niveau ${stats.level} (${stats.title})`
    );
    return { handled: true };
  }

  if (cmd === "watchtime") {
    await sendBotChat(
      ctx.pool,
      ctx.io,
      optsBot,
      `👁️ ${u} a regardé ${stats.streamerName} pendant ${fmtDuration(stats.watchMins * 60)}.`
    );
    return { handled: true };
  }

  if (cmd === "watch") {
    const since = stats.followDate
      ? `Suit depuis ${fmtRelative(stats.followDate)}`
      : "Pas encore follow ce streamer";
    await sendBotChat(
      ctx.pool,
      ctx.io,
      optsBot,
      `👁️ ${u} → ${fmtDuration(stats.watchMins * 60)} cumulé sur ${stats.streamerName} · ${since}`
    );
    return { handled: true };
  }

  if (cmd === "succes" || cmd === "succès") {
    // Pills par tier (bronze/silver/gold/master)
    let summary;
    try {
      summary = await computeAchievementsSummary(ctx.actorUserId);
    } catch {
      summary = null;
    }
    if (summary) {
      const t = summary.byTier;
      await sendBotChat(
        ctx.pool,
        ctx.io,
        optsBot,
        `🏆 ${u} — 🥉 ${t.bronze.unlocked}/${t.bronze.total} · 🥈 ${t.silver.unlocked}/${t.silver.total} · 🥇 ${t.gold.unlocked}/${t.gold.total} · 👑 ${t.master.unlocked}/${t.master.total} (${summary.totalUnlocked}/${summary.totalAll})`
      );
    } else {
      await sendBotChat(
        ctx.pool,
        ctx.io,
        optsBot,
        `🏆 ${u} → ${stats.entitlementsCount} récompenses · lunalive.win/profile`
      );
    }
    return { handled: true };
  }

  if (cmd === "profil") {
    const since = stats.followDate ? fmtRelative(stats.followDate) : "—";
    const lines = [
      `📋 Profil de ${u}`,
      `⭐ Niveau ${stats.level} · ${stats.title}`,
      `💎 ${stats.rubis.toLocaleString("fr-FR")} rubis · ${stats.xp.toLocaleString("fr-FR")} XP`,
      `👁️ ${fmtDuration(stats.watchMins * 60)} sur ${stats.streamerName} · Follow depuis ${since}`,
      `🏆 ${stats.entitlementsCount} récompense${stats.entitlementsCount > 1 ? "s" : ""}`,
    ];
    await sendBotChat(ctx.pool, ctx.io, optsBot, lines.join(" | "));
    return { handled: true };
  }

  return { handled: false };
}
