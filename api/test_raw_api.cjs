// api/test_raw_api.cjs
const { fetchProviderGames } = require('./dist/calls/updater.js');

async function testRawAPI() {
  console.log('🔍 Testing raw API calls for problematic providers...');
  
  const providers = ['nolimit-city', 'relax-gaming', 'backseat', 'pragmatic-play'];
  
  for (const provider of providers) {
    console.log(`\n🔄 Testing ${provider}...`);
    try {
      const games = await fetchProviderGames(provider);
      console.log(`✅ ${provider}: ${games.length} games fetched`);
      
      if (games.length > 0) {
        console.log(`📋 Sample games for ${provider}:`);
        games.slice(0, 3).forEach((game, i) => {
          console.log(`   ${i+1}. "${game.name}" (provider: ${game.provider})`);
        });
      } else {
        console.log(`❌ ${provider}: No games returned`);
      }
    } catch (error) {
      console.log(`💥 ${provider}: Error - ${error.message || error}`);
    }
  }
}

testRawAPI().catch(console.error);
