// ─────────────────────────────────────────────────────────────────────────────
// M12 — "Paliers VIP" : 4 cards de depot avec bonus scale progressivement.
// Bronze 20€ → bonus standard. Silver 50€ → bonus + free spins. Gold 100€ →
// bonus XL + cashback. **DIAMOND VIP 500€+** → host VIP dedie + form email
// INLINE pour capturer le lead immediatement (avant meme le clic CTA).
//
// Conversion-driven :
//   - anchoring : le palier "recommande" (Gold) est mis en avant visuellement
//   - upsell : le palier max affiche +VIP host pour pousser le gros depot
//   - capture mail : Diamond declenche un form inline (pas le popup)
//   - urgence : bandeau "offre valable 24h"
//
// Respecte regles V3 : theme/pseudoStyle/X/Y/V3OfferPopup/V3SocialProof.
// X (depositAmount) = palier MINIMUM (le user vise plus haut visuellement).
// Y (bonusAmount) = bonus du palier de base (palier 1).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion } from "framer-motion";
import { V3InlineVipForm } from "./V3InlineVipForm";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3MagneticButton } from "./V3MagneticButton";
import { extendPalette } from "../lib/v3_palette";
import { V3_POPUP_ENABLED, openAffiLink } from "../lib/v3_popup_flag";
import { pseudoTextStyle, pseudoAnimationClass, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3PseudoKeyframes } from "./V3PseudoKeyframes";

export type M12ChatProps = {
  pseudo?: string;
  profileImageUrl?: string;
  depositAmount?: number | null;   // = palier de base (Bronze)
  bonusAmount?: number | null;     // = bonus du palier de base
  affiLink: string;
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgPage?: string;
    bgCard?: string;
  };
  pseudoStyle?: V3LineStyleLike;
};

type Tier = {
  key: string;
  label: string;
  icon: string;
  deposit: number;
  bonusMult: number;     // bonus = deposit * mult
  perks: string[];
  highlight?: boolean;   // tier "recommandé" mis en avant
  vip?: boolean;         // tier Diamond → form email inline
  color: string;         // accent custom du tier (sinon theme.accent)
};

export function M12Chat({
  pseudo, profileImageUrl, depositAmount, bonusAmount: _bonusAmount, affiLink, theme, pseudoStyle,
}: M12ChatProps) {
  void _bonusAmount;
  const P = extendPalette(theme, "#FFD700");
  const T = {
    accent:      P.accent,
    accentLight: P.accentLight,
    accentAlt:   P.accentAlt,
    accentHot:   P.accentHot,
    accentGlow:  P.glow,
    bgPage:      P.bgPage,
    bgCard:      P.bgCard,
  };
  const safeAffi = affiLink || "#";

  // Bonus = 100% du depot (×2) pour tous les paliers. Pas de faux gonflage.
  // Palier base = X fourni (defaut 10€). Les autres scalent : ×2.5, ×5, ×25.
  const baseDep = depositAmount ?? 10;
  const bonusMult = 1; // 100% bonus = depot × (1+mult) avec mult=1 → reception = depot×2

  const tiers: Tier[] = React.useMemo(() => ([
    {
      key: "bronze",
      label: "Bronze",
      icon: "🥉",
      deposit: baseDep,
      bonusMult,
      perks: ["Bonus 100% standard", "Inscription instantanée"],
      color: "#CD7F32",
    },
    {
      key: "silver",
      label: "Silver",
      icon: "🥈",
      deposit: Math.round(baseDep * 2.5),
      bonusMult,
      perks: ["Bonus 100%", "20 free spins offerts"],
      color: "#C0C0C0",
    },
    {
      key: "gold",
      label: "Gold",
      icon: "🥇",
      deposit: Math.round(baseDep * 5),
      bonusMult,
      perks: ["Bonus 100%", "50 free spins", "Cashback 10%"],
      highlight: true,
      color: T.accent,
    },
    {
      key: "diamond",
      label: "Diamond VIP",
      icon: "💎",
      deposit: Math.round(baseDep * 25),
      bonusMult,
      perks: ["Bonus 100%", "Free spins illimités", "Cashback 20%", "Host VIP dédié 24/7"],
      vip: true,
      color: "#B5FFFC",
    },
  ]), [baseDep, T.accent]);

  const [selectedKey, setSelectedKey] = React.useState<string>("gold");
  const selected = tiers.find((t) => t.key === selectedKey) || tiers[2];
  const selectedBonus = Math.round(selected.deposit * selected.bonusMult);
  const selectedReceived = selected.deposit + selectedBonus; // total recu apres bonus

  // Click handlers gated par V3_POPUP_ENABLED. Si flag false = redirect direct.
  // Si flag true (future) = popup avec animation reveal.
  const [popupOpen, setPopupOpen] = React.useState(false);
  const triggerCta = () => {
    if (V3_POPUP_ENABLED) setPopupOpen(true);
    else openAffiLink(safeAffi);
  };
  const onTierClick = (key: string) => {
    setSelectedKey(key);
    triggerCta();
  };
  const isBigPlayer = selected.highlight || selected.vip;

  // Countdown 24h depuis le mount (relance a chaque visite — illusion d'urgence)
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const targetMs = React.useMemo(() => Date.now() + 24 * 3600 * 1000 - Math.floor(Math.random() * 8 * 3600 * 1000), []);
  const remain = Math.max(0, targetMs - now);
  const hh = Math.floor(remain / 3600000);
  const mm = Math.floor((remain % 3600000) / 60000);
  const ss = Math.floor((remain % 60000) / 1000);

  // Places restantes : decremente lentement (rarete)
  const [seatsLeft, setSeatsLeft] = React.useState(() => 28 + Math.floor(Math.random() * 12));
  const TOTAL_SEATS = 50;
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setSeatsLeft((s) => Math.max(7, s - (Math.random() < 0.3 ? 1 : 0)));
    }, 18000);
    return () => window.clearInterval(id);
  }, []);
  const seatsPct = (seatsLeft / TOTAL_SEATS) * 100;

  const vipRef = React.useRef<HTMLDivElement>(null);
  const heroRef = React.useRef<HTMLElement>(null);
  const nameStyle = pseudoTextStyle(pseudoStyle, T.accent);

  return (
    <div className="m12-root">
      <style>{`
        .m12-root{position:relative;min-height:100vh;padding:0 0 160px;
          /* Bg multi-couches : radials accent dans les coins + base sombre.
             Donne de la profondeur sans bleed sur le contenu (cards opaques). */
          background:
            radial-gradient(70% 50% at 0% 0%, ${T.accent}1f, transparent 65%),
            radial-gradient(60% 40% at 100% 0%, ${T.accentAlt}1a, transparent 70%),
            radial-gradient(80% 50% at 50% 100%, ${T.accentHot}14, transparent 75%),
            linear-gradient(180deg, ${T.bgPage}, ${T.bgCard} 70%, ${T.bgPage});
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff;overflow-x:hidden;
          --c-accent:${T.accent};--c-light:${T.accentLight};--c-alt:${T.accentAlt};--c-hot:${T.accentHot};--c-glow:${T.accentGlow}}
        .m12-layer{position:relative;z-index:10}

        /* ─── Urgency bar top ─── */
        .m12-urgency{display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 16px;
          background:linear-gradient(90deg,${T.accent},${T.accentLight});color:#000;font-weight:800;font-size:.82rem;letter-spacing:.04em;text-align:center;
          box-shadow:0 4px 18px ${T.accentGlow};position:sticky;top:0;z-index:30}
        .m12-urgency-icon{animation:m12-pulse 1.4s ease-in-out infinite}
        .m12-urgency-timer{font-variant-numeric:tabular-nums;font-weight:900;letter-spacing:.06em;background:rgba(0,0,0,.18);padding:3px 9px;border-radius:6px}

        /* ─── Hero (compact pour above-the-fold) ─── */
        .m12-hero{padding:16px 18px 8px;max-width:460px;margin:0 auto;text-align:center}
        .m12-avatar{position:relative;z-index:5;width:74px;height:74px;border-radius:50%;margin:0 auto 6px;overflow:hidden;border:2.5px solid ${T.accent};
          box-shadow:0 0 0 3px ${T.bgPage},0 6px 16px rgba(0,0,0,.45);background:${T.bgCard}}
        .m12-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m12-avatar-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:1.6rem;opacity:.4}
        .m12-pseudo{margin:0;line-height:1.1}
        .m12-pre{margin:10px 0 3px;font-size:.66rem;letter-spacing:.3em;text-transform:uppercase;opacity:.62}
        .m12-headline{margin:0;font-size:clamp(1.35rem,4.6vw,1.8rem);font-weight:900;letter-spacing:-.02em;line-height:1.12}
        .m12-headline em{font-style:normal;background:linear-gradient(180deg,${T.accent},${T.accentLight});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 14px ${T.accentGlow})}

        /* ─── Places restantes (rarete) ─── */
        .m12-seats{margin:10px auto 4px;max-width:420px;padding:10px 14px;border-radius:14px;
          background:linear-gradient(160deg,${T.bgCard},${T.bgPage});
          border:1px solid rgba(255,255,255,.08)}
        .m12-seats-top{display:flex;justify-content:space-between;align-items:center;font-size:.72rem;font-weight:700;margin-bottom:6px}
        .m12-seats-top-label{opacity:.72;letter-spacing:.04em;display:flex;align-items:center;gap:6px}
        .m12-seats-top-label::before{content:"";width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;animation:m12-blink 1.2s ease-in-out infinite}
        .m12-seats-count{color:#ef4444;font-weight:900;font-size:.8rem;font-variant-numeric:tabular-nums}
        .m12-seats-track{position:relative;height:6px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden}
        .m12-seats-fill{position:absolute;top:0;left:0;height:100%;border-radius:99px;
          background:linear-gradient(90deg,${T.accent},${T.accentLight});transition:width .6s ease;
          box-shadow:0 0 12px ${T.accentGlow}}
        @keyframes m12-blink{0%,100%{opacity:1}50%{opacity:.4}}

        /* ─── Tiers grid (cards visibles intégralement + auto-row height) ─── */
        .m12-tiers{padding:12px 14px 10px;max-width:560px;margin:0 auto}
        .m12-tiers-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;align-items:stretch;grid-auto-rows:1fr}
        .m12-tier{position:relative;padding:14px 12px 14px;border-radius:18px;cursor:pointer;text-align:center;
          /* Bg solide theme-aware pour BLOQUER le mesh de bleed-through */
          background:linear-gradient(160deg,${T.bgCard},${T.bgPage});
          border:1.5px solid rgba(255,255,255,.08);transition:transform .25s cubic-bezier(.2,.7,.2,1),border-color .25s,box-shadow .25s,background .35s;
          display:flex;flex-direction:column;gap:6px;color:#fff;font-family:inherit;font:inherit;min-height:0;
          isolation:isolate}
        /* Conic-gradient border anime sur les paliers VIP / Highlight */
        .m12-tier.vip::before,.m12-tier.highlight::before{content:"";position:absolute;inset:-1.5px;border-radius:20px;padding:1.5px;pointer-events:none;
          background:conic-gradient(from var(--a,0deg),var(--tier-color),#fff,var(--tier-color),var(--tier-color));
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
          animation:m12-border-spin 5s linear infinite;opacity:.9}
        .m12-tier.vip::before{animation-duration:3.5s}
        /* Diamond tier : bg cyan glassmorphic distinct */
        .m12-tier.vip{background:linear-gradient(160deg,#0a4250,${T.bgPage})}
        @property --a{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes m12-border-spin{to{--a:360deg}}
        .m12-tier:hover{transform:translateY(-3px)}
        .m12-tier.selected{transform:translateY(-4px) scale(1.02);
          border-color:var(--tier-color);
          box-shadow:0 0 0 2px var(--tier-color)66,0 24px 60px var(--tier-color)44,inset 0 1px 0 rgba(255,255,255,.18)}
        .m12-tier-badge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:999px;
          background:linear-gradient(135deg,var(--tier-color),#fff);color:#1a0f08;font-size:.62rem;font-weight:900;letter-spacing:.18em;text-transform:uppercase;
          box-shadow:0 6px 16px var(--tier-color)cc,inset 0 1px 0 rgba(255,255,255,.5);white-space:nowrap;z-index:2}
        .m12-tier-vip{position:absolute;top:-9px;right:10px;padding:4px 9px;border-radius:6px;background:linear-gradient(135deg,#fff,#e0e0e0);color:#1a0f08;font-size:.55rem;font-weight:900;letter-spacing:.18em;text-transform:uppercase;box-shadow:0 4px 12px rgba(255,255,255,.3);z-index:2}
        /* Header : icone + label sur 1 ligne centree */
        .m12-tier-head{display:flex;align-items:center;justify-content:center;gap:8px}
        .m12-tier-icon{font-size:1.5rem;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.4))}
        .m12-tier-label{margin:0;font-size:.95rem;font-weight:900;letter-spacing:.02em;line-height:1}
        /* DÉPOSE X = info principale qui guide le choix (accent color + gros) */
        .m12-tier-dep{margin:6px 0 2px;font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;font-weight:700;opacity:.7}
        .m12-tier-dep-amount{display:block;margin-top:2px;font-size:1.5rem;font-weight:900;color:var(--tier-color);letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums;
          text-shadow:0 0 18px var(--tier-color)55}
        /* +X€ = recompense, le plus gros */
        .m12-tier-arrow{font-size:.85rem;opacity:.5;margin:2px 0 0}
        .m12-tier-bonus{margin:0 0 4px;display:flex;flex-direction:column;align-items:center;
          font-size:clamp(1.7rem,6vw,2.2rem);font-weight:900;line-height:1;letter-spacing:-.03em;
          background:linear-gradient(180deg,#fff,var(--tier-color));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 14px var(--tier-color)80);font-variant-numeric:tabular-nums}
        .m12-tier-bonus-label{font-size:.7rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;opacity:.7;-webkit-text-fill-color:initial;color:rgba(255,255,255,.7);filter:none;margin-bottom:2px;background:none}
        .m12-tier-perks{display:flex;flex-direction:column;gap:3px;margin-top:auto;padding-top:6px;text-align:left}
        .m12-tier-perk{font-size:.68rem;opacity:.82;display:flex;align-items:center;gap:6px;font-weight:500;line-height:1.25}
        .m12-tier-perk::before{content:"✓";color:var(--tier-color);font-weight:900;font-size:.72rem;flex-shrink:0}

        /* ─── Selected resume + CTA ─── */
        .m12-cta-wrap{padding:22px 16px 12px;max-width:460px;margin:0 auto;text-align:center}
        .m12-cta-resume{padding:16px 18px;margin-bottom:14px;border-radius:16px;background:rgba(0,0,0,.45);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border:1.5px solid var(--c-accent)55;box-shadow:0 0 0 1px var(--c-accent)22 inset,0 10px 30px var(--c-accent)33}
        .m12-cta-resume-label{font-size:.68rem;letter-spacing:.28em;text-transform:uppercase;opacity:.7;margin:0;font-weight:700;color:var(--c-accent)}
        .m12-cta-resume-line{margin:6px 0 0;font-size:1.12rem;font-weight:700;letter-spacing:.01em}
        .m12-cta-resume-line em{font-style:normal;color:var(--c-accent);font-weight:900;font-variant-numeric:tabular-nums}
        .m12-cta{position:relative;display:flex;align-items:center;justify-content:center;width:100%;padding:20px;border-radius:18px;
          font-family:inherit;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 16px 38px ${T.accent}55,inset 0 1px 0 rgba(255,255,255,.5);
          animation:m12-breath 2.4s ease-in-out infinite;text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s}
        .m12-cta:active{transform:scale(.97)}
        .m12-cta::after{content:"→";margin-left:8px;font-size:1.2rem}
        .m12-cta-sub{margin:10px 0 0;font-size:.76rem;opacity:.78;font-weight:600;letter-spacing:.03em}
        /* VIP teaser sous le CTA principal : discret mais visible, click = scroll vers form VIP */
        .m12-vip-teaser{display:inline-flex;align-items:center;gap:8px;margin:12px auto 0;padding:8px 16px;border-radius:999px;
          background:linear-gradient(135deg,${T.accent}22,${T.accentLight}22);
          border:1px solid ${T.accent}66;color:${T.accent};font-family:inherit;font-size:.78rem;font-weight:800;letter-spacing:.04em;
          cursor:pointer;transition:transform .15s,background .25s,border-color .25s;
          text-shadow:0 0 8px ${T.accentGlow}}
        .m12-vip-teaser:hover{background:linear-gradient(135deg,${T.accent}44,${T.accentLight}44);border-color:${T.accent};transform:translateY(-1px)}
        .m12-vip-teaser-crown{font-size:.95rem}
        .m12-vip-teaser-arrow{font-size:.9rem;opacity:.7;transition:transform .2s}
        .m12-vip-teaser:hover .m12-vip-teaser-arrow{transform:translateX(3px)}

        /* ─── Trust strip (grid 2x2 plus visible) ─── */
        .m12-trust{padding:16px;max-width:480px;margin:0 auto;display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
        .m12-trust-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
          background:rgba(255,255,255,.04);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
          border:1px solid rgba(255,255,255,.07);font-size:.76rem;font-weight:600;opacity:.95}
        .m12-trust-icon{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:${T.accent}1a;color:${T.accent};font-size:.9rem;flex-shrink:0}

        /* ─── VIP form section ─── */
        .m12-vip-section{padding:24px 16px;max-width:480px;margin:0 auto}

        /* ─── Footer ─── */
        .m12-footer{padding:20px 22px 10px;text-align:center;opacity:.5;font-size:.66rem;line-height:1.7;max-width:460px;margin:0 auto}
        .m12-footer strong{color:#fff;font-weight:700}

        /* Orbs supprimés : creaient un halo fog autour du contenu */

        /* ─── Sticky CTA mobile ─── */
        .m12-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 14px 16px;
          background:linear-gradient(to top,${T.bgPage} 55%,${T.bgPage}dd 85%,transparent)}
        .m12-sticky-cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:420px;margin:0 auto;padding:16px;border-radius:16px;
          font-family:inherit;font-size:.98rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 12px 28px ${T.accent}55;text-shadow:0 1px 0 rgba(255,255,255,.3)}

        @keyframes m12-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
        @keyframes m12-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 16px 38px ${T.accent}55,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 60px ${T.accentLight},0 16px 38px ${T.accent}80,inset 0 1px 0 rgba(255,255,255,.6)}}

        @media (prefers-reduced-motion:reduce){
          .m12-urgency-icon,.m12-cta{animation:none !important}
        }
      `}</style>

      {/* Bg ambiance via gradients radiaux dans .m12-root (cf style). Pas de
          couche supplementaire = zero bleed sur les cards opaques. */}

      <div className="m12-layer">
      {/* ─── Urgency bar ─── */}
      <div className="m12-urgency">
        <span className="m12-urgency-icon">🔥</span>
        <span>Offre expire dans</span>
        <span className="m12-urgency-timer">{String(hh).padStart(2,"0")}:{String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}</span>
      </div>

      {/* ─── Hero ─── */}
      <section className="m12-hero" ref={heroRef} style={{ position: "relative" }}>
        {profileImageUrl ? (
          <div className="m12-avatar">
            <img src={profileImageUrl} alt={pseudo || ""} />
          </div>
        ) : null}
        {pseudo ? (
          <h1 className={`m12-pseudo ${pseudoAnimationClass(pseudoStyle)}`} style={nameStyle}>{pseudo}</h1>
        ) : null}
        <h2 className="m12-headline">Plus tu déposes, <em>plus ton bonus explose</em></h2>
      </section>

      {/* ─── Places restantes ─── */}
      <div className="m12-seats">
        <div className="m12-seats-top">
          <span className="m12-seats-top-label">Places restantes aujourd'hui</span>
          <span className="m12-seats-count">{seatsLeft} / {TOTAL_SEATS}</span>
        </div>
        <div className="m12-seats-track">
          <div className="m12-seats-fill" style={{ width: `${seatsPct}%` }} />
        </div>
      </div>

      {/* ─── Tiers grid ─── */}
      <section className="m12-tiers">
        <div className="m12-tiers-grid">
          {tiers.map((t) => {
            const bonus = Math.round(t.deposit * t.bonusMult);
            const received = t.deposit + bonus; // total avec bonus 100%
            return (
              <motion.button
                key={t.key}
                type="button"
                className={`m12-tier ${selectedKey === t.key ? "selected" : ""} ${t.vip ? "vip" : ""} ${t.highlight ? "highlight" : ""}`}
                onClick={() => onTierClick(t.key)}
                style={{ ["--tier-color" as any]: t.color }}
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -3 }}
              >
                {t.highlight ? <div className="m12-tier-badge">⭐ Recommandé</div> : null}
                {t.vip ? <div className="m12-tier-vip">VIP</div> : null}
                <div className="m12-tier-head">
                  <div className="m12-tier-icon">{t.icon}</div>
                  <p className="m12-tier-label">{t.label}</p>
                </div>
                <div className="m12-tier-dep">
                  Dépose
                  <span className="m12-tier-dep-amount">{t.deposit}€</span>
                </div>
                <div className="m12-tier-bonus">
                  <span className="m12-tier-bonus-label">Reçois</span>
                  {received}€
                </div>
                <div className="m12-tier-perks">
                  {t.perks.map((p, i) => <div key={i} className="m12-tier-perk">{p}</div>)}
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ─── CTA principal ─── */}
      <section className="m12-cta-wrap" style={{ ["--c-accent" as any]: selected.color }}>
        <div className="m12-cta-resume">
          <p className="m12-cta-resume-label">Ton choix</p>
          <p className="m12-cta-resume-line">
            Dépose <em>{selected.deposit}€</em> · Reçois <em>{selectedReceived}€</em>
          </p>
        </div>
        <V3MagneticButton
          href={safeAffi}
          onClick={V3_POPUP_ENABLED ? (e) => { e.preventDefault(); setPopupOpen(true); } : undefined}
          className="m12-cta v3-cta"
        >
          {selected.vip ? "DEVENIR VIP" : `RÉCLAMER MES ${selectedReceived}€`}
        </V3MagneticButton>
        <button
          type="button"
          className="m12-vip-teaser"
          onClick={() => vipRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
        >
          <span className="m12-vip-teaser-crown">👑</span>
          Tu es un gros joueur ? Accès VIP
          <span className="m12-vip-teaser-arrow">→</span>
        </button>
      </section>

      {/* ─── Trust strip (badges visuels) ─── */}
      <div className="m12-trust">
        <div className="m12-trust-item"><span className="m12-trust-icon">🛡️</span> Licence officielle</div>
        <div className="m12-trust-item"><span className="m12-trust-icon">🔒</span> Paiement sécurisé</div>
        <div className="m12-trust-item"><span className="m12-trust-icon">⚡</span> Retrait sous 24h</div>
        <div className="m12-trust-item"><span className="m12-trust-icon">👥</span> +12 000 joueurs</div>
      </div>

      {/* ─── VIP form section (toujours visible — capture meme sans clic Diamond) ─── */}
      <section className="m12-vip-section" ref={vipRef}>
        <V3InlineVipForm
          accent={T.accent}
          accentLight={T.accentLight}
          accentGlow={T.accentGlow}
          href={safeAffi}
          title={`Tu vises ${tiers[3].deposit}€+ par mois ?`}
          subtitle="Laisse ton email — un host VIP dédié te contacte sous 24h avec bonus exclusifs, cashback augmenté et suivi perso."
          ctaLabel="Réserver mon host VIP"
        />
      </section>

      <footer className="m12-footer">
        <p>
          Jeu réservé aux 18+. Les jeux d'argent comportent des risques.
          Aide : <strong>09 74 75 13 13</strong> · <strong>joueurs-info-service.fr</strong>
        </p>
      </footer>
      </div>

      <div className="m12-sticky">
        <a
          className="m12-sticky-cta v3-cta"
          href={safeAffi}
          target="_blank"
          rel="noopener noreferrer"
          onClick={V3_POPUP_ENABLED ? (e) => { e.preventDefault(); setPopupOpen(true); } : undefined}
        >
          {selected.vip ? "👑 DEVENIR VIP" : `🚀 RÉCLAMER ${selectedReceived}€`}
        </a>
      </div>

      {/* Popup conserve avec flag V3_POPUP_ENABLED — flippe pour reactiver l'experience reveal animee */}
      <V3OfferPopup
        open={V3_POPUP_ENABLED && popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={`+${selectedBonus}€`}
        depositAmount={`${selected.deposit}€`}
        bonusAmount={`${selectedBonus}€`}
        steps={["Validation du palier " + selected.label, "Préparation du bonus", "Lien d'inscription prêt"]}
        href={safeAffi}
        vipForced={isBigPlayer}
        vipFormTitle={isBigPlayer ? (
          <>👑 Palier {selected.label} — Tu es un <em style={{ color: T.accent, fontStyle: "normal" }}>gros joueur</em></>
        ) : undefined}
        vipFormSubtitle={isBigPlayer
          ? `Avec un dépôt de ${selected.deposit}€, on t'attribue automatiquement un host VIP dédié. Laisse ton email — il te contacte sous 24h avec une offre personnalisée.`
          : undefined
        }
      />

      {/* V3SocialProof retire de M12 : les toasts 'X a debloque' gachaient l'attention sur les paliers */}
      <V3PseudoKeyframes />
    </div>
  );
}
