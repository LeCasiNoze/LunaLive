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

  let server: http.Server | null = null;
  if (env.PORT) {
    server = http.createServer(async (req, res) => {
      const url    = req.url ?? "/";
      const method = req.method ?? "GET";

      res.setHeader("content-type", "application/json");

      // ── GET /lunaclip/status ─────────────────────────────────────────
      if (url === "/lunaclip/status" && method === "GET") {
        const memMb = process.memoryUsage().rss / 1024 / 1024;
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

        res.writeHead(200);
        res.end(JSON.stringify({
          ok:            true,
          active_count:  workers.length,
          alert_multi:   parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300"),
          memory_mb:     Math.round(memMb),
          ram_limit_mb:  RAM_LIMIT_MB,
          skipped_ram:   [...skippedRam],
          waiting_slugs: [...waitingWorkers],
          ignored_ids:   [...ignoredStreamers],
          scheduler:     state,
          workers,
        }));
        return;
      }

      // ── GET /lunaclip/logs ───────────────────────────────────────────
      if (url.startsWith("/lunaclip/logs") && method === "GET") {
        const params = new URL(url, "http://x").searchParams;
        const limit  = Math.min(parseInt(params.get("limit") ?? "100"), 200);
        const slug   = params.get("slug") ?? null;
        let logs     = getLogs(200);
        if (slug) logs = logs.filter(l => l.slug === slug || l.slug === "scheduler");
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, logs: logs.slice(-limit) }));
        return;
      }

      // ── POST /lunaclip/control ───────────────────────────────────────
      if (url === "/lunaclip/control" && method === "POST") {
        let body: any;
        try { body = await readBody(req); }
        catch {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
          return;
        }

        const { action, streamer_id, value } = body as {
          action:      string;
          streamer_id?: number;
          value?:       number | boolean;
        };

        switch (action) {

          case "force_switch":
            if (!streamer_id) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "missing streamer_id" })); return; }
            forceSwitch(streamer_id);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, action, streamer_id }));
            break;

          case "set_max_workers":
            if (typeof value !== "number") { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "missing value" })); return; }
            setMaxWorkers(value as number);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, action, max_workers: value }));
            break;

          case "set_min_watch_sec":
            if (typeof value !== "number") { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "missing value" })); return; }
            setMinWatchSec(value as number);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, action, min_watch_sec: value }));
            break;

          case "set_ignored":
            if (!streamer_id || typeof value !== "boolean") { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "missing params" })); return; }
            setIgnored(streamer_id, value as boolean);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, action, streamer_id, ignored: value }));
            break;

          default:
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: `unknown action: ${action}` }));
        }
        return;
      }

      // ── Healthcheck ──────────────────────────────────────────────────
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });

    server.listen(env.PORT, () => {
      console.log(`[bot] health listening on :${env.PORT}`);
    });
  }

  const shutdown = async (sig: string) => {
    console.log(`[bot] shutdown ${sig}`);
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