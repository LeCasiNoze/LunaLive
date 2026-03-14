// api/scripts/fix_missing_avatars.ts
// Script pour attribuer des avatars par défaut aux utilisateurs qui n'en ont pas

import { pool } from "../src/db.js";

const DEFAULT_AVATARS = [
  "/Avatar/avatar_alien.png",
  "/Avatar/avatar_bleu.png",
  "/Avatar/avatar_chat.png",
  "/Avatar/avatar_chevalier.png",
  "/Avatar/avatar_clown.png",
  "/Avatar/avatar_demon.png",
  "/Avatar/avatar_ghost.png",
  "/Avatar/avatar_mage.png",
  "/Avatar/avatar_ninja.png",
  "/Avatar/avatar_orange.png",
  "/Avatar/avatar_panda.png",
  "/Avatar/avatar_phara.png",
  "/Avatar/avatar_renard.png",
  "/Avatar/avatar_robot.png",
  "/Avatar/avatar_rose.png",
  "/Avatar/avatar_sam.png",
  "/Avatar/avatar_santa.png",
  "/Avatar/avatar_scient.png",
];

function defaultAvatarPath(userId: number) {
  const index = userId % DEFAULT_AVATARS.length;
  return DEFAULT_AVATARS[index];
}

async function fixMissingAvatars() {
  console.log("🔍 Recherche des utilisateurs sans avatar...");
  
  // 1. Compter les utilisateurs sans avatar
  const countResult = await pool.query(
    `SELECT COUNT(*) as missing FROM users WHERE avatar_path IS NULL OR avatar_path = ''`
  );
  const missingCount = Number(countResult.rows[0].missing);
  
  if (missingCount === 0) {
    console.log("✅ Tous les utilisateurs ont déjà un avatar !");
    return;
  }
  
  console.log(`📊 ${missingCount} utilisateurs sans avatar trouvés`);
  
  // 2. Mettre à jour tous les utilisateurs sans avatar
  const updateResult = await pool.query(
    `UPDATE users 
     SET avatar_path = $1 || (id % $2) || '.png'
     WHERE avatar_path IS NULL OR avatar_path = ''
     RETURNING id, username`,
    ["/Avatar/avatar_", DEFAULT_AVATARS.length]
  );
  
  console.log(`🎯 ${updateResult.rowCount} avatars temporaires attribués`);
  
  // 3. Corriger avec les vrais noms d'avatars
  for (const user of updateResult.rows) {
    const userId = Number(user.id);
    const avatarPath = defaultAvatarPath(userId);
    
    await pool.query(
      `UPDATE users SET avatar_path = $1 WHERE id = $2`,
      [avatarPath, userId]
    );
    
    console.log(`  ✅ User ${user.username} (ID: ${user.id}) → ${avatarPath}`);
  }
  
  // 4. Vérifier spécifiquement les streamers
  const streamerResult = await pool.query(
    `SELECT s.id, s.slug, s.display_name, u.avatar_path
     FROM streamers s
     JOIN users u ON u.id = s.user_id
     WHERE u.avatar_path IS NULL OR u.avatar_path = ''`
  );
  
  if (streamerResult.rowCount > 0) {
    console.log(`\n🎬 ${streamerResult.rowCount} streamers sans avatar :`);
    
    for (const streamer of streamerResult.rows) {
      const userId = Number(streamer.id);
      const avatarPath = defaultAvatarPath(userId);
      
      await pool.query(
        `UPDATE users SET avatar_path = $1 WHERE id = $2`,
        [avatarPath, userId]
      );
      
      console.log(`  🎬 Streamer ${streamer.display_name || streamer.slug} → ${avatarPath}`);
    }
  }
  
  // 5. Statistiques finales
  const finalCount = await pool.query(
    `SELECT COUNT(*) as total, COUNT(avatar_path) as with_avatar FROM users`
  );
  
  console.log(`\n📈 Statistiques finales :`);
  console.log(`  - Total utilisateurs : ${finalCount.rows[0].total}`);
  console.log(`  - Avec avatar : ${finalCount.rows[0].with_avatar}`);
  console.log(`  - Sans avatar : ${Number(finalCount.rows[0].total) - Number(finalCount.rows[0].with_avatar)}`);
  
  console.log("\n✅ Terminé ! Tous les utilisateurs ont maintenant un avatar par défaut.");
}

// Exécuter le script
fixMissingAvatars().catch(console.error);
