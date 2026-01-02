import type { Server } from "socket.io";
import { chatStore } from "./chat_store.js";

export function emitSystemChat(io: Server | undefined, slug: string, text: string) {
  if (!io) return;
  const msg = chatStore.addSystem(String(slug), String(text));
  io.to(`chat:${String(slug)}`).emit("chat:message", msg);
}

export function formatSubSystemMessage(p: {
  user: string;
  streamer: string;
  months?: number;           // 1..12 (si tu veux)
  origin?: string | null;    // "self" | "gift" | "admin" | ...
  giftedBy?: string | null;  // si gift
}) {
  const months = Math.max(1, Math.floor(Number(p.months ?? 1) || 1));
  const dur = months === 1 ? "1 mois" : `${months} mois`;
  const origin = p.origin ? ` — origine: ${p.origin}` : "";

  if (p.giftedBy) {
    return `🎁 ${p.giftedBy} offre un SUB (${dur}) à ${p.user} sur ${p.streamer}${origin}`;
  }
  return `⭐ ${p.user} s’abonne à ${p.streamer} (${dur})${origin}`;
}
