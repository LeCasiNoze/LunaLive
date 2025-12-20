import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useNavigate } from "react-router-dom";
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
  const nav = useNavigate();
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const sockRef = React.useRef<Socket | null>(null);
  const timerRef = React.useRef<number | null>(null);

  const [toast, setToast] = React.useState<GoLivePayload | null>(null);
  const [visible, setVisible] = React.useState(false);

  const hide = React.useCallback(() => {
    setVisible(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  React.useEffect(() => {
    // pas de token => pas de notifs persos
    if (!token) {
      try { sockRef.current?.disconnect(); } catch {}
      sockRef.current = null;
      hide();
      return;
    }

    try { sockRef.current?.disconnect(); } catch {}
    sockRef.current = null;

    const s = io(apiBase(), {
      transports: ["websocket", "polling"],
      auth: { token },
    });

    sockRef.current = s;

    s.on("notify:go_live", (payload: GoLivePayload) => {
      setToast(payload);
      setVisible(true);

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setVisible(false);
        timerRef.current = null;
      }, 5000);
    });

    return () => {
      try { s.disconnect(); } catch {}
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [token, hide]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: visible ? "auto" : "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 160ms ease",
        width: "min(520px, calc(100vw - 24px))",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          hide();
          const fallback = `/s/${encodeURIComponent(toast.slug)}`;
            const target = toast.url || fallback;

            if (/^https?:\/\//i.test(target)) window.location.href = target;
            else nav(target);

        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            hide();
            const fallback = `/s/${encodeURIComponent(toast.slug)}`;
            const target = toast.url || fallback;

            if (/^https?:\/\//i.test(target)) window.location.href = target;
            else nav(target);

          }
        }}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: 14,
          borderRadius: 16,
          background: "rgba(20, 16, 32, 0.92)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 16px 60px rgba(0,0,0,0.45)",
          cursor: "pointer",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.1 }}>
            <span style={{ opacity: 0.9 }}>{toast.displayName}</span> est en stream !
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            “{toast.title || "Live"}” <span style={{ opacity: 0.75 }}>— clique pour rejoindre</span>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hide();
          }}
          aria-label="Fermer"
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.85)",
            fontSize: 18,
            fontWeight: 900,
            cursor: "pointer",
            padding: "2px 6px",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
