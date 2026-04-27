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
  // Capture les slugs Rumble dans leurs différents formats:
  //   - /v76pubk-titre.html (VODs avec titre)
  //   - /v76pubk.html       (sans titre)
  //   - /v76pubk            (bare, parfois en data-attr ou JSON)
  // + canonical og:url + open graph
  // Vrais slugs Rumble = exactement "v" + 6 chars alphanumériques.
  // On force ce format strict pour éviter de capturer des hash/ids parasites.
  const set = new Set();
  for (const re of [
    /href="\/(v[a-z0-9]{6})[-./?#"]/g,
    /href="\/(v[a-z0-9]{6})\.html"/g,
    /og:url[^>]*content="https?:\/\/rumble\.com\/(v[a-z0-9]{6})[-./?#"]/g,
    /"video_url":"https?:\\?\/\\?\/rumble\.com\\?\/(v[a-z0-9]{6})/g,
    /data-permlink="\/?(v[a-z0-9]{6})"/g,
    /https?:\/\/rumble\.com\/(v[a-z0-9]{6})[-./?#"]/g,
  ]) {
    for (const m of html.matchAll(re)) {
      const slug = String(m[1]).toLowerCase();
      if (/^v[a-z0-9]{6}$/.test(slug)) set.add(slug);
    }
  }
  const slugs = [...set];
  console.log(`[relay]   ${username}: ${slugs.length} slug(s) candidats: ${slugs.slice(0,8).join(",")}${slugs.length>8?"…":""}`);

  // On essaie chaque slug avec embedJS, premier qui retourne live=1 gagne.
  // Si aucun ne match en live, on push le 1er candidat (le plus récent) en
  // mode "best guess" — Render fera la validation finale via embedJS de son
  // côté et marquera offline si vraiment pas live. Ça évite de rater un live
  // dont notre check est trop strict.
  let probedCount = 0;
  let bestGuess = null;
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
      const isLive = !!d?.live || !!d?.livestream_has_dvr;
      const dur = Number(d?.duration || 0);
      // Heuristique best-guess: durée nulle/très faible = potentiellement un live
      // (les VODs ont une durée connue, les lives en cours souvent 0)
      if (!bestGuess && dur === 0) {
        bestGuess = { vSlug: slug, vid: d?.vid, title: d?.title };
      }
      if (probedCount < 5) {
        console.log(`[relay]     probe ${slug} → live=${d?.live} dvr=${d?.livestream_has_dvr} dur=${dur} title="${(d?.title||"").slice(0,40)}"`);
      }
      probedCount++;
      if (isLive) {
        console.log(`[relay]   ${username}: LIVE confirmed — slug=${slug} vid=${d?.vid}`);
        return { vSlug: slug, isLive: true };
      }
    } catch { /* try next slug */ }
    if (probedCount >= 8) break;
  }
  // Fallback: si on a un best-guess (durée=0 = probable live), on le push.
  // Render validera vraiment.
  if (bestGuess) {
    console.log(`[relay]   ${username}: best-guess (dur=0) — slug=${bestGuess.vSlug} vid=${bestGuess.vid}`);
    return { vSlug: bestGuess.vSlug, isLive: true };
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

/**
 * Fetch /user/{name}/live et extrait le slug du live courant depuis le player
 * init JS (`Rumble("play", {..., "video":"vXXXXXX", ...})`). C'est l'unique
 * source fiable : la page redirige/render directement le live actuel, et
 * Rumble injecte le slug dans le JS d'initialisation du player.
 */
async function findCurrentLiveSlug(username) {
  const headers = {
    "user-agent": UA,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "fr-FR,fr;q=0.9",
  };
  let html = null;
  try {
    const r = await fetch(`https://rumble.com/user/${encodeURIComponent(username)}/live`, { headers });
    if (!r.ok) {
      console.log(`[relay]   ${username}: /user/${username}/live → http=${r.status}`);
      return null;
    }
    html = await r.text();
  } catch (e) {
    console.log(`[relay]   ${username}: fetch error`, e?.message || e);
    return null;
  }

  // Extrait `"video":"vXXXXXX"` depuis le Rumble("play", {...}) init
  const m = html.match(/"video":\s*"(v[a-z0-9]{6})"/);
  if (m && m[1]) {
    // Bonus: aussi le video_id numérique pour le chat
    const numMatch = html.match(/video_id:\s*(\d+)/) || html.match(/"video_id":\s*(\d+)/);
    const vidNumeric = numMatch ? numMatch[1] : null;
    return { vSlug: m[1], vidNumeric };
  }
  return null;
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

    const live = await findCurrentLiveSlug(username);
    if (!live) {
      console.log(`[relay]   ${username}: pas de live actif`);
      continue;
    }

    console.log(`[relay]   ${username}: LIVE — slug=${live.vSlug} vid=${live.vidNumeric || "?"}`);
    const ok = await pushLiveVideo(s.slug, live.vSlug);
    if (ok) console.log(`[relay]   ${username}: pushed ${live.vSlug} ✓`);
  }
}

// Premier tick immédiat puis intervalle régulier
void tick();
setInterval(() => void tick(), POLL_INTERVAL_MS);
