// web/src/pages/streamer/StreamerPage.mobile.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET MOBILE — Refonte UX mobile-first
//  Touch-optimized, animations fluides, hiérarchie claire
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { watchHeartbeat, me, getLives } from "../../lib/api";
import { DlivePlayer } from "../../components/DlivePlayer";
import RumbleStreamPlayer from "../../components/RumbleStreamPlayer";
import { ChatPanel } from "../../components/ChatPanel";
import { LoginModal } from "../../components/LoginModal";
import { SubModal } from "../../components/SubModal";
import { useAuth } from "../../auth/AuthProvider";
import { ChatIcon, BellIcon } from "./components/icons";
import { LiveDurationText, getAnonId } from "./utils";
import { useResponsive } from "./hooks/useResponsive";
import { useCinema } from "./hooks/useCinema";
import { useStreamerData } from "./hooks/useStreamerData";
import { useChest } from "./hooks/useChest";
import { ChestToast } from "./components/ChestToast";
import { ChestModal } from "./components/ChestModal";
import { AboutTab } from "./tabs/AboutTab";
import { VodTab } from "./tabs/VodTab";
import { AgendaTab } from "./tabs/AgendaTab";
import { ClipsTab } from "./tabs/ClipsTab";
import { trackFeatureEvent } from "../../lib/feature_events";

function apiBase() { return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com"; }
const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
  return u;
}

function pickStreamerAvatarUrlFromStreamer(streamer: any) {
  const uid = streamer?.ownerUserId ?? streamer?.owner_user_id ?? streamer?.userId ?? streamer?.user_id ?? streamer?.ownerId ?? streamer?.owner_id ?? streamer?.user?.id ?? streamer?.ownerUser?.id ?? null;
  
  // ✅ PRIORITÉ: avatar de l'objet user (nouveau champ ajouté)
  const userAvatarRaw = streamer?.user?.avatarUrl ?? streamer?.user?.avatar_path ?? null;
  const userAvatar = userAvatarRaw ? absolutize(String(userAvatarRaw)) || String(userAvatarRaw) : null;
  
  // ✅ FALLBACK: avatar direct du streamer (ancien système)
  const directRaw = streamer?.avatarUrl ?? streamer?.avatar_url ?? streamer?.avatar ?? streamer?.profilePicUrl ?? streamer?.profile_pic_url ?? streamer?.profile?.avatarUrl ?? null;
  const direct = directRaw ? absolutize(String(directRaw)) || String(directRaw) : null;
  
  // ✅ FALLBACK: avatar par ID si aucun des deux
  const byUid = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
  
  return userAvatar || direct || byUid;
}

type MobileTabKey = "chat" | "about" | "vod" | "clips" | "agenda";
const TAB_ORDER: MobileTabKey[] = ["chat", "about", "vod", "clips", "agenda"];

function clampTabIndex(i: number) { return Math.max(0, Math.min(TAB_ORDER.length - 1, i)); }
function tabIndexOf(t: MobileTabKey) { const i = TAB_ORDER.indexOf(t); return i >= 0 ? i : 0; }
function nextTab(t: MobileTabKey) { return TAB_ORDER[clampTabIndex(tabIndexOf(t) + 1)]; }
function prevTab(t: MobileTabKey) { return TAB_ORDER[clampTabIndex(tabIndexOf(t) - 1)]; }

type GiftStatus = { remaining: number; canClaim: boolean; myClaimed: boolean };
function fmt(n: any) { const x = Number(n || 0); return Number.isFinite(x) ? x.toLocaleString() : "0"; }

const MOBILE_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

@keyframes mob-fade-in { from { opacity:0; } to { opacity:1; } }
@keyframes mob-slide-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes mob-slide-right { from { opacity:0; transform:translateX(18px); } to { opacity:1; transform:translateX(0); } }

.mob-root { font-family:'Syne',system-ui,sans-serif; }

.mob-card {
  border-radius:18px;
  border:1px solid rgba(124,92,252,.16);
  background:rgba(11,9,22,.88);
  backdrop-filter:blur(14px);
  box-shadow:0 12px 40px rgba(0,0,0,.25);
  position:relative;
  overflow:hidden;
}

.mob-card::before {
  content:"";
  position:absolute; top:0; left:10%; right:10%; height:1px;
  pointer-events:none; z-index:2;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.28) 40%,rgba(91,142,248,.18) 60%,transparent);
}

.mob-banner {
  padding:16px;
  border-radius:18px;
  border:1px solid rgba(124,92,252,.18);
  background:linear-gradient(135deg,rgba(124,92,252,.18),rgba(59,77,200,.12));
  backdrop-filter:blur(12px);
  box-shadow:0 8px 28px rgba(124,92,252,.20);
  position:relative;
}

.mob-banner::before {
  content:"";
  position:absolute; top:0; left:8%; right:8%; height:1px;
  pointer-events:none; z-index:2;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.32) 38%,rgba(91,142,248,.22) 62%,transparent);
}

.mob-avatar {
  width:52px; height:52px;
  border-radius:16px;
  border:2px solid rgba(124,92,252,.30);
  background:linear-gradient(135deg,rgba(124,92,252,.14),rgba(59,77,200,.10));
  display:grid; place-items:center;
  overflow:hidden;
  box-shadow:0 6px 18px rgba(124,92,252,.25);
}

.mob-name {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:17px; letter-spacing:-.3px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.mob-badge {
  display:inline-flex; align-items:center; gap:6px;
  padding:6px 10px; border-radius:999px;
  border:1px solid rgba(124,92,252,.16);
  background:rgba(124,92,252,.08);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:11px;
  color:rgba(196,181,253,.85);
}

.mob-badge-live {
  border-color:rgba(239,68,68,.32);
  background:rgba(239,68,68,.10);
  color:rgba(252,165,165,.90);
}

.mob-badge-green {
  border-color:rgba(52,211,153,.24);
  background:rgba(52,211,153,.08);
  color:rgba(110,231,183,.85);
}

.mob-tabs-row {
  padding:12px 14px;
  overflow-x:auto; -webkit-overflow-scrolling:touch;
  display:flex; gap:10px;
  scrollbar-width:none;
}

.mob-tabs-row::-webkit-scrollbar { display:none; }

.mob-tab {
  padding:10px 16px; border-radius:14px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.06);
  color:rgba(196,181,253,.65);
  cursor:pointer; white-space:nowrap;
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:13px;
  transition:all 150ms ease;
  flex-shrink:0;
}

.mob-tab.active {
  border-color:rgba(124,92,252,.40);
  background:linear-gradient(90deg,rgba(124,92,252,.24),rgba(59,77,200,.18),rgba(91,142,248,.16));
  color:rgba(235,232,255,.95);
  box-shadow:0 0 0 3px rgba(124,92,252,.12);
}

.mob-content {
  padding:14px;
  animation:mob-slide-up 220ms ease both;
}

.mob-sheet-backdrop {
  position:fixed; inset:0; z-index:85;
  background:rgba(0,0,0,.70);
  backdrop-filter:blur(10px);
  animation:mob-fade-in 180ms ease;
}

.mob-sheet {
  position:fixed; bottom:0; left:0; right:0;
  max-height:90vh;
  border-radius:24px 24px 0 0;
  border:1px solid rgba(124,92,252,.24);
  background:rgba(11,9,22,.97);
  backdrop-filter:blur(20px);
  box-shadow:0 -12px 60px rgba(0,0,0,.70);
  display:flex; flex-direction:column;
  overflow:hidden;
  animation:mob-slide-up 250ms ease both;
}

.mob-sheet::before {
  content:"";
  position:absolute; top:0; left:12%; right:12%; height:1px;
  pointer-events:none; z-index:3;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.35) 38%,rgba(91,142,248,.24) 62%,transparent);
}

.mob-sheet-handle {
  width:40px; height:4px;
  margin:10px auto 12px;
  border-radius:999px;
  background:rgba(167,139,250,.30);
  flex-shrink:0;
}

.mob-sheet-head {
  padding:12px 16px;
  border-bottom:1px solid rgba(124,92,252,.14);
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  flex-shrink:0;
}

.mob-sheet-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:16px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.mob-sheet-body {
  padding:16px;
  overflow-y:auto;
  flex:1;
}

.mob-row {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:12px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05);
  cursor:pointer;
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:14px;
  transition:all 140ms ease;
  min-height:48px;
}

.mob-row:active {
  background:rgba(124,92,252,.12);
  border-color:rgba(124,92,252,.28);
}

.mob-input {
  width:100%;
  padding:12px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.20);
  background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:15px;
  outline:none;
}

.mob-input:focus {
  border-color:rgba(124,92,252,.42);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}
`;

export default function StreamerPageMobile() {
  const { slug } = useParams();
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = auth?.user?.role ?? "guest";
  const myUserId = auth?.user?.id != null ? Number(auth.user.id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const hostedBy = React.useMemo(() => new URLSearchParams(location.search).get("hostedBy"), [location.search]);

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [tab, setTab] = React.useState<MobileTabKey>("chat");
  const [tabView, setTabView] = React.useState<MobileTabKey>("chat");
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  const [subOpen, setSubOpen] = React.useState(false);
  const [subLoading, setSubLoading] = React.useState(false);
  const [subError, setSubError] = React.useState<string | null>(null);
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

  const { isMobile } = useResponsive();
  const { cinema, chatOpen, enterCinema, leaveCinema, openCinemaChat, closeCinemaChat } = useCinema(isMobile);

  const [isLandscape, setIsLandscape] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.matchMedia?.("(orientation: landscape)")?.matches ?? window.innerWidth > window.innerHeight; }
    catch { return window.innerWidth > window.innerHeight; }
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(orientation: landscape)");
    const recompute = () => {
      try { setIsLandscape(mq?.matches ?? window.innerWidth > window.innerHeight); }
      catch { setIsLandscape(window.innerWidth > window.innerHeight); }
    };
    recompute();
    if (mq?.addEventListener) mq.addEventListener("change", recompute);
    else if (mq?.addListener) mq.addListener(recompute);
    window.addEventListener("resize", recompute);
    return () => {
      if (mq?.removeEventListener) mq.removeEventListener("change", recompute);
      else if (mq?.removeListener) mq.removeListener(recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

  const { loading, streamer, followsCount, setFollowsCount, isFollowing, notifyEnabled, followLoading, toggleFollow, toggleNotify } = useStreamerData(slug ?? null, token, () => setLoginOpen(true));
  const handleFollowsCount = React.useCallback((n: number) => setFollowsCount(n), [setFollowsCount]);

  const isOwner = !!(myUserId != null && streamer?.ownerUserId != null && Number(streamer.ownerUserId) === Number(myUserId));
  const isAdmin = String(myRole) === "admin";
  const canEditTabs = isOwner || isAdmin;

  const hostTargetSlug = hostOverride?.slug ?? (streamer as any)?.hostTargetSlug ?? null;
  const hostTargetDisplayName = hostOverride?.displayName ?? (streamer as any)?.hostTargetDisplayName ?? null;
  const hostTargetIsLive = !!((streamer as any)?.hostTargetIsLive);

  React.useEffect(() => { setHostOverride(null); }, [slug]);

  React.useEffect(() => {
    if (!slug || !streamer || isOwner || hostedBy || !hostTargetSlug || !hostTargetIsLive) return;
    if (String(hostTargetSlug).toLowerCase() === String(slug).toLowerCase()) return;
    const t = window.setTimeout(() => navigate(`/s/${encodeURIComponent(String(hostTargetSlug))}?hostedBy=${encodeURIComponent(String(slug))}`, { replace: true }), 900);
    return () => window.clearTimeout(t);
  }, [slug, streamer, isOwner, hostTargetSlug, hostTargetIsLive, hostedBy, navigate]);

  async function refreshMeIfPossible() {
    if (!token) return;
    try {
      const r: any = await me(token);
      if (r?.ok && r?.user) {
        if (typeof (auth as any)?.setUser === "function") (auth as any).setUser(r.user);
        else if (typeof (auth as any)?.setAuth === "function") (auth as any).setAuth((p: any) => ({ ...(p || {}), user: r.user }));
      }
    } catch {}
  }

  async function fetchGiftStatus() {
    if (!slug) return;
    try {
      const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }).then(x => x.json());
      if (r?.ok) setGiftStatus({ remaining: Number(r.remaining || 0), canClaim: !!r.canClaim, myClaimed: !!r.myClaimed });
    } catch {}
  }

  React.useEffect(() => { fetchGiftStatus(); /* eslint-disable-next-line */ }, [slug, token]);

  const chest = useChest({
    slug: slug ?? null, token, apiBase: apiBase(), isOwner, isLive: !!streamer?.isLive,
    onRequireLogin: () => setLoginOpen(true),
    onAfterDeposit: async () => { await refreshMeIfPossible(); },
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
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [slug, token, streamer?.isLive]);

  React.useEffect(() => { if (!streamer?.isLive) setLiveViewersNow(null); }, [streamer?.isLive]);
  React.useEffect(() => { setTab("chat"); setTabView("chat"); }, [slug]);
  React.useEffect(() => {
    const streamerSlug = String(slug || "").trim();
    if (!token || !streamerSlug || tab === "chat") return;
    void trackFeatureEvent(token, { kind: "streamer_tab", subject: `${streamerSlug}|${tab}` });
  }, [slug, tab, token]);

  // Swipe tabs
  const swipeRef = React.useRef({ x0: 0, t0: 0, active: false });
  const onSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches?.[0];
    if (!t) return;
    swipeRef.current = { x0: t.clientX, t0: Date.now(), active: true };
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    if (!swipeRef.current.active) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - swipeRef.current.x0;
    const dt = Date.now() - swipeRef.current.t0;
    swipeRef.current.active = false;
    if (dt > 600 || Math.abs(dx) < 60) return;
    if (dx < 0) setTab(nextTab(tab));
    else setTab(prevTab(tab));
  };

  React.useEffect(() => { setTabView(tab); }, [tab]);

  if (loading) return <div className="mob-root" style={{ padding:20 }}><style>{MOBILE_STYLES}</style><div style={{ fontSize:14, color:"rgba(196,181,253,.65)" }}>Chargement…</div></div>;
  if (!streamer) return <div className="mob-root" style={{ padding:20 }}><style>{MOBILE_STYLES}</style><div style={{ fontSize:14, color:"rgba(252,165,165,.75)" }}>Streamer introuvable</div></div>;

  const viewers = streamer.isLive ? (liveViewersNow ?? streamer.viewers) : 0;
  const myRubis = Number(auth?.user?.rubis ?? 0);
  const SUB_PRICE_RUBIS = 500;
  const mySubTickets = Math.max(0, Math.floor(Number(auth?.user?.coupons?.sub_ticket ?? auth?.user?.tokens?.sub_ticket ?? 0)));
  const avatarUrl = pickStreamerAvatarUrlFromStreamer(streamer);
  const displayName = streamer.displayName ? String(streamer.displayName) : `@${String(slug || "")}`;
  const initials = String(displayName || "S").replace(/^@/, "").trim().slice(0, 1).toUpperCase();

  const PlayerBlock = streamer.isLive ? (
    streamer.platform === "rumble" ? (
      <RumbleStreamPlayer
        hlsUrl={streamer.rumbleHlsUrl}
        thumbnailUrl={streamer.rumbleThumbnailUrl || streamer.offlineBgUrl}
        title={streamer.title}
        isLive={streamer.isLive}
      />
    ) : (
      <DlivePlayer channelSlug={streamer.channelSlug} channelUsername={streamer.channelUsername} isLive />
    )
  ) : (
    <div className="mob-card" style={{ padding:0, aspectRatio:"16/9", background:streamer.offlineBgUrl ? `linear-gradient(to top,rgba(0,0,0,.70),rgba(0,0,0,.20)),url(${streamer.offlineBgUrl}) center/cover no-repeat` : "rgba(124,92,252,.08)", display:"flex", alignItems:"flex-end" }}>
      <div style={{ padding:16, background:"linear-gradient(to top,rgba(0,0,0,.55),transparent)" }}>
        <div style={{ fontWeight:800, fontSize:16, color:"rgba(235,232,255,.90)" }}>OFFLINE</div>
        <div style={{ marginTop:5, fontSize:12, color:"rgba(196,181,253,.70)" }}>{streamer.title}</div>
      </div>
    </div>
  );

  if (cinema) return (
    <>
      <style>{MOBILE_STYLES}</style>
      <div style={{ position:"fixed", inset:0, zIndex:9999, background:"#230c3c", display:"flex", flexDirection:"column", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)" }}>
        <div style={{ flex:1, minHeight:0, display:"flex" }}>{PlayerBlock}</div>
        <div style={{ position:"absolute", top:"calc(10px + env(safe-area-inset-top))", left:10, right:10, display:"flex", justifyContent:"space-between", gap:10, zIndex:2 }}>
          <button className="btnGhostSmall" type="button" onClick={leaveCinema}>✕ Quitter</button>
          <button className="btnPrimarySmall" type="button" onClick={openCinemaChat}><ChatIcon /> Chat</button>
        </div>
        {chatOpen ? (
          <div className="mob-sheet-backdrop" onClick={closeCinemaChat}>
            <div className={isLandscape ? "mob-sheet" : "mob-sheet"} onClick={e => e.stopPropagation()} style={isLandscape ? { width:"min(460px,56vw)", maxWidth:"92vw", height:"calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))", alignSelf:"stretch", marginLeft:"auto", marginRight:10, marginTop:10, marginBottom:10, borderRadius:18 } : {}}>
              <div className="mob-sheet-handle" />
              <div className="mob-sheet-head">
                <div className="mob-sheet-title">{isLandscape ? "Chat" : ""}</div>
                <button className="iconBtn" onClick={closeCinemaChat}>✕</button>
              </div>
              <div className="mob-sheet-body" style={{ padding:0, flex:1, minHeight:0 }}>
                <ChatPanel slug={String(slug||"")} onRequireLogin={() => setLoginOpen(true)} compact autoFocus={false} onFollowsCount={handleFollowsCount} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );

  return (
    <div className="mob-root" style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:"calc(88px + env(safe-area-inset-bottom))" }}>
      <style>{MOBILE_STYLES}</style>

      <ChestToast toast={chest.toast} isOwner={isOwner} canJoinNow={chest.canJoinNow} alreadyJoined={chest.alreadyJoined} joinLoading={chest.joinLoading} onJoin={chest.join} onView={() => chest.setChestModalOpen(true)} error={chest.chestError} onClose={() => chest.setToast(null)} />

      {hostedBy ? (
        <div className="mob-card" style={{ padding:12 }}>
          <div style={{ fontSize:12, color:"rgba(196,181,253,.75)" }}>📺 Hosté par <strong>{hostedBy}</strong></div>
        </div>
      ) : null}

      {!isOwner && hostTargetSlug && hostTargetIsLive ? (
        <div className="mob-card" style={{ padding:12 }}>
          <div style={{ fontSize:12, color:"rgba(253,230,138,.75)" }}>📺 Redirection vers <strong>{hostTargetDisplayName || hostTargetSlug}</strong>…</div>
        </div>
      ) : null}

      {/* Player */}
      <div className="mob-card" style={{ padding:0, borderRadius:18, overflow:"hidden" }}>{PlayerBlock}</div>

      {/* When live: prioritize Player → Chat/Content → Banner → Tabs.
          Otherwise keep classic order: Player → Banner → Tabs → Content. */}
      {(() => {
        const Banner = (
          <div className="mob-banner">
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div className="mob-avatar">
                {avatarUrl ? <img src={String(avatarUrl)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <span style={{ fontWeight:800, fontSize:18 }}>{initials}</span>}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="mob-name" style={{ marginBottom:6 }}>{displayName}</div>
                {typeof followsCount === "number" ? (
                  <div style={{ fontSize:11, color:"rgba(196,181,253,.60)", fontWeight:700 }}>{fmt(followsCount)} abonnés</div>
                ) : null}
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                <button type="button" className={isFollowing ? "btnGhostSmall" : "btnPrimarySmall"} disabled={followLoading} onClick={toggleFollow} style={{ fontWeight:700 }}>
                  {followLoading ? "…" : isFollowing ? "✓" : "Suivre"}
                </button>
                <button type="button" className="btnPrimarySmall" onClick={() => { if (!token) return setLoginOpen(true); setSubError(null); setGiftError(null); setSubOpen(true); }} style={{ fontWeight:700 }}>SUB</button>
                <button type="button" className="btnGhostSmall" onClick={() => setActionsOpen(true)} style={{ fontSize:16, lineHeight:1, padding:"8px 10px" }}>⋯</button>
              </div>
            </div>
            <div style={{ marginTop:12, display:"flex", gap:8, flexWrap:"wrap" }}>
              {streamer.isLive ? (
                <>
                  <span className="mob-badge mob-badge-live">🔴 LIVE</span>
                  <span className="mob-badge">👁️ {fmt(viewers)}</span>
                  <span className="mob-badge">⏱️ <LiveDurationText isLive={streamer.isLive} startedAtMs={streamer.liveStartedAtMs} /></span>
                </>
              ) : (
                <span className="mob-badge" style={{ borderColor:"rgba(124,92,252,.10)", background:"rgba(124,92,252,.04)", color:"rgba(196,181,253,.42)" }}>OFFLINE</span>
              )}
              {giftStatus?.myClaimed ? <span className="mob-badge mob-badge-green">✅ Sub offert</span> : null}
            </div>
          </div>
        );

        const Tabs = (
          <div className="mob-card">
            <div className="mob-tabs-row">
              {[["chat","Chat"],["about","À propos"],["vod","VOD"],["clips","Clips"],["agenda","Agenda"]].map(([k,l]) => (
                <button key={k} type="button" className={`mob-tab${tab===k?" active":""}`} onClick={() => setTab(k as MobileTabKey)}>{l}</button>
              ))}
            </div>
          </div>
        );

        // Chat panel : taille adaptative — quand live + chat actif on remplit
        // ce qu'il reste de l'écran sous le player pour que stream+chat+input
        // soient visibles sans scroll. ~280px = player (16/9) + paddings.
        const chatHeightStyle: React.CSSProperties = streamer.isLive
          ? { padding:0, height:"calc(100dvh - 290px)", minHeight:360, maxHeight:640, display:"flex", flexDirection:"column" }
          : { padding:0, height:"min(52vh,520px)", minHeight:330, display:"flex", flexDirection:"column" };

        const Content = (
          <div onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} style={{ touchAction:"pan-y" }}>
            <div className="mob-card" key={tabView}>
              {tabView === "chat" ? (
                <div style={chatHeightStyle}>
                  <div style={{ padding:"12px 14px", borderBottom:"1px solid rgba(124,92,252,.10)", background:"rgba(124,92,252,.03)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontWeight:800, fontSize:14 }}>Chat</div>
                    <button type="button" className="btnGhostSmall" onClick={enterCinema} style={{ fontSize:14 }}>⛶</button>
                  </div>
                  <div style={{ flex:1, minHeight:0 }}>
                    <ChatPanel slug={String(slug||"")} onRequireLogin={() => setLoginOpen(true)} compact autoFocus={false} onFollowsCount={handleFollowsCount} />
                  </div>
                </div>
              ) : (
                <div className="mob-content">
                  {tabView === "about" && slug ? <AboutTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
                  {tabView === "clips" && slug ? <ClipsTab slug={String(slug)} token={token} isOwner={isOwner} onRequireLogin={() => setLoginOpen(true)} /> : null}
                  {tabView === "vod" && slug ? <VodTab slug={String(slug)} /> : null}
                  {tabView === "agenda" && slug ? <AgendaTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
                </div>
              )}
            </div>
          </div>
        );

        return streamer.isLive ? (
          <>
            {Content}
            {Banner}
            {Tabs}
          </>
        ) : (
          <>
            {Banner}
            {Tabs}
            {Content}
          </>
        );
      })()}

      {/* Actions sheet */}
      {actionsOpen ? (
        <div className="mob-sheet-backdrop" onClick={() => setActionsOpen(false)}>
          <div className="mob-sheet" onClick={e => e.stopPropagation()}>
            <div className="mob-sheet-handle" />
            <div className="mob-sheet-head">
              <div className="mob-sheet-title">Actions</div>
              <button className="iconBtn" onClick={() => setActionsOpen(false)}>✕</button>
            </div>
            <div className="mob-sheet-body" style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {claimError ? <div style={{ fontSize:12, color:"rgba(252,165,165,.90)" }}>{claimError}</div> : null}
              <div className="mob-card" style={{ padding:14 }}>
                <div style={{ fontSize:11, color:"rgba(167,139,250,.60)", fontWeight:700, marginBottom:10 }}>MON SOLDE</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <span className="mob-badge">💎 {fmt(myRubis)}</span>
                  <span className="mob-badge">🎟️ {fmt(mySubTickets)}</span>
                </div>
              </div>
              <button type="button" className="mob-row" disabled={followLoading} onClick={toggleFollow}>
                <span>{followLoading ? "…" : isFollowing ? "✅ Suivi" : "➕ Suivre"}</span>
                <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{isFollowing ? "Actif" : "Inactif"}</span>
              </button>
              {isFollowing ? (
                <button type="button" className="mob-row" disabled={followLoading} onClick={toggleNotify}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:8 }}><BellIcon on={notifyEnabled} /> Notifications</span>
                  <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{notifyEnabled ? "On" : "Off"}</span>
                </button>
              ) : null}
              <button type="button" className="mob-row" onClick={() => { if (!token) return setLoginOpen(true); setSubError(null); setGiftError(null); setSubOpen(true); }}>
                <span>💎 Sub</span>
                <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{SUB_PRICE_RUBIS}</span>
              </button>
              {giftStatus?.remaining ? (
                token && giftStatus.canClaim ? (
                  <button type="button" className="mob-row" disabled={claimLoading} onClick={async () => {
                    if (!token || !slug) return;
                    setClaimLoading(true); setClaimError(null);
                    try {
                      const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs/claim`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } }).then(x => x.json());
                      if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
                      await refreshMeIfPossible(); await fetchGiftStatus();
                    } catch (e: any) { setClaimError(String(e?.message || "Erreur")); }
                    finally { setClaimLoading(false); }
                  }}>
                    <span>{claimLoading ? "…" : `🎁 Claim`}</span>
                    <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{fmt(giftStatus.remaining)}</span>
                  </button>
                ) : (
                  <button type="button" className="mob-row" onClick={() => { if (!token) return setLoginOpen(true); setSubOpen(true); }}>
                    <span>🎁 Subs offerts</span>
                    <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{fmt(giftStatus.remaining)}</span>
                  </button>
                )
              ) : null}
              <button type="button" className="mob-row" onClick={() => { chest.setChestError(null); chest.setChestModalOpen(true); }}>
                <span>🎁 Coffre{chest.chestLoading ? "…" : chest.chestBalance > 0 ? ` (${chest.chestBalance})` : ""}</span>
                <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>Ouvrir</span>
              </button>
              {isOwner && !chest.chestHasOpen ? (
                <button type="button" className="mob-row" disabled={chest.ownerLoading || !streamer.isLive} onClick={chest.open}>
                  <span>{chest.ownerLoading ? "…" : "Ouvrir coffre"}</span>
                  <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{streamer.isLive ? "2 min" : "Offline"}</span>
                </button>
              ) : null}
              {!isOwner && chest.chestHasOpen ? (
                <button type="button" className="mob-row" disabled={chest.joinLoading || chest.alreadyJoined} onClick={chest.join}>
                  <span>{chest.alreadyJoined ? "✅ Inscrit" : chest.joinLoading ? "…" : "Participer"}</span>
                  <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{chest.alreadyJoined ? "OK" : "Go"}</span>
                </button>
              ) : null}
              {isOwner ? (
                <button type="button" className="mob-row" onClick={() => { if (!token) return setLoginOpen(true); setHostError(null); setHostOpen(true); setActionsOpen(false); }}>
                  <span>📺 Host</span>
                  <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>Gérer</span>
                </button>
              ) : null}
              <button type="button" className="mob-row" onClick={() => { setActionsOpen(false); enterCinema(); }}>
                <span>⛶ Plein écran</span>
                <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>Cinéma</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Host modal */}
      {hostOpen ? (
        <div className="mob-sheet-backdrop" onClick={() => setHostOpen(false)}>
          <div className="mob-sheet" onClick={e => e.stopPropagation()}>
            <div className="mob-sheet-handle" />
            <div className="mob-sheet-head">
              <div className="mob-sheet-title">📺 Host</div>
              <button className="iconBtn" onClick={() => setHostOpen(false)}>✕</button>
            </div>
            <div className="mob-sheet-body" style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {hostTargetSlug ? (
                <div className="mob-card" style={{ padding:14 }}>
                  <div style={{ fontSize:11, color:"rgba(167,139,250,.60)", fontWeight:700, marginBottom:6 }}>HOST ACTUEL</div>
                  <div style={{ fontWeight:800, fontSize:15 }}>{hostTargetDisplayName || `@${hostTargetSlug}`}</div>
                  <button type="button" className="btnPrimarySmall" disabled={hostBusy} style={{ marginTop:10, width:"100%" }} onClick={async () => {
                    if (!token || !slug) return; setHostBusy(true); setHostError(null);
                    try {
                      const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/host`, { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}, body:JSON.stringify({targetSlug:null}) }).then(x=>x.json());
                      if (!r?.ok) throw new Error(String(r?.error||"Erreur"));
                      setHostOverride({slug:null,displayName:null});
                    } catch(e:any){setHostError(String(e?.message||"Erreur"));}
                    finally{setHostBusy(false);}
                  }}>
                    {hostBusy ? "…" : "Stop host"}
                  </button>
                </div>
              ) : null}
              <div style={{ display:"flex", gap:10 }}>
                <input className="mob-input" value={hostQuery} onChange={e => setHostQuery(e.target.value)} placeholder="Rechercher…" style={{ flex:1 }} />
                <button type="button" className="btnGhostSmall" disabled={hostBusy} onClick={async () => {
                  setHostBusy(true); setHostError(null);
                  try { const lives=await getLives(); setHostLives((lives as any[]).filter(x=>String(x.slug||"").toLowerCase()!==String(slug||"").toLowerCase())); }
                  catch(e:any){setHostError(String(e?.message||"Erreur"));}
                  finally{setHostBusy(false);}
                }}>
                  {hostBusy?"…":"↻"}
                </button>
              </div>
              {hostError ? <div style={{ fontSize:12, color:"rgba(252,165,165,.90)" }}>{hostError}</div> : null}
              {(hostLives||[]).filter(x=>{const q=hostQuery.trim().toLowerCase(); return !q || String(x.displayName||x.slug||"").toLowerCase().includes(q);}).slice(0,30).map(x => (
                <button key={String(x.id||x.slug)} type="button" className="mob-row" disabled={hostBusy} onClick={async () => {
                  if (!token||!slug) return; const target=String(x.slug||"").trim(); if(!target) return;
                  setHostBusy(true); setHostError(null);
                  try {
                    const r=await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/host`, {method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({targetSlug:target})}).then(xx=>xx.json());
                    if(!r?.ok) throw new Error(String(r?.error||"Erreur"));
                    setHostOverride({slug:r.hostTargetSlug,displayName:r.hostTargetDisplayName}); setHostOpen(false);
                  } catch(e:any){setHostError(String(e?.message||"Erreur"));}
                  finally{setHostBusy(false);}
                }}>
                  <span>{x.displayName||`@${x.slug}`}</span>
                  <span style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>{Number(x.viewers||0)}</span>
                </button>
              ))}
              {!hostLives?.length ? <div style={{ fontSize:12, color:"rgba(167,139,250,.55)", textAlign:"center", padding:20 }}>Clique ↻ pour charger</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      <ChestModal open={chest.chestModalOpen} onClose={() => chest.setChestModalOpen(false)} chestLoading={chest.chestLoading} chestBalance={chest.chestBalance} chest={chest.chest} opening={chest.opening} remainingSec={chest.remainingSec} progress={chest.progress} error={chest.chestError} onRefresh={chest.refreshChest} isOwner={isOwner} openingId={chest.openingId} alreadyJoined={chest.alreadyJoined} joinLoading={chest.joinLoading} onJoin={chest.join} isLive={streamer.isLive} chestHasOpen={chest.chestHasOpen} ownerLoading={chest.ownerLoading} onOpen={chest.open} depositAmount={chest.depositAmount} setDepositAmount={chest.setDepositAmount} depositNote={chest.depositNote} setDepositNote={chest.setDepositNote} depositLoading={chest.depositLoading} onDeposit={chest.deposit} />

      <SubModal open={subOpen} onClose={() => setSubOpen(false)} streamerName={streamer.displayName ? streamer.displayName : `@${String(slug||"")}`} priceRubis={SUB_PRICE_RUBIS} myRubis={myRubis} mySubTickets={mySubTickets} disableSelfTicket={isOwner} loading={subLoading} error={subError} onGoShop={() => { setSubOpen(false); window.location.href="/shop"; }} onPaySelf={async (mode) => {
        if (!token||!slug) return; setSubLoading(true); setSubError(null);
        try {
          const useTicket = mode === "ticket";
          const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/subscribe`, { method:"POST", headers:{ Authorization:`Bearer ${token}`, ...(useTicket?{"Content-Type":"application/json"}:{}) }, body:useTicket?JSON.stringify({useTicket:true}):undefined }).then(x=>x.json());
          if (!r?.ok) throw new Error(String(r?.error||"Erreur"));
          await refreshMeIfPossible(); await fetchGiftStatus(); setSubOpen(false);
        } catch(e:any){ setSubError(String(e?.message||"Erreur")); }
        finally { setSubLoading(false); }
      }} onPayRubis={async () => {
        if (!token||!slug) return; setSubLoading(true); setSubError(null);
        try {
          const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/subscribe`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } }).then(x=>x.json());
          if (!r?.ok) throw new Error(String(r?.error||"Erreur"));
          await refreshMeIfPossible(); await fetchGiftStatus(); setSubOpen(false);
        } catch(e:any){ setSubError(String(e?.message||"Erreur")); }
        finally { setSubLoading(false); }
      }} onPayGiftSubs={async (count, useTicketsMaybe) => {
        if (!token||!slug) return; setGiftLoading(true); setGiftError(null);
        const useTickets = Math.max(0, Math.floor(Number(useTicketsMaybe||0)));
        try {
          const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs`, { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}, body:JSON.stringify({count,useTickets}) }).then(x=>x.json());
          if (!r?.ok) throw new Error(String(r?.error||"Erreur"));
          await refreshMeIfPossible(); await fetchGiftStatus(); setSubOpen(false);
        } catch(e:any){ setGiftError(String(e?.message||"Erreur")); }
        finally { setGiftLoading(false); }
      }} giftLoading={giftLoading} giftError={giftError} />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
