#!/usr/bin/env node
/**
 * Test isolé d'envoi de message Rumble via cycletls.
 *
 * Usage: node scripts/test-rumble-send.js <videoIdNumeric> "<message>"
 * Ex:    node scripts/test-rumble-send.js 434812458 "Test cycletls"
 *
 * Lit la session bot depuis api/.env (cookies + UA) ou depuis env LUNA_BOT_COOKIE.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

function loadEnv() {
  for (const path of [resolve(root, ".env"), resolve(root, "api/.env")]) {
    try {
      const raw = readFileSync(path, "utf-8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 0) continue;
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    } catch {}
  }
}
loadEnv();

const [vid, ...msgParts] = process.argv.slice(2);
const message = (msgParts.join(" ") || "Test cycletls Rumble").slice(0, 200);

if (!vid) {
  console.error("Usage: node scripts/test-rumble-send.js <vidNumeric> \"<message>\"");
  process.exit(1);
}

// Charge la session bot depuis la DB (rumble_bot_session) — pas besoin de
// dupliquer le cookie en .env, on lit le même qui sert sur Render.
const apiDir = resolve(root, "api");
const pgUrl = pathToFileURL(resolve(apiDir, "node_modules/pg/lib/index.js")).href;
const { default: pg } = await import(pgUrl).catch(() => import("pg"));
const { Pool } = pg;
const dbPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sessionRow = await dbPool.query("SELECT cookie, user_agent FROM rumble_bot_session WHERE id=1").then(r => r.rows[0]).finally(() => dbPool.end());
const COOKIE = sessionRow?.cookie;
const UA = sessionRow?.user_agent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
if (!COOKIE) {
  console.error("Pas de cookie bot en DB — push-en un via POST /admin/rumble/bot");
  process.exit(1);
}

// Charge cycletls depuis api/node_modules
const cyclePath = pathToFileURL(resolve(root, "api/node_modules/cycletls/dist/index.js")).href;
const { default: initCycleTLS } = await import(cyclePath);

const CHROME_JA3 = "772,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0";

// request_id base64-like: 43 chars (comme le browser)
const reqId = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64").slice(0, 43);

const body = JSON.stringify({
  data: {
    request_id: reqId,
    message: { text: message },
    rant: null,
    channel_id: null,
  },
});

console.log("=== Test cycletls Rumble send ===");
console.log("vid:", vid);
console.log("message:", message);
console.log("body bytes:", body.length);
console.log("cookie length:", COOKIE.length);
console.log("UA:", UA);
console.log();

const cycle = await initCycleTLS();

const url = `https://web7.rumble.com/chat/api/chat/${vid}/message`;
console.log(">>> POST", url);

const headers = {
  "cookie": COOKIE,
  "content-type": "application/json",
  "accept": "*/*",
  "accept-language": "fr-FR,fr;q=0.9",
  "origin": "https://rumble.com",
  "referer": "https://rumble.com/",
  "sec-ch-ua": '"Chromium";v="124", "Not.A/Brand";v="24", "Google Chrome";v="124"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
};

try {
  const r = await cycle(url, {
    body,
    ja3: CHROME_JA3,
    userAgent: UA,
    headers,
  }, "post");
  console.log("status:", r?.status);
  console.log("body type:", typeof r?.body);
  console.log("body raw:", r?.body);
  if (typeof r?.body === "string") {
    try {
      console.log("parsed:", JSON.parse(r.body));
    } catch {}
  }
} catch (e) {
  console.error("error:", e?.message || e);
} finally {
  await cycle.exit();
}
