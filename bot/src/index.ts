// bot/src/index.ts
import http from "node:http";
import { loadEnv } from "./env.js";
import { createPool } from "./db.js";
import { Registry } from "./runtime/registry.js";
import { logEvent } from "./log.js";
import {
  startLunaClipScheduler,
  stopLunaClipScheduler,
  activeWorkers,
  skippedRam,
  waitingWorkers,
  ignoredStreamers,
  forceSwitch,
  setMaxWorkers,
  setMinWatchSec,
  setIgnored,
  getSchedulerState,
  getLogs,
} from "./lunaclip/scheduler.js";

const RAM_LIMIT_MB = parseFloat(process.env.LUNACLIP_RAM_LIMIT_MB ?? "420");
const ALERT_MULTI  = parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300");

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("invalid_json")); }
    });
    req.on("error", reject);
  });
}

/**
 * IPC DB: bot -> DB (status + logs) AND DB -> bot (commands)
 * Le dashboard lit la DB via l'API, donc plus besoin d'URL bot.
 */
function startLunaClipDbIpc(pool: ReturnType<typeof createPool>) {
  let lastFlushedTs = 0;

  const flush = async () => {
    // 1) Snapshot status
    const memMb = process.memoryUsage().rss / 1024 / 1024;

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
      active_count:  workers.length,
      alert_multi:   ALERT_MULTI,
      memory_mb:     Math.round(memMb),
      ram_limit_mb:  RAM_LIMIT_MB,
      skipped_ram:   [...skippedRam],
      waiting_slugs: [...waitingWorkers],
      ignored_ids:   [...ignoredStreamers],
      scheduler:     getSchedulerState(),
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

    // 2) Flush logs (on pousse uniquement les "nouveaux" selon ts)
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

      // ts = NOW() côté DB, on a déjà l.ts si tu veux, mais pas nécessaire
      await pool.query(
        `INSERT INTO lunaclip_admin_logs (slug, source, msg) VALUES ${chunks.join(",")}`,
        values
      );

      // Optionnel: nettoyage pour éviter croissance infinie
      await pool.query(`
        DELETE FROM lunaclip_admin_logs
        WHERE id < (
          SELECT COALESCE(MAX(id),0) - 5000 FROM lunaclip_admin_logs
        )
      `).catch(() => {});
    }

    // 3) Drain commands pending
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
        } else if (action === "set_max_workers") {
          if (typeof payload.value !== "number") throw new Error("missing value");
          setMaxWorkers(Number(payload.value));
        } else if (action === "set_min_watch_sec") {
          if (typeof payload.value !== "number") throw new Error("missing value");
          setMinWatchSec(Number(payload.value));
        } else if (action === "set_ignored") {
          if (!payload.streamer_id || typeof payload.value !== "boolean") throw new Error("missing params");
          setIgnored(Number(payload.streamer_id), Boolean(payload.value));
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

  // 2s comme ton dashboard (POLL_MS=2000)
  const iv = setInterval(() => {
    flush().catch(() => {});
  }, 2000);

  // premier run immédiat
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
  registry.start();

  startLunaClipScheduler(pool);

  // ✅ IPC DB pour dashboard LunaClip
  const stopIpc = startLunaClipDbIpc(pool);

  // (Optionnel) health server si tu veux encore
  let server: http.Server | null = null;
  if (env.PORT) {
    server = http.createServer(async (req, res) => {
      const url    = req.url ?? "/";
      const method = req.method ?? "GET";
      res.setHeader("content-type", "application/json");

      if (url === "/health" && method === "GET") {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url === "/lunaclip/control" && method === "POST") {
        let body: any;
        try { body = await readBody(req); }
        catch {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, note: "Dashboard uses DB IPC now", body }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });

    server.listen(env.PORT, () => {
      console.log(`[bot] health listening on :${env.PORT}`);
    });
  }

  const shutdown = async (sig: string) => {
    console.log(`[bot] shutdown ${sig}`);
    try { stopIpc(); }               catch {}
    try { stopLunaClipScheduler(); } catch {}
    try { registry.stop(); }         catch {}
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