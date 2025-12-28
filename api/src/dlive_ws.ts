// api/src/dlive_ws.ts
import WebSocket from "ws";

const GRAPHIGOSTREAM_WS =
  process.env.DLIVE_GRAPHIGOSTREAM_WS || "wss://graphigostream.prd.dlive.tv";

function escGqlString(s: string) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

function norm(s: string) {
  return String(s || "").trim();
}

export async function waitForDliveChatCode(opts: {
  streamerUsername: string; // DLive username immutable (dlive-xxxx)
  code: string;             // ex: LL-AB12CD34
  timeoutMs?: number;       // default 25s
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const timeoutMs = Math.max(3_000, opts.timeoutMs ?? 25_000);

  const streamerUsername = norm(opts.streamerUsername);
  const wantCode = norm(opts.code);

  if (!streamerUsername || !wantCode) {
    return { ok: false, error: "bad_request" };
  }

  const ws = new WebSocket(
    GRAPHIGOSTREAM_WS,
    "graphql-ws", // 👈 legacy subprotocol utilisé par DLive
    {
      headers: {
        Origin: "https://dlive.tv",
        Referer: `https://dlive.tv/`,
        "User-Agent": "Mozilla/5.0",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    }
  );

  let settled = false;
  let subSent = false;

  const finish = (v: { ok: true } | { ok: false; error: string }) => {
    if (settled) return v;
    settled = true;
    try { ws.close(); } catch {}
    return v;
  };

  const sendSub = () => {
    if (subSent) return;
    subSent = true;

    const streamer = escGqlString(streamerUsername);
    const query = `
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

    // DLive accepte "start" (legacy)
    ws.send(JSON.stringify({ id: "1", type: "start", payload: { query } }));
  };

  return await new Promise((resolve) => {
    const to = setTimeout(() => resolve(finish({ ok: false, error: "TIMEOUT" })), timeoutMs);

    ws.on("open", () => {
      // init (pas d'auth)
      ws.send(JSON.stringify({ type: "connection_init" }));

      // fallback “simple” : si jamais on ne reçoit pas ack, on envoie la sub quand même
      setTimeout(() => {
        if (!settled) sendSub();
      }, 350);
    });

    ws.on("message", (buf: any) => {
      try {
        const msg = JSON.parse(Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf));

        const t = msg?.type;

        if (t === "connection_ack") {
          sendSub();
          return;
        }

        if (t === "connection_error") {
          clearTimeout(to);
          resolve(finish({ ok: false, error: "WS_CONNECTION_ERROR" }));
          return;
        }

        if (t !== "data") return;

        let payloads = msg?.payload?.data?.streamMessageReceived;
        if (!Array.isArray(payloads)) payloads = payloads ? [payloads] : [];
        if (!payloads.length) return;

        for (const ev of payloads) {
          if (ev?.__typename !== "ChatText") continue;

          const content = norm(ev?.content);
          if (content !== wantCode) continue;

          const senderUser = norm(ev?.sender?.username);
          if (senderUser !== streamerUsername) continue;

          clearTimeout(to);
          resolve(finish({ ok: true }));
          return;
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("error", () => {
      clearTimeout(to);
      resolve(finish({ ok: false, error: "WS_ERROR" }));
    });

    ws.on("close", () => {
      if (settled) return;
      clearTimeout(to);
      resolve(finish({ ok: false, error: "WS_CLOSED" }));
    });
  });
}
