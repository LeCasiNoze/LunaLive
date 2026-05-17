// ─────────────────────────────────────────────────────────────────────────────
// M11 — "Aurix" : landing premium tout-effets, vitrine technique V3.
//
// Stack : Framer Motion + Lenis smooth scroll + CSS shaders (mesh gradient
// animé, aurora beams, conic spotlight) + IntersectionObserver pour reveals
// + magnetic CTA (mousemove) + animated counters + accordion FAQ animé.
//
// Architecture : pleine page statique, conversion-driven. CTA → popup V3.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
  useMotionValue,
  AnimatePresence,
} from "framer-motion";
import Lenis from "lenis";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { extendPalette } from "../lib/v3_palette";
import { pseudoTextStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

export type M11AurixProps = {
  pseudo?: string;
  pseudoSub?: string;
  profileImageUrl?: string;
  followersCount?: string;
  socialHandle?: string;
  gameImageUrl?: string;
  gameLabel?: string;
  gameBonusPct?: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  affiLink: string;
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgPage?: string;
    bgCard?: string;
  };
  /** Style du pseudo (font / color / size / weight / glow). */
  pseudoStyle?: V3LineStyleLike;
  onEditField?: (field: M11EditField) => void;
};

export type M11EditField =
  | "pseudo"
  | "pseudoSub"
  | "profileImageUrl"
  | "socialHandle"
  | "followersCount"
  | "depositAmount"
  | "bonusAmount"
  | "gameImageUrl"
  | "gameBonusPct"
  | "affiLink";

const DEFAULT_FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Comment je touche mon bonus ?",
    a: "Clic, inscription en 30 secondes, dépôt — bonus crédité instantanément. Aucune validation manuelle.",
  },
  {
    q: "Mes gains sont retirables ?",
    a: "Oui. Retrait virement / crypto disponible dès que les conditions de mise sont validées.",
  },
  {
    q: "C'est sécurisé ?",
    a: "Plateforme licenciée. Données chiffrées bout-en-bout. Réservé aux 18+, jeu responsable activé.",
  },
];

const FAKE_GAINS = [
  { name: "Léa",     amount: "+1 487€", time: "il y a 2 min"  },
  { name: "Mehdi",   amount: "+2 480€", time: "il y a 4 min"  },
  { name: "Naël",    amount: "+5 120€", time: "il y a 6 min"  },
  { name: "Sofiane", amount: "+780€",   time: "il y a 8 min"  },
  { name: "Inès",    amount: "+1 240€", time: "il y a 11 min" },
  { name: "Yanis",   amount: "+3 650€", time: "il y a 13 min" },
  { name: "Camille", amount: "+920€",   time: "il y a 16 min" },
  { name: "Rayan",   amount: "+4 310€", time: "il y a 19 min" },
];

const TRUST_STATS = [
  { value: 12847, label: "Joueurs actifs", suffix: "" },
  { value: 98,    label: "Satisfaction",   suffix: "%" },
  { value: 24,    label: "Support h/24",   suffix: "/7" },
];

const POPUP_STEPS = [
  "Vérification du bonus",
  "Allocation des fonds",
  "Lien d'inscription prêt",
] as const;

// ─── Hook : compteur animé quand visible ─────────────────────────────────────
function useCountUp(target: number, inView: boolean, duration = 1800): number {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, inView, duration]);
  return value;
}

// ─── Magnetic CTA : le bouton suit légèrement le curseur ─────────────────────
function MagneticButton({
  href,
  onClick,
  children,
  className,
}: {
  href: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 18 });
  const sy = useSpring(y, { stiffness: 200, damping: 18 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    x.set(dx * 0.18);
    y.set(dy * 0.22);
  };
  const onLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.a
      ref={ref}
      href={href}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy }}
      className={className}
    >
      {children}
    </motion.a>
  );
}

export function M11Aurix({
  pseudo,
  pseudoSub,
  profileImageUrl,
  followersCount,
  socialHandle,
  gameImageUrl,
  gameLabel,
  gameBonusPct,
  depositAmount,
  bonusAmount,
  affiLink,
  theme,
  pseudoStyle,
  onEditField,
}: M11AurixProps) {
  void onEditField;

  // Palette Aurix derivee du theme M1 (or / rubis / emeraude / saphir ...).
  // accent1/2/3 = trio aurora derive (accent + accentLight + complementaire HSL).
  const P = extendPalette(theme, "#7C3AED");
  const C = {
    accent1:   P.accent,
    accent2:   P.accentLight,
    accent3:   P.accentAlt,
    accentHot: P.accentHot,
    bgDeep:    P.bgPage,
    bgCard:    P.bgCard,
    glow:      P.glow,
  };

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardScore = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus 100%");
  const popupSteps = React.useMemo(() => Array.from(POPUP_STEPS), []);

  const [popupOpen, setPopupOpen] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const heroRef = React.useRef<HTMLDivElement>(null);
  const statsRef = React.useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, margin: "-80px" });

  // Mouse tracking pour spotlight hero
  const mx = useMotionValue(50);
  const my = useMotionValue(30);
  const smx = useSpring(mx, { stiffness: 60, damping: 20 });
  const smy = useSpring(my, { stiffness: 60, damping: 20 });

  // Scroll-driven parallax pour hero
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroScale  = useTransform(scrollYProgress, [0, 1], [1, 0.85]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.3]);
  const orbY = useTransform(scrollYProgress, [0, 1], [0, -180]);

  // Lenis : desactive (interferait avec scroll molette dans preview editeur).
  // Le scroll natif suffit, les animations Framer Motion utilisent useScroll
  // qui fonctionne avec le scroll natif.
  void Lenis;

  // Mouse move sur hero pour spotlight
  const onHeroMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

  const onCtaClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setPopupOpen(true);
  };

  const gainsLoop = React.useMemo(() => [...FAKE_GAINS, ...FAKE_GAINS], []);

  return (
    <div className="m11-root" ref={rootRef}>
      <style>{`
        .m11-root{position:relative;min-height:100vh;overflow-x:hidden;background:${C.bgDeep};
          font-family:'Inter','Space Grotesk',-apple-system,sans-serif;color:#fff;padding-bottom:140px;
          --c1:${C.accent1};--c2:${C.accent2};--c3:${C.accent3};--glow:${C.glow}}

        /* ─── Mesh gradient animé (couche bg fixe) ─── */
        .m11-mesh{position:fixed;inset:-20%;z-index:0;pointer-events:none;
          background:
            radial-gradient(45% 35% at 20% 30%, ${C.accent1}55 0%, transparent 60%),
            radial-gradient(40% 30% at 80% 20%, ${C.accent2}40 0%, transparent 60%),
            radial-gradient(50% 40% at 60% 80%, ${C.accent3}45 0%, transparent 60%),
            radial-gradient(30% 25% at 30% 70%, ${C.accentHot}35 0%, transparent 60%);
          filter:blur(40px) saturate(1.3);
          animation:m11-mesh 18s ease-in-out infinite alternate}

        /* ─── Aurora beams (SVG-like via gradients diagonaux) ─── */
        .m11-aurora{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;opacity:.55}
        .m11-aurora::before,.m11-aurora::after{content:"";position:absolute;width:180%;height:80px;left:-40%;
          background:linear-gradient(90deg,transparent 0%,${C.accent1}aa 30%,${C.accent2}aa 50%,${C.accent3}aa 70%,transparent 100%);
          filter:blur(30px);transform-origin:center;animation:m11-aurora 12s ease-in-out infinite}
        .m11-aurora::before{top:15%;animation-delay:-2s}
        .m11-aurora::after{top:60%;animation-delay:-7s;height:60px;opacity:.7}

        /* ─── Grain subtil (texture) ─── */
        .m11-grain{position:fixed;inset:0;z-index:2;pointer-events:none;opacity:.06;mix-blend-mode:overlay;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>")}

        .m11-layer{position:relative;z-index:10}

        /* ─── HERO ─── */
        .m11-hero{position:relative;width:100%;min-height:auto;padding:24px 20px 28px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;overflow:hidden}
        .m11-hero-spotlight{position:absolute;inset:0;pointer-events:none;
          background:radial-gradient(420px 420px at var(--mx,50%) var(--my,30%), ${C.accent1}55 0%, ${C.accent3}33 30%, transparent 70%);
          mix-blend-mode:screen;transition:opacity .3s}

        /* Avatar avec halo conique + pulse */
        .m11-avatar-wrap{position:relative;width:110px;height:110px;margin-bottom:24px}
        .m11-avatar-ring{position:absolute;inset:-14px;border-radius:50%;
          background:conic-gradient(from 0deg,${C.accent1},${C.accent2},${C.accent3},${C.accent1});
          filter:blur(12px);opacity:.95;animation:m11-spin 6s linear infinite}
        .m11-avatar-ring::after{content:"";position:absolute;inset:8px;border-radius:50%;background:${C.bgDeep};filter:blur(0)}
        .m11-avatar{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;border:2.5px solid #fff;
          box-shadow:0 0 0 3px ${C.accent1}cc, 0 0 60px ${C.accent3}99, 0 20px 50px ${C.glow};
          background:linear-gradient(135deg,${C.bgCard},${C.bgDeep})}
        .m11-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m11-avatar-empty{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:2.6rem;color:rgba(255,255,255,.3)}

        /* Pseudo : énorme shimmer text avec gradient traveling */
        .m11-pseudo{margin:0;line-height:.95;font-size:clamp(2.6rem,9vw,4.4rem);font-weight:900;letter-spacing:-.04em;
          background:linear-gradient(110deg,#fff 0%,${C.accent2} 25%,#fff 40%,${C.accent3} 55%,#fff 70%,${C.accent1} 85%,#fff 100%);
          background-size:300% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 24px ${C.accent1}80);
          animation:m11-shimmer 6s linear infinite}
        .m11-pseudo-sub{margin:8px 0 0;font-size:.78rem;font-weight:700;letter-spacing:.32em;text-transform:uppercase;
          color:#fff;opacity:.7;text-shadow:0 0 18px ${C.accent2}99}

        /* Pill social — glassmorphism */
        .m11-pill{margin-top:16px;display:inline-flex;align-items:center;gap:10px;padding:8px 16px;border-radius:999px;
          background:rgba(255,255,255,.06);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
          border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 24px ${C.glow}33;
          font-size:.78rem;font-weight:600;color:#fff}
        .m11-pill-dot{width:5px;height:5px;border-radius:50%;background:${C.accent2};box-shadow:0 0 10px ${C.accent2}}
        .m11-pill em{font-style:normal;font-size:.62rem;letter-spacing:.18em;opacity:.6;margin-left:4px}

        /* Hero card jeu — gros, glassmorphic, hover tilt 3D */
        .m11-hero-card-wrap{margin-top:36px;width:100%;max-width:400px;perspective:1000px}
        .m11-hero-card{position:relative;display:block;width:100%;border-radius:32px;overflow:hidden;cursor:pointer;
          background:linear-gradient(135deg,${C.bgCard},${C.bgDeep});
          border:1.5px solid rgba(255,255,255,.1);
          box-shadow:
            0 30px 80px ${C.accent1}66,
            0 0 100px ${C.accent3}40,
            0 0 0 1px rgba(255,255,255,.06) inset,
            0 1px 0 rgba(255,255,255,.18) inset;
          transition:transform .3s cubic-bezier(.2,.7,.2,1)}
        .m11-hero-card:hover{transform:translateY(-6px) rotateX(2deg)}
        .m11-hero-card::before{content:"";position:absolute;inset:-1px;border-radius:32px;padding:1.5px;pointer-events:none;
          background:conic-gradient(from var(--a,0deg),${C.accent1},${C.accent2},${C.accent3},${C.accent1});
          -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
          animation:m11-border-spin 4s linear infinite}
        @property --a{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes m11-border-spin{to{--a:360deg}}

        .m11-hero-sticker{position:absolute;top:14px;left:14px;padding:8px 14px;border-radius:999px;
          background:rgba(255,255,255,.95);color:${C.accent1};font-weight:800;font-size:.72rem;letter-spacing:.12em;
          box-shadow:0 6px 20px ${C.glow};transform:rotate(-5deg);z-index:3}
        .m11-hero-img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
        .m11-hero-placeholder{width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font-size:4rem;
          color:rgba(255,255,255,.25);background:radial-gradient(circle at 50% 40%,${C.accent1}40,transparent 60%)}
        .m11-hero-overlay{position:absolute;left:0;right:0;bottom:0;padding:64px 22px 26px;text-align:center;pointer-events:none;
          background:linear-gradient(to top,rgba(5,6,15,.97) 0%,rgba(5,6,15,.78) 55%,transparent 100%)}
        .m11-hero-pre{margin:0;font-size:.72rem;font-weight:700;letter-spacing:.22em;opacity:.85;color:#fff}
        .m11-hero-prize{margin:6px 0 0;line-height:1;font-size:2.8rem;font-weight:900;letter-spacing:-.03em;
          background:linear-gradient(180deg,#fff 0%,${C.accent2} 50%,${C.accent3} 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 16px ${C.accent3}80)}
        .m11-hero-sub{margin:8px 0 0;font-size:.7rem;font-weight:600;letter-spacing:.1em;color:rgba(255,255,255,.65)}

        /* Floating orbs (parallax) */
        .m11-orb{position:absolute;border-radius:50%;filter:blur(50px);pointer-events:none;opacity:.5}
        .m11-orb-1{width:280px;height:280px;background:${C.accent1};top:8%;left:-10%}
        .m11-orb-2{width:200px;height:200px;background:${C.accent3};top:30%;right:-8%}
        .m11-orb-3{width:240px;height:240px;background:${C.accent2};bottom:5%;left:30%;opacity:.35}

        /* ─── STATS ─── */
        .m11-stats{padding:40px 20px;max-width:780px;margin:0 auto}
        .m11-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .m11-stat{position:relative;padding:22px 12px;border-radius:20px;text-align:center;
          background:rgba(255,255,255,.04);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
          border:1px solid rgba(255,255,255,.08);overflow:hidden}
        .m11-stat::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,${C.accent1}15,transparent 60%);pointer-events:none}
        .m11-stat-val{font-size:clamp(1.6rem,5vw,2.2rem);font-weight:900;letter-spacing:-.03em;
          background:linear-gradient(180deg,#fff,${C.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
        .m11-stat-label{margin-top:4px;font-size:.66rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.65}

        /* ─── GAINS FEED ─── */
        .m11-gains{padding:40px 20px;max-width:420px;margin:0 auto}
        .m11-section-title{position:relative;text-align:center;margin:0 0 22px;font-size:1.3rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;
          background:linear-gradient(180deg,#fff,${C.accent3});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 0 20px ${C.accent3}66)}
        .m11-section-title::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:${C.accentHot};box-shadow:0 0 12px ${C.accentHot};margin-right:10px;vertical-align:middle;animation:m11-blink 1.4s ease-in-out infinite;-webkit-text-fill-color:initial}
        .m11-gains-scroll{position:relative;height:280px;overflow:hidden;
          mask-image:linear-gradient(to bottom,transparent 0%,#000 12%,#000 88%,transparent 100%);
          -webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 12%,#000 88%,transparent 100%)}
        .m11-gains-list{display:flex;flex-direction:column;gap:10px;animation:m11-scroll 26s linear infinite}
        .m11-gain-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:18px;
          background:rgba(255,255,255,.04);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 20px rgba(0,0,0,.4)}
        .m11-gain-ava{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;
          background:linear-gradient(135deg,${C.accent1},${C.accent3});border:1.5px solid rgba(255,255,255,.9);font-size:.9rem}
        .m11-gain-info{flex:1;min-width:0}
        .m11-gain-name{margin:0;font-size:.88rem;font-weight:700}
        .m11-gain-time{margin:2px 0 0;font-size:.66rem;opacity:.55}
        .m11-gain-amount{font-size:1.05rem;font-weight:900;letter-spacing:-.02em;
          background:linear-gradient(180deg,${C.accent2},${C.accent3});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}

        /* ─── FAQ ─── */
        .m11-faq{padding:40px 20px 16px;max-width:420px;margin:0 auto}
        .m11-faq-item{margin-bottom:10px;border-radius:18px;overflow:hidden;
          background:rgba(255,255,255,.03);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border:1px solid rgba(255,255,255,.07);transition:border-color .25s}
        .m11-faq-item.open{border-color:${C.accent1}66;box-shadow:0 0 0 1px ${C.accent1}40, 0 8px 30px ${C.glow}40}
        .m11-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 18px;
          background:transparent;border:none;color:#fff;font:inherit;font-weight:700;font-size:.92rem;text-align:left;cursor:pointer}
        .m11-faq-q-icon{font-size:1rem;color:${C.accent2};transition:transform .3s cubic-bezier(.2,.7,.2,1);flex-shrink:0;margin-left:12px}
        .m11-faq-item.open .m11-faq-q-icon{transform:rotate(180deg)}
        .m11-faq-a{padding:0 18px 16px;font-size:.86rem;opacity:.75;line-height:1.55}

        /* ─── FINAL CTA ─── */
        .m11-final{padding:40px 20px 20px;max-width:420px;margin:0 auto;text-align:center}
        .m11-cta{position:relative;display:inline-flex;align-items:center;justify-content:center;width:100%;padding:22px 28px;border-radius:20px;
          font-size:1.15rem;font-weight:900;letter-spacing:.04em;color:#fff;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${C.accent1} 0%,${C.accent3} 50%,${C.accentHot} 100%);
          box-shadow:0 0 40px ${C.accent1}80, 0 16px 40px ${C.accent3}66, inset 0 1px 0 rgba(255,255,255,.4);
          text-shadow:0 2px 0 rgba(0,0,0,.3);
          transition:box-shadow .3s, transform .12s}
        .m11-cta:hover{box-shadow:0 0 60px ${C.accent1}cc, 0 20px 50px ${C.accent3}99, inset 0 1px 0 rgba(255,255,255,.5)}
        .m11-cta:active{transform:scale(.97)}
        .m11-cta::after{content:"";position:absolute;inset:0;border-radius:20px;pointer-events:none;
          background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);
          background-size:200% 100%;animation:m11-shine 3.2s linear infinite;mix-blend-mode:overlay}
        .m11-cta-sub{margin-top:12px;font-size:.74rem;font-weight:600;opacity:.7}

        /* ─── STICKY mobile ─── */
        .m11-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:14px 16px 18px;
          background:linear-gradient(to top,${C.bgDeep} 50%,${C.bgDeep}dd 85%,transparent)}
        .m11-sticky-cta{position:relative;display:flex;align-items:center;justify-content:center;width:100%;max-width:400px;margin:0 auto;padding:18px;border-radius:18px;
          font-size:1.05rem;font-weight:900;letter-spacing:.05em;color:#fff;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${C.accent1} 0%,${C.accent3} 100%);
          box-shadow:0 0 36px ${C.accent1}b0, 0 14px 36px ${C.accent3}73, inset 0 1px 0 rgba(255,255,255,.4);
          animation:m11-breath 2.6s ease-in-out infinite}

        /* ─── FOOTER ─── */
        .m11-footer{padding:30px 20px 32px;text-align:center;opacity:.6;font-size:.7rem;line-height:1.6;max-width:520px;margin:0 auto}
        .m11-footer strong{color:#fff;font-weight:700}

        /* ─── Reveal helpers ─── */
        .m11-reveal{opacity:0;transform:translateY(24px);transition:opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1)}
        .m11-reveal.in{opacity:1;transform:none}

        /* ─── Animations keyframes ─── */
        @keyframes m11-spin{to{transform:rotate(360deg)}}
        @keyframes m11-mesh{0%{transform:translate(0,0) scale(1)}50%{transform:translate(3%,-2%) scale(1.05)}100%{transform:translate(-2%,3%) scale(1.02)}}
        @keyframes m11-aurora{0%,100%{transform:translateX(-10%) rotate(-8deg)}50%{transform:translateX(10%) rotate(-4deg)}}
        @keyframes m11-shimmer{to{background-position:300% 0}}
        @keyframes m11-blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes m11-scroll{to{transform:translateY(-50%)}}
        @keyframes m11-shine{to{background-position:-200% 0}}
        @keyframes m11-breath{0%,100%{box-shadow:0 0 36px ${C.accent1}b0,0 14px 36px ${C.accent3}73,inset 0 1px 0 rgba(255,255,255,.4)}50%{box-shadow:0 0 60px ${C.accent1}f0,0 14px 36px ${C.accent3}aa,inset 0 1px 0 rgba(255,255,255,.55)}}

        @media (prefers-reduced-motion:reduce){
          .m11-mesh,.m11-aurora::before,.m11-aurora::after,.m11-avatar-ring,.m11-pseudo,
          .m11-gains-list,.m11-sticky-cta,.m11-cta::after,.m11-hero-card::before{animation:none !important}
          .m11-reveal{opacity:1;transform:none;transition:none}
        }
      `}</style>

      {/* Couches background */}
      <div className="m11-mesh" />
      <div className="m11-aurora" />
      <div className="m11-grain" />

      <div className="m11-layer">
        {/* ─── HERO ─── */}
        <section
          className="m11-hero"
          ref={heroRef}
          onMouseMove={onHeroMove}
          style={{ ["--mx" as any]: undefined }}
        >
          {/* Spotlight curseur */}
          <motion.div
            className="m11-hero-spotlight"
            style={{
              ["--mx" as any]: useTransform(smx, (v) => `${v}%`),
              ["--my" as any]: useTransform(smy, (v) => `${v}%`),
            } as any}
          />

          {/* Orbs parallax */}
          <motion.div className="m11-orb m11-orb-1" style={{ y: orbY }} />
          <motion.div className="m11-orb m11-orb-2" style={{ y: useTransform(scrollYProgress, [0, 1], [0, 140]) }} />
          <motion.div className="m11-orb m11-orb-3" style={{ y: useTransform(scrollYProgress, [0, 1], [0, -100]) }} />

          <motion.div style={{ scale: heroScale, opacity: heroOpacity, position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Avatar */}
            <motion.div
              className="m11-avatar-wrap"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <div className="m11-avatar-ring" />
              <div className="m11-avatar">
                {profileImageUrl ? (
                  <img src={profileImageUrl} alt={pseudo || "Avatar"} />
                ) : (
                  <div className="m11-avatar-empty">👤</div>
                )}
              </div>
            </motion.div>

            {pseudo ? (
              <motion.h1
                className="m11-pseudo"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
                style={pseudoStyle?.color || pseudoStyle?.font ? {
                  fontFamily: pseudoStyle.font ? `"${pseudoStyle.font}", Inter, sans-serif` : undefined,
                  background: pseudoStyle.color ? "none" : undefined,
                  WebkitBackgroundClip: pseudoStyle.color ? ("border-box" as any) : undefined,
                  WebkitTextFillColor: pseudoStyle.color || undefined,
                  color: pseudoStyle.color || undefined,
                  filter: pseudoStyle.glow ? `drop-shadow(0 0 18px ${pseudoStyle.color || C.accent1}99)` : undefined,
                  animation: pseudoStyle.color ? "none" : undefined,
                } : undefined}
              >
                {pseudo}
              </motion.h1>
            ) : null}

            {pseudoSub ? (
              <motion.div
                className="m11-pseudo-sub"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 0.7, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4 }}
              >
                {pseudoSub}
              </motion.div>
            ) : null}

            {(socialHandle || followersCount) ? (
              <motion.div
                className="m11-pill"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.55 }}
              >
                <span className="m11-pill-dot" />
                {socialHandle ? <span>{socialHandle}</span> : null}
                {followersCount ? (
                  <span>{followersCount}<em>FOLLOWERS</em></span>
                ) : null}
              </motion.div>
            ) : null}

            {/* Hero card */}
            <motion.div
              className="m11-hero-card-wrap"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <a className="m11-hero-card v3-cta" href={safeAffi} onClick={onCtaClick}>
                {gameImageUrl ? (
                  <img className="m11-hero-img" src={gameImageUrl} alt="Jeu bonus" />
                ) : (
                  <div className="m11-hero-placeholder">🎰</div>
                )}
                {gameLabel ? <div className="m11-hero-sticker">{gameLabel}</div> : null}
                <div className="m11-hero-overlay">
                  <p className="m11-hero-pre">{dep ? `DÉPOSE ${dep} → REÇOIS` : "RÉCLAME TON BONUS"}</p>
                  <p className="m11-hero-prize">{bon ? `${bon} GRATUITS` : "BONUS"}</p>
                  {gameBonusPct ? <p className="m11-hero-sub">+ {gameBonusPct} bonus inclus</p> : null}
                </div>
              </a>
            </motion.div>
          </motion.div>
        </section>

        {/* ─── STATS ─── */}
        <section className="m11-stats" ref={statsRef}>
          <div className="m11-stats-grid">
            {TRUST_STATS.map((s, i) => (
              <StatCard key={i} target={s.value} label={s.label} suffix={s.suffix} inView={statsInView} delay={i * 0.12} />
            ))}
          </div>
        </section>

        {/* ─── GAINS FEED ─── */}
        <Reveal>
          <section className="m11-gains">
            <h2 className="m11-section-title">GAINS EN DIRECT</h2>
            <div className="m11-gains-scroll">
              <div className="m11-gains-list">
                {gainsLoop.map((g, i) => (
                  <div key={i} className="m11-gain-row">
                    <div className="m11-gain-ava">{g.name[0]}</div>
                    <div className="m11-gain-info">
                      <p className="m11-gain-name">{g.name}</p>
                      <p className="m11-gain-time">{g.time}</p>
                    </div>
                    <div className="m11-gain-amount">{g.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* ─── FAQ ─── */}
        <Reveal>
          <section className="m11-faq">
            <h2 className="m11-section-title">QUESTIONS</h2>
            {DEFAULT_FAQS.map((f, i) => (
              <div key={i} className={`m11-faq-item ${openFaq === i ? "open" : ""}`}>
                <button
                  type="button"
                  className="m11-faq-q"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span>{f.q}</span>
                  <span className="m11-faq-q-icon">▾</span>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i ? (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="m11-faq-a">{f.a}</div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            ))}
          </section>
        </Reveal>

        {/* ─── FINAL CTA ─── */}
        <Reveal>
          <section className="m11-final">
            <MagneticButton href={safeAffi} onClick={onCtaClick} className="m11-cta v3-cta">
              🚀 JE PRENDS {bon ? `MES ${bon}` : "MON BONUS"}
            </MagneticButton>
            <p className="m11-cta-sub">Inscription en 30s · Crédit instantané</p>
          </section>
        </Reveal>

        {/* ─── FOOTER ─── */}
        <footer className="m11-footer">
          <p>
            Jeu réservé aux 18+. Les jeux d'argent et de hasard sont strictement interdits aux mineurs.
            Jouer comporte des risques : endettement, isolement, dépendance.
          </p>
          <p>
            Aide : <strong>09 74 75 13 13</strong> (appel non surtaxé) ·{" "}
            <strong>joueurs-info-service.fr</strong>
          </p>
          <p style={{ marginTop: 10, opacity: 0.6 }}>
            © {new Date().getFullYear()} — Page affiliée. Contient des liens commerciaux.
          </p>
        </footer>
      </div>

      {/* Sticky mobile */}
      <div className="m11-sticky">
        <a className="m11-sticky-cta v3-cta" href={safeAffi} onClick={onCtaClick}>
          🚀 JE PRENDS {bon ? `MES ${bon}` : "MON BONUS"}
        </a>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: C.accent1, accentLight: C.accent2, accentGlow: C.glow, bgCard: C.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof accent={C.accent2} accentGlow={C.glow} />
    </div>
  );
}

// ─── Composants internes ─────────────────────────────────────────────────────

function StatCard({
  target, label, suffix, inView, delay,
}: { target: number; label: string; suffix: string; inView: boolean; delay: number }) {
  const value = useCountUp(target, inView);
  return (
    <motion.div
      className="m11-stat"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className="m11-stat-val">{value.toLocaleString("fr-FR")}{suffix}</div>
      <div className="m11-stat-label">{label}</div>
    </motion.div>
  );
}

function Reveal({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className={`m11-reveal ${inView ? "in" : ""}`}>
      {children}
    </div>
  );
}
