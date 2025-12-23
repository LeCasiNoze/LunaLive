// web/src/components/DailyWheelModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { spinWheel, type ApiWheelMe, type ApiWheelSpinResult } from "../lib/api";

const FALLBACK_SEGMENTS: ApiWheelMe["segments"] = [
  { label: "+5", amount: 5 },
  { label: "+10", amount: 10 },
  { label: "+15", amount: 15 },
  { label: "+20", amount: 20 },
  { label: "+25", amount: 25 },
  { label: "+30", amount: 30 },
  { label: "+40", amount: 40 },
  { label: "+50", amount: 50 },
  { label: "+75", amount: 75 },
  { label: "+100", amount: 100 },
  { label: "+150", amount: 150 },
  { label: "+250", amount: 250 },
];

function useAudioFx() {
  const ctxRef = React.useRef<AudioContext | null>(null);

  const ensure = React.useCallback(() => {
    if (!ctxRef.current) {
      const AnyAC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AnyAC) ctxRef.current = new AnyAC();
    }
    return ctxRef.current;
  }, []);

  const beep = React.useCallback(
    (freq: number, ms: number, gain = 0.06) => {
      const ctx = ensure();
      if (!ctx) return;
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = freq;
        g.gain.value = gain;

        o.connect(g);
        g.connect(ctx.destination);

        const now = ctx.currentTime;
        o.start(now);
        o.stop(now + ms / 1000);

        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
      } catch {}
    },
    [ensure]
  );

  const tick = React.useCallback(() => beep(900, 18, 0.045), [beep]);
  const ding = React.useCallback(() => {
    beep(520, 120, 0.07);
    window.setTimeout(() => beep(780, 140, 0.06), 90);
  }, [beep]);

  return { tick, ding };
}

export function DailyWheelModal({
  open,
  onClose,
  canSpin,
  segments,
  onAfterSpin,
}: {
  open: boolean;
  onClose: () => void;
  canSpin: boolean;
  segments?: ApiWheelMe["segments"];
  onAfterSpin?: () => void | Promise<void>;
}) {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const segs = (segments && segments.length ? segments : FALLBACK_SEGMENTS) as ApiWheelMe["segments"];
  const n = Math.max(1, segs.length);
  const slice = 360 / n;

  // ✅ ref sur LE CONTENEUR QUI TOURNE (fond + séparateurs + labels)
  const wheelRef = React.useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = React.useState<"idle" | "spinning" | "done" | "error">("idle");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ApiWheelSpinResult | null>(null);

  const { tick, ding } = useAudioFx();

  React.useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    setPhase("idle");
    setMsg(null);
    setResult(null);

    const el = wheelRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = "rotate(0deg)";
      el.style.setProperty("--wheel-rot", "0deg");
      // force reflow
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetHeight;
    }

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function onSpin() {
    setMsg(null);

    if (!token) {
      setMsg("Tu dois être connecté.");
      setPhase("error");
      return;
    }
    if (!canSpin) {
      setMsg("Déjà utilisée aujourd’hui.");
      setPhase("error");
      return;
    }
    if (phase === "spinning") return;

    setPhase("spinning");

    await new Promise((r) => requestAnimationFrame(() => r(null)));

    try {
      const r = (await spinWheel(token)) as ApiWheelSpinResult;
      setResult(r);
      
      const newRubis = Number((r as any)?.user?.rubis);
      if (Number.isFinite(newRubis)) {
        // 1) update auth user si possible
        try {
          if (typeof (auth as any)?.setUser === "function") {
            // support callback OU valeur directe selon ton AuthProvider
            try {
              (auth as any).setUser((prev: any) => (prev ? { ...prev, rubis: newRubis } : prev));
            } catch {
              const prev = (auth as any)?.user ?? {};
              (auth as any).setUser({ ...prev, rubis: newRubis });
            }
          }
        } catch {}

        // 2) event global (si d’autres composants veulent écouter)
        try {
          window.dispatchEvent(new CustomEvent("rubis:update", { detail: { rubis: newRubis } }));
        } catch {}
      }

      const idx = Number((r as any).segmentIndex ?? 0);
      const spins = 6 + Math.floor(Math.random() * 3); // 6..8 tours

      // centre du segment idx (en degrés depuis le haut)
      const centerAngle = (idx + 0.5) * slice;

      // on veut centerAngle + rotation = 0 (mod 360) => rotation = 360 - centerAngle
      const finalDeg = spins * 360 + (360 - centerAngle);

      const el = wheelRef.current;
      if (el) {
        const durationMs = 4200;
        el.style.transition = `transform ${durationMs}ms cubic-bezier(0.12, 0.8, 0.12, 1)`;
        el.style.transform = `rotate(${finalDeg}deg)`;
        el.style.setProperty("--wheel-rot", `${finalDeg}deg`);

        // ticks
        const totalTicks = Math.max(12, spins * n);
        const interval = Math.max(18, Math.floor(durationMs / totalTicks));
        let c = 0;
        const id = window.setInterval(() => {
          c++;
          tick();
          if (c >= totalTicks) window.clearInterval(id);
        }, interval);

        window.setTimeout(() => {
          window.clearInterval(id);
          ding();
          setPhase("done");
        }, durationMs + 40);
      } else {
        ding();
        setPhase("done");
      }

      try {
        await onAfterSpin?.();
      } catch {}
    } catch (e: any) {
      const m = String(e?.message || e);
      if (m === "already_used") setMsg("Déjà utilisée aujourd’hui.");
      else setMsg("Erreur roue.");
      setPhase("error");
    }
  }

  if (!open) return null;

  const rw: any = (result as any)?.reward;
  const rewardValue = rw && typeof rw === "object" ? Number(rw.raw ?? 0) : Number(rw ?? 0);

  const rewardText =
    phase === "done" && result ? `🎉 Tu as gagné ${rewardValue.toLocaleString()} rubis !` : null;

  const modal = (
    <div className="modalBackdrop" role="presentation" onClick={onClose} style={{ zIndex: 2000 }}>
      <div className="modalBox" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <style>{`
          .wheelStage{
            display:flex;
            flex-direction: column;
            align-items:center;
            gap: 14px;
            padding: 6px 0 4px;
          }

          .wheelWrap{
            position: relative;
            width: min(360px, 84vw);
            aspect-ratio: 1/1;
            border-radius: 999px;
            padding: 10px;
            background:
              radial-gradient(circle at 30% 25%, rgba(126,76,179,0.30), rgba(0,0,0,0.1) 55%),
              rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow: 0 18px 60px rgba(0,0,0,0.45);
          }

          /* ✅ l'élément qui TOURNE */
          .wheelRot{
            position:absolute;
            inset: 18px;
            border-radius: 999px;
            overflow:hidden;
            border: 1px solid rgba(255,255,255,0.12);
            will-change: transform;

            /* rayon labels (tweak ici) */
            --label-r: 118px;

            /* rotation courante pour garder les textes droits */
            --wheel-rot: 0deg;
          }

          /* fond */
          .wheelBg{
            position:absolute;
            inset: 0;
            border-radius: 999px;
            background: conic-gradient(
              from -90deg,
              rgba(126,76,179,0.55),
              rgba(63,86,203,0.45),
              rgba(126,76,179,0.55),
              rgba(63,86,203,0.45),
              rgba(126,76,179,0.55)
            );
          }

          /* séparateurs (lignes entre segments) */
          .wheelSep{
            position:absolute;
            inset: 0;
            border-radius: 999px;
            background: repeating-conic-gradient(
              from -90deg,
              rgba(255,255,255,0.22) 0deg 1deg,
              transparent 1deg var(--slice)
            );
            opacity: 0.45;
            mix-blend-mode: overlay;
            pointer-events:none;
          }

          .wheelLabels{
            position:absolute;
            inset: 0;
            border-radius: 999px;
            pointer-events:none;
          }

          /* ✅ label au CENTRE du segment */
          .wheelLabel{
            position:absolute;
            left: 50%;
            top: 50%;
            transform:
              translate(-50%, -50%)
              rotate(var(--a))
              translate(0, calc(-1 * var(--label-r)));
            transform-origin: center;
            font-weight: 950;
            font-size: 12px;
            letter-spacing: 0.2px;
            color: rgba(255,255,255,0.92);
            text-shadow: 0 2px 10px rgba(0,0,0,0.55);
            padding: 2px 6px;
            border-radius: 10px;
          }

          /* ✅ texte TOUJOURS DROIT,
             - on annule la rotation du wheelRot
             - et on annule la rotation du placement angulaire */
          .wheelLabelText{
            display:inline-block;
            transform:
              rotate(calc(-1 * var(--wheel-rot)))
              rotate(var(--invA));
          }

          /* mobile: on rapproche un peu les labels */
          @media (max-width: 420px){
            .wheelRot{ --label-r: 102px; }
            .wheelLabel{ font-size: 11px; }
          }

          .wheelRing{
            position:absolute;
            inset: 10px;
            border-radius: 999px;
            border: 2px solid rgba(255,255,255,0.14);
            box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25);
            pointer-events:none;
          }

          .wheelCenter{
            position:absolute;
            inset: 0;
            display:flex;
            align-items:center;
            justify-content:center;
            pointer-events:none;
            z-index: 5;
          }

          .wheelHub{
            width: 92px;
            height: 92px;
            border-radius: 999px;
            background: rgba(17,10,23,0.92);
            border: 1px solid rgba(255,255,255,0.14);
            box-shadow: 0 18px 60px rgba(0,0,0,0.55);
            display:flex;
            align-items:center;
            justify-content:center;
            flex-direction: column;
            gap: 2px;
          }
          .wheelHubTop{ font-weight: 950; font-size: 14px; }
          .wheelHubSub{ font-size: 11px; color: rgba(255,255,255,0.65); font-weight: 800; }

          .wheelPointer{
            position:absolute;
            left: 50%;
            top: 6px;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 12px solid transparent;
            border-right: 12px solid transparent;
            border-bottom: 18px solid rgba(255,255,255,0.9);
            filter: drop-shadow(0 6px 10px rgba(0,0,0,0.45));
            z-index: 6;
          }

          .wheelPointerDot{
            position:absolute;
            left: 50%;
            top: 22px;
            transform: translateX(-50%);
            width: 12px;
            height: 12px;
            border-radius: 999px;
            background: rgba(255,255,255,0.9);
            box-shadow: 0 10px 30px rgba(0,0,0,0.45);
            z-index: 6;
          }
        `}</style>

        <div className="modalHeader">
          <div className="modalTitle">🎡 Daily Wheel</div>
          <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="modalBody">
          <div className="wheelStage">
            <div className="wheelWrap">
              <div className="wheelPointer" />
              <div className="wheelPointerDot" />

              {/* ✅ TOUT ce qui doit tourner est ici */}
              <div
                ref={wheelRef}
                className="wheelRot"
                style={{ ["--slice" as any]: `${slice}deg` } as React.CSSProperties}
              >
                <div className="wheelBg" />
                <div className="wheelSep" />

                <div className="wheelLabels">
                  {segs.map((s, i) => {
                    const a = (i + 0.5) * slice; // centre du segment (en degrés, 0 = haut)
                    return (
                      <div
                        key={`${s.label}-${i}`}
                        className="wheelLabel"
                        style={
                          {
                            ["--a" as any]: `${a}deg`,
                            ["--invA" as any]: `${-a}deg`,
                          } as React.CSSProperties
                        }
                      >
                        <span className="wheelLabelText">{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="wheelRing" />

              <div className="wheelCenter">
                <div className="wheelHub">
                  <div className="wheelHubTop">{phase === "spinning" ? "…" : "GO"}</div>
                  <div className="wheelHubSub">{phase === "done" ? "GG" : "Spin"}</div>
                </div>
              </div>
            </div>

            {rewardText ? (
              <div className="hint" style={{ marginTop: 2 }}>
                {rewardText}
              </div>
            ) : null}
            {msg ? <div className="hint">⚠️ {msg}</div> : null}

            <div className="modalActions" style={{ justifyContent: "space-between" }}>
              <button className="btnGhost" type="button" onClick={onClose} disabled={phase === "spinning"}>
                Fermer
              </button>

              <button className="btnPrimary" type="button" onClick={onSpin} disabled={phase === "spinning"}>
                {phase === "spinning" ? "Ça tourne…" : "Tourner"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
