// web/src/pages/CasinosPage.tsx
// ─── REWORK VISUEL Purple Velvet ─── logique 100% identique à l'original ───
import * as React from "react";
import { Link } from "react-router-dom";
import { listCasinos, type CasinoListItem, type CasinoListResp } from "../lib/api_casinos";
import { PartnerPlansModal } from "../components/PartnerPlansModal";
import { setSeo } from "../lib/seo";
import { useIsMobile } from "../hooks/useIsMobile";
import CasinosPageMobile from "./CasinosPage.mobile";

/* ─────────────────────────────────────────────
   Utils (identiques à l'original)
───────────────────────────────────────────── */
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatRatingFR(v: number) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "—";
  const r = Math.round(x * 10) / 10;
  const hasDec = Math.abs(r - Math.round(r)) > 1e-9;
  return r.toLocaleString("fr-FR", {
    minimumFractionDigits: hasDec ? 1 : 0,
    maximumFractionDigits: 1,
  });
}

function getLunaRating(c: any): number | null {
  const raw = c?.teamRating ?? c?.team_rating ?? c?.team_rating_value ?? null;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? clamp(n, 0, 5) : null;
}

/* ─────────────────────────────────────────────
   UI Atoms — Purple Velvet upgrades
───────────────────────────────────────────── */

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
            color: "rgba(251,191,36,.92)",
            opacity: i < full ? 1 : 0.24,
            filter: i < full ? "drop-shadow(0 3px 7px rgba(251,191,36,.30))" : "none",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function RatingLine({
  label,
  avg,
  count,
  emptyText,
}: {
  label: string;
  avg: number | null | undefined;
  count?: number | null | undefined;
  emptyText?: string;
}) {
  const v = avg == null ? null : Number(avg);
  const hasScore = v != null && Number.isFinite(v);

  if ((count ?? null) === 0 || (count == null && !hasScore)) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="mutedSmall" style={{ fontWeight: 950 }}>{label}</div>
        <div className="mutedSmall">{emptyText ?? "Aucun avis pour le moment"}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div className="mutedSmall" style={{ fontWeight: 950 }}>{label}</div>
      {hasScore ? <Stars value={v!} /> : <span className="mutedSmall">—</span>}
      <div style={{ fontSize: 13, fontWeight: 950 }}>
        {hasScore ? formatRatingFR(v!) : "—"}
        <span style={{ opacity: 0.72, fontWeight: 950 }}> /5</span>{" "}
        {typeof count === "number" && count > 0 ? (
          <span className="mutedSmall" style={{ fontWeight: 900 }}>
            • {count.toLocaleString("fr-FR")} avis
          </span>
        ) : null}
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
  const map: Record<string, { bg: string; bd: string; color: string }> = {
    partner: { bg: "rgba(251,191,36,.12)", bd: "rgba(251,191,36,.28)", color: "rgba(253,230,138,.88)" },
    watch:   { bg: "rgba(91,142,248,.10)", bd: "rgba(91,142,248,.26)", color: "rgba(147,197,253,.82)" },
    avoid:   { bg: "rgba(239,68,68,.10)",  bd: "rgba(239,68,68,.26)",  color: "rgba(252,165,165,.82)" },
    neutral: { bg: "rgba(124,92,252,.08)", bd: "rgba(124,92,252,.18)", color: "rgba(196,181,253,.80)" },
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
        color: t.color,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
        fontFamily: "'Syne',system-ui,sans-serif",
      }}
    >
      {children}
    </span>
  );
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: 22,
        border: "1px solid rgba(124,92,252,.14)",
        background: "rgba(11,9,22,.86)",
        boxShadow: "0 18px 55px rgba(0,0,0,.36), 0 0 0 1px rgba(167,139,250,.04) inset",
        backdropFilter: "blur(14px)",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* reflet haut signature */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "8%",
          right: "8%",
          height: 1,
          background:
            "linear-gradient(90deg,transparent,rgba(167,139,250,.32) 40%,rgba(91,142,248,.22) 60%,transparent)",
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Logo backdrop (identique à l'original)
───────────────────────────────────────────── */
function LogoBackdrop({
  url,
  variant = "default",
}: {
  url: string | null | undefined;
  variant?: "default" | "podium";
}) {
  const hasUrl = Boolean(url);
  const opacityImg = variant === "podium" ? 0.22 : 0.58;

  return (
    <>
      {!hasUrl ? (
        <>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: -2,
              background:
                "radial-gradient(900px 320px at 20% 0%, rgba(124,92,252,.12), transparent 60%), " +
                "radial-gradient(900px 320px at 90% 10%, rgba(59,77,200,.14), transparent 62%), " +
                "repeating-linear-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,.05) 1px, transparent 1px, transparent 10px)",
              opacity: variant === "podium" ? 0.85 : 0.75,
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.28))",
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        <>
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
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                variant === "podium"
                  ? "linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,.22) 55%, rgba(0,0,0,.62)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,.06), transparent 60%)"
                  : "linear-gradient(90deg, rgba(0,0,0,.06), rgba(0,0,0,.26) 55%, rgba(0,0,0,.64))",
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
   CasinoCard — Purple Velvet
───────────────────────────────────────────── */
function CasinoCard({ c }: { c: CasinoListItem }) {
  const isPartner = c.featuredRank != null;
  const isWatch   = c.watchLevel === "watch";
  const isAvoid   = c.watchLevel === "avoid";
  const tone = isPartner ? "partner" : isAvoid ? "avoid" : isWatch ? "watch" : "neutral";
  const lunaRating = getLunaRating(c as any);

  const borderColor = isPartner
    ? "rgba(251,191,36,.22)"
    : isAvoid
    ? "rgba(239,68,68,.20)"
    : isWatch
    ? "rgba(91,142,248,.20)"
    : "rgba(124,92,252,.14)";

  const bg = isPartner
    ? "radial-gradient(700px 220px at 20% 0%, rgba(251,191,36,.14), transparent 60%), rgba(11,9,22,.86)"
    : isAvoid
    ? "radial-gradient(700px 220px at 20% 0%, rgba(239,68,68,.08), transparent 60%), rgba(11,9,22,.86)"
    : isWatch
    ? "radial-gradient(700px 220px at 20% 0%, rgba(91,142,248,.08), transparent 60%), rgba(11,9,22,.86)"
    : "radial-gradient(700px 220px at 20% 0%, rgba(124,92,252,.10), transparent 60%), rgba(11,9,22,.86)";

  return (
    <Link
      to={`/casinos/${encodeURIComponent(c.slug)}`}
      style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
    >
      <div
        style={{
          height: "100%",
          padding: 14,
          position: "relative",
          overflow: "hidden",
          borderRadius: 22,
          border: `1px solid ${borderColor}`,
          background: bg,
          boxShadow: "0 14px 44px rgba(0,0,0,.36)",
          backdropFilter: "blur(14px)",
          display: "flex",
          flexDirection: "column",
          transition: "transform 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms ease, border-color 180ms ease",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px) scale(1.005)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 22px 64px rgba(0,0,0,.50)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.transform = "";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 14px 44px rgba(0,0,0,.36)";
        }}
      >
        {/* reflet haut */}
        <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1, pointerEvents:"none",
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,.12) 45%,rgba(255,255,255,.08) 65%,transparent)" }} />

        <LogoBackdrop url={c.logoUrl} variant="default" />

        <div style={{ position: "relative", display: "grid", gap: 10, height: "100%", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 16,
                  fontFamily: "'Syne',system-ui,sans-serif",
                  fontWeight: 800,
                  letterSpacing: -0.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.name}
              </div>

              <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                <RatingLine label="LunaLive" avg={lunaRating} />
                <RatingLine label="Communauté" avg={c.avgRating} count={c.ratingsCount} emptyText="Aucun avis pour le moment" />
              </div>

              {c.bonusHeadline ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(124,92,252,.14)",
                    background: "rgba(0,0,0,.22)",
                    fontWeight: 700,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  🎁 {c.bonusHeadline}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
              {isPartner ? <Pill tone="partner">⭐ Partner</Pill> : null}
              {isAvoid   ? <Pill tone="avoid">⛔ À éviter</Pill> : null}
              {!isAvoid && isWatch ? <Pill tone="watch">👀 Surveillance</Pill> : null}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div className="mutedSmall" style={{ fontWeight: 900 }} />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: 999,
                border: "1px solid rgba(124,92,252,.20)",
                background: "rgba(124,92,252,.08)",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(196,181,253,.80)",
                fontFamily: "'Syne',system-ui,sans-serif",
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
                  ? "linear-gradient(90deg, transparent, rgba(251,191,36,.44), transparent)"
                  : tone === "avoid"
                  ? "linear-gradient(90deg, transparent, rgba(239,68,68,.40), transparent)"
                  : tone === "watch"
                  ? "linear-gradient(90deg, transparent, rgba(91,142,248,.38), transparent)"
                  : "linear-gradient(90deg, transparent, rgba(124,92,252,.22), rgba(91,142,248,.15), transparent)",
              opacity: 0.9,
            }}
          />
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────
   PodiumCard — Purple Velvet
───────────────────────────────────────────── */
function PodiumCard({ rank, c }: { rank: 1 | 2 | 3; c: CasinoListItem }) {
  const ring =
    rank === 1 ? "rgba(251,191,36,.32)"
    : rank === 2 ? "rgba(186,230,253,.26)"
    : "rgba(167,139,250,.26)";

  const glow =
    rank === 1
      ? "radial-gradient(900px 280px at 20% 0%, rgba(251,191,36,.20), transparent 60%)"
      : rank === 2
      ? "radial-gradient(900px 280px at 20% 0%, rgba(186,230,253,.18), transparent 60%)"
      : "radial-gradient(900px 280px at 20% 0%, rgba(167,139,250,.18), transparent 60%)";

  const crown = rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉";
  const lunaRating = getLunaRating(c as any);

  return (
    <Link
      to={`/casinos/${encodeURIComponent(c.slug)}`}
      style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
    >
      <div
        style={{
          height: "100%",
          padding: 16,
          position: "relative",
          overflow: "hidden",
          borderRadius: 22,
          border: `1px solid ${ring}`,
          background: `${glow}, rgba(11,9,22,.88)`,
          boxShadow: "0 18px 55px rgba(0,0,0,.40)",
          backdropFilter: "blur(16px)",
          display: "flex",
          flexDirection: "column",
          transition: "transform 180ms cubic-bezier(.22,1,.36,1)",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px) scale(1.006)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
      >
        {/* reflet haut */}
        <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1, pointerEvents:"none",
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,.14) 45%,rgba(255,255,255,.10) 65%,transparent)" }} />

        <LogoBackdrop url={c.logoUrl} variant="podium" />

        <div style={{ position: "relative", display: "grid", gap: 12, height: "100%", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <Pill tone="partner">{crown} Top #{rank}</Pill>
            <Pill tone="neutral" title="Emplacement premium partenaire">Premium</Pill>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 18, fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800, letterSpacing: -0.4 }}>
              {c.name}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <RatingLine label="LunaLive" avg={lunaRating} />
              <RatingLine label="Communauté" avg={c.avgRating} count={c.ratingsCount} emptyText="Aucun avis pour le moment" />
            </div>
          </div>

          {c.bonusHeadline ? (
            <div
              style={{
                padding: "12px",
                borderRadius: 16,
                border: "1px solid rgba(124,92,252,.14)",
                background: "rgba(0,0,0,.22)",
                fontWeight: 700,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              🎁 Offre partenaire : <span style={{ opacity: 0.95 }}>{c.bonusHeadline}</span>
            </div>
          ) : null}

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div className="mutedSmall" style={{ fontWeight: 900 }} />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderRadius: 999,
                border: "1px solid rgba(124,92,252,.20)",
                background: "rgba(124,92,252,.08)",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(196,181,253,.80)",
                fontFamily: "'Syne',system-ui,sans-serif",
              }}
            >
              Voir →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────
   Page — logique 100% identique à l'original
───────────────────────────────────────────── */
type SortMode = "luna" | "community" | "newest";

export default function CasinosPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <CasinosPageMobile />;
  return <CasinosPageDesktop />;
}

function CasinosPageDesktop() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr]         = React.useState<string | null>(null);
  const [data, setData]       = React.useState<CasinoListResp | null>(null);
  const [q, setQ]             = React.useState("");
  const [sortMode, setSortMode] = React.useState<SortMode>("luna");
  const [partnerOpen, setPartnerOpen] = React.useState(false);

  async function load(next?: { q?: string; sortMode?: SortMode }) {
    setLoading(true); setErr(null);
    try {
      const qv = (next?.q ?? q).trim() || null;
      const sm = next?.sortMode ?? sortMode;
      const apiSort = sm === "newest" ? "newest" : "top";
      const r = await listCasinos({ q: qv, sort: apiSort as any });
      setData(r);
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  React.useEffect(() => {
    setSeo({
      title: "Casinos — Avis, notes et partenaires | LunaLive",
      description:
        "Découvre les casinos présents sur LunaLive : notes LunaLive, avis de la communauté, bonus, partenaires et pages détaillées.",
      path: "/casinos",
    });
  }, []);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const casinosSorted = React.useMemo(() => {
    if (!data) return [];
    const arr = [...data.casinos];
    if (sortMode === "newest") return arr;
    const getKey = (c: CasinoListItem) => {
      if (sortMode === "community") return Number.isFinite(Number(c.avgRating)) ? Number(c.avgRating) : -1;
      const lr = getLunaRating(c as any); return lr == null ? -1 : lr;
    };
    arr.sort((a, b) => {
      const ka = getKey(a), kb = getKey(b); if (kb !== ka) return kb - ka;
      if (sortMode === "community") {
        const ca = Number(a.ratingsCount ?? 0), cb = Number(b.ratingsCount ?? 0);
        if (cb !== ca) return cb - ca;
      }
      const fa = a.featuredRank == null ? 999999 : a.featuredRank;
      const fb = b.featuredRank == null ? 999999 : b.featuredRank;
      if (fa !== fb) return fa - fb;
      return String(a.name).localeCompare(String(b.name), "fr");
    });
    return arr;
  }, [data, sortMode]);

  const podium = React.useMemo(() => {
    if (!data) return [];
    const arr = [...data.casinos];
    arr.sort((a, b) => {
      const la = getLunaRating(a as any), lb = getLunaRating(b as any);
      const ka = la == null ? -1 : la, kb = lb == null ? -1 : lb;
      if (kb !== ka) return kb - ka;
      const fa = a.featuredRank == null ? 999999 : a.featuredRank;
      const fb = b.featuredRank == null ? 999999 : b.featuredRank;
      if (fa !== fb) return fa - fb;
      return String(a.name).localeCompare(String(b.name), "fr");
    });
    return arr.slice(0, 3);
  }, [data]);

  return (
    <main className="container checktaslotPage">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

        .checktaslotPage {
          position: relative;
          padding-bottom: 26px;
        }
        .checktaslotPage::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(1100px 420px at 18% 0%, rgba(124,92,252,.20), transparent 62%),
            radial-gradient(1200px 500px at 80% 10%, rgba(91,142,248,.18), transparent 62%),
            radial-gradient(1200px 600px at 50% 95%, rgba(59,77,200,.16), transparent 64%),
            linear-gradient(180deg, transparent, rgba(0,0,0,.06));
          transform: translateZ(0);
        }
        .checktaslotWrap {
          position: relative;
          z-index: 1;
          border-radius: 26px;
          border: 1px solid rgba(124,92,252,.15);
          background: rgba(11,9,22,.88);
          box-shadow: 0 20px 70px rgba(0,0,0,.42), 0 0 0 1px rgba(167,139,250,.04) inset;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          padding: 16px;
          overflow: hidden;
        }
        .checktaslotWrap::before {
          content: "";
          position: absolute;
          top: 0; left: 8%; right: 8%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(167,139,250,.38) 40%, rgba(91,142,248,.28) 60%, transparent);
          pointer-events: none;
        }
        .checktaslotTitle span {
          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 800;
          letter-spacing: -1.0px;
        }
        .checktaslotTitle .w1 {
          background: linear-gradient(90deg, #c4b5fd, #7c5cfc);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 18px rgba(124,92,252,.55));
        }
        .checktaslotTitle .w2 {
          background: linear-gradient(90deg, rgba(235,232,255,.92), rgba(186,230,253,.90));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .checktaslotTitle .w3 {
          background: linear-gradient(90deg, #5b8ef8, #34d399);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 14px rgba(91,142,248,.50));
        }
        .checktaslotH2 {
          margin: 0;
          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 800;
          letter-spacing: -0.6px;
          background: linear-gradient(90deg, #fbbf24, #a78bfa, #5b8ef8);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 8px 20px rgba(0,0,0,.35));
        }
        .cts-search-wrap {
          flex: 1 1 320px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 13px;
          border-radius: 14px;
          border: 1px solid rgba(124,92,252,.18);
          background: rgba(124,92,252,.06);
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .cts-search-wrap:focus-within {
          border-color: rgba(124,92,252,.40);
          box-shadow: 0 0 0 3px rgba(124,92,252,.10);
        }
        .cts-search-wrap input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: inherit;
          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 700;
        }
        .cts-btn-primary {
          height: 40px; padding: 0 16px; border-radius: 13px; cursor: pointer;
          font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700;
          border: 1px solid rgba(124,92,252,.30);
          background: linear-gradient(135deg, rgba(124,92,252,.26), rgba(59,77,200,.18), rgba(91,142,248,.12));
          color: rgba(235,232,255,.94);
          transition: filter 140ms ease, transform 120ms ease;
        }
        .cts-btn-primary:hover:not(:disabled) { filter: brightness(1.12); }
        .cts-btn-primary:disabled { opacity: .45; cursor: not-allowed; }
        .cts-btn-primary:active { transform: scale(.97); }
        .cts-btn-ghost {
          height: 40px; padding: 0 14px; border-radius: 13px; cursor: pointer;
          font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700;
          border: 1px solid rgba(124,92,252,.14); background: rgba(124,92,252,.05);
          color: rgba(200,195,240,.70);
          transition: background 130ms ease, border-color 130ms ease;
        }
        .cts-btn-ghost:hover { background: rgba(124,92,252,.12); border-color: rgba(124,92,252,.26); }
        .cts-select {
          padding: 10px 13px; border-radius: 13px;
          border: 1px solid rgba(124,92,252,.16); background: rgba(11,9,22,.90);
          color: rgba(200,195,240,.80); cursor: pointer;
          font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700;
          outline: none; appearance: none; -webkit-appearance: none; padding-right: 28px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(167,139,250,0.6)'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
        }
        .cts-watchcard {
          border-radius: 18px; padding: 14px;
          position: relative; overflow: hidden;
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        .cts-card-enter {
          animation: cts-card-in 320ms cubic-bezier(.22,1,.36,1) both;
        }
        @keyframes cts-card-in {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      <PartnerPlansModal open={partnerOpen} onClose={() => setPartnerOpen(false)} />

      <div className="checktaslotWrap">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="checktaslotTitle" style={{ fontSize: 34, lineHeight: 1.05, margin: 0 }}>
              <span className="w1">Check</span>
              <span className="w2">Ta</span>
              <span className="w3">Slot</span>
            </h1>
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

        {/* Partner strip */}
        <div style={{ marginTop: 12 }}>
          <GlassCard
            style={{
              padding: 12,
              borderRadius: 18,
              borderColor: "rgba(251,191,36,.16)",
              background:
                "radial-gradient(900px 220px at 15% 0%, rgba(251,191,36,.12), transparent 60%), " +
                "radial-gradient(900px 220px at 80% 20%, rgba(124,92,252,.12), transparent 60%), " +
                "rgba(11,9,22,.86)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "grid", gap: 3, minWidth: 260 }}>
                <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700 }}>
                  🤝 <span style={{ opacity: 0.92 }}>Vous êtes un casino sérieux ?</span>{" "}
                  <span className="mutedSmall">Apparaissez ici.</span>
                </div>
                <div className="mutedSmall" style={{ opacity: 0.95 }}>
                  🇬🇧 <b>Serious casino?</b> Get featured here.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="cts-btn-ghost" type="button" onClick={() => setPartnerOpen(true)}>
                  Become partner
                </button>
                <button className="cts-btn-primary" type="button" onClick={() => load()} disabled={loading}>
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
              <div className="cts-search-wrap">
                <span style={{ opacity: 0.7 }}>🔎</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher un casino…"
                  onKeyDown={(e) => { if (e.key === "Enter") load({ q: e.currentTarget.value, sortMode }); }}
                />
              </div>

              <select
                className="cts-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="luna">Top LunaLive</option>
                <option value="community">Top Communauté</option>
                <option value="newest">Nouveaux</option>
              </select>

              <button className="cts-btn-primary" type="button" onClick={() => load()} disabled={loading}>
                {loading ? "Chargement…" : "Rechercher"}
              </button>
            </div>
          </GlassCard>
        </div>

        {loading && <div className="muted" style={{ marginTop: 12 }}>Chargement…</div>}
        {err    && <div className="alert" style={{ marginTop: 12 }}>{err}</div>}

        {!loading && data && (
          <>
            {/* PODIUM */}
            {podium?.length > 0 && (
              <section style={{ marginTop: 16 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h2 className="checktaslotH2">Podium</h2>
                  <div className="mutedSmall">Basé sur la note LunaLive.</div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 14,
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    alignItems: "stretch",
                  }}
                >
                  {podium.slice(0, 3).map((c, i) => (
                    <PodiumCard key={c.id} rank={(i + 1) as 1 | 2 | 3} c={c} />
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
                    alignItems: "stretch",
                  }}
                >
                  {data.watchlist.map((c) => {
                    const tone = c.watchLevel === "avoid" ? "avoid" : "watch";
                    return (
                      <div
                        key={c.id}
                        className="cts-watchcard"
                        style={{
                          height: "100%",
                          border: `1px solid ${tone === "avoid" ? "rgba(239,68,68,.22)" : "rgba(91,142,248,.20)"}`,
                          background: tone === "avoid"
                            ? "linear-gradient(160deg, rgba(239,68,68,.07), rgba(11,9,22,.88))"
                            : "linear-gradient(160deg, rgba(91,142,248,.07), rgba(11,9,22,.88))",
                        }}
                      >
                        <LogoBackdrop url={c.logoUrl} variant="default" />
                        <div style={{ position: "relative" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800 }}>{c.name}</div>
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
                      </div>
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

              {casinosSorted.length === 0 ? (
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
                    alignItems: "stretch",
                  }}
                >
                  {casinosSorted.map((c, idx) => (
                    <div key={c.id} className="cts-card-enter" style={{ animationDelay: `${Math.min(idx, 18) * 30}ms` }}>
                      <CasinoCard c={c} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="mutedSmall" style={{ marginTop: 16, opacity: 0.9 }}>
              18+ • Jouez responsable •
            </div>
          </>
        )}
      </div>
    </main>
  );
}