import * as React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, RefreshCw, Radio, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import {
  getMyStreamer, getMyStreamConnection, updateMyStreamerTitle,
  type ApiMyStreamer, type ApiStreamConnection,
} from "../lib/api";
import { EmotesSection } from "./dashboard/sections/EmotesSection";
import { DashboardSidebar, DASHBOARD_META, type DashboardTab } from "./dashboard/DashboardSidebar";
import { OverviewSection } from "./dashboard/sections/OverviewSection";
import { LunaBotSection } from "./dashboard/sections/LunaBotSection";
import { StreamSection } from "./dashboard/sections/StreamSection";
import { ModerationSection } from "./dashboard/sections/ModerationSection";
import { AppearanceSection } from "./dashboard/sections/AppearanceSection";
import { EarningsSection } from "./dashboard/sections/EarningsSection";
import { StatsSection } from "./dashboard/sections/StatsSection";
import { SettingsSection } from "./dashboard/sections/SettingsSection";
import { AgencySection } from "./dashboard/sections/AgencySection";
import "./dashboard/dashboard-theme.css";

function fmt(n: number | null | undefined) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("fr-FR") : "—";
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [streamer, setStreamer] = React.useState<ApiMyStreamer | null>(null);
  const [connection, setConnection] = React.useState<ApiStreamConnection | null>(null);
  const [tab, setTab] = React.useState<DashboardTab>("overview");
  const canAccess = !!user && (user.role === "streamer" || user.role === "admin");

  async function load() {
    if (!token || !canAccess) return;
    setLoading(true); setErr(null);
    try {
      const [s, c] = await Promise.all([getMyStreamer(token), getMyStreamConnection(token)]);
      setStreamer(s.streamer); setConnection(c.connection);
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [token, user?.role]);

  if (!user || !canAccess) return (
    <main className="container dashGate">
      <span className="dashEyebrow">LUNALIVE STUDIO</span>
      <h1>{!user ? "Connecte-toi pour piloter ta chaîne." : "Cet espace est réservé aux streamers."}</h1>
      <p>{!user ? "Ton studio, tes statistiques et tes outils sont réunis ici." : "Retrouve ton profil pour finaliser ton accès streamer."}</p>
      <Link to="/profile" className="btnPrimary">Ouvrir mon profil</Link>
    </main>
  );

  const live = Boolean((streamer as any)?.isLive);
  const meta = DASHBOARD_META[tab];
  const TabIcon = meta.icon;

  return (
    <main className={`container streamerDashboard streamerDashboard--${tab}`}>
      <section className="dashHero">
        <div className="dashHeroGlow" aria-hidden />
        <div className="dashHeroIdentity">
          <div className={`dashAvatar ${live ? "isLive" : ""}`}>
            {(streamer?.displayName || "L").slice(0, 1).toUpperCase()}
            {live && <span />}
          </div>
          <div>
            <span className="dashEyebrow">LUNALIVE CREATOR STUDIO</span>
            <h1>{streamer?.displayName ?? "Ta chaîne"}</h1>
            <p>@{(streamer as any)?.slug ?? "—"} <i /> Espace de contrôle streamer</p>
          </div>
        </div>

        <div className="dashHeroMetrics">
          <div><span>Statut</span><strong className={live ? "live" : ""}>{live ? "● En direct" : "Hors ligne"}</strong></div>
          <div><span>Spectateurs</span><strong>{fmt((streamer as any)?.viewers)}</strong></div>
          <div><span>Diffusion</span><strong className={connection ? "connected" : "warning"}>{connection ? "Prête" : "À relier"}</strong></div>
        </div>

        <div className="dashHeroActions">
          <button className="dashIconButton" onClick={load} disabled={loading} title="Rafraîchir"><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
          <Link to={`/s/${(streamer as any)?.slug ?? ""}`} className="dashActionSecondary"><ExternalLink size={16} /> Voir ma page</Link>
          <button className="dashActionPrimary" onClick={() => setTab("stream")}><Radio size={17} /> Gérer le live</button>
        </div>
      </section>

      {err && <div className="dashNotice dashNotice--error">{err}</div>}

      {!loading && !streamer ? (
        <section className="dashEmpty"><ShieldCheck size={34} /><h2>Chaîne en préparation</h2><p>Ta chaîne sera créée après sa validation par l’équipe.</p></section>
      ) : streamer && (
        <div className="dashWorkspace">
          <DashboardSidebar tab={tab} setTab={setTab} streamer={streamer} />
          <section className="dashContent">
            <header className="dashSectionHead">
              <div className="dashSectionIcon"><TabIcon size={23} /></div>
              <div><span>{meta.kicker}</span><h2>{meta.title}</h2><p>{meta.description}</p></div>
            </header>
            <div className="dashSectionBody">
              {tab === "overview" && <OverviewSection streamer={streamer} connection={connection} onGoStream={() => setTab("stream")} onGoModeration={() => setTab("moderation")} />}
              {tab === "agency" && <AgencySection streamer={streamer} />}
              {tab === "lunabot" && <LunaBotSection streamer={streamer} />}
              {tab === "stream" && <StreamSection streamer={streamer} connection={connection} onSaveTitle={async title => { if (!token) return; const r = await updateMyStreamerTitle(token, title); setStreamer(r.streamer); }} />}
              {tab === "moderation" && <ModerationSection streamer={streamer} />}
              {tab === "appearance" && <AppearanceSection streamer={streamer} />}
              {tab === "emotes" && <EmotesSection streamer={streamer} />}
              {tab === "earnings" && <EarningsSection streamer={streamer} />}
              {tab === "stats" && <StatsSection streamer={streamer} />}
              {tab === "settings" && <SettingsSection streamer={streamer} onReload={load} />}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
