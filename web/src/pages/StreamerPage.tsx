import * as React from "react";
import { useParams } from "react-router-dom";
import { getStreamer, type ApiPublicStreamer } from "../lib/api";

function dliveUrl(channelSlug: string) {
  return `https://dlive.tv/${encodeURIComponent(channelSlug)}`;
}

export default function StreamerPage() {
  const { slug = "" } = useParams();
  const [s, setS] = React.useState<ApiPublicStreamer | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setErr(null);
    setS(null);

    (async () => {
      try {
        const r = await getStreamer(slug);
        if (!alive) return;
        setS(r);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
      }
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  if (err) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Streamer</h1>
          <p className="muted">⚠️ {err}</p>
        </div>
      </main>
    );
  }

  if (!s) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Streamer</h1>
          <p className="muted">Chargement…</p>
        </div>
      </main>
    );
  }

  const channel = s.provider === "dlive" ? s.providerChannelSlug : null;
  const canEmbed = !!channel && s.isLive;

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>{s.displayName}</h1>
        <p className="muted">
          {s.isLive ? "🔴 LIVE" : "⚫ Offline"} — viewers: <b>{s.viewers.toLocaleString("fr-FR")}</b>
        </p>
      </div>

      {canEmbed ? (
        <div
          className="panel"
          style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}
        >
          <div style={{ width: "100%", aspectRatio: "16 / 9" as any }}>
            <iframe
              src={dliveUrl(channel!)}
              title={`DLive - ${channel}`}
              style={{ width: "100%", height: "100%", border: 0 }}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panelTitle">Live</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            {channel
              ? "Ce streamer n’est pas en live pour le moment."
              : "Aucun compte DLive n’est associé à ce streamer."}
          </div>

          {channel && (
            <a className="btnGhostInline" href={dliveUrl(channel)} target="_blank" rel="noreferrer">
              Ouvrir sur DLive →
            </a>
          )}
        </div>
      )}

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Chat</div>
        <div className="muted">Placeholder (plus tard).</div>
      </div>
    </main>
  );
}
