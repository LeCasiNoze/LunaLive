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
import { motion, useScroll, useTransform } from "framer-motion";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { V3InlineVipForm } from "./V3InlineVipForm";
import { V3MeshBg, V3AuroraBg, V3GrainBg, V3Spotlight } from "./V3AmbientFx";
import { V3MagneticButton } from "./V3MagneticButton";
import { extendPalette } from "../lib/v3_palette";
import { pseudoTextStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

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
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M12ChatProps) {
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

  // Palier 1 (Bronze) base sur X/Y fournis. Si depositAmount est null, on
  // utilise un default raisonnable. Les autres paliers scalent depuis ce base.
  const baseDep = depositAmount ?? 20;
  const baseBon = bonusAmount ?? Math.round(baseDep * 1.5);
  const baseMult = baseBon / Math.max(baseDep, 1);

  const tiers: Tier[] = React.useMemo(() => ([
    {
      key: "bronze",
      label: "Bronze",
      icon: "🥉",
      deposit: baseDep,
      bonusMult: baseMult,
      perks: ["Bonus standard", "Inscription instantanée"],
      color: "#CD7F32",
    },
    {
      key: "silver",
      label: "Silver",
      icon: "🥈",
      deposit: Math.round(baseDep * 2.5),
      bonusMult: baseMult * 1.2,
      perks: ["Bonus boosté +20%", "20 free spins offerts"],
      color: "#C0C0C0",
    },
    {
      key: "gold",
      label: "Gold",
      icon: "🥇",
      deposit: Math.round(baseDep * 5),
      bonusMult: baseMult * 1.6,
      perks: ["Bonus XL +60%", "50 free spins", "Cashback 10%"],
      highlight: true,
      color: T.accent,
    },
    {
      key: "diamond",
      label: "Diamond VIP",
      icon: "💎",
      deposit: Math.round(baseDep * 25),
      bonusMult: baseMult * 2.5,
      perks: ["Bonus MAX +150%", "Free spins illimités", "Cashback 20%", "Host VIP dédié 24/7"],
      vip: true,
      color: "#B5FFFC",
    },
  ]), [baseDep, baseMult, T.accent]);

  const [selectedKey, setSelectedKey] = React.useState<string>("gold");
  const selected = tiers.find((t) => t.key === selectedKey) || tiers[2];
  const selectedBonus = Math.round(selected.deposit * selected.bonusMult);

  const [popupOpen, setPopupOpen] = React.useState(false);
  const onCta = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selected.vip) {
      // Diamond : scroll vers le form VIP, ne pas ouvrir popup
      vipRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPopupOpen(true);
  };

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

  const vipRef = React.useRef<HTMLDivElement>(null);
  const heroRef = React.useRef<HTMLElement>(null);
  const nameStyle = pseudoTextStyle(pseudoStyle, T.accent);

  // Parallax scroll : orbs behind hero
  const { scrollYProgress } = useScroll();
  const orbY1 = useTransform(scrollYProgress, [0, 1], [0, -180]);
  const orbY2 = useTransform(scrollYProgress, [0, 1], [0, 140]);

  return (
    <div className="m12-root">
      <style>{`
        .m12-root{position:relative;min-height:100vh;padding:0 0 160px;background:${T.bgPage};
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff;overflow-x:hidden;
          --c-accent:${T.accent};--c-light:${T.accentLight};--c-alt:${T.accentAlt};--c-hot:${T.accentHot};--c-glow:${T.accentGlow}}
        .m12-layer{position:relative;z-index:10}

        /* ─── Urgency bar top ─── */
        .m12-urgency{display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 16px;
          background:linear-gradient(90deg,${T.accent},${T.accentLight});color:#000;font-weight:800;font-size:.82rem;letter-spacing:.04em;text-align:center;
          box-shadow:0 4px 18px ${T.accentGlow};position:sticky;top:0;z-index:30}
        .m12-urgency-icon{animation:m12-pulse 1.4s ease-in-out infinite}
        .m12-urgency-timer{font-variant-numeric:tabular-nums;font-weight:900;letter-spacing:.06em;background:rgba(0,0,0,.18);padding:3px 9px;border-radius:6px}

        /* ─── Hero ─── */
        .m12-hero{padding:24px 18px 14px;max-width:460px;margin:0 auto;text-align:center}
        .m12-avatar{width:74px;height:74px;border-radius:50%;margin:0 auto 14px;overflow:hidden;border:2.5px solid ${T.accent};
          box-shadow:0 0 0 3px rgba(0,0,0,.4),0 12px 32px ${T.accentGlow};background:linear-gradient(135deg,${T.bgCard},${T.bgPage})}
        .m12-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m12-avatar-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:1.6rem;opacity:.4}
        .m12-pseudo{margin:0;line-height:1.1}
        .m12-pre{margin:14px 0 4px;font-size:.74rem;letter-spacing:.28em;text-transform:uppercase;opacity:.7}
        .m12-headline{margin:0;font-size:clamp(1.5rem,5.2vw,2rem);font-weight:900;letter-spacing:-.02em;line-height:1.15}
        .m12-headline em{font-style:normal;background:linear-gradient(180deg,${T.accent},${T.accentLight});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 14px ${T.accentGlow})}

        /* ─── Tiers grid ─── */
        .m12-tiers{padding:18px 16px 8px;max-width:520px;margin:0 auto}
        .m12-tiers-label{font-size:.7rem;letter-spacing:.3em;text-transform:uppercase;opacity:.55;text-align:center;margin:0 0 12px}
        .m12-tiers-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
        .m12-tier{position:relative;padding:18px 14px 16px;border-radius:18px;cursor:pointer;text-align:left;
          background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(0,0,0,.35));
          backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
          border:1.5px solid rgba(255,255,255,.08);transition:transform .2s cubic-bezier(.2,.7,.2,1),border-color .2s,box-shadow .2s,background .3s;
          overflow:hidden;display:flex;flex-direction:column;gap:8px;color:#fff;font-family:inherit}
        /* Conic-gradient border anime sur les paliers VIP / Highlight */
        .m12-tier.vip::before,.m12-tier.highlight::before{content:"";position:absolute;inset:-1px;border-radius:18px;padding:1.5px;pointer-events:none;
          background:conic-gradient(from var(--a,0deg),var(--tier-color),#fff,var(--tier-color));
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
          animation:m12-border-spin 5s linear infinite;opacity:.85}
        .m12-tier.vip{background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(0,0,0,.5))}
        @property --a{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes m12-border-spin{to{--a:360deg}}
        .m12-tier:hover{transform:translateY(-3px)}
        .m12-tier.selected{border-color:var(--tier-color);box-shadow:0 0 0 2px var(--tier-color)55,0 18px 50px var(--tier-color)44;
          background:linear-gradient(160deg,var(--tier-color)22,rgba(0,0,0,.4))}
        .m12-tier-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);padding:3px 10px;border-radius:999px;
          background:var(--tier-color);color:#000;font-size:.6rem;font-weight:900;letter-spacing:.18em;text-transform:uppercase;
          box-shadow:0 4px 14px var(--tier-color)80;white-space:nowrap}
        .m12-tier-vip{position:absolute;top:-10px;right:10px;padding:3px 8px;border-radius:6px;background:#fff;color:#000;font-size:.55rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
        .m12-tier-top{display:flex;align-items:center;gap:10px}
        .m12-tier-icon{font-size:1.6rem;line-height:1}
        .m12-tier-meta{flex:1;min-width:0}
        .m12-tier-label{margin:0;font-size:.92rem;font-weight:900;letter-spacing:.02em}
        .m12-tier-dep{margin:1px 0 0;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;opacity:.55}
        .m12-tier-bonus{font-size:1.8rem;font-weight:900;line-height:1;letter-spacing:-.02em;
          background:linear-gradient(180deg,#fff,var(--tier-color));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
        .m12-tier-bonus span{font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;opacity:.65;display:block;margin-top:2px;-webkit-text-fill-color:initial;color:rgba(255,255,255,.55)}
        .m12-tier-perks{display:flex;flex-direction:column;gap:3px;margin-top:auto}
        .m12-tier-perk{font-size:.7rem;opacity:.78;display:flex;align-items:center;gap:6px}
        .m12-tier-perk::before{content:"✓";color:var(--tier-color);font-weight:900;font-size:.78rem}

        /* ─── Selected resume + CTA ─── */
        .m12-cta-wrap{padding:18px 16px 10px;max-width:460px;margin:0 auto;text-align:center}
        .m12-cta-resume{padding:14px 16px;margin-bottom:12px;border-radius:14px;background:rgba(0,0,0,.4);border:1px solid var(--c-accent)55}
        .m12-cta-resume-label{font-size:.66rem;letter-spacing:.22em;text-transform:uppercase;opacity:.55;margin:0}
        .m12-cta-resume-line{margin:6px 0 0;font-size:1.02rem;font-weight:700}
        .m12-cta-resume-line em{font-style:normal;color:var(--c-accent);font-weight:900}
        .m12-cta{position:relative;display:flex;align-items:center;justify-content:center;width:100%;padding:20px;border-radius:18px;
          font-family:inherit;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 16px 38px ${T.accent}55,inset 0 1px 0 rgba(255,255,255,.5);
          animation:m12-breath 2.4s ease-in-out infinite;text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s}
        .m12-cta:active{transform:scale(.97)}
        .m12-cta::after{content:"→";margin-left:8px;font-size:1.2rem}
        .m12-cta-sub{margin:8px 0 0;font-size:.7rem;opacity:.6}

        /* ─── Trust strip ─── */
        .m12-trust{padding:16px;max-width:460px;margin:0 auto;display:flex;justify-content:center;gap:18px;flex-wrap:wrap}
        .m12-trust-item{display:flex;align-items:center;gap:6px;font-size:.66rem;opacity:.68;letter-spacing:.04em}
        .m12-trust-item::before{content:"";width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399}

        /* ─── VIP form section ─── */
        .m12-vip-section{padding:24px 16px;max-width:480px;margin:0 auto}

        /* ─── Footer ─── */
        .m12-footer{padding:20px 22px 10px;text-align:center;opacity:.5;font-size:.66rem;line-height:1.7;max-width:460px;margin:0 auto}
        .m12-footer strong{color:#fff;font-weight:700}

        /* ─── Parallax orbs hero ─── */
        .m12-orb{position:absolute;border-radius:50%;filter:blur(60px);pointer-events:none;opacity:.5;z-index:1}
        .m12-orb-1{width:260px;height:260px;background:${T.accent};top:8%;left:-12%}
        .m12-orb-2{width:200px;height:200px;background:${T.accentAlt};top:30%;right:-10%;opacity:.4}

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

      {/* ─── Couches ambient (mesh + aurora + grain) ─── */}
      <V3MeshBg colors={{ accent: T.accent, accentLight: T.accentLight, accentAlt: T.accentAlt, accentHot: T.accentHot }} />
      <V3AuroraBg colors={{ accent: T.accent, accentLight: T.accentLight, accentAlt: T.accentAlt, accentHot: T.accentHot }} opacity={0.35} />
      <V3GrainBg opacity={0.05} />

      <div className="m12-layer">
      {/* ─── Urgency bar ─── */}
      <div className="m12-urgency">
        <span className="m12-urgency-icon">🔥</span>
        <span>Offre expire dans</span>
        <span className="m12-urgency-timer">{String(hh).padStart(2,"0")}:{String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}</span>
      </div>

      {/* ─── Hero ─── */}
      <section className="m12-hero" ref={heroRef} style={{ position: "relative" }}>
        <V3Spotlight accent={T.accent} accentAlt={T.accentAlt} intensity={0.5} size={420} />
        <motion.div className="m12-orb m12-orb-1" style={{ y: orbY1 }} />
        <motion.div className="m12-orb m12-orb-2" style={{ y: orbY2 }} />
        <div className="m12-avatar">
          {profileImageUrl ? <img src={profileImageUrl} alt={pseudo || ""} /> : <div className="m12-avatar-empty">👤</div>}
        </div>
        {pseudo ? <h1 className="m12-pseudo" style={nameStyle}>{pseudo}</h1> : null}
        <p className="m12-pre">Choisis ton palier</p>
        <h2 className="m12-headline">Plus tu déposes,<br /><em>plus ton bonus explose</em></h2>
      </section>

      {/* ─── Tiers grid ─── */}
      <section className="m12-tiers">
        <p className="m12-tiers-label">— Sélectionne ton bonus —</p>
        <div className="m12-tiers-grid">
          {tiers.map((t) => {
            const bonus = Math.round(t.deposit * t.bonusMult);
            return (
              <motion.button
                key={t.key}
                type="button"
                className={`m12-tier ${selectedKey === t.key ? "selected" : ""}`}
                onClick={() => setSelectedKey(t.key)}
                style={{ ["--tier-color" as any]: t.color }}
                whileTap={{ scale: 0.97 }}
              >
                {t.highlight ? <div className="m12-tier-badge">⭐ Recommandé</div> : null}
                {t.vip ? <div className="m12-tier-vip">VIP</div> : null}
                <div className="m12-tier-top">
                  <div className="m12-tier-icon">{t.icon}</div>
                  <div className="m12-tier-meta">
                    <p className="m12-tier-label">{t.label}</p>
                    <p className="m12-tier-dep">Dépose {t.deposit}€</p>
                  </div>
                </div>
                <div className="m12-tier-bonus">
                  +{bonus}€
                  <span>de bonus offert</span>
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
            Dépose <em>{selected.deposit}€</em> · Reçois <em>+{selectedBonus}€</em>
          </p>
        </div>
        <a className="m12-cta v3-cta" href={safeAffi} onClick={onCta}>
          {selected.vip ? "DEVENIR VIP" : `RÉCLAMER MES ${selectedBonus}€`}
        </a>
        <p className="m12-cta-sub">Inscription en 30s · Bonus crédité instantanément</p>
      </section>

      {/* ─── Trust strip ─── */}
      <div className="m12-trust">
        <div className="m12-trust-item">Licence officielle</div>
        <div className="m12-trust-item">Paiement sécurisé</div>
        <div className="m12-trust-item">Retrait sous 24h</div>
        <div className="m12-trust-item">+ 12 000 joueurs</div>
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

      <div className="m12-sticky">
        <a className="m12-sticky-cta v3-cta" href={safeAffi} onClick={onCta}>
          {selected.vip ? "👑 DEVENIR VIP" : `🚀 RÉCLAMER +${selectedBonus}€`}
        </a>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={`+${selectedBonus}€`}
        depositAmount={`${selected.deposit}€`}
        bonusAmount={`${selectedBonus}€`}
        steps={["Validation du palier " + selected.label, "Préparation du bonus", "Lien d'inscription prêt"]}
        href={safeAffi}
      />

      <V3SocialProof accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
