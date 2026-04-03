#!/usr/bin/env tsx

// Script pour exécuter uniquement la migration manquante ig_comment_replies

import { Pool } from "pg";
import { mig057_ig_comment_replies } from "./src/db/migrations/mig057_ig_comment_replies.js";

// Configuration de la base de données
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

async function runMigration() {
  console.log("🚀 Exécution de la migration mig057_ig_comment_replies...");
  
  try {
    await mig057_ig_comment_replies(pool);
    console.log("✅ Migration terminée avec succès !");
    
    // Vérification que la table existe
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'ig_comment_replies'
    `);
    
    if (result.rows.length > 0) {
      console.log("✅ Table 'ig_comment_replies' créée avec succès");
    } else {
      console.log("❌ Erreur: la table n'a pas été créée");
    }
    
  } catch (error: any) {
    console.error("❌ Erreur lors de la migration:", error?.message || error);
  } finally {
    await pool.end();
  }
}

runMigration();
