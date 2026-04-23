#!/usr/bin/env node
// build-r-preview.mjs
// Génère web/dist/r-preview.html : une copie de index.html avec les OG/Twitter/JSON-LD
// strippés pour être servi via `_redirects` sur les URLs /r/:slug.
//
// But : quand un influenceur partage un lien /r/slug sur Snap/IG/WhatsApp/Discord,
// le crawler OG ne doit PAS récupérer le branding LunaLive (titre, desc, image, schema).
// La page reste fonctionnelle pour les users (le React SPA charge normalement) mais
// aucune plateforme ne peut construire une carte preview "LunaLive — streaming casino".

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist');
const SRC = path.join(DIST, 'index.html');
const OUT = path.join(DIST, 'r-preview.html');

if (!fs.existsSync(SRC)) {
  console.error('[build-r-preview] dist/index.html introuvable — build Vite d\'abord.');
  process.exit(1);
}

let html = fs.readFileSync(SRC, 'utf8');

// Regex robustes : les balises <meta> peuvent être multi-lignes avec attributs dans n'importe quel ordre.

// 1. Supprime TOUTES les <meta> og:* / twitter:* / name=description / name=robots
html = html.replace(
  /<meta\b[^>]*?(?:name|property)\s*=\s*"(?:og:[^"]*|twitter:[^"]*|description|robots)"[^>]*?\/?>/gis,
  ''
);

// 2. Title neutre (espace vide → les plateformes ne peuvent pas construire un titre)
html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title> </title>');

// 3. Supprime le <link rel="canonical">
html = html.replace(/<link\b[^>]*?rel\s*=\s*"canonical"[^>]*?\/?>/gis, '');

// 4. Supprime le <script type="application/ld+json"> (schema.org WebSite + Organization)
html = html.replace(/<script\b[^>]*type\s*=\s*"application\/ld\+json"[\s\S]*?<\/script>/gi, '');

// 5. Supprime le bloc <noscript> (contient du texte branding LunaLive visible par les bots)
html = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');

// 6. Réinjecte un seul <meta name="robots"> au début du <head> pour signaler noindex
html = html.replace(
  /<head>/i,
  '<head>\n    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">'
);

fs.writeFileSync(OUT, html, 'utf8');
console.log(`[build-r-preview] ✅ ${path.relative(process.cwd(), OUT)} généré (${(html.length / 1024).toFixed(1)} KB)`);

// Sanity check
const remaining = {
  og: (html.match(/og:/g) || []).length,
  twitter: (html.match(/twitter:/g) || []).length,
  canonical: (html.match(/canonical/gi) || []).length,
  jsonld: (html.match(/application\/ld\+json/g) || []).length,
  lunalive: (html.match(/LunaLive/g) || []).length,
};
if (Object.values(remaining).some(v => v > 0)) {
  console.warn('[build-r-preview] ⚠️  Quelques occurrences résiduelles :', remaining);
} else {
  console.log('[build-r-preview] ✅ Zéro branding LunaLive / OG / Twitter / JSON-LD / canonical');
}
