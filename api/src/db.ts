import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      rubis INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS streamer_requests (
      id SERIAL PRIMARY KEY,
      user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS streamers (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      user_id INT UNIQUE NULL REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      viewers INT NOT NULL DEFAULT 0,
      is_live BOOLEAN NOT NULL DEFAULT FALSE,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      suspended_until TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // ✅ upgrades si la table existait déjà
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS user_id INT;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

  // requis pour ton ON CONFLICT (user_id) dans approve
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS streamers_user_id_uq ON streamers(user_id);`);

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
