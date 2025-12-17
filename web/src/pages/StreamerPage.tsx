import * as React from "react";
import { useParams } from "react-router-dom";
import { getStreamer } from "../lib/api";
import { DlivePlayer } from "../components/DlivePlayer";

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

export default function StreamerPage() {
  const { slug } = useParams();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

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

  if (loading) return <div className="panel">Chargement…</div>;
  if (!s) return <div className="panel">Streamer introuvable</div>;

  return (
    <div className="streamPage">
      {/* Top bar */}
      <div className="panel streamTopBar">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              <span style={{ opacity: 0.9 }}><EyeIcon /></span>
              <span>{Number(viewers || 0).toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* zone future : follow / share / report */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* placeholder buttons */}
        </div>
      </div>

      {/* Grid: player left, chat right */}
      <div className="streamGrid">
        <div className="streamMain">
          <DlivePlayer
            channelSlug={channelSlug}
            channelUsername={channelUsername}
            isLive={isLive}
          />
        </div>

        <aside className="panel streamChat">
          {/* Chat MVP */}
          <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontWeight: 800 }}>Chat</div>
            <div className="mutedSmall">Bêta — bientôt en temps réel</div>
          </div>

          <div style={{ padding: 12, flex: 1, overflow: "auto" }}>
            <div className="mutedSmall" style={{ opacity: 0.8 }}>
              Le chat arrive. Ici on affichera les messages, mods, emotes, etc.
            </div>
          </div>

          <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 10 }}>
            <input
              disabled
              placeholder="Connexion au chat (bientôt)…"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(180, 160, 255, 0.22)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.9)",
                outline: "none",
              }}
            />
            <button
              disabled
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(180, 160, 255, 0.22)",
                background: "rgba(120, 90, 255, 0.18)",
                color: "rgba(255,255,255,0.85)",
                cursor: "not-allowed",
              }}
            >
              Envoyer
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
