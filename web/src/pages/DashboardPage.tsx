// web/src/pages/DashboardPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  getMyStreamer,
  getMyStreamConnection,
  updateMyStreamerTitle,
  type ApiMyStreamer,
  type ApiStreamConnection,
} from "../lib/api";
import { EmotesSection } from "./dashboard/sections/EmotesSection";

import { DashboardSidebar, type DashboardTab } from "./dashboard/DashboardSidebar";
import { OverviewSection } from "./dashboard/sections/OverviewSection";
import { LunaBotSection } from "./dashboard/sections/LunaBotSection";
import { StreamSection } from "./dashboard/sections/StreamSection";
import { ModerationSection } from "./dashboard/sections/ModerationSection";
import { AppearanceSection } from "./dashboard/sections/AppearanceSection";
import { EarningsSection } from "./dashboard/sections/EarningsSection";
import { StatsSection } from "./dashboard/sections/StatsSection";
import { SettingsSection } from "./dashboard/sections/SettingsSection";

function fmt(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR");
}

function Pill({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "pink" | "blue" | "green" | "gold";
  title?: string;
}) {
  const tones: Record<string, { bg: string; bd: string }> = {
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.10)" },
    pink: { bg: "rgba(255, 90, 180, 0.14)", bd: "rgba(255, 90, 180, 0.26)" },
    blue: { bg: "rgba(80, 160, 255, 0.14)", bd: "rgba(80, 160, 255, 0.26)" },
    green: { bg: "rgba(80, 240, 170, 0.12)", bd: "rgba(80, 240, 170, 0.22)" },
    gold: { bg: "rgba(255, 210, 110, 0.14)", bd: "rgba(255, 210, 110, 0.26)" },
  };
  const t = tones[tone] ?? tones.neutral;

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontSize: 13,
        fontWeight: 900,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

export default function DashboardPage() {
  const { user, token } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [streamer, setStreamer] = React.useState<ApiMyStreamer | null>(null);
  const [connection, setConnection] = React.useState<ApiStreamConnection | null>(null);

  const canAccess = !!user && (user.role === "streamer" || user.role === "admin");
  const [tab, setTab] = React.useState<DashboardTab>("overview");

  async function load() {
    if (!token || !canAccess) return;
    setLoading(true);
    setErr(null);
    try {
      const [s, c] = await Promise.all([getMyStreamer(token), getMyStreamConnection(token)]);
      setStreamer(s.streamer);
      setConnection(c.connection);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  if (!user) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Dashboard</h1>
          <p className="muted">Connecte-toi pour accéder au dashboard.</p>
        </div>
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Dashboard</h1>
          <p className="muted">Accès réservé aux streamers.</p>
          <Link to="/profile" className="btnGhostInline">
            ← Aller au profil
          </Link>
        </div>
      </main>
    );
  }

  const live = Boolean((streamer as any)?.isLive);
  const viewers = (streamer as any)?.viewers ?? null;

  return (
    <main className="container" style={{ paddingBottom: 28 }}>
      {/* scoped styles (safe) */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ll-float { animation: llFloat 10s ease-in-out infinite; }
          .ll-float2 { animation: llFloat 13s ease-in-out infinite; }
          .ll-glow { animation: llGlow 6s ease-in-out infinite; }
        }
        @keyframes llFloat { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes llGlow { 0%,100% { filter: drop-shadow(0 0 0 rgba(255,255,255,0)); } 50% { filter: drop-shadow(0 12px 28px rgba(140,90,255,0.35)); } }

        .dashHero{
          margin-top: 12px;
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(900px 280px at 15% 0%, rgba(140,90,255,0.32), rgba(0,0,0,0) 60%),
            radial-gradient(700px 260px at 85% 20%, rgba(255,90,180,0.18), rgba(0,0,0,0) 55%),
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10));
          padding: 18px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
          overflow: hidden;
          position: relative;
          backdrop-filter: blur(10px);
        }

        .dashGrid{
          margin-top: 14px;
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 14px;
          align-items: start;
        }

        .dashCard{
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10));
          box-shadow: 0 18px 50px rgba(0,0,0,0.28);
          backdrop-filter: blur(10px);
          overflow: hidden;
        }

        .dashSidebarSticky{
          position: sticky;
          top: 86px; /* sous la topbar */
        }

        @media (max-width: 980px){
          .dashGrid{ grid-template-columns: 1fr; }
          .dashSidebarSticky{ position: static; top: auto; }
        }
      `}</style>

      <div className="pageTitle">
        <h1>Dashboard</h1>
        <p className="muted">Espace streamer — tout ce qui concerne ta chaîne est ici.</p>
      </div>

      {/* HERO */}
      <div className="dashHero">
        <div
          className="ll-float"
          style={{
            position: "absolute",
            inset: "auto auto -46px -46px",
            width: 210,
            height: 210,
            borderRadius: 999,
            background:
              "radial-gradient(circle at 30% 30%, rgba(80,160,255,0.55), rgba(140,90,255,0.10) 70%, rgba(0,0,0,0) 72%)",
            transform: "rotate(10deg)",
            pointerEvents: "none",
          }}
        />
        <div
          className="ll-float2"
          style={{
            position: "absolute",
            inset: "-70px -90px auto auto",
            width: 250,
            height: 250,
            borderRadius: 999,
            background:
              "radial-gradient(circle at 40% 35%, rgba(255,90,180,0.40), rgba(255,210,110,0.10) 62%, rgba(0,0,0,0) 72%)",
            transform: "rotate(-18deg)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 22, fontWeight: 1200, letterSpacing: -0.4, lineHeight: 1.1 }}>
              🎥 {streamer?.displayName ?? "Ta chaîne"}
              {live ? <span style={{ marginLeft: 10, fontSize: 14 }}>🔴 Live</span> : <span style={{ marginLeft: 10, fontSize: 14, opacity: 0.75 }}>⚫ Offline</span>}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              @{(streamer as any)?.slug ?? "—"} • ID {(streamer as any)?.id ?? "—"}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <Pill tone={live ? "pink" : "neutral"} title="Statut live">
                {live ? "🔴 En live" : "⚫ Hors ligne"}
              </Pill>
              <Pill tone="blue" title="Viewers (si live)">
                👀 {fmt(viewers)}
              </Pill>
              <Pill tone={connection ? "green" : "gold"} title="Connexion stream">
                {connection ? "✅ Stream connecté" : "⚠️ À connecter"}
              </Pill>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btnGhost" onClick={load} disabled={loading} title="Rafraîchir">
              🔄 Rafraîchir
            </button>
            <button className="btnPrimary" onClick={() => setTab("stream")} title="Configurer le stream">
              🎬 Stream
            </button>
            <button className="btnGhost" onClick={() => setTab("moderation")} title="Modération">
              🛡️ Modération
            </button>
          </div>
        </div>

        {err ? (
          <div className="hint" style={{ opacity: 0.95, marginTop: 12 }}>
            ⚠️ {err}
          </div>
        ) : null}

        {loading ? <div className="muted" style={{ marginTop: 10 }}>Chargement…</div> : null}
      </div>

      {!loading && !streamer ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panelTitle">Chaîne</div>
          <div className="muted">
            Aucune chaîne LunaLive liée à ton compte. (Normalement créée à l’approbation admin)
          </div>
        </div>
      ) : (
        streamer && (
          <div className="dashGrid">
            {/* Sidebar */}
            <div className="dashCard dashSidebarSticky">
              <div style={{ padding: 10 }}>
                <DashboardSidebar tab={tab} setTab={setTab} streamer={streamer} />
              </div>
            </div>

            {/* Content */}
            <div className="dashCard">
              <div style={{ padding: 14 }}>
                {tab === "overview" && (
                  <OverviewSection
                    streamer={streamer}
                    connection={connection}
                    onGoStream={() => setTab("stream")}
                    onGoModeration={() => setTab("moderation")}
                  />
                )}

                {tab === "lunabot" && <LunaBotSection streamer={streamer} />}

                {tab === "stream" && (
                  <StreamSection
                    streamer={streamer}
                    connection={connection}
                    onSaveTitle={async (title) => {
                      if (!token) return;
                      const r = await updateMyStreamerTitle(token, title);
                      setStreamer(r.streamer);
                    }}
                  />
                )}

                {tab === "moderation" && <ModerationSection streamer={streamer} />}

                {tab === "appearance" && <AppearanceSection streamer={streamer} />}
                
                {tab === "emotes" && <EmotesSection streamer={streamer} />}

                {tab === "earnings" && <EarningsSection streamer={streamer} />}

                {tab === "stats" && <StatsSection streamer={streamer} />}

                {tab === "settings" && <SettingsSection streamer={streamer} onReload={load} />}
              </div>
            </div>
          </div>
        )
      )}
    </main>
  );
}
