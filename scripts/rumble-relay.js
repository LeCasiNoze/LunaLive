#!/usr/bin/env node
/**
 * scripts/rumble-relay.js
 *
 * Relay local pour les streamers Rumble en mode "pseudo-only" (sans api_key).
 *
 * Cloudflare bloque l'accès aux pages /c/{user} et /user/{user} depuis Render
 * (datacenter IPs). Ce script tourne sur ta machine perso (IP résidentielle
 * que CF laisse passer normalement) et fait le pont :
 *   1. interroge Render pour la liste des streamers à surveiller
 *   2. scrape rumble.com/c/{user} ou /user/{user} pour trouver leur live courant
 *   3. POST le videoId vers Render → le poller embedJS prend le relais
 *
 * Usage :
 *   node scripts/rumble-relay.js
 *
 * Env attendu (dans api/.env ou .env à la racine) :
 *   ADMIN_KEY=lunalive_super_secret_2025_xxx
 *   API_BASE=https://lunalive-api.onrender.com  (optionnel, défaut)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
    } catch { /* file missing */ }
  }
}

loadEnv();

const API_BASE = (process.env.API_BASE || "https://lunalive-api.onrender.com").replace(/\/$/, "");
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.LUNALIVE_ADMIN_KEY;
const POLL_INTERVAL_MS = Number(process.env.RUMBLE_RELAY_INTERVAL_MS || 60_000);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

if (!ADMIN_KEY) {
  console.error("[relay] ADMIN_KEY manquant — défini-le dans .env ou api/.env");
  process.exit(1);
}

console.log(`[relay] starting — API_BASE=${API_BASE} interval=${POLL_INTERVAL_MS}ms`);

/** Récupère la liste des streamers à surveiller depuis Render. */
async function fetchStreamersList() {
  const r = await fetch(`${API_BASE}/admin/rumble/list-pseudo-only`, {
    headers: { "x-admin-key": ADMIN_KEY },
  });
  if (!r.ok) throw new Error(`list http=${r.status}`);
  const j = await r.json();
  return j.streamers || [];
}

/** Scrape la page Rumble d'un user et retourne les video-id détectés (triés du + récent au + ancien). */
async function scrapeRumblePage(username) {
  const headers = {
    "user-agent": UA,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "fr-FR,fr;q=0.9",
  };

  for (const path of [`/c/${encodeURIComponent(username)}`, `/user/${encodeURIComponent(username)}`]) {
    try {
      const r = await fetch(`https://rumble.com${path}`, { headers });
      if (!r.ok) {
        console.log(`[relay]   ${username}: ${path} → http=${r.status}`);
        continue;
      }
      const html = await r.text();
      const ids = [...html.matchAll(/data-video-id="(\d+)"/g)].map(m => m[1]);
      if (ids.length === 0) continue;
      const unique = [...new Set(ids)].sort((a, b) => Number(b) - Number(a));
      console.log(`[relay]   ${username}: ${path} OK ${unique.length} candidats top=${unique[0]}`);
      return unique;
    } catch (e) {
      console.log(`[relay]   ${username}: ${path} error`, e?.message || e);
    }
  }
  return [];
}

/**
 * Pour un videoId numérique, appelle embedJS pour récupérer le slug court
 * (vXXXXX) et savoir s'il est en live.
 * Retourne { vSlug, isLive } ou null si embedJS ne reconnait pas l'ID.
 *
 * NB: embedJS fonctionne avec le slug court, pas l'ID numérique. On fait donc
 * une requête supplémentaire à la page video (rapide, 1 appel HTML) pour
 * récupérer le slug. Mais comme la page list/c/ contient déjà des liens
 * /vXXXX-titre.html, on peut aussi extraire les slugs en parallèle des ids.
 */
async function findLiveSlug(username, html) {
  const slugs = [...html.matchAll(/href="(\/v[a-z0-9]{5,})-[^"]+\.html"/g)].map(m => m[1].slice(1));
  // On essaie chaque slug avec embedJS, premier qui retourne live=1 gagne
  for (const slug of slugs) {
    try {
      const url = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${slug}&ad_wt=0`;
      const r = await fetch(url, {
        headers: {
          "user-agent": UA,
          accept: "application/json",
          referer: "https://rumble.com/",
          origin: "https://rumble.com",
        },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const isLive = d?.live === 1 || d?.live === true || d?.livestream_has_dvr === 1;
      if (isLive) {
        console.log(`[relay]   ${username}: LIVE — slug=${slug} vid=${d?.vid}`);
        return { vSlug: slug, isLive: true };
      }
    } catch { /* try next slug */ }
  }
  return null;
}

/** Push le videoId au backend. */
async function pushLiveVideo(slug, vSlug) {
  const r = await fetch(`${API_BASE}/admin/rumble/set-live`, {
    method: "POST",
    headers: {
      "x-admin-key": ADMIN_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({ slug, videoId: vSlug }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    console.warn(`[relay]   push failed http=${r.status}`, j?.error || "");
    return false;
  }
  return true;
}

async function tick() {
  let streamers = [];
  try {
    streamers = await fetchStreamersList();
  } catch (e) {
    console.warn("[relay] fetchStreamersList failed", e?.message || e);
    return;
  }

  if (streamers.length === 0) {
    console.log("[relay] aucun streamer pseudo-only à scrap");
    return;
  }

  console.log(`[relay] tick — ${streamers.length} streamer(s) à scrap`);

  for (const s of streamers) {
    const username = s.username;
    if (!username) continue;
    console.log(`[relay] ${s.slug} (${username})`);

    // Récupère la page (qu'on pourrait factoriser, mais on la refait pour findLiveSlug)
    const headers = {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "fr-FR,fr;q=0.9",
    };
    let html = null;
    for (const path of [`/c/${encodeURIComponent(username)}`, `/user/${encodeURIComponent(username)}`]) {
      try {
        const r = await fetch(`https://rumble.com${path}`, { headers });
        if (r.ok) { html = await r.text(); break; }
        console.log(`[relay]   ${username}: ${path} → http=${r.status}`);
      } catch { /* continue */ }
    }
    if (!html) {
      console.log(`[relay]   ${username}: scrape failed`);
      continue;
    }

    const live = await findLiveSlug(username, html);
    if (!live) {
      console.log(`[relay]   ${username}: pas en live`);
      continue;
    }

    const ok = await pushLiveVideo(s.slug, live.vSlug);
    if (ok) console.log(`[relay]   ${username}: pushed ${live.vSlug} ✓`);
  }
}

// Premier tick immédiat puis intervalle régulier
void tick();
setInterval(() => void tick(), POLL_INTERVAL_MS);
