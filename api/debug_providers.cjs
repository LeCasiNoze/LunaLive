// api/debug_providers.cjs
const { compareProvidersDebug } = require('./dist/calls/updater_debug.js');

async function debugProviders() {
  console.log('🔍 DETAILED PROVIDER COMPARISON');
  console.log('='.repeat(100));
  
  const providers = [
    'pragmatic-play',    // Référence qui fonctionne
    'nolimit-city',      // Problématique
    'relax-gaming',      // Problématique  
    'backseat',          // Problématique
  ];
  
  try {
    const results = await compareProvidersDebug(providers);
    
    console.log('\n\n📊 COMPARISON SUMMARY');
    console.log('='.repeat(120));
    console.log('Provider      | Total Games | Pages | HTTP Status | Response Time | Items/Page | Has More');
    console.log('-'.repeat(120));
    
    results.comparison.forEach(result => {
      const provider = result.provider.padEnd(14);
      const totalGames = result.totalGames.toString().padEnd(12);
      const pages = result.debug.length.toString().padEnd(6);
      
      if (result.debug.length > 0) {
        const firstPage = result.debug[0];
        const status = `${firstPage.httpStatus}`.padEnd(12);
        const responseTime = `${firstPage.responseTime}ms`.padEnd(13);
        const items = firstPage.responseItems.toString().padEnd(11);
        const hasMore = firstPage.hasMore ? 'YES' : 'NO';
        
        console.log(`${provider} | ${totalGames} | ${pages} | ${status} | ${responseTime} | ${items} | ${hasMore}`);
      } else {
        console.log(`${provider} | ${totalGames} | ${pages} | ${'ERROR'.padEnd(12)} | ${'N/A'.padEnd(13)} | ${'0'.padEnd(11)} | NO`);
      }
    });
    
    console.log('\n\n🔍 DETAILED PAYLOAD ANALYSIS');
    console.log('='.repeat(100));
    
    results.comparison.forEach(result => {
      console.log(`\n📋 ${result.provider}:`);
      
      if (result.debug.length > 0) {
        const firstPage = result.debug[0];
        
        console.log(`   📡 URL: ${firstPage.url}`);
        console.log(`   📦 Variables:`);
        console.log(`      producerSlug: "${firstPage.payload.variables.producerSlug}"`);
        console.log(`      first: ${firstPage.payload.variables.first}`);
        console.log(`      page: ${firstPage.payload.variables.page}`);
        console.log(`      orderBy: ${JSON.stringify(firstPage.payload.variables.orderBy)}`);
        console.log(`   🔑 Extensions:`);
        console.log(`      persistedQuery.version: ${firstPage.payload.extensions.persistedQuery.version}`);
        console.log(`      persistedQuery.sha256Hash: ${firstPage.payload.extensions.persistedQuery.sha256Hash}`);
        console.log(`   📊 Response: HTTP ${firstPage.httpStatus} (${firstPage.responseTime}ms)`);
        console.log(`   📦 Items: ${firstPage.responseItems}`);
        console.log(`   📄 Has more pages: ${firstPage.hasMore}`);
        
        if (firstPage.responseRaw && firstPage.responseRaw.data) {
          const gameSearch = firstPage.responseRaw.data.gameSearch;
          console.log(`   🎮 GameSearch structure:`);
          console.log(`      data exists: ${!!gameSearch?.data}`);
          console.log(`      data length: ${Array.isArray(gameSearch?.data) ? gameSearch.data.length : 'N/A'}`);
          console.log(`      paginatorInfo exists: ${!!gameSearch?.paginatorInfo}`);
          
          if (gameSearch?.paginatorInfo) {
            console.log(`      paginatorInfo:`);
            console.log(`         total: ${gameSearch.paginatorInfo.total || 'N/A'}`);
            console.log(`         hasMorePages: ${gameSearch.paginatorInfo.hasMorePages || 'N/A'}`);
            console.log(`         currentPage: ${gameSearch.paginatorInfo.currentPage || 'N/A'}`);
          }
        }
        
        // Si 0 items, montrer un extrait de la réponse brute
        if (firstPage.responseItems === 0 && firstPage.responseRaw) {
          console.log(`   ❌ Raw response (first 300 chars):`);
          console.log(`      ${JSON.stringify(firstPage.responseRaw).substring(0, 300)}...`);
        }
      } else {
        console.log(`   ❌ No debug info available`);
      }
    });
    
    console.log('\n\n🎯 KEY DIFFERENCES');
    console.log('='.repeat(100));
    
    const pragmatic = results.comparison.find(r => r.provider === 'pragmatic-play');
    const problematic = results.comparison.filter(r => r.provider !== 'pragmatic-play');
    
    if (pragmatic && problematic.length > 0) {
      console.log(`\n✅ Pragmatic Play (working):`);
      console.log(`   • Total games: ${pragmatic.totalGames}`);
      console.log(`   • Pages fetched: ${pragmatic.debug.length}`);
      if (pragmatic.debug.length > 0) {
        console.log(`   • First page: ${pragmatic.debug[0].responseItems} items`);
        console.log(`   • HTTP status: ${pragmatic.debug[0].httpStatus}`);
        console.log(`   • Response time: ${pragmatic.debug[0].responseTime}ms`);
      }
      
      console.log(`\n❌ Problematic providers:`);
      problematic.forEach(result => {
        console.log(`   • ${result.provider}: ${result.totalGames} games total`);
        if (result.debug.length > 0) {
          const firstPage = result.debug[0];
          console.log(`     - First page: ${firstPage.responseItems} items`);
          console.log(`     - HTTP status: ${firstPage.httpStatus}`);
          console.log(`     - Response time: ${firstPage.responseTime}ms`);
          console.log(`     - Same SHA hash: ${firstPage.payload.extensions.persistedQuery.sha256Hash === pragmatic.debug[0]?.payload.extensions.persistedQuery.sha256Hash ? 'YES' : 'NO'}`);
          console.log(`     - Same structure: ${firstPage.payload.variables.first === pragmatic.debug[0]?.payload.variables.first ? 'YES' : 'NO'}`);
        }
      });
    }
    
  } catch (error) {
    console.error('💥 Debug failed:', error);
  }
}

debugProviders().catch(console.error);
