import type { Pool } from "pg";

export async function mig038_site_content(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      title TEXT,
      html TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS site_content_updated_at_idx
      ON site_content(updated_at DESC);
  `);

  // Seed minimal (optionnel)
  await pool.query(`
    INSERT INTO site_content(key, title, html)
    VALUES (
      'daily_bonus_infos',
      'Informations — Bonus',
      '<h3>Informations</h3>
       <ul>
         <li><b>1 récupération par jour</b> (timezone Europe/Paris).</li>
         <li>Cycle hebdo : Lun 3 / Mar 3 / Mer 🎡 / Jeu 5 / Ven 5 / Sam 🎡 / Dim 10.</li>
         <li>Les paliers 5/10/20/30 = nombre de jours claimés dans le mois (pas forcément en streak).</li>
       </ul>'
    )
    ON CONFLICT (key) DO NOTHING;
  `);
}
