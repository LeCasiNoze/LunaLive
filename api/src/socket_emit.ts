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
