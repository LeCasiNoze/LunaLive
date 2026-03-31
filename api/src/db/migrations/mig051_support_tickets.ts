// api/src/db/migrations/mig051_support_tickets.ts
import type { Pool } from "pg";

export async function mig051_support_tickets(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id            BIGSERIAL PRIMARY KEY,
      discord_user_id   TEXT NOT NULL,
      lunalive_user_id  BIGINT NULL,
      channel_id        TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'open',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at         TIMESTAMPTZ NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user
      ON support_tickets (discord_user_id, status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_channel
      ON support_tickets (channel_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id          BIGSERIAL PRIMARY KEY,
      ticket_id   BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
      ON support_messages (ticket_id, created_at);
  `);
}
