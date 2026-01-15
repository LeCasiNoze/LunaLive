// api/src/db.ts
import { Pool } from "pg";
import { migrateAll } from "./db/migrations/index.js";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

export async function migrate() {
  await migrateAll(pool);
}

