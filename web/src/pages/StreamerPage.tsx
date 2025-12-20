import * as React from "react";
import { useParams } from "react-router-dom";
import { getStreamer, watchHeartbeat } from "../lib/api";
import { DlivePlayer } from "../components/DlivePlayer";
import { ChatPanel } from "../components/ChatPanel";
import { LoginModal } from "../components/LoginModal";
import { useAuth } from "../auth/AuthProvider";

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

type TabKey = "about" | "clips" | "vod" | "agenda";

export default function StreamerPage() {
  const { slug } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = auth?.user?.role ?? "guest";

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  const [nowTick, setNowTick] = React.useState(() => Date.now());
  const [tab, setTab] = React.useState<TabKey>("about");

  // ✅ Mobile portrait detection (pour mini chat)
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 820px)").matches : false
  );
  const [isPortrait, setIsPortrait] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(orientation: portrait)").matches : true
  );

  // ✅ Mode cinéma (plein écran dans la page, overlay possible)
  const [cinema, setCinema] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);

  React.useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

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

  // ✅ lock scroll quand cinema ou drawer ouvert
  React.useEffect(() => {
    if (!cinema && !chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cinema, chatOpen]);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        if (!slug) return;
        const r = await getStreamer(slug);
        if (!mounted) return;
        setData(r);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [slug]);

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
  const durationText = isLive && liveStartedAtMs ? formatDurationFrom(liveStartedAtMs, nowTick) : "—";

  React.useEffect(() => {
    if (!isLive) setLiveViewersNow(null);
  }, [isLive]);

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

  if (loading) return <div className="panel">Chargement…</div>;
  if (!s) return <div className="panel">Streamer introuvable</div>;

  const followsCount = s?.followsCount ?? null;

  const showMiniChat = isMobile && isPortrait && !cinema; // ✅ portrait: mini chat en bas
  const showDrawerButton = cinema; // ✅ drawer uniquement en mode cinéma

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

  // ✅ Mode cinéma : fullscreen “dans la page” + bouton chat + drawer
  if (cinema) {
    return (
      <>
        <div className="cinemaRoot">
          <div className="cinemaStage">
            <div className="cinemaPlayerCard">{PlayerBlock}</div>
          </div>

          <div className="cinemaTopBar">
            <button className="btnGhostSmall" type="button" onClick={() => { setChatOpen(false); setCinema(false); }}>
              ✕ Quitter
            </button>

            <button
              className="btnPrimarySmall"
              type="button"
              onClick={() => setChatOpen(true)}
              title="Ouvrir le chat"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <ChatIcon /> Chat
              </span>
            </button>
          </div>

          {chatOpen ? (
            <div className="chatSheetBackdrop" onClick={() => setChatOpen(false)} role="presentation">
              <div className="chatSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="chatSheetTop">
                  <div style={{ fontWeight: 950 }}>Chat</div>
                  <button className="iconBtn" onClick={() => setChatOpen(false)} type="button" aria-label="Fermer">
                    ✕
                  </button>
                </div>

                <div className="chatSheetBody">
                  <ChatPanel
                    slug={String(slug || "")}
                    onRequireLogin={() => setLoginOpen(true)}
                    compact
                    autoFocus
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
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>{durationText}</strong>
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

            <button
              type="button"
              className="btnPrimarySmall"
              onClick={() => setLoginOpen(true)}
              title="Follow LunaLive (V1)"
            >
              Suivre
            </button>
          </div>
        </div>
      </div>

      {/* === Stage === */}
      <div className="streamGrid">
        <div className="streamMain">
          {/* bouton cinéma (utile mobile + desktop) */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              type="button"
              className="btnGhostSmall"
              onClick={() => setCinema(true)}
              title="Mode cinéma (plein écran dans la page)"
            >
              Plein écran
            </button>
          </div>

          {PlayerBlock}

          {/* ✅ Mobile portrait: mini chat sous le player (hauteur fixe) */}
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
                />
              </div>

              {/* (drawer uniquement en cinema, donc pas de bouton ici) */}
              {showDrawerButton ? null : null}
            </div>
          ) : null}
        </div>

        {/* Desktop / tablette: chat à droite (tu gardes ton layout) */}
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
            <ChatPanel slug={String(slug || "")} onRequireLogin={() => setLoginOpen(true)} />
          </div>
        </aside>
      </div>

      {/* === Bottom tabs === */}
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

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
