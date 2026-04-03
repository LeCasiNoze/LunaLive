#!/usr/bin/env tsx

// Script de test pour le scheduler Instagram
// Permet de tester le scheduler sans démarrer toute l'API

import { pool } from "./src/db.js";
import { startIgCommentScheduler } from "./src/ig_comment_scheduler.js";

// Configuration temporaire pour les tests
process.env.INSTAGRAM_ACCESS_TOKEN = "TEST_TOKEN_FOR_DEBUG";
process.env.INSTAGRAM_USER_ID = "TEST_USER_ID_FOR_DEBUG";

async function main() {
  console.log("🚀 Démarrage du test du scheduler Instagram...");
  console.log("🔧 Variables d'environnement configurées pour le test");
  
  try {
    // Test de connexion DB
    await pool.query("SELECT NOW()");
    console.log("✅ Connexion à la base de données OK");
    
    // Vérification des tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('ig_comment_tracking', 'streamer_ig_config', 'ig_comment_replies')
    `);
    
    console.log("📊 Tables trouvées:", tables.rows.map(r => r.table_name));
    
    // État actuel des tables
    if (tables.rows.length > 0) {
      try {
        const trackingResult = await pool.query(`
          SELECT COUNT(*) as total, 
                 COUNT(CASE WHEN track_until > NOW() THEN 1 END) as active
          FROM ig_comment_tracking
        `);
        const { total, active } = trackingResult.rows[0];
        console.log(`📊 Tracking: ${active}/${total} posts actifs`);

        const configResult = await pool.query(`
          SELECT COUNT(*) as total,
                 COUNT(CASE WHEN active = true THEN 1 END) as active
          FROM streamer_ig_config
        `);
        const { total: configTotal, active: configActive } = configResult.rows[0];
        console.log(`📊 Configs: ${configActive}/${configTotal} streamers actifs`);
      } catch (e: any) {
        console.warn("⚠️ Impossible de vérifier l'état des tables:", e?.message);
      }
    }
    
    // Démarrage du scheduler
    console.log("🔄 Démarrage du scheduler...");
    startIgCommentScheduler();
    
    console.log("⏳ Scheduler démarré — surveillance pendant 2 minutes...");
    console.log("💡 Le scheduler devrait afficher des logs toutes les 10 secondes");
    
    // Laisser tourner pendant 2 minutes pour les tests
    setTimeout(() => {
      console.log("🛑 Fin du test — arrêt du processus");
      process.exit(0);
    }, 2 * 60 * 1000);
    
  } catch (error: any) {
    console.error("❌ Erreur lors du démarrage:", error?.message || error);
    process.exit(1);
  }
}

// Gestion de l'arrêt propre
process.on("SIGINT", () => {
  console.log("\n🛑 Arrêt demandé par l'utilisateur");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Arrêt du processus");
  process.exit(0);
});

main().catch((error) => {
  console.error("💥 Erreur fatale:", error);
  process.exit(1);
});
