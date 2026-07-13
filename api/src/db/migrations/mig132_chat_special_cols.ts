import type { Pool } from "pg";

// Persistance des cartes de célébration du chat (follow/sub/boss/raid/level/
// don/combo) : colonnes type + data sur chat_messages. Émises par
// emitSpecialCard (socket_emit.ts), elles réapparaissent désormais à
// l'ouverture du chat sur n'importe quel appareil (avant : éphémères).
export async function mig132_chat_special_cols(pool: Pool) {
  await pool.query(`
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS type TEXT,
      ADD COLUMN IF NOT EXISTS data JSONB;
  `);
}
