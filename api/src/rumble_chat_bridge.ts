// api/src/rumble_chat_bridge.ts
// Bridge chat Rumble → Luna. SSE depuis web7.rumble.com.
// Persiste les messages dans `chatStore` (visible après reload) + DB `rumble_chat_messages`.

import type { Server as IOServer } from "socket.io";
import type { Pool } from "pg";
import { randomBytes } from "crypto";
import { chatStore } from "./chat_store.js";
import { getRumbleBotSession, hasRumbleBotSession } from "./rumble_chat_session.js";
import { parseBangCommand, handleCallsCommand } from "./calls/commands.js";
import { createClipForStreamer } from "./shared/clip_service.js";
// @ts-ignore - cycletls n'a pas de types TS officiels
import initCycleTLS from "cycletls";

type Bridge = {
  stop: () => void;
  setFlags: (p: { publicOn: boolean; popupOn: boolean; videoIdNumeric: string | null }) => void;
};

const bridges = new Map<string, Bridge>();

function norm(s: any) { return String(s || "").trim(); }

const RUMBLE_CHAT_HOST = "https://web7.rumble.com";

// JA3 fingerprint Chrome 120+ — Rumble/Cloudflare bloque les clients sans
// fingerprint browser. cycletls réplique le handshake TLS de Chrome.
const CHROME_JA3 = "772,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0";

let cycleTlsClient: any = null;
let cycleTlsInitPromise: Promise<any> | null = null;
async function getCycleTLS() {
  if (cycleTlsClient) return cycleTlsClient;
  if (!cycleTlsInitPromise) {
    cycleTlsInitPromise = initCycleTLS().then((c: any) => {
      cycleTlsClient = c;
      return c;
    });
  }
  return cycleTlsInitPromise;
}

type RumbleSseUser = {
  id: string;
  username: string;
};

type RumbleSseMessage = {
  id: string;
  user_id: string;
  text?: string;
  blocks?: any[];
  type?: string;
  time?: string;
};

/** request_ids déjà émis par nous (pour ignorer le rebond SSE de nos propres messages) */
const ownRequestIds = new Set<string>();
function addOwnRequestId(id: string) {
  ownRequestIds.add(id);
  if (ownRequestIds.size > 200) {
    const firstKey = ownRequestIds.values().next().value;
    if (firstKey) ownRequestIds.delete(firstKey);
  }
}

/**
 * Envoie un message dans le chat Rumble d'un live donné.
 * Retourne le message renvoyé par Rumble (avec id, user, etc.) ou null.
 */
export async function sendRumbleMessage(videoIdNumeric: string, text: string): Promise<{ id: string; userId: string } | null> {
  const session = await getRumbleBotSession();
  if (!hasRumbleBotSession(session)) {
    console.warn("[rumble_chat] sendRumbleMessage: no bot session");
    return null;
  }
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  // Rumble accepte ~200 caractères max (config.message_length_max=200 vu dans l'init SSE)
  const body = trimmed.slice(0, 200);
  // request_id: base64 de 43 chars (format observe dans le browser working request).
  // randomBytes(32) → 44 chars base64 (avec padding) → on slice à 43 + strip "=".
  const requestId = randomBytes(32).toString("base64").replace(/=+$/, "").slice(0, 43);
  addOwnRequestId(requestId);

  const payload = JSON.stringify({
    data: {
      request_id: requestId,
      message: { text: body },
      rant: null,
      channel_id: null,
    },
  });

  // Strip les cookies Cloudflare (cf_clearance, __cf_bm) qui sont IP-bound :
  // capturés depuis le browser de l'utilisateur, ils sont incohérents pour
  // une requête venant de Render IP → Rumble retourne 409. On garde uniquement
  // les cookies de session Rumble (u_s, a_s, PHPSESSID, etc.).
  const cleanCookie = (session.cookie || "")
    .split(";")
    .map(c => c.trim())
    .filter(c => c && !/^cf_clearance=/i.test(c) && !/^__cf_bm=/i.test(c))
    .join("; ");

  try {
    const cycle = await getCycleTLS();
    const response = await cycle(`${RUMBLE_CHAT_HOST}/chat/api/chat/${encodeURIComponent(videoIdNumeric)}/message`, {
      body: payload,
      ja3: CHROME_JA3,
      userAgent: session.userAgent || "",
      headers: {
        "accept": "*/*",
        "accept-language": "fr-FR,fr;q=0.9",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "cookie": cleanCookie,
        "origin": "https://rumble.com",
        "pragma": "no-cache",
        "referer": "https://rumble.com/",
        "sec-ch-ua": '"Brave";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "sec-gpc": "1",
      },
    }, "post");

    let status = 0;
    let respBody: any = null;
    let serverHeader = "";
    let cfRay = "";
    try {
      status = Number((response as any)?.status || 0);
      respBody = (response as any)?.body;
      const respHeaders: any = (response as any)?.headers || {};
      serverHeader = String(respHeaders["Server"] || respHeaders["server"] || "");
      cfRay = String(respHeaders["Cf-Ray"] || respHeaders["cf-ray"] || "");
    } catch (parseErr: any) {
      console.warn("[rumble_chat] response shape parse error", parseErr?.message || parseErr);
    }

    if (status < 200 || status >= 300) {
      let snippet = "";
      try {
        snippet = typeof respBody === "string"
          ? respBody.slice(0, 200)
          : (respBody == null ? "(no-body)" : JSON.stringify(respBody).slice(0, 200));
      } catch { snippet = "(unprintable)"; }
      const cleanCookieLen = cleanCookie.length;
      const origCookieLen = (session.cookie || "").length;
      console.warn(`[rumble_chat] send http=${status} server=${serverHeader} cf-ray=${cfRay} content-length=${Buffer.byteLength(payload, "utf8")} cookieLen=${cleanCookieLen}(orig=${origCookieLen}) body=${snippet}`);
      return null;
    }

    // 200 OK : succès. cycletls peut retourner body undefined pour les
    // responses courtes — c'est ok, le message est bien passé.
    let j: any = respBody;
    if (typeof respBody === "string") {
      try { j = JSON.parse(respBody); } catch { j = null; }
    }
    if (j?.errors?.length) {
      console.warn(`[rumble_chat] send rejected by app: ${JSON.stringify(j.errors).slice(0, 200)}`);
      return null;
    }
    const id = j?.data?.id ? String(j.data.id) : "";
    const userId = j?.data?.user?.id ? String(j.data.user.id) : "";
    // Fallback : si pas de body parsable, considère que c'est ok puisque status=200
    return { id: id || `rumble_${Date.now()}`, userId: userId || "" };
  } catch (e) {
    console.error("[rumble_chat] sendRumbleMessage error", e);
    return null;
  }
}

/**
 * Connecte le flux SSE chat Rumble pour un live donné.
 * Appelle `onMessage` pour chaque nouveau message (init + messages incrémentaux).
 * Retourne une fonction `stop` ou null si la connexion échoue immédiatement.
 */
async function connectChatSse(
  videoIdNumeric: string,
  onMessage: (m: { msgId: string; userId: string; username: string; text: string; createdAt: Date; requestId: string | null }) => void,
  onClose: () => void
): Promise<(() => void) | null> {
  const session = await getRumbleBotSession();
  if (!hasRumbleBotSession(session)) {
    console.warn("[rumble_chat] connectChatSse: no bot session");
    return null;
  }

  const ac = new AbortController();
  let stopped = false;

  // Map user_id → username, accumulée à partir des arrays `users` de chaque event.
  const userById = new Map<string, string>();

  function ingestUsers(arr: any) {
    if (!Array.isArray(arr)) return;
    for (const u of arr as RumbleSseUser[]) {
      if (u?.id && u?.username) userById.set(String(u.id), String(u.username));
    }
  }

  function handleEnvelope(env: any) {
    const type = env?.type;
    const data = env?.data;
    if (!data) return;

    const reqId = env?.request_id ? String(env.request_id) : null;
    const isOwn = !!(reqId && ownRequestIds.has(reqId));

    if (type === "init") {
      ingestUsers(data.users);
      // À l'init on a un dump des derniers messages — on les passe à `onMessage`
      // (la persist + dédup DB garantit qu'on n'émet pas de doublons).
      const msgs: RumbleSseMessage[] = Array.isArray(data.messages) ? data.messages : [];
      for (const m of msgs) emitOne(m, reqId, isOwn);
      return;
    }

    if (type === "messages") {
      ingestUsers(data.users);
      const msgs: RumbleSseMessage[] = Array.isArray(data.messages) ? data.messages : [];
      for (const m of msgs) emitOne(m, reqId, isOwn);
      return;
    }

    // autres types ignorés (delete, mute, rant…)
  }

  function emitOne(m: RumbleSseMessage, reqId: string | null, isOwn: boolean) {
    if (!m?.id || !m?.user_id) return;
    if (isOwn) return; // ignore le rebond de nos propres messages
    const text = String(m.text ?? "").trim();
    if (!text) return;
    const username = userById.get(String(m.user_id)) || `rumble_${m.user_id}`;
    const createdAt = m.time ? new Date(m.time) : new Date();
    onMessage({
      msgId: String(m.id),
      userId: String(m.user_id),
      username,
      text,
      createdAt: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
      requestId: reqId,
    });
  }

  (async () => {
    try {
      const r = await fetch(`${RUMBLE_CHAT_HOST}/chat/api/chat/${encodeURIComponent(videoIdNumeric)}/stream`, {
        method: "GET",
        signal: ac.signal,
        headers: {
          "user-agent": session.userAgent || "",
          "cookie": session.cookie || "",
          "accept": "text/event-stream",
          "cache-control": "no-cache",
          "origin": "https://rumble.com",
          "referer": "https://rumble.com/",
        },
      });

      if (!r.ok || !r.body) {
        console.warn(`[rumble_chat] SSE connect http=${r.status}`);
        if (!stopped) onClose();
        return;
      }

      console.log(`[rumble_chat] SSE connected for vid=${videoIdNumeric}`);

      const reader = r.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";

      // Parse SSE: les events sont séparés par "\n\n", chaque event a une ou plusieurs
      // lignes "field: value". On s'intéresse à `data:` (concaténer si plusieurs).
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
            // event: name → on l'ignore, le `type` est dans le JSON
          }
          if (dataLines.length === 0) continue;
          const json = dataLines.join("\n");
          try {
            const env = JSON.parse(json);
            handleEnvelope(env);
          } catch (e: any) {
            console.warn("[rumble_chat] SSE parse error", e?.message || e, json.slice(0, 120));
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.warn("[rumble_chat] SSE error", e?.message || e);
      }
    } finally {
      if (!stopped) onClose();
    }
  })();

  return () => {
    stopped = true;
    try { ac.abort(); } catch {}
  };
}

export function ensureRumbleBridge(opts: {
  io: IOServer;
  pool: Pool;
  slug: string;
  streamerId: number;
  streamerOwnerUserId: number | null;
  videoIdNumeric: string | null;
  publicOn: boolean;
  popupOn: boolean;
}) {
  const key = String(opts.slug).toLowerCase();
  const existing = bridges.get(key);
  if (existing) {
    existing.setFlags({ publicOn: opts.publicOn, popupOn: opts.popupOn, videoIdNumeric: opts.videoIdNumeric });
    return;
  }

  let alive = true;
  let publicOn = !!opts.publicOn;
  let popupOn = !!opts.popupOn;
  let videoIdNumeric = opts.videoIdNumeric ? norm(opts.videoIdNumeric) : null;
  let stopStream: (() => void) | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;

  // Dédup en mémoire (la DB a aussi son unique index, mais ça évite des INSERT inutiles)
  const seenIds = new Set<string>();
  const seenQueue: string[] = [];
  const SEEN_MAX = 600;
  const addSeen = (id: string) => {
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    seenQueue.push(id);
    if (seenQueue.length > SEEN_MAX) {
      const old = seenQueue.shift();
      if (old) seenIds.delete(old);
    }
  };

  async function persistMessage(msgId: string, rumbleUserId: string, username: string, body: string, createdAt: Date) {
    try {
      // 1. Archive dédiée Rumble (avec rumble_user_id pour cross-ref)
      await opts.pool.query(
        `INSERT INTO rumble_chat_messages (streamer_id, rumble_msg_id, rumble_user_id, username, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (streamer_id, rumble_msg_id) WHERE rumble_msg_id IS NOT NULL DO NOTHING`,
        [opts.streamerId, msgId, rumbleUserId, username, body, createdAt]
      );
      // 2. Mirror dans chat_messages avec marqueur external_source='rumble'.
      //    Permet au bot service de polller chat_messages comme source unique
      //    et de dispatcher les commandes (!ping, !discord…) configurées dans
      //    bot_commands pour les viewers Rumble exactement comme pour Luna.
      await opts.pool.query(
        `INSERT INTO chat_messages (streamer_id, user_id, username, body, created_at, external_source, external_msg_id)
         VALUES ($1, 0, $2, $3, $4, 'rumble', $5)
         ON CONFLICT (streamer_id, external_source, external_msg_id) WHERE external_source IS NOT NULL AND external_msg_id IS NOT NULL DO NOTHING`,
        [opts.streamerId, username, body, createdAt, msgId]
      );
    } catch (e: any) {
      console.warn(`[rumble_chat] persist error`, opts.slug, e?.message || e);
    }
  }

  function broadcast(m: { msgId: string; userId: string; username: string; text: string; createdAt: Date }) {
    if (m.msgId && seenIds.has(m.msgId)) return;
    if (m.msgId) addSeen(m.msgId);

    // Persist DB (fire-and-forget — l'unique index empêche les doublons)
    persistMessage(m.msgId, m.userId, m.username, m.text, m.createdAt).catch(() => {});

    // chatStore (mémoire — sert au /chat/messages au reload)
    const stored = chatStore.addMessage(opts.slug, {
      userId: 0,
      username: m.username,
      body: m.text,
    });

    const payload = {
      ...stored,
      rumble: true,
      rumbleSenderUserId: m.userId,
      rumbleMsgId: m.msgId,
    };

    if (publicOn) opts.io.to(`chat:${opts.slug}:public`).emit("chat:message", payload);
    if (popupOn) opts.io.to(`chat:${opts.slug}:popup`).emit("chat:message", payload);

    // Bang commands
    const bang = parseBangCommand(m.text);
    if (bang) {
      // !clip: dispatché directement vers createClipForStreamer
      // (pas géré par handleCallsCommand qui ne fait que call/pcall/etc.)
      if (bang.cmd === "clip") {
        const title = (bang.arg || "").trim() || null;
        void createClipForStreamer({
          pool: opts.pool,
          streamerId: opts.streamerId,
          title,
          author: m.username || null,
        }).then(async (res) => {
          if (res.ok) {
            await sendRumbleMessage(videoIdNumeric || "", `🎬 Clip enregistré${title ? ` : "${title}"` : ""}`);
          } else if (res.reason === "duplicate") {
            await sendRumbleMessage(videoIdNumeric || "", `🎬 Clip déjà noté (fenêtre proche)`);
          } else if (res.reason === "live_not_active") {
            await sendRumbleMessage(videoIdNumeric || "", `⏹️ Clip: pas de live détecté`);
          } else {
            await sendRumbleMessage(videoIdNumeric || "", `❌ Clip: ${res.reason}`);
          }
        }).catch((e: any) => console.warn("[rumble_chat] clip error", opts.slug, e?.message || e));
      } else {
        // Autres commandes (call, pcall, …) — même comportement que DLive
        handleCallsCommand({
          pool: opts.pool,
          io: opts.io,
          slug: opts.slug,
          streamerId: opts.streamerId,
          streamerOwnerUserId: opts.streamerOwnerUserId,
          actorUserId: 0,
          actorUsername: m.username,
          actorRole: "viewer",
          canMod: false,
          cmd: bang.cmd,
          arg: bang.arg,
        }).catch((e: any) =>
          console.warn("[rumble_chat] handleCallsCommand error", opts.slug, e?.message || e)
        );
      }
    }
  }

  function scheduleReconnect(ms: number) {
    if (!alive) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void start();
    }, ms);
  }

  async function start() {
    if (!alive) return;
    if (!videoIdNumeric) {
      console.log(`[rumble_chat] ${opts.slug}: no videoIdNumeric yet, idle`);
      return;
    }

    stopStream = await connectChatSse(
      videoIdNumeric,
      (m) => broadcast(m),
      () => {
        // disconnect → essayer de reconnecter dans 5s tant que le bridge est vivant
        stopStream = null;
        if (alive) {
          console.log(`[rumble_chat] ${opts.slug}: SSE closed, reconnecting in 5s`);
          scheduleReconnect(5_000);
        }
      }
    );
    if (!stopStream) {
      // session manquante ou échec immédiat — retry plus tard
      scheduleReconnect(30_000);
    }
  }

  const bridge: Bridge = {
    stop: () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      try { stopStream?.(); } catch {}
      stopStream = null;
      bridges.delete(key);
      console.log(`[rumble_chat] ${opts.slug}: bridge stopped`);
    },
    setFlags: (p) => {
      publicOn = !!p.publicOn;
      popupOn = !!p.popupOn;
      const newVid = p.videoIdNumeric ? norm(p.videoIdNumeric) : null;
      if (newVid !== videoIdNumeric) {
        videoIdNumeric = newVid;
        try { stopStream?.(); } catch {}
        stopStream = null;
        if (videoIdNumeric) void start();
      }
    },
  };
  bridges.set(key, bridge);

  void start();
  console.log(`[rumble_chat] ${opts.slug}: bridge created (vid=${videoIdNumeric})`);
}

export function stopRumbleBridge(slug: string) {
  const b = bridges.get(String(slug).toLowerCase());
  b?.stop();
}
