import type { Pool } from "pg";
import type { ChatMsg, StreamerRow } from "../../core/types.js";

export async function tryHandleLunaCommand(opts: {
  pool: Pool;
  streamer: StreamerRow;
  prefix: string;
  msg: ChatMsg;
  send: (t: string) => Promise<void>;
  sendDlive?: (t: string, meta?: { trigger?: string }) => Promise<void>;
  publicBase?: string; // ex: https://lunalive.fr (sinon env côté API/web)
}) {
  const { streamer, prefix, msg, send, sendDlive } = opts;

  const body = String(msg.body || "").trim();
  if (!body.startsWith(prefix)) return false;

  const raw = body.slice(prefix.length).trim();
  const cmd = raw.split(/\s+/g)[0]?.toLowerCase();
  if (cmd !== "luna") return false;

    const base = String(opts.publicBase || process.env.PUBLIC_WEB_BASE || "").replace(/\/$/, "");
    const safeBase = base || "https://lunalive.onrender.com"; // ✅ fallback réel
    const url = `${safeBase}/r/${encodeURIComponent(String(streamer.slug))}`;

  const text = `🌙 Rejoins LunaLive via mon lien pour gagner 50 rubis et 7J abonnement payant au site ! : ${url}`;

  // LunaLive chat
  await send(text);

  // DLive repost (conversion)
  if (sendDlive) {
    await sendDlive(text, { trigger: "cmd:luna" });
  }

  return true;
}
