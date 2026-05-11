#!/usr/bin/env node

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import crypto from "crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dir, "..");
const apiDir = resolve(rootDir, "api");

function loadEnv() {
  try {
    const raw = readFileSync(resolve(apiDir, ".env"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    console.error("Impossible de lire api/.env");
    process.exit(1);
  }
}

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "streamer";
}

function parseArgs(argv) {
  const out = { file: "", dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");
    if (arg === "--dry") {
      out.dry = true;
      continue;
    }
    if (arg === "--file") {
      out.file = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
  }
  return out;
}

function makePassword() {
  return crypto.randomBytes(12).toString("base64url");
}

async function loadJsonInput(filePath) {
  const raw = filePath
    ? readFileSync(resolve(rootDir, filePath), "utf-8")
    : await new Promise((resolveText, rejectText) => {
        const chunks = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => chunks.push(chunk));
        process.stdin.on("end", () => resolveText(chunks.join("")));
        process.stdin.on("error", rejectText);
      });
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Input JSON must be an array");
  return parsed;
}

loadEnv();

const pgUrl = pathToFileURL(resolve(apiDir, "node_modules/pg/lib/index.js")).href;
const bcryptUrl = pathToFileURL(resolve(apiDir, "node_modules/bcryptjs/index.js")).href;
const [{ default: pg }, { default: bcrypt }] = await Promise.all([
  import(pgUrl),
  import(bcryptUrl),
]);

const { Pool } = pg;

async function ensureSeedTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS seeded_streamer_accounts (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_platform TEXT NOT NULL DEFAULT 'rumble',
      source_username TEXT NOT NULL,
      source_url TEXT NULL,
      access_username TEXT NOT NULL,
      access_email TEXT NOT NULL,
      access_password_plain TEXT NOT NULL,
      bot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seeded_streamer_accounts_streamer_uq
      ON seeded_streamer_accounts (streamer_id);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seeded_streamer_accounts_user_uq
      ON seeded_streamer_accounts (user_id);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seeded_streamer_accounts_source_uq
      ON seeded_streamer_accounts (lower(source_platform), lower(source_username));
  `);
}

async function ensureUniqueUserIdentity(client, desiredUsername) {
  let username = desiredUsername;
  let suffix = 2;
  while (true) {
    const r = await client.query(
      `SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`,
      [username]
    );
    if (!r.rows[0]) return username;
    username = `${desiredUsername}_${suffix}`;
    suffix += 1;
  }
}

async function ensureUniqueSlug(client, desiredSlug) {
  let slug = desiredSlug;
  let suffix = 2;
  while (true) {
    const r = await client.query(
      `SELECT id FROM streamers WHERE lower(slug) = lower($1) LIMIT 1`,
      [slug]
    );
    if (!r.rows[0]) return slug;
    slug = `${desiredSlug}-${suffix}`;
    suffix += 1;
  }
}

async function findExistingStreamer(client, rumbleUsername) {
  const r = await client.query(
    `SELECT s.id, s.user_id, s.slug, s.display_name
       FROM streamers s
      WHERE lower(coalesce(s.rumble_username, '')) = lower($1)
      LIMIT 1`,
    [rumbleUsername]
  );
  return r.rows[0] || null;
}

async function createOrReuseSeededStreamer(client, entry) {
  const existingSeed = await client.query(
    `SELECT *
       FROM seeded_streamer_accounts
      WHERE lower(source_platform) = 'rumble'
        AND lower(source_username) = lower($1)
      LIMIT 1`,
    [entry.rumbleUsername]
  );
  const existingStreamer = await findExistingStreamer(client, entry.rumbleUsername);

  let userId = Number(existingSeed.rows[0]?.user_id || existingStreamer?.user_id || 0) || null;
  let streamerId = Number(existingSeed.rows[0]?.streamer_id || existingStreamer?.id || 0) || null;
  let accessUsername = existingSeed.rows[0]?.access_username
    ? String(existingSeed.rows[0].access_username)
    : null;
  let accessEmail = existingSeed.rows[0]?.access_email
    ? String(existingSeed.rows[0].access_email)
    : null;
  let accessPassword = existingSeed.rows[0]?.access_password_plain
    ? String(existingSeed.rows[0].access_password_plain)
    : null;

  if (!userId) {
    const desiredUsername = String(entry.accessUsername || entry.rumbleUsername).trim();
    accessUsername = await ensureUniqueUserIdentity(client, desiredUsername);
    accessEmail = `${slugify(accessUsername)}@lunalive.invalid`;
    accessPassword = makePassword();
    const passwordHash = await bcrypt.hash(accessPassword, 10);
    const userInsert = await client.query(
      `INSERT INTO users (
         username, email, email_verified, password_hash, role, rubis, last_login_at
       )
       VALUES ($1, $2, TRUE, $3, 'streamer', 0, NOW())
       RETURNING id`,
      [accessUsername, accessEmail, passwordHash]
    );
    userId = Number(userInsert.rows[0].id);
  }

  if (!streamerId) {
    const desiredSlug = slugify(entry.displayName || entry.rumbleUsername);
    const slug = await ensureUniqueSlug(client, desiredSlug);
    const streamerInsert = await client.query(
      `INSERT INTO streamers (
         slug, display_name, user_id, title, viewers, is_live, platform, rumble_username, radio_source, appearance
       )
       VALUES ($1, $2, $3, '', 0, FALSE, 'rumble', $4, FALSE, '{}'::jsonb)
       RETURNING id`,
      [slug, entry.displayName || entry.rumbleUsername, userId, entry.rumbleUsername]
    );
    streamerId = Number(streamerInsert.rows[0].id);
  } else {
    await client.query(
      `UPDATE streamers
          SET display_name = $2,
              platform = 'rumble',
              rumble_username = $3,
              radio_source = FALSE,
              suspended_until = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [streamerId, entry.displayName || entry.rumbleUsername, entry.rumbleUsername]
    );
  }

  await client.query(`UPDATE users SET role = 'streamer' WHERE id = $1`, [userId]);

  await client.query(
    `INSERT INTO bot_streamer_settings (streamer_id, enabled, prefix, live_only)
     VALUES ($1, FALSE, '!', TRUE)
     ON CONFLICT (streamer_id) DO UPDATE
       SET enabled = FALSE,
           prefix = EXCLUDED.prefix,
           live_only = EXCLUDED.live_only,
           updated_at = NOW()`,
    [streamerId]
  );

  const subStart = new Date();
  const subEnd = new Date(Date.now() + 3650 * 24 * 3600 * 1000);
  await client.query(
    `INSERT INTO user_subscriptions (
       user_id, plan_code, provider, provider_subscription_id,
       status, current_period_start, current_period_end, cancel_at_period_end,
       created_at, updated_at
     )
     VALUES ($1, 'streamer', 'manual', $2, 'active', $3, $4, FALSE, NOW(), NOW())
     ON CONFLICT (user_id, plan_code) DO UPDATE
       SET provider = EXCLUDED.provider,
           provider_subscription_id = EXCLUDED.provider_subscription_id,
           status = 'active',
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = FALSE,
           updated_at = NOW()`,
    [userId, `manual:${userId}:streamer:seeded`, subStart.toISOString(), subEnd.toISOString()]
  );

  await client.query(
    `DELETE FROM rumble_radio_sources
      WHERE lower(username) = lower($1)`,
    [entry.rumbleUsername]
  );

  await client.query(
    `INSERT INTO seeded_streamer_accounts (
       streamer_id, user_id, source_platform, source_username, source_url,
       access_username, access_email, access_password_plain, bot_enabled, notes
     )
     VALUES ($1, $2, 'rumble', $3, $4, $5, $6, $7, FALSE, $8)
     ON CONFLICT (streamer_id) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           source_platform = EXCLUDED.source_platform,
           source_username = EXCLUDED.source_username,
           source_url = EXCLUDED.source_url,
           access_username = EXCLUDED.access_username,
           access_email = EXCLUDED.access_email,
           access_password_plain = COALESCE(seeded_streamer_accounts.access_password_plain, EXCLUDED.access_password_plain),
           bot_enabled = FALSE,
           notes = EXCLUDED.notes,
           updated_at = NOW()`,
    [
      streamerId,
      userId,
      entry.rumbleUsername,
      `https://rumble.com/user/${entry.rumbleUsername}`,
      accessUsername,
      accessEmail,
      accessPassword,
      entry.notes || null,
    ]
  );

  return {
    mode: "streamer",
    rumbleUsername: entry.rumbleUsername,
    displayName: entry.displayName || entry.rumbleUsername,
    userId,
    streamerId,
    accessUsername,
    accessEmail,
    accessPassword,
  };
}

async function upsertRadioSource(client, entry) {
  await client.query(
    `INSERT INTO rumble_radio_sources (username, display_name, active, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           active = EXCLUDED.active,
           notes = EXCLUDED.notes,
           updated_at = NOW()`,
    [
      entry.rumbleUsername,
      entry.displayName || entry.rumbleUsername,
      entry.active !== false,
      entry.notes || null,
    ]
  );
  return {
    mode: "radio",
    rumbleUsername: entry.rumbleUsername,
    displayName: entry.displayName || entry.rumbleUsername,
    active: entry.active !== false,
  };
}

const args = parseArgs(process.argv.slice(2));
const entries = await loadJsonInput(args.file);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await ensureSeedTable(client);

  const results = [];
  for (const rawEntry of entries) {
    const entry = {
      mode: String(rawEntry?.mode || "streamer").trim().toLowerCase(),
      rumbleUsername: String(rawEntry?.rumbleUsername || "").trim(),
      displayName: String(rawEntry?.displayName || rawEntry?.rumbleUsername || "").trim(),
      notes: rawEntry?.notes == null ? null : String(rawEntry.notes),
      accessUsername: rawEntry?.accessUsername == null ? null : String(rawEntry.accessUsername).trim(),
      active: rawEntry?.active,
    };

    if (!entry.rumbleUsername) throw new Error("rumbleUsername is required");

    if (entry.mode === "radio") {
      results.push(await upsertRadioSource(client, entry));
      continue;
    }

    results.push(await createOrReuseSeededStreamer(client, entry));
  }

  if (args.dry) {
    await client.query("ROLLBACK");
  } else {
    await client.query("COMMIT");
  }

  console.log(JSON.stringify({ ok: true, dry: args.dry, results }, null, 2));
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {}
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
