// web/src/pages/streamer/StreamerPage.tsx
import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { watchHeartbeat, me, getLives } from "../../lib/api";
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

import StreamerPageMobile from "./StreamerPage.mobile";

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
 * Avatar resolver (comme mobile):
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
  const byUid = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;

  return direct || byUid;
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

function initialsOf(name: any) {
  const s = String(name || "").replace(/^@/, "").trim();
  return (s[0] || "S").toUpperCase();
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

/**
 * ✅ IMPORTANT
 * Wrapper qui choisit Mobile/Desktop.
 * Comme ça, en rotation fullscreen iOS (viewport change),
 * React ne casse pas l’ordre des hooks (unmount/remount au lieu de switcher branch).
 */
export default function StreamerPage() {
  const { isMobile } = useResponsive();
  return isMobile ? <StreamerPageMobile /> : <StreamerPageDesktop />;
}

/* =======================================================================================
   Desktop impl
   ======================================================================================= */

function StreamerPageDesktop() {
  const { slug } = useParams();
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = String(auth?.user?.role ?? "guest");
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

  // ✅ Side menu (desktop)
  const [actionsOpen, setActionsOpen] = React.useState(false);

  // ✅ Edit title modal (mods/owner/admin)
  const [editTitleOpen, setEditTitleOpen] = React.useState(false);
  const [editTitleDraft, setEditTitleDraft] = React.useState("");
  const [editTitleBusy, setEditTitleBusy] = React.useState(false);
  const [editTitleErr, setEditTitleErr] = React.useState<string | null>(null);
  const [, bump] = React.useState(0);

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
  const isAdmin = myRole === "admin";
  const isModLike = ["mod", "moderator", "streamer_mod", "streamer_moderator"].includes(myRole);
  const canEditTabs = isOwner || isAdmin;
  const canEditTitle = isOwner || isAdmin || isModLike;

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

  // ✅ PC sizing: chat = player + banner
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
    measureLeftStack();
  }, [measureLeftStack, streamer?.isLive, streamer?.title, streamer?.displayName, followsCount]);

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

  // ✅ tickets sub (via /me -> coupons.sub_ticket)
  const mySubTickets = Math.max(0, Math.floor(Number(auth?.user?.coupons?.sub_ticket ?? auth?.user?.tokens?.sub_ticket ?? 0)));

  const avatarUrl = pickStreamerAvatarUrlFromStreamer(streamer);
  const displayName = streamer.displayName ? String(streamer.displayName) : `@${String(slug || "")}`;
  const initials = initialsOf(displayName);

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
      // ✅ endpoint attendu côté API (à brancher si pas encore fait)
      const res = await fetch(`${apiBase()}/streamers/${encodeURIComponent(String(slug))}/title`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: next }),
      });

      // ✅ supporte 204 / body vide / body non-JSON
      const raw = await res.text();
      const r: any = raw ? (() => { try { return JSON.parse(raw); } catch { return { ok: res.ok }; } })() : { ok: res.ok };

      if (!res.ok || r?.ok === false) throw new Error(String(r?.error || "Erreur"));

      // mise à jour locale simple (sans dépendre du hook)
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
                  <ChatPanel slug={String(slug || "")} onRequireLogin={() => setLoginOpen(true)} compact autoFocus={!isMobile} onFollowsCount={handleFollowsCount} />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    );
  }

  // ✅ Desktop “banner” inspirée mobile: avatar + nom + followers + title, actions à droite
  const Banner = (
    <div
      className="panel"
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 18,
        background: "linear-gradient(135deg, rgba(126,76,179,0.16), rgba(63,86,203,0.10))",
        border: "1px solid rgba(255,255,255,0.12)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 48,
          height: 48,
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

      {/* Infos */}
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 950,
              fontSize: 18,
              lineHeight: 1.15,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={displayName}
          >
            <span
              style={{
                background: "linear-gradient(135deg, rgba(180,140,255,0.95), rgba(110,170,255,0.92))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                fontWeight: 1000,
              }}
            >
              {displayName}
            </span>
          </div>

          <span style={{ ...smallBadge(), padding: "6px 10px", fontSize: 12, fontWeight: 900 }}>
            <span style={{ opacity: 0.9 }}>
              <EyeIcon />
            </span>
            {fmt(viewers)}
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

        <div className="mutedSmall" style={{ opacity: 0.9, fontWeight: 850, lineHeight: 1.15, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {typeof followsCount === "number" ? <span>{fmt(followsCount)} abonnés</span> : null}
          <span style={{ opacity: 0.7 }}>•</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 720 }} title={String(streamer.title || "")}>
            {streamer.title}
          </span>
        </div>
      </div>

      {/* Actions visibles (clean) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
        <button
          type="button"
          className={isFollowing ? "btnGhostSmall" : "btnPrimarySmall"}
          disabled={followLoading}
          onClick={toggleFollow}
          title={isFollowing ? "Suivi" : "Suivre"}
          style={{ ...iconBtn(), padding: "9px 11px" }}
        >
          {followLoading ? "…" : isFollowing ? "✓" : "Suivre"}
        </button>

        <button
          type="button"
          className="btnPrimarySmall"
          onClick={() => {
            if (!token) return setLoginOpen(true);
            setSubError(null);
            setGiftError(null);
            setSubOpen(true);
          }}
          style={iconBtn()}
          title="Sub"
        >
          SUB
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
              style={iconBtn()}
              title="Récupérer un sub offert"
            >
              {claimLoading ? "…" : `🎁 Claim (${fmt(giftStatus.remaining)})`}
            </button>
          ) : (
            <button
              type="button"
              className="btnGhostSmall"
              onClick={() => {
                if (!token) return setLoginOpen(true);
                setSubOpen(true);
              }}
              style={iconBtn()}
              title="Subs offerts"
            >
              🎁 {fmt(giftStatus.remaining)}
            </button>
          )
        ) : null}

        <button
          type="button"
          className="btnGhostSmall"
          onClick={() => {
            chest.setChestError(null);
            chest.setChestModalOpen(true);
          }}
          title="Coffre"
          style={iconBtn()}
        >
          🎁 Coffre{chest.chestLoading ? "…" : chest.chestBalance > 0 ? ` (${chest.chestBalance})` : ""}
        </button>

        <button type="button" className="btnGhostSmall" onClick={() => setActionsOpen(true)} style={iconBtn()} title="Menu">
          ⋯
        </button>
      </div>
    </div>
  );

  const ActionsDrawer = actionsOpen ? (
    <div
      role="presentation"
      onClick={() => setActionsOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          bottom: 16,
          width: "min(420px, 92vw)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,12,18,0.78)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ fontWeight: 1000 }}>Menu</div>
          <button className="iconBtn" onClick={() => setActionsOpen(false)} type="button" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
          {claimError ? (
            <div className="mutedSmall" style={{ marginBottom: 6, color: "rgba(255,90,90,0.95)" }}>
              {claimError}
            </div>
          ) : null}

          {/* ✅ Edit title (mods/owner/admin) */}
          {canEditTitle ? (
            <button
              type="button"
              className="btnPrimarySmall"
              onClick={() => {
                if (!token) return setLoginOpen(true);
                setEditTitleErr(null);
                setEditTitleDraft(String(streamer.title || ""));
                setEditTitleOpen(true);
              }}
              style={{ justifyContent: "space-between", display: "flex" }}
            >
              <span style={{ fontWeight: 950 }}>✏️ Modifier le titre</span>
              <span className="mutedSmall">Modération</span>
            </button>
          ) : null}

          {/* Notifs (si follow) */}
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

          {/* Host (owner) */}
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

          {/* Plein écran */}
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

          {/* Info solde */}
          <div className="panel" style={{ marginTop: 2 }}>
            <div className="mutedSmall">Ton solde</div>
            <div style={{ marginTop: 6, fontWeight: 950, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={smallBadge()}>💎 {fmt(myRubis)} rubis</span>
              <span style={smallBadge()}>🎟️ {fmt(mySubTickets)} ticket</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const EditTitleModal = editTitleOpen ? (
    <div
      role="presentation"
      onClick={() => {
        if (editTitleBusy) return;
        setEditTitleOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 14,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 96vw)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,12,18,0.85)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 1000 }}>Modifier le titre</div>
          <button className="iconBtn" type="button" onClick={() => (editTitleBusy ? null : setEditTitleOpen(false))} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div style={{ padding: 14 }}>
          {editTitleErr ? (
            <div className="mutedSmall" style={{ marginBottom: 10, color: "rgba(255,90,90,0.95)" }}>
              {editTitleErr}
            </div>
          ) : null}

          <div className="mutedSmall" style={{ marginBottom: 8, opacity: 0.85 }}>
            Titre actuel : <strong style={{ color: "rgba(255,255,255,0.92)" }}>{String(streamer.title || "")}</strong>
          </div>

          <input
            value={editTitleDraft}
            onChange={(e) => setEditTitleDraft(e.target.value)}
            placeholder="Nouveau titre…"
            disabled={editTitleBusy}
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              fontWeight: 850,
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
            <button type="button" className="btnGhostSmall" disabled={editTitleBusy} onClick={() => setEditTitleOpen(false)}>
              Annuler
            </button>
            <button type="button" className="btnPrimarySmall" disabled={editTitleBusy} onClick={saveNewTitle}>
              {editTitleBusy ? "…" : "Enregistrer"}
            </button>
          </div>

          <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.65 }}>
            (API attendue) POST /streamers/:slug/title {"{ title }"}
          </div>
        </div>
      </div>
    </div>
  ) : null;

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
            <strong style={{ color: "rgba(255,255,255,0.92)" }}>{hostTargetDisplayName ? hostTargetDisplayName : hostTargetSlug}</strong>…
          </div>
        </div>
      ) : null}

      {/* Stage */}
      <div className="streamGrid">
        <div className="streamMain">
          <div ref={playerWrapRef}>{PlayerBlock}</div>

          {/* ✅ NEW banner (mobile-like) */}
          <div ref={metaWrapRef}>{Banner}</div>

          {/* Mobile mini chat (inchangé) */}
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

        {/* ✅ Chat fixed height = (player + banner) */}
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
                <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{streamer.displayName ? streamer.displayName : ""}</div>
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
          {tab === "clips" && slug ? <ClipsTab slug={String(slug)} token={token} isOwner={isOwner} onRequireLogin={() => setLoginOpen(true)} /> : null}
          {tab === "vod" && slug ? <VodTab slug={String(slug)} /> : null}
          {tab === "agenda" && slug ? <AgendaTab slug={String(slug)} token={token} canEdit={canEditTabs} /> : null}
        </div>
      </div>

      {ActionsDrawer}
      {EditTitleModal}

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

      {/* ✅ HOST modal (inchangé) */}
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
