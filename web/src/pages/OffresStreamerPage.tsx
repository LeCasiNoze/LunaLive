// web/src/pages/OffresStreamerPage.tsx
import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { setSeo } from "../lib/seo";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type OffreData = {
  streamer_slug: string;
  offer_label: string | null;
  offer_detail: string | null;
  process_info: string | null;
  discord_url: string | null;
  extra_url: string | null;
};

// ─── helpers visuels ──────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(14,11,26,0.72)",
      border: "1px solid rgba(124,92,252,0.18)",
      borderRadius: 16,
      padding: "28px 28px",
      backdropFilter: "blur(12px)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block",
      background: "rgba(124,92,252,0.18)",
      color: "#a78bfa",
      border: "1px solid rgba(124,92,252,0.30)",
      borderRadius: 999,
      padding: "3px 14px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
      <div style={{
        flexShrink: 0,
        width: 36, height: 36,
        borderRadius: "50%",
        background: "linear-gradient(135deg,#7c5cfc,#5b8ef8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 15, color: "#fff",
        boxShadow: "0 4px 18px rgba(124,92,252,0.35)",
      }}>
        {n}
      </div>
      <div style={{ paddingTop: 6, fontSize: 15, lineHeight: 1.6, color: "rgba(235,232,255,0.88)" }}>
        {children}
      </div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "linear-gradient(135deg,#7c5cfc,#5b8ef8)",
        color: "#fff",
        borderRadius: 12,
        padding: "12px 22px",
        fontWeight: 700,
        fontSize: 14,
        textDecoration: "none",
        boxShadow: "0 4px 24px rgba(124,92,252,0.35)",
        transition: "opacity .15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
    >
      {children}
    </a>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function OffresStreamerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = React.useState<OffreData | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ok" | "notfound" | "error">("loading");

  React.useEffect(() => {
    if (!slug) { setStatus("notfound"); return; }

    fetch(`${BASE}/api/offres-streamers/${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then((j: any) => {
        if (j.ok) { setData(j.data); setStatus("ok"); }
        else setStatus("notfound");
      })
      .catch(() => setStatus("error"));
  }, [slug]);

  React.useEffect(() => {
    if (status === "ok" && data) {
      setSeo({
        title: `Offre ${data.streamer_slug} — LunaLive`,
        description: data.offer_label
          ? `${data.offer_label} — Offre exclusive via ${data.streamer_slug} sur LunaLive`
          : `Découvrez l'offre exclusive de ${data.streamer_slug} sur LunaLive`,
        path: `/offres_streamers/${data.streamer_slug}`,
        robots: "noindex",
      });
    }
  }, [status, data]);

  const styles = {
    wrap: {
      minHeight: "100vh",
      background: "#090610",
      color: "rgba(235,232,255,0.94)",
      fontFamily: "system-ui, sans-serif",
    } as React.CSSProperties,
    inner: {
      maxWidth: 640,
      margin: "0 auto",
      padding: "48px 20px 80px",
    } as React.CSSProperties,
  };

  // ── États de chargement ──────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div style={styles.wrap}>
        <div style={styles.inner}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "rgba(200,195,240,.5)", fontSize: 15 }}>
            <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid #7c5cfc", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            Chargement…
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div style={styles.wrap}>
        <div style={styles.inner}>
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#c4b5fd", marginBottom: 8 }}>Offre introuvable</h1>
            <p style={{ color: "rgba(200,195,240,.55)", marginBottom: 32 }}>Cette page d'offre n'existe pas ou n'est plus active.</p>
            <Link to="/" style={{ color: "#7c5cfc", fontWeight: 600 }}>← Retour à LunaLive</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Découpe process_info en étapes si elle contient des lignes numérotées
  const steps = (data.process_info ?? "")
    .split("\n")
    .map(l => l.replace(/^\d+\s*[-.)]\s*/, "").trim())
    .filter(Boolean);

  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>

        {/* Header */}
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <Badge>Offre exclusive</Badge>
          <h1 style={{ fontSize: 30, fontWeight: 900, marginTop: 16, marginBottom: 6, background: "linear-gradient(135deg,#c4b5fd,#7c5cfc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {data.offer_label ?? `Offre ${data.streamer_slug}`}
          </h1>
          <p style={{ fontSize: 15, color: "rgba(200,195,240,.60)", marginBottom: 0 }}>
            Proposée par{" "}
            <Link to={`/s/${data.streamer_slug}`} style={{ color: "#a78bfa", fontWeight: 700, textDecoration: "none" }}>
              @{data.streamer_slug}
            </Link>
            {" "}sur LunaLive
          </p>
        </div>

        {/* Offre card */}
        <Card style={{ marginBottom: 20, background: "linear-gradient(135deg,rgba(124,92,252,0.12),rgba(91,142,248,0.08))", border: "1px solid rgba(124,92,252,0.30)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: data.offer_detail ? 10 : 0 }}>
            <span style={{ fontSize: 26 }}>🎁</span>
            <span style={{ fontSize: 19, fontWeight: 800, color: "#c4b5fd" }}>
              {data.offer_label ?? "Offre exclusive"}
            </span>
          </div>
          {data.offer_detail && (
            <p style={{ margin: "0 0 0 38px", fontSize: 15, color: "rgba(235,232,255,0.80)", lineHeight: 1.55 }}>
              {data.offer_detail}
            </p>
          )}
        </Card>

        {/* Étapes */}
        {steps.length > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#a78bfa", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📋</span> Comment en profiter
            </h2>
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <Step n={i + 1}>{s}</Step>
                {i === 0 && data.extra_url && (
                  <div style={{ marginLeft: 52, marginTop: -12, marginBottom: 20 }}>
                    <ExternalLink href={data.extra_url}>
                      <span>👉</span> Accéder à l'offre
                    </ExternalLink>
                  </div>
                )}
                {i === 1 && (
                  <div style={{ marginLeft: 52, marginTop: -12, marginBottom: 20, fontSize: 13, color: "rgba(200,195,240,.60)", lineHeight: 1.6 }}>
                    Si tu n'as pas de wallet crypto, tu peux te créer un compte CoinBase en 5 min ici :{" "}
                    <a
                      href="https://coinbase.com/join/X8DGKD8?src=referral-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#a78bfa", fontWeight: 600, textDecoration: "none" }}
                    >
                      coinbase.com/join/X8DGKD8
                    </a>
                  </div>
                )}
              </React.Fragment>
            ))}
          </Card>
        )}

        {/* Discord */}
        {data.discord_url && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>💬</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "rgba(235,232,255,.92)" }}>Besoin d'aide ?</div>
                <div style={{ fontSize: 13, color: "rgba(200,195,240,.55)", marginTop: 2 }}>Ouvre un ticket sur le Discord du streamer</div>
              </div>
            </div>
            <ExternalLink href={data.discord_url}>
              <span>🎮</span> Rejoindre le Discord
            </ExternalLink>
          </Card>
        )}

        {/* Streamer live */}
        <Card style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "rgba(200,195,240,.55)", marginBottom: 14 }}>Retrouve le streamer en live sur LunaLive</div>
          <Link
            to={`/s/${data.streamer_slug}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(124,92,252,0.15)",
              color: "#a78bfa",
              border: "1px solid rgba(124,92,252,0.30)",
              borderRadius: 12,
              padding: "10px 20px",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            <span>📺</span> Voir la page de @{data.streamer_slug}
          </Link>
        </Card>

        {/* Footer nav */}
        <div style={{ textAlign: "center", fontSize: 12, color: "rgba(160,155,210,.40)" }}>
          <Link to="/" style={{ color: "rgba(124,92,252,.7)", textDecoration: "none" }}>← LunaLive</Link>
          {" · "}
          <Link to="/browse" style={{ color: "rgba(124,92,252,.7)", textDecoration: "none" }}>Streamers</Link>
          {" · "}
          <Link to="/casinos" style={{ color: "rgba(124,92,252,.7)", textDecoration: "none" }}>Casinos</Link>
        </div>

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
