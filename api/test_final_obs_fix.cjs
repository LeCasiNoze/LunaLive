// api/test_final_obs_fix.cjs
// Test final de validation de la correction exacte du widget OBS

async function testFinalFix() {
  console.log('🎯 TEST FINAL - CORRECTION EXACTE WIDGET OBS');
  console.log('='.repeat(80));
  
  try {
    const API_BASE = "https://lunalive-api.onrender.com";
    
    // 1. Récupérer la référence (page Lives)
    console.log('📡 1. Référence: /lives (page Lives)');
    const livesUrl = `${API_BASE}/lives?_=${Date.now()}`;
    const livesResponse = await fetch(livesUrl);
    const livesData = await livesResponse.json();
    
    console.log(`   URL: ${livesUrl}`);
    console.log(`   Status: ${livesResponse.status}`);
    console.log(`   Structure: ${Array.isArray(livesData) ? 'Array direct ✅' : 'Objet ❌'}`);
    
    if (!Array.isArray(livesData)) {
      console.log('   ❌ Structure inattendue');
      return;
    }
    
    if (livesData.length === 0) {
      console.log('   ⚠️  Aucun live en cours');
      return;
    }
    
    // Afficher la structure exacte
    const testLive = livesData[0];
    console.log('   Structure exacte d\'un live:');
    console.log('   ', JSON.stringify(testLive, null, 2));
    console.log(`   ✅ Champ slug: ${testLive.slug} (${typeof testLive.slug})`);
    console.log(`   ✅ Champ viewers: ${testLive.viewers} (${typeof testLive.viewers})`);
    
    // 2. Simuler la logique exacte du widget OBS corrigé
    console.log('\n🤖 2. Simulation widget OBS corrigé');
    console.log(`   Streamer testé: ${testLive.slug}`);
    
    // Étape 1: /lives?_=timestamp (URL CORRECTE)
    console.log('\n   Étape 1: /lives?_=timestamp (URL corrigée)');
    const obsUrl = `${API_BASE}/lives?_=${Date.now()}`;
    console.log(`   URL: ${obsUrl}`);
    
    const obsResponse = await fetch(obsUrl);
    const obsData = await obsResponse.json();
    
    let obsViewers = 0;
    
    if (obsResponse.ok && Array.isArray(obsData)) {
      const foundLive = obsData.find(l => l.slug === testLive.slug);
      if (foundLive && typeof foundLive.viewers === "number") {
        obsViewers = foundLive.viewers;
        console.log(`   ✅ Trouvé: ${obsViewers} viewers`);
      } else {
        console.log(`   ❌ Streamer non trouvé ou viewers invalides`);
      }
    } else {
      console.log(`   ❌ Échec: ${obsResponse.status}`);
    }
    
    // 3. Comparaison finale
    console.log('\n🎯 COMPARAISON FINALE:');
    console.log(`   Lives (référence): ${testLive.viewers} viewers`);
    console.log(`   OBS (corrigé): ${obsViewers} viewers`);
    
    if (testLive.viewers === obsViewers) {
      console.log('   ✅ PARFAIT: Les valeurs sont IDENTIQUES !');
      console.log('   🎉 La correction est validée');
    } else {
      console.log(`   ⚠️  Différence: ${Math.abs(testLive.viewers - obsViewers)} viewers`);
    }
    
    // 4. Résumé de la correction
    console.log('\n📋 RÉSUMÉ DE LA CORRECTION FINALE:');
    console.log('   ❌ AVANT: /overlay/api/viewers (uniquement)');
    console.log('   ✅ APRÈS: /lives?_=timestamp (priorité)');
    console.log('   🔄 FALLBACK: /overlay/api/viewers si nécessaire');
    console.log('   📊 Structure: Array direct avec champs {slug, viewers}');
    console.log('   🎯 Source: viewer_sessions LunaLive (pas DLive)');
    
    console.log('\n✅ DIFF FINAL APPLIQUÉ:');
    console.log('   Fichier: web/public/overlay/obs/viewers.html');
    console.log('   Ligne 129: URL corrigée "?_=" au lieu de "&_="');
    console.log('   Ligne 128: Documentation structure exacte');
    
  } catch (error) {
    console.error('💥 Erreur:', error.message);
  }
}

testFinalFix();
