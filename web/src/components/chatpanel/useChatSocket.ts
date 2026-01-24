// web/src/components/chatpanel/useChatSocket.ts
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import {
  normalizeAppearance,
  type StreamerAppearance,
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
} from "../../lib/appearance";
import { apiBase } from "./chatpanel.helpers";
import type { ChatMsg, JoinAck, ChatSettings } from "./chatpanel.helpers";

export function useChatSocket(opts: {
  slug: string;
  token: string | null;
  autoFocus: boolean;
  onRequireLogin: () => void;
  onFollowsCount?: (n: number) => void;
  onAfterJoin?: () => void;
}) {
  const { slug, token, autoFocus, onFollowsCount, onAfterJoin } = opts;

  const sockRef = React.useRef<Socket | null>(null);

  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [join, setJoin] = React.useState<JoinAck | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [appearance, setAppearance] = React.useState<StreamerAppearance>(
    DEFAULT_STREAMER_APPEARANCE
  );
  const [initialLoading, setInitialLoading] = React.useState(true);

  const [chatSettings, setChatSettings] = React.useState<ChatSettings>({
    allowLinks: true,
    followOnly: false,
    subOnly: false,
    dliveSyncPublic: false,
    dliveSyncPopup: false,
  });

  function emitSocket(event: string, payload: any) {
    return new Promise<any>((resolve) => {
      sockRef.current?.emit(event as any, payload, (ack: any) => resolve(ack));
    });
  }

  async function loadLastMessages(s: string) {
    try {
      setInitialLoading(true);
      const r = await fetch(
        `${apiBase()}/chat/${encodeURIComponent(s)}/messages?limit=50`
      );
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "messages_failed");
      setMessages(j.messages || []);
    } finally {
      setInitialLoading(false);
    }
  }

  async function fetchSettings() {
    if (!token) return;
    try {
      const st = await emitSocket("chat:settings_get", { slug });
      if (st?.ok && st.settings) {
        setChatSettings({
          allowLinks: !!st.settings.allowLinks,
          followOnly: !!st.settings.followOnly,
          subOnly: !!st.settings.subOnly,
          dliveSyncPublic: !!st.settings.dliveSyncPublic,
          dliveSyncPopup: !!st.settings.dliveSyncPopup,
        });
      }
    } catch {}
  }

  React.useEffect(() => {
    const s = String(slug || "").trim();
    const slugLower = s.toLowerCase();
    if (!s) return;

    setMessages([]);
    setJoin(null);
    setError(null);
    setInitialLoading(true);

    try {
      sockRef.current?.disconnect();
    } catch {}
    sockRef.current = null;

    const socket = io(apiBase(), {
      transports: ["websocket", "polling"],
      withCredentials: false,
      auth: token ? { token } : {},
    });

    sockRef.current = socket;

    socket.on("connect_error", (e: any) => {
      setError(String(e?.message || "socket_connect_error"));
    });

    socket.on("ui:toast", (payload: any) => {
      if (!payload?.title) return;
      window.dispatchEvent(new CustomEvent("ui:toast", { detail: payload }));
    });

    socket.on("chat:message", (msg: ChatMsg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > 50) next.splice(0, next.length - 50);
        return next;
      });
    });

    socket.on("chat:settings", (payload: any) => {
      if (!payload?.ok) return;
      const st = payload.settings || {};
      setChatSettings({
        allowLinks: !!st.allowLinks,
        followOnly: !!st.followOnly,
        subOnly: !!st.subOnly,
        dliveSyncPublic: !!st.dliveSyncPublic,
        dliveSyncPopup: !!st.dliveSyncPopup,
      });
    });

    socket.on("stream:follows", (payload: any) => {
      const evSlug = String(payload?.slug || "").trim().toLowerCase();
      if (!evSlug || evSlug !== slugLower) return;

      const n = Number(payload?.followsCount);
      if (!Number.isFinite(n)) return;

      onFollowsCount?.(n);
    });

    socket.on("chat:cleared", () => {
      setMessages([]);
    });

    socket.on("chat:message_deleted", (payload: any) => {
      const id = Number(payload?.id || 0);
      if (!id) return;
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    socket.on("chat:perms", (ack: JoinAck) => {
      if (!ack?.ok) return;
      setJoin((prev) => ({ ...(prev || {}), ...ack }));
      if (ack?.appearance) setAppearance(normalizeAppearance(ack.appearance));
    });

    socket.on("chat:appearance", (payload: any) => {
      if (!payload?.ok) return;
      setAppearance(normalizeAppearance(payload.appearance));
    });

    socket.on("chat:moderation_changed", () => {
      socket.emit("chat:refresh", { slug: s });
    });

    socket.emit("chat:join", { slug: s }, async (ack: JoinAck) => {
      if (!ack?.ok) {
        setJoin(null);
        setError(ack?.error || "join_failed");
        setInitialLoading(false);
        return;
      }

      setJoin(ack);
      setError(null);
      setAppearance(normalizeAppearance(ack.appearance));

      await loadLastMessages(s);

      if (ack?.role === "mod" || ack?.role === "streamer" || ack?.role === "admin") {
        await fetchSettings();
      }

      onAfterJoin?.();

      if (autoFocus) {
        window.setTimeout(() => {
          (document.activeElement as any)?.blur?.();
        }, 50);
      }
    });

    return () => {
      try {
        try {
          socket.off("stream:follows");
        } catch {}
        socket.disconnect();
      } catch {}
    };
  }, [slug, token, autoFocus, onFollowsCount, onAfterJoin]);

  return {
    sockRef,
    emitSocket,

    messages,
    setMessages,

    join,
    setJoin,

    appearance,
    setAppearance,

    chatSettings,
    setChatSettings,

    initialLoading,
    setInitialLoading,

    error,
    setError,

    fetchSettings,
    loadLastMessages,
  };
}
