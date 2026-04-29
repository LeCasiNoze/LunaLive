/**
 * Aligne radio_source sur la vraie règle métier :
 *   radio_source = true  ssi le streamer n'a PAS de chaîne LunaLive dédiée
 *                  (pas d'entrée dans rumble_accounts.assigned_to_streamer_id)
 *                  ET la radio elle-même (id=32) reste radio_source = false.
 *
 * Avant cette migration, le flag était mis à la main → certains streamers sans
 * chaîne LunaLive (lhasardcasin, familybearstv...) étaient à false par erreur.
 * Désormais le rumble_poller rotate selon la règle ci-dessus directement, et ce
 * sync garde la colonne cohérente pour les outils admin qui la lisent.
 */
export async function mig095_streamers_radio_source_sync(pool) {
    // 1) Streamers sans chaîne LunaLive → radio_source = true
    await pool.query(`
    UPDATE streamers s
       SET radio_source = TRUE
     WHERE s.id <> 32
       AND s.platform = 'rumble'
       AND s.rumble_username IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM rumble_accounts ra
         WHERE ra.assigned_to_streamer_id = s.id
       )
  `);
    // 2) Streamers avec chaîne LunaLive → radio_source = false
    await pool.query(`
    UPDATE streamers s
       SET radio_source = FALSE
     WHERE EXISTS (
       SELECT 1 FROM rumble_accounts ra
       WHERE ra.assigned_to_streamer_id = s.id
     )
  `);
    // 3) La radio elle-même (id=32) ne doit jamais être source
    await pool.query(`UPDATE streamers SET radio_source = FALSE WHERE id = 32`);
}
