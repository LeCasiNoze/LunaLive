// V3 analytics : table d'events pour les landing pages d'affiliation.
// Track 2 events :
//   - "view"      : arrivée sur la page /r/<slug>
//   - "click_cta" : clic sur un CTA d'affi (btn-jouer, sticky-cta, chest-link, etc.)
// On peut calculer le taux de conversion par page = click_cta / view.
//
// Pas de tracking d'identité utilisateur. ip_hash = SHA256 partiel pour
// dédoublonnage unique-visitor (RGPD-friendly, anonyme).
export async function mig117_affi_landing_events(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS affi_landing_events (
      id BIGSERIAL PRIMARY KEY,
      page_id BIGINT REFERENCES affi_landing_pages(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      event TEXT NOT NULL CHECK (event IN ('view','click_cta')),
      ip_hash TEXT,
      user_agent TEXT,
      referrer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_affi_events_page_event_at
      ON affi_landing_events (page_id, event, created_at DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_affi_events_slug_at
      ON affi_landing_events (slug, created_at DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_affi_events_ip_at
      ON affi_landing_events (ip_hash, created_at DESC);
  `);
}
