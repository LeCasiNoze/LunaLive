// web/src/pages/streamer/StreamerPage.tsx
import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { watchHeartbeat, subscribeStreamer, me, getLives } from "../../lib/api";
import { DlivePlayer } from "../../components/DlivePlayer";
import { ChatPanel } from "../../components/ChatPanel";
import { LoginModal } from "../../components/LoginModal";
import { SubModal } from "../../components/SubModal";
import { useAuth } from "../../auth/AuthProvider";

import { EyeIcon, ChatIcon, BellIcon } from "./components/icons";
import { LiveDurationText, getAnonId } from "./utils";
import { useResponsive } from "./hooks/useResponsive";
import { useCinema } from "./hooks/useCinema";
import { useStreamerData } from "./hooks/useStreamerData";
import { useChest } from "./hooks/useChest";
import { ChestToast } from "./components/ChestToast";
import { ChestModal } from "./components/ChestModal";

// ✅ NEW tabs
import { AboutTab } from "./tabs/AboutTab";
import { VodTab } from "./tabs/VodTab";
import { AgendaTab } from "./tabs/AgendaTab";
import { ClipsTab } from "./tabs/ClipsTab";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type TabKey = "about" | "clips" | "vod" | "agenda";

type GiftStatus = {
  remaining: number;
  canClaim: boolean;
  myClaimed: boolean;
};

function fmt(n: any) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString() : "0";
}

export default function StreamerPage() {
  const { slug } = useParams();
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = auth?.user?.role ?? "guest";
  const myUserId = auth?.user?.id != null ? Number(auth.user.id) : null;

  const navigate = useNavigate();
  const location = useLocation();
  const hostedBy = React.useMemo(() => new URLSearchParams(location.search).get("hostedBy"), [location.search]);

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("about");
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  // ✅ Sub modal state
  const [subOpen, setSubOpen] = React.useState(false);
  const [subLoading, setSubLoading] = React.useState(false);
  const [subError, setSubError] = React.useState<string | null>(null);

  // ✅ Gift subs state
  const [giftLoading, setGiftLoading] = React.useState(false);
  const [giftError, setGiftError] = React.useState<string | null>(null);
  const [giftStatus, setGiftStatus] = React.useState<GiftStatus | null>(null);
  const [claimLoading, setClaimLoading] = React.useState(false);
  const [claimError, setClaimError] = React.useState<string | null>(null);

  // ✅ HOST state (owner only)
  const [hostOpen, setHostOpen] = React.useState(false);
  const [hostBusy, setHostBusy] = React.useState(false);
  const [hostError, setHostError] = React.useState<string | null>(null);
  const [hostQuery, setHostQuery] = React.useState("");
  const [hostLives, setHostLives] = React.useState<any[]>([]);
  const [hostOverride, setHostOverride] = React.useState<{ slug: string | null; displayName: string | null } | null>(null);

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

  const handleFollowsCount = React.useCallback(
    (n: number) => {
      setFollowsCount(n);
    },
    [setFollowsCount]
  );

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

  // ✅ viewer redirect if host active
  React.useEffect(() => {
    if (!slug) return;
    if (!streamer) return;
    if (isOwner) return;
    if (hostedBy) return;

    if (!hostTargetSlug || !hostTargetIsLive) return;
    if (String(hostTargetSlug).toLowerCase() === String(slug).toLowerCase()) return;

    const t = window.setTimeout(() => {
      navigate(`/s/${encodeURIComponent(String(hostTargetSlug))}?hostedBy=${encodeURIComponent(String(slug))}`, {
        replace: true,
      });
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
  // ✅ Bridge: actions du toast "coffre" (ui:toast -> handlers)
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

  // ✅ PC sizing: chat = player + metaBar
  const playerWrapRef = React.useRef<HTMLDivElement | null>(null);
  const metaWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [leftStackH, setLeftStackH] = React.useState<number>(0);

  const measureLeftStack = React.useCallback(() => {
    const a = playerWrapRef.current?.getBoundingClientRect?.().height ?? 0;
    const b = metaWrapRef.current?.getBoundingClientRect?.().height ?? 0;
    const total = Math.max(0, Math.round(a + b));
    if (total && Math.abs(total - leftStackH) > 2) setLeftStackH(total);
    if (!total && leftStackH !== 0) setLeftStackH(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftStackH]);

  React.useLayoutEffect(() => {
    // on mount + after streamer changes
    measureLeftStack();
  }, [measureLeftStack, streamer?.isLive, streamer?.title, streamer?.displayName]);

  React.useEffect(() => {
    let ro: ResizeObserver | null = null;

    const RO = (window as any).ResizeObserver as (new (cb: () => void) => ResizeObserver) | undefined;

    if (RO) {
      ro = new RO(() => measureLeftStack());
      if (playerWrapRef.current) ro.observe(playerWrapRef.current);
      if (metaWrapRef.current) ro.observe(metaWrapRef.current);
    }

    const onResize = () => measureLeftStack();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      try {
        ro?.disconnect();
      } catch {}
    };
  }, [measureLeftStack]);

  if (loading) return <div className="panel">Chargement…</div>;
  if (!streamer) return <div className="panel">Streamer introuvable</div>;

  const showMiniChat = isMobile && isPortrait && !cinema;

  const viewersFromApi = streamer.viewers;
  const viewers = streamer.isLive ? (liveViewersNow ?? viewersFromApi) : 0;

  const myRubis = Number(auth?.user?.rubis ?? 0);
  const SUB_PRICE_RUBIS = 500;

  const followersInline = followsCount == null ? "" : ` (${fmt(followsCount)} followers)`;

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
          {/* overlay full-size */}
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
                    autoFocus={!isMobile}
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

  return (
    <div className="streamPage">
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

      {/* ✅ mini info (host) — compact */}
      {hostedBy ? (
        <div className="panel" style={{ marginBottom: 10, padding: 10 }}>
          <div className="mutedSmall">
            📺 Hosté par <strong style={{ color: "rgba(255,255,255,0.92)" }}>{hostedBy}</strong>
          </div>
        </div>
      ) : null}

      {!isOwner && hostTargetSlug && hostTargetIsLive ? (
        <div className="panel" style={{ marginBottom: 10, padding: 10 }}>
          <div className="mutedSmall">
            📺 Chaîne hostée → redirection vers{" "}
            <strong style={{ color: "rgba(255,255,255,0.92)" }}>
              {hostTargetDisplayName ? hostTargetDisplayName : hostTargetSlug}
            </strong>
            …
          </div>
        </div>
      ) : null}

      {/* Stage */}
      <div className="streamGrid">
        <div className="streamMain">
          <div ref={playerWrapRef}>{PlayerBlock}</div>

          {/* ✅ meta bar UNDER stream split in 2 panels */}
          <div ref={metaWrapRef} style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "stretch", justifyContent: "space-between" }}>
              {/* LEFT: stream info */}
              <div
                className="panel"
                style={{
                  marginTop: 0,
                  width: "fit-content",
                  maxWidth: "100%",
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  background:
                    "linear-gradient(135deg, rgba(126,76,179,0.16), rgba(63,86,203,0.10))",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Title line with color accents */}
                  <div style={{ fontWeight: 950, fontSize: 18, lineHeight: 1.15 }}>
                    <span style={{ color: "rgba(255,255,255,0.92)" }}>{streamer.title}</span>
                    {streamer.displayName ? (
                      <>
                        <span style={{ opacity: 0.55 }}> — </span>
                        <span
                          style={{
                            background: "linear-gradient(135deg, rgba(180,140,255,0.95), rgba(110,170,255,0.92))",
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                            fontWeight: 1000,
                          }}
                        >
                          {streamer.displayName}
                        </span>
                        {followsCount != null ? (
                          <span style={{ opacity: 0.85, fontWeight: 900, color: "rgba(255,255,255,0.82)" }}>
                            {followersInline}
                          </span>
                        ) : null}
                      </>
                    ) : followsCount != null ? (
                      <span style={{ opacity: 0.85, fontWeight: 900, color: "rgba(255,255,255,0.82)" }}>
                        {followersInline}
                      </span>
                    ) : null}
                  </div>

                  <div className="mutedSmall" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.06)",
                        fontWeight: 900,
                        color: "rgba(255,255,255,0.86)",
                      }}
                    >
                      <span style={{ opacity: 0.9 }}>
                        <EyeIcon />
                      </span>
                      <span>{fmt(viewers)} viewers</span>
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.06)",
                        fontWeight: 900,
                        color: "rgba(255,255,255,0.86)",
                      }}
                    >
                      <span style={{ opacity: 0.9 }}>⏱️</span>
                      <span>
                        <LiveDurationText isLive={streamer.isLive} startedAtMs={streamer.liveStartedAtMs} />
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* RIGHT: interactions */}
              <div
                className="panel"
                style={{
                  marginTop: 0,
                  padding: 14,
                  width: "fit-content",
                  maxWidth: "100%",
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 92,
                }}
              >
                {claimError ? (
                  <div className="mutedSmall" style={{ marginBottom: 8, color: "rgba(255,90,90,0.95)" }}>
                    {claimError}
                  </div>
                ) : null}

                <div
                  className="streamMetaActionsRow"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {/* FOLLOW */}
                  <button
                    type="button"
                    className={isFollowing ? "btnGhostSmall" : "btnPrimarySmall"}
                    disabled={followLoading}
                    onClick={toggleFollow}
                    title={isFollowing ? "Tu suis déjà" : "Suivre"}
                    style={{
                      borderRadius: 14,
                      padding: "9px 12px",
                      fontWeight: 950,
                      boxShadow: isFollowing ? "none" : "0 10px 28px rgba(0,0,0,0.28)",
                    }}
                  >
                    {followLoading ? "…" : isFollowing ? "✅ Suivi" : "➕ Suivre"}
                  </button>

                  {/* SUB */}
                  <button
                    type="button"
                    className="btnPrimarySmall"
                    disabled={followLoading}
                    onClick={() => {
                      if (!token) return setLoginOpen(true);
                      setSubError(null);
                      setGiftError(null);
                      setSubOpen(true);
                    }}
                    style={{ borderRadius: 14, padding: "9px 12px", fontWeight: 950 }}
                    title="S'abonner"
                  >
                    💎 Sub
                  </button>

                  {/* CHEST */}
                  <button
                    type="button"
                    className="btnGhostSmall"
                    onClick={() => {
                      chest.setChestError(null);
                      chest.setChestModalOpen(true);
                    }}
                    title="Voir le coffre"
                    style={{ borderRadius: 14, padding: "9px 12px", fontWeight: 950 }}
                  >
                    🎁 Coffre{chest.chestLoading ? "…" : chest.chestBalance > 0 ? ` (${chest.chestBalance})` : ""}
                  </button>

                  {/* Owner: open chest */}
                  {isOwner && !chest.chestHasOpen ? (
                    <button
                      type="button"
                      className="btnPrimarySmall"
                      disabled={chest.ownerLoading || !streamer.isLive}
                      onClick={chest.open}
                      title={!streamer.isLive ? "Stream offline" : "Ouvre 2 minutes (fermeture auto)"}
                      style={{ borderRadius: 14, padding: "9px 12px", fontWeight: 950 }}
                    >
                      {chest.ownerLoading ? "…" : "Ouvrir coffre"}
                    </button>
                  ) : null}

                  {/* Viewer: join chest */}
                  {!isOwner && chest.chestHasOpen ? (
                    <button
                      type="button"
                      className="btnPrimarySmall"
                      disabled={chest.joinLoading || chest.alreadyJoined}
                      onClick={chest.join}
                      style={{ borderRadius: 14, padding: "9px 12px", fontWeight: 950 }}
                    >
                      {chest.alreadyJoined ? "✅ Inscrit" : chest.joinLoading ? "…" : "Participer"}
                    </button>
                  ) : null}

                  {/* Gift subs */}
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
                            const r = await fetch(
                              `${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs/claim`,
                              { method: "POST", headers: { Authorization: `Bearer ${token}` } }
                            ).then((x) => x.json());
                            if (!r?.ok) throw new Error(String(r?.error || "Erreur"));
                            await refreshMeIfPossible();
                            await fetchGiftStatus();
                          } catch (e: any) {
                            setClaimError(String(e?.message || "Erreur"));
                          } finally {
                            setClaimLoading(false);
                          }
                        }}
                        title="Claim un sub offert"
                        style={{ borderRadius: 14, padding: "9px 12px", fontWeight: 950 }}
                      >
                        {claimLoading ? "…" : `🎁 Claim (${giftStatus.remaining})`}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btnGhostSmall"
                        onClick={() => {
                          if (!token) return setLoginOpen(true);
                          setSubOpen(true);
                        }}
                        title="Des subs sont disponibles"
                        style={{ borderRadius: 14, padding: "9px 12px", fontWeight: 950 }}
                      >
                        🎁 Subs offerts ({giftStatus.remaining})
                      </button>
                    )
                  ) : null}

                  {/* HOST */}
                  {isOwner ? (
                    <button
                      type="button"
                      className="btnGhostSmall"
                      onClick={() => {
                        if (!token) return setLoginOpen(true);
                        setHostError(null);
                        setHostOpen(true);
                      }}
                      title="Host quelqu’un"
                      style={{ borderRadius: 14, padding: "9px 12px", fontWeight: 950 }}
                    >
                      📺 Host
                    </button>
                  ) : null}

                  {/* NOTIF */}
                  {isFollowing ? (
                    <button
                      type="button"
                      className="btnGhostSmall"
                      disabled={followLoading}
                      onClick={toggleNotify}
                      style={{
                        borderRadius: 14,
                        padding: "9px 12px",
                        fontWeight: 950,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      title="Notifications"
                    >
                      <BellIcon on={notifyEnabled} /> {notifyEnabled ? "Notif" : "Muet"}
                    </button>
                  ) : null}

                  {/* FULLSCREEN (in group) */}
                  <button
                    type="button"
                    className="btnGhostSmall"
                    onClick={enterCinema}
                    title="Plein écran"
                    style={{
                      borderRadius: 14,
                      padding: "9px 12px",
                      fontWeight: 950,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    ⛶ Plein écran
                  </button>
                </div>

                {giftStatus?.myClaimed ? (
                  <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.92 }}>
                    ✅ Sub offert claim
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Mobile mini chat (unchanged for later) */}
          {showMiniChat ? (
            <div className="panel mobileMiniChat" style={{ padding: 0, marginTop: 12 }}>
              <div className="streamChatHeader">
                <div className="streamChatHeaderLeft">
                  <div className="mutedSmall" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ opacity: 0.9 }}>
                      <EyeIcon />
                    </span>
                    <span>{fmt(viewers)} viewer</span>
                  </div>
                </div>

                <div className="mutedSmall">
                  rôle : <strong style={{ color: "rgba(255,255,255,0.9)" }}>{String(myRole)}</strong>
                </div>
              </div>

              <div className="streamChatBody">
                <ChatPanel slug={String(slug || "")} onRequireLogin={() => setLoginOpen(true)} compact onFollowsCount={handleFollowsCount} />
              </div>
            </div>
          ) : null}
        </div>

        {/* ✅ Chat fixed height = (player + meta bar) */}
        <aside
          className="panel streamChat streamChatFixed"
          style={{
            padding: 0,
            height: leftStackH > 0 ? leftStackH : undefined,
            maxHeight: leftStackH > 0 ? leftStackH : undefined,
          }}
        >
          <div className="streamChatHeader" style={{ justifyContent: "space-between" }}>
            <div className="streamChatHeaderLeft">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>
                  {streamer.displayName ? streamer.displayName : ""}
                </div>
              </div>
            </div>

            <div style={{ paddingRight: 10 }} />
          </div>

          <div className="streamChatBody" style={{ flex: 1, minHeight: 0 }}>
            <ChatPanel slug={String(slug || "")} onRequireLogin={() => setLoginOpen(true)} onFollowsCount={handleFollowsCount} />
          </div>
        </aside>
      </div>

      {/* Bottom tabs */}
      <div className="panel streamBottomPanel">
        <div className="streamTabsRow">
          <button type="button" className={`streamTabBtn ${tab === "about" ? "active" : ""}`} onClick={() => setTab("about")}>
            À propos
          </button>
          <button type="button" className={`streamTabBtn ${tab === "clips" ? "active" : ""}`} onClick={() => setTab("clips")}>
            Clip
          </button>
          <button type="button" className={`streamTabBtn ${tab === "vod" ? "active" : ""}`} onClick={() => setTab("vod")}>
            VOD
          </button>
          <button type="button" className={`streamTabBtn ${tab === "agenda" ? "active" : ""}`} onClick={() => setTab("agenda")}>
            Agenda
          </button>
        </div>

        <div className="streamTabContent">
          {tab === "about" && slug ? <AboutTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}

          {tab === "clips" && slug ? (
            <ClipsTab slug={String(slug)} token={token} isOwner={isOwner} onRequireLogin={() => setLoginOpen(true)} />
          ) : null}

          {tab === "vod" && slug ? <VodTab slug={String(slug)} /> : null}

          {tab === "agenda" && slug ? <AgendaTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
        </div>
      </div>

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
        loading={subLoading}
        error={subError}
        onGoShop={() => {
          setSubOpen(false);
          window.location.href = "/shop";
        }}
        onPayRubis={async () => {
          if (!token || !slug) return;
          setSubLoading(true);
          setSubError(null);
          try {
            const r: any = await subscribeStreamer(String(slug), token);
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
        onPayGiftSubs={async (count) => {
          if (!token || !slug) return;
          setGiftLoading(true);
          setGiftError(null);
          try {
            const r = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/gift-subs`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ count }),
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

      {/* ✅ HOST modal (unchanged) */}
      {hostOpen ? (
        <div className="chatSheetBackdrop" onClick={() => setHostOpen(false)} role="presentation" style={{ zIndex: 60 }}>
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
