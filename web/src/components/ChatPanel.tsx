// web/src/components/ChatPanel.tsx
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthProvider";

type ChatMsg = {
  id: number;
  userId: number;
  username: string;
  body: string;
  deleted?: boolean;
  createdAt: string;
};

type JoinAck = {
  ok: boolean;
  error?: string;
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  perms?: {
    canSend: boolean;
    canDelete: boolean;
    canTimeout: boolean;
    canBan: boolean;
    canClear: boolean;
    canMod: boolean;
    canManageMods: boolean;
  };
  state?: {
    banned: boolean;
    timeoutUntil?: string | null;
  };
  me?: { id: number; username: string; role: string } | null;
};

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

function fmtRemaining(untilIso?: string | null) {
  if (!untilIso) return "";
  const t = new Date(untilIso).getTime() - Date.now();
  if (t <= 0) return "0s";
  const s = Math.ceil(t / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.ceil(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.ceil(h / 24);
  return `${d}j`;
}

export function ChatPanel({ slug, onRequireLogin }: { slug: string; onRequireLogin: () => void }) {
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const [join, setJoin] = React.useState<JoinAck | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { token } = useAuth();

  const sockRef = React.useRef<Socket | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const [menu, setMenu] = React.useState<{
    open: boolean;
    x: number;
    y: number;
    msg: ChatMsg | null;
    modLoading?: boolean;
    isTargetMod?: boolean | null;
  }>({ open: false, x: 0, y: 0, msg: null, isTargetMod: null, modLoading: false });

  function closeMenu() {
    setMenu({ open: false, x: 0, y: 0, msg: null, isTargetMod: null, modLoading: false });
  }

  // load last messages
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const r = await fetch(`${apiBase()}/chat/${encodeURIComponent(slug)}/messages?limit=50`);
        const j = await r.json();
        if (cancelled) return;
        if (!j?.ok) throw new Error(j?.error || "messages_failed");
        setMessages(j.messages || []);
        requestAnimationFrame(() => {
          const el = listRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || "messages_failed"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  React.useEffect(() => {
    if (!join?.state?.timeoutUntil) return;

    const until = new Date(join.state.timeoutUntil).getTime();
    const ms = until - Date.now() + 250; // petit buffer
    if (ms <= 0) {
      sockRef.current?.emit("chat:refresh", { slug });
      return;
    }

  const t = window.setTimeout(() => {
    // ✅ UI instantanée : on enlève le timeout local
    setJoin((prev) =>
      prev ? { ...prev, state: { ...(prev.state || { banned: false }), timeoutUntil: null } } : prev
    );

    // ✅ resync serveur
    sockRef.current?.emit("chat:refresh", { slug });
  }, ms);

    return () => window.clearTimeout(t);
  }, [slug, join?.state?.timeoutUntil]);

  // socket connect + join (reconnect when token changes)
  React.useEffect(() => {
    const s = String(slug || "").trim();
    if (!s) return;

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

    socket.on("chat:message", (msg: ChatMsg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > 50) next.splice(0, next.length - 50);
        return next;
      });
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });

    socket.on("chat:cleared", () => setMessages([]));

    socket.on("chat:message_deleted", (payload: any) => {
      const id = Number(payload?.id || 0);
      if (!id) return;
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    socket.on("chat:perms", (ack: JoinAck) => {
      if (!ack?.ok) return;
      setJoin((prev) => ({ ...(prev || {}), ...ack }));
    });

    socket.emit("chat:join", { slug: s }, (ack: JoinAck) => {
      if (!ack?.ok) {
        setJoin(null);
        setError(ack?.error || "join_failed");
        return;
      }
      setJoin(ack);
      setError(null);
    });

    return () => {
      try {
        socket.disconnect();
      } catch {}
    };
  }, [slug, token]);

  const perms = join?.perms;
  const state = join?.state;

  const isAuthed = !!token;
  const isBanned = !!state?.banned;
  const timeoutUntil = state?.timeoutUntil || null;
  const isTimedOut = !!timeoutUntil && new Date(timeoutUntil).getTime() > Date.now();

  const canSend = isAuthed && !isBanned && !isTimedOut;

  function emitSocket(event: string, payload: any) {
    return new Promise<any>((resolve) => {
      sockRef.current?.emit(event as any, payload, (ack: any) => resolve(ack));
    });
  }

  async function send() {
    setError(null);

    if (!isAuthed) {
      onRequireLogin();
      return;
    }
    if (isBanned) return setError("Tu es banni de ce chat.");
    if (isTimedOut) return setError(`Tu es en timeout (${fmtRemaining(timeoutUntil)}).`);

    const text = input.replace(/\r/g, "").trim();
    if (!text) return;

    setSending(true);
    try {
      await new Promise<void>((resolve) => {
        sockRef.current?.emit("chat:send", { slug, body: text }, (ack: any) => {
          if (!ack?.ok) {
            if (ack?.error === "auth_required") onRequireLogin();
            else if (ack?.error === "rate_limited") setError("Trop vite (slow mode 0.2s).");
            else if (ack?.error === "banned") setError("Tu es banni de ce chat.");
            else if (ack?.error === "timed_out") {
              const ex = String(ack?.expiresAt || "");
              setJoin((prev) =>
                prev
                  ? { ...prev, state: { ...(prev.state || { banned: false }), timeoutUntil: ex } }
                  : prev
              );
              setError(`Tu es en timeout (${fmtRemaining(ex)}).`);
            }

            else setError(String(ack?.error || "send_failed"));
          } else {
            setInput("");
          }
          resolve();
        });
      });
    } finally {
      setSending(false);
    }
  }

  async function openMenu(e: React.MouseEvent, msg: ChatMsg) {
    if (!perms?.canMod) return;
    if (msg.userId <= 0) return;

    e.preventDefault();
    e.stopPropagation();

    setMenu({ open: true, x: e.clientX, y: e.clientY, msg, isTargetMod: null, modLoading: false });

    // si owner/admin: on récupère le status mod du target
    if (perms?.canManageMods) {
      setMenu((m) => ({ ...m, modLoading: true }));
      const ack = await emitSocket("chat:mod_status", { slug, userId: msg.userId });
      if (ack?.ok) {
        setMenu((m) => ({ ...m, modLoading: false, isTargetMod: !!ack.isMod }));
      } else {
        setMenu((m) => ({ ...m, modLoading: false, isTargetMod: null }));
      }
    }
  }

  async function doDelete(msg: ChatMsg) {
    closeMenu();
    const ack = await emitSocket("chat:delete", { slug, messageId: msg.id });
    if (!ack?.ok) setError(String(ack?.error || "delete_failed"));
  }

  async function doTimeout(msg: ChatMsg, seconds: number) {
    closeMenu();
    const ack = await emitSocket("chat:timeout", { slug, userId: msg.userId, seconds });
    if (!ack?.ok) setError(String(ack?.error || "timeout_failed"));
  }

  async function doBan(msg: ChatMsg) {
    closeMenu();
    const ok = window.confirm(`Bannir ${msg.username} ?`);
    if (!ok) return;
    const ack = await emitSocket("chat:ban", { slug, userId: msg.userId });
    if (!ack?.ok) setError(String(ack?.error || "ban_failed"));
  }

  async function doSetMod(msg: ChatMsg, enabled: boolean) {
    closeMenu();
    const ack = await emitSocket("chat:mod_set", { slug, userId: msg.userId, enabled });
    if (!ack?.ok) setError(String(ack?.error || "mod_set_failed"));
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }} onClick={closeMenu}>
      {/* header */}
      <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>Chat</div>
        <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
          {join?.role ? `Rôle: ${join.role}` : "…"}
          {isBanned ? " • banni" : isTimedOut ? ` • timeout ${fmtRemaining(timeoutUntil)}` : ""}
        </div>
      </div>

      {/* messages */}
      <div
        ref={listRef}
        style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
      >
        {messages.map((m) => {
          const isSystem = m.userId === 0;
          const isDeleted = !!m.deleted || m.body === "";
          if (m.userId !== 0 && isDeleted) return null;
          return (
            <div
              key={m.id}
              onContextMenu={(e) => openMenu(e, m)}
              onClick={(e) => openMenu(e, m)} // (MVP) click = menu ; on peut passer en long-press plus tard
              style={{
                cursor: perms?.canMod && !isSystem ? "context-menu" : "default",
                padding: 10,
                borderRadius: 14,
                background: isSystem ? "rgba(124,77,255,0.10)" : "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, fontSize: 13, opacity: isSystem ? 0.95 : 1 }}>{m.username}</div>
                <div style={{ fontSize: 11, opacity: 0.55 }}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* input */}
      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {error ? (
          <div style={{ marginBottom: 10, fontSize: 12, color: "rgba(255,120,150,0.95)" }}>{error}</div>
        ) : null}

        <div style={{ display: "flex", gap: 10 }}>
          <input
            disabled={!canSend || sending}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={
              !isAuthed
                ? "Connecte-toi pour écrire…"
                : isBanned
                  ? "Tu es banni…"
                  : isTimedOut
                    ? `Timeout (${fmtRemaining(timeoutUntil)})…`
                    : "Écrire un message…"
            }
            style={{
              opacity: !canSend ? 0.6 : 1,
              flex: 1,
              padding: "12px 12px",
              borderRadius: 14,
              outline: "none",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
            }}
          />

          <button
            onClick={(e) => {
              e.stopPropagation();
              send();
            }}
            disabled={sending || !canSend}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(124,77,255,0.25)",
              color: "white",
              fontWeight: 800,
              cursor: sending || !canSend ? "not-allowed" : "pointer",
              opacity: sending || !canSend ? 0.6 : 1,
            }}
          >
            Envoyer
          </button>
        </div>
      </div>

      {/* menu mod */}
      {menu.open && menu.msg ? (
        <div
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            transform: "translate(6px, 6px)",
            zIndex: 50,
            minWidth: 240,
            padding: 10,
            borderRadius: 14,
            background: "rgba(20,20,30,0.98)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 50px rgba(0,0,0,0.45)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8, opacity: 0.95 }}>
            {menu.msg.username}
          </div>

          {/* MODS (owner/admin only) */}
          {perms?.canManageMods ? (
            <button
              onClick={() => doSetMod(menu.msg!, !(menu.isTargetMod === true))}
              disabled={!!menu.modLoading || menu.isTargetMod == null}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(80,200,255,0.12)",
                color: "white",
                textAlign: "left",
                fontWeight: 900,
                cursor: "pointer",
                marginBottom: 8,
                opacity: menu.isTargetMod == null ? 0.7 : 1,
              }}
            >
              {menu.modLoading
                ? "Chargement…"
                : menu.isTargetMod
                  ? "Retirer des modérateurs"
                  : "Mettre modérateur"}
            </button>
          ) : null}

          {perms?.canDelete ? (
            <button
              onClick={() => doDelete(menu.msg!)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,120,150,0.10)",
                color: "white",
                textAlign: "left",
                fontWeight: 800,
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              Supprimer le message
            </button>
          ) : null}

          {perms?.canTimeout ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Timeout</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { label: "10s", sec: 10 },
                  { label: "1m", sec: 60 },
                  { label: "10m", sec: 600 },
                  { label: "1h", sec: 3600 },
                  { label: "24h", sec: 86400 },
                ].map((x) => (
                  <button
                    key={x.sec}
                    onClick={() => doTimeout(menu.msg!, x.sec)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(124,77,255,0.14)",
                      color: "white",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {perms?.canBan ? (
            <button
              onClick={() => doBan(menu.msg!)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,60,90,0.18)",
                color: "white",
                textAlign: "left",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Bannir
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
