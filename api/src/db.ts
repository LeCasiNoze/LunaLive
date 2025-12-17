// api/src/db.ts
import { Pool, type QueryResult } from "pg";

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
  // 1) Tables de base (version minimale, safe si déjà existant)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      rubis INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS streamer_requests (
      id SERIAL PRIMARY KEY,
      user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
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

    CREATE TABLE IF NOT EXISTS provider_accounts (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'dlive',
      channel_slug TEXT NOT NULL,          -- displayname (URL dlive.tv/{displayname})
      channel_username TEXT NULL,          -- username (HLS)
      rtmp_url TEXT NOT NULL,
      stream_key TEXT NOT NULL,
      assigned_to_streamer_id INT NULL REFERENCES streamers(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ NULL,
      released_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 1bis) CHAT TABLES (rétention fonctionnelle = nettoyage après 3 jours d’inactivité)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      deleted_by INT NULL REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chat_bans (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NULL,
      PRIMARY KEY (streamer_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS chat_timeouts (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS streamer_mods (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (streamer_id, user_id)
    );
  `);

  // 2) Upgrade users (ajout de colonnes si elles n'existent pas)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_ip INET NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip INET NULL;`);

  // provider_accounts upgrade (si existait avant)
  await pool.query(`ALTER TABLE provider_accounts ADD COLUMN IF NOT EXISTS channel_username TEXT;`);

  // On garde username/password_hash non null pour la logique auth
  await pool.query(`ALTER TABLE users ALTER COLUMN username SET NOT NULL;`);
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;`);

  // 3) Backfill pour les users déjà existants (sinon ils bloquent tout)
  await pool.query(`
    UPDATE users
    SET email = COALESCE(email, ('legacy+' || id::text || '@lunalive.invalid')),
        email_verified = TRUE
    WHERE email IS NULL OR email = '';
  `);

  // 4) Index uniques case-insensitive (après ajout colonnes)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (lower(username));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));`);

  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS pending_username_lower_uq ON pending_registrations (lower(username));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS pending_email_lower_uq ON pending_registrations (lower(email));`);

  // 5) Streamers upgrades + index
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS user_id INT;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE IF EXISTS streamers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS streamers_user_id_uq ON streamers(user_id);`);

  // 6) Provider accounts indexes
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS provider_accounts_provider_slug_uq
    ON provider_accounts (provider, lower(channel_slug));
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS provider_accounts_assigned_idx
    ON provider_accounts (assigned_to_streamer_id);
  `);

  // 7) Chat indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_streamer_created_idx
    ON chat_messages(streamer_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_streamer_user_created_idx
    ON chat_messages(streamer_id, user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_timeouts_streamer_user_expires_idx
    ON chat_timeouts(streamer_id, user_id, expires_at DESC);
  `);
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
