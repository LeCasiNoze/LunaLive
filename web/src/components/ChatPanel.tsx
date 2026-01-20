// web/src/components/ChatPanel.tsx
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { ChatMessageBubble } from "./chat/ChatMessageBubble";
import type { ChatCosmetics } from "../lib/cosmetics";
import { BotMenu } from "../components/BotMenu";

import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  normalizeAppearance,
  type StreamerAppearance,
} from "../lib/appearance";

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

function errMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as any).message;
    if (typeof m === "string") return m;
  }
  return String(e || "error");
}

type ViewerRow = { userId: number; username: string };

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
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

/* =========================================================
   Component
   ========================================================= */
// ✅ Emotes picker (API-backed v1)
type EmoteKind = "emoji" | "gif";
type EmoteScope = "native" | "global" | "channel";

type EmoteItem = {
  id?: number; // ✅ présent pour DB emotes (global/channel/native en DB)
  kind: EmoteKind;
  scope: EmoteScope;
  streamer_id?: number | null;

  name: string;          // token
  label?: string | null; // UI
  url?: string | null;   // image url (custom/gif/emoji image)
  char?: string | null;  // unicode emoji (front-only natives)
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

function safeTokenName(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 32);
}

// tiny animated SVGs (demo “GIFs” légers)
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

const NATIVE_EMOJIS: EmoteItem[] = [
  { kind: "emoji", scope: "native", name: "smile", label: "Smile", char: "😀" },
  { kind: "emoji", scope: "native", name: "heart", label: "Heart", char: "❤️" },
  { kind: "emoji", scope: "native", name: "fire", label: "Fire", char: "🔥" },
  { kind: "emoji", scope: "native", name: "clap", label: "Clap", char: "👏" },
  { kind: "emoji", scope: "native", name: "skull", label: "Skull", char: "💀" },
  { kind: "emoji", scope: "native", name: "lol", label: "LOL", char: "😂" },
  { kind: "emoji", scope: "native", name: "cry", label: "Cry", char: "😭" },
  { kind: "emoji", scope: "native", name: "star", label: "Sparkles", char: "✨" },
];

const NATIVE_GIFS: EmoteItem[] = [
  { kind: "gif", scope: "native", name: "party", label: "party", url: svgGif("party", "🎉") },
  { kind: "gif", scope: "native", name: "gg", label: "gg", url: svgGif("gg", "🏆") },
  { kind: "gif", scope: "native", name: "rage", label: "rage", url: svgGif("rage", "😤") },
];

// favs : only global/native (viewer requirement)
const FAV_KEY = "ll_emote_favs_v1";
function readFavs(): { emoji: string[]; gif: string[] } {
  try {
    const j = JSON.parse(String(localStorage.getItem(FAV_KEY) || "{}"));
    return {
      emoji: Array.isArray(j.emoji) ? j.emoji.map(String) : [],
      gif: Array.isArray(j.gif) ? j.gif.map(String) : [],
    };
  } catch {
    return { emoji: [], gif: [] };
  }
}

function favKeyOf(e: EmoteItem) {
  return e.id != null ? String(e.id) : ""; // ✅ DB id uniquement
}

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

  const [viewers] = React.useState<ViewerRow[]>([]);
  const [mention, setMention] = React.useState<null | { start: number; end: number; q: string; active: number }>(
    null
  );

  const [sending, setSending] = React.useState(false);

  // ✅ IMPORTANT: join DOIT être déclaré avant viewerCandidates/useMemo
  const [join, setJoin] = React.useState<JoinAck | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const lastCaretRef = React.useRef<number>(0);

  function viewerCandidates(): ViewerRow[] {
    // ✅ Si l’API renvoie la vraie présence, on l’utilise
    const base = Array.isArray(viewers) && viewers.length ? viewers : [];

    if (base.length) {
      // dédoublonne / nettoie
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

    // 🔁 Fallback : si pas de présence dispo, au moins chatters + moi
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

  const { token } = useAuth();
  const navigate = useNavigate();

  const [appearance, setAppearance] = React.useState<StreamerAppearance>(DEFAULT_STREAMER_APPEARANCE);
  const [initialLoading, setInitialLoading] = React.useState(true);

  // autoscroll intelligent
  const atBottomRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);

  // ✅ init scroll flag
  const pendingInitScrollRef = React.useRef(false);

  function isAtBottom(thresholdPx: number = 8) {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
  }
  const [botOpen, setBotOpen] = React.useState(false);
  // 😀 Emotes picker
  const [emoteOpen, setEmoteOpen] = React.useState(false);
  const [emoteTab, setEmoteTab] = React.useState<EmoteKind>("emoji");
  const [emoteSearch, setEmoteSearch] = React.useState("");
  const [emotesChannel, setEmotesChannel] = React.useState<EmoteItem[]>([]);
  const [emotesGlobal, setEmotesGlobal] = React.useState<EmoteItem[]>([]);
  const [favs, setFavs] = React.useState(() => readFavs());

  // cache resolver map (token -> url)
  const emoteMapRef = React.useRef<Map<string, { url: string; title?: string }>>(new Map());

  const myId = join?.me?.id != null ? Number(join.me.id) : null;

  /* -------------------------
     Chat settings UI (gear)
     ------------------------- */
  const canManageSettings = join?.role === "mod" || join?.role === "streamer" || join?.role === "admin";

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsLoading, setSettingsLoading] = React.useState(false);
  const [chatSettings, setChatSettings] = React.useState<ChatSettings>({
    allowLinks: true,
    followOnly: false,
    subOnly: false,
  });

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

    // ✅ NEW: sub status + gift action
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
        u?.color ??
        u?.hex ??
        u?.colorId ??
        x?.usernameColorId ??
        x?.nameColorId ??
        x?.pseudoColorId ??
        null;
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
function isRainOpenMessage(msg: ChatMsg) {
  return typeof msg.body === "string" && msg.body.includes("[RAIN_OPEN]");
}

function stripRainToken(text: string) {
  return text.replace("[RAIN_OPEN]", "").trim();
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

  const nameColor = appearance.chat.usernameColor;
  const msgColor = appearance.chat.messageColor;
  const viewerSkinsLevel = (appearance.chat.viewerSkinsLevel ?? 1) as 1 | 2 | 3;
  const userScrolledRef = React.useRef(false);
  const ignoreScrollRef = React.useRef(false);
  const animatedMsgIdsRef = React.useRef<Set<number>>(new Set());
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

    const atBottom = isAtBottom();
    atBottomRef.current = atBottom;

  if (ignoreScrollRef.current) {
    return; // ⛔ scroll causé par un nouveau message → on ignore
  }

  if (atBottom) {
    userScrolledRef.current = false;
    setShowJump(false);
  } else {
    userScrolledRef.current = true;
    setShowJump(true);
  }
}

    // ✅ NEW: si on était en bas quand un msg arrive => on force le scroll au bottom (multi-pass)
React.useLayoutEffect(() => {
  if (initialLoading) return;
  if (userScrolledRef.current) return;

  const el = listRef.current;
  if (!el) return;

  const scroll = () => {
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
  };

  // multi-pass robuste
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

  /* =========================================================
     Socket helpers
     ========================================================= */
  function emitSocket(event: string, payload: any) {
    return new Promise<any>((resolve) => {
      sockRef.current?.emit(event as any, payload, (ack: any) => resolve(ack));
    });
  }

  async function joinRain(_from: "toast" | "chat" = "toast") {
    if (!token) return onRequireLogin();

    try {
      const r = await fetch(`${apiBase()}/me/bot/bot_rain/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
        new CustomEvent("ui:toast", {
          detail: { kind: "success", title: "🌧️ Rain", message: "Inscription validée ✅" },
        })
      );
    } catch (e: any) {
      window.dispatchEvent(
        new CustomEvent("ui:toast", {
          detail: { kind: "error", title: "🌧️ Rain", message: String(e?.message || "Erreur") },
        })
      );
    }
  }

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

  async function fetchSettings() {
    if (!token) return;
    try {
      const st = await emitSocket("chat:settings_get", { slug });
      if (st?.ok && st.settings) {
        setChatSettings({
          allowLinks: !!st.settings.allowLinks,
          followOnly: !!st.settings.followOnly,
          subOnly: !!st.settings.subOnly,
        });
      }
    } catch {}
  }

async function fetchEmotes() {
  try {
    const r = await fetch(`${apiBase()}/chat/${encodeURIComponent(String(slug))}/emotes`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).then((x) => x.json());

    const j = r as EmotesPayload;
    if (!j?.ok) throw new Error("bad_payload");

    // ✅ support 2 formats: (emotes[]) OU (channel/global/native)
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
    // refresh map whenever lists change
    const map = new Map<string, { url: string; title?: string }>();

    const all = [
      ...NATIVE_GIFS,
      ...emotesGlobal.filter((x) => x.kind === "gif"),
      ...emotesChannel.filter((x) => x.kind === "gif"),
      ...emotesGlobal.filter((x) => x.kind === "emoji"),
      ...emotesChannel.filter((x) => x.kind === "emoji"),
    ];

    for (const e of all) {
      if (e.url) {
        const key = `${e.kind}:${safeTokenName(e.name)}`;
        map.set(key, { url: e.url, title: e.label || e.name });
      }
    }

    emoteMapRef.current = map;
  }, [emotesChannel, emotesGlobal]);

  const resolveEmote = React.useCallback(
    (p: { kind: "emoji" | "gif"; name: string }) => {
      const k = `${p.kind}:${safeTokenName(p.name)}`;
      return emoteMapRef.current.get(k) || null;
    },
    []
  );

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
  // spec: favorites only global/native + doit venir DB (id)
  if (item.scope === "channel") return;
  if (!token) return onRequireLogin();
  if (item.id == null) return; // ✅ pas de favorites sur “natif unicode front-only”

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

    // ✅ update local state (optimistic)
    setFavs((prev) => {
      const nextList = listKey === "emoji" ? [...prev.emoji] : [...prev.gif];
      const sid = String(id);
      const idx = nextList.indexOf(sid);

      if (idx >= 0) nextList.splice(idx, 1);
      else nextList.unshift(sid);

      return listKey === "emoji" ? { ...prev, emoji: nextList } : { ...prev, gif: nextList };
    });
  } catch {
    // ignore
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

    socket.on("connect_error", (e: any) => {
      setError(String(e?.message || "socket_connect_error"));
    });

    socket.on("ui:toast", (payload: any) => {
      if (!payload?.title) return;
      window.dispatchEvent(new CustomEvent("ui:toast", { detail: payload }));
    });

    socket.on("chat:message", (msg: ChatMsg) => {
      animatedMsgIdsRef.current.add(msg.id); // 👈 AJOUT
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > 50) next.splice(0, next.length - 50);
        return next;
      });

      forceScrollBottomMultiPass();
    });

    // ✅ NEW: settings broadcast
    socket.on("chat:settings", (payload: any) => {
      if (!payload?.ok) return;
      const st = payload.settings || {};
      setChatSettings({
        allowLinks: !!st.allowLinks,
        followOnly: !!st.followOnly,
        subOnly: !!st.subOnly,
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

      // ✅ fetch settings if can manage
      if (ack?.role === "mod" || ack?.role === "streamer" || ack?.role === "admin") {
        await fetchSettings();
      }
      // ✅ emotes lists
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
            setInput("");
            // ✅ quand j’envoie moi-même → toujours revenir en bas
            atBottomRef.current = true;
            forceScrollBottomMultiPass();

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

      subLoading: false,
      isTargetSub: null,
      giftSubLoading: false,
    });

    const isSelf = myId != null && Number(msg.userId) === Number(myId);

    // check sub status
    if (!isSelf) {
      setMenu((m) => ({ ...m, subLoading: true, isTargetSub: null }));
      try {
        const r = await fetch(
          `${apiBase()}/streamers/${encodeURIComponent(String(slug))}/sub-status/${encodeURIComponent(
            String(msg.userId)
          )}`,
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
     Render
     ========================================================= */
  return (
    <div
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      onClick={() => {
        closeMenu();
      }}
    >
      <style>
        {`@keyframes chatFadeLeft{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}`}
      </style>
      
      <style>
      {`
      .chat-enter {
        will-change: transform, opacity;
        backface-visibility: hidden;
        transform-origin: left center;
      }

      /* Slide doux et fluide */
      @keyframes chatEnterSlide {
        0% {
          opacity: 0;
          transform: translateX(-12px);
        }
        60% {
          opacity: 1;
          transform: translateX(2px);
        }
        100% {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .chat-enter.slide {
        animation: chatEnterSlide 220ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      `}
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
            ...({ ["--chat-name-color" as any]: nameColor, ["--chat-msg-color" as any]: msgColor } as any),
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

          if (isSystem) {
            const isRain = isRainOpenMessage(m);
            const body = isRain ? stripRainToken(m.body) : m.body;

            return (
              <div
                key={m.id}
                className={
                  animatedMsgIdsRef.current.has(m.id)
                    ? `chat-enter ${CHAT_ENTER_ANIM}`
                    : undefined
                }
                style={{
                  cursor: "default",
                  padding: 10,
                  borderRadius: 14,
                  background: "rgba(124,77,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.06)",
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

                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95, color: "white" }}>
                  {body}
                </div>

                {isRain ? (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => joinRain("chat")}
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

            const baseCosmetics =
              DEBUG_FORCE_COSMETICS && m.username === DEBUG_USER
                ? (DEBUG_COSMETICS as ChatCosmetics)
                : (m.cosmetics ?? null);

            const effectiveCosmetics = applyViewerPolicy(baseCosmetics, viewerSkinsLevel);

            return (
            <div
              key={m.id}
              className={
                animatedMsgIdsRef.current.has(m.id)
                  ? `chat-enter ${CHAT_ENTER_ANIM}`
                  : undefined
              }
              onAnimationEnd={() => {
                animatedMsgIdsRef.current.delete(m.id);
              }}
              onClick={(e) => {
                // ✅ clic gauche ouvre aussi le menu
                e.stopPropagation();
                openMenuAt(e.clientX, e.clientY, m);
              }}
              onContextMenu={(e) => openMenuMouse(e, m)} // clic droit
              onTouchStart={(e) => onTouchStartMsg(e, m)}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              onTouchMove={cancelLongPress}
              style={{ cursor: "pointer" }}
            >
            <ChatMessageBubble
              streamerAppearance={appearance}
              currentUsername={join?.me?.username ?? null}
              resolveEmote={resolveEmote}
              msg={{
                ...m,
                cosmetics: effectiveCosmetics,
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

        <div style={{ display: "flex", gap: 10, position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              if (!token) return onRequireLogin();
              setBotOpen(true);
            }}
            style={{
              flex: 1,
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(124,77,255,0.18)",
              color: "white",
              fontWeight: 950,
              cursor: "pointer",
            }}
            title="Ouvrir le menu du bot"
            aria-label="Ouvrir le menu du bot"
          >
            🤖 Bot
          </button>
        </div>
        {emoteOpen ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 56,
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
              {([
                { k: "emoji", label: "Emojis" },
                { k: "gif", label: "GIFs" },
              ] as const).map((t) => {
                const active = emoteTab === t.k;
                return (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => setEmoteTab(t.k)}
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
                onClick={() => setEmoteOpen(false)}
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

            {/* search */}
            <input
              value={emoteSearch}
              onChange={(e) => setEmoteSearch(e.target.value)}
              placeholder={`Rechercher ${emoteTab === "gif" ? "un GIF" : "un emoji"}…`}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
                outline: "none",
                marginBottom: 10,
              }}
            />

            {(() => {
              const q = safeTokenName(emoteSearch).replace(/_/g, "");
              const isGif = emoteTab === "gif";

              const native = (isGif ? NATIVE_GIFS : NATIVE_EMOJIS).filter((e) => {
                if (!q) return true;
                const hay = (e.name + (e.label || "")).toLowerCase().replace(/[^a-z0-9]+/g, "");
                return hay.includes(q);
              });

              const global = emotesGlobal
                .filter((e) => e.kind === emoteTab)
                .filter((e) => {
                  if (!q) return true;
                  const hay = (e.name + (e.label || "")).toLowerCase().replace(/[^a-z0-9]+/g, "");
                  return hay.includes(q);
                });

              const channel = emotesChannel
                .filter((e) => e.kind === emoteTab)
                .filter((e) => {
                  if (!q) return true;
                  const hay = (e.name + (e.label || "")).toLowerCase().replace(/[^a-z0-9]+/g, "");
                  return hay.includes(q);
                });

              const favKeys = isGif ? favs.gif : favs.emoji;

              const byKey = new Map<string, EmoteItem>();
              for (const e of [...native, ...global, ...channel]) byKey.set(favKeyOf(e), e);

              const favItems = favKeys.map((k) => byKey.get(k)).filter(Boolean) as EmoteItem[];

              const sections: Array<{ title: string; items: EmoteItem[]; note?: string }> = [
                { title: "⭐ Favoris", items: favItems, note: "Favoris = natifs/globaux (DB)" },
                { title: "🌍 Global", items: global },
                { title: "🎯 Chaîne", items: channel },
                { title: "🌙 Natifs", items: native },
              ];

              const gridBtn: React.CSSProperties = {
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 10px",
                width: "100%",
              };

              return (
                <div style={{ maxHeight: 320, overflow: "auto", paddingRight: 2 }}>
                  {sections.map((sec) => (
                    <div key={sec.title} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginBottom: 8 }}>
                          {sec.title}
                        </div>
                        {sec.note ? (
                          <div style={{ fontSize: 11, opacity: 0.55, fontWeight: 800 }}>{sec.note}</div>
                        ) : null}
                      </div>

                      {sec.items.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 800, padding: "6px 2px" }}>
                          —
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                          {sec.items.slice(0, 60).map((e) => {
                            const canFav = e.scope !== "channel" && e.id != null;
                            const fk = favKeyOf(e);
                            const isFav = (isGif ? favs.gif : favs.emoji).includes(fk);

                            return (
                              <button
                                key={`${e.scope}:${e.kind}:${e.name}`}
                                type="button"
                                style={gridBtn}
                                title={`:${e.kind === "gif" ? "g" : "e"}:${e.name}:`}
                                onClick={() => {
                                  // insert
                                  if (e.kind === "emoji" && e.scope === "native" && e.char) {
                                    insertAtCaret(e.char);
                                  } else {
                                    insertAtCaret(`:${e.kind === "gif" ? "g" : "e"}:${e.name}:`);
                                  }
                                  setEmoteOpen(false);
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  {e.kind === "emoji" && e.scope === "native" && e.char ? (
                                    <span style={{ fontSize: 18 }}>{e.char}</span>
                                  ) : e.url ? (
                                    <img
                                      src={e.url}
                                      alt=""
                                      style={{
                                        width: e.kind === "gif" ? 28 : 20,
                                        height: e.kind === "gif" ? 28 : 20,
                                        borderRadius: e.kind === "gif" ? 10 : 6,
                                        border: e.kind === "gif" ? "1px solid rgba(255,255,255,0.10)" : "none",
                                        background: e.kind === "gif" ? "rgba(255,255,255,0.04)" : "transparent",
                                      }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: 18 }}>{e.kind === "gif" ? "🎞️" : "🙂"}</span>
                                  )}

                                  <span
                                    style={{
                                      fontSize: 12,
                                      opacity: 0.85,
                                      fontWeight: 950,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {e.kind === "emoji" && e.scope === "native" ? (e.name || "emoji") : (e.label || e.name)}
                                  </span>
                                </div>

                                <span
                                  onClick={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    if (!canFav) return;
                                    toggleFav(e);
                                  }}
                                  title={canFav ? (isFav ? "Retirer des favoris" : "Ajouter aux favoris") : "Favoris globaux uniquement"}
                                  style={{
                                    padding: "4px 6px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.10)",
                                    background: canFav && isFav ? "rgba(255,210,110,0.18)" : "rgba(0,0,0,0.20)",
                                    opacity: canFav ? 1 : 0.35,
                                    fontSize: 12,
                                  }}
                                >
                                  ⭐
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10 }}>
          {mention && mentionList.length ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 56,
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
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900, padding: "2px 6px 8px" }}>
              Mentionner quelqu’un
            </div>

            {mentionList.map((u, i) => {
              const active = i === (mention.active ?? 0);
              return (
                <button
                  key={`${u.userId}:${u.username}`}
                  type="button"
                  onClick={() => {
                    const before = input.slice(0, mention.start);
                    const after = input.slice(mention.end);
                    const inserted = `${before}@${u.username} ${after}`;
                    setInput(inserted);
                    setMention(null);

                    window.setTimeout(() => {
                      const pos = (before + "@" + u.username + " ").length;
                      inputRef.current?.focus();
                      inputRef.current?.setSelectionRange(pos, pos);
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
        ) : null}
          <input
            ref={inputRef}
            disabled={!canSend || sending}
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              const caret = e.target.selectionStart ?? v.length;
              lastCaretRef.current = caret;
              setInput(v);

              const ctx = computeMentionCtx(v, caret);
              if (!ctx) return setMention(null);

              // ouvre mention si @ vient d'être tapé OU si on est dedans
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
              // optionnel: fermer la popover quand on perd le focus
              // setMention(null);
            }}
            enterKeyHint="send"
            inputMode="text"
            onKeyDown={(e) => {
              // mention navigation
              if (mention && mentionList.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMention((m) =>
                    m ? { ...m, active: Math.min((m.active ?? 0) + 1, mentionList.length - 1) } : m
                  );
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
                if (e.key === "Tab" || e.key === "Enter") {
                  e.preventDefault();
                  const pick = mentionList[mention.active ?? 0] || mentionList[0];
                  if (pick) {
                    // insert mention
                    const before = input.slice(0, mention.start);
                    const after = input.slice(mention.end);
                    const inserted = `${before}@${pick.username} ${after}`;
                    setInput(inserted);
                    setMention(null);

                    // place caret
                    window.setTimeout(() => {
                      const pos = (before + "@" + pick.username + " ").length;
                      inputRef.current?.focus();
                      inputRef.current?.setSelectionRange(pos, pos);
                    }, 0);
                  }
                  return;
                }
              }

              // ton envoi normal
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
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEmoteOpen((v) => !v);
              setEmoteSearch("");
              // auto-refresh (when API exists)
              fetchEmotes();
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: emoteOpen ? "rgba(124,77,255,0.22)" : "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 950,
              cursor: "pointer",
            }}
            title="Emojis & GIFs"
            aria-label="Emojis & GIFs"
          >
            😀
          </button>

          {canManageSettings ? (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                setError(null);
                setSettingsOpen(true);
                await fetchSettings();
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
              title="Options du chat"
              aria-label="Options du chat"
            >
              ⚙️
            </button>
          ) : null}

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

      {/* settings modal */}
      {settingsOpen ? (
        <div
          onClick={() => setSettingsOpen(false)}
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
                onClick={() => setSettingsOpen(false)}
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

              {[
                {
                  key: "allowLinks",
                  title: "Autoriser les liens",
                  desc: "Bloque les URLs dans les messages.",
                  value: chatSettings.allowLinks,
                },
                {
                  key: "followOnly",
                  title: "Follow-only",
                  desc: "Seuls les followers peuvent parler. (désactive sub-only si activé)",
                  value: chatSettings.followOnly,
                },
                {
                  key: "subOnly",
                  title: "Sub-only",
                  desc: "Seuls les subs actifs peuvent parler. (désactive follow-only si activé)",
                  value: chatSettings.subOnly,
                },
              ].map((it) => (
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
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.80, fontWeight: 700 }}>
                      {it.desc}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={settingsLoading}
                    onClick={async () => {
                      if (!token) return onRequireLogin();
                      setSettingsLoading(true);
                      setError(null);
                      try {
                        const patch: any = { [it.key]: !it.value };
                        const ack = await emitSocket("chat:settings_set", { slug, patch });
                        if (!ack?.ok) throw new Error(String(ack?.error || "settings_failed"));

                        const s = ack.settings || {};
                        setChatSettings({
                          allowLinks: !!s.allowLinks,
                          followOnly: !!s.followOnly,
                          subOnly: !!s.subOnly,
                        });
                      } catch (e: any) {
                        setError(String(e?.message || "Erreur"));
                      } finally {
                        setSettingsLoading(false);
                      }
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: it.value ? "rgba(80,255,160,0.14)" : "rgba(255,255,255,0.06)",
                      color: "white",
                      fontWeight: 950,
                      cursor: settingsLoading ? "not-allowed" : "pointer",
                      opacity: settingsLoading ? 0.7 : 1,
                      whiteSpace: "nowrap",
                      minWidth: 64,
                      textAlign: "center",
                    }}
                  >
                    {settingsLoading ? "…" : it.value ? "ON" : "OFF"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* menu (rework + draggable) */}
      {menu.open && menu.msg ? (
        <div
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            zIndex: 90,
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
              const startLeft = menu.x;
              const startTop = menu.y;

              const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

              const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                const nextX = startLeft + dx;
                const nextY = startTop + dy;

                // limite dans l’écran (un peu safe)
                const w = 320; // approx maxWidth
                const h = 420; // approx hauteur menu max
                const maxX = window.innerWidth - 20;
                const maxY = window.innerHeight - 20;

                setMenu((m) => ({
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
                {menu.msg.username}
              </div>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 800, marginTop: 2 }}>
                Actions utilisateur
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
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

          {/* Body */}
          <div style={{ padding: 12 }}>
            {/* Primary */}
            <button
              onClick={() => goProfile(menu.msg!)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                textAlign: "left",
                fontWeight: 950,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              👤 Voir le profil
            </button>

            {!targetIsSelf && menu.isTargetSub !== true ? (
              <button
                onClick={() => doGiftSub(menu.msg!)}
                disabled={!!menu.giftSubLoading}
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
                  opacity: menu.giftSubLoading ? 0.75 : 1,
                }}
                title="Offrir un sub"
              >
                {menu.giftSubLoading ? "🎁 Offre en cours…" : "🎁 Offrir un sub"}
              </button>
            ) : null}

            {!targetIsSelf && isAuthed && menu.subLoading ? (
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 850, marginBottom: 10 }}>
                Vérification sub…
              </div>
            ) : null}

            {!targetIsSelf && isAuthed && menu.isTargetSub === true ? (
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 850, marginBottom: 10 }}>
                Déjà abonné ✅
              </div>
            ) : null}

            {/* Mod tools */}
            {(perms?.canManageMods || perms?.canDelete || perms?.canTimeout || perms?.canBan) ? (
              <div
                style={{
                  marginTop: 6,
                  marginBottom: 10,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950, marginBottom: 8 }}>
                  Modération
                </div>

                {perms?.canManageMods ? (
                  <button
                    onClick={() => doSetMod(menu.msg!, !(menu.isTargetMod === true))}
                    disabled={!!menu.modLoading || menu.isTargetMod == null}
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
                      opacity: menu.isTargetMod == null ? 0.7 : 1,
                    }}
                  >
                    {menu.modLoading
                      ? "Chargement…"
                      : menu.isTargetMod
                      ? "🛡️ Retirer des modérateurs"
                      : "🛡️ Mettre modérateur"}
                  </button>
                ) : null}

                {perms?.canDelete ? (
                  <button
                    onClick={() => doDelete(menu.msg!)}
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

                {perms?.canTimeout && !targetIsSelf && targetIsTimedOut ? (
                  <button
                    onClick={() => doUnmute(menu.msg!)}
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

                {/* ✅ BAN au-dessus des timeouts */}
                {perms?.canBan && !targetIsSelf ? (
                  <button
                    onClick={() => doBan(menu.msg!)}
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

                {/* Timeouts */}
                {perms?.canTimeout && !targetIsSelf ? (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950, marginBottom: 8 }}>
                      Timeout
                    </div>

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
                          onClick={() => doTimeout(menu.msg!, x.sec)}
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
        </div>
      ) : null}

            <BotMenu
        open={botOpen}
        onClose={() => setBotOpen(false)}
        slug={slug}
        token={token || null}
        role={join?.role}
        canMod={!!join?.perms?.canMod}
        onRequireLogin={onRequireLogin}
        sendBang={(text) => {
          // on passe par la même logique que le chat -> intercept server-side
          sockRef.current?.emit("chat:send", { slug, body: text }, () => {});
        }}
      />

    </div>
  );
}
