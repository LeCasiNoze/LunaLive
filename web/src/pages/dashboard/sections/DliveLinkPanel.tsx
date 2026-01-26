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

function getErrMsg(e: any) {
  return String(e?.message || e?.error || "ERROR");
}

export function DliveLinkPanel() {
  const { token } = useAuth();

  // log prefix (stable)
  const logIdRef = React.useRef<string>(`DliveLinkPanel:${Math.random().toString(16).slice(2, 8)}`);
  const LOG = React.useCallback((event: string, data?: any) => {
    try {
      // eslint-disable-next-line no-console
      console.log(`[${logIdRef.current}] ${safeNowIso()} ${event}`, data ?? "");
    } catch {}
  }, []);

  const VERIFY_WINDOW_MS = 120_000;

  const [me, setMe] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [channel, setChannel] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  // UX / debug phase
  const [phase, setPhase] = React.useState<string | null>(null);

  // "écoute chat" UX
  const [verifying, setVerifying] = React.useState(false);
  const [verifyEndsAt, setVerifyEndsAt] = React.useState<number | null>(null);
  const [verifyLeftSec, setVerifyLeftSec] = React.useState<number>(0);

  // to prevent re-triggering auto listen in a loop
  const autoStartedForCodeRef = React.useRef<string | null>(null);

  // sequence ids for logs
  const seqRef = React.useRef(0);

  // countdown
  React.useEffect(() => {
    if (!verifyEndsAt) {
      setVerifyLeftSec(0);
      return;
    }
    const tick = () => {
      const leftMs = Math.max(0, verifyEndsAt - Date.now());
      setVerifyLeftSec(Math.ceil(leftMs / 1000));
    };
    tick();
    const it = setInterval(tick, 250);
    return () => clearInterval(it);
  }, [verifyEndsAt]);

  const reload = React.useCallback(async () => {
    const seq = ++seqRef.current;
    setErr(null);

    if (!token) {
      setMe(null);
      LOG("reload:skip:no-token", { seq });
      return null;
    }

    LOG("reload:start", { seq });
    const t0 = performance.now();
    try {
      const data = await dliveLinkMe(token);
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
      return data;
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg);
      LOG("reload:err", { seq, ms, msg, e });
      return null;
    }
  }, [token, LOG]);

  React.useEffect(() => {
    LOG("mount");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const startListenWindow = React.useCallback(
    async (opts: { reason: string; expectedCode?: string | null }) => {
      if (!token) return;

      const seq = ++seqRef.current;
      const reason = opts.reason;
      const expectedCode = String(opts.expectedCode ?? "") || null;

      LOG("dlive:listen:start", { seq, reason, expectedCode });

      setErr(null);
      setPhase("listening_chat");
      setVerifying(true);
      setVerifyEndsAt(Date.now() + VERIFY_WINDOW_MS);

      const t0 = performance.now();
      try {
        // ✅ api.ts patch: dliveLinkVerify(token, { timeoutMs })
        await dliveLinkVerify(token, { timeoutMs: VERIFY_WINDOW_MS });

        const ms = Math.round(performance.now() - t0);
        LOG("dlive:listen:ok", { seq, ms, reason });

        setPhase("verified");
        setVerifying(false);
        setVerifyEndsAt(null);

        await reload();
      } catch (e: any) {
        const ms = Math.round(performance.now() - t0);
        const msg = getErrMsg(e);

        LOG("dlive:listen:err", { seq, ms, msg, reason, e });

        setVerifying(false);
        setVerifyEndsAt(null);

        // ✅ Important UX: au bout de 2 min => on considère "raté", et on demande de régénérer
        // (côté serveur, le pending existe encore, mais on veut le flow simple: regen -> on remplace).
        if (String(msg).toUpperCase().includes("TIMEOUT")) {
          setPhase("timeout_need_regen");
          setErr(
            "On n’a pas vu le code dans les 2 minutes. Regénère un code, puis renvoie-le dans ton chat DLive."
          );
        } else {
          setPhase("error_listen");
          setErr(msg);
        }

        await reload();
      }
    },
    [VERIFY_WINDOW_MS, LOG, reload, token]
  );

  // ✅ Auto-start listening if we already have a pending code (no “Vérifier” button)
  React.useEffect(() => {
    if (!token) return;
    if (!me?.ok) return;

    const linked = !!me?.linkedDisplayname;
    const pending = me?.pending;

    if (linked) return; // already linked
    if (!pending?.code) return;
    if (verifying) return;

    const code = String(pending.code || "").trim();
    if (!code) return;

    // avoid loop: only auto-start once per code
    if (autoStartedForCodeRef.current === code) return;
    autoStartedForCodeRef.current = code;

    LOG("dlive:autoListen:trigger", {
      code,
      requestedDisplayname: pending?.requestedDisplayname,
      requestedUsername: pending?.requestedUsername,
    });

    startListenWindow({ reason: "auto-on-pending", expectedCode: code });
  }, [me, token, verifying, LOG, startListenWindow]);

  // ✅ Nouveau protocole:
  // - "Générer un code" => crée le code + reload + écoute DIRECT 2 min
  async function onRequest() {
    if (!token) return;

    const seq = ++seqRef.current;
    const input = String(channel || "").trim();

    LOG("dlive:request+listen:click", { seq, input });

    setLoading(true);
    setErr(null);
    setPhase("requesting_code");

    const t0 = performance.now();
    try {
      await dliveLinkRequest(token, channel);

      const ms = Math.round(performance.now() - t0);
      LOG("dlive:request:ok", { seq, ms });

      setPhase("code_ready");

      const data = await reload();
      const code = String(data?.pending?.code || "").trim();

      // reset auto-start guard so we *can* start immediately for the new code
      if (code) autoStartedForCodeRef.current = code;

      // start listen now (single click flow)
      await startListenWindow({ reason: "after-request", expectedCode: code || null });
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg);
      setPhase("error_request");
      LOG("dlive:request:err", { seq, ms, msg, e });
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
      await reload();
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
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
      autoStartedForCodeRef.current = null;
      await reload();
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
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
              disabled={!linked || loading || verifying}
              onChange={(e) => onToggle(e.target.checked)}
            />
            <span style={{ fontWeight: 950 }}>Utiliser ma chaîne DLive</span>
          </label>

          <div style={{ flex: 1 }} />

          <Chip tone={linked ? "green" : "neutral"}>{linked ? "✅ Liée" : "⚠️ Non liée"}</Chip>
          <Chip tone={me.useLinked ? "blue" : "neutral"}>
            {me.useLinked ? `📡 Restream Dlive : ${me.linkedDisplayname}` : "🏷️ Uniquement LunaLive"}
          </Chip>

          {verifying ? <Chip tone="pink">{`🎧 Vérif en cours… ${verifyLeftSec}s`}</Chip> : null}
          {phase ? <Chip tone="neutral">🧪 {phase}</Chip> : null}
        </div>

        <div style={{ marginTop: 10 }}>
          {linked ? (
            <div className="mutedSmall">
              Liée : <b>{me.linkedDisplayname}</b>{" "}
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btnGhostSmall" onClick={onUnlink} disabled={loading || verifying}>
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
              {/* ✅ NO BUTTON "Vérifier" — on écoute automatiquement (ou juste après "Générer") */}
              <div className="mutedSmall" style={{ lineHeight: 1.55 }}>
                <div>
                  1) Ouvre le chat de <b>{pending.requestedDisplayname}</b> (sur DLive) et envoie ce code :
                </div>
                <div style={{ marginTop: 6, opacity: 0.92 }}>
                  <b>Important :</b> envoie-le <b>depuis ton compte streamer</b>
                  <br />
                  Exemple :{" "}
                  <span className="llMono">
                    {pending.code} sur https://dlive.tv/{pending.requestedDisplayname}
                  </span>
                </div>
                <div style={{ marginTop: 8, opacity: 0.85 }}>
                  2) Dès que tu l’envoies, LunaLive écoute pendant <b>2 minutes</b> et valide automatiquement.
                </div>
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
                    navigator.clipboard?.writeText(String(pending.code || ""));
                  }}
                >
                  📋 Copier
                </button>

                <button
                  className="btnGhostSmall"
                  onClick={() => {
                    LOG("reload:manual:click");
                    reload();
                  }}
                  disabled={loading || verifying}
                  title="Rafraîchir"
                >
                  🔄 Rafraîchir
                </button>
              </div>

              {verifying ? (
                <div style={{ marginTop: 10, fontWeight: 950 }}>
                  🎧 Écoute du chat en cours… <span className="llMono">{verifyLeftSec}s</span> restantes
                </div>
              ) : (
                <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.88 }}>
                  Si tu n’as pas eu le temps : régénère un code et renvoie-le.
                </div>
              )}

              {/* Optionnel: debug pending (tu peux enlever si tu veux) */}
              <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.65 }}>
                <span className="llMono">
                  pending: {String(pending.requestedDisplayname || "")} • {String(pending.requestedUsername || "")} •{" "}
                  {String(pending.expiresAt || "")}
                </span>
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
                  disabled={loading || verifying}
                />
                <button
                  className="btnPrimarySmall"
                  onClick={onRequest}
                  disabled={loading || verifying || channel.trim().length < 2}
                  title="Génère un code et lance l'écoute 2 minutes"
                >
                  🔗 Générer un code + vérifier (2 min)
                </button>
                <button
                  className="btnGhostSmall"
                  onClick={() => {
                    LOG("reload:manual:click");
                    reload();
                  }}
                  disabled={loading || verifying}
                  title="Rafraîchir"
                >
                  🔄
                </button>
              </div>

              <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.9 }}>
                Après clic : on affiche un code, tu l’envoies dans ton chat DLive, et LunaLive valide automatiquement.
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
