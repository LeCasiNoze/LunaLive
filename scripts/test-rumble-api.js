#!/usr/bin/env node
// scripts/test-rumble-api.js
// Test l'API Rumble et les pistes HLS
// Usage: node test-rumble-api.js <api_key> [username] [stream_key]

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dir, "../api/.env"), "utf-8");
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

loadEnv();

const [,, API_KEY, USERNAME, STREAM_KEY] = process.argv;

if (!API_KEY) {
  console.log(`Usage: node test-rumble-api.js <api_key> [username] [stream_key]

Pour récupérer api_key depuis la DB:
  node db-query.js "SELECT username, api_key, stream_key FROM rumble_accounts LIMIT 5"
`);
  process.exit(0);
}

async function testLiveApi(apiKey) {
  console.log("\n=== TEST 1: Rumble Live API ===");
  const url = `https://rumble.com/-livestream-api/get-data?key=${encodeURIComponent(apiKey)}`;
  console.log("URL:", url);
  try {
    const r = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "origin": "https://rumble.com",
        "referer": "https://rumble.com/",
      }
    });
    console.log("Status:", r.status);
    const json = await r.json();
    console.log("Full response:", JSON.stringify(json, null, 2));
    return json;
  } catch (e) {
    console.error("Error:", e.message);
    return null;
  }
}

async function testEmbedJs(videoId) {
  console.log(`\n=== TEST 2: EmbedJS pour videoId=${videoId} ===`);
  const url = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${videoId}&ad_wt=0`;
  console.log("URL:", url);
  try {
    const r = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "accept": "application/json, text/plain, */*",
        "referer": "https://rumble.com/",
        "origin": "https://rumble.com",
      }
    });
    console.log("Status:", r.status);
    const json = await r.json();
    console.log("Keys at root:", Object.keys(json));
    if (json.u) console.log("json.u keys:", Object.keys(json.u));
    if (json.u?.hls) console.log("json.u.hls:", json.u.hls);
    if (json.ua) console.log("json.ua keys:", Object.keys(json.ua));
    if (json.ua?.hls) console.log("json.ua.hls:", json.ua.hls);
    console.log("Full response:", JSON.stringify(json, null, 2));
    return json;
  } catch (e) {
    console.error("Error:", e.message);
    return null;
  }
}

async function testHlsFromStreamKey(streamKey) {
  console.log(`\n=== TEST 3: HLS URL depuis stream key ===`);
  // Patterns connus pour Rumble Live HLS
  const candidates = [
    `https://rumble-geo.prd.rumble.cloud/live/hls/${streamKey}/playlist.m3u8`,
    `https://cdn.rumble.cloud/live/hls/${streamKey}/playlist.m3u8`,
    `https://live.rumble.com/live/hls/${streamKey}/playlist.m3u8`,
    `https://stream.rumble.com/live/hls/${streamKey}/playlist.m3u8`,
  ];
  for (const url of candidates) {
    console.log(`Testing: ${url}`);
    try {
      const r = await fetch(url, {
        method: "HEAD",
        headers: {
          "user-agent": "Mozilla/5.0",
          "referer": "https://rumble.com/",
        }
      });
      console.log(`  → Status: ${r.status}, Content-Type: ${r.headers.get("content-type")}`);
    } catch (e) {
      console.log(`  → Error: ${e.message}`);
    }
  }
}

async function testChannelPage(username) {
  console.log(`\n=== TEST 4: Channel page scraping (${username}) ===`);
  const urls = [
    `https://rumble.com/user/${username}/live`,
    `https://rumble.com/c/${username}`,
  ];
  for (const url of urls) {
    console.log(`Testing: ${url}`);
    try {
      const r = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        }
      });
      console.log(`  → Status: ${r.status}, CF-Ray: ${r.headers.get("cf-ray") || "none"}`);
      if (r.ok) {
        const html = await r.text();
        const videoIdMatch = html.match(/["']video["']\s*:\s*["'](v[a-zA-Z0-9]+)["']/);
        const embedMatch = html.match(/rumble\.com\/embed\/(v[a-zA-Z0-9]+)/);
        console.log(`  → videoId from JSON: ${videoIdMatch?.[1] || "NOT FOUND"}`);
        console.log(`  → videoId from embed: ${embedMatch?.[1] || "NOT FOUND"}`);
      }
    } catch (e) {
      console.log(`  → Error: ${e.message}`);
    }
  }
}

async function main() {
  const liveData = await testLiveApi(API_KEY);

  // Chercher HLS ou videoId dans la réponse API
  if (liveData) {
    const jsonStr = JSON.stringify(liveData);
    const hlsMatch = jsonStr.match(/https?:\\\/\\\/[^"]+\.m3u8/) || jsonStr.match(/https?:\/\/[^"]+\.m3u8/);
    if (hlsMatch) console.log("\n🎯 HLS DIRECT dans l'API:", hlsMatch[0].replace(/\\\//g, '/'));

    // Extraire videoId depuis livestreams[].url ou livestreams[].id
    const livestreams = liveData?.livestreams || [];
    if (livestreams.length > 0) {
      console.log("\n🎯 LIVESTREAMS trouvés:", JSON.stringify(livestreams, null, 2));
      const stream = livestreams[0];
      // Chercher videoId dans url/watch_url
      const watchUrl = stream?.url || stream?.watch_url || stream?.video_url || stream?.link || "";
      const vidMatch = watchUrl.match(/\/(v[a-zA-Z0-9]+)/);
      if (vidMatch) {
        console.log(`\n🎯 VideoId extrait de l'API URL: ${vidMatch[1]}`);
        await testEmbedJs(vidMatch[1]);
      }
      // Chercher videoId direct
      const directId = stream?.id || stream?.video_id || stream?.vid;
      if (directId) {
        console.log(`\n🎯 VideoId direct dans l'API: ${directId}`);
        await testEmbedJs(String(directId));
      }
    } else {
      console.log("\n⚠️  livestreams: [] → pas en live actuellement");
    }
  }

  console.log("\n--- Test scraping page live ---");
  if (USERNAME) await testChannelPage(USERNAME);

  if (STREAM_KEY) await testHlsFromStreamKey(STREAM_KEY);
}

main().catch(console.error);
