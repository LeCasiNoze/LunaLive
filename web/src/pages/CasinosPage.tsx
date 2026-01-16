// web/src/pages/CasinosPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { listCasinos, type CasinoListItem, type CasinoListResp } from "../lib/api_casinos";

/* ─────────────────────────────────────────────
   Utils + UI atoms (inline)
───────────────────────────────────────────── */
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function Stars({ value }: { value: number }) {
  const v = clamp(value, 0, 5);
  const full = Math.round(v);
  return (
    <div aria-label={`Note ${v.toFixed(1)} sur 5`} style={{ display: "inline-flex", gap: 3 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            fontSize: 13,
            opacity: i < full ? 1 : 0.28,
            filter: i < full ? "drop-shadow(0 6px 12px rgba(255,210,110,0.22))" : "none",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function RatingLine({ avg, count }: { avg: number; count: number }) {
  if (!count) return <div className="mutedSmall">Aucun avis pour le moment</div>;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Stars value={avg} />
      <div style={{ fontSize: 13, fontWeight: 950 }}>
        {avg.toFixed(1)}
        <span style={{ opacity: 0.72, fontWeight: 950 }}> /5</span>{" "}
        <span className="mutedSmall" style={{ fontWeight: 900 }}>
          • {count.toLocaleString("fr-FR")} avis
        </span>
      </div>
    </div>
  );
}

function Pill({
  tone,
  children,
  title,
}: {
  tone: "partner" | "watch" | "avoid" | "neutral";
  children: React.ReactNode;
  title?: string;
}) {
  const map: Record<string, { bg: string; bd: string }> = {
    partner: { bg: "rgba(255, 210, 110, 0.14)", bd: "rgba(255, 210, 110, 0.28)" },
    watch: { bg: "rgba(80, 160, 255, 0.14)", bd: "rgba(80, 160, 255, 0.26)" },
    avoid: { bg: "rgba(255, 90, 120, 0.14)", bd: "rgba(255, 90, 120, 0.26)" },
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
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
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

/* ─────────────────────────────────────────────
   Cards with LOGO FULL-BACKGROUND (cover)
───────────────────────────────────────────── */

function LogoBackdrop({
  url,
  variant = "default",
}: {
  url: string | null | undefined;
  variant?: "default" | "podium";
}) {
  const hasUrl = Boolean(url);

  // podium a un peu plus de présence
  const opacityImg = variant === "podium" ? 0.22 : 0.58;

  return (
    <>
      {/* ✅ Fallback décoratif quand pas de logo */}
      {!hasUrl ? (
        <>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: -2,
              background:
                "radial-gradient(900px 320px at 20% 0%, rgba(255,210,110,0.14), rgba(0,0,0,0) 60%), radial-gradient(900px 320px at 90% 10%, rgba(140,90,255,0.16), rgba(0,0,0,0) 62%), repeating-linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 10px)",
              opacity: variant === "podium" ? 0.85 : 0.75,
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.30))",
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        <>
          {/* Image cover */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${url})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "contain",
              opacity: opacityImg,
              filter: "contrast(1.08) saturate(1.25) brightness(1.05)",
              transform: "scale(1.03)",
              pointerEvents: "none",
            }}
          />
          {/* Scrim pour lisibilité + “effet transparent” */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                variant === "podium"
                  ? "linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.62)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)"
                  : "linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.26) 55%, rgba(0,0,0,0.64))",
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </>
  );
}

function CasinoCard({ c }: { c: CasinoListItem }) {
  const isPartner = c.featuredRank != null;
  const isWatch = c.watchLevel === "watch";
  const isAvoid = c.watchLevel === "avoid";

  const tone = isPartner ? "partner" : isAvoid ? "avoid" : isWatch ? "watch" : "neutral";

  return (
    <Link to={`/casinos/${encodeURIComponent(c.slug)}`} style={{ textDecoration: "none", color: "inherit" }}>
      <GlassCard
        style={{
          padding: 14,
          position: "relative",
          overflow: "hidden",
          border: isPartner ? "1px solid rgba(255,210,110,0.22)" : "1px solid rgba(255,255,255,0.10)",
          background: isPartner
            ? "radial-gradient(700px 220px at 20% 0%, rgba(255,210,110,0.16), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))"
            : "radial-gradient(700px 220px at 20% 0%, rgba(140,90,255,0.14), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
        }}
      >
        <LogoBackdrop url={c.logoUrl} variant="default" />

        <div style={{ position: "relative", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 1250,
                  letterSpacing: -0.25,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.name}
              </div>

              <div style={{ marginTop: 6 }}>
                <RatingLine avg={c.avgRating} count={c.ratingsCount} />
              </div>

              {c.bonusHeadline ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                    fontWeight: 950,
                    maxWidth: 560,
                  }}
                >
                  🎁 {c.bonusHeadline}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {isPartner ? <Pill tone="partner">⭐ Partner</Pill> : null}
              {isAvoid ? <Pill tone="avoid">⛔ À éviter</Pill> : null}
              {!isAvoid && isWatch ? <Pill tone="watch">👀 Surveillance</Pill> : null}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div className="mutedSmall" style={{ fontWeight: 900 }}>
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
              Voir →
            </span>
          </div>

          <div
            aria-hidden
            style={{
              height: 2,
              borderRadius: 999,
              background:
                tone === "partner"
                  ? "linear-gradient(90deg, rgba(255,210,110,0.0), rgba(255,210,110,0.45), rgba(255,210,110,0.0))"
                  : tone === "avoid"
                  ? "linear-gradient(90deg, rgba(255,90,120,0.0), rgba(255,90,120,0.42), rgba(255,90,120,0.0))"
                  : tone === "watch"
                  ? "linear-gradient(90deg, rgba(80,160,255,0.0), rgba(80,160,255,0.40), rgba(80,160,255,0.0))"
                  : "linear-gradient(90deg, rgba(255,255,255,0.0), rgba(255,255,255,0.18), rgba(255,255,255,0.0))",
              opacity: 0.9,
            }}
          />
        </div>
      </GlassCard>
    </Link>
  );
}

function PodiumCard({ rank, c }: { rank: 1 | 2 | 3; c: CasinoListItem }) {
  const ring =
    rank === 1 ? "rgba(255,210,110,0.32)" : rank === 2 ? "rgba(190,240,255,0.26)" : "rgba(180,140,255,0.26)";
  const glow =
    rank === 1
      ? "radial-gradient(900px 280px at 20% 0%, rgba(255,210,110,0.22), rgba(0,0,0,0) 60%)"
      : rank === 2
      ? "radial-gradient(900px 280px at 20% 0%, rgba(190,240,255,0.20), rgba(0,0,0,0) 60%)"
      : "radial-gradient(900px 280px at 20% 0%, rgba(180,140,255,0.20), rgba(0,0,0,0) 60%)";

  const crown = rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉";

  return (
    <Link to={`/casinos/${encodeURIComponent(c.slug)}`} style={{ textDecoration: "none", color: "inherit" }}>
      <GlassCard
        style={{
          padding: 16,
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${ring}`,
          background: `${glow}, linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))`,
        }}
      >
        <LogoBackdrop url={c.logoUrl} variant="podium" />

        <div style={{ position: "relative", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <Pill tone="partner">{crown} Top #{rank}</Pill>
            <Pill tone="neutral" title="Emplacement premium partenaire">
              Premium
            </Pill>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 1300, letterSpacing: -0.35 }}>{c.name}</div>
            <RatingLine avg={c.avgRating} count={c.ratingsCount} />
          </div>

          {c.bonusHeadline ? (
            <div
              style={{
                padding: "12px 12px",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
                fontWeight: 1000,
              }}
            >
              🎁 Offre partenaire : <span style={{ opacity: 0.95 }}>{c.bonusHeadline}</span>
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div className="mutedSmall" style={{ fontWeight: 900 }}>
              
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 12,
                fontWeight: 1100,
              }}
            >
              Voir →
            </span>
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */

export default function CasinosPage() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<CasinoListResp | null>(null);

  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<"top" | "newest">("top");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await listCasinos({ q: q.trim() || null, sort });
      setData(r);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="container checktaslotPage">
      <style>{`
        .checktaslotPage{
          position: relative;
          padding-bottom: 26px;
        }
        .checktaslotPage::before{
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
        .checktaslotWrap{
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
        .checktaslotTitle span{
          font-weight: 1400;
          letter-spacing: -0.8px;
        }
        .checktaslotTitle .w1{
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .checktaslotTitle .w2{
          background: linear-gradient(90deg, rgba(255,255,255,0.92), rgba(190,240,255,0.92));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .checktaslotTitle .w3{
          background: linear-gradient(90deg, rgba(80,160,255,1), rgba(80,240,170,1));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .checktaslotH2{
          margin: 0;
          font-weight: 1400;
          letter-spacing: -0.6px;
          background: linear-gradient(90deg, rgba(255,210,110,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text;
          background-clip:text;
          color: transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
      `}</style>

      <div className="checktaslotWrap">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ display: "grid", gap: 6 }}>
            {/* CheckTaSlot attaché (pas d'espace) */}
            <div className="checktaslotTitle" style={{ fontSize: 34, lineHeight: 1.05 }}>
              <span className="w1">Check</span>
              <span className="w2">Ta</span>
              <span className="w3">Slot</span>
            </div>
            <div className="mutedSmall" style={{ maxWidth: 760 }}>
              Compare, check, et lis les retours — sans blabla. ✨
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Pill tone="neutral">🧾 Avis</Pill>
            <Pill tone="neutral">🔗 Soutiens</Pill>
            <Pill tone="neutral">🛡️ Transparence</Pill>
          </div>
        </div>

        {/* Compact Partner strip */}
        <div style={{ marginTop: 12 }}>
          <GlassCard
            style={{
              padding: 12,
              borderRadius: 18,
              background:
                "radial-gradient(900px 220px at 15% 0%, rgba(255,210,110,0.14), rgba(0,0,0,0) 60%), radial-gradient(900px 220px at 80% 20%, rgba(140,90,255,0.14), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10))",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "grid", gap: 3, minWidth: 260 }}>
                <div style={{ fontWeight: 1100 }}>
                  🤝 <span style={{ opacity: 0.92 }}>Vous êtes un casino sérieux ?</span>{" "}
                  <span className="mutedSmall">Apparaissez ici.</span>
                </div>
                <div className="mutedSmall" style={{ opacity: 0.95 }}>
                  🇬🇧 <b>Serious casino?</b> Get featured here.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Link className="btnGhost" to="/contact">
                  Become partner
                </Link>
                <button className="btnPrimary" onClick={() => load()} disabled={loading}>
                  {loading ? "…" : "Explore"}
                </button>
              </div>
            </div>
          </GlassCard>
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
                  placeholder="Rechercher un casino…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") load();
                  }}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "inherit",
                    fontWeight: 900,
                  }}
                />
              </div>

              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="top">Top du moment</option>
                <option value="newest">Nouveaux</option>
              </select>

              <button className="btnPrimary" onClick={load} disabled={loading}>
                {loading ? "Chargement…" : "Rechercher"}
              </button>
            </div>
          </GlassCard>
        </div>

        {loading && <div className="muted" style={{ marginTop: 12 }}>Chargement…</div>}
        {err && <div className="alert" style={{ marginTop: 12 }}>{err}</div>}

        {!loading && data && (
          <>
            {/* PODIUM */}
            {data.podium?.length > 0 && (
              <section style={{ marginTop: 16 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h2 className="checktaslotH2">Podium</h2>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 14,
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    alignItems: "start",
                  }}
                >
                  {data.podium.slice(0, 3).map((c, i) => (
                    <PodiumCard key={c.id} rank={((i + 1) as 1 | 2 | 3)} c={c} />
                  ))}
                </div>
              </section>
            )}

            {/* WATCHLIST */}
            {data.watchlist?.length > 0 && (
              <section style={{ marginTop: 18 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h2 className="checktaslotH2">Transparence</h2>
                  <div className="mutedSmall">À éviter / Sous surveillance (liste publique).</div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  }}
                >
                  {data.watchlist.map((c) => {
                    const tone = c.watchLevel === "avoid" ? "avoid" : "watch";
                    return (
                      <GlassCard
                        key={c.id}
                        style={{
                          padding: 14,
                          border: `1px solid ${
                            tone === "avoid" ? "rgba(255,90,120,0.22)" : "rgba(80,160,255,0.20)"
                          }`,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <LogoBackdrop url={c.logoUrl} variant="default" />
                        <div style={{ position: "relative" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div style={{ fontWeight: 1200 }}>{c.name}</div>
                            <Pill tone={tone}>{c.watchLevel === "avoid" ? "⛔ À éviter" : "👀 Surveillance"}</Pill>
                          </div>
                          <div className="mutedSmall" style={{ marginTop: 8 }}>
                            {c.watchReason || "Raison non précisée."}
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <Link className="btnSecondary" to={`/casinos/${encodeURIComponent(c.slug)}`}>
                              Voir avis
                            </Link>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              </section>
            )}

            {/* LISTE */}
            <section style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h2 className="checktaslotH2">Tout les Casinos</h2>
                </div>
              </div>

              {data.casinos.length === 0 ? (
                <GlassCard style={{ padding: 14, marginTop: 12 }}>
                  <div className="mutedSmall">Aucun casino ne correspond à ta recherche.</div>
                </GlassCard>
              ) : (
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    alignItems: "start",
                  }}
                >
                  {data.casinos.map((c) => (
                    <CasinoCard key={c.id} c={c} />
                  ))}
                </div>
              )}
            </section>

            {/* Disclaimer */}
            <div className="mutedSmall" style={{ marginTop: 16, opacity: 0.9 }}>
              18+ • Jouez responsable •
            </div>
          </>
        )}
      </div>
    </main>
  );
}
