import pg from "pg";
import type { Pool } from "pg";
import type { BotEnv } from "./env.js";

export function createPool(env: BotEnv): Pool {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000
  });

  pool.on("error", (err) => {
    console.error("[bot][pg] pool error:", err);
  });

  return pool;
}
