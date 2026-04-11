// api/src/db.ts
import { Pool } from "pg";
import { migrateAll } from "./db/migrations/index.js";
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});
export const db = {
    query: (text, params) => pool.query(text, params),
};
export async function migrate() {
    await migrateAll(pool);
}
