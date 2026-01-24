// web/src/components/dashboard/sections/DliveLinkPanel.tsx
import * as React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import {
  dliveLinkMe,
  dliveLinkRequest,
  dliveLinkVerify,
  dliveLinkToggle,
  dliveLinkUnlink,
} from "../../../lib/api";

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "pink" | "green" | "blue";
  children: React.ReactNode;
}) {
  const tones: Record<string, { bg: string; bd: string }> = {
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.10)" },
    pink: { bg: "rgba(255,90,180,0.14)", bd: "rgba(255,90,180,0.26)" },
    green: { bg: "rgba(80,240,170,0.12)", bd: "rgba(80,240,170,0.22)" },
    blue: { bg: "rgba(80,160,255,0.14)", bd: "rgba(80,160,255,0.26)" },
  };
  const t = tones[tone] ?? tones.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontWeight: 950,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

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

      // ✅ SOUM SOUM: on "prime" la vérif immédiatement, comme si l'utilisateur avait cliqué sur Vérifier.
      // L'appel peut échouer (normal si le code n'a pas encore été envoyé), donc on ignore l'erreur.
      try {
        await dliveLinkVerify(token);
      } catch {
        // ignore: on veut juste amorcer la fenêtre de vérif côté backend
      }

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

  if (!token) {
    return (
      <div className="panel">
        <div className="panelTitle">Chaîne DLive</div>
        <div className="muted">Connecte-toi pour lier ta chaîne DLive.</div>
      </div>
    );
  }

  if (!me?.ok) {
    return (
      <div className="panel">
        <div className="panelTitle">Chaîne DLive</div>
        <div className="muted">Chargement…</div>
        {err ? (
          <div className="hint" style={{ marginTop: 10, opacity: 0.95 }}>
            ⚠️ {err}
          </div>
        ) : null}
      </div>
    );
  }

  const linked = !!me.linkedDisplayname;
  const pending = me.pending;

  return (
    <div className="panel">
      <style>{`
        .llRowCard{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.12);
          padding: 14px;
        }
        .llMono{
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .llInput{
          min-width: 320px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.20);
          color: white;
          outline: none;
          font-weight: 850;
        }
        .llInput:focus{
          border-color: rgba(124,77,255,0.45);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }
      `}</style>

      <div className="panelTitle">Chaîne DLive</div>

      <div className="llRowCard" style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!me.useLinked}
              disabled={!linked || loading}
              onChange={(e) => onToggle(e.target.checked)}
            />
            <span style={{ fontWeight: 950 }}>Utiliser ma chaîne DLive</span>
          </label>

          <div style={{ flex: 1 }} />

          <Chip tone={linked ? "green" : "neutral"}>{linked ? "✅ Liée" : "⚠️ Non liée"}</Chip>
          <Chip tone={me.useLinked ? "blue" : "neutral"}>
            {me.useLinked ? `📡 Restream Dlive : ${me.linkedDisplayname}` : "🏷️ Uniquement LunaLive"}
          </Chip>
        </div>

        <div style={{ marginTop: 10 }}>
          {linked ? (
            <div className="mutedSmall">
              Liée : <b>{me.linkedDisplayname}</b>{" "}
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btnGhostSmall" onClick={onUnlink} disabled={loading}>
                  ❌ Dissocier
                </button>
              </div>
            </div>
          ) : (
            <div className="mutedSmall">Aucune chaîne DLive liée pour le moment.</div>
          )}
        </div>

        <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
          {pending ? (
            <>
              <div className="mutedSmall">
                1) Envoie ce code dans le chat de <b>{pending.requestedDisplayname}</b> :
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div
                  className="llMono"
                  style={{
                    fontWeight: 1000,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  {pending.code}
                </div>

                <button className="btnGhostSmall" onClick={() => navigator.clipboard?.writeText(pending.code)}>
                  📋 Copier
                </button>
              </div>

              <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                2) Puis clique “Vérifier”.
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btnPrimarySmall" onClick={onVerify} disabled={loading}>
                  ✅ Vérifier
                </button>
                <button className="btnGhostSmall" onClick={reload} disabled={loading}>
                  🔄 Rafraîchir
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mutedSmall">
                Entre ton <b>nom de chaîne DLive</b> ou l’URL (ex:{" "}
                <span className="llMono">https://dlive.tv/LeCasinoze</span>)
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="LeCasinoze ou https://dlive.tv/LeCasinoze"
                  className="llInput"
                  disabled={loading}
                />
                <button className="btnPrimarySmall" onClick={onRequest} disabled={loading || channel.trim().length < 2}>
                  🔗 Générer un code
                </button>
              </div>
            </>
          )}
        </div>

        {err ? (
          <div className="hint" style={{ marginTop: 12, opacity: 0.95 }}>
            ⚠️ {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}
