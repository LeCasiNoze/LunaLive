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

import { TitleEditorCard } from "./dashboard/TitleEditorCard";
import { StreamKeysCard } from "./dashboard/StreamKeysCard";
import { PlaceholdersCard } from "./dashboard/PlaceholdersCard";

export default function DashboardPage() {
  const { user, token } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [streamer, setStreamer] = React.useState<ApiMyStreamer | null>(null);
  const [connection, setConnection] = React.useState<ApiStreamConnection | null>(null);

  const canAccess = !!user && (user.role === "streamer" || user.role === "admin");

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
          <Link to="/profile" className="btnGhostInline">← Aller au profil</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Dashboard</h1>
        <p className="muted">
          Espace streamer (MVP) — titre + clés RTMP.
        </p>
      </div>

      {err && <div className="hint" style={{ opacity: 0.9 }}>⚠️ {err}</div>}
      {loading && <div className="muted">Chargement…</div>}

      {!loading && !streamer ? (
        <div className="panel">
          <div className="panelTitle">Chaîne</div>
          <div className="muted">
            Aucune chaîne LunaLive liée à ton compte.
            (Normalement créée à l’approbation admin)
          </div>
        </div>
      ) : (
        streamer && (
          <>
            <TitleEditorCard
              streamer={streamer}
              onSave={async (title) => {
                if (!token) return;
                const r = await updateMyStreamerTitle(token, title);
                setStreamer(r.streamer);
              }}
            />

            <StreamKeysCard connection={connection} />

            <PlaceholdersCard />
          </>
        )
      )}
    </main>
  );
}
