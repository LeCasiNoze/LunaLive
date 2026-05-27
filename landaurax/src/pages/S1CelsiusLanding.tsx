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
    streamerBadge: "Partenaire officiel",
    streamerH1: "100% BONUS",
    streamerH2: "exclusif à ma commu",
    streamerSub: "L'affiliation la plus rentable du marché. Giveaways réservés, tournois privés et code promo unique pour mes viewers.",
    streamerCta: "🎁 Je débloque mes bonus",
    streamerExclusivesTitle: "Pourquoi je joue chez Celsius",
    streamerExclusivesSub: "Ce que j'ai négocié pour ma commu — tu ne trouveras ça nulle part ailleurs.",
    streamerExclusives: [
      { icon: "💎", title: "L'affiliation la plus rentable", text: "Bonus boosté de +20% si tu passes par mon lien — négocié direct avec Celsius." },
      { icon: "🎁", title: "Giveaways exclusifs ma commu", text: "Tirages cash chaque semaine réservés aux joueurs qui jouent avec mon code." },
      { icon: "🏆", title: "Tournois privés mensuels", text: "Prize pool dédié, classement entre viewers, leaderboard live sur mon stream." },
      { icon: "🎟️", title: "Code promo unique", text: "Mon code = bonus de bienvenue boosté + free spins additionnels au 1er dépôt." },
    ],
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
    streamerBadge: "Official partner",
    streamerH1: "100% BONUS",
    streamerH2: "exclusive to my community",
    streamerSub: "The most profitable affiliation deal on the market. Reserved giveaways, private tournaments and a unique promo code for my viewers.",
    streamerCta: "🎁 Unlock my bonuses",
    streamerExclusivesTitle: "Why I play at Celsius",
    streamerExclusivesSub: "What I negotiated for my community — you won't find this anywhere else.",
    streamerExclusives: [
      { icon: "💎", title: "Most profitable affiliation", text: "Bonus boosted +20% if you go through my link — negotiated direct with Celsius." },
      { icon: "🎁", title: "Exclusive community giveaways", text: "Weekly cash draws reserved for players using my code." },
      { icon: "🏆", title: "Private monthly tournaments", text: "Dedicated prize pool, viewer-only leaderboard, live on stream." },
      { icon: "🎟️", title: "Unique promo code", text: "My code = boosted welcome bonus + extra free spins on first deposit." },
    ],
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

  // Sticky bottom CTA — apparait apres le hero
  const [stickyShow, setStickyShow] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setStickyShow(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        /* ═══ S1 Celsius — mobile-first premium ══════════════════════════
           Palette : navy abysse + aurora cyan/violet + halos chauds rose/or
           Sizes en rem fixes (clamp/vw cassait dans preview iframe scalee) */

        .s1-root{position:relative;min-height:100vh;color:#fff;
          font-family:'Space Grotesk','DM Sans',-apple-system,sans-serif;
          overflow-x:hidden;
          background:
            radial-gradient(140% 90% at 50% 0%,#0c1430 0%,transparent 60%),
            radial-gradient(120% 80% at 90% 100%,#1a0524 0%,transparent 55%),
            #04050d}

        /* Aurora ribbons cyan/violet/rose qui flottent */
        .s1-bg-mesh{position:fixed;inset:-20%;pointer-events:none;z-index:0;
          background:
            radial-gradient(45% 28% at 18% 12%,rgba(110,231,255,.16) 0%,transparent 70%),
            radial-gradient(40% 26% at 82% 20%,rgba(167,139,250,.18) 0%,transparent 70%),
            radial-gradient(50% 30% at 50% 65%,rgba(255,75,110,.14) 0%,transparent 70%),
            radial-gradient(45% 28% at 80% 92%,rgba(255,185,48,.14) 0%,transparent 70%);
          filter:blur(30px) saturate(120%);
          animation:s1-mesh 22s ease-in-out infinite alternate}
        .s1-bg-grain{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.35;
          background-image:radial-gradient(circle at 50% 50%,rgba(255,255,255,.04) 1px,transparent 1px);
          background-size:24px 24px}
        .s1-bg-spot{position:fixed;inset:0;pointer-events:none;z-index:1;mix-blend-mode:screen}

        /* Sparkles : petites etoiles flottantes en hero */
        .s1-sparkle{position:absolute;width:3px;height:3px;border-radius:50%;
          background:#fff;box-shadow:0 0 8px #fff,0 0 14px rgba(255,185,48,.5);
          opacity:0;animation:s1-sparkle 5s ease-in-out infinite;pointer-events:none}
        .s1-sparkle.s1-sp-cyan{background:#6EE7FF;box-shadow:0 0 10px #6EE7FF}
        .s1-sparkle.s1-sp-rose{background:#FF4B6E;box-shadow:0 0 10px #FF4B6E}
        .s1-sparkle.s1-sp-gold{background:#FFB930;box-shadow:0 0 10px #FFB930}

        /* Layout containers (mobile-first) */
        .s1-layer{position:relative;z-index:5}
        .s1-container{max-width:1100px;margin:0 auto;padding:0 16px}

        /* Topbar */
        .s1-topbar{position:sticky;top:0;z-index:30;backdrop-filter:blur(14px);
          background:rgba(4,5,13,.75);border-bottom:1px solid rgba(110,231,255,.12)}
        .s1-topbar-inner{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;max-width:1100px;margin:0 auto}
        .s1-brand{display:flex;align-items:center;gap:8px;font-family:'Bagel Fat One',cursive;font-size:1.2rem;letter-spacing:.04em;
          background:linear-gradient(180deg,#fff 0%,#FFE9D6 25%,#FFB930 55%,#FF4B6E 85%,#fff 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 0 rgba(255,75,110,.4))}
        .s1-lang-switch{display:flex;gap:4px;padding:3px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:999px}
        .s1-lang-btn{padding:5px 11px;border-radius:999px;background:transparent;border:none;color:rgba(255,255,255,.6);font-weight:700;font-size:.7rem;cursor:pointer;letter-spacing:.08em;font-family:inherit}
        .s1-lang-btn.active{background:linear-gradient(135deg,#FFB930,#FF4B6E);color:#0a0510;box-shadow:0 4px 14px rgba(255,75,110,.4)}

        /* Presenter — streamer card (mode portrait) */
        .s1-presenter{display:flex;flex-direction:column;align-items:center;gap:12px;
          padding:18px 22px 20px;border-radius:22px;
          background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.02));
          border:1px solid rgba(255,185,48,.35);backdrop-filter:blur(14px);margin-bottom:22px;
          box-shadow:0 18px 40px rgba(255,75,110,.22),0 0 0 1px rgba(255,255,255,.04) inset;
          position:relative;overflow:hidden;max-width:340px;margin-left:auto;margin-right:auto}
        .s1-presenter::before{content:"";position:absolute;inset:-50%;
          background:conic-gradient(from var(--s1-angle),rgba(110,231,255,.4),rgba(167,139,250,.3),rgba(255,75,110,.4),rgba(255,185,48,.4),rgba(110,231,255,.4));
          animation:s1-angle 8s linear infinite;opacity:.5;z-index:-1;filter:blur(20px)}
        .s1-presenter-imgwrap{position:relative;width:84px;height:84px}
        .s1-presenter-imgwrap::before{content:"";position:absolute;inset:-3px;border-radius:50%;
          background:conic-gradient(from var(--s1-angle),#6EE7FF,#A78BFA,#FF4B6E,#FFB930,#6EE7FF);
          animation:s1-angle 6s linear infinite}
        .s1-presenter-img{position:relative;width:84px;height:84px;border-radius:50%;object-fit:cover;
          border:3px solid #04050d;display:block}
        .s1-presenter-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;
          background:linear-gradient(135deg,rgba(255,185,48,.18),rgba(255,75,110,.18));
          border:1px solid rgba(255,185,48,.4);
          font-size:.6rem;font-weight:800;letter-spacing:.18em;color:#FFE9D6;text-transform:uppercase}
        .s1-presenter-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:#FFB930;box-shadow:0 0 8px #FFB930}
        .s1-presenter-text{text-align:center;line-height:1.1}
        .s1-presenter-pseudo{font-family:'Bagel Fat One',cursive;font-size:1.6rem;letter-spacing:.02em;
          background:linear-gradient(180deg,#fff,#FFE9D6 40%,#FFB930 95%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 0 rgba(255,75,110,.3))}
        .s1-presenter-sub{font-size:.82rem;color:rgba(255,233,214,.7);margin-top:4px;font-weight:600}
        .s1-presenter-handle{display:inline-block;margin-top:6px;font-size:.78rem;color:#6EE7FF;font-weight:700;letter-spacing:.02em}

        /* Hero (mobile-first) */
        .s1-hero{padding:36px 16px 56px;text-align:center;position:relative}
        .s1-badge-top{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;
          background:linear-gradient(135deg,rgba(110,231,255,.10),rgba(255,185,48,.10));
          border:1px solid rgba(110,231,255,.35);
          font-size:.62rem;font-weight:800;letter-spacing:.18em;color:#E0F2FE;backdrop-filter:blur(8px);margin-bottom:20px;
          box-shadow:0 4px 18px rgba(110,231,255,.18)}
        .s1-badge-top::before{content:"";width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px #22c55e;animation:s1-blink 1.4s ease-in-out infinite}
        .s1-h1{margin:0;line-height:.92;font-family:'Bagel Fat One',cursive;font-size:3.6rem;letter-spacing:-.02em;
          background:linear-gradient(180deg,#fff 0%,#FFE9D6 22%,#FFB930 55%,#FF4B6E 80%,#fff 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 0 rgba(255,75,110,.45)) drop-shadow(0 0 32px rgba(255,185,48,.45))}
        .s1-h1-line2{margin:8px 0 0;font-family:'Bagel Fat One',cursive;font-size:1.4rem;color:#FFE9D6;letter-spacing:.04em;
          text-shadow:0 0 16px rgba(255,185,48,.5)}
        .s1-h1-sub{margin:16px auto 0;max-width:520px;font-size:.95rem;color:rgba(255,255,255,.78);font-weight:500;line-height:1.4}
        .s1-hero-cta-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:26px}

        /* CTAs : breath + shimmer */
        .s1-cta{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;
          padding:16px 26px;border-radius:16px;font-family:'Bagel Fat One',cursive;font-size:1.05rem;letter-spacing:.04em;
          text-decoration:none;cursor:pointer;border:none;font-weight:400;
          transition:transform .15s ease;overflow:hidden;isolation:isolate}
        .s1-cta-primary{color:#1a0510;
          background:linear-gradient(135deg,#FFE9D6 0%,#FFB930 45%,#FF4B6E 100%);
          box-shadow:0 0 0 1px rgba(255,255,255,.5) inset,0 14px 36px rgba(255,75,110,.55),0 0 60px rgba(255,185,48,.45);
          border:2px solid #fff;animation:s1-breath 3.4s ease-in-out infinite}
        .s1-cta-primary::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;
          background:linear-gradient(120deg,transparent 0%,rgba(255,255,255,.5) 50%,transparent 100%);
          transform:skewX(-22deg);animation:s1-shimmer 3.6s linear infinite;pointer-events:none}
        .s1-cta-primary:hover{transform:translateY(-2px)}
        .s1-cta-ghost{color:#FFE9D6;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(8px);font-size:1rem;padding:14px 22px}
        .s1-cta-ghost:hover{background:rgba(255,255,255,.1)}
        .s1-hero-sub-line{font-size:.74rem;color:rgba(255,233,214,.58);letter-spacing:.04em;max-width:300px;line-height:1.5}

        /* Stats strip (2x2 mobile) */
        .s1-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:36px auto 0;max-width:520px;padding:14px;border-radius:18px;
          background:linear-gradient(135deg,rgba(110,231,255,.06),rgba(255,75,110,.06));
          border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(14px)}
        .s1-stat{text-align:center;padding:10px 6px;position:relative}
        .s1-stat + .s1-stat::before{content:"";position:absolute;left:-5px;top:20%;bottom:20%;width:1px;background:rgba(255,255,255,.06)}
        .s1-stat-val{font-family:'Bagel Fat One',cursive;font-size:1.7rem;background:linear-gradient(180deg,#fff,#FFB930 55%,#FF4B6E 95%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;line-height:1;letter-spacing:-.02em;
          filter:drop-shadow(0 0 12px rgba(255,185,48,.35))}
        .s1-stat-label{font-size:.62rem;color:rgba(255,255,255,.55);letter-spacing:.16em;text-transform:uppercase;margin-top:6px;font-weight:800}

        /* Section title */
        .s1-section{padding:56px 0;position:relative}
        .s1-section-title{text-align:center;margin:0 0 10px;font-family:'Bagel Fat One',cursive;font-size:2rem;line-height:1.05;
          background:linear-gradient(180deg,#fff,#FFB930 55%,#FF4B6E 95%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;letter-spacing:-.01em;
          filter:drop-shadow(0 2px 0 rgba(255,75,110,.3))}
        .s1-section-sub{text-align:center;color:rgba(255,255,255,.65);font-size:.95rem;margin:0 auto 28px;max-width:520px;padding:0 10px;line-height:1.45}

        /* Welcome package tabs */
        .s1-pack-toggle{display:flex;justify-content:center;gap:8px;margin-bottom:22px;padding:0 8px}
        .s1-pack-btn{padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.7);font-weight:700;font-size:.82rem;letter-spacing:.04em;cursor:pointer;font-family:inherit;transition:all .2s ease}
        .s1-pack-btn.active{background:linear-gradient(135deg,#FFB930,#FF4B6E);color:#0a0510;border-color:#FFB930;box-shadow:0 8px 22px rgba(255,75,110,.4)}
        .s1-paliers{display:grid;grid-template-columns:1fr;gap:14px;max-width:520px;margin:0 auto;padding:0 4px}

        /* Conic gradient border anime sur paliers (Houdini @property) */
        @property --s1-angle{syntax:"<angle>";initial-value:0deg;inherits:false}
        .s1-palier{position:relative;padding:20px 18px;border-radius:20px;
          background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));
          backdrop-filter:blur(14px);
          box-shadow:0 18px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04) inset;
          overflow:hidden;transition:transform .25s ease}
        .s1-palier::before{content:"";position:absolute;inset:0;border-radius:20px;padding:1px;
          background:conic-gradient(from var(--s1-angle),
            rgba(110,231,255,.7) 0%,rgba(167,139,250,.6) 25%,rgba(255,75,110,.7) 50%,
            rgba(255,185,48,.8) 75%,rgba(110,231,255,.7) 100%);
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
          -webkit-mask-composite:xor;mask-composite:exclude;
          animation:s1-angle 6s linear infinite;pointer-events:none}
        .s1-palier:hover{transform:translateY(-4px)}
        .s1-palier-tag{display:inline-block;padding:4px 10px;border-radius:999px;
          background:linear-gradient(135deg,rgba(255,185,48,.22),rgba(255,75,110,.18));
          color:#FFE9D6;font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px;
          border:1px solid rgba(255,185,48,.3)}
        .s1-palier-bonus{font-family:'Bagel Fat One',cursive;font-size:1.6rem;line-height:1.1;
          background:linear-gradient(180deg,#fff,#FFB930 60%,#FF4B6E 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 0 rgba(255,75,110,.3))}
        .s1-palier-fs{margin-top:8px;font-size:.95rem;color:#FFE9D6;font-weight:700}
        .s1-palier-wager{margin-top:10px;font-size:.7rem;color:rgba(255,255,255,.45);letter-spacing:.06em}

        /* Streamer exclusives (gros cards verticales premium) */
        .s1-stream-section{position:relative}
        .s1-stream-grid{display:grid;grid-template-columns:1fr;gap:14px;max-width:520px;margin:0 auto;padding:0 4px}
        .s1-stream-card{position:relative;padding:22px 20px;border-radius:20px;
          background:
            radial-gradient(80% 60% at 0% 0%,rgba(167,139,250,.16),transparent 70%),
            linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015));
          border:1px solid rgba(110,231,255,.22);backdrop-filter:blur(14px);
          box-shadow:0 18px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.03) inset;
          overflow:hidden;transition:transform .25s ease,border-color .25s ease}
        .s1-stream-card::after{content:"";position:absolute;left:-30%;top:-30%;width:60%;height:60%;
          background:radial-gradient(circle,rgba(255,185,48,.22),transparent 70%);
          filter:blur(20px);pointer-events:none}
        .s1-stream-card:hover{transform:translateY(-3px);border-color:rgba(255,185,48,.5)}
        .s1-stream-icon{font-size:2.1rem;line-height:1;margin-bottom:10px;
          filter:drop-shadow(0 4px 14px rgba(255,185,48,.45))}
        .s1-stream-title{font-family:'Bagel Fat One',cursive;font-size:1.15rem;line-height:1.15;letter-spacing:.02em;margin:0 0 6px;
          background:linear-gradient(180deg,#fff,#FFE9D6 60%,#FFB930 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
        .s1-stream-text{font-size:.86rem;color:rgba(255,255,255,.7);margin:0;line-height:1.5}

        /* Benefits grid (2 cols mobile) */
        .s1-benefits{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;max-width:760px;margin:0 auto;padding:0 4px}
        .s1-benefit{padding:16px 14px;border-radius:16px;
          background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015));
          border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(10px);
          transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease;position:relative;overflow:hidden}
        .s1-benefit::after{content:"";position:absolute;inset:0;background:radial-gradient(60% 80% at 50% 0%,rgba(255,185,48,.10),transparent 70%);opacity:0;transition:opacity .25s ease;pointer-events:none}
        .s1-benefit:hover{transform:translateY(-3px);border-color:rgba(255,185,48,.45);box-shadow:0 12px 30px rgba(255,75,110,.18)}
        .s1-benefit:hover::after{opacity:1}
        .s1-benefit-icon{font-size:1.8rem;line-height:1;margin-bottom:8px;filter:drop-shadow(0 4px 12px rgba(255,185,48,.4))}
        .s1-benefit-title{font-family:'Bagel Fat One',cursive;font-size:.95rem;color:#FFE9D6;letter-spacing:.02em;margin:0 0 4px;line-height:1.1}
        .s1-benefit-text{font-size:.76rem;color:rgba(255,255,255,.65);margin:0;line-height:1.4}

        /* VIP section (mobile-first stack) */
        .s1-vip{position:relative;padding:32px 20px;border-radius:24px;background:
          radial-gradient(120% 80% at 0% 0%,rgba(167,139,250,.20),transparent 60%),
          radial-gradient(80% 60% at 100% 100%,rgba(255,185,48,.20),transparent 60%),
          radial-gradient(100% 70% at 50% 100%,rgba(255,75,110,.18),transparent 70%),
          linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));
          border:1px solid rgba(255,185,48,.3);box-shadow:0 24px 60px rgba(255,75,110,.25),0 0 0 1px rgba(255,255,255,.04) inset;backdrop-filter:blur(20px);overflow:hidden}
        .s1-vip::before{content:"";position:absolute;inset:0;background:radial-gradient(80% 60% at 50% 0%,rgba(255,185,48,.18),transparent 70%);pointer-events:none}
        .s1-vip-inner{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;align-items:start}
        .s1-vip-badge{display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(255,185,48,.18);color:#FFB930;font-size:.64rem;font-weight:800;letter-spacing:.18em;margin-bottom:14px;text-transform:uppercase;border:1px solid rgba(255,185,48,.35)}
        .s1-vip-h{font-family:'Bagel Fat One',cursive;font-size:1.55rem;line-height:1.15;
          background:linear-gradient(180deg,#fff,#FFB930 55%,#FF4B6E 95%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          margin:0 0 14px;filter:drop-shadow(0 2px 0 rgba(255,75,110,.3));word-break:normal;overflow-wrap:normal;hyphens:none}
        .s1-vip-body{color:rgba(255,255,255,.78);font-size:.9rem;line-height:1.55;margin:0 0 18px}
        .s1-vip-bullets{list-style:none;padding:0;margin:0 0 18px}
        .s1-vip-bullets li{padding:7px 0 7px 26px;position:relative;font-size:.86rem;color:#FFE9D6;line-height:1.35}
        .s1-vip-bullets li::before{content:"✦";position:absolute;left:4px;top:7px;color:#FFB930;font-size:.9rem}
        .s1-vip-card{padding:22px 18px;border-radius:18px;background:rgba(4,5,13,.7);border:1px solid rgba(255,185,48,.35);box-shadow:0 14px 36px rgba(255,75,110,.25)}
        .s1-vip-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:16px 22px;border-radius:14px;background:linear-gradient(135deg,#FFE9D6,#FFB930 45%,#FF4B6E);color:#1a0510;font-family:'Bagel Fat One',cursive;font-size:1.05rem;letter-spacing:.04em;border:2px solid #fff;cursor:pointer;font-weight:400;box-shadow:0 12px 30px rgba(255,75,110,.45),0 0 0 1px rgba(255,255,255,.3) inset;font-family-display:'Bagel Fat One'}
        .s1-vip-cta:hover{transform:translateY(-1px)}
        .s1-vip-form input{width:100%;padding:14px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,185,48,.4);border-radius:12px;color:#fff;font-size:.95rem;font-family:inherit;outline:none;margin-bottom:10px}
        .s1-vip-form input:focus{border-color:#FFB930;box-shadow:0 0 0 3px rgba(255,185,48,.18)}
        .s1-vip-error{margin-top:8px;font-size:.78rem;color:#fca5a5}
        .s1-vip-note{margin-top:10px;font-size:.74rem;color:rgba(255,233,214,.5);text-align:center}
        .s1-vip-sent{text-align:center;padding:14px 0}
        .s1-vip-sent-icon{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FFE9D6,#FFB930);color:#1a0510;font-size:1.2rem;font-weight:900;margin-bottom:10px;box-shadow:0 8px 22px rgba(255,185,48,.5)}

        /* FAQ */
        .s1-faq{max-width:760px;margin:0 auto;padding:0 4px}
        .s1-faq-item{margin-bottom:10px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);overflow:hidden;transition:border-color .2s ease}
        .s1-faq-item.open{border-color:rgba(255,185,48,.4)}
        .s1-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:transparent;border:none;color:#fff;font-weight:700;font-size:1rem;text-align:left;cursor:pointer;font-family:inherit}
        .s1-faq-icon{font-size:.9rem;color:#FFB930;transition:transform .25s ease}
        .s1-faq-item.open .s1-faq-icon{transform:rotate(180deg)}
        .s1-faq-a{padding:0 22px 18px;color:rgba(255,233,214,.78);font-size:.95rem;line-height:1.5;display:none}
        .s1-faq-item.open .s1-faq-a{display:block}

        /* Final CTA */
        .s1-final{text-align:center;padding:48px 16px 32px}
        .s1-final-h{font-family:'Bagel Fat One',cursive;font-size:2.4rem;line-height:1.05;
          background:linear-gradient(180deg,#fff,#FFB930 55%,#FF4B6E 95%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          margin:0 0 14px;filter:drop-shadow(0 4px 0 rgba(255,75,110,.4))}
        .s1-final-sub{color:rgba(255,255,255,.7);font-size:.95rem;margin:0 0 22px;padding:0 8px}

        /* Sticky bottom CTA (mobile-essential pour conversion) */
        .s1-sticky-bottom{position:fixed;left:0;right:0;bottom:0;z-index:40;
          padding:10px 12px calc(10px + env(safe-area-inset-bottom));
          background:linear-gradient(180deg,rgba(4,5,13,0) 0%,rgba(4,5,13,.92) 35%,rgba(4,5,13,.98) 100%);
          backdrop-filter:blur(14px);
          border-top:1px solid rgba(110,231,255,.15);
          transform:translateY(100%);transition:transform .35s cubic-bezier(.4,0,.2,1);pointer-events:none}
        .s1-sticky-bottom.s1-show{transform:translateY(0);pointer-events:auto}
        .s1-sticky-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
          padding:14px 22px;border-radius:14px;
          background:linear-gradient(135deg,#FFE9D6 0%,#FFB930 45%,#FF4B6E 100%);
          color:#1a0510;font-family:'Bagel Fat One',cursive;font-size:1.02rem;letter-spacing:.04em;
          text-decoration:none;border:2px solid #fff;font-weight:400;position:relative;overflow:hidden;
          box-shadow:0 12px 30px rgba(255,75,110,.5),0 0 0 1px rgba(255,255,255,.4) inset;
          animation:s1-breath 3.4s ease-in-out infinite}
        .s1-sticky-cta::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;
          background:linear-gradient(120deg,transparent 0%,rgba(255,255,255,.55) 50%,transparent 100%);
          transform:skewX(-22deg);animation:s1-shimmer 3.6s linear infinite;pointer-events:none}
        .s1-sticky-pad{height:90px}  /* espace en bas pour le sticky */

        /* Payments — marquee infini */
        .s1-pay-marquee{position:relative;overflow:hidden;max-width:760px;margin:0 auto;
          mask-image:linear-gradient(90deg,transparent 0,#000 8%,#000 92%,transparent 100%);
          -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 8%,#000 92%,transparent 100%)}
        .s1-pay-track{display:flex;gap:10px;width:max-content;animation:s1-marquee 22s linear infinite}
        .s1-pay-chip{flex-shrink:0;padding:11px 18px;border-radius:999px;
          background:linear-gradient(180deg,rgba(110,231,255,.08),rgba(255,255,255,.02));
          border:1px solid rgba(110,231,255,.25);color:#E0F2FE;font-weight:700;font-size:.84rem;letter-spacing:.04em;
          backdrop-filter:blur(8px);transition:transform .2s ease,border-color .2s ease;white-space:nowrap}
        .s1-pay-chip:hover{transform:translateY(-2px);border-color:rgba(110,231,255,.5)}
        .s1-pay-chip.s1-pay-gold{background:linear-gradient(180deg,rgba(255,185,48,.10),rgba(255,255,255,.02));border-color:rgba(255,185,48,.3);color:#FFE9D6}

        /* Urgency */
        .s1-urgency{display:flex;align-items:center;gap:10px;justify-content:center;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(255,185,48,.08));border:1px solid rgba(34,197,94,.35);color:#dcfce7;font-size:.92rem;font-weight:600;text-align:center;max-width:640px;margin:0 auto;backdrop-filter:blur(8px)}
        .s1-urgency-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 12px #22c55e;animation:s1-blink 1.4s ease-in-out infinite;flex-shrink:0}

        /* Footer */
        .s1-footer{padding:36px 20px 80px;text-align:center;color:rgba(255,233,214,.55);font-size:.78rem;line-height:1.6;border-top:1px solid rgba(255,255,255,.06);margin-top:60px}
        .s1-footer-badge{display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.4);color:#fecaca;font-weight:700;font-size:.7rem;letter-spacing:.1em;margin-bottom:14px}
        .s1-footer p{margin:6px auto;max-width:640px}

        /* Animations */
        @keyframes s1-mesh{0%{transform:translate(0,0) rotate(0)}50%{transform:translate(-24px,18px) rotate(4deg)}100%{transform:translate(18px,-12px) rotate(-3deg)}}
        @keyframes s1-blink{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes s1-angle{to{--s1-angle:360deg}}
        @keyframes s1-breath{0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.5) inset,0 14px 36px rgba(255,75,110,.55),0 0 60px rgba(255,185,48,.45)}
          50%{box-shadow:0 0 0 1px rgba(255,255,255,.5) inset,0 18px 44px rgba(255,75,110,.7),0 0 90px rgba(255,185,48,.65)}}
        @keyframes s1-shimmer{0%{left:-60%}100%{left:160%}}
        @keyframes s1-marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes s1-sparkle{0%,100%{opacity:0;transform:translateY(0) scale(.6)}50%{opacity:1;transform:translateY(-12px) scale(1.2)}}

        @media (prefers-reduced-motion:reduce){
          .s1-bg-mesh,.s1-palier::before,.s1-cta-primary,.s1-cta-primary::after,
          .s1-sticky-cta,.s1-sticky-cta::after,.s1-pay-track,.s1-sparkle{animation:none}
        }
      `}</style>

      <div className="s1-bg-mesh" />
      <div className="s1-bg-grain" />
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
          {/* Sparkles flottants — couleurs varies pour palette riche */}
          <span className="s1-sparkle s1-sp-cyan" style={{ top: "12%", left: "8%", animationDelay: "0s" }} />
          <span className="s1-sparkle s1-sp-gold" style={{ top: "18%", right: "12%", animationDelay: ".6s" }} />
          <span className="s1-sparkle s1-sp-rose" style={{ top: "38%", left: "18%", animationDelay: "1.2s" }} />
          <span className="s1-sparkle" style={{ top: "26%", right: "26%", animationDelay: "1.8s" }} />
          <span className="s1-sparkle s1-sp-gold" style={{ top: "62%", left: "78%", animationDelay: "2.4s" }} />
          <span className="s1-sparkle s1-sp-cyan" style={{ top: "70%", left: "12%", animationDelay: "3s" }} />
          <span className="s1-sparkle s1-sp-rose" style={{ top: "48%", right: "8%", animationDelay: "3.6s" }} />
          <span className="s1-sparkle" style={{ top: "82%", right: "32%", animationDelay: "4.2s" }} />
          <div className="s1-container">
            {showPresenter ? (
              <Reveal>
                <div className="s1-presenter">
                  {props.profileImageUrl ? (
                    <div className="s1-presenter-imgwrap">
                      <img src={props.profileImageUrl} alt="" className="s1-presenter-img" />
                    </div>
                  ) : null}
                  <div className="s1-presenter-badge">{t.streamerBadge}</div>
                  {props.pseudo ? (
                    <div className="s1-presenter-text">
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
              <h1 className="s1-h1">{showPresenter ? t.streamerH1 : t.h1Line1}</h1>
              <p className="s1-h1-line2">{showPresenter ? t.streamerH2 : t.h1Line2}</p>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="s1-h1-sub">{showPresenter ? t.streamerSub : t.h1Sub}</p>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="s1-hero-cta-wrap">
                <MagneticCta href={affiUrl} label={showPresenter ? t.streamerCta : t.heroCta} />
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

        {/* Streamer exclusives — visible uniquement quand un pseudo est fourni */}
        {showPresenter ? (
          <section className="s1-section s1-stream-section">
            <div className="s1-container">
              <Reveal>
                <h2 className="s1-section-title">{t.streamerExclusivesTitle}</h2>
                <p className="s1-section-sub">{t.streamerExclusivesSub}</p>
              </Reveal>
              <div className="s1-stream-grid">
                {t.streamerExclusives.map((s, i) => (
                  <Reveal key={i} delay={i * 0.08}>
                    <div className="s1-stream-card">
                      <div className="s1-stream-icon">{s.icon}</div>
                      <h3 className="s1-stream-title">{s.title}</h3>
                      <p className="s1-stream-text">{s.text}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        ) : null}

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

        {/* Benefits — Pourquoi Celsius */}
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

        {/* Payments */}
        <section className="s1-section">
          <div className="s1-container">
            <Reveal>
              <h2 className="s1-section-title">{t.paymentsTitle}</h2>
              <p className="s1-section-sub">{t.paymentsNote}</p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="s1-pay-marquee">
                <div className="s1-pay-track">
                  {[...t.payments, ...t.payments].map((p, i) => (
                    <div key={i} className={`s1-pay-chip ${i % 2 === 0 ? "s1-pay-gold" : ""}`}>{p}</div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <FaqSection t={t} />

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

      {/* Sticky bottom CTA — mobile-essential conversion */}
      <div className="s1-sticky-pad" aria-hidden="true" />
      <div className={`s1-sticky-bottom ${stickyShow ? "s1-show" : ""}`}>
        <a
          href={affiUrl}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="s1-sticky-cta"
        >
          {lang === "fr" ? "🎁 Réclamer +500€ + 150 FS" : "🎁 Claim +€500 + 150 FS"}
        </a>
      </div>
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
