// api/src/dlive_chat_bridge.ts
import type { Server } from "socket.io";
import type { Pool } from "pg";

const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";

type DliveMsg = {
  id: string;          // id dlive (ou fallback)
  username: string;
  content: string;
  createdAt: number;   // ms
};

function esc(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

async function gql(query: string) {
  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  return j;
}

// ⚠️ À ajuster si tu as déjà une query chat DLive ailleurs.
// Ici on fait une query “best effort” : si ça casse, on le verra en log.
async function fetchDliveLastMessages(dliveUsername: string, limit = 20): Promise<DliveMsg[]> {
  const u = esc(dliveUsername);

  const query = `
  query {
    userByDisplayName(displayname: "${u}") {
      livestream {
        room {
          messages(last: ${Math.max(1, Math.min(50, limit))}) {
            edges {
              node {
                id
                content
                createdAt
                sender {
                  displayname
                }
              }
            }
          }
        }
      }
    }
  }`;

  const j = await gql(query);

  // parsing best-effort
  const edges =
    j?.data?.userByDisplayName?.livestream?.room?.messages?.edges ||
    j?.data?.userByDisplayName?.livestream?.room?.messages ||
    [];

  const out: DliveMsg[] = [];
  for (const e of edges) {
    const n = e?.node || e;
    const id = String(n?.id || "");
    const content = String(n?.content || "").trim();
    const username = String(n?.sender?.displayname || n?.sender?.username || "").trim();

    const createdAtRaw = n?.createdAt;
    const createdAt =
      typeof createdAtRaw === "number"
        ? createdAtRaw
        : createdAtRaw
        ? Date.parse(String(createdAtRaw))
        : Date.now();

    if (!content || !username) continue;
    out.push({ id: id || `${username}:${createdAt}:${content.slice(0, 16)}`, username, content, createdAt });
  }

  // du plus vieux au plus récent
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

/**
 * Un bridge par slug.
 * On poll DLive et on broadcast dans:
 * - chat:${slug}:public si settings.dliveSyncPublic
 * - chat:${slug}:popup  si settings.dliveSyncPopup
 */
type Bridge = {
  stop: () => void;
  setFlags: (p: { publicOn: boolean; popupOn: boolean; dliveUsername: string | null }) => void;
};

const bridges = new Map<string, Bridge>();

export function ensureDliveBridge(opts: {
  io: Server;
  pool: Pool;
  slug: string;              // canonical slug (LunaLive)
  dliveUsername: string | null; // pseudo DLive du streamer
  publicOn: boolean;
  popupOn: boolean;
}) {
  const key = String(opts.slug).toLowerCase();

  let b = bridges.get(key);
  if (b) {
    b.setFlags({ publicOn: opts.publicOn, popupOn: opts.popupOn, dliveUsername: opts.dliveUsername });
    return;
  }

  let alive = true;
  let publicOn = !!opts.publicOn;
  let popupOn = !!opts.popupOn;
  let dliveUsername = opts.dliveUsername;

  let lastSeenId = "";
  let lastSeenAt = 0;

  const pollEveryMs = 1200;

  const tick = async () => {
    if (!alive) return;

    try {
      // si aucun flag ON, on ne poll pas
      if ((!publicOn && !popupOn) || !dliveUsername) {
        // re-tick plus tard quand même (au cas où flags changent)
        setTimeout(tick, pollEveryMs);
        return;
      }

      const msgs = await fetchDliveLastMessages(dliveUsername, 25);

      for (const m of msgs) {
        // dédup simple
        if (m.id && m.id === lastSeenId) continue;
        if (m.createdAt && m.createdAt <= lastSeenAt) continue;

        // avance le curseur
        lastSeenId = m.id || lastSeenId;
        lastSeenAt = Math.max(lastSeenAt, m.createdAt || 0);

        // payload ChatMsg compatible front
        const chatMsg = {
          id: Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`), // id unique “front”
          userId: 0, // externe
          username: m.username,
          body: m.content,
          createdAt: new Date(m.createdAt || Date.now()).toISOString(),
          cosmetics: null,
          dlive: true, // tag optionnel
        };

        if (publicOn) opts.io.to(`chat:${opts.slug}:public`).emit("chat:message", chatMsg);
        if (popupOn) opts.io.to(`chat:${opts.slug}:popup`).emit("chat:message", chatMsg);
      }
    } catch (e) {
      console.warn("[dlive_bridge] poll error", key, (e as any)?.message || e);
    } finally {
      setTimeout(tick, pollEveryMs);
    }
  };

  const bridge: Bridge = {
    stop() {
      alive = false;
    },
    setFlags(p) {
      publicOn = !!p.publicOn;
      popupOn = !!p.popupOn;
      dliveUsername = p.dliveUsername;
    },
  };

  bridges.set(key, bridge);
  tick();
}
