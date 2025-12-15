import * as React from "react";
import { applyStreamer, myStreamerRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

export default function ProfilePage() {
  const { user, token, refreshMe } = useAuth();
  const [reqStatus, setReqStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

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
              Connecté en tant que <b>{user.username}</b> — rubis: <b>{user.rubis.toLocaleString("fr-FR")}</b> — rôle: <b>{user.role}</b>
            </p>

            {user.role !== "streamer" && (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">Devenir streamer</div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  {reqStatus === "pending" && "Demande envoyée : en attente de validation."}
                  {reqStatus === "approved" && "Demande acceptée ✅"}
                  {reqStatus === "rejected" && "Demande refusée."}
                  {!reqStatus && "Tu peux envoyer une demande pour devenir streamer."}
                </div>

                <button className="btnPrimary" onClick={onApply} disabled={busy || reqStatus === "pending" || reqStatus === "approved"}>
                  {busy ? "…" : reqStatus === "pending" ? "En attente" : reqStatus === "approved" ? "Déjà streamer" : "Faire une demande"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
