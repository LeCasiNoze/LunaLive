// api/src/calls/toast.ts
import type { Server } from "socket.io";

export type UiToast = {
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
};

export function emitUserToast(io: Server, userId: number, toast: UiToast) {
  if (!userId) return;
  io.to(`user:${userId}`).emit("ui:toast", toast);
}
