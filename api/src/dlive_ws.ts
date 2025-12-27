import WebSocket from "ws";
import { getDliveAppAccessToken } from "./dlive_oauth.js";

function norm(s: string) {
  return String(s || "").trim().toLowerCase();
}

export async function waitForDliveChatCode(opts: {
  streamerUsername: string;              // IMPORTANT: DLive "username" (immutable)
  expectedSenderDisplayname: string;     // ex "LeCasinoze"
  code: string;                          // ex "LL-AB12CD34"
  timeoutMs?: number;                    // default 25s
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const timeoutMs = Math.max(3_000, opts.timeoutMs ?? 25_000);

  const token = await getDliveAppAccessToken();
  if (!token) {
    return { ok: false, error: "DLIVE_APP_TOKEN_MISSING" };
  }

  const ws = new WebSocket("wss://api-ws.dlive.tv");

  const wantSender = norm(opts.expectedSenderDisplayname);
  const wantCode = String(opts.code || "").trim();

  let settled = false;
  const finish = (v: { ok: true } | { ok: false; error: string }) => {
    if (settled) return;
    settled = true;
    try { ws.close(); } catch {}
    return v;
  };

  return await new Promise((resolve) => {
    const to = setTimeout(() => resolve(finish({ ok: false, error: "TIMEOUT" })!), timeoutMs);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "connection_init",
          payload: { authorization: token },
        })
      );
    });

    ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString("utf8"));

        if (msg?.type === "connection_ack") {
          // Subscribe streamMessageReceived(streamer:"<username>")
          ws.send(
            JSON.stringify({
              id: "1",
              type: "start",
              payload: {
                query: `subscription{streamMessageReceived(streamer:"${opts.streamerUsername}"){__typename}}`,
              },
            })
          );
          return;
        }

        if (msg?.type === "data") {
          const arr = msg?.payload?.data?.streamMessageReceived;
          if (!Array.isArray(arr)) return;

          for (const ev of arr) {
            // Chat text message
            if (ev?.__typename !== "ChatText") continue;
            const content = typeof ev?.content === "string" ? ev.content.trim() : "";
            if (content !== wantCode) continue;

            const senderDisplay = typeof ev?.sender?.displayname === "string" ? ev.sender.displayname : "";
            const senderUser = typeof ev?.sender?.username === "string" ? ev.sender.username : "";
            const senderOk = norm(senderDisplay) === wantSender || norm(senderUser) === wantSender;

            if (!senderOk) continue;

            clearTimeout(to);
            resolve(finish({ ok: true })!);
            return;
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("error", () => {
      clearTimeout(to);
      resolve(finish({ ok: false, error: "WS_ERROR" })!);
    });

    ws.on("close", () => {
      if (settled) return;
      clearTimeout(to);
      resolve(finish({ ok: false, error: "WS_CLOSED" })!);
    });
  });
}
