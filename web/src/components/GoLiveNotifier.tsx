// web/src/components/GoLiveNotifier.tsx
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthProvider";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type GoLivePayload = {
  type: "go_live";
  slug: string;
  displayName: string;
  title: string;
  startedAt: string | null;
  url: string;
};

export function GoLiveNotifier() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const sockRef = React.useRef<Socket | null>(null);

  React.useEffect(() => {
    // pas de token => pas de notifs persos
    if (!token) {
      try {
        sockRef.current?.disconnect();
      } catch {}
      sockRef.current = null;
      return;
    }

    try {
      sockRef.current?.disconnect();
    } catch {}
    sockRef.current = null;

    const s = io(apiBase(), {
      transports: ["websocket", "polling"],
      auth: { token },
    });

    sockRef.current = s;

    s.on("notify:go_live", (payload: GoLivePayload) => {
      try {
        const slug = String(payload?.slug || "").trim();
        const displayName = String(payload?.displayName || slug || "Un streamer");
        const title = String(payload?.title || "").trim();

        const fallback = slug ? `/s/${encodeURIComponent(slug)}` : "/";
        const target = String(payload?.url || "").trim() || fallback;

        window.dispatchEvent(
          new CustomEvent("ui:toast", {
            detail: {
              kind: "info",
              slot: "top",
              sound: "golive",
              durationMs: 5000,
              dismissible: true,
              title: `${displayName} est en stream !`,
              message: title ? `“${title}”` : "Live",
              action: {
                label: "Rejoindre",
                event: "ui:go_live_open",
                detail: { target, slug },
                dismissOnClick: true,
              },
            },
          })
        );
      } catch {}
    });

    return () => {
      try {
        s.disconnect();
      } catch {}
      sockRef.current = null;
    };
  }, [token]);

  // listener only
  return null;
}
