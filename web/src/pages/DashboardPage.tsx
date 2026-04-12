// web/src/pages/DashboardPage.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — DashboardPage
//  Refonte UI : hero glass morphism, sidebar, pills, layout
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  getMyStreamer, getMyStreamConnection, updateMyStreamerTitle,
  type ApiMyStreamer, type ApiStreamConnection,
} from "../lib/api";
import { EmotesSection }     from "./dashboard/sections/EmotesSection";
import { DashboardSidebar, type DashboardTab } from "./dashboard/DashboardSidebar";
import { OverviewSection }    from "./dashboard/sections/OverviewSection";
import { LunaBotSection }     from "./dashboard/sections/LunaBotSection";
import { StreamSection }      from "./dashboard/sections/StreamSection";
import { ModerationSection }  from "./dashboard/sections/ModerationSection";
import { AppearanceSection }  from "./dashboard/sections/AppearanceSection";
import { EarningsSection }    from "./dashboard/sections/EarningsSection";
import { StatsSection }       from "./dashboard/sections/StatsSection";
import { SettingsSection }    from "./dashboard/sections/SettingsSection";
import { AgencySection }      from "./dashboard/sections/AgencySection";

function fmt(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR");
}

/* ─── Pill Purple Velvet ──────────────────────────────────── */
type PillTone = "neutral" | "pink" | "blue" | "green" | "gold" | "violet";
function Pill({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: PillTone; title?: string }) {
  const tones: Record<PillTone, { bg: string; bd: string; color: string }> = {
    neutral: { bg:"rgba(124,92,252,.08)",  bd:"rgba(124,92,252,.18)",  color:"rgba(196,181,253,.80)" },
    violet:  { bg:"rgba(124,92,252,.16)",  bd:"rgba(124,92,252,.34)",  color:"rgba(235,232,255,.95)" },
    pink:    { bg:"rgba(236,72,153,.14)",  bd:"rgba(236,72,153,.28)",  color:"rgba(249,168,212,.90)" },
    blue:    { bg:"rgba(91,142,248,.14)",  bd:"rgba(91,142,248,.28)",  color:"rgba(147,197,253,.90)" },
    green:   { bg:"rgba(52,211,153,.12)",  bd:"rgba(52,211,153,.24)",  color:"rgba(110,231,183,.90)" },
    gold:    { bg:"rgba(251,191,36,.14)",  bd:"rgba(251,191,36,.28)",  color:"rgba(253,230,138,.90)" },
  };
  const t = tones[tone] ?? tones.neutral;
  return (
    <span title={title} style={{
      display:"inline-flex", alignItems:"center", gap:7,
      padding:"8px 14px", borderRadius:999,
      border:`1px solid ${t.bd}`, background:t.bg,
      fontSize:12, fontWeight:800, whiteSpace:"nowrap",
      color:t.color, fontFamily:"'Syne',system-ui,sans-serif",
      backdropFilter:"blur(10px)",
    }}>{children}</span>
  );
}

/* ─── CSS scoped ──────────────────────────────────────────── */
const DASH_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

@keyframes ll-float  { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-10px); } }
@keyframes ll-float2 { 0%,100% { transform:translateY(0) rotate(-18deg); } 50% { transform:translateY(-14px) rotate(-18deg); } }
@keyframes ll-glow   { 0%,100% { filter:drop-shadow(0 0 0 rgba(124,92,252,0)); } 50% { filter:drop-shadow(0 12px 28px rgba(124,92,252,.30)); } }
@keyframes dash-shimmer { 0%,100% { background-position:0% 50%; } 50% { background-position:100% 50%; } }

@media (prefers-reduced-motion:no-preference) {
  .ll-float  { animation:ll-float  10s ease-in-out infinite; }
  .ll-float2 { animation:ll-float2 13s ease-in-out infinite; }
  .ll-glow   { animation:ll-glow    6s ease-in-out infinite; }
}

/* Hero */
.dash-hero {
  position:relative; overflow:hidden;
  margin-top:14px; border-radius:24px;
  border:1px solid rgba(124,92,252,.22);
  background:
    radial-gradient(900px 280px at 15% 0%, rgba(124,92,252,.32), transparent 60%),
    radial-gradient(700px 260px at 85% 20%, rgba(59,77,200,.20), transparent 55%),
    linear-gradient(180deg, rgba(255,255,255,.04), rgba(0,0,0,.12));
  padding:20px;
  box-shadow:0 24px 70px rgba(0,0,0,.40), 0 0 80px rgba(124,92,252,.08);
  backdrop-filter:blur(16px);
}

/* Reflet haut */
.dash-hero::before {
  content:"";
  position:absolute; top:0; left:6%; right:6%; height:1px; z-index:2; pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.45) 35%,rgba(91,142,248,.32) 65%,transparent);
}

/* Title hero */
.dash-hero-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:22px; letter-spacing:-.4px; line-height:1.1;
  background:linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 40%,#5b8ef8 70%,#93c5fd 100%);
  background-size:220% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 10px rgba(124,92,252,.30));
  animation:dash-shimmer 5s ease-in-out infinite;
}

/* Grid */
.dash-grid {
  margin-top:16px;
  display:grid;
  grid-template-columns:280px 1fr;
  gap:14px;
  align-items:start;
}
@media (max-width:980px) {
  .dash-grid { grid-template-columns:1fr; }
  .dash-sidebar-sticky { position:static!important; top:auto!important; }
}

/* Cards */
.dash-card {
  border-radius:22px;
  border:1px solid rgba(124,92,252,.18);
  background:rgba(9,7,20,.96);
  box-shadow:0 18px 50px rgba(0,0,0,.32);
  backdrop-filter:blur(16px);
  overflow:hidden;
}

/* Reflet haut cards */
.dash-card::before {
  content:""; display:block;
  height:1px; width:100%;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.28) 40%,rgba(91,142,248,.18) 60%,transparent);
  pointer-events:none;
}

.dash-sidebar-sticky {
  position:sticky; top:90px;
}
`;

/* ─── Composant ───────────────────────────────────────────── */
export default function DashboardPage() {
  const { user, token } = useAuth();
  const [loading, setLoading]     = React.useState(false);
  const [err, setErr]             = React.useState<string | null>(null);
  const [streamer, setStreamer]   = React.useState<ApiMyStreamer | null>(null);
  const [connection, setConnection] = React.useState<ApiStreamConnection | null>(null);
  const canAccess = !!user && (user.role === "streamer" || user.role === "admin");
  const [tab, setTab]             = React.useState<DashboardTab>("overview");

  async function load() {
    if (!token || !canAccess) return;
    setLoading(true); setErr(null);
    try {
      const [s, c] = await Promise.all([getMyStreamer(token), getMyStreamConnection(token)]);
      setStreamer(s.streamer);
      setConnection(c.connection);
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [token, user?.role]);

  /* ── Empty states ── */
  if (!user) return (
    <main className="container">
      <style>{DASH_CSS}</style>
      <div className="pageTitle">
        <h1>Dashboard</h1>
        <p className="muted">Connecte-toi pour accéder au dashboard.</p>
      </div>
    </main>
  );

  if (!canAccess) return (
    <main className="container">
      <style>{DASH_CSS}</style>
      <div className="pageTitle">
        <h1>Dashboard</h1>
        <p className="muted">Accès réservé aux streamers.</p>
        <Link to="/profile" className="btnGhostInline">← Aller au profil</Link>
      </div>
    </main>
  );

  const live    = Boolean((streamer as any)?.isLive);
  const viewers = (streamer as any)?.viewers ?? null;

  return (
    <main className="container" style={{ paddingBottom:32 }}>
      <style>{DASH_CSS}</style>

      <div className="pageTitle">
        <h1 style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>Dashboard</h1>
        <p className="muted">Espace streamer — tout ce qui concerne ta chaîne est ici.</p>
      </div>

      {/* ── HERO ── */}
      <div className="dash-hero">
        {/* Lueurs ambiantes */}
        <div className="ll-float" style={{ position:"absolute", inset:"auto auto -50px -50px", width:220, height:220, borderRadius:999, background:"radial-gradient(circle at 30% 30%, rgba(91,142,248,.42), rgba(124,92,252,.10) 70%, transparent 72%)", pointerEvents:"none" }} />
        <div className="ll-float2" style={{ position:"absolute", inset:"-70px -90px auto auto", width:260, height:260, borderRadius:999, background:"radial-gradient(circle at 40% 35%, rgba(167,139,250,.30), rgba(59,77,200,.10) 62%, transparent 72%)", pointerEvents:"none" }} />

        <div style={{ position:"relative", display:"flex", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
          {/* Infos chaîne */}
          <div style={{ minWidth:240 }}>
            <div className="dash-hero-title">
              🎥 {streamer?.displayName ?? "Ta chaîne"}
            </div>
            <div style={{ marginTop:8, fontSize:12, color:"rgba(167,139,250,.65)", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>
              @{(streamer as any)?.slug ?? "—"} · ID {(streamer as any)?.id ?? "—"}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:14 }}>
              <Pill tone={live ? "pink" : "neutral"} title="Statut live">
                {live ? "🔴 En live" : "⚫ Hors ligne"}
              </Pill>
              <Pill tone="blue" title="Viewers actuels">
                👀 {fmt(viewers)}
              </Pill>
              <Pill tone={connection ? "green" : "gold"} title="Connexion stream">
                {connection ? "✅ Connecté" : "⚠️ À connecter"}
              </Pill>
            </div>
          </div>

          {/* Actions hero */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-start" }}>
            <button className="btnGhost" onClick={load} disabled={loading} title="Rafraîchir"
              style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
              🔄 Rafraîchir
            </button>
            <button className="btnPrimary" onClick={() => setTab("stream")}
              style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
              🎬 Stream
            </button>
            <button className="btnGhost" onClick={() => setTab("moderation")}
              style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
              🛡️ Modération
            </button>
          </div>
        </div>

        {err    ? <div className="hint" style={{ marginTop:12, opacity:.95, fontFamily:"'Syne',system-ui,sans-serif" }}>⚠️ {err}</div> : null}
        {loading ? <div style={{ marginTop:10, fontSize:12, color:"rgba(196,181,253,.60)", fontFamily:"'Syne',system-ui,sans-serif" }}>⏳ Chargement…</div> : null}
      </div>

      {/* ── Pas de chaîne ── */}
      {!loading && !streamer ? (
        <div className="panel" style={{ marginTop:16 }}>
          <div className="panelTitle">Chaîne</div>
          <div className="muted">Aucune chaîne LunaLive liée à ton compte. (Créée à l'approbation admin)</div>
        </div>
      ) : streamer && (
        <div className="dash-grid">
          {/* Sidebar */}
          <div className="dash-card dash-sidebar-sticky">
            <div style={{ padding:10 }}>
              <DashboardSidebar tab={tab} setTab={setTab} streamer={streamer} />
            </div>
          </div>

          {/* Contenu */}
          <div className="dash-card">
            <div style={{ padding:16 }}>
              {tab === "overview"   && <OverviewSection streamer={streamer} connection={connection} onGoStream={()=>setTab("stream")} onGoModeration={()=>setTab("moderation")} />}
              {tab === "agency"     && <AgencySection streamer={streamer} />}
              {tab === "lunabot"    && <LunaBotSection streamer={streamer} />}
              {tab === "stream"     && <StreamSection streamer={streamer} connection={connection} onSaveTitle={async(title)=>{ if (!token) return; const r=await updateMyStreamerTitle(token,title); setStreamer(r.streamer); }} />}
              {tab === "moderation" && <ModerationSection streamer={streamer} />}
              {tab === "appearance" && <AppearanceSection streamer={streamer} />}
              {tab === "emotes"     && <EmotesSection streamer={streamer} />}
              {tab === "earnings"   && <EarningsSection streamer={streamer} />}
              {tab === "stats"      && <StatsSection streamer={streamer} />}
              {tab === "settings"   && <SettingsSection streamer={streamer} onReload={load} />}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
