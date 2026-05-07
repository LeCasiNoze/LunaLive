#!/usr/bin/env node
// scripts/yt-oauth.cjs
// One-shot OAuth flow pour obtenir un YT_REFRESH_TOKEN.
//
// Usage :
//   1) node scripts/yt-oauth.cjs            -> imprime l'URL a envoyer au proprio
//                                               de la chaine YouTube
//   2) (proprio clique, signe in, autorise, est redirige vers
//       http://localhost/?code=XXX&scope=... — page "ne charge pas" =
//       NORMAL, il copie l'URL complete depuis la barre d'adresse)
//   3) node scripts/yt-oauth.cjs "<URL_OU_CODE>"  -> echange code -> refresh_token
//
// Lit YT_CLIENT_ID + YT_CLIENT_SECRET depuis api/.env

const fs = require("fs");
const path = require("path");
const https = require("https");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "api", ".env");
  if (!fs.existsSync(envPath)) {
    console.error("Manque api/.env");
    process.exit(1);
  }
  const txt = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = loadEnv();
const clientId = env.YT_CLIENT_ID;
const clientSecret = env.YT_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("YT_CLIENT_ID / YT_CLIENT_SECRET manquants dans api/.env");
  process.exit(1);
}

const REDIRECT = "http://localhost";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

function buildAuthUrl() {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", REDIRECT);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

function extractCode(input) {
  if (!input) return null;
  if (input.startsWith("http")) {
    try {
      const u = new URL(input);
      return u.searchParams.get("code");
    } catch {
      return null;
    }
  }
  return input.trim();
}

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }).toString();
    const req = https.request(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, json: { raw: data } });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    const url = buildAuthUrl();
    console.log("\n=== ETAPE 1 — envoie ce lien au proprietaire de la chaine @fabiozsis ===\n");
    console.log(url);
    console.log("\nApres autorisation, il sera redirige vers http://localhost/?code=...");
    console.log("La page affichera 'site inaccessible' — c'est NORMAL.");
    console.log("Demande-lui de COPIER L'URL ENTIERE depuis la barre d'adresse et de te l'envoyer.\n");
    console.log("Puis relance: node scripts/yt-oauth.cjs \"<URL_COLLEE>\"\n");
    return;
  }
  const code = extractCode(arg);
  if (!code) {
    console.error("Pas de 'code' trouve dans l'argument. Colle l'URL complete entre guillemets.");
    process.exit(1);
  }
  console.log(`Echange du code (longueur=${code.length})...`);
  const r = await exchangeCode(code);
  if (r.status !== 200 || !r.json.refresh_token) {
    console.error(`\nEchec ${r.status}:`, r.json);
    process.exit(1);
  }
  console.log("\n=== SUCCES ===");
  console.log("\nAjoute cette ligne a api/.env ET aux env vars Render :\n");
  console.log(`YT_REFRESH_TOKEN=${r.json.refresh_token}\n`);
  console.log("(access_token expire dans " + r.json.expires_in + "s, sera rafraichi auto par le code.)\n");
})();
