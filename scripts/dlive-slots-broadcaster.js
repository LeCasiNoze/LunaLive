#!/usr/bin/env node
// scripts/dlive-slots-broadcaster.js
//
// Envoie un message de promo LunaLive dans les chats des streamers DLive catégorie Slots.
// Règles :
//   - Une seule fois par chaîne (état persisté dans dlive-slots-state.json)
//   - Attend 10 min de live minimum avant d'envoyer
//   - Ignore les chaînes blacklistées
//   - Poll toutes les POLL_INTERVAL_MS (défaut 60s)
//
// Usage :
//   DLIVE_BOT_AUTH=<jwt> node dlive-slots-broadcaster.js
//   DLIVE_BOT_AUTH=<jwt> DRY_RUN=1 node dlive-slots-broadcaster.js  (dry-run, pas d'envoi réel)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const DLIVE_ENDPOINT =
  process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";

// Chaînes à ne jamais contacter (displayname ou username immutable, insensible à la casse)
const BLACKLIST = new Set([
  "lunalive",
  "lunalive_bot",
  "kriminel",
  "mistercasino",
  "cyber_slots",
]);

const POLL_INTERVAL_MS = 60 * 1_000;         // 60 secondes entre chaque cycle
const SEND_DELAY_MS = 4_000;                 // délai entre chaque envoi (anti-spam)
const CATEGORY_BACKEND_ID = "57608";         // backendID DLive pour "Slots"
const CATEGORY_ID = "Slots";                 // label lisible (pour les logs)

// Message 1 — intro avec @pseudo en préfixe (base ≤ 163 chars pour laisser de la place au @pseudo)
// Limite réelle DLive : 130 chars
// Limite réelle DLive : 130 chars (incluant le "Salut @pseudo ! " en préfixe)
const PROMO_BASE_1 =
  "Si tu cherches une nouvelle plateforme, LunaLive.win est là — fluide, bot casino, clip auto + post IG etc";

const PROMO_MSG_2 =
  "Si ça t'intéresse, mp-moi via les réseaux dans ma bio — LunaLive est gratuit et ouvert à tous 🙌";

// ─── STATE (persisté sur disque) ─────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "dlive-slots-state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { messaged: [], firstSeen: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s || "").trim();
}

function getAuthHeader() {
  const raw = norm(process.env.DLIVE_BOT_AUTH);
  if (!raw) throw new Error("DLIVE_BOT_AUTH manquant. Ex: DLIVE_BOT_AUTH=<jwt> node ...");
  return raw.replace(/^bearer\s+/i, "").trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gql(query, variables, withAuth = false) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    origin: "https://dlive.tv",
    referer: "https://dlive.tv/",
    "user-agent": "Mozilla/5.0",
  };
  if (withAuth) headers.authorization = getAuthHeader();

  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: variables ?? undefined }),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`dlive_gql_http_${r.status}: ${body.slice(0, 300)}`);
  }
  return await r.json();
}

// ─── MESSAGE ─────────────────────────────────────────────────────────────────

/**
 * Construit le message 1 avec @displayname en préfixe.
 * Tronque proprement si le pseudo est très long, toujours ≤ 180 chars.
 */
function buildPromoMessage1(displayname) {
  const full = `Salut @${displayname} ! ${PROMO_BASE_1}`;
  return full.slice(0, 130);
}

// ─── DLIVE API ────────────────────────────────────────────────────────────────

/**
 * Résout un username DLive valide (dlive-xxxx ou slug classique).
 * DLive accepte les deux formats dans la mutation SendStreamChatMessage.
 */
async function resolveImmutable(username, displayname) {
  if (username) return username;
  try {
    const q = `query ($dn: String!) { userByDisplayName(displayname: $dn) { username } }`;
    const j = await gql(q, { dn: displayname });
    const u = norm(j?.data?.userByDisplayName?.username);
    if (u) return u;
  } catch {}
  return null;
}

/**
 * Récupère tous les streams live de la catégorie Slots via la persisted query
 * CategoryLivestreamsPage (hash confirmé, categoryID "57608").
 * Pagine jusqu'à épuisement.
 */
async function fetchSlotsStreams() {
  const results = [];
  let after = null;
  let page = 0;

  while (page < 20) {
    page++;
    const payload = {
      operationName: "CategoryLivestreamsPage",
      variables: {
        first: 50,
        categoryID: CATEGORY_BACKEND_ID,
        languageID: null,
        showNSFW: false,
        showMatureContent: true,
        order: "TRENDING",
        after,
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "5119a9d4d1866567560eb20e0a694923ea4e94ed745d2fe9376dcaefe1a9c6bb",
        },
      },
    };

    let j;
    try {
      const r = await fetch(DLIVE_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          origin: "https://dlive.tv",
          referer: "https://dlive.tv/",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`http_${r.status}: ${body.slice(0, 200)}`);
      }
      j = await r.json();
    } catch (e) {
      console.error(`[slots] Fetch page ${page} échouée:`, e.message.slice(0, 200));
      break;
    }

    if (j?.errors) {
      console.warn(`[slots] Page ${page} GraphQL errors:`, JSON.stringify(j.errors).slice(0, 300));
      break;
    }

    // La réponse peut être sous data.category.livestreams ou data.livestreams selon le schéma
    const data =
      j?.data?.category?.livestreams ??
      j?.data?.livestreams ??
      null;

    if (!data) {
      // Log la structure reçue pour debug
      console.warn("[slots] Structure inattendue page", page, JSON.stringify(j?.data).slice(0, 300));
      break;
    }

    const list = data?.list || [];
    console.log(`[slots] Page ${page} — ${list.length} streams`);

    for (const item of list) {
      const displayname = norm(item?.creator?.displayname);
      if (!displayname) continue;
      results.push({
        displayname,
        username: norm(item?.creator?.username),
        title: norm(item?.title),
      });
    }

    if (!data?.pageInfo?.hasNextPage) break;
    after = data?.pageInfo?.endCursor || null;
    if (!after || after === "0") break;
  }

  return results;
}

/**
 * Follow un streamer DLive avec le compte bot (nécessaire pour chatter).
 */
async function followStreamer(username) {
  try {
    const r = await fetch(DLIVE_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: getAuthHeader(),
        origin: "https://dlive.tv",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        query: `mutation { follow(streamer: "${username}") { err { message code } } }`,
      }),
    });
    const j = await r.json();
    return !j?.data?.follow?.err;
  } catch {
    return false;
  }
}

/**
 * Envoie un message dans le chat d'un streamer DLive.
 * streamerImmutableUsername = "dlive-xxxx"
 */
async function sendMessage(streamerImmutableUsername, message) {
  const payload = {
    operationName: "SendStreamChatMessage",
    variables: {
      input: {
        streamer: streamerImmutableUsername,
        message: message.slice(0, 180),
        roomRole: "Member",
        subscribing: false,
      },
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "848cbe91a57458ed402716e7b57b7a128c3b5a8385a6ebe14d9deff8d1eda73c",
      },
    },
  };

  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "*/*",
      authorization: getAuthHeader(),
      "content-type": "application/json",
      Origin: "https://dlive.tv",
      Referer: `https://dlive.tv/${streamerImmutableUsername}`,
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(payload),
  });

  return r.ok;
}

// ─── BOUCLE PRINCIPALE ────────────────────────────────────────────────────────

async function runCycle(state) {
  console.log(`\n[slots] === Cycle ${new Date().toISOString()} ===`);
  console.log(`[slots] Chaînes déjà contactées : ${state.messaged.length}`);

  let streams;
  try {
    streams = await fetchSlotsStreams();
  } catch (e) {
    console.error("[slots] Erreur fetchSlotsStreams:", e.message);
    return;
  }

  console.log(`[slots] ${streams.length} stream(s) trouvé(s) dans Slots`);

  const messagedSet = new Set(state.messaged.map((s) => s.toLowerCase()));
  if (!state.firstSeen) state.firstSeen = {};
  const dryRun = !!process.env.DRY_RUN;
  const listOnly = !!process.env.LIST_ONLY;
  for (const stream of streams) {
    const dn = stream.displayname;
    const dnLower = dn.toLowerCase();
    const username = stream.username;

    // Blacklist
    if (BLACKLIST.has(dnLower) || (username && BLACKLIST.has(username.toLowerCase()))) {
      console.log(`[slots] BLACKLIST:        ${dn}`);
      continue;
    }

    // Filtre coréen — titre avec caractères hangul
    if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(stream.title)) {
      console.log(`[slots] CORÉEN SKIP:     ${dn} — "${stream.title.slice(0, 40)}"`);
      continue;
    }

    // Déjà contacté
    if (messagedSet.has(dnLower)) {
      console.log(`[slots] DÉJÀ CONTACTÉ:    ${dn}`);
      continue;
    }

    // Résolution username (accepte dlive-xxxx et slugs classiques comme "willwin")
    const immutable = await resolveImmutable(username, dn);
    if (!immutable) { console.log(`[slots] USERNAME INTROUVABLE: ${dn}`); continue; }
    if (immutable !== username) console.log(`[slots] Résolu: ${dn} → ${immutable}`);

    const msg1 = buildPromoMessage1(dn);
    const msg2 = PROMO_MSG_2;

    // Mode LIST_ONLY : affiche sans envoyer ni modifier le state
    if (listOnly) {
      console.log(`[slots] SERAIT ENVOYÉ:    ${dn} (${immutable})`);
      console.log(`         msg1 (${msg1.length}c): "${msg1}"`);
      console.log(`         msg2 (${msg2.length}c): "${msg2}"`);
      continue;
    }

    console.log(`[slots] ENVOI vers ${dn} (${immutable})`);

    // Follow avant d'envoyer (nécessaire pour chatter sur les chaînes externes)
    const followed = await followStreamer(immutable);
    if (followed) console.log(`[slots] ✓ Follow ${dn}`);
    await sleep(500);

    if (dryRun) {
      console.log(`[slots] DRY_RUN msg1 (${msg1.length} chars): "${msg1}"`);
      console.log(`[slots] DRY_RUN msg2 (${msg2.length} chars): "${msg2}"`);
      state.messaged.push(dnLower);
      messagedSet.add(dnLower);
    } else {
      let ok1 = false;
      try {
        ok1 = await sendMessage(immutable, msg1);
      } catch (e) {
        console.error(`[slots] Erreur envoi msg1 vers ${dn}:`, e.message);
      }

      if (ok1) {
        await sleep(1_500);

        let ok2 = false;
        try {
          ok2 = await sendMessage(immutable, msg2);
        } catch (e) {
          console.error(`[slots] Erreur envoi msg2 vers ${dn}:`, e.message);
        }

        console.log(`[slots] ✓ ${dn} — msg1 OK, msg2 ${ok2 ? "OK" : "FAIL"}`);
        state.messaged.push(dnLower);
        messagedSet.add(dnLower);
        saveState(state);
      } else {
        console.warn(`[slots] ✗ Échec envoi msg1 vers ${dn} — chaîne non marquée`);
      }

      await sleep(SEND_DELAY_MS);
    }
  }

  if (dryRun) saveState(state);
}

async function main() {
  console.log("[slots] Démarrage DLive Slots Broadcaster");
  const ex1 = buildPromoMessage1("ExempleStreamer");
  console.log(`[slots] Msg1 exemple (${ex1.length} chars): "${ex1}"`);
  console.log(`[slots] Msg2 fixe    (${PROMO_MSG_2.length} chars): "${PROMO_MSG_2}"`);
  console.log(`[slots] Catégorie: ${CATEGORY_ID}`);
console.log(`[slots] Intervalle poll: ${POLL_INTERVAL_MS / 1_000}s`);
  if (process.env.DRY_RUN) console.log("[slots] MODE DRY_RUN — aucun message réel envoyé, state modifié");
  if (process.env.LIST_ONLY) console.log("[slots] MODE LIST_ONLY — fetch + affichage seulement, state intact");

  // Vérification auth au démarrage (pas nécessaire en LIST_ONLY)
  if (!process.env.LIST_ONLY) {
    try {
      getAuthHeader();
    } catch (e) {
      console.error("[slots]", e.message);
      process.exit(1);
    }
  }

  const state = loadState();

  // Premier cycle immédiat
  await runCycle(state);

  // Puis boucle périodique
  setInterval(() => runCycle(state), POLL_INTERVAL_MS);
}

main().catch((e) => {
  console.error("[slots] Fatal:", e);
  process.exit(1);
});
