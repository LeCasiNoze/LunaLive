// web/src/pages/CasinosPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { listCasinos, type CasinoListItem, type CasinoListResp } from "../lib/api_casinos";
import { PartnerPlansModal } from "../components/PartnerPlansModal";

/* ─────────────────────────────────────────────
   Utils + UI atoms (inline)
───────────────────────────────────────────── */
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// 1 décimale seulement si nécessaire (ex: 5 -> "5", 4.2 -> "4,2")
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

function Stars({ value }: { value: number }) {
  const v = clamp(value, 0, 5);
  const full = Math.round(v); // simple, cohérent avec ton style actuel
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

  // Cas "communauté" sans avis
  if ((count ?? null) === 0 || (count == null && !hasScore)) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="mutedSmall" style={{ fontWeight: 950 }}>
          {label}
        </div>
        <div className="mutedSmall">{emptyText ?? "Aucun avis pour le moment"}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div className="mutedSmall" style={{ fontWeight: 950 }}>
        {label}
      </div>

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

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

/**
 * NOTE LUNALIVE: je gère plusieurs noms possibles en fallback.
 * Ajuste si ton API a un champ précis.
 */
function getLunaRating(c: any): number | null {
  const raw =
    c?.teamRating ??
    c?.team_rating ??
    c?.team_rating_value ??
    null;

  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? clamp(n, 0, 5) : null;
}

function CasinoCard({ c }: { c: CasinoListItem }) {
  const isPartner = c.featuredRank != null;
  const isWatch = c.watchLevel === "watch";
  const isAvoid = c.watchLevel === "avoid";
  const tone = isPartner ? "partner" : isAvoid ? "avoid" : isWatch ? "watch" : "neutral";

  const lunaRating = getLunaRating(c as any);

  return (
    <Link
      to={`/casinos/${encodeURIComponent(c.slug)}`}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
        height: "100%",
      }}
    >
      <GlassCard
        style={{
          height: "100%", // ✅ permet au grid de "stretch" correctement
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

        <div style={{ position: "relative", display: "grid", gap: 10, height: "100%" }}>
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

              {/* ✅ 2 notes: LunaLive au-dessus, communauté en dessous */}
              <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                <RatingLine label="LunaLive" avg={lunaRating} />
                <RatingLine
                  label="Communauté"
                  avg={c.avgRating}
                  count={c.ratingsCount}
                  emptyText="Aucun avis pour le moment"
                />
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

                    // ✅ évite que certaines cards deviennent plus hautes
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

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {isPartner ? <Pill tone="partner">⭐ Partner</Pill> : null}
              {isAvoid ? <Pill tone="avoid">⛔ À éviter</Pill> : null}
              {!isAvoid && isWatch ? <Pill tone="watch">👀 Surveillance</Pill> : null}
            </div>
          </div>

          {/* push CTA en bas */}
          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div className="mutedSmall" style={{ fontWeight: 900 }}></div>
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

  const lunaRating = getLunaRating(c as any);

  return (
    <Link
      to={`/casinos/${encodeURIComponent(c.slug)}`}
      style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
    >
      <GlassCard
        style={{
          height: "100%",
          padding: 16,
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${ring}`,
          background: `${glow}, linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))`,
        }}
      >
        <LogoBackdrop url={c.logoUrl} variant="podium" />

        <div style={{ position: "relative", display: "grid", gap: 12, height: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <Pill tone="partner">{crown} Top #{rank}</Pill>
            <Pill tone="neutral" title="Emplacement premium partenaire">
              Premium
            </Pill>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 1300, letterSpacing: -0.35 }}>{c.name}</div>

            {/* Podium basé sur LunaLive, mais on affiche aussi la commu */}
            <div style={{ display: "grid", gap: 6 }}>
              <RatingLine label="LunaLive" avg={lunaRating} />
              <RatingLine
                label="Communauté"
                avg={c.avgRating}
                count={c.ratingsCount}
                emptyText="Aucun avis pour le moment"
              />
            </div>
          </div>

          {c.bonusHeadline ? (
            <div
              style={{
                padding: "12px 12px",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
                fontWeight: 1000,

                // clamp 2 lignes
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
            <div className="mutedSmall" style={{ fontWeight: 900 }}></div>
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

type SortMode = "luna" | "community" | "newest";

export default function CasinosPage() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<CasinoListResp | null>(null);

  const [q, setQ] = React.useState("");
  const [sortMode, setSortMode] = React.useState<SortMode>("luna");

  const [partnerOpen, setPartnerOpen] = React.useState(false);

  async function load(next?: { q?: string; sortMode?: SortMode }) {
    setLoading(true);
    setErr(null);
    try {
      const qv = (next?.q ?? q).trim() || null;
      const sm = next?.sortMode ?? sortMode;

      // API: on garde "top/newest", et on trie côté client entre luna/community.
      const apiSort = sm === "newest" ? "newest" : "top";

      const r = await listCasinos({ q: qv, sort: apiSort as any });
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

  // Casinos triés (client-side) selon mode
  const casinosSorted = React.useMemo(() => {
    if (!data) return [];
    const arr = [...data.casinos];

    if (sortMode === "newest") return arr; // l’API s’en charge

    const getKey = (c: CasinoListItem) => {
      if (sortMode === "community") return Number.isFinite(Number(c.avgRating)) ? Number(c.avgRating) : -1;
      const lr = getLunaRating(c as any);
      return lr == null ? -1 : lr;
    };

    arr.sort((a, b) => {
      const ka = getKey(a);
      const kb = getKey(b);
      if (kb !== ka) return kb - ka;
      // tie-break: nombre d’avis (si community) sinon featuredRank puis nom
      if (sortMode === "community") {
        const ca = Number(a.ratingsCount ?? 0);
        const cb = Number(b.ratingsCount ?? 0);
        if (cb !== ca) return cb - ca;
      }
      const fa = a.featuredRank == null ? 999999 : a.featuredRank;
      const fb = b.featuredRank == null ? 999999 : b.featuredRank;
      if (fa !== fb) return fa - fb;
      return String(a.name).localeCompare(String(b.name), "fr");
    });

    return arr;
  }, [data, sortMode]);

  // Podium: top 3 selon LunaLive (priorité)
  const podium = React.useMemo(() => {
    if (!data) return [];
    const arr = [...data.casinos];
    arr.sort((a, b) => {
      const la = getLunaRating(a as any);
      const lb = getLunaRating(b as any);
      const ka = la == null ? -1 : la;
      const kb = lb == null ? -1 : lb;
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

      <PartnerPlansModal open={partnerOpen} onClose={() => setPartnerOpen(false)} />

      <div className="checktaslotWrap">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ display: "grid", gap: 6 }}>
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
                <button className="btnGhost" type="button" onClick={() => setPartnerOpen(true)}>
                  Become partner
                </button>
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
                    if (e.key === "Enter") load({ q: e.currentTarget.value, sortMode });
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

              {/* ✅ tri: LunaLive / Communauté / Nouveaux */}
              <select
                className="select"
                value={sortMode}
                onChange={(e) => {
                  const v = e.target.value as SortMode;
                  setSortMode(v);
                }}
              >
                <option value="luna">Top LunaLive</option>
                <option value="community">Top Communauté</option>
                <option value="newest">Nouveaux</option>
              </select>

              <button className="btnPrimary" onClick={() => load()} disabled={loading}>
                {loading ? "Chargement…" : "Rechercher"}
              </button>
            </div>
          </GlassCard>
        </div>

        {loading && <div className="muted" style={{ marginTop: 12 }}>Chargement…</div>}
        {err && <div className="alert" style={{ marginTop: 12 }}>{err}</div>}

        {!loading && data && (
          <>
            {/* PODIUM (basé sur LunaLive) */}
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
                    alignItems: "stretch", // ✅ uniformise les hauteurs dans la rangée
                  }}
                >
                  {podium.slice(0, 3).map((c, i) => (
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
                    alignItems: "stretch",
                  }}
                >
                  {data.watchlist.map((c) => {
                    const tone = c.watchLevel === "avoid" ? "avoid" : "watch";
                    return (
                      <GlassCard
                        key={c.id}
                        style={{
                          height: "100%",
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
                    alignItems: "stretch", // ✅ FIX: plus de card qui "grossit" seule
                  }}
                >
                  {casinosSorted.map((c) => (
                    <CasinoCard key={c.id} c={c} />
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
