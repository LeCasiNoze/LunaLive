// api/scripts/check_missing_thumbnails.ts
// Vérifier les clips sans thumbnail_url

import { pool } from "../src/db.js";

async function checkMissingThumbnails() {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n 
       FROM bot_clips 
       WHERE deleted_ts IS NULL 
         AND hidden_by_streamer = false 
         AND thumbnail_url IS NULL`
    );
    
    console.log('Clips sans thumbnail_url:', r.rows[0].n);
    
    const list = await pool.query(
      `SELECT id, streamer_id, title, mp4_key, created_ts 
       FROM bot_clips 
       WHERE deleted_ts IS NULL 
         AND hidden_by_streamer = false 
         AND thumbnail_url IS NULL 
       ORDER BY created_ts DESC 
       LIMIT 10`
    );
    
    console.log('Liste des 10 plus récents:');
    list.rows.forEach(x => {
      console.log(`  - ID: ${x.id}, Title: ${x.title || '(sans titre)'}, MP4: ${x.mp4_key || 'NULL'}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err);
    process.exit(1);
  }
}

checkMissingThumbnails();
