import * as React from "react";
import { Link } from "react-router-dom";
import { MOCK_LIVES } from "../data/mockLives";
import { formatViewers } from "../lib/format";

export default function LivesPage() {
  const lives = React.useMemo(
    () => [...MOCK_LIVES].sort((a, b) => b.viewers - a.viewers),
    []
  );

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Lives</h1>
        <p className="muted">Mock trié par viewers. Clic = page streamer.</p>
      </div>

      <section className="grid">
        {lives.map((live) => (
          <Link key={live.id} to={`/s/${live.slug}`} className="cardLink">
            <article className="card">
              <div
                className="thumb"
                style={{ backgroundImage: `url("${live.thumb}")` }}
              >
                <div className="liveBadge">LIVE</div>
                <div className="viewerBadge">
                  {formatViewers(live.viewers)} viewers
                </div>

                <div className="overlay">
                  <div className="streamer">{live.displayName}</div>
                  <div className="title">{live.title}</div>
                </div>
              </div>
            </article>
          </Link>
        ))}
      </section>
    </main>
  );
}
