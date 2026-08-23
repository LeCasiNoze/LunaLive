import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  getMyStreamer, getMyStreamConnection, updateMyStreamerTitle,
  type ApiMyStreamer, type ApiStreamConnection,
} from "../lib/api";
import { EmotesSection }     from "./dashboard/sections/EmotesSection";
import { DashboardAvatar, DashboardSidebar, type DashboardTab } from "./dashboard/DashboardSidebar";
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

const TAB_META: Record<DashboardTab, { eyebrow: string; title: string; copy: string }> = {
  overview: { eyebrow: "Dashboard", title: "Vue d'ensemble", copy: "Le statut de ta chaine, ses connexions et les actions utiles en un coup d'oeil." },
  stream: { eyebrow: "Diffusion", title: "Preparer le direct", copy: "Modifie ton titre et retrouve les informations necessaires pour lancer ton direct." },
  lunabot: { eyebrow: "Automatisation", title: "LunaBot", copy: "Configure les commandes, les clips et les interactions de ta communaute." },
  moderation: { eyebrow: "Communaute", title: "Moderation", copy: "Gere ton equipe, les sanctions et l'historique de moderation." },
  appearance: { eyebrow: "Identite", title: "Apparence", copy: "Personnalise l'apparence de ta chaine et de ton chat." },
  emotes: { eyebrow: "Chat", title: "Emojis & GIFs", copy: "Gere la bibliotheque visuelle de ta communaute." },
  agency: { eyebrow: "Reseau", title: "Agence", copy: "Suis ton activite d'affiliation et les performances de ton reseau." },
  earnings: { eyebrow: "Finances", title: "Revenus", copy: "Consulte tes soldes, tes rubis et tes demandes de retrait." },
  stats: { eyebrow: "Analyse", title: "Statistiques", copy: "Suis les tendances de ta chaine et de ton audience." },
  settings: { eyebrow: "Systeme", title: "Parametres", copy: "Gere les reglages sensibles de ta chaine." },
};

type PillTone = "neutral" | "pink" | "blue" | "green" | "gold" | "violet";
function Pill({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: PillTone; title?: string }) {
  return <span className="dash-pill" data-tone={tone} title={title}>{children}</span>;
}
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

  const load = React.useCallback(async () => {
    if (!token || !canAccess) return;
    setLoading(true); setErr(null);
    try {
      const [s, c] = await Promise.all([getMyStreamer(token), getMyStreamConnection(token)]);
      setStreamer(s.streamer);
      setConnection(c.connection);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }, [canAccess, token]);

  React.useEffect(() => { void load(); }, [load]);

  if (!user) return (
    <main className="container">
      <div className="pageTitle">
        <h1>Dashboard</h1>
        <p className="muted">Connecte-toi pour accéder au dashboard.</p>
      </div>
    </main>
  );

  if (!canAccess) return (
    <main className="container">
      <div className="pageTitle">
        <h1>Dashboard</h1>
        <p className="muted">Accès réservé aux streamers.</p>
        <Link to="/profile" className="btnGhostInline">← Aller au profil</Link>
      </div>
    </main>
  );

  const live    = Boolean(streamer?.isLive);
  const viewers = streamer?.viewers ?? null;
  const connectionReady = Boolean(connection && connection.enabled !== false && connection.rtmpUrl && connection.streamKey);

  return (
    <main className="container dashboard-shell">
      <section className="dash-hero" aria-labelledby="dashboard-channel-name">
        <div className="dash-hero-grid">
          <div className="dash-hero-identity">
            {streamer ? <DashboardAvatar streamer={streamer} className="dash-hero-avatar" /> : null}
            <div className="dash-hero-copy">
              <div className="dash-hero-eyebrow">Dashboard streamer</div>
              <h1 className="dash-hero-title" id="dashboard-channel-name">{streamer?.displayName ?? "Ta chaine"}</h1>
              <div className="dash-hero-handle">@{streamer?.slug ?? "-"}</div>
            </div>
          </div>

          <div className="dash-hero-tools">
            <div className="dash-hero-status" aria-label="Etat de la chaine">
              <Pill tone={live ? "pink" : "neutral"} title="Statut live">
                {live ? "En direct" : "Hors ligne"}
              </Pill>
              <Pill tone="blue" title="Viewers actuels">
                {fmt(viewers)} spectateurs
              </Pill>
              <Pill tone={connectionReady ? "green" : "gold"} title="Connexion stream">
                {connectionReady ? "Connexion prete" : "Connexion requise"}
              </Pill>
            </div>
            <div className="dash-hero-actions">
              <button className="btnPrimary" onClick={() => setTab("stream")}>Preparer le direct</button>
              <button className="btnGhost" onClick={() => setTab("moderation")}>Moderation</button>
              <button className="btnGhost" onClick={load} disabled={loading}>{loading ? "Mise a jour..." : "Actualiser"}</button>
            </div>
          </div>
        </div>

        {err ? <div className="dash-alert" role="alert">{err}</div> : null}
      </section>

      {!loading && !streamer ? (
        <div className="panel" style={{ marginTop:16 }}>
          <div className="panelTitle">Chaîne</div>
          <div className="muted">Aucune chaîne LunaLive liée à ton compte. (Créée à l'approbation admin)</div>
        </div>
      ) : streamer && (
        <div className="dash-grid">
          <div className="dash-card dash-sidebar-card dash-sidebar-sticky">
            <DashboardSidebar tab={tab} setTab={setTab} streamer={streamer} />
          </div>

          <div className="dash-card dash-content-card">
            <header className="dash-content-head">
              <div>
                <div className="dash-content-index">{TAB_META[tab].eyebrow}</div>
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
