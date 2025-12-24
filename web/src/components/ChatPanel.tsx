// web/src/components/ChatPanel.tsx
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { ChatMessageBubble } from "./chat/ChatMessageBubble";
import type { ChatCosmetics } from "../lib/cosmetics";

import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  normalizeAppearance,
  type StreamerAppearance,
} from "../lib/appearance";

const DEBUG_FORCE_COSMETICS = true; // mets false quand fini
const DEBUG_USER = "LeCasiNoze";

// ⚠️ on caste en any pour pas se battre avec le type exact maintenant
const DEBUG_COSMETICS: any = {
  // exemples (adapte aux clés que ton ChatMessageBubble attend)
  avatar: { frameId: "ghost_purple", hatId: "luna_cap" },
  badges: ["SUB", "LUNA"],
  title: { text: "Card Shark", style: "colored", color: "#a64cff" },

  // pseudo skin (couleur/anim)
  username: { colorId: "ghost_purple", animId: "rainbow_scroll" },
};

/* =========================================================
   Types
   ========================================================= */
type ChatMsg = {
  id: number;
  userId: number;
  username: string;
  body: string;
  deleted?: boolean;
  createdAt: string;

  cosmetics?: ChatCosmetics | null;
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

  appearance?: StreamerAppearance;

  // (optionnel, si tu veux le mettre dans le join ack un jour)
  // chatPolicy?: { forceViewerNameColor?: boolean };
};

/* =========================================================
   Helpers
   ========================================================= */
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

/* =========================================================
   Component
   ========================================================= */
export function ChatPanel({
  slug,
  onRequireLogin,
  compact = false,
  autoFocus = false,
  onFollowsCount,
}: {
  slug: string;
  onRequireLogin: () => void;
  compact?: boolean;
  autoFocus?: boolean;
  onFollowsCount?: (n: number) => void;
}) {
  /* -------------------------
     Refs / callbacks
     ------------------------- */
  const onFollowsCountRef = React.useRef<((n: number) => void) | undefined>(undefined);
  React.useEffect(() => {
    onFollowsCountRef.current = onFollowsCount;
  }, [onFollowsCount]);

  const sockRef = React.useRef<Socket | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  /* -------------------------
     State
     ------------------------- */
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const [join, setJoin] = React.useState<JoinAck | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { token } = useAuth();
  const navigate = useNavigate();

  const [appearance, setAppearance] = React.useState<StreamerAppearance>(DEFAULT_STREAMER_APPEARANCE);
  const [initialLoading, setInitialLoading] = React.useState(true);

  // autoscroll intelligent
  const atBottomRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);

  const myId = join?.me?.id != null ? Number(join.me.id) : null;

  /* -------------------------
     Mobile keyboard handling (visualViewport)
     ------------------------- */
  const [kbInset, setKbInset] = React.useState(0);
  const isCoarse = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      window.matchMedia?.("(max-width: 820px)")?.matches
    );
  }, []);

  const focusedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isCoarse) return;

    const vv: any = (window as any).visualViewport;
    if (!vv) return;

    const compute = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)));
      setKbInset(inset);
    };

    compute();
    vv.addEventListener?.("resize", compute);
    vv.addEventListener?.("scroll", compute);

    return () => {
      vv.removeEventListener?.("resize", compute);
      vv.removeEventListener?.("scroll", compute);
    };
  }, [isCoarse]);

  React.useEffect(() => {
    if (!isCoarse) return;
    if (!kbInset) return;
    requestAnimationFrame(() => {
      if (atBottomRef.current) scrollToBottom("auto");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbInset, isCoarse]);

  /* -------------------------
     Menu (context)
     ------------------------- */
  const [menu, setMenu] = React.useState<{
    open: boolean;
    x: number;
    y: number;
    msg: ChatMsg | null;

    modLoading?: boolean;
    isTargetMod?: boolean | null;

    timeoutLoading?: boolean;
    targetTimeoutUntil?: string | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    msg: null,
    isTargetMod: null,
    modLoading: false,
    timeoutLoading: false,
    targetTimeoutUntil: null,
  });

  function closeMenu() {
    setMenu({
      open: false,
      x: 0,
      y: 0,
      msg: null,
      isTargetMod: null,
      modLoading: false,
      timeoutLoading: false,
      targetTimeoutUntil: null,
    });
  }

  function cloneCosmetics<T>(x: T): T {
  try {
    // @ts-ignore
    if (typeof structuredClone === "function") return structuredClone(x);
  } catch {}
  return JSON.parse(JSON.stringify(x));
}

function applyViewerPolicy(cos: any, level: 1 | 2 | 3) {
  if (!cos) return null;
  const c = cloneCosmetics(cos);

  // helpers local (permissifs)
  const hasUsernameSkinLocal = (x: any) => {
    const u = x?.username ?? x?.user ?? x?.name ?? x?.pseudo ?? null;
    const color = u?.color ?? u?.hex ?? u?.colorId ?? x?.usernameColorId ?? x?.nameColorId ?? x?.pseudoColorId ?? null;
    const effect =
      u?.effect ?? u?.animId ?? u?.animationId ?? x?.usernameAnimId ?? x?.nameAnimId ?? x?.pseudoAnimId ?? null;
    return color != null || (effect != null && effect !== "none");
  };

  const stripUsernameLocal = (x: any) => {
    if (!x) return null;
    const out: any = { ...x };

    delete out.usernameColorId;
    delete out.nameColorId;
    delete out.pseudoColorId;
    delete out.usernameAnimId;
    delete out.nameAnimId;
    delete out.pseudoAnimId;

    if (out.username && typeof out.username === "object") {
      out.username = { ...out.username };
      delete out.username.color;
      delete out.username.hex;
      delete out.username.colorId;
      delete out.username.effect;
      delete out.username.animId;
      delete out.username.animationId;
    }
    if (out.name && typeof out.name === "object") {
      out.name = { ...out.name };
      delete out.name.color;
      delete out.name.hex;
      delete out.name.colorId;
      delete out.name.effect;
      delete out.name.animId;
      delete out.name.animationId;
    }
    if (out.pseudo && typeof out.pseudo === "object") {
      out.pseudo = { ...out.pseudo };
      delete out.pseudo.color;
      delete out.pseudo.hex;
      delete out.pseudo.colorId;
      delete out.pseudo.effect;
      delete out.pseudo.animId;
      delete out.pseudo.animationId;
    }

    return out;
  };

  // Niveau 1 : libre, MAIS si pas de skin pseudo => fallback streamer (donc on strip le pseudo)
  if (level === 1) {
    return hasUsernameSkinLocal(c) ? c : stripUsernameLocal(c);
  }

  // Niveau 2 : on bloque tout le skin pseudo (couleur + effet)
  const noUsername = stripUsernameLocal(c);

  // Niveau 3 : + on bloque les cadrans (frame)
  if (level >= 3 && noUsername) {
    // covers plusieurs shapes possibles
    (noUsername as any).frame = null;
    (noUsername as any).frameId = null;

    if ((noUsername as any).avatar && typeof (noUsername as any).avatar === "object") {
      (noUsername as any).avatar = { ...(noUsername as any).avatar, frame: null, frameId: null };
    }
  }

  return noUsername;
}
  /* -------------------------
     Derived values
     ------------------------- */
  const perms = join?.perms;
  const state = join?.state;

  const isAuthed = !!token;
  const isBanned = !!state?.banned;
  const timeoutUntil = state?.timeoutUntil || null;
  const isTimedOut = !!timeoutUntil && new Date(timeoutUntil).getTime() > Date.now();
  const canSend = isAuthed && !isBanned && !isTimedOut;

  const targetIsSelf = menu.msg && myId != null && Number(menu.msg.userId) === Number(myId);
  const targetIsTimedOut =
    !!menu.targetTimeoutUntil && new Date(menu.targetTimeoutUntil).getTime() > Date.now();

  // couleurs du streamer (fallback)
  const nameColor = appearance.chat.usernameColor;
  const msgColor = appearance.chat.messageColor;
  const viewerSkinsLevel = (appearance.chat.viewerSkinsLevel ?? 1) as 1 | 2 | 3;

  /* =========================================================
     Scroll
     ========================================================= */
  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setShowJump(false);
  }

  function onScrollList() {
    const el = listRef.current;
    if (!el) return;

    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist < 40;
    atBottomRef.current = atBottom;

    if (atBottom) setShowJump(false);
    else setShowJump(true);
  }

  /* =========================================================
     Socket helpers
     ========================================================= */
  function emitSocket(event: string, payload: any) {
    return new Promise<any>((resolve) => {
      sockRef.current?.emit(event as any, payload, (ack: any) => resolve(ack));
    });
  }

  async function loadLastMessages(s: string) {
    try {
      setInitialLoading(true);
      const r = await fetch(`${apiBase()}/chat/${encodeURIComponent(s)}/messages?limit=50`);
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "messages_failed");
      setMessages(j.messages || []);
      requestAnimationFrame(() => scrollToBottom("auto"));
    } finally {
      setInitialLoading(false);
    }
  }

  /* =========================================================
     Auto-refresh when my timeout ends
     ========================================================= */
  React.useEffect(() => {
    if (!join?.state?.timeoutUntil) return;

    const until = new Date(join.state.timeoutUntil).getTime();
    const ms = until - Date.now() + 250;
    if (ms <= 0) {
      sockRef.current?.emit("chat:refresh", { slug });
      return;
    }

    const t = window.setTimeout(() => {
      setJoin((prev) =>
        prev ? { ...prev, state: { ...(prev.state || { banned: false }), timeoutUntil: null } } : prev
      );
      sockRef.current?.emit("chat:refresh", { slug });
    }, ms);

    return () => window.clearTimeout(t);
  }, [slug, join?.state?.timeoutUntil]);

  /* =========================================================
     Socket connect + join
     ========================================================= */
  React.useEffect(() => {
    const s = String(slug || "").trim();
    const slugLower = s.toLowerCase();
    if (!s) return;

    setMessages([]);
    setShowJump(false);
    atBottomRef.current = true;
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

    socket.on("chat:message", (msg: ChatMsg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > 50) next.splice(0, next.length - 50);
        return next;
      });

      requestAnimationFrame(() => {
        if (atBottomRef.current) scrollToBottom("auto");
        else setShowJump(true);
      });
    });

    socket.on("stream:follows", (payload: any) => {
      const evSlug = String(payload?.slug || "").trim().toLowerCase();
      if (!evSlug || evSlug !== slugLower) return;

      const n = Number(payload?.followsCount);
      if (!Number.isFinite(n)) return;

      onFollowsCountRef.current?.(n);
    });

    socket.on("chat:cleared", () => {
      setMessages([]);
      requestAnimationFrame(() => scrollToBottom("auto"));
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

      // appearance AVANT messages (anti-flash)
      setAppearance(normalizeAppearance(ack.appearance));
      await loadLastMessages(s);

      if (autoFocus) {
        window.setTimeout(() => inputRef.current?.focus(), 50);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  /* =========================================================
     Send message
     ========================================================= */
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
                prev ? { ...prev, state: { ...(prev.state || { banned: false }), timeoutUntil: ex } } : prev
              );
              setError(`Tu es en timeout (${fmtRemaining(ex)}).`);
            } else if (ack?.error === "cannot_self") {
              setError("Action impossible sur toi-même.");
            } else {
              setError(String(ack?.error || "send_failed"));
            }
          } else {
            setInput("");
            if (focusedRef.current) {
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }
          }
          resolve();
        });
      });
    } finally {
      setSending(false);
    }
  }

  /* =========================================================
     Menu actions
     ========================================================= */
  async function openMenuAt(x: number, y: number, msg: ChatMsg) {
    if (msg.userId <= 0) return;

    setMenu({
      open: true,
      x,
      y,
      msg,
      isTargetMod: null,
      modLoading: false,
      timeoutLoading: false,
      targetTimeoutUntil: null,
    });

    const isSelf = myId != null && Number(msg.userId) === Number(myId);

    if (perms?.canManageMods) {
      setMenu((m) => ({ ...m, modLoading: true }));
      const ack = await emitSocket("chat:mod_status", { slug, userId: msg.userId });
      if (ack?.ok) setMenu((m) => ({ ...m, modLoading: false, isTargetMod: !!ack.isMod }));
      else setMenu((m) => ({ ...m, modLoading: false, isTargetMod: null }));
    }

    if (perms?.canTimeout && !isSelf) {
      setMenu((m) => ({ ...m, timeoutLoading: true }));
      const ack = await emitSocket("chat:timeout_status", { slug, userId: msg.userId });
      if (ack?.ok)
        setMenu((m) => ({ ...m, timeoutLoading: false, targetTimeoutUntil: ack.timeoutUntil || null }));
      else setMenu((m) => ({ ...m, timeoutLoading: false, targetTimeoutUntil: null }));
    }
  }

  function openMenuMouse(e: React.MouseEvent, msg: ChatMsg) {
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY, msg);
  }

  const longPressTimer = React.useRef<number | null>(null);
  function onTouchStartMsg(e: React.TouchEvent, msg: ChatMsg) {
    if (msg.userId <= 0) return;
    const t = e.touches?.[0];
    if (!t) return;

    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      openMenuAt(t.clientX, t.clientY, msg);
    }, 450);
  }
  function cancelLongPress() {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  function goProfile(msg: ChatMsg) {
    closeMenu();
    navigate(`/users/${encodeURIComponent(msg.username)}`);
  }

  async function doUnmute(msg: ChatMsg) {
    closeMenu();
    const ack = await emitSocket("chat:untimeout", { slug, userId: msg.userId });
    if (!ack?.ok) setError(String(ack?.error || "untimeout_failed"));
  }

  async function doDelete(msg: ChatMsg) {
    closeMenu();
    const ack = await emitSocket("chat:delete", { slug, messageId: msg.id });
    if (!ack?.ok) setError(String(ack?.error || "delete_failed"));
  }

  async function doTimeout(msg: ChatMsg, seconds: number) {
    closeMenu();
    const ack = await emitSocket("chat:timeout", { slug, userId: msg.userId, seconds });
    if (!ack?.ok) {
      if (ack?.error === "cannot_self") setError("Impossible de te mute toi-même.");
      else setError(String(ack?.error || "timeout_failed"));
    }
  }

  async function doBan(msg: ChatMsg) {
    closeMenu();
    const ok = window.confirm(`Bannir ${msg.username} ?`);
    if (!ok) return;
    const ack = await emitSocket("chat:ban", { slug, userId: msg.userId });
    if (!ack?.ok) {
      if (ack?.error === "cannot_self") setError("Impossible de te ban toi-même.");
      else setError(String(ack?.error || "ban_failed"));
    }
  }

  async function doSetMod(msg: ChatMsg, enabled: boolean) {
    closeMenu();
    const ack = await emitSocket("chat:mod_set", { slug, userId: msg.userId, enabled });
    if (!ack?.ok) setError(String(ack?.error || "mod_set_failed"));
  }

  /* =========================================================
     Render
     ========================================================= */
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }} onClick={closeMenu}>
      <style>
        {`@keyframes chatFadeLeft{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}`}
      </style>

      {!compact ? (
        <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>Chat</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
            {join?.role ? `Rôle: ${join.role}` : "…"}
            {isBanned ? " • banni" : isTimedOut ? ` • timeout ${fmtRemaining(timeoutUntil)}` : ""}
          </div>
        </div>
      ) : null}

      {/* zone scroll + jump */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div
          ref={listRef}
          onScroll={onScrollList}
          className="chatScroll"
          style={{
            height: "100%",
            overflow: "auto",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            WebkitOverflowScrolling: "touch",

            // fallback streamer (utilisé quand viewer n'a pas de skin pseudo OU impose)
            ...( { ["--chat-name-color" as any]: nameColor, ["--chat-msg-color" as any]: msgColor } as any ),
          }}
        >
          {initialLoading ? (
            <div style={{ opacity: 0.7, fontSize: 13 }}>Chargement…</div>
          ) : messages.length === 0 ? (
            <div style={{ opacity: 0.7, fontSize: 13 }}>Aucun message</div>
          ) : null}

          {messages.map((m) => {
            const isSystem = m.userId === 0;
            const isDeleted = !!m.deleted || m.body === "";
            if (m.userId !== 0 && isDeleted) return null;

            // system : rendu simple (pas de cosmetics)
            if (isSystem) {
              return (
                <div
                  key={m.id}
                  style={{
                    cursor: "default",
                    padding: 10,
                    borderRadius: 14,
                    background: "rgba(124,77,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    animation: "chatFadeLeft 180ms ease-out both",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,0.95)" }}>
                      {m.username}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95, color: "white" }}>{m.body}</div>
                </div>
              );
            }

          // APPLY POLICY (impose vs non impose + fallback streamer si pas de skin pseudo)
          const baseCosmetics =
            DEBUG_FORCE_COSMETICS && m.username === DEBUG_USER
              ? (DEBUG_COSMETICS as ChatCosmetics)
              : (m.cosmetics ?? null);

          const effectiveCosmetics = applyViewerPolicy(baseCosmetics, viewerSkinsLevel);

          return (
            <div
              key={m.id}
              onContextMenu={(e) => openMenuMouse(e, m)}
              onTouchStart={(e) => onTouchStartMsg(e, m)}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              onTouchMove={cancelLongPress}
              style={{ cursor: "context-menu" }}
            >
              <ChatMessageBubble
                streamerAppearance={appearance}  // ✅ FIX TS (il le demande)
                msg={{
                  ...m,
                  cosmetics: effectiveCosmetics, // ✅ plus d’unused var + bonne policy
                }}
              />
            </div>
          );
          })}
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollToBottom("smooth");
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              zIndex: 5,
              padding: "10px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(17,10,23,0.85)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
            aria-label="Aller au dernier message"
            title="Aller au dernier message"
          >
            ↓
          </button>
        ) : null}
      </div>

      {/* input */}
      <div
        style={{
          padding: 12,
          paddingBottom: 12 + (isCoarse ? kbInset : 0),
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {error ? (
          <div style={{ marginBottom: 10, fontSize: 12, color: "rgba(255,120,150,0.95)" }}>{error}</div>
        ) : null}

        <div style={{ display: "flex", gap: 10 }}>
          <input
            ref={inputRef}
            disabled={!canSend || sending}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => {
              focusedRef.current = true;
              requestAnimationFrame(() => {
                if (atBottomRef.current) scrollToBottom("auto");
              });
            }}
            onBlur={() => {
              focusedRef.current = false;
            }}
            enterKeyHint="send"
            inputMode="text"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
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

      {/* menu */}
      {menu.open && menu.msg ? (
        <div
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            transform: "translate(6px, 6px)",
            zIndex: 90,
            minWidth: 240,
            padding: 10,
            borderRadius: 14,
            background: "rgba(20,20,30,0.98)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 50px rgba(0,0,0,0.45)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8, opacity: 0.95 }}>{menu.msg.username}</div>

          <button
            onClick={() => goProfile(menu.msg!)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              textAlign: "left",
              fontWeight: 900,
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            Voir le profil
          </button>

          {perms?.canTimeout && !targetIsSelf && targetIsTimedOut ? (
            <button
              onClick={() => doUnmute(menu.msg!)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(124,77,255,0.14)",
                color: "white",
                textAlign: "left",
                fontWeight: 900,
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              Démute (untimeout)
            </button>
          ) : null}

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
              {menu.modLoading ? "Chargement…" : menu.isTargetMod ? "Retirer des modérateurs" : "Mettre modérateur"}
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

          {perms?.canTimeout && !targetIsSelf ? (
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

          {perms?.canBan && !targetIsSelf ? (
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
