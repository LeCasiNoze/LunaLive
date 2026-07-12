// api/src/socket_emit.ts
import type { Server } from "socket.io";

function slugRoom(slug: string) {
  return String(slug || "").trim().toLowerCase();
}

export function emitChatAll(io: Server, slug: string, event: string, payload: any) {
  const s = slugRoom(slug);
  io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit(event, payload);
}

export function emitStream(io: Server, slug: string, event: string, payload: any) {
  const s = slugRoom(slug);
  io.to(`stream:${s}`).emit(event, payload);
}

// si tu veux “tout le monde” (chat + stream)
export function emitChatAndStream(io: Server, slug: string, event: string, payload: any) {
  emitChatAll(io, slug, event, payload);
  emitStream(io, slug, event, payload);
}

// ─────────────────────────────────────────────────────────────────────────
// Carte SPÉCIALE (raid/follow/sub/don/boss/level/combo/rain/wheel/predict/
// chest) émise dans le chat depuis n'importe quel système LunaLive (follow,
// achat de sub, boss vaincu, level up, lancement rain…). Même format que
// POST /internal/bot/chat/special, factorisé. Éphémère (non persisté).
export type SpecialType =
  | "raid" | "follow" | "combo" | "sub" | "don"
  | "chest" | "rain" | "wheel" | "predict" | "boss" | "level";

let __specialSeq = 0;
export function emitSpecialCard(
  io: Server | null | undefined,
  slug: string,
  type: SpecialType,
  data: Record<string, any> = {},
  username = "LunaLive"
): boolean {
  if (!io) return false;
  const s = slugRoom(slug);
  if (!s) return false;
  __specialSeq = (__specialSeq + 1) % 100000;
  // id synthétique négatif : jamais en collision avec les BIGSERIAL positifs.
  const id = -(Date.now() * 100000 + __specialSeq);
  const msg = {
    id, userId: 0, username: String(username || "LunaLive"),
    body: "", createdAt: new Date().toISOString(),
    type, data: data && typeof data === "object" ? data : {},
  };
  try {
    io.to(`chat:${s}:public`).to(`chat:${s}:popup`).emit("chat:message", msg);
    return true;
  } catch {
    return false;
  }
}
