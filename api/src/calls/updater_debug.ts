// api/src/calls/updater_debug.ts
// Version instrumentée de fetchProviderGames pour debugging

import { fetchText, fetchJson } from "./updater.js";
import { sleep } from "./updater.js";

const GAMBA_BASE = "https://gamba.com";
const GAMBA_API = "https://gamba.com/_api/@";
const GAMBA_GAMESEARCH_SHA = "b717ba5742eb2ab2e75bc1f5ffdd9617d61a8c3ef7612cc6d0bf5c6c2ab26046";
const GAMBA_FIRST = 39;

type SlotRow = {
  name: string;
  provider: string;
  imageUrl: string | null;
};

type GameSearchResp = {
  data?: {
    gameSearch?: {
      data?: any[];
      paginatorInfo?: {
        total?: number;
        hasMorePages?: boolean;
        currentPage?: number;
      };
    };
  };
};

interface DebugInfo {
  provider: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  payload: {
    operationName: string;
    variables: any;
    extensions: any;
  };
  httpStatus: number;
  httpStatusText: string;
  responseTime: number;
  responseRaw: any;
  responseItems: number;
  hasMorePages: boolean;
}

function buildGambaUrl(producerSlug: string, first: number, page: number, sha: string) {
  const vars = {
    producerSlug,
    first,
    page,
    orderBy: [{ column: "ORDER_PRODUCER", order: "ASC" }],
  };
  const ext = { persistedQuery: { version: 1, sha256Hash: sha } };

  const varsEnc = encodeURIComponent(JSON.stringify(vars));
  const extEnc = encodeURIComponent(JSON.stringify(ext));

  return `${GAMBA_API}?operationName=gameSearch&variables=${varsEnc}&extensions=${extEnc}`;
}

export async function fetchProviderGamesDebug(producerSlug: string): Promise<{
  games: SlotRow[];
  debug: DebugInfo[];
}> {
  const referer = `${GAMBA_BASE}/casino/provider/${producerSlug}`;
  const out: SlotRow[] = [];
  const debugInfo: DebugInfo[] = [];

  let page = 1;
  let guard = 0;
  const maxPages = 2; // Limiter à 2 pages pour le debugging

  while (true) {
    guard++;
    if (guard > maxPages) break;

    const url = buildGambaUrl(producerSlug, GAMBA_FIRST, page, GAMBA_GAMESEARCH_SHA);
    
    // Construire le payload pour logging
    const vars = {
      producerSlug,
      first: GAMBA_FIRST,
      page,
      orderBy: [{ column: "ORDER_PRODUCER", order: "ASC" }],
    };
    const ext = { persistedQuery: { version: 1, sha256Hash: GAMBA_GAMESEARCH_SHA } };
    
    const payload = {
      operationName: "gameSearch",
      variables: vars,
      extensions: ext
    };

    console.log(`\n🔍 DEBUG ${producerSlug} - Page ${page}`);
    console.log(`📡 URL: ${url}`);
    console.log(`📋 Variables:`, JSON.stringify(vars, null, 2));
    console.log(`🔑 Extensions:`, JSON.stringify(ext, null, 2));

    const startTime = Date.now();
    
    try {
      // Simuler la requête avec les headers exacts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Content-Type": "application/json",
          Referer: referer,
        },
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      console.log(`📊 HTTP ${response.status} ${response.statusText} (${responseTime}ms)`);
      
      const responseText = await response.text();
      let responseJson: any = null;
      
      try {
        responseJson = JSON.parse(responseText);
      } catch (e) {
        console.log(`❌ Invalid JSON response: ${responseText.substring(0, 200)}`);
        break;
      }
      
      const gs = responseJson?.data?.gameSearch;
      const items = Array.isArray(gs?.data) ? gs!.data! : [];
      const pi = gs?.paginatorInfo;
      
      console.log(`📦 Response items: ${items.length}`);
      console.log(`📄 Paginator info:`, pi);
      
      if (items.length > 0) {
        console.log(`🎮 Sample items:`);
        items.slice(0, 3).forEach((item: any, i: number) => {
          console.log(`   ${i+1}. "${item.title || item.name}" (provider: ${item.provider})`);
        });
      }
      
      // Stocker les infos de debug
      debugInfo.push({
        provider: producerSlug,
        url,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
          Accept: "application/json, text/plain, */*",
          Referer: referer,
        },
        payload,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        responseTime,
        responseRaw: responseJson,
        responseItems: items.length,
        hasMorePages: pi?.hasMorePages || false
      });
      
      // Traiter les jeux normalement
      for (const it of items) {
        if (!it) continue;

        const name = String(it.title || it.name || "").trim();
        if (!name) continue;

        let img: string | null = null;
        if (typeof it.image === "string" && it.image.trim()) img = it.image.trim();
        else if (typeof it.cover === "string" && it.cover.trim()) img = it.cover.trim();
        else if (typeof it.thumbnail === "string" && it.thumbnail.trim()) img = it.thumbnail.trim();
        else if (typeof it.thumbnailUrl === "string" && it.thumbnailUrl.trim()) img = it.thumbnailUrl.trim();
        else if (typeof it.coverUrl === "string" && it.coverUrl.trim()) img = it.coverUrl.trim();
        else if (typeof it.imageUrl === "string" && it.imageUrl.trim()) img = it.imageUrl.trim();

        out.push({ name, provider: producerSlug, imageUrl: img });
      }
      
      if (!pi?.hasMorePages) {
        console.log(`🏁 No more pages`);
        break;
      }
      
      page++;
      await sleep(200);
      
    } catch (error: any) {
      console.log(`💥 Error: ${error.message || error}`);
      debugInfo.push({
        provider: producerSlug,
        url,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
          Accept: "application/json, text/plain, */*",
          Referer: referer,
        },
        payload,
        httpStatus: 0,
        httpStatusText: error.message || "Unknown error",
        responseTime: Date.now() - startTime,
        responseRaw: null,
        responseItems: 0,
        hasMorePages: false
      });
      break;
    }
  }

  return { games: out, debug: debugInfo };
}

export async function compareProvidersDebug(providers: string[]): Promise<{
  comparison: Array<{
    provider: string;
    totalGames: number;
    debug: DebugInfo[];
  }>;
}> {
  const results = [];
  
  for (const provider of providers) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 COMPARING PROVIDER: ${provider}`);
    console.log(`${'='.repeat(80)}`);
    
    const result = await fetchProviderGamesDebug(provider);
    results.push({
      provider,
      totalGames: result.games.length,
      debug: result.debug
    });
  }
  
  return { comparison: results };
}
