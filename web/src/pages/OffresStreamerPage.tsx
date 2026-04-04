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

// Extract first money amount ("25€", "50 €") from a string
function extractAmount(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/(\d+(?:[,.]\d+)?)\s*€/);
  return m ? `${m[1]}€` : null;
}

// ─── Styles globaux & animations ─────────────────────────────────────────────
const GLOBAL_CSS = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
.lu-fade { animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
.lu-d1   { animation-delay: 0.04s; }
.lu-d2   { animation-delay: 0.13s; }
.lu-d3   { animation-delay: 0.22s; }
.lu-d4   { animation-delay: 0.31s; }
.lu-d5   { animation-delay: 0.40s; }
`;

// ─── Composants ──────────────────────────────────────────────────────────────

function Card({ children, style, cls }: { children: React.ReactNode; style?: React.CSSProperties; cls?: string }) {
  return (
    <div
      className={cls}
      style={{
        background: "rgba(14,11,26,0.75)",
        border: "1px solid rgba(124,92,252,0.18)",
        borderRadius: 20,
        padding: "24px 20px",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StreamerAvatar({ slug, avatarUrl }: { slug: string; avatarUrl: string | null }) {
  const [broken, setBroken] = React.useState(false);
  const src = avatarUrl && !broken ? `${BASE}${avatarUrl}` : null;
  const ring: React.CSSProperties = {
    width: 84, height: 84,
    borderRadius: "50%",
    border: "3px solid rgba(124,92,252,0.55)",
    boxShadow: "0 0 0 5px rgba(124,92,252,0.12), 0 8px 32px rgba(124,92,252,0.20)",
    flexShrink: 0,
  };
  if (src) {
    return (
      <img
        src={src}
        alt={slug}
        onError={() => setBroken(true)}
        style={{ ...ring, objectFit: "cover" }}
      />
    );
  }
  return (
    <div style={{
      ...ring,
      background: "linear-gradient(135deg,#7c5cfc,#5b8ef8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 28, fontWeight: 900, color: "#fff",
    }}>
      {slug.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StepBubble({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
      <div style={{
        flexShrink: 0,
        width: 32, height: 32,
        borderRadius: "50%",
        background: "linear-gradient(135deg,#7c5cfc,#5b8ef8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 13, color: "#fff",
        boxShadow: "0 4px 14px rgba(124,92,252,0.35)",
        marginTop: 2,
      }}>
        {n}
      </div>
      <div style={{ paddingTop: 6, fontSize: 14, lineHeight: 1.65, color: "rgba(235,232,255,0.88)" }}>
        {children}
      </div>
    </div>
  );
}

function SmallCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "rgba(124,92,252,0.14)",
        color: "#a78bfa",
        border: "1px solid rgba(124,92,252,0.32)",
        borderRadius: 10,
        padding: "7px 14px",
        fontWeight: 700, fontSize: 13,
        textDecoration: "none",
        transition: "background .15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,92,252,0.24)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(124,92,252,0.14)")}
    >
      {children}
    </a>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function OffresStreamerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = React.useState<OffreData | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
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

    // Best-effort: fetch streamer avatar
    fetch(`${BASE}/streamers/${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then((j: any) => { if (j?.data?.avatarUrl) setAvatarUrl(j.data.avatarUrl); })
      .catch(() => { /* silent */ });
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

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#0e0b1e 0%,#090610 55%)",
    color: "rgba(235,232,255,0.94)",
    fontFamily: "system-ui,-apple-system,sans-serif",
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 120 }}>
          <span style={{
            display: "inline-block", width: 22, height: 22,
            border: "2.5px solid #7c5cfc", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.7s linear infinite",
          }} />
        </div>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if (status === "notfound" || status === "error") {
    return (
      <div style={wrap}>
        <div style={{ maxWidth: 400, margin: "0 auto", padding: "90px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>🔍</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#c4b5fd", marginBottom: 8 }}>Offre introuvable</h1>
          <p style={{ color: "rgba(200,195,240,.50)", marginBottom: 32, lineHeight: 1.6 }}>
            Cette page d'offre n'existe pas ou n'est plus active.
          </p>
          <Link to="/" style={{ color: "#7c5cfc", fontWeight: 600 }}>← Retour à LunaLive</Link>
        </div>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if (!data) return null;

  const steps = (data.process_info ?? "")
    .split("\n")
    .map(l => l.replace(/^\d+\s*[-.)]\s*/, "").trim())
    .filter(Boolean);

  const amount = extractAmount(data.offer_detail) ?? extractAmount(data.offer_label);

  return (
    <div style={wrap}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "36px 16px 80px" }}>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div
          className="lu-fade lu-d1"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 28, textAlign: "center" }}
        >
          <StreamerAvatar slug={data.streamer_slug} avatarUrl={avatarUrl} />

          <div>
            {/* Badge */}
            <span style={{
              display: "inline-block",
              background: "rgba(124,92,252,0.16)",
              color: "#a78bfa",
              border: "1px solid rgba(124,92,252,0.28)",
              borderRadius: 999,
              padding: "3px 13px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}>
              🎁 Offre exclusive
            </span>

            <Link
              to={`/s/${data.streamer_slug}`}
              style={{ textDecoration: "none" }}
            >
              <h1 style={{
                fontSize: 26, fontWeight: 900, margin: "0 0 4px",
                background: "linear-gradient(135deg,#c4b5fd 30%,#7c5cfc)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                @{data.streamer_slug}
              </h1>
            </Link>

            <p style={{ fontSize: 13, color: "rgba(200,195,240,.45)", margin: 0 }}>
              Offre partenaire sur LunaLive
            </p>
          </div>
        </div>

        {/* ── Carte offre (above the fold) ────────────────────────────────── */}
        <Card
          cls="lu-fade lu-d2"
          style={{
            marginBottom: 14,
            background: "linear-gradient(145deg,rgba(124,92,252,0.13),rgba(91,142,248,0.07))",
            border: "1px solid rgba(124,92,252,0.35)",
            textAlign: "center",
            padding: "32px 24px 28px",
          }}
        >
          {/* Montant en très grand */}
          {amount && (
            <div style={{
              fontSize: 72,
              fontWeight: 900,
              lineHeight: 1,
              marginBottom: 10,
              background: "linear-gradient(135deg,#c4b5fd,#7c5cfc)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              letterSpacing: "-3px",
            }}>
              {amount}
            </div>
          )}

          {/* Détail (remplace le label dans ce cadre) */}
          {(data.offer_detail ?? data.offer_label) && (
            <p style={{ fontSize: 15, color: "rgba(235,232,255,.80)", margin: "0 0 24px", lineHeight: 1.65, fontWeight: 500 }}>
              {data.offer_detail ?? data.offer_label}
            </p>
          )}

          {/* CTA primaire */}
          {data.extra_url && (
            <a
              href={data.extra_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                background: "linear-gradient(135deg,#7c5cfc,#5b8ef8)",
                color: "#fff",
                borderRadius: 14,
                padding: "14px 0",
                fontWeight: 800,
                fontSize: 15,
                textDecoration: "none",
                boxShadow: "0 6px 28px rgba(124,92,252,0.40)",
                width: "100%",
                maxWidth: 320,
                transition: "opacity .15s, transform .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}
            >
              🎯 Accéder à l'offre
            </a>
          )}
        </Card>

        {/* ── Étapes ───────────────────────────────────────────────────────── */}
        {steps.length > 0 && (
          <Card cls="lu-fade lu-d3" style={{ marginBottom: 14 }}>
            <h2 style={{
              fontSize: 11, fontWeight: 800, color: "#a78bfa",
              marginBottom: 18, letterSpacing: "0.07em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <span>📋</span> Comment en profiter
            </h2>

            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <StepBubble n={i + 1}>{s}</StepBubble>

                {/* Lien inline sous l'étape 1 */}
                {i === 0 && data.extra_url && (
                  <div style={{ marginLeft: 46, marginTop: -6, marginBottom: 16 }}>
                    <SmallCta href={data.extra_url}>👉 Accéder à l'offre</SmallCta>
                  </div>
                )}

                {/* Note Coinbase sous l'étape 2 */}
                {i === 1 && (
                  <div style={{
                    marginLeft: 46, marginTop: -6, marginBottom: 16,
                    fontSize: 12, color: "rgba(200,195,240,.50)", lineHeight: 1.7,
                  }}>
                    Pas de wallet crypto ?{" "}
                    <a
                      href="https://coinbase.com/join/X8DGKD8?src=referral-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#a78bfa", fontWeight: 600, textDecoration: "none" }}
                    >
                      coinbase.com/join/X8DGKD8
                    </a>
                    {" "}— compte créé en 5 min.
                  </div>
                )}

                {/* Bouton Discord streamer sous l'étape 3 */}
                {i === 2 && data.discord_url && (
                  <div style={{ marginLeft: 46, marginTop: -6, marginBottom: 16 }}>
                    <SmallCta href={data.discord_url}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                      Ouvrir un ticket Discord
                    </SmallCta>
                  </div>
                )}
              </React.Fragment>
            ))}
          </Card>
        )}

        {/* ── Discord ──────────────────────────────────────────────────────── */}
        {data.discord_url && (
          <Card
            cls="lu-fade lu-d4"
            style={{ marginBottom: 14, border: "1px solid rgba(88,101,242,0.25)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: "rgba(88,101,242,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "rgba(235,232,255,.90)" }}>Besoin d'aide ?</div>
                <div style={{ fontSize: 12, color: "rgba(200,195,240,.45)", marginTop: 2 }}>Rejoins le Discord du streamer</div>
              </div>
            </div>
            <a
              href={data.discord_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "#5865F2",
                color: "#fff",
                borderRadius: 12,
                padding: "13px 20px",
                fontWeight: 700, fontSize: 14,
                textDecoration: "none",
                boxShadow: "0 4px 18px rgba(88,101,242,0.28)",
                transition: "opacity .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Discord de @{data.streamer_slug}
            </a>

            {/* Discord LunaLive */}
            <a
              href="https://discord.gg/VSbCZQ4gyT"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "rgba(88,101,242,0.12)",
                color: "rgba(180,175,255,.75)",
                border: "1px solid rgba(88,101,242,0.20)",
                borderRadius: 12,
                padding: "11px 20px",
                fontWeight: 600, fontSize: 13,
                textDecoration: "none",
                marginTop: 8,
                transition: "opacity .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Discord LunaLive (communauté)
            </a>
          </Card>
        )}

        {/* ── LunaLive footer ──────────────────────────────────────────────── */}
        <div className="lu-fade lu-d5" style={{ textAlign: "center", paddingTop: 10 }}>
          <Link
            to={`/s/${data.streamer_slug}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, color: "rgba(167,139,250,.55)",
              textDecoration: "none", fontWeight: 600,
            }}
          >
            📺 Voir @{data.streamer_slug} en live sur LunaLive
          </Link>
          <div style={{ fontSize: 11, color: "rgba(100,95,150,.35)", marginTop: 14 }}>
            <Link to="/" style={{ color: "rgba(124,92,252,.45)", textDecoration: "none" }}>← LunaLive</Link>
            {" · "}
            <Link to="/browse" style={{ color: "rgba(124,92,252,.45)", textDecoration: "none" }}>Streamers</Link>
            {" · "}
            <Link to="/casinos" style={{ color: "rgba(124,92,252,.45)", textDecoration: "none" }}>Casinos</Link>
          </div>
        </div>

      </div>
    </div>
  );
}
