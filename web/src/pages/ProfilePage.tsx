import * as React from "react";
import { Link } from "react-router-dom";
import { applyStreamer, myStreamerRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { AchievementsModal } from "../components/AchievementsModal";
import { PersonalisationSection } from "../components/profile/PersonalisationSection";

export default function ProfilePage() {
  const { user, token, refreshMe } = useAuth();
  const [reqStatus, setReqStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [achOpen, setAchOpen] = React.useState(false);

  const [tab, setTab] = React.useState<"profile" | "personalisation">("profile");

  React.useEffect(() => {
    (async () => {
      if (!token) return setReqStatus(null);
      const r = await myStreamerRequest(token);
      setReqStatus(r.request?.status ?? null);
    })();
  }, [token]);

  async function onApply() {
    if (!token) return;
    setBusy(true);
    try {
      const r = await applyStreamer(token);
      setReqStatus(r.request.status);
      await refreshMe();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Profil</h1>

        {!user ? (
          <p className="muted">Connecte-toi pour accéder à ton profil.</p>
        ) : (
          <>
            <p className="muted">
              Connecté en tant que <b>{user.username}</b> — rubis:{" "}
              <b>{user.rubis.toLocaleString("fr-FR")}</b> — rôle:{" "}
              <b>{user.role}</b>
            </p>

            {/* Onglets */}
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button
                className={tab === "profile" ? "btnPrimary" : "btnGhost"}
                onClick={() => setTab("profile")}
              >
                Profil
              </button>
              <button
                className={tab === "personalisation" ? "btnPrimary" : "btnGhost"}
                onClick={() => setTab("personalisation")}
              >
                Personnalisation
              </button>
            </div>

            {tab === "profile" ? (
              <>
                {/* ✅ Achievements */}
                <div className="panel" style={{ marginTop: 14 }}>
                  <div className="panelTitle">Succès</div>
                  <div className="muted" style={{ marginBottom: 10 }}>
                    Consulte tes succès (Bronze / Silver / Gold / Master).
                  </div>

                  <button className="btnPrimary" onClick={() => setAchOpen(true)}>
                    Ouvrir les succès
                  </button>
                </div>

                {(user.role === "streamer" || user.role === "admin") && (
                  <div className="panel" style={{ marginTop: 14 }}>
                    <div className="panelTitle">Espace streamer</div>
                    <div className="muted" style={{ marginBottom: 10 }}>
                      Accède à ton dashboard streamer.
                    </div>
                    <Link to="/dashboard" className="btnPrimary">
                      Ouvrir le Dashboard
                    </Link>
                  </div>
                )}

                {user.role !== "streamer" && user.role !== "admin" && (
                  <div className="panel" style={{ marginTop: 14 }}>
                    <div className="panelTitle">Devenir streamer</div>
                    <div className="muted" style={{ marginBottom: 10 }}>
                      {reqStatus === "pending" && "Demande envoyée : en attente de validation."}
                      {reqStatus === "approved" && "Demande acceptée ✅"}
                      {reqStatus === "rejected" && "Demande refusée."}
                      {!reqStatus && "Tu peux envoyer une demande pour devenir streamer."}
                    </div>

                    <button
                      className="btnPrimary"
                      onClick={onApply}
                      disabled={busy || reqStatus === "pending" || reqStatus === "approved"}
                    >
                      {busy
                        ? "…"
                        : reqStatus === "pending"
                        ? "En attente"
                        : reqStatus === "approved"
                        ? "Déjà streamer"
                        : "Faire une demande"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* ✅ Personnalisation */}
                <PersonalisationSection username={user.username} />
              </>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <AchievementsModal open={achOpen} onClose={() => setAchOpen(false)} />
    </main>
  );
}
