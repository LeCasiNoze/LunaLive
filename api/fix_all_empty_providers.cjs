// api/fix_all_empty_providers.cjs
// Diagnostic complet de tous les providers vides avec recherche de variantes

const { fetchProviderSlugs } = require('./dist/calls/updater.js');
const { fetchProviderGames } = require('./dist/calls/updater.js');

async function fixAllEmptyProviders() {
  console.log('🔍 COMPREHENSIVE FIX FOR ALL EMPTY PROVIDERS');
  console.log('='.repeat(100));
  
  try {
    // 1. Récupérer tous les slugs depuis Gamba
    const allSlugs = await fetchProviderSlugs();
    console.log(`📋 Total providers found: ${allSlugs.length}`);
    
    // 2. Identifier les providers vides (ceux qui retournent 0 jeux)
    console.log('\n🔍 Step 1: Identifying empty providers...');
    const emptyProviders = [];
    const workingProviders = [];
    
    for (const slug of allSlugs) {
      try {
        const games = await fetchProviderGames(slug);
        if (games.length === 0) {
          emptyProviders.push(slug);
        } else {
          workingProviders.push({ slug, games: games.length });
        }
        console.log(`   ${slug}: ${games.length} games`);
      } catch (error) {
        console.log(`   ${slug}: ERROR - ${error.message}`);
        emptyProviders.push(slug);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   • Working providers: ${workingProviders.length}`);
    console.log(`   • Empty providers: ${emptyProviders.length}`);
    
    // 3. Pour chaque provider vide, tester des variantes
    console.log('\n🔍 Step 2: Testing variants for empty providers...');
    
    const variantMapping = {
      // Providers majeurs avec variantes connues
      'betsoft': ['betsoft-gaming', 'bet-soft', 'betsoft'],
      'btg': ['big-time-gaming', 'bigtime-gaming', 'btg'],
      'red-tiger': ['redtiger', 'red-tiger-gaming', 'redtiger'],
      'thunderkick': ['thunder-kick', 'thunderkick'],
      'quickspin': ['quick-spin', 'quickspin'],
      'wazdan': ['wazdan-gaming', 'wazdan'],
      
      // Autres providers avec variantes possibles
      'atomic-slot-lab': ['atomic-slot', 'atomicslot', 'atomic-slot-lab'],
      'bullshark': ['bull-shark', 'bullshark-gaming', 'bullshark'],
      'fourleaf': ['four-leaf', 'fourleaf', 'four-leaf-gaming'],
      'gamba-originals': ['gamba-original', 'gamba-originals', 'gamba'],
      'golden-hero': ['goldenhero', 'golden-hero', 'golden-hero-gaming'],
      'high5': ['high-5', 'high5-gaming', 'high5'],
      'irondog': ['iron-dog', 'irondog-gaming', 'irondog'],
      'oryx-gaming': ['oryx', 'oryx-gaming', 'oryx'],
      'peter-and-sons': ['peterandsons', 'peter-sons', 'peterandsons'],
      'print-studios': ['printstudios', 'print-studios', 'printstudios'],
      'slotmill': ['slot-mill', 'slotmill', 'slotmill-gaming'],
      'smartsoft-gaming': ['smartsoft', 'smartsoft-gaming', 'smartsoft'],
      'spinomenal2': ['spinomenal', 'spinomenal2', 'spinomenal'],
      'truelab': ['true-lab', 'truelab', 'truelab-gaming'],
      'winfast': ['win-fast', 'winfast', 'winfast-gaming']
    };
    
    const fixes = [];
    
    for (const emptySlug of emptyProviders) {
      console.log(`\n🔍 Testing variants for ${emptySlug}...`);
      
      const variants = variantMapping[emptySlug] || [
        // Variantes génériques
        emptySlug.replace(/-/g, ''),
        emptySlug.replace(/-/g, ''),
        emptySlug + '-gaming',
        emptySlug.replace('-gaming', ''),
        emptySlug.replace('-gaming', '-games')
      ];
      
      let foundWorking = false;
      
      for (const variant of variants) {
        if (variant === emptySlug) continue; // Skip original
        
        try {
          const games = await fetchProviderGames(variant);
          if (games.length > 0) {
            console.log(`   ✅ FOUND: ${variant} → ${games.length} games`);
            fixes.push({
              original: emptySlug,
              working: variant,
              games: games.length
            });
            foundWorking = true;
            break; // Stop after first working variant found
          } else {
            console.log(`   ❌ ${variant}: 0 games`);
          }
        } catch (error) {
          console.log(`   💥 ${variant}: Error - ${error.message}`);
        }
      }
      
      if (!foundWorking) {
        console.log(`   ❌ No working variant found for ${emptySlug}`);
        fixes.push({
          original: emptySlug,
          working: null,
          games: 0
        });
      }
    }
    
    // 4. Résumé des corrections
    console.log('\n\n🎯 FIXES SUMMARY');
    console.log('='.repeat(100));
    
    const successfulFixes = fixes.filter(f => f.working && f.games > 0);
    const failedFixes = fixes.filter(f => !f.working);
    
    console.log(`\n✅ Successful fixes: ${successfulFixes.length}`);
    successfulFixes.forEach(fix => {
      console.log(`   ${fix.original} → ${fix.working} (${fix.games} games)`);
    });
    
    console.log(`\n❌ Failed fixes: ${failedFixes.length}`);
    failedFixes.forEach(fix => {
      console.log(`   ${fix.original} → NO WORKING VARIANT FOUND`);
    });
    
    // 5. Générer le mapping final
    console.log('\n\n🗺️  RECOMMENDED MAPPING UPDATES:');
    console.log('='.repeat(100));
    
    if (successfulFixes.length > 0) {
      console.log('\n// updater.ts - Add to slugMapping:');
      console.log('const slugMapping: Record<string, string> = {');
      
      successfulFixes.forEach(fix => {
        console.log(`  "${fix.original}": "${fix.working}",`);
      });
      
      console.log('  // ... existing mappings');
      console.log('};');
      
      console.log('\n// updater.ts - Add to emptyProviders filter (remove these):');
      successfulFixes.forEach(fix => {
        console.log(`// Remove "${fix.original}" from emptyProviders list`);
      });
    }
    
    if (failedFixes.length > 0) {
      console.log('\n// These providers remain empty - keep in filter:');
      failedFixes.forEach(fix => {
        console.log(`// "${fix.original}", // Still empty`);
      });
    }
    
    // 6. Statistiques finales
    const totalGamesAfterFix = workingProviders.reduce((sum, p) => sum + p.games, 0) +
                              successfulFixes.reduce((sum, f) => sum + f.games, 0);
    
    console.log('\n\n📊 FINAL STATISTICS');
    console.log('='.repeat(100));
    console.log(`   • Original working providers: ${workingProviders.length}`);
    console.log(`   • Successfully fixed providers: ${successfulFixes.length}`);
    console.log(`   • Still empty providers: ${failedFixes.length}`);
    console.log(`   • Total games before fix: ${workingProviders.reduce((sum, p) => sum + p.games, 0).toLocaleString()}`);
    console.log(`   • Additional games found: ${successfulFixes.reduce((sum, f) => sum + f.games, 0).toLocaleString()}`);
    console.log(`   • Total games after fix: ${totalGamesAfterFix.toLocaleString()}`);
    
    return {
      workingProviders,
      emptyProviders,
      fixes: successfulFixes,
      failed: failedFixes,
      totalGamesAfterFix
    };
    
  } catch (error) {
    console.error('💥 Comprehensive fix failed:', error);
  }
}

fixAllEmptyProviders().catch(console.error);
