// api/src/calls/provider_diagnostic.ts
import { fetchProviderSlugs, fetchProviderGames, countExistingKeys } from "./updater.js";
import { normText, keyText } from "./normalize.js";
import { normalizeProvider } from "./provider_aliases.js";
import { upsertSlots } from "./catalog.js";
import type { Pool } from "pg";

type ProviderDiagnostic = {
  providerRequested: string;
  slugInList: boolean;
  slugFound: string | null;
  fetchOk: boolean;
  fetchError?: string;
  rawGamesCount: number;
  normalizedGamesCount: number;
  dedupedGamesCount: number;
  existingInDbCount: number;
  upsertedCount: number;
  normalizedProviderName: string | null;
  issues: string[];
};

export async function diagnoseProvider(
  pool: Pool,
  providerRequested: string
): Promise<ProviderDiagnostic> {
  console.log(`\n🔍 DIAGNOSTIC: ${providerRequested}`);
  console.log("=" .repeat(50));
  
  const diagnostic: ProviderDiagnostic = {
    providerRequested,
    slugInList: false,
    slugFound: null,
    fetchOk: false,
    rawGamesCount: 0,
    normalizedGamesCount: 0,
    dedupedGamesCount: 0,
    existingInDbCount: 0,
    upsertedCount: 0,
    normalizedProviderName: null,
    issues: [],
  };

  try {
    // 1. Vérifier si le provider est dans la liste des providers
    const allProviders = await fetchProviderSlugs();
    console.log(`📋 Total providers found: ${allProviders.length}`);
    
    // Chercher le slug exact (insensible à la casse)
    const exactMatch = allProviders.find((p: string) => p.toLowerCase() === providerRequested.toLowerCase());
    const partialMatches = allProviders.filter((p: string) => p.toLowerCase().includes(providerRequested.toLowerCase()));
    
    if (exactMatch) {
      diagnostic.slugInList = true;
      diagnostic.slugFound = exactMatch;
      console.log(`✅ Exact match found: "${exactMatch}"`);
    } else if (partialMatches.length > 0) {
      console.log(`⚠️  No exact match, but found similar: ${partialMatches.map((p: string) => `"${p}"`).join(', ')}`);
      diagnostic.issues.push(`No exact match for "${providerRequested}". Similar: ${partialMatches.join(', ')}`);
      diagnostic.slugFound = partialMatches[0]; // Prendre le premier pour test
    } else {
      console.log(`❌ No match found for "${providerRequested}"`);
      diagnostic.issues.push(`Provider "${providerRequested}" not found in providers list`);
      return diagnostic;
    }

    const slugToTest = diagnostic.slugFound!;

    // 2. Tenter de récupérer les jeux
    console.log(`🔄 Fetching games for slug: "${slugToTest}"`);
    try {
      const rawGames = await fetchProviderGames(slugToTest);
      diagnostic.fetchOk = true;
      diagnostic.rawGamesCount = rawGames.length;
      console.log(`✅ Fetch OK: ${rawGames.length} raw games`);
      
      if (rawGames.length === 0) {
        diagnostic.issues.push(`No games returned for slug "${slugToTest}"`);
        return diagnostic;
      }

      // 3. Normalisation des jeux
      const normalized = new Map<string, { name: string; provider: string; imageUrl: string | null }>();
      
      for (const game of rawGames) {
        const normalizedName = normText(game.name);
        if (!normalizedName) {
          console.warn(`⚠️  Skipping game with empty name: "${game.name}"`);
          continue;
        }
        
        const key = keyText(normalizedName);
        if (!key) {
          console.warn(`⚠️  Skipping game with invalid key: "${normalizedName}"`);
          continue;
        }
        
        normalized.set(key, {
          name: normalizedName,
          provider: game.provider || '',
          imageUrl: game.imageUrl || null
        });
      }
      
      diagnostic.normalizedGamesCount = normalized.size;
      diagnostic.dedupedGamesCount = normalized.size; // Pas de déduplication intra-provider ici
      console.log(`📊 Normalized: ${normalized.size} games`);
      
      // 4. Normalisation du provider
      diagnostic.normalizedProviderName = normalizeProvider(slugToTest);
      console.log(`🏷️  Provider normalization: "${slugToTest}" → "${diagnostic.normalizedProviderName}"`);
      
      // 5. Vérification DB existante
      const keys = Array.from(normalized.keys());
      diagnostic.existingInDbCount = await countExistingKeys(pool, keys);
      console.log(`💾 Existing in DB: ${diagnostic.existingInDbCount}/${keys.length}`);
      
      // 6. Upsert (dry run pour le diagnostic)
      console.log(`🔄 Would upsert ${keys.length - diagnostic.existingInDbCount} new games`);
      diagnostic.upsertedCount = keys.length - diagnostic.existingInDbCount;
      
      // 7. Échantillon de jeux pour vérification
      const sampleGames = Array.from(normalized.values()).slice(0, 5);
      console.log(`🎮 Sample games:`);
      sampleGames.forEach((game, i) => {
        console.log(`   ${i+1}. "${game.name}" (${game.provider})`);
      });
      
    } catch (fetchError: any) {
      diagnostic.fetchError = String(fetchError?.message || fetchError);
      diagnostic.issues.push(`Fetch failed: ${diagnostic.fetchError}`);
      console.log(`❌ Fetch failed: ${diagnostic.fetchError}`);
    }

  } catch (error: any) {
    diagnostic.issues.push(`Diagnostic failed: ${String(error?.message || error)}`);
    console.error(`💥 Diagnostic failed:`, error);
  }

  console.log(`📋 SUMMARY for ${providerRequested}:`);
  console.log(`   Slug in list: ${diagnostic.slugInList}`);
  console.log(`   Slug found: ${diagnostic.slugFound}`);
  console.log(`   Fetch OK: ${diagnostic.fetchOk}`);
  console.log(`   Raw games: ${diagnostic.rawGamesCount}`);
  console.log(`   Normalized: ${diagnostic.normalizedGamesCount}`);
  console.log(`   In DB: ${diagnostic.existingInDbCount}`);
  console.log(`   Would upsert: ${diagnostic.upsertedCount}`);
  console.log(`   Issues: ${diagnostic.issues.length}`);
  
  return diagnostic;
}

export async function diagnoseMultipleProviders(
  pool: Pool,
  providers: string[]
): Promise<ProviderDiagnostic[]> {
  const results: ProviderDiagnostic[] = [];
  
  for (const provider of providers) {
    const diagnostic = await diagnoseProvider(pool, provider);
    results.push(diagnostic);
  }
  
  return results;
}
