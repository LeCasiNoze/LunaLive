import * as React from "react";
import { useParams } from "react-router-dom";
import {
  getStreamer,
  watchHeartbeat,
  followStreamer,
  unfollowStreamer,
  setFollowNotify,
  subscribeStreamer,
  getStreamerChest,
  chestJoin,
  chestOpen,
  chestClose,
  chestDeposit, // ✅ AJOUTE ÇA
  // me, // (optionnel si tu veux refresh le solde user)
} from "../lib/api";
import { enablePushNotifications } from "../lib/push";
import { DlivePlayer } from "../components/DlivePlayer";
import { ChatPanel } from "../components/ChatPanel";
import { LoginModal } from "../components/LoginModal";
import { useAuth } from "../auth/AuthProvider";
import { SubModal } from "../components/SubModal";

// ✅ socket (pour popup coffre)
import { io, type Socket } from "socket.io-client";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 13.5c0 1.4-.6 2.7-1.6 3.6-1.4 1.3-3.6 2.1-6.1 2.1-.7 0-1.5-.1-2.2-.2L5 20l1-2.8c-1.3-1-2-2.3-2-3.7 0-3.5 3.6-6.3 8-6.3s8 2.8 8 6.3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 13.3h.01M12 13.3h.01M15.8 13.3h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellIcon({ size = 18, on = true }: { size?: number; on?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22c1.2 0 2.1-.9 2.1-2.1H9.9C9.9 21.1 10.8 22 12 22Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M18 8.8c0-3.3-2.1-5.8-6-5.8s-6 2.5-6 5.8c0 3.8-1.4 5.1-2.3 6.1-.5.6-.1 1.6.7 1.6h15.2c.8 0 1.2-1 .7-1.6-.9-1-2.3-2.3-2.3-6.1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {on ? (
        <path
          d="M19.2 4.8c1.1 1 1.8 2.4 1.8 4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

function getAnonId(): string {
  const key = "ll_anon_id";
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) return existing;

  const anyCrypto: any = (globalThis as any).crypto;
  const created: string =
    typeof anyCrypto?.randomUUID === "function"
      ? anyCrypto.randomUUID()
      : `a_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  localStorage.setItem(key, created);
  return created;
}

/**
 * Affichage durée:
 * - minutes < 60 => "X min"
 * - heures < 24 => "X h" ou "X h Y min"
 * - jours >= 1  => "X j" ou "X j Y h"
 */
function formatDurationFrom(startedAtMs: number, nowMs: number) {
  const diffMs = Math.max(0, nowMs - startedAtMs);
  const totalMin = Math.floor(diffMs / 60_000);

  if (totalMin < 60) return `${totalMin} min`;

  const totalH = Math.floor(totalMin / 60);
  const min = totalMin % 60;

  if (totalH < 24) return min > 0 ? `${totalH} h ${min} min` : `${totalH} h`;

  const days = Math.floor(totalH / 24);
  const h = totalH % 24;

  if (h > 0) return `${days} j ${h} h`;
  return `${days} j`;
}

/** ✅ Tick local uniquement pour la durée (évite de rerender toute la page) */
function LiveDurationText({
  isLive,
  startedAtMs,
}: {
  isLive: boolean;
  startedAtMs: number | null;
}) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!isLive || !startedAtMs) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [isLive, startedAtMs]);

  if (!isLive || !startedAtMs) return <>—</>;
  return <>{formatDurationFrom(startedAtMs, now)}</>;
}

/** ✅ Fullscreen helpers (Android/Brave/Chrome : masque la barre URL) */
function isFullscreen() {
  const d: any = document;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

/** ✅ Toujours appelé depuis un CLICK (gesture). Pas async => plus fiable sur mobile. */
function requestFullscreenSafe(el?: HTMLElement) {
  try {
    const target: any = el || document.documentElement;
    const req = target.requestFullscreen || target.webkitRequestFullscreen;
    if (typeof req !== "function") return;

    try {
      const p = req.call(target, { navigationUI: "hide" as any });
      if (p?.catch) p.catch(() => {});
    } catch {
      const p = req.call(target);
      if (p?.catch) p.catch(() => {});
    }
  } catch {}
}

function exitFullscreenSafe() {
  try {
    const d: any = document;
    const exit = document.exitFullscreen || d.webkitExitFullscreen;
    if (typeof exit !== "function") return;
    const p = exit.call(document);
    if (p?.catch) p.catch(() => {});
  } catch {}
}

type TabKey = "about" | "clips" | "vod" | "agenda";

// ✅ Types coffre (minimal)
type ChestState = {
  ok: true;
  streamerId: number;
  balance: number;
  breakdown: Record<string, number>;
  opening: null | {
    id: string;
    status: "open" | "closed" | "canceled";
    opensAt: string;
    closesAt: string;
    minWatchMinutes: number;
    participantsCount: number;
    joined?: boolean;
  };
};

function humanChestError(code: string, extra?: any) {
  switch (code) {
    case "owner_forbidden":
      return "Le streamer ne peut pas participer à son propre coffre.";
    case "no_opening":
      return "Aucun coffre n'est ouvert actuellement.";
    case "opening_closed":
      return "Trop tard : le coffre est déjà fermé.";
    case "stream_offline":
      return "Le stream est offline.";
    case "not_watching":
      return "Tu dois être sur le stream (en direct) pour participer.";
    case "need_watchtime":
      return `Watchtime insuffisant (${extra?.watchedMinutes ?? "?"}/${extra?.minWatchMinutes ?? "?"} min).`;
    default:
      return code || "Erreur";
  }
}

export default function StreamerPage() {
  const { slug } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = auth?.user?.role ?? "guest";
  const myUserId = auth?.user?.id != null ? Number(auth.user.id) : null;

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  const [tab, setTab] = React.useState<TabKey>("about");

  const [isFollowing, setIsFollowing] = React.useState(false);
  const [notifyEnabled, setNotifyEnabled] = React.useState(false);
  const [followsCountLocal, setFollowsCountLocal] = React.useState<number | null>(null);

  const [followLoading, setFollowLoading] = React.useState(false);
  const [subOpen, setSubOpen] = React.useState(false);
  const [subLoading, setSubLoading] = React.useState(false);
  const [subError, setSubError] = React.useState<string | null>(null);

  const [depositAmount, setDepositAmount] = React.useState<string>("100");
  const [depositNote, setDepositNote] = React.useState<string>("");
  const [depositLoading, setDepositLoading] = React.useState(false);

  // ✅ Coffre state
  const [chest, setChest] = React.useState<ChestState | null>(null);
  const [chestLoading, setChestLoading] = React.useState(false);
  const [chestModalOpen, setChestModalOpen] = React.useState(false);
  const [chestJoinLoading, setChestJoinLoading] = React.useState(false);
  const [chestOwnerLoading, setChestOwnerLoading] = React.useState(false);
  const [chestError, setChestError] = React.useState<string | null>(null);

  // joined local (le GET /chest ne renvoie pas joined actuellement)
  const [joinedOpeningId, setJoinedOpeningId] = React.useState<string | null>(null);

  // Toast popup quand coffre s’ouvre
  const [chestToast, setChestToast] = React.useState<null | {
    openingId: string;
    closesAt?: string | null;
    minWatchMinutes?: number;
  }>(null);
  const lastOpeningSeenRef = React.useRef<string | null>(null);

  const SUB_PRICE_RUBIS = 500;
  const myRubis = Number(auth?.user?.rubis ?? 0);

  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 820px)").matches : false
  );
  const [isPortrait, setIsPortrait] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(orientation: portrait)").matches : true
  );

  const [cinema, setCinema] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);

  const fsWantedRef = React.useRef(false);

  React.useEffect(() => {
    const mq1 = window.matchMedia("(max-width: 820px)");
    const mq2 = window.matchMedia("(orientation: portrait)");

    const on1 = () => setIsMobile(mq1.matches);
    const on2 = () => setIsPortrait(mq2.matches);

    mq1.addEventListener?.("change", on1);
    mq2.addEventListener?.("change", on2);
    window.addEventListener("resize", on1);

    return () => {
      mq1.removeEventListener?.("change", on1);
      mq2.removeEventListener?.("change", on2);
      window.removeEventListener("resize", on1);
    };
  }, []);

  React.useEffect(() => {
    if (!cinema && !chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cinema, chatOpen]);

  React.useEffect(() => {
    const onFs = () => {
      if (!cinema) return;
      if (!fsWantedRef.current) return;
      if (chatOpen) return;

      if (!isFullscreen()) {
        fsWantedRef.current = false;
        setChatOpen(false);
        setCinema(false);
      }
    };

    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange" as any, onFs);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange" as any, onFs);
    };
  }, [cinema, chatOpen]);

  const enterCinema = React.useCallback(() => {
    fsWantedRef.current = true;
    requestFullscreenSafe(document.documentElement);
    setChatOpen(false);
    setCinema(true);
  }, []);

  const leaveCinema = React.useCallback(() => {
    fsWantedRef.current = false;
    setChatOpen(false);
    setCinema(false);
    exitFullscreenSafe();
  }, []);

  const openCinemaChat = React.useCallback(() => {
    if (isMobile) exitFullscreenSafe();
    setChatOpen(true);
  }, [isMobile]);

  const closeCinemaChat = React.useCallback(() => {
    setChatOpen(false);
    if (isMobile && fsWantedRef.current) requestFullscreenSafe(document.documentElement);
  }, [isMobile]);

  const onFollowsCount = React.useCallback((n: number) => {
    setFollowsCountLocal(Number(n));
  }, []);

  const refreshChest = React.useCallback(async () => {
    if (!slug) return;
    setChestError(null);
    try {
      setChestLoading(true);
      const r = (await getStreamerChest(String(slug))) as any;
      if (r?.ok) {
        setChest(r as ChestState);

        // reset joined state when opening changes / closes
        const oid = r?.opening?.id ? String(r.opening.id) : null;
        setJoinedOpeningId((prev) => {
          if (!oid) return null;
          if (prev && prev !== oid) return null;
          return prev;
        });
      }
    } catch (e: any) {
      setChestError(String(e?.message || "chest_failed"));
    } finally {
      setChestLoading(false);
    }
  }, [slug]);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        if (!slug) return;

        const r = await getStreamer(String(slug), token);
        if (!mounted) return;

        setData(r);

        const following = !!(r?.isFollowing ?? false);
        setIsFollowing(following);

        setFollowsCountLocal(
          typeof (r as any)?.followsCount === "number" ? Number((r as any).followsCount) : null
        );

        if (typeof (r as any)?.notifyEnabled === "boolean") {
          setNotifyEnabled(Boolean((r as any).notifyEnabled));
        } else {
          setNotifyEnabled(following ? true : false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [slug, token]);

  // ✅ initial chest load
  React.useEffect(() => {
    if (!slug) return;
    refreshChest();
  }, [slug, refreshChest]);

  const s = data?.streamer || data;

  const displayName = String(s?.display_name ?? s?.displayName ?? "");
  const title = String(s?.title || "Stream");
  const isLive = !!(s?.is_live ?? s?.isLive);

  const viewersFromApi = Number(s?.viewers ?? s?.watchingCount ?? 0);
  const viewers = isLive ? (liveViewersNow ?? viewersFromApi) : 0;

  const channelSlug = s?.channel_slug ?? s?.channelSlug;
  const channelUsername = s?.channel_username ?? s?.channelUsername;
  const offlineBgUrl = s?.offlineBgUrl ?? null;

  const liveStartedAtRaw = s?.liveStartedAt ?? s?.live_started_at ?? null;
  const liveStartedAtMs = liveStartedAtRaw ? new Date(liveStartedAtRaw).getTime() : null;

  const ownerUserId = Number(s?.user_id ?? s?.userId ?? 0);
  const isOwner = myUserId != null && ownerUserId > 0 && myUserId === ownerUserId;

  const opening = chest?.opening ?? null;
  const openingId = opening?.id ? String(opening.id) : null;
  const canJoinNow = !!openingId && !isOwner;

  React.useEffect(() => {
    if (!isLive) setLiveViewersNow(null);
  }, [isLive]);

  // ✅ heartbeat (déjà existant)
  React.useEffect(() => {
    if (!slug) return;
    if (!isLive) return;

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
  }, [slug, isLive, token]);

  // ✅ socket coffre (popup + refresh)
  React.useEffect(() => {
    const sSlug = String(slug || "").trim();
    if (!sSlug) return;

    const slugLower = sSlug.toLowerCase();

    let socket: Socket | null = null;
    try {
      socket = io(apiBase(), {
        transports: ["websocket", "polling"],
        withCredentials: false,
        auth: token ? { token } : {},
      });

      socket.on("chest:open", (payload: any) => {
        const evSlug = String(payload?.slug || "").trim().toLowerCase();
        if (!evSlug || evSlug !== slugLower) return;

        refreshChest();

        const oid = String(payload?.openingId || payload?.opening?.id || "");
        if (oid && lastOpeningSeenRef.current !== oid) {
          lastOpeningSeenRef.current = oid;
          setChestToast({
            openingId: oid,
            closesAt: payload?.closesAt ? String(payload.closesAt) : null,
            minWatchMinutes: Number(payload?.minWatchMinutes || 5),
          });
        }
      });

      socket.on("chest:close", (payload: any) => {
        const evSlug = String(payload?.slug || "").trim().toLowerCase();
        if (!evSlug || evSlug !== slugLower) return;
        refreshChest();
        setChestToast(null);
        setJoinedOpeningId(null);
      });
    } catch {}

    return () => {
      try {
        socket?.disconnect();
      } catch {}
    };
  }, [slug, token, refreshChest]);

  // auto-hide toast
  React.useEffect(() => {
    if (!chestToast) return;
    const t = window.setTimeout(() => setChestToast(null), 12_000);
    return () => window.clearTimeout(t);
  }, [chestToast?.openingId]);

  async function doJoinChest() {
    setChestError(null);

    if (!token) {
      setLoginOpen(true);
      return;
    }
    if (!slug) return;

    setChestJoinLoading(true);
    try {
      const r: any = await chestJoin(String(slug), token);
      if (r?.ok) {
        setJoinedOpeningId(openingId || r.openingId || null);
        setChestToast(null);
        await refreshChest();
        return;
      }
      setChestError(humanChestError(String(r?.error || "join_failed"), r));
    } catch (e: any) {
      const msg = String(e?.message || "join_failed");
      setChestError(humanChestError(msg, e));
    } finally {
      setChestJoinLoading(false);
    }
  }

  async function doOpenChest() {
    setChestError(null);
    if (!token) {
      setLoginOpen(true);
      return;
    }
    if (!slug) return;

    setChestOwnerLoading(true);
    try {
      const r: any = await chestOpen(String(slug), token, 30, 5);
      if (r?.ok) {
        await refreshChest();
        setChestModalOpen(false);
      } else {
        setChestError(humanChestError(String(r?.error || "open_failed")));
      }
    } catch (e: any) {
      setChestError(String(e?.message || "open_failed"));
    } finally {
      setChestOwnerLoading(false);
    }
  }

  function humanDepositError(code: string) {
  switch (code) {
    case "bad_amount":
      return "Montant invalide.";
    case "insufficient_funds":
      return "Solde insuffisant.";
    case "lots_missing":
      return "Aucun lot de rubis disponible (rubis_lots).";
    case "forbidden":
      return "Interdit (tu n'es pas owner du streamer côté API).";
    default:
      return code || "Erreur dépôt";
  }
}

async function doDepositChest() {
  setChestError(null);

  if (!token) {
    setLoginOpen(true);
    return;
  }
  if (!slug) return;

  const amt = Math.floor(Number(depositAmount));
  if (!Number.isFinite(amt) || amt <= 0) {
    setChestError("Montant invalide.");
    return;
  }

  setDepositLoading(true);
  try {
    await chestDeposit(String(slug), token, amt, depositNote.trim() || null);

    // ✅ refresh coffre
    await refreshChest();

    // (optionnel) si tu veux voir le nouveau solde rubis direct :
    // window.location.reload();
  } catch (e: any) {
    const msg = String(e?.message || "deposit_failed");
    setChestError(humanDepositError(msg));
  } finally {
    setDepositLoading(false);
  }
}

  async function doCloseChest() {
    setChestError(null);
    if (!token) {
      setLoginOpen(true);
      return;
    }
    if (!slug) return;

    setChestOwnerLoading(true);
    try {
      const r: any = await chestClose(String(slug), token);
      if (r?.ok) {
        await refreshChest();
        setChestModalOpen(false);
      } else {
        setChestError(humanChestError(String(r?.error || "close_failed")));
      }
    } catch (e: any) {
      setChestError(String(e?.message || "close_failed"));
    } finally {
      setChestOwnerLoading(false);
    }
  }

  if (loading) return <div className="panel">Chargement…</div>;
  if (!s) return <div className="panel">Streamer introuvable</div>;

  const followsCount = followsCountLocal;
  const showMiniChat = isMobile && isPortrait && !cinema;

  const PlayerBlock = (
    <>
      {isLive ? (
        <DlivePlayer channelSlug={channelSlug} channelUsername={channelUsername} isLive={isLive} />
      ) : (
        <div
          className="panel"
          style={{
            padding: 0,
            overflow: "hidden",
            borderRadius: 18,
            aspectRatio: "16/9",
            background: offlineBgUrl
              ? `linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.25)), url(${offlineBgUrl}) center/cover no-repeat`
              : "rgba(255,255,255,0.04)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div style={{ padding: 16 }}>
            <div style={{ fontWeight: 950, fontSize: 18 }}>OFFLINE</div>
            <div className="mutedSmall" style={{ marginTop: 6 }}>
              {title}
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
                  <div style={{ fontWeight: 950 }}>Chat</div>
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
                    onFollowsCount={onFollowsCount}
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

  const chestBalance = Number(chest?.balance ?? 0);
  const chestHasOpen = !!openingId;
  const alreadyJoined = !!(openingId && joinedOpeningId && joinedOpeningId === openingId);

  return (
    <div className="streamPage">
      {/* ✅ toast coffre */}
      {chestToast && !isOwner ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 999,
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            padding: 12,
            borderRadius: 16,
            background: "rgba(17,10,23,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 950 }}>🎁 Coffre ouvert !</div>
            <button
              className="iconBtn"
              type="button"
              onClick={() => setChestToast(null)}
              aria-label="Fermer"
              style={{
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.75)",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
            Conditions : être sur le live + {chestToast.minWatchMinutes ?? 5} min de watchtime.
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btnPrimarySmall"
              disabled={chestJoinLoading || alreadyJoined || !canJoinNow}
              onClick={(e) => {
                e.stopPropagation();
                doJoinChest();
              }}
              style={{ flex: 1 }}
            >
              {alreadyJoined ? "Déjà inscrit" : chestJoinLoading ? "…" : "Participer"}
            </button>
            <button
              type="button"
              className="btnGhostSmall"
              onClick={() => setChestModalOpen(true)}
              style={{ whiteSpace: "nowrap" }}
              title="Voir le coffre"
            >
              Voir
            </button>
          </div>

          {chestError ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,120,150,0.95)" }}>{chestError}</div>
          ) : null}
        </div>
      ) : null}

      {/* === Header === */}
      <div className="panel streamHeaderBar">
        <div className="streamHeaderLeft">
          <div className="streamHeaderTitle">
            <span className="streamHeaderTitleText">
              {title}
              {displayName ? ` — ${displayName}` : ""}
            </span>
          </div>

          <div className="streamHeaderSub mutedSmall">
            Durée du stream actuel :{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>
              <LiveDurationText isLive={isLive} startedAtMs={liveStartedAtMs} />
            </strong>
          </div>
        </div>

        <div className="streamHeaderRight">
          <div className="streamFollowBox">
            <div className="mutedSmall">
              Nombre de follow :{" "}
              <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                {followsCount === null ? "—" : Number(followsCount).toLocaleString()}
              </strong>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btnPrimarySmall"
                disabled={followLoading}
                onClick={async (e) => {
                  e.stopPropagation();

                  if (!token) {
                    setLoginOpen(true);
                    return;
                  }
                  if (!slug) return;

                  setFollowLoading(true);
                  try {
                    const r = isFollowing
                      ? await unfollowStreamer(String(slug), token)
                      : await followStreamer(String(slug), token);

                    if (r?.ok) {
                      const followingNow = !!r.following;
                      setIsFollowing(followingNow);
                      setFollowsCountLocal(Number(r.followsCount));

                      if (typeof r.notifyEnabled === "boolean") setNotifyEnabled(Boolean(r.notifyEnabled));
                      else setNotifyEnabled(followingNow ? true : false);
                    }
                  } finally {
                    setFollowLoading(false);
                  }
                }}
                title={isFollowing ? "Ne plus suivre" : "Suivre"}
              >
                {followLoading ? "…" : isFollowing ? "Suivi" : "Suivre"}
              </button>

              <button
                type="button"
                className="btnGhostSmall"
                disabled={followLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!token) {
                    setLoginOpen(true);
                    return;
                  }
                  setSubError(null);
                  setSubOpen(true);
                }}
                title="S’abonner"
              >
                Sub
              </button>

              {/* ✅ Coffre : bouton "Coffre" + action contextuelle */}
              <button
                type="button"
                className="btnGhostSmall"
                onClick={(e) => {
                  e.stopPropagation();
                  setChestError(null);
                  setChestModalOpen(true);
                }}
                title="Voir le coffre"
              >
                🎁 Coffre{chestLoading ? "…" : chestBalance > 0 ? ` (${chestBalance})` : ""}
              </button>

              {isOwner ? (
                chestHasOpen ? (
                  <button
                    type="button"
                    className="btnPrimarySmall"
                    disabled={chestOwnerLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      doCloseChest();
                    }}
                    title="Fermer et distribuer maintenant"
                  >
                    {chestOwnerLoading ? "…" : "Fermer coffre"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btnPrimarySmall"
                    disabled={chestOwnerLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      doOpenChest();
                    }}
                    title="Ouvrir le coffre (30s)"
                  >
                    {chestOwnerLoading ? "…" : "Ouvrir coffre"}
                  </button>
                )
              ) : chestHasOpen ? (
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={chestJoinLoading || alreadyJoined}
                  onClick={(e) => {
                    e.stopPropagation();
                    doJoinChest();
                  }}
                  title="Participer au coffre"
                >
                  {alreadyJoined ? "Inscrit" : chestJoinLoading ? "…" : "Participer"}
                </button>
              ) : null}

              {/* ✅ cloche uniquement si follow */}
              {isFollowing ? (
                <button
                  type="button"
                  className="btnGhostSmall"
                  disabled={followLoading}
                  onClick={async (e) => {
                    e.stopPropagation();

                    if (!token) {
                      setLoginOpen(true);
                      return;
                    }
                    if (!slug) return;

                    const next = !notifyEnabled;

                    if (next) {
                      try {
                        await enablePushNotifications(token);
                      } catch (err) {
                        console.warn("enablePushNotifications failed", err);
                        setNotifyEnabled(false);
                        return;
                      }
                    }

                    setNotifyEnabled(next);
                    try {
                      const r = await setFollowNotify(String(slug), next, token);
                      if (typeof r?.notifyEnabled === "boolean") setNotifyEnabled(Boolean(r.notifyEnabled));
                    } catch {
                      setNotifyEnabled((x) => !x);
                    }
                  }}
                  title={
                    notifyEnabled
                      ? "Notifications activées (cliquer pour désactiver)"
                      : "Notifications désactivées (cliquer pour activer)"
                  }
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <BellIcon on={notifyEnabled} /> {notifyEnabled ? "Notif" : "Muet"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* === Stage === */}
      <div className="streamGrid">
        <div className="streamMain">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              type="button"
              className="btnGhostSmall"
              onClick={enterCinema}
              title="Plein écran (masque la barre URL sur mobile)"
            >
              Plein écran
            </button>
          </div>

          {PlayerBlock}

          {showMiniChat ? (
            <div className="panel mobileMiniChat" style={{ padding: 0, marginTop: 12 }}>
              <div className="streamChatHeader">
                <div className="streamChatHeaderLeft">
                  <div className="mutedSmall" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ opacity: 0.9 }}>
                      <EyeIcon />
                    </span>
                    <span>{Number(viewers || 0).toLocaleString()} viewer</span>
                  </div>
                </div>

                <div className="mutedSmall">
                  rôle : <strong style={{ color: "rgba(255,255,255,0.9)" }}>{String(myRole)}</strong>
                </div>
              </div>

              <div className="streamChatBody">
                <ChatPanel
                  slug={String(slug || "")}
                  onRequireLogin={() => setLoginOpen(true)}
                  compact
                  onFollowsCount={onFollowsCount}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Desktop: chat à droite */}
        <aside className="panel streamChat" style={{ padding: 0 }}>
          <div className="streamChatHeader">
            <div className="streamChatHeaderLeft">
              <div className="mutedSmall" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ opacity: 0.9 }}>
                  <EyeIcon />
                </span>
                <span>{Number(viewers || 0).toLocaleString()} viewer</span>
              </div>
            </div>

            <div className="mutedSmall">
              rôle : <strong style={{ color: "rgba(255,255,255,0.9)" }}>{String(myRole)}</strong>
            </div>
          </div>

          <div className="streamChatBody">
            <ChatPanel
              slug={String(slug || "")}
              onRequireLogin={() => setLoginOpen(true)}
              onFollowsCount={onFollowsCount}
            />
          </div>
        </aside>
      </div>

      {/* === Bottom tabs === */}
      <div className="panel streamBottomPanel">
        <div className="streamTabsRow">
          <button
            type="button"
            className={`streamTabBtn ${tab === "about" ? "active" : ""}`}
            onClick={() => setTab("about")}
          >
            À propos
          </button>
          <button
            type="button"
            className={`streamTabBtn ${tab === "clips" ? "active" : ""}`}
            onClick={() => setTab("clips")}
          >
            Clip
          </button>
          <button
            type="button"
            className={`streamTabBtn ${tab === "vod" ? "active" : ""}`}
            onClick={() => setTab("vod")}
          >
            VOD
          </button>
          <button
            type="button"
            className={`streamTabBtn ${tab === "agenda" ? "active" : ""}`}
            onClick={() => setTab("agenda")}
          >
            Agenda
          </button>
        </div>

        <div className="streamTabContent">
          {tab === "about" && (
            <div>
              <div className="panelTitle">À propos</div>
              <div className="mutedSmall">(On mettra ici bio + liens casinos + images + siteweb, etc.)</div>
            </div>
          )}
          {tab === "clips" && (
            <div>
              <div className="panelTitle">Clips</div>
              <div className="mutedSmall">(placeholder)</div>
            </div>
          )}
          {tab === "vod" && (
            <div>
              <div className="panelTitle">VOD</div>
              <div className="mutedSmall">(placeholder)</div>
            </div>
          )}
          {tab === "agenda" && (
            <div>
              <div className="panelTitle">Agenda</div>
              <div className="mutedSmall">(placeholder)</div>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Modal Coffre */}
      {chestModalOpen ? (
        <div
          role="presentation"
          onClick={() => setChestModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 998,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520,
              maxWidth: "100%",
              borderRadius: 18,
              background: "rgba(17,10,23,0.96)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 80px rgba(0,0,0,0.55)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>🎁 Coffre du streamer</div>
              <button className="iconBtn" type="button" onClick={() => setChestModalOpen(false)}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "baseline" }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Montant :</div>
              <div style={{ fontWeight: 950, fontSize: 22 }}>{chestLoading ? "…" : chestBalance}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>rubis</div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Sortie max du coffre : <strong>0.20</strong> (cap sécurité).
            </div>

            {opening ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontWeight: 900 }}>Coffre ouvert</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  Participants : <strong>{Number(opening.participantsCount || 0)}</strong> • Watch min :{" "}
                  <strong>{Number(opening.minWatchMinutes || 5)} min</strong>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  Ferme à : <strong>{new Date(opening.closesAt).toLocaleTimeString()}</strong>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>Aucun coffre ouvert actuellement.</div>
            )}

            {/* breakdown */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 13, opacity: 0.9 }}>Répartition (poids → rubis)</div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {chest?.breakdown && Object.keys(chest.breakdown).length ? (
                  Object.entries(chest.breakdown)
                    .sort((a, b) => Number(b[0]) - Number(a[0]))
                    .map(([w, a]) => (
                      <div
                        key={w}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          fontSize: 12,
                        }}
                      >
                        <strong>{(Number(w) / 10_000).toFixed(2)}</strong> → {Number(a)}
                      </div>
                    ))
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>—</div>
                )}
              </div>
            </div>

            {chestError ? (
              <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,120,150,0.95)" }}>{chestError}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btnGhostSmall"
                onClick={() => refreshChest()}
                disabled={chestLoading}
              >
                {chestLoading ? "…" : "Rafraîchir"}
              </button>

              {!isOwner && openingId ? (
                <button
                  type="button"
                  className="btnPrimarySmall"
                  onClick={doJoinChest}
                  disabled={chestJoinLoading || alreadyJoined}
                >
                  {alreadyJoined ? "Déjà inscrit" : chestJoinLoading ? "…" : "Participer"}
                </button>
              ) : null}

              {isOwner ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>Déposer des rubis dans le coffre</div>

                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      inputMode="numeric"
                      placeholder="Montant"
                      style={{
                        width: 140,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "white",
                        outline: "none",
                      }}
                    />

                    <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("50")}>+50</button>
                    <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("100")}>+100</button>
                    <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("250")}>+250</button>
                    <button type="button" className="btnGhostSmall" onClick={() => setDepositAmount("500")}>+500</button>
                  </div>

                  <input
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                    placeholder="Note (optionnel)"
                    style={{
                      marginTop: 10,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "white",
                      outline: "none",
                    }}
                  />

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btnPrimarySmall"
                      onClick={doDepositChest}
                      disabled={depositLoading}
                    >
                      {depositLoading ? "…" : "Déposer"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <SubModal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        streamerName={displayName ? displayName : `@${String(slug || "")}`}
        priceRubis={SUB_PRICE_RUBIS}
        myRubis={myRubis}
        loading={subLoading}
        error={subError}
        onGoShop={() => {
          setSubOpen(false);
          window.location.href = "/shop";
        }}
        onPayRubis={async () => {
          if (!token) return;
          if (!slug) return;

          setSubLoading(true);
          setSubError(null);
          try {
            const r = await subscribeStreamer(String(slug), token);
            if (r?.ok) {
              window.location.reload();
            }
          } catch (e: any) {
            setSubError(String(e?.message || "Erreur"));
          } finally {
            setSubLoading(false);
          }
        }}
      />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
