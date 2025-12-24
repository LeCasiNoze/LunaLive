// api/src/db.ts
import { Pool, type QueryResult } from "pg";
import { migrateAll } from "./db/migrations";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render Postgres est quasi toujours en TLS en prod
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

// Petit alias pratique (si tu veux faire: db.query(...) ailleurs)
export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

export async function migrate() {
  await migrateAll(pool);
}

export async function seedIfEmpty() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM streamers;`);
  if ((rows[0]?.n ?? 0) > 0) return;

  await pool.query(`
    INSERT INTO streamers (slug, display_name, title, viewers, is_live) VALUES
    ('wayzebi','Wayzebi','Slots session — bonus hunt',842,true),
    ('sinisterzs','Sinisterzs','Morning grind — chill',510,true),
    ('nico-carasso','Nico Carasso','Big balance / risky spins',321,true),
    ('teoman','Teoman','Community picks — let’s go',205,true),
    ('bryan-cars','BryanCars','Late session — last shots',96,true);
  `);
}
