// api/src/db.ts
import { Pool } from "pg";
import { migrateAll } from "./db/migrations/index.js";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  // La base Render Basic dispose de 0,1 CPU : trop de connexions parallèles
  // augmentent la contention et la mémoire sans augmenter son débit utile.
  max: Math.max(2, Math.min(40, Number(process.env.DB_POOL_MAX || 12))),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

export async function migrate() {
  await migrateAll(pool);
}

