// api/src/trovo_proxy.ts
// Proxy pour contourner les 403 des streams Trovo

import express, { Request, Response } from "express";
import { createProxyMiddleware, Options } from "http-proxy-middleware";

const router = express.Router();

// Cache simple pour éviter de multiples requêtes au même stream
const streamCache = new Map<string, {
  url: string;
  timestamp: number;
  ttl: number; // 5 minutes TTL
}>();

// Headers pour imiter un navigateur légitime
const TROVO_HEADERS = {
  'Referer': 'https://trovo.live/',
  'Origin': 'https://trovo.live',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site'
};

// Nettoyer le cache expiré
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of streamCache.entries()) {
    if (now - value.timestamp > value.ttl) {
      streamCache.delete(key);
    }
  }
}

// Vérifier si une URL est dans le cache
function getCachedUrl(originalUrl: string): string | null {
  cleanExpiredCache();
  const cached = streamCache.get(originalUrl);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.url;
  }
  return null;
}

// Ajouter une URL au cache
function cacheUrl(originalUrl: string, proxiedUrl: string) {
  streamCache.set(originalUrl, {
    url: proxiedUrl,
    timestamp: Date.now(),
    ttl: 5 * 60 * 1000 // 5 minutes
  });
}

// Endpoint proxy pour les streams FLV
router.get('/trovo/flv/:encodedUrl', async (req: Request, res: Response) => {
  try {
    const encodedUrl = req.params.encodedUrl;
    const originalUrl = decodeURIComponent(encodedUrl);
    
    console.log(`[trovo-proxy] FLV request: ${originalUrl.substring(0, 100)}...`);

    // Vérifier le cache
    const cached = getCachedUrl(originalUrl);
    if (cached) {
      console.log(`[trovo-proxy] Cache HIT for FLV`);
      return res.json({ proxiedUrl: cached });
    }

    // Mettre en cache l'URL proxifiée
    const proxiedUrl = `/api/trovo/flv/${encodedUrl}`;
    cacheUrl(originalUrl, proxiedUrl);

    res.json({ 
      proxiedUrl,
      originalUrl,
      type: 'flv'
    });

  } catch (error) {
    console.error('[trovo-proxy] FLV error:', error);
    res.status(500).json({ 
      error: 'FLV proxy failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Endpoint proxy pour les streams HLS
router.get('/trovo/hls/:encodedUrl', async (req: Request, res: Response) => {
  try {
    const encodedUrl = req.params.encodedUrl;
    const originalUrl = decodeURIComponent(encodedUrl);
    
    console.log(`[trovo-proxy] HLS request: ${originalUrl.substring(0, 100)}...`);

    // Vérifier le cache
    const cached = getCachedUrl(originalUrl);
    if (cached) {
      console.log(`[trovo-proxy] Cache HIT for HLS`);
      return res.json({ proxiedUrl: cached });
    }

    // Pour HLS, on retourne l'URL proxifiée qui sera utilisée par HLS.js
    const proxiedUrl = `/api/trovo/hls/${encodedUrl}`;
    cacheUrl(originalUrl, proxiedUrl);

    res.json({ 
      proxiedUrl,
      originalUrl,
      type: 'hls'
    });

  } catch (error) {
    console.error('[trovo-proxy] HLS error:', error);
    res.status(500).json({ 
      error: 'HLS proxy failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Options pour le middleware proxy
const proxyOptions: Options = {
  changeOrigin: true,
  headers: TROVO_HEADERS,
  onProxyReq: (proxyReq: any, req: Request, res: Response) => {
    const originalUrl = decodeURIComponent(req.params.encodedUrl);
    console.log(`[trovo-proxy] Proxy request to: ${originalUrl}`);
  },
  onProxyRes: (proxyRes: any, req: Request, res: Response) => {
    if (proxyRes.statusCode === 403) {
      console.warn(`[trovo-proxy] Still getting 403 for proxied request`);
    }
  },
  onError: (err: Error, req: Request, res: Response) => {
    console.error(`[trovo-proxy] Proxy error:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy error', details: err.message });
    }
  }
};

// Middleware proxy pour les requêtes HLS réelles
router.use('/trovo/hls/:encodedUrl', createProxyMiddleware({
  ...proxyOptions,
  pathRewrite: (path: string, req: Request) => {
    const encodedUrl = req.params.encodedUrl;
    const originalUrl = decodeURIComponent(encodedUrl);
    return originalUrl;
  }
}));

// Middleware proxy pour les requêtes FLV réelles  
router.use('/trovo/flv/:encodedUrl', createProxyMiddleware({
  ...proxyOptions,
  pathRewrite: (path: string, req: Request) => {
    const encodedUrl = req.params.encodedUrl;
    const originalUrl = decodeURIComponent(encodedUrl);
    return originalUrl;
  }
}));

// Endpoint de santé du proxy
router.get('/trovo/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    cacheSize: streamCache.size,
    timestamp: new Date().toISOString()
  });
});

// Nettoyer le cache toutes les minutes
setInterval(cleanExpiredCache, 60 * 1000);

export function registerTrovoProxy(app: express.Application) {
  app.use('/api', router);
  console.log('[trovo-proxy] Trovo proxy routes registered');
}
