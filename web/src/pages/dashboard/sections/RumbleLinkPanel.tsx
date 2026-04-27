// web/src/pages/dashboard/sections/RumbleLinkPanel.tsx
// Panel pour lier une chaine Rumble au streamer Luna courant.
// Vérification cryptographique côté backend via /-livestream-api/get-data:
//  - on probe la clé Rumble fournie
//  - si la clé retourne un username qui matche le pseudo entré → vérifié
//  - l'api_key étant accessible uniquement depuis le dashboard Rumble loggé,
//    sa possession prouve la propriété du compte.

import * as React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { rumbleLinkMe, rumbleLinkSubmit, rumbleLinkUnlink } from "../../../lib/api";

const RUMBLE_CSS = `
.rumble-card {
  padding:16px; border-radius:18px;
  border:1px solid rgba(133,194,93,.18);
  background:rgba(0,0,0,.18);
  margin-top:14px;
}
.rumble-card h3 {
  margin:0 0 8px 0;
  font-size:18px; font-weight:800;
  color:rgba(220,235,200,.95);
  display:flex; align-items:center; gap:10px;
}
.rumble-step {
  display:flex; gap:12px; align-items:flex-start;
  padding:10px 14px; border-radius:14px;
  border:1px solid rgba(133,194,93,.14);
  background:rgba(133,194,93,.06);
  margin-top:8px;
}
.rumble-step-num {
  width:26px; height:26px; flex-shrink:0; border-radius:50%;
  display:grid; place-items:center;
  font-weight:800; font-size:13px;
  border:1px solid rgba(133,194,93,.32); background:rgba(133,194,93,.16);
  color:rgba(200,235,150,.95);
}
.rumble-input {
  width:100%; padding:11px 13px; border-radius:13px;
  border:1px solid rgba(133,194,93,.22); background:rgba(133,194,93,.08);
  color:rgba(235,245,225,.95); outline:none;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px;
  box-sizing:border-box;
}
.rumble-input:focus {
  border-color:rgba(133,194,93,.46); background:rgba(133,194,93,.12);
  box-shadow:0 0 0 3px rgba(133,194,93,.10);
}
.rumble-btn {
  padding:10px 18px; border-radius:12px; border:0;
  font-weight:800; font-size:13px; cursor:pointer;
  letter-spacing:.02em;
  background:linear-gradient(135deg,#7ec850 0%,#5ea332 100%);
  color:#0c1408;
  transition:all 120ms ease;
}
.rumble-btn:hover { filter:brightness(1.08); transform:translateY(-1px); }
.rumble-btn:disabled { opacity:.55; cursor:not-allowed; }
.rumble-btn-ghost {
  padding:8px 14px; border-radius:10px;
  border:1px solid rgba(220,80,80,.32);
  background:rgba(220,80,80,.08); color:rgba(255,200,200,.92);
  font-size:12px; font-weight:700; cursor:pointer;
}
.rumble-link-anchor {
  color:rgba(180,220,140,.95); text-decoration:underline;
  font-weight:700;
}
.rumble-status-ok {
  padding:12px 14px; border-radius:14px;
  background:rgba(110,180,80,.10); border:1px solid rgba(110,180,80,.28);
  color:rgba(220,240,200,.96); display:flex; align-items:center; gap:12px;
}
.rumble-error {
  padding:10px 14px; border-radius:12px;
  background:rgba(220,80,80,.10); border:1px solid rgba(220,80,80,.32);
  color:rgba(255,210,210,.95); font-size:13px; margin-top:10px;
}
.rumble-success {
  padding:10px 14px; border-radius:12px;
  background:rgba(110,180,80,.10); border:1px solid rgba(110,180,80,.32);
  color:rgba(220,240,200,.95); font-size:13px; margin-top:10px;
}
`;

type LinkState = {
  linked: boolean;
  account: { username: string; assignedAt: string | null } | null;
};

export function RumbleLinkPanel() {
  const { token } = useAuth();
  const [state, setState] = React.useState<LinkState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [unlinking, setUnlinking] = React.useState(false);
  const [pseudo, setPseudo] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [showTutorial, setShowTutorial] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!token) return;
    try {
      const r = await rumbleLinkMe(token);
      setState({
        linked: !!r?.linked,
        account: r?.account ?? null,
      });
    } catch (e: any) {
      setError(String(e?.message || "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!pseudo.trim() || !apiKey.trim()) {
      setError("Pseudo et clé API requis");
      return;
    }
    if (!token) {
      setError("Session expirée — recharge la page");
      return;
    }
    setSubmitting(true);
    try {
      const r: any = await rumbleLinkSubmit(token, { username: pseudo.trim(), apiKey: apiKey.trim() });
      if (r?.ok) {
        setSuccess(r.message || "Chaine Rumble liée !");
        setPseudo("");
        setApiKey("");
        await refresh();
      } else {
        setError(r?.message || r?.error || "Échec de la liaison");
      }
    } catch (e: any) {
      setError(String(e?.message || e?.error || "Échec"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onUnlink() {
    if (!confirm("Délier ta chaine Rumble ? Ton stream ne sera plus auto-détecté.")) return;
    if (!token) return;
    setUnlinking(true);
    setError(null);
    try {
      await rumbleLinkUnlink(token);
      await refresh();
      setSuccess("Chaine déliée");
    } catch (e: any) {
      setError(String(e?.message || "Échec"));
    } finally {
      setUnlinking(false);
    }
  }

  if (loading) {
    return <div className="rumble-card"><style>{RUMBLE_CSS}</style>Chargement…</div>;
  }

  return (
    <div className="rumble-card">
      <style>{RUMBLE_CSS}</style>
      <h3>
        <span style={{ fontSize: 22 }}>🟢</span>
        Chaine Rumble
      </h3>

      {state?.linked && state.account ? (
        <div>
          <div className="rumble-status-ok">
            <span style={{ fontSize: 22 }}>✅</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{state.account.username}</div>
              <div style={{ fontSize: 12, opacity: 0.78, marginTop: 2 }}>
                Liée depuis {state.account.assignedAt ? new Date(state.account.assignedAt).toLocaleDateString("fr-FR") : "—"}
              </div>
            </div>
            <button className="rumble-btn-ghost" onClick={onUnlink} disabled={unlinking}>
              {unlinking ? "…" : "Délier"}
            </button>
          </div>
          {success && <div className="rumble-success">{success}</div>}
          {error && <div className="rumble-error">{error}</div>}
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5, margin: "0 0 14px 0" }}>
            Lie ta chaine Rumble à ton compte LunaLive pour que ton stream soit auto-détecté et affiché.
            Ton stream sera disponible publiquement sur ta page Luna dès que tu démarreras un live.
          </p>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.85 }}>
              Pseudo Rumble (ou URL de ta chaine)
            </label>
            <input
              type="text"
              className="rumble-input"
              placeholder="LeCasiNoze ou https://rumble.com/c/LeCasiNoze"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              disabled={submitting}
              autoComplete="off"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.85 }}>
              Clé API de diffusion en direct
              <button
                type="button"
                onClick={() => setShowTutorial((v) => !v)}
                style={{
                  marginLeft: 10, padding: "2px 10px", borderRadius: 8,
                  border: "1px solid rgba(133,194,93,.30)",
                  background: "rgba(133,194,93,.08)",
                  color: "rgba(200,235,150,.95)", fontSize: 11, cursor: "pointer", fontWeight: 700,
                }}
              >
                {showTutorial ? "Masquer le tuto" : "Comment l'obtenir ?"}
              </button>
            </label>
            <input
              type="text"
              className="rumble-input"
              placeholder="Ta clé API Rumble (40+ caractères)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {showTutorial && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: "rgba(133,194,93,.05)", border: "1px solid rgba(133,194,93,.16)" }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10, color: "rgba(200,235,150,.95)" }}>
                Comment récupérer ta clé API Rumble
              </div>
              <div className="rumble-step">
                <div className="rumble-step-num">1</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Connecte-toi à ton compte sur{" "}
                  <a href="https://rumble.com/account/streaming-api" target="_blank" rel="noreferrer" className="rumble-link-anchor">
                    rumble.com/account/streaming-api
                  </a>
                </div>
              </div>
              <div className="rumble-step">
                <div className="rumble-step-num">2</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Dans le menu de gauche, va dans <b>Tableau de bord du créateur</b> → <b>Diffusion en direct</b> → <b>Diffusion (API) en direct</b>
                </div>
              </div>
              <div className="rumble-step">
                <div className="rumble-step-num">3</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Clique sur <b>« Générer une clé API »</b> à côté de ton pseudo
                </div>
              </div>
              <div className="rumble-step">
                <div className="rumble-step-num">4</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Une URL apparaît, du type <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, opacity: 0.85 }}>rumble.com/-livestream-api/get-data?key=<b>XXXXXX</b></span> — copie-colle <b>uniquement la valeur après <code>key=</code></b>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78, lineHeight: 1.5 }}>
                ⚠️ Garde cette clé privée — ne la partage qu'avec des services de confiance.
                Tu peux la régénérer à tout moment depuis ton dashboard.
              </div>
            </div>
          )}

          {error && <div className="rumble-error">{error}</div>}
          {success && <div className="rumble-success">{success}</div>}

          <button type="submit" className="rumble-btn" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? "Vérification…" : "Lier ma chaine Rumble"}
          </button>
        </form>
      )}
    </div>
  );
}
