// web/src/pages/streamer/StreamerPage.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — rewrite visuel complet
//  Logique 100% identique à l'original (src doc 3)
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  watchHeartbeat,
  me,
  getLives,
  updateMyStreamerTitle,
  updateStreamerTitleBySlug,
} from "../../lib/api";
import { DlivePlayer } from "../../components/DlivePlayer";
import RumbleStreamPlayer from "../../components/RumbleStreamPlayer";
import RumbleEmbedPlayer from "../../components/RumbleEmbedPlayer";
import { ChatPanel } from "../../components/ChatPanel";
import { FloatingBot } from "../../components/botmenu/FloatingBot";
import { LoginModal } from "../../components/LoginModal";
import { SubModal } from "../../components/SubModal";
import { useAuth } from "../../auth/AuthProvider";
import { svgThumb } from "../../lib/thumb";
import { setSeo, setDynamicRouteSeo } from "../../lib/seo";

import { EyeIcon, ChatIcon, BellIcon } from "./components/icons";
import { LiveDurationText, getAnonId } from "./utils";
import { useResponsive } from "./hooks/useResponsive";
import { useCinema } from "./hooks/useCinema";
import { useStreamerData } from "./hooks/useStreamerData";
import { useChest } from "./hooks/useChest";
import { ChestToast } from "./components/ChestToast";
import { ChestModal } from "./components/ChestModal";
import { trackFeatureEvent } from "../../lib/feature_events";

import { AboutTab } from "./tabs/AboutTab";
import { VodTab } from "./tabs/VodTab";
import { AgendaTab } from "./tabs/AgendaTab";
import { ClipsTab } from "./tabs/ClipsTab";

import StreamerPageMobile from "./StreamerPage.mobile";

/* ─── utils (identiques) ─────────────────────────────────────── */
function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}
const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function absolutizeAvatar(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
  return u;
}

function pickStreamerAvatarUrlFromStreamer(streamer: any) {
  const uid = streamer?.ownerUserId ?? streamer?.owner_user_id ?? streamer?.userId
    ?? streamer?.user_id ?? streamer?.ownerId ?? streamer?.owner_id
    ?? streamer?.user?.id ?? streamer?.ownerUser?.id ?? null;

  // 1. Avatar uploadé par le user (champ user.avatarUrl rempli par le backend)
  const userAvatarRaw = streamer?.user?.avatarUrl ?? streamer?.user?.avatar_path ?? null;
  const userAvatar = userAvatarRaw ? absolutizeAvatar(String(userAvatarRaw)) : null;

  // 2. Anciens champs avatar directs sur le streamer
  const directRaw = streamer?.avatarUrl ?? streamer?.avatar_url ?? streamer?.avatar
    ?? streamer?.profilePicUrl ?? streamer?.profile_pic_url ?? streamer?.profile?.avatarUrl ?? null;
  const direct = directRaw ? absolutizeAvatar(String(directRaw)) : null;

  // 3. Avatar par défaut associé au compte (généré backend) — /avatars/u/{uid}
  const byUid = uid ? absolutizeAvatar(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;

  // 4. Vraiment rien -> SVG initiales
  return userAvatar || direct || byUid || svgThumb(streamer?.displayName || "Streamer");
}

type TabKey = "about" | "clips" | "vod" | "agenda";
type GiftStatus = { remaining: number; canClaim: boolean; myClaimed: boolean };

function fmt(n: any) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString() : "0";
}
function initialsOf(name: any) {
  return (String(name || "").replace(/^@/, "").trim()[0] || "S").toUpperCase();
}

/* ─── CSS injected once ──────────────────────────────────────── */
const SP_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

/* ── Keyframes ── */
@keyframes sp-live-band {
  0%   { background-position: 0%   50%; }
  100% { background-position: 200% 50%; }
}
@keyframes sp-dot-pulse {
  0%,100% { opacity:1;    transform:scale(1);    }
  50%     { opacity:.50;  transform:scale(.78);  }
}
@keyframes sp-tab-in {
  from { opacity:0; transform:translateY(5px); }
  to   { opacity:1; transform:translateY(0);   }
}
@keyframes sp-fade-in {
  from { opacity:0; }
  to   { opacity:1; }
}
@keyframes sp-slide-right {
  from { opacity:0; transform:translateX(18px); }
  to   { opacity:1; transform:translateX(0);    }
}

/* ── Syne font on page ── */
.sp-root { font-family:'Syne',system-ui,sans-serif; }

/* ── Glass panel ── */
.sp-glass {
  border-radius:22px;
  border:1px solid rgba(124,92,252,.18);
  background:rgba(11,9,22,.88);
  backdrop-filter:blur(16px);
  box-shadow:0 18px 55px rgba(0,0,0,.28), 0 0 0 1px rgba(167,139,250,.04) inset;
  position:relative;
  overflow:hidden;
}
.sp-glass::before {
  content:"";
  position:absolute;
  top:0; left:8%; right:8%; height:1px;
  pointer-events:none; z-index:2;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.34) 38%,rgba(91,142,248,.24) 62%,transparent);
}

/* ── Glass modal (more opaque) ── */
.sp-modal {
  border-radius:22px;
  border:1px solid rgba(124,92,252,.22);
  background:rgba(11,9,22,.95);
  backdrop-filter:blur(20px);
  box-shadow:0 28px 80px rgba(0,0,0,.58);
  position:relative;
  overflow:hidden;
}
.sp-modal::before {
  content:"";
  position:absolute;
  top:0; left:8%; right:8%; height:1px;
  pointer-events:none; z-index:2;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.30) 38%,rgba(91,142,248,.20) 62%,transparent);
}

/* ── Modal header ── */
.sp-modal-head {
  padding:12px 16px;
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  border-bottom:1px solid rgba(124,92,252,.12);
  flex-shrink:0;
  position:relative; z-index:3;
}
.sp-modal-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:15px; letter-spacing:-.2px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa 55%,#5b8ef8);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.sp-modal-body {
  padding:16px;
  overflow:auto;
  flex:1;
  position:relative; z-index:1;
}

/* ── Tab buttons ── */
.sp-tab {
  padding:9px 18px; border-radius:14px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05);
  color:rgba(196,181,253,.58);
  cursor:pointer; white-space:nowrap;
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:13px;
  transition:border-color 130ms, background 130ms, color 130ms;
}
.sp-tab:hover {
  border-color:rgba(124,92,252,.24);
  background:rgba(124,92,252,.10);
  color:rgba(196,181,253,.85);
}
.sp-tab.active {
  border-color:rgba(124,92,252,.38);
  background:linear-gradient(90deg,rgba(124,92,252,.22),rgba(59,77,200,.16),rgba(91,142,248,.14));
  color:rgba(235,232,255,.92);
  box-shadow:0 0 0 2px rgba(124,92,252,.09);
}

/* ── Input ── */
.sp-input {
  width:100%; padding:11px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.18);
  background:rgba(124,92,252,.07);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:14px;
  outline:none;
  transition:border-color 140ms, box-shadow 140ms;
}
.sp-input:focus {
  border-color:rgba(124,92,252,.38);
  box-shadow:0 0 0 3px rgba(124,92,252,.08);
}
.sp-input::placeholder { color:rgba(167,139,250,.40); }

/* ── Drawer row ── */
.sp-row {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:11px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05);
  cursor:pointer; width:100%;
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:13px;
  color:rgba(235,232,255,.88);
  transition:border-color 130ms, background 130ms;
}
.sp-row:hover  { border-color:rgba(124,92,252,.26); background:rgba(124,92,252,.11); }
.sp-row:disabled { opacity:.50; cursor:not-allowed; }

/* ── Pill chip ── */
.sp-pill {
  display:inline-flex; align-items:center; gap:6px;
  padding:5px 10px; border-radius:999px; white-space:nowrap;
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:11px;
  border:1px solid rgba(124,92,252,.18);
  background:rgba(124,92,252,.08);
  color:rgba(196,181,253,.80);
}
.sp-pill-live {
  border-color:rgba(239,68,68,.36);
  background:rgba(239,68,68,.12);
  color:rgba(252,165,165,.90);
}
.sp-pill-off {
  border-color:rgba(124,92,252,.10);
  background:rgba(124,92,252,.04);
  color:rgba(196,181,253,.42);
}
.sp-pill-green {
  border-color:rgba(52,211,153,.26);
  background:rgba(52,211,153,.08);
  color:rgba(110,231,183,.82);
}

/* ── Overlay backdrop ── */
.sp-backdrop {
  position:fixed; inset:0; z-index:80;
  background:rgba(0,0,0,.64);
  backdrop-filter:blur(8px);
  animation:sp-fade-in 160ms ease;
}

/* ── Offline card ── */
.sp-offline {
  position:relative; border-radius:20px; overflow:hidden;
  aspect-ratio:16/9;
  border:1px solid rgba(124,92,252,.16);
}

/* ── Chat sidebar ── */
.sp-chat-head {
  padding:12px 14px;
  border-bottom:1px solid rgba(124,92,252,.10);
  background:rgba(124,92,252,.03);
  flex-shrink:0;
}

/* ── Section label ── */
.sp-label {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:11px; letter-spacing:.04em;
  text-transform:uppercase; color:rgba(167,139,250,.55);
}

/* ── Gradient title (reusable) ── */
.sp-title-grad {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; letter-spacing:-.3px;
  background:linear-gradient(90deg,#c4b5fd 0%,#a78bfa 50%,#5b8ef8 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

/* ── Live banding border ── */
.sp-live-border::after {
  content:"";
  position:absolute; top:0; left:0; right:0; height:2px;
  pointer-events:none;
  background:linear-gradient(90deg,rgba(239,68,68,.80),rgba(124,92,252,.60),rgba(239,68,68,.80));
  background-size:200% 100%;
  animation:sp-live-band 3s linear infinite;
}
`;

/* ─── Router wrapper ─────────────────────────────────────────── */
export default function StreamerPage() {
  const { slug } = useParams();
  const { isMobile } = useResponsive();

  React.useEffect(() => {
    const s = String(slug || "").trim();
    if (!s) return;
    setDynamicRouteSeo(`/s/${s}`);
  }, [slug]);

  return isMobile ? <StreamerPageMobile /> : <StreamerPageDesktop />;
}

/* ════════════════════════════════════════════════════════════════
   Desktop
════════════════════════════════════════════════════════════════ */
function StreamerPageDesktop() {
  const { slug } = useParams();
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = String(auth?.user?.role ?? "guest");
  const myUserId = auth?.user?.id != null ? Number(auth.user.id) : null;

  const navigate = useNavigate();
  const location = useLocation();
  const hostedBy = React.useMemo(() => new URLSearchParams(location.search).get("hostedBy"), [location.search]);

  /* ── state (identique à l'original) ────────────────────────── */
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("about");
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  const [subOpen, setSubOpen] = React.useState(false);
  const [subLoading, setSubLoading] = React.useState(false);
  const [subError, setSubError] = React.useState<string | null>(null);

  // Ouverture de la SubModal depuis le chat (bouton "S'abonner aussi" d'une
  // carte sub — voir ChatPanel.handleSubscribe → dispatch ui:open_sub).
  React.useEffect(() => {
    const onOpenSub = () => setSubOpen(true);
    window.addEventListener("ui:open_sub", onOpenSub as any);
    return () => window.removeEventListener("ui:open_sub", onOpenSub as any);
  }, []);

  const [giftLoading, setGiftLoading] = React.useState(false);
  const [giftError, setGiftError] = React.useState<string | null>(null);
  const [giftStatus, setGiftStatus] = React.useState<GiftStatus | null>(null);
  const [claimLoading, setClaimLoading] = React.useState(false);
  const [claimError, setClaimError] = React.useState<string | null>(null);

  const [hostOpen, setHostOpen] = React.useState(false);
  const [hostBusy, setHostBusy] = React.useState(false);
  const [hostError, setHostError] = React.useState<string | null>(null);
  const [hostQuery, setHostQuery] = React.useState("");
  const [hostLives, setHostLives] = React.useState<any[]>([]);
  const [hostOverride, setHostOverride] = React.useState<{ slug: string | null; displayName: string | null } | null>(null);

  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [editTitleOpen, setEditTitleOpen] = React.useState(false);
  const [editTitleDraft, setEditTitleDraft] = React.useState("");
  const [editTitleBusy, setEditTitleBusy] = React.useState(false);
  const [editTitleErr, setEditTitleErr] = React.useState<string | null>(null);
  const [, bump] = React.useState(0);

  /* ── hooks (identiques) ─────────────────────────────────────── */
  const { isMobile, isPortrait } = useResponsive();
  const { cinema, chatOpen, enterCinema, leaveCinema, openCinemaChat, closeCinemaChat } = useCinema(isMobile);

  const {
    loading,
    streamer,
    followsCount,
    setFollowsCount,
    isFollowing,
    notifyEnabled,
    followLoading,
    toggleFollow,
    toggleNotify,
  } = useStreamerData(slug ?? null, token, () => setLoginOpen(true));

  const handleFollowsCount = React.useCallback((n: number) => setFollowsCount(n), [setFollowsCount]);

  const isOwner = !!(myUserId != null && streamer?.ownerUserId != null && Number(streamer.ownerUserId) === Number(myUserId));
  const isAdmin = myRole === "admin";
  const isModLike = ["mod", "moderator", "streamer_mod", "streamer_moderator"].includes(myRole);
  const canEditTabs = isOwner || isAdmin;
  const canEditTitle = isOwner || isAdmin || isModLike;

  const hostTargetSlug = hostOverride?.slug ?? (streamer as any)?.hostTargetSlug ?? null;
  const hostTargetDisplayName = hostOverride?.displayName ?? (streamer as any)?.hostTargetDisplayName ?? null;
  const hostTargetIsLive = !!((streamer as any)?.hostTargetIsLive);

  React.useEffect(() => {
    setHostOverride(null);
  }, [slug]);

  React.useEffect(() => {
    const streamerSlug = String(slug || "").trim();
    if (!token || !streamerSlug) return;
    void trackFeatureEvent(token, { kind: "streamer_tab", subject: `${streamerSlug}|${tab}` });
  }, [slug, tab, token]);

  React.useEffect(() => {
    if (!slug || !streamer || isOwner || hostedBy || !hostTargetSlug || !hostTargetIsLive) return;
    if (String(hostTargetSlug).toLowerCase() === String(slug).toLowerCase()) return;
    const t = window.setTimeout(
      () =>
        navigate(`/s/${encodeURIComponent(String(hostTargetSlug))}?hostedBy=${encodeURIComponent(String(slug))}`, {
          replace: true,
        }),
      900
    );
    return () => window.clearTimeout(t);
  }, [slug, streamer, isOwner, hostTargetSlug, hostTargetIsLive, hostedBy, navigate]);

  /* ── async helpers (identiques) ────────────────────────────── */
  async function refreshMeIfPossible() {
    if (!token) return;
    try {
      const r: any = await me(token);
      if (r?.ok && r?.user) {
        if (typeof auth?.setUser === "function") auth.setUser(r.user);
        else if (typeof auth?.setAuth === "function") auth.setAuth((p: any) => ({ ...(p || {}), user: r.user }));
      }
    } catch {}
  }

  async function fetchGiftStatus() {
    if (!slug) return;
    try {
      const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }).then((x) => x.json());
      if (r?.ok) setGiftStatus({ remaining: Number(r.remaining || 0), canClaim: !!r.canClaim, myClaimed: !!r.myClaimed });
    } catch {}
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    fetchGiftStatus();
  }, [slug, token]);

  const chest = useChest({
    slug: slug ?? null,
    token,
    apiBase: apiBase(),
    isOwner,
    isLive: !!streamer?.isLive,
    onRequireLogin: () => setLoginOpen(true),
    onAfterDeposit: async () => {
      await refreshMeIfPossible();
    },
  });

  React.useEffect(() => {
    const onJoin = () => chest.join();
    const onView = () => chest.setChestModalOpen(true);
    const onDismiss = () => chest.setToast(null);
    window.addEventListener("ui:chest_join", onJoin as any);
    window.addEventListener("ui:chest_view", onView as any);
    window.addEventListener("ui:chest_dismiss", onDismiss as any);
    return () => {
      window.removeEventListener("ui:chest_join", onJoin as any);
      window.removeEventListener("ui:chest_view", onView as any);
      window.removeEventListener("ui:chest_dismiss", onDismiss as any);
    };
  }, [chest]);

  React.useEffect(() => {
    if (!slug || !streamer?.isLive) return;
    const anonId = getAnonId();
    let stopped = false;
    const beat = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const r = await watchHeartbeat({ slug: String(slug), anonId }, token);
        if (r?.isLive && typeof r.viewersNow === "number") setLiveViewersNow(r.viewersNow);
        if (r?.isLive === false) setLiveViewersNow(0);
      } catch {}
    };
    beat();
    const t = window.setInterval(beat, 15_000);
    let visTimer: number | null = null;
    const vis = () => {
      if (document.visibilityState !== "visible") return;
      if (visTimer) window.clearTimeout(visTimer);
      visTimer = window.setTimeout(() => { visTimer = null; beat(); }, 2000);
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      stopped = true;
      window.clearInterval(t);
      if (visTimer) window.clearTimeout(visTimer);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [slug, token, streamer?.isLive]);

  React.useEffect(() => {
    if (!streamer?.isLive) setLiveViewersNow(null);
  }, [streamer?.isLive]);

  React.useEffect(() => {
    const s = String(slug || "").trim();
    if (!s || !streamer) return;

    const name = String(streamer.displayName || s).trim();
    const livePart = streamer.isLive ? "en live" : "hors ligne";
    const viewersLabel = streamer.isLive && liveViewersNow != null && liveViewersNow > 0
      ? `👁 ${liveViewersNow} · `
      : "";

    setSeo({
      title: `${viewersLabel}${name} — Live, clips et infos | LunaLive`,
      description: `Regarde ${name} sur LunaLive : streamer casino ${livePart}, clips, VOD et informations du profil.`,
      path: `/s/${encodeURIComponent(s)}`,
    });
  }, [slug, streamer, liveViewersNow]);

  /* ── player height → chat height sync ───────────────────────── */
  const playerWrapRef = React.useRef<HTMLDivElement | null>(null);
  const metaWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [leftStackH, setLeftStackH] = React.useState<number>(0);

  const measureLeftStack = React.useCallback(() => {
    // On aligne le bas du chat sur le bas du player (pas de la bannière)
    const playerH = playerWrapRef.current?.getBoundingClientRect?.().height ?? 0;
    // On plafonne à la hauteur utile du viewport pour que le bouton Envoyer reste visible
    const maxH = typeof window !== "undefined" ? window.innerHeight - 104 : 9999;
    const total = Math.max(0, Math.min(Math.round(playerH), maxH));
    if (total && Math.abs(total - leftStackH) > 2) setLeftStackH(total);
    if (!total && leftStackH !== 0) setLeftStackH(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftStackH]);

  React.useLayoutEffect(() => {
    measureLeftStack();
  }, [measureLeftStack, streamer?.isLive, streamer?.title, streamer?.displayName, followsCount]);

  React.useEffect(() => {
    const RO = (window as any).ResizeObserver as (new (cb: () => void) => ResizeObserver) | undefined;
    let ro: ResizeObserver | null = null;
    if (RO) {
      ro = new RO(() => measureLeftStack());
      if (playerWrapRef.current) ro.observe(playerWrapRef.current);
      if (metaWrapRef.current) ro.observe(metaWrapRef.current);
    }
    const onR = () => measureLeftStack();
    window.addEventListener("resize", onR);
    return () => {
      window.removeEventListener("resize", onR);
      try {
        ro?.disconnect();
      } catch {}
    };
  }, [measureLeftStack]);

  /* ── Early exits ─────────────────────────────────────────────── */
  if (loading)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div style={{ fontFamily: "'Syne',system-ui,sans-serif", color: "rgba(196,181,253,.65)", fontSize: 14 }}>
          Chargement…
        </div>
      </div>
    );

  if (!streamer)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div style={{ fontFamily: "'Syne',system-ui,sans-serif", color: "rgba(252,165,165,.75)", fontSize: 14 }}>
          Streamer introuvable
        </div>
      </div>
    );

  /* ── Derived values ──────────────────────────────────────────── */
  const showMiniChat = isMobile && isPortrait && !cinema;
  const viewers = streamer.isLive ? liveViewersNow ?? streamer.viewers : 0;
  const myRubis = Number(auth?.user?.rubis ?? 0);
  const mySubTickets = Math.max(0, Math.floor(Number(auth?.user?.coupons?.sub_ticket ?? auth?.user?.tokens?.sub_ticket ?? 0)));
  const avatarUrl = pickStreamerAvatarUrlFromStreamer(streamer);
  const displayName = streamer.displayName ? String(streamer.displayName) : `@${String(slug || "")}`;
  const initials = initialsOf(displayName);
  const SUB_PRICE_RUBIS = 500;

  /* ── save title ──────────────────────────────────────────────── */
  async function saveNewTitle() {
    if (!token || !slug) return;
    const next = String(editTitleDraft || "").trim();
    if (!next) {
      setEditTitleErr("Titre vide.");
      return;
    }
    setEditTitleBusy(true);
    setEditTitleErr(null);
    try {
      if (isOwner) await updateMyStreamerTitle(String(token), next);
      else await updateStreamerTitleBySlug(String(token), String(slug), next);
      (streamer as any).title = next;
      bump((x) => x + 1);
      setEditTitleOpen(false);
      setActionsOpen(false);
    } catch (e: any) {
      setEditTitleErr(String(e?.message || "Erreur"));
    } finally {
      setEditTitleBusy(false);
    }
  }

  /* ─────────────────────────────────────────────────────────────
     CINEMA MODE
  ───────────────────────────────────────────────────────────── */
  if (cinema)
    return (
      <>
        <div className="cinemaRoot">
          <div className="cinemaStage">
            <div className="cinemaPlayerCard">
              {streamer.isLive ? (
                streamer.platform === "rumble" && streamer.rumbleEmbedUrl ? (
                  <RumbleEmbedPlayer embedUrl={streamer.rumbleEmbedUrl} title={streamer.title} isLive={streamer.isLive} />
                ) : streamer.platform === "rumble" ? (
                  <RumbleStreamPlayer
                    hlsUrl={streamer.rumbleHlsUrl}
                    thumbnailUrl={streamer.rumbleThumbnailUrl || streamer.offlineBgUrl}
                    title={streamer.title}
                    isLive={streamer.isLive}
                  />
                ) : streamer.platform === "dlive" ? (
                  <DlivePlayer channelSlug={streamer.channelSlug} channelUsername={streamer.channelUsername} isLive />
                ) : (
                  // Cas inactif : aucune plateforme configurée
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    height: 360,
                    background: "linear-gradient(135deg, rgba(124,92,252,.12), rgba(59,77,200,.09))",
                    borderRadius: 16,
                    border: "1px solid rgba(124,92,252,.16)",
                    fontFamily: "'Syne',system-ui,sans-serif",
                    color: "rgba(196,181,253,.70)",
                    fontSize: 14,
                    textAlign: "center",
                    padding: 20
                  }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "rgba(235,232,255,.90)" }}>
                        Stream inactif
                      </div>
                      <div>
                        Ce streamer n'a aucune plateforme configurée.<br/>
                        Contacte un administrateur pour activer ce stream.
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <OfflineCard
                  displayName={displayName}
                  title={streamer.title}
                  offlineBgUrl={streamer.offlineBgUrl ?? undefined}
                />
              )}
            </div>
          </div>
          <div className="cinemaTopBar">
            <button className="btnGhostSmall" type="button" onClick={leaveCinema}>
              ✕ Quitter
            </button>
            <button className="btnPrimarySmall" type="button" onClick={openCinemaChat}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <ChatIcon /> Chat
              </span>
            </button>
          </div>
          {chatOpen && (
            <div className="chatSheetBackdrop" onClick={closeCinemaChat} role="presentation">
              <div className="chatSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="chatSheetTop">
                  <div />
                  <button className="iconBtn" onClick={closeCinemaChat} type="button" aria-label="Fermer">
                    ✕
                  </button>
                </div>
                <div className="chatSheetBody">
                  <ChatPanel
                    slug={String(slug || "")}
                    onRequireLogin={() => setLoginOpen(true)}
                    compact
                    autoFocus={!isMobile}
                    onFollowsCount={handleFollowsCount}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    );

  /* ─────────────────────────────────────────────────────────────
     RENDER PRINCIPAL
  ───────────────────────────────────────────────────────────── */
  return (
    <div className="streamPage sp-root">
      <style>{SP_STYLES}</style>

      {/* ── Toast coffre ── */}
      <ChestToast
        toast={chest.toast}
        isOwner={isOwner}
        canJoinNow={chest.canJoinNow}
        alreadyJoined={chest.alreadyJoined}
        joinLoading={chest.joinLoading}
        onJoin={chest.join}
        onView={() => chest.setChestModalOpen(true)}
        error={chest.chestError}
        onClose={() => chest.setToast(null)}
      />

      {/* ── Bandeaux contextuels (host) ── */}
      {hostedBy && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 14px",
            borderRadius: 14,
            border: "1px solid rgba(124,92,252,.12)",
            background: "rgba(124,92,252,.05)",
            fontFamily: "'Syne',system-ui,sans-serif",
            fontSize: 12,
            color: "rgba(167,139,250,.72)",
          }}
        >
          📺 Hosté par <strong style={{ color: "rgba(235,232,255,.88)" }}>{hostedBy}</strong>
        </div>
      )}

      {!isOwner && hostTargetSlug && hostTargetIsLive && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 14px",
            borderRadius: 14,
            border: "1px solid rgba(251,191,36,.14)",
            background: "rgba(251,191,36,.05)",
            fontFamily: "'Syne',system-ui,sans-serif",
            fontSize: 12,
            color: "rgba(253,230,138,.72)",
          }}
        >
          📺 Redirection vers{" "}
          <strong style={{ color: "rgba(253,230,138,.90)" }}>{hostTargetDisplayName || hostTargetSlug}</strong>…
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          GRILLE — player + chat
      ══════════════════════════════════════════════════════════ */}
      <div className="streamGrid">
        {/* ── Colonne gauche ── */}
        <div className="streamMain">
          {/* Player */}
          <div ref={playerWrapRef}>
            {streamer.isLive ? (
              streamer.platform === "rumble" && streamer.rumbleEmbedUrl ? (
                <RumbleEmbedPlayer embedUrl={streamer.rumbleEmbedUrl} title={streamer.title} isLive={streamer.isLive} />
              ) : streamer.platform === "rumble" ? (
                <RumbleStreamPlayer
                  hlsUrl={streamer.rumbleHlsUrl}
                  thumbnailUrl={streamer.rumbleThumbnailUrl || streamer.offlineBgUrl}
                  title={streamer.title}
                  isLive={streamer.isLive}
                />
              ) : streamer.platform === "dlive" ? (
                <DlivePlayer channelSlug={streamer.channelSlug} channelUsername={streamer.channelUsername} isLive />
              ) : (
                // Cas inactif : aucune plateforme configurée
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  height: 360,
                  background: "linear-gradient(135deg, rgba(124,92,252,.12), rgba(59,77,200,.09))",
                  borderRadius: 16,
                  border: "1px solid rgba(124,92,252,.16)",
                  fontFamily: "'Syne',system-ui,sans-serif",
                  color: "rgba(196,181,253,.70)",
                  fontSize: 14,
                  textAlign: "center",
                  padding: 20
                }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "rgba(235,232,255,.90)" }}>
                      Stream inactif
                    </div>
                    <div>
                      Ce streamer n'a aucune plateforme configurée.<br/>
                      Contacte un administrateur pour activer ce stream.
                    </div>
                  </div>
                </div>
              )
            ) : (
              <OfflineCard displayName={displayName} title={streamer.title} offlineBgUrl={streamer.offlineBgUrl ?? undefined} />
            )}
          </div>

          {/* BANNER */}
          <div ref={metaWrapRef}>
            <div className={`sp-glass${streamer.isLive ? " sp-live-border" : ""}`} style={{ marginTop: 12, padding: "14px 16px" }}>
              {/* déco radial fond */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 0,
                  background:
                    "radial-gradient(700px 200px at 0% 60%,rgba(124,92,252,.10),transparent 60%),radial-gradient(500px 200px at 100% 40%,rgba(59,77,200,.08),transparent 60%)",
                }}
              />

              <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14 }}>
                {/* Avatar */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      border: "1px solid rgba(124,92,252,.28)",
                      background: "linear-gradient(135deg,rgba(124,92,252,.18),rgba(59,77,200,.10))",
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                      boxShadow: "0 8px 24px rgba(124,92,252,.22)",
                    }}
                  >
                    {avatarUrl ? (
                      <img src={String(avatarUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span
                        style={{
                          fontFamily: "'Syne',system-ui,sans-serif",
                          fontWeight: 800,
                          fontSize: 20,
                          color: "rgba(196,181,253,.90)",
                        }}
                      >
                        {initials}
                      </span>
                    )}
                  </div>
                  {streamer.isLive && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: "rgba(239,68,68,.90)",
                        border: "2.5px solid rgba(11,9,22,.95)",
                        boxShadow: "0 0 10px rgba(239,68,68,.60)",
                      }}
                    />
                  )}
                </div>

                {/* Meta */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Ligne 1 : nom + status chips */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      className="sp-title-grad"
                      style={{ fontSize: 20, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={displayName}
                    >
                      {displayName}
                    </span>

                    {streamer.isLive ? (
                      <span className="sp-pill sp-pill-live">
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: "rgba(239,68,68,.90)",
                            display: "inline-block",
                            animation: "sp-dot-pulse 1.8s ease-in-out infinite",
                          }}
                        />
                        LIVE
                      </span>
                    ) : (
                      <span className="sp-pill sp-pill-off">OFFLINE</span>
                    )}

                    {streamer.isLive && (
                      <span className="sp-pill">
                        <EyeIcon /> {fmt(viewers)}
                      </span>
                    )}

                    {streamer.isLive && (
                      <span className="sp-pill" style={{ color: "rgba(167,139,250,.65)" }}>
                        ⏱ <LiveDurationText isLive={streamer.isLive} startedAtMs={streamer.liveStartedAtMs} />
                      </span>
                    )}

                    {giftStatus?.myClaimed && <span className="sp-pill sp-pill-green">✅ Sub offert</span>}
                  </div>

                  {/* Ligne 2 : abonnés + titre live */}
                  <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {typeof followsCount === "number" && (
                      <span
                        style={{
                          fontFamily: "'Syne',system-ui,sans-serif",
                          fontWeight: 700,
                          fontSize: 12,
                          color: "rgba(196,181,253,.55)",
                        }}
                      >
                        {fmt(followsCount)} abonnés
                      </span>
                    )}
                    {typeof followsCount === "number" && streamer.title && (
                      <span style={{ color: "rgba(124,92,252,.28)", fontSize: 13 }}>·</span>
                    )}
                    {streamer.title && (
                      <span
                        style={{
                          fontFamily: "'Syne',system-ui,sans-serif",
                          fontSize: 12,
                          color: "rgba(167,139,250,.58)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 560,
                        }}
                        title={String(streamer.title)}
                      >
                        {streamer.title}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {/* Suivre */}
                  <button
                    type="button"
                    className={isFollowing ? "btnGhostSmall" : "btnPrimarySmall"}
                    disabled={followLoading}
                    onClick={toggleFollow}
                    style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700, minWidth: 80 }}
                  >
                    {followLoading ? "…" : isFollowing ? "✓ Suivi" : "Suivre"}
                  </button>

                  {/* Sub */}
                  <button
                    type="button"
                    className="btnPrimarySmall"
                    onClick={() => {
                      if (!token) return setLoginOpen(true);
                      setSubError(null);
                      setGiftError(null);
                      setSubOpen(true);
                    }}
                    style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700 }}
                  >
                    ⭐ SUB
                  </button>

                  {/* Gift claim */}
                  {!!giftStatus?.remaining &&
                    (token && giftStatus.canClaim ? (
                      <button
                        type="button"
                        className="btnPrimarySmall"
                        disabled={claimLoading}
                        onClick={async () => {
                          if (!token || !slug) return;
                          setClaimLoading(true);
                          setClaimError(null);
                          try {
                            const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs/claim`, {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                            }).then((x) => x.json());
                            if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
                            await refreshMeIfPossible();
                            await fetchGiftStatus();
                          } catch (e: any) {
                            setClaimError(String(e?.message || "Erreur"));
                          } finally {
                            setClaimLoading(false);
                          }
                        }}
                        style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700 }}
                      >
                        {claimLoading ? "…" : `🎁 ${fmt(giftStatus.remaining)}`}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btnGhostSmall"
                        onClick={() => {
                          if (!token) return setLoginOpen(true);
                          setSubOpen(true);
                        }}
                        style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700 }}
                      >
                        🎁 {fmt(giftStatus.remaining)}
                      </button>
                    ))}

                  {/* Coffre */}
                  <button
                    type="button"
                    className="btnGhostSmall"
                    onClick={() => {
                      chest.setChestError(null);
                      chest.setChestModalOpen(true);
                    }}
                    style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700 }}
                    title="Coffre"
                  >
                    🎁{chest.chestBalance > 0 ? ` ${chest.chestBalance}` : ""}
                  </button>

                  {/* ⋯ menu */}
                  <button
                    type="button"
                    className="btnGhostSmall"
                    onClick={() => setActionsOpen(true)}
                    style={{
                      fontFamily: "'Syne',system-ui,sans-serif",
                      fontWeight: 700,
                      fontSize: 18,
                      lineHeight: 1,
                      padding: "5px 11px",
                    }}
                    title="Plus d'options"
                  >
                    ⋯
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile mini chat */}
          {showMiniChat && (
            <div className="panel mobileMiniChat" style={{ padding: 0, marginTop: 12 }}>
              <div className="streamChatHeader">
                <div className="streamChatHeaderLeft">
                  <div className="mutedSmall" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <EyeIcon /> {fmt(viewers)} viewer
                  </div>
                </div>
                <div className="mutedSmall">
                  rôle : <strong style={{ color: "rgba(255,255,255,.9)" }}>{myRole}</strong>
                </div>
              </div>
              <div className="streamChatBody">
                <ChatPanel slug={String(slug || "")} onRequireLogin={() => setLoginOpen(true)} compact onFollowsCount={handleFollowsCount} />
              </div>
            </div>
          )}
        </div>

        {/* ── Chat sidebar ── */}
        <aside
          className="panel streamChat streamChatFixed"
          style={{
            padding: 0,
            height: leftStackH > 0 ? leftStackH : undefined,
          }}
        >
          <div className="sp-chat-head">
            <div className="sp-title-grad" style={{ fontSize: 14, marginBottom: 4 }}>
              {streamer.displayName || ""}
            </div>
            {streamer.isLive && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "rgba(239,68,68,.85)",
                    display: "inline-block",
                    animation: "sp-dot-pulse 1.8s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Syne',system-ui,sans-serif",
                    fontWeight: 700,
                    fontSize: 11,
                    color: "rgba(252,165,165,.75)",
                  }}
                >
                  LIVE · {fmt(viewers)}
                </span>
              </div>
            )}
          </div>
          <div className="streamChatBody" style={{ flex: 1, minHeight: 0 }}>
            <ChatPanel slug={String(slug || "")} onRequireLogin={() => setLoginOpen(true)} onFollowsCount={handleFollowsCount} showBotFab={false} />
          </div>
        </aside>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BOTTOM PANEL — tabs
      ══════════════════════════════════════════════════════════ */}
      <div className="sp-glass" style={{ marginTop: 14 }}>
        {/* Tabs row */}
        <div style={{ display: "flex", gap: 8, padding: "12px 14px 0", flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          {(
            [
              ["about", "À propos"],
              ["clips", "Clips"],
              ["vod", "VOD"],
              ["agenda", "Agenda"],
            ] as [TabKey, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" className={`sp-tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: "14px", minHeight: 80, animation: "sp-tab-in 220ms ease-out both", position: "relative", zIndex: 1 }} key={tab}>
          {tab === "about" && slug ? <AboutTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
          {tab === "clips" && slug ? (
            <ClipsTab slug={String(slug)} token={token} isOwner={isOwner} onRequireLogin={() => setLoginOpen(true)} />
          ) : null}
          {tab === "vod" && slug ? <VodTab slug={String(slug)} /> : null}
          {tab === "agenda" && slug ? <AgendaTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODALES
      ══════════════════════════════════════════════════════════ */}

      {/* ── Actions drawer ── */}
      {actionsOpen && (
        <div className="sp-backdrop" role="presentation" onClick={() => setActionsOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="sp-modal"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              bottom: 16,
              width: "min(380px,92vw)",
              display: "flex",
              flexDirection: "column",
              animation: "sp-slide-right 180ms ease",
            }}
          >
            <div className="sp-modal-head">
              <span className="sp-modal-title">Options</span>
              <button className="btnGhostSmall" onClick={() => setActionsOpen(false)} type="button" aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="sp-modal-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {claimError && (
                <div style={{ fontSize: 12, color: "rgba(252,165,165,.88)", fontFamily: "'Syne',system-ui,sans-serif" }}>
                  {claimError}
                </div>
              )}

              {canEditTitle && (
                <button
                  type="button"
                  className="sp-row"
                  onClick={() => {
                    if (!token) return setLoginOpen(true);
                    setEditTitleErr(null);
                    setEditTitleDraft(String(streamer.title || ""));
                    setEditTitleOpen(true);
                  }}
                >
                  <span>✏️ Modifier le titre</span>
                  <span style={{ fontSize: 11, color: "rgba(167,139,250,.50)" }}>Modération</span>
                </button>
              )}

              {isFollowing && (
                <button type="button" className="sp-row" disabled={followLoading} onClick={toggleNotify}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <BellIcon on={notifyEnabled} /> Notifications
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(167,139,250,.50)" }}>{notifyEnabled ? "On" : "Off"}</span>
                </button>
              )}

              {isOwner && (
                <button
                  type="button"
                  className="sp-row"
                  onClick={() => {
                    if (!token) return setLoginOpen(true);
                    setHostError(null);
                    setHostOpen(true);
                    setActionsOpen(false);
                  }}
                >
                  <span>📺 Host</span>
                  <span style={{ fontSize: 11, color: "rgba(167,139,250,.50)" }}>Gérer</span>
                </button>
              )}

              <button
                type="button"
                className="sp-row"
                onClick={() => {
                  setActionsOpen(false);
                  enterCinema();
                }}
              >
                <span>⛶ Plein écran</span>
                <span style={{ fontSize: 11, color: "rgba(167,139,250,.50)" }}>Cinéma</span>
              </button>

              {/* Solde */}
              <div
                style={{
                  marginTop: 6,
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(124,92,252,.10)",
                  background: "rgba(124,92,252,.04)",
                }}
              >
                <div className="sp-label" style={{ marginBottom: 8 }}>
                  Mon solde
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    ["💎", `${fmt(myRubis)} rubis`],
                    ["🎟️", `${fmt(mySubTickets)} ticket${mySubTickets > 1 ? "s" : ""}`],
                  ].map(([ico, txt]) => (
                    <span key={String(txt)} className="sp-pill">
                      {ico} {txt}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit title modal ── */}
      {editTitleOpen && (
        <div
          className="sp-backdrop"
          role="presentation"
          onClick={() => {
            if (editTitleBusy) return;
            setEditTitleOpen(false);
          }}
          style={{ display: "grid", placeItems: "center", padding: 14 }}
        >
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="sp-modal" style={{ width: "min(560px,96vw)" }}>
            <div className="sp-modal-head">
              <span className="sp-modal-title">Modifier le titre</span>
              <button
                className="btnGhostSmall"
                type="button"
                onClick={() => (editTitleBusy ? null : setEditTitleOpen(false))}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="sp-modal-body">
              {editTitleErr && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(252,165,165,.88)",
                    marginBottom: 10,
                    fontFamily: "'Syne',system-ui,sans-serif",
                  }}
                >
                  {editTitleErr}
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(167,139,250,.60)",
                  marginBottom: 10,
                  fontFamily: "'Syne',system-ui,sans-serif",
                }}
              >
                Actuel : <strong style={{ color: "rgba(235,232,255,.85)" }}>{String(streamer.title || "")}</strong>
              </div>
              <input
                className="sp-input"
                value={editTitleDraft}
                onChange={(e) => setEditTitleDraft(e.target.value)}
                maxLength={140}
                placeholder="Nouveau titre…"
                disabled={editTitleBusy}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
                <button type="button" className="btnGhostSmall" disabled={editTitleBusy} onClick={() => setEditTitleOpen(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={editTitleBusy}
                  onClick={saveNewTitle}
                  style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700 }}
                >
                  {editTitleBusy ? "…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Host modal ── */}
      {hostOpen && (
        <div className="chatSheetBackdrop" onClick={() => setHostOpen(false)} role="presentation" style={{ zIndex: 60 }}>
          <div
            className="chatSheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              maxWidth: 560,
              borderRadius: 22,
              border: "1px solid rgba(124,92,252,.20)",
              background: "rgba(11,9,22,.95)",
              backdropFilter: "blur(20px)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* reflet haut */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                left: "8%",
                right: "8%",
                height: 1,
                zIndex: 2,
                background:
                  "linear-gradient(90deg,transparent,rgba(167,139,250,.28) 40%,rgba(91,142,248,.18) 60%,transparent)",
                pointerEvents: "none",
              }}
            />

            <div className="chatSheetTop" style={{ borderBottom: "1px solid rgba(124,92,252,.12)" }}>
              <span className="sp-modal-title">📺 Host</span>
              <button className="iconBtn" onClick={() => setHostOpen(false)} type="button" aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="chatSheetBody" style={{ padding: 16 }}>
              {hostTargetSlug && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(124,92,252,.14)",
                    background: "rgba(124,92,252,.06)",
                  }}
                >
                  <div className="sp-label" style={{ marginBottom: 6 }}>
                    Host actuel
                  </div>
                  <div
                    style={{
                      fontFamily: "'Syne',system-ui,sans-serif",
                      fontWeight: 800,
                      fontSize: 14,
                      color: "rgba(235,232,255,.90)",
                    }}
                  >
                    {hostTargetDisplayName || `@${hostTargetSlug}`}
                  </div>
                  <button
                    type="button"
                    className="btnGhostSmall"
                    disabled={hostBusy}
                    style={{ marginTop: 10 }}
                    onClick={async () => {
                      if (!token || !slug) return;
                      setHostBusy(true);
                      setHostError(null);
                      try {
                        const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/host`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ targetSlug: null }),
                        }).then((x) => x.json());
                        if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
                        setHostOverride({ slug: null, displayName: null });
                      } catch (e: any) {
                        setHostError(String(e?.message || "Erreur"));
                      } finally {
                        setHostBusy(false);
                      }
                    }}
                  >
                    {hostBusy ? "…" : "Stop host"}
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input
                  className="sp-input"
                  value={hostQuery}
                  onChange={(e) => setHostQuery(e.target.value)}
                  placeholder="Rechercher un streamer live…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btnGhostSmall"
                  disabled={hostBusy}
                  onClick={async () => {
                    setHostBusy(true);
                    setHostError(null);
                    try {
                      const lives = await getLives();
                      setHostLives((lives as any[]).filter((x) => String(x.slug || "").toLowerCase() !== String(slug || "").toLowerCase()));
                    } catch (e: any) {
                      setHostError(String(e?.message || "Erreur"));
                    } finally {
                      setHostBusy(false);
                    }
                  }}
                >
                  {hostBusy ? "…" : "↻"}
                </button>
              </div>

              {hostError && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(252,165,165,.88)",
                    marginBottom: 10,
                    fontFamily: "'Syne',system-ui,sans-serif",
                  }}
                >
                  {hostError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(hostLives || [])
                  .filter((x) => {
                    const q = hostQuery.trim().toLowerCase();
                    return !q || String(x.displayName || x.slug || "").toLowerCase().includes(q);
                  })
                  .slice(0, 30)
                  .map((x) => (
                    <button
                      key={String(x.id || x.slug)}
                      type="button"
                      className="sp-row"
                      disabled={hostBusy}
                      onClick={async () => {
                        if (!token || !slug) return;
                        const target = String(x.slug || "").trim();
                        if (!target) return;
                        setHostBusy(true);
                        setHostError(null);
                        try {
                          const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/host`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ targetSlug: target }),
                          }).then((xx) => xx.json());
                          if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
                          setHostOverride({ slug: r.hostTargetSlug, displayName: r.hostTargetDisplayName });
                          setHostOpen(false);
                        } catch (e: any) {
                          setHostError(String(e?.message || "Erreur"));
                        } finally {
                          setHostBusy(false);
                        }
                      }}
                    >
                      <span style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700 }}>{x.displayName || `@${x.slug}`}</span>
                      <span style={{ fontSize: 11, color: "rgba(167,139,250,.50)" }}>{Number(x.viewers || 0)} viewers</span>
                    </button>
                  ))}
              </div>

              {!hostLives?.length && (
                <div style={{ marginTop: 10, fontFamily: "'Syne',system-ui,sans-serif", fontSize: 12, color: "rgba(167,139,250,.50)" }}>
                  Clique ↻ pour charger les lives.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ChestModal ── */}
      <ChestModal
        open={chest.chestModalOpen}
        onClose={() => chest.setChestModalOpen(false)}
        chestLoading={chest.chestLoading}
        chestBalance={chest.chestBalance}
        chest={chest.chest}
        opening={chest.opening}
        remainingSec={chest.remainingSec}
        progress={chest.progress}
        error={chest.chestError}
        onRefresh={chest.refreshChest}
        isOwner={isOwner}
        openingId={chest.openingId}
        alreadyJoined={chest.alreadyJoined}
        joinLoading={chest.joinLoading}
        onJoin={chest.join}
        isLive={streamer.isLive}
        chestHasOpen={chest.chestHasOpen}
        ownerLoading={chest.ownerLoading}
        onOpen={chest.open}
        depositAmount={chest.depositAmount}
        setDepositAmount={chest.setDepositAmount}
        depositNote={chest.depositNote}
        setDepositNote={chest.setDepositNote}
        depositLoading={chest.depositLoading}
        onDeposit={chest.deposit}
      />

      {/* ── SubModal ── */}
      <SubModal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        streamerName={streamer.displayName ? streamer.displayName : `@${String(slug || "")}`}
        priceRubis={SUB_PRICE_RUBIS}
        myRubis={myRubis}
        mySubTickets={mySubTickets}
        disableSelfTicket={isOwner}
        loading={subLoading}
        error={subError}
        onGoShop={() => {
          setSubOpen(false);
          window.location.href = "/shop";
        }}
        onPaySelf={async (mode) => {
          if (!token || !slug) return;
          setSubLoading(true);
          setSubError(null);
          try {
            const useTicket = mode === "ticket";
            const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/subscribe`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, ...(useTicket ? { "Content-Type": "application/json" } : {}) },
              body: useTicket ? JSON.stringify({ useTicket: true }) : undefined,
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
            await refreshMeIfPossible();
            await fetchGiftStatus();
            setSubOpen(false);
          } catch (e: any) {
            setSubError(String(e?.message || "Erreur"));
          } finally {
            setSubLoading(false);
          }
        }}
        onPayRubis={async () => {
          if (!token || !slug) return;
          setSubLoading(true);
          setSubError(null);
          try {
            const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/subscribe`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
            await refreshMeIfPossible();
            await fetchGiftStatus();
            setSubOpen(false);
          } catch (e: any) {
            setSubError(String(e?.message || "Erreur"));
          } finally {
            setSubLoading(false);
          }
        }}
        onPayGiftSubs={async (count, useTicketsMaybe) => {
          if (!token || !slug) return;
          setGiftLoading(true);
          setGiftError(null);
          const useTickets = Math.max(0, Math.floor(Number(useTicketsMaybe || 0)));
          try {
            const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ count, useTickets }),
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
            await refreshMeIfPossible();
            await fetchGiftStatus();
            setSubOpen(false);
          } catch (e: any) {
            setGiftError(String(e?.message || "Erreur"));
          } finally {
            setGiftLoading(false);
          }
        }}
        giftLoading={giftLoading}
        giftError={giftError}
      />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* LunaBot détaché aussi sur desktop (le FAB interne du ChatPanel
          n'était pas visible → showBotFab=false + FloatingBot au niveau page) */}
      <FloatingBot slug={String(slug || "")} token={token} role={isOwner ? "streamer" : "viewer"} canMod={isOwner || isAdmin || isModLike} onRequireLogin={() => setLoginOpen(true)} />
    </div>
  );
}

/* ─── Offline card (extracted component) ────────────────────── */
function OfflineCard({
  displayName,
  title,
  offlineBgUrl,
}: {
  displayName: string;
  title?: string;
  offlineBgUrl?: string;
}) {
  return (
    <div
      className="sp-offline"
      style={{
        background: offlineBgUrl
          ? `linear-gradient(to top,rgba(0,0,0,.72),rgba(0,0,0,.16)),url(${offlineBgUrl}) center/cover no-repeat`
          : "linear-gradient(135deg,rgba(124,92,252,.12),rgba(59,77,200,.09))",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(60% 45% at 50% 100%,rgba(124,92,252,.16),transparent)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-end",
          background: "linear-gradient(to top,rgba(0,0,0,.58),transparent)",
        }}
      >
        <div style={{ padding: 22 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 12px",
              borderRadius: 999,
              marginBottom: 10,
              border: "1px solid rgba(196,181,253,.16)",
              background: "rgba(124,92,252,.10)",
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: 999, background: "rgba(196,181,253,.48)" }} />
            <span
              style={{
                fontFamily: "'Syne',system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 11,
                color: "rgba(196,181,253,.68)",
              }}
            >
              OFFLINE
            </span>
          </div>
          <div
            style={{
              fontFamily: "'Syne',system-ui,sans-serif",
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: -0.4,
              background: "linear-gradient(90deg,#c4b5fd,#a78bfa)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {displayName}
          </div>
          {title && (
            <div
              style={{
                marginTop: 5,
                fontSize: 13,
                color: "rgba(196,181,253,.55)",
                fontFamily: "'Syne',system-ui,sans-serif",
                maxWidth: 480,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
