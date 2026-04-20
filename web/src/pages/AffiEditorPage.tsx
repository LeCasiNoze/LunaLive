// web/src/pages/AffiEditorPage.tsx
// Éditeur de templates d'affiliation — accessible sur /editorFSN
// Aucun topbar ni footer : la page prend tout l'écran.

import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { canAccessFsbBoard } from "../lib/fsb_access";
import {
  createFsbAffiPage,
  deleteFsbAffiPage,
  listFsbAffiPages,
  type FsbAffiPage,
  updateFsbAffiPage,
} from "../lib/api_affi_pages";

// Base publique pour les URLs partageables (/r/...). Toujours lunalive.win.
const PUBLIC_SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? "https://lunalive.win").replace(/\/$/, "");

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Config {
  // Colors
  bgPage: string;
  bgCard: string;
  brandGold: string;
  brandRuby: string;
  casinoGreen: string;
  borderColor: string;
  // Image / link
  imgUrl: string;
  imgUrl1: string; // model4 card1
  imgUrl2: string; // model4 card2
  affiLink: string;
  // Offer
  offerTitle: string;
  depositText: string;
  receiveText: string;
  depositText2: string; // model4 card2
  receiveText2: string;
  // Texts
  badgeText: string;
  heroTitleBefore: string;
  heroTitleSpan: string;
  heroSubtitle: string;
  btnText: string;
  stickyText: string;
  casinoName: string;
  pageTitle: string;
  goldenBrandMain: string;
  goldenBrandSub: string;
  goldenHeroTitleBefore: string;
  goldenHeroTitleSpan: string;
  goldenHeroSubtitle: string;
  goldenPageTitle: string;
  goldenChestUrl: string;
  goldenGameImageUrl: string;
  goldenVisualMode: string;
  goldenBackgroundUrl: string;
  goldenCtaPosition: string; // "top" | "bottom"
  // Montants affichés (model 5)
  goldenDepositAmount: string;  // ex: "20"
  goldenBonusAmount: string;    // ex: "20"
  goldenTotalAmount: string;    // ex: "40"
  // Typography — base (all breakpoints)
  t_brandFs: string;
  t_brandFf: string;
  t_brandLs: string;
  t_brandColor: string;
  t_titleFs: string;
  t_titleFf: string;
  t_titleLs: string;
  t_titleColor: string;
  t_subFs: string;
  t_subFf: string;
  t_subLs: string;
  t_subColor: string;
  t_ctaFs: string;
  t_ctaFf: string;
  t_ctaLs: string;
  // Typography — mobile overrides (max-width: 720px)
  t_brandFsM: string;
  t_titleFsM: string;
  t_subFsM: string;
  t_ctaFsM: string;
  // Typography — desktop overrides (min-width: 721px)
  t_brandFsD: string;
  t_titleFsD: string;
  t_subFsD: string;
  t_ctaFsD: string;
  // Position offsets in px
  p_brandX: string;
  p_brandY: string;
  p_offerX: string;
  p_offerY: string;
  p_ctaX: string;
  p_ctaY: string;
  // Boutons custom (JSON-stringified array de AffiButton)
  customButtonsJson: string;
}

// ─── Custom buttons ───────────────────────────────────────────────────────────

export interface AffiButton {
  id: string;
  label: string;
  link: string;
  imageUrl: string;
  bgColor: string;
  textColor: string;
  xPct: number;
  yPct: number;
  widthPx: number;
  heightPx: number;
  borderRadius: number;
  fontSize: number;
  objectFit: "contain" | "cover" | "fill";
  transparent?: boolean;
  // Style avancé (utilisé par le bouton "Dupliquer RÉCLAME" pour coller au sticky-cta)
  gradientDark?: string;        // ex: "#856128" (extrémités du gradient)
  gradientLight?: string;       // ex: "#f0c84a" (surbrillance au milieu)
  glow?: boolean;               // ajoute le box-shadow glow + inset highlight
  letterSpacingEm?: number;     // ex: 0.16
  fontFamily?: string;          // ex: "'Bebas Neue', sans-serif"
}

function makeButtonId(): string {
  return `btn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(255,215,0,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function defaultAffiButton(): AffiButton {
  return {
    id: makeButtonId(),
    label: "",
    link: "",
    imageUrl: "",
    bgColor: "#000000",
    textColor: "#ffffff",
    xPct: 35,
    yPct: 5,
    widthPx: 220,
    heightPx: 160,
    borderRadius: 12,
    fontSize: 18,
    objectFit: "contain",
    transparent: true,   // défaut : pas de fond — idéal pour une image PNG transparente
  };
}

// Couleurs d'accent par variant (extraites de model5.html)
const VARIANT_ACCENTS: Record<string, { main: string; light: string; dark: string; contrast: string }> = {
  gold:     { main: "#d4a843", light: "#f0c84a", dark: "#856128", contrast: "#0a0910" },
  ruby:     { main: "#bf6861", light: "#dc9388", dark: "#6f332c", contrast: "#130507" },
  emerald:  { main: "#69b98d", light: "#8ad6a8", dark: "#2f694e", contrast: "#041008" },
  sapphire: { main: "#6f96cf", light: "#96b7e8", dark: "#2d4b78", contrast: "#050a12" },
  amethyst: { main: "#b06fd8", light: "#cc94f0", dark: "#5a2d7a", contrast: "#0d041a" },
  obsidian: { main: "#c9aa60", light: "#e8cc7a", dark: "#7a6528", contrast: "#0f0b04" },
  rose:     { main: "#e87aaa", light: "#f5a0c4", dark: "#8a3060", contrast: "#130a10" },
  jade:     { main: "#5cb87a", light: "#7ed898", dark: "#2a6640", contrast: "#080f0c" },
};

function accentsForVariant(variant?: string) {
  return VARIANT_ACCENTS[String(variant || "gold").toLowerCase()] || VARIANT_ACCENTS.gold;
}

/** Crée un bouton style "RÉCLAME TES XX€ OFFERTS" avec exactement la même palette
 *  + effets (gradient 5-stops, glow, letter-spacing, Bebas Neue) que le sticky-cta
 *  du variant actuel. Tous les champs restent éditables après création. */
export function duplicateMainCtaButton(bonusAmount?: string, affiLink?: string, variant?: string): AffiButton {
  const amount = (bonusAmount || "20").trim() || "20";
  const a = accentsForVariant(variant);
  return {
    id: makeButtonId(),
    label: `RÉCLAME TES ${amount}€ OFFERTS`,
    link: affiLink || "",
    imageUrl: "",
    bgColor: a.main,
    textColor: a.contrast,
    xPct: 10,
    yPct: 80,
    widthPx: 360,
    heightPx: 60,
    borderRadius: 18,
    fontSize: 20,
    objectFit: "cover",
    transparent: false,
    gradientDark: a.dark,
    gradientLight: a.light,
    glow: true,
    letterSpacingEm: 0.16,
    fontFamily: "'Bebas Neue', system-ui, sans-serif",
  };
}

function isValidHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function parseAffiButtons(json: string | undefined | null): AffiButton[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((b) => b && typeof b === "object" && typeof b.id === "string")
      .map((b) => ({
        ...b,
        // Normalise les couleurs pour que le <input type="color"> ne crashe pas
        bgColor: isValidHexColor(b.bgColor) ? b.bgColor : "#000000",
        textColor: isValidHexColor(b.textColor) ? b.textColor : "#ffffff",
      }));
  } catch {
    return [];
  }
}

export function stringifyAffiButtons(btns: AffiButton[]): string {
  return JSON.stringify(btns);
}

type GoldenChanceVariant = "gold" | "ruby" | "emerald" | "sapphire" | "amethyst" | "obsidian" | "rose" | "jade";

const DEFAULT_CONFIG: Config = {
  bgPage: "#080212",
  bgCard: "#150821",
  brandGold: "#FFD700",
  brandRuby: "#E0115F",
  casinoGreen: "#00E676",
  borderColor: "#331A47",
  imgUrl: "",
  imgUrl1: "",
  imgUrl2: "",
  affiLink: "",
  offerTitle: "Offre de Bienvenue",
  depositText: "Déposez 10€",
  receiveText: "Recevez 20€",
  depositText2: "Déposez 20€",
  receiveText2: "Recevez 40€",
  badgeText: "Club VIP Certifié",
  heroTitleBefore: "Accès VIP : Doublez votre capital",
  heroTitleSpan: "immédiatement.",
  heroSubtitle:
    "Rejoignez un cercle de jeu exclusif et régulé. Votre premier dépôt est doublé automatiquement sur votre solde en toute discrétion et sécurité.",
  btnText: "JOUER",
  stickyText: "🎰 JOUER MAINTENANT",
  casinoName: "Celsius Games",
  pageTitle: "Offre VIP | Jouer Maintenant",
  goldenBrandMain: "LeCasiNoze",
  goldenBrandSub: "",
  // Par défaut vides → applyConfig utilise les montants (goldenDepositAmount/Bonus/Total)
  // Remplir uniquement pour surcharger avec un texte totalement custom.
  goldenHeroTitleBefore: "",
  goldenHeroTitleSpan: "",
  goldenHeroSubtitle: "",
  goldenPageTitle: "LeCasiNoze - Dépose 20€, joue avec 40€",
  goldenChestUrl: "",
  goldenGameImageUrl: "",
  goldenVisualMode: "chest",
  goldenBackgroundUrl: "",
  goldenCtaPosition: "top",
  // Montants
  goldenDepositAmount: "20",
  goldenBonusAmount: "20",
  goldenTotalAmount: "40",
  // Typography base
  t_brandFs: "",
  t_brandFf: "",
  t_brandLs: "",
  t_brandColor: "",
  t_titleFs: "",
  t_titleFf: "",
  t_titleLs: "",
  t_titleColor: "",
  t_subFs: "",
  t_subFf: "",
  t_subLs: "",
  t_subColor: "",
  t_ctaFs: "",
  t_ctaFf: "",
  t_ctaLs: "",
  // Mobile overrides
  t_brandFsM: "",
  t_titleFsM: "",
  t_subFsM: "",
  t_ctaFsM: "",
  // Desktop overrides
  t_brandFsD: "",
  t_titleFsD: "",
  t_subFsD: "",
  t_ctaFsD: "",
  // Position offsets
  p_brandX: "",
  p_brandY: "",
  p_offerX: "",
  p_offerY: "",
  p_ctaX: "",
  p_ctaY: "",
  customButtonsJson: "",
};

// ─── TYPOGRAPHY / CSS VARS ───────────────────────────────────────────────────

const FONT_MAP: Record<string, string> = {
  "Cinzel": "Cinzel:wght@400;600;700",
  "Bebas Neue": "Bebas+Neue",
  "Oswald": "Oswald:wght@400;500;700",
  "Montserrat": "Montserrat:wght@400;600;700;800",
  "Playfair Display": "Playfair+Display:wght@700;900",
  "Raleway": "Raleway:wght@400;600;700;800",
  "Inter": "Inter:wght@400;500;600;700;800",
  "Anton": "Anton",
  "Roboto Condensed": "Roboto+Condensed:wght@400;700",
};

export const FONT_NAMES = Object.keys(FONT_MAP);

function buildCustomVarsCSS(cfg: Config): string {
  const lines: string[] = [];

  // Helper: push a base :root declaration
  const base = (prop: string, val: string) => {
    if (val) lines.push(`:root { ${prop}: ${val}; }`);
  };
  // Helper: push a @media mobile override
  const mobile = (prop: string, val: string) => {
    if (val) lines.push(`@media (max-width: 720px) { :root { ${prop}: ${val}; } }`);
  };
  // Helper: push a @media desktop override
  const desktop = (prop: string, val: string) => {
    if (val) lines.push(`@media (min-width: 721px) { :root { ${prop}: ${val}; } }`);
  };

  // Font-size: base + mobile + desktop variants
  base("--cu-brand-fs", cfg.t_brandFs);
  mobile("--cu-brand-fs", cfg.t_brandFsM);
  desktop("--cu-brand-fs", cfg.t_brandFsD);

  base("--cu-title-fs", cfg.t_titleFs);
  mobile("--cu-title-fs", cfg.t_titleFsM);
  desktop("--cu-title-fs", cfg.t_titleFsD);

  base("--cu-sub-fs", cfg.t_subFs);
  mobile("--cu-sub-fs", cfg.t_subFsM);
  desktop("--cu-sub-fs", cfg.t_subFsD);

  base("--cu-cta-fs", cfg.t_ctaFs);
  mobile("--cu-cta-fs", cfg.t_ctaFsM);
  desktop("--cu-cta-fs", cfg.t_ctaFsD);

  // Font-family, letter-spacing, color — base only
  base("--cu-brand-ff", cfg.t_brandFf ? `"${cfg.t_brandFf}", sans-serif` : "");
  base("--cu-brand-ls", cfg.t_brandLs);
  base("--cu-brand-color", cfg.t_brandColor);

  base("--cu-title-ff", cfg.t_titleFf ? `"${cfg.t_titleFf}", sans-serif` : "");
  base("--cu-title-ls", cfg.t_titleLs);
  base("--cu-title-color", cfg.t_titleColor);

  base("--cu-sub-ff", cfg.t_subFf ? `"${cfg.t_subFf}", sans-serif` : "");
  base("--cu-sub-ls", cfg.t_subLs);
  base("--cu-sub-color", cfg.t_subColor);

  base("--cu-cta-ff", cfg.t_ctaFf ? `"${cfg.t_ctaFf}", sans-serif` : "");
  base("--cu-cta-ls", cfg.t_ctaLs);

  // Position offsets
  const bx = cfg.p_brandX ? `${cfg.p_brandX}` : "";
  const by = cfg.p_brandY ? `${cfg.p_brandY}` : "";
  const ox = cfg.p_offerX ? `${cfg.p_offerX}` : "";
  const oy = cfg.p_offerY ? `${cfg.p_offerY}` : "";
  const cx = cfg.p_ctaX ? `${cfg.p_ctaX}` : "";
  const cy = cfg.p_ctaY ? `${cfg.p_ctaY}` : "";

  // Only output if non-empty
  const posLines: string[] = [];
  if (bx || by || ox || oy || cx || cy) {
    const vars: string[] = [];
    if (bx) vars.push(`--cu-brand-tx: ${bx};`);
    if (by) vars.push(`--cu-brand-ty: ${by};`);
    if (ox) vars.push(`--cu-offer-tx: ${ox};`);
    if (oy) vars.push(`--cu-offer-ty: ${oy};`);
    if (cx) vars.push(`--cu-cta-tx: ${cx};`);
    if (cy) vars.push(`--cu-cta-ty: ${cy};`);
    if (vars.length) posLines.push(`:root { ${vars.join(" ")} }`);
  }

  return [...lines, ...posLines].join("\n");
}

function getGoogleFontsUrl(cfg: Config): string | null {
  const ffs = [cfg.t_brandFf, cfg.t_titleFf, cfg.t_subFf, cfg.t_ctaFf].filter(Boolean);
  const unique = [...new Set(ffs)];
  const families = unique.map((f) => FONT_MAP[f]).filter(Boolean);
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

// ─── APPLY CONFIG ─────────────────────────────────────────────────────────────

function esc(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(str: string) {
  return esc(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function replaceAllLiteral(source: string, search: string, replacement: string) {
  return source.split(search).join(replacement);
}

function absolutizeAffiTemplateUrls(html: string, origin: string) {
  return html
    .replace(/(["'(])\/affi_templates\//g, `$1${origin}/affi_templates/`)
    .replace(/(`)\/affi_templates\//g, `$1${origin}/affi_templates/`);
}

async function fetchAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error(`Unable to convert ${url} to data URL`));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${url}`));
    reader.readAsDataURL(blob);
  });
}

async function inlineAssetCandidates(html: string, candidates: string[]) {
  for (const candidate of candidates) {
    if (!html.includes(candidate)) continue;
    try {
      const dataUrl = await fetchAsDataUrl(candidate);
      html = replaceAllLiteral(html, candidate, dataUrl);
      return html;
    } catch {
      // try next candidate
    }
  }

  return html;
}

function getGoldenVisualMode(cfg: Config): "chest" | "games" | "none" {
  const v = String(cfg.goldenVisualMode || "").trim().toLowerCase();
  if (v === "games") return "games";
  if (v === "none") return "none";
  return "chest";
}

function getGoldenVisualCandidates(cfg: Config, goldenVariant: GoldenChanceVariant) {
  if (getGoldenVisualMode(cfg) === "games") {
    const custom = String(cfg.goldenGameImageUrl || "").trim();
    if (custom) return [custom];
    return [
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.png`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.webp`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.jpg`,
      `/affi_templates/golden_chance_chest/variants/${goldenVariant}/jeux.jpeg`,
    ];
  }

  const custom = String(cfg.goldenChestUrl || "").trim();
  if (custom) return [custom];
  return [
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.png`,
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.webp`,
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.jpg`,
    `/affi_templates/golden_chance_chest/variants/${goldenVariant}/chest.jpeg`,
  ];
}

function applyConfig(
  html: string,
  cfg: Config,
  model: number,
  goldenVariant: GoldenChanceVariant
): string {
  if (model === 5) {
    html = html.replace(/__VARIANT__/g, goldenVariant);

    // ─── Montants du bonus ─────────────────────────────────────────────────
    const deposit = String(cfg.goldenDepositAmount || "20").trim() || "20";
    const bonus = String(cfg.goldenBonusAmount || "20").trim() || "20";
    const total = String(cfg.goldenTotalAmount || "40").trim() || "40";

    // Attributs data-offer-* → landing-base.js les propage vers [data-bind-offer-value]
    html = html.replace(/data-offer-deposit="[^"]*"/, `data-offer-deposit="${escAttr(deposit)}"`);
    html = html.replace(/data-offer-bonus="[^"]*"/, `data-offer-bonus="${escAttr(bonus)}"`);
    html = html.replace(/data-offer-total="[^"]*"/, `data-offer-total="${escAttr(total)}"`);

    // Textes hardcodés (le script ne les touche pas)
    html = html.replace(
      /<h1 class="hero-title">[^<]*<span>[^<]*<\/span><\/h1>/,
      `<h1 class="hero-title">D&Eacute;POSE ${esc(deposit)}&euro; <span>JOUE A ${esc(total)}&euro;</span></h1>`
    );
    html = html.replace(
      /<p class="hero-subtitle"><strong>\+[^<]*<\/strong>[^<]*<\/p>/,
      `<p class="hero-subtitle"><strong>+${esc(bonus)}&euro; offerts</strong> d&egrave;s ton premier d&eacute;p&ocirc;t.</p>`
    );
    html = html.replace(
      /<span class="step-deposit">[^<]*<\/span>/,
      `<span class="step-deposit">DEPOSE ${esc(deposit)}EUR</span>`
    );
    html = html.replace(
      /<span class="step-receive">[^<]*<\/span>/,
      `<span class="step-receive">RECOIS ${esc(bonus)}EUR</span>`
    );

    if (cfg.affiLink) {
      const safeAffiLink = escAttr(cfg.affiLink);
      html = html.replace(
        /href="[^"]*" class="(btn-jouer[^"]*)"/g,
        `href="${safeAffiLink}" class="$1"`
      );
      html = html.replace(
        /href="[^"]*" class="sticky-cta"/g,
        `href="${safeAffiLink}" class="sticky-cta"`
      );
      html = html.replace(
        /href="[^"]*" class="chest-link"/g,
        `href="${safeAffiLink}" class="chest-link"`
      );
      html = html.replace(
        /href="[^"]*" class="final-chest-link"/g,
        `href="${safeAffiLink}" class="final-chest-link"`
      );
    }

    if (getGoldenVisualMode(cfg) === "none") {
      html = html.replace(
        /<\/style>/,
        `.chest-link, .final-chest-link, .cta-final-chest, .info-box, .gold-panel-final, .hero-card, #section-cta-final { display: none !important; min-height: 0 !important; }
.hero-content { justify-content: center !important; }
@media (max-width: 720px) {
  .hero-content { min-height: auto !important; }
  .hero-section { padding-bottom: clamp(28px, 6vh, 48px) !important; }
}
.hero-bg-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: pointer;
  display: block;
}
.hero-section { position: relative; z-index: 2; }
${String(cfg.goldenCtaPosition || "").trim() === "bottom"
  ? `.no-chest-cta {
  position: absolute;
  bottom: clamp(20px, 4vh, 36px);
  left: 50%;
  transform: translateX(-50%);
  width: min(90%, 360px);
  z-index: 3;
  margin: 0 !important;
}
.no-chest-cta .btn-jouer { margin-top: 0 !important; width: 100%; }`
  : `.no-chest-cta { margin-top: 18px !important; }
.no-chest-cta .btn-jouer { margin-top: 0 !important; }`
}
</style>`
      );
      const ctaBottom = String(cfg.goldenCtaPosition || "").trim() === "bottom";
      html = html.replace(
        /<\/body>/,
        `<script>
(function () {
  var jouerBtn = document.querySelector('.btn-jouer');
  if (jouerBtn) {
    var href = jouerBtn.getAttribute('href');
    var target = jouerBtn.getAttribute('target') || '_blank';
    var rel = jouerBtn.getAttribute('rel') || 'noopener noreferrer';
    if (href) {
      var overlay = document.createElement('a');
      overlay.href = href;
      overlay.target = target;
      overlay.rel = rel;
      overlay.className = 'hero-bg-overlay';
      var heroBg = document.querySelector('.hero-bg');
      if (heroBg) heroBg.appendChild(overlay);
    }
  }
  var ctaCluster = document.querySelector('.cta-cluster');
  if (ctaCluster) {
    ctaCluster.classList.add('no-chest-cta');
    ${ctaBottom
      ? `var heroSection = document.querySelector('.hero-section');
    if (heroSection) { heroSection.appendChild(ctaCluster); }`
      : `var liveCount = document.querySelector('.live-count');
    if (liveCount) { liveCount.parentNode.insertBefore(ctaCluster, liveCount.nextSibling); }`
    }
  }
})();
</script>
</body>`
      );
    } else {
      const goldenVisualUrl = getGoldenVisualCandidates(cfg, goldenVariant)[0];
      if (goldenVisualUrl) {
        const safeChestUrl = escAttr(goldenVisualUrl);
        html = html.replace(
          /(<img[^>]*data-visual-img="hero"[^>]*src=")[^"]*(")/,
          `$1${safeChestUrl}$2`
        );
        html = html.replace(
          /(<img[^>]*data-visual-img="final"[^>]*src=")[^"]*(")/,
          `$1${safeChestUrl}$2`
        );
      }
    }

    if (cfg.goldenBackgroundUrl) {
      const safeBgUrl = escAttr(cfg.goldenBackgroundUrl);
      html = html.replace(
        /(<img[^>]*class="hero-bg-media"[^>]*src=")[^"]*(")/,
        `$1${safeBgUrl}$2`
      );
    }

    if (cfg.goldenBrandMain) {
      html = html.replace(
        /(<span class="brand-logo-main">)([^<]*)(<\/span>)/,
        `$1${esc(cfg.goldenBrandMain)}$3`
      );
    }

    if (cfg.goldenBrandSub) {
      html = html.replace(
        /(<span class="brand-logo-sub">)([^<]*)(<\/span>)/,
        `$1${esc(cfg.goldenBrandSub)}$3`
      );
    }

    if (cfg.goldenHeroTitleBefore || cfg.goldenHeroTitleSpan) {
      html = html.replace(
        /<h1 class="hero-title">[\s\S]*?<\/h1>/,
        `<h1 class="hero-title">${esc(cfg.goldenHeroTitleBefore)} <span>${esc(cfg.goldenHeroTitleSpan)}</span></h1>`
      );
    }

    if (cfg.goldenHeroSubtitle) {
      html = html.replace(
        /<p class="hero-subtitle">[\s\S]*?<\/p>/,
        `<p class="hero-subtitle">${esc(cfg.goldenHeroSubtitle)}</p>`
      );
    }

    if (cfg.goldenPageTitle) {
      html = html.replace(
        /<title>[^<]*<\/title>/,
        `<title>${esc(cfg.goldenPageTitle)}</title>`
      );
    }

    // Inject CSS custom vars before </style>
    const cssVars = buildCustomVarsCSS(cfg);
    if (cssVars) {
      html = html.replace(/<\/style>/, `${cssVars}\n</style>`);
    }

    // Inject Google Fonts link in <head> if needed
    const fontsUrl = getGoogleFontsUrl(cfg);
    if (fontsUrl) {
      html = html.replace(
        /<\/head>/,
        `  <link rel="stylesheet" href="${fontsUrl}">\n</head>`
      );
    }

    return html;
  }

  const colorVars: [string, string][] = [
    ["--bg-page", cfg.bgPage],
    ["--bg-card", cfg.bgCard],
    ["--brand-gold", cfg.brandGold],
    ["--brand-ruby", cfg.brandRuby],
    ["--casino-green", cfg.casinoGreen],
    ["--border-color", cfg.borderColor],
  ];
  for (const [varName, value] of colorVars) {
    if (!value) continue;
    const escaped = varName.replace(/-/g, "\\-");
    html = html.replace(
      new RegExp(`(${escaped}:\\s*)#[0-9a-fA-F]{3,6}`, "g"),
      (_, prefix) => prefix + value
    );
  }

  if (model === 4) {
    let imgCount = 0;
    html = html.replace(
      /(<div class="promo-image-container">\s*<img) src="[^"]*"/g,
      (match, before) => {
        imgCount++;
        if (imgCount === 1 && cfg.imgUrl1) return `${before} src="${cfg.imgUrl1}"`;
        if (imgCount === 2 && cfg.imgUrl2) return `${before} src="${cfg.imgUrl2}"`;
        return match;
      }
    );
  } else if (cfg.imgUrl) {
    let replaced = false;
    html = html.replace(
      /(<div class="promo-image-container">\s*<img) src="[^"]*"/g,
      (match, before) => {
        if (!replaced) {
          replaced = true;
          return `${before} src="${cfg.imgUrl}"`;
        }
        return match;
      }
    );
  }

  if (cfg.affiLink) {
    const safeAffiLink = escAttr(cfg.affiLink);
    html = html.replace(
      /href="[^"]*" class="btn-jouer"/g,
      `href="${safeAffiLink}" class="btn-jouer"`
    );
    html = html.replace(
      /href="[^"]*" class="sticky-cta"/g,
      `href="${safeAffiLink}" class="sticky-cta"`
    );
  }

  if (cfg.offerTitle) {
    html = html.replace(
      /<div class="offer-title">[^<]*<\/div>/g,
      `<div class="offer-title">${esc(cfg.offerTitle)}</div>`
    );
  }

  if (model === 4) {
    const deps = [cfg.depositText, cfg.depositText2];
    const recs = [cfg.receiveText, cfg.receiveText2];
    let d = 0;
    let r = 0;
    html = html.replace(/<span class="step-deposit">[^<]*<\/span>/g, () => {
      const t = deps[d] || deps[0];
      d++;
      return `<span class="step-deposit">${esc(t)}</span>`;
    });
    html = html.replace(/<span class="step-receive">[^<]*<\/span>/g, () => {
      const t = recs[r] || recs[0];
      r++;
      return `<span class="step-receive">${esc(t)}</span>`;
    });
  } else {
    if (cfg.depositText)
      html = html.replace(
        /<span class="step-deposit">[^<]*<\/span>/,
        `<span class="step-deposit">${esc(cfg.depositText)}</span>`
      );
    if (cfg.receiveText)
      html = html.replace(
        /<span class="step-receive">[^<]*<\/span>/,
        `<span class="step-receive">${esc(cfg.receiveText)}</span>`
      );
  }

  if (cfg.badgeText) {
    html = html.replace(
      /(class="badge-premium">[^<]*<\/svg>\s*)([^<]*?)(\s*<\/div>)/,
      (_, before, _old, after) => `${before}${esc(cfg.badgeText)}${after}`
    );
  }

  if (cfg.heroTitleBefore || cfg.heroTitleSpan) {
    html = html.replace(
      /<h1 class="hero-title">[\s\S]*?<\/h1>/,
      `<h1 class="hero-title">${esc(cfg.heroTitleBefore)} <span>${esc(cfg.heroTitleSpan)}</span></h1>`
    );
  }

  if (cfg.heroSubtitle) {
    html = html.replace(
      /<p class="hero-subtitle">[^<]*<\/p>/,
      `<p class="hero-subtitle">${esc(cfg.heroSubtitle)}</p>`
    );
  }

  if (cfg.btnText) {
    html = html.replace(
      /(href="[^"]*" class="btn-jouer">\s*)([^<]*)(\s*<\/a>)/g,
      (_, before, _old, after) => `${before}${esc(cfg.btnText)}${after}`
    );
  }

  if (cfg.stickyText) {
    html = html.replace(
      /(class="sticky-cta">)([^<]*)(<\/a>)/,
      (_, b, _o, a) => `${b}${cfg.stickyText}${a}`
    );
  }

  if (cfg.casinoName && cfg.casinoName !== "Celsius Games") {
    html = html.replace(/Celsius Games/g, esc(cfg.casinoName));
  }

  if (cfg.pageTitle) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(cfg.pageTitle)}</title>`);
  }

  // ── Boutons custom ─────────────────────────────────────────────────────────
  const customButtons = parseAffiButtons(cfg.customButtonsJson);
  if (customButtons.length > 0) {
    const btnHtml = renderAffiButtonsHtml(customButtons);
    if (html.includes("</body>")) {
      html = html.replace(/<\/body>/, `${btnHtml}\n</body>`);
    } else {
      html = html + btnHtml;
    }
  }

  return html;
}

/** Rendu HTML des boutons custom.
 *  Injection via script JS après DOMContentLoaded → la création en JS permet d'éviter
 *  tous les problèmes potentiels de HTML injecté statique (parsing, transform ancêtre, etc.)
 *  et garantit que les boutons sont les derniers enfants du body. */
function renderAffiButtonsHtml(btns: AffiButton[]): string {
  // Sanitize + clamp de chaque bouton
  const sanitized = btns.map((b) => {
    const rawX = Number(b.xPct);
    const rawY = Number(b.yPct);
    return {
      id: String(b.id || ""),
      label: String(b.label || ""),
      link: String(b.link || ""),
      imageUrl: String(b.imageUrl || ""),
      bgColor: String(b.bgColor || "#000000"),
      textColor: String(b.textColor || "#ffffff"),
      xPct: (!Number.isFinite(rawX) || rawX < 0 || rawX > 95) ? 35 : rawX,
      yPct: (!Number.isFinite(rawY) || rawY < 0 || rawY > 95) ? 5  : rawY,
      widthPx: clamp(Number(b.widthPx), 20, 2000),
      heightPx: clamp(Number(b.heightPx), 20, 2000),
      borderRadius: clamp(Number(b.borderRadius), 0, 200),
      fontSize: clamp(Number(b.fontSize), 8, 200),
      objectFit: String(b.objectFit || "contain"),
      transparent: !!b.transparent,
    };
  });

  // On encode les données en JSON pour les passer au script inline.
  // escape(</script>) pour éviter qu'un champ malicieux casse le script.
  const dataJson = JSON.stringify(sanitized).replace(/<\/script/gi, "<\\/script");

  return `<script data-affi-custom-buttons>
(function () {
  var BTNS = ${dataJson};
  if (!BTNS || !BTNS.length) return;

  function render() {
    // Nettoyer un éventuel wrapper précédent (rerender en dev)
    var prev = document.querySelector('[data-affi-buttons-wrap]');
    if (prev) prev.parentNode.removeChild(prev);

    var wrap = document.createElement('div');
    wrap.setAttribute('data-affi-buttons-wrap', '');
    wrap.style.cssText = 'display:contents !important;';

    BTNS.forEach(function (b) {
      var hasImage = !!b.imageUrl;
      var isTransparent = !!b.transparent;
      var el = document.createElement(b.link ? 'a' : 'div');
      if (b.link) {
        el.href = b.link;
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      }

      var bgSize = b.objectFit === 'cover' ? 'cover' : b.objectFit === 'fill' ? '100% 100%' : 'contain';
      var bgParts = [];
      if (hasImage) bgParts.push('url("' + b.imageUrl.replace(/"/g, '%22') + '") center center / ' + bgSize + ' no-repeat');
      if (!isTransparent) bgParts.push(b.bgColor);
      var bgValue = bgParts.length ? bgParts.join(', ') : 'transparent';

      el.style.cssText = [
        'position:absolute !important',
        'pointer-events:auto !important',
        'left:' + b.xPct + '% !important',
        'top:' + b.yPct + '% !important',
        'width:' + b.widthPx + 'px !important',
        'height:' + b.heightPx + 'px !important',
        'background:' + bgValue + ' !important',
        'color:' + b.textColor + ' !important',
        'border-radius:' + b.borderRadius + 'px !important',
        'font-size:' + b.fontSize + 'px !important',
        'font-weight:800 !important',
        'display:flex !important',
        'align-items:center !important',
        'justify-content:center !important',
        'text-align:center !important',
        'text-decoration:none !important',
        'overflow:hidden !important',
        (hasImage || isTransparent) ? 'box-shadow:none !important' : 'box-shadow:0 4px 14px rgba(0,0,0,.35) !important',
        (hasImage || isTransparent) ? 'border:none !important' : 'border:1px solid rgba(255,255,255,.08) !important',
        'cursor:pointer !important',
        'box-sizing:border-box !important',
        'z-index:2147483647 !important',
        'margin:0 !important',
        'padding:0 !important',
      ].join(';');

      // <img> tag — double garantie d'affichage
      if (hasImage) {
        var img = document.createElement('img');
        img.src = b.imageUrl;
        img.alt = '';
        img.style.cssText = 'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;object-fit:' + b.objectFit + ' !important;display:block !important;pointer-events:none !important;';
        el.appendChild(img);
      }

      // Label
      if (b.label) {
        var span = document.createElement('span');
        span.textContent = b.label;
        span.style.cssText = 'position:relative !important;z-index:2 !important;padding:0 8px !important;text-shadow:' + (hasImage ? '0 2px 6px rgba(0,0,0,.65)' : 'none') + ' !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;max-width:100% !important;';
        el.appendChild(span);
      }

      wrap.appendChild(el);
    });

    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
</script>`;
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function ModelThumb({ n }: { n: number }) {
  const thumbs: Record<number, React.ReactNode> = {
    1: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="4" y="6" width="52" height="8" rx="2" fill="#1e1e3a" />
        <rect x="4" y="17" width="52" height="3" rx="1" fill="#252545" />
        <rect x="4" y="22" width="40" height="3" rx="1" fill="#252545" />
        <rect x="4" y="30" width="18" height="6" rx="1" fill="#332200" />
        <rect x="64" y="4" width="52" height="24" rx="2" fill="#1e1e3a" />
        <rect x="64" y="4" width="52" height="10" rx="2" fill="#FFD70025" />
        <rect x="64" y="30" width="52" height="4" rx="1" fill="#252545" />
        <rect x="64" y="37" width="52" height="10" rx="2" fill="#FFD700" />
        <rect x="4" y="52" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    2: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="4" y="6" width="52" height="8" rx="2" fill="#1e1e3a" />
        <rect x="4" y="17" width="52" height="3" rx="1" fill="#252545" />
        <rect x="4" y="22" width="40" height="3" rx="1" fill="#252545" />
        <rect x="64" y="4" width="52" height="28" rx="2" fill="#1e1e3a" />
        <rect x="64" y="4" width="52" height="14" rx="2" fill="#E0115F25" />
        <rect x="64" y="34" width="52" height="10" rx="2" fill="#FFD700" />
        <rect x="4" y="52" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    3: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="4" y="6" width="52" height="8" rx="2" fill="#1e1e3a" />
        <rect x="4" y="17" width="52" height="3" rx="1" fill="#252545" />
        <rect x="64" y="4" width="52" height="28" rx="2" fill="#1e1e3a" />
        <rect x="64" y="4" width="52" height="14" rx="2" fill="#00E67625" />
        <rect x="64" y="34" width="52" height="10" rx="2" fill="#FFD700" />
        <rect x="4" y="52" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    4: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" fill="#0a0a18" />
        <rect x="14" y="4" width="92" height="6" rx="2" fill="#1e1e3a" />
        <rect x="24" y="13" width="72" height="3" rx="1" fill="#252545" />
        <rect x="4" y="22" width="54" height="26" rx="2" fill="#1e1e3a" />
        <rect x="4" y="22" width="54" height="11" rx="2" fill="#FFD70025" />
        <rect x="4" y="40" width="54" height="8" rx="2" fill="#FFD700" />
        <rect x="62" y="22" width="54" height="26" rx="2" fill="#1e1e3a" />
        <rect x="62" y="22" width="54" height="11" rx="2" fill="#E0115F25" />
        <rect x="62" y="40" width="54" height="8" rx="2" fill="#FFD700" />
        <rect x="4" y="54" width="112" height="12" rx="2" fill="#1e1e3a" />
      </svg>
    ),
    5: (
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" rx="8" fill="#15131c" />
        <rect x="8" y="5" width="104" height="60" rx="10" fill="#2b2833" stroke="#524e59" />
        <rect x="22" y="10" width="76" height="4" rx="2" fill="#d4a843" opacity="0.9" />
        <rect x="30" y="18" width="60" height="14" rx="4" fill="#1e1b22" />
        <rect x="24" y="36" width="72" height="5" rx="2.5" fill="#f5efe4" />
        <rect x="32" y="44" width="56" height="5" rx="2.5" fill="#d4a843" />
        <rect x="17" y="54" width="86" height="7" rx="3.5" fill="#4a4040" />
      </svg>
    ),
  };
  return <>{thumbs[n]}</>;
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={s.colorPicker}
        />
        <input
          type="text"
          value={value}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
          }}
          style={{ ...s.input, fontFamily: "monospace", flex: 1 }}
        />
      </div>
    </div>
  );
}

// ─── PRESET IMAGES ───────────────────────────────────────────────────────────

const PRESET_IMAGES = [
  {
    url: "https://cdn.phototourl.com/member/2026-04-09-240bb1e8-d188-4130-81ae-8e3f88143efc.png",
    label: "Penalty Duel",
  },
  {
    url: "https://cdn.phototourl.com/free/2026-04-09-c5dee0f7-cdad-427c-bd2e-bcbb6f4b24a6.png",
    label: "Jeu des Mines",
  },
  {
    url: "https://cdn.phototourl.com/member/2026-04-10-af97004c-818f-40d3-b081-404c3ad3dfa7.png",
    label: "Nouveau 1",
  },
  {
    url: "https://cdn.phototourl.com/member/2026-04-10-ec62e857-165d-4a93-9cec-a314c7636d9c.jpg",
    label: "Nouveau 2",
  },
];

const GOLDEN_VARIANTS: Array<{
  value: GoldenChanceVariant;
  label: string;
  accent: string;
}> = [
  { value: "gold",     label: "Or",        accent: "#d4a843" },
  { value: "ruby",     label: "Rubis",     accent: "#bf6861" },
  { value: "emerald",  label: "Émeraude",  accent: "#69b98d" },
  { value: "sapphire", label: "Saphir",    accent: "#6f96cf" },
  { value: "amethyst", label: "Améthyste", accent: "#b06fd8" },
  { value: "obsidian", label: "Obsidian",  accent: "#c9aa60" },
  { value: "rose",     label: "Rose",      accent: "#e87aaa" },
  { value: "jade",     label: "Jade",      accent: "#5cb87a" },
];

interface ImagePickerProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ImagePicker({ label, value, onChange }: ImagePickerProps) {
  const isCustom = value !== "" && !PRESET_IMAGES.some((p) => p.url === value);
  const [showCustom, setShowCustom] = useState(isCustom);

  function select(url: string) {
    setShowCustom(false);
    onChange(url);
  }

  function openCustom() {
    setShowCustom(true);
    onChange("");
  }

  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {/* Grille 2×2 presets + bouton custom */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
        {PRESET_IMAGES.map((p) => {
          const active = value === p.url;
          return (
            <button
              key={p.url}
              onClick={() => select(p.url)}
              title={p.label}
              style={{
                position: "relative",
                padding: 0,
                border: `2px solid ${active ? "#FFD700" : "#2a2a4a"}`,
                borderRadius: 6,
                overflow: "hidden",
                cursor: "pointer",
                background: "#000",
                aspectRatio: "16/9",
                transition: "border-color 0.15s",
              }}
            >
              <img
                src={p.url}
                alt={p.label}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
              {active && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(255,215,0,0.12)",
                  display: "flex", alignItems: "flex-end", justifyContent: "center",
                  paddingBottom: 4,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#FFD700", background: "rgba(0,0,0,0.6)", padding: "1px 5px", borderRadius: 3 }}>
                    ✓
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {/* Bouton URL personnalisée */}
        <button
          onClick={openCustom}
          style={{
            border: `2px solid ${showCustom ? "#FFD700" : "#2a2a4a"}`,
            borderRadius: 6,
            background: showCustom ? "rgba(255,215,0,0.06)" : "#1c1c35",
            color: showCustom ? "#FFD700" : "#666",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            aspectRatio: "16/9",
            transition: "border-color 0.15s, color 0.15s",
          }}
        >
          <span style={{ fontSize: 16 }}>🔗</span>
          <span>URL custom</span>
        </button>
      </div>

      {/* Champ texte : affiché si custom sélectionné */}
      {showCustom && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          autoFocus
          style={{ ...s.input, marginTop: 2 }}
        />
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}
function TextField({ label, value, onChange, placeholder, multiline, type = "text" }: TextFieldProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...s.input, minHeight: 56, resize: "vertical" }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={s.input}
        />
      )}
    </div>
  );
}

interface VariantPickerProps {
  value: GoldenChanceVariant;
  onChange: (value: GoldenChanceVariant) => void;
}
function VariantPicker({ value, onChange }: VariantPickerProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>Variante couleur</label>
      <div style={s.variantGrid}>
        {GOLDEN_VARIANTS.map((variant) => {
          const active = value === variant.value;
          return (
            <button
              key={variant.value}
              onClick={() => onChange(variant.value)}
              style={{
                ...s.variantBtn,
                ...(active ? s.variantBtnActive : {}),
                borderColor: active ? variant.accent : "#2a2a4a",
              }}
            >
              <span
                style={{
                  ...s.variantSwatch,
                  background: `linear-gradient(135deg, ${variant.accent}, rgba(255,255,255,0.92))`,
                }}
              />
              <span>{variant.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}
function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={s.section}>
      <button style={s.sectionHeader} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  );
}

// ─── STYLE CONTROL ───────────────────────────────────────────────────────────

interface StyleControlProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type: "range-text" | "select" | "color" | "text";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

function StyleControl({ label, value, onChange, placeholder, type, min = 0, max = 100, step = 0.1, options = [] }: StyleControlProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {type === "select" && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...s.input, cursor: "pointer" }}
        >
          <option value="">— hérité —</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
      {type === "color" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="color"
            value={value || "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            style={s.colorPicker}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "#ffffff"}
            style={{ ...s.input, fontFamily: "monospace", flex: 1 }}
          />
          {value && (
            <button style={{ ...s.btn, ...s.btnSecondary, padding: "4px 8px", fontSize: "0.72rem" }} onClick={() => onChange("")}>✕</button>
          )}
        </div>
      )}
      {type === "range-text" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={parseFloat(value) || 0}
            onChange={(e) => onChange(e.target.value + (value.includes("rem") ? "rem" : "px"))}
            style={{ flex: 1, accentColor: "#FFD700" }}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || ""}
            style={{ ...s.input, width: 70, flex: "none" }}
          />
          {value && (
            <button style={{ ...s.btn, ...s.btnSecondary, padding: "4px 8px", fontSize: "0.72rem" }} onClick={() => onChange("")}>✕</button>
          )}
        </div>
      )}
      {type === "text" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || ""}
            style={{ ...s.input, flex: 1 }}
          />
          {value && (
            <button style={{ ...s.btn, ...s.btnSecondary, padding: "4px 8px", fontSize: "0.72rem" }} onClick={() => onChange("")}>✕</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── OFFSET CONTROL ───────────────────────────────────────────────────────────

function OffsetControl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const numVal = parseInt(value, 10);
  const safeNum = isNaN(numVal) ? 0 : numVal;
  return (
    <div style={s.field}>
      <label style={{ ...s.label, display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: "#FFD700", fontFamily: "monospace" }}>{value || "0px"}</span>
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="range"
          min={-200}
          max={200}
          step={1}
          value={safeNum}
          onChange={(e) => onChange(e.target.value + "px")}
          style={{ flex: 1, accentColor: "#FFD700" }}
        />
        <input
          type="number"
          value={safeNum}
          onChange={(e) => onChange(e.target.value + "px")}
          style={{ ...s.input, width: 60, flex: "none" }}
        />
      </div>
    </div>
  );
}

function slugifyLandingSegment(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildPublishedPageSlug(model: number, cfg: Config, variant: GoldenChanceVariant) {
  const brandSource =
    model === 5
      ? cfg.goldenBrandMain || cfg.goldenPageTitle || "landing"
      : cfg.casinoName || cfg.pageTitle || `modele-${model}`;
  const brandPart = slugifyLandingSegment(brandSource) || "landing";
  return model === 5
    ? `${brandPart}-golden-chest-${variant}`
    : `${brandPart}-model${model}`;
}

function buildPublishedBrandName(model: number, cfg: Config) {
  const raw = model === 5 ? cfg.goldenBrandMain : cfg.casinoName;
  return String(raw || "").trim() || `Modele ${model}`;
}

function buildPublishedTitle(model: number, cfg: Config) {
  const raw = model === 5 ? cfg.goldenPageTitle : cfg.pageTitle;
  return String(raw || "").trim() || buildPublishedBrandName(model, cfg);
}

function buildPublishedPayload(model: number, cfg: Config, variant: GoldenChanceVariant) {
  return {
    slug: buildPublishedPageSlug(model, cfg, variant),
    model,
    variant: model === 5 ? variant : null,
    brandName: buildPublishedBrandName(model, cfg),
    title: buildPublishedTitle(model, cfg),
    config: { ...cfg },
  };
}

function buildPageSignature(input: {
  model: number;
  variant: string | null;
  brandName: string;
  title: string;
  config: Record<string, string>;
}) {
  return JSON.stringify({
    model: Number(input.model || 0),
    variant: input.variant ?? null,
    brandName: String(input.brandName || ""),
    title: String(input.title || ""),
    config: input.config || {},
  });
}



function isGoldenVariant(value: string | null | undefined): value is GoldenChanceVariant {
  return ["gold","ruby","emerald","sapphire","amethyst","obsidian","rose","jade"].includes(value as string);
}

// ─── CUSTOM BUTTONS EDITOR ────────────────────────────────────────────────────

interface SingleButtonRowProps {
  btn: AffiButton;
  index: number;
  onChange: (patch: Partial<AffiButton>) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
}
function SingleButtonRow({ btn, index, onChange, onRemove, onDuplicate }: SingleButtonRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const token = (typeof window !== "undefined" ? localStorage.getItem("lunalive_token_v1") : "") || "";

  async function handleFile(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://lunalive-api.onrender.com";
      const res = await fetch(`${base}/me/overlay/bg/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) setUploadErr(json?.error || "Erreur upload");
      else onChange({ imageUrl: json.url });
    } catch {
      setUploadErr("Erreur réseau");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #2a2a4a", borderRadius: 8, background: "rgba(0,0,0,0.18)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px" }}>
        <button
          onClick={() => setOpen(!open)}
          style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", color: "#ddd", font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 999, background: "rgba(255,215,0,.15)", color: "#FFD700", border: "1px solid rgba(255,215,0,.3)" }}>
            #{index + 1}
          </span>
          <span>{btn.label || "(sans label)"}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.5, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
        </button>
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            title="Dupliquer ce bouton"
            style={{ border: "1px solid rgba(99,102,241,.3)", borderRadius: 6, background: "rgba(99,102,241,.08)", color: "#a5b4fc", padding: "2px 8px", cursor: "pointer", font: "inherit", fontSize: 11 }}
          >⎘</button>
        )}
        <button
          onClick={onRemove}
          title="Supprimer"
          style={{ border: "1px solid rgba(239,68,68,.3)", borderRadius: 6, background: "rgba(239,68,68,.08)", color: "#f87171", padding: "2px 8px", cursor: "pointer", font: "inherit", fontSize: 11 }}
        >✕</button>
      </div>

      {open && (
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid #2a2a4a" }}>
          <TextField label="Texte (label)" value={btn.label} onChange={(v) => onChange({ label: v })} placeholder="ex: JOUER MAINTENANT" />
          <TextField label="Lien URL" value={btn.link} onChange={(v) => onChange({ link: v })} placeholder="https://..." type="url" />

          <TextField label="Image URL (optionnelle)" value={btn.imageUrl} onChange={(v) => onChange({ imageUrl: v })} placeholder="https://... ou upload" type="url" />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ flex: 1, border: "1px dashed rgba(255,215,0,.35)", borderRadius: 6, background: "rgba(255,215,0,.06)", color: "#FFD700", padding: "6px 0", cursor: uploading ? "wait" : "pointer", font: "inherit", fontSize: 11, fontWeight: 700 }}
            >
              {uploading ? "Upload…" : "📁 Upload image"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>
          {uploadErr && <div style={{ fontSize: 10, color: "#f87171" }}>✕ {uploadErr}</div>}
          {btn.imageUrl && (
            <img src={btn.imageUrl} alt="" style={{ width: "100%", maxHeight: 60, objectFit: "contain", borderRadius: 4, background: "#000" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <div style={s.field}>
            <label style={s.label}>Ajustement image</label>
            <select value={btn.objectFit} onChange={(e) => onChange({ objectFit: e.target.value as AffiButton["objectFit"] })} style={s.input}>
              <option value="cover">Remplir (cover)</option>
              <option value="contain">Contenu (contain)</option>
              <option value="fill">Étirer (fill)</option>
            </select>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd", cursor: "pointer" }}>
            <input type="checkbox" checked={btn.transparent ?? false} onChange={(e) => onChange({ transparent: e.target.checked })} />
            Fond transparent (ignore la couleur de fond)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, opacity: btn.transparent ? 0.5 : 1 }}>
            <ColorField label="Fond" value={btn.bgColor} onChange={(v) => onChange({ bgColor: v })} />
            <ColorField label="Texte" value={btn.textColor} onChange={(v) => onChange({ textColor: v })} />
          </div>

          {/* ── Style avancé (gradient + glow comme sticky-cta) ── */}
          <details style={{ borderTop: "1px dashed #2a2a4a", paddingTop: 8 }}>
            <summary style={{ fontSize: 11, color: "#a5b4fc", cursor: "pointer", userSelect: "none", fontWeight: 700 }}>
              ✨ Style avancé (gradient, glow, police…)
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!btn.gradientDark && !!btn.gradientLight}
                  onChange={(e) => {
                    if (e.target.checked) onChange({ gradientDark: "#856128", gradientLight: "#f0c84a" });
                    else onChange({ gradientDark: undefined, gradientLight: undefined });
                  }}
                />
                Gradient 3 couleurs
              </label>
              {!!btn.gradientDark && !!btn.gradientLight && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <ColorField label="Gradient sombre" value={btn.gradientDark || "#000000"} onChange={(v) => onChange({ gradientDark: v })} />
                  <ColorField label="Gradient clair" value={btn.gradientLight || "#ffffff"} onChange={(v) => onChange({ gradientLight: v })} />
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!btn.glow}
                  onChange={(e) => onChange({ glow: e.target.checked })}
                />
                Glow (halo + reflets)
              </label>

              <div style={s.field}>
                <label style={s.label}>Letter-spacing (em)</label>
                <input
                  type="number" min={0} max={1} step={0.02}
                  value={btn.letterSpacingEm ?? 0}
                  onChange={(e) => onChange({ letterSpacingEm: Number(e.target.value) || 0 })}
                  style={s.input}
                />
              </div>

              <TextField
                label="Police (CSS font-family)"
                value={btn.fontFamily || ""}
                onChange={(v) => onChange({ fontFamily: v })}
                placeholder="'Bebas Neue', system-ui, sans-serif"
              />
            </div>
          </details>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={s.field}>
              <label style={s.label}>X (% largeur)</label>
              <input type="number" min={0} max={100} step={0.5} value={btn.xPct} onChange={(e) => onChange({ xPct: clamp(Number(e.target.value), 0, 100) })} style={s.input} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Y (% hauteur)</label>
              <input type="number" min={0} max={100} step={0.5} value={btn.yPct} onChange={(e) => onChange({ yPct: clamp(Number(e.target.value), 0, 100) })} style={s.input} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={s.field}>
              <label style={s.label}>Largeur (px)</label>
              <input type="number" min={20} max={2000} step={2} value={btn.widthPx} onChange={(e) => onChange({ widthPx: clamp(Number(e.target.value), 20, 2000) })} style={s.input} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Hauteur (px)</label>
              <input type="number" min={20} max={2000} step={2} value={btn.heightPx} onChange={(e) => onChange({ heightPx: clamp(Number(e.target.value), 20, 2000) })} style={s.input} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={s.field}>
              <label style={s.label}>Radius (px)</label>
              <input type="number" min={0} max={200} step={1} value={btn.borderRadius} onChange={(e) => onChange({ borderRadius: clamp(Number(e.target.value), 0, 200) })} style={s.input} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Taille texte</label>
              <input type="number" min={8} max={200} step={1} value={btn.fontSize} onChange={(e) => onChange({ fontSize: clamp(Number(e.target.value), 8, 200) })} style={s.input} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ButtonsEditorProps {
  buttons: AffiButton[];
  onChange: (next: AffiButton[]) => void;
  bonusAmount?: string;
  affiLink?: string;
  variant?: string;
}
function ButtonsEditor({ buttons, onChange, bonusAmount, affiLink, variant }: ButtonsEditorProps) {
  function add() { onChange([...buttons, defaultAffiButton()]); }
  function addMainCta() { onChange([...buttons, duplicateMainCtaButton(bonusAmount, affiLink, variant)]); }
  function duplicate(i: number) {
    const src = buttons[i];
    if (!src) return;
    const copy: AffiButton = { ...src, id: makeButtonId(), xPct: Math.min(90, src.xPct + 3), yPct: Math.min(90, src.yPct + 3) };
    onChange([...buttons, copy]);
  }
  function update(i: number, patch: Partial<AffiButton>) {
    onChange(buttons.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  }
  function remove(i: number) { onChange(buttons.filter((_, idx) => idx !== i)); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {buttons.length === 0 && (
        <div style={{ padding: "10px 8px", textAlign: "center", color: "#888", fontSize: 11, background: "rgba(0,0,0,0.18)", borderRadius: 8, border: "1px dashed #2a2a4a" }}>
          Aucun bouton
        </div>
      )}
      {buttons.map((btn, i) => (
        <SingleButtonRow key={btn.id} btn={btn} index={i} onChange={(p) => update(i, p)} onRemove={() => remove(i)} onDuplicate={() => duplicate(i)} />
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button
          onClick={add}
          style={{ border: "1px dashed rgba(255,215,0,.4)", borderRadius: 8, background: "rgba(255,215,0,.06)", color: "#FFD700", padding: "8px 0", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700 }}
        >+ Nouveau bouton</button>
        <button
          onClick={addMainCta}
          title="Crée un bouton style 'RÉCLAME TES X€ OFFERTS' que tu peux repositionner et modifier"
          style={{ border: "1px solid rgba(255,215,0,.5)", borderRadius: 8, background: "linear-gradient(135deg,#FFD700,#FFA500)", color: "#0f0d14", padding: "8px 0", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 800 }}
        >⭐ Dupliquer "RÉCLAME"</button>
      </div>
    </div>
  );
}

// ─── Iframe button injection (fallback fiable) ────────────────────────────────

export function injectButtonsIntoIframe(iframe: HTMLIFrameElement, buttons: AffiButton[]) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;

  // Nettoie les éventuels boutons précédemment injectés
  const existing = doc.querySelector("[data-affi-buttons-wrap]");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  if (!buttons || buttons.length === 0) return;

  const wrap = doc.createElement("div");
  wrap.setAttribute("data-affi-buttons-wrap", "");
  // display:contents → le wrapper ne génère pas de boîte, les enfants héritent du body
  //  → les position:absolute des boutons se résolvent sur le document (initial containing block)
  //  et scrollent avec la page.
  wrap.style.cssText = "display:contents!important;";

  for (const b of buttons) {
    const rawX = Number(b.xPct);
    const rawY = Number(b.yPct);
    const xPct = (!Number.isFinite(rawX) || rawX < 0 || rawX > 95) ? 35 : rawX;
    const yPct = (!Number.isFinite(rawY) || rawY < 0 || rawY > 95) ? 5  : rawY;
    const widthPx = clamp(Number(b.widthPx), 20, 2000);
    const heightPx = clamp(Number(b.heightPx), 20, 2000);
    const borderRadius = clamp(Number(b.borderRadius), 0, 200);
    const fontSize = clamp(Number(b.fontSize), 8, 200);
    const hasImage = !!b.imageUrl;
    const isTransparent = !!b.transparent;
    const bgColor = /^#[0-9a-fA-F]{6}$/.test(b.bgColor) ? b.bgColor : "#000000";
    const textColor = /^#[0-9a-fA-F]{6}$/.test(b.textColor) ? b.textColor : "#ffffff";
    const hasGradient = !!b.gradientDark && !!b.gradientLight && !isTransparent && !hasImage;
    const hasGlow = !!b.glow;

    const el = doc.createElement(b.link ? "a" : "div") as HTMLAnchorElement | HTMLDivElement;
    if (b.link && el.tagName === "A") {
      (el as HTMLAnchorElement).href = b.link;
      (el as HTMLAnchorElement).target = "_blank";
      (el as HTMLAnchorElement).rel = "noopener noreferrer";
    }

    const bgSize = b.objectFit === "cover" ? "cover" : b.objectFit === "fill" ? "100% 100%" : "contain";
    const bgParts: string[] = [];
    if (hasImage) bgParts.push(`url("${b.imageUrl.replace(/"/g, "%22")}") center center / ${bgSize} no-repeat`);
    if (hasGradient) {
      // Même recette que .sticky-cta dans landing-base.css
      bgParts.push(`linear-gradient(180deg, ${b.gradientDark} 0%, ${bgColor} 38%, ${b.gradientLight} 52%, ${bgColor} 72%, ${b.gradientDark} 100%)`);
    } else if (!isTransparent) {
      bgParts.push(bgColor);
    }
    const backgroundValue = bgParts.length > 0 ? bgParts.join(", ") : "transparent";

    // Glow = inset highlight + outer accent-soft glow + drop shadow (comme sticky-cta)
    let boxShadow: string;
    if (hasGlow) {
      const glowAccent = hasGradient ? (b.gradientDark || bgColor) : bgColor;
      // Couleur de glow semi-transparente dérivée de l'accent
      const glowSoft = hexToRgba(bgColor, 0.45);
      boxShadow = `inset 0 1px 0 rgba(255,255,255,0.24), 0 0 30px ${glowSoft}, 0 14px 24px rgba(0,0,0,0.36)`;
      void glowAccent; // variable conservée pour clarté
    } else if (hasImage || isTransparent) {
      boxShadow = "none";
    } else {
      boxShadow = "0 4px 14px rgba(0,0,0,.35)";
    }

    const border = hasGlow
      ? `1px solid ${b.gradientDark || bgColor}`
      : (hasImage || isTransparent)
        ? "none"
        : "1px solid rgba(255,255,255,.08)";

    const letterSpacing = typeof b.letterSpacingEm === "number" && Number.isFinite(b.letterSpacingEm)
      ? `${b.letterSpacingEm}em`
      : "normal";

    const fontFamily = b.fontFamily && b.fontFamily.trim()
      ? b.fontFamily
      : "inherit";

    el.style.cssText = [
      "position:absolute!important",
      "pointer-events:auto!important",
      `left:${xPct}%!important`,
      `top:${yPct}%!important`,
      `width:${widthPx}px!important`,
      `height:${heightPx}px!important`,
      `background:${backgroundValue}!important`,
      `color:${textColor}!important`,
      `border-radius:${borderRadius}px!important`,
      `font-size:${fontSize}px!important`,
      "font-weight:800!important",
      `font-family:${fontFamily}!important`,
      `letter-spacing:${letterSpacing}!important`,
      "display:flex!important",
      "align-items:center!important",
      "justify-content:center!important",
      "text-align:center!important",
      "text-decoration:none!important",
      "overflow:hidden!important",
      `box-shadow:${boxShadow}!important`,
      `border:${border}!important`,
      "cursor:pointer!important",
      "box-sizing:border-box!important",
      "z-index:2147483647!important",
      "margin:0!important",
      "padding:0!important",
      "opacity:1!important",
      "visibility:visible!important",
    ].join(";");

    if (hasImage) {
      const img = doc.createElement("img");
      img.src = b.imageUrl;
      img.alt = "";
      img.style.cssText = `position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:${b.objectFit}!important;display:block!important;pointer-events:none!important;opacity:1!important;visibility:visible!important;`;
      el.appendChild(img);
    }

    if (b.label) {
      const span = doc.createElement("span");
      span.textContent = b.label;
      span.style.cssText = `position:relative!important;z-index:2!important;padding:0 8px!important;text-shadow:${hasImage ? "0 2px 6px rgba(0,0,0,.65)" : "none"}!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:100%!important;`;
      el.appendChild(span);
    }

    wrap.appendChild(el);
  }

  doc.body.appendChild(wrap);
  console.log(`[AffiEditor] Injected ${buttons.length} button(s) into iframe`);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AffiEditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [currentModel, setCurrentModel] = useState(1);
  const [goldenVariant, setGoldenVariant] = useState<GoldenChanceVariant>("gold");
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [templates, setTemplates] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [rightTab, setRightTab] = useState<"content" | "style" | "layout">("content");
  const [styleDevice, setStyleDevice] = useState<"all" | "mobile" | "desktop">("all");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [savedPages, setSavedPages] = useState<FsbAffiPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [pageAction, setPageAction] = useState<"create" | "update" | "delete" | null>(null);
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("returnTo") || "/FSB_Board?section=tools";
  }, [location.search]);
  const canManagePublishedPages = canAccessFsbBoard(user);
  const selectedPage = useMemo(
    () => savedPages.find((page) => page.id === selectedPageId) ?? null,
    [savedPages, selectedPageId]
  );
  const publishedSlugPreview = useMemo(
    () => buildPublishedPageSlug(currentModel, cfg, goldenVariant),
    [currentModel, cfg, goldenVariant]
  );
  const publishedUrlPreview = useMemo(() => {
    return `${PUBLIC_SITE}/r/${publishedSlugPreview}`;
  }, [publishedSlugPreview]);
  const draftPayload = useMemo(
    () => buildPublishedPayload(currentModel, cfg, goldenVariant),
    [currentModel, cfg, goldenVariant]
  );
  const selectedPageSignature = useMemo(() => {
    if (!selectedPage) return "";
    const selectedConfig = {
      ...DEFAULT_CONFIG,
      ...(selectedPage.config || {}),
    } as Record<string, string>;
    return buildPageSignature({
      model: Number(selectedPage.model || 0),
      variant: selectedPage.model === 5 ? selectedPage.variant ?? null : null,
      brandName: String(selectedPage.brandName || ""),
      title: String(selectedPage.title || ""),
      config: selectedConfig,
    });
  }, [selectedPage]);
  const draftSignature = useMemo(
    () =>
      buildPageSignature({
        model: draftPayload.model,
        variant: draftPayload.variant,
        brandName: draftPayload.brandName,
        title: draftPayload.title,
        config: draftPayload.config,
      }),
    [draftPayload]
  );
  const hasUnsavedChanges = Boolean(selectedPage && draftSignature !== selectedPageSignature);
  // ── Load templates ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const loaded: Record<number, string> = {};
      try {
        for (const i of [1, 4, 5]) {
          const r = await fetch(`/affi_templates/model${i}.html`);
          if (!r.ok) throw new Error(`model${i}.html HTTP ${r.status}`);
          loaded[i] = await r.text();
        }
        setTemplates(loaded);

        // Init image/link defaults from template 1
        const m1 = loaded[1];
        const m4 = loaded[4];
        const m5 = loaded[5];
        const imgMatch = m1.match(/<div class="promo-image-container">\s*<img src="([^"]+)"/);
        const linkMatch = m1.match(/href="([^"]+)" class="btn-jouer"/);
        const linkMatch5 = m5.match(/href="([^"]+)" class="btn-jouer"/);
        const imgs4 = [...m4.matchAll(/<div class="promo-image-container">\s*<img src="([^"]+)"/g)];
        const brandMainMatch = m5.match(/<span class="brand-logo-main">([^<]+)</);
        const brandSubMatch = m5.match(/<span class="brand-logo-sub">([^<]+)</);

        setCfg((prev) => ({
          ...prev,
          imgUrl: imgMatch?.[1] ?? "",
          affiLink: linkMatch5?.[1] ?? linkMatch?.[1] ?? "",
          imgUrl1: imgs4[0]?.[1] ?? "",
          imgUrl2: imgs4[1]?.[1] ?? "",
          goldenBrandMain: brandMainMatch?.[1] ?? prev.goldenBrandMain,
          goldenBrandSub: brandSubMatch?.[1] ?? prev.goldenBrandSub,
        }));
      } catch (e) {
        console.error("AffiEditor: failed to load templates", e);
        setLoadError(true);
      }
    })();
  }, []);

  async function refreshPublishedPages(nextSelectedId?: number | null) {
    if (!token || !canManagePublishedPages) return;
    setLoadingPages(true);
    setPageError(null);
    try {
      const response = await listFsbAffiPages(token);
      setSavedPages(response.items);
      if (typeof nextSelectedId === "number") {
        setSelectedPageId(nextSelectedId);
      } else if (nextSelectedId === null) {
        setSelectedPageId(null);
      }
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de charger les pages publiees."));
    } finally {
      setLoadingPages(false);
    }
  }

  useEffect(() => {
    if (!token || !canManagePublishedPages) return;
    void refreshPublishedPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canManagePublishedPages]);

  function loadPublishedPageInEditor(page: FsbAffiPage) {
    setCurrentModel(Number(page.model || 5));
    if (isGoldenVariant(page.variant)) {
      setGoldenVariant(page.variant);
    }
    setCfg({ ...DEFAULT_CONFIG, ...(page.config || {}) });
    setSelectedPageId(page.id);
    setPageError(null);
    setPageNotice(`Edition chargee : /r/${page.slug}`);
  }

  function resetDraft() {
    setCfg({ ...DEFAULT_CONFIG });
    setGoldenVariant("gold");
    setSelectedPageId(null);
    setPageError(null);
    setPageNotice(null);
  }

  async function publishCurrentPage() {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour publier une page sur le site.");
      return;
    }

    const payload = draftPayload;

    const isUpdate = Boolean(selectedPageId);
    setPageAction(isUpdate ? "update" : "create");
    setPageError(null);
    setPageNotice(null);

    try {
      const response = isUpdate
        ? await updateFsbAffiPage(token, Number(selectedPageId), payload)
        : await createFsbAffiPage(token, payload);
      const page = response.item;
      await refreshPublishedPages(page.id);
      loadPublishedPageInEditor(page);
      setPageNotice(
        isUpdate
          ? `Page mise a jour : ${PUBLIC_SITE}/r/${page.slug}`
          : `Page creee : ${PUBLIC_SITE}/r/${page.slug}`
      );
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de publier cette page."));
    } finally {
      setPageAction(null);
    }
  }

  async function saveCurrentPageAsVariant() {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour creer une variante.");
      return;
    }

    setPageAction("create");
    setPageError(null);
    setPageNotice(null);

    try {
      const response = await createFsbAffiPage(token, draftPayload);
      const page = response.item;
      await refreshPublishedPages(page.id);
      loadPublishedPageInEditor(page);
      setPageNotice(`Variante creee : ${PUBLIC_SITE}/r/${page.slug}`);
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de creer cette variante."));
    } finally {
      setPageAction(null);
    }
  }

  async function removePublishedPage(page: FsbAffiPage) {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour supprimer une page.");
      return;
    }
    if (!window.confirm(`Supprimer la page ${page.slug} ?`)) return;

    setPageAction("delete");
    setPageError(null);
    setPageNotice(null);

    try {
      await deleteFsbAffiPage(token, page.id);
      const shouldClearSelection = selectedPageId === page.id;
      await refreshPublishedPages(shouldClearSelection ? null : selectedPageId);
      if (shouldClearSelection) {
        resetDraft();
      } else {
        setPageNotice(`Page supprimee : /r/${page.slug}`);
      }
    } catch (error: any) {
      setPageError(String(error?.message || "Impossible de supprimer cette page."));
    } finally {
      setPageAction(null);
    }
  }

  // ── Live preview ───────────────────────────────────────────────────────────
  function pushPreview(tmpl: string, c: Config, model: number, variant: GoldenChanceVariant) {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const raw = applyConfig(tmpl, c, model, variant);
    const base = `<base href="${window.location.origin}/">`;
    const html = raw.replace("<head>", `<head>\n  ${base}`);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blob = new Blob([html], { type: "text/html" });
    blobUrlRef.current = URL.createObjectURL(blob);

    // Quand l'iframe finit de charger, on injecte les boutons depuis le parent
    // (fallback fiable si le <script> inline ne s'exécute pas).
    const buttons = parseAffiButtons(c.customButtonsJson);
    iframe.onload = () => {
      try {
        injectButtonsIntoIframe(iframe, buttons);
      } catch (err) {
        console.error("[AffiEditor] inject buttons failed:", err);
      }
    };

    iframe.src = blobUrlRef.current;
  }

  // Immédiat quand on change de modèle / variante / templates chargés
  useEffect(() => {
    const tmpl = templates[currentModel];
    if (!tmpl) return;
    pushPreview(tmpl, cfg, currentModel, goldenVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModel, goldenVariant, templates]);

  // Debounced pour l'édition live des champs
  useEffect(() => {
    const tmpl = templates[currentModel];
    if (!tmpl) return;
    const tid = setTimeout(() => pushPreview(tmpl, cfg, currentModel, goldenVariant), 120);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  // Cleanup blob URL à la destruction
  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  // ── Set a single config key ────────────────────────────────────────────────
  const set = (key: keyof Config) => (value: string) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  // ── Export ─────────────────────────────────────────────────────────────────
  async function exportHtml() {
    const tmpl = templates[currentModel];
    if (!tmpl) return;
    let html = applyConfig(tmpl, cfg, currentModel, goldenVariant);

    if (currentModel === 5) {
      const origin = window.location.origin;

      // Inliner landing-base.css pour un export autonome
      try {
        const cssResp = await fetch("/affi_templates/golden_chance_chest/shared/landing-base.css");
        if (cssResp.ok) {
          const css = await cssResp.text();
          html = html.replace(
            /<link rel="stylesheet" href="\/affi_templates\/golden_chance_chest\/shared\/landing-base\.css">\s*/i,
            `<style>\n${css}\n</style>`
          );
        }
      } catch { /* garde le lien externe en fallback */ }

      // Inliner landing-base.js
      try {
        const jsResp = await fetch("/affi_templates/golden_chance_chest/shared/landing-base.js");
        if (jsResp.ok) {
          const js = await jsResp.text();
          html = html.replace(
            /<script src="\/affi_templates\/golden_chance_chest\/shared\/landing-base\.js"><\/script>\s*/i,
            `<script>\n${js}\n</script>`
          );
        }
      } catch { /* garde le lien externe en fallback */ }

      if (cfg.goldenBackgroundUrl) {
        html = await inlineAssetCandidates(html, [cfg.goldenBackgroundUrl]);
      } else {
        const backgroundCandidates = [
          `/affi_templates/golden_chance_chest/variants/${goldenVariant}/background.png`,
          `/affi_templates/golden_chance_chest/variants/${goldenVariant}/background.jpg`,
        ];
        html = await inlineAssetCandidates(html, backgroundCandidates);
      }

      html = await inlineAssetCandidates(html, getGoldenVisualCandidates(cfg, goldenVariant));

      // Fallback robuste: liens absolus vers l'instance qui a généré l'export
      html = absolutizeAffiTemplateUrls(html, origin);

      // Les navigateurs Chromium sont capricieux avec les fichiers locaux + target=_blank.
      // En export autonome, on préfère une navigation simple dans le même onglet.
      html = html.replace(/target="_blank"/g, 'target="_self"');
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentModel === 5
      ? `golden_chance_chest_${goldenVariant}.html`
      : `affi_model${currentModel}_export.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Iframe width by viewport ───────────────────────────────────────────────
  const iframeWidth = viewport === "desktop" ? "100%" : viewport === "tablet" ? "768px" : "390px";

  // ── Style tab helpers ─────────────────────────────────────────────────────
  // Returns the correct config key for a typography prop given the current device tab
  function typoKey(base: keyof Config, mKey: keyof Config, dKey: keyof Config): keyof Config {
    if (styleDevice === "mobile") return mKey;
    if (styleDevice === "desktop") return dKey;
    return base;
  }

  function typoPlaceholder(base: keyof Config): string {
    return String(cfg[base] || "");
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.logo}>🎨 <span style={{ color: "#eee", fontWeight: 400 }}>Affi</span> Editor</div>
        {selectedPage && (
          <span style={{ fontSize: "0.74rem", color: "#9f9fc1", fontFamily: "monospace", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            /r/{selectedPage.slug}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button style={{ ...s.btn, ...s.btnSecondary }} onClick={() => navigate(returnTo)}>
          Retour
        </button>
        <button style={{ ...s.btn, ...s.btnSecondary }} onClick={resetDraft}>
          Réinitialiser
        </button>
        {selectedPageId && hasUnsavedChanges && (
          <button
            style={{ ...s.btn, ...s.btnVariant, opacity: canManagePublishedPages ? 1 : 0.55 }}
            onClick={saveCurrentPageAsVariant}
            disabled={!canManagePublishedPages || pageAction === "create" || pageAction === "update"}
            title="Creer une nouvelle page a partir de cette version modifiee"
          >
            + Variante
          </button>
        )}
        <button
          style={{ ...s.btn, ...s.btnSuccess, opacity: canManagePublishedPages ? 1 : 0.55 }}
          onClick={publishCurrentPage}
          disabled={!canManagePublishedPages || pageAction === "create" || pageAction === "update"}
          title={canManagePublishedPages ? publishedUrlPreview : "Acces FSB requis"}
        >
          {selectedPageId ? "Mettre à jour" : "Créer"}
        </button>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={exportHtml}>
          ⬇ Export
        </button>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div style={s.body}>

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
        <div style={s.leftSidebar}>
          {/* Pages list */}
          <div style={s.sidebarSectionTitle}>
            <span>Pages</span>
            <button style={s.sidebarNewBtn} onClick={resetDraft} title="Nouveau brouillon">+</button>
          </div>

          {loadError && (
            <div style={{ ...s.inlineError, margin: "8px 8px 0" }}>
              Templates introuvables dans <code>/affi_templates/</code>.
            </div>
          )}

          {pageError && <div style={{ ...s.inlineError, margin: "8px 8px 0" }}>{pageError}</div>}
          {pageNotice && <div style={{ ...s.inlineNotice, margin: "8px 8px 0" }}>{pageNotice}</div>}

          <div style={s.sidebarPageList}>
            {loadingPages ? (
              <div style={s.sidebarPageEmpty}>Chargement...</div>
            ) : savedPages.length === 0 ? (
              <div style={s.sidebarPageEmpty}>Aucune page</div>
            ) : (
              savedPages.map((page) => {
                const isActive = page.id === selectedPageId;
                return (
                  <div
                    key={page.id}
                    style={{ ...s.sidebarPageCard, ...(isActive ? s.sidebarPageCardActive : {}) }}
                  >
                    <button
                      style={s.sidebarPageBtn}
                      onClick={() => loadPublishedPageInEditor(page)}
                    >
                      <div style={s.sidebarPageName}>{page.brandName || page.slug}</div>
                      <div style={s.sidebarPageMeta}>
                        M{page.model}{page.variant ? ` · ${page.variant}` : ""}
                      </div>
                    </button>
                    <div style={s.sidebarPageActions}>
                      <button
                        style={s.sidebarIconBtn}
                        title="Ouvrir"
                        onClick={() => window.open(`${PUBLIC_SITE}/r/${page.slug}`, "_blank", "noopener,noreferrer")}
                      >↗</button>
                      <button
                        style={{ ...s.sidebarIconBtn, color: "#ffb2b2" }}
                        title="Supprimer"
                        onClick={() => void removePublishedPage(page)}
                        disabled={pageAction === "delete"}
                      >✕</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={s.sidebarDivider} />

          {/* Model picker */}
          <div style={s.sidebarSectionTitle}>
            <span>Modèle</span>
          </div>
          <div style={s.sidebarModelList}>
            {([1, 4, 5] as const).map((n) => (
              <button
                key={n}
                style={{ ...s.modelCard, ...(currentModel === n ? s.modelCardActive : {}) }}
                onClick={() => setCurrentModel(n)}
              >
                <div style={s.modelThumb}>
                  <ModelThumb n={n} />
                </div>
                <div style={s.modelLabel}>M{n}</div>
                <div style={s.modelDesc}>
                  {n === 1 ? "Side" : n === 4 ? "2 cartes" : "Golden"}
                </div>
              </button>
            ))}
          </div>

          {/* Variant picker for model 5 */}
          {currentModel === 5 && (
            <>
              <div style={s.sidebarDivider} />
              <div style={s.sidebarSectionTitle}><span>Variante</span></div>
              <div style={{ padding: "0 8px 8px" }}>
                <VariantPicker value={goldenVariant} onChange={setGoldenVariant} />
              </div>
            </>
          )}

          {selectedPage && hasUnsavedChanges && (
            <div style={{ ...s.inlineWarn, margin: "8px 8px 0" }}>
              Modifications non enregistrées
            </div>
          )}
          {!canManagePublishedPages && (
            <div style={{ ...s.inlineWarn, margin: "8px 8px 0" }}>
              Accès FSB requis pour publier
            </div>
          )}
        </div>

        {/* ── CENTER PREVIEW ────────────────────────────────────────────────── */}
        <div style={s.previewPanel}>
          <div style={s.previewToolbar}>
            <span style={{ fontSize: 12, color: "#888" }}>
              Modèle {currentModel}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {(["desktop", "tablet", "mobile"] as const).map((v) => (
                <button
                  key={v}
                  style={{ ...s.vpBtn, ...(viewport === v ? s.vpBtnActive : {}) }}
                  onClick={() => setViewport(v)}
                >
                  {v === "desktop" ? "🖥" : v === "tablet" ? "📱" : "📱"}
                  {" "}{v === "desktop" ? "Desktop" : v === "tablet" ? "Tablette" : "Mobile"}
                </button>
              ))}
            </div>
          </div>
          <div style={s.previewWrap}>
            <iframe
              ref={iframeRef}
              style={{ ...s.iframe, width: iframeWidth, maxWidth: iframeWidth }}
              title="preview"
            />
          </div>
        </div>

        {/* ── RIGHT PANEL ───────────────────────────────────────────────────── */}
        <div style={s.rightPanel}>
          {/* Tab bar */}
          <div style={s.tabBar}>
            {(["content", "style", "layout"] as const).map((tab) => (
              <button
                key={tab}
                style={{ ...s.tabBtn, ...(rightTab === tab ? s.tabBtnActive : {}) }}
                onClick={() => setRightTab(tab)}
              >
                {tab === "content" ? "Contenu" : tab === "style" ? "Style" : "Disposition"}
              </button>
            ))}
          </div>

          {/* ── TAB: CONTENU ──────────────────────────────────────────────── */}
          {rightTab === "content" && (
            <div style={s.tabContent}>

              {/* URL preview */}
              <div style={{ padding: "10px 14px 0" }}>
                <div style={s.urlPreview}>{publishedUrlPreview}</div>
              </div>

              {currentModel !== 5 && (
                <>
                  <Section title="Couleurs">
                    <ColorField label="Fond page" value={cfg.bgPage} onChange={set("bgPage")} />
                    <ColorField label="Fond carte" value={cfg.bgCard} onChange={set("bgCard")} />
                    <ColorField label="Or" value={cfg.brandGold} onChange={set("brandGold")} />
                    <ColorField label="Ruby" value={cfg.brandRuby} onChange={set("brandRuby")} />
                    <ColorField label="Vert" value={cfg.casinoGreen} onChange={set("casinoGreen")} />
                    <ColorField label="Bordure" value={cfg.borderColor} onChange={set("borderColor")} />
                  </Section>

                  <Section title="Image & Lien">
                    {currentModel !== 4 ? (
                      <ImagePicker label="Image principale" value={cfg.imgUrl} onChange={set("imgUrl")} />
                    ) : (
                      <>
                        <ImagePicker label="Image carte 1" value={cfg.imgUrl1} onChange={set("imgUrl1")} />
                        <ImagePicker label="Image carte 2" value={cfg.imgUrl2} onChange={set("imgUrl2")} />
                      </>
                    )}
                    <TextField label="Lien d'affiliation" value={cfg.affiLink} onChange={set("affiLink")} placeholder="https://casino.com/ref/..." type="url" />
                  </Section>

                  <Section title="Offre">
                    <TextField label="Titre offre" value={cfg.offerTitle} onChange={set("offerTitle")} />
                    <TextField label="Texte dépôt" value={cfg.depositText} onChange={set("depositText")} />
                    <TextField label="Texte reçu" value={cfg.receiveText} onChange={set("receiveText")} />
                    {currentModel === 4 && (
                      <>
                        <div style={{ ...s.label, color: "#FFD700", marginTop: 8 }}>Carte 2</div>
                        <TextField label="Texte dépôt (carte 2)" value={cfg.depositText2} onChange={set("depositText2")} />
                        <TextField label="Texte reçu (carte 2)" value={cfg.receiveText2} onChange={set("receiveText2")} />
                      </>
                    )}
                  </Section>

                  <Section title="Textes" defaultOpen={false}>
                    <TextField label="Badge VIP" value={cfg.badgeText} onChange={set("badgeText")} />
                    <TextField label="H1 — texte principal" value={cfg.heroTitleBefore} onChange={set("heroTitleBefore")} />
                    <TextField label="H1 — texte en or" value={cfg.heroTitleSpan} onChange={set("heroTitleSpan")} />
                    <TextField label="Sous-titre" value={cfg.heroSubtitle} onChange={set("heroSubtitle")} multiline />
                    <TextField label="Texte bouton" value={cfg.btnText} onChange={set("btnText")} />
                    <TextField label="Sticky CTA" value={cfg.stickyText} onChange={set("stickyText")} />
                    <TextField label="Nom du casino" value={cfg.casinoName} onChange={set("casinoName")} />
                    <TextField label="Balise title" value={cfg.pageTitle} onChange={set("pageTitle")} />
                  </Section>
                </>
              )}

              {currentModel === 5 && (
                <>
                  <Section title="Général">
                    <TextField label="Lien d'affiliation" value={cfg.affiLink} onChange={set("affiLink")} placeholder="https://casino.com/ref/..." type="url" />
                    <TextField label="Balise title" value={cfg.goldenPageTitle} onChange={set("goldenPageTitle")} />
                  </Section>

                  <Section title="💰 Montants du bonus">
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                      Ces valeurs remplacent automatiquement tous les montants affichés sur la page (hero, "ce que tu gagnes", boutons).
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <TextField label="Dépôt (€)" value={cfg.goldenDepositAmount} onChange={set("goldenDepositAmount")} placeholder="20" />
                      <TextField label="Bonus (€)" value={cfg.goldenBonusAmount} onChange={set("goldenBonusAmount")} placeholder="20" />
                      <TextField label="Total (€)" value={cfg.goldenTotalAmount} onChange={set("goldenTotalAmount")} placeholder="40" />
                    </div>
                  </Section>

                  <Section title="Hero" defaultOpen={false}>
                    <TextField label="Pseudo / marque" value={cfg.goldenBrandMain} onChange={set("goldenBrandMain")} />
                    <TextField label="Sous-ligne logo" value={cfg.goldenBrandSub} onChange={set("goldenBrandSub")} />
                    <TextField label="Titre ligne 1" value={cfg.goldenHeroTitleBefore} onChange={set("goldenHeroTitleBefore")} />
                    <TextField label="Titre ligne 2" value={cfg.goldenHeroTitleSpan} onChange={set("goldenHeroTitleSpan")} />
                    <TextField label="Sous-titre" value={cfg.goldenHeroSubtitle} onChange={set("goldenHeroSubtitle")} multiline />
                  </Section>

                  <Section title="Visuel">
                    <div style={s.field}>
                      <label style={s.label}>Visuel principal</label>
                      <div style={s.variantGrid}>
                        <button style={{ ...s.variantBtn, ...(getGoldenVisualMode(cfg) === "chest" ? s.variantBtnActive : {}) }} onClick={() => set("goldenVisualMode")("chest")}>
                          <span style={s.visualModeIcon}>🧰</span><span>Coffre</span>
                        </button>
                        <button style={{ ...s.variantBtn, ...(getGoldenVisualMode(cfg) === "games" ? s.variantBtnActive : {}) }} onClick={() => set("goldenVisualMode")("games")}>
                          <span style={s.visualModeIcon}>🎮</span><span>Jeux</span>
                        </button>
                        <button style={{ ...s.variantBtn, ...(getGoldenVisualMode(cfg) === "none" ? s.variantBtnActive : {}) }} onClick={() => set("goldenVisualMode")("none")}>
                          <span style={s.visualModeIcon}>🚫</span><span>Aucun</span>
                        </button>
                      </div>
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Image du coffre (optionnelle)</label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="url" value={cfg.goldenChestUrl} onChange={(e) => set("goldenChestUrl")(e.target.value)} placeholder="https://.../chest.png" style={{ ...s.input, flex: 1, marginTop: 0 }} />
                        {cfg.goldenChestUrl && (
                          <button style={{ ...s.btn, ...s.btnSecondary, padding: "5px 10px", fontSize: "0.78rem" }} onClick={() => set("goldenChestUrl")("")}>✕</button>
                        )}
                      </div>
                    </div>
                    <TextField label="Image jeux (optionnelle)" value={cfg.goldenGameImageUrl} onChange={set("goldenGameImageUrl")} placeholder="https://.../jeux.png" type="url" />
                    <TextField label="Image de fond (optionnelle)" value={cfg.goldenBackgroundUrl} onChange={set("goldenBackgroundUrl")} placeholder="https://.../background.jpg" type="url" />
                    {getGoldenVisualMode(cfg) === "none" && (
                      <div style={s.field}>
                        <label style={s.label}>Position bouton (mode sans coffre)</label>
                        <div style={s.variantGrid}>
                          <button style={{ ...s.variantBtn, ...(cfg.goldenCtaPosition !== "bottom" ? s.variantBtnActive : {}) }} onClick={() => set("goldenCtaPosition")("top")}>
                            <span style={s.visualModeIcon}>⬆</span><span>Sous le texte</span>
                          </button>
                          <button style={{ ...s.variantBtn, ...(cfg.goldenCtaPosition === "bottom" ? s.variantBtnActive : {}) }} onClick={() => set("goldenCtaPosition")("bottom")}>
                            <span style={s.visualModeIcon}>⬇</span><span>Bas d'écran</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </Section>
                </>
              )}

              {/* Boutons custom — disponibles sur tous les modèles */}
              <Section title="Boutons custom" defaultOpen={false}>
                <ButtonsEditor
                  buttons={parseAffiButtons(cfg.customButtonsJson)}
                  onChange={(next) => set("customButtonsJson")(stringifyAffiButtons(next))}
                  bonusAmount={cfg.goldenBonusAmount}
                  affiLink={cfg.affiLink}
                  variant={goldenVariant}
                />
              </Section>
            </div>
          )}

          {/* ── TAB: STYLE (model 5 only) ─────────────────────────────────── */}
          {rightTab === "style" && (
            <div style={s.tabContent}>
              {currentModel !== 5 ? (
                <div style={{ padding: "20px 14px", color: "#888", fontSize: "0.8rem", textAlign: "center" }}>
                  L'onglet Style est disponible uniquement pour le modèle 5 (Golden Chest).
                </div>
              ) : (
                <>
                  {/* Device toggle */}
                  <div style={s.deviceToggle}>
                    {(["all", "mobile", "desktop"] as const).map((d) => (
                      <button
                        key={d}
                        style={{ ...s.deviceBtn, ...(styleDevice === d ? s.deviceBtnActive : {}) }}
                        onClick={() => setStyleDevice(d)}
                      >
                        {d === "all" ? "✱ Tous" : d === "mobile" ? "📱 Mobile" : "🖥 Desktop"}
                      </button>
                    ))}
                  </div>
                  {styleDevice !== "all" && (
                    <div style={{ padding: "4px 14px 0", color: "#9f9fc1", fontSize: "0.7rem" }}>
                      {styleDevice === "mobile"
                        ? "Override mobile (max 720px) — surcharge la valeur base"
                        : "Override desktop (min 721px) — surcharge la valeur base"}
                    </div>
                  )}

                  <Section title="Brand (Logo / Pseudo)">
                    <StyleControl
                      label="Taille de police"
                      value={String(cfg[typoKey("t_brandFs", "t_brandFsM", "t_brandFsD")] || "")}
                      onChange={(v) => set(typoKey("t_brandFs", "t_brandFsM", "t_brandFsD"))(v)}
                      placeholder={styleDevice !== "all" ? typoPlaceholder("t_brandFs") || "ex: 3rem" : "ex: 3rem"}
                      type="text"
                    />
                    {styleDevice === "all" && (
                      <>
                        <StyleControl
                          label="Police"
                          value={cfg.t_brandFf}
                          onChange={set("t_brandFf")}
                          type="select"
                          options={FONT_NAMES}
                        />
                        <StyleControl
                          label="Letter spacing"
                          value={cfg.t_brandLs}
                          onChange={set("t_brandLs")}
                          placeholder="ex: 0.16em"
                          type="text"
                        />
                        <StyleControl
                          label="Couleur"
                          value={cfg.t_brandColor}
                          onChange={set("t_brandColor")}
                          type="color"
                        />
                      </>
                    )}
                  </Section>

                  <Section title="Titre (H1)">
                    <StyleControl
                      label="Taille de police"
                      value={String(cfg[typoKey("t_titleFs", "t_titleFsM", "t_titleFsD")] || "")}
                      onChange={(v) => set(typoKey("t_titleFs", "t_titleFsM", "t_titleFsD"))(v)}
                      placeholder={styleDevice !== "all" ? typoPlaceholder("t_titleFs") || "ex: 4rem" : "ex: 4rem"}
                      type="text"
                    />
                    {styleDevice === "all" && (
                      <>
                        <StyleControl
                          label="Police"
                          value={cfg.t_titleFf}
                          onChange={set("t_titleFf")}
                          type="select"
                          options={FONT_NAMES}
                        />
                        <StyleControl
                          label="Letter spacing"
                          value={cfg.t_titleLs}
                          onChange={set("t_titleLs")}
                          placeholder="ex: 0.04em"
                          type="text"
                        />
                        <StyleControl
                          label="Couleur"
                          value={cfg.t_titleColor}
                          onChange={set("t_titleColor")}
                          type="color"
                        />
                      </>
                    )}
                  </Section>

                  <Section title="Sous-titre">
                    <StyleControl
                      label="Taille de police"
                      value={String(cfg[typoKey("t_subFs", "t_subFsM", "t_subFsD")] || "")}
                      onChange={(v) => set(typoKey("t_subFs", "t_subFsM", "t_subFsD"))(v)}
                      placeholder={styleDevice !== "all" ? typoPlaceholder("t_subFs") || "ex: 1rem" : "ex: 1rem"}
                      type="text"
                    />
                    {styleDevice === "all" && (
                      <>
                        <StyleControl
                          label="Police"
                          value={cfg.t_subFf}
                          onChange={set("t_subFf")}
                          type="select"
                          options={FONT_NAMES}
                        />
                        <StyleControl
                          label="Letter spacing"
                          value={cfg.t_subLs}
                          onChange={set("t_subLs")}
                          placeholder="ex: normal"
                          type="text"
                        />
                        <StyleControl
                          label="Couleur"
                          value={cfg.t_subColor}
                          onChange={set("t_subColor")}
                          type="color"
                        />
                      </>
                    )}
                  </Section>

                  <Section title="Bouton CTA">
                    <StyleControl
                      label="Taille de police"
                      value={String(cfg[typoKey("t_ctaFs", "t_ctaFsM", "t_ctaFsD")] || "")}
                      onChange={(v) => set(typoKey("t_ctaFs", "t_ctaFsM", "t_ctaFsD"))(v)}
                      placeholder={styleDevice !== "all" ? typoPlaceholder("t_ctaFs") || "ex: 1rem" : "ex: 1rem"}
                      type="text"
                    />
                    {styleDevice === "all" && (
                      <>
                        <StyleControl
                          label="Police"
                          value={cfg.t_ctaFf}
                          onChange={set("t_ctaFf")}
                          type="select"
                          options={FONT_NAMES}
                        />
                        <StyleControl
                          label="Letter spacing"
                          value={cfg.t_ctaLs}
                          onChange={set("t_ctaLs")}
                          placeholder="ex: 0.18em"
                          type="text"
                        />
                      </>
                    )}
                  </Section>
                </>
              )}
            </div>
          )}

          {/* ── TAB: DISPOSITION (model 5 only) ──────────────────────────── */}
          {rightTab === "layout" && (
            <div style={s.tabContent}>
              {currentModel !== 5 ? (
                <div style={{ padding: "20px 14px", color: "#888", fontSize: "0.8rem", textAlign: "center" }}>
                  L'onglet Disposition est disponible uniquement pour le modèle 5 (Golden Chest).
                </div>
              ) : (
                <>
                  <div style={{ padding: "12px 14px 4px", color: "#9f9fc1", fontSize: "0.72rem" }}>
                    Décalage des blocs par rapport à leur position naturelle (en px).
                  </div>

                  <Section title="Brand (Logo)">
                    <OffsetControl label="Décalage horizontal (X)" value={cfg.p_brandX} onChange={set("p_brandX")} />
                    <OffsetControl label="Décalage vertical (Y)" value={cfg.p_brandY} onChange={set("p_brandY")} />
                  </Section>

                  <Section title="Offre (Titre + Sous-titre)">
                    <OffsetControl label="Décalage horizontal (X)" value={cfg.p_offerX} onChange={set("p_offerX")} />
                    <OffsetControl label="Décalage vertical (Y)" value={cfg.p_offerY} onChange={set("p_offerY")} />
                  </Section>

                  <Section title="Bouton CTA">
                    <OffsetControl label="Décalage horizontal (X)" value={cfg.p_ctaX} onChange={set("p_ctaX")} />
                    <OffsetControl label="Décalage vertical (Y)" value={cfg.p_ctaY} onChange={set("p_ctaY")} />
                  </Section>
                </>
              )}
            </div>
          )}
        </div>

      </div>{/* .body */}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: "#0d0d1a",
    color: "#e0e0f0",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 9999,
  },
  header: {
    height: 52,
    background: "#141428",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    gap: 10,
    flexShrink: 0,
  },
  logo: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "#FFD700",
    letterSpacing: "0.3px",
    whiteSpace: "nowrap",
  },
  btn: {
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    whiteSpace: "nowrap",
  },
  btnPrimary: {
    background: "#FFD700",
    color: "#000",
  },
  btnSuccess: {
    background: "#2ccf85",
    color: "#07110c",
  },
  btnVariant: {
    background: "#2a2348",
    color: "#f2e7ff",
    border: "1px solid rgba(194, 146, 255, 0.36)",
  },
  btnSecondary: {
    background: "#1c1c35",
    color: "#e0e0f0",
    border: "1px solid #2a2a4a",
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },

  // Picker
  picker: {
    width: 148,
    background: "#141428",
    borderRight: "1px solid #2a2a4a",
    overflowY: "auto",
    padding: "10px 8px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  pickerTitle: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#666",
    padding: "0 4px",
    marginBottom: 2,
  },
  modelCard: {
    background: "#1c1c35",
    border: "2px solid #2a2a4a",
    borderRadius: 8,
    padding: "8px 6px",
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color 0.15s",
    width: "100%",
  },
  modelCardActive: {
    borderColor: "#FFD700",
    background: "rgba(255,215,0,0.06)",
  },
  modelThumb: {
    width: "100%",
    height: 68,
    borderRadius: 4,
    marginBottom: 6,
    overflow: "hidden",
    background: "#0a0a15",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modelLabel: {
    fontSize: "0.76rem",
    fontWeight: 600,
    color: "#e0e0f0",
  },
  modelDesc: {
    fontSize: "0.66rem",
    color: "#666",
    marginTop: 2,
  },

  // Config panel
  configPanel: {
    width: 300,
    background: "#0d0d1a",
    borderRight: "1px solid #2a2a4a",
    overflowY: "auto",
    flexShrink: 0,
    paddingBottom: 20,
  },
  section: {
    borderBottom: "1px solid #1e1e38",
    overflow: "hidden",
  },
  sectionHeader: {
    width: "100%",
    padding: "11px 16px",
    fontSize: "0.76rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "#888",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "none",
    border: "none",
    color2: "#e0e0f0",
  } as React.CSSProperties,
  sectionBody: {
    padding: "2px 16px 14px",
  },
  field: {
    marginBottom: 10,
  },
  label: {
    display: "block",
    fontSize: "0.72rem",
    color: "#888",
    marginBottom: 4,
    fontWeight: 500,
  },
  input: {
    width: "100%",
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    borderRadius: 5,
    color: "#e0e0f0",
    padding: "6px 9px",
    fontSize: "0.8rem",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  colorPicker: {
    width: 34,
    height: 28,
    border: "1px solid #2a2a4a",
    borderRadius: 4,
    background: "none",
    cursor: "pointer",
    padding: 1,
    flexShrink: 0,
  },
  variantGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 10,
  },
  variantBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 12px",
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    borderRadius: 8,
    color: "#e0e0f0",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
    textAlign: "left",
  },
  variantBtnActive: {
    background: "rgba(255,255,255,0.04)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
  },
  variantSwatch: {
    width: 14,
    height: 14,
    borderRadius: 999,
    flexShrink: 0,
  },
  visualModeIcon: {
    width: 16,
    textAlign: "center",
    flexShrink: 0,
  },
  helperText: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #2a2a4a",
    borderRadius: 6,
    color: "#b8b9c7",
    fontSize: "0.72rem",
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  urlPreview: {
    marginBottom: 10,
    padding: "12px 13px",
    background: "linear-gradient(180deg, #18182c 0%, #121225 100%)",
    border: "1px solid rgba(255, 215, 0, 0.14)",
    borderRadius: 10,
    color: "#f7efc5",
    fontSize: "0.74rem",
    fontFamily: "monospace",
    lineHeight: 1.5,
    wordBreak: "break-all",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  savedPageStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 10,
  },
  savedPageStatCard: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #262642",
    background: "linear-gradient(180deg, #17172b 0%, #121223 100%)",
  },
  savedPageStatValue: {
    fontSize: "1rem",
    fontWeight: 800,
    color: "#f4f0df",
  },
  savedPageStatLabel: {
    marginTop: 3,
    fontSize: "0.66rem",
    textTransform: "uppercase",
    letterSpacing: ".08em",
    color: "#8f8fb4",
  },
  inlineError: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(255, 96, 96, 0.12)",
    border: "1px solid rgba(255, 96, 96, 0.26)",
    borderRadius: 8,
    color: "#ffb2b2",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  inlineWarn: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(255, 215, 0, 0.09)",
    border: "1px solid rgba(255, 215, 0, 0.22)",
    borderRadius: 8,
    color: "#f2d978",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  inlineNotice: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(44, 207, 133, 0.12)",
    border: "1px solid rgba(44, 207, 133, 0.26)",
    borderRadius: 8,
    color: "#a9efd0",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  inlineInfo: {
    marginBottom: 10,
    padding: "9px 10px",
    background: "rgba(111, 150, 207, 0.12)",
    border: "1px solid rgba(111, 150, 207, 0.22)",
    borderRadius: 8,
    color: "#c8daf8",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  },
  savedPageTools: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  smallActionBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid #2a2a4a",
    background: "#1c1c35",
    color: "#e0e0f0",
    fontSize: "0.7rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  smallActionBtnDanger: {
    color: "#ffb2b2",
    borderColor: "rgba(255, 96, 96, 0.28)",
    background: "rgba(95, 26, 34, 0.42)",
  },
  savedPageList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  savedPageGroupTitle: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: ".12em",
    fontWeight: 800,
    color: "#9f9fc1",
    marginTop: 2,
    marginBottom: 2,
  },
  savedPageCard: {
    border: "1px solid #2a2a46",
    borderRadius: 12,
    background: "linear-gradient(180deg, #17172c 0%, #111120 100%)",
    padding: 12,
    boxShadow: "0 12px 24px rgba(0,0,0,0.16)",
  },
  savedPageCardActive: {
    borderColor: "#FFD700",
    boxShadow: "0 0 0 1px rgba(255, 215, 0, 0.18) inset, 0 14px 28px rgba(0,0,0,0.18)",
  },
  savedPageHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 8,
  },
  savedPageTitle: {
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#f4f0df",
    wordBreak: "break-word",
  },
  savedPageSlug: {
    marginTop: 6,
    display: "inline-flex",
    maxWidth: "100%",
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#d7dbf6",
    fontSize: "0.65rem",
    fontFamily: "monospace",
    lineHeight: 1.35,
    wordBreak: "break-all",
  },
  savedPageMeta: {
    fontSize: "0.66rem",
    color: "#8f8fb4",
    marginTop: 8,
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  savedPageBadge: {
    padding: "4px 7px",
    borderRadius: 999,
    fontSize: "0.6rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    background: "rgba(255, 215, 0, 0.14)",
    color: "#FFD700",
    border: "1px solid rgba(255, 215, 0, 0.24)",
    flexShrink: 0,
  },
  savedPageTag: {
    padding: "4px 7px",
    borderRadius: 999,
    fontSize: "0.6rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    background: "rgba(111, 150, 207, 0.14)",
    color: "#c8daf8",
    border: "1px solid rgba(111, 150, 207, 0.22)",
    flexShrink: 0,
  },
  savedPageActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  savedPageEmpty: {
    border: "1px dashed #2a2a4a",
    borderRadius: 10,
    padding: 12,
    color: "#8b8ba9",
    fontSize: "0.72rem",
    lineHeight: 1.45,
    textAlign: "center",
    background: "#121222",
  },
  errorBanner: {
    margin: 12,
    padding: "12px 14px",
    background: "rgba(224,17,95,0.08)",
    border: "1px solid rgba(224,17,95,0.3)",
    borderRadius: 6,
    fontSize: "0.78rem",
    color: "#e0115f",
    lineHeight: 1.6,
  },

  // Left sidebar
  leftSidebar: {
    width: 180,
    background: "#141428",
    borderRight: "1px solid #2a2a4a",
    overflowY: "auto",
    padding: 0,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
  },
  sidebarSectionTitle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 10px 6px",
    fontSize: "0.66rem",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    color: "#666",
  },
  sidebarNewBtn: {
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    borderRadius: 4,
    color: "#888",
    cursor: "pointer",
    fontSize: "1rem",
    lineHeight: 1,
    padding: "0px 6px 2px",
  },
  sidebarPageList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    padding: "0 6px",
    overflowY: "auto" as const,
    maxHeight: 220,
  },
  sidebarPageEmpty: {
    padding: "6px 4px",
    color: "#666",
    fontSize: "0.7rem",
    textAlign: "center" as const,
  },
  sidebarPageCard: {
    border: "1px solid #2a2a46",
    borderRadius: 8,
    background: "#17172c",
    overflow: "hidden",
  },
  sidebarPageCardActive: {
    borderColor: "#FFD700",
    background: "rgba(255,215,0,0.04)",
  },
  sidebarPageBtn: {
    display: "block",
    width: "100%",
    padding: "6px 8px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  sidebarPageName: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#f4f0df",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  sidebarPageMeta: {
    fontSize: "0.62rem",
    color: "#8f8fb4",
    marginTop: 2,
  },
  sidebarPageActions: {
    display: "flex",
    borderTop: "1px solid #2a2a46",
  },
  sidebarIconBtn: {
    flex: 1,
    padding: "4px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#888",
    fontSize: "0.8rem",
  },
  sidebarDivider: {
    height: 1,
    background: "#2a2a4a",
    margin: "8px 0",
  },
  sidebarModelList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    padding: "0 8px 8px",
  },

  // Right panel
  rightPanel: {
    width: 290,
    background: "#0d0d1a",
    borderLeft: "1px solid #2a2a4a",
    overflowY: "hidden",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #2a2a4a",
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: "10px 4px",
    fontSize: "0.72rem",
    fontWeight: 600,
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#666",
    cursor: "pointer",
  },
  tabBtnActive: {
    color: "#FFD700",
    borderBottomColor: "#FFD700",
    background: "rgba(255,215,0,0.03)",
  },
  tabContent: {
    flex: 1,
    overflowY: "auto" as const,
    paddingBottom: 20,
  },
  deviceToggle: {
    display: "flex",
    gap: 4,
    padding: "10px 14px 6px",
  },
  deviceBtn: {
    flex: 1,
    padding: "5px 4px",
    fontSize: "0.68rem",
    fontWeight: 600,
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    borderRadius: 5,
    color: "#666",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  deviceBtnActive: {
    borderColor: "#FFD700",
    color: "#FFD700",
    background: "rgba(255,215,0,0.05)",
  },

  // Preview
  previewPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#111",
  },
  previewToolbar: {
    height: 36,
    background: "#141428",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    flexShrink: 0,
  },
  vpBtn: {
    background: "#1c1c35",
    border: "1px solid #2a2a4a",
    color: "#888",
    padding: "3px 10px",
    borderRadius: 4,
    fontSize: "0.72rem",
    cursor: "pointer",
  },
  vpBtnActive: {
    borderColor: "#FFD700",
    color: "#FFD700",
  },
  previewWrap: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    justifyContent: "center",
    background: "#111",
  },
  iframe: {
    border: "none",
    background: "white",
    height: "100%",
    transition: "width 0.2s",
  },
};
