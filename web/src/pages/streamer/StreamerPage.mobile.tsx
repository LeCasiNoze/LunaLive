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

type MobileTabKey = "chat" | "about" | "vod" | "clips" | "agenda";

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

  if (!endRaw) return status === "active" || status === "trialing";

  const endMs =
    typeof endRaw === "number"
      ? endRaw * (endRaw > 1e12 ? 1 : 1000)
      : new Date(String(endRaw)).getTime();

  return (status === "active" || status === "trialing") && Number.isFinite(endMs) && endMs > now;
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

  // array: [{plan_code,status,...}, ...]
  if (Array.isArray(x)) {
    for (const s of x) addPlan(out, s?.plan_code ?? s?.planCode, isActiveSubEntry(s));
    return out;
  }

  // object map: { viewer: {...}, streamer: {...} }
  if (typeof x === "object") {
    if (x.viewer || x.streamer) {
      addPlan(out, "viewer", isActiveSubEntry(x.viewer));
      addPlan(out, "streamer", isActiveSubEntry(x.streamer));
      return out;
    }

    // shape: { plans: {...} } ou { subscriptions: {...} }
    if (x.plans) return getActivePlansFrom(x.plans);
    if (x.subscriptions) return getActivePlansFrom(x.subscriptions);

    // single entry: { plan_code:'viewer', status:'active', ... }
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

  // Onglet principal façon Dlive
  const [tab, setTab] = React.useState<MobileTabKey>("chat");

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

  if (loading) return <div className="panel">Chargement…</div>;
  if (!streamer) return <div className="panel">Streamer introuvable</div>;

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

  // Cinema mode (plein écran)
  if (cinema) {
    return (
      <>
        <div className="cinemaRoot">
          <div className="cinemaStage">
            <div className="cinemaPlayerCard">{PlayerBlock}</div>
          </div>

          <div className="cinemaTopBar">
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
              <div className="chatSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="chatSheetTop">
                  <div style={{ fontWeight: 950 }}></div>
                  <button className="iconBtn" onClick={closeCinemaChat} type="button" aria-label="Fermer">
                    ✕
                  </button>
                </div>

                <div className="chatSheetBody">
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
          ) : null}
        </div>

        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    );
  }

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

    // ✅ Avatar (fallback safe + support plein de shapes)
    const rawAvatar =
    (streamer as any)?.avatarUrl ??
    (streamer as any)?.avatar_url ??
    (streamer as any)?.avatar ??
    (streamer as any)?.profilePicUrl ??
    (streamer as any)?.profile_pic_url ??
    (streamer as any)?.profile?.avatarUrl ??
    (streamer as any)?.user?.avatarUrl ??
    null;

    const avatarUrl = (() => {
    const s = String(rawAvatar || "").trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    // si jamais ton API renvoie un chemin relatif
    if (s.startsWith("/")) return `${apiBase()}${s}`;
    return s;
    })();

    const displayName = streamer.displayName ? String(streamer.displayName) : `@${String(slug || "")}`;
    const initials = String(displayName || "S").replace(/^@/, "").trim().slice(0, 1).toUpperCase();

// ✅ Star logic (user-centric, SANS hook)
// Règles demandées:
// - bleu si abo streamer
// - violet si viewer + streamer
// - sinon pas d’étoile

// Le "compte streamer" est un user -> on essaye les clés les plus probables
const streamerUser =
  (streamer as any)?.user ??
  (streamer as any)?.owner ??
  (streamer as any)?.ownerUser ??
  (streamer as any)?.account ??
  null;

// On lit en priorité `user_subscriptions` (comme /me)
let ownerPlans: ActivePlans = { viewer: false, streamer: false };
ownerPlans = mergePlans(ownerPlans, getActivePlansFrom(streamerUser?.user_subscriptions));
ownerPlans = mergePlans(ownerPlans, getActivePlansFrom(streamerUser?.userSubscriptions));

// Fallbacks au cas où ton API renvoie encore autre chose
ownerPlans = mergePlans(ownerPlans, getActivePlansFrom((streamer as any)?.user_subscriptions));
ownerPlans = mergePlans(ownerPlans, getActivePlansFrom((streamer as any)?.ownerSubscriptions));
ownerPlans = mergePlans(ownerPlans, getActivePlansFrom((streamer as any)?.owner_subscriptions));

type StarKind = "none" | "streamer" | "both";
const starKind: StarKind =
  ownerPlans.viewer && ownerPlans.streamer ? "both" : ownerPlans.streamer ? "streamer" : "none";

const showStar = starKind !== "none";

const badgeStyle: React.CSSProperties =
  starKind === "streamer"
    ? { ...smallBadge(), borderColor: "rgba(110,185,255,0.70)", background: "rgba(90,170,255,0.18)" } // bleu
    : { ...smallBadge(), borderColor: "rgba(180,120,255,0.75)", background: "rgba(170,110,255,0.18)" }; // violet

  // Hauteur chat: fixe + scroll interne (objectif ~8 messages visibles)
  const chatHeightStyle: React.CSSProperties = {
    height: "min(52vh, 520px)",
    minHeight: 330,
  };

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
                <span style={{ fontWeight: 950 }}>{chest.alreadyJoined ? "✅ Inscrit" : chest.joinLoading ? "…" : "Participer"}</span>
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

  return (
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

      {/* host banners */}
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
            <strong style={{ color: "rgba(255,255,255,0.92)" }}>{hostTargetDisplayName ? hostTargetDisplayName : hostTargetSlug}</strong>…
          </div>
        </div>
      ) : null}

      {/* PLAYER */}
      <div className="panel" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
        {PlayerBlock}
      </div>

    {/* PROFILE ROW (avatar + name + followers + badge + actions compact) */}
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
    {/* Row 1: avatar + name block + actions */}
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Avatar */}
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

        {/* Name block (2 lines max, clean) */}
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
    <div
    style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4, // "collée" (mets 2 si tu veux encore plus serré)
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


      {/* Followers line (one clean line, never wraps into chaos) */}
      {typeof followsCount === "number" ? (
        <div className="mutedSmall" style={{ opacity: 0.9, fontWeight: 850, lineHeight: 1.1 }}>
          {fmt(followsCount)} abonnés
        </div>
      ) : null}
    </div>

    {/* Actions compact (never crush the text) */}
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
      <button
        type="button"
        className={isFollowing ? "btnGhostSmall" : "btnPrimarySmall"}
        disabled={followLoading}
        onClick={toggleFollow}
        title={isFollowing ? "Suivi" : "Suivre"}
        style={{ ...iconBtn(), padding: "9px 11px" }}
      >
        {followLoading ? "…" : isFollowing ? "✓" : "+"}
      </button>

      <button type="button" className="btnPrimarySmall" onClick={openSub} style={iconBtn()} title="Sub">
        💎
      </button>

      <button type="button" className="btnGhostSmall" onClick={() => setActionsOpen(true)} style={iconBtn()} title="Plus">
        ⋯
      </button>
    </div>
  </div>

  {/* Row 2: small stats chips (wrap nicely, smaller text, airy) */}
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
    <span style={{ ...smallBadge(), padding: "6px 10px", fontSize: 12, fontWeight: 900 }}>
      👁️ {fmt(viewers)}
    </span>
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

      {/* TABS ROW (Dlive-like) */}
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
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" style={pillBase(tab === "chat")} onClick={() => setTab("chat")}>
            Chat
          </button>
          <button type="button" style={pillBase(tab === "about")} onClick={() => setTab("about")}>
            À propos
          </button>
          <button type="button" style={pillBase(tab === "vod")} onClick={() => setTab("vod")}>
            Rediffusions
          </button>
          <button type="button" style={pillBase(tab === "clips")} onClick={() => setTab("clips")}>
            Clips
          </button>
          <button type="button" style={pillBase(tab === "agenda")} onClick={() => setTab("agenda")}>
            Agenda
          </button>

          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="mutedSmall" style={{ opacity: 0.85 }}>
              rôle : <strong style={{ color: "rgba(255,255,255,0.92)" }}>{String(myRole)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      {tab === "chat" ? (
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
          {/* Chat header mini */}
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

          {/* KEY: parent height fixed + minHeight:0 => scroll interne dans ChatPanel */}
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
          {tab === "about" && slug ? <AboutTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
          {tab === "clips" && slug ? <ClipsTab slug={String(slug)} token={token} isOwner={isOwner} onRequireLogin={() => setLoginOpen(true)} /> : null}
          {tab === "vod" && slug ? <VodTab slug={String(slug)} /> : null}
          {tab === "agenda" && slug ? <AgendaTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
        </div>
      )}

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
                  <div style={{ fontWeight: 950, marginTop: 4 }}>{hostTargetDisplayName ? hostTargetDisplayName : `@${hostTargetSlug}`}</div>

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
                      const arr = (lives as any[]).filter((x) => String(x.slug || "").toLowerCase() !== String(slug || "").toLowerCase());
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
                    return String(x.displayName || x.slug || "").toLowerCase().includes(q) || String(x.slug || "").toLowerCase().includes(q);
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
