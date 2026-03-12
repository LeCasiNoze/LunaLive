// api/analyze_audit.cjs
// Analyse détaillée des résultats de l'audit global

const auditResults = [
  // Providers OK (top 20 par nombre de jeux)
  { slug: "pragmatic-play", games: 595, alias: "Pragmatic Play", status: "OK" },
  { slug: "no-limit-city", games: 130, alias: "Nolimit City", status: "OK" },
  { slug: "hacksaw-gaming", games: 164, alias: "Hacksaw Gaming", status: "OK" },
  { slug: "relax", games: 112, alias: "Relax Gaming", status: "OK" },
  { slug: "pgsoft", games: 595, alias: "pgsoft", status: "OK" },
  { slug: "platipus", games: 76, alias: "platipus", status: "OK" },
  { slug: "playson", games: 38, alias: "playson", status: "OK" },
  { slug: "popiplay", games: 57, alias: "popiplay", status: "OK" },
  { slug: "yggdrasil", games: 39, alias: "yggdrasil", status: "OK" },
  { slug: "netent", games: 39, alias: "NetEnt", status: "OK" },
  { slug: "playn-go", games: 429, alias: "Play'n GO", status: "OK" },
  { slug: "microgaming", games: 39, alias: "Microgaming", status: "OK" },
  { slug: "elk", games: 39, alias: "Elk", status: "OK" },
  { slug: "bgaming", games: 39, alias: "BGaming", status: "OK" },
  { slug: "thunderkick", games: 0, alias: "Thunderkick", status: "EMPTY" }, // Vide
  { slug: "quickspin", games: 0, alias: "quickspin", status: "EMPTY" }, // Vide
  { slug: "red-tiger", games: 0, alias: "Red Tiger", status: "EMPTY" }, // Vide
  { slug: "wazdan", games: 0, alias: "wazdan", status: "EMPTY" }, // Vide
  { slug: "betsoft", games: 0, alias: "betsoft", status: "EMPTY" }, // Vide
  { slug: "btg", games: 0, alias: "Big Time Gaming", status: "EMPTY" }, // Vide
  
  // Autres providers vides
  { slug: "atomic-slot-lab", games: 0, alias: "atomic-slot-lab", status: "EMPTY" },
  { slug: "bullshark", games: 0, alias: "Hacksaw Gaming", status: "EMPTY" },
  { slug: "fourleaf", games: 0, alias: "fourleaf", status: "EMPTY" },
  { slug: "gamba-originals", games: 0, alias: "gamba-originals", status: "EMPTY" },
  { slug: "golden-hero", games: 0, alias: "golden-hero", status: "EMPTY" },
  { slug: "high5", games: 0, alias: "high5", status: "EMPTY" },
  { slug: "irondog", games: 0, alias: "irondog", status: "EMPTY" },
  { slug: "oryx-gaming", games: 0, alias: "Oryx Gaming", status: "EMPTY" },
  { slug: "peter-and-sons", games: 0, alias: "Peter & Sons", status: "EMPTY" },
  { slug: "print-studios", games: 0, alias: "Print Studios", status: "EMPTY" },
  { slug: "slotmill", games: 0, alias: "slotmill", status: "EMPTY" },
  { slug: "smartsoft-gaming", games: 0, alias: "SmartSoft Gaming", status: "EMPTY" },
  { slug: "spinomenal2", games: 0, alias: "spinomenal2", status: "EMPTY" },
  { slug: "truelab", games: 0, alias: "truelab", status: "EMPTY" },
  { slug: "winfast", games: 0, alias: "winfast", status: "EMPTY" }
];

function analyzeAudit() {
  console.log('🔍 DETAILED AUDIT ANALYSIS');
  console.log('='.repeat(100));
  
  // Statistiques
  const total = auditResults.length;
  const ok = auditResults.filter(r => r.status === 'OK').length;
  const empty = auditResults.filter(r => r.status === 'EMPTY').length;
  const totalGames = auditResults.reduce((sum, r) => sum + r.games, 0);
  
  console.log(`\n📊 STATISTICS:`);
  console.log(`   • Total providers: ${total}`);
  console.log(`   • Working providers: ${ok} (${((ok/total)*100).toFixed(1)}%)`);
  console.log(`   • Empty providers: ${empty} (${((empty/total)*100).toFixed(1)}%)`);
  console.log(`   • Total games: ${totalGames.toLocaleString()}`);
  console.log(`   • Average games/provider: ${Math.round(totalGames/ok)} (working only)`);
  
  // Top providers
  console.log(`\n🏆 TOP 15 PROVIDERS BY GAME COUNT:`);
  const topProviders = auditResults
    .filter(r => r.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, 15);
  
  topProviders.forEach((p, i) => {
    const bar = '█'.repeat(Math.min(20, Math.round(p.games / 30)));
    console.log(`   ${(i+1).toString().padStart(2)}. ${p.slug.padEnd(20)} ${p.games.toString().padEnd(4)} ${bar} ${p.alias}`);
  });
  
  // Providers vides
  console.log(`\n❌ EMPTY PROVIDERS (${empty}):`);
  const emptyProviders = auditResults.filter(r => r.status === 'EMPTY');
  
  emptyProviders.forEach(p => {
    console.log(`   • ${p.slug.padEnd(20)} → ${p.alias.padEnd(20)} (0 games)`);
  });
  
  // Analyse des alias problématiques
  console.log(`\n⚠️  ALIAS ANALYSIS:`);
  
  const suspectAliases = auditResults.filter(r => 
    r.status === 'EMPTY' && 
    r.alias && 
    r.alias !== r.slug &&
    !r.alias.includes(r.slug.replace(/-/g, ' '))
  );
  
  if (suspectAliases.length > 0) {
    console.log(`   Providers with suspect aliases (mapped to different names):`);
    suspectAliases.forEach(p => {
      console.log(`   • ${p.slug} → ${p.alias} (EMPTY)`);
    });
  }
  
  // Recommandations
  console.log(`\n🎯 RECOMMENDATIONS:`);
  console.log(`\n1. KEEP (working providers):`);
  topProviders.forEach(p => {
    console.log(`   ✅ "${p.slug}": "${p.alias}"`);
  });
  
  console.log(`\n2. INVESTIGATE (major providers with 0 games):`);
  const majorEmpty = emptyProviders.filter(p => 
    ['betsoft', 'btg', 'red-tiger', 'thunderkick', 'quickspin', 'wazdan'].includes(p.slug)
  );
  majorEmpty.forEach(p => {
    console.log(`   🔍 "${p.slug}": "${p.alias}" - Major provider, should have games`);
  });
  
  console.log(`\n3. REMOVE (minor providers with 0 games):`);
  const minorEmpty = emptyProviders.filter(p => !majorEmpty.find(m => m.slug === p.slug));
  minorEmpty.forEach(p => {
    console.log(`   🗑️  "${p.slug}": "${p.alias}" - Minor provider, safe to remove`);
  });
  
  // Mapping final recommandé
  console.log(`\n🗺️  RECOMMENDED PROVIDER_ALIASES.TS:`);
  console.log('```typescript');
  console.log('const ALIASES: Record<string, string> = {');
  
  // Providers working
  topProviders.forEach(p => {
    console.log(`  "${p.slug}": "${p.alias}",`);
  });
  
  // Autres providers working (non-top)
  const otherWorking = auditResults.filter(r => r.status === 'OK' && !topProviders.find(t => t.slug === r.slug));
  otherWorking.forEach(p => {
    console.log(`  "${p.slug}": "${p.alias}",`);
  });
  
  console.log('\n  // Major providers to investigate (currently empty)');
  majorEmpty.forEach(p => {
    console.log(`  // "${p.slug}": "${p.alias}", // EMPTY - investigate needed`);
  });
  
  console.log('\n  // Minor providers (safe to remove)');
  minorEmpty.forEach(p => {
    console.log(`  // "${p.slug}": "${p.alias}", // EMPTY - consider removal`);
  });
  
  console.log('};');
  console.log('```');
  
  return {
    total,
    ok,
    empty,
    totalGames,
    topProviders,
    emptyProviders,
    majorEmpty,
    minorEmpty,
    recommendations: {
      keep: topProviders.concat(otherWorking),
      investigate: majorEmpty,
      remove: minorEmpty
    }
  };
}

const analysis = analyzeAudit();
console.log(`\n✅ Analysis complete!`);
console.log(`   • Keep ${analysis.recommendations.keep.length} providers`);
console.log(`   • Investigate ${analysis.recommendations.investigate.length} major providers`);
console.log(`   • Consider removing ${analysis.recommendations.remove.length} minor providers`);
