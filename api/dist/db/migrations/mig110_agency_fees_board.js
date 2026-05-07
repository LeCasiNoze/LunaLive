export async function mig110_agency_fees_board(pool) {
    // Tableau auto-actualisé des frais d'agence dans le salon dédié.
    // Singleton (id=1) : un seul board pour toute l'app. Stocke le message_id
    // pour pouvoir l'éditer en place plutôt que renvoyer un nouveau message.
    await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_fees_board (
      id                INT  PRIMARY KEY,
      channel_id        TEXT NOT NULL,
      message_id        TEXT,
      last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT agency_fees_board_singleton CHECK (id = 1)
    );
  `);
}
