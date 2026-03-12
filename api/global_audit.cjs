// api/global_audit.cjs
const { auditAllProviders, analyzeAuditResults } = require('./dist/calls/global_audit.js');

async function runGlobalAudit() {
  console.log('🔍 LUNALIVE GLOBAL PROVIDER AUDIT');
  console.log('='.repeat(100));
  console.log('This will test ALL providers from Gamba and identify mapping issues...');
  console.log('⏱️  This may take a few minutes...\n');
  
  try {
    const startTime = Date.now();
    
    // 1. Lancer l'audit complet
    const summary = await auditAllProviders();
    const duration = Date.now() - startTime;
    
    console.log(`\n⏱️  Audit completed in ${Math.round(duration / 1000)}s`);
    
    // 2. Analyser les résultats
    const analysis = analyzeAuditResults(summary);
    
    // 3. Générer le mapping recommandé
    console.log('\n\n🗺️  RECOMMENDED MAPPING UPDATES:');
    console.log('='.repeat(100));
    
    const emptyProviders = analysis.emptyProviders;
    const suspectProviders = analysis.suspectProviders;
    
    if (emptyProviders.length > 0 || suspectProviders.length > 0) {
      console.log('\n// provider_aliases.ts - Recommended updates:');
      console.log('const ALIASES: Record<string, string> = {');
      
      // Afficher les providers OK comme référence
      const okProviders = summary.results.filter(r => r.status === 'OK').slice(0, 5);
      okProviders.forEach(p => {
        const alias = p.lunaLiveAlias || p.slug;
        console.log(`  "${p.slug}": "${alias}",`);
      });
      
      console.log('  // ... existing aliases ...');
      
      // Marquer les providers problématiques
      if (emptyProviders.length > 0) {
        console.log('\n  // ❌ EMPTY PROVIDERS (consider removing):');
        emptyProviders.forEach(p => {
          const alias = p.lunaLiveAlias || 'UNKNOWN';
          console.log(`  // "${p.slug}": "${alias}", // EMPTY - ${p.rawGamesCount} games`);
        });
      }
      
      if (suspectProviders.length > 0) {
        console.log('\n  // ⚠️  SUSPECT PROVIDERS (need investigation):');
        suspectProviders.forEach(p => {
          const alias = p.lunaLiveAlias || 'UNKNOWN';
          console.log(`  // "${p.slug}": "${alias}", // ${p.issues.join(', ')}`);
        });
      }
      
      console.log('};');
    } else {
      console.log('✅ All providers are working correctly! No mapping updates needed.');
    }
    
    // 4. Statistiques finales
    console.log('\n\n📊 FINAL STATISTICS:');
    console.log('='.repeat(100));
    console.log(`📈 Performance:`);
    console.log(`   • Total providers tested: ${summary.totalProviders}`);
    console.log(`   • Total games found: ${summary.totalGamesFound.toLocaleString()}`);
    console.log(`   • Average games per provider: ${Math.round(summary.totalGamesFound / summary.totalProviders)}`);
    console.log(`   • Audit duration: ${Math.round(duration / 1000)}s`);
    
    console.log(`\n📋 Distribution:`);
    console.log(`   • ✅ Working: ${summary.okProviders} (${((summary.okProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
    console.log(`   • ❌ Empty: ${summary.emptyProviders} (${((summary.emptyProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
    console.log(`   • ⚠️  Suspect: ${summary.suspectProviders} (${((summary.suspectProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
    console.log(`   • 💥 Error: ${summary.errorProviders} (${((summary.errorProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
    
    // 5. Top providers
    console.log(`\n🏆 TOP 10 PROVIDERS BY GAME COUNT:`);
    const topProviders = summary.results
      .filter(r => r.status === 'OK')
      .sort((a, b) => b.rawGamesCount - a.rawGamesCount)
      .slice(0, 10);
    
    topProviders.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.slug}: ${p.rawGamesCount.toLocaleString()} games → ${p.lunaLiveAlias}`);
    });
    
    // 6. Export pour analyse ultérieure
    console.log('\n\n💾 DATA EXPORT:');
    console.log('='.repeat(100));
    console.log('// Complete audit results for further analysis:');
    console.log('const auditResults = ' + JSON.stringify(summary.results, null, 2) + ';');
    
  } catch (error) {
    console.error('💥 Global audit failed:', error);
  }
}

runGlobalAudit().catch(console.error);
