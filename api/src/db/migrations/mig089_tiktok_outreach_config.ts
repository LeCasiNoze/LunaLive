import type { Pool } from "pg";

export async function mig089_tiktok_outreach_config(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_outreach_config (
      id INT PRIMARY KEY DEFAULT 1,
      email_subject TEXT NOT NULL DEFAULT 'Collab LunaLive — landing page casino',
      email_body TEXT NOT NULL DEFAULT '',
      reply_domain TEXT NOT NULL DEFAULT 'lunalive.win',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tiktok_outreach_config_singleton CHECK (id = 1)
    );
  `);

  // Seed the singleton row with the default body if missing
  await pool.query(`
    INSERT INTO tiktok_outreach_config (id, email_body)
    VALUES (1, $1)
    ON CONFLICT (id) DO UPDATE
      SET email_body = CASE
        WHEN tiktok_outreach_config.email_body = '' THEN EXCLUDED.email_body
        ELSE tiktok_outreach_config.email_body
      END
  `, [
    `Salut {{name}},

Je découvre ton compte TikTok et j'aime beaucoup ce que tu fais.

Je m'occupe de LunaLive, une plateforme française autour du streaming et des casinos en ligne. On cherche des créateurs comme toi pour collaborer sur une landing page dédiée (avec ton lien d'affiliation, tes conditions, et un suivi des perfs).

Si l'idée t'intéresse, réponds simplement à ce mail, je t'envoie tous les détails du deal.

À très vite,
L'équipe LunaLive
https://lunalive.win`,
  ]);
}
