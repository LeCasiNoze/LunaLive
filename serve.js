#!/usr/bin/env node
// serve.js — zero-dependency static server for Render Web Service
// Redirects *.onrender.com → https://lunalive.win (301)
// Serves web/dist with pre-rendered HTML rewrites + SPA fallback
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = join(process.cwd(), "web/dist");
const PORT = parseInt(process.env.PORT || "10000", 10);
const CANONICAL = "https://lunalive.win";

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

function serveFile(res, filePath, extraHeaders = {}) {
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath).toLowerCase();
  const ct = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": ct, ...SECURITY_HEADERS, ...extraHeaders });
  createReadStream(filePath).pipe(res);
  return true;
}

createServer((req, res) => {
  const host = (req.headers.host || "").split(":")[0].toLowerCase();

  // 1. Redirect any *.onrender.com access → canonical (301 permanent)
  if (host.endsWith(".onrender.com")) {
    res.writeHead(301, { "Location": CANONICAL + req.url });
    res.end();
    return;
  }

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

  // 2. Pre-rendered HTML rewrites
  const rewrite = HTML_REWRITES[pathname];
  if (rewrite && serveFile(res, join(DIST, rewrite))) return;

  // 3. Exact file match
  if (serveFile(res, join(DIST, pathname))) return;

  // 4. Try with .html extension (e.g. /casinos → casinos.html)
  if (serveFile(res, join(DIST, pathname + ".html"))) return;

  // 5. SPA fallback
  serveFile(res, join(DIST, "index.html"));

}).listen(PORT, () => {
  console.log(`lunalive serve: port ${PORT}, dist: ${DIST}`);
});
