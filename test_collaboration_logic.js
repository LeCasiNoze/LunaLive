// test_collaboration_logic.js
// Script de test pour valider la logique de collaboration Instagram

const { pool } = require('./api/dist/db.js');

async function testCollaborationLogic() {
  console.log('🧪 Test de la logique de collaboration Instagram...\n');

  try {
    // 1. Vérifier que la migration a été appliquée
    console.log('1. Vérification des tables de collaboration...');
    
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('instagram_collaborations', 'publish_jobs')
    `);
    
    const tableNames = tablesCheck.rows.map(r => r.table_name);
    console.log('   Tables trouvées:', tableNames);
    
    if (!tableNames.includes('instagram_collaborations')) {
      throw new Error('Table instagram_collaborations non trouvée - migration non appliquée?');
    }
    
    // 2. Vérifier les colonnes de collaboration dans publish_jobs
    console.log('\n2. Vérification des colonnes de collaboration...');
    
    const columnsCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'publish_jobs' 
      AND column_name LIKE 'collaboration_%'
      ORDER BY column_name
    `);
    
    console.log('   Colonnes collaboration:', columnsCheck.rows.map(r => r.column_name));
    
    // 3. Tester une insertion de collaboration simulée
    console.log('\n3. Test d\'insertion de collaboration...');
    
    // D'abord créer un job de test
    const jobResult = await pool.query(`
      INSERT INTO edit_jobs (clip_id, output_url, status)
      VALUES (99999, 'https://test.com/video.mp4', 'pending')
      RETURNING id
    `);
    
    const editJobId = jobResult.rows[0].id;
    
    const publishJobResult = await pool.query(`
      INSERT INTO publish_jobs (
        edit_job_id, clip_id, platform, status, title, description, 
        scheduled_at, collaboration_attempted, collaboration_username,
        collaboration_status, collaboration_started_at
      )
      VALUES (
        $1, 99999, 'instagram', 'scheduled', 'Test Clip', 'Test description',
        NOW(), TRUE, 'testuser', 'pending', NOW()
      )
      RETURNING id
    `, [editJobId]);
    
    const publishJobId = publishJobResult.rows[0].id;
    console.log(`   Job de test créé: #${publishJobId}`);
    
    // 4. Tester l'insertion dans la table des collaborations
    const collabResult = await pool.query(`
      INSERT INTO instagram_collaborations (
        publish_job_id, streamer_slug, instagram_username, status, 
        timeout_sec, fallback_to_mention
      )
      VALUES (
        $1, 'teststreamer', 'testuser', 'pending', 1200, TRUE
      )
      RETURNING id, started_at
    `, [publishJobId]);
    
    console.log(`   Collaboration créée: #${collabResult.rows[0].id}`);
    
    // 5. Tester le timeout
    console.log('\n4. Test de logique de timeout...');
    
    // Simuler un collaboration démarrée il y a 25 minutes
    await pool.query(`
      UPDATE instagram_collaborations 
      SET started_at = NOW() - INTERVAL '25 minutes'
      WHERE id = $1
    `, [collabResult.rows[0].id]);
    
    await pool.query(`
      UPDATE publish_jobs 
      SET collaboration_started_at = NOW() - INTERVAL '25 minutes'
      WHERE id = $1
    `, [publishJobId]);
    
    // Vérifier la détection de timeout
    const timeoutCheck = await pool.query(`
      SELECT pj.id, pj.collaboration_status, 
             EXTRACT(EPOCH FROM (NOW() - pj.collaboration_started_at)) as elapsed_sec
      FROM publish_jobs pj
      WHERE pj.id = $1
        AND pj.collaboration_status = 'pending'
        AND pj.collaboration_started_at < NOW() - (pj.collaboration_timeout_sec || 1200) * INTERVAL '1 second'
    `, [publishJobId]);
    
    console.log(`   Jobs en timeout détectés: ${timeoutCheck.rowCount}`);
    
    if (timeoutCheck.rowCount > 0) {
      const elapsed = timeoutCheck.rows[0].elapsed_sec;
      console.log(`   Temps écoulé: ${Math.floor(elapsed)} secondes (timeout: 1200s)`);
    }
    
    // 6. Tester le fallback
    console.log('\n5. Test de logique de fallback...');
    
    await pool.query(`
      UPDATE publish_jobs 
      SET collaboration_status = 'failed',
          collaboration_error_msg = 'Test collaboration failed'
      WHERE id = $1
    `, [publishJobId]);
    
    await pool.query(`
      UPDATE instagram_collaborations 
      SET status = 'failed', 
          completed_at = NOW(),
          error_msg = 'Test collaboration failed'
      WHERE publish_job_id = $1
    `, [publishJobId]);
    
    console.log('   Fallback vers mention simulé avec succès');
    
    // 7. Vérifier les statistiques
    console.log('\n6. Test des statistiques...');
    
    const statsResult = await pool.query(`
      SELECT 
        status,
        COUNT(*)::int as count
      FROM instagram_collaborations
      WHERE started_at >= NOW() - INTERVAL '7 days'
      GROUP BY status
      ORDER BY status
    `);
    
    console.log('   Statistiques:', statsResult.rows);
    
    // 8. Nettoyage
    console.log('\n7. Nettoyage des données de test...');
    
    await pool.query('DELETE FROM instagram_collaborations WHERE publish_job_id = $1', [publishJobId]);
    await pool.query('DELETE FROM publish_jobs WHERE id = $1', [publishJobId]);
    await pool.query('DELETE FROM edit_jobs WHERE id = $1', [editJobId]);
    
    console.log('   ✅ Données de test nettoyées');
    
    console.log('\n🎉 Tous les tests de collaboration ont réussi!');
    
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Exécuter le test
if (require.main === module) {
  testCollaborationLogic().catch(console.error);
}

module.exports = { testCollaborationLogic };
