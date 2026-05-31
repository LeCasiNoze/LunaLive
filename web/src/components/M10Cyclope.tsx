// ─────────────────────────────────────────────────────────────────────────────
// M10 — Landing statique style "Cyclope l'Héritier" (replique fidele du
// projet Lovable fourni). Layout en sections : header halo rotatif, hero
// card avec sticker + overlay bonus, feed "gains en direct" scrollant,
// FAQ accordeon, final CTA gradient, sticky CTA mobile.
//
// Contrairement aux modeles M3-M9 (interactifs), M10 est STATIQUE :
// pas de mini-jeu, juste une landing copywriting + 1 clic CTA → popup V3.
//
// Aucune image n'est embarquee par defaut : les images (avatar + hero
// jeu) doivent etre fournies par l'editeur via les props.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3VipPopup } from "./V3VipPopup";
import { pseudoTextStyle, pseudoAnimationClass } from "../lib/v3_pseudo_style";
import { V3PseudoKeyframes } from "./V3PseudoKeyframes";
import { V3_POPUP_ENABLED, openAffiLink } from "../lib/v3_popup_flag";

export type M10CyclopeProps = {
  /** Pseudo principal (gros titre, gradient chrome). */
  pseudo?: string;
  /** Sous-titre (sous le pseudo, ex "L'HERITIER"). */
  pseudoSub?: string;
  /** Avatar rond + halo conique rotatif. Si vide, halo seul sans photo. */
  profileImageUrl?: string;
  /** Nb followers affiche dans le pill (ex "250K"). Vide = pill simplifie. */
  followersCount?: string;
  /** Handle social affiche dans le pill (ex "@cyclope"). */
  socialHandle?: string;
  /** Image hero du jeu (chicken / autre). Vide = placeholder. */
  gameImageUrl?: string;
  /** Sticker top hero (ex "🐔 JEU DU POULET"). */
  gameLabel?: string;
  /** % bonus inclus affiche en bas de l'overlay (ex "550%"). */
  gameBonusPct?: string;
  /** Montants standards (utilisees pour le popup + l'overlay). */
  depositAmount?: number | null;
  bonusAmount?: number | null;
  /** Lien d'affiliation cible. */
  affiLink: string;
  /** Theme accent (gardons l'API standard pour cohérence). */
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgPage?: string;
    bgCard?: string;
    borderColor?: string;
  };
  /** Style du pseudo (font / color / size / weight / glow / effect / animation).
   *  Si effect ou animation set, M10 utilise le rendu V3 commun (au lieu de
   *  son chrome cyclope natif). */
  pseudoStyle?: {
    font?: string;
    color?: string;
    size?: "xs" | "s" | "m" | "l" | "xl" | "xxl";
    weight?: "regular" | "bold" | "black";
    glow?: boolean;
    animation?: "none" | "pulse" | "float" | "shimmer" | "glow-breath" | "bounce";
    effect?: "plain" | "shadow" | "outline" | "chrome" | "neon" | "metal" | "sticker" | "pop3d" | "stamp";
  };
  /** Habillage visuel du pseudo (effet texte). */
  pseudoVariant?: "fade" | "outline" | "3d" | "neon" | "stamp" | "gold";
  /** Animation appliquee au pseudo. */
  pseudoAnimation?: "none" | "pulse" | "float" | "glow";
  /** Masque le block VIP (teaser principal + mini sticky). Default false. */
  hideVip?: boolean;
  /** Callback editeur : appelée au clic sur un élément éditable.
   *  Si undefined (rendu final), le clic est inert (sauf CTA). */
  onEditField?: (field: M10EditField) => void;
};

export type M10EditField =
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
    a: "Tu cliques sur le bouton, tu crées ton compte en 30 secondes et tu déposes. Ton bonus est crédité automatiquement, prêt à jouer.",
  },
  {
    q: "Je peux retirer mes gains ?",
    a: "Oui, tous tes gains sont retirables sur ton compte bancaire ou crypto dès que tu respectes les conditions de mise du bonus.",
  },
  {
    q: "C'est légal ?",
    a: "100% légal. Plateforme licenciée et régulée. Réservé aux 18 ans et plus, à jouer avec modération.",
  },
];

const FAKE_GAINS: ReadonlyArray<{ name: string; amount: string; time: string }> = [
  { name: "Léa",     amount: "+1 487€", time: "il y a 2 min"  },
  { name: "Mehdi",   amount: "+2 480€", time: "il y a 4 min"  },
  { name: "Naël",    amount: "+5 120€", time: "il y a 6 min"  },
  { name: "Sofiane", amount: "+780€",   time: "il y a 8 min"  },
  { name: "Inès",    amount: "+1 240€", time: "il y a 11 min" },
  { name: "Yanis",   amount: "+3 650€", time: "il y a 13 min" },
  { name: "Camille", amount: "+920€",   time: "il y a 16 min" },
  { name: "Rayan",   amount: "+4 310€", time: "il y a 19 min" },
  { name: "Manon",   amount: "+1 870€", time: "il y a 22 min" },
  { name: "Anaïs",   amount: "+2 095€", time: "il y a 25 min" },
];

const POPUP_STEPS = [
  "Verification du bonus",
  "Preparation de l'offre",
  "Lien d'inscription pret",
] as const;

export function M10Cyclope({
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
  pseudoVariant,
  pseudoAnimation,
  hideVip,
  onEditField,
}: M10CyclopeProps) {
  // Plumbing click-to-edit (a wirer dans une prochaine iteration sur chaque element)
  void onEditField;
  // Palette : default = Cyclope (rose/or/navy). Si un theme M1 est passe
  // (gold/ruby/emerald/...), on l'utilise pour permettre de re-skin le modele.
  const C = {
    accentHot:  theme?.accent      || "#FF4B6E",
    accentWarm: theme?.accentLight || "#FFB930",
    accentSoft: "#FF8A4B",
    cream:      "#FFE9D6",
    bgDeep:     theme?.bgPage      || "#0B1530",
    bgCard:     theme?.bgCard      || "#0F1B3D",
    glow:       theme?.accentGlow  || "rgba(255,75,110,.55)",
  };

  // Helper : convertit hex (#RRGGBB) en rgba(r,g,b,alpha) — utilise dans les
  // radial gradients du fond pour les rendre theme-aware.
  const hexToRgba = (hex: string, alpha: number): string => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  };
  const bgRgb1 = hexToRgba(C.accentHot, 0.35);
  const bgRgb2 = hexToRgba(C.accentWarm, 0.18);
  const bgRgb3 = hexToRgba(C.accentHot, 0.22);

  // Rendu pseudo : si pseudoStyle.effect ou .animation est set par l'editeur V3,
  // on utilise les helpers communs (pseudoTextStyle + pseudoAnimationClass) pour
  // appliquer l'effet/animation. Sinon, on garde le rendu cyclope natif (fade
  // chrome multi-stop) via les classes m10-name-cyclope / m10-anim-*.
  const useV3Style = !!(pseudoStyle?.effect && pseudoStyle.effect !== "plain") ||
                     !!(pseudoStyle?.animation && pseudoStyle.animation !== "none") ||
                     !!pseudoStyle?.color;
  const v3PseudoStyle = useV3Style
    ? { ...pseudoTextStyle({ ...pseudoStyle, size: pseudoStyle?.size || "xxl" }, C.accentHot), lineHeight: 1.05 }
    : null;
  const v3PseudoAnim = useV3Style ? pseudoAnimationClass(pseudoStyle) : "";

  // Override fallback (mode legacy/cyclope) : SEULEMENT font/size/weight.
  const pseudoOverride: React.CSSProperties = {};
  if (pseudoStyle?.font) {
    // Si la family contient deja quotes/virgules → tel quel, sinon wrap propre.
    pseudoOverride.fontFamily = /[",]/.test(pseudoStyle.font)
      ? pseudoStyle.font
      : `"${pseudoStyle.font}", "Inter", system-ui, sans-serif`;
  }
  if (pseudoStyle?.weight === "bold")    pseudoOverride.fontWeight = 700;
  if (pseudoStyle?.weight === "black")   pseudoOverride.fontWeight = 900;
  if (pseudoStyle?.weight === "regular") pseudoOverride.fontWeight = 500;
  if (pseudoStyle?.size === "xs")  pseudoOverride.fontSize = "1.4rem";
  if (pseudoStyle?.size === "s")   pseudoOverride.fontSize = "1.8rem";
  if (pseudoStyle?.size === "m")   pseudoOverride.fontSize = "2.2rem";
  if (pseudoStyle?.size === "l")   pseudoOverride.fontSize = "2.6rem";
  if (pseudoStyle?.size === "xl")  pseudoOverride.fontSize = "3rem";
  if (pseudoStyle?.size === "xxl") pseudoOverride.fontSize = "3.6rem";

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardScore = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus 100%");
  const popupSteps = React.useMemo(() => Array.from(POPUP_STEPS), []);

  const [openFaq, setOpenFaq] = React.useState<number | null>(0);
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [vipPopupOpen, setVipPopupOpen] = React.useState(false);

  // Feed gains : double la liste pour anim scroll infini
  const gainsLoop = React.useMemo(() => [...FAKE_GAINS, ...FAKE_GAINS], []);

  // Click gated par V3_POPUP_ENABLED. False = redirect direct affi, True = popup.
  const onCtaClick = V3_POPUP_ENABLED
    ? (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); }
    : undefined;
  void openAffiLink;

  return (
    <div className="m10-root">
      <style>{`
        .m10-root{position:relative;min-height:100vh;overflow-x:hidden;background:
          radial-gradient(110% 55% at 50% -10%,${bgRgb1} 0%,${bgRgb2} 35%,transparent 70%),
          radial-gradient(80% 45% at 50% 110%,${bgRgb3} 0%,transparent 70%),
          ${C.bgDeep};
          font-family:'Space Grotesk','DM Sans',-apple-system,sans-serif;color:#fff;padding-bottom:160px}
        .m10-layer{position:relative;z-index:10}

        /* ─── Header ─── */
        .m10-header{position:relative;width:100%;padding:24px 20px 14px;display:flex;flex-direction:column;align-items:center;text-align:center}
        .m10-avatar-wrap{position:relative;width:100px;height:100px}
        .m10-avatar-halo{position:absolute;inset:-12px;border-radius:50%;background:conic-gradient(from 0deg,${C.accentHot},${C.accentWarm},${C.accentHot},${C.accentSoft},${C.accentHot});filter:blur(14px);opacity:.9;animation:m10-spin 8s linear infinite;pointer-events:none}
        .m10-avatar{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;border:3px solid #fff;box-shadow:0 0 0 2px ${C.accentHot},0 10px 30px ${C.glow};background:linear-gradient(135deg,${C.bgCard},${C.bgDeep})}
        .m10-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m10-avatar-empty{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:2.4rem;color:rgba(255,255,255,.25)}

        .m10-name{margin:8px 0 0;line-height:.95;font-family:'Bagel Fat One',cursive;font-size:2.6rem;letter-spacing:.02em;padding-bottom:.1em}
        /* === fade : gradient chrome blanc → cream → or → rose → blanc.
            Recopie EXACTE de la source Cyclope (Lovable). === */
        .m10-name-fade{
          background:linear-gradient(180deg,#ffffff 0%,#FFE9D6 25%,#FFB930 55%,#FF4B6E 85%,#ffffff 100%);
          -webkit-background-clip:text;background-clip:text;
          -webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 0 rgba(255,75,110,.55)) drop-shadow(0 0 14px rgba(255,185,48,.5));
        }
        /* === outline : couleur pleine + contour fin pour rester lisible === */
        .m10-name-outline{color:#fff;-webkit-text-stroke:2px ${C.accentHot};text-shadow:0 0 22px ${C.accentHot}99}
        /* === 3d : ombre dure compacte 3 couches, lisible === */
        .m10-name-3d{color:${C.accentWarm};text-shadow:2px 2px 0 ${C.accentHot},4px 4px 0 ${C.accentHot}aa,6px 6px 8px rgba(0,0,0,.5)}
        /* === neon : lettres blanches + halo accent, ultra lisible === */
        .m10-name-neon{color:#fff;text-shadow:0 0 10px #fff,0 0 22px ${C.accentHot},0 0 44px ${C.accentHot}aa}
        /* === stamp : couleur pleine + ombre or décalée + tilt léger === */
        .m10-name-stamp{color:${C.accentHot};text-shadow:5px 5px 0 ${C.accentWarm}aa;display:inline-block;transform:rotate(-2deg)}
        /* === gold : doré uni avec drop-shadow brun, type sticker === */
        .m10-name-gold{color:${C.accentWarm};text-shadow:0 3px 0 ${C.accentHot}88,0 0 18px ${C.accentWarm}80}
        /* Animations */
        .m10-anim-pulse{animation:m10-name-pulse 1.8s ease-in-out infinite}
        .m10-anim-float{animation:m10-name-float 3s ease-in-out infinite}
        .m10-anim-glow{filter:drop-shadow(0 0 12px ${C.accentHot}99);animation:m10-name-glow 2.2s ease-in-out infinite}
        /* Ligne 2 : SOLIDE cream + letterspaced + small (style exact source Cyclope) */
        /* Sub inline DANS le h1 → font-size en em = ratio fixe vs pseudo,
           peu importe la taille du pseudo (xs ou xxl). */
        .m10-name-line2-inline{display:block;margin-top:.45em;font-family:'Space Grotesk',sans-serif;
          font-size:.3em;font-weight:800;letter-spacing:.3em;text-transform:uppercase;
          color:${C.cream};text-shadow:0 0 12px ${C.accentWarm}80;line-height:1;
          /* Si parent h1 a un effet chrome/gradient, on rend la sub en couleur unie */
          background:none;-webkit-background-clip:border-box;background-clip:border-box;
          -webkit-text-fill-color:${C.cream};filter:none;animation:none}
        /* Legacy class encore utilisee si pseudoSub est rendu separement */
        .m10-name-line2{margin:.35em 0 0;font-family:'Space Grotesk',sans-serif;font-size:.85rem;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:${C.cream};text-shadow:0 0 12px ${C.accentWarm}80;line-height:1}
        .m10-pill{margin-top:12px;display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.08);backdrop-filter:blur(10px);border:1px solid ${C.accentWarm}66;box-shadow:0 2px 14px ${C.glow}26;font-size:.72rem;font-weight:600;color:#fff}
        .m10-pill-dot{width:4px;height:4px;border-radius:50%;background:${C.cream}66}
        .m10-pill-count{font-weight:800;font-size:.78rem;color:#fff}
        .m10-pill-count em{font-style:normal;font-size:.6rem;letter-spacing:.16em;font-weight:700;color:${C.cream}b3;margin-left:4px}

        /* ─── Hero section (copie EXACTE de la source Cyclope) ─── */
        .m10-hero{width:100%;padding:8px 20px 20px}
        .m10-hero-card{position:relative;display:block;max-width:380px;margin:0 auto;border-radius:28px;overflow:hidden;border:2px solid rgba(255,185,48,.45);box-shadow:0 20px 60px rgba(255,75,110,.55),0 0 0 3px rgba(255,255,255,.08),0 0 70px rgba(255,185,48,.45);cursor:pointer;transition:transform .12s ease}
        /* Sticker top-left tilté (source Cyclope) */
        .m10-hero-sticker{position:absolute;top:12px;left:12px;padding:6px 12px;border-radius:999px;background:#fff;border:1.5px solid rgba(255,75,110,.45);box-shadow:0 4px 12px rgba(255,75,110,.25);transform:rotate(-6deg);font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:.78rem;color:#B91C3C;letter-spacing:.1em;z-index:3}
        .m10-hero-card:active{transform:scale(.98)}
        .m10-hero-img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
        .m10-hero-placeholder{width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.28);font-size:3.5rem;background:radial-gradient(circle at 50% 40%,${C.accentHot}33,transparent 60%),${C.bgCard}}
        /* Overlay promesse — exact replica source */
        .m10-hero-overlay{position:absolute;left:0;right:0;bottom:0;padding:56px 20px 24px;background:linear-gradient(to top,rgba(11,21,48,.97) 0%,rgba(11,21,48,.82) 55%,transparent 100%);text-align:center;pointer-events:none}
        .m10-hero-pre{margin:0;color:#fff;font-family:'Space Grotesk',sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.2em;opacity:.95}
        .m10-hero-prize{margin:4px 0 0;line-height:1;font-family:'Bagel Fat One',cursive;font-size:3rem;background:linear-gradient(180deg,#fff 0%,${C.accentWarm} 55%,${C.accentHot} 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}
        .m10-hero-sub{margin:6px 0 0;text-align:center;font-family:'Space Grotesk',sans-serif;font-size:.65rem;font-weight:600;letter-spacing:.1em;color:rgba(255,233,214,.65)}

        /* ─── Gains feed ─── */
        .m10-gains{width:100%;padding:8px 20px 24px}
        .m10-gains-inner{max-width:380px;margin:0 auto}
        .m10-gains-title-wrap{position:relative;display:flex;justify-content:center;margin-bottom:20px}
        .m10-gains-aura{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
        .m10-gains-aura::before{content:"";width:260px;height:80px;border-radius:999px;background:radial-gradient(closest-side,${C.accentWarm}73,${C.accentHot}40 55%,transparent 75%);filter:blur(18px);animation:m10-aura 2.8s ease-in-out infinite}
        .m10-gains-title{position:relative;font-weight:900;font-size:1.35rem;letter-spacing:.14em;color:${C.accentWarm};text-shadow:0 0 18px ${C.accentWarm}80;text-transform:uppercase;animation:m10-title-pulse 2.2s ease-in-out infinite;display:inline-block}
        .m10-gains-title::before{content:"🔴 ";display:inline-block;animation:m10-dot 1.2s ease-in-out infinite}
        .m10-gains-scroll{position:relative;height:260px;overflow:hidden;mask-image:linear-gradient(to bottom,transparent 0%,#000 12%,#000 88%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 12%,#000 88%,transparent 100%)}
        .m10-gains-list{display:flex;flex-direction:column;gap:8px;animation:m10-gains-scroll 28s linear infinite}
        .m10-gain-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid ${C.accentWarm}2e;box-shadow:0 2px 12px rgba(0,0,0,.25);backdrop-filter:blur(10px)}
        .m10-gain-ava{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:.85rem;flex-shrink:0;background:linear-gradient(135deg,${C.accentHot},${C.accentSoft});border:1.5px solid rgba(255,255,255,.9)}
        .m10-gain-info{flex:1;min-width:0}
        .m10-gain-name{font-size:.85rem;font-weight:700;color:#fff;margin:0}
        .m10-gain-time{font-size:.66rem;font-weight:600;color:${C.cream}a6;margin:2px 0 0}
        .m10-gain-amount{font-family:'Bagel Fat One',cursive;font-size:1.05rem;color:${C.accentWarm};text-shadow:0 0 14px ${C.accentWarm}8c}

        /* ─── FAQ ─── */
        .m10-faq{width:100%;padding:24px 20px 8px}
        .m10-faq-inner{max-width:380px;margin:0 auto}
        .m10-faq-title{text-align:center;margin:0 0 20px;font-family:'Bagel Fat One',cursive;font-size:1.6rem;background:linear-gradient(180deg,${C.accentWarm} 0%,${C.accentHot} 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 0 ${C.accentHot}4d)}
        .m10-faq-item{margin-bottom:8px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid ${C.accentWarm}2e;box-shadow:0 4px 18px rgba(0,0,0,.25);backdrop-filter:blur(10px);overflow:hidden}
        .m10-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:transparent;border:none;color:#fff;font-weight:700;font-size:.88rem;text-align:left;cursor:pointer;font-family:inherit}
        .m10-faq-q-icon{font-size:.85rem;color:${C.accentWarm};transition:transform .25s ease;flex-shrink:0;margin-left:10px}
        .m10-faq-item.open .m10-faq-q-icon{transform:rotate(180deg)}
        .m10-faq-a{padding:0 16px 14px;font-size:.85rem;color:${C.cream}cc;line-height:1.5;display:none}
        .m10-faq-item.open .m10-faq-a{display:block}

        /* ─── Final CTA ─── */
        .m10-final{width:100%;padding:28px 20px 12px}
        .m10-final-inner{max-width:380px;margin:0 auto}
        .m10-cta{position:relative;display:flex;align-items:center;justify-content:center;width:100%;padding:20px;border-radius:18px;overflow:hidden;font-family:'Bagel Fat One',cursive;font-size:1.4rem;letter-spacing:.05em;color:#fff;background:linear-gradient(135deg,${C.accentHot} 0%,${C.accentSoft} 50%,${C.accentWarm} 100%);border:2px solid #fff;box-shadow:0 0 40px ${C.glow}cc,0 14px 32px ${C.accentHot}73,inset 0 1px 0 rgba(255,255,255,.9);text-shadow:0 2px 0 rgba(155,28,53,.55);text-decoration:none;cursor:pointer;transition:transform .12s ease;font-weight:400}
        .m10-cta:active{transform:scale(.97)}
        .m10-cta-sub{margin-top:10px;text-align:center;font-size:.72rem;font-weight:600;color:${C.cream}}
        /* VIP teaser (remplace l'inscription 30s) : visible, glow, click ouvre popup VIP */
        .m10-vip-teaser{display:flex;align-items:center;justify-content:center;gap:8px;margin:12px auto 0;padding:10px 18px;
          border:none;cursor:pointer;font-family:inherit;
          background:linear-gradient(135deg,${C.accentWarm}22,${C.accentHot}22);
          border:1px solid ${C.accentWarm}88;border-radius:999px;
          color:${C.cream};font-size:.78rem;font-weight:800;letter-spacing:.04em;
          text-shadow:0 0 12px ${C.accentWarm}99;
          transition:transform .15s,background .25s,border-color .25s,box-shadow .25s;
          box-shadow:0 4px 18px ${C.glow}55,inset 0 1px 0 rgba(255,255,255,.15)}
        .m10-vip-teaser:hover{transform:translateY(-1px);
          background:linear-gradient(135deg,${C.accentWarm}44,${C.accentHot}44);
          box-shadow:0 8px 24px ${C.accentWarm}aa,inset 0 1px 0 rgba(255,255,255,.25)}
        .m10-vip-teaser-crown{font-size:1rem;animation:m10-vip-crown 2.4s ease-in-out infinite}
        .m10-vip-teaser-arrow{font-size:.95rem;opacity:.8;transition:transform .2s}
        .m10-vip-teaser:hover .m10-vip-teaser-arrow{transform:translateX(3px)}
        @keyframes m10-vip-crown{0%,100%{transform:rotate(-6deg) scale(1)}50%{transform:rotate(6deg) scale(1.12)}}

        /* VIP teaser band : section pleine largeur avant FAQ, centree, visible */
        .m10-vip-band{width:100%;padding:24px 20px 4px;display:flex;justify-content:center;max-width:420px;margin:0 auto}

        /* VIP teaser mini : sous le sticky CTA, ligne discrete tap-to-VIP */
        .m10-vip-teaser-mini{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;max-width:380px;margin:8px auto 0;padding:7px 14px;
          border:none;cursor:pointer;font-family:inherit;
          background:transparent;
          color:${C.cream};opacity:.78;font-size:.7rem;font-weight:700;letter-spacing:.06em;
          text-decoration:underline;text-decoration-color:${C.accentWarm}55;text-underline-offset:3px;
          transition:opacity .2s,color .2s,text-decoration-color .2s}
        .m10-vip-teaser-mini:hover{opacity:1;color:${C.accentWarm};text-decoration-color:${C.accentWarm}}
        .m10-vip-teaser-mini-crown{font-size:.85rem;opacity:.85}

        /* ─── Sticky mobile CTA ─── */
        .m10-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 16px 18px;background:linear-gradient(to top,${C.bgDeep} 55%,${C.bgDeep}d9 85%,transparent)}
        .m10-sticky-cta{position:relative;display:flex;align-items:center;justify-content:center;width:100%;max-width:380px;margin:0 auto;padding:18px;border-radius:18px;font-family:'Bagel Fat One',cursive;font-size:1.3rem;letter-spacing:.05em;color:#fff;background:linear-gradient(135deg,${C.accentHot} 0%,${C.accentSoft} 50%,${C.accentWarm} 100%);border:2px solid #fff;box-shadow:0 0 36px ${C.glow}d9,0 12px 28px ${C.accentHot}80,inset 0 1px 0 rgba(255,255,255,.9);text-shadow:0 2px 0 rgba(155,28,53,.55);text-decoration:none;cursor:pointer;animation:m10-cta-pulse 2.4s ease-in-out infinite;transition:transform .12s ease;font-weight:400}
        .m10-sticky-cta:active{transform:scale(.95)}
        .m10-sticky-sub{margin-top:6px;text-align:center;font-size:.66rem;font-weight:600;color:${C.cream}}

        /* ─── Footer ─── */
        .m10-footer{padding:24px 20px 36px;text-align:center;color:${C.cream}b3;font-size:.7rem;line-height:1.5}
        .m10-footer-name{font-family:'Bagel Fat One',cursive;font-size:1.1rem;color:${C.cream};margin-bottom:10px;letter-spacing:.04em}
        .m10-footer-legal{color:${C.cream}b3;font-size:.7rem;margin:6px 0;line-height:1.5}
        .m10-footer-legal strong{font-weight:700;color:#fff}
        .m10-footer-mention{margin-top:8px;font-size:.65rem;color:${C.cream}80}

        /* ─── Animations ─── */
        @keyframes m10-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes m10-name-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes m10-name-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes m10-name-glow{0%,100%{filter:drop-shadow(0 0 12px ${C.accentHot}99)}50%{filter:drop-shadow(0 0 26px ${C.accentWarm}) drop-shadow(0 0 8px ${C.accentHot})}}
        @keyframes m10-name-holo-shift{from{background-position:0% 50%}to{background-position:300% 50%}}
        @keyframes m10-aura{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.95;transform:scale(1.08)}}
        @keyframes m10-title-pulse{0%,100%{transform:scale(1);text-shadow:0 0 18px ${C.accentWarm}80}50%{transform:scale(1.04);text-shadow:0 0 28px ${C.accentWarm}e6,0 0 8px ${C.accentHot}99}}
        @keyframes m10-dot{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes m10-gains-scroll{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}
        @keyframes m10-cta-pulse{0%,100%{box-shadow:0 0 36px ${C.glow}d9,0 12px 28px ${C.accentHot}80,inset 0 1px 0 rgba(255,255,255,.9)}50%{box-shadow:0 0 60px ${C.accentWarm}f2,0 12px 28px ${C.accentHot}80,inset 0 1px 0 rgba(255,255,255,1)}}
        @media (prefers-reduced-motion:reduce){
          .m10-avatar-halo,.m10-gains-aura::before,.m10-gains-list,.m10-gains-title,.m10-sticky-cta{animation:none !important}
        }
      `}</style>

      <div className="m10-layer">
        {/* Header */}
        <header className="m10-header">
          {profileImageUrl ? (
            <div className="m10-avatar-wrap">
              <div className="m10-avatar-halo" />
              <div className="m10-avatar">
                <img src={profileImageUrl} alt={pseudo || "Avatar"} />
              </div>
            </div>
          ) : null}
          {pseudo ? (
            useV3Style ? (
              <h1 className={`m10-name ${v3PseudoAnim}`} style={v3PseudoStyle || undefined}>
                {pseudo}
                {pseudoSub ? <span className="m10-name-line2-inline">{pseudoSub}</span> : null}
              </h1>
            ) : (
              <h1
                className={`m10-name m10-name-${pseudoVariant || "fade"} m10-anim-${pseudoAnimation || "none"}`}
                style={pseudoOverride}
              >
                {pseudo}
                {pseudoSub ? <span className="m10-name-line2-inline">{pseudoSub}</span> : null}
              </h1>
            )
          ) : null}
          {(socialHandle || followersCount) ? (
            <div className="m10-pill">
              {socialHandle ? <span>{socialHandle}</span> : null}
              {socialHandle && followersCount ? <span className="m10-pill-dot" /> : null}
              {followersCount ? (
                <span className="m10-pill-count">
                  {followersCount}<em>FOLLOWERS</em>
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

        {/* Hero — copie exacte de CyclopeHero.tsx (overlay bas) */}
        <section className="m10-hero">
          <a className="m10-hero-card v3-cta" href={safeAffi} target="_blank" rel="noopener noreferrer" onClick={onCtaClick}>
            {gameImageUrl ? (
              <img className="m10-hero-img" src={gameImageUrl} alt="Jeu bonus" />
            ) : (
              <div className="m10-hero-placeholder">🎰</div>
            )}
            {gameLabel ? <div className="m10-hero-sticker">{gameLabel}</div> : null}
            <div className="m10-hero-overlay">
              <p className="m10-hero-pre">{dep ? `DÉPOSE ${dep} → REÇOIS` : "RÉCLAME TON BONUS"}</p>
              <p className="m10-hero-prize">{bon ? `${bon} GRATUITS` : "BONUS"}</p>
              {gameBonusPct ? <p className="m10-hero-sub">+ {gameBonusPct} bonus inclus</p> : null}
            </div>
          </a>
        </section>

        {/* Gains feed */}
        <section className="m10-gains">
          <div className="m10-gains-inner">
            <div className="m10-gains-title-wrap">
              <div className="m10-gains-aura" />
              <h2 className="m10-gains-title">· GAINS EN DIRECT ·</h2>
            </div>
            <div className="m10-gains-scroll">
              <div className="m10-gains-list">
                {gainsLoop.map((g, i) => (
                  <div key={i} className="m10-gain-row">
                    <div className="m10-gain-ava">{g.name[0]}</div>
                    <div className="m10-gain-info">
                      <p className="m10-gain-name">{g.name}</p>
                      <p className="m10-gain-time">{g.time}</p>
                    </div>
                    <div className="m10-gain-amount">{g.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* VIP teaser principal — juste avant la FAQ pour capter l'attention */}
        {!hideVip ? (
          <section className="m10-vip-band">
            <button
              type="button"
              className="m10-vip-teaser"
              onClick={() => setVipPopupOpen(true)}
            >
              <span className="m10-vip-teaser-crown">👑</span>
              Vous êtes un gros joueur ? Demandez votre traitement spécial
              <span className="m10-vip-teaser-arrow">→</span>
            </button>
          </section>
        ) : null}

        {/* FAQ */}
        <section className="m10-faq">
          <div className="m10-faq-inner">
            <h2 className="m10-faq-title">QUESTIONS</h2>
            {DEFAULT_FAQS.map((f, i) => (
              <div key={i} className={`m10-faq-item ${openFaq === i ? "open" : ""}`}>
                <button
                  type="button"
                  className="m10-faq-q"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{f.q}</span>
                  <span className="m10-faq-q-icon">▾</span>
                </button>
                <div className="m10-faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="m10-final">
          <div className="m10-final-inner">
            <a className="m10-cta v3-cta" href={safeAffi} target="_blank" rel="noopener noreferrer" onClick={onCtaClick}>
              🚀 JE PRENDS {bon ? `MES ${bon}` : "MON BONUS"}
            </a>
            <p className="m10-cta-sub">Inscription en 30s · Bonus crédité automatiquement</p>
          </div>
        </section>

        {/* Footer */}
        <footer className="m10-footer">
          {pseudo ? <div className="m10-footer-name">{pseudo}{socialHandle ? ` · ${socialHandle}` : ""}</div> : null}
          <p className="m10-footer-legal">
            Les jeux d'argent et de hasard sont strictement interdits aux mineurs de 18 ans.
          </p>
          <p className="m10-footer-legal">
            Jouer comporte des risques : endettement, isolement, dépendance. Pour être aidé,
            appelez le <strong>09 74 75 13 13</strong> (appel non surtaxé) ou rendez-vous sur{" "}
            <strong>joueurs-info-service.fr</strong>.
          </p>
          <p className="m10-footer-legal">Jouez responsablement, dans la modération et pour le plaisir.</p>
          <p className="m10-footer-mention">
            © {new Date().getFullYear()} — Page affiliée. Contient des liens commerciaux.
          </p>
        </footer>
      </div>

      {/* Sticky CTA mobile */}
      <div className="m10-sticky">
        <a className="m10-sticky-cta v3-cta" href={safeAffi} target="_blank" rel="noopener noreferrer" onClick={onCtaClick}>
          🚀 JE PRENDS {bon ? `MES ${bon}` : "MON BONUS"}
        </a>
        {/* VIP teaser discret sous le sticky CTA (toujours accessible) */}
        {!hideVip ? (
          <button
            type="button"
            className="m10-vip-teaser-mini"
            onClick={() => setVipPopupOpen(true)}
          >
            <span className="m10-vip-teaser-mini-crown">👑</span>
            Gros joueur ? Accès VIP
          </button>
        ) : null}
      </div>

      {/* Popup conserve via flag V3_POPUP_ENABLED. Flippe pour reactiver. */}
      <V3OfferPopup
        open={V3_POPUP_ENABLED && popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: C.accentHot, accentLight: C.accentWarm, accentGlow: C.glow, bgCard: C.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />

      {/* Popup VIP gros joueur : composant dedie V3VipPopup (UI simple cohherente) */}
      <V3VipPopup
        open={vipPopupOpen}
        onClose={() => setVipPopupOpen(false)}
        theme={{ accent: C.accentWarm, accentLight: C.cream, accentGlow: C.glow, bgCard: C.bgCard }}
        href={safeAffi}
        title="Programme VIP exclusif"
        subtitle="Tu déposes 500€ à 1 000€ par mois (ou plus) ? Laisse ton email et un host dédié te contacte sous 24h avec une offre personnalisée."
      />

      {/* V3SocialProof retire — les toasts 'X a debloque' parasitaient l'attention */}
      <V3PseudoKeyframes />
    </div>
  );
}
