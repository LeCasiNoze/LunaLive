// api/src/calls/global_audit.ts
// Audit global de tous les providers Gamba

import { fetchProviderSlugs, fetchProviderGames } from "./updater.js";
import { normalizeProvider } from "./provider_aliases.js";
import type { Pool } from "pg";

interface ProviderAuditResult {
  slug: string;
  rawGamesCount: number;
  pagesFetched: number;
  httpStatus: number;
  responseTime: number;
  lunaLiveAlias: string | null;
  status: 'OK' | 'EMPTY' | 'ALIAS_SUSPECT' | 'SLUG_SUSPECT' | 'ERROR';
  issues: string[];
  sampleGames: string[];
}

interface GlobalAuditSummary {
  totalProviders: number;
  okProviders: number;
  emptyProviders: number;
  suspectProviders: number;
  errorProviders: number;
  totalGamesFound: number;
  results: ProviderAuditResult[];
}

async function auditSingleProvider(slug: string): Promise<ProviderAuditResult> {
  const startTime = Date.now();
  const result: ProviderAuditResult = {
    slug,
    rawGamesCount: 0,
    pagesFetched: 0,
    httpStatus: 0,
    responseTime: 0,
    lunaLiveAlias: normalizeProvider(slug),
    status: 'OK',
    issues: [],
    sampleGames: []
  };

  try {
    const games = await fetchProviderGames(slug);
    const responseTime = Date.now() - startTime;
    
    result.rawGamesCount = games.length;
    result.responseTime = responseTime;
    result.httpStatus = 200;
    result.pagesFetched = Math.ceil(games.length / 39); // Approximation basée sur GAMMA_FIRST
    
    // Échantillon de jeux
    result.sampleGames = games.slice(0, 3).map(g => g.name);
    
    // Analyse du statut
    if (games.length === 0) {
      result.status = 'EMPTY';
      result.issues.push('No games returned');
    } else {
      result.status = 'OK';
    }
    
    // Vérifier les alias suspects
    const alias = result.lunaLiveAlias;
    if (!alias) {
      result.status = 'ALIAS_SUSPECT';
      result.issues.push('No LunaLive alias found');
    } else if (alias.toLowerCase() === slug.toLowerCase()) {
      // L'alias est identique au slug - pourrait être suspect
      if (slug.includes('-') || slug.includes('_')) {
        result.issues.push('Alias identical to slug (might need normalization)');
      }
    }
    
  } catch (error: any) {
    result.responseTime = Date.now() - startTime;
    result.status = 'ERROR';
    result.issues.push(`Fetch error: ${error.message || error}`);
    result.httpStatus = 0;
  }

  return result;
}

export async function auditAllProviders(): Promise<GlobalAuditSummary> {
  console.log('🔍 Starting global provider audit...');
  
  // 1. Récupérer tous les slugs
  const allSlugs = await fetchProviderSlugs();
  console.log(`📋 Found ${allSlugs.length} provider slugs`);
  
  // 2. Tester chaque provider
  const results: ProviderAuditResult[] = [];
  
  for (let i = 0; i < allSlugs.length; i++) {
    const slug = allSlugs[i];
    console.log(`🔄 [${i + 1}/${allSlugs.length}] Auditing ${slug}...`);
    
    const result = await auditSingleProvider(slug);
    results.push(result);
    
    // Petit delay pour ne pas surcharger l'API
    if (i < allSlugs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // 3. Calculer les statistiques
  const summary: GlobalAuditSummary = {
    totalProviders: results.length,
    okProviders: results.filter(r => r.status === 'OK').length,
    emptyProviders: results.filter(r => r.status === 'EMPTY').length,
    suspectProviders: results.filter(r => r.status === 'ALIAS_SUSPECT' || r.status === 'SLUG_SUSPECT').length,
    errorProviders: results.filter(r => r.status === 'ERROR').length,
    totalGamesFound: results.reduce((sum, r) => sum + r.rawGamesCount, 0),
    results
  };
  
  return summary;
}

export function analyzeAuditResults(summary: GlobalAuditSummary) {
  console.log('\n\n📊 GLOBAL AUDIT RESULTS');
  console.log('='.repeat(120));
  
  // Tableau résumé
  console.log(`\n📈 SUMMARY:`);
  console.log(`   • Total providers: ${summary.totalProviders}`);
  console.log(`   • OK providers: ${summary.okProviders} (${((summary.okProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
  console.log(`   • Empty providers: ${summary.emptyProviders} (${((summary.emptyProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
  console.log(`   • Suspect providers: ${summary.suspectProviders} (${((summary.suspectProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
  console.log(`   • Error providers: ${summary.errorProviders} (${((summary.errorProviders / summary.totalProviders) * 100).toFixed(1)}%)`);
  console.log(`   • Total games found: ${summary.totalGamesFound}`);
  
  // Tableau détaillé
  console.log('\n📋 DETAILED RESULTS:');
  console.log('='.repeat(120));
  console.log('Slug              | Games | Pages | Status | Alias                 | Issues');
  console.log('-'.repeat(120));
  
  summary.results
    .sort((a, b) => b.rawGamesCount - a.rawGamesCount)
    .forEach(result => {
      const slug = result.slug.padEnd(18);
      const games = result.rawGamesCount.toString().padEnd(6);
      const pages = result.pagesFetched.toString().padEnd(6);
      const status = result.status.padEnd(7);
      const alias = (result.lunaLiveAlias || 'NULL').padEnd(22);
      const issues = result.issues.length > 0 ? `${result.issues.length} issues` : 'OK';
      
      console.log(`${slug} | ${games} | ${pages} | ${status} | ${alias} | ${issues}`);
    });
  
  // Providers problématiques
  const problematic = summary.results.filter(r => r.status !== 'OK');
  
  if (problematic.length > 0) {
    console.log('\n\n⚠️  PROBLEMATIC PROVIDERS:');
    console.log('='.repeat(120));
    
    problematic.forEach(result => {
      console.log(`\n❌ ${result.slug}:`);
      console.log(`   • Status: ${result.status}`);
      console.log(`   • Games: ${result.rawGamesCount}`);
      console.log(`   • Alias: ${result.lunaLiveAlias || 'NULL'}`);
      console.log(`   • Issues: ${result.issues.join(', ')}`);
      
      if (result.sampleGames.length > 0) {
        console.log(`   • Sample: ${result.sampleGames.slice(0, 2).join(', ')}`);
      }
    });
  }
  
  // Recommendations de mapping
  console.log('\n\n🎯 MAPPING RECOMMENDATIONS:');
  console.log('='.repeat(120));
  
  const emptyProviders = summary.results.filter(r => r.status === 'EMPTY');
  const suspectProviders = summary.results.filter(r => r.status === 'ALIAS_SUSPECT' || r.status === 'SLUG_SUSPECT');
  
  if (emptyProviders.length > 0) {
    console.log(`\n🔍 Empty providers (${emptyProviders.length}):`);
    console.log('   These providers exist but return 0 games. Consider:');
    console.log('   • Checking if they should be removed');
    console.log('   • Verifying if they have a different working slug');
    console.log('   • Confirming if they are temporarily disabled');
    
    emptyProviders.forEach(p => {
      console.log(`     • ${p.slug} → ${p.lunaLiveAlias || 'NULL'}`);
    });
  }
  
  if (suspectProviders.length > 0) {
    console.log(`\n⚠️  Suspect providers (${suspectProviders.length}):`);
    console.log('   These providers have mapping issues.');
    
    suspectProviders.forEach(p => {
      console.log(`     • ${p.slug} → ${p.lunaLiveAlias || 'NULL'} (${p.issues.join(', ')})`);
    });
  }
  
  return {
    summary,
    problematic,
    emptyProviders,
    suspectProviders,
    recommendations: generateRecommendations(summary)
  };
}

function generateRecommendations(summary: GlobalAuditSummary) {
  const recommendations: string[] = [];
  
  const emptyProviders = summary.results.filter(r => r.status === 'EMPTY');
  const suspectProviders = summary.results.filter(r => r.status === 'ALIAS_SUSPECT' || r.status === 'SLUG_SUSPECT');
  
  if (emptyProviders.length > 0) {
    recommendations.push(`Remove or investigate ${emptyProviders.length} empty providers`);
  }
  
  if (suspectProviders.length > 0) {
    recommendations.push(`Fix ${suspectProviders.length} providers with suspect aliases`);
  }
  
  const totalGames = summary.totalGamesFound;
  if (totalGames < 1000) {
    recommendations.push('Low total game count - verify all major providers are working');
  }
  
  return recommendations;
}
