// api/test_variants.cjs
const { compareProvidersDebug } = require('./dist/calls/updater_debug.js');

async function testVariantSlugs() {
  console.log('🔍 TESTING VARIANT SLUGS');
  console.log('='.repeat(100));
  
  const variants = [
    // Nolimit City variants
    'nolimit',
    'no-limit',
    'no-limit-city',
    'nolimitcity',
    
    // Relax Gaming variants  
    'relax',
    'relaxgaming',
    
    // Backseat/Hacksaw variants
    'hacksaw-gaming',
    'hacksaw',
    'bullshark',
    'bullshark-gaming',
    
    // Référence
    'pragmatic-play'
  ];
  
  try {
    const results = await compareProvidersDebug(variants);
    
    console.log('\n\n📊 VARIANT TESTS SUMMARY');
    console.log('='.repeat(120));
    console.log('Provider        | Total Games | HTTP Status | Response Time | Items/Page | Notes');
    console.log('-'.repeat(120));
    
    results.comparison.forEach(result => {
      const provider = result.provider.padEnd(16);
      const totalGames = result.totalGames.toString().padEnd(12);
      
      if (result.debug.length > 0) {
        const firstPage = result.debug[0];
        const status = `${firstPage.httpStatus}`.padEnd(12);
        const responseTime = `${firstPage.responseTime}ms`.padEnd(13);
        const items = firstPage.responseItems.toString().padEnd(11);
        
        let notes = '';
        if (result.totalGames > 0) {
          notes = '✅ FOUND GAMES!';
        } else if (firstPage.httpStatus !== 200) {
          notes = `❌ HTTP ${firstPage.httpStatus}`;
        } else {
          notes = '❌ No games';
        }
        
        console.log(`${provider} | ${totalGames} | ${status} | ${responseTime} | ${items} | ${notes}`);
      } else {
        console.log(`${provider} | ${totalGames} | ${'ERROR'.padEnd(12)} | ${'N/A'.padEnd(13)} | ${'0'.padEnd(11)} | ❌ Error`);
      }
    });
    
    console.log('\n\n🎯 SUCCESSFUL VARIANTS');
    console.log('='.repeat(100));
    
    const successful = results.comparison.filter(r => r.totalGames > 0);
    
    if (successful.length > 0) {
      console.log(`\n✅ Found ${successful.length} working variants:`);
      successful.forEach(result => {
        console.log(`   • ${result.provider}: ${result.totalGames} games`);
        if (result.debug.length > 0) {
          const firstPage = result.debug[0];
          console.log(`     - First page: ${firstPage.responseItems} items`);
          console.log(`     - Total pages: ${result.debug.length}`);
          console.log(`     - Response time: ${firstPage.responseTime}ms`);
        }
      });
      
      console.log('\n🔍 Sample games from successful variants:');
      for (const result of successful) {
        if (result.debug.length > 0 && result.debug[0].responseRaw?.data?.gameSearch?.data) {
          const games = result.debug[0].responseRaw.data.gameSearch.data;
          console.log(`\n📋 ${result.provider} (first 3 games):`);
          games.slice(0, 3).forEach((game, i) => {
            console.log(`   ${i+1}. "${game.title || game.name}"`);
          });
        }
      }
    } else {
      console.log('\n❌ No variants found games! All providers return 0 games.');
    }
    
    console.log('\n\n🔍 FAILED VARIANTS ANALYSIS');
    console.log('='.repeat(100));
    
    const failed = results.comparison.filter(r => r.totalGames === 0);
    
    console.log(`\n❌ ${failed.length} variants returned 0 games:`);
    failed.forEach(result => {
      if (result.debug.length > 0) {
        const firstPage = result.debug[0];
        console.log(`   • ${result.provider}: HTTP ${firstPage.httpStatus}, ${firstPage.responseTime}ms, 0 items`);
        
        // Vérifier si la structure de réponse est identique
        if (firstPage.responseRaw?.data?.gameSearch) {
          const gameSearch = firstPage.responseRaw.data.gameSearch;
          console.log(`     - Response structure: OK (gameSearch exists)`);
          console.log(`     - Data array length: ${Array.isArray(gameSearch.data) ? gameSearch.data.length : 'N/A'}`);
          console.log(`     - PaginatorInfo: ${gameSearch.paginatorInfo ? 'EXISTS' : 'MISSING'}`);
        } else {
          console.log(`     - Response structure: INVALID (no gameSearch)`);
        }
      }
    });
    
  } catch (error) {
    console.error('💥 Variant test failed:', error);
  }
}

testVariantSlugs().catch(console.error);
