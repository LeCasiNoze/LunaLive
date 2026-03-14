// api/scripts/backfill_clips_thumbnails.ts
// Script de régénération des thumbnails pour clips existants (optionnel)

import { pool } from "../db";
import { r2Enabled, buildPublicUrl } from "../r2";
import { generateAndStoreThumbnail } from "../routes/thumbs_clips_fix";

interface ClipData {
  id: number;
  mp4_key: string | null;
  thumbnail_url: string | null;
}

async function backfillClipsThumbnails() {
  console.log("🎯 Backfill thumbnails pour clips existants...");
  
  if (!r2Enabled()) {
    console.error("❌ R2 non activé - impossible de stocker thumbnails");
    return;
  }

  try {
    // Récupérer les clips sans thumbnail_url mais avec mp4_key
    const { rows } = await pool.query<ClipData>(
      `SELECT id, mp4_key, thumbnail_url 
       FROM bot_clips 
       WHERE deleted_ts IS NULL 
         AND hidden_by_streamer = false 
         AND thumbnail_url IS NULL 
         AND mp4_key IS NOT NULL
       ORDER BY created_ts DESC
       LIMIT 100` // Limiter pour éviter la surcharge
    );

    console.log(`📊 ${rows.length} clips à traiter...`);

    for (const clip of rows) {
      try {
        const mp4Key = String(clip.mp4_key || "").trim();
        if (!mp4Key) {
          console.log(`⏭️ Clip ${clip.id}: pas de mp4_key`);
          continue;
        }

        const mp4Url = buildPublicUrl(mp4Key);
        if (!mp4Url) {
          console.log(`⏭️ Clip ${clip.id}: impossible de construire MP4 URL`);
          continue;
        }

        console.log(`🔄 Génération thumbnail pour clip ${clip.id}...`);
        const thumbnailUrl = await generateAndStoreThumbnail(clip.id, mp4Url);
        
        if (thumbnailUrl) {
          console.log(`✅ Clip ${clip.id}: thumbnail générée ${thumbnailUrl}`);
        } else {
          console.log(`❌ Clip ${clip.id}: échec génération thumbnail`);
        }

        // Pause pour éviter la surcharge CPU
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (err) {
        console.error(`💥 Clip ${clip.id}: erreur traitement`, err);
      }
    }

    console.log("🎉 Backfill terminé !");
    
  } catch (err) {
    console.error("💥 Erreur globale backfill:", err);
  }
}

// Lancer le backfill si script exécuté directement
if (require.main === module) {
  backfillClipsThumbnails()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { backfillClipsThumbnails };
