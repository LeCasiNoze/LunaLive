// web/src/components/ChatPanel.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { ChatMessageBubble } from "./chat/ChatMessageBubble";
import type { ChatCosmetics } from "../lib/cosmetics";
import { BotMenu } from "../components/BotMenu";
import SpecialEventCard, { type SpecialEventType } from "./chat/SpecialEventCard";
import ActiveEventsBar, { type ActiveEvent } from "./chat/ActiveEventsBar";
import {
  useActionableEngine, ActionablePinnedBar, ActionableChatCard, WheelOverlay, ParticipantListModal,
} from "./chat/ActionableEvents";

// Types de messages spéciaux affichés en carte "célébration" dans le flux.
const CELEBRATION_TYPES = new Set<string>(["raid", "follow", "combo", "sub", "don", "boss", "level"]);
// Types affichés en chip épinglé dans la barre d'events actifs (jamais dans le flux).
const ACTIONABLE_TYPES = new Set<string>(["rain", "wheel", "predict", "chest"]);

import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  normalizeAppearance,
  type StreamerAppearance,
} from "../lib/appearance";
import { followStreamer } from "../lib/api";

/* =========================================================
   Debug flags
   ========================================================= */
const DEBUG_FORCE_COSMETICS = false; // mets false quand fini
const DEBUG_USER = "LeCasiNoze";
const CHAT_ENTER_ANIM = "slide";

// ⚠️ on caste en any pour pas se battre avec le type exact maintenant
const DEBUG_COSMETICS: any = {
  avatar: { frameId: "ghost_purple", hatId: "luna_cap" },
  badges: ["SUB", "LUNA"],
  title: { text: "Card Shark", style: "colored", color: "#a64cff" },
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
  rumble?: boolean;
  // Messages spéciaux (raid/follow/sub/don/coffre/rain/roue/prédiction/boss/level).
  // Émis par /internal/bot/chat/special : body vide, tout est dans type + data.
  // "recap" = ligne centrée · "sys" = message système · "act" = carte
  // actionnable (rain/roue/prédiction/coffre) pilotée par le moteur v2.
  type?: SpecialEventType | "recap" | "sys" | "act";
  data?: any;
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
};

type ChatSettings = {
  allowLinks: boolean;
  followOnly: boolean;
  subOnly: boolean;

  dliveUsername: string | null;
  dliveSyncPublic: boolean;
  dliveSyncPopup: boolean;
};



type ViewerRow = { userId: number; username: string };

/* =========================================================
   Emotes types
   ========================================================= */
type EmoteKind = "emoji" | "gif";
type EmoteScope = "native" | "global" | "channel";

type EmoteItem = {
  id?: number; // ✅ présent pour DB emotes
  kind: EmoteKind;
  scope: EmoteScope;
  streamer_id?: number | null;

  name: string; // token
  label?: string | null; // UI
  url?: string | null; // image url
  char?: string | null; // unicode emoji (front-only natives)
  status?: "active" | "disabled" | "banned" | "deleted";
};

type EmotesPayload = {
  ok: boolean;
  streamerId?: number | null;
  emotes?: EmoteItem[];
  channel?: EmoteItem[];
  global?: EmoteItem[];
  native?: EmoteItem[];
  favorites?: EmoteItem[];
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
function absolutizeUrl(u: string | null) {
  if (!u) return null;
  const s = String(u);
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return `${apiBase().replace(/\/$/, "")}${s}`;
  return s;
}

function errMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as any).message;
    if (typeof m === "string") return m;
  }
  return String(e || "error");
}

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isStreamerSender(msg: ChatMsg, currentSlug: string) {
  if (!msg) return false;
  if (Number(msg.userId) <= 0) return false; // externe
  const a = normKey((msg as any).username);
  const b = normKey(currentSlug);
  return !!a && !!b && a === b;
}

function computeMentionCtx(value: string, caret: number) {
  const left = value.slice(0, caret);
  const at = left.lastIndexOf("@");
  if (at < 0) return null;

  const prev = at === 0 ? " " : left[at - 1];
  // faut que @ démarre un "mot" (début ou espace)
  if (prev && !/\s/.test(prev)) return null;

  const q = left.slice(at + 1);
  // si y'a un espace dans la partie tapée => pas une mention active
  if (/\s/.test(q)) return null;

  return { start: at, end: caret, q };
}

function safeTokenName(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 32);
}

function isRainOpenMessage(msg: ChatMsg) {
  return typeof msg.body === "string" && msg.body.includes("[RAIN_OPEN]");
}
function stripRainToken(text: string) {
  return text.replace("[RAIN_OPEN]", "").trim();
}

/* =========================================================
   Emotes: natives + SVG “GIFs”
   ========================================================= */
function svgGif(label: string, glyph: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <radialGradient id="g" cx="30%" cy="30%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.85)"/>
        <stop offset="60%" stop-color="rgba(124,77,255,0.25)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="96" height="96" rx="22" fill="rgba(255,255,255,0.06)"/>
    <circle cx="48" cy="48" r="34" fill="url(#g)">
      <animate attributeName="r" values="28;36;28" dur="1.1s" repeatCount="indefinite"/>
    </circle>
    <text x="48" y="58" text-anchor="middle" font-size="40">${glyph}</text>
    <text x="48" y="86" text-anchor="middle" font-size="12" opacity="0.75">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// (les emojis unicode natifs ont été retirés du picker — retour Lucas :
// « classiques que tout le monde a déjà » — seules les emotes custom restent)
const NATIVE_GIFS: EmoteItem[] = [
  { kind: "gif", scope: "native", name: "party", label: "party", url: svgGif("party", "🎉") },
  { kind: "gif", scope: "native", name: "gg", label: "gg", url: svgGif("gg", "🏆") },
  { kind: "gif", scope: "native", name: "rage", label: "rage", url: svgGif("rage", "😤") },
];

function favKeyOf(e: EmoteItem) {
  return e.id != null ? String(e.id) : ""; // ✅ DB id uniquement
}

/* =========================================================
   Cosmetics helpers (viewer policy)
   ========================================================= */
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

  const hasUsernameSkinLocal = (x: any) => {
    const u = x?.username ?? x?.user ?? x?.name ?? x?.pseudo ?? null;
    const color =
      u?.color ?? u?.hex ?? u?.colorId ?? x?.usernameColorId ?? x?.nameColorId ?? x?.pseudoColorId ?? null;
    const effect =
      u?.effect ??
      u?.animId ??
      u?.animationId ??
      x?.usernameAnimId ??
      x?.nameAnimId ??
      x?.pseudoAnimId ??
      null;
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

  if (level === 1) {
    return hasUsernameSkinLocal(c) ? c : stripUsernameLocal(c);
  }

  const noUsername = stripUsernameLocal(c);

  if (level >= 3 && noUsername) {
    (noUsername as any).frame = null;
    (noUsername as any).frameId = null;

    if ((noUsername as any).avatar && typeof (noUsername as any).avatar === "object") {
      (noUsername as any).avatar = { ...(noUsername as any).avatar, frame: null, frameId: null };
    }
  }

  return noUsername;
}

/* =========================================================
   Small UI components
   ========================================================= */
function ChatHeader(props: {
  compact: boolean;
  join: JoinAck | null;
  isBanned: boolean;
  isTimedOut: boolean;
  timeoutUntil: string | null;
  onClickGear: () => void;
  canManageSettings: boolean;
}) {
  if (props.compact) return null;
  const headBtn: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(124,77,255,0.16)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.2,
  };
  return (
    // une seule ligne compacte : titre + rôle inline + actions à droite
    <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>Chat</div>
      <div style={{ opacity: 0.6, fontSize: 11, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {props.join?.role ? props.join.role : ""}
        {props.isBanned ? " • banni" : props.isTimedOut ? ` • timeout ${fmtRemaining(props.timeoutUntil)}` : ""}
      </div>
      <div style={{ flex: 1 }} />
      {props.canManageSettings ? (
        <button
          type="button"
          style={{ ...headBtn, background: "rgba(255,255,255,0.06)" }}
          onClick={props.onClickGear}
          title="Options du chat"
          aria-label="Options du chat"
        >
          ⚙️
        </button>
      ) : null}
    </div>
  );
}

function SystemMessageCard(props: {
  msg: ChatMsg;
  joinRain: (_from: "toast" | "chat") => void;
  animated: boolean;
}) {
  const isRain = isRainOpenMessage(props.msg);
  const body = isRain ? stripRainToken(props.msg.body) : props.msg.body;

  return (
    <div
      className={props.animated ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
      style={{
        cursor: "default",
        padding: props.animated ? 11 : 10,
        borderRadius: 14,
        background: "rgba(124,77,255,0.10)",
        border: "1px solid rgba(255,255,255,0.06)",

        // ✅ popup look
        width: "100%",
        maxWidth: 560,
        margin: "0 auto",
        transform: "scale(1.06)",
        transformOrigin: "center top",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,0.95)" }}>{props.msg.username}</div>
        <div style={{ fontSize: 11, opacity: 0.55 }}>
          {new Date(props.msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 15, opacity: 0.95, color: "white", textAlign: "center" }}>{body}</div>

      {isRain ? (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => props.joinRain("chat")}
            style={{
              padding: "8px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(124,77,255,0.30)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            🌧️ Rejoindre la rain
          </button>
        </div>
      ) : null}
    </div>
  );
}

function JumpToBottomButton(props: { show: boolean; onClick: () => void }) {
  if (!props.show) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
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
  );
}

function MentionPopover(props: {
  open: boolean;
  items: ViewerRow[];
  mention: { start: number; end: number; q: string; active: number } | null;
  input: string;
  setInput: (v: string) => void;
  setMention: (v: any) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  bottomOffsetPx: number;
}) {
  if (!props.open || !props.mention || !props.items.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: props.bottomOffsetPx,
        zIndex: 50,
        padding: 8,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(18,14,26,0.98)",
        boxShadow: "0 18px 70px rgba(0,0,0,0.55)",
        maxHeight: 260,
        overflow: "auto",
      }}
      onMouseDown={(e) => e.preventDefault()} // empêche blur input
    >
      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900, padding: "2px 6px 8px" }}>Mentionner quelqu’un</div>

      {props.items.map((u, i) => {
        const active = i === (props.mention!.active ?? 0);
        return (
          <button
            key={`${u.userId}:${u.username}`}
            type="button"
            onClick={() => {
              const before = props.input.slice(0, props.mention!.start);
              const after = props.input.slice(props.mention!.end);
              const inserted = `${before}@${u.username} ${after}`;
              props.setInput(inserted);
              props.setMention(null);

              window.setTimeout(() => {
                const pos = (before + "@" + u.username + " ").length;
                props.inputRef.current?.focus();
                props.inputRef.current?.setSelectionRange(pos, pos);
              }, 0);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: active ? "rgba(124,77,255,0.22)" : "rgba(255,255,255,0.04)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              marginBottom: 6,
              outline: "none",
            }}
          >
            @{u.username}
          </button>
        );
      })}
    </div>
  );
}

function EmotePicker(props: {
  open: boolean;
  bottomOffsetPx: number;
  emoteTab: EmoteKind;
  setEmoteTab: (k: EmoteKind) => void;
  emotesChannel: EmoteItem[];
  emotesGlobal: EmoteItem[];
  favs: { emoji: string[]; gif: string[] };
  /** clic sur une emote : envoi direct si la zone est vide, sinon insertion */
  onPick: (e: EmoteItem) => void;
  toggleFav: (e: EmoteItem) => void;
  onClose: () => void;
}) {
  if (!props.open) return null;

  // rework 11 juil (retours Lucas) : plus de recherche, plus de noms,
  // plus d'emojis natifs (tout le monde les a déjà) — que des vignettes
  const isGif = props.emoteTab === "gif";

  const global = props.emotesGlobal.filter((e) => e.kind === props.emoteTab);
  const channel = props.emotesChannel.filter((e) => e.kind === props.emoteTab);

  const favKeys = isGif ? props.favs.gif : props.favs.emoji;

  const byKey = new Map<string, EmoteItem>();
  for (const e of [...global, ...channel]) byKey.set(favKeyOf(e), e);

  const favItems = favKeys.map((k) => byKey.get(k)).filter(Boolean) as EmoteItem[];

  const sections: Array<{ title: string; items: EmoteItem[] }> = [
    { title: "⭐ Favoris", items: favItems },
    { title: "🌍 Global", items: global },
    { title: "🎯 Chaîne", items: channel },
  ];

  // vignette carrée : l'image remplit le bouton, l'étoile est un badge coin
  const gridBtn: React.CSSProperties = {
    position: "relative",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    aspectRatio: "1 / 1",
    padding: 4,
    width: "100%",
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: props.bottomOffsetPx,
        zIndex: 60,
        padding: 10,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(18,14,26,0.98)",
        boxShadow: "0 18px 70px rgba(0,0,0,0.55)",
        overflow: "hidden",
      }}
      onMouseDown={(e) => e.preventDefault()} // keep focus
    >
      {/* tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {(
          [
            { k: "emoji", label: "Emojis" },
            { k: "gif", label: "GIFs" },
          ] as const
        ).map((t) => {
          const active = props.emoteTab === t.k;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => props.setEmoteTab(t.k)}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: active ? "rgba(124,77,255,0.22)" : "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={props.onClose}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            fontWeight: 950,
            cursor: "pointer",
          }}
          title="Fermer"
        >
          ✕
        </button>
      </div>

      <div style={{ maxHeight: 320, overflow: "auto", paddingRight: 2 }}>
        {sections.map((sec) => (
          <div key={sec.title} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginBottom: 8 }}>{sec.title}</div>

            {sec.items.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 800, padding: "6px 2px" }}>—</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", gap: 8 }}>
                {sec.items.slice(0, 80).map((e) => {
                  const canFav = e.scope !== "channel" && e.id != null;
                  const fk = favKeyOf(e);
                  const isFav = (isGif ? props.favs.gif : props.favs.emoji).includes(fk);

                  return (
                    <button
                      key={`${e.scope}:${e.kind}:${e.name}`}
                      type="button"
                      style={gridBtn}
                      title={e.label || e.name}
                      onClick={() => props.onPick(e)}
                    >
                      {e.url ? (
                        <img
                          src={e.url}
                          alt={e.label || e.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            borderRadius: 8,
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 28 }}>{e.kind === "gif" ? "🎞️" : "🙂"}</span>
                      )}

                      {canFav ? (
                        <span
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            props.toggleFav(e);
                          }}
                          title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                          style={{
                            position: "absolute",
                            top: 1,
                            right: 1,
                            padding: "1px 3px",
                            borderRadius: 8,
                            fontSize: 10,
                            lineHeight: 1.2,
                            background: isFav ? "rgba(255,210,110,0.30)" : "rgba(0,0,0,0.35)",
                            opacity: isFav ? 1 : 0.55,
                          }}
                        >
                          ⭐
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatSettingsModal(props: {
  open: boolean;
  onClose: () => void;
  token: string | null;
  onRequireLogin: () => void;
  settingsLoading: boolean;
  setSettingsLoading: (v: boolean) => void;
  chatSettings: ChatSettings;
  setChatSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
  emitSocket: (event: string, payload: any) => Promise<any>;
  slug: string;
  setError: (s: string | null) => void;

  // ✅ NEW
  onOpenPopup: () => void;
}) {

  if (!props.open) return null;

  return (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(18,14,26,0.98)",
          boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontWeight: 950 }}>Options du chat</div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              props.onClose();
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
            aria-label="Fermer"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800, marginBottom: 10 }}>
            Modérateur / propriétaire / admin uniquement. Les changements sont instantanés.
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950 }}>🗔 Chat pop-up</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, fontWeight: 700 }}>
                Ouvre le chat dans une petite fenêtre séparée (skins, règles, emotes, etc.).
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                props.onOpenPopup();
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(124,77,255,0.22)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
                whiteSpace: "nowrap",
                minWidth: 92,
                textAlign: "center",
              }}
            >
              Ouvrir
            </button>
          </div>

          {(
            [
              {
                key: "allowLinks",
                title: "Autoriser les liens",
                desc: "Bloque les URLs dans les messages.",
                value: props.chatSettings.allowLinks,
              },
              {
                key: "followOnly",
                title: "Follow-only",
                desc: "Seuls les followers peuvent parler. (désactive sub-only si activé)",
                value: props.chatSettings.followOnly,
              },
              {
                key: "subOnly",
                title: "Sub-only",
                desc: "Seuls les subs actifs peuvent parler. (désactive follow-only si activé)",
                value: props.chatSettings.subOnly,
              },

              // ✅ NEW: DLive sync routing
              {
                key: "dliveSyncPublic",
                title: "Sync DLive → Chat public",
                desc: "Réplique le chat DLive dans le chat public (page stream).",
                value: props.chatSettings.dliveSyncPublic,
              },
              {
                key: "dliveSyncPopup",
                title: "Sync DLive → Chat pop-up",
                desc: "Réplique le chat DLive dans le chat pop-up (popout).",
                value: props.chatSettings.dliveSyncPopup,
              },
            ] as const
          ).map((it) => (
            <div
              key={it.key}
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 950 }}>{it.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, fontWeight: 700 }}>{it.desc}</div>
              </div>

              <button
                type="button"
                disabled={props.settingsLoading}
                onClick={async () => {
                  if (!props.token) return props.onRequireLogin();
                  props.setSettingsLoading(true);
                  props.setError(null);
                  try {
                    const patch: any = { [it.key]: !it.value };
                    const ack = await props.emitSocket("chat:settings_set", { slug: props.slug, patch });
                    if (!ack?.ok) throw new Error(String(ack?.error || "settings_failed"));

                    const s = ack.settings || {};
                    props.setChatSettings((prev) => ({
                      ...prev,
                      allowLinks: !!s.allowLinks,
                      followOnly: !!s.followOnly,
                      subOnly: !!s.subOnly,
                      dliveSyncPublic: !!s.dliveSyncPublic,
                      dliveSyncPopup: !!s.dliveSyncPopup,
                    }));
                  } catch (e: any) {
                    props.setError(String(e?.message || "Erreur"));
                  } finally {
                    props.setSettingsLoading(false);
                  }
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: it.value ? "rgba(80,255,160,0.14)" : "rgba(255,255,255,0.06)",
                  color: "white",
                  fontWeight: 950,
                  cursor: props.settingsLoading ? "not-allowed" : "pointer",
                  opacity: props.settingsLoading ? 0.7 : 1,
                  whiteSpace: "nowrap",
                  minWidth: 64,
                  textAlign: "center",
                }}
              >
                {props.settingsLoading ? "…" : it.value ? "ON" : "OFF"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Context menu (unchanged behavior, isolated UI)
   ========================================================= */
function UserMenu(props: {
  menu: {
    open: boolean;
    x: number;
    y: number;
    msg: ChatMsg | null;

    modLoading?: boolean;
    isTargetMod?: boolean | null;

    timeoutLoading?: boolean;
    targetTimeoutUntil?: string | null;

    subLoading?: boolean;
    isTargetSub?: boolean | null;
    giftSubLoading?: boolean;
  };
  setMenu: React.Dispatch<any>;
  closeMenu: () => void;

  perms?: JoinAck["perms"];
  isAuthed: boolean;
  myId: number | null;
  token: string | null;
  slug: string;

  navigateToChannel: (streamerSlugOrUsername: string) => void;

  emitSocket: (event: string, payload: any) => Promise<any>;
  doGiftSub: (msg: ChatMsg) => void;
  doDelete: (msg: ChatMsg) => void;
  doTimeout: (msg: ChatMsg, seconds: number) => void;
  doUnmute: (msg: ChatMsg) => void;
  doBan: (msg: ChatMsg) => void;
  doSetMod: (msg: ChatMsg, enabled: boolean) => void;
}) {
  if (!props.menu.open || !props.menu.msg) return null;

  const msg = props.menu.msg;
  const showGoChannel = isStreamerSender(msg, props.slug);

  const targetIsSelf = props.myId != null && Number(msg.userId) === Number(props.myId);
  const targetIsTimedOut =
    !!props.menu.targetTimeoutUntil && new Date(props.menu.targetTimeoutUntil).getTime() > Date.now();

  // ⚠️ portal obligatoire : la sidebar chat (.panel) a un backdrop-filter qui
  // fait d'elle le containing block des descendants position:fixed — le menu
  // (coordonnées viewport) sortirait du panel et serait clippé par overflow:hidden.
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: props.menu.x,
        top: props.menu.y,
        zIndex: 99999,
        minWidth: 260,
        maxWidth: 320,
        borderRadius: 16,
        background: "rgba(18,14,26,0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 18px 70px rgba(0,0,0,0.60)",
        overflow: "hidden",
        transform: "translate(6px, 6px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header draggable */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();

          const startX = e.clientX;
          const startY = e.clientY;
          const startLeft = props.menu.x;
          const startTop = props.menu.y;

          const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            const nextX = startLeft + dx;
            const nextY = startTop + dy;

            const w = 320;
            const h = 420;
            const maxX = window.innerWidth - 20;
            const maxY = window.innerHeight - 20;

            props.setMenu((m: any) => ({
              ...m,
              x: clamp(nextX, 8, maxX - w),
              y: clamp(nextY, 8, maxY - h),
            }));
          };

          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "linear-gradient(135deg, rgba(124,77,255,0.22), rgba(80,200,255,0.10))",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          cursor: "grab",
          userSelect: "none",
        }}
        title="Glisse pour déplacer"
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 950, fontSize: 13, color: "rgba(255,255,255,0.95)", lineHeight: 1.1 }}>
            {msg.username}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 800, marginTop: 2 }}>Actions utilisateur</div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.closeMenu();
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            fontWeight: 950,
            cursor: "pointer",
          }}
          aria-label="Fermer"
          title="Fermer"
        >
          ✕
        </button>
      </div>

      <div style={{ padding: 12 }}>
        {showGoChannel ? (
          <button
            onClick={() => props.navigateToChannel(props.slug)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(80,200,255,0.10)",
              color: "white",
              textAlign: "left",
              fontWeight: 950,
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            📺 Voir la chaîne
          </button>
        ) : null}


        {!targetIsSelf && props.menu.isTargetSub !== true ? (
          <button
            onClick={() => props.doGiftSub(msg)}
            disabled={!!props.menu.giftSubLoading}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(80,255,160,0.12)",
              color: "white",
              textAlign: "left",
              fontWeight: 950,
              cursor: "pointer",
              marginBottom: 10,
              opacity: props.menu.giftSubLoading ? 0.75 : 1,
            }}
            title="Offrir un sub"
          >
            {props.menu.giftSubLoading ? "🎁 Offre en cours…" : "🎁 Offrir un sub"}
          </button>
        ) : null}

        {!targetIsSelf && props.isAuthed && props.menu.subLoading ? (
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 850, marginBottom: 10 }}>Vérification sub…</div>
        ) : null}

        {!targetIsSelf && props.isAuthed && props.menu.isTargetSub === true ? (
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 850, marginBottom: 10 }}>Déjà abonné ✅</div>
        ) : null}

        {(props.perms?.canManageMods || props.perms?.canDelete || props.perms?.canTimeout || props.perms?.canBan) ? (
          <div
            style={{
              marginTop: 6,
              marginBottom: 10,
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950, marginBottom: 8 }}>Modération</div>

            {props.perms?.canManageMods ? (
              <button
                onClick={() => props.doSetMod(msg, !(props.menu.isTargetMod === true))}
                disabled={!!props.menu.modLoading || props.menu.isTargetMod == null}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(80,200,255,0.12)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 950,
                  cursor: "pointer",
                  marginBottom: 10,
                  opacity: props.menu.isTargetMod == null ? 0.7 : 1,
                }}
              >
                {props.menu.modLoading
                  ? "Chargement…"
                  : props.menu.isTargetMod
                  ? "🛡️ Retirer des modérateurs"
                  : "🛡️ Mettre modérateur"}
              </button>
            ) : null}

            {props.perms?.canDelete ? (
              <button
                onClick={() => props.doDelete(msg)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,120,150,0.10)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 900,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                🗑️ Supprimer le message
              </button>
            ) : null}

            {props.perms?.canTimeout && !targetIsSelf && targetIsTimedOut ? (
              <button
                onClick={() => props.doUnmute(msg)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(124,77,255,0.14)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 950,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                🔊 Démute (untimeout)
              </button>
            ) : null}

            {props.perms?.canBan && !targetIsSelf ? (
              <button
                onClick={() => props.doBan(msg)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,60,90,0.20)",
                  color: "white",
                  textAlign: "left",
                  fontWeight: 1000,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                ⛔ Bannir
              </button>
            ) : null}

            {props.perms?.canTimeout && !targetIsSelf ? (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950, marginBottom: 8 }}>Timeout</div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { label: "10s", sec: 10 },
                    { label: "1m", sec: 60 },
                    { label: "10m", sec: 600 },
                    { label: "1h", sec: 3600 },
                    { label: "24h", sec: 86400 },
                  ].map((x) => (
                    <button
                      key={x.sec}
                      onClick={() => props.doTimeout(msg, x.sec)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(124,77,255,0.14)",
                        color: "white",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/* =========================================================
   Main component
   ========================================================= */
export function ChatPanel({
  slug,
  onRequireLogin,
  compact = false,
  autoFocus = false,
  onFollowsCount,
  // dock par défaut (11 juil) : le menu bot est un popup contextuel
  // draggable par-dessus le reste, ouvert par le bouton flottant 🤖
  botMenuVariant = "dock",
  visualMode = "default",

  // ✅ NEW
  botMenuDockWidth,
  // ✅ NEW : si true, les commandes (texte commençant par "!") envoyées
  // depuis ce panel sont exécutées par le bot mais N'APPARAISSENT PAS dans
  // le chat (épure la timeline pour les FSB depuis stream-control).
  streamControl = false,
  actionsRef,
  onCanManageSettings,
  showBotFab = true,
}: {
  slug: string;
  onRequireLogin: () => void;
  compact?: boolean;
  autoFocus?: boolean;
  onFollowsCount?: (n: number) => void;

  botMenuVariant?: "modal" | "dock";
  visualMode?: "default" | "popup";

  // ✅ NEW
  botMenuDockWidth?: number;
  streamControl?: boolean;
  /** en mode compact (header caché), le parent peut piloter bot/options
      depuis sa propre barre (mobile : bot à côté du plein écran) */
  actionsRef?: React.MutableRefObject<{ openBot?: () => void; openSettings?: () => void } | null>;
  /** notifie le parent si l'utilisateur peut gérer les options (⚙️ mobile) */
  onCanManageSettings?: (v: boolean) => void;
  /** false = pas de bouton/menu bot interne (la page fournit son propre
      FloatingBot détaché). true par défaut = popout chat autonome. */
  showBotFab?: boolean;
}) {



  /* -------------------------
     Refs / callbacks
     ------------------------- */
  const onFollowsCountRef = React.useRef<((n: number) => void) | undefined>(undefined);
  React.useEffect(() => {
    onFollowsCountRef.current = onFollowsCount;
  }, [onFollowsCount]);

  const sockRef = React.useRef<Socket | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const lastCaretRef = React.useRef<number>(0);
  const focusedRef = React.useRef(false);

  /* -------------------------
     Auth + nav
     ------------------------- */
  const { token } = useAuth();
  const navigate = useNavigate();

  /* -------------------------
     State (chat core)
     ------------------------- */
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [activeEvents, setActiveEvents] = React.useState<ActiveEvent[]>([]);
  const specialSeqRef = React.useRef(0);
  const [viewerFollows, setViewerFollows] = React.useState(false);
  const [viewerSubbed, setViewerSubbed] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [socketConnected, setSocketConnected] = React.useState(true);

  // ✅ IMPORTANT: join DOIT être déclaré avant mentionList/useMemo
  const [join, setJoin] = React.useState<JoinAck | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [appearance, setAppearance] = React.useState<StreamerAppearance>(DEFAULT_STREAMER_APPEARANCE);
  const [initialLoading, setInitialLoading] = React.useState(true);

  /* -------------------------
     Scroll
     ------------------------- */
  const atBottomRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);
  const userScrolledRef = React.useRef(false);
  const ignoreScrollRef = React.useRef(false);
  const pendingInitScrollRef = React.useRef(false);
  const animatedMsgIdsRef = React.useRef<Set<number>>(new Set());

  function isAtBottom(thresholdPx: number = 8) {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setShowJump(false);
  }

  function forceScrollBottomMultiPass() {
    const el = listRef.current;
    if (!el) return;

    const scroll = () => {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setShowJump(false);
    };

    scroll();
    requestAnimationFrame(scroll);
    setTimeout(scroll, 50);
    setTimeout(scroll, 150);
    setTimeout(scroll, 300);
    setTimeout(scroll, 600);
  }

  function onScrollList() {
    const el = listRef.current;
    if (!el) return;

    const atBottom = isAtBottom();
    atBottomRef.current = atBottom;

    if (ignoreScrollRef.current) return; // ⛔ scroll causé par un nouveau message → on ignore

    if (atBottom) {
      userScrolledRef.current = false;
      setShowJump(false);
    } else {
      userScrolledRef.current = true;
      setShowJump(true);
    }
  }

  React.useLayoutEffect(() => {
    if (initialLoading) return;
    if (userScrolledRef.current) return;

    const el = listRef.current;
    if (!el) return;

    const scroll = () => {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
    };

    scroll();
    requestAnimationFrame(scroll);

    const timers = [
      window.setTimeout(scroll, 50),
      window.setTimeout(scroll, 150),
      window.setTimeout(scroll, 300),
      window.setTimeout(scroll, 600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [messages.length, initialLoading]);

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
  const isPopup = visualMode === "popup";

  const nameColor = appearance.chat.usernameColor;
  const msgColor = appearance.chat.messageColor;
  const viewerSkinsLevel = (appearance.chat.viewerSkinsLevel ?? 1) as 1 | 2 | 3;

  const myId = join?.me?.id != null ? Number(join.me.id) : null;

  /* -------------------------
     Mobile keyboard handling
     ------------------------- */
  const [kbInset, setKbInset] = React.useState(0);
  const isCoarse = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(pointer: coarse)")?.matches || window.matchMedia?.("(max-width: 820px)")?.matches
    );
  }, []);

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
     Mention state (kept)
     ------------------------- */
  const [viewers] = React.useState<ViewerRow[]>([]);
  const [mention, setMention] = React.useState<null | { start: number; end: number; q: string; active: number }>(
    null
  );

  function viewerCandidates(): ViewerRow[] {
    const base = Array.isArray(viewers) && viewers.length ? viewers : [];

    if (base.length) {
      const seen = new Set<string>();
      const out: ViewerRow[] = [];
      for (const v of base) {
        const k = normKey(v?.username);
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ userId: Number(v.userId || 0), username: String(v.username) });
      }
      out.sort((a, b) => a.username.localeCompare(b.username));
      return out;
    }

    const seen = new Set<string>();
    const out: ViewerRow[] = [];

    const me = join?.me?.username ? String(join.me.username) : "";
    if (me) {
      seen.add(normKey(me));
      out.push({ userId: join?.me?.id ? Number(join.me.id) : 0, username: me });
    }

    for (const m of messages) {
      if (!m || !m.username) continue;
      const k = normKey(m.username);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ userId: Number((m as any).userId || 0), username: String(m.username) });
    }

    out.sort((a, b) => a.username.localeCompare(b.username));
    return out;
  }

  const mentionList = React.useMemo(() => {
    if (!mention) return [];
    const q = normKey(mention.q);
    const list = viewerCandidates();
    const filtered = q ? list.filter((u) => normKey(u.username).startsWith(q)) : list;
    return filtered.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mention, viewers, messages.length, join?.me?.username]);

  /* -------------------------
     Socket helpers
     ------------------------- */
  function emitSocket(event: string, payload: any) {
    return new Promise<any>((resolve) => {
      sockRef.current?.emit(event as any, payload, (ack: any) => resolve(ack));
    });
  }

  /* -------------------------
     Rain join
     ------------------------- */
  async function joinRain(_from: "toast" | "chat" = "toast") {
    if (!token) return onRequireLogin();

    try {
      const r = await fetch(`${apiBase()}/me/bot/bot_rain/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug }),
      }).then((x) => x.json());

      if (!r?.ok) {
        const err = String(r?.error || "join_failed");
        const msg =
          err === "already_joined"
            ? "Tu es déjà inscrit ✅"
            : err === "not_open"
            ? "Inscription fermée."
            : err === "offline"
            ? "Stream offline."
            : err === "disabled"
            ? "Rain désactivée."
            : err;

        window.dispatchEvent(
          new CustomEvent("ui:toast", {
            detail: { kind: err === "already_joined" ? "info" : "error", title: "🌧️ Rain", message: msg },
          })
        );
        return;
      }

      window.dispatchEvent(
        new CustomEvent("ui:toast", { detail: { kind: "success", title: "🌧️ Rain", message: "Inscription validée ✅" } })
      );
    } catch (e: any) {
      window.dispatchEvent(
        new CustomEvent("ui:toast", { detail: { kind: "error", title: "🌧️ Rain", message: String(e?.message || "Erreur") } })
      );
    }
  }

  /* -------------------------
     Messages spéciaux : handlers
     ------------------------- */
  // Ajoute une ligne "récap" centrée dans le flux (ex: "🌧️ Rain terminée…").
  function pushRecap(html: string) {
    const id = -(Date.now() * 100000 + (specialSeqRef.current = (specialSeqRef.current + 1) % 100000));
    const m: ChatMsg = {
      id, userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(),
      type: "recap" as any, data: { html },
    };
    animatedMsgIdsRef.current.add(id);
    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > 50) next.splice(0, next.length - 50);
      return next;
    });
    forceScrollBottomMultiPass();
  }

  // Message système dans le flux ("X a récupéré ses rubis"…).
  function pushSystem(html: string) {
    const id = -(Date.now() * 100000 + (specialSeqRef.current = (specialSeqRef.current + 1) % 100000));
    const m: ChatMsg = {
      id, userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(),
      type: "sys" as any, data: { html },
    };
    animatedMsgIdsRef.current.add(id);
    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > 50) next.splice(0, next.length - 50);
      return next;
    });
    forceScrollBottomMultiPass();
  }

  // Carte actionnable (rain/roue/prédiction/coffre) dans le flux → référence
  // l'event vivant du moteur par actId.
  function pushActCard(actId: string) {
    const id = -(Date.now() * 100000 + (specialSeqRef.current = (specialSeqRef.current + 1) % 100000));
    const m: ChatMsg = {
      id, userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(),
      type: "act" as any, data: { actId },
    };
    animatedMsgIdsRef.current.add(id);
    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > 50) next.splice(0, next.length - 50);
      return next;
    });
    forceScrollBottomMultiPass();
  }

  // Moteur d'events actionnables v2 (état partagé chat ↔ épinglé). En vrai
  // chat : simulate=false (pas de faux participants ; le backend socket
  // gérera la participation réelle partagée — phase 2).
  const actEngine = useActionableEngine({
    me: join?.me?.username ?? "Toi",
    poolNames: [],
    emitSystem: pushSystem,
    emitRecap: pushRecap,
    addChatCard: pushActCard,
    simulate: false,
    // Participation RÉELLE : le clic "Participer" sur une carte réelle route
    // vers le vrai endpoint. Rain = flux existant (ui:rain_join → /bot_rain/join).
    onRealJoin: (e) => {
      if (e.kind === "rain") void joinRain("chat");
      // wheel/predict/chest : câblage réel à venir (même schéma).
    },
  });
  const isStreamerRole = join?.role === "mod" || join?.role === "streamer" || join?.role === "admin";

  // Bouton GG! → envoie un message COHÉRENT avec le contexte de la carte.
  const GG_MESSAGES: Record<string, string[]> = {
    boss: ["On l'a eu ! 🔥", "GG la team 💪", "Boss down 💀", "Quelle bataille ⚔️"],
    sub: ["Merci pour le soutien 💜", "GG le sub ⭐", "Welcome to the club 🙌"],
    follow: ["GG le follow 💙", "Bienvenue ! 👋", "+1 dans la famille 🎉"],
    combo: ["Ça enchaîne 🔥", "Combo de fou !", "On lâche rien 💪"],
    don: ["Merci pour le don 💚", "Généreux 🙏", "Respect 👏"],
    level: ["GG le level up ⭐", "Bravo 🎉", "Ça monte 💪"],
    raid: ["Bienvenue sur la chaîne ! 🔥", "Merci pour le raid 💜", "GG le raid 🙌", "Hello la commu 👋"],
  };
  function handleGg(who: string | null, kind: SpecialEventType) {
    const pool = GG_MESSAGES[kind] || GG_MESSAGES.follow;
    const base = pool[Math.floor(Math.random() * pool.length)];
    const nameable = kind === "follow" || kind === "sub" || kind === "don" || kind === "level";
    const txt = who && nameable && Math.random() > 0.5 ? `${base} @${who}` : base;
    void sendBody(txt);
  }

  // Bouton Combo → spawn une carte combo dans le flux + met à jour le chip
  // épinglé. Deux chaînes distinctes (follow / sub) via un id de chip par kind.
  function handleCombo(nextMult: number, kind: "follow" | "sub") {
    const id = -(Date.now() * 100000 + (specialSeqRef.current = (specialSeqRef.current + 1) % 100000));
    const who = join?.me?.username ?? "Un viewer";
    const m: ChatMsg = {
      id, userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(),
      type: "combo", data: { mult: nextMult, who, kind },
    };
    animatedMsgIdsRef.current.add(id);
    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > 50) next.splice(0, next.length - 50);
      return next;
    });
    forceScrollBottomMultiPass();
    const chipId = kind === "sub" ? "combo:sub" : "combo:follow";
    setActiveEvents((prev) => {
      const others = prev.filter((e) => e.id !== chipId);
      const comboChip: ActiveEvent = { id: chipId, type: "combo", data: { mult: nextMult, kind } };
      return [...others, comboChip].slice(-4);
    });
  }

  function removeActiveEvent(id: string) {
    setActiveEvents((prev) => prev.filter((e) => e.id !== id));
  }

  // État follow/sub du viewer pour la chaîne courante (conditionne Combo / S'abonner).
  React.useEffect(() => {
    if (!token || !slug) {
      setViewerFollows(false);
      setViewerSubbed(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((x) => x.json());
        if (alive) setViewerFollows(!!r?.isFollowing);
      } catch { /* ignore */ }
      try {
        const st = await fetch(`${apiBase()}/streamers/${encodeURIComponent(slug)}/gift-subs/status`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((x) => x.json());
        if (alive) setViewerSubbed(!!st?.isSub);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [token, slug]);

  /* -------------------------
     Messages spéciaux : actions des cartes (follow / sub / boss)
     ------------------------- */
  // Bouton "Suivre"/"Soutenir" (carte raid) → follow réel de la chaîne visée.
  // asFollowEvent (chaîne raidée) → spawn en plus une carte "follow" contexte
  // pour le viewer, comme un vrai follow apparaîtrait dans le chat.
  function handleFollowChannel(chSlug: string, asFollowEvent?: boolean) {
    if (!token) return onRequireLogin();
    const s = String(chSlug || "").trim();
    if (!s) return;
    followStreamer(s, token)
      .then(() =>
        window.dispatchEvent(new CustomEvent("ui:toast", {
          detail: { kind: "success", title: "💜 Suivi", message: `Tu suis désormais ${s}` },
        }))
      )
      .catch(() =>
        window.dispatchEvent(new CustomEvent("ui:toast", {
          detail: { kind: "error", title: "Erreur", message: "Impossible de suivre cette chaîne." },
        }))
      );
    if (asFollowEvent) {
      const id = -(Date.now() * 100000 + (specialSeqRef.current = (specialSeqRef.current + 1) % 100000));
      const who = join?.me?.username ?? "Un viewer";
      const m: ChatMsg = {
        id, userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(),
        type: "follow", data: { who },
      };
      animatedMsgIdsRef.current.add(id);
      setMessages((prev) => {
        const next = [...prev, m];
        if (next.length > 50) next.splice(0, next.length - 50);
        return next;
      });
      forceScrollBottomMultiPass();
    }
  }

  // Bouton "S'abonner aussi" (carte sub) → ouvre la SubModal de la page
  // streamer (elle écoute cet event). Fallback : page streamer.
  function handleSubscribe() {
    if (!token) return onRequireLogin();
    window.dispatchEvent(new CustomEvent("ui:open_sub", { detail: { slug } }));
  }

  // Bouton "Voir l'event" (carte boss) → page événement boss.
  function handleBossPage() {
    navigate("/event/boss");
  }

  /* -------------------------
     Load last messages
     ------------------------- */
  async function loadLastMessages(s: string) {
    try {
      setInitialLoading(true);
      const r = await fetch(`${apiBase()}/chat/${encodeURIComponent(s)}/messages?limit=50`);
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "messages_failed");
      setMessages(j.messages || []);
      pendingInitScrollRef.current = true;
    } finally {
      setInitialLoading(false);
    }
  }

  /* -------------------------
     Chat settings (gear)
     ------------------------- */
  const canManageSettings = join?.role === "mod" || join?.role === "streamer" || join?.role === "admin";
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsLoading, setSettingsLoading] = React.useState(false);
  const [chatSettings, setChatSettings] = React.useState<ChatSettings>({
    allowLinks: true,
    followOnly: false,
    subOnly: false,
    dliveUsername: null,
    dliveSyncPublic: false,
    dliveSyncPopup: false,
  });


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
        dliveUsername: st.settings.dliveUsername ? String(st.settings.dliveUsername) : null,
      });
      }
    } catch {}
  }

  /* -------------------------
     Bot / Emotes state
     ------------------------- */
  const [botOpen, setBotOpen] = React.useState(false);

  const [emoteOpen, setEmoteOpen] = React.useState(false);
  const [emoteTab, setEmoteTab] = React.useState<EmoteKind>("emoji");
  const [emotesChannel, setEmotesChannel] = React.useState<EmoteItem[]>([]);
  const [emotesGlobal, setEmotesGlobal] = React.useState<EmoteItem[]>([]);
  const [favs, setFavs] = React.useState<{ emoji: string[]; gif: string[] }>({ emoji: [], gif: [] });

  const emoteMapRef = React.useRef<Map<string, { url: string; title?: string }>>(new Map());

  async function fetchEmotes() {
    try {
      const r = await fetch(`${apiBase()}/chat/${encodeURIComponent(String(slug))}/emotes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }).then((x) => x.json());

      const j = r as EmotesPayload;
      if (!j?.ok) throw new Error("bad_payload");

      const all = Array.isArray(j.emotes)
        ? j.emotes
        : [
            ...(Array.isArray(j.channel) ? j.channel : []),
            ...(Array.isArray(j.global) ? j.global : []),
            ...(Array.isArray(j.native) ? j.native : []),
          ];

      const favorites = Array.isArray(j.favorites) ? j.favorites : [];
      const act = all.filter((e) => ((e as any).status ? (e as any).status === "active" : true));

      setEmotesChannel(act.filter((e) => e.scope === "channel"));
      setEmotesGlobal(act.filter((e) => e.scope === "global" || e.scope === "native"));

      setFavs({
        emoji: favorites.filter((e) => e.kind === "emoji" && e.id != null).map((e) => String(e.id)),
        gif: favorites.filter((e) => e.kind === "gif" && e.id != null).map((e) => String(e.id)),
      });
    } catch {
      setEmotesChannel([]);
      setEmotesGlobal([]);
      setFavs({ emoji: [], gif: [] });
    }
  }

  React.useEffect(() => {
    const map = new Map<string, { url: string; title?: string }>();

    const all = [
      ...NATIVE_GIFS,
      ...emotesGlobal.filter((x) => x.kind === "gif"),
      ...emotesChannel.filter((x) => x.kind === "gif"),
      ...emotesGlobal.filter((x) => x.kind === "emoji"),
      ...emotesChannel.filter((x) => x.kind === "emoji"),
    ];

    for (const e of all) {
      const u = absolutizeUrl(e.url ?? null);
      if (u) {
        const key = `${e.kind}:${safeTokenName(e.name)}`;
        map.set(key, { url: u, title: e.label || e.name });
      }
    }

    emoteMapRef.current = map;
  }, [emotesChannel, emotesGlobal]);

  const resolveEmote = React.useCallback((p: { kind: "emoji" | "gif"; name: string }) => {
    const k = `${p.kind}:${safeTokenName(p.name)}`;
    return emoteMapRef.current.get(k) || null;
  }, []);

  function insertAtCaret(text: string) {
    const el = inputRef.current;
    const cur = String(input || "");

    const start = el?.selectionStart ?? lastCaretRef.current ?? cur.length;
    const end = el?.selectionEnd ?? start;

    const next = cur.slice(0, start) + text + cur.slice(end);
    setInput(next);

    window.setTimeout(() => {
      const pos = start + text.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
      lastCaretRef.current = pos;
    }, 0);
  }

  async function toggleFav(item: EmoteItem) {
    if (item.scope === "channel") return;
    if (!token) return onRequireLogin();
    if (item.id == null) return;

    const id = Number(item.id);
    if (!id) return;

    const listKey = item.kind === "emoji" ? "emoji" : "gif";
    const isFav = (listKey === "emoji" ? favs.emoji : favs.gif).includes(String(id));

    try {
      if (isFav) {
        await fetch(`${apiBase()}/me/emotes/favorites/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).then((x) => x.json());
      } else {
        await fetch(`${apiBase()}/me/emotes/favorites/${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).then((x) => x.json());
      }

      setFavs((prev) => {
        const nextList = listKey === "emoji" ? [...prev.emoji] : [...prev.gif];
        const sid = String(id);
        const idx = nextList.indexOf(sid);
        if (idx >= 0) nextList.splice(idx, 1);
        else nextList.unshift(sid);
        return listKey === "emoji" ? { ...prev, emoji: nextList } : { ...prev, gif: nextList };
      });
    } catch {}
  }

  /* -------------------------
     Auto-refresh when my timeout ends
     ------------------------- */
  React.useEffect(() => {
    if (!join?.state?.timeoutUntil) return;

    const until = new Date(join.state.timeoutUntil).getTime();
    const ms = until - Date.now() + 250;
    if (ms <= 0) {
      sockRef.current?.emit("chat:refresh", { slug });
      return;
    }

    const t = window.setTimeout(() => {
      setJoin((prev) => (prev ? { ...prev, state: { ...(prev.state || { banned: false }), timeoutUntil: null } } : prev));
      sockRef.current?.emit("chat:refresh", { slug });
    }, ms);

    return () => window.clearTimeout(t);
  }, [slug, join?.state?.timeoutUntil]);

  React.useEffect(() => {
    const onJoin = (ev: any) => {
      const s = String(ev?.detail?.slug || "");
      if (!s) return;
      if (s.toLowerCase() !== String(slug).toLowerCase()) return;
      joinRain("toast");
    };

    window.addEventListener("ui:rain_join", onJoin as any);
    return () => window.removeEventListener("ui:rain_join", onJoin as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  /* -------------------------
     Socket connect + join
     ------------------------- */
  React.useEffect(() => {
    const s = String(slug || "").trim();
    const slugLower = s.toLowerCase();
    if (!s) return;

    setMessages([]);
    setShowJump(false);
    atBottomRef.current = true;
    setInitialLoading(true);
    pendingInitScrollRef.current = false;

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

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", (e: any) => {
      setSocketConnected(false);
      setError(String(e?.message || "socket_connect_error"));
    });

    socket.on("ui:toast", (payload: any) => {
      if (!payload?.title) return;
      window.dispatchEvent(new CustomEvent("ui:toast", { detail: payload }));
    });

    // État partagé rain (compteur + clôture) diffusé par le backend.
    socket.on("act:rain", (p: any) => {
      if (!p || p.round == null) return;
      actEngine.patchByRound("rain", Number(p.round), {
        serverCount: p.count != null ? Number(p.count) : undefined,
        resolved: !!p.resolved,
      });
    });

    socket.on("chat:message", (msg: ChatMsg) => {
      // Events actionnables (rain/roue/prédiction/coffre) → moteur v2 : carte
      // dans le flux + chip épinglé synchronisés (actEngine.open est stable).
      if (msg && typeof msg.type === "string" && ACTIONABLE_TYPES.has(msg.type)) {
        actEngine.open(msg.type as any, msg.data || {});
        return;
      }
      animatedMsgIdsRef.current.add(msg.id);
      setMessages((prev) => {
        // Dédup par id : un même socket peut être dans plusieurs rooms (public+popup)
        // après un changement de mode et recevoir le même chat:message 2x.
        if (prev.some((p) => p.id === msg.id)) return prev;
        const next = [...prev, msg];
        if (next.length > 50) next.splice(0, next.length - 50);
        return next;
      });
      forceScrollBottomMultiPass();
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
        dliveUsername: st.dliveUsername ? String(st.dliveUsername) : null,
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
      pendingInitScrollRef.current = true;
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

    const mode = visualMode === "popup" ? "popup" : "public";
    socket.emit("chat:join", { slug: s, mode }, async (ack: JoinAck) => {
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
      fetchEmotes();

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

  /* -------------------------
     Send message
     ------------------------- */
  async function send() {
    const text = input.replace(/\r/g, "").trim();
    await sendBody(text, { clearInput: true });
  }

  // envoi direct d'un body arbitraire (emote cliquée avec zone vide, etc.)
  async function sendBody(text: string, opts?: { clearInput?: boolean }) {
    setError(null);

    if (!isAuthed) {
      onRequireLogin();
      return;
    }
    if (isBanned) return setError("Tu es banni de ce chat.");
    if (isTimedOut) return setError(`Tu es en timeout (${fmtRemaining(timeoutUntil)}).`);

    if (!text) return;

    setSending(true);
    try {
      await new Promise<void>((resolve) => {
        sockRef.current?.emit("chat:send", { slug, body: text, streamControl }, (ack: any) => {
          if (!ack?.ok) {
            if (ack?.error === "auth_required") onRequireLogin();
            else if (ack?.error === "rate_limited") setError("Trop vite (slow mode 0.2s).");
            else if (ack?.error === "banned") setError("Tu es banni de ce chat.");
            else if (ack?.error === "links_disabled") setError("Les liens sont désactivés sur ce chat.");
            else if (ack?.error === "follow_only") setError("Chat réservé aux followers.");
            else if (ack?.error === "sub_only") setError("Chat réservé aux subs.");
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
            if (opts?.clearInput) setInput("");
            atBottomRef.current = true;
            forceScrollBottomMultiPass();
            if (focusedRef.current) window.setTimeout(() => inputRef.current?.focus(), 0);
          }
          resolve();
        });
      });
    } finally {
      setSending(false);
    }
  }

  /* -------------------------
     Menu actions (logic)
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

    subLoading?: boolean;
    isTargetSub?: boolean | null;
    giftSubLoading?: boolean;
  }>({
    open: false,
    x: 0,
    y: 0,
    msg: null,
    isTargetMod: null,
    modLoading: false,
    timeoutLoading: false,
    targetTimeoutUntil: null,
    subLoading: false,
    isTargetSub: null,
    giftSubLoading: false,
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
      subLoading: false,
      isTargetSub: null,
      giftSubLoading: false,
    });
  }

  async function openMenuAt(x: number, y: number, msg: ChatMsg) {
    const hasUser = Number(msg.userId) > 0;

    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

    const w = 320;   // largeur menu (comme dans ton drag)
    const h = 420;   // hauteur menu (comme dans ton drag)
    const maxX = window.innerWidth - 20;
    const maxY = window.innerHeight - 20;

    const cx = clamp(x, 8, maxX - w);
    const cy = clamp(y, 8, maxY - h);

    setMenu({
      open: true,
      x: cx,
      y: cy,
      msg,
      isTargetMod: null,
      modLoading: false,
      timeoutLoading: false,
      targetTimeoutUntil: null,
      subLoading: false,
      isTargetSub: null,
      giftSubLoading: false,
    });

    // Marque que le menu vient d'être ouvert pour éviter la fermeture immédiate
    menuJustOpened.current = true;
    setTimeout(() => {
      menuJustOpened.current = false;
    }, 100);

    // ✅ si pas d'utilisateur (DLive/externe), on ne fait pas les checks user-based
    // mais on laisse le menu ouvert pour au moins "Voir le profil"
    if (!hasUser) return;

    const isSelf = myId != null && Number(msg.userId) === Number(myId);

    if (!isSelf) {
      setMenu((m) => ({ ...m, subLoading: true, isTargetSub: null }));
      try {
        const r = await fetch(
          `${apiBase()}/streamers/${encodeURIComponent(String(slug))}/sub-status/${encodeURIComponent(String(msg.userId))}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        ).then((x) => x.json());
        if (r?.ok) setMenu((m) => ({ ...m, subLoading: false, isTargetSub: !!r.isSub }));
        else setMenu((m) => ({ ...m, subLoading: false, isTargetSub: null }));
      } catch {
        setMenu((m) => ({ ...m, subLoading: false, isTargetSub: null }));
      }
    }

    if (perms?.canManageMods) {
      setMenu((m) => ({ ...m, modLoading: true }));
      const ack = await emitSocket("chat:mod_status", { slug, userId: msg.userId });
      if (ack?.ok) setMenu((m) => ({ ...m, modLoading: false, isTargetMod: !!ack.isMod }));
      else setMenu((m) => ({ ...m, modLoading: false, isTargetMod: null }));
    }

    if (perms?.canTimeout && !isSelf) {
      setMenu((m) => ({ ...m, timeoutLoading: true }));
      const ack = await emitSocket("chat:timeout_status", { slug, userId: msg.userId });
      if (ack?.ok) setMenu((m) => ({ ...m, timeoutLoading: false, targetTimeoutUntil: ack.timeoutUntil || null }));
      else setMenu((m) => ({ ...m, timeoutLoading: false, targetTimeoutUntil: null }));
    }
  }

  function openMenuMouse(e: React.MouseEvent, msg: ChatMsg) {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    openMenuAt(e.clientX, e.clientY, msg);
  }

  const longPressTimer = React.useRef<number | null>(null);
  const menuJustOpened = React.useRef(false);
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

  function navigateToChannel(streamerSlugOrUsername: string) {
    closeMenu();
    // ⚠️ adapte si ta route n'est pas /streamer/:slug
    navigate(`/s/${encodeURIComponent(streamerSlugOrUsername)}`);
  }

  async function doGiftSub(msg: ChatMsg) {
    if (!token) {
      closeMenu();
      onRequireLogin();
      return;
    }

    setError(null);
    setMenu((m) => ({ ...m, giftSubLoading: true }));

    try {
      const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-sub`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientUserId: Number(msg.userId) }),
      }).then((x) => x.json());

      if (!r?.ok) throw new Error(String(r?.error || "gift_sub_failed"));

      closeMenu();
      setError(`✅ Sub offert à ${msg.username}`);
    } catch (e: unknown) {
      setError(errMessage(e));
    } finally {
      setMenu((m) => ({ ...m, giftSubLoading: false }));
    }
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
     Input layout (✅ what you asked)
     - Row 1: Bot / Emoji / Gear (gear only mods+)
     - Row 2: textarea + Envoyer
     ========================================================= */
  const pickerBottomOffset = 62; // popovers sit above composer area (2 rows)

  const onClickBot = () => {
    if (!token) return onRequireLogin();
    setBotOpen(true);
  };

  const onClickEmoji = () => {
    // pas de focus() ici : sur mobile ça ouvrait le clavier avec le menu
    setEmoteOpen((v) => !v);
    fetchEmotes();
  };

  // clic emote : zone vide → ENVOI direct ; sinon insertion au curseur
  const onPickEmote = (e: EmoteItem) => {
    const token =
      e.kind === "emoji" && e.scope === "native" && e.char
        ? e.char
        : `:${e.kind === "gif" ? "g" : "e"}:${e.name}:`;
    if (!input.trim()) {
      void sendBody(token);
    } else {
      insertAtCaret(token);
    }
    setEmoteOpen(false);
  };

  const onClickGear = async () => {
    setError(null);
    setSettingsOpen(true);
    await fetchSettings();
  };

  // expose bot/options au parent (barre mobile au-dessus du panel compact)
  React.useEffect(() => {
    onCanManageSettings?.(canManageSettings);
    if (!actionsRef) return;
    actionsRef.current = {
      openBot: onClickBot,
      openSettings: canManageSettings ? () => void onClickGear() : undefined,
    };
    return () => {
      actionsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionsRef, canManageSettings, token]);

  const popupRef = React.useRef<Window | null>(null);

function openChatPopup() {
  const url = `${window.location.origin}/popout/chat/${encodeURIComponent(String(slug))}`;

  const w = 420;
  const h = 740;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) * 0.5));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) * 0.2));

  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");

  try {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
  } catch {}

  const win = window.open(url, "lunalive_chat_popup", features);
  if (!win) {
    setError("Popup bloquée par le navigateur. Autorise les popups pour ce site.");
    return;
  }
  popupRef.current = win;
  win.focus();
}

  /* =========================================================
     Render
     ========================================================= */
  return (
    <div
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      onClick={() => {
        if (!menuJustOpened.current) {
          closeMenu();
        }
      }}
    >
      {/* anim */}
      <style>
        {`@keyframes chatFadeLeft{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}`}
      </style>
      <style>
        {`
        .ll-emote{
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          filter: none !important;
          outline: none !important;
          text-shadow: none !important;
        }

        .chat-enter {
          will-change: transform, opacity;
          backface-visibility: hidden;
          transform-origin: left center;
        }
        @keyframes chatEnterSlide {
          0% { opacity: 0; transform: translateX(-12px); }
          60% { opacity: 1; transform: translateX(2px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .chat-enter.slide {
          animation: chatEnterSlide 220ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }

        .llBotFab{
          position: fixed;
          right: 14px;
          bottom: calc(96px + env(safe-area-inset-bottom));
          z-index: 130;
          width: 52px;
          height: 52px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.20);
          background: linear-gradient(135deg, #7c4dff, #38bdf8);
          box-shadow: 0 12px 34px rgba(0,0,0,0.5), 0 0 0 3px rgba(124,77,255,0.16);
          font-size: 24px;
          line-height: 1;
          color: white;
          cursor: pointer;
          animation: llBotFabBreath 3s ease-in-out infinite;
        }
        .llBotFab:active{ transform: scale(0.94); }
        @keyframes llBotFabBreath{
          0%, 100% { box-shadow: 0 12px 34px rgba(0,0,0,0.5), 0 0 0 3px rgba(124,77,255,0.16); }
          50% { box-shadow: 0 12px 34px rgba(0,0,0,0.5), 0 0 0 7px rgba(124,77,255,0.26); }
        }
        @media (prefers-reduced-motion: reduce){ .llBotFab{ animation: none; } }
      `}
      </style>

      <ChatHeader
        compact={!!compact}
        join={join}
        isBanned={isBanned}
        isTimedOut={isTimedOut}
        timeoutUntil={timeoutUntil}
        onClickGear={() => void onClickGear()}
        canManageSettings={canManageSettings}
      />

      {/* bandeau reconnexion */}
      {!socketConnected && (
        <div style={{
          padding: "6px 12px", fontSize: 12, fontWeight: 700,
          background: "rgba(245,158,11,0.14)", borderBottom: "1px solid rgba(245,158,11,0.22)",
          color: "rgba(253,230,138,0.90)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
        }}>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", animation: "sp-dot-pulse 1.4s ease-in-out infinite" }} />
          Reconnexion en cours…
        </div>
      )}

      {/* barre d'events actifs épinglée (rain / roue / prédiction / coffre / combo) */}
      <ActiveEventsBar
        events={activeEvents}
        onExpire={removeActiveEvent}
        onJoinRain={() => void joinRain("chat")}
        onSpin={() => {}}
        onVote={() => {}}
        onChestOpen={() => {}}
        onComboAdvance={handleCombo}
        recap={pushRecap}
      />
      <ActionablePinnedBar engine={actEngine} isStreamer={isStreamerRole} />

      {/* zone scroll + jump */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div
          ref={listRef}
          onScroll={onScrollList}
          className="chatScroll"
          style={{
            height: "100%",
            overflow: "auto",
            padding: isPopup ? 18 : 12,
            display: "flex",
            flexDirection: "column",
            gap: isPopup ? 14 : 10,
            alignItems: isPopup ? "center" : "stretch",
            WebkitOverflowScrolling: "touch",
            ...({ ["--chat-name-color" as any]: nameColor, ["--chat-msg-color" as any]: msgColor } as any),
          }}
        >
          {initialLoading ? (
            <div style={{ opacity: 0.7, fontSize: 13 }}>Chargement…</div>
          ) : messages.length === 0 ? (
            <div style={{ opacity: 0.7, fontSize: 13 }}>Aucun message</div>
          ) : null}

          {(() => {
            return messages.map((m) => {
            // Ligne récap centrée (fin de rain, résultat prédiction, combo terminé…)
            if ((m.type as any) === "recap") {
              return (
                <div
                  key={m.id}
                  className={animatedMsgIdsRef.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                  onAnimationEnd={() => animatedMsgIdsRef.current.delete(m.id)}
                  style={{
                    alignSelf: "center", fontSize: 11.5, fontWeight: 700,
                    color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)", padding: "5px 12px", borderRadius: 999,
                  }}
                  dangerouslySetInnerHTML={{ __html: String(m.data?.html || "") }}
                />
              );
            }

            // Message système (participation actionnable : "X a récupéré…")
            if ((m.type as any) === "sys") {
              return (
                <div
                  key={m.id}
                  className={animatedMsgIdsRef.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                  onAnimationEnd={() => animatedMsgIdsRef.current.delete(m.id)}
                  style={{
                    alignSelf: "stretch", fontSize: 11.5, fontWeight: 600,
                    color: "rgba(180,170,220,0.82)", background: "rgba(124,92,252,0.07)",
                    border: "1px solid rgba(124,92,252,0.14)", padding: "5px 12px", borderRadius: 9,
                  }}
                  dangerouslySetInnerHTML={{ __html: `<span style="opacity:.6">🔔</span> ${String(m.data?.html || "")}` }}
                />
              );
            }

            // Carte actionnable (rain / roue / prédiction / coffre) — pilotée
            // par le moteur v2, synchronisée avec le chip épinglé.
            if ((m.type as any) === "act") {
              const ev = actEngine.events.find((x) => x.id === m.data?.actId) || null;
              return (
                <div
                  key={m.id}
                  className={animatedMsgIdsRef.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                  onAnimationEnd={() => animatedMsgIdsRef.current.delete(m.id)}
                  style={{ width: "100%", maxWidth: isPopup ? 560 : undefined, margin: isPopup ? "0 auto" : undefined }}
                >
                  <ActionableChatCard event={ev} engine={actEngine} isStreamer={isStreamerRole} />
                </div>
              );
            }

            // Carte "célébration" (raid / follow / combo / sub / don / boss / level)
            if (m.type && CELEBRATION_TYPES.has(m.type)) {
              return (
                <div
                  key={m.id}
                  className={animatedMsgIdsRef.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                  onAnimationEnd={() => animatedMsgIdsRef.current.delete(m.id)}
                  style={{ width: "100%", maxWidth: isPopup ? 560 : undefined, margin: isPopup ? "0 auto" : undefined }}
                >
                  <SpecialEventCard
                    type={m.type as SpecialEventType}
                    data={m.data || {}}
                    currentUsername={join?.me?.username ?? null}
                    viewerFollows={viewerFollows}
                    viewerSubbed={viewerSubbed}
                    onGg={handleGg}
                    onCombo={handleCombo}
                    onFollowChannel={handleFollowChannel}
                    onSubscribe={handleSubscribe}
                    onBossPage={handleBossPage}
                  />
                </div>
              );
            }

            const isSystem = m.userId === 0;
            const isDeleted = !!m.deleted || m.body === "";
            if (m.userId !== 0 && isDeleted) return null;

            if (isSystem) {
              return (
                <SystemMessageCard
                  key={m.id}
                  msg={m}
                  joinRain={joinRain}
                  animated={animatedMsgIdsRef.current.has(m.id)}
                />
              );
            }

            const baseCosmetics =
              DEBUG_FORCE_COSMETICS && m.username === DEBUG_USER
                ? (DEBUG_COSMETICS as ChatCosmetics)
                : (m.cosmetics ?? null);

            const effectiveCosmetics = applyViewerPolicy(baseCosmetics, viewerSkinsLevel);

            return (
              <div
                key={m.id}
                className={animatedMsgIdsRef.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                onAnimationEnd={() => {
                  animatedMsgIdsRef.current.delete(m.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  openMenuAt(e.clientX, e.clientY, m);
                }}
                onContextMenu={(e) => openMenuMouse(e, m)}
                onTouchStart={(e) => onTouchStartMsg(e, m)}
                onTouchEnd={cancelLongPress}
                onTouchCancel={cancelLongPress}
                onTouchMove={cancelLongPress}
                style={{
                  cursor: "pointer",
                  width: "100%",
                  maxWidth: isPopup ? 560 : undefined,
                  margin: isPopup ? "0 auto" : undefined,

                  // “plus gros” sans toucher ChatMessageBubble
                  transform: isPopup ? "scale(1.10)" : undefined,
                  transformOrigin: "center top",

                  // “plus léger” (léger visuellement)
                  opacity: isPopup ? 0.96 : 1,
                  filter: isPopup ? "brightness(1.08) saturate(0.92)" : undefined,
                }}
              >
                <ChatMessageBubble
                  streamerAppearance={appearance}
                  currentUsername={join?.me?.username ?? null}
                  resolveEmote={resolveEmote}
                  msg={{ ...m, cosmetics: effectiveCosmetics }}
                />
              </div>
            );
          });
          })()}
        </div>

        <JumpToBottomButton
          show={showJump}
          onClick={() => {
            scrollToBottom("smooth");
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      </div>

      {/* =========================================================
         INPUT (✅ new layout)
         ========================================================= */}
      <div
        style={{
          padding: 12,
          paddingBottom: 12 + (isCoarse ? kbInset : 0),
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          // RÈGLE (Lucas) : la zone d'envoi reste TOUJOURS visible en bas
          // de l'écran, même quand la page scrolle autour du panneau chat
          position: "sticky",
          bottom: 0,
          zIndex: 8,
          background: "rgba(15,10,24,0.97)",
        }}
      >
        {error ? <div style={{ fontSize: 12, color: "rgba(255,120,150,0.95)" }}>{error}</div> : null}

        {/* popovers */}
        <EmotePicker
          open={emoteOpen}
          bottomOffsetPx={pickerBottomOffset}
          emoteTab={emoteTab}
          setEmoteTab={setEmoteTab}
          emotesChannel={emotesChannel}
          emotesGlobal={emotesGlobal}
          favs={favs}
          onPick={onPickEmote}
          toggleFav={toggleFav}
          onClose={() => setEmoteOpen(false)}
        />

        <MentionPopover
          open={!!mention && mentionList.length > 0}
          items={mentionList}
          mention={mention}
          input={input}
          setInput={setInput}
          setMention={setMention}
          inputRef={inputRef}
          bottomOffsetPx={pickerBottomOffset}
        />

        {/* row 2: composer */}
        <div style={{ display: "flex", gap: 10 }}>
          <textarea
            ref={inputRef}
            disabled={!canSend || sending}
            value={input}
            rows={1}
            onChange={(e) => {
              const v = e.target.value;
              const caret = e.target.selectionStart ?? v.length;
              lastCaretRef.current = caret;
              setInput(v);

              const ctx = computeMentionCtx(v, caret);
              if (!ctx) return setMention(null);

              setMention((prev) => ({
                start: ctx.start,
                end: ctx.end,
                q: ctx.q,
                active: prev?.active != null ? prev.active : 0,
              }));
            }}
            onClick={(e) => {
              const el = e.currentTarget;
              const caret = el.selectionStart ?? input.length;
              lastCaretRef.current = caret;
              const ctx = computeMentionCtx(input, caret);
              setMention((prev) => {
                if (!ctx) return null;
                return { start: ctx.start, end: ctx.end, q: ctx.q, active: prev?.active ?? 0 };
              });
            }}
            onKeyUp={(e) => {
              const el = e.currentTarget;
              const caret = el.selectionStart ?? input.length;
              lastCaretRef.current = caret;
              const ctx = computeMentionCtx(input, caret);
              setMention((prev) => {
                if (!ctx) return null;
                return { start: ctx.start, end: ctx.end, q: ctx.q, active: prev?.active ?? 0 };
              });
            }}
            onFocus={() => {
              focusedRef.current = true;
            }}
            onBlur={() => {
              focusedRef.current = false;
            }}
            enterKeyHint="send"
            inputMode="text"
            onKeyDown={(e) => {
              // mention navigation
              if (mention && mentionList.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMention((m) => (m ? { ...m, active: Math.min((m.active ?? 0) + 1, mentionList.length - 1) } : m));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMention((m) => (m ? { ...m, active: Math.max((m.active ?? 0) - 1, 0) } : m));
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMention(null);
                  return;
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const pick = mentionList[mention.active ?? 0] || mentionList[0];
                  if (pick) {
                    const before = input.slice(0, mention.start);
                    const after = input.slice(mention.end);
                    const inserted = `${before}@${pick.username} ${after}`;
                    setInput(inserted);
                    setMention(null);
                    window.setTimeout(() => {
                      const pos = (before + "@" + pick.username + " ").length;
                      inputRef.current?.focus();
                      inputRef.current?.setSelectionRange(pos, pos);
                    }, 0);
                  }
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const pick = mentionList[mention.active ?? 0] || mentionList[0];
                  if (pick) {
                    const before = input.slice(0, mention.start);
                    const after = input.slice(mention.end);
                    const inserted = `${before}@${pick.username} ${after}`;
                    setInput(inserted);
                    setMention(null);
                    window.setTimeout(() => {
                      const pos = (before + "@" + pick.username + " ").length;
                      inputRef.current?.focus();
                      inputRef.current?.setSelectionRange(pos, pos);
                    }, 0);
                  }
                  return;
                }
                if (e.key === "Enter" && e.shiftKey) return;
              }

              // send: Enter (no shift). Shift+Enter => newline
              if (e.key === "Enter") {
                if (e.shiftKey) return;
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
              fontSize: 16, 
              resize: "none",
              minHeight: 44,
              maxHeight: 110,
              lineHeight: 1.25,
              overflow: "auto",
            }}
          />

          {/* emoji juste à côté d'Envoyer (économie de place, retour Lucas) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClickEmoji();
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: emoteOpen ? "rgba(124,77,255,0.22)" : "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 950,
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontSize: 17,
            }}
            title="Emojis & GIFs"
            aria-label="Emojis & GIFs"
          >
            😀
          </button>

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
              whiteSpace: "nowrap",
            }}
          >
            Envoyer
          </button>
        </div>
      </div>

      {/* settings modal */}
      <ChatSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        token={token || null}
        onRequireLogin={onRequireLogin}
        settingsLoading={settingsLoading}
        setSettingsLoading={setSettingsLoading}
        chatSettings={chatSettings}
        setChatSettings={setChatSettings}
        emitSocket={emitSocket}
        slug={slug}
        setError={setError}
        onOpenPopup={openChatPopup}
      />

      {/* menu */}
      <UserMenu
        menu={menu}
        setMenu={setMenu}
        closeMenu={closeMenu}
        perms={perms}
        isAuthed={isAuthed}
        myId={myId}
        token={token || null}
        slug={slug}
        navigateToChannel={(s) => navigateToChannel(s)}
        emitSocket={emitSocket}
        doGiftSub={doGiftSub}
        doDelete={doDelete}
        doTimeout={doTimeout}
        doUnmute={doUnmute}
        doBan={doBan}
        doSetMod={doSetMod}
      />

      {/* Bot : rendu ICI uniquement quand le chat est autonome (popout).
          Sur la page streamer, le bot est un FloatingBot détaché au niveau
          page (accessible sur tous les onglets) → showBotFab=false. */}
      {showBotFab ? (
        <>
          <button
            type="button"
            className="llBotFab"
            onClick={(e) => {
              e.stopPropagation();
              if (botOpen) setBotOpen(false);
              else onClickBot();
            }}
            title="LunaBot"
            aria-label="Ouvrir le menu LunaBot"
          >
            🤖
          </button>

          <BotMenu
            open={botOpen}
            onClose={() => setBotOpen(false)}
            slug={slug}
            token={token || null}
            role={join?.role}
            canMod={!!join?.perms?.canMod}
            onRequireLogin={onRequireLogin}
            sendBang={(text) => {
              sockRef.current?.emit("chat:send", { slug, body: text, streamControl }, () => {});
            }}
            variant={botMenuVariant}
            dockWidth={isPopup ? (botMenuDockWidth ?? 420) : undefined}
          />
        </>
      ) : null}

      {/* Roue partagée plein écran + modale liste participants (streamer) */}
      <WheelOverlay overlay={actEngine.overlay} onClose={() => {}} />
      <ParticipantListModal engine={actEngine} />
    </div>
  );
}
