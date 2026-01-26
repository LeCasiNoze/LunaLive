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

function safeNowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

export function DliveLinkPanel() {
  const { token } = useAuth();

  // log prefix (stable)
  const logIdRef = React.useRef<string>(
    `DliveLinkPanel:${Math.random().toString(16).slice(2, 8)}`
  );
  const LOG = React.useCallback(
    (event: string, data?: any) => {
      // logs publics navigateur (on s'en fout)
      try {
        // eslint-disable-next-line no-console
        console.log(`[${logIdRef.current}] ${safeNowIso()} ${event}`, data ?? "");
      } catch {}
    },
    []
  );

  const [me, setMe] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [channel, setChannel] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  // debug phases for UX + logs
  const [phase, setPhase] = React.useState<string | null>(null);

  // sequence ids for logs
  const seqRef = React.useRef(0);

  const reload = React.useCallback(() => {
    const seq = ++seqRef.current;

    setErr(null);

    if (!token) {
      setMe(null);
      LOG("reload:skip:no-token", { seq });
      return;
    }

    LOG("reload:start", { seq });
    const t0 = performance.now();

    dliveLinkMe(token)
      .then((data) => {
        const ms = Math.round(performance.now() - t0);
        setMe(data);
        LOG("reload:ok", {
          seq,
          ms,
          ok: !!data?.ok,
          linkedDisplayname: data?.linkedDisplayname ?? null,
          linkedUsername: data?.linkedUsername ?? null,
          useLinked: !!data?.useLinked,
          pending: data?.pending
            ? {
                requestedDisplayname: data.pending.requestedDisplayname,
                requestedUsername: data.pending.requestedUsername,
                code: data.pending.code,
                expiresAt: data.pending.expiresAt,
              }
            : null,
        });
      })
      .catch((e: any) => {
        const ms = Math.round(performance.now() - t0);
        setErr(String(e?.message || "ERROR"));
        LOG("reload:err", { seq, ms, msg: String(e?.message || "ERROR"), e });
      });
  }, [token, LOG]);

  React.useEffect(() => {
    LOG("mount");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function onRequest() {
    if (!token) return;

    const seq = ++seqRef.current;
    const input = String(channel || "");

    LOG("dlive:request:click", { seq, input });

    setLoading(true);
    setErr(null);
    setPhase("requesting_code");

    const t0 = performance.now();
    try {
      LOG("dlive:request:start", { seq, input });

      // ⚠️ IMPORTANT: on NE prime plus la vérif ici (ça bloquait 25s et flingue l'UX)
      // On fait UNIQUEMENT request + reload pour afficher le code.
      await dliveLinkRequest(token, channel);

      const ms = Math.round(performance.now() - t0);
      LOG("dlive:request:ok", { seq, ms });

      setPhase("code_ready");
      reload();

      LOG("dlive:request:done", { seq });
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = String(e?.message || "ERROR");
      setErr(msg);
      setPhase("error_request");
      LOG("dlive:request:err", { seq, ms, msg, e });
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    if (!token) return;

    const seq = ++seqRef.current;
    const pendingSnapshot = me?.pending
      ? {
          requestedDisplayname: me.pending.requestedDisplayname,
          requestedUsername: me.pending.requestedUsername,
          code: me.pending.code,
          expiresAt: me.pending.expiresAt,
        }
      : null;

    LOG("dlive:verify:click", { seq, pending: pendingSnapshot });

    setLoading(true);
    setErr(null);

    // Phases "humaines" (pour bien suivre ce qui se passe)
    setPhase("backend_connect_chat");

    // mini logs d'étapes côté front (on ne sait pas côté serveur, mais on trace l'intention)
    setTimeout(() => {
      LOG("dlive:verify:phase", {
        seq,
        phase: "backend_connect_chat (server)",
        detail: "Le serveur va écouter le chat DLive via websocket.",
      });
      setPhase("backend_ready_to_read_code");
      LOG("dlive:verify:phase", {
        seq,
        phase: "backend_ready_to_read_code (server)",
        detail: "Le serveur attend de voir le code dans le chat.",
      });
    }, 50);

    const t0 = performance.now();
    try {
      LOG("dlive:verify:start", { seq });

      await dliveLinkVerify(token);

      const ms = Math.round(performance.now() - t0);
      LOG("dlive:verify:ok", { seq, ms });

      setPhase("verified");
      reload();
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = String(e?.message || "ERROR");

      setErr(msg);
      setPhase("error_verify");

      // Log explicite du cas TIMEOUT
      LOG("dlive:verify:err", {
        seq,
        ms,
        msg,
        hint:
          msg === "TIMEOUT"
            ? "Timeout côté client/serveur. Le serveur peut encore finir: clique Rafraîchir ou attend 2-3s puis Rafraîchir."
            : undefined,
        e,
      });

      // on reload quand même pour voir si ça s'est lié malgré l'erreur
      try {
        reload();
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(v: boolean) {
    if (!token) return;

    const seq = ++seqRef.current;
    LOG("dlive:toggle:click", { seq, v });

    setLoading(true);
    setErr(null);
    setPhase("toggling");

    const t0 = performance.now();
    try {
      await dliveLinkToggle(token, v);
      const ms = Math.round(performance.now() - t0);
      LOG("dlive:toggle:ok", { seq, ms, v });
      setPhase("idle");
      reload();
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = String(e?.message || "ERROR");
      setErr(msg);
      setPhase("error_toggle");
      LOG("dlive:toggle:err", { seq, ms, msg, e });
    } finally {
      setLoading(false);
    }
  }

  async function onUnlink() {
    if (!token) return;

    const seq = ++seqRef.current;
    LOG("dlive:unlink:click", { seq });

    setLoading(true);
    setErr(null);
    setPhase("unlinking");

    const t0 = performance.now();
    try {
      await dliveLinkUnlink(token);
      const ms = Math.round(performance.now() - t0);
      LOG("dlive:unlink:ok", { seq, ms });
      setPhase("idle");
      reload();
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = String(e?.message || "ERROR");
      setErr(msg);
      setPhase("error_unlink");
      LOG("dlive:unlink:err", { seq, ms, msg, e });
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

          {/* petit indicateur debug (optionnel) */}
          {phase ? <Chip tone="neutral">🧪 {phase}</Chip> : null}
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

                <button
                  className="btnGhostSmall"
                  onClick={() => {
                    LOG("dlive:code:copy", { code: pending.code });
                    navigator.clipboard?.writeText(pending.code);
                  }}
                >
                  📋 Copier
                </button>
              </div>

              <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.85 }}>
                Debug pending:{" "}
                <span className="llMono" style={{ opacity: 0.95 }}>
                  displayname={String(pending.requestedDisplayname || "")} • username=
                  {String(pending.requestedUsername || "")} • expires=
                  {String(pending.expiresAt || "")}
                </span>
              </div>

              <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                2) Puis clique “Vérifier”.
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btnPrimarySmall" onClick={onVerify} disabled={loading}>
                  ✅ Vérifier
                </button>
                <button
                  className="btnGhostSmall"
                  onClick={() => {
                    LOG("reload:manual:click");
                    reload();
                  }}
                  disabled={loading}
                >
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setChannel(v);
                    LOG("dlive:channel:change", { v });
                  }}
                  placeholder="LeCasinoze ou https://dlive.tv/LeCasinoze"
                  className="llInput"
                  disabled={loading}
                />
                <button className="btnPrimarySmall" onClick={onRequest} disabled={loading || channel.trim().length < 2}>
                  🔗 Générer un code
                </button>
                <button
                  className="btnGhostSmall"
                  onClick={() => {
                    LOG("reload:manual:click");
                    reload();
                  }}
                  disabled={loading}
                  title="Rafraîchir"
                >
                  🔄
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
