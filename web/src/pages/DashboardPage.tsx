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
import "./dashboard/dashboardStudio.css";

function fmt(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR");
}

const TAB_META: Record<DashboardTab, { index: string; title: string; copy: string }> = {
  overview: { index: "01 / ESSENTIEL", title: "Vue d'ensemble", copy: "Le statut de ta chaine, ses connexions et les actions utiles en un coup d'oeil." },
  stream: { index: "02 / DIFFUSION", title: "Diffusion", copy: "Prepare ton titre et retrouve les informations necessaires pour lancer ton direct." },
  lunabot: { index: "03 / AUTOMATION", title: "LunaBot", copy: "Configure les commandes, les clips et les interactions qui animent ta communaute." },
  moderation: { index: "04 / COMMUNAUTE", title: "Moderation", copy: "Gere ton equipe, les sanctions et l'historique des actions de moderation." },
  appearance: { index: "05 / IDENTITE", title: "Apparence", copy: "Personnalise les ecrans, couleurs et signes distinctifs de ta chaine." },
  emotes: { index: "06 / CHAT", title: "Emojis & GIFs", copy: "Construis une bibliotheque expressive et coherente pour ton chat." },
  agency: { index: "07 / RESEAU", title: "Agence", copy: "Suis ton activite d'affiliation et les performances de ton reseau." },
  earnings: { index: "08 / FINANCES", title: "Revenus", copy: "Consulte tes soldes, la repartition des rubis et tes demandes de retrait." },
  stats: { index: "09 / ANALYSE", title: "Statistiques", copy: "Lis les tendances de ta chaine et mesure ce qui fait progresser ton audience." },
  settings: { index: "10 / SYSTEME", title: "Parametres", copy: "Les reglages sensibles et les outils de gestion de ta chaine." },
};

/* ─── Pill Purple Velvet ──────────────────────────────────── */
type PillTone = "neutral" | "pink" | "blue" | "green" | "gold" | "violet";
function Pill({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: PillTone; title?: string }) {
  return <span className="dash-pill" data-tone={tone} title={title}>{children}</span>;
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

  React.useEffect(() => {
    document.body.classList.add("ll-dashboard-open");
    return () => document.body.classList.remove("ll-dashboard-open");
  }, []);

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
    <main className="container dashboard-shell">
      <style>{DASH_CSS}</style>

      <div className="dash-page-heading">
        <div>
          <div className="dash-kicker">LunaLive studio</div>
          <h1>Control room</h1>
        </div>
        <p>Un espace unique pour preparer tes directs, piloter ta communaute et suivre la croissance de ta chaine.</p>
      </div>

      {/* ── HERO ── */}
      <div className="dash-hero">
        <div className="dash-hero-grid">
          <div>
            <div className="dash-hero-eyebrow">Chaine active</div>
            <div className="dash-hero-title">{streamer?.displayName ?? "Ta chaine"}</div>
            <div className="dash-hero-handle">@{(streamer as any)?.slug ?? "-"} / chaine {(streamer as any)?.id ?? "-"}</div>
            <div className="dash-hero-status">
              <Pill tone={live ? "pink" : "neutral"} title="Statut live">
                {live ? "En direct" : "Hors ligne"}
              </Pill>
              <Pill tone="blue" title="Viewers actuels">
                {fmt(viewers)} spectateurs
              </Pill>
              <Pill tone={connection ? "green" : "gold"} title="Connexion stream">
                {connection ? "Connexion prete" : "Connexion requise"}
              </Pill>
            </div>
          </div>

          <div className="dash-hero-actions">
            <button className="btnPrimary" onClick={() => setTab("stream")}>Preparer le direct</button>
            <button className="btnGhost" onClick={() => setTab("moderation")}>Moderation</button>
            <button className="btnGhost" onClick={load} disabled={loading} title="Rafraichir">{loading ? "Mise a jour..." : "Actualiser"}</button>
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
          <div className="dash-card dash-sidebar-card dash-sidebar-sticky">
            <DashboardSidebar tab={tab} setTab={setTab} streamer={streamer} />
          </div>

          {/* Contenu */}
          <div className="dash-card dash-content-card">
            <header className="dash-content-head">
              <div>
                <div className="dash-content-index">{TAB_META[tab].index}</div>
                <div className="dash-content-title">{TAB_META[tab].title}</div>
              </div>
              <div className="dash-content-copy">{TAB_META[tab].copy}</div>
            </header>
            <div className="dash-content-body">
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
