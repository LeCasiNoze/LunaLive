// api/scripts/backfill_clips_thumbnails_sequential.ts
// Backfill SAFE des thumbnails manquantes - traitement strictement séquentiel

import { pool } from "../src/db.js";

interface ClipToProcess {
  id: number;
  streamer_id: number;
  title: string | null;
  mp4_key: string | null;
  created_ts: number;
}

async function generateThumbnailForClip(clipId: number, mp4Key: string): Promise<string | null> {
  try {
    // Import dynamique pour éviter dépendances circulaires
    const { r2Enabled, buildPublicUrl, putR2Buffer } = await import("../src/r2.js");
    const { spawn } = await import("child_process");
    const { FFMPEG_BIN, FFMPEG_OK } = await import("../src/ffmpeg.js");

    if (!FFMPEG_OK || !r2Enabled()) {
      console.warn(`[backfill] FFMPEG ou R2 non disponible pour clip ${clipId}`);
      return null;
    }

    const mp4Url = buildPublicUrl(mp4Key);
    if (!mp4Url) {
      console.warn(`[backfill] Impossible de construire MP4 URL pour clip ${clipId}`);
      return null;
    }

    console.log(`[backfill] Génération thumbnail pour clip ${clipId}...`);

    // Extraire thumbnail avec FFMPEG
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-nostdin", "-rw_timeout", "10000000",
      "-ss", "1", "-i", mp4Url,
      "-an", "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "5",
      "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"
    ];

    const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";

    return new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        try { p.kill("SIGKILL"); } catch {}
        console.warn(`[backfill] Timeout FFMPEG pour clip ${clipId}`);
        resolve(null);
      }, 10_000);

      p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
      p.stderr.on("data", (d: Buffer) => (stderr += String(d)));

      p.on("error", (e: any) => {
        clearTimeout(killTimer);
        console.warn(`[backfill] FFMPEG spawn error clip ${clipId}:`, e);
        resolve(null);
      });

      p.on("close", async (code: any, signal: any) => {
        clearTimeout(killTimer);
        const buf = Buffer.concat(chunks);
        const ok = code === 0 && buf.length > 5_000;

        if (!ok) {
          console.warn(`[backfill] FFMPEG failed clip ${clipId} code=${code} bytes=${buf.length} err=${stderr.slice(0, 200)}`);
          resolve(null);
          return;
        }

        try {
          // Stocker dans R2
          const r2Key = `clips/thumbnails/${clipId}.jpg`;
          const uploadOk = await putR2Buffer(r2Key, buf, "image/jpeg");
          
          if (!uploadOk) {
            console.warn(`[backfill] R2 upload failed clip ${clipId}`);
            resolve(null);
            return;
          }

          // Générer URL publique
          const publicUrl = buildPublicUrl(r2Key);
          if (!publicUrl) {
            console.warn(`[backfill] URL build failed clip ${clipId}`);
            resolve(null);
            return;
          }

          // Mettre à jour BDD
          await pool.query(
            `UPDATE bot_clips SET thumbnail_url = $1 WHERE id = $2`,
            [publicUrl, clipId]
          );

          console.log(`[backfill] ✅ Succès clip ${clipId} -> ${publicUrl}`);
          resolve(publicUrl);
        } catch (err: any) {
          console.warn(`[backfill] Storage failed clip ${clipId}:`, err);
          resolve(null);
        }
      });
    });
  } catch (err: any) {
    console.warn(`[backfill] Exception clip ${clipId}:`, err);
    return null;
  }
}

async function getClipsWithoutThumbnails(limit = 50): Promise<ClipToProcess[]> {
  const r = await pool.query(
    `SELECT id, streamer_id, title, mp4_key, created_ts
     FROM bot_clips 
     WHERE deleted_ts IS NULL 
       AND hidden_by_streamer = false 
       AND thumbnail_url IS NULL
       AND mp4_key IS NOT NULL 
       AND mp4_key <> ''
     ORDER BY created_ts DESC
     LIMIT $1`,
    [limit]
  );
  
  return r.rows as ClipToProcess[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillThumbnailsSequential() {
  console.log('🎯 BACKFILL SÉQUENTIEL DES THUMBNAILS MANQUANTES');
  console.log('='.repeat(60));

  try {
    // Compter total
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM bot_clips 
       WHERE deleted_ts IS NULL 
         AND hidden_by_streamer = false 
         AND thumbnail_url IS NULL
         AND mp4_key IS NOT NULL 
         AND mp4_key <> ''`
    );
    
    const total = Number(countResult.rows[0]?.total || 0);
    console.log(`📊 Total à traiter: ${total} clips`);

    if (total === 0) {
      console.log('✅ Aucun clip sans thumbnail_url');
      process.exit(0);
    }

    // Traiter par lots de 10 pour éviter surcharge
    const BATCH_SIZE = 10;
    let processed = 0;
    let success = 0;
    let failed = 0;

    while (processed < total) {
      const clips = await getClipsWithoutThumbnails(BATCH_SIZE);
      
      if (clips.length === 0) {
        console.log('✅ Tous les clips ont été traités');
        break;
      }

      console.log(`\n🔄 Lot ${Math.floor(processed / BATCH_SIZE) + 1} - ${clips.length} clips à traiter`);

      for (const clip of clips) {
        console.log(`\n--- Clip ${clip.id} (${clip.title || '(sans titre)'}) ---`);
        
        if (!clip.mp4_key) {
          console.log(`⏭️ Skip: pas de mp4_key`);
          failed++;
          processed++;
          continue;
        }

        const result = await generateThumbnailForClip(clip.id, clip.mp4_key);
        
        if (result) {
          success++;
        } else {
          failed++;
        }
        
        processed++;
        
        console.log(`📈 Progression: ${processed}/${total} (✅ ${success} succès, ❌ ${failed} échecs)`);
        
        // Pause entre chaque clip pour éviter surcharge CPU
        if (processed < total) {
          console.log('⏱️ Pause 3 secondes...');
          await sleep(3000);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 BACKFILL TERMINÉ');
    console.log(`📊 Résultat final: ${total} clips traités`);
    console.log(`✅ Succès: ${success}`);
    console.log(`❌ Échecs: ${failed}`);
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);

  } catch (err: any) {
    console.error('💥 Erreur globale backfill:', err);
    process.exit(1);
  }
}

// Lancer le backfill si script exécuté directement
if (require.main === module) {
  backfillThumbnailsSequential();
}

export { backfillThumbnailsSequential };
