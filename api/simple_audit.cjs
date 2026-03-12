// api/simple_audit.cjs
// Analyse simple des résultats de l'audit global

function analyzeAuditResults() {
  console.log('🔍 DETAILED AUDIT ANALYSIS');
  console.log('='.repeat(100));
  
  // Résultats de l'audit global
  const workingProviders = [
    { slug: "pragmatic-play", games: 595, alias: "Pragmatic Play" },
    { slug: "pgsoft", games: 595, alias: "pgsoft" },
    { slug: "playn-go", games: 429, alias: "Play'n GO" },
    { slug: "hacksaw-gaming", games: 164, alias: "Hacksaw Gaming" },
    { slug: "no-limit-city", games: 130, alias: "Nolimit City" },
    { slug: "relax", games: 112, alias: "Relax Gaming" },
    { slug: "platipus", games: 76, alias: "platipus" },
    { slug: "popiplay", games: 57, alias: "popiplay" },
    { slug: "playson", games: 38, alias: "playson" },
    { slug: "yggdrasil", games: 39, alias: "yggdrasil" },
    { slug: "netent", games: 39, alias: "NetEnt" },
    { slug: "microgaming", games: 39, alias: "Microgaming" },
    { slug: "elk", games: 39, alias: "Elk" },
    { slug: "bgaming", games: 39, alias: "BGaming" },
    { slug: "3oaks", games: 24, alias: "3oaks" },
    { slug: "gamba", games: 22, alias: "gamba" },
    { slug: "7mojos", games: 19, alias: "7mojos" },
    { slug: "igrosoft", games: 17, alias: "igrosoft" },
    { slug: "bet2tech", games: 13, alias: "bet2tech" },
    { slug: "givme", games: 10, alias: "givme" },
    { slug: "atmosfera", games: 2, alias: "atmosfera" }
  ];
  
  const emptyProviders = [
    { slug: "betsoft", alias: "betsoft" },
    { slug: "btg", alias: "Big Time Gaming" },
    { slug: "red-tiger", alias: "Red Tiger" },
    { slug: "thunderkick", alias: "Thunderkick" },
    { slug: "quickspin", alias: "quickspin" },
    { slug: "wazdan", alias: "wazdan" },
    { slug: "atomic-slot-lab", alias: "atomic-slot-lab" },
    { slug: "bullshark", alias: "Hacksaw Gaming" },
    { slug: "fourleaf", alias: "fourleaf" },
    { slug: "gamba-originals", alias: "gamba-originals" },
    { slug: "golden-hero", alias: "golden-hero" },
    { slug: "high5", alias: "high5" },
    { slug: "irondog", alias: "irondog" },
    { slug: "oryx-gaming", alias: "Oryx Gaming" },
    { slug: "peter-and-sons", alias: "Peter & Sons" },
    { slug: "print-studios", alias: "Print Studios" },
    { slug: "slotmill", alias: "slotmill" },
    { slug: "smartsoft-gaming", alias: "SmartSoft Gaming" },
    { slug: "spinomenal2", alias: "spinomenal2" },
    { slug: "truelab", alias: "truelab" },
    { slug: "winfast", alias: "winfast" }
  ];
  
  // Statistiques
  const total = workingProviders.length + emptyProviders.length;
  const totalGames = workingProviders.reduce((sum, p) => sum + p.games, 0);
  
  console.log('\n📊 STATISTICS:');
  console.log('   • Total providers: ' + total);
  console.log('   • Working providers: ' + workingProviders.length + ' (' + ((workingProviders.length/total)*100).toFixed(1) + '%)');
  console.log('   • Empty providers: ' + emptyProviders.length + ' (' + ((emptyProviders.length/total)*100).toFixed(1) + '%)');
  console.log('   • Total games: ' + totalGames.toLocaleString());
  console.log('   • Average games/provider: ' + Math.round(totalGames/workingProviders.length) + ' (working only)');
  
  // Top providers
  console.log('\n🏆 TOP 15 PROVIDERS BY GAME COUNT:');
  const topProviders = workingProviders.sort((a, b) => b.games - a.games);
  
  topProviders.forEach((p, i) => {
    const bar = '█'.repeat(Math.min(20, Math.round(p.games / 30)));
    console.log('   ' + (i+1).toString().padStart(2) + '. ' + p.slug.padEnd(20) + ' ' + p.games.toString().padEnd(4) + ' ' + bar + ' ' + p.alias);
  });
  
  // Providers vides
  console.log('\n❌ EMPTY PROVIDERS (' + emptyProviders.length + '):');
  
  emptyProviders.forEach(p => {
    console.log('   • ' + p.slug.padEnd(20) + ' → ' + p.alias.padEnd(20) + ' (0 games)');
  });
  
  // Analyse des providers majeurs vides
  console.log('\n⚠️  MAJOR PROVIDERS WITH 0 GAMES:');
  const majorEmpty = ['betsoft', 'btg', 'red-tiger', 'thunderkick', 'quickspin', 'wazdan'];
  
  majorEmpty.forEach(slug => {
    const provider = emptyProviders.find(p => p.slug === slug);
    if (provider) {
      console.log('   🔍 ' + provider.slug + ' → ' + provider.alias + ' (MAJOR provider - should have games)');
    }
  });
  
  // Mapping final recommandé
  console.log('\n🗺️  RECOMMENDED PROVIDER_ALIASES.TS:');
  console.log('```typescript');
  console.log('const ALIASES: Record<string, string> = {');
  
  // Providers working
  workingProviders.forEach(p => {
    console.log('  "' + p.slug + '": "' + p.alias + '",');
  });
  
  console.log('\n  // Major providers to investigate (currently empty)');
  majorEmpty.forEach(slug => {
    const provider = emptyProviders.find(p => p.slug === slug);
    if (provider) {
      console.log('  // "' + provider.slug + '": "' + provider.alias + '", // EMPTY - investigate needed');
    }
  });
  
  console.log('\n  // Minor providers (safe to remove)');
  const minorEmpty = emptyProviders.filter(p => !majorEmpty.includes(p.slug));
  minorEmpty.forEach(p => {
    console.log('  // "' + p.slug + '": "' + p.alias + '", // EMPTY - consider removal');
  });
  
  console.log('};');
  console.log('```');
  
  console.log('\n🎯 RECOMMENDATIONS SUMMARY:');
  console.log('   ✅ KEEP: ' + workingProviders.length + ' working providers');
  console.log('   🔍 INVESTIGATE: ' + majorEmpty.length + ' major providers (should have games)');
  console.log('   🗑️  REMOVE: ' + minorEmpty.length + ' minor providers (safe to remove)');
  
  return {
    working: workingProviders.length,
    empty: emptyProviders.length,
    majorEmpty: majorEmpty.length,
    minorEmpty: minorEmpty.length,
    totalGames: totalGames
  };
}

const analysis = analyzeAuditResults();
console.log('\n✅ Analysis complete!');
console.log('   • Keep ' + analysis.working + ' providers');
console.log('   • Investigate ' + analysis.majorEmpty + ' major providers');
console.log('   • Consider removing ' + analysis.minorEmpty + ' minor providers');
console.log('   • Total games available: ' + analysis.totalGames.toLocaleString());
