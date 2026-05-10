import type { Pool } from "pg";

export async function mig116_todos(pool: Pool) {
  // Liste de todos partagée par l'équipe FSB. Affichée dans un widget sur la
  // page d'accueil du FSB Board. Créés via la commande Discord /todo.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fsb_todos (
      id              SERIAL PRIMARY KEY,
      message         TEXT NOT NULL,
      attachment_url  TEXT,
      attachment_name TEXT,
      created_by_user_id BIGINT,
      created_by_name TEXT,
      status          TEXT NOT NULL DEFAULT 'pending', -- pending | done
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at    TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fsb_todos_status_created
      ON fsb_todos (status, created_at DESC);
  `);
}
