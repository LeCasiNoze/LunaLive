#!/usr/bin/env node

// scripts/dlive-chat-reader.js
// Module autonome pour lire le chat DLive en temps réel
// Extrait et adapté de api/src/dlive_chat_bridge.ts

const WebSocket = require("ws");

// Configuration (identique à LunaLive)
const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
const GRAPHIGOSTREAM_WS = process.env.DLIVE_GRAPHIGOSTREAM_WS || "wss://graphigostream.prd.dlive.tv";

// Variables globales
let alive = true;
let ws = null;
let reconnectTimer = null;
let dliveImmutable = null;
let messageCallback = null;

// Déduplication (gardé de LunaLive)
const seenIds = new Set();
const seenQueue = [];
const SEEN_MAX = 600;

// Fonctions utilitaires (exactement de LunaLive)
function norm(s) {
  return String(s || "").trim();
}

function escGqlString(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

async function gql(query, variables) {
  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: variables ?? undefined }),
  });
  const j = await r.json();
  return j;
}

function normalizeRestream(senderDisplay, senderUsername, content) {
  const isRestream =
    /^restreambot$/i.test(senderDisplay) ||
    /^restreambot$/i.test(senderUsername) ||
    /restream/i.test(senderDisplay);

  if (!isRestream) return { username: senderDisplay, body: content, restreamFrom: null };

  // Ex: "[Twitch: sinsin1005] salut" / "[Kick: joe67350] ..." / parfois espaces
  const m = content.match(/^\[\s*([A-Za-z0-9_ -]+)\s*:\s*([^\]\s]+)\s*\]\s*/);
  if (!m) return { username: senderDisplay, body: content, restreamFrom: null };

  const platform = norm(m[1]);
  const user = norm(m[2]);
  const body = content.slice(m[0].length).trim();

  return {
    username: user || senderDisplay,
    body: body || "",
    restreamFrom: platform || null,
  };
}

// Résolution username immutable (exactement de LunaLive)
async function resolveImmutableUsername(displaynameOrUsername) {
  const displayname = norm(displaynameOrUsername);
  if (!displayname) return null;

  // ✅ Déjà un username immutable → pas besoin d'appel API
  if (displayname.toLowerCase().startsWith("dlive-")) return displayname;

  // 1) try as displayname (slug)
  {
    const query = `
      query ($displayname: String!) {
        userByDisplayName(displayname: $displayname) { username displayname }
      }
    `;
    const j = await gql(query, { displayname });
    const u = j?.data?.userByDisplayName;
    const username = norm(u?.username);
    if (username) return username;
  }

  // 2) fallback: try as username directly
  {
    const query = `
      query ($username: String!) {
        user(username: $username) { username displayname }
      }
    `;
    const j = await gql(query, { username: displayname });
    const u = j?.data?.user;
    const username = norm(u?.username);
    if (username) return username;
  }

  return null;
}

// Construction subscription GraphQL (exactement de LunaLive)
function buildChatSubscriptionQuery(streamerImmutableUsername) {
  const streamer = escGqlString(streamerImmutableUsername);
  return `
    subscription {
      streamMessageReceived(streamer: "${streamer}") {
        __typename
        ... on ChatText {
          id
          content
          createdAt
          sender { username displayname }
        }
      }
    }
  `;
}

function parseCreatedAtMs(createdAt) {
  if (typeof createdAt === "number") return createdAt;
  const t = Date.parse(String(createdAt || ""));
  return Number.isFinite(t) ? t : Date.now();
}

// Déduplication (exactement de LunaLive)
function addSeen(id) {
  if (!id) return;
  if (seenIds.has(id)) return;
  seenIds.add(id);
  seenQueue.push(id);
  if (seenQueue.length > SEEN_MAX) {
    const old = seenQueue.shift();
    if (old) seenIds.delete(old);
  }
}

// Traitement message (adapté de broadcast() LunaLive)
function handleMessage(m) {
  const content = norm(m.content);
  if (!content) return;

  const dliveId = norm(m.id) || "";
  if (dliveId && seenIds.has(dliveId)) return;

  const createdAtMs = parseCreatedAtMs(m.createdAt);
  const senderUsername = norm(m.sender?.username);
  const senderDisplay = norm(m.sender?.displayname) || senderUsername || "DLive";

  // Ignore bot LunaLive (gardé de LunaLive)
  const BOT_DLIVE_USERNAME = String(process.env.DLIVE_BOT_USERNAME || "").trim().toLowerCase();
  const BOT_DLIVE_DISPLAY = String(process.env.DLIVE_BOT_DISPLAYNAME || "BOT_LunaLive").trim().toLowerCase();

  const isBot =
    (BOT_DLIVE_USERNAME && senderUsername.toLowerCase() === BOT_DLIVE_USERNAME) ||
    (BOT_DLIVE_DISPLAY && senderDisplay.toLowerCase() === BOT_DLIVE_DISPLAY);

  if (isBot) return;

  // ✅ normalize RestreamBot messages
  const normed = normalizeRestream(senderDisplay, senderUsername, content);
  if (!normed.body) return;

  if (dliveId) addSeen(dliveId);

  // Format de sortie demandé
  const timestamp = new Date(createdAtMs).toISOString().slice(11, 19);
  const restreamInfo = normed.restreamFrom ? ` [${normed.restreamFrom}]` : "";
  const output = `[${timestamp}] ${normed.username}${restreamInfo} (@${senderUsername}): ${normed.body}`;

  if (messageCallback) {
    messageCallback({
      timestamp,
      displayname: normed.username,
      username: senderUsername,
      content: normed.body,
      restreamFrom: normed.restreamFrom,
      raw: m
    });
  } else {
    console.log(output);
  }
}

// Gestion WebSocket (exactement de LunaLive)
function closeWs() {
  try {
    if (ws) ws.close();
  } catch {}
  ws = null;
}

function scheduleReconnect(ms) {
  if (!alive) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWs(dliveImmutable); // retry
  }, ms);
}

function startWs(immutableUsername) {
  closeWs();

  const query = buildChatSubscriptionQuery(immutableUsername);

  ws = new WebSocket(GRAPHIGOSTREAM_WS, "graphql-ws", {
    headers: {
      Origin: "https://dlive.tv",
      Referer: "https://dlive.tv/",
      "User-Agent": "Mozilla/5.0",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  let subSent = false;

  const sendSub = () => {
    if (!ws || ws.readyState !== ws.OPEN) return;
    if (subSent) return;
    subSent = true;
    // legacy "start" (subscriptions-transport-ws protocol utilisé par DLive)
    ws.send(JSON.stringify({ id: "1", type: "start", payload: { query } }));
    console.log("[dlive_reader] subscription sent", immutableUsername);
  };

  ws.on("open", () => {
    if (!ws) return;
    console.log("[dlive_reader] ws open", immutableUsername);
    ws.send(JSON.stringify({ type: "connection_init" }));

    // fallback: si ack tarde, on envoie quand même
    setTimeout(() => {
      if (!alive) return;
      sendSub();
    }, 350);
  });

  ws.on("message", (buf) => {
    try {
      const raw = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
      const msg = JSON.parse(raw);
      const t = msg?.type;

      if (t === "connection_ack") {
        sendSub();
        return;
      }

      if (t === "connection_error") {
        console.warn("[dlive_reader] connection_error");
        closeWs();
        scheduleReconnect(1200);
        return;
      }

      // ✅ "data" = legacy protocol (subscriptions-transport-ws)
      // ✅ "next" = nouveau protocol (graphql-ws) — géré pour compatibilité future
      if (t !== "data" && t !== "next") return;

      let payloads = msg?.payload?.data?.streamMessageReceived;
      if (!payloads) return;
      if (!Array.isArray(payloads)) payloads = [payloads];

      for (const ev of payloads) {
        if (ev?.__typename !== "ChatText") continue;
        handleMessage({
          id: ev?.id,
          content: ev?.content,
          createdAt: ev?.createdAt,
          sender: ev?.sender,
        });
      }
    } catch (e) {
      // ignore parse errors
      console.error("[dlive_reader] parse error", e);
    }
  });

  ws.on("error", (e) => {
    console.warn("[dlive_reader] ws error", e?.message || e);
    closeWs();
    scheduleReconnect(1200);
  });

  ws.on("close", (code, reason) => {
    if (!alive) return;
    console.log("[dlive_reader] ws closed", code, reason?.toString?.() || "");
    closeWs();
    scheduleReconnect(1200);
  });
}

// Démarrage (adapté de start() LunaLive)
async function start(dliveUsername) {
  if (!alive) return;

  const dn = dliveUsername ? norm(dliveUsername) : "";
  if (!dn) {
    console.error("[dlive_reader] no username provided");
    return;
  }

  try {
    console.log("[dlive_reader] resolving username", dn);
    const immutable = await resolveImmutableUsername(dn);
    if (!immutable) {
      console.error("[dlive_reader] cannot resolve immutable username", dn);
      process.exit(1);
    }
    console.log("[dlive_reader] resolved", dn, "->", immutable);

    // si on change de streamer => reset dedup (sinon on risque de filtrer des ids)
    if (dliveImmutable && dliveImmutable !== immutable) {
      seenIds.clear();
      seenQueue.length = 0;
    }

    dliveImmutable = immutable;
    startWs(immutable);
  } catch (e) {
    console.error("[dlive_reader] resolve/start error", e?.message || e);
    scheduleReconnect(2500);
  }
}

// API publique
class DLiveChatReader {
  constructor(options = {}) {
    this.username = options.username;
    this.onMessage = options.onMessage || null;
    messageCallback = this.onMessage;
  }

  async start() {
    if (!this.username) {
      throw new Error("username is required");
    }
    alive = true;
    await start(this.username);
  }

  stop() {
    alive = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeWs();
  }
}

// CLI
if (require.main === module) {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: node dlive-chat-reader.js <dlive-username-or-displayname>");
    console.error("Example: node dlive-chat-reader.js dlive-abc123");
    console.error("Example: node dlive-chat-reader.js somechannel");
    process.exit(1);
  }

  const reader = new DLiveChatReader({ username });
  
  // Gestion CTRL+C
  process.on('SIGINT', () => {
    console.log("\n[dlive_reader] stopping...");
    reader.stop();
    process.exit(0);
  });

  reader.start().catch((err) => {
    console.error("[dlive_reader] failed to start", err);
    process.exit(1);
  });
}

module.exports = { DLiveChatReader };
