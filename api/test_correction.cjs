// api/test_correction.cjs
const { fetchProviderSlugs } = require('./dist/calls/updater.js');
const { fetchProviderGames } = require('./dist/calls/updater.js');

async function testCorrection() {
  console.log('🧪 TESTING CORRECTION - Provider Slug Mapping');
  console.log('='.repeat(80));
  
  try {
    // 1. Vérifier que les slugs sont bien mappés
    console.log('\n📋 Step 1: Checking provider slug mapping...');
    const providers = await fetchProviderSlugs();
    
    const targetProviders = ['no-limit-city', 'relax', 'hacksaw-gaming', 'pragmatic-play'];
    const foundProviders = targetProviders.filter(p => providers.includes(p));
    
    console.log(`✅ Found ${foundProviders.length}/${targetProviders.length} target providers:`);
    foundProviders.forEach(p => console.log(`   • ${p}`));
    
    const missing = targetProviders.filter(p => !providers.includes(p));
    if (missing.length > 0) {
      console.log(`❌ Missing providers: ${missing.join(', ')}`);
    }
    
    // 2. Tester chaque provider corrigé
    console.log('\n🔄 Step 2: Testing corrected providers...');
    
    for (const provider of targetProviders) {
      if (!providers.includes(provider)) {
        console.log(`⏭️  Skipping ${provider} (not in list)`);
        continue;
      }
      
      console.log(`\n🔍 Testing ${provider}...`);
      try {
        const games = await fetchProviderGames(provider);
        console.log(`✅ ${provider}: ${games.length} games fetched`);
        
        if (games.length > 0) {
          console.log(`📋 Sample games:`);
          games.slice(0, 3).forEach((game, i) => {
            console.log(`   ${i+1}. "${game.name}"`);
          });
        }
      } catch (error) {
        console.log(`❌ ${provider}: Error - ${error.message || error}`);
      }
    }
    
    // 3. Résumé final
    console.log('\n\n📊 CORRECTION SUMMARY');
    console.log('='.repeat(80));
    console.log('Provider Original | Provider Corrected | Games Found | Status');
    console.log('-'.repeat(80));
    console.log('nolimit-city      | no-limit-city       | TBD         | Testing...');
    console.log('relax-gaming      | relax               | TBD         | Testing...');
    console.log('backseat          | hacksaw-gaming      | TBD         | Testing...');
    console.log('pragmatic-play    | pragmatic-play      | TBD         | Reference...');
    
  } catch (error) {
    console.error('💥 Correction test failed:', error);
  }
}

testCorrection().catch(console.error);
