// bot/src/modules/clips/clip.ts
import type { Pool } from "pg";
import type { ChatMsg, StreamerRow } from "../../core/types.js";
import { createClipForStreamer, formatClipTime, normalizeClipTitle } from "../../shared/clip_service.js";

export async function tryHandleClipCommand(p: {
  pool: Pool;
  streamer: StreamerRow;
  prefix: string;
  msg: ChatMsg;
  send: (text: string) => Promise<void>;
  allowEveryone?: boolean;
}): Promise<boolean> {
  const { msg, prefix } = p;

  const body = String(msg.body || "").trim();
  if (!body.startsWith(prefix)) return false;

  const raw = body.slice(prefix.length).trimStart();
  if (!/^clip(\s|$)/i.test(raw)) return false;

  const allowEveryone = p.allowEveryone ?? true;
  if (!allowEveryone) return false;

  const title = normalizeClipTitle(raw.replace(/^clip\s*/i, ""));

  try {
    const res = await createClipForStreamer({
      pool: p.pool,
      streamerId: p.streamer.id,
      title: title || null,
      author: msg.username || null,
    });

    if (!res.ok) {
      if (res.reason === "duplicate") {
        await p.send("— 🎬 Clip déjà noté (fenêtre proche).");
      } else if (res.reason === "live_not_active") {
        await p.send("— ⏹️ Clip: pas de live détecté (aucun timecode).");
      } else {
        await p.send(`— ❌ Clip: erreur (${res.reason})`);
      }
      return true;
    }

    // Calculer l'offset pour l'affichage
    const nowSec = Math.floor(Date.now() / 1000);
    const offset = nowSec - Math.floor((Date.now() - 30 * 1000) / 1000); // Approximation pour l'affichage
    await p.send(`— 🎬 Clip enregistré${title ? ` : "${title}"` : ""} • ${formatClipTime(offset)}`);
    return true;
  } catch (e: any) {
    await p.send(`— ❌ Clip: erreur (${e?.message || "inconnue"})`);
    return true;
  }
}