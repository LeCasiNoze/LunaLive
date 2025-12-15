import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { getStreamer } from "../lib/api";
import { formatViewers, initialOf } from "../lib/format";
import { svgThumb } from "../lib/thumb";

type StreamerData = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
};

export default function StreamerPage() {
  const { slug } = useParams();
  const [live, setLive] = React.useState<(StreamerData & { thumb: string }) | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setLive(null);

    (async () => {
      try {
        if (!slug) throw new Error("no slug");
        const data = await getStreamer(slug);
        const withThumb = { ...data, thumb: svgThumb(data.displayName) };
        if (!alive) return;
        setLive(withThumb);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        if (String(e?.message || "").includes("404")) setNotFound(true);
        else setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Chargement…</h1>
          <p className="muted">{slug ? `/${slug}` : ""}</p>
        </div>
      </main>
    );
  }

  if (notFound || !live) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Streamer introuvable</h1>
          <p className="muted">Slug: {slug}</p>
        </div>
        <Link to="/" className="btnGhostInline">← Retour aux lives</Link>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="streamerHeader">
        <div className="streamerAvatar">{initialOf(live.displayName)}</div>
        <div className="streamerMeta">
          <div className="streamerNameRow">
            <h1 className="streamerName">{live.displayName}</h1>
            <span className="chipLive">LIVE</span>
            <span className="chipViewers">{formatViewers(live.viewers)} viewers</span>
          </div>
          <div className="muted">{live.title}</div>
        </div>
      </div>

      <div className="streamerLayout">
        <section className="playerCard">
          <div className="playerTop">
            <div className="playerTitle">Live</div>
            <button className="btnGhostSmall" disabled title="Plus tard">
              Ouvrir sur DLive
            </button>
          </div>
          <div className="playerBox" style={{ backgroundImage: `url("${live.thumb}")` }}>
            <div className="playerOverlay">
              <div className="playerOverlayTitle">Player DLive (placeholder)</div>
              <div className="playerOverlaySub">
                Plus tard : embed + controls + qualité + autoplay safe.
              </div>
            </div>
          </div>
        </section>

        <aside className="chatCard">
          <div className="chatTop">
            <div className="playerTitle">Chat</div>
            <span className="mutedSmall">WS plus tard</span>
          </div>

          <div className="chatBox">
            <div className="chatMsg"><b>System</b> — Chat à venir</div>
            <div className="chatMsg"><b>{live.displayName}</b> — Merci d’être là ✨</div>
            <div className="chatMsg"><b>Viewer</b> — gooo</div>
          </div>

          <div className="chatInputRow">
            <input disabled placeholder="Écrire un message (bientôt)" />
            <button className="btnPrimarySmall" disabled>Send</button>
          </div>
        </aside>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Infos streamer (placeholder)</div>
        <div className="muted">
          Ici on mettra : bio, liens, stats, rubis, sub, badges, etc.
        </div>
      </div>
    </main>
  );
}
