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

export default function StreamerPage() {
  const { slug } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  // ✅ modal login piloté par la page
  const [loginOpen, setLoginOpen] = React.useState(false);

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

  const s = data?.streamer || data; // selon ton format d’API
  const title = s?.title || "Stream";
  const isLive = s?.is_live ?? s?.isLive;
  const viewers = s?.viewers ?? s?.watchingCount ?? 0;

  const channelSlug = s?.channel_slug ?? s?.channelSlug;
  const channelUsername = s?.channel_username ?? s?.channelUsername;

  // ✅ Heartbeat watch tracking (stats)
  React.useEffect(() => {
    if (!slug) return;
    if (!isLive) return;

    const anonId = getAnonId();
    let stopped = false;

    const beat = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;
      try {
        await watchHeartbeat({ slug: String(slug), anonId }, token);
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

        {/* zone future : follow / share / report */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{/* placeholder */}</div>
      </div>

      {/* Grid: player left, chat right */}
      <div className="streamGrid">
        <div className="streamMain">
          <DlivePlayer channelSlug={channelSlug} channelUsername={channelUsername} isLive={isLive} />
        </div>

        <aside className="panel streamChat" style={{ padding: 0 }}>
          <ChatPanel
            slug={String(slug || "")}
            onRequireLogin={() => setLoginOpen(true)} // ✅ ouvre le modal au click "Envoyer" si pas connecté
          />
        </aside>
      </div>

      {/* ✅ modal rendu ici */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
