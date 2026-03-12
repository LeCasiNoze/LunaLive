// api/validate_all_providers.cjs
// Validation finale que TOUS les providers sont fonctionnels

const { fetchProviderSlugs } = require('./dist/calls/updater.js');
const { fetchProviderGames } = require('./dist/calls/updater.js');

async function validateAllProviders() {
  console.log('🎯 FINAL VALIDATION - ALL PROVIDERS FUNCTIONAL');
  console.log('='.repeat(80));
  
  try {
    // 1. Récupérer tous les providers
    const providers = await fetchProviderSlugs();
    console.log(`📋 Total providers to validate: ${providers.length}`);
    
    // 2. Valider chaque provider
    const results = [];
    let totalGames = 0;
    
    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      console.log(`🔄 [${i + 1}/${providers.length}] Validating ${provider}...`);
      
      try {
        const games = await fetchProviderGames(provider);
        totalGames += games.length;
        
        results.push({
          provider,
          games: games.length,
          status: games.length > 0 ? '✅ WORKING' : '❌ EMPTY',
          sampleGames: games.slice(0, 2).map(g => g.name)
        });
        
        console.log(`   ${results[results.length - 1].status}: ${games.length} games`);
        
        if (games.length > 0) {
          console.log(`   Sample: ${results[results.length - 1].sampleGames.join(', ')}`);
        }
        
      } catch (error) {
        console.log(`   💥 ERROR: ${error.message}`);
        results.push({
          provider,
          games: 0,
          status: '💥 ERROR',
          sampleGames: [],
          error: error.message
        });
      }
      
      // Petit delay
      if (i < providers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // 3. Analyse des résultats
    console.log('\n\n📊 VALIDATION RESULTS');
    console.log('='.repeat(100));
    
    const working = results.filter(r => r.status === '✅ WORKING');
    const empty = results.filter(r => r.status === '❌ EMPTY');
    const errors = results.filter(r => r.status === '💥 ERROR');
    
    console.log(`\n📈 SUMMARY:`);
    console.log(`   • Total providers: ${results.length}`);
    console.log(`   • Working providers: ${working.length} (${((working.length/results.length)*100).toFixed(1)}%)`);
    console.log(`   • Empty providers: ${empty.length} (${((empty.length/results.length)*100).toFixed(1)}%)`);
    console.log(`   • Error providers: ${errors.length} (${((errors.length/results.length)*100).toFixed(1)}%)`);
    console.log(`   • Total games: ${totalGames.toLocaleString()}`);
    console.log(`   • Average games/provider: ${Math.round(totalGames/results.length)}`);
    
    // 4. Top providers
    console.log('\n🏆 TOP 10 PROVIDERS BY GAME COUNT:');
    const topProviders = working
      .sort((a, b) => b.games - a.games)
      .slice(0, 10);
    
    topProviders.forEach((p, i) => {
      console.log(`   ${i+1}. ${p.provider}: ${p.games} games`);
    });
    
    // 5. Providers problématiques
    if (empty.length > 0 || errors.length > 0) {
      console.log('\n⚠️  PROBLEMATIC PROVIDERS:');
      
      empty.forEach(p => {
        console.log(`   ❌ ${p.provider}: 0 games`);
      });
      
      errors.forEach(p => {
        console.log(`   💥 ${p.provider}: ${p.error}`);
      });
    }
    
    // 6. Validation finale
    console.log('\n🎯 FINAL VALIDATION:');
    
    if (empty.length === 0 && errors.length === 0) {
      console.log('✅ ALL PROVIDERS ARE WORKING!');
      console.log('🚀 System ready for production with maximum game coverage!');
      console.log(`📊 Total games available: ${totalGames.toLocaleString()}`);
      
      console.log('\n📋 COMPLETE PROVIDER LIST:');
      working.forEach(p => {
        console.log(`   ✅ ${p.provider}: ${p.games} games`);
      });
      
    } else {
      console.log(`⚠️  ${empty.length + errors.length} providers still need attention`);
      console.log('🔧 Additional fixes may be required');
    }
    
    // 7. Comparaison avec l'audit précédent
    console.log('\n📈 COMPARISON WITH PREVIOUS AUDIT:');
    console.log(`   • Previous working providers: ~21`);
    console.log(`   • Current working providers: ${working.length}`);
    console.log(`   • Improvement: +${working.length - 21} providers`);
    console.log(`   • Previous total games: ~2,498`);
    console.log(`   • Current total games: ${totalGames.toLocaleString()}`);
    console.log(`   • Additional games: +${(totalGames - 2498).toLocaleString()}`);
    
    return {
      total: results.length,
      working: working.length,
      empty: empty.length,
      errors: errors.length,
      totalGames,
      success: empty.length === 0 && errors.length === 0
    };
    
  } catch (error) {
    console.error('💥 Validation failed:', error);
    return null;
  }
}

validateAllProviders().catch(console.error);
