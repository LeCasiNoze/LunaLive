import * as React from "react";
import { Link } from "react-router-dom";
import { getStreamers } from "../lib/api";
import { svgThumb } from "../lib/thumb";

export default function BrowsePage() {
  const [items, setItems] = React.useState<Array<any>>([]);

  React.useEffect(() => {
    (async () => {
      const data = await getStreamers();
      setItems(
        data.map((s) => ({
          ...s,
          thumb: svgThumb(s.displayName),
        }))
      );
    })();
  }, []);

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Browse</h1>
        <p className="muted">Tous les streamers (live + offline), tri alpha.</p>
      </div>

      <section className="grid">
        {items.map((s) => (
          <Link key={s.id} to={`/s/${s.slug}`} className="cardLink">
            <article className="card">
              <div className="thumb" style={{ backgroundImage: `url("${s.thumb}")` }}>
                {s.isLive && <div className="liveBadge">LIVE</div>}
                <div className="overlay">
                  <div className="streamer">{s.displayName}</div>
                  <div className="title">{s.title || (s.isLive ? "Live" : "Offline")}</div>
                </div>
              </div>
            </article>
          </Link>
        ))}
      </section>
    </main>
  );
}
