import type { Pool } from "pg";

// VIP leads captures depuis la banniere "Club VIP" du popup V3.
// Le visiteur clique sur la banniere, laisse son email, est ensuite
// redirige vers la page d'affiliation. Le lead est conserve pour
// recontact host dedie / programme high-roller.
export async function mig120_affi_vip_leads(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS affi_vip_leads (
      id BIGSERIAL PRIMARY KEY,
      page_id BIGINT REFERENCES affi_landing_pages(id) ON DELETE SET NULL,
      slug TEXT NOT NULL,
      email TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT,
      referrer TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_affi_vip_leads_slug_at
      ON affi_vip_leads (slug, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_affi_vip_leads_email
      ON affi_vip_leads (email);
  `);
}
