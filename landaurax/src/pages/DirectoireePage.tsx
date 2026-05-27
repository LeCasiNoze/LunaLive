// Directoire cache — liste de toutes les landings publiees, accessible
// uniquement via URL directe /__directoire. Aucun lien depuis le site.
//
// Stack visuelle V3 : aurora animée, grid de cards avec tilt 3D au survol,
// stagger entrance via framer-motion, filtre live, switch domain.

import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

type Item = {
  id: number;
  slug: string;
  model: number;
  variant: string | null;
  brandName: string;
  title: string;
  editorVersion: number;
  publishDomain: "lunalive" | "landaurax";
  updatedAt: string | null;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const LANDAURAX_HOST = "https://landaurax.onrender.com";
const LUNALIVE_HOST = "https://lunalive.win";

function urlFor(item: Item): string {
  if (item.publishDomain === "landaurax") return `${LANDAURAX_HOST}/${item.slug}`;
  return `${LUNALIVE_HOST}/r/${item.slug}`;
}

function modelLabel(item: Item): string {
  if (item.editorVersion === 2) return `M${item.model}·V2`;
  return `M${item.model}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const d = Date.now() - t;
  const s = Math.round(d / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const j = Math.round(h / 24);
  if (j < 30) return `il y a ${j}j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

// ─── Card avec tilt 3D + glow magnetic ─────────────────────────────────────
function LandingCard({ item, index }: { item: Item; index: number }) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(50);
  const sRotateX = useSpring(rotateX, { stiffness: 200, damping: 18 });
  const sRotateY = useSpring(rotateY, { stiffness: 200, damping: 18 });
  const sGlowX = useSpring(glowX, { stiffness: 240, damping: 26 });
  const sGlowY = useSpring(glowY, { stiffness: 240, damping: 26 });

  const onMove = (e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 8);
    rotateX.set((0.5 - py) * 8);
    glowX.set(px * 100);
    glowY.set(py * 100);
  };
  const onLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    glowX.set(50);
    glowY.set(50);
  };

  const isLandaurax = item.publishDomain === "landaurax";
  const accentColor = isLandaurax ? "#e0115f" : "#7c4dff";
  const accentGlow = isLandaurax ? "rgba(224,17,95,0.32)" : "rgba(124,77,255,0.32)";
  const url = urlFor(item);

  const bgImage = useTransform([sGlowX, sGlowY], ([x, y]) =>
    `radial-gradient(420px circle at ${x}% ${y}%, ${accentGlow}, transparent 55%)`
  );

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 18) * 0.035, ease: [0.22, 1, 0.36, 1] }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        position: "relative",
        background: "linear-gradient(155deg, rgba(28,18,40,0.92) 0%, rgba(14,9,22,0.96) 100%)",
        border: `1px solid rgba(255,255,255,0.06)`,
        borderRadius: 20,
        padding: "20px 22px",
        overflow: "hidden",
        cursor: "default",
        transformStyle: "preserve-3d",
        perspective: 900,
        rotateX: sRotateX,
        rotateY: sRotateY,
        boxShadow: "0 18px 44px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(255,255,255,0.02)",
      }}
    >
      {/* Glow suit le curseur */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: bgImage,
          pointerEvents: "none",
          opacity: 0.9,
        }}
      />
      {/* Border gradient subtle */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 20,
          padding: 1,
          background: `linear-gradient(135deg, ${accentColor}38 0%, transparent 40%, transparent 60%, ${accentColor}28 100%)`,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Syne', 'Space Grotesk', sans-serif",
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "-0.02em",
                color: "#fff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textShadow: `0 0 24px ${accentGlow}`,
              }}
              title={item.brandName}
            >
              {item.brandName || item.slug}
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: "'JetBrains Mono', 'Chakra Petch', monospace",
                fontSize: 11,
                color: "rgba(246,239,224,0.55)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={item.slug}
            >
              /{item.slug}
            </div>
          </div>
          <div
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: accentColor,
              border: `1px solid ${accentColor}55`,
              background: `${accentColor}11`,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {isLandaurax ? "🌹 Landaurax" : "🟣 LunaLive"}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(246,239,224,0.85)",
              background: "rgba(255,255,255,0.06)",
              letterSpacing: ".04em",
            }}
          >
            {modelLabel(item)}
          </span>
          {item.variant && (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,215,0,0.92)",
                background: "rgba(255,215,0,0.08)",
                letterSpacing: ".04em",
                textTransform: "capitalize",
              }}
            >
              {item.variant}
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              color: "rgba(246,239,224,0.42)",
              marginLeft: "auto",
            }}
          >
            {relativeTime(item.updatedAt)}
          </span>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              textAlign: "center",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "#fff",
              background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)`,
              textDecoration: "none",
              boxShadow: `0 8px 22px ${accentGlow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
              transition: "transform 0.18s ease, box-shadow 0.18s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
            }}
          >
            ↗ Ouvrir
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(url).catch(() => {});
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "rgba(246,239,224,0.78)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              cursor: "pointer",
              transition: "background 0.18s ease, color 0.18s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(246,239,224,0.78)";
            }}
            title="Copier l'URL"
          >
            📋
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Aurora bg + page principale ───────────────────────────────────────────
function Aurora() {
  return (
    <>
      <style>{`
        @keyframes auroraMove {
          0%   { transform: translate(-10%, -10%) rotate(0deg);   }
          50%  { transform: translate(10%, 10%)   rotate(180deg); }
          100% { transform: translate(-10%, -10%) rotate(360deg); }
        }
        @keyframes auroraPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @media (prefers-reduced-motion: reduce) {
          .__aurora-blob { animation: none !important; }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div
          className="__aurora-blob"
          style={{
            position: "absolute",
            top: "-30%",
            left: "-20%",
            width: "75vw",
            height: "75vw",
            borderRadius: "50%",
            background: "radial-gradient(circle at center, rgba(124,77,255,0.45), transparent 70%)",
            filter: "blur(70px)",
            animation: "auroraMove 28s linear infinite, auroraPulse 9s ease-in-out infinite",
          }}
        />
        <div
          className="__aurora-blob"
          style={{
            position: "absolute",
            bottom: "-30%",
            right: "-20%",
            width: "65vw",
            height: "65vw",
            borderRadius: "50%",
            background: "radial-gradient(circle at center, rgba(224,17,95,0.4), transparent 70%)",
            filter: "blur(80px)",
            animation: "auroraMove 36s linear infinite reverse, auroraPulse 11s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(11,9,17,0.6) 80%), repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 3px)",
            mixBlendMode: "overlay",
          }}
        />
      </div>
    </>
  );
}

export default function DirectoireePage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "lunalive" | "landaurax">("all");

  React.useEffect(() => {
    document.title = "Directoire — Landaurax";
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/public/affi-pages`, { mode: "cors", credentials: "omit" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        setItems((data.items || []) as Item[]);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || "fetch error"));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = React.useMemo(() => {
    const total = items.length;
    const landaurax = items.filter((i) => i.publishDomain === "landaurax").length;
    const lunalive = total - landaurax;
    return { total, landaurax, lunalive };
  }, [items]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== "all" && i.publishDomain !== filter) return false;
      if (!q) return true;
      return (
        i.slug.toLowerCase().includes(q) ||
        i.brandName.toLowerCase().includes(q) ||
        (i.variant && i.variant.toLowerCase().includes(q)) ||
        String(i.model).includes(q)
      );
    });
  }, [items, query, filter]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0b0911",
        color: "#f6efe0",
        fontFamily: "'Space Grotesk', 'Inter', sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <Aurora />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1280, margin: "0 auto", padding: "clamp(28px, 5vw, 64px) clamp(20px, 4vw, 44px) 80px" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "5px 14px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "rgba(224,17,95,0.95)",
              border: "1px solid rgba(224,17,95,0.4)",
              background: "rgba(224,17,95,0.08)",
              boxShadow: "0 0 24px rgba(224,17,95,0.2)",
            }}
          >
            🔒 Accès interne
          </div>
          <h1
            style={{
              margin: "16px 0 6px",
              fontFamily: "'Bagel Fat One', 'Syne', sans-serif",
              fontWeight: 400,
              fontSize: "clamp(40px, 7vw, 88px)",
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              background: "linear-gradient(180deg, #fff 0%, #f6efe0 50%, rgba(224,17,95,0.92) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "0 0 80px rgba(224,17,95,0.25)",
            }}
          >
            Le Directoire
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: "rgba(246,239,224,0.62)",
              maxWidth: 620,
              lineHeight: 1.55,
            }}
          >
            Toutes les landings actives — LunaLive &amp; Landaurax. Page non référencée, accessible uniquement via URL directe.
          </p>
        </motion.div>

        {/* Stats + filter bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          style={{
            marginTop: 32,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 16,
            padding: "16px 20px",
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(28,18,40,0.7), rgba(14,9,22,0.5))",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Counts */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <StatCount label="Total" value={counts.total} color="#fff" />
            <span style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />
            <StatCount label="LunaLive" value={counts.lunalive} color="#7c4dff" />
            <StatCount label="Landaurax" value={counts.landaurax} color="#e0115f" />
          </div>

          {/* Filter */}
          <div style={{ display: "flex", gap: 4, padding: 4, background: "rgba(0,0,0,0.25)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")} color="#fff">
              Tous
            </FilterChip>
            <FilterChip active={filter === "lunalive"} onClick={() => setFilter("lunalive")} color="#7c4dff">
              🟣 LunaLive
            </FilterChip>
            <FilterChip active={filter === "landaurax"} onClick={() => setFilter("landaurax")} color="#e0115f">
              🌹 Landaurax
            </FilterChip>
          </div>

          {/* Search */}
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <input
              type="search"
              placeholder="Filtrer par pseudo, slug, modèle…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 38px",
                borderRadius: 10,
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(224,17,95,0.5)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(224,17,95,0.12)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.5, pointerEvents: "none" }}>🔎</span>
          </div>
        </motion.div>

        {/* Grid */}
        <div style={{ marginTop: 28 }}>
          {loading && (
            <div style={{ display: "grid", placeItems: "center", padding: "80px 0", color: "rgba(246,239,224,0.5)" }}>
              <div style={{ fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase" }}>Chargement du directoire…</div>
            </div>
          )}
          {error && !loading && (
            <div style={{ padding: 24, borderRadius: 12, background: "rgba(224,17,95,0.08)", border: "1px solid rgba(224,17,95,0.3)", color: "#ffb3c8" }}>
              Erreur : {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: 48, textAlign: "center", color: "rgba(246,239,224,0.45)", fontSize: 14 }}>
              Aucune landing ne correspond.
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 18,
              }}
            >
              {filtered.map((item, idx) => (
                <LandingCard key={item.id} item={item} index={idx} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 56, textAlign: "center", fontSize: 11, color: "rgba(246,239,224,0.32)", letterSpacing: ".08em", textTransform: "uppercase" }}>
          {counts.total} landings · accès interne — ne pas partager
        </div>
      </div>
    </div>
  );
}

function StatCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "'Syne', 'Space Grotesk', sans-serif",
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color,
          lineHeight: 1,
          textShadow: color !== "#fff" ? `0 0 24px ${color}66` : "none",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 10,
          color: "rgba(246,239,224,0.5)",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".04em",
        textTransform: "uppercase",
        color: active ? (color === "#fff" ? "#0b0911" : "#fff") : "rgba(246,239,224,0.62)",
        background: active ? (color === "#fff" ? "#fff" : `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`) : "transparent",
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: active && color !== "#fff" ? `0 4px 14px ${color}55` : "none",
        transition: "background 0.18s, color 0.18s",
      }}
    >
      {children}
    </button>
  );
}
