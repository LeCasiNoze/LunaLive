import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamers (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      viewers INT NOT NULL DEFAULT 0,
      is_live BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function seedIfEmpty() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM streamers;`);
  if (rows[0].n > 0) return;

  await pool.query(
    `INSERT INTO streamers (slug, display_name, title, viewers, is_live) VALUES
     ('wayzebi','Wayzebi','Slots session — bonus hunt',842,true),
     ('sinisterzs','Sinisterzs','Morning grind — chill',510,true),
     ('nico-carasso','Nico Carasso','Big balance / risky spins',321,true),
     ('teoman','Teoman','Community picks — let’s go',205,true),
     ('bryan-cars','BryanCars','Late session — last shots',96,true);`
  );
}
