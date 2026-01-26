// web/src/components/profile/StreamerApplyModal.tsx
import * as React from "react";
import { dliveLinkMe, dliveLinkRequest, dliveLinkVerify, type ApiDliveLinkMe } from "../../lib/api";

export type StreamerApplyPayload = {
  // requis
  discord: string;

  // legacy compat (ProfilePage.tsx s’en sert déjà)
  hasChannel: boolean;
  channelUrl: string;

  // ✅ NEW (optionnel) : utile si tu veux logger/traiter côté backend plus tard
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
  // on ne prend que le slug “propre”
  const slug = dn.replace(/^https?:\/\/dlive\.tv\//i, "").replace(/^@/, "").trim();
  return slug ? `https://dlive.tv/${slug}` : "";
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
  // form
  const [discord, setDiscord] = React.useState("");
  const [rulesAccepted, setRulesAccepted] = React.useState(false);

  // dlive option
  const [hasDlive, setHasDlive] = React.useState(false);

  // dlive link state
  const [me, setMe] = React.useState<ApiDliveLinkMe | null>(null);
  const [channel, setChannel] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);

  const linked = !!me?.linkedDisplayname;
  const pending = me?.pending;

  // ----- DEBUG / LOGS
  const reqSeqRef = React.useRef(0);
  const mountIdRef = React.useRef(Math.random().toString(16).slice(2, 8));
  function log(...args: any[]) {
    // logs publics navigateur (on s’en fou)
    // eslint-disable-next-line no-console
    console.log(`[StreamerApplyModal:${mountIdRef.current}]`, nowIso(), ...args);
  }
  function warn(...args: any[]) {
    // eslint-disable-next-line no-console
    console.warn(`[StreamerApplyModal:${mountIdRef.current}]`, nowIso(), ...args);
  }

  const reload = React.useCallback(async () => {
    const seq = ++reqSeqRef.current;
    setErr(null);

    log("reload:start", { seq, hasDlive, open });
    const t0 = performance.now();
    try {
      const r = await dliveLinkMe(token);
      const ms = Math.round(performance.now() - t0);

      log("reload:ok", {
        seq,
        ms,
        ok: !!(r as any)?.ok,
        linkedDisplayname: (r as any)?.linkedDisplayname ?? null,
        useLinked: (r as any)?.useLinked ?? null,
        pending: (r as any)?.pending
          ? {
              requestedDisplayname: (r as any)?.pending?.requestedDisplayname,
              requestedUsername: (r as any)?.pending?.requestedUsername,
              code: (r as any)?.pending?.code,
              expiresAt: (r as any)?.pending?.expiresAt,
            }
          : null,
      });

      setMe(r);
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = String(e?.message || "ERROR");
      warn("reload:err", { seq, ms, msg, e });
      setErr(msg);
    }
  }, [token, hasDlive, open]);

  React.useEffect(() => {
    log("mount");
    return () => {
      log("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!open) return;

    log("open:reset-form");
    // reset form on open
    setDiscord("");
    setRulesAccepted(false);

    setHasDlive(false);
    setMe(null);
    setChannel("");
    setErr(null);
    setSubmitErr(null);
    setLoading(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (!hasDlive) {
      log("hasDlive:false (no reload)");
      return;
    }
    log("hasDlive:true -> reload");
    reload();
  }, [open, hasDlive, reload]);

  // ✅ debug: log state changes (useful pour comprendre)
  React.useEffect(() => {
    if (!open) return;
    log("state:update", {
      hasDlive,
      loading,
      linked,
      pending: pending ? true : false,
      linkedDisplayname: me?.linkedDisplayname ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasDlive, loading, linked, !!pending, me?.linkedDisplayname]);

  async function onRequest() {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    setErr(null);

    const input = String(channel || "").trim();
    log("dlive:request:start", { seq, input });

    const t0 = performance.now();
    try {
      await dliveLinkRequest(token, input);
      log("dlive:request:ok", { seq, ms: Math.round(performance.now() - t0) });

      // ✅ prime verify (comme ton DliveLinkPanel) + LOGS
      // ⚠️ ici c’est justement ce qui peut "prendre du temps" si le verify attend le chat.
      // On le garde pour debug; on log chaque étape.
      log("dlive:primeVerify:begin", { seq, note: "tentative verify immédiate après request (peut échouer si code pas envoyé)" });
      const t1 = performance.now();
      try {
        // Important: ce call côté backend peut "attendre" le code dans le chat.
        log("dlive:primeVerify:waiting-chat", {
          seq,
          whatToDo: "Envoie le code dans le chat DLive puis ce call devrait passer",
        });

        await dliveLinkVerify(token);

        log("dlive:primeVerify:ok", { seq, ms: Math.round(performance.now() - t1) });
      } catch (e: any) {
        warn("dlive:primeVerify:err (ignored)", { seq, ms: Math.round(performance.now() - t1), msg: String(e?.message || "ERROR"), e });
        // ignore
      }

      await reload();
      log("dlive:request:done", { seq });
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = String(e?.message || "ERROR");
      warn("dlive:request:err", { seq, ms, msg, e });
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    setErr(null);

    // On log "comme si" on se connectait au chat, même si la connexion est côté backend.
    // Ces logs te donnent les timestamps et aident à savoir si le navigateur "attend" trop longtemps.
    log("dlive:verify:click", {
      seq,
      pending: pending
        ? {
            requestedDisplayname: (pending as any)?.requestedDisplayname,
            requestedUsername: (pending as any)?.requestedUsername,
            code: (pending as any)?.code,
            expiresAt: (pending as any)?.expiresAt,
          }
        : null,
    });

    log("dlive:verify:phase", { seq, phase: "backend_connect_chat (server)", detail: "Le serveur va écouter le chat DLive via websocket." });
    await sleep(50);
    log("dlive:verify:phase", { seq, phase: "backend_ready_to_read_code (server)", detail: "Le serveur attend de voir le code dans le chat." });

    const t0 = performance.now();
    try {
      log("dlive:verify:waiting", { seq, note: "Appel API en cours... si timeout navigateur, le serveur peut quand même finir." });

      await dliveLinkVerify(token);

      log("dlive:verify:seen_code", { seq, ms: Math.round(performance.now() - t0), detail: "✅ Le serveur a vu le code dans le chat." });
      log("dlive:verify:linked", { seq, detail: "✅ Le serveur a enregistré le lien en DB (streamers.dlive_link_*)" });

      await reload();
      log("dlive:verify:done", { seq, linkedAfter: true });
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      const msg = String(e?.message || "ERROR");

      warn("dlive:verify:err", {
        seq,
        ms,
        msg,
        hint:
          "Si tu refresh et que c’est vérifié, c’est probablement un timeout côté navigateur alors que le serveur a fini.",
      });

      setErr(msg);

      // petit reload derrière pour voir si le serveur a quand même lié
      try {
        await reload();
        log("dlive:verify:postErrReload", {
          seq,
          linkedNow: !!(me?.linkedDisplayname || (me as any)?.linkedDisplayname),
        });
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    !disabled &&
    !loading &&
    !!discord.trim() &&
    rulesAccepted &&
    (!hasDlive || (linked && !pending));

  async function submit() {
    if (!canSubmit) return;
    setSubmitErr(null);

    const seq = ++reqSeqRef.current;
    log("submit:start", { seq, hasDlive, canSubmit });

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

      log("submit:payload", { seq, payload });

      await Promise.resolve(onSubmit(payload));
      log("submit:ok", { seq });
      onClose();
    } catch (e: any) {
      const msg = String(e?.message || "ERROR");
      warn("submit:err", { seq, msg, e });
      setSubmitErr(msg);
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
          <button
            className="btnGhost"
            onClick={() => {
              log("close:click");
              onClose();
            }}
            disabled={loading}
          >
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
              onChange={(e) => {
                setDiscord(e.target.value);
                log("form:discord:change", { v: e.target.value });
              }}
              placeholder="Ex: lucas / lucas#1234"
              className="llInput"
              disabled={loading}
            />
          </div>

          {/* DLive */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, fontWeight: 950 }}>
            <input
              type="checkbox"
              checked={hasDlive}
              onChange={(e) => {
                setHasDlive(e.target.checked);
                log("form:hasDlive:toggle", { v: e.target.checked });
              }}
              disabled={loading}
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
              </div>

              {!me?.ok ? (
                <div className="mutedSmall" style={{ marginTop: 10 }}>
                  Chargement… (logs dans la console)
                </div>
              ) : pending ? (
                <>
                  <div className="mutedSmall" style={{ marginTop: 10 }}>
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
                        log("dlive:code:copy", { code: String(pending.code || "") });
                        navigator.clipboard?.writeText(String(pending.code || ""));
                      }}
                      disabled={loading}
                    >
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
                    <button
                      className="btnGhostSmall"
                      onClick={() => {
                        log("dlive:reload:click");
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
                  <div className="mutedSmall" style={{ marginTop: 10 }}>
                    Entre ton <b>nom de chaîne DLive</b> ou l’URL (ex:{" "}
                    <span className="llMono">https://dlive.tv/LeCasinoze</span>)
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      value={channel}
                      onChange={(e) => {
                        setChannel(e.target.value);
                        log("dlive:channel:change", { v: e.target.value });
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
                        log("dlive:reload:click");
                        reload();
                      }}
                      disabled={loading}
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
                      (Après génération : tu envoies le code dans ton chat DLive, puis “Vérifier”.)
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
              onChange={(e) => {
                setRulesAccepted(e.target.checked);
                log("form:rulesAccepted:toggle", { v: e.target.checked });
              }}
              disabled={loading}
            />
            J’ai lu et j’accepte le règlement.
          </label>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              className="btnGhost"
              onClick={() => {
                log("cancel:click");
                onClose();
              }}
              disabled={loading}
            >
              Annuler
            </button>
            <button className="btnPrimary" onClick={submit} disabled={!canSubmit}>
              {disabled
                ? "⛔ Indisponible"
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
