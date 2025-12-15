import * as React from "react";
import { Link } from "react-router-dom";
import { formatViewers } from "../lib/format";
import { getLives } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";

export default function LivesPage() {
  const [lives, setLives] = React.useState<LiveCard[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getLives();
        const withThumbs: LiveCard[] = data.map((x) => ({
          ...x,
          thumb: svgThumb(x.displayName),
        }));
        if (alive) setLives(withThumbs);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sorted = React.useMemo(
    () => [...lives].sort((a, b) => b.viewers - a.viewers),
    [lives]
  );

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Lives</h1>
        <p className="muted">
          {loading ? "Chargement…" : "Données depuis l’API."}
        </p>
      </div>

      <section className="grid">
        {sorted.map((live) => (
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
