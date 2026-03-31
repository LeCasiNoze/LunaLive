// api/src/db/migrations/mig050_fix_missing_avatars.ts
// Migration pour attribuer des avatars par défaut aux utilisateurs qui n'en ont pas
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
export async function mig050_fix_missing_avatars(pool) {
    console.log("🔍 Recherche des utilisateurs sans avatar...");
    // 1. Compter les utilisateurs sans avatar
    const countResult = await pool.query(`SELECT COUNT(*) as missing FROM users WHERE avatar_path IS NULL OR avatar_path = ''`);
    const missingCount = Number(countResult.rows[0].missing);
    if (missingCount === 0) {
        console.log("✅ Tous les utilisateurs ont déjà un avatar !");
        return;
    }
    console.log(`📊 ${missingCount} utilisateurs sans avatar trouvés`);
    // 2. Mettre à jour tous les utilisateurs sans avatar
    const updateResult = await pool.query(`UPDATE users 
     SET avatar_path = CASE
       WHEN (id % $1) = 0 THEN '/Avatar/avatar_scient.png'
       WHEN (id % $1) = 1 THEN '/Avatar/avatar_alien.png'
       WHEN (id % $1) = 2 THEN '/Avatar/avatar_bleu.png'
       WHEN (id % $1) = 3 THEN '/Avatar/avatar_chat.png'
       WHEN (id % $1) = 4 THEN '/Avatar/avatar_chevalier.png'
       WHEN (id % $1) = 5 THEN '/Avatar/avatar_clown.png'
       WHEN (id % $1) = 6 THEN '/Avatar/avatar_demon.png'
       WHEN (id % $1) = 7 THEN '/Avatar/avatar_ghost.png'
       WHEN (id % $1) = 8 THEN '/Avatar/avatar_mage.png'
       WHEN (id % $1) = 9 THEN '/Avatar/avatar_ninja.png'
       WHEN (id % $1) = 10 THEN '/Avatar/avatar_orange.png'
       WHEN (id % $1) = 11 THEN '/Avatar/avatar_panda.png'
       WHEN (id % $1) = 12 THEN '/Avatar/avatar_phara.png'
       WHEN (id % $1) = 13 THEN '/Avatar/avatar_renard.png'
       WHEN (id % $1) = 14 THEN '/Avatar/avatar_robot.png'
       WHEN (id % $1) = 15 THEN '/Avatar/avatar_rose.png'
       WHEN (id % $1) = 16 THEN '/Avatar/avatar_sam.png'
       WHEN (id % $1) = 17 THEN '/Avatar/avatar_santa.png'
       WHEN (id % $1) = 18 THEN '/Avatar/avatar_scient.png'
     END
     WHERE avatar_path IS NULL OR avatar_path = ''
     RETURNING id, username, avatar_path`, [DEFAULT_AVATARS.length]);
    console.log(`🎯 ${(updateResult.rowCount ?? 0)} avatars attribués`);
    // 3. Afficher quelques exemples
    for (let i = 0; i < Math.min(5, updateResult.rows.length); i++) {
        const user = updateResult.rows[i];
        console.log(`  ✅ User ${user.username} (ID: ${user.id}) → ${user.avatar_path}`);
    }
    if (updateResult.rows.length > 5) {
        console.log(`  ... et ${updateResult.rows.length - 5} autres utilisateurs`);
    }
    // 4. Vérifier spécifiquement les streamers
    const streamerResult = await pool.query(`SELECT s.id, s.slug, s.display_name, u.avatar_path
     FROM streamers s
     JOIN users u ON u.id = s.user_id
     WHERE u.avatar_path IS NULL OR u.avatar_path = ''`);
    if ((streamerResult.rowCount ?? 0) > 0) {
        console.log(`\n🎬 ${(streamerResult.rowCount ?? 0)} streamers sans avatar :`);
        for (const streamer of streamerResult.rows) {
            console.log(`  🎬 Streamer ${streamer.display_name || streamer.slug} → avatar manquant`);
        }
    }
    // 5. Statistiques finales
    const finalCount = await pool.query(`SELECT COUNT(*) as total, COUNT(avatar_path) as with_avatar FROM users`);
    console.log(`\n📈 Statistiques finales :`);
    console.log(`  - Total utilisateurs : ${finalCount.rows[0].total}`);
    console.log(`  - Avec avatar : ${finalCount.rows[0].with_avatar}`);
    console.log(`  - Sans avatar : ${Number(finalCount.rows[0].total) - Number(finalCount.rows[0].with_avatar)}`);
    console.log("\n✅ Migration terminée !");
}
