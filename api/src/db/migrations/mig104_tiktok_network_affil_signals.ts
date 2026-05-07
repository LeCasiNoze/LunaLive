import type { Pool } from "pg";

export async function mig104_tiktok_network_affil_signals(pool: Pool) {
  // Étend la liste des signal_type acceptés pour le réseau d'influenceurs.
  // - affil_comment : commentaire sur une vidéo qui contient un lien d'affil LunaLive
  // - affil_mention : @mention dans la description d'une vidéo avec lien d'affil
  await pool.query(`
    ALTER TABLE tiktok_network_links
      DROP CONSTRAINT IF EXISTS tiktok_network_links_signal_check;
  `);
  // NOTE: on inclut aussi 'following' dans la liste — elle est ajoutée par
  // mig106. Sans ça, ce ré-add casse l'idempotence : à chaque boot, mig104
  // re-tournerait et planterait sur les rows 'following' insérées après
  // mig106 ("check constraint ... is violated by some row"). Le résultat
  // final reste identique : mig106 réécrit ensuite ce même constraint.
  await pool.query(`
    ALTER TABLE tiktok_network_links
      ADD CONSTRAINT tiktok_network_links_signal_check CHECK (
        signal_type IN (
          'comment','mention','duet',
          'affil_comment','affil_mention',
          'following'
        )
      );
  `);
}
