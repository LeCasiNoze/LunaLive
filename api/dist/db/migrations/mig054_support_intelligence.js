// api/src/db/migrations/mig054_support_intelligence.ts
// Tables de suivi d'intelligence pour le bot support Discord :
//   - support_unanswered : questions sans réponse KB (pour améliorer la base)
//   - support_ratings    : évaluations utilisateur des réponses du bot (👍/😐/👎)
export async function mig054_support_intelligence(pool) {
    // ── Questions sans réponse ───────────────────────────────────────────────
    await pool.query(`
    CREATE TABLE IF NOT EXISTS support_unanswered (
      id                BIGSERIAL PRIMARY KEY,
      question          TEXT        NOT NULL,
      ticket_id         BIGINT      NULL REFERENCES support_tickets(id) ON DELETE SET NULL,
      discord_user_id   TEXT        NOT NULL,
      best_match_id     TEXT        NULL,
      best_match_score  REAL        NULL,
      failure_reason    TEXT        NULL,
      probable_subject  TEXT        NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_support_unanswered_created
      ON support_unanswered (created_at DESC);
  `);
    // ── Évaluations des réponses bot ─────────────────────────────────────────
    await pool.query(`
    CREATE TABLE IF NOT EXISTS support_ratings (
      id              BIGSERIAL PRIMARY KEY,
      ticket_id       BIGINT      NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      message_id      TEXT        NOT NULL,
      kb_entry_id     TEXT        NOT NULL,
      rating          TEXT        NOT NULL CHECK (rating IN ('helpful', 'ok', 'not_helpful')),
      discord_user_id TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (ticket_id, message_id)
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_support_ratings_entry
      ON support_ratings (kb_entry_id, rating);
  `);
}
