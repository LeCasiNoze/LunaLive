// ─────────────────────────────────────────────────────────────────────────────
// S1 — Celsius Casino landing premium pour promotion X (Twitter)
//
// Mini-site bilingue FR/EN qui presente :
//   - Welcome package (4 paliers depot OR sportbets)
//   - Avantages (lossback, events, freespins, support, withdraw, KYC, paiements)
//   - VIP Program (host VIP dedie)
//   - FAQ + final CTA
//
// Ambiance Lovable : mesh gradient + aurora beams, polices Bagel Fat One /
// Space Grotesk, glassmorphism, magnetic CTA, count-up, reveal on scroll.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useScroll, useTransform, useInView, useMotionValue, useSpring, useMotionValueEvent } from "framer-motion";
import { V3SocialProof } from "../components/V3SocialProof";

// ─── i18n ───────────────────────────────────────────────────────────────────

type Lang = "fr" | "en";
const STRINGS = {
  fr: {
    badgeTop: "INVITATION VIP · ACCÈS PROMOTIONNEL X",
    h1Line1: "+500€",
    h1Line2: "+ 150 free spins",
    h1Sub: "offerts dès le premier dépôt sur Celsius",
    heroCta: "🎁 Je réclame mes bonus",
    heroSub: "Inscription en 30s · Sans KYC · Retrait instantané 24/7",
    welcomeTitle: "Welcome Package",
    welcomeSub: "4 paliers cumulables, jusqu'à 2 000€ + 250 FS",
    sectionCasino: "🎰 Casino",
    sectionSport: "⚽ Paris sportifs",
    or: "ou",
    paliersCasino: [
      { tag: "1er dépôt", bonus: "100% jusqu'à 500€", fs: "+ 150 FS", wager: "wager x40" },
      { tag: "2e dépôt", bonus: "100% jusqu'à 300€", fs: "+ 50 FS", wager: "wager x40" },
      { tag: "3e dépôt", bonus: "200% jusqu'à 200€", fs: "+ 50 FS", wager: "wager x45" },
      { tag: "4e dépôt", bonus: "150% jusqu'à 1 000€", fs: "", wager: "wager x45" },
    ],
    paliersSport: [
      { tag: "1er dépôt", bonus: "50% en freebets", fs: "jusqu'à 200€", wager: "" },
      { tag: "2e dépôt", bonus: "20% NoRisk freebets", fs: "jusqu'à 500€", wager: "wager x3" },
    ],
    benefitsTitle: "Pourquoi Celsius",
    benefits: [
      { icon: "💸", title: "Lossback 35%", text: "Récupère jusqu'à 35% de tes pertes" },
      { icon: "🎯", title: "Events mensuels", text: "Tournois et cashback toutes les semaines" },
      { icon: "🌀", title: "Free spins offerts", text: "Envoyés aux joueurs actifs chaque semaine" },
      { icon: "💬", title: "Support 24/7", text: "Réponse moyenne en 3 min · en anglais" },
      { icon: "⚡", title: "Retraits instantanés", text: "24/7 · pas d'attente" },
      { icon: "🔓", title: "Sans KYC", text: "Aucune vérification d'identité requise" },
      { icon: "💳", title: "0% frais CB", text: "On couvre les 11% habituels · Visa / Mastercard" },
      { icon: "🍎", title: "Apple Pay / PayPal", text: "Crypto · Visa · Mastercard · ApplePay · PayPal" },
    ],
    vipTitle: "Programme VIP",
    vipBadge: "INVITATION DIRECTE",
    vipHeading: "Tu joues sérieusement ? On t'attribue un host VIP dédié.",
    vipBody:
      "Le programme VIP Celsius offre des bonus personnalisés, des limites de retrait illimitées, des cadeaux physiques et un manager qui te suit en privé. Réservé aux joueurs qui dépensent 500€+/mois.",
    vipBullets: [
      "Host VIP dédié sur Telegram / Discord",
      "Bonus exclusifs personnalisés à ton style",
      "Reload bonus prioritaires sur dépôts importants",
      "Cadeaux physiques + invitations à des events IRL",
    ],
    vipCta: "👑 Je suis intéressé par le VIP",
    vipNote: "Ton email reste confidentiel. Réponse sous 24h.",
    faqTitle: "Questions fréquentes",
    faqs: [
      { q: "Comment je touche les 500€ + 150 FS ?", a: "Tu cliques sur le bouton, tu crées ton compte en 30s, tu fais un premier dépôt. Le bonus 100% + 150 FS est crédité automatiquement." },
      { q: "C'est quoi le wager x40 ?", a: "C'est le nombre de fois où tu dois rejouer le montant du bonus avant de pouvoir retirer. Standard de l'industrie." },
      { q: "Je peux retirer mes gains ?", a: "Oui, dès que les conditions de mise sont remplies. Les retraits sont instantanés 24/7 en crypto, et rapides en CB / Apple Pay / PayPal." },
      { q: "C'est légal en France ?", a: "Celsius est régulé par une licence offshore. Plateforme accessible aux 18+. Joue avec modération." },
    ],
    finalTitle: "Prêt à empocher tes 500€ ?",
    finalSub: "Le bonus est crédité automatiquement après ton premier dépôt.",
    finalCta: "🚀 Je m'inscris en 30s",
    statBonus: "Bonus max",
    statFs: "Free spins",
    statLoss: "Lossback",
    statWithdraw: "Retraits",
    paymentsTitle: "Tous les moyens de paiement acceptés",
    payments: ["Crypto", "Visa", "Mastercard", "Apple Pay", "PayPal", "Google Pay"],
    paymentsNote: "0% de frais sur les CB · On absorbe les 11% habituels",
    urgencyLine: "+1 247 joueurs ont rejoint Celsius via LunaLive cette semaine",
    legalBadge: "+18 · Jouer comporte des risques",
    legalFull:
      "Les jeux d'argent et de hasard sont strictement interdits aux mineurs de 18 ans. Jouer comporte des risques : endettement, isolement, dépendance. Pour être aidé, appelez le 09 74 75 13 13 (appel non surtaxé) ou rendez-vous sur joueurs-info-service.fr. Jouez responsablement, dans la modération et pour le plaisir.",
    affiliateMention: "Page affiliée · Contient des liens commerciaux",
  },
  en: {
    badgeTop: "VIP INVITE · X EXCLUSIVE ACCESS",
    h1Line1: "+€500",
    h1Line2: "+ 150 free spins",
    h1Sub: "on your first deposit at Celsius",
    heroCta: "🎁 Claim my bonuses",
    heroSub: "Sign up in 30s · No KYC · Instant 24/7 withdrawals",
    welcomeTitle: "Welcome Package",
    welcomeSub: "4 stacking tiers, up to €2,000 + 250 FS",
    sectionCasino: "🎰 Casino",
    sectionSport: "⚽ Sports betting",
    or: "or",
    paliersCasino: [
      { tag: "1st deposit", bonus: "100% up to €500", fs: "+ 150 FS", wager: "wager x40" },
      { tag: "2nd deposit", bonus: "100% up to €300", fs: "+ 50 FS", wager: "wager x40" },
      { tag: "3rd deposit", bonus: "200% up to €200", fs: "+ 50 FS", wager: "wager x45" },
      { tag: "4th deposit", bonus: "150% up to €1,000", fs: "", wager: "wager x45" },
    ],
    paliersSport: [
      { tag: "1st deposit", bonus: "50% freebets", fs: "up to €200", wager: "" },
      { tag: "2nd deposit", bonus: "20% NoRisk freebets", fs: "up to €500", wager: "wager x3" },
    ],
    benefitsTitle: "Why Celsius",
    benefits: [
      { icon: "💸", title: "35% lossback", text: "Get up to 35% of your losses back" },
      { icon: "🎯", title: "Monthly events", text: "Tournaments and weekly cashback" },
      { icon: "🌀", title: "Free spins", text: "Sent to active players every week" },
      { icon: "💬", title: "24/7 support", text: "Avg reply in 3 min · in English" },
      { icon: "⚡", title: "Instant withdrawals", text: "24/7 · no waiting" },
      { icon: "🔓", title: "No KYC", text: "No identity check required" },
      { icon: "💳", title: "0% credit card fees", text: "We cover the usual 11% · Visa / Mastercard" },
      { icon: "🍎", title: "Apple Pay / PayPal", text: "Crypto · Visa · Mastercard · ApplePay · PayPal" },
    ],
    vipTitle: "VIP Program",
    vipBadge: "DIRECT INVITE",
    vipHeading: "Playing seriously? We assign you a dedicated VIP host.",
    vipBody:
      "Celsius's VIP program gives you personalized bonuses, unlimited withdrawal caps, physical gifts and a private manager. Reserved for players spending €500+/month.",
    vipBullets: [
      "Dedicated VIP host on Telegram / Discord",
      "Custom bonuses tailored to your style",
      "Priority reload bonuses on big deposits",
      "Physical gifts + invites to IRL events",
    ],
    vipCta: "👑 I'm interested in VIP",
    vipNote: "Your email stays confidential. Reply within 24h.",
    faqTitle: "Frequent questions",
    faqs: [
      { q: "How do I get the €500 + 150 FS ?", a: "Click the button, create your account in 30s, make a first deposit. The 100% bonus + 150 FS is credited automatically." },
      { q: "What's wager x40 ?", a: "The number of times you need to wager the bonus before withdrawing. Industry standard." },
      { q: "Can I withdraw my winnings ?", a: "Yes, once wagering is complete. Withdrawals are instant 24/7 in crypto, fast in CB / Apple Pay / PayPal." },
      { q: "Is it legal ?", a: "Celsius is licensed offshore. 18+ only. Play responsibly." },
    ],
    finalTitle: "Ready to grab your €500 ?",
    finalSub: "Bonus credited automatically after your first deposit.",
    finalCta: "🚀 Sign up in 30s",
    statBonus: "Max bonus",
    statFs: "Free spins",
    statLoss: "Lossback",
    statWithdraw: "Withdrawals",
    paymentsTitle: "All payment methods accepted",
    payments: ["Crypto", "Visa", "Mastercard", "Apple Pay", "PayPal", "Google Pay"],
    paymentsNote: "0% credit card fees · We absorb the usual 11%",
    urgencyLine: "+1,247 players joined Celsius via LunaLive this week",
    legalBadge: "+18 · Gambling involves risks",
    legalFull: "Gambling is strictly prohibited for under-18s. Play responsibly.",
    affiliateMention: "Affiliate page · Contains commercial links",
  },
} as const;

// CTA target (defaults to celsius affiliate root, replaceable via query ?to= or prop)
const DEFAULT_AFFI = "https://celsius.games/UHyEqTtNlL";

export type S1CelsiusLandingProps = {
  affiLink?: string;
  pseudo?: string;
  pseudoSub?: string;
  profileImageUrl?: string;
};

// ─── Reveal on scroll wrapper ───────────────────────────────────────────────

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ─── Magnetic CTA (cursor-follow subtle) ────────────────────────────────────

function MagneticCta({ href, label, primary = true, onClick }: { href: string; label: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  const ref = React.useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18 });
  const sy = useSpring(y, { stiffness: 220, damping: 18 });
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    x.set((e.clientX - cx) * 0.22);
    y.set((e.clientY - cy) * 0.22);
  };
  const onLeave = () => { x.set(0); y.set(0); };
  return (
    <motion.a
      ref={ref}
      href={href}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{ x: sx, y: sy }}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={primary ? "s1-cta s1-cta-primary" : "s1-cta s1-cta-ghost"}
    >
      {label}
    </motion.a>
  );
}

// ─── Count-up number ────────────────────────────────────────────────────────

function CountUp({ to, prefix = "", suffix = "", duration = 1.4 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const ease = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(to * ease);
      setVal(cur);
      mv.set(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, mv]);
  return <span ref={ref}>{prefix}{val.toLocaleString("fr-FR")}{suffix}</span>;
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function S1CelsiusLanding(props: S1CelsiusLandingProps = {}) {
  const [lang, setLang] = React.useState<Lang>("fr");
  const t = STRINGS[lang];

  // Affi URL : prop > query ?to= > default
  const affiUrl = React.useMemo(() => {
    if (props.affiLink) return props.affiLink;
    if (typeof window === "undefined") return DEFAULT_AFFI;
    const params = new URLSearchParams(window.location.search);
    return params.get("to") || DEFAULT_AFFI;
  }, [props.affiLink]);

  const showPresenter = Boolean(props.pseudo || props.profileImageUrl);

  const [vipMode, setVipMode] = React.useState<"closed" | "form" | "sent">("closed");
  const [vipEmail, setVipEmail] = React.useState("");
  const [vipError, setVipError] = React.useState<string | null>(null);

  const submitVip = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = vipEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setVipError("Email invalide");
      return;
    }
    setVipError(null);
    try {
      const base = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
      await fetch(`${base}/api/public/affi-vip-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ slug: "s1-celsius", email, referrer: document.referrer || null }),
      });
    } catch { /* noop — lead perdu mais flow continue */ }
    setVipMode("sent");
  };

  // Spotlight curseur
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);
  React.useEffect(() => {
    const move = (e: MouseEvent) => {
      spotX.set((e.clientX / window.innerWidth) * 100);
      spotY.set((e.clientY / window.innerHeight) * 100);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [spotX, spotY]);
  const spotBg = useTransform(
    [spotX, spotY] as any,
    ([x, y]: any) => `radial-gradient(600px circle at ${x}% ${y}%, rgba(255,185,48,.08), transparent 70%)`
  );

  // Parallax hero
  const heroRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.3]);

  // Page title FR/EN
  useMotionValueEvent(spotX, "change", () => { /* no-op, garde le motion enregistre */ });

  React.useEffect(() => {
    document.title = lang === "fr"
      ? "Celsius · +500€ + 150 FS · Bonus de bienvenue"
      : "Celsius · €500 + 150 FS · Welcome bonus";
    return () => { document.title = "LunaLive"; };
  }, [lang]);

  return (
    <div className="s1-root">
      <style>{`
        .s1-root{position:relative;min-height:100vh;color:#fff;font-family:'Space Grotesk','DM Sans',-apple-system,sans-serif;overflow-x:hidden;background:#0a0710}
        /* Fond propre : deux halos chauds tres flous, pas de purple/cyan */
        .s1-bg-mesh{position:fixed;inset:-10%;background:
          radial-gradient(900px circle at 15% 0%,rgba(255,75,110,.14) 0%,transparent 55%),
          radial-gradient(900px circle at 88% 110%,rgba(255,185,48,.10) 0%,transparent 55%);
          filter:blur(20px);pointer-events:none;z-index:0}
        .s1-bg-grain{position:fixed;inset:0;background-image:radial-gradient(circle at 50% 50%,rgba(255,255,255,.025) 1px,transparent 1px);background-size:28px 28px;opacity:.5;pointer-events:none;z-index:0}
        .s1-bg-spot{position:fixed;inset:0;pointer-events:none;z-index:1;mix-blend-mode:screen}
        .s1-bg-aurora{display:none}

        /* Layout containers */
        .s1-layer{position:relative;z-index:5}
        .s1-container{max-width:1100px;margin:0 auto;padding:0 20px}

        /* Topbar */
        .s1-topbar{position:sticky;top:0;z-index:30;backdrop-filter:blur(12px);background:rgba(7,5,18,.7);border-bottom:1px solid rgba(255,255,255,.06)}
        .s1-topbar-inner{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;max-width:1100px;margin:0 auto}
        .s1-brand{display:flex;align-items:center;gap:8px;font-family:'Bagel Fat One',cursive;font-size:1.3rem;letter-spacing:.04em;background:linear-gradient(180deg,#fff 0%,#FFE9D6 25%,#FFB930 55%,#FF4B6E 85%,#fff 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 0 rgba(255,75,110,.4))}
        .s1-lang-switch{display:flex;gap:4px;padding:3px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:999px}
        .s1-lang-btn{padding:5px 12px;border-radius:999px;background:transparent;border:none;color:rgba(255,255,255,.6);font-weight:700;font-size:.72rem;cursor:pointer;letter-spacing:.08em;font-family:inherit}
        .s1-lang-btn.active{background:linear-gradient(135deg,#FFB930,#FF4B6E);color:#0a0510;box-shadow:0 4px 14px rgba(255,75,110,.4)}

        /* Presenter strip */
        .s1-presenter{display:inline-flex;align-items:center;gap:12px;padding:8px 16px 8px 8px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,185,48,.3);backdrop-filter:blur(10px);margin-bottom:18px}
        .s1-presenter-img{width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,185,48,.6);box-shadow:0 4px 14px rgba(255,75,110,.4)}
        .s1-presenter-text{text-align:left;line-height:1.1}
        .s1-presenter-by{font-size:.62rem;color:rgba(255,233,214,.55);letter-spacing:.14em;text-transform:uppercase;font-weight:700}
        .s1-presenter-pseudo{font-family:'Bagel Fat One',cursive;font-size:1rem;color:#FFE9D6;letter-spacing:.02em;margin-top:2px}
        .s1-presenter-sub{font-size:.7rem;color:rgba(255,233,214,.55);margin-top:1px}

        /* Hero */
        .s1-hero{padding:60px 20px 80px;text-align:center}
        .s1-badge-top{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,185,48,.4);font-size:.7rem;font-weight:700;letter-spacing:.14em;color:#FFE9D6;backdrop-filter:blur(8px);margin-bottom:24px}
        .s1-badge-top::before{content:"";width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px #22c55e;animation:s1-blink 1.4s ease-in-out infinite}
        .s1-h1{margin:0;line-height:.95;font-family:'Bagel Fat One',cursive;font-size:4.5rem;letter-spacing:-.01em;background:linear-gradient(180deg,#fff 0%,#FFE9D6 25%,#FFB930 55%,#FF4B6E 85%,#fff 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 4px 0 rgba(255,75,110,.5)) drop-shadow(0 0 28px rgba(255,185,48,.4))}
        .s1-h1-line2{margin:10px 0 0;font-family:'Bagel Fat One',cursive;font-size:1.8rem;color:#FFE9D6;letter-spacing:.04em;text-shadow:0 0 18px rgba(255,185,48,.4)}
        .s1-h1-sub{margin:20px auto 0;max-width:560px;font-size:1.05rem;color:rgba(255,255,255,.75);font-weight:500}
        .s1-hero-cta-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:34px}
        .s1-cta{display:inline-flex;align-items:center;gap:8px;padding:18px 32px;border-radius:18px;font-family:'Bagel Fat One',cursive;font-size:1.15rem;letter-spacing:.04em;text-decoration:none;cursor:pointer;border:none;transition:transform .15s ease;font-weight:400}
        .s1-cta-primary{color:#1a0510;background:linear-gradient(135deg,#FFE9D6 0%,#FFB930 45%,#FF4B6E 100%);box-shadow:0 0 0 1px rgba(255,255,255,.4) inset,0 12px 36px rgba(255,75,110,.55),0 0 70px rgba(255,185,48,.45);border:2px solid #fff}
        .s1-cta-primary:hover{transform:translateY(-2px)}
        .s1-cta-ghost{color:#FFE9D6;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(8px);font-size:1rem;padding:14px 24px}
        .s1-cta-ghost:hover{background:rgba(255,255,255,.1)}
        .s1-hero-sub-line{font-size:.78rem;color:rgba(255,233,214,.55);letter-spacing:.04em}

        /* Stats strip (live) */
        .s1-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin:54px auto 0;max-width:900px;padding:18px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px)}
        .s1-stat{text-align:center;padding:8px 4px}
        .s1-stat-val{font-family:'Bagel Fat One',cursive;font-size:1.9rem;background:linear-gradient(180deg,#fff,#FFB930 60%,#FF4B6E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;line-height:1;letter-spacing:-.02em}
        .s1-stat-label{font-size:.7rem;color:rgba(255,255,255,.55);letter-spacing:.16em;text-transform:uppercase;margin-top:4px;font-weight:700}

        /* Section title */
        .s1-section{padding:80px 0;position:relative}
        .s1-section-title{text-align:center;margin:0 0 12px;font-family:'Bagel Fat One',cursive;font-size:2.4rem;line-height:1.05;background:linear-gradient(180deg,#fff,#FFB930 60%,#FF4B6E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;letter-spacing:-.01em}
        .s1-section-sub{text-align:center;color:rgba(255,255,255,.65);font-size:1.05rem;margin:0 auto 40px;max-width:600px}

        /* Welcome package tabs */
        .s1-pack-toggle{display:flex;justify-content:center;gap:8px;margin-bottom:30px}
        .s1-pack-btn{padding:10px 22px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.7);font-weight:700;font-size:.86rem;letter-spacing:.04em;cursor:pointer;font-family:inherit;transition:all .2s ease}
        .s1-pack-btn.active{background:linear-gradient(135deg,#FFB930,#FF4B6E);color:#0a0510;border-color:#FFB930;box-shadow:0 8px 22px rgba(255,75,110,.4)}
        .s1-paliers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:920px;margin:0 auto}
        .s1-palier{position:relative;padding:24px 20px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,185,48,.22);backdrop-filter:blur(12px);box-shadow:0 18px 40px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.03) inset;overflow:hidden;transition:transform .25s ease}
        .s1-palier:hover{transform:translateY(-4px)}
        .s1-palier-shine{position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent 40%,rgba(255,255,255,.06) 50%,transparent 60%);pointer-events:none;animation:s1-shine 10s linear infinite}
        .s1-palier-tag{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,185,48,.16);color:#FFE9D6;font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-bottom:14px}
        .s1-palier-bonus{font-family:'Bagel Fat One',cursive;font-size:1.5rem;line-height:1.1;background:linear-gradient(180deg,#fff,#FFB930);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 0 rgba(255,75,110,.3))}
        .s1-palier-fs{margin-top:8px;font-size:.95rem;color:#FFE9D6;font-weight:700}
        .s1-palier-wager{margin-top:10px;font-size:.72rem;color:rgba(255,255,255,.45);letter-spacing:.06em}

        /* Benefits grid */
        .s1-benefits{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
        .s1-benefit{padding:20px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(10px);transition:transform .2s ease,border-color .2s ease}
        .s1-benefit:hover{transform:translateY(-3px);border-color:rgba(255,185,48,.4)}
        .s1-benefit-icon{font-size:2rem;line-height:1;margin-bottom:10px;filter:drop-shadow(0 4px 12px rgba(255,185,48,.3))}
        .s1-benefit-title{font-family:'Bagel Fat One',cursive;font-size:1.05rem;color:#FFE9D6;letter-spacing:.02em;margin:0 0 4px}
        .s1-benefit-text{font-size:.86rem;color:rgba(255,255,255,.65);margin:0;line-height:1.4}

        /* VIP section */
        .s1-vip{position:relative;padding:60px 30px;border-radius:32px;background:
          radial-gradient(120% 80% at 0% 0%,rgba(255,75,110,.25),transparent 60%),
          radial-gradient(80% 60% at 100% 100%,rgba(255,185,48,.18),transparent 60%),
          linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));
          border:1px solid rgba(255,185,48,.3);box-shadow:0 30px 80px rgba(255,75,110,.3),0 0 0 1px rgba(255,255,255,.04) inset;backdrop-filter:blur(20px);overflow:hidden}
        .s1-vip::before{content:"";position:absolute;inset:0;background:radial-gradient(80% 60% at 50% 0%,rgba(255,185,48,.15),transparent 70%);pointer-events:none}
        .s1-vip-inner{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:32px;align-items:center}
        .s1-vip-badge{display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(255,185,48,.18);color:#FFB930;font-size:.68rem;font-weight:800;letter-spacing:.18em;margin-bottom:16px;text-transform:uppercase}
        .s1-vip-h{font-family:'Bagel Fat One',cursive;font-size:1.8rem;line-height:1.15;background:linear-gradient(180deg,#fff,#FFB930 60%,#FF4B6E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;margin:0 0 16px;filter:drop-shadow(0 2px 0 rgba(255,75,110,.3));word-break:normal;overflow-wrap:break-word;hyphens:none}
        .s1-vip-body{color:rgba(255,255,255,.78);font-size:1rem;line-height:1.55;margin:0 0 22px}
        .s1-vip-bullets{list-style:none;padding:0;margin:0 0 22px}
        .s1-vip-bullets li{padding:8px 0 8px 30px;position:relative;font-size:.95rem;color:#FFE9D6}
        .s1-vip-bullets li::before{content:"✦";position:absolute;left:6px;top:8px;color:#FFB930;font-size:1rem}
        .s1-vip-card{padding:28px;border-radius:20px;background:rgba(7,5,18,.6);border:1px solid rgba(255,185,48,.35);box-shadow:0 18px 50px rgba(255,75,110,.3)}
        .s1-vip-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:16px 22px;border-radius:14px;background:linear-gradient(135deg,#FFE9D6,#FFB930 45%,#FF4B6E);color:#1a0510;font-family:'Bagel Fat One',cursive;font-size:1.05rem;letter-spacing:.04em;border:2px solid #fff;cursor:pointer;font-weight:400;box-shadow:0 12px 30px rgba(255,75,110,.45),0 0 0 1px rgba(255,255,255,.3) inset;font-family-display:'Bagel Fat One'}
        .s1-vip-cta:hover{transform:translateY(-1px)}
        .s1-vip-form input{width:100%;padding:14px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,185,48,.4);border-radius:12px;color:#fff;font-size:.95rem;font-family:inherit;outline:none;margin-bottom:10px}
        .s1-vip-form input:focus{border-color:#FFB930;box-shadow:0 0 0 3px rgba(255,185,48,.18)}
        .s1-vip-error{margin-top:8px;font-size:.78rem;color:#fca5a5}
        .s1-vip-note{margin-top:10px;font-size:.74rem;color:rgba(255,233,214,.5);text-align:center}
        .s1-vip-sent{text-align:center;padding:14px 0}
        .s1-vip-sent-icon{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FFE9D6,#FFB930);color:#1a0510;font-size:1.2rem;font-weight:900;margin-bottom:10px;box-shadow:0 8px 22px rgba(255,185,48,.5)}

        /* FAQ */
        .s1-faq{max-width:760px;margin:0 auto}
        .s1-faq-item{margin-bottom:10px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);overflow:hidden;transition:border-color .2s ease}
        .s1-faq-item.open{border-color:rgba(255,185,48,.4)}
        .s1-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:transparent;border:none;color:#fff;font-weight:700;font-size:1rem;text-align:left;cursor:pointer;font-family:inherit}
        .s1-faq-icon{font-size:.9rem;color:#FFB930;transition:transform .25s ease}
        .s1-faq-item.open .s1-faq-icon{transform:rotate(180deg)}
        .s1-faq-a{padding:0 22px 18px;color:rgba(255,233,214,.78);font-size:.95rem;line-height:1.5;display:none}
        .s1-faq-item.open .s1-faq-a{display:block}

        /* Final CTA */
        .s1-final{text-align:center;padding:60px 20px 40px}
        .s1-final-h{font-family:'Bagel Fat One',cursive;font-size:2.8rem;line-height:1.05;background:linear-gradient(180deg,#fff,#FFB930 50%,#FF4B6E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;margin:0 0 16px;filter:drop-shadow(0 4px 0 rgba(255,75,110,.4))}
        .s1-final-sub{color:rgba(255,255,255,.7);font-size:1.05rem;margin:0 0 30px}

        /* Payments */
        .s1-pay-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:760px;margin:0 auto}
        .s1-pay-chip{padding:10px 18px;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.02));border:1px solid rgba(255,185,48,.28);color:#FFE9D6;font-weight:700;font-size:.86rem;letter-spacing:.04em;backdrop-filter:blur(8px);transition:transform .2s ease,border-color .2s ease}
        .s1-pay-chip:hover{transform:translateY(-2px);border-color:rgba(255,185,48,.55)}

        /* Urgency */
        .s1-urgency{display:flex;align-items:center;gap:10px;justify-content:center;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(255,185,48,.08));border:1px solid rgba(34,197,94,.35);color:#dcfce7;font-size:.92rem;font-weight:600;text-align:center;max-width:640px;margin:0 auto;backdrop-filter:blur(8px)}
        .s1-urgency-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px #22c55e;animation:s1-blink 1.4s ease-in-out infinite;flex-shrink:0}

        /* Footer */
        .s1-footer{padding:36px 20px 80px;text-align:center;color:rgba(255,233,214,.55);font-size:.78rem;line-height:1.6;border-top:1px solid rgba(255,255,255,.06);margin-top:60px}
        .s1-footer-badge{display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.4);color:#fecaca;font-weight:700;font-size:.7rem;letter-spacing:.1em;margin-bottom:14px}
        .s1-footer p{margin:6px auto;max-width:640px}

        /* Animations */
        @keyframes s1-mesh{0%{transform:translate(0,0) rotate(0)}50%{transform:translate(-30px,20px) rotate(6deg)}100%{transform:translate(20px,-15px) rotate(-4deg)}}
        @keyframes s1-aurora{from{background-position:-200% 0}to{background-position:200% 0}}
        @keyframes s1-blink{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes s1-shine{0%{transform:translate(-50%,-50%) rotate(0)}100%{transform:translate(-50%,-50%) rotate(360deg)}}

        @media (prefers-reduced-motion:reduce){
          .s1-bg-mesh,.s1-bg-aurora,.s1-palier-shine{animation:none}
        }
      `}</style>

      <div className="s1-bg-mesh" />
      <div className="s1-bg-grain" />
      <div className="s1-bg-aurora" />
      <motion.div className="s1-bg-spot" style={{ background: spotBg }} />

      {/* Topbar */}
      <header className="s1-topbar">
        <div className="s1-topbar-inner">
          <div className="s1-brand">CELSIUS</div>
          <div className="s1-lang-switch">
            <button type="button" className={`s1-lang-btn ${lang === "fr" ? "active" : ""}`} onClick={() => setLang("fr")}>FR</button>
            <button type="button" className={`s1-lang-btn ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>EN</button>
          </div>
        </div>
      </header>

      <div className="s1-layer">

        {/* Hero */}
        <motion.section className="s1-hero" ref={heroRef} style={{ y: heroY, opacity: heroOpacity }}>
          <div className="s1-container">
            {showPresenter ? (
              <Reveal>
                <div className="s1-presenter">
                  {props.profileImageUrl ? (
                    <img src={props.profileImageUrl} alt="" className="s1-presenter-img" />
                  ) : null}
                  {props.pseudo ? (
                    <div className="s1-presenter-text">
                      <div className="s1-presenter-by">{lang === "fr" ? "Présenté par" : "Presented by"}</div>
                      <div className="s1-presenter-pseudo">{props.pseudo}</div>
                      {props.pseudoSub ? <div className="s1-presenter-sub">{props.pseudoSub}</div> : null}
                    </div>
                  ) : null}
                </div>
              </Reveal>
            ) : null}
            <Reveal>
              <div className="s1-badge-top">{t.badgeTop}</div>
            </Reveal>
            <Reveal delay={0.1}>
              <h1 className="s1-h1">{t.h1Line1}</h1>
              <p className="s1-h1-line2">{t.h1Line2}</p>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="s1-h1-sub">{t.h1Sub}</p>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="s1-hero-cta-wrap">
                <MagneticCta href={affiUrl} label={t.heroCta} />
                <div className="s1-hero-sub-line">{t.heroSub}</div>
              </div>
            </Reveal>

            <Reveal delay={0.4}>
              <div className="s1-stats">
                <div className="s1-stat">
                  <div className="s1-stat-val"><CountUp to={2000} prefix="" suffix="€" /></div>
                  <div className="s1-stat-label">{t.statBonus}</div>
                </div>
                <div className="s1-stat">
                  <div className="s1-stat-val"><CountUp to={250} prefix="" suffix=" FS" /></div>
                  <div className="s1-stat-label">{t.statFs}</div>
                </div>
                <div className="s1-stat">
                  <div className="s1-stat-val"><CountUp to={35} suffix="%" /></div>
                  <div className="s1-stat-label">{t.statLoss}</div>
                </div>
                <div className="s1-stat">
                  <div className="s1-stat-val">24/7</div>
                  <div className="s1-stat-label">{t.statWithdraw}</div>
                </div>
              </div>
            </Reveal>
          </div>
        </motion.section>

        {/* Welcome Package */}
        <WelcomeSection t={t} />

        {/* Benefits */}
        <section className="s1-section">
          <div className="s1-container">
            <Reveal>
              <h2 className="s1-section-title">{t.benefitsTitle}</h2>
            </Reveal>
            <div className="s1-benefits">
              {t.benefits.map((b, i) => (
                <Reveal key={i} delay={i * 0.05}>
                  <div className="s1-benefit">
                    <div className="s1-benefit-icon">{b.icon}</div>
                    <h3 className="s1-benefit-title">{b.title}</h3>
                    <p className="s1-benefit-text">{b.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* VIP */}
        <section className="s1-section">
          <div className="s1-container">
            <Reveal>
              <h2 className="s1-section-title">{t.vipTitle}</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="s1-vip">
                <div className="s1-vip-inner">
                  <div>
                    <div className="s1-vip-badge">{t.vipBadge}</div>
                    <h3 className="s1-vip-h">{t.vipHeading}</h3>
                    <p className="s1-vip-body">{t.vipBody}</p>
                    <ul className="s1-vip-bullets">
                      {t.vipBullets.map((b, i) => (<li key={i}>{b}</li>))}
                    </ul>
                  </div>
                  <div className="s1-vip-card">
                    {vipMode === "sent" ? (
                      <div className="s1-vip-sent">
                        <div className="s1-vip-sent-icon">✓</div>
                        <div style={{ fontWeight: 800, fontSize: ".95rem" }}>{lang === "fr" ? "Demande envoyée" : "Request sent"}</div>
                        <div style={{ fontSize: ".78rem", color: "rgba(255,233,214,.6)", marginTop: 4 }}>{t.vipNote}</div>
                      </div>
                    ) : vipMode === "form" ? (
                      <form className="s1-vip-form" onSubmit={submitVip}>
                        <input
                          type="email"
                          placeholder={lang === "fr" ? "ton.email@exemple.com" : "your.email@example.com"}
                          value={vipEmail}
                          onChange={(e) => { setVipEmail(e.target.value); setVipError(null); }}
                          autoFocus
                          required
                        />
                        <button type="submit" className="s1-vip-cta">
                          {lang === "fr" ? "Envoyer ma demande" : "Send my request"}
                        </button>
                        {vipError ? <div className="s1-vip-error">{vipError}</div> : null}
                        <div className="s1-vip-note">{t.vipNote}</div>
                      </form>
                    ) : (
                      <>
                        <button type="button" className="s1-vip-cta" onClick={() => setVipMode("form")}>
                          {t.vipCta}
                        </button>
                        <div className="s1-vip-note">{t.vipNote}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Payments */}
        <section className="s1-section">
          <div className="s1-container">
            <Reveal>
              <h2 className="s1-section-title">{t.paymentsTitle}</h2>
              <p className="s1-section-sub">{t.paymentsNote}</p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="s1-pay-row">
                {t.payments.map((p) => (
                  <div key={p} className="s1-pay-chip">{p}</div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <FaqSection t={t} />

        {/* Urgency strip */}
        <Reveal>
          <div className="s1-container" style={{ marginTop: 20 }}>
            <div className="s1-urgency">
              <span className="s1-urgency-dot" />
              {t.urgencyLine}
            </div>
          </div>
        </Reveal>

        {/* Final CTA */}
        <section className="s1-final">
          <div className="s1-container">
            <Reveal>
              <h2 className="s1-final-h">{t.finalTitle}</h2>
              <p className="s1-final-sub">{t.finalSub}</p>
              <MagneticCta href={affiUrl} label={t.finalCta} />
            </Reveal>
          </div>
        </section>

        {/* Footer */}
        <footer className="s1-footer">
          <div className="s1-footer-badge">{t.legalBadge}</div>
          <p>{t.legalFull}</p>
          <p style={{ marginTop: 14, color: "rgba(255,233,214,.4)", fontSize: ".7rem" }}>
            © {new Date().getFullYear()} — {t.affiliateMention}
          </p>
        </footer>
      </div>

      <V3SocialProof accent="#FFB930" accentGlow="rgba(255,185,48,.5)" />
    </div>
  );
}

// ─── Welcome Package section avec toggle Casino/Sport ───────────────────────

type Strings = typeof STRINGS[Lang];

function WelcomeSection({ t }: { t: Strings }) {
  const [mode, setMode] = React.useState<"casino" | "sport">("casino");
  const paliers = mode === "casino" ? t.paliersCasino : t.paliersSport;
  return (
    <section className="s1-section">
      <div className="s1-container">
        <Reveal>
          <h2 className="s1-section-title">{t.welcomeTitle}</h2>
          <p className="s1-section-sub">{t.welcomeSub}</p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="s1-pack-toggle">
            <button className={`s1-pack-btn ${mode === "casino" ? "active" : ""}`} onClick={() => setMode("casino")}>
              {t.sectionCasino}
            </button>
            <button className={`s1-pack-btn ${mode === "sport" ? "active" : ""}`} onClick={() => setMode("sport")}>
              {t.sectionSport}
            </button>
          </div>
        </Reveal>
        <div className="s1-paliers">
          {paliers.map((p, i) => (
            <Reveal key={`${mode}-${i}`} delay={i * 0.08}>
              <div className="s1-palier">
                <div className="s1-palier-shine" />
                <div className="s1-palier-tag">{p.tag}</div>
                <div className="s1-palier-bonus">{p.bonus}</div>
                {p.fs ? <div className="s1-palier-fs">{p.fs}</div> : null}
                {p.wager ? <div className="s1-palier-wager">{p.wager}</div> : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ accordion ──────────────────────────────────────────────────────────

function FaqSection({ t }: { t: Strings }) {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section className="s1-section">
      <div className="s1-container">
        <Reveal>
          <h2 className="s1-section-title">{t.faqTitle}</h2>
        </Reveal>
        <div className="s1-faq">
          {t.faqs.map((f, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className={`s1-faq-item ${open === i ? "open" : ""}`}>
                <button className="s1-faq-q" onClick={() => setOpen(open === i ? null : i)}>
                  <span>{f.q}</span>
                  <span className="s1-faq-icon">▾</span>
                </button>
                <div className="s1-faq-a">{f.a}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
