// api/test_providers.cjs
const { diagnoseMultipleProviders } = require('./dist/calls/provider_diagnostic.js');
const { pool } = require('./dist/db.js');

async function runProviderDiagnostic() {
  console.log('🔍 LUNALIVE SLOTS PROVIDER DIAGNOSTIC');
  console.log('='.repeat(60));
  
  const providersToTest = [
    'pragmatic-play',    // Cas qui marche
    'nolimit-city',      // Problématique
    'relax-gaming',      // Problématique  
    'backseat-gaming',   // Problématique
    'no-limit-city',     // Alternative slug
    'relax',             // Alternative slug
    'backseat',          // Alternative slug
  ];
  
  try {
    const results = await diagnoseMultipleProviders(pool, providersToTest);
    
    console.log('\n\n📊 FINAL DIAGNOSTIC TABLE');
    console.log('='.repeat(120));
    console.log('Provider Requested | Slug Found | In List | Fetch OK | Raw | Norm | DB | Would Insert | Issues');
    console.log('-'.repeat(120));
    
    results.forEach(result => {
      const provider = result.providerRequested.padEnd(18);
      const slug = (result.slugFound || 'NULL').padEnd(12);
      const inList = result.slugInList ? 'YES' : 'NO';
      const fetchOk = result.fetchOk ? 'YES' : 'NO';
      const raw = result.rawGamesCount.toString().padEnd(4);
      const norm = result.normalizedGamesCount.toString().padEnd(4);
      const db = result.existingInDbCount.toString().padEnd(4);
      const insert = result.upsertedCount.toString().padEnd(11);
      const issues = result.issues.length > 0 ? `YES (${result.issues.length})` : 'NONE';
      
      console.log(`${provider} | ${slug} | ${inList} | ${fetchOk} | ${raw} | ${norm} | ${db} | ${insert} | ${issues}`);
    });
    
    console.log('\n🔍 DETAILED ISSUES');
    console.log('='.repeat(60));
    
    results.forEach(result => {
      if (result.issues.length > 0) {
        console.log(`\n❌ ${result.providerRequested}:`);
        result.issues.forEach(issue => console.log(`   • ${issue}`));
      } else {
        console.log(`✅ ${result.providerRequested}: No issues`);
      }
    });
    
    console.log('\n🎯 KEY FINDINGS');
    console.log('='.repeat(60));
    
    const pragmatic = results.find(r => r.providerRequested === 'pragmatic-play');
    const nolimit = results.find(r => r.providerRequested.includes('nolimit'));
    const relax = results.find(r => r.providerRequested.includes('relax'));
    const backseat = results.find(r => r.providerRequested.includes('backseat'));
    
    console.log(`📈 Pragmatic Play (reference):`);
    console.log(`   • Slug: ${pragmatic?.slugFound}`);
    console.log(`   • In list: ${pragmatic?.slugInList}`);
    console.log(`   • Fetch OK: ${pragmatic?.fetchOk}`);
    console.log(`   • Raw games: ${pragmatic?.rawGamesCount}`);
    console.log(`   • Normalized: ${pragmatic?.normalizedGamesCount}`);
    
    if (nolimit) {
      console.log(`\n🔍 Nolimit City variants:`);
      results.filter(r => r.providerRequested.includes('nolimit')).forEach(r => {
        console.log(`   • ${r.providerRequested}: slug="${r.slugFound}", inList=${r.slugInList}, fetch=${r.fetchOk}, games=${r.rawGamesCount}`);
      });
    }
    
    if (relax) {
      console.log(`\n🔍 Relax Gaming variants:`);
      results.filter(r => r.providerRequested.includes('relax')).forEach(r => {
        console.log(`   • ${r.providerRequested}: slug="${r.slugFound}", inList=${r.slugInList}, fetch=${r.fetchOk}, games=${r.rawGamesCount}`);
      });
    }
    
    if (backseat) {
      console.log(`\n🔍 Backseat Gaming variants:`);
      results.filter(r => r.providerRequested.includes('backseat')).forEach(r => {
        console.log(`   • ${r.providerRequested}: slug="${r.slugFound}", inList=${r.slugInList}, fetch=${r.fetchOk}, games=${r.rawGamesCount}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Diagnostic failed:', error);
  } finally {
    await pool.end();
  }
}

runProviderDiagnostic().catch(console.error);
