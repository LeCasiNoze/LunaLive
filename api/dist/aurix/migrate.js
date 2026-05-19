import { pool } from "../db.js";
const MIGRATIONS = [
    {
        name: "001_init.sql",
        sql: `
CREATE TABLE IF NOT EXISTS aurix_kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aurix_tickets (
    channel_id   BIGINT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status       TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS idx_aurix_tickets_user ON aurix_tickets(user_id);

CREATE TABLE IF NOT EXISTS aurix_refill_batches (
    id              BIGSERIAL PRIMARY KEY,
    cutoff_at       TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    message_id      BIGINT,
    channel_id      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS aurix_refill_requests (
    id                BIGSERIAL PRIMARY KEY,
    batch_id          BIGINT NOT NULL REFERENCES aurix_refill_batches(id) ON DELETE CASCADE,
    user_id           BIGINT NOT NULL,
    username          TEXT NOT NULL,
    casino_username   TEXT,
    email             TEXT,
    amount            TEXT,
    notes             TEXT,
    ticket_channel_id BIGINT,
    requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aurix_refill_requests_batch ON aurix_refill_requests(batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_aurix_refill_requests_batch_user
    ON aurix_refill_requests(batch_id, user_id);

CREATE TABLE IF NOT EXISTS aurix_user_accounts (
    user_id          BIGINT PRIMARY KEY,
    telegram         TEXT,
    email            TEXT,
    casino_username  TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`,
    },
    {
        name: "002_apply_tickets_and_celsius.sql",
        sql: `
ALTER TABLE aurix_tickets ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'deal';
ALTER TABLE aurix_tickets ADD COLUMN IF NOT EXISTS apply_email TEXT;
ALTER TABLE aurix_tickets ADD COLUMN IF NOT EXISTS apply_telegram TEXT;
ALTER TABLE aurix_tickets ADD COLUMN IF NOT EXISTS apply_total_deposit TEXT;

CREATE TABLE IF NOT EXISTS aurix_celsius_submissions (
  id               BIGSERIAL PRIMARY KEY,
  guild_id         BIGINT NOT NULL,
  guild_name       TEXT,
  streamer_user_id BIGINT,
  viewer_user_id   BIGINT NOT NULL,
  viewer_username  TEXT NOT NULL,
  celsius_pseudo   TEXT NOT NULL,
  celsius_email    TEXT NOT NULL,
  monthly_deposit  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_aurix_celsius_guild_viewer
  ON aurix_celsius_submissions(guild_id, viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_aurix_celsius_guild_status
  ON aurix_celsius_submissions(guild_id, status);
`,
    },
    {
        name: "003_watcher_review.sql",
        sql: `
ALTER TABLE aurix_celsius_submissions ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE aurix_celsius_submissions ADD COLUMN IF NOT EXISTS decided_by BIGINT;
ALTER TABLE aurix_celsius_submissions ADD COLUMN IF NOT EXISTS monthly_deposit_amount NUMERIC;
ALTER TABLE aurix_celsius_submissions ADD COLUMN IF NOT EXISTS review_message_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_aurix_celsius_viewer ON aurix_celsius_submissions(viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_aurix_celsius_deposit ON aurix_celsius_submissions(monthly_deposit_amount);
`,
    },
    {
        name: "004_celsius_review_queue.sql",
        sql: `
ALTER TABLE aurix_celsius_submissions ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_aurix_celsius_queue
    ON aurix_celsius_submissions(status, skipped_at, created_at);
`,
    },
];
export async function runMigrations() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS aurix_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
    for (const m of MIGRATIONS) {
        const applied = await pool.query("SELECT 1 FROM aurix_migrations WHERE name=$1", [m.name]);
        if (applied.rowCount && applied.rowCount > 0)
            continue;
        console.log(`[aurix.migrate] applying ${m.name}`);
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(m.sql);
            await client.query("INSERT INTO aurix_migrations(name) VALUES($1)", [m.name]);
            await client.query("COMMIT");
        }
        catch (e) {
            await client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    }
    console.log("[aurix.migrate] done.");
}
