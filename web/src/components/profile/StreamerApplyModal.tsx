// web/src/components/profile/StreamerApplyModal.tsx
import * as React from "react";
import { dliveLinkMe, dliveLinkRequest, dliveLinkVerify } from "../../lib/api";

export type StreamerApplyPayload = {
  // requis
  discord: string;

  // legacy compat (ProfilePage.tsx s’en sert déjà)
  hasChannel: boolean;
  channelUrl: string;

  // ✅ NEW (optionnel)
  hasDlive?: boolean;
  dliveDisplayname?: string | null;

  // ✅ règles
  rulesAccepted?: boolean;
};

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

function normalizeChannelUrl(displayname: string | null | undefined) {
  const dn = String(displayname ?? "").trim();
  if (!dn) return "";
  const slug = dn.replace(/^https?:\/\/dlive\.tv\//i, "").replace(/^@/, "").trim();
  return slug ? `https://dlive.tv/${slug}` : "";
}

/**
 * Petit parse “safe” pour extraire un message lisible
 */
function getErrMsg(e: any) {
  const msg = String(e?.message || e?.error || "ERROR");
  return msg;
}

export function StreamerApplyModal({
  open,
  onClose,
  token,
  disabled,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  disabled?: boolean;
  onSubmit: (payload: StreamerApplyPayload) => Promise<void> | void;
}) {
  const VERIFY_WINDOW_MS = 120_000;

  // ─────────────────────────────────────────────
  // Debug logger (public console)
  // ─────────────────────────────────────────────
  const instRef = React.useRef<string>(Math.random().toString(16).slice(2, 8));
  const seqRef = React.useRef<number>(0);
  const LOG = React.useCallback((event: string, data?: any) => {
    try {
      // eslint-disable-next-line no-console
      console.log(
        `[StreamerApplyModal:${instRef.current}]`,
        new Date().toISOString(),
        event,
        data ?? ""
      );
    } catch {}
  }, []);

  // form
  const [discord, setDiscord] = React.useState("");
  const [rulesAccepted, setRulesAccepted] = React.useState(false);

  // dlive option
  const [hasDlive, setHasDlive] = React.useState(false);

  // dlive link state
  // ⚠️ IMPORTANT: on garde `any` ici pour éviter les erreurs TS si l’API renvoie des champs supplémentaires
  // (linkedUsername / pending.requestedUsername etc.).
  const [me, setMe] = React.useState<any>(null);

  const [channel, setChannel] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);

  // "écoute chat" UX
  const [verifying, setVerifying] = React.useState(false);
  const [verifyEndsAt, setVerifyEndsAt] = React.useState<number | null>(null);
  const [verifyLeftSec, setVerifyLeftSec] = React.useState<number>(0);

  // derived from `me`
  const linked = !!me?.linkedDisplayname;
  const pending = me?.pending;

  // ─────────────────────────────────────────────
  // Countdown effect
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // Reload helper (with logs)
  // ─────────────────────────────────────────────
  const reload = React.useCallback(async () => {
    const seq = ++seqRef.current;
    const t0 = performance.now();
    setErr(null);

    LOG("reload:start", { seq, hasDlive, open });

    try {
      const data: any = await dliveLinkMe(token);
      const ms = Math.round(performance.now() - t0);

      setMe(data);

      LOG("reload:ok", {
        seq,
        ms,
        ok: !!data?.ok,
        linkedDisplayname: data?.linkedDisplayname ?? null,
        useLinked: !!data?.useLinked,
        pending: !!data?.pending,
        pendingRequestedDisplayname: data?.pending?.requestedDisplayname ?? null,
        pendingRequestedUsername: data?.pending?.requestedUsername ?? null,
      });
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg);
      setMe(null);
      LOG("reload:err", { seq, ms, msg, e });
    }
  }, [LOG, hasDlive, open, token]);

  // ─────────────────────────────────────────────
  // Auto poll (fallback UX)
  // ─────────────────────────────────────────────
  const pollTimerRef = React.useRef<any>(null);
  const stopPoll = React.useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      LOG("poll:stop");
    }
  }, [LOG]);

  const startPollForLinked = React.useCallback(
    (opts?: { maxMs?: number; everyMs?: number; reason?: string }) => {
      stopPoll();

      const maxMs = Math.max(4000, Number(opts?.maxMs ?? 25000));
      const everyMs = Math.max(600, Number(opts?.everyMs ?? 1500));
      const reason = String(opts?.reason ?? "unknown");

      const startedAt = Date.now();
      LOG("poll:start", { maxMs, everyMs, reason });

      pollTimerRef.current = setInterval(async () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed > maxMs) {
          LOG("poll:timeout", { elapsed, maxMs });
          stopPoll();
          return;
        }

        try {
          const data: any = await dliveLinkMe(token);
          setMe(data);

          const isLinked = !!data?.linkedDisplayname;
          const isPending = !!data?.pending;

          LOG("poll:tick", {
            elapsed,
            isLinked,
            isPending,
            linkedDisplayname: data?.linkedDisplayname ?? null,
          });

          if (isLinked && !isPending) {
            LOG("poll:done", { elapsed, linkedDisplayname: data?.linkedDisplayname });
            stopPoll();
          }
        } catch (e: any) {
          LOG("poll:err", { elapsed, msg: getErrMsg(e) });
        }
      }, everyMs);
    },
    [LOG, stopPoll, token]
  );

  React.useEffect(() => {
    LOG("mount");
    return () => {
      stopPoll();
      LOG("unmount");
    };
  }, [LOG, stopPoll]);

  // reset on open
  React.useEffect(() => {
    if (!open) return;

    LOG("open:reset-form");

    setDiscord("");
    setRulesAccepted(false);

    setHasDlive(false);
    setMe(null);
    setChannel("");
    setErr(null);
    setSubmitErr(null);
    setLoading(false);

    setVerifying(false);
    setVerifyEndsAt(null);
    setVerifyLeftSec(0);

    stopPoll();
  }, [open, LOG, stopPoll]);

  // when user toggles hasDlive -> reload
  React.useEffect(() => {
    if (!open) return;
    if (!hasDlive) {
      LOG("hasDlive:false (no reload)");
      stopPoll();
      return;
    }
    LOG("hasDlive:true -> reload");
    reload();
  }, [open, hasDlive, reload, LOG, stopPoll]);

  // quick state snapshot logs (useful)
  React.useEffect(() => {
    LOG("state:update", {
      hasDlive,
      loading,
      verifying,
      linked: !!linked,
      pending: !!pending,
      linkedDisplayname: me?.linkedDisplayname ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDlive, loading, verifying, linked, pending, me?.linkedDisplayname]);

  // ✅ Nouveau protocole:
  // - "Générer un code" => crée le code + lance DIRECT l'écoute 2 min
  async function onRequest() {
    const seq = ++seqRef.current;

    setLoading(true);
    setErr(null);

    LOG("dlive:request+autoVerify:start", { seq, input: channel });

    const t0 = performance.now();
    try {
      // 1) Génère le code (pending)
      await dliveLinkRequest(token, channel);
      LOG("dlive:request:ok", { seq, ms: Math.round(performance.now() - t0) });

      // 2) Reload immédiat pour afficher pending.code
      await reload();

      // 3) Lance l'écoute 2 min + countdown
      setVerifying(true);
      setVerifyEndsAt(Date.now() + VERIFY_WINDOW_MS);

      LOG("dlive:autoVerify:start", { seq, timeoutMs: VERIFY_WINDOW_MS });

      try {
        await dliveLinkVerify(token, { timeoutMs: VERIFY_WINDOW_MS });
        LOG("dlive:autoVerify:ok", { seq });

        setVerifying(false);
        setVerifyEndsAt(null);

        stopPoll();
        await reload();
      } catch (e: any) {
        const msg = getErrMsg(e);
        LOG("dlive:autoVerify:err", { seq, msg, e });

        setErr(msg);
        setVerifying(false);
        setVerifyEndsAt(null);

        // Si c'est un TIMEOUT (ou latence), on poll un peu (UX)
        if (String(msg).toUpperCase().includes("TIMEOUT")) {
          startPollForLinked({ reason: "autoVerify-timeout", maxMs: 35000, everyMs: 1500 });
        }

        await reload();
      }

      LOG("dlive:request+autoVerify:done", { seq });
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg);
      LOG("dlive:request+autoVerify:fail", { seq, ms, msg, e });
    } finally {
      setLoading(false);
    }
  }

  // "Relancer l'écoute" (si l'utilisateur n'avait pas envoyé le code à temps)
  async function onVerify() {
    const seq = ++seqRef.current;

    setLoading(true);
    setErr(null);

    LOG("dlive:listenAgain:start", { seq, pending });

    const t0 = performance.now();
    try {
      setVerifying(true);
      setVerifyEndsAt(Date.now() + VERIFY_WINDOW_MS);

      await dliveLinkVerify(token, { timeoutMs: VERIFY_WINDOW_MS });

      const ms = Math.round(performance.now() - t0);
      LOG("dlive:listenAgain:ok", { seq, ms });

      setVerifying(false);
      setVerifyEndsAt(null);

      stopPoll();
      await reload();
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);

      LOG("dlive:listenAgain:err", {
        seq,
        ms,
        msg,
        hint: "Si tu envoies le code après la fenêtre, relance l’écoute.",
        e,
      });

      setErr(msg);
      setVerifying(false);
      setVerifyEndsAt(null);

      if (String(msg).toUpperCase().includes("TIMEOUT")) {
        startPollForLinked({ reason: "listenAgain-timeout", maxMs: 35000, everyMs: 1500 });
      }

      await reload();
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    !disabled &&
    !loading &&
    !verifying &&
    !!discord.trim() &&
    rulesAccepted &&
    (!hasDlive || (linked && !pending));

  async function submit() {
    if (!canSubmit) return;
    setSubmitErr(null);

    LOG("submit:click", {
      hasDlive,
      linked,
      pending: !!pending,
      discord: discord.trim(),
    });

    try {
      const url = hasDlive ? normalizeChannelUrl(me?.linkedDisplayname) : "";
      const payload: StreamerApplyPayload = {
        discord: discord.trim(),
        hasChannel: hasDlive ? true : false,
        channelUrl: hasDlive ? url : "",
        hasDlive,
        dliveDisplayname: hasDlive ? (me?.linkedDisplayname ?? null) : null,
        rulesAccepted: true,
      };

      LOG("submit:payload", payload);

      await Promise.resolve(onSubmit(payload));
      LOG("submit:ok");
      onClose();
    } catch (e: any) {
      const msg = getErrMsg(e);
      setSubmitErr(msg);
      LOG("submit:err", { msg, e });
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.58)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 14,
      }}
    >
      <div
        style={{
          width: "min(900px, 96vw)",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "radial-gradient(900px 320px at 20% 0%, rgba(140,90,255,0.32), rgba(0,0,0,0) 60%), radial-gradient(700px 260px at 85% 20%, rgba(255,90,180,0.20), rgba(0,0,0,0) 55%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.18))",
          boxShadow: "0 28px 90px rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
          padding: 16,
        }}
      >
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
            width: 100%;
            padding: 10px 12px;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.05);
            color: white;
            outline: none;
            font-weight: 850;
          }
          .llInput:focus{
            border-color: rgba(124,77,255,0.45);
            box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
          }
        `}</style>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 1100, letterSpacing: -0.2, fontSize: 18 }}>🎥 Devenir streamer LunaLive</div>
          <button className="btnGhost" onClick={onClose} disabled={loading || verifying}>
            ✖
          </button>
        </div>

        {/* Rules */}
        <div
          style={{
            marginTop: 12,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.14)",
            padding: 12,
            maxHeight: 240,
            overflow: "auto",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 1100, marginBottom: 8 }}>📜 Règlement (essentiel)</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Objectif : construire une <b>communauté casino FR</b> propre + divertissante.
            </li>
            <li>
              <b>Interdit de botter</b> (zéro triche / gonflage artificiel).
            </li>
            <li>
              <b>Interdit</b> de faire des <b>dépôts offerts</b> à ta communauté (ou mécanique similaire).
            </li>
            <li>
              Tu t’engages à être <b>actif</b>. En cas d’inactivité / non-respect : révocation possible.
            </li>
          </ul>
        </div>

        {/* Form */}
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 1100 }}>🧾 Formulaire</div>

          {/* Discord */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>Ton Discord (obligatoire)</div>
            <input
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="Ex: lucas / lucas#1234"
              className="llInput"
              disabled={loading || verifying}
            />
          </div>

          {/* DLive */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, fontWeight: 950 }}>
            <input
              type="checkbox"
              checked={hasDlive}
              onChange={(e) => {
                const v = e.target.checked;
                LOG("form:hasDlive:toggle", { v });
                setHasDlive(v);
              }}
              disabled={loading || verifying}
            />
            Oui, j’ai déjà une chaîne DLive (vérification rapide)
          </label>

          {hasDlive ? (
            <div className="llRowCard">
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 1000 }}>🔗 Vérification DLive</div>
                <div style={{ flex: 1 }} />
                <Chip tone={linked ? "green" : "neutral"}>{linked ? "✅ Vérifiée" : "⚠️ À vérifier"}</Chip>
                {linked ? <Chip tone="blue">{`🎥 ${String(me?.linkedDisplayname || "")}`}</Chip> : null}
                {verifying ? <Chip tone="pink">{`🎧 Écoute… ${verifyLeftSec}s`}</Chip> : null}
              </div>

              {!me?.ok ? (
                <div className="mutedSmall" style={{ marginTop: 10 }}>
                  Chargement…
                </div>
              ) : pending ? (
                <>
                  <div className="mutedSmall" style={{ marginTop: 10, lineHeight: 1.55 }}>
                    <div>
                      1) Ouvre le chat de <b>{pending.requestedDisplayname}</b> (sur DLive) et envoie ce code :
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.92 }}>
                      <b>Important :</b> envoie-le <b>depuis ton compte streamer</b>, et mets aussi le lien de la chaîne dans le message.
                      <br />
                      Exemple : <span className="llMono">{pending.code} https://dlive.tv/{pending.requestedDisplayname}</span>
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
                        LOG("dlive:code:copy", { code: pending?.code });
                        navigator.clipboard?.writeText(String(pending.code || ""));
                      }}
                      disabled={loading || verifying}
                    >
                      📋 Copier
                    </button>
                  </div>

                  <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.9 }}>
                    2) Copie/colle <b>exactement</b> ce code dans ton chat DLive puis envoie-le.
                  </div>

                  {verifying ? (
                    <div style={{ marginTop: 10, fontWeight: 950 }}>
                      ⏳ Lecture du chat en cours… <span className="llMono">{verifyLeftSec}s</span> restantes
                    </div>
                  ) : (
                    <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                      3) Si tu l’as envoyé après la fenêtre, clique “Relancer l’écoute (2 min)”.
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btnPrimarySmall" onClick={onVerify} disabled={loading || verifying}>
                      {verifying ? "🎧 Écoute en cours…" : "🔁 Relancer l’écoute (2 min)"}
                    </button>
                    <button
                      className="btnGhostSmall"
                      onClick={() => {
                        LOG("dlive:refresh:click");
                        reload();
                      }}
                      disabled={loading || verifying}
                    >
                      🔄 Rafraîchir
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mutedSmall" style={{ marginTop: 10 }}>
                    Entre ton <b>nom de chaîne DLive</b> ou l’URL (ex:{" "}
                    <span className="llMono">https://dlive.tv/LeCasinoze</span>)
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      value={channel}
                      onChange={(e) => {
                        const v = e.target.value;
                        LOG("dlive:channel:change", { v });
                        setChannel(v);
                      }}
                      placeholder="LeCasinoze ou https://dlive.tv/LeCasinoze"
                      className="llInput"
                      disabled={loading || verifying}
                    />
                    <button
                      className="btnPrimarySmall"
                      onClick={onRequest}
                      disabled={loading || verifying || channel.trim().length < 2}
                    >
                      🔗 Générer un code + écouter (2 min)
                    </button>
                    <button
                      className="btnGhostSmall"
                      onClick={() => {
                        LOG("dlive:reload:click");
                        reload();
                      }}
                      disabled={loading || verifying}
                    >
                      🔄
                    </button>
                  </div>

                  {linked ? (
                    <div className="mutedSmall" style={{ marginTop: 10 }}>
                      ✅ Chaîne vérifiée : <b>{String(me?.linkedDisplayname || "")}</b>
                    </div>
                  ) : (
                    <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.9 }}>
                      (Après clic : on affiche le code, tu l’envoies dans ton chat, et on écoute automatiquement pendant 2 minutes.)
                    </div>
                  )}
                </>
              )}

              {err ? (
                <div className="hint" style={{ marginTop: 12, opacity: 0.95 }}>
                  ⚠️ {err}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Rules acceptance */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, fontWeight: 950 }}>
            <input
              type="checkbox"
              checked={rulesAccepted}
              onChange={(e) => setRulesAccepted(e.target.checked)}
              disabled={loading || verifying}
            />
            J’ai lu et j’accepte le règlement.
          </label>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btnGhost" onClick={onClose} disabled={loading || verifying}>
              Annuler
            </button>
            <button className="btnPrimary" onClick={submit} disabled={!canSubmit}>
              {disabled
                ? "⛔ Indisponible"
                : verifying
                ? "🎧 Écoute en cours…"
                : hasDlive && (!linked || pending)
                ? "⚠️ Vérifie DLive d’abord"
                : "✅ Envoyer la demande"}
            </button>
          </div>

          {submitErr ? (
            <div className="hint" style={{ marginTop: 2, opacity: 0.95 }}>
              ⚠️ {submitErr}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
