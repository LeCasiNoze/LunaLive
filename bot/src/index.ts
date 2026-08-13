// bot/src/index.ts
import http from "node:http";
import fs from "node:fs";
import { loadEnv } from "./env.js";
import { createPool } from "./db.js";
import { Registry } from "./runtime/registry.js";
import { logEvent } from "./log.js";
import { YouTubeNotifier, type YouTubeNotifierConfig } from "./modules/notifications/youtube.js";
import { InstagramNotifier, type InstagramNotifierConfig } from "./modules/notifications/instagram.js";
import { startNivoraDiscordBot } from "./nivoranet/discord.js";
import {
  activeWorkers,
  waitingWorkers,
  forceSwitch,
  skipStreamer,          // ✅ NEW
  setMaxWorkers,
  setMinWatchSec,
  getSchedulerState,
  getLogs,
  setAlertMulti,
  setLock,
} from "./lunaclip/scheduler.js";

/** cgroup v2 helpers (RAM/CPU conteneur) */
function readText(p: string): string | null {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}
function readNum(p: string): number | null {
  const t = readText(p);
  if (!t) return null;
  const s = t.trim();
  if (!s) return null;
  if (s === "max") return Infinity;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getCgroupMemoryMb(): { usedMb: number | null; limitMb: number | null } {
  const cur = readNum("/sys/fs/cgroup/memory.current");
  const max = readNum("/sys/fs/cgroup/memory.max");
  if (cur == null || max == null) return { usedMb: null, limitMb: null };
  const usedMb = cur === Infinity ? null : cur / 1024 / 1024;
  const limitMb = max === Infinity ? null : max / 1024 / 1024;
  return { usedMb, limitMb };
}

function getCgroupCpuLimitCores(): number | null {
  const t = readText("/sys/fs/cgroup/cpu.max");
  if (!t) return null;
  const [quotaStr, periodStr] = t.trim().split(/\s+/);
  const period = Number(periodStr);
  if (!Number.isFinite(period) || period <= 0) return null;
  if (quotaStr === "max") return null;
  const quota = Number(quotaStr);
  if (!Number.isFinite(quota) || quota <= 0) return null;
  return quota / period;
}

function getCgroupCpuUsageUsec(): number | null {
  const t = readText("/sys/fs/cgroup/cpu.stat");
  if (!t) return null;
  const m = t.match(/usage_usec\s+(\d+)/);
  if (!m) return null;
  return Number(m[1]);
}

type Metrics = {
  memory_mb: number;
  ram_limit_mb: number;
  cpu_pct: number;
  cpu_limit_cores: number | null;
};

function makeMetricsSampler() {
  let lastUsec: number | null = null;
  let lastTs: number | null = null;

  return (): Metrics => {
    const mem = getCgroupMemoryMb();
    const usedMb = mem.usedMb ?? (process.memoryUsage().rss / 1024 / 1024);
    const limitMb = mem.limitMb ?? 420;

    const cpuLimit = getCgroupCpuLimitCores();
    const usec = getCgroupCpuUsageUsec();
    const now = Date.now();

    let cpuPct = 0;
    if (usec != null && lastUsec != null && lastTs != null) {
      const du = usec - lastUsec;
      const dtMs = now - lastTs;
      if (du >= 0 && dtMs > 0) {
        const usedSec = du / 1_000_000;
        const wallSec = dtMs / 1000;
        const coresUsed = usedSec / wallSec;
        const denom = (cpuLimit && cpuLimit > 0) ? cpuLimit : 1;
        cpuPct = Math.max(0, Math.min(100, (coresUsed / denom) * 100));
      }
    }
    lastUsec = usec ?? lastUsec;
    lastTs = now;

    return {
      memory_mb: Math.round(usedMb),
      ram_limit_mb: Math.round(limitMb),
      cpu_pct: Math.round(cpuPct),
      cpu_limit_cores: cpuLimit,
    };
  };
}

/**
 * IPC DB: bot -> DB (status + logs) AND DB -> bot (commands)
 */
function startLunaClipDbIpc(pool: ReturnType<typeof createPool>) {
  const sampleMetrics = makeMetricsSampler();
  let lastFlushedTs = 0;

  const flush = async () => {
    const m = sampleMetrics();
    const state = getSchedulerState();

    const workers = [...activeWorkers.values()].map(w => ({
      streamer_id:   w.streamerId,
      streamer_slug: w.streamerSlug,
      dlive_slug:    w.dliveSlug,
      session_id:    w.sessionId.toString(),
      status:        w.status,
      started_at:    w.startedAt,
      hls_url:       w.hlsUrl,
      provider:      w.provider,
      last_frame:    w.lastFrame,
      worker_stats:  w.workerStats,
      elapsed_sec:   Math.floor((Date.now() - w.startedAt.getTime()) / 1000),
    }));

    const payload = {
      ok: true,
      active_count: workers.length,

      // ✅ métriques fidèles conteneur
      memory_mb: m.memory_mb,
      ram_limit_mb: m.ram_limit_mb,
      cpu_pct: m.cpu_pct,
      cpu_limit_cores: m.cpu_limit_cores,

      waiting_slugs: [...waitingWorkers],

      scheduler: state,
      workers,
    };

    await pool.query(
      `
      INSERT INTO lunaclip_admin_state (id, updated_at, payload)
      VALUES (1, NOW(), $1::jsonb)
      ON CONFLICT (id) DO UPDATE
        SET updated_at = EXCLUDED.updated_at,
            payload    = EXCLUDED.payload
      `,
      [JSON.stringify(payload)]
    );

    // logs incremental
    const logs = getLogs(200).filter(l => l.ts > lastFlushedTs);
    if (logs.length) {
      lastFlushedTs = logs[logs.length - 1].ts;

      const values: any[] = [];
      const chunks: string[] = [];
      for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        const base = i * 3;
        chunks.push(`($${base + 1}::text, $${base + 2}::text, $${base + 3}::text)`);
        values.push(l.slug, l.source, l.msg);
      }
      await pool.query(
        `INSERT INTO lunaclip_admin_logs (slug, source, msg) VALUES ${chunks.join(",")}`,
        values
      );

      // ring DB
      await pool.query(`
        DELETE FROM lunaclip_admin_logs
        WHERE id < (SELECT COALESCE(MAX(id),0) - 5000 FROM lunaclip_admin_logs)
      `).catch(() => {});
    }

    // drain commands
    const cr = await pool.query(
      `
      SELECT id, action, payload
      FROM lunaclip_admin_commands
      WHERE status='pending'
      ORDER BY created_at ASC
      LIMIT 20
      `
    );

    for (const row of cr.rows as any[]) {
      const id = Number(row.id);
      const action = String(row.action);
      const payload = row.payload ?? {};

      try {
        if (action === "force_switch") {
          if (!payload.streamer_id) throw new Error("missing streamer_id");
          forceSwitch(Number(payload.streamer_id));

        } else if (action === "skip_streamer") {
          if (!payload.streamer_id) throw new Error("missing streamer_id");
          skipStreamer(Number(payload.streamer_id));

        } else if (action === "set_max_workers") {
          if (typeof payload.value !== "number") throw new Error("missing value");
          setMaxWorkers(Number(payload.value));

        } else if (action === "set_min_watch_sec") {
          if (typeof payload.value !== "number") throw new Error("missing value");
          setMinWatchSec(Number(payload.value));

        } else if (action === "set_alert_multi") {
          if (typeof payload.value !== "number") throw new Error("missing value");
          setAlertMulti(Number(payload.value));

        } else if (action === "set_lock") {
          if (typeof payload.value !== "boolean") throw new Error("missing value");
          if (payload.value === false) {
            setLock(null);
          } else {
            if (!payload.streamer_id) throw new Error("missing streamer_id");
            const dur = (payload.duration_sec == null) ? null : Number(payload.duration_sec);
            setLock(Number(payload.streamer_id), dur);
          }

        } else {
          throw new Error(`unknown action: ${action}`);
        }

        await pool.query(
          `UPDATE lunaclip_admin_commands
           SET status='done', handled_at=NOW(), result=$2::jsonb
           WHERE id=$1`,
          [id, JSON.stringify({ ok: true })]
        );
      } catch (e: any) {
        await pool.query(
          `UPDATE lunaclip_admin_commands
           SET status='error', handled_at=NOW(), result=$2::jsonb
           WHERE id=$1`,
          [id, JSON.stringify({ ok: false, error: String(e?.message ?? e) })]
        );
      }
    }
  };

  const iv = setInterval(() => { flush().catch(() => {}); }, 2000);
  flush().catch(() => {});
  return () => clearInterval(iv);
}

async function main() {
  const env  = loadEnv();
  const pool = createPool(env);

  await logEvent(pool, null, "info", "boot", {
    registryPollMs: env.BOT_REGISTRY_POLL_MS,
    chatPollMs:     env.BOT_CHAT_POLL_MS,
  });

  const registry = new Registry(pool, env);
  // Discord uses a persistent gateway socket. Give it a clear start before the
  // legacy registry launches its many stream workers in this same process.
  const stopNivoraDiscord = await startNivoraDiscordBot(env);
  registry.start();

  const stopIpc = startLunaClipDbIpc(pool);

  // ✅ Démarrer le notificateur YouTube (plus besoin de variables d'environnement)
  let youtubeNotifier: YouTubeNotifier | null = null;
  youtubeNotifier = new YouTubeNotifier(pool, env, {
        pollIntervalMs: env.YOUTUBE_POLL_INTERVAL_MS, // optionnel, utilise la valeur par défaut si non défini
        ignoreRecentHours: 24, // Mode pipeline : ignorer les vidéos des dernières 24h
      });
  youtubeNotifier.start();
  console.log("[bot] YouTube notifier started with hardcoded config");

  // ✅ Démarrer le notificateur Instagram
  let instagramNotifier: InstagramNotifier | null = null;
  instagramNotifier = new InstagramNotifier(pool, env, {
        ignoreStartupHistory: true, // Ignorer l'historique au premier démarrage
      });
  instagramNotifier.start();
  console.log("[bot] Instagram notifier started with hardcoded config");

  // (Optionnel) health server
  let server: http.Server | null = null;
  if (env.PORT) {
    server = http.createServer(async (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });
    server.listen(env.PORT, () => console.log(`[bot] health listening on :${env.PORT}`));
  }

  const shutdown = async (sig: string) => {
    console.log(`[bot] shutdown ${sig}`);
    try { stopIpc(); }               catch {}
    try { registry.stop(); }         catch {}
    try { await stopNivoraDiscord(); } catch {}
    try { youtubeNotifier?.stop(); } catch {}
    try { instagramNotifier?.stop(); } catch {}
    try { await pool.end(); }        catch {}
    try { server?.close(); }         catch {}
    process.exit(0);
  };

  process.on("SIGINT",  () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[bot] fatal:", e);
  process.exit(1);
});
