import * as React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import {
  dliveLinkMe,
  dliveLinkRequest,
  dliveLinkVerify,
  dliveLinkToggle,
  dliveLinkUnlink,
} from "../../../lib/api";

export function DliveLinkPanel() {
  const { token } = useAuth();

  const [me, setMe] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [channel, setChannel] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const reload = React.useCallback(() => {
    setErr(null);

    if (!token) {
      setMe(null);
      return;
    }

    dliveLinkMe(token)
      .then(setMe)
      .catch((e: any) => setErr(String(e?.message || "ERROR")));
  }, [token]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function onRequest() {
    if (!token) return;

    setLoading(true);
    setErr(null);
    try {
      await dliveLinkRequest(token, channel);
      reload();
    } catch (e: any) {
      setErr(String(e?.message || "ERROR"));
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    if (!token) return;

    setLoading(true);
    setErr(null);
    try {
      await dliveLinkVerify(token);
      reload();
    } catch (e: any) {
      setErr(String(e?.message || "ERROR"));
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(v: boolean) {
    if (!token) return;

    setLoading(true);
    setErr(null);
    try {
      await dliveLinkToggle(token, v);
      reload();
    } catch (e: any) {
      setErr(String(e?.message || "ERROR"));
    } finally {
      setLoading(false);
    }
  }

  async function onUnlink() {
    if (!token) return;

    setLoading(true);
    setErr(null);
    try {
      await dliveLinkUnlink(token);
      reload();
    } catch (e: any) {
      setErr(String(e?.message || "ERROR"));
    } finally {
      setLoading(false);
    }
  }

  // pas connecté
  if (!token) {
    return (
      <div className="panel">
        <div className="panelTitle">Chaîne DLive (poll)</div>
        <div className="muted">Connecte-toi pour lier ta chaîne DLive.</div>
      </div>
    );
  }

  // loading initial
  if (!me?.ok) {
    return (
      <div className="panel">
        <div className="panelTitle">Chaîne DLive (poll)</div>
        <div className="muted">Chargement…</div>
        {err ? (
          <div style={{ marginTop: 12, fontWeight: 800, color: "rgba(220,60,80,0.95)" }}>
            Erreur : {err}
          </div>
        ) : null}
      </div>
    );
  }

  const linked = !!me.linkedDisplayname;
  const pending = me.pending;

  return (
    <div className="panel">
      <div className="panelTitle">Chaîne DLive (poll)</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!me.useLinked}
            disabled={!linked || loading}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>
            <b>Utiliser ma chaîne DLive</b>
          </span>
        </label>

        <span className="muted">
          {me.useLinked ? (
            <>
              → poll sur <b>{me.linkedDisplayname}</b>
            </>
          ) : (
            <>
              → poll sur le <b>provider assigné</b>
            </>
          )}
        </span>
      </div>

      <div style={{ marginTop: 10 }}>
        {linked ? (
          <div className="muted">
            Liée : <b>{me.linkedDisplayname}</b>{" "}
            <span className="muted">({me.linkedUsername || "username inconnu"})</span>
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btnGhostInline" onClick={onUnlink} disabled={loading}>
                ❌ Dissocier
              </button>
            </div>
          </div>
        ) : (
          <div className="muted">Aucune chaîne DLive liée pour le moment.</div>
        )}
      </div>

      <div style={{ marginTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
        {pending ? (
          <>
            <div className="muted">
              1) Envoie ce code dans le chat de <b>{pending.requestedDisplayname}</b> :
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontWeight: 900,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.06)",
                }}
              >
                {pending.code}
              </div>

              <button className="btnGhostInline" onClick={() => navigator.clipboard?.writeText(pending.code)}>
                📋 Copier
              </button>
            </div>

            <div className="muted" style={{ marginTop: 8 }}>
              2) Puis clique “Vérifier”.
              <br />
              <span className="muted">(Si tu l’as déjà envoyé avant de cliquer, renvoie-le une 2e fois.)</span>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btnPrimary" onClick={onVerify} disabled={loading}>
                ✅ Vérifier
              </button>
              <button className="btnGhostInline" onClick={reload} disabled={loading}>
                🔄 Rafraîchir
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="muted">
              Entre ton <b>nom de chaîne DLive</b> ou l’URL (ex:{" "}
              <span style={{ fontFamily: "monospace" }}>https://dlive.tv/LeCasinoze</span>)
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="LeCasinoze ou https://dlive.tv/LeCasinoze"
                style={{ minWidth: 320 }}
                disabled={loading}
              />
              <button className="btnPrimary" onClick={onRequest} disabled={loading || channel.trim().length < 2}>
                🔗 Générer un code
              </button>
            </div>
          </>
        )}
      </div>

      {err ? (
        <div style={{ marginTop: 12, fontWeight: 800, color: "rgba(220,60,80,0.95)" }}>
          Erreur : {err}
        </div>
      ) : null}
    </div>
  );
}
