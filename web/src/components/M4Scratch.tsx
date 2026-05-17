// ─────────────────────────────────────────────────────────────────────────────
// M4 — "Loot Box Opening" v2 (refonte graphique premium).
//
// Refonte :
//   - Coffre redesigne : bandes metalliques, rivets, serrure dore, lid engrave
//   - Items rail : cards avec glow rarete + holographic shimmer sur legendary
//   - Indicator : laser vertical pulsant + chevrons animes
//   - Centrage rail FIX : math correcte (ITEM_WIDTH + gap + padding 50%)
//   - Reveal : flash burst blanc + winner scale up + particules explosion
//   - Montant gagne = TOUJOURS bonusAmount (Y), pas un faux entre deux cases
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useAnimationControls, AnimatePresence } from "framer-motion";
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
];

type Phase = "idle" | "opening" | "rolling" | "revealed";

const ITEM_WIDTH = 100;  // px par item
const ITEM_GAP = 10;     // px entre items
const STRIDE = ITEM_WIDTH + ITEM_GAP;
const RAIL_LENGTH = 70;
const WINNING_INDEX = RAIL_LENGTH - 8; // l'item gagnant (legendary)

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
  // L'item gagnant = TOUJOURS le bonusAmount Y (pas un faux random)
  const winLabel = bon || "JACKPOT";

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [flash, setFlash] = React.useState(false);
  const railControls = useAnimationControls();
  const railContainerRef = React.useRef<HTMLDivElement>(null);

  // Genere rail items : random pool + legendary garanti au WINNING_INDEX
  const railItems = React.useMemo<LootItem[]>(() => {
    const arr: LootItem[] = [];
    for (let i = 0; i < RAIL_LENGTH; i++) {
      if (i === WINNING_INDEX) {
        arr.push({ icon: "👑", label: winLabel, rarity: "legendary" });
      } else {
        arr.push(LOOT_POOL[Math.floor(Math.random() * LOOT_POOL.length)]);
      }
    }
    return arr;
  }, [winLabel]);

  const startOpening = async () => {
    if (phase !== "idle") return;
    setPhase("opening");
    sfx.tick();
    // Anim ouverture coffre 800ms
    await new Promise((r) => setTimeout(r, 800));
    setPhase("rolling");

    // ─── Centrage rail correct ───
    // Le rail a padding-left/right = 50% du container. Donc item 0 commence
    // a x=containerWidth/2. Chaque item suivant est a STRIDE pixels plus loin.
    // Item i's center est a : containerWidth/2 + i*STRIDE + ITEM_WIDTH/2
    // Pour centrer item i dans le container (center = containerWidth/2), on
    // doit translater le rail de : -i*STRIDE - ITEM_WIDTH/2
    const targetX = -(WINNING_INDEX * STRIDE) - (ITEM_WIDTH / 2);

    await railControls.start({
      x: targetX,
      transition: { duration: 5.5, ease: [0.05, 0.55, 0.18, 1] },
    });

    // Flash blanc + reveal
    setFlash(true);
    sfx.win();
    await new Promise((r) => setTimeout(r, 250));
    setFlash(false);
    setPhase("revealed");
  };

  const reset = () => {
    railControls.set({ x: 0 });
    setPhase("idle");
    setFlash(false);
  };

  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  const rarityColor: Record<LootItem["rarity"], string> = {
    common: "#a0a0aa",
    rare: "#60a5fa",
    epic: "#c084fc",
    legendary: T.accent,
  };
  const rarityBg: Record<LootItem["rarity"], string> = {
    common:    "linear-gradient(180deg,#2a2a35 0%,#13131b 100%)",
    rare:      "linear-gradient(180deg,#1e3a8a 0%,#0c1d4a 100%)",
    epic:      "linear-gradient(180deg,#581c87 0%,#2e0e5c 100%)",
    legendary: `linear-gradient(180deg,${T.accent} 0%,${T.accentLight} 45%,${T.accentHot} 100%)`,
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

        .m4-header{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-bottom:14px}
        .m4-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid ${T.accent};
          box-shadow:0 0 0 3px ${T.bgPage},0 6px 16px rgba(0,0,0,.45);background:${T.bgCard}}
        .m4-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m4-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.62;margin:8px 0 0}
        .m4-headline{margin:4px 0 0;font-size:clamp(1.55rem,5.2vw,2rem);font-weight:900;letter-spacing:-.02em;line-height:1.1}
        .m4-headline em{font-style:normal;
          background:linear-gradient(180deg,#fff,${T.accent});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 14px ${T.accentGlow})}

        /* ─── COFFRE PREMIUM ─── */
        .m4-chest-wrap{position:relative;margin:20px auto 0;width:160px;height:140px;display:flex;align-items:flex-end;justify-content:center;perspective:600px}
        .m4-chest-shadow{position:absolute;bottom:-8px;left:10%;right:10%;height:20px;border-radius:50%;
          background:radial-gradient(ellipse,rgba(0,0,0,.6) 0%,transparent 70%);filter:blur(4px)}
        .m4-chest{position:relative;width:140px;height:110px;transform-style:preserve-3d}
        .m4-chest-body{position:absolute;bottom:0;left:0;right:0;height:80px;border-radius:6px 6px 14px 14px;
          background:
            linear-gradient(180deg,transparent 0%,transparent 25%,rgba(0,0,0,.2) 26%,transparent 30%,transparent 60%,rgba(0,0,0,.25) 61%,transparent 66%),
            linear-gradient(180deg,#7a5731 0%,#4a3018 50%,#2a1a08 100%);
          border:2px solid #1a0f08;
          box-shadow:
            inset 0 -6px 12px rgba(0,0,0,.5),
            inset 0 2px 0 rgba(255,255,255,.12),
            0 10px 24px rgba(0,0,0,.55),
            0 0 30px ${T.accentGlow}55}
        /* Bandes metalliques horizontales */
        .m4-chest-body::before,.m4-chest-body::after{content:"";position:absolute;left:-2px;right:-2px;height:6px;
          background:linear-gradient(180deg,${T.accentLight},${T.accent} 50%,#5a4015);
          border-top:1px solid #1a0f08;border-bottom:1px solid #1a0f08}
        .m4-chest-body::before{top:18px}
        .m4-chest-body::after{top:52px}
        /* Rivets */
        .m4-chest-rivets{position:absolute;top:30px;left:0;right:0;height:16px;display:flex;justify-content:space-between;padding:0 6px;pointer-events:none}
        .m4-chest-rivets span{width:6px;height:6px;border-radius:50%;background:radial-gradient(circle at 30% 30%,${T.accentLight},${T.accent} 60%,#5a4015);box-shadow:inset 0 -1px 2px rgba(0,0,0,.4)}
        /* Serrure dore au centre */
        .m4-chest-lock{position:absolute;top:38px;left:50%;transform:translateX(-50%);width:32px;height:28px;border-radius:6px;
          background:linear-gradient(180deg,${T.accentLight},${T.accent} 50%,#5a4015);
          border:2px solid #1a0f08;
          box-shadow:inset 0 2px 0 rgba(255,255,255,.4),0 4px 8px rgba(0,0,0,.4);
          display:flex;align-items:center;justify-content:center;font-size:.95rem;color:#1a0f08;font-weight:900}
        /* Couvercle (lid) */
        .m4-chest-lid{position:absolute;top:0;left:0;right:0;height:42px;border-radius:16px 16px 4px 4px;
          background:linear-gradient(180deg,#9a7240 0%,#6a4a22 60%,#3a2810 100%);
          border:2px solid #1a0f08;
          box-shadow:inset 0 6px 8px rgba(255,255,255,.12),inset 0 -2px 4px rgba(0,0,0,.4),0 -3px 6px rgba(0,0,0,.3);
          transform-origin:bottom;
          transition:transform .8s cubic-bezier(.2,.7,.2,1)}
        /* Bande dore sur le lid */
        .m4-chest-lid::before{content:"";position:absolute;left:-2px;right:-2px;top:50%;transform:translateY(-50%);height:5px;
          background:linear-gradient(180deg,${T.accentLight},${T.accent} 50%,#5a4015);
          border-top:1px solid #1a0f08;border-bottom:1px solid #1a0f08}
        .m4-chest.opened .m4-chest-lid{transform:rotateX(-115deg)}
        /* Light inside le coffre (revele quand ouvert) */
        .m4-chest-light{position:absolute;bottom:8px;left:8px;right:8px;height:50px;border-radius:4px;
          background:radial-gradient(ellipse at center,${T.accentLight} 0%,${T.accent} 50%,transparent 100%);
          opacity:0;pointer-events:none;transition:opacity .5s ease;mix-blend-mode:screen}
        .m4-chest.opened .m4-chest-light{opacity:1;animation:m4-light-flicker 1.2s ease-in-out infinite}
        /* Halo dore autour du coffre quand ouvert */
        .m4-chest-halo{position:absolute;inset:-30%;border-radius:50%;
          background:radial-gradient(circle,${T.accentLight}60 0%,${T.accentGlow}40 30%,transparent 60%);
          filter:blur(20px);opacity:0;transition:opacity .6s;pointer-events:none}
        .m4-chest.opened ~ .m4-chest-halo,.m4-chest-wrap .m4-chest.opened + .m4-chest-halo{opacity:1;animation:m4-halo-breath 2.4s ease-in-out infinite}
        .m4-chest.opened ~ .m4-chest-halo{}

        /* ─── RAIL ─── */
        .m4-rail-stage{position:relative;margin:24px -18px 0;padding:8px 0;
          background:linear-gradient(180deg,${T.bgPage}, ${T.bgCard}, ${T.bgPage});
          border-top:1px solid ${T.accent}44;border-bottom:1px solid ${T.accent}44;
          box-shadow:inset 0 0 20px rgba(0,0,0,.5)}
        .m4-rail-track{position:relative;height:140px;overflow:hidden;
          mask-image:linear-gradient(to right,transparent 0%,#000 10%,#000 90%,transparent 100%);
          -webkit-mask-image:linear-gradient(to right,transparent 0%,#000 10%,#000 90%,transparent 100%)}
        .m4-rail{display:flex;align-items:center;height:100%;padding:0 50%;will-change:transform;gap:${ITEM_GAP}px}
        .m4-rail-item{flex:0 0 ${ITEM_WIDTH}px;height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;
          border-radius:12px;position:relative;overflow:hidden;
          border:2px solid;text-align:center;font-weight:900;
          box-shadow:0 4px 14px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.15)}
        /* Holographic shimmer sur legendary */
        .m4-rail-item.legendary{
          box-shadow:0 0 28px ${T.accentGlow},inset 0 0 22px ${T.accentLight}55,0 6px 18px rgba(0,0,0,.6);
          animation:m4-legendary-pulse 1.8s ease-in-out infinite}
        .m4-rail-item.legendary::after{content:"";position:absolute;inset:0;border-radius:10px;pointer-events:none;
          background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.5) 50%,transparent 70%);
          background-size:200% 100%;animation:m4-shine 3s linear infinite;mix-blend-mode:overlay}
        .m4-rail-item.legendary .m4-rail-item-label{color:#1a0f08;font-size:.85rem;text-shadow:0 1px 0 ${T.accentLight}}
        .m4-rail-item-icon{font-size:2.6rem;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}
        .m4-rail-item-label{margin-top:6px;font-size:.74rem;letter-spacing:.04em;text-shadow:0 1px 2px rgba(0,0,0,.7)}

        /* ─── INDICATOR (laser central) ─── */
        .m4-rail-indicator{position:absolute;top:0;left:50%;transform:translateX(-50%);width:3px;height:100%;
          background:linear-gradient(180deg,transparent,${T.accent} 15%,${T.accentLight} 50%,${T.accent} 85%,transparent);
          box-shadow:0 0 14px ${T.accent},0 0 28px ${T.accentLight},0 0 44px ${T.accent};z-index:3;pointer-events:none;
          animation:m4-laser-pulse 1.5s ease-in-out infinite}
        .m4-rail-indicator::before,.m4-rail-indicator::after{content:"";position:absolute;left:50%;transform:translateX(-50%);width:0;height:0;
          border-left:8px solid transparent;border-right:8px solid transparent;filter:drop-shadow(0 0 6px ${T.accentLight})}
        .m4-rail-indicator::before{top:-2px;border-top:12px solid ${T.accent}}
        .m4-rail-indicator::after{bottom:-2px;border-bottom:12px solid ${T.accent}}

        /* ─── FLASH BURST au reveal ─── */
        .m4-flash{position:absolute;inset:0;background:radial-gradient(circle at center,#fff 0%,transparent 60%);
          z-index:6;pointer-events:none;opacity:0;transition:opacity .15s ease-out}
        .m4-flash.on{opacity:1;animation:m4-flash-burst .5s ease-out forwards}

        /* ─── REVEAL BANNER ─── */
        .m4-reveal{margin:18px auto 0;padding:20px 22px;border-radius:18px;text-align:center;position:relative;overflow:hidden;
          background:linear-gradient(160deg,${T.bgCard},${T.bgPage});
          border:1.5px solid ${T.accent};
          box-shadow:0 0 0 1px ${T.accent}33 inset,0 18px 50px ${T.accentGlow},0 0 60px ${T.accentGlow}40}
        .m4-reveal::before{content:"";position:absolute;inset:-1px;border-radius:18px;padding:1.5px;pointer-events:none;
          background:conic-gradient(from var(--rev,0deg),${T.accent},${T.accentLight},${T.accent});
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
          animation:m4-reveal-spin 4s linear infinite}
        @property --rev{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes m4-reveal-spin{to{--rev:360deg}}
        .m4-reveal-label{font-size:.7rem;letter-spacing:.32em;text-transform:uppercase;font-weight:800;color:${T.accent};margin:0;text-shadow:0 0 12px ${T.accentGlow}}
        .m4-reveal-val{margin:6px 0 0;font-family:'Bagel Fat One',cursive;font-size:clamp(2.8rem,9vw,3.8rem);line-height:.9;letter-spacing:.01em;
          background:linear-gradient(180deg,#fff 0%,${T.accent} 50%,${T.accentHot} 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 18px ${T.accentGlow})}
        .m4-reveal-sub{margin:8px 0 0;font-size:.82rem;font-weight:600;opacity:.85}

        /* ─── Particules explosion ─── */
        .m4-burst-particle{position:absolute;width:6px;height:6px;border-radius:50%;pointer-events:none;opacity:0}
        .m4-reveal .m4-burst-particle{animation:m4-burst 1.2s cubic-bezier(.2,.7,.2,1) both}

        /* ─── Actions ─── */
        .m4-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:20px;margin-top:14px;border-radius:16px;
          font-family:inherit;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;border:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s}
        .m4-cta:active{transform:scale(.97)}
        .m4-cta::after{content:"→";font-size:1.3rem;margin-left:4px}
        .m4-cta.disabled{opacity:.55;cursor:wait}
        .m4-cta.idle{animation:m4-breath 2.6s ease-in-out infinite}
        .m4-replay{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:14px;margin-top:10px;border-radius:14px;
          font:inherit;font-size:.82rem;font-weight:700;color:#fff;text-decoration:none;cursor:pointer;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);opacity:.7;transition:opacity .2s}
        .m4-replay:hover{opacity:1}
        .m4-cta-sub{margin:10px 0 0;font-size:.74rem;text-align:center;opacity:.7;min-height:1em}

        /* ─── Animations ─── */
        @keyframes m4-light-flicker{0%,100%{opacity:1;transform:scaleY(1)}50%{opacity:.85;transform:scaleY(1.04)}}
        @keyframes m4-halo-breath{0%,100%{opacity:.65;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
        @keyframes m4-laser-pulse{0%,100%{box-shadow:0 0 14px ${T.accent},0 0 28px ${T.accentLight},0 0 44px ${T.accent}}50%{box-shadow:0 0 22px ${T.accent},0 0 44px ${T.accentLight},0 0 66px ${T.accent}}}
        @keyframes m4-legendary-pulse{0%,100%{box-shadow:0 0 28px ${T.accentGlow},inset 0 0 22px ${T.accentLight}55,0 6px 18px rgba(0,0,0,.6)}50%{box-shadow:0 0 44px ${T.accentLight},inset 0 0 32px ${T.accentLight}88,0 6px 18px rgba(0,0,0,.6)}}
        @keyframes m4-shine{to{background-position:-200% 0}}
        @keyframes m4-flash-burst{0%{opacity:1}100%{opacity:0}}
        @keyframes m4-burst{
          0%{opacity:1;transform:translate(0,0) scale(1)}
          100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.2)}
        }
        @keyframes m4-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 56px ${T.accentLight},0 14px 30px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}

        @media (prefers-reduced-motion:reduce){
          .m4-cta.idle,.m4-chest-light,.m4-chest-halo,.m4-rail-item.legendary,.m4-rail-item.legendary::after,.m4-rail-indicator,.m4-reveal::before{animation:none !important}
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
          {phase === "revealed" ? <>🎉 <em>Jackpot débloqué</em></> :
           phase === "rolling" ? <>🎰 <em>En rotation...</em></> :
           phase === "opening" ? <>📦 <em>Ouverture...</em></> :
           <>Ouvre le <em>coffre du jour</em></>}
        </h2>

        {/* Coffre visuel premium */}
        <div className="m4-chest-wrap">
          <div className="m4-chest-shadow" />
          <div className={`m4-chest ${phase !== "idle" ? "opened" : ""}`}>
            <div className="m4-chest-body">
              <div className="m4-chest-rivets">
                <span /><span /><span /><span /><span />
              </div>
              <div className="m4-chest-lock">★</div>
              <div className="m4-chest-light" />
            </div>
            <div className="m4-chest-lid" />
          </div>
          <div className="m4-chest-halo" />
        </div>

        {/* Rail défilant */}
        <div className="m4-rail-stage">
          <div className="m4-rail-track" ref={railContainerRef}>
            <motion.div className="m4-rail" animate={railControls} initial={{ x: 0 }}>
              {railItems.map((item, i) => (
                <div
                  key={i}
                  className={`m4-rail-item ${item.rarity}`}
                  style={{ background: rarityBg[item.rarity], borderColor: rarityColor[item.rarity] }}
                >
                  <div className="m4-rail-item-icon">{item.icon}</div>
                  <div
                    className="m4-rail-item-label"
                    style={item.rarity !== "legendary" ? { color: rarityColor[item.rarity] } : undefined}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </motion.div>
            <div className="m4-rail-indicator" aria-hidden />
            <div className={`m4-flash ${flash ? "on" : ""}`} aria-hidden />
          </div>
        </div>

        <AnimatePresence>
          {phase === "revealed" ? (
            <motion.div
              className="m4-reveal"
              initial={{ opacity: 0, scale: 0.7, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.4, 1.6, 0.5, 1] }}
            >
              <p className="m4-reveal-label">Tu as gagné</p>
              <div className="m4-reveal-val">{winLabel}</div>
              <p className="m4-reveal-sub">de bonus offert · Crédité instantanément</p>
              {/* Particules burst */}
              {[
                { dx: 80, dy: -90, color: T.accent },
                { dx: -90, dy: -80, color: T.accentLight },
                { dx: 100, dy: 60, color: T.accentHot },
                { dx: -80, dy: 70, color: T.accent },
                { dx: 120, dy: -30, color: T.accentLight },
                { dx: -120, dy: 20, color: T.accentHot },
                { dx: 40, dy: 110, color: T.accent },
                { dx: -40, dy: -120, color: T.accentLight },
              ].map((p, i) => (
                <span
                  key={i}
                  className="m4-burst-particle"
                  style={{
                    left: "50%", top: "50%", marginLeft: "-3px", marginTop: "-3px",
                    background: p.color, boxShadow: `0 0 12px ${p.color}`,
                    ["--dx" as any]: `${p.dx}px`, ["--dy" as any]: `${p.dy}px`,
                    animationDelay: `${i * 40}ms`,
                  } as any}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

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
              🚀 RÉCLAMER {winLabel}
            </V3MagneticButton>
            <button type="button" className="m4-replay" onClick={reset}>↻ Rejouer</button>
          </>
        ) : (
          <button type="button" className="m4-cta disabled" disabled>
            {phase === "opening" ? "⏳ Ouverture..." : "🎰 Rotation..."}
          </button>
        )}

        <p className="m4-cta-sub">
          {phase === "idle" ? `Dépose ${dep || "10€"} pour débloquer ton bonus garanti` :
           phase === "revealed" ? "Inscription en 30s · Crédit instantané" :
           "Le rail s'arrête sur ton butin..."}
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
