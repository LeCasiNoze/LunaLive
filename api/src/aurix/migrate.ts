import { pool } from "../db.js";

const MIGRATIONS: { name: string; sql: string }[] = [
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
  {
    name: "005_celsius_vip_invited.sql",
    sql: `
ALTER TABLE aurix_celsius_submissions ADD COLUMN IF NOT EXISTS vip_invited_at TIMESTAMPTZ;
`,
  },
  {
    name: "006_ticket_partners.sql",
    sql: `
CREATE TABLE IF NOT EXISTS aurix_ticket_partners (
    ticket_channel_id BIGINT NOT NULL,
    partner_user_id   BIGINT NOT NULL,
    added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ticket_channel_id, partner_user_id)
);
CREATE INDEX IF NOT EXISTS idx_aurix_ticket_partners_user
    ON aurix_ticket_partners(partner_user_id);
`,
  },
  {
    name: "007_landing_verif.sql",
    sql: `
CREATE TABLE IF NOT EXISTS aurix_landing_verif_refs (
    id                   BIGSERIAL PRIMARY KEY,
    pseudo               TEXT NOT NULL,
    taap_url             TEXT NOT NULL UNIQUE,
    expected_celsius_url TEXT NOT NULL,
    last_check_at        TIMESTAMPTZ,
    last_status          TEXT,
    last_details         TEXT,
    last_taap_destination TEXT,
    last_landing_slug    TEXT,
    last_db_affi_link    TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aurix_landing_verif_refs_status
    ON aurix_landing_verif_refs(last_status);
`,
  },
  {
    name: "008_landing_verif_publish_domain.sql",
    sql: `
ALTER TABLE aurix_landing_verif_refs
    ADD COLUMN IF NOT EXISTS last_publish_domain TEXT;
`,
  },
  {
    name: "009_auto_refills.sql",
    sql: `
CREATE TABLE IF NOT EXISTS aurix_auto_refills (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    amount        TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    cadence_days  INT  NOT NULL DEFAULT 1,
    next_run_at   TIMESTAMPTZ NOT NULL,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aurix_auto_refills_due
    ON aurix_auto_refills(active, next_run_at);

-- Seed dealjb : 1000€ tous les 2 jours, 1er run = apres-demain 00:00 UTC
-- (aujourd'hui geree manuellement par l'admin).
INSERT INTO aurix_auto_refills (email, amount, display_name, cadence_days, next_run_at, notes)
VALUES (
    'dealjb@hotmail.com',
    '1000€',
    'dealjb',
    2,
    date_trunc('day', NOW()) + INTERVAL '2 days',
    'Auto-refill recurrent - pas via /refill'
) ON CONFLICT (email) DO NOTHING;
`,
  },
  {
    name: "010_refill_amount_wager.sql",
    sql: `
ALTER TABLE aurix_user_accounts  ADD COLUMN IF NOT EXISTS refill_amount TEXT;
ALTER TABLE aurix_user_accounts  ADD COLUMN IF NOT EXISTS wager         TEXT;
ALTER TABLE aurix_auto_refills   ADD COLUMN IF NOT EXISTS wager         TEXT;
ALTER TABLE aurix_refill_requests ADD COLUMN IF NOT EXISTS wager        TEXT;

-- Wager par defaut pour les auto-refills existants (dealjb).
UPDATE aurix_auto_refills SET wager = 'no wag' WHERE wager IS NULL;
`,
  },
  {
    name: "011_landing_verif_v3_pages.sql",
    sql: `
ALTER TABLE aurix_landing_verif_refs
    DROP CONSTRAINT IF EXISTS aurix_landing_verif_refs_taap_url_key;

ALTER TABLE aurix_landing_verif_refs
    ALTER COLUMN taap_url DROP NOT NULL;

ALTER TABLE aurix_landing_verif_refs
    ADD COLUMN IF NOT EXISTS page_slug TEXT;

ALTER TABLE aurix_landing_verif_refs
    ADD COLUMN IF NOT EXISTS page_publish_domain TEXT;

ALTER TABLE aurix_landing_verif_refs
    ADD COLUMN IF NOT EXISTS sheet_matched BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_aurix_landing_verif_refs_page_slug
    ON aurix_landing_verif_refs (LOWER(page_slug))
    WHERE page_slug IS NOT NULL;
`,
  },
  {
    name: "012_streamer_auto_validate_celsius.sql",
    sql: `
CREATE TABLE IF NOT EXISTS aurix_streamer_settings (
    guild_id              BIGINT PRIMARY KEY,
    guild_name            TEXT,
    auto_validate_celsius BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by            BIGINT,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aurix_streamer_settings_auto_validate
    ON aurix_streamer_settings(auto_validate_celsius);
`,
  },
];

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurix_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const m of MIGRATIONS) {
    const applied = await pool.query("SELECT 1 FROM aurix_migrations WHERE name=$1", [m.name]);
    if (applied.rowCount && applied.rowCount > 0) continue;

    console.log(`[aurix.migrate] applying ${m.name}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query("INSERT INTO aurix_migrations(name) VALUES($1)", [m.name]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  console.log("[aurix.migrate] done.");
}
