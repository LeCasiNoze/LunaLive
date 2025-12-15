import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function DashboardPage() {
  const { user } = useAuth();

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

  if (user.role !== "streamer") {
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
        <p className="muted">MVP : ici on mettra stats, paramètres stream, mod tools, etc.</p>
      </div>

      <div className="panel">
        <div className="panelTitle">À venir</div>
        <ul className="bullets">
          <li>Infos compte streamer</li>
          <li>Lier DLive (plus tard)</li>
          <li>Paramètres de chaîne / overlay</li>
          <li>Stats live + historique</li>
        </ul>
      </div>
    </main>
  );
}
