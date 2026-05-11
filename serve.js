#!/usr/bin/env node
// serve.js — zero-dependency static server for Render Web Service
// Sert directement depuis *.onrender.com (plus de redirect vers lunalive.win —
// les liens publics pointent maintenant sur lunalive.onrender.com).
// Serves web/dist with pre-rendered HTML rewrites + SPA fallback.
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = join(process.cwd(), "web/dist");
const PORT = parseInt(process.env.PORT || "10000", 10);

// ─── Pré-rendu d'un index.html "stripped" pour les routes /r/:slug ──────────
// But : quand un influenceur partage un lien /r/slug sur Snap/IG/WhatsApp,
// le crawler ne doit PAS afficher un aperçu avec le branding LunaLive (titre,
// description, image, schema.org). On sert un HTML avec OG vides + noindex
// pour que la plateforme n'ait rien à afficher en carte preview.
// L'app React fonctionne toujours normalement côté utilisateur.
let R_INDEX_HTML = null;
function buildStrippedIndex() {
  const indexPath = join(DIST, "index.html");
  if (!existsSync(indexPath)) return null;
  let html = readFileSync(indexPath, "utf8");

  // ── Regex robustes : les balises <meta> peuvent être multi-lignes avec attributs dans n'importe quel ordre ──

  // Supprime TOUTES les <meta> contenant og: / twitter: / description / robots (dans n'importe quel attribut)
  html = html.replace(
    /<meta\b[^>]*?(?:name|property)\s*=\s*"(?:og:[^"]*|twitter:[^"]*|description|robots)"[^>]*?\/?>/gis,
    ""
  );

  // Title neutre
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title> </title>");

  // Supprime le canonical (multi-ligne aussi)
  html = html.replace(/<link\b[^>]*?rel\s*=\s*"canonical"[^>]*?\/?>/gis, "");

  // Supprime le JSON-LD schema.org (WebSite + Organization)
  html = html.replace(/<script\b[^>]*type\s*=\s*"application\/ld\+json"[\s\S]*?<\/script>/gi, "");

  // Supprime le bloc <noscript> qui contient du branding LunaLive
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");

  // Injecte le noindex après <head> (seul meta de ce type à rester)
  html = html.replace(/<head>/i, '<head>\n    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">');

  return html;
}

const MIME = {
  ".html":        "text/html; charset=utf-8",
  ".js":          "application/javascript; charset=utf-8",
  ".css":         "text/css; charset=utf-8",
  ".json":        "application/json; charset=utf-8",
  ".xml":         "application/xml; charset=utf-8",
  ".txt":         "text/plain; charset=utf-8",
  ".svg":         "image/svg+xml",
  ".png":         "image/png",
  ".jpg":         "image/jpeg",
  ".jpeg":        "image/jpeg",
  ".gif":         "image/gif",
  ".webp":        "image/webp",
  ".ico":         "image/x-icon",
  ".woff":        "font/woff",
  ".woff2":       "font/woff2",
  ".ttf":         "font/ttf",
  ".map":         "application/json",
  ".webmanifest": "application/manifest+json",
};

// Mirrors web/public/_redirects (200 rewrites → pre-rendered HTML)
const HTML_REWRITES = {
  "/casinos/brutalcasino":          "casinos-brutalcasino.html",
  "/casinos/hypebet":               "casinos-hypebet.html",
  "/casinos/razed":                 "casinos-razed.html",
  "/casinos/trickz":                "casinos-trickz.html",
  "/casinos/bluvegaz":              "casinos-bluvegaz.html",
  "/s/bigbagutee":                  "s-bigbagutee.html",
  "/s/casinoboubou-outlook-com":    "s-casinoboubou-outlook-com.html",
  "/s/fabiozsis":                   "s-fabiozsis.html",
  "/s/familybearstv":               "s-familybearstv.html",
  "/s/gorilazer":                   "s-gorilazer.html",
  "/s/jojocasino":                  "s-jojocasino.html",
  "/s/lbkrisou":                    "s-lbkrisou.html",
  "/s/le-joker":                    "s-le-joker.html",
  "/s/lecasinoze":                  "s-lecasinoze.html",
  "/s/lhasardcasin":                "s-lhasardcasin.html",
  "/s/lunalive":                    "s-lunalive.html",
  "/s/quente-quente":               "s-quente-quente.html",
  "/s/redakb":                      "s-redakb.html",
  "/s/spykatra":                    "s-spykatra.html",
  "/s/ssztv":                       "s-ssztv.html",
  "/a-propos":                      "a-propos.html",
  "/mentions-legales":              "mentions-legales.html",
  "/politique-de-confidentialite":  "politique-de-confidentialite.html",
  "/cgu":                           "cgu.html",
  "/contact":                       "contact.html",
};

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options":           "SAMEORIGIN",
  "X-Content-Type-Options":    "nosniff",
  "Referrer-Policy":           "strict-origin-when-cross-origin",
  "Permissions-Policy":        "camera=(), microphone=(), geolocation=()",
};

function cacheControlForPath(pathname, ext) {
  // Fingerprinted assets (Vite hash) → 1 an immuable
  if (pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  // Landing templates affiliées (assets stables, gros consommateurs bandwidth)
  if (pathname.startsWith("/affi_templates/") && ext !== ".html") {
    return "public, max-age=31536000, immutable";
  }
  // Avatars (PNG/WebP stables)
  if (pathname.startsWith("/Avatar/")) {
    return "public, max-age=31536000, immutable";
  }
  // Images / fonts au niveau racine → 30 jours
  if ([".png", ".webp", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf"].includes(ext)) {
    return "public, max-age=2592000";
  }
  // HTML / JSON / XML → court (revalidation rapide pour les MAJ de contenu)
  return "public, max-age=300, must-revalidate";
}

function serveFile(res, filePath, extraHeaders = {}, pathname = "") {
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath).toLowerCase();
  const ct = MIME[ext] || "application/octet-stream";
  const cc = cacheControlForPath(pathname, ext);
  res.writeHead(200, {
    "Content-Type": ct,
    "Cache-Control": cc,
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  createReadStream(filePath).pipe(res);
  return true;
}

createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    pathname = "/";
  }

  // Remove trailing slash (except root)
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // 1b. Intercept /r/:slug → serve stripped index.html (no OG / no preview for crawlers)
  //     Les influenceurs TikTok/Snap/IG partagent ces liens et on veut empêcher
  //     que la plateforme affiche un gros preview branding LunaLive.
  if (pathname.startsWith("/r/") && pathname.length > 3) {
    if (!R_INDEX_HTML) R_INDEX_HTML = buildStrippedIndex();
    if (R_INDEX_HTML) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        ...SECURITY_HEADERS,
      });
      res.end(R_INDEX_HTML);
      return;
    }
  }

  // 2. Pre-rendered HTML rewrites
  const rewrite = HTML_REWRITES[pathname];
  if (rewrite && serveFile(res, join(DIST, rewrite), {}, pathname)) return;

  // 3. Exact file match
  if (serveFile(res, join(DIST, pathname), {}, pathname)) return;

  // 4. Try with .html extension (e.g. /casinos → casinos.html)
  if (serveFile(res, join(DIST, pathname + ".html"), {}, pathname)) return;

  // 5. SPA fallback
  serveFile(res, join(DIST, "index.html"), {}, pathname);

}).listen(PORT, () => {
  console.log(`lunalive serve: port ${PORT}, dist: ${DIST}`);
});
