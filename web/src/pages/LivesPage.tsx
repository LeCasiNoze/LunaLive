import * as React from "react";
import { Link } from "react-router-dom";
import { formatViewers } from "../lib/format";
import { getLives } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";
import { DailyWheelCard } from "../components/DailyWheelCard";

type LiveCardVM = LiveCard & {
  thumbFallback: string; // data URI svg
  thumbFinal: string; // url finale affichée
  durationLabel?: string | null; // ex "2.58"
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

function formatDurationDot(startIso: string, nowMs: number) {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  const diff = Math.max(0, nowMs - start);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}.${String(m).padStart(2, "0")}`;
}

function withMinuteBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 60000);
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
  return u;
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

        const vm: LiveCardVM[] = (data as any[]).map((x: any) => {
          const fallback = svgThumb(x.displayName);

          const rawThumbUrl = absolutize(x.thumbUrl || x.thumb_url || null);
          const thumbFinal = rawThumbUrl ? withMinuteBust(String(rawThumbUrl), nowMs) : fallback;

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
      {/* CSS local (responsive) */}
      <style>{`
        .livesLayout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 16px;
          align-items: start;
        }
        .livesSidebar {
          position: sticky;
          top: 14px;
        }
        .livesMain { min-width: 0; }

        /* Mobile */
        @media (max-width: 980px) {
          .livesLayout {
            grid-template-columns: 1fr;
          }
          .livesSidebar {
            position: static;
          }
        }
      `}</style>

      <div className="pageTitle">
        <h1>Lives</h1>
        <p className="muted">{loading ? "Chargement…" : "Données depuis l’API."}</p>
      </div>

      <div className="livesLayout">
        {/* Sidebar (desktop gauche / mobile en haut) */}
        <aside className="livesSidebar">
          <DailyWheelCard />
        </aside>

        {/* Main */}
        <section className="livesMain">
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

                    <div className="viewerBadge">{formatViewers(live.viewers)} viewers</div>

                    <div className="overlay">
                      <div className="streamer">{live.displayName}</div>
                    </div>
                  </div>

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
                        minHeight: 32,
                      }}
                    >
                      {live.title || "—"}
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}
