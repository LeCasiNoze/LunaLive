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

type TabKey = "about" | "clips" | "vod" | "agenda";

export default function StreamerPage() {
  const { slug } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const myRole = auth?.user?.role ?? "guest";

  // modal login piloté par la page
  const [loginOpen, setLoginOpen] = React.useState(false);

  // viewers temps réel (venant du heartbeat API)
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  // tick pour la durée
  const [nowTick, setNowTick] = React.useState(() => Date.now());

  // tabs bas
  const [tab, setTab] = React.useState<TabKey>("about");

  React.useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

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

  // (optionnel) durée: nécessite liveStartedAt dans la réponse API /streamers/:slug
  const liveStartedAtRaw = s?.liveStartedAt ?? s?.live_started_at ?? null;
  const liveStartedAtMs = liveStartedAtRaw ? new Date(liveStartedAtRaw).getTime() : null;
  const durationText =
    isLive && liveStartedAtMs ? formatDurationFrom(liveStartedAtMs, nowTick) : "—";

  // reset si on repasse offline
  React.useEffect(() => {
    if (!isLive) setLiveViewersNow(null);
  }, [isLive]);

  // Heartbeat watch tracking (stats)
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

  // Follows V1: UI only (placeholder)
  const followsCount = s?.followsCount ?? null;

  return (
    <div className="streamPage">
      {/* === Header (comme ton croquis) === */}
      <div className="panel streamHeaderBar">
        <div className="streamHeaderLeft">
          <div className="streamHeaderTitle">
            <span className="streamHeaderTitleText">
              {title}
              {displayName ? ` — ${displayName}` : ""}
            </span>
          </div>

          <div className="streamHeaderSub mutedSmall">
            Durée du stream actuel : <strong style={{ color: "rgba(255,255,255,0.9)" }}>{durationText}</strong>
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
              onClick={() => setLoginOpen(true)} // pour l’instant: on branchera la logique follow ensuite
              title="Follow LunaLive (V1)"
            >
              Suivre
            </button>
          </div>
        </div>
      </div>

      {/* === Stage: player + chat === */}
      <div className="streamGrid">
        <div className="streamMain">
          <div className="panel streamPlayerPanel" style={{ padding: 0, overflow: "hidden" }}>
            <DlivePlayer channelSlug={channelSlug} channelUsername={channelUsername} isLive={isLive} />
          </div>
        </div>

        <aside className="panel streamChat" style={{ padding: 0 }}>
          {/* mini header chat (comme ton croquis) */}
          <div className="streamChatHeader">
            <div className="streamChatHeaderLeft">
              <div style={{ fontWeight: 950 }}>chat</div>
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
              <div className="mutedSmall">
                (On mettra ici bio + liens casinos + images + siteweb, etc.)
              </div>
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
              <div className="mutedSmall">
                (plus tard : récupération DLive si faisable, sinon on voit un plan propre)
              </div>
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
