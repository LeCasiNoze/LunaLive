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

import { DashboardSidebar, type DashboardTab } from "./dashboard/DashboardSidebar";
import { OverviewSection } from "./dashboard/sections/OverviewSection";
import { StreamSection } from "./dashboard/sections/StreamSection";
import { ModerationSection } from "./dashboard/sections/ModerationSection";
import { AppearanceSection } from "./dashboard/sections/AppearanceSection";
import { EarningsSection } from "./dashboard/sections/EarningsSection";
import { StatsSection } from "./dashboard/sections/StatsSection";
import { SettingsSection } from "./dashboard/sections/SettingsSection";

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

  const layoutStyle: React.CSSProperties = {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    // responsive simple: sur petit écran ça passera en colonne (flex-wrap)
    flexWrap: "wrap",
  };

  const sidebarStyle: React.CSSProperties = {
    width: 280,
    flex: "0 0 280px",
  };

  const contentStyle: React.CSSProperties = {
    flex: "1 1 520px",
    minWidth: 320,
  };

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Dashboard</h1>
        <p className="muted">Espace streamer — tout ce qui concerne ta chaîne est ici.</p>
      </div>

      {err && (
        <div className="hint" style={{ opacity: 0.9 }}>
          ⚠️ {err}
        </div>
      )}
      {loading && <div className="muted">Chargement…</div>}

      {!loading && !streamer ? (
        <div className="panel">
          <div className="panelTitle">Chaîne</div>
          <div className="muted">
            Aucune chaîne LunaLive liée à ton compte. (Normalement créée à l’approbation admin)
          </div>
        </div>
      ) : (
        streamer && (
          <div style={layoutStyle}>
            {/* Sidebar */}
            <div style={sidebarStyle}>
              <DashboardSidebar
                tab={tab}
                setTab={setTab}
                streamer={streamer}
              />
            </div>

            {/* Content */}
            <div style={contentStyle}>
              {tab === "overview" && (
                <OverviewSection
                  streamer={streamer}
                  connection={connection}
                  onGoStream={() => setTab("stream")}
                  onGoModeration={() => setTab("moderation")}
                />
              )}

              {tab === "stream" && (
                <StreamSection
                  streamer={streamer}
                  connection={connection}
                  onSaveTitle={async (title) => {
                    if (!token) return;
                    const r = await updateMyStreamerTitle(token, title);
                    setStreamer(r.streamer); // ✅ effet immédiat dans le dashboard
                  }}
                />
              )}

              {tab === "moderation" && <ModerationSection streamer={streamer} />}

              {tab === "appearance" && <AppearanceSection streamer={streamer} />}

              {tab === "earnings" && <EarningsSection streamer={streamer} />}

              {tab === "stats" && <StatsSection streamer={streamer} />}

              {tab === "settings" && (
                <SettingsSection streamer={streamer} onReload={load} />
              )}
            </div>
          </div>
        )
      )}
    </main>
  );
}
