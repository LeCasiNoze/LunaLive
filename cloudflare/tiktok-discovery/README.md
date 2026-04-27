# lunalive-tiktok-discovery

Cloudflare Worker (Browser Rendering) qui rend les pages TikTok en headless
Chromium, attend que la SPA charge, puis extrait les `uniqueId` des créateurs.

## Setup

```bash
cd cloudflare/tiktok-discovery
npm install

# 1) Activer Browser Rendering sur le compte CF (Workers & Pages > Browser
#    Rendering > Enable). Plan Workers Paid requis (~$5/mois) en prod.
# 2) Créer le secret partagé avec l'API LunaLive
wrangler secret put DISCOVERY_TOKEN
# (entrer une valeur aléatoire — la même que TIKTOK_DISCOVERY_WORKER_TOKEN
#  côté API Render)

# 3) Déployer
npm run deploy
# -> https://lunalive-tiktok-discovery.<account>.workers.dev
```

## Configuration côté API LunaLive

Dans Render (env vars du service `lunalive-api`) :

```
TIKTOK_DISCOVERY_WORKER_URL=https://lunalive-tiktok-discovery.<account>.workers.dev
TIKTOK_DISCOVERY_WORKER_TOKEN=<même valeur que DISCOVERY_TOKEN>
```

## Endpoints

- `POST /hashtag { hashtag, limit? }` → `{ authors, diag }`
- `POST /search  { query, limit? }`   → `{ authors, diag }`
- `POST /profile { handle }`          → `{ profile, diag }`

Tous protégés par header `x-tiktok-discovery-token`.

## Coût

- Browser Rendering: facturé à l'invocation. ~3-5s par run hashtag/search.
- Workers Paid plan: $5/mois inclut 10K minutes Browser Rendering.
- Pour ~30 runs/jour de découverte (~10s chacun) : ~5h/mois de browser → OK.
