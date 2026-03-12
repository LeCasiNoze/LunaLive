// api/check_providers.cjs
const { fetchProviderSlugs } = require('./dist/calls/updater.js');

async function checkAllProviders() {
  console.log('🔍 Getting ALL provider slugs from Gamba...');
  const providers = await fetchProviderSlugs();
  
  const suspiciousProviders = providers.filter(p => 
    p.includes('nolimit') || 
    p.includes('relax') || 
    p.includes('backseat') ||
    p.includes('limit') ||
    p.includes('bullshark') ||
    p.includes('shady')
  );
  
  console.log('\n📋 Suspicious/Related providers:');
  suspiciousProviders.forEach(p => console.log(`   • ${p}`));
  
  console.log(`\n📊 Total providers: ${providers.length}`);
  console.log('\n🎯 Checking for exact matches:');
  console.log(`   • pragmatic-play: ${providers.includes('pragmatic-play') ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`   • nolimit-city: ${providers.includes('nolimit-city') ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`   • relax-gaming: ${providers.includes('relax-gaming') ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`   • backseat: ${providers.includes('backseat') ? '✅ FOUND' : '❌ NOT FOUND'}`);
  
  console.log('\n🔍 ALL providers containing "limit":');
  providers.filter(p => p.includes('limit')).forEach(p => console.log(`   • ${p}`));
  
  console.log('\n🔍 ALL providers containing "relax":');
  providers.filter(p => p.includes('relax')).forEach(p => console.log(`   • ${p}`));
  
  console.log('\n🔍 ALL providers containing "back":');
  providers.filter(p => p.includes('back')).forEach(p => console.log(`   • ${p}`));
}

checkAllProviders().catch(console.error);
