import http from "node:http";
import { loadEnv } from "./env.js";
import { createPool } from "./db.js";
import { Registry } from "./runtime/registry.js";
import { logEvent } from "./log.js";

async function main() {
  const env = loadEnv();
  const pool = createPool(env);

  await logEvent(pool, null, "info", "boot", {
    registryPollMs: env.BOT_REGISTRY_POLL_MS,
    chatPollMs: env.BOT_CHAT_POLL_MS
  });

  const registry = new Registry(pool, env);
  registry.start();

  // health (optionnel)
  let server: http.Server | null = null;
  if (env.PORT) {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    server.listen(env.PORT, () => {
      console.log(`[bot] health listening on :${env.PORT}`);
    });
  }

  const shutdown = async (sig: string) => {
    console.log(`[bot] shutdown ${sig}`);
    try { registry.stop(); } catch {}
    try { await pool.end(); } catch {}
    try { server?.close(); } catch {}
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[bot] fatal:", e);
  process.exit(1);
});
