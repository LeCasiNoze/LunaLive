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

export default function StreamerPage() {
  const { slug } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  // modal login piloté par la page
  const [loginOpen, setLoginOpen] = React.useState(false);

  // viewers temps réel (heartbeat API)
  const [liveViewersNow, setLiveViewersNow] = React.useState<number | null>(null);

  // ✅ Mobile: chat en bottom-sheet
  const [chatOpen, setChatOpen] = React.useState(false);

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
  const title = s?.title || "Stream";
  const isLive = !!(s?.is_live ?? s?.isLive);

  const viewersFromApi = Number(s?.viewers ?? s?.watchingCount ?? 0);
  const viewers = isLive ? (liveViewersNow ?? viewersFromApi) : 0;

  const channelSlug = s?.channel_slug ?? s?.channelSlug;
  const channelUsername = s?.channel_username ?? s?.channelUsername;

  // reset si offline
  React.useEffect(() => {
    if (!isLive) setLiveViewersNow(null);
  }, [isLive]);

  // Heartbeat watch tracking
  React.useEffect(() => {
    if (!slug) return;
    if (!isLive) return;

    const anonId = getAnonId();
    let stopped = false;

    const beat = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;

      try {
        const r = await watchHeartbeat({ slug: String(slug), anonId, isLive: true }, token);

        if (r?.isLive && typeof r.viewersNow === "number") {
          setLiveViewersNow(r.viewersNow);
        }
        if (r?.isLive === false) {
          setLiveViewersNow(0);
        }
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

  // ✅ Bloque le scroll du body quand le drawer est ouvert
  React.useEffect(() => {
    if (!chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatOpen]);

  if (loading) return <div className="panel">Chargement…</div>;
  if (!s) return <div className="panel">Streamer introuvable</div>;

  return (
    <div className="streamPage">
      {/* Top bar */}
      <div className="panel streamTopBar">
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>

          <div className="mutedSmall" style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 99,
                  background: isLive ? "rgba(255,80,120,0.95)" : "rgba(180,180,200,0.7)",
                  boxShadow: isLive ? "0 0 18px rgba(255,80,120,0.45)" : "none",
                  display: "inline-block",
                }}
              />
              {isLive ? "LIVE" : "OFFLINE"}
            </span>

            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ opacity: 0.9 }}>
                <EyeIcon />
              </span>
              <span>{Number(viewers || 0).toLocaleString()}</span>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* placeholder future: follow/share */}
        </div>
      </div>

      {/* Grid: player left, chat right (desktop) */}
      <div className="streamGrid">
        <div className="streamMain">
          <DlivePlayer channelSlug={channelSlug} channelUsername={channelUsername} isLive={isLive} />
        </div>

        {/* ✅ Desktop chat : visible ; Mobile: caché via CSS (display:none) */}
        <aside className="panel streamChat" style={{ padding: 0 }}>
          <ChatPanel slug={String(slug || "")} onRequireLogin={() => setLoginOpen(true)} />
        </aside>
      </div>

      {/* ✅ FAB mobile (visible via CSS seulement en mobile) */}
      <button
        className="chatFab"
        onClick={() => setChatOpen(true)}
        aria-label="Ouvrir le chat"
        type="button"
      >
        <ChatIcon />
        <span className="chatFabLabel">Chat</span>
      </button>

      {/* ✅ Bottom sheet chat (mobile) */}
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

      {/* modal login */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
