// web/src/pages/streamer/StreamerPage.mobile.tsx
import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { watchHeartbeat, me, getLives } from "../../lib/api";
import { DlivePlayer } from "../../components/DlivePlayer";
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

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
  return u;
}

/**
 * Avatar resolver (comme BrowsePage):
 * - priorité à streamer.avatarUrl si présent
 * - sinon fallback sur /avatars/u/:ownerUserId (cache-bust soft 1/min)
 */
function pickStreamerAvatarUrlFromStreamer(streamer: any) {
  const uid =
    streamer?.ownerUserId ??
    streamer?.owner_user_id ??
    streamer?.userId ??
    streamer?.user_id ??
    streamer?.ownerId ??
    streamer?.owner_id ??
    streamer?.user?.id ??
    streamer?.ownerUser?.id ??
    null;

  const directRaw =
    streamer?.avatarUrl ??
    streamer?.avatar_url ??
    streamer?.avatar ??
    streamer?.profilePicUrl ??
    streamer?.profile_pic_url ??
    streamer?.profile?.avatarUrl ??
    streamer?.user?.avatarUrl ??
    null;

  const direct = directRaw ? absolutize(String(directRaw)) || String(directRaw) : null;

  // cache-bust soft (1/min)
  const byUid = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;

  return direct || byUid;
}

type MobileTabKey = "chat" | "about" | "vod" | "clips" | "agenda";

const TAB_ORDER: MobileTabKey[] = ["chat", "about", "vod", "clips", "agenda"];

function clampTabIndex(i: number) {
  return Math.max(0, Math.min(TAB_ORDER.length - 1, i));
}
function tabIndexOf(t: MobileTabKey) {
  const i = TAB_ORDER.indexOf(t);
  return i >= 0 ? i : 0;
}
function nextTab(t: MobileTabKey) {
  return TAB_ORDER[clampTabIndex(tabIndexOf(t) + 1)];
}
function prevTab(t: MobileTabKey) {
  return TAB_ORDER[clampTabIndex(tabIndexOf(t) - 1)];
}

type GiftStatus = {
  remaining: number;
  canClaim: boolean;
  myClaimed: boolean;
};

function fmt(n: any) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString() : "0";
}

type ActivePlans = { viewer: boolean; streamer: boolean };

function isActiveSubEntry(s: any): boolean {
  const now = Date.now();
  if (!s) return false;

  const status = String(s.status || s.state || "").toLowerCase();
  const endRaw = s.current_period_end ?? s.currentPeriodEnd ?? s.end ?? null;

  // si pas de date: on se base sur le status
  if (!endRaw) return status === "active" || status === "trialing";

  const endMs =
    typeof endRaw === "number"
      ? endRaw * (endRaw > 1e12 ? 1 : 1000)
      : new Date(String(endRaw)).getTime();

  if (!Number.isFinite(endMs)) return false;

  return endMs > now;
}

function addPlan(out: ActivePlans, planCode: string | null | undefined, active: boolean) {
  if (!active) return;
  const p = String(planCode || "").toLowerCase();
  if (p === "viewer") out.viewer = true;
  if (p === "streamer") out.streamer = true;
}

function getActivePlansFrom(x: any): ActivePlans {
  const out: ActivePlans = { viewer: false, streamer: false };
  if (!x) return out;

  if (Array.isArray(x)) {
    for (const s of x) addPlan(out, s?.plan_code ?? s?.planCode, isActiveSubEntry(s));
    return out;
  }

  if (typeof x === "object") {
    if (x.viewer || x.streamer) {
      addPlan(out, "viewer", isActiveSubEntry(x.viewer));
      addPlan(out, "streamer", isActiveSubEntry(x.streamer));
      return out;
    }

    if (x.plans) return getActivePlansFrom(x.plans);
    if (x.subscriptions) return getActivePlansFrom(x.subscriptions);

    if (x.plan_code || x.planCode) {
      addPlan(out, x.plan_code ?? x.planCode, isActiveSubEntry(x));
      return out;
    }
  }

  return out;
}

function mergePlans(a: ActivePlans, b: ActivePlans): ActivePlans {
  return { viewer: a.viewer || b.viewer, streamer: a.streamer || b.streamer };
}

function pillBase(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
    color: active ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.78)",
    fontWeight: 950,
    whiteSpace: "nowrap",
    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
    transform: active ? "translateY(-1px)" : "translateY(0px)",
  };
}

function iconBtn(): React.CSSProperties {
  return {
    borderRadius: 14,
    padding: "9px 10px",
    minHeight: 38,
    minWidth: 38,
    fontWeight: 950,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}

function smallBadge(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    fontWeight: 950,
    color: "rgba(255,255,255,0.86)",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
}

// helpers viewport
function getViewportMeta(): HTMLMetaElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('meta[name="viewport"]');
}
function readViewportContent(): string | null {
  const m = getViewportMeta();
  const c = m?.getAttribute("content");
  return c && String(c).trim() ? String(c) : null;
}
function writeViewportContent(content: string) {
  const m = getViewportMeta();
  if (!m) return;
  m.setAttribute("content", content);
}

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

  // Onglet principal
  const [tab, setTab] = React.useState<MobileTabKey>("chat");

  // Onglet effectivement rendu (pour l’anim)
  const [tabView, setTabView] = React.useState<MobileTabKey>("chat");
  const [tabAnim, setTabAnim] = React.useState<{ stage: "idle" | "leaving" | "entering"; dir: -1 | 1 }>({
    stage: "idle",
    dir: 1,
  });

  // keep latest tabAnim in ref (évite closures)
  const tabAnimRef = React.useRef(tabAnim);
  React.useEffect(() => {
    tabAnimRef.current = tabAnim;
  }, [tabAnim]);

  // timers cleanup (évite timeouts orphelins)
  const timersRef = React.useRef<number[]>([]);
  React.useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

  // viewers heartbeat
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  // sub modal
  const [subOpen, setSubOpen] = React.useState(false);
  const [subLoading, setSubLoading] = React.useState(false);
  const [subError, setSubError] = React.useState<string | null>(null);

  // gift subs
  const [giftLoading, setGiftLoading] = React.useState(false);
  const [giftError, setGiftError] = React.useState<string | null>(null);
  const [giftStatus, setGiftStatus] = React.useState<GiftStatus | null>(null);
  const [claimLoading, setClaimLoading] = React.useState(false);
  const [claimError, setClaimError] = React.useState<string | null>(null);

  // owner host
  const [hostOpen, setHostOpen] = React.useState(false);
  const [hostBusy, setHostBusy] = React.useState(false);
  const [hostError, setHostError] = React.useState<string | null>(null);
  const [hostQuery, setHostQuery] = React.useState("");
  const [hostLives, setHostLives] = React.useState<any[]>([]);
  const [hostOverride, setHostOverride] = React.useState<{ slug: string | null; displayName: string | null } | null>(null);

  // actions sheet
  const [actionsOpen, setActionsOpen] = React.useState(false);

  const { isMobile } = useResponsive();
  const { cinema, chatOpen, enterCinema, leaveCinema, openCinemaChat, closeCinemaChat } = useCinema(isMobile);

  // ✅ ANTI-ZOOM / ANTI-AUTOSIZE pendant CINEMA (plein écran logique)
  const cinemaGuardRef = React.useRef<{
    viewport: string | null;
    htmlWebkitAdjust: string;
    htmlAdjust: string;
    bodyTouchAction: string;
    bodyOverscroll: string;
  } | null>(null);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    // capture une seule fois
    if (!cinemaGuardRef.current) {
      const de: any = document.documentElement;
      const bs: any = document.body?.style || ({} as any);
      cinemaGuardRef.current = {
        viewport: readViewportContent(),
        htmlWebkitAdjust: String(de?.style?.webkitTextSizeAdjust ?? ""),
        htmlAdjust: String(de?.style?.textSizeAdjust ?? ""),
        bodyTouchAction: String(bs?.touchAction ?? ""),
        bodyOverscroll: String(bs?.overscrollBehavior ?? ""),
      };
    }

    const snap = cinemaGuardRef.current!;
    const de: any = document.documentElement;
    const bs: any = document.body?.style || ({} as any);

    const lockViewport =
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

    const apply = () => {
      try {
        if (snap.viewport != null) writeViewportContent(lockViewport);
      } catch {}

      // stop “text boosting”
      try {
        de.style.webkitTextSizeAdjust = "100%";
        de.style.textSizeAdjust = "100%";
      } catch {}

      // évite certains double-tap zoom / gestures bizarres en overlay fixed
      try {
        bs.touchAction = "manipulation";
        bs.overscrollBehavior = "none";
      } catch {}

      // blur si un input était focus (souvent déclencheur de zoom)
      try {
        const ae: any = document.activeElement;
        if (ae && typeof ae.blur === "function") ae.blur();
      } catch {}
    };

    const restore = () => {
      try {
        if (snap.viewport != null) writeViewportContent(snap.viewport);
      } catch {}
      try {
        de.style.webkitTextSizeAdjust = snap.htmlWebkitAdjust;
        de.style.textSizeAdjust = snap.htmlAdjust;
      } catch {}
      try {
        bs.touchAction = snap.bodyTouchAction;
        bs.overscrollBehavior = snap.bodyOverscroll;
      } catch {}
    };

    if (cinema) apply();
    else restore();

    return () => {
      // sécurité: si on unmount pendant cinema
      restore();
    };
  }, [cinema]);

  // ✅ détecte orientation (portrait/paysage) pour le chat en mode cinéma
  const [isLandscape, setIsLandscape] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia?.("(orientation: landscape)")?.matches ?? window.innerWidth > window.innerHeight;
    } catch {
      return window.innerWidth > window.innerHeight;
    }
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia?.("(orientation: landscape)");
    const recompute = () => {
      try {
        setIsLandscape(mq?.matches ?? window.innerWidth > window.innerHeight);
      } catch {
        setIsLandscape(window.innerWidth > window.innerHeight);
      }
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
  const isAdmin = String(myRole) === "admin";
  const canEditTabs = isOwner || isAdmin;

  // host target from API + override after POST
  const hostTargetSlug = hostOverride?.slug ?? (streamer as any)?.hostTargetSlug ?? null;
  const hostTargetDisplayName = hostOverride?.displayName ?? (streamer as any)?.hostTargetDisplayName ?? null;
  const hostTargetIsLive = !!((streamer as any)?.hostTargetIsLive);

  React.useEffect(() => {
    setHostOverride(null);
  }, [slug]);

  // viewer redirect if host active
  React.useEffect(() => {
    if (!slug) return;
    if (!streamer) return;
    if (isOwner) return;
    if (hostedBy) return;

    if (!hostTargetSlug || !hostTargetIsLive) return;
    if (String(hostTargetSlug).toLowerCase() === String(slug).toLowerCase()) return;

    const t = window.setTimeout(() => {
      navigate(`/s/${encodeURIComponent(String(hostTargetSlug))}?hostedBy=${encodeURIComponent(String(slug))}`, { replace: true });
    }, 900);

    return () => window.clearTimeout(t);
  }, [slug, streamer, isOwner, hostTargetSlug, hostTargetIsLive, hostedBy, navigate]);

  async function refreshMeIfPossible() {
    if (!token) return;
    try {
      const r: any = await me(token);
      if (r?.ok && r?.user) {
        if (typeof (auth as any)?.setUser === "function") {
          (auth as any).setUser(r.user);
        } else if (typeof (auth as any)?.setAuth === "function") {
          (auth as any).setAuth((prev: any) => ({ ...(prev || {}), user: r.user }));
        }
      }
    } catch {}
  }

  async function fetchGiftStatus() {
    if (!slug) return;
    try {
      const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }).then((x) => x.json());

      if (r?.ok) {
        setGiftStatus({
          remaining: Number(r.remaining || 0),
          canClaim: !!r.canClaim,
          myClaimed: !!r.myClaimed,
        });
      }
    } catch {}
  }

  React.useEffect(() => {
    fetchGiftStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // toast bridge
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

  // heartbeat viewers
  React.useEffect(() => {
    if (!slug) return;
    if (!streamer?.isLive) return;

    const anonId = getAnonId();
    let stopped = false;

    const beat = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;

      try {
        const r = await watchHeartbeat({ slug: String(slug), anonId }, token);
        if (r?.isLive && typeof r.viewersNow === "number") setLiveViewersNow(r.viewersNow);
        if (r?.isLive === false) setLiveViewersNow(0);
      } catch {}
    };

    beat();
    const t = window.setInterval(beat, 15_000);

    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slug, token, streamer?.isLive]);

  React.useEffect(() => {
    if (!streamer?.isLive) setLiveViewersNow(null);
  }, [streamer?.isLive]);

  // reset tabs on slug change
  React.useEffect(() => {
    setTab("chat");
    setTabView("chat");
    setTabAnim({ stage: "idle", dir: 1 });
  }, [slug]);

  // ──────────────────────────────────────────
  // Tabs: goTab avec animation (slide + fade)
  // ──────────────────────────────────────────
  const LEAVE_MS = 140;
  const ENTER_MS = 170;

  const goTab = React.useCallback(
    (next: MobileTabKey) => {
      if (next === tab) return;

      const curI = tabIndexOf(tab);
      const nextI = tabIndexOf(next);
      const dir: -1 | 1 = nextI > curI ? 1 : -1;

      setTab(next);

      // si anim en cours, on force sans glitch
      if (tabAnimRef.current.stage !== "idle") {
        setTabView(next);
        setTabAnim({ stage: "entering", dir });
        const id = window.setTimeout(() => setTabAnim({ stage: "idle", dir }), 0);
        timersRef.current.push(id);
        return;
      }

      setTabAnim({ stage: "leaving", dir });
      const id = window.setTimeout(() => {
        setTabView(next);
        setTabAnim({ stage: "entering", dir });
        const id2 = window.setTimeout(() => setTabAnim({ stage: "idle", dir }), 0);
        timersRef.current.push(id2);
      }, LEAVE_MS);

      timersRef.current.push(id);
    },
    [tab]
  );

  // Auto-center du tab actif dans la barre (smooth)
  const tabRowRef = React.useRef<HTMLDivElement | null>(null);
  const tabBtnRefs = React.useRef<Partial<Record<MobileTabKey, HTMLButtonElement | null>>>({});
  React.useEffect(() => {
    const el = tabBtnRefs.current[tab];
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    } catch {}
  }, [tab]);

  // ──────────────────────────────────────────
  // Swipe tabs (mobile): propre + safe
  // ──────────────────────────────────────────
  const swipeEnabled = !actionsOpen && !hostOpen && !subOpen && !loginOpen && !chest.chestModalOpen;

  const swipeRef = React.useRef({
    x0: 0,
    y0: 0,
    t0: 0,
    active: false,
    tracking: false,
    locked: false as false | "x" | "y",
  });

  const SWIPE_MIN_X = 60;
  const SWIPE_MAX_Y = 70;
  const SWIPE_MAX_MS = 650;
  const EDGE_GUARD = 8;

  function isInteractiveTarget(target: any) {
    const tag = String(target?.tagName || "").toLowerCase();
    if (!tag) return false;
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "a") return true;
    if (target?.closest?.("[data-no-swipe='1']")) return true;
    return false;
  }

  function onSwipeStart(e: React.TouchEvent) {
    if (!swipeEnabled) return;
    const t = e.touches?.[0];
    if (!t) return;

    if (isInteractiveTarget(e.target)) return;
    if (t.clientX < EDGE_GUARD || t.clientX > window.innerWidth - EDGE_GUARD) return;

    swipeRef.current = {
      x0: t.clientX,
      y0: t.clientY,
      t0: Date.now(),
      active: true,
      tracking: true,
      locked: false,
    };
  }

  function onSwipeMove(e: React.TouchEvent) {
    if (!swipeRef.current.active) return;

    const t = e.touches?.[0];
    if (!t) return;

    const dx = t.clientX - swipeRef.current.x0;
    const dy = t.clientY - swipeRef.current.y0;

    if (!swipeRef.current.locked) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        swipeRef.current.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }

    if (swipeRef.current.locked === "y") {
      swipeRef.current.active = false;
      swipeRef.current.tracking = false;
      return;
    }
  }

  function onSwipeEnd(e: React.TouchEvent) {
    if (!swipeRef.current.tracking) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - swipeRef.current.x0;
    const dy = t.clientY - swipeRef.current.y0;
    const dt = Date.now() - swipeRef.current.t0;

    swipeRef.current.active = false;
    swipeRef.current.tracking = false;

    if (dt > SWIPE_MAX_MS) return;
    if (Math.abs(dx) < SWIPE_MIN_X) return;
    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) goTab(nextTab(tab));
    else goTab(prevTab(tab));
  }

  // style animation content
  const contentAnimStyle: React.CSSProperties = React.useMemo(() => {
    const base: React.CSSProperties = { willChange: "transform, opacity" };

    if (tabAnim.stage === "leaving") {
      return {
        ...base,
        transition: `transform ${LEAVE_MS}ms ease, opacity ${LEAVE_MS}ms ease`,
        transform: `translateX(${tabAnim.dir === 1 ? -28 : 28}px)`,
        opacity: 0,
      };
    }

    if (tabAnim.stage === "entering") {
      return {
        ...base,
        transition: "none",
        transform: `translateX(${tabAnim.dir === 1 ? 28 : -28}px)`,
        opacity: 0,
      };
    }

    return {
      ...base,
      transition: `transform ${ENTER_MS}ms ease, opacity ${ENTER_MS}ms ease`,
      transform: "translateX(0px)",
      opacity: 1,
    };
  }, [tabAnim.stage, tabAnim.dir]);

  // ──────────────────────────────────────────
  // Render branches (SANS early return => hooks OK)
  // ──────────────────────────────────────────
  const openSub = () => {
    if (!token) return setLoginOpen(true);
    setSubError(null);
    setGiftError(null);
    setSubOpen(true);
  };

  const openChest = () => {
    chest.setChestError(null);
    chest.setChestModalOpen(true);
  };

  const chatHeightStyle: React.CSSProperties = {
    height: "min(52vh, 520px)",
    minHeight: 330,
  };

  // placeholder minimal (loading / not found)
  let content: React.ReactNode = null;

  if (loading) {
    content = <div className="panel">Chargement…</div>;
  } else if (!streamer) {
    content = <div className="panel">Streamer introuvable</div>;
  } else {
    const viewersFromApi = streamer.viewers;
    const viewers = streamer.isLive ? (liveViewersNow ?? viewersFromApi) : 0;

    const myRubis = Number(auth?.user?.rubis ?? 0);
    const SUB_PRICE_RUBIS = 500;
    const mySubTickets = Math.max(0, Math.floor(Number(auth?.user?.coupons?.sub_ticket ?? auth?.user?.tokens?.sub_ticket ?? 0)));

    const PlayerBlock = (
      <>
        {streamer.isLive ? (
          <DlivePlayer channelSlug={streamer.channelSlug} channelUsername={streamer.channelUsername} isLive />
        ) : (
          <div
            className="panel"
            style={{
              padding: 0,
              overflow: "hidden",
              borderRadius: 18,
              aspectRatio: "16/9",
              background: streamer.offlineBgUrl
                ? `linear-gradient(to top, rgba(0,0,0,0.70), rgba(0,0,0,0.20)), url(${streamer.offlineBgUrl}) center/cover no-repeat`
                : "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-end",
                background: "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.00))",
              }}
            >
              <div style={{ padding: 16 }}>
                <div style={{ fontWeight: 950, fontSize: 18 }}>OFFLINE</div>
                <div className="mutedSmall" style={{ marginTop: 6 }}>
                  {streamer.title}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );

    // star logic
    const avatarUrl = pickStreamerAvatarUrlFromStreamer(streamer);
    const displayName = streamer.displayName ? String(streamer.displayName) : `@${String(slug || "")}`;
    const initials = String(displayName || "S").replace(/^@/, "").trim().slice(0, 1).toUpperCase();

    const streamerUser = (streamer as any)?.raw?.user ?? (streamer as any)?.raw?.owner ?? (streamer as any)?.raw?.ownerUser ?? null;

    let ownerPlans: ActivePlans = { viewer: false, streamer: false };
    ownerPlans = mergePlans(ownerPlans, getActivePlansFrom(streamerUser?.user_subscriptions));
    ownerPlans = mergePlans(ownerPlans, getActivePlansFrom(streamerUser?.userSubscriptions));
    ownerPlans = mergePlans(ownerPlans, getActivePlansFrom((streamer as any)?.raw?.user_subscriptions));
    ownerPlans = mergePlans(ownerPlans, getActivePlansFrom((streamer as any)?.raw?.ownerSubscriptions));
    ownerPlans = mergePlans(ownerPlans, getActivePlansFrom((streamer as any)?.raw?.owner_subscriptions));

    type StarKind = "none" | "streamer" | "both";
    const starKind: StarKind =
      ownerPlans.viewer && ownerPlans.streamer ? "both" : ownerPlans.streamer ? "streamer" : "none";
    const showStar = starKind !== "none";

    const badgeStyle: React.CSSProperties =
      starKind === "streamer"
        ? { ...smallBadge(), borderColor: "rgba(110,185,255,0.70)", background: "rgba(90,170,255,0.18)" }
        : { ...smallBadge(), borderColor: "rgba(180,120,255,0.75)", background: "rgba(170,110,255,0.18)" };

    const ActionsSheet = actionsOpen ? (
      <div className="chatSheetBackdrop" onClick={() => setActionsOpen(false)} role="presentation" style={{ zIndex: 70 }}>
        <div className="chatSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>
          <div className="chatSheetTop">
            <div style={{ fontWeight: 950 }}>Actions</div>
            <button className="iconBtn" onClick={() => setActionsOpen(false)} type="button" aria-label="Fermer">
              ✕
            </button>
          </div>

          <div className="chatSheetBody" style={{ padding: 14 }}>
            {claimError ? (
              <div className="mutedSmall" style={{ marginBottom: 10, color: "rgba(255,90,90,0.95)" }}>
                {claimError}
              </div>
            ) : null}

            <div className="panel" style={{ marginBottom: 12 }}>
              <div className="mutedSmall">Ton solde</div>
              <div style={{ marginTop: 6, fontWeight: 950, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={smallBadge()}>💎 {fmt(myRubis)} rubis</span>
                <span style={smallBadge()}>🎟️ {fmt(mySubTickets)} ticket</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className={isFollowing ? "btnGhostSmall" : "btnPrimarySmall"}
                disabled={followLoading}
                onClick={async () => {
                  await toggleFollow();
                }}
                style={{ justifyContent: "space-between", display: "flex" }}
              >
                <span style={{ fontWeight: 950 }}>{followLoading ? "…" : isFollowing ? "✅ Suivi" : "➕ Suivre"}</span>
                <span className="mutedSmall">{isFollowing ? "Actif" : "Inactif"}</span>
              </button>

              {isFollowing ? (
                <button
                  type="button"
                  className="btnGhostSmall"
                  disabled={followLoading}
                  onClick={toggleNotify}
                  style={{ justifyContent: "space-between", display: "flex" }}
                  title="Notifications"
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 950 }}>
                    <BellIcon on={notifyEnabled} /> Notifications
                  </span>
                  <span className="mutedSmall">{notifyEnabled ? "On" : "Off"}</span>
                </button>
              ) : null}

              <button type="button" className="btnPrimarySmall" onClick={openSub} style={{ justifyContent: "space-between", display: "flex" }}>
                <span style={{ fontWeight: 950 }}>💎 Sub</span>
                <span className="mutedSmall">{SUB_PRICE_RUBIS} rubis</span>
              </button>

              {giftStatus?.remaining ? (
                token && giftStatus.canClaim ? (
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
                    style={{ justifyContent: "space-between", display: "flex" }}
                  >
                    <span style={{ fontWeight: 950 }}>{claimLoading ? "…" : `🎁 Claim`}</span>
                    <span className="mutedSmall">{fmt(giftStatus.remaining)}</span>
                  </button>
                ) : (
                  <button type="button" className="btnGhostSmall" onClick={openSub} style={{ justifyContent: "space-between", display: "flex" }}>
                    <span style={{ fontWeight: 950 }}>🎁 Subs offerts</span>
                    <span className="mutedSmall">{fmt(giftStatus.remaining)}</span>
                  </button>
                )
              ) : null}

              <button type="button" className="btnGhostSmall" onClick={openChest} style={{ justifyContent: "space-between", display: "flex" }}>
                <span style={{ fontWeight: 950 }}>
                  🎁 Coffre{chest.chestLoading ? "…" : chest.chestBalance > 0 ? ` (${chest.chestBalance})` : ""}
                </span>
                <span className="mutedSmall">Ouvrir</span>
              </button>

              {isOwner && !chest.chestHasOpen ? (
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={chest.ownerLoading || !streamer.isLive}
                  onClick={chest.open}
                  style={{ justifyContent: "space-between", display: "flex" }}
                  title={!streamer.isLive ? "Stream offline" : "Ouvre 2 minutes (fermeture auto)"}
                >
                  <span style={{ fontWeight: 950 }}>{chest.ownerLoading ? "…" : "Ouvrir coffre"}</span>
                  <span className="mutedSmall">{streamer.isLive ? "2 min" : "Offline"}</span>
                </button>
              ) : null}

              {!isOwner && chest.chestHasOpen ? (
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={chest.joinLoading || chest.alreadyJoined}
                  onClick={chest.join}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>
                    {chest.alreadyJoined ? "✅ Inscrit" : chest.joinLoading ? "…" : "Participer"}
                  </span>
                  <span className="mutedSmall">{chest.alreadyJoined ? "OK" : "Go"}</span>
                </button>
              ) : null}

              {isOwner ? (
                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => {
                    if (!token) return setLoginOpen(true);
                    setHostError(null);
                    setHostOpen(true);
                    setActionsOpen(false);
                  }}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span style={{ fontWeight: 950 }}>📺 Host</span>
                  <span className="mutedSmall">Gérer</span>
                </button>
              ) : null}

              <button
                type="button"
                className="btnGhostSmall"
                onClick={() => {
                  setActionsOpen(false);
                  enterCinema();
                }}
                style={{ justifyContent: "space-between", display: "flex" }}
              >
                <span style={{ fontWeight: 950 }}>⛶ Plein écran</span>
                <span className="mutedSmall">Cinéma</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

    if (cinema) {
      content = (
        <>
          <div
            className="cinemaRoot"
            style={{
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100dvh",
              minHeight: "100vh",
              zIndex: 9999,
              background: "rgba(35, 12, 60, 1)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              className="cinemaStage"
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: "stretch",
                justifyContent: "stretch",
              }}
            >
              <div
                className="cinemaPlayerCard"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  overflow: "hidden",
                  borderRadius: 0,
                }}
              >
                <div style={{ flex: 1, minHeight: 0, display: "flex" }}>{PlayerBlock}</div>
              </div>
            </div>

            <div
              className="cinemaTopBar"
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                right: 10,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                zIndex: 2,
                pointerEvents: "auto",
              }}
            >
              <button className="btnGhostSmall" type="button" onClick={leaveCinema}>
                ✕ Quitter
              </button>

              <button className="btnPrimarySmall" type="button" onClick={openCinemaChat} title="Ouvrir le chat">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <ChatIcon /> Chat
                </span>
              </button>
            </div>

            {chatOpen ? (
              <div className="chatSheetBackdrop" onClick={closeCinemaChat} role="presentation">
                <div
                  className="chatSheet"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  style={
                    isLandscape
                      ? {
                          width: "min(460px, 56vw)",
                          maxWidth: "92vw",
                          height: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
                          maxHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
                          alignSelf: "stretch",
                          marginLeft: "auto",
                          marginRight: 10,
                          marginTop: 10,
                          marginBottom: 10,
                          borderRadius: 18,
                          display: "flex",
                          flexDirection: "column",
                          overflow: "hidden",
                        }
                      : {
                          maxWidth: 560,
                          display: "flex",
                          flexDirection: "column",
                          overflow: "hidden",
                        }
                  }
                >
                  <div
                    className="chatSheetTop"
                    style={{
                      padding: isLandscape ? "10px 12px" : undefined,
                      minHeight: isLandscape ? 44 : undefined,
                    }}
                  >
                    <div style={{ fontWeight: 950 }}>{isLandscape ? "Chat" : ""}</div>
                    <button className="iconBtn" onClick={closeCinemaChat} type="button" aria-label="Fermer">
                      ✕
                    </button>
                  </div>

                  <div
                    className="chatSheetBody"
                    style={{
                      padding: 0,
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    {/* ✅ IMPORTANT: on SUPPRIME le transform: scale() (source de zoom/autosize) */}
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                      }}
                    >
                      <ChatPanel
                        slug={String(slug || "")}
                        onRequireLogin={() => setLoginOpen(true)}
                        compact
                        autoFocus={false}
                        onFollowsCount={handleFollowsCount}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
        </>
      );
    } else {
      // NORMAL view (inchangé)
      content = (
        <div
          className="streamPage streamPageMobile"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingBottom: "calc(88px + env(safe-area-inset-bottom))",
          }}
        >
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

          {hostedBy ? (
            <div className="panel" style={{ marginTop: 0, padding: 10 }}>
              <div className="mutedSmall">
                📺 Hosté par <strong style={{ color: "rgba(255,255,255,0.92)" }}>{hostedBy}</strong>
              </div>
            </div>
          ) : null}

          {!isOwner && hostTargetSlug && hostTargetIsLive ? (
            <div className="panel" style={{ marginTop: 0, padding: 10 }}>
              <div className="mutedSmall">
                📺 Chaîne hostée → redirection vers{" "}
                <strong style={{ color: "rgba(255,255,255,0.92)" }}>
                  {hostTargetDisplayName ? hostTargetDisplayName : hostTargetSlug}
                </strong>
                …
              </div>
            </div>
          ) : null}

          {/* PLAYER */}
          <div className="panel" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
            {PlayerBlock}
          </div>

          {/* PROFILE ROW */}
          <div
            className="panel"
            style={{
              marginTop: 0,
              padding: 12,
              borderRadius: 18,
              background: "linear-gradient(135deg, rgba(126,76,179,0.16), rgba(63,86,203,0.10))",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.22)",
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                }}
              >
                {avatarUrl ? (
                  <img src={String(avatarUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontWeight: 1000, opacity: 0.92 }}>{initials}</span>
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    minWidth: 0,
                    maxWidth: "100%",
                  }}
                >
                  {showStar ? (
                    <span style={{ ...badgeStyle, padding: "4px 7px", fontSize: 12, fontWeight: 950, lineHeight: 1 }}>
                      ★
                    </span>
                  ) : null}

                  <div
                    style={{
                      fontWeight: 1000,
                      fontSize: 15,
                      lineHeight: 1.05,
                      minWidth: 0,
                      flex: "1 1 auto",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                    title={displayName}
                  >
                    {displayName}
                  </div>
                </div>

                {typeof followsCount === "number" ? (
                  <div className="mutedSmall" style={{ opacity: 0.9, fontWeight: 850, lineHeight: 1.1 }}>
                    {fmt(followsCount)} abonnés
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
                <button
                  type="button"
                  className={isFollowing ? "btnGhostSmall" : "btnPrimarySmall"}
                  disabled={followLoading}
                  onClick={() => toggleFollow()}
                  title={isFollowing ? "Suivi" : "Suivre"}
                  style={{ ...iconBtn(), padding: "9px 11px" }}
                >
                  {followLoading ? "…" : isFollowing ? "✓" : "Suivre"}
                </button>

                <button type="button" className="btnPrimarySmall" onClick={openSub} style={iconBtn()} title="Sub">
                  SUB
                </button>

                <button type="button" className="btnGhostSmall" onClick={() => setActionsOpen(true)} style={iconBtn()} title="Plus">
                  ⋯
                </button>
              </div>
            </div>

            <div
              className="mutedSmall"
              style={{
                marginTop: 10,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ ...smallBadge(), padding: "6px 10px", fontSize: 12, fontWeight: 900 }}>👁️ {fmt(viewers)}</span>
              <span style={{ ...smallBadge(), padding: "6px 10px", fontSize: 12, fontWeight: 900 }}>
                ⏱️ <LiveDurationText isLive={streamer.isLive} startedAtMs={streamer.liveStartedAtMs} />
              </span>

              {giftStatus?.myClaimed ? (
                <span
                  style={{
                    ...smallBadge(),
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 900,
                    background: "rgba(20,255,170,0.07)",
                    borderColor: "rgba(20,255,170,0.20)",
                  }}
                >
                  ✅ Sub offert
                </span>
              ) : null}
            </div>
          </div>

          {/* TABS ROW */}
          <div
            className="panel"
            style={{
              marginTop: 0,
              padding: 10,
              borderRadius: 18,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div ref={tabRowRef} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                ref={(el) => {
                  tabBtnRefs.current.chat = el;
                }}
                type="button"
                style={pillBase(tab === "chat")}
                onClick={() => goTab("chat")}
              >
                Chat
              </button>

              <button
                ref={(el) => {
                  tabBtnRefs.current.about = el;
                }}
                type="button"
                style={pillBase(tab === "about")}
                onClick={() => goTab("about")}
              >
                À propos
              </button>

              <button
                ref={(el) => {
                  tabBtnRefs.current.vod = el;
                }}
                type="button"
                style={pillBase(tab === "vod")}
                onClick={() => goTab("vod")}
              >
                Rediffusions
              </button>

              <button
                ref={(el) => {
                  tabBtnRefs.current.clips = el;
                }}
                type="button"
                style={pillBase(tab === "clips")}
                onClick={() => goTab("clips")}
              >
                Clips
              </button>

              <button
                ref={(el) => {
                  tabBtnRefs.current.agenda = el;
                }}
                type="button"
                style={pillBase(tab === "agenda")}
                onClick={() => goTab("agenda")}
              >
                Agenda
              </button>
            </div>
          </div>

          {/* CONTENT (swipe + anim) */}
          <div
            onTouchStart={onSwipeStart}
            onTouchMove={onSwipeMove}
            onTouchEnd={onSwipeEnd}
            style={{
              touchAction: "pan-y",
            }}
          >
            <div style={contentAnimStyle}>
              {tabView === "chat" ? (
                <div
                  className="panel"
                  style={{
                    padding: 0,
                    borderRadius: 18,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    ...chatHeightStyle,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.16)",
                    }}
                  >
                    <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>Chat</div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {giftStatus?.myClaimed ? <span style={smallBadge()}>✅ Sub offert</span> : null}
                      <button
                        type="button"
                        className="btnGhostSmall"
                        onClick={enterCinema}
                        style={{ borderRadius: 12, padding: "8px 10px", fontWeight: 950 }}
                        title="Plein écran"
                      >
                        ⛶
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, minHeight: 0 }}>
                    <ChatPanel
                      slug={String(slug || "")}
                      onRequireLogin={() => setLoginOpen(true)}
                      compact
                      autoFocus={false}
                      onFollowsCount={handleFollowsCount}
                    />
                  </div>
                </div>
              ) : (
                <div className="panel" style={{ padding: 12, borderRadius: 18 }}>
                  {tabView === "about" && slug ? <AboutTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
                  {tabView === "clips" && slug ? (
                    <ClipsTab slug={String(slug)} token={token} isOwner={isOwner} onRequireLogin={() => setLoginOpen(true)} />
                  ) : null}
                  {tabView === "vod" && slug ? <VodTab slug={String(slug)} /> : null}
                  {tabView === "agenda" && slug ? <AgendaTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
                </div>
              )}
            </div>
          </div>

          {ActionsSheet}

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
                  headers: {
                    Authorization: `Bearer ${token}`,
                    ...(useTicket ? { "Content-Type": "application/json" } : {}),
                  },
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
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
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

          {/* Host modal (inchangé) */}
          {hostOpen ? (
            <div className="chatSheetBackdrop" onClick={() => setHostOpen(false)} role="presentation" style={{ zIndex: 80 }}>
              <div className="chatSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 560 }}>
                <div className="chatSheetTop">
                  <div style={{ fontWeight: 950 }}>Host</div>
                  <button className="iconBtn" onClick={() => setHostOpen(false)} type="button" aria-label="Fermer">
                    ✕
                  </button>
                </div>

                <div className="chatSheetBody" style={{ padding: 16 }}>
                  {hostTargetSlug ? (
                    <div className="panel" style={{ marginBottom: 12 }}>
                      <div className="mutedSmall">Host actuel</div>
                      <div style={{ fontWeight: 950, marginTop: 4 }}>
                        {hostTargetDisplayName ? hostTargetDisplayName : `@${hostTargetSlug}`}
                      </div>

                      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btnPrimarySmall"
                          disabled={hostBusy}
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
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <input
                      value={hostQuery}
                      onChange={(e) => setHostQuery(e.target.value)}
                      placeholder="Rechercher un streamer live…"
                      style={{
                        flex: 1,
                        padding: "12px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontWeight: 800,
                      }}
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
                          const arr = (lives as any[]).filter(
                            (x) => String(x.slug || "").toLowerCase() !== String(slug || "").toLowerCase()
                          );
                          setHostLives(arr);
                        } catch (e: any) {
                          setHostError(String(e?.message || "Erreur"));
                        } finally {
                          setHostBusy(false);
                        }
                      }}
                    >
                      {hostBusy ? "…" : "Refresh"}
                    </button>
                  </div>

                  {hostError ? (
                    <div className="mutedSmall" style={{ marginBottom: 10, color: "rgba(255,90,90,0.95)" }}>
                      {hostError}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(hostLives || [])
                      .filter((x) => {
                        const q = hostQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          String(x.displayName || x.slug || "").toLowerCase().includes(q) ||
                          String(x.slug || "").toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 30)
                      .map((x) => (
                        <button
                          key={String(x.id || x.slug)}
                          type="button"
                          className="btnGhostSmall"
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
                          style={{ justifyContent: "space-between", display: "flex" }}
                        >
                          <span style={{ fontWeight: 950 }}>{x.displayName || `@${x.slug}`}</span>
                          <span className="mutedSmall" style={{ opacity: 0.85 }}>
                            {Number(x.viewers || 0)} viewers
                          </span>
                        </button>
                      ))}
                  </div>

                  {!hostLives?.length ? (
                    <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8 }}>
                      Clique “Refresh” pour charger la liste des lives.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
        </div>
      );
    }
  }

  // wrapper unique (hooks OK)
  return <>{content}</>;
}
