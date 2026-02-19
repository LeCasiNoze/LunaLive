// bot/src/index.ts
import http from "node:http";
import { loadEnv } from "./env.js";
import { createPool } from "./db.js";
import { Registry } from "./runtime/registry.js";
import { logEvent } from "./log.js";
import { startLunaClipScheduler, stopLunaClipScheduler, activeWorkers } from "./lunaclip/scheduler.js";
async function main() {
  const env  = loadEnv();
  const pool = createPool(env);

  await logEvent(pool, null, "info", "boot", {
    registryPollMs: env.BOT_REGISTRY_POLL_MS,
    chatPollMs:     env.BOT_CHAT_POLL_MS,
  });

  const registry = new Registry(pool, env);
  registry.start();

  // LunaClip — analyse automatique des streams en live
  startLunaClipScheduler(pool);

  // Health server — expose aussi l'état LunaClip pour l'api
  let server: http.Server | null = null;
  if (env.PORT) {
    server = http.createServer((req, res) => {
      // GET /lunaclip/status — lu par api/src/lunaclip/routes.ts
      if (req.url === "/lunaclip/status" && req.method === "GET") {
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
        }));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, active_count: workers.length, workers }));
        return;
      }

      // Healthcheck par défaut
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });

    server.listen(env.PORT, () => {
      console.log(`[bot] health listening on :${env.PORT}`);
    });
  }

  const shutdown = async (sig: string) => {
    console.log(`[bot] shutdown ${sig}`);
    try { stopLunaClipScheduler(); } catch {}
    try { registry.stop(); } catch {}
    try { await pool.end(); } catch {}
    try { server?.close(); } catch {}
    process.exit(0);
  };

  process.on("SIGINT",  () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[bot] fatal:", e);
  process.exit(1);
});