// web/src/pages/streamer/StreamerPage.tsx
import * as React from "react";
import { useParams } from "react-router-dom";

import { watchHeartbeat, subscribeStreamer } from "../../lib/api";
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

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type TabKey = "about" | "clips" | "vod" | "agenda";

export default function StreamerPage() {
  const { slug } = useParams();
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = auth?.user?.role ?? "guest";
  const myUserId = auth?.user?.id != null ? Number(auth.user.id) : null;

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("about");
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  // ✅ Sub modal state (fix)
  const [subOpen, setSubOpen] = React.useState(false);
  const [subLoading, setSubLoading] = React.useState(false);
  const [subError, setSubError] = React.useState<string | null>(null);

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

  const isOwner = !!(myUserId != null && streamer?.ownerUserId != null && Number(streamer.ownerUserId) === Number(myUserId));

  const chest = useChest({
    slug: slug ?? null,
    token,
    apiBase: apiBase(),
    isOwner,
    isLive: !!streamer?.isLive,
    onRequireLogin: () => setLoginOpen(true),
  });

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

  const showMiniChat = isMobile && isPortrait && !cinema;

  const viewersFromApi = streamer.viewers;
  const viewers = streamer.isLive ? (liveViewersNow ?? viewersFromApi) : 0;

  const myRubis = Number(auth?.user?.rubis ?? 0);
  const SUB_PRICE_RUBIS = 500;

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
              ? `linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.25)), url(${streamer.offlineBgUrl}) center/cover no-repeat`
              : "rgba(255,255,255,0.04)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div style={{ padding: 16 }}>
            <div style={{ fontWeight: 950, fontSize: 18 }}>OFFLINE</div>
            <div className="mutedSmall" style={{ marginTop: 6 }}>
              {streamer.title}
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
                    onFollowsCount={(n) => setFollowsCount(Number(n))}
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

      {/* Header */}
      <div className="panel streamHeaderBar">
        <div className="streamHeaderLeft">
          <div className="streamHeaderTitle">
            <span className="streamHeaderTitleText">
              {streamer.title}
              {streamer.displayName ? ` — ${streamer.displayName}` : ""}
            </span>
          </div>

          <div className="streamHeaderSub mutedSmall">
            Durée du stream actuel :{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>
              <LiveDurationText isLive={streamer.isLive} startedAtMs={streamer.liveStartedAtMs} />
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
              <button type="button" className="btnPrimarySmall" disabled={followLoading} onClick={toggleFollow}>
                {followLoading ? "…" : isFollowing ? "Suivi" : "Suivre"}
              </button>

              <button
                type="button"
                className="btnGhostSmall"
                disabled={followLoading}
                onClick={() => {
                  if (!token) return setLoginOpen(true);
                  setSubError(null);
                  setSubOpen(true);
                }}
              >
                Sub
              </button>

              <button
                type="button"
                className="btnGhostSmall"
                onClick={() => {
                  chest.setChestError(null);
                  chest.setChestModalOpen(true);
                }}
                title="Voir le coffre"
              >
                🎁 Coffre{chest.chestLoading ? "…" : chest.chestBalance > 0 ? ` (${chest.chestBalance})` : ""}
              </button>

              {/* Owner: open only (fermeture auto) */}
              {isOwner && !chest.chestHasOpen ? (
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={chest.ownerLoading || !streamer.isLive}
                  onClick={chest.open}
                  title={!streamer.isLive ? "Stream offline" : "Ouvre 2 minutes (fermeture auto)"}
                >
                  {chest.ownerLoading ? "…" : "Ouvrir coffre"}
                </button>
              ) : null}

              {/* Viewer: join */}
              {!isOwner && chest.chestHasOpen ? (
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={chest.joinLoading || chest.alreadyJoined}
                  onClick={chest.join}
                >
                  {chest.alreadyJoined ? "Inscrit" : chest.joinLoading ? "…" : "Participer"}
                </button>
              ) : null}

              {/* bell only if follow */}
              {isFollowing ? (
                <button
                  type="button"
                  className="btnGhostSmall"
                  disabled={followLoading}
                  onClick={toggleNotify}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <BellIcon on={notifyEnabled} /> {notifyEnabled ? "Notif" : "Muet"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Stage */}
      <div className="streamGrid">
        <div className="streamMain">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button type="button" className="btnGhostSmall" onClick={enterCinema}>
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
                  onFollowsCount={(n) => setFollowsCount(Number(n))}
                />
              </div>
            </div>
          ) : null}
        </div>

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
              onFollowsCount={(n) => setFollowsCount(Number(n))}
            />
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
            const r = await subscribeStreamer(String(slug), token);
            if (r?.ok) window.location.reload();
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
