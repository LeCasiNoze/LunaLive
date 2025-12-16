import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function migrate() {
  // 1) Créations (si absent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      rubis INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NULL,
      created_ip INET NULL,
      last_login_ip INET NULL
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

    -- Inscriptions en attente (code email)
    CREATE TABLE IF NOT EXISTS pending_registrations (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_ip INET NULL
    );

    -- Uniques case-insensitive (users)
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (lower(username));
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

    -- Uniques case-insensitive (pending)
    CREATE UNIQUE INDEX IF NOT EXISTS pending_username_lower_uq ON pending_registrations (lower(username));
    CREATE UNIQUE INDEX IF NOT EXISTS pending_email_lower_uq ON pending_registrations (lower(email));
  `);

  // 2) Upgrades si la table existait déjà (important si tu avais l’ancien schema)
  await pool.query(`
    ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;
    ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_ip INET NULL;
    ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_login_ip INET NULL;
  `);

  // 3) Upgrades streamers (tu avais déjà ça)
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS user_id INT;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

  // Requis pour ton ON CONFLICT (user_id)
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
