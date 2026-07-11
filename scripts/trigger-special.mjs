// scripts/trigger-special.mjs
// Déclenche un message spécial dans le chat live via /internal/bot/chat/special.
// Usage:
//   node scripts/trigger-special.mjs <type> [jsonData] [--slug lecasinoze] [--api https://...]
// Exemples:
//   node scripts/trigger-special.mjs raid '{"from":"NightRider","viewers":142}'
//   node scripts/trigger-special.mjs follow '{"who":"LunaFan_92"}'
//   node scripts/trigger-special.mjs rain '{"pot":1200}'
//
// La clé bot est lue depuis api/.env (BOT_INTERNAL_KEY).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readEnv(file, key) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return "";
}

const args = process.argv.slice(2);
const type = args[0];
if (!type) {
  console.error("Usage: node scripts/trigger-special.mjs <type> [jsonData] [--slug x] [--api url]");
  process.exit(1);
}

// parse flags
let slug = "lecasinoze";
let api = process.env.SPECIAL_API_BASE || "https://lunalive-api.onrender.com";
let dataRaw = "{}";
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--slug") slug = args[++i];
  else if (args[i] === "--api") api = args[++i];
  else if (!args[i].startsWith("--")) dataRaw = args[i];
}

let data = {};
try { data = JSON.parse(dataRaw); } catch { console.error("jsonData invalide:", dataRaw); process.exit(1); }

const key = readEnv(path.join(ROOT, "api", ".env"), "BOT_INTERNAL_KEY");
if (!key) { console.error("BOT_INTERNAL_KEY introuvable dans api/.env"); process.exit(1); }

const url = `${api.replace(/\/$/, "")}/internal/bot/chat/special`;
const body = JSON.stringify({ slug, type, data });

const r = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-bot-key": key },
  body,
});
const txt = await r.text();
console.log(`[${r.status}] ${type} → ${slug}`);
console.log(txt);
if (!r.ok) process.exit(1);
