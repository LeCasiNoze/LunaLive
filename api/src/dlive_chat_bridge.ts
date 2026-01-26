// api/src/dlive_chat_bridge.ts
import type { Server } from "socket.io";
import type { Pool } from "pg";
import WebSocket from "ws";

const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
const GRAPHIGOSTREAM_WS =
  process.env.DLIVE_GRAPHIGOSTREAM_WS || "wss://graphigostream.prd.dlive.tv";

type Bridge = {
  stop: () => void;
  setFlags: (p: { publicOn: boolean; popupOn: boolean; dliveUsername: string | null }) => void;
};

const bridges = new Map<string, Bridge>();

function norm(s: any) {
  return String(s || "").trim();
}

function escGqlString(s: string) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

async function gql(query: string, variables?: any) {
  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: variables ?? undefined }),
  });
  const j = await r.json();
  return j;
}

function normalizeRestream(senderDisplay: string, senderUsername: string, content: string): {
  username: string;
  body: string;
  restreamFrom?: string | null;
} {
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
    body: body || "", // si jamais c'est vide, on gardera le check plus bas
    restreamFrom: platform || null,
  };
}

/**
 * displayname/slug -> username immutable (dlive-xxxx)
 */
async function resolveImmutableUsername(displaynameOrUsername: string): Promise<string | null> {
  const displayname = norm(displaynameOrUsername);
  if (!displayname) return null;

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

function buildChatSubscriptionQuery(streamerImmutableUsername: string) {
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

function parseCreatedAtMs(createdAt: any): number {
  if (typeof createdAt === "number") return createdAt;
  const t = Date.parse(String(createdAt || ""));
  return Number.isFinite(t) ? t : Date.now();
}

function makeFrontId() {
  // unique-ish front id
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

/**
 * Un bridge par slug.
 * WS DLive -> broadcast socket.io:
 * - chat:${slug}:public
 * - chat:${slug}:popup
 */
export function ensureDliveBridge(opts: {
  io: Server;
  pool: Pool; // (pas utilisé ici, gardé pour compat)
  slug: string;
  dliveUsername: string | null; // displayname/slug côté DLive (ou username direct)
  publicOn: boolean;
  popupOn: boolean;
}) {
  const key = String(opts.slug).toLowerCase();

  const existing = bridges.get(key);
  if (existing) {
    existing.setFlags({
      publicOn: opts.publicOn,
      popupOn: opts.popupOn,
      dliveUsername: opts.dliveUsername,
    });
    return;
  }

  let alive = true;

  let publicOn = !!opts.publicOn;
  let popupOn = !!opts.popupOn;

  // displayname/slug fourni depuis LunaLive settings
  let dliveUsername = opts.dliveUsername ? norm(opts.dliveUsername) : null;

  // resolved immutable username (dlive-xxxx)
  let dliveImmutable: string | null = null;

  // WS state
  let ws: WebSocket | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;

  // cursor/dedup
  const seenIds = new Set<string>();
  const seenQueue: string[] = [];
  const SEEN_MAX = 600; // garde ~600 ids pour éviter les doublons en reconnect

  const addSeen = (id: string) => {
    if (!id) return;
    if (seenIds.has(id)) return;
    seenIds.add(id);
    seenQueue.push(id);
    if (seenQueue.length > SEEN_MAX) {
      const old = seenQueue.shift();
      if (old) seenIds.delete(old);
    }
  };

  const closeWs = () => {
    try {
      if (ws) ws.close();
    } catch {}
    ws = null;
  };

  const scheduleReconnect = (ms: number) => {
    if (!alive) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      start(); // retry
    }, ms);
  };

  const broadcast = (m: {
    id: string;
    content: string;
    createdAt: any;
    sender?: { username?: string; displayname?: string };
  }) => {
    const content = norm(m.content);
    if (!content) return;

    const dliveId = norm(m.id) || "";
    if (dliveId && seenIds.has(dliveId)) return;

    const createdAtMs = parseCreatedAtMs(m.createdAt);
    const senderUsername = norm(m.sender?.username);
    const senderDisplay = norm(m.sender?.displayname) || senderUsername || "DLive";

    // ✅ normalize RestreamBot messages
    const normed = normalizeRestream(senderDisplay, senderUsername, content);
    if (!normed.body) return;

    if (dliveId) addSeen(dliveId);

    const chatMsg = {
      id: makeFrontId(),
      userId: 0,
      username: normed.username,
      body: normed.body,
      createdAt: new Date(createdAtMs).toISOString(),
      cosmetics: null,
      dlive: true,
      dliveSenderUsername: senderUsername || null,
      dliveMsgId: dliveId || null,
      // optionnel si tu veux l’afficher/debug plus tard
      dliveRestreamFrom: normed.restreamFrom ?? null,
    };

    if (publicOn) opts.io.to(`chat:${opts.slug}:public`).emit("chat:message", chatMsg);
    if (popupOn) opts.io.to(`chat:${opts.slug}:popup`).emit("chat:message", chatMsg);
  };

  const startWs = (immutableUsername: string) => {
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
      // legacy "start"
      ws.send(JSON.stringify({ id: "1", type: "start", payload: { query } }));
    };

    ws.on("open", () => {
      if (!ws) return;
      ws.send(JSON.stringify({ type: "connection_init" }));

      // fallback: si ack tarde, on envoie quand même
      setTimeout(() => {
        if (!alive) return;
        sendSub();
      }, 350);
    });

    ws.on("message", (buf: any) => {
      try {
        const raw = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
        const msg = JSON.parse(raw);
        const t = msg?.type;

        if (t === "connection_ack") {
          sendSub();
          return;
        }

        if (t === "connection_error") {
          console.warn("[dlive_bridge] connection_error", key);
          closeWs();
          scheduleReconnect(1200);
          return;
        }

        if (t !== "data") return;

        let payloads = msg?.payload?.data?.streamMessageReceived;
        if (!payloads) return;
        if (!Array.isArray(payloads)) payloads = [payloads];

        for (const ev of payloads) {
          if (ev?.__typename !== "ChatText") continue;
          broadcast({
            id: ev?.id,
            content: ev?.content,
            createdAt: ev?.createdAt,
            sender: ev?.sender,
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("error", (e) => {
      console.warn("[dlive_bridge] ws error", key, (e as any)?.message || e);
      closeWs();
      scheduleReconnect(1200);
    });

    ws.on("close", () => {
      if (!alive) return;
      closeWs();
      scheduleReconnect(1200);
    });
  };

  const start = async () => {
    if (!alive) return;

    // si aucun flag => pas besoin d’ouvrir WS (on économise)
    if (!publicOn && !popupOn) {
      closeWs();
      return;
    }

    const dn = dliveUsername ? norm(dliveUsername) : "";
    if (!dn) {
      closeWs();
      return;
    }

    try {
      const immutable = await resolveImmutableUsername(dn);
      if (!immutable) {
        console.warn("[dlive_bridge] cannot resolve immutable username", key, dn);
        closeWs();
        scheduleReconnect(2500);
        return;
      }

      // si on change de streamer => reset dedup (sinon on risque de filtrer des ids)
      if (dliveImmutable && dliveImmutable !== immutable) {
        seenIds.clear();
        seenQueue.length = 0;
      }

      dliveImmutable = immutable;
      startWs(immutable);
    } catch (e) {
      console.warn("[dlive_bridge] resolve/start error", key, (e as any)?.message || e);
      closeWs();
      scheduleReconnect(2500);
    }
  };

  const bridge: Bridge = {
    stop() {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      closeWs();
    },
    setFlags(p) {
      const nextPublic = !!p.publicOn;
      const nextPopup = !!p.popupOn;
      const nextName = p.dliveUsername ? norm(p.dliveUsername) : null;

      const flagsChanged = nextPublic !== publicOn || nextPopup !== popupOn;
      const nameChanged = nextName !== dliveUsername;

      publicOn = nextPublic;
      popupOn = nextPopup;
      dliveUsername = nextName;

      if (!alive) return;

      // si tout OFF => close
      if (!publicOn && !popupOn) {
        closeWs();
        return;
      }

      // si le pseudo change ou si on n'a pas de WS => restart
      if (nameChanged) {
        dliveImmutable = null;
        closeWs();
        void start();
        return;
      }

      // flags only: si ws fermé, relance
      if (flagsChanged && (!ws || ws.readyState !== ws.OPEN)) {
        void start();
      }
    },
  };

  bridges.set(key, bridge);
  void start();
}
