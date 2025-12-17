import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthProvider"; // ✅ on utilise le contexte (réactif)

// fallback si jamais ton AuthProvider ne fournit pas token (mais idéalement il le fournit)
function getTokenFallback(): string | null {
  return (
    localStorage.getItem("ll_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    null
  );
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

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
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  perms?: {
    canSend: boolean;
    canDelete: boolean;
    canTimeout: boolean;
    canBan: boolean;
    canClear: boolean;
    canMod: boolean;
  };
  me?: { id: number; username: string; role: string } | null;
  error?: string;
};

type ChatPerms = NonNullable<JoinAck["perms"]>;
type ChatMe = { id: number; username: string; role: string };

const DEFAULT_PERMS: ChatPerms = {
  canSend: false,
  canDelete: false,
  canTimeout: false,
  canBan: false,
  canClear: false,
  canMod: false,
};

export function ChatPanel({
  slug,
  onRequireLogin,
}: {
  slug: string;
  onRequireLogin?: () => void;
}) {
  const auth = useAuth() as any;
  const token: string | null = auth?.token ?? getTokenFallback(); // ✅ réactif si AuthProvider expose token

  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");

  const [perms, setPerms] = React.useState<ChatPerms>(DEFAULT_PERMS);
  const [me, setMe] = React.useState<ChatMe | null>(null);

  const [needLogin, setNeedLogin] = React.useState(false);

  const socketRef = React.useRef<Socket | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  // mentions
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionItems, setMentionItems] = React.useState<{ id: number; username: string }[]>([]);
  const [mentionIdx, setMentionIdx] = React.useState(0);

  const isLogged = !!token;

  function scrollBottom() {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  async function loadInitial() {
    const r = await fetch(`${API_BASE}/chat/${encodeURIComponent(slug)}/messages?limit=50`);
    const j = await r.json();
    if (j?.ok) setMessages(j.messages || []);
    setTimeout(scrollBottom, 50);
  }

  React.useEffect(() => {
    loadInitial().catch(() => {});
  }, [slug]);

  // ✅ IMPORTANT: reconnect socket quand token change (login/logout)
  React.useEffect(() => {
    // cleanup ancien socket
    try {
      socketRef.current?.disconnect();
    } catch {}
    socketRef.current = null;

    const sock = io(API_BASE, {
      // laisse socket.io choisir (websocket/polling) -> plus robuste en prod
      auth: token ? { token } : {},
    });

    socketRef.current = sock;

    sock.on("connect", () => {
      sock.emit("chat:join", { slug }, (ack: JoinAck) => {
        if (ack?.ok) {
          setPerms(ack.perms ?? DEFAULT_PERMS);
          setMe(ack.me ?? null);
        } else {
          setPerms(DEFAULT_PERMS);
          setMe(null);
        }
      });
    });

    sock.on("chat:message", (m: ChatMsg) => {
      setMessages((prev) => [...prev, m].slice(-200));
      setTimeout(scrollBottom, 20);
    });

    sock.on("chat:deleted", ({ id }: { id: number }) => {
      setMessages((prev) => prev.filter((x) => x.id !== Number(id)));
    });

    sock.on("chat:cleared", () => {
      setMessages([]);
    });

    return () => {
      try {
        sock.disconnect();
      } catch {}
      socketRef.current = null;
    };
  }, [slug, token]);

  async function fetchMentions(prefix: string) {
    const r = await fetch(`${API_BASE}/chat/${encodeURIComponent(slug)}/mentions?q=${encodeURIComponent(prefix)}`);
    const j = await r.json();
    if (j?.ok) {
      setMentionItems(j.users || []);
      setMentionIdx(0);
      setMentionOpen((j.users || []).length > 0);
    }
  }

  function insertMention(u: string) {
    const at = input.lastIndexOf("@");
    if (at < 0) return;
    const before = input.slice(0, at);
    setInput(before + "@" + u + " ");
    setMentionOpen(false);
  }

  function triggerLogin() {
    setNeedLogin(true);
    onRequireLogin?.();
  }

  async function onSend() {
    const sock = socketRef.current;
    const text = input.trim();
    if (!text) return;

    if (!token) {
      triggerLogin();
      return;
    }

    if (!sock || !sock.connected) {
      // socket pas prêt
      return;
    }

    // /clear MVP
    if (text === "/clear") {
      if (!perms.canClear) return;
      sock.emit("chat:clear", { slug }, () => {});
      setInput("");
      return;
    }

    sock.emit("chat:send", { slug, body: text }, (ack: any) => {
      if (!ack?.ok) {
        if (ack?.error === "auth_required") triggerLogin();
      } else {
        setInput("");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* header */}
      <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontWeight: 800 }}>Chat</div>
          <div className="mutedSmall" style={{ opacity: 0.9 }}>
            {me ? `Connecté : ${me.username}` : "Invité"}
          </div>
        </div>
        <div className="mutedSmall">LunaLive — temps réel</div>
      </div>

      {/* messages */}
      <div style={{ padding: 12, flex: 1, overflow: "auto" }}>
        {messages.length === 0 ? (
          <div className="mutedSmall" style={{ opacity: 0.8 }}>
            Aucun message (reset après 3 jours d’inactivité)
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ padding: "6px 0", display: "flex", gap: 8 }}>
              <div style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{m.username}</div>
              <div style={{ opacity: 0.95 }}>
                {m.deleted ? <span className="mutedSmall">message supprimé</span> : m.body}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ position: "relative", display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);

              const at = v.lastIndexOf("@");
              if (at >= 0) {
                const frag = v.slice(at + 1);
                const ok = /^[a-zA-Z0-9_]{1,20}$/.test(frag);
                if (ok) fetchMentions(frag).catch(() => {});
                else setMentionOpen(false);
              } else {
                setMentionOpen(false);
              }
            }}
            onKeyDown={(e) => {
              if (mentionOpen) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIdx((i) => Math.min(i + 1, mentionItems.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  if (mentionItems[mentionIdx]) {
                    e.preventDefault();
                    insertMention(mentionItems[mentionIdx].username);
                  }
                } else if (e.key === "Escape") {
                  setMentionOpen(false);
                }
              } else if (e.key === "Enter") {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={isLogged ? "Écrire un message…" : "Écrire un message… (connexion requise pour envoyer)"}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(180, 160, 255, 0.22)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.92)",
              outline: "none",
            }}
            maxLength={200}
          />

          <button
            onClick={onSend}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(180, 160, 255, 0.22)",
              background: "rgba(120, 90, 255, 0.18)",
              color: "rgba(255,255,255,0.9)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Envoyer
          </button>

          {mentionOpen && mentionItems.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 90,
                bottom: "calc(100% + 8px)",
                background: "rgba(10, 10, 18, 0.92)",
                border: "1px solid rgba(180, 160, 255, 0.22)",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              }}
            >
              {mentionItems.map((u, i) => (
                <button
                  key={u.id}
                  onClick={() => insertMention(u.username)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.92)",
                    background: i === mentionIdx ? "rgba(120, 90, 255, 0.28)" : "transparent",
                  }}
                >
                  @{u.username}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* fallback si tu veux garder une indication */}
        {needLogin && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(180, 160, 255, 0.22)",
              background: "rgba(10,10,18,0.55)",
            }}
          >
            <div style={{ fontWeight: 800 }}>Connexion requise</div>
            <div className="mutedSmall" style={{ marginTop: 4 }}>
              Le pop-up de connexion devrait s’ouvrir.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button className="btnPrimary" onClick={() => onRequireLogin?.()}>
                Ouvrir la connexion
              </button>
              <button className="btnGhost" onClick={() => setNeedLogin(false)}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
