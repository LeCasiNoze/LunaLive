-- Aurix bot — schéma Postgres (préfixe aurix_ pour cohabiter avec LunaLive)

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
