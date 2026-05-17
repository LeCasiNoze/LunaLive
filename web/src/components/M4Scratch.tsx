// ─────────────────────────────────────────────────────────────────────────────
// M4 — "Loot Box Opening" (concept original V3 inspire des case openings CSGO).
//
// User tap "OUVRIR LE COFFRE" -> coffre s'ouvre (anim couvercle + lumiere) ->
// une rangee d'items defile horizontalement (gauche -> droite), rapide au
// debut, decelere progressivement via easing, stoppe sur un item au centre.
// Indicator central jaune marque ou s'arrete l'item gagnant. Reveal anim
// avec burst de particules + montant bonus affiche.
//
// Anticipation + satisfying motion + reveal = pattern viral.
// Fichier reste M4Scratch.tsx pour retrocompat saves (export name preserve).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useAnimationControls } from "framer-motion";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, pseudoAnimationClass, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { V3MagneticButton } from "./V3MagneticButton";
import { V3PseudoKeyframes } from "./V3PseudoKeyframes";
import { extendPalette } from "../lib/v3_palette";

export type M4ScratchProps = {
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

// Items du loot : icone + label + rarete. Le dernier (jackpot) est celui sur
// lequel on atterrit toujours (case opening "lock" qui garantit le gros bonus).
type LootItem = { icon: string; label: string; rarity: "common" | "rare" | "epic" | "legendary" };
const LOOT_POOL: LootItem[] = [
  { icon: "🪙", label: "+5€",   rarity: "common" },
  { icon: "🎁", label: "FS×10", rarity: "common" },
  { icon: "💰", label: "+15€",  rarity: "common" },
  { icon: "🪙", label: "+10€",  rarity: "common" },
  { icon: "🎰", label: "FS×20", rarity: "rare" },
  { icon: "💎", label: "+25€",  rarity: "rare" },
  { icon: "🪙", label: "+8€",   rarity: "common" },
  { icon: "🎁", label: "FS×15", rarity: "common" },
  { icon: "💰", label: "+30€",  rarity: "rare" },
  { icon: "🔮", label: "+40€",  rarity: "epic" },
  { icon: "🪙", label: "+12€",  rarity: "common" },
  { icon: "💎", label: "+50€",  rarity: "epic" },
  { icon: "👑", label: "JACKPOT", rarity: "legendary" }, // <- item gagnant garanti
];

type Phase = "idle" | "opening" | "rolling" | "revealed";

const ITEM_WIDTH = 110; // px par item
const RAIL_LENGTH = 60; // nombre total d'items dans le rail (le gagnant est positionne au milieu de la derniere section)

export function M4Scratch({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M4ScratchProps) {
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
  const railControls = useAnimationControls();
  const railRef = React.useRef<HTMLDivElement>(null);

  // Genere une rail d'items random + le JACKPOT au winning position
  const WINNING_INDEX = RAIL_LENGTH - 5; // index de l'item gagnant (vers la fin)
  const railItems = React.useMemo<LootItem[]>(() => {
    const arr: LootItem[] = [];
    for (let i = 0; i < RAIL_LENGTH; i++) {
      if (i === WINNING_INDEX) {
        arr.push({ icon: "👑", label: bon || "JACKPOT", rarity: "legendary" });
      } else {
        arr.push(LOOT_POOL[Math.floor(Math.random() * (LOOT_POOL.length - 1))]); // pool sans jackpot
      }
    }
    return arr;
  }, [bon]);

  const startOpening = async () => {
    if (phase !== "idle") return;
    setPhase("opening");
    sfx.tick();
    // Pause 600ms pour l'anim d'ouverture du coffre
    await new Promise((r) => setTimeout(r, 600));
    setPhase("rolling");
    // Lance le defilement : target = position du WINNING_INDEX centre sous l'indicator
    const railWidth = railRef.current?.parentElement?.clientWidth ?? 320;
    const targetX = -(WINNING_INDEX * ITEM_WIDTH) + (railWidth / 2) - (ITEM_WIDTH / 2);
    await railControls.start({
      x: targetX,
      transition: { duration: 5.2, ease: [0.05, 0.65, 0.18, 1] }, // decelere fort
    });
    sfx.win();
    setPhase("revealed");
  };

  const reset = () => {
    railControls.set({ x: 0 });
    setPhase("idle");
  };

  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  const rarityColor: Record<LootItem["rarity"], string> = {
    common: "rgba(180,180,180,1)",
    rare: "#60a5fa",
    epic: "#a78bfa",
    legendary: T.accent,
  };
  const rarityBg: Record<LootItem["rarity"], string> = {
    common: "linear-gradient(180deg,#3a3a45,#1f1f28)",
    rare: "linear-gradient(180deg,#1e3a8a,#0f1e44)",
    epic: "linear-gradient(180deg,#5b21b6,#2e0e5c)",
    legendary: `linear-gradient(180deg,${T.accent},${T.accentLight} 50%,${T.accentHot})`,
  };

  return (
    <div className="m4-root">
      <style>{`
        .m4-root{position:relative;min-height:100vh;padding:24px 18px 160px;
          background:
            radial-gradient(70% 50% at 0% 0%, ${T.accent}1f, transparent 65%),
            radial-gradient(60% 40% at 100% 0%, ${T.accentAlt}1a, transparent 70%),
            radial-gradient(80% 50% at 50% 100%, ${T.accentHot}14, transparent 75%),
            linear-gradient(180deg, ${T.bgPage}, ${T.bgCard} 70%, ${T.bgPage});
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff;overflow-x:hidden}
        .m4-layer{position:relative;z-index:10;max-width:460px;margin:0 auto}

        .m4-header{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-bottom:18px}
        .m4-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid ${T.accent};
          box-shadow:0 0 0 3px ${T.bgPage},0 6px 16px rgba(0,0,0,.45);background:${T.bgCard}}
        .m4-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m4-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.62;margin:8px 0 0}
        .m4-headline{margin:4px 0 0;font-size:clamp(1.55rem,5.2vw,2rem);font-weight:900;letter-spacing:-.02em;line-height:1.1}
        .m4-headline em{font-style:normal;color:${T.accent};text-shadow:0 0 18px ${T.accentGlow}}

        /* ─── Coffre (header au-dessus du rail) ─── */
        .m4-chest-wrap{position:relative;margin:18px auto 0;width:140px;height:130px;display:flex;align-items:flex-end;justify-content:center}
        .m4-chest{position:relative;width:120px;height:90px}
        .m4-chest-body{position:absolute;bottom:0;left:0;right:0;height:70px;border-radius:6px 6px 12px 12px;
          background:linear-gradient(180deg,#6b4d2a,#3a2814);border:2px solid #1a0f08;
          box-shadow:inset 0 -4px 8px rgba(0,0,0,.5),0 6px 18px rgba(0,0,0,.5)}
        .m4-chest-body::before{content:"";position:absolute;top:8px;left:50%;transform:translateX(-50%);width:30px;height:24px;border-radius:4px;
          background:linear-gradient(180deg,${T.accent},${T.accentLight});border:1.5px solid #1a0f08;
          box-shadow:0 2px 4px rgba(0,0,0,.4)}
        .m4-chest-lid{position:absolute;top:0;left:0;right:0;height:36px;border-radius:14px 14px 4px 4px;
          background:linear-gradient(180deg,#8a6432,#4a3018);border:2px solid #1a0f08;
          transform-origin:bottom;
          box-shadow:inset 0 4px 6px rgba(255,255,255,.1),0 -2px 6px rgba(0,0,0,.4);
          transition:transform .6s cubic-bezier(.2,.7,.2,1)}
        .m4-chest.opened .m4-chest-lid{transform:rotateX(-110deg)}
        .m4-chest-light{position:absolute;inset:-30%;border-radius:50%;
          background:radial-gradient(circle,${T.accentLight} 0%,transparent 50%);
          opacity:0;pointer-events:none;transition:opacity .4s}
        .m4-chest.opened .m4-chest-light{opacity:.8;animation:m4-light-pulse 1.4s ease-in-out infinite}

        /* ─── Rail rolling ─── */
        .m4-rail-wrap{position:relative;margin:20px -18px 0;height:140px;overflow:hidden;
          background:linear-gradient(180deg,${T.bgCard},${T.bgPage});
          border-top:2px solid ${T.accent}44;border-bottom:2px solid ${T.accent}44;
          mask-image:linear-gradient(to right,transparent 0%,#000 8%,#000 92%,transparent 100%);
          -webkit-mask-image:linear-gradient(to right,transparent 0%,#000 8%,#000 92%,transparent 100%)}
        .m4-rail{display:flex;align-items:center;height:100%;padding:0 50%;will-change:transform}
        .m4-rail-item{flex:0 0 ${ITEM_WIDTH}px;height:110px;margin:0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;
          border-radius:10px;margin-right:8px;position:relative;overflow:hidden;
          border:2px solid rgba(255,255,255,.1);text-align:center}
        .m4-rail-item.legendary{border-color:${T.accentLight};box-shadow:0 0 24px ${T.accentGlow},inset 0 0 18px ${T.accentLight}55}
        .m4-rail-item-icon{font-size:2.4rem;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}
        .m4-rail-item-label{margin-top:6px;font-size:.7rem;font-weight:900;letter-spacing:.04em;text-shadow:0 1px 2px rgba(0,0,0,.6)}
        .m4-rail-item.legendary .m4-rail-item-label{color:#1a0f08;font-size:.78rem}

        /* Indicator central (fleche dorée) */
        .m4-rail-indicator{position:absolute;top:0;left:50%;transform:translateX(-50%);width:4px;height:100%;
          background:linear-gradient(180deg,${T.accent},${T.accentHot});
          box-shadow:0 0 18px ${T.accent},0 0 36px ${T.accentLight};z-index:3;pointer-events:none}
        .m4-rail-indicator::before,.m4-rail-indicator::after{content:"";position:absolute;left:50%;transform:translateX(-50%);width:0;height:0;
          border-left:8px solid transparent;border-right:8px solid transparent}
        .m4-rail-indicator::before{top:-2px;border-top:10px solid ${T.accent}}
        .m4-rail-indicator::after{bottom:-2px;border-bottom:10px solid ${T.accent}}

        /* ─── Reveal banner (apres roll) ─── */
        .m4-reveal{margin:18px auto 0;padding:18px 22px;border-radius:18px;text-align:center;
          background:linear-gradient(160deg,${T.bgCard},${T.bgPage});
          border:1.5px solid ${T.accent};
          box-shadow:0 0 0 1px ${T.accent}22 inset,0 18px 50px ${T.accentGlow},0 0 60px ${T.accentGlow}40;
          animation:m4-reveal-pop .5s cubic-bezier(.4,1.6,.5,1) both}
        .m4-reveal-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.75;font-weight:700;color:${T.accent};margin:0}
        .m4-reveal-val{margin:6px 0 0;font-family:'Bagel Fat One',cursive;font-size:clamp(2.5rem,8vw,3.4rem);line-height:.9;
          background:linear-gradient(180deg,#fff,${T.accent} 50%,${T.accentHot});
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 18px ${T.accentGlow})}
        .m4-reveal-sub{margin:6px 0 0;font-size:.78rem;font-weight:600;opacity:.85}

        /* ─── Actions ─── */
        .m4-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:20px;margin-top:14px;border-radius:16px;
          font-family:inherit;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;border:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s}
        .m4-cta:active{transform:scale(.97)}
        .m4-cta::after{content:"→";font-size:1.3rem;margin-left:4px}
        .m4-cta.disabled{opacity:.6;cursor:not-allowed}
        .m4-cta.idle{animation:m4-breath 2.6s ease-in-out infinite}
        .m4-replay{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:14px;margin-top:10px;border-radius:14px;
          font:inherit;font-size:.82rem;font-weight:700;color:#fff;text-decoration:none;cursor:pointer;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);opacity:.7;transition:opacity .2s}
        .m4-replay:hover{opacity:1}

        .m4-cta-sub{margin:10px 0 0;font-size:.74rem;text-align:center;opacity:.7}

        @keyframes m4-light-pulse{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
        @keyframes m4-reveal-pop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
        @keyframes m4-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 56px ${T.accentLight},0 14px 30px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}

        @media (prefers-reduced-motion:reduce){
          .m4-cta.idle,.m4-chest-light{animation:none !important}
        }
      `}</style>

      <div className="m4-layer">
        {(profileImageUrl || pseudo) ? (
          <div className="m4-header">
            {profileImageUrl ? <div className="m4-avatar"><img src={profileImageUrl} alt="" /></div> : null}
            {pseudo ? (
              <div className={pseudoAnimationClass(pseudoStyle)} style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
                {pseudo}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="m4-label">Loot Box</p>
        <h2 className="m4-headline">
          {phase === "revealed" ? <>🎉 <em>Jackpot débloqué !</em></> :
           phase === "rolling" ? <>🎰 <em>En rotation...</em></> :
           phase === "opening" ? <>📦 <em>Ouverture...</em></> :
           <>Ouvre le <em>coffre du jour</em></>}
        </h2>

        {/* Coffre visuel */}
        <div className="m4-chest-wrap">
          <div className={`m4-chest ${phase !== "idle" ? "opened" : ""}`}>
            <div className="m4-chest-light" />
            <div className="m4-chest-body" />
            <div className="m4-chest-lid" />
          </div>
        </div>

        {/* Rail défilant */}
        <div className="m4-rail-wrap">
          <motion.div ref={railRef} className="m4-rail" animate={railControls} initial={{ x: 0 }}>
            {railItems.map((item, i) => (
              <div key={i} className={`m4-rail-item ${item.rarity}`} style={{ background: rarityBg[item.rarity], borderColor: rarityColor[item.rarity] }}>
                <div className="m4-rail-item-icon">{item.icon}</div>
                <div className="m4-rail-item-label" style={item.rarity !== "legendary" ? { color: rarityColor[item.rarity] } : undefined}>{item.label}</div>
              </div>
            ))}
          </motion.div>
          <div className="m4-rail-indicator" aria-hidden />
        </div>

        {phase === "revealed" ? (
          <div className="m4-reveal">
            <p className="m4-reveal-label">Tu as gagné</p>
            <div className="m4-reveal-val">{bon || "JACKPOT"}</div>
            <p className="m4-reveal-sub">de bonus offert · Crédité instantanément</p>
          </div>
        ) : null}

        {phase === "idle" ? (
          <motion.button
            type="button"
            className="m4-cta idle"
            onClick={startOpening}
            whileTap={{ scale: 0.97 }}
          >
            📦 OUVRIR LE COFFRE
          </motion.button>
        ) : phase === "revealed" ? (
          <>
            <V3MagneticButton href={safeAffi} onClick={onCta} className="m4-cta v3-cta">
              🚀 RÉCLAMER {bon || "MON BONUS"}
            </V3MagneticButton>
            <button type="button" className="m4-replay" onClick={reset}>↻ Rejouer</button>
          </>
        ) : (
          <button type="button" className="m4-cta disabled" disabled>
            ⏳ {phase === "opening" ? "Ouverture..." : "Rotation..."}
          </button>
        )}

        <p className="m4-cta-sub">
          {phase === "idle" ? `Dépose ${dep || "10€"} pour débloquer ton bonus garanti` : ""}
          {phase === "revealed" ? "Inscription en 30s · Crédit instantané" : ""}
        </p>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={bon ? `+${bon}` : "JACKPOT"}
        depositAmount={dep}
        bonusAmount={bon}
        steps={["Validation du loot", "Préparation du bonus", "Lien d'inscription prêt"]}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
      <V3PseudoKeyframes />
    </div>
  );
}
