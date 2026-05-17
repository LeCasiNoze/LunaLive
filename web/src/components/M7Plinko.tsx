// ─────────────────────────────────────────────────────────────────────────────
// M7 — "Reaction Tap" (remplacement de l'ancien Plinko).
// Une barre defile en boucle de gauche a droite. Une zone "JACKPOT" doree
// marque le sweet spot. Le joueur tape au moment ou le curseur entre dans la
// zone. Plus le timing est centre, plus le multiplier est eleve (1.5x → 5x).
//
// Skill-based, viral, parfait pour ig/tiktok : "regarde si tu peux faire 5x".
// Fichier reste M7Plinko.tsx pour retrocompat saves (export name preserve).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion } from "framer-motion";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, pseudoAnimationClass, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { V3MeshBg, V3AuroraBg, V3GrainBg, V3Spotlight } from "./V3AmbientFx";
import { V3MagneticButton } from "./V3MagneticButton";
import { V3PseudoKeyframes } from "./V3PseudoKeyframes";
import { extendPalette } from "../lib/v3_palette";

export type M7PlinkoProps = {
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

type Phase = "idle" | "playing" | "result";
const ZONES = [
  { from: 5,  to: 18, mult: 1.5, label: "1.5x" },
  { from: 32, to: 42, mult: 2.5, label: "2.5x" },
  { from: 47, to: 53, mult: 5.0, label: "5x", jackpot: true },
  { from: 58, to: 68, mult: 2.5, label: "2.5x" },
  { from: 82, to: 95, mult: 1.5, label: "1.5x" },
];

export function M7Plinko({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M7PlinkoProps) {
  const P = extendPalette(theme, "#FFD700");
  const T = {
    accent: P.accent, accentLight: P.accentLight, accentAlt: P.accentAlt, accentHot: P.accentHot,
    accentGlow: P.glow, bgPage: P.bgPage, bgCard: P.bgCard,
  };

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [cursorPos, setCursorPos] = React.useState(0);
  const cursorRef = React.useRef(0);
  const dirRef = React.useRef(1);
  const rafRef = React.useRef(0);
  const [hit, setHit] = React.useState<{ mult: number; label: string; pos: number } | null>(null);

  React.useEffect(() => {
    if (phase !== "playing") return;
    const SPEED = 1.4;
    const tick = () => {
      cursorRef.current += dirRef.current * SPEED;
      if (cursorRef.current >= 100) { cursorRef.current = 100; dirRef.current = -1; }
      if (cursorRef.current <= 0)   { cursorRef.current = 0;   dirRef.current = 1; }
      setCursorPos(cursorRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const start = () => {
    setHit(null);
    setPhase("playing");
    cursorRef.current = 0;
    dirRef.current = 1;
    sfx.tick();
  };

  const tap = () => {
    if (phase !== "playing") return;
    cancelAnimationFrame(rafRef.current);
    const pos = cursorRef.current;
    const zone = ZONES.find((z) => pos >= z.from && pos <= z.to);
    if (zone) {
      const center = (zone.from + zone.to) / 2;
      const offset = Math.abs(pos - center) / ((zone.to - zone.from) / 2);
      const finalMult = zone.jackpot ? zone.mult : Math.max(1.0, zone.mult * (1 - offset * 0.25));
      setHit({ mult: finalMult, label: zone.label, pos });
      sfx.win();
    } else {
      setHit({ mult: 1.0, label: "Raté", pos });
      sfx.loss();
    }
    setPhase("result");
  };

  const reset = () => {
    setPhase("idle");
    setHit(null);
    cursorRef.current = 0;
  };

  const onMainCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  const wonBonus = hit && bonusAmount != null ? Math.round(bonusAmount * hit.mult) : null;
  const popupSteps = React.useMemo(() => ["Validation du score", "Preparation de l'offre", "Lien bonus pret"], []);

  return (
    <div className="m7-root">
      <style>{`
        .m7-root{position:relative;min-height:100vh;padding:24px 18px 160px;background:${T.bgPage};
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff;overflow:hidden}
        .m7-layer{position:relative;z-index:10;max-width:440px;margin:0 auto}

        .m7-header{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;margin-bottom:18px}
        .m7-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid ${T.accent};
          box-shadow:0 0 0 3px rgba(0,0,0,.4),0 0 22px ${T.accentGlow}}
        .m7-avatar img{width:100%;height:100%;object-fit:cover;display:block}

        .m7-game-card{position:relative;padding:28px 22px 24px;border-radius:24px;text-align:center;overflow:hidden;
          background:linear-gradient(160deg,${T.bgCard}ee,${T.bgPage}ee);
          backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1.5px solid ${T.accent}55;
          box-shadow:0 0 0 1px ${T.accent}22 inset,0 22px 70px ${T.accentGlow}99}

        .m7-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.6;margin:0 0 18px}

        .m7-bar-wrap{position:relative;height:54px;border-radius:14px;background:rgba(0,0,0,.45);overflow:hidden;
          border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 2px 8px rgba(0,0,0,.5)}
        .m7-zone{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;
          font-size:.62rem;font-weight:800;letter-spacing:.06em;color:rgba(255,255,255,.55);overflow:hidden}
        .m7-zone.normal{background:linear-gradient(180deg,${T.accent}40,${T.accent}20)}
        .m7-zone.jackpot{background:linear-gradient(180deg,${T.accentLight},${T.accent});color:#000;font-size:.7rem;font-weight:900;
          box-shadow:0 0 24px ${T.accentGlow},inset 0 0 0 1px rgba(255,255,255,.4);
          animation:m7-jackpot-pulse 1.4s ease-in-out infinite}
        .m7-cursor{position:absolute;top:-6px;bottom:-6px;width:5px;border-radius:3px;background:#fff;
          box-shadow:0 0 14px #fff,0 0 24px ${T.accent},0 0 36px ${T.accent};will-change:left;pointer-events:none;z-index:5}
        .m7-cursor::after{content:"";position:absolute;left:50%;bottom:-12px;transform:translateX(-50%);width:0;height:0;
          border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #fff}

        .m7-result{margin:18px 0 0;min-height:74px}
        .m7-result-mult{font-size:clamp(2.5rem,9vw,3.4rem);font-weight:900;line-height:1;letter-spacing:-.04em;
          font-variant-numeric:tabular-nums;text-shadow:0 4px 16px rgba(0,0,0,.5)}
        .m7-result-mult.win{color:${T.accentLight};text-shadow:0 0 24px ${T.accentLight},0 4px 16px rgba(0,0,0,.5)}
        .m7-result-mult.jackpot{background:linear-gradient(180deg,${T.accent},${T.accentLight} 60%,${T.accentHot});
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 0 28px ${T.accentGlow})}
        .m7-result-mult.miss{color:#ef4444}
        .m7-result-sub{margin:4px 0 0;font-size:.85rem;opacity:.85;font-weight:600}
        .m7-result-bonus{font-size:1.4rem;font-weight:900;color:${T.accent};margin-top:6px}

        .m7-action{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:20px;margin-top:18px;border-radius:16px;
          font-family:inherit;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;border:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s;animation:m7-breath 2.6s ease-in-out infinite}
        .m7-action:active{transform:scale(.97)}
        .m7-action.tap{background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.3);
          box-shadow:0 0 36px rgba(239,68,68,.6),0 14px 30px rgba(239,68,68,.4);animation:m7-tap-pulse .6s ease-in-out infinite}
        .m7-action.replay{background:rgba(255,255,255,.08);color:#fff;text-shadow:none;border:1px solid rgba(255,255,255,.18);
          box-shadow:0 8px 20px rgba(0,0,0,.3);animation:none;margin-top:10px}

        .m7-cta-final{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:22px;margin-top:18px;border-radius:18px;
          font-size:1.1rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 40px ${T.accentGlow},0 16px 36px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          text-shadow:0 1px 0 rgba(255,255,255,.3)}
        .m7-cta-final::after{content:"→";font-size:1.3rem;margin-left:4px}
        .m7-cta-sub{margin-top:10px;text-align:center;font-size:.72rem;opacity:.65}

        @keyframes m7-jackpot-pulse{0%,100%{box-shadow:0 0 24px ${T.accentGlow},inset 0 0 0 1px rgba(255,255,255,.4)}50%{box-shadow:0 0 44px ${T.accentLight},inset 0 0 0 1px rgba(255,255,255,.6)}}
        @keyframes m7-tap-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        @keyframes m7-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 56px ${T.accentLight},0 14px 30px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}
        @media (prefers-reduced-motion:reduce){.m7-zone.jackpot,.m7-action{animation:none !important}}
      `}</style>

      <V3MeshBg colors={{ accent: T.accent, accentLight: T.accentLight, accentAlt: T.accentAlt, accentHot: T.accentHot }} opacity={0.42} />
      <V3AuroraBg colors={{ accent: T.accent, accentLight: T.accentLight, accentAlt: T.accentAlt, accentHot: T.accentHot }} opacity={0.16} />
      <V3GrainBg opacity={0.05} />

      <div className="m7-layer">
        {(profileImageUrl || pseudo) ? (
          <div className="m7-header">
            {profileImageUrl ? <div className="m7-avatar"><img src={profileImageUrl} alt="" /></div> : null}
            {pseudo ? (
              <div className={pseudoAnimationClass(pseudoStyle)} style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
                {pseudo}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ position: "relative" }}>
          <V3Spotlight accent={T.accent} accentAlt={T.accentAlt} intensity={0.4} size={340} />
          <div className="m7-game-card">
            <p className="m7-label">Tape pile sur le JACKPOT</p>

            <div className="m7-bar-wrap">
              {ZONES.map((z, i) => (
                <div
                  key={i}
                  className={`m7-zone ${z.jackpot ? "jackpot" : "normal"}`}
                  style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }}
                >
                  {z.label}
                </div>
              ))}
              {phase === "playing" ? (
                <div className="m7-cursor" style={{ left: `calc(${cursorPos}% - 2.5px)` }} />
              ) : null}
              {phase === "result" && hit ? (
                <div className="m7-cursor" style={{ left: `calc(${hit.pos}% - 2.5px)`, background: hit.mult > 1 ? T.accentLight : "#ef4444" }} />
              ) : null}
            </div>

            <div className="m7-result">
              {phase === "result" && hit ? (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <div className={`m7-result-mult ${hit.mult >= 5 ? "jackpot" : hit.mult > 1 ? "win" : "miss"}`}>
                    {hit.mult >= 5 ? "🎰 JACKPOT" : `${hit.mult.toFixed(2)}x`}
                  </div>
                  <p className="m7-result-sub">{hit.mult >= 5 ? "Tu as touché le sweet spot !" : hit.mult > 1 ? `Bien joué — ${hit.label}` : "Trop tôt ou trop tard, réessaie !"}</p>
                  {wonBonus != null && hit.mult > 1 ? <p className="m7-result-bonus">+{wonBonus}€ bonus</p> : null}
                </motion.div>
              ) : phase === "playing" ? (
                <p style={{ fontSize: ".88rem", opacity: 0.8 }}>Cible la zone dorée et tape !</p>
              ) : (
                <p style={{ fontSize: ".88rem", opacity: 0.7 }}>{dep ? `Dépose ${dep} → joue pour ${bon || "ton bonus"}` : "Lance le jeu pour booster ton bonus"}</p>
              )}
            </div>

            {phase === "idle" ? (
              <motion.button type="button" className="m7-action" onClick={start} whileTap={{ scale: 0.97 }}>
                ▶ LANCER
              </motion.button>
            ) : phase === "playing" ? (
              <motion.button type="button" className="m7-action tap" onClick={tap} whileTap={{ scale: 0.94 }}>
                🎯 TAPE !
              </motion.button>
            ) : (
              <>
                <V3MagneticButton href={safeAffi} onClick={onMainCta} className="m7-action">
                  🚀 RÉCLAMER {wonBonus != null && hit && hit.mult > 1 ? `+${wonBonus}€` : (bon ? `+${bon}` : "MON BONUS")}
                </V3MagneticButton>
                <button type="button" className="m7-action replay" onClick={reset}>
                  ↻ Rejouer
                </button>
              </>
            )}
          </div>
        </div>

        <V3MagneticButton href={safeAffi} onClick={onMainCta} className="m7-cta-final v3-cta">
          {bon ? `RÉCLAMER ${bon} BONUS` : "RÉCLAMER MON BONUS"}
        </V3MagneticButton>
        <p className="m7-cta-sub">Inscription en 30s · Crédit instantané</p>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={hit && hit.mult > 1 ? `${hit.mult.toFixed(2)}x` : (bon ? `+${bon}` : "Bonus")}
        depositAmount={dep}
        bonusAmount={wonBonus != null ? `${wonBonus}€` : bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
      <V3PseudoKeyframes />
    </div>
  );
}
