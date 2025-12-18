import * as React from "react";
import { Link } from "react-router-dom";
import { formatViewers } from "../lib/format";
import { getLives } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";

type LiveCardVM = LiveCard & {
  thumbFallback: string;      // data URI svg
  thumbFinal: string;         // url finale affichée
  durationLabel?: string | null; // ex "2.58"
};

function formatDurationDot(startIso: string, nowMs: number) {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  const diff = Math.max(0, nowMs - start);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}.${String(m).padStart(2, "0")}`;
}

function withMinuteBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 60000); // change seulement à la minute
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

export default function LivesPage() {
  const [lives, setLives] = React.useState<LiveCardVM[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const nowMs = Date.now();
        const data = await getLives();

        const vm: LiveCardVM[] = data.map((x: any) => {
          const fallback = svgThumb(x.displayName);

          // ✅ preview réelle si dispo, sinon thumb SVG
          const rawThumbUrl = x.thumbUrl || x.thumb_url || null;
          const thumbFinal = rawThumbUrl ? withMinuteBust(String(rawThumbUrl), nowMs) : fallback;

          // ✅ durée réelle si dispo (sinon rien)
          const started = x.liveStartedAt || x.live_started_at || null;
          const durationLabel = started ? formatDurationDot(String(started), nowMs) : null;

          return {
            ...x,
            thumbFallback: fallback,
            thumbFinal,
            durationLabel,
          };
        });

        if (alive) setLives(vm);
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
    () => [...lives].sort((a, b) => Number(b.viewers) - Number(a.viewers)),
    [lives]
  );

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Lives</h1>
        <p className="muted">{loading ? "Chargement…" : "Données depuis l’API."}</p>
      </div>

      <section className="grid">
        {sorted.map((live) => (
          <Link key={live.id} to={`/s/${live.slug}`} className="cardLink">
            <article className="card">
              <div
                className="thumb"
                style={{
                  backgroundImage: `url("${live.thumbFinal}")`,
                  position: "relative",
                }}
              >
                <div className="liveBadge">LIVE</div>

                {/* ✅ Durée (top-right) */}
                {live.durationLabel ? (
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: 0.2,
                      background: "rgba(0,0,0,0.55)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(8px)",
                    }}
                    title="Durée du live"
                  >
                    {live.durationLabel}
                  </div>
                ) : null}

                {/* viewers (bottom-right) */}
                <div className="viewerBadge">{formatViewers(live.viewers)} viewers</div>

                {/* streamer name (bottom-left via overlay existant) */}
                <div className="overlay">
                  <div className="streamer">{live.displayName}</div>
                </div>
              </div>

              {/* ✅ Titre en dessous, clamp + ellipsis */}
              <div style={{ padding: "10px 12px" }}>
                <div
                  title={live.title || ""}
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    lineHeight: 1.2,
                    opacity: 0.95,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    minHeight: 32, // garde une hauteur stable
                  }}
                >
                  {live.title || "—"}
                </div>
              </div>
            </article>
          </Link>
        ))}
      </section>
    </main>
  );
}
