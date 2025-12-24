// api/src/db/migrations/mig001_core.ts
import type { Pool } from "pg";

export async function mig001_core(pool: Pool) {
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
}
