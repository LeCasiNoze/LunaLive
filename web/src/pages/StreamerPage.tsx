import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { MOCK_LIVES } from "../data/mockLives";
import { formatViewers, initialOf } from "../lib/format";

export default function StreamerPage() {
  const { slug } = useParams();
  const live = React.useMemo(
    () => MOCK_LIVES.find((l) => l.slug === slug),
    [slug]
  );

  if (!live) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Streamer introuvable</h1>
          <p className="muted">Slug: {slug}</p>
        </div>
        <Link to="/" className="btnGhostInline">
          ← Retour aux lives
        </Link>
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
            <span className="chipViewers">
              {formatViewers(live.viewers)} viewers
            </span>
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
          <div
            className="playerBox"
            style={{ backgroundImage: `url("${live.thumb}")` }}
          >
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
            <div className="chatMsg">
              <b>System</b> — Chat à venir
            </div>
            <div className="chatMsg">
              <b>{live.displayName}</b> — Merci d’être là ✨
            </div>
            <div className="chatMsg">
              <b>Viewer</b> — gooo
            </div>
          </div>

          <div className="chatInputRow">
            <input disabled placeholder="Écrire un message (bientôt)" />
            <button className="btnPrimarySmall" disabled>
              Send
            </button>
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
