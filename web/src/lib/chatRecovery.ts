import type { Socket } from "socket.io-client";

// Keep live messages received while the authoritative history request was in flight.
export function reconcileChatHistory<T extends { id: number; createdAt?: string }>(history: T[], arrived: T[], local: T[] = []): T[] {
  const messages = new Map(history.map(message => [message.id, message]));
  for (const message of local) messages.set(message.id, message);
  for (const message of arrived) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  }).slice(-50);
}

export function startChatRecovery(socket: Socket, options: {
  slug: string;
  mode: "popup" | "public";
  onJoined: (ack: any) => void;
  onSync: () => void;
  onStatus: (connected: boolean) => void;
  onError: (error: string) => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  let disposed = false;
  let generation = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const clearPending = () => { clearTimeout(pending); pending = undefined; };
  const probe = (join: boolean) => {
    if (disposed || pending || !socket.connected) return;
    const version = ++generation;
    pending = setTimeout(() => {
      pending = undefined;
      generation++;
      options.onStatus(false);
      socket.disconnect().connect();
    }, options.timeoutMs ?? 10000);
    socket.emit(join ? "chat:join" : "chat:refresh", { slug: options.slug, mode: options.mode }, (ack: any) => {
      if (disposed || version !== generation) return;
      clearPending();
      if (!ack?.ok) {
        options.onStatus(false);
        options.onError(ack?.error || "join_failed");
        if (!join) socket.disconnect().connect();
        return;
      }
      options.onStatus(true);
      if (join) options.onJoined(ack);
      else options.onSync();
    });
  };
  const onConnect = () => { clearPending(); probe(true); };
  const onDisconnect = () => { generation++; clearPending(); options.onStatus(false); };
  const recover = () => {
    if (disposed) return;
    if (!socket.connected) socket.connect();
    else probe(false);
  };
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  const interval = setInterval(recover, options.intervalMs ?? 60000);
  if (socket.connected) onConnect();
  return {
    recover,
    dispose() {
      disposed = true;
      generation++;
      clearPending();
      clearInterval(interval);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    },
  };
}
