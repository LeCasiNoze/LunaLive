// web/src/pages/BrowsePage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { getStreamers } from "../lib/api";
import { svgThumb } from "../lib/thumb";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");


function norm(s: any) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
  return u;
}

function withMinuteBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 60000);
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function initialsOf(name: string) {
  const s = String(name || "?").trim();
  const c = s.slice(0, 1).toUpperCase();
  return c || "?";
}

/**
 * Avatar resolver (streamers list):
 * - priorité à s.avatarUrl (si fourni par l’API)
 * - sinon fallback sur /avatars/u/:userId (cache-bust soft 1/min)
 */
function pickStreamerAvatarUrlFromStreamer(s: any) {
  const uid =
    s?.ownerUserId ??
    s?.userId ??
    s?.owner_user_id ??
    s?.user_id ??
    s?.ownerId ??
    s?.owner_id ??
    null;

  const directRaw = s?.avatarUrl ?? s?.avatar_url ?? null;
  const direct = directRaw ? absolutize(String(directRaw)) || String(directRaw) : null;

  // cache-bust soft (1/min)
  const byUid = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;

  return {
    url: direct || byUid,
    uid,
    directAvatarUrl: directRaw,
  };
}


function Pill({
  tone,
  children,
  title,
}: {
  tone: "neutral" | "brand" | "live" | "off";
  children: React.ReactNode;
  title?: string;
}) {
  const map: Record<string, { bg: string; bd: string }> = {
    brand: { bg: "rgba(140,90,255,0.14)", bd: "rgba(140,90,255,0.28)" },
    live: { bg: "rgba(255,90,180,0.14)", bd: "rgba(255,90,180,0.26)" },
    off: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)" },
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)" },
  };
  const t = map[tone] ?? map.neutral;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 11px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontSize: 12,
        fontWeight: 1100,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

function GlassCard({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 22,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
        boxShadow: "0 18px 55px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** fond générique quand on n’a pas d’image */
function FallbackBackdrop({ variant }: { variant: "live" | "off" }) {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: -2,
          background:
            variant === "live"
              ? "radial-gradient(900px 320px at 20% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 60%), radial-gradient(900px 320px at 90% 10%, rgba(80,160,255,0.18), rgba(0,0,0,0) 62%), repeating-linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 10px)"
              : "radial-gradient(900px 320px at 20% 0%, rgba(140,90,255,0.18), rgba(0,0,0,0) 60%), radial-gradient(900px 320px at 90% 10%, rgba(80,160,255,0.14), rgba(0,0,0,0) 62%), repeating-linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 10px)",
          opacity: 0.85,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.60)), linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.18))",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

function MediaBackdrop({
  url,
  variant,
}: {
  url: string | null | undefined;
  variant: "live" | "off";
}) {
  const hasUrl = Boolean(url);
  return (
    <>
      {hasUrl ? (
        <>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${url})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "cover",
              opacity: 0.9,
              filter:
                variant === "live"
                  ? "contrast(1.06) saturate(1.18) brightness(1.02)"
                  : "grayscale(0.15) contrast(1.05) saturate(1.05) brightness(0.95)",
              transform: "scale(1.03)",
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                variant === "live"
                  ? "linear-gradient(90deg, rgba(0,0,0,0.60), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.60)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)"
                  : "linear-gradient(90deg, rgba(0,0,0,0.68), rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.72)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,0.05), rgba(0,0,0,0) 60%)",
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        <FallbackBackdrop variant={variant} />
      )}
    </>
  );
}

type UiStreamer = {
  id: string;
  slug: string;
  displayName: string;
  title?: string | null;
  isLive: boolean;

  // best effort / optional
  avatarUrl?: string | null;
  userId?: number | string | null;
  ownerUserId?: number | string | null;

  // live thumbnail / preview
  thumbUrl?: string | null;
  previewUrl?: string | null;

  // always present fallback
  thumb: string;
};

export default function BrowsePage() {
  const [items, setItems] = React.useState<UiStreamer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "live" | "offline">("all");
  const [sort, setSort] = React.useState<"alpha" | "liveFirst">("liveFirst");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const nowMs = Date.now();
      const data = await getStreamers();

      const mapped: UiStreamer[] = (data || []).map((s: any) => {
        // thumb live (si l’API le fournit)
        const rawLiveThumb =
          absolutize(s.thumbUrl || s.thumb_url || s.previewUrl || s.preview_url || null) || null;

        const liveThumbFinal = rawLiveThumb ? withMinuteBust(String(rawLiveThumb), nowMs) : null;

        return {
          ...s,

          // ✅ fields attendus par le resolver (comme CasinoPage)
          ownerUserId: s.ownerUserId ?? s.owner_user_id ?? null,
          userId: s.userId ?? s.user_id ?? null,
          avatarUrl: s.avatarUrl ?? s.avatar_url ?? null,

          thumb: svgThumb(s.displayName),
          previewUrl: liveThumbFinal,
          thumbUrl: s.thumbUrl ?? s.thumb_url ?? null,
        };
      });

      setItems(mapped);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = React.useMemo(() => {
    const live = items.filter((x) => !!x.isLive).length;
    const off = items.length - live;
    return { live, off, total: items.length };
  }, [items]);

  const filtered = React.useMemo(() => {
    const nq = norm(q);
    let list = items;

    if (filter === "live") list = list.filter((x) => x.isLive);
    if (filter === "offline") list = list.filter((x) => !x.isLive);

    if (nq) {
      list = list.filter((x) => {
        const a = norm(x.displayName);
        const b = norm(x.slug);
        const c = norm(x.title);
        return a.includes(nq) || b.includes(nq) || c.includes(nq);
      });
    }

    list = [...list].sort((a, b) => {
      if (sort === "liveFirst") {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      }
      return norm(a.displayName).localeCompare(norm(b.displayName), "fr");
    });

    return list;
  }, [items, q, filter, sort]);

  return (
    <main className="container browsePage">
      <style>{`
        .browsePage{
          position: relative;
          padding-bottom: 26px;
        }
        .browsePage::before{
          content:"";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(1100px 420px at 18% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 500px at 80% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 600px at 50% 95%, rgba(140,90,255,0.22), rgba(0,0,0,0) 64%),
            linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.08));
          transform: translateZ(0);
        }
        .browseWrap{
          position: relative;
          z-index: 1;
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10));
          box-shadow: 0 20px 70px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          padding: 14px;
          overflow: hidden;
        }
        .browseH1{
          margin: 0;
          font-weight: 1500;
          letter-spacing: -0.9px;
          font-size: 34px;
          line-height: 1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text;
          background-clip:text;
          color: transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .browseGrid{
          margin-top: 12px;
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          align-items: start;
        }
        .streamCard{
          text-decoration: none;
          color: inherit;
          display: block;
        }
      `}</style>

      <div className="browseWrap">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
            <h1 className="browseH1">Browse</h1>
            <div className="mutedSmall" style={{ maxWidth: 760 }}>
              Tous les streamers (live + offline). Recherche instant, tri, filtres.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <Pill tone="live">🔴 Live <b>{stats.live}</b></Pill>
            <Pill tone="off">🌙 Offline <b>{stats.off}</b></Pill>
            <Pill tone="neutral">👥 Total <b>{stats.total}</b></Pill>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ marginTop: 12 }}>
          <GlassCard style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  flex: "1 1 320px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <span style={{ opacity: 0.8 }}>🔎</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher un streamer, un titre, un slug…"
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "inherit",
                    fontWeight: 900,
                  }}
                />
                {q ? (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="btnGhost"
                    style={{ padding: "8px 10px", borderRadius: 999 }}
                    title="Effacer"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                <option value="all">Tous</option>
                <option value="live">Live</option>
                <option value="offline">Offline</option>
              </select>

              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="liveFirst">Live d’abord</option>
                <option value="alpha">Tri alpha</option>
              </select>

              <button className="btnPrimary" onClick={load} disabled={loading}>
                {loading ? "Chargement…" : "Rafraîchir"}
              </button>
            </div>

            <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.9 }}>
              {filtered.length} résultat{filtered.length > 1 ? "s" : ""}.
            </div>
          </GlassCard>
        </div>

        {loading && <div className="muted" style={{ marginTop: 12 }}>Chargement…</div>}
        {err && <div className="alert" style={{ marginTop: 12 }}>{err}</div>}

        {!loading && !err && (
          <section className="browseGrid">
            {filtered.map((s) => {
              // ✅ live preview : utilise la miniature live si streamer en live
              const media = s.isLive ? s.previewUrl : null;
              const variant: "live" | "off" = s.isLive ? "live" : "off";

              // ✅ avatar (sinon initial)
              const picked = pickStreamerAvatarUrlFromStreamer(s);
              const avatar = picked.url;
              const initial = initialsOf(s.displayName);

              return (
                <Link key={s.id} to={`/s/${s.slug}`} className="streamCard">
                  <GlassCard
                    style={{
                      padding: 14,
                      position: "relative",
                      overflow: "hidden",
                      border: s.isLive ? "1px solid rgba(255,90,180,0.22)" : "1px solid rgba(255,255,255,0.10)",
                      background: s.isLive
                        ? "radial-gradient(700px 220px at 20% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))"
                        : "radial-gradient(700px 220px at 20% 0%, rgba(140,90,255,0.14), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
                    }}
                  >
                    {/* ✅ Si live => image stream ; sinon => fond stylé (pas vide) */}
                    <MediaBackdrop url={media} variant={variant} />

                    <div style={{ position: "relative", display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                          {/* ✅ AVATAR au lieu de la lettre */}
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 18,
                              position: "relative",
                              overflow: "hidden",
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: "rgba(255,255,255,0.06)",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 1200,
                            }}
                            title={s.displayName}
                          >
                            {initial}
                            {avatar ? (
                              <img
                                src={avatar}
                                alt=""
                                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : null}
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 1300,
                                letterSpacing: -0.25,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {s.displayName}
                            </div>
                            <div
                              className="mutedSmall"
                              style={{
                                opacity: 0.95,
                                marginTop: 4,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%",
                              }}
                              title={s.title || undefined}
                            >
                              {(s.title
                                ? String(s.title).trim()
                                : s.isLive
                                ? "Live en cours"
                                : "Hors ligne"
                              ).length > 30
                                ? (s.title ? String(s.title).trim() : s.isLive ? "Live en cours" : "Hors ligne")
                                    .slice(0, 27) + "..."
                                : (s.title ? String(s.title).trim() : s.isLive ? "Live en cours" : "Hors ligne")}
                            </div>
                          </div>
                        </div>

                        {s.isLive ? (
                          <Pill tone="live" title="En direct">
                            <span
                              aria-hidden
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: "rgba(255,90,180,0.95)",
                                boxShadow: "0 0 0 6px rgba(255,90,180,0.14)",
                              }}
                            />
                            LIVE
                          </Pill>
                        ) : (
                          <Pill tone="off" title="Hors ligne">
                            🌙 Offline
                          </Pill>
                        )}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div className="mutedSmall" style={{ fontWeight: 900 }}>
                          /s/{s.slug}
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.06)",
                            fontSize: 12,
                            fontWeight: 1100,
                          }}
                        >
                          Ouvrir →
                        </span>
                      </div>

                      <div
                        aria-hidden
                        style={{
                          height: 2,
                          borderRadius: 999,
                          background: s.isLive
                            ? "linear-gradient(90deg, rgba(255,90,180,0.0), rgba(255,90,180,0.45), rgba(255,90,180,0.0))"
                            : "linear-gradient(90deg, rgba(255,255,255,0.0), rgba(255,255,255,0.18), rgba(255,255,255,0.0))",
                          opacity: 0.9,
                        }}
                      />
                    </div>
                  </GlassCard>
                </Link>
              );
            })}

            {filtered.length === 0 ? (
              <GlassCard style={{ padding: 14 }}>
                <div className="mutedSmall">Aucun streamer ne correspond à ta recherche.</div>
              </GlassCard>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
