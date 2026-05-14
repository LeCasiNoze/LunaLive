// ─────────────────────────────────────────────────────────────────────────────
// M9 — Crossy Road : poulet qui avance sur une route à 3 voies. Chaque
// palier débloque un multiplicateur croissant. Le user doit "Collecter" avant
// le palier de la mort (étape 5 = 150%). Max sécurisable = 100% à l'étape 4.
// Tout après mène à la mort → message "tu as ton 100% sécurisé".
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";

export type M9CrossyProps = {
  pseudo?: string;
  profileImageUrl?: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  affiLink: string;
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgPage?: string;
    bgCard?: string;
    borderColor?: string;
  };
  pseudoStyle?: V3LineStyleLike;
};

// Paliers de récompense (du départ au sommet)
// Index 4 = JACKPOT SÉCURISÉ (100%), Index 5 = mort si tenté
const PALIERS = [
  { label: "0%",   safe: true,  checkpoint: false, mult: 1.0 },
  { label: "25%",  safe: true,  checkpoint: false, mult: 1.25 },
  { label: "50%",  safe: true,  checkpoint: false, mult: 1.5 },
  { label: "75%",  safe: true,  checkpoint: false, mult: 1.75 },
  { label: "100%", safe: true,  checkpoint: true,  mult: 2.0 },   // ← collect ici
  { label: "150%", safe: false, checkpoint: false, mult: 2.5 },   // DEATH zone
  { label: "200%", safe: false, checkpoint: false, mult: 3.0 },
  { label: "500%", safe: false, checkpoint: true,  mult: 6.0 },   // checkpoint visuel jamais atteint
];

const SAFE_PALIER = 4;  // index max sécurisé

// Pattern décoratif de voitures par palier (lane = 0|1|2). null = pas de voiture.
const CAR_PATTERN: Array<number | null> = [null, 1, 2, 0, null, 1, 0, 2];

export function M9Crossy({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle }: M9CrossyProps) {
  const T = {
    accent:      theme?.accent      || "#22c55e",
    accentLight: theme?.accentLight || "#86efac",
    accentGlow:  theme?.accentGlow  || "rgba(34,197,94,.45)",
    accentDark:  "#15803d",
    bgPage:      theme?.bgPage      || "#0a1014",
    bgCard:      theme?.bgCard      || "#0f1820",
    borderColor: theme?.borderColor || "rgba(134,239,172,.22)",
    road:        "#1e2530",
    roadStripe:  "#fde047",
  };

  // step = palier atteint. 0 = départ.
  const [step, setStep] = React.useState(0);
  // lane = voie du poulet (0=gauche, 1=centre, 2=droite). Démarre au centre.
  const [lane, setLane] = React.useState(1);
  const [phase, setPhase] = React.useState<"idle" | "moving" | "dead" | "collected">("idle");
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const crossySteps = React.useMemo(() => [
    "Vérification du palier",
    "Validation du bonus 100%",
    "Lien d'accès prêt",
  ], []);
  const safeAffi = affiLink || "#";

  // Niveau de récompense atteint = max(SAFE_PALIER, step) si dead, sinon step
  const currentLabel = PALIERS[Math.min(step, PALIERS.length - 1)]?.label || "0%";
  const lockedReward = "100%";  // toujours 100% peu importe le path

  const advance = () => {
    if (phase === "moving" || phase === "dead" || phase === "collected") return;
    sfx.click();
    setPhase("moving");
    const nextStep = step + 1;
    const nextPalier = PALIERS[nextStep];
    // Random lane shift visuelle (le poulet bouge légèrement)
    setLane((l) => (Math.random() > 0.5 ? Math.min(2, l + 1) : Math.max(0, l - 1)));

    window.setTimeout(() => {
      setStep(nextStep);
      if (nextPalier?.checkpoint && nextPalier.safe) {
        sfx.coin();
        sfx.win();
      } else if (nextPalier?.safe) {
        sfx.reveal();
      } else {
        // DEATH
        sfx.boom();
        setTimeout(() => {
          sfx.tension(500);
          setPhase("dead");
          setTimeout(() => {
            sfx.win();
            setPopupOpen(true);
          }, 1100);
        }, 300);
        return;
      }
      setPhase("idle");
    }, 420);
  };

  const collect = () => {
    if (phase === "moving" || phase === "dead" || phase === "collected") return;
    if (step < SAFE_PALIER) return;
    sfx.click();
    sfx.coin();
    sfx.win();
    setPhase("collected");
    setTimeout(() => setPopupOpen(true), 500);
  };

  const reset = () => {
    setStep(0);
    setLane(1);
    setPhase("idle");
    setPopupOpen(false);
  };

  // ─── Render ───────────────────────────────────────────────
  const totalRows = PALIERS.length;
  // Position visuelle du poulet (% from bottom)
  const chickenBottom = (step / (totalRows - 1)) * 86 + 4;  // 4% bottom margin
  const chickenLeft = 14 + (lane * 36);  // 14%, 50%, 86%

  return (
    <div className="m9-root" style={{ background: T.bgPage, color: "#f1f5f9" }}>
      <style>{`
        .m9-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative;overflow:hidden;min-height:100vh}
        .m9-root::before{content:"";position:absolute;inset:0;background:
          radial-gradient(circle at 50% 0%,${T.accentGlow}50,transparent 35%),
          radial-gradient(circle at 80% 60%,rgba(252,211,77,.12),transparent 30%),
          linear-gradient(180deg,${T.bgPage},#040608 100%);
          pointer-events:none}
        .m9-root > *{position:relative;z-index:2}

        /* Header */
        .m9-header{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:14px}
        .m9-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 0 0 4px rgba(255,255,255,.04),0 12px 28px rgba(0,0,0,.4)}
        .m9-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m9-pseudo-wrap{display:flex;justify-content:center}

        .m9-promo{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;margin-bottom:14px;background:rgba(8,15,22,.55);border:1px solid ${T.borderColor};border-radius:999px;font-size:.74rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(241,245,249,.85);backdrop-filter:blur(8px)}
        .m9-promo-dot{width:8px;height:8px;border-radius:50%;background:${T.accent};box-shadow:0 0 12px ${T.accentGlow};animation:m9-pulse 1.6s ease-in-out infinite}

        /* HUD */
        .m9-hud{display:flex;width:min(94vw,420px);gap:8px;margin-bottom:14px}
        .m9-hud-card{flex:1;padding:10px 14px;background:rgba(8,15,22,.6);border:1px solid rgba(134,239,172,.18);border-radius:12px;text-align:center}
        .m9-hud-lbl{font-size:.62rem;color:rgba(241,245,249,.55);letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px}
        .m9-hud-val{font-size:1.15rem;font-weight:900;color:#fff}
        .m9-hud-val.win{color:${T.accentLight};text-shadow:0 0 14px ${T.accentGlow}}

        /* Stage = route verticale 3 voies */
        .m9-stage{position:relative;width:min(94vw,420px);height:min(76vh,560px);background:
          linear-gradient(180deg,rgba(252,211,77,.04),transparent 30%),
          ${T.road};
          border:1px solid ${T.borderColor};border-radius:24px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);margin-bottom:16px}

        /* Lignes de voies (pointillés blancs) */
        .m9-lane-line{position:absolute;top:0;bottom:0;width:2px;background:repeating-linear-gradient(180deg,${T.roadStripe} 0,${T.roadStripe} 18px,transparent 18px,transparent 36px);opacity:.7}
        .m9-lane-line.l{left:33.3%}
        .m9-lane-line.r{left:66.6%}

        /* Bords de route (lignes pleines) */
        .m9-stage::before,.m9-stage::after{content:"";position:absolute;top:0;bottom:0;width:3px;background:${T.roadStripe};opacity:.4}
        .m9-stage::before{left:4%}
        .m9-stage::after{right:4%}

        /* Paliers — lignes horizontales avec multiplicateurs */
        .m9-palier{position:absolute;left:0;right:0;height:1px;border-top:1px dashed rgba(255,255,255,.12)}
        .m9-palier-tag{position:absolute;left:50%;transform:translateX(-50%) translateY(-50%);padding:3px 10px;border-radius:999px;background:rgba(15,20,30,.85);border:1px solid rgba(255,255,255,.1);font-size:.62rem;font-weight:900;letter-spacing:.06em;color:rgba(241,245,249,.7);white-space:nowrap;backdrop-filter:blur(4px);transition:all .3s ease}
        .m9-palier-tag.safe{border-color:${T.accent}55;color:${T.accentLight}}
        .m9-palier-tag.reached{background:${T.accent};color:#0a1014;border-color:${T.accent};box-shadow:0 0 16px ${T.accentGlow}}
        .m9-palier-tag.checkpoint{padding-left:18px}
        .m9-palier-tag.checkpoint::before{content:"🏁";position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:.7rem}
        .m9-palier-tag.danger{border-color:rgba(239,68,68,.4);color:rgba(252,165,165,.7)}

        /* Voitures décoratives */
        .m9-car{position:absolute;width:28px;height:42px;transform:translate(-50%,-50%);font-size:1.6rem;line-height:1;text-align:center;animation:m9-car-bob 2s ease-in-out infinite;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}
        .m9-car:nth-child(odd){animation-delay:-1s}

        /* Poulet */
        .m9-chicken{position:absolute;width:46px;height:46px;transform:translate(-50%,50%);font-size:2.3rem;line-height:1;text-align:center;transition:left .42s cubic-bezier(.34,1.56,.64,1),bottom .42s cubic-bezier(.34,1.56,.64,1);filter:drop-shadow(0 6px 12px rgba(0,0,0,.7));z-index:5}
        .m9-chicken.dead{animation:m9-death .9s ease-out forwards}

        /* Boom indicator on death */
        .m9-boom{position:absolute;transform:translate(-50%,-50%);font-size:3rem;z-index:6;opacity:0;pointer-events:none}
        .m9-boom.show{animation:m9-boom-pop .9s ease-out forwards}

        /* Departure label */
        .m9-depart{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:999px;background:${T.bgCard};border:1px solid ${T.borderColor};font-size:.62rem;font-weight:900;letter-spacing:.14em;color:${T.accentLight};text-transform:uppercase;z-index:4}

        /* Buttons */
        .m9-actions{display:flex;flex-direction:column;width:min(94vw,420px);gap:10px}
        .m9-cta{display:block;width:100%;padding:18px 24px;background:linear-gradient(135deg,${T.accentLight},${T.accent});color:#062012;font-weight:900;text-transform:uppercase;letter-spacing:.14em;font-size:.95rem;border:none;border-radius:16px;cursor:pointer;box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.42);text-decoration:none;text-align:center;font-family:inherit;transition:transform .12s ease}
        .m9-cta:not(:disabled):hover{transform:translateY(-2px)}
        .m9-cta:disabled{background:rgba(148,163,184,.22);color:rgba(226,232,240,.5);cursor:not-allowed;box-shadow:none}
        .m9-cta.collect{background:linear-gradient(135deg,#fde68a,#facc15);color:#1f1300;box-shadow:0 12px 32px rgba(250,204,21,.4),inset 0 1px 0 rgba(255,255,255,.42);animation:m9-collect-pulse 1.6s ease-in-out infinite}
        .m9-cta.ghost{background:rgba(8,15,22,.5);color:rgba(241,245,249,.7);border:1px solid rgba(255,255,255,.08);box-shadow:none;font-size:.8rem;padding:12px 18px}

        .m9-warn{font-size:.74rem;color:rgba(252,165,165,.7);text-align:center;letter-spacing:.04em;margin-top:6px}

        @keyframes m9-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.7}}
        @keyframes m9-car-bob{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-50%,-48%)}}
        @keyframes m9-death{0%{transform:translate(-50%,50%) scale(1)}30%{transform:translate(-50%,50%) scale(1.4) rotate(-12deg);filter:drop-shadow(0 6px 12px rgba(239,68,68,.8))}100%{transform:translate(-50%,50%) scale(0) rotate(-90deg);opacity:0}}
        @keyframes m9-boom-pop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}
        @keyframes m9-collect-pulse{0%,100%{box-shadow:0 12px 32px rgba(250,204,21,.4),inset 0 1px 0 rgba(255,255,255,.42)}50%{box-shadow:0 16px 40px rgba(250,204,21,.6),0 0 0 6px rgba(250,204,21,.08),inset 0 1px 0 rgba(255,255,255,.42)}}
      `}</style>

      <div className="m9-header">
        {profileImageUrl ? <div className="m9-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? (
          <div className="m9-pseudo-wrap">
            <div style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
              {pseudo}
            </div>
          </div>
        ) : null}
      </div>

      <div className="m9-promo">
        <span className="m9-promo-dot" />
        Crossy · Avance pour gagner
      </div>

      <div className="m9-hud">
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Palier</div>
          <div className={`m9-hud-val ${step >= SAFE_PALIER ? "win" : ""}`}>{currentLabel}</div>
        </div>
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Bonus</div>
          <div className={`m9-hud-val ${step >= SAFE_PALIER ? "win" : ""}`}>{bon || "—"}</div>
        </div>
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Mise</div>
          <div className="m9-hud-val">{dep || "—"}</div>
        </div>
      </div>

      <div className="m9-stage">
        {/* Lignes de voies pointillées */}
        <div className="m9-lane-line l" />
        <div className="m9-lane-line r" />

        {/* Paliers + multiplicateurs (du sommet au bas car position bottom %) */}
        {PALIERS.map((p, i) => {
          const bottomPct = (i / (PALIERS.length - 1)) * 86 + 4;
          if (i === 0) return null;  // pas de tag pour le départ
          return (
            <React.Fragment key={i}>
              <div className="m9-palier" style={{ bottom: `${bottomPct}%` }} />
              <div
                className={[
                  "m9-palier-tag",
                  p.safe ? "safe" : "danger",
                  p.checkpoint ? "checkpoint" : "",
                  i <= step ? "reached" : "",
                ].filter(Boolean).join(" ")}
                style={{ bottom: `${bottomPct}%` }}
              >
                {p.label}
              </div>
            </React.Fragment>
          );
        })}

        {/* Voitures décoratives (skip la lane du poulet pour éviter d'overlay) */}
        {CAR_PATTERN.map((carLane, i) => {
          if (carLane === null || i === 0) return null;
          if (i <= step) return null;  // déjà dépassé
          const bottomPct = (i / (PALIERS.length - 1)) * 86 + 4 - 4;  // décalé légèrement sous le palier
          const leftPct = 14 + (carLane * 36);
          return (
            <div
              key={`car-${i}`}
              className="m9-car"
              style={{ left: `${leftPct}%`, bottom: `${bottomPct}%`, animationDelay: `${-i * 0.3}s` }}
            >
              🚗
            </div>
          );
        })}

        {/* Poulet */}
        <div
          className={`m9-chicken ${phase === "dead" ? "dead" : ""}`}
          style={{ left: `${chickenLeft}%`, bottom: `${chickenBottom}%` }}
        >
          🐔
        </div>

        {/* Boom on death */}
        <div
          className={`m9-boom ${phase === "dead" ? "show" : ""}`}
          style={{ left: `${chickenLeft}%`, bottom: `${chickenBottom + 2}%` }}
        >
          💥
        </div>

        <div className="m9-depart">Départ</div>
      </div>

      <div className="m9-actions">
        {phase === "dead" || phase === "collected" ? (
          <>
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m9-cta collect v3-cta">
              Récupérer mon bonus 100%
            </a>
            <button className="m9-cta ghost" onClick={reset}>↻ Rejouer</button>
          </>
        ) : (
          <>
            <button className="m9-cta" onClick={advance} disabled={phase === "moving"}>
              {phase === "moving" ? "..." : step === 0 ? "🐔 Démarrer" : "🐔 Avancer !"}
            </button>
            {step >= SAFE_PALIER ? (
              <button className="m9-cta collect" onClick={collect} disabled={phase === "moving"}>
                💰 Collecter {lockedReward}
              </button>
            ) : null}
            {step >= SAFE_PALIER ? (
              <div className="m9-warn">⚠ Avancer encore = risquer de tout perdre</div>
            ) : null}
          </>
        )}
      </div>

      <V3OfferPopup
        open={popupOpen && (phase === "dead" || phase === "collected")}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard, borderColor: T.borderColor }}
        score={(depositAmount != null && bonusAmount != null && bonusAmount - depositAmount > 0) ? `+${bonusAmount - depositAmount}€` : (bon ? `+${bon}` : "100%")}
        depositAmount={dep}
        bonusAmount={bon}
        steps={crossySteps}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
