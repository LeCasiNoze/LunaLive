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
    } catch { /* file missing */ }
  }
}

loadEnv();

const API_BASE = (process.env.API_BASE || "https://lunalive-api.onrender.com").replace(/\/$/, "");
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.LUNALIVE_ADMIN_KEY;
const POLL_INTERVAL_MS = Number(process.env.RUMBLE_RELAY_INTERVAL_MS || 60_000);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const RADIO_STREAMER_ID = 32;

const pgUrl = pathToFileURL(resolve(root, "api/node_modules/pg/lib/index.js")).href;
const { default: pg } = await import(pgUrl).catch(async () => import("pg"));
const dbPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      idleTimeoutMillis: 30_000,
      max: 3,
    })
  : null;
// Handler error obligatoire — Render PG drop les connexions idle après ~5 min,
// ce qui émet un 'error' event sur le pool. Sans handler, Node crash.
if (dbPool) {
  dbPool.on("error", (err) => {
    console.warn(`[relay-db] idle client error (auto-reconnect au prochain query): ${err?.message || err}`);
  });
}

if (!ADMIN_KEY) {
  console.error("[relay] ADMIN_KEY manquant — défini-le dans .env ou api/.env");
  process.exit(1);
}

// Handlers globaux : fetch() Node 24 throw 'TypeError: fetch failed' avec
// cause SocketError sur connexion réseau coupée → process.exit sans handler.
// On log et on continue (le prochain tick retentera).
process.on("uncaughtException", (err) => {
  console.warn(`[relay] uncaughtException (continue): ${err?.message || err}`);
  if (err?.stack) console.warn(err.stack.split("\n").slice(0, 4).join("\n"));
});
process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || (typeof reason === "object" ? JSON.stringify(reason).slice(0, 200) : String(reason));
  console.warn(`[relay] unhandledRejection (continue): ${msg}`);
});

console.log(`[relay] starting — API_BASE=${API_BASE} interval=${POLL_INTERVAL_MS}ms`);

/** Récupère la liste des streamers à surveiller depuis Render.
 *  endpoint: 'pseudo-only' (slug discovery) ou 'all' (followers+VODs). */
async function fetchStreamersList(endpoint = "list-pseudo-only") {
  const r = await fetch(`${API_BASE}/admin/rumble/${endpoint}`, {
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
      // `livestream_has_dvr` n'est PAS un indicateur d'etat (flag config).
      // Seul `live` truthy = stream actif.
      const hlsPeek = d?.u?.hls?.url || d?.ua?.hls?.auto?.url || "";
      const isVod = typeof hlsPeek === "string" && hlsPeek.includes("/hls-vod/");
      const isLive = !!d?.live && !isVod;
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

/**
 * Scrape /user/{name} pour extraire les cartes VOD publiques (videostream).
 * Pattern HTML Rumble (confirmé) :
 *   <div class="videostream thumbnail__grid--item" role="listitem" data-video-id="N">
 *     <a class="videostream__link" href="/vXXXXX-titre.html">
 *       <img class="thumbnail__image" src="..." />
 *       <h3 class="thumbnail__title">Titre</h3>
 *     </a>
 *     <span class="videostream__time">...</span>
 *     <span class="videostream__data--item videostream__time">21:15:02</span>
 *   </div>
 * Retourne un array d'items { videoId, videoIdNumeric, title, thumbnailUrl, durationSec }.
 */
async function fetchVodCards(username) {
  let html = "";
  try {
    const r = await fetch(`https://rumble.com/user/${encodeURIComponent(username)}`, {
      headers: {
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "fr-FR,fr;q=0.9",
      },
    });
    if (!r.ok) return [];
    html = await r.text();
  } catch { return []; }

  const items = [];
  // Découpe le HTML par carte videostream (heuristique: chaque carte contient data-video-id)
  const cardRe = /<div[^>]*class="[^"]*videostream[^"]*"[^>]*data-video-id="(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*videostream[^"]*"[^>]*data-video-id="|<\/main|<footer)/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const vidNumeric = m[1];
    const block = m[2];

    const hrefM = block.match(/href="\/(v[a-z0-9]{5,})-([^"]+)\.html"/i);
    if (!hrefM) continue;
    const vSlug = hrefM[1].toLowerCase();

    const titleM = block.match(/class="[^"]*thumbnail__title[^"]*"[^>]*>([^<]+)</i);
    const title = titleM ? titleM[1].trim().slice(0, 300) : null;

    const thumbM = block.match(/class="[^"]*thumbnail__image[^"]*"[^>]*src="([^"]+)"/i)
                || block.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*thumbnail__image/i);
    const thumbnailUrl = thumbM ? thumbM[1] : null;

    // Durée : format HH:MM:SS ou MM:SS dans un .videostream__time
    const durM = block.match(/class="[^"]*videostream__time[^"]*"[^>]*>\s*(\d+:\d+:\d+|\d+:\d+)\s*</i);
    let durationSec = null;
    if (durM) {
      const parts = durM[1].split(":").map(Number);
      if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
    }

    items.push({ videoId: vSlug, videoIdNumeric: vidNumeric, title, thumbnailUrl, durationSec });
    if (items.length >= 60) break;
  }
  return items;
}

/** Push la liste des VODs au backend (insert + résolution mp4). */
async function pushVodCards(slug, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  try {
    const r = await fetch(`${API_BASE}/admin/rumble/ingest-vods`, {
      method: "POST",
      headers: {
        "x-admin-key": ADMIN_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug, items }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      console.warn(`[relay-vods]   push ${slug} failed http=${r.status}`, j?.error || "");
      return;
    }
    if (j?.inserted > 0) {
      console.log(`[relay-vods]   ${slug}: +${j.inserted} nouvelle(s) VOD(s) (resolveScheduled=${j.resolveScheduled})`);
    }
  } catch (e) {
    console.warn(`[relay-vods]   ${slug} error`, e?.message || e);
  }
}

/**
 * Extrait le nombre de followers depuis la page principale `/user/{name}` (HTML)
 * ou la page `/c/{name}`. Patterns courants observés sur Rumble :
 *   - data-followers="N"
 *   - "follower_count":N
 *   - <span class="...listing-header--followers...">N follower(s)</span>
 *   - <div class="channel-header--followers">N Followers</div>
 */
async function fetchFollowersCount(username) {
  for (const path of [`/user/${encodeURIComponent(username)}`, `/c/${encodeURIComponent(username)}`]) {
    try {
      const r = await fetch(`https://rumble.com${path}`, {
        headers: {
          "user-agent": UA,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "fr-FR,fr;q=0.9",
        },
      });
      if (!r.ok) continue;
      const html = await r.text();
      for (const re of [
        /data-followers="(\d+)"/,
        /"follower_count"\s*:\s*(\d+)/,
        /"followers_count"\s*:\s*(\d+)/,
        /channel-header--followers[^>]*>\s*([\d,\s]+)\s*Follower/i,
        /listing-header--followers[^>]*>\s*([\d,\s]+)\s*Follower/i,
        /([\d,]+)\s+Followers/i,
      ]) {
        const m = html.match(re);
        if (m && m[1]) {
          const n = Number(String(m[1]).replace(/[^\d]/g, ""));
          if (Number.isFinite(n) && n >= 0) return n;
        }
      }
    } catch { /* try next path */ }
  }
  return null;
}

/** Push le followers count au backend (qui gère le delta + annonce chat). */
async function pushFollowersCount(slug, followers) {
  if (typeof followers !== "number" || !Number.isFinite(followers)) return;
  try {
    const r = await fetch(`${API_BASE}/admin/rumble/announce-follows`, {
      method: "POST",
      headers: {
        "x-admin-key": ADMIN_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug, followers }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      console.warn(`[relay-follows]   push ${slug} failed http=${r.status}`, j?.error || "");
      return;
    }
    if (j?.delta && j.delta > 0 && j.announced) {
      console.log(`[relay-follows]   ${slug}: +${j.delta} follow(s) annoncé`);
    }
  } catch (e) {
    console.warn(`[relay-follows]   ${slug} error`, e?.message || e);
  }
}

/** Push le videoId au backend. Optionnel: viewer count. */
async function pushLiveVideo(slug, vSlug, viewers) {
  const r = await fetch(`${API_BASE}/admin/rumble/set-live`, {
    method: "POST",
    headers: {
      "x-admin-key": ADMIN_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({ slug, videoId: vSlug, viewers: typeof viewers === "number" ? viewers : null }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    console.warn(`[relay]   push failed http=${r.status}`, j?.error || "");
    return false;
  }
  return true;
}

function buildProbeOrder(usernames, currentUsername) {
  if (!currentUsername) return [...usernames];
  const idx = usernames.findIndex((u) => String(u).toLowerCase() === String(currentUsername).toLowerCase());
  if (idx < 0) return [...usernames];
  return [...usernames.slice(idx), ...usernames.slice(0, idx)];
}

async function fetchActiveRadioSources() {
  if (!dbPool) return [];
  const { rows } = await dbPool.query(
    `SELECT username FROM rumble_radio_sources WHERE active = TRUE ORDER BY id ASC`
  );
  return rows.map((r) => String(r.username || "").trim()).filter(Boolean);
}

async function fetchCurrentRadioUsername() {
  if (!dbPool) return null;
  const { rows } = await dbPool.query(
    `SELECT rumble_username FROM streamers WHERE id = $1 LIMIT 1`,
    [RADIO_STREAMER_ID]
  );
  return rows[0]?.rumble_username ? String(rows[0].rumble_username) : null;
}

async function setRadioLiveSource(username, live) {
  if (!dbPool || !username || !live?.vSlug) return false;
  const viewers = (typeof live?.viewers === "number" && Number.isFinite(live.viewers) && live.viewers >= 0)
    ? Math.floor(live.viewers)
    : null;

  await dbPool.query(
    `UPDATE streamers
        SET rumble_username = $1,
            is_live = TRUE,
            title = 'Live sur Rumble',
            viewers = COALESCE($2, viewers),
            updated_at = NOW()
      WHERE id = $3`,
    [username, viewers, RADIO_STREAMER_ID]
  );

  await dbPool.query(
    `INSERT INTO streamer_rumble_info (
       streamer_id, is_live, live_id, live_video_id_numeric, viewers_count, updated_at
     )
     VALUES ($1, TRUE, $2, $3, $4, NOW())
     ON CONFLICT (streamer_id) DO UPDATE SET
       is_live = TRUE,
       live_id = EXCLUDED.live_id,
       live_video_id_numeric = EXCLUDED.live_video_id_numeric,
       viewers_count = COALESCE(EXCLUDED.viewers_count, streamer_rumble_info.viewers_count),
       updated_at = NOW()`,
    [RADIO_STREAMER_ID, live.vSlug, live.vidNumeric || null, viewers]
  );

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
  if (!m || !m[1]) return null;

  const vSlug = m[1];
  const numMatch = html.match(/video_id:\s*(\d+)/) || html.match(/"video_id":\s*(\d+)/);
  const vidNumeric = numMatch ? numMatch[1] : null;

  // ⚠️ /user/{name}/live redirige vers la *dernière* vidéo (live OU DVR OU VOD).
  // On valide via embedJS pour différencier : `live: 1/2` = en cours, `live: 0` = fini.
  // L'URL HLS `hls-vod/` est aussi un signal de fin de stream.
  let isLive = false;
  let viewers = null;
  try {
    const embedUrl = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${vSlug}&ad_wt=0`;
    const r2 = await fetch(embedUrl, {
      headers: {
        "user-agent": UA,
        "accept": "application/json",
        "referer": "https://rumble.com/",
        "origin": "https://rumble.com",
      },
    });
    if (r2.ok) {
      const d = await r2.json();
      const hlsPeek = d?.u?.hls?.url || d?.ua?.hls?.auto?.url || "";
      const isVodUrl = typeof hlsPeek === "string" && hlsPeek.includes("/hls-vod/");
      isLive = !!d?.live && !isVodUrl;
      // viewer count direct depuis embedJS (plus fiable que le HTML)
      if (typeof d?.watching_now === "number") viewers = d.watching_now;
      else if (typeof d?.viewers === "number") viewers = d.viewers;
    }
  } catch { /* embedJS échec → considère pas live */ }

  if (!isLive) {
    console.log(`[relay]   ${username}: ${vSlug} pas en live (DVR/VOD)`);
    return null;
  }

  // Fallback viewer count depuis HTML si embedJS n'a rien donné
  if (viewers === null) {
    for (const re of [
      /"watching_now"\s*:\s*(\d+)/,
      /data-viewer-count="(\d+)"/,
      /"viewer_count"\s*:\s*(\d+)/,
      /class="[^"]*video-counter-watching[^"]*"[^>]*>\s*(\d+)/i,
      /class="[^"]*media-watching-now[^"]*"[^>]*>\s*(\d+)/i,
    ]) {
      const vm = html.match(re);
      if (vm && vm[1]) { viewers = Number(vm[1]); if (Number.isFinite(viewers)) break; }
    }
  }

  return { vSlug, vidNumeric, viewers };
}

async function tickRadio() {
  try {
    const sources = await fetchActiveRadioSources();
    if (!sources.length) {
      console.log("[relay-radio] aucune source radio active");
      return;
    }

    const current = await fetchCurrentRadioUsername();
    const ordered = buildProbeOrder(sources, current);
    console.log(`[relay-radio] scan ${ordered.length} source(s) actives`);

    for (const username of ordered) {
      const live = await findCurrentLiveSlug(username);
      if (!live) continue;

      const ok = await setRadioLiveSource(username, live);
      if (ok) {
        console.log(`[relay-radio] source live retenue: ${username} -> ${live.vSlug} viewers=${live.viewers ?? "?"}`);
      }
      return;
    }

    console.log("[relay-radio] aucune source radio live détectée");
  } catch (e) {
    console.warn("[relay-radio] tick failed", e?.message || e);
  }
}

async function tick() {
  await tickRadio();

  // On utilise list-all : couvre tout le monde (pseudo-only + api_key).
  // La slug discovery sera skip pour les api_key (le poller Render le fait
  // déjà via api_key direct) — on les détecte via le champ `source`.
  let streamers = [];
  try {
    streamers = await fetchStreamersList("list-all");
  } catch (e) {
    console.warn("[relay] fetchStreamersList failed", e?.message || e);
    return;
  }

  if (streamers.length === 0) {
    console.log("[relay] aucun streamer Rumble à scrap");
    return;
  }

  console.log(`[relay] tick — ${streamers.length} streamer(s) à scrap`);

  for (const s of streamers) {
    const username = s.username;
    if (!username) continue;
    const isPseudo = s.source === "pseudo";
    console.log(`[relay] ${s.slug} (${username}) [${s.source || "?"}]`);

    // Slug discovery : uniquement pour pseudo-only (api_key fait son chemin)
    if (isPseudo) {
      const live = await findCurrentLiveSlug(username);
      if (live) {
        console.log(`[relay]   ${username}: LIVE — slug=${live.vSlug} vid=${live.vidNumeric || "?"} viewers=${live.viewers ?? "?"}`);
        const ok = await pushLiveVideo(s.slug, live.vSlug, live.viewers);
        if (ok) console.log(`[relay]   ${username}: pushed ${live.vSlug} ✓`);
      } else {
        console.log(`[relay]   ${username}: pas de live actif`);
      }
    }

    // Followers count (delta detection + annonce "+N follow GG !") — pour tout le monde
    const followers = await fetchFollowersCount(username);
    if (typeof followers === "number") {
      console.log(`[relay]   ${username}: followers=${followers}`);
      await pushFollowersCount(s.slug, followers);
    }

    // VODs : scrape les cartes publiques /user/{name} et push pour ingestion (tout le monde)
    const vods = await fetchVodCards(username);
    if (vods.length > 0) {
      console.log(`[relay]   ${username}: ${vods.length} VOD(s) trouvées`);
      await pushVodCards(s.slug, vods);
    }
  }
}

// Premier tick immédiat puis intervalle régulier (slug discovery)
void tick();
setInterval(() => void tick(), POLL_INTERVAL_MS);

// ─────────────────────────────────────────────────────────────────
// COOKIE REFRESH — Rumble rotate u_s sur les requêtes authentifiées.
// On visite rumble.com avec le cookie actuel toutes les 2h pour le
// maintenir vivant ET capturer la nouvelle valeur si rotation.
// ─────────────────────────────────────────────────────────────────
const COOKIE_REFRESH_MS = Number(process.env.RUMBLE_COOKIE_REFRESH_MS || 2 * 60 * 60_000);

/** Lit le cookie bot actuel direct depuis la DB (l'endpoint admin le redacte). */
async function fetchCurrentBotCookie() {
  if (!dbPool) return null;
  try {
    const r = await dbPool.query("SELECT cookie FROM rumble_bot_session WHERE id=1 LIMIT 1");
    return r.rows?.[0]?.cookie || null;
  } catch (e) {
    console.warn("[cookie-refresh] DB read failed", e?.message || e);
    return null;
  }
}

/** Push un nouveau cookie complet à l'API Render. */
async function pushBotCookie(cookie) {
  try {
    const r = await fetch(`${API_BASE}/admin/rumble/bot`, {
      method: "POST",
      headers: { "x-admin-key": ADMIN_KEY, "content-type": "application/json" },
      body: JSON.stringify({ cookie }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.warn(`[cookie-refresh] push failed http=${r.status} ${t.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[cookie-refresh] push error", e?.message || e);
    return false;
  }
}

/** Parse Set-Cookie headers et retourne la valeur d'un cookie nommé. */
function extractCookieFromHeaders(setCookieList, name) {
  if (!setCookieList) return null;
  const list = Array.isArray(setCookieList) ? setCookieList : [setCookieList];
  for (const sc of list) {
    const m = String(sc).match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

/** Remplace u_s dans une string cookie. */
function replaceUs(cookieStr, newUs) {
  if (!cookieStr || !newUs) return cookieStr;
  if (/u_s=/.test(cookieStr)) {
    return cookieStr.replace(/u_s=[^;]+/, `u_s=${newUs}`);
  }
  return `${cookieStr.replace(/;\s*$/, "")}; u_s=${newUs}`;
}

async function refreshCookieTick() {
  try {
    const current = await fetchCurrentBotCookie();
    if (!current) {
      console.warn("[cookie-refresh] pas de cookie actuel en DB — skip");
      return;
    }
    // Extrait u_s actuel
    const curUsMatch = current.match(/u_s=([^;]+)/);
    const currentUs = curUsMatch ? curUsMatch[1] : null;

    // Visite une page authentifiée Rumble pour déclencher la rotation u_s.
    // /account redirige vers login si pas auth → on saura aussi si expiré.
    const r = await fetch("https://rumble.com/account", {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": UA,
        "cookie": current,
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    // Multi-valued Set-Cookie : Node fetch retourne une string ; on split.
    const rawSetCookie = r.headers.getSetCookie?.() || r.headers.raw?.()?.['set-cookie'] || r.headers.get('set-cookie');
    const setCookieList = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : rawSetCookie ? String(rawSetCookie).split(/,\s*(?=[A-Za-z][\w-]*=)/) : [];

    const newUs = extractCookieFromHeaders(setCookieList, "u_s");

    // Détecte expiration : soit redirect login, soit Set-Cookie u_s=deleted
    const isDeleted = setCookieList.some((sc) => /^u_s=deleted/i.test(String(sc).trim()));
    const isRedirectLogin = (r.status === 301 || r.status === 302) &&
      /login|auth/i.test(r.headers.get("location") || "");
    if (isDeleted || isRedirectLogin) {
      console.warn(`[cookie-refresh] u_s mort (${isDeleted ? "Set-Cookie:deleted" : "redirect login"}) → tentative re-login auto`);
      try {
        const { getFreshCookie } = await import("./rumble-bot-login.js");
        const freshCookie = await getFreshCookie();
        if (freshCookie) {
          const ok = await pushBotCookie(freshCookie);
          if (ok) console.log(`[cookie-refresh] ✓ re-login auto réussi`);
          else console.warn(`[cookie-refresh] re-login OK mais push API échoué`);
        } else {
          console.warn(`[cookie-refresh] re-login auto échoué — intervention manuelle requise`);
        }
      } catch (e) {
        console.warn(`[cookie-refresh] erreur lors du re-login auto`, e?.message || e);
      }
      return;
    }

    if (!newUs) {
      console.log(`[cookie-refresh] aucun nouveau u_s dans Set-Cookie (status=${r.status}) — session probablement encore valide, on retest plus tard`);
      return;
    }
    // Refuse les valeurs "tombstone" — Rumble envoie u_s=deleted pour signifier
    // expiration, on ne doit jamais écrire ça en DB (sinon bot HS définitivement).
    if (/^(deleted|expired|null|undefined)$/i.test(newUs.trim()) || newUs.length < 10) {
      console.warn(`[cookie-refresh] u_s tombstone ('${newUs}') ignoré — session probablement expirée`);
      return;
    }
    if (newUs === currentUs) {
      console.log(`[cookie-refresh] u_s inchangé (refresh OK, session vivante)`);
      return;
    }

    const updated = replaceUs(current, newUs);
    const ok = await pushBotCookie(updated);
    if (ok) console.log(`[cookie-refresh] ✓ u_s rotaté et pushé (${newUs.slice(0, 6)}…${newUs.slice(-4)})`);
  } catch (e) {
    console.warn("[cookie-refresh] tick error", e?.message || e);
  }
}

// Premier refresh au démarrage (avec 10s de délai pour laisser le relay starter),
// puis toutes les 2h.
// Au démarrage : tente la stratégie complète (CDP si Opera ouvert avec debug,
// sinon Opera headless avec profil persistant). Plus jamais d'attente passive.
(async () => {
  try {
    const { getFreshCookie } = await import("./rumble-bot-login.js");
    const fresh = await getFreshCookie();
    if (fresh) {
      const ok = await pushBotCookie(fresh);
      if (ok) console.log(`[cookie-refresh] ✓ startup : cookie frais pushé`);
      else console.warn(`[cookie-refresh] startup : push API échoué`);
    } else {
      console.warn(`[cookie-refresh] startup : aucun cookie récupérable — setup MFA requis (node scripts/rumble-bot-login.js --setup)`);
    }
  } catch (e) {
    console.warn(`[cookie-refresh] startup error`, e?.message || e);
  }
})();

// Tick standard toutes les 2h (refresh préventif si Opera dispo, sinon
// visite rumble.com avec cookie courant pour le maintenir vivant)
setInterval(() => void refreshCookieTick(), COOKIE_REFRESH_MS);

// NOTE: la send-queue (bot replies) a été retirée. Render envoie maintenant
// directement les messages via sendRumbleMessage (compte LunaLive_Bot vérifié).
// Le relay ne fait plus que la slug discovery pseudo-only + viewer count
// + le maintien automatique du cookie u_s.
