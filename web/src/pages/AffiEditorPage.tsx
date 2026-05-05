// web/src/pages/AffiEditorPage.tsx
// Éditeur de templates d'affiliation — accessible sur /editorFSN
// Aucun topbar ni footer : la page prend tout l'écran.

import { useEffect, useRef, useState, useMemo, Fragment } from "react";
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

// Base publique pour les URLs partageables (/r/...). Par défaut Render (lunalive.onrender.com),
// surchargeable via VITE_PUBLIC_SITE_URL si besoin de re-pointer ailleurs.
const PUBLIC_SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? "https://lunalive.onrender.com").replace(/\/$/, "");

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
  // M4 : couleur du titre H1 — "1" = doré, "" / non-défini = blanc (défaut)
  m4TitleMainGold?: string;  // texte principal (heroTitleBefore)
  m4TitleSpanGold?: string;  // texte en or (heroTitleSpan / span) — défaut "1"
  // M4 : "1" = span sur une nouvelle ligne (empilé), "" = inline (défaut)
  m4TitleStacked?: string;
  // M4 : 3e ligne du H1, ajoutée SOUS le span (en blanc par défaut). Vide = pas de 3e ligne.
  heroTitleAfter?: string;
  colorTitleAfter?: string;
  // Couleurs individuelles par texte (M4) — vide = défaut du template
  colorBadge?: string;
  colorTitleMain?: string;
  colorTitleSpan?: string;
  colorSubtitle?: string;
  colorBtn?: string;
  colorSticky?: string;
  // Couleur globale du texte des avis (section reviews-section)
  colorReviewText?: string;
  heroTitleBefore: string;
  heroTitleSpan: string;
  heroSubtitle: string;
  btnText: string;
  stickyText: string;
  casinoName: string;
  casinoLogoUrl: string;  // logo du casino affiché dans le nav-mark / brand-mark / hero-mark
  pageTitle: string;
  goldenBrandMain: string;
  goldenBrandSub: string;
  goldenHideName: string;     // "1" = masquer le pseudo + les 2 lignes qui l'encadrent
  goldenLandingOnly: string;  // "1" = masquer tout ce qui est sous le hero (gains/avis/faq/final)
  goldenHeroTitleBefore: string;
  goldenHeroTitleSpan: string;
  goldenHeroSubtitle: string;
  goldenPageTitle: string;
  goldenChestUrl: string;
  goldenGameImageUrl: string;
  goldenVisualMode: string;
  goldenBackgroundUrl: string;
  goldenProfileImageUrl: string;  // Photo de profil ronde au-dessus du brand-signature (M5)
  goldenCtaPosition: string; // "top" | "bottom"
  // Montants affichés (model 5)
  goldenDepositAmount: string;  // ex: "20"
  goldenBonusAmount: string;    // ex: "20"
  goldenTotalAmount: string;    // ex: "40"
  // Texte personnalisé du bouton RÉCLAME (hero btn-jouer). Si vide, on utilise
  // le texte par défaut "RÉCLAME TES X€ OFFERTS" avec X = goldenBonusAmount.
  goldenHeroCtaText: string;
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
  // Boutons custom (JSON-stringified array de AffiButton) — par device
  customButtonsJson: string;          // Mobile/Tablette (par défaut)
  customButtonsJsonDesktop: string;   // Desktop
  // FAQ items (JSON-stringified array de FaqItem) — model 5 uniquement
  faqItemsJson: string;
  // Image fit mode (M1/M4/M6/M7/M8) : comment l'image remplit son cadre
  // "cover" = remplit le cadre (crop si besoin), "contain" = tout visible, "fill" = étire, "native" = adapte le cadre à l'image
  imgFit: "cover" | "contain" | "fill" | "native";
  // UTM tags appliqués à affiLink au moment de l'export/publish
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  // M3 — Streamer Profile (personal-first)
  streamerPseudo: string;
  streamerHandle: string;
  streamerTagline: string;
  streamerMessage: string;
  streamerSign: string;
  streamerStatFollowers: string;
  streamerStatToday: string;
  streamerStatRating: string;
  streamerStatus: string;
  // JSON-stringified array de SocialLink
  streamerSocialsJson: string;
}

// ─── Streamer socials (M3) ───────────────────────────────────────────────────
export type SocialPlatform = "twitch" | "kick" | "youtube" | "telegram" | "twitter" | "instagram" | "tiktok" | "discord";
export interface SocialLink {
  id: string;
  platform: SocialPlatform;
  label: string;  // ex: "Twitch"
  url: string;
  count: string;  // ex: "28K"
}
export const SOCIAL_META: Record<SocialPlatform, { label: string; brand: string; defaultLabel: string }> = {
  twitch:    { label: "Twitch",    brand: "#9146ff", defaultLabel: "Twitch"    },
  kick:      { label: "Kick",      brand: "#53fc18", defaultLabel: "Kick"      },
  youtube:   { label: "YouTube",   brand: "#ff0000", defaultLabel: "YouTube"   },
  telegram:  { label: "Telegram",  brand: "#2aabee", defaultLabel: "Telegram"  },
  twitter:   { label: "Twitter/X", brand: "#000000", defaultLabel: "Twitter"   },
  instagram: { label: "Instagram", brand: "#d946ef", defaultLabel: "Instagram" },
  tiktok:    { label: "TikTok",    brand: "#ff0050", defaultLabel: "TikTok"    },
  discord:   { label: "Discord",   brand: "#5865F2", defaultLabel: "Discord"   },
};
function makeSocialId(): string {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export function defaultSocialLink(platform: SocialPlatform = "twitch"): SocialLink {
  return { id: makeSocialId(), platform, label: SOCIAL_META[platform].defaultLabel, url: "", count: "" };
}
export function parseSocialLinks(json: string | undefined | null): SocialLink[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    if (!Array.isArray(p)) return [];
    return p.map((s: any) => ({
      id: String(s?.id || makeSocialId()),
      platform: (SOCIAL_META as any)[s?.platform] ? s.platform : "twitch",
      label: String(s?.label || ""),
      url: String(s?.url || ""),
      count: String(s?.count || ""),
    }));
  } catch { return []; }
}
export function stringifySocialLinks(items: SocialLink[]): string {
  return JSON.stringify(items);
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
  gradientDark?: string;
  gradientLight?: string;
  glow?: boolean;
  letterSpacingEm?: number;
  fontFamily?: string;
  fontWeight?: number;          // ex: 400 pour Bebas Neue (ne supporte que 400)
  hoverEffect?: boolean;        // zoom + brightness au survol
  shine?: boolean;              // effet de lumière qui glisse
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

// Liste de polices prédéfinies pour le menu déroulant
export const BUTTON_FONT_PRESETS: { label: string; value: string; weight?: number }[] = [
  { label: "Par défaut (hérite de la page)", value: "" },
  { label: "Bebas Neue (sticky-cta, large)", value: "'Bebas Neue', sans-serif", weight: 400 },
  { label: "Cinzel (titre luxe)", value: "'Cinzel', serif", weight: 700 },
  { label: "DM Sans (clean moderne)", value: "'DM Sans', sans-serif", weight: 700 },
  { label: "Inter (UI moderne)", value: "'Inter', sans-serif", weight: 800 },
  { label: "Montserrat (sans-serif élégant)", value: "'Montserrat', sans-serif", weight: 800 },
  { label: "Poppins (bold arrondi)", value: "'Poppins', sans-serif", weight: 800 },
  { label: "Oswald (bold étroit)", value: "'Oswald', sans-serif", weight: 700 },
  { label: "Anton (impact moderne)", value: "'Anton', sans-serif", weight: 400 },
  { label: "Roboto (neutre)", value: "'Roboto', sans-serif", weight: 700 },
  { label: "Times (serif classique)", value: "'Times New Roman', serif", weight: 700 },
  { label: "Courier (mono)", value: "'Courier New', monospace", weight: 700 },
];

// URL Google Fonts unique pour charger toutes les polices présentes dans l'iframe
const BUTTON_FONT_GOOGLE_IMPORT =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Bebas+Neue",
    "family=Cinzel:wght@600;700",
    "family=DM+Sans:wght@400;500;700",
    "family=Inter:wght@400;600;800",
    "family=Montserrat:wght@400;700;800",
    "family=Poppins:wght@400;700;800",
    "family=Oswald:wght@400;700",
    "family=Anton",
    "family=Roboto:wght@400;700",
  ].join("&") + "&display=swap";

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
    fontSize: 22,
    objectFit: "cover",
    transparent: false,
    gradientDark: a.dark,
    gradientLight: a.light,
    glow: true,
    letterSpacingEm: 0.16,
    fontFamily: "'Bebas Neue', sans-serif",
    fontWeight: 400,              // Bebas Neue ne supporte que 400 (pas de vrai gras)
    hoverEffect: true,
    shine: true,
  };
}

function isValidHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

// ─── FAQ items ────────────────────────────────────────────────────────────────

export interface FaqItem {
  id: string;
  q: string;
  a: string;
  open?: boolean;
}

function makeFaqId(): string {
  return `faq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const MAX_FAQ_ITEMS = 15;
export const MAX_FAQ_QUESTION_LEN = 160;
export const MAX_FAQ_ANSWER_LEN = 400;

// Calqué sur model5.html — 7 questions par défaut (template d'origine)
export const DEFAULT_FAQ_ITEMS: FaqItem[] = [
  { id: makeFaqId(), q: "Le bonus de 20€ est garanti ?", a: "Oui. Dès que ton premier dépôt de 20€ est validé, le bonus est ajouté automatiquement.", open: true },
  { id: makeFaqId(), q: "Le bonus s'applique-t-il à tous les dépôts ?", a: "Non. Il s'applique uniquement à ton tout premier dépôt validé." },
  { id: makeFaqId(), q: "Je peux retirer mes gains ?", a: "Oui. Retrait disponible quand tu veux. Délai habituel sous 24h." },
  { id: makeFaqId(), q: "C'est fiable et sécurisé ?", a: "Oui. Plateforme licenciée, transactions chiffrées SSL et compte protégé." },
  { id: makeFaqId(), q: "Je peux jouer depuis mon téléphone ?", a: "Oui. Le site est entièrement optimisé mobile, tablette et PC. Aucune application à installer." },
  { id: makeFaqId(), q: "Quels modes de paiement sont acceptés ?", a: "CB, virement bancaire et solutions e-wallet selon ta localisation. Toutes les options sont affichées à l'étape de dépôt." },
  { id: makeFaqId(), q: "Y a-t-il des conditions de mise sur le bonus ?", a: "Oui, des conditions de mise s'appliquent. Consulte les CGU du casino pour connaître les exigences exactes avant de jouer." },
];

export function parseFaqItems(json: string | undefined | null): FaqItem[] {
  if (!json) return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
    const cleaned: FaqItem[] = [];
    let openSeen = false;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      // Ne PAS filtrer les items vides ici — sinon un "Ajouter" qui crée un
      // item vierge serait silencieusement viré au prochain parse. On ne
      // filtre qu'au moment de l'injection HTML (dans applyConfig).
      const q = typeof item.q === "string" ? item.q : "";
      const a = typeof item.a === "string" ? item.a : "";
      const id = typeof item.id === "string" && item.id ? item.id : makeFaqId();
      const open = !openSeen && item.open === true;
      if (open) openSeen = true;
      cleaned.push({ id, q: q.slice(0, MAX_FAQ_QUESTION_LEN), a: a.slice(0, MAX_FAQ_ANSWER_LEN), open });
      if (cleaned.length >= MAX_FAQ_ITEMS) break;
    }
    if (cleaned.length === 0) return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
    if (!openSeen) cleaned[0].open = true;
    return cleaned;
  } catch {
    return DEFAULT_FAQ_ITEMS.map(f => ({ ...f }));
  }
}

export function stringifyFaqItems(items: FaqItem[]): string {
  return JSON.stringify(items);
}

export function defaultFaqItem(): FaqItem {
  return { id: makeFaqId(), q: "", a: "" };
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
  // Default vide = pas de badge sur les nouvelles pages. Les anciennes
  // pages ont leur badgeText sauvegardé en DB et restent intactes.
  badgeText: "",
  m4TitleMainGold: "",  // par défaut : titre principal blanc
  m4TitleSpanGold: "1", // par défaut : span en or (comportement existant)
  m4TitleStacked: "",   // par défaut : inline (côte-à-côte si la place)
  heroTitleAfter: "",
  colorTitleAfter: "",
  colorBadge: "",
  colorTitleMain: "",
  colorTitleSpan: "",
  colorSubtitle: "",
  colorBtn: "",
  colorSticky: "",
  colorReviewText: "",
  heroTitleBefore: "Accès VIP : Doublez votre capital",
  heroTitleSpan: "immédiatement.",
  heroSubtitle:
    "Rejoignez un cercle de jeu exclusif et régulé. Votre premier dépôt est doublé automatiquement sur votre solde en toute discrétion et sécurité.",
  btnText: "JOUER",
  stickyText: "🎰 JOUER MAINTENANT",
  casinoName: "Celsius Games",
  casinoLogoUrl: "",
  pageTitle: "Offre VIP | Jouer Maintenant",
  goldenBrandMain: "LeCasiNoze",
  goldenBrandSub: "",
  goldenHideName: "0",
  goldenLandingOnly: "0",
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
  goldenProfileImageUrl: "",
  goldenCtaPosition: "top",
  // Montants
  goldenDepositAmount: "20",
  goldenBonusAmount: "20",
  goldenTotalAmount: "40",
  goldenHeroCtaText: "",
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
  customButtonsJsonDesktop: "",
  faqItemsJson: "",
  imgFit: "cover",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  streamerPseudo: "LeStreamer",
  streamerHandle: "@lestreamer",
  streamerTagline: "casino & entertainment",
  streamerMessage: "Hey, j'ai testé pas mal de casinos cette année et je te recommande celui-ci sans hésiter. Paiements rapides, bonus respecté, support réactif. Mon code est dans le bouton.",
  streamerSign: "— Le Streamer",
  streamerStatFollowers: "28.4K",
  streamerStatToday: "214",
  streamerStatRating: "4.9",
  streamerStatus: "En stream maintenant",
  streamerSocialsJson: JSON.stringify([
    { id: "sc_1", platform: "twitch",   label: "Twitch",   url: "https://twitch.tv/",   count: "28K" },
    { id: "sc_2", platform: "kick",     label: "Kick",     url: "https://kick.com/",    count: "12K" },
    { id: "sc_3", platform: "youtube",  label: "YouTube",  url: "https://youtube.com/", count: "52K" },
    { id: "sc_4", platform: "telegram", label: "Telegram", url: "https://t.me/",        count: "9K"  },
  ]),
};

// ─── DEVICE PRESETS ──────────────────────────────────────────────────────────
// Dimensions CSS réelles (pas physiques) — viewport width/height en logical pixels.
export type DeviceKey =
  | "iphone-15-pro" | "iphone-14" | "iphone-se" | "pixel-8" | "galaxy-s24"
  | "ipad-mini" | "ipad-pro"
  | "desktop-1280" | "desktop-1440" | "desktop-1920" | "desktop-full";

export const DEVICE_PRESETS: Record<DeviceKey, { label: string; group: "phone" | "tablet" | "desktop"; w: number; h: number; icon: string }> = {
  "iphone-15-pro": { label: "iPhone 15 Pro", group: "phone",   w: 393, h: 852,  icon: "📱" },
  "iphone-14":     { label: "iPhone 14",     group: "phone",   w: 390, h: 844,  icon: "📱" },
  "iphone-se":     { label: "iPhone SE",     group: "phone",   w: 375, h: 667,  icon: "📱" },
  "pixel-8":       { label: "Pixel 8",       group: "phone",   w: 412, h: 915,  icon: "📱" },
  "galaxy-s24":    { label: "Galaxy S24",    group: "phone",   w: 360, h: 780,  icon: "📱" },
  "ipad-mini":     { label: "iPad Mini",     group: "tablet",  w: 768, h: 1024, icon: "🖼" },
  "ipad-pro":      { label: "iPad Pro 11″",  group: "tablet",  w: 834, h: 1194, icon: "🖼" },
  "desktop-1280":  { label: "Laptop 1280",   group: "desktop", w: 1280, h: 800, icon: "🖥" },
  "desktop-1440":  { label: "Desktop 1440",  group: "desktop", w: 1440, h: 900, icon: "🖥" },
  "desktop-1920":  { label: "Full HD",       group: "desktop", w: 1920, h: 1080, icon: "🖥" },
  "desktop-full":  { label: "Pleine largeur",group: "desktop", w: 0,    h: 0,   icon: "↔" },
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
  // M5+ supportent le système de variants (theme swap via data-variant)
  if (model >= 5) {
    html = html.replace(/__VARIANT__/g, goldenVariant);
  }
  if (model === 5) {

    // Note: on garde le <meta viewport width=device-width> du template
    // → desktop rend normalement, mobile rend à sa largeur native.
    // Le scaling mobile est géré par CSS `zoom` ci-dessous uniquement sur petits écrans.

    // ─── Fix mobile — zoom uniforme + fix iPhone SE (écran court) ────────────
    const SHORT_SCREEN_FIX = `<style data-affi-short-screen-fix>
      /* Zoom uniforme sur mobile étroit (<390px) pour rendre comme la preview 390 */
      @media (max-width: 389px) {
        html { zoom: calc(100vw / 390); }
      }
      /* Fix iPhone SE (écran court) — neutralise les translations qui font
         chevaucher le coffre sur le sous-titre */
      @media (max-width: 430px) and (max-height: 860px) {
        .hero-card { transform: none !important; }
        .promo-image-container img { --chest-translate: 0 !important; }
        .hero-section {
          padding-top: 4px !important;
          padding-bottom: 16px !important;
        }
        .hero-content { padding-top: 0 !important; }
        .brand-signature { margin-bottom: 6px !important; }
        .cta-cluster { margin-top: -4px !important; }
      }
    </style>`;
    html = html.replace(/<\/head>/, `${SHORT_SCREEN_FIX}\n</head>`);

    // ─── Polish Desktop (≥900px) — rendu pro & clean ─────────────────────────
    // Objectif : hiérarchie visuelle propre, coffre comme product shot,
    // typo respirante, CTA impactant, container bien cadré.
    const DESKTOP_POLISH = `<style data-affi-desktop-polish>
      @media (min-width: 900px) {
        /* 1. Container cadré et centré */
        .hero-content {
          width: min(100%, 1080px) !important;
          padding: clamp(28px, 4vh, 52px) clamp(36px, 4vw, 64px) !important;
          grid-template-columns: 1.05fr 0.95fr !important;
          gap: 0 clamp(36px, 3.5vw, 56px) !important;
        }
        .hero-section {
          min-height: 100svh !important;
          min-height: 100dvh !important;
        }
        /* 2. Brand — respiration */
        .brand-signature { margin-bottom: 22px !important; }
        .brand-logo-text .brand-logo-main {
          font-size: clamp(2.2rem, 3.2vw, 3.4rem) !important;
          letter-spacing: 0.2em !important;
        }
        /* 3. Titre hero — imposant mais respirant */
        .hero-title {
          font-size: clamp(3rem, 4.2vw, 4.2rem) !important;
          line-height: 0.95 !important;
          letter-spacing: 0.035em !important;
        }
        /* 4. Sous-titre — lisibilité premium */
        .hero-subtitle {
          max-width: 26rem !important;
          margin-top: 16px !important;
          font-size: clamp(0.95rem, 1.05vw, 1.05rem) !important;
          line-height: 1.6 !important;
          color: rgba(248, 244, 239, 0.92) !important;
          font-weight: 500 !important;
        }
        /* 5. Live-count — social proof prominent */
        .live-count {
          margin-top: 14px !important;
          font-size: 0.84rem !important;
          color: var(--accent-light) !important;
          font-weight: 600 !important;
          letter-spacing: 0.02em !important;
        }
        /* 6. Coffre — product shot élégant */
        .promo-image-container {
          width: min(100%, 420px) !important;
          margin: 0 auto !important;
        }
        /* 7. Hero-card — centrage vertical propre */
        .hero-card {
          padding: 8px 0 !important;
        }
        /* 8. Info-box — discret pour laisser le coffre dominer */
        .info-box {
          margin-bottom: 14px !important;
          padding: 12px 16px !important;
          background: rgba(0, 0, 0, 0.18) !important;
          backdrop-filter: blur(6px) !important;
        }
        .offer-title {
          font-size: 1.5rem !important;
          margin-bottom: 8px !important;
        }
        /* 9. CTA — bouton qui appelle au clic */
        .cta-cluster {
          width: min(100%, 380px) !important;
          margin: 18px auto 0 !important;
        }
        .btn-jouer {
          width: 100% !important;
          padding: 18px 22px !important;
          font-size: 1.15rem !important;
          letter-spacing: 0.2em !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.28),
            0 0 38px var(--accent-soft),
            0 14px 28px rgba(0, 0, 0, 0.38) !important;
        }
        /* 10. Micro-proof — réassurance visible */
        .micro-proof {
          margin-top: 14px !important;
          font-size: 0.78rem !important;
          color: var(--accent-light) !important;
          font-weight: 600 !important;
          letter-spacing: 0.03em !important;
        }
        .micro-proof-icon {
          color: var(--accent-light) !important;
          margin-right: 4px !important;
        }
      }
    </style>`;
    html = html.replace(/<\/head>/, `${DESKTOP_POLISH}\n</head>`);

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

    // ─── Photo de profil ronde (M5) — au-dessus du brand-signature ───────────
    if (cfg.goldenProfileImageUrl && String(cfg.goldenProfileImageUrl).trim()) {
      const safeAvatarUrl = escAttr(String(cfg.goldenProfileImageUrl).trim());
      const avatarBlock = `<div class="hero-avatar" data-affi-avatar><img src="${safeAvatarUrl}" alt="" loading="eager" decoding="async"></div>`;
      const avatarCss = `<style data-affi-avatar-style>
.hero-avatar{display:flex;justify-content:center;margin:0 auto 18px;width:clamp(96px,22vw,160px);aspect-ratio:1/1;border-radius:50%;overflow:hidden;position:relative;box-shadow:0 0 0 2px rgba(255,255,255,.12),0 0 0 4px var(--accent-soft,rgba(255,215,0,.18)),0 14px 36px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.06);background:rgba(0,0,0,.35)}
.hero-avatar img{width:100%;height:100%;object-fit:cover;display:block}
@media (min-width:900px){.hero-avatar{width:clamp(120px,12vw,176px);margin-bottom:22px}}
</style>`;
      // CSS dans <head>, et insertion du bloc avatar juste avant .brand-signature
      html = html.replace(/<\/head>/, `${avatarCss}\n</head>`);
      html = html.replace(/<div class="brand-signature">/, `${avatarBlock}\n          <div class="brand-signature">`);
    }

    if (cfg.goldenBrandSub) {
      html = html.replace(
        /(<span class="brand-logo-sub">)([^<]*)(<\/span>)/,
        `$1${esc(cfg.goldenBrandSub)}$3`
      );
    }

    // Safety : si une vieille version ou un drag&drop avait injecté un badge
    // "Club VIP certifié" en haut du hero, on le force masqué. M5 ne le rend
    // pas dans son template courant mais le CSS shared définit encore la règle.
    {
      const css = `<style data-affi-m5-no-vip-badge>.badge-premium{display:none !important;}</style>`;
      html = html.replace(/<\/head>/, `${css}\n</head>`);
    }

    // ─── Options d'affichage M5 ─────────────────────────────────────────────
    // "sans nom" : masque toute la .brand-signature (pseudo + les 2 lignes autour)
    // "landing only" : masque tout ce qui vient après le hero (gains / avis / faq / final)
    const hideName = cfg.goldenHideName === "1" || !String(cfg.goldenBrandMain || "").trim();
    const landingOnly = cfg.goldenLandingOnly === "1";
    if (hideName || landingOnly) {
      const css: string[] = [];
      if (hideName) {
        css.push(".brand-signature { display: none !important; }");
      }
      if (landingOnly) {
        // On cache tout ce qui suit le hero-section (gold-panel-*, reviews, faq, final)
        // + on retire le padding-bottom du body pour éviter un trou sous le hero
        css.push(".gold-panel-section { display: none !important; }");
        css.push(".page-footer, footer.page-footer { display: none !important; }");
        css.push(".section:not(.hero-section) { display: none !important; }");
      }
      const block = `<style data-affi-m5-display>${css.join("\n")}</style>`;
      html = html.replace(/<\/head>/, `${block}\n</head>`);
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

    // Texte custom du bouton RÉCLAME — remplace tout le contenu de .btn-jouer
    // Même texte pour btn-jouer (hero) et sticky-cta (bouton fixé en bas mobile).
    if (cfg.goldenHeroCtaText && cfg.goldenHeroCtaText.trim()) {
      const ctaText = esc(cfg.goldenHeroCtaText.trim());
      html = html.replace(
        /(<a[^>]*class="btn-jouer"[^>]*>)[\s\S]*?(<\/a>)/g,
        `$1${ctaText}$2`
      );
      html = html.replace(
        /(<a[^>]*class="sticky-cta"[^>]*>)[\s\S]*?(<\/a>)/g,
        `$1${ctaText}$2`
      );
    }

    // FAQ (Q/R) — remplace le contenu de .faq-list-modern par les items configurés
    const faqItems = parseFaqItems(cfg.faqItemsJson);
    const faqHtml = faqItems.map((it) => {
      const q = esc(it.q.trim());
      const a = esc(it.a.trim());
      if (!q && !a) return "";
      return `            <details class="faq-card-modern"${it.open ? " open" : ""}>
              <summary><span class="faq-question-text">${q}</span></summary>
              <div class="faq-answer-modern">${a}</div>
            </details>`;
    }).filter(Boolean).join("\n\n");
    if (faqHtml) {
      html = html.replace(
        /(<div class="faq-list-modern">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
        `$1\n${faqHtml}\n          $2`
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
    // Applique les UTM tags si définis
    let finalLink = cfg.affiLink;
    const utmParts: string[] = [];
    if (cfg.utmSource)   utmParts.push(`utm_source=${encodeURIComponent(cfg.utmSource)}`);
    if (cfg.utmMedium)   utmParts.push(`utm_medium=${encodeURIComponent(cfg.utmMedium)}`);
    if (cfg.utmCampaign) utmParts.push(`utm_campaign=${encodeURIComponent(cfg.utmCampaign)}`);
    if (utmParts.length > 0) {
      const sep = finalLink.includes("?") ? "&" : "?";
      finalLink = finalLink + sep + utmParts.join("&");
    }
    const safeAffiLink = escAttr(finalLink);
    html = html.replace(
      /href="[^"]*" class="btn-jouer"/g,
      `href="${safeAffiLink}" class="btn-jouer"`
    );
    html = html.replace(
      /href="[^"]*" class="sticky-cta"/g,
      `href="${safeAffiLink}" class="sticky-cta"`
    );
  }

  // ─── M3 : Streamer profile placeholders ─────────────────────────────────
  if (model === 3) {
    // Pseudo + handle + tagline
    if (cfg.streamerPseudo) {
      html = html.replace(/<div class="pseudo[^"]*">[^<]*<\/div>/, `<div class="pseudo reveal">${esc(cfg.streamerPseudo)}</div>`);
    }
    if (cfg.streamerHandle || cfg.streamerTagline) {
      const handle = esc(cfg.streamerHandle || "@streamer");
      const tag = esc(cfg.streamerTagline || "");
      html = html.replace(
        /<div class="handle reveal">[^<]*<b>[^<]*<\/b><\/div>/,
        `<div class="handle reveal">${handle} · <b>${tag}</b></div>`
      );
    }
    // Status tag
    if (cfg.streamerStatus) {
      html = html.replace(/<span class="tag live">[^<]*<\/span>/, `<span class="tag live">${esc(cfg.streamerStatus)}</span>`);
    }
    // Stats row
    if (cfg.streamerStatFollowers) html = html.replace(/(<div class="stat-cell"><div class="stat-val">)[^<]*(<\/div><div class="stat-lbl">Abonnés<\/div>)/, `$1${esc(cfg.streamerStatFollowers)}$2`);
    if (cfg.streamerStatToday)     html = html.replace(/(<div class="stat-cell"><div class="stat-val">)[^<]*(<\/div><div class="stat-lbl">Inscrits aujourd'hui<\/div>)/, `$1${esc(cfg.streamerStatToday)}$2`);
    if (cfg.streamerStatRating)    html = html.replace(/(<div class="stat-cell"><div class="stat-val">)[^<]*(<\/div><div class="stat-lbl">Note Trustpilot<\/div>)/, `$1${esc(cfg.streamerStatRating)}$2`);

    // Message + sign
    if (cfg.streamerMessage) {
      html = html.replace(/<p class="hero-subtitle">[^<]*<\/p>/, `<p class="hero-subtitle">${esc(cfg.streamerMessage)}</p>`);
    }
    if (cfg.streamerSign) {
      html = html.replace(/<div class="note-sign">[^<]*<\/div>/, `<div class="note-sign">${esc(cfg.streamerSign)}</div>`);
    }

    // Socials block — rebuild entirely from JSON config
    const socials = parseSocialLinks(cfg.streamerSocialsJson);
    if (socials.length > 0) {
      const ICONS: Record<SocialPlatform, string> = {
        twitch:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l-2 5v13h5v3h4l3-3h4l5-5V2H4zm18 12l-4 4h-4l-3 3v-3H7V4h15v10z"/><path d="M11 8h2v5h-2zm5 0h2v5h-2z"/></svg>`,
        kick:      `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h5v6h2V3h5v6l4 6-4 6H13v-6H8v6H3V3z"/></svg>`,
        youtube:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23 8s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-1C17 4.5 12 4.5 12 4.5s-5 0-8.1.2c-.4.1-1.3.1-2.1 1C1.2 6.4 1 8 1 8s-.2 1.9-.2 3.8v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.8 2.3c.8.9 1.8.9 2.3 1 1.7.2 7.9.2 7.9.2s5 0 8.1-.2c.4-.1 1.3-.1 2.1-1 .6-.7.8-2.3.8-2.3s.2-1.9.2-3.8v-1.8c0-1.9-.2-3.8-.2-3.8zM9.7 14.9V8.6l6.4 3.2-6.4 3.1z"/></svg>`,
        telegram:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9.8 15.6l-.4 5.4c.6 0 .8-.3 1.2-.6l2.7-2.6 5.7 4.1c1 .6 1.8.3 2-1l3.7-17.4c.3-1.5-.5-2.1-1.6-1.7L2 8.2C.5 8.8.5 9.7 1.7 10l5.6 1.7 13-8.2c.6-.4 1.2-.2.7.3L9.8 15.6z"/></svg>`,
        twitter:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h3l-7.5 8.6L22 22h-6.8l-5.3-6.9L3.8 22H.8l8-9.1L0 2h7l4.8 6.3L18 2zm-1 18h1.7L6.2 4H4.3l12.7 16z"/></svg>`,
        instagram: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.2.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.2.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.2-.1-1.6-.1-4.8s0-3.6.1-4.8c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.2-.1 1.6-.1 4.8-.1zm0 2.2c-3.1 0-3.5 0-4.7.1-1.1 0-1.7.2-2.1.4-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.2.4-.3 1-.4 2.1C2.6 8.5 2.6 8.9 2.6 12s0 3.5.1 4.7c0 1.1.2 1.7.4 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1 0 1.7-.2 2.1-.4.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c0-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.2-1-.3-2.1-.4C15.5 4.4 15.1 4.4 12 4.4zm0 3.4a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4zm0 6.9a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4zm5.3-7.1a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>`,
        tiktok:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 7.5V11a7 7 0 0 1-4-1.3V16a6 6 0 1 1-6-6v3.5a2.5 2.5 0 1 0 2.5 2.5V2h3a4 4 0 0 0 4 4v1.5z"/></svg>`,
        discord:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4.4c-1.5-.7-3.1-1.2-4.8-1.5l-.2.4c1.5.4 2.9 1 4.3 1.9-1.6-1-3.4-1.5-5.3-1.5s-3.7.5-5.3 1.5c1.4-.9 2.9-1.5 4.3-1.9l-.2-.4c-1.7.3-3.3.8-4.8 1.5C2 9.3 1.2 14 1.6 18.6c1.8 1.4 3.9 2.3 6.1 2.6l.6-.9c-1.1-.4-2.1-.9-3-1.6.3.2.5.3.8.5 2 .9 4.2 1.4 6.4 1.4s4.4-.5 6.4-1.4c.3-.1.5-.3.8-.5-.9.6-1.9 1.2-3 1.6l.6.9c2.2-.3 4.3-1.1 6.1-2.6.5-4.9-.5-9.6-3.4-14.2zM9 15.2c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2zm6 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2z"/></svg>`,
      };
      const rebuilt = `<div class="socials">\n` + socials.map((sc) => {
        const url = escAttr(sc.url || "#");
        const label = esc(sc.label || SOCIAL_META[sc.platform].defaultLabel);
        const count = sc.count ? `<span class="social-count">${esc(sc.count)}</span>` : "";
        const ico = ICONS[sc.platform] || "";
        return `  <a href="${url}" class="social ${sc.platform}" target="_blank" rel="noopener noreferrer">\n    <div class="social-ico">${ico}</div>\n    ${label}${count ? " " + count : ""}\n  </a>`;
      }).join("\n") + `\n</div>`;
      html = html.replace(/<div class="socials">[\s\S]*?<\/div>\s*(?=<\/div>)/, rebuilt);
    } else {
      // Pas de socials = on retire la section
      html = html.replace(/<div class="socials">[\s\S]*?<\/div>\s*(?=<\/div>)/, "");
    }
  }

  // Image fit mode (applique object-fit sur .promo-image-container img)
  if (cfg.imgFit && cfg.imgFit !== "cover") {
    const fitCss =
      cfg.imgFit === "native"
        ? `<style data-affi-img-fit>.promo-image-container { aspect-ratio: auto !important; } .promo-image-container img { object-fit: contain !important; width: 100% !important; height: auto !important; aspect-ratio: auto !important; }</style>`
        : `<style data-affi-img-fit>.promo-image-container img { object-fit: ${cfg.imgFit} !important; }</style>`;
    html = html.replace(/<\/head>/, `${fitCss}\n</head>`);
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

  // Badge VIP : si l'user a EXPLICITEMENT vidé le champ → cache le badge.
  // Sinon (texte custom OU défaut) → remplace le texte.
  if (typeof cfg.badgeText === "string" && cfg.badgeText.trim() === "") {
    const css = `<style data-affi-no-badge>.badge-premium{display:none !important;}</style>`;
    html = html.replace(/<\/head>/, `${css}\n</head>`);
  } else if (cfg.badgeText) {
    html = html.replace(
      /(class="badge-premium">[^<]*<\/svg>\s*)([^<]*?)(\s*<\/div>)/,
      (_, before, _old, after) => `${before}${esc(cfg.badgeText)}${after}`
    );
  }

  if (cfg.heroTitleBefore || cfg.heroTitleSpan || cfg.heroTitleAfter) {
    // Optionnelle 3e ligne : <span class="hero-title-after"> placé après le span
    // doré. Si vide, pas inséré → comportement legacy intact.
    const afterPart = cfg.heroTitleAfter && cfg.heroTitleAfter.trim()
      ? `<span class="hero-title-after">${esc(cfg.heroTitleAfter)}</span>`
      : "";
    html = html.replace(
      /<h1 class="hero-title">[\s\S]*?<\/h1>/,
      `<h1 class="hero-title">${esc(cfg.heroTitleBefore)} <span>${esc(cfg.heroTitleSpan)}</span>${afterPart}</h1>`
    );
  }

  // M4 : couleur du H1 — toggles indépendants pour le texte principal et
  // le span "en or". Permet 4 combinaisons : tout blanc, principal doré
  // seul, span doré seul (défaut), tout doré.
  if (model === 4) {
    const rules: string[] = [];
    if (cfg.m4TitleMainGold === "1") {
      // Le titre principal en or — applique la même recette que le span :
      // couleur or + text-shadow glow. !important pour battre le CSS template.
      rules.push(".hero-title{color:var(--brand-gold) !important;text-shadow:0 0 15px var(--brand-gold) !important;}");
    }
    // m4TitleSpanGold === "1" est le défaut. Si "" / "0" → on retire le doré
    // sur le span (retour à inherit / blanc).
    if (cfg.m4TitleSpanGold === "" || cfg.m4TitleSpanGold === "0") {
      rules.push(".hero-title span{color:inherit !important;text-shadow:none !important;}");
    }
    // Empilement : span passe en display:block → forcé sur une nouvelle ligne.
    // margin-top petit pour respirer entre les 2 textes.
    if (cfg.m4TitleStacked === "1") {
      rules.push(".hero-title span{display:block !important;margin-top:.18em !important;}");
    }

    // Couleurs custom individuelles — écrasent les toggles m4TitleMainGold/Span
    // car appliquées APRÈS dans le bloc CSS (poids "spécifique" identique →
    // dernière règle gagne en cas d'égalité). Reset text-shadow aussi sinon
    // le glow doré du toggle reste visible sur une couleur custom.
    if (cfg.colorBadge)      rules.push(`.badge-premium{color:${cfg.colorBadge} !important;}`);
    if (cfg.colorTitleMain)  rules.push(`.hero-title{color:${cfg.colorTitleMain} !important;text-shadow:none !important;}`);
    if (cfg.colorTitleSpan)  rules.push(`.hero-title span{color:${cfg.colorTitleSpan} !important;text-shadow:none !important;}`);
    if (cfg.colorSubtitle)   rules.push(`.hero-subtitle{color:${cfg.colorSubtitle} !important;}`);
    if (cfg.colorBtn)        rules.push(`.btn-jouer{color:${cfg.colorBtn} !important;}`);
    if (cfg.colorSticky)     rules.push(`.sticky-cta{color:${cfg.colorSticky} !important;}`);
    if (cfg.colorReviewText) rules.push(`.review-text{color:${cfg.colorReviewText} !important;}`);

    // 3e ligne H1 (heroTitleAfter) : toujours en block (sous le span), couleur
    // par défaut blanc, customisable via colorTitleAfter.
    if (cfg.heroTitleAfter && cfg.heroTitleAfter.trim()) {
      const c = cfg.colorTitleAfter && /^#[0-9a-fA-F]{6}$/.test(cfg.colorTitleAfter) ? cfg.colorTitleAfter : "#ffffff";
      rules.push(`.hero-title-after{display:block !important;color:${c} !important;text-shadow:none !important;margin-top:.18em !important;}`);
    }

    if (rules.length) {
      const css = `<style data-affi-m4-h1-color>${rules.join("")}</style>`;
      html = html.replace(/<\/head>/, `${css}\n</head>`);
    }
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

  // ── Logo du casino (universel) : remplace nav-mark / brand-mark / hero-mark par l'image
  if (cfg.casinoLogoUrl && String(cfg.casinoLogoUrl).trim()) {
    const safeLogoUrl = escAttr(String(cfg.casinoLogoUrl).trim());
    const logoCss = `<style data-casino-logo>
      .nav-mark, .brand-mark, .hero-mark {
        background-image: url("${safeLogoUrl}") !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-color: transparent !important;
        box-shadow: 0 0 12px rgba(255,255,255,0.12) !important;
      }
      .nav-mark::after, .brand-mark::after, .hero-mark::after { display: none !important; }
    </style>`;
    html = html.replace(/<\/head>/, `${logoCss}\n</head>`);
  }

  // ── Strip universel des meta tags indexables / preview-générant ──────────
  // Les landings affiliate ne doivent JAMAIS générer un preview branded quand
  // un influenceur partage le lien sur Snap/IG/WhatsApp/Discord. On strippe
  // toute meta description / OG / Twitter / canonical / schema avant de servir
  // l'HTML (preview iframe, export HTML, page publiée).
  html = html.replace(
    /<meta\b[^>]*?(?:name|property)\s*=\s*"(?:og:[^"]*|twitter:[^"]*|description)"[^>]*?\/?>/gis,
    ""
  );
  html = html.replace(/<link\b[^>]*?rel\s*=\s*"canonical"[^>]*?\/?>/gis, "");
  html = html.replace(/<script\b[^>]*type\s*=\s*"application\/ld\+json"[\s\S]*?<\/script>/gi, "");
  // Force noindex
  html = html.replace(/<meta\b[^>]*?name\s*=\s*"robots"[^>]*?\/?>/gis, "");
  html = html.replace(/<head>/i, '<head>\n  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">');
  // Si pas de pageTitle / goldenPageTitle custom, vide le <title> par défaut (évite "LeCasiNoze - Dépose 20€…")
  const customTitle = (model === 5 ? cfg.goldenPageTitle : cfg.pageTitle) || "";
  if (!String(customTitle).trim()) {
    html = html.replace(/<title>[^<]*<\/title>/, "<title> </title>");
  }

  // ── Boutons custom ─────────────────────────────────────────────────────────
  const customButtonsMobile = parseAffiButtons(cfg.customButtonsJson);
  const customButtonsDesktop = parseAffiButtons(cfg.customButtonsJsonDesktop);
  if (customButtonsMobile.length > 0 || customButtonsDesktop.length > 0) {
    const btnHtml = renderAffiButtonsHtml(customButtonsMobile, customButtonsDesktop);
    if (html.includes("</body>")) {
      html = html.replace(/<\/body>/, `${btnHtml}\n</body>`);
    } else {
      html = html + btnHtml;
    }
  }

  return html;
}

/** Rendu HTML des boutons custom (export standalone).
 *  Iso-fonctionnel à `injectButtonsIntoIframe` (preview/published) :
 *  - 2 devices (mobile + desktop) avec scoping CSS via @media
 *  - tous les champs avancés (gradient, glow, shine, hover, fontFamily, letterSpacing, fontWeight)
 *  - Google Fonts importée (Bebas Neue & co)
 *  - repositionnement dynamique en fonction de la hauteur réelle du document */
function renderAffiButtonsHtml(mobileBtns: AffiButton[], desktopBtns: AffiButton[] = []): string {
  const sanitize = (b: AffiButton) => {
    const rawX = Number(b.xPct);
    const rawY = Number(b.yPct);
    const bgColor = /^#[0-9a-fA-F]{6}$/.test(String(b.bgColor || "")) ? b.bgColor : "#000000";
    const textColor = /^#[0-9a-fA-F]{6}$/.test(String(b.textColor || "")) ? b.textColor : "#ffffff";
    return {
      id: String(b.id || ""),
      label: String(b.label || ""),
      link: String(b.link || ""),
      imageUrl: String(b.imageUrl || ""),
      bgColor,
      textColor,
      xPct: (!Number.isFinite(rawX) || rawX < 0 || rawX > 95) ? 35 : rawX,
      yPct: (!Number.isFinite(rawY) || rawY < 0 || rawY > 95) ? 5 : rawY,
      widthPx: clamp(Number(b.widthPx), 20, 2000),
      heightPx: clamp(Number(b.heightPx), 20, 2000),
      borderRadius: clamp(Number(b.borderRadius), 0, 200),
      fontSize: clamp(Number(b.fontSize), 8, 200),
      objectFit: String(b.objectFit || "contain"),
      transparent: !!b.transparent,
      gradientDark: typeof b.gradientDark === "string" && /^#[0-9a-fA-F]{6}$/.test(b.gradientDark) ? b.gradientDark : null,
      gradientLight: typeof b.gradientLight === "string" && /^#[0-9a-fA-F]{6}$/.test(b.gradientLight) ? b.gradientLight : null,
      glow: !!b.glow,
      letterSpacingEm: typeof b.letterSpacingEm === "number" && Number.isFinite(b.letterSpacingEm) ? b.letterSpacingEm : null,
      fontFamily: typeof b.fontFamily === "string" && b.fontFamily.trim() ? b.fontFamily.trim() : null,
      fontWeight: typeof b.fontWeight === "number" && b.fontWeight > 0 ? b.fontWeight : null,
      hoverEffect: !!b.hoverEffect,
      shine: !!b.shine,
    };
  };

  const payload = {
    mobile: mobileBtns.map(sanitize),
    desktop: desktopBtns.map(sanitize),
  };

  // Encode pour passage en JSON inline dans le script (échappe </script>)
  const dataJson = JSON.stringify(payload).replace(/<\/script/gi, "<\\/script");
  const fontImport = BUTTON_FONT_GOOGLE_IMPORT;

  return `<style data-affi-buttons-style>
@import url("${fontImport}");
@media (max-width: 899px) { [data-affi-btn-device="desktop"] { display: none !important; } }
@media (min-width: 900px) { [data-affi-btn-device="mobile"]  { display: none !important; } }
@keyframes affi-btn-shine {
  0%   { transform: translateX(-120%) skewX(-20deg); }
  60%  { transform: translateX(260%)  skewX(-20deg); }
  100% { transform: translateX(260%)  skewX(-20deg); }
}
[data-affi-btn-hover="1"] { transition: transform 160ms ease, filter 160ms ease !important; }
[data-affi-btn-hover="1"]:hover { transform: translateY(-2px) scale(1.03) !important; filter: brightness(1.08) !important; }
.affi-btn-shine-overlay {
  position: absolute !important; top: 0 !important; left: 0 !important;
  width: 45% !important; height: 100% !important;
  background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,.55) 50%, transparent 100%) !important;
  animation: affi-btn-shine 3.2s ease-in-out infinite !important;
  pointer-events: none !important; z-index: 1 !important; mix-blend-mode: screen !important;
}
</style>
<script data-affi-custom-buttons>
(function () {
  var DATA = ${dataJson};
  var ALL = [];
  (DATA.mobile  || []).forEach(function (b) { ALL.push({ btn: b, device: 'mobile'  }); });
  (DATA.desktop || []).forEach(function (b) { ALL.push({ btn: b, device: 'desktop' }); });
  if (!ALL.length) return;

  function hexToRgba(hex, alpha) {
    var h = String(hex || '').replace('#', '');
    if (h.length !== 6) return 'rgba(0,0,0,' + alpha + ')';
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var bl = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')';
  }

  function buildButton(entry) {
    var b = entry.btn;
    var device = entry.device;
    var hasImage = !!b.imageUrl;
    var isTransparent = !!b.transparent;
    var hasGradient = !!b.gradientDark && !!b.gradientLight && !isTransparent && !hasImage;
    var hasGlow = !!b.glow;

    var el = document.createElement(b.link ? 'a' : 'div');
    if (b.link) { el.href = b.link; el.target = '_blank'; el.rel = 'noopener noreferrer'; }

    var bgSize = b.objectFit === 'cover' ? 'cover' : b.objectFit === 'fill' ? '100% 100%' : 'contain';
    var bgParts = [];
    if (hasImage) bgParts.push('url("' + String(b.imageUrl).replace(/"/g, '%22') + '") center center / ' + bgSize + ' no-repeat');
    if (hasGradient) {
      bgParts.push('linear-gradient(180deg, ' + b.gradientDark + ' 0%, ' + b.bgColor + ' 38%, ' + b.gradientLight + ' 52%, ' + b.bgColor + ' 72%, ' + b.gradientDark + ' 100%)');
    } else if (!isTransparent) {
      bgParts.push(b.bgColor);
    }
    var bgValue = bgParts.length ? bgParts.join(', ') : 'transparent';

    var boxShadow;
    if (hasGlow) {
      var glowSoft = hexToRgba(b.bgColor, 0.45);
      boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.24), 0 0 30px ' + glowSoft + ', 0 14px 24px rgba(0,0,0,0.36)';
    } else if (hasImage || isTransparent) {
      boxShadow = 'none';
    } else {
      boxShadow = '0 4px 14px rgba(0,0,0,.35)';
    }

    var border = hasGlow
      ? '1px solid ' + (b.gradientDark || b.bgColor)
      : (hasImage || isTransparent) ? 'none' : '1px solid rgba(255,255,255,.08)';

    var letterSpacing = (b.letterSpacingEm != null) ? (b.letterSpacingEm + 'em') : 'normal';
    var fontFamily = b.fontFamily || 'inherit';
    var fontWeight = b.fontWeight || 800;

    if (b.hoverEffect) el.setAttribute('data-affi-btn-hover', '1');
    el.setAttribute('data-affi-btn-device', device);
    el.setAttribute('data-affi-btn-ypct', String(b.yPct));

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
      'font-weight:' + fontWeight + ' !important',
      'font-family:' + fontFamily + ' !important',
      'letter-spacing:' + letterSpacing + ' !important',
      'display:flex !important',
      'align-items:center !important',
      'justify-content:center !important',
      'text-align:center !important',
      'text-decoration:none !important',
      'overflow:hidden !important',
      'box-shadow:' + boxShadow + ' !important',
      'border:' + border + ' !important',
      'cursor:pointer !important',
      'box-sizing:border-box !important',
      'z-index:2147483647 !important',
      'margin:0 !important',
      'padding:0 !important',
      'opacity:1 !important',
      'visibility:visible !important',
    ].join(';');

    if (hasImage) {
      var img = document.createElement('img');
      img.src = b.imageUrl;
      img.alt = '';
      img.style.cssText = 'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;object-fit:' + b.objectFit + ' !important;display:block !important;pointer-events:none !important;';
      el.appendChild(img);
    }

    if (b.shine) {
      var shine = document.createElement('div');
      shine.className = 'affi-btn-shine-overlay';
      el.appendChild(shine);
    }

    if (b.label) {
      var span = document.createElement('span');
      span.textContent = b.label;
      span.style.cssText = 'position:relative !important;z-index:2 !important;padding:0 8px !important;text-shadow:' + (hasImage ? '0 2px 6px rgba(0,0,0,.65)' : 'none') + ' !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;max-width:100% !important;';
      el.appendChild(span);
    }

    return el;
  }

  function render() {
    var prev = document.querySelector('[data-affi-buttons-wrap]');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    var wrap = document.createElement('div');
    wrap.setAttribute('data-affi-buttons-wrap', '');
    wrap.style.cssText = 'display:contents !important;';
    ALL.forEach(function (entry) { wrap.appendChild(buildButton(entry)); });
    document.body.appendChild(wrap);

    // Repositionnement basé sur la hauteur réelle du document
    function getDocHeight() {
      return Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.clientHeight
      );
    }
    function updateAllPositions() {
      var h = getDocHeight();
      var nodes = document.querySelectorAll('[data-affi-btn-ypct]');
      for (var i = 0; i < nodes.length; i++) {
        var y = parseFloat(nodes[i].getAttribute('data-affi-btn-ypct') || '0');
        nodes[i].style.setProperty('top', Math.max(0, (h * y) / 100) + 'px', 'important');
      }
    }
    updateAllPositions();
    var imgs = document.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
      if (!imgs[j].complete) {
        imgs[j].addEventListener('load', updateAllPositions, { once: true });
        imgs[j].addEventListener('error', updateAllPositions, { once: true });
      }
    }
    window.addEventListener('resize', updateAllPositions);
    try {
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(updateAllPositions);
        ro.observe(document.body);
      }
    } catch (e) {}
    setTimeout(updateAllPositions, 250);
    setTimeout(updateAllPositions, 1000);
    setTimeout(updateAllPositions, 2500);
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
        <defs>
          <linearGradient id="m2g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFD700" />
            <stop offset="1" stopColor="#FF3366" />
          </linearGradient>
        </defs>
        <rect width="120" height="70" rx="8" fill="#0a0a14" />
        {/* hero compact */}
        <rect x="38" y="6" width="44" height="4" rx="2" fill="#FFD70088" />
        <rect x="28" y="13" width="64" height="3" rx="1.5" fill="#ffffff55" />
        {/* Games grid 3x2 (le coeur de M2) */}
        <rect x="6"  y="22" width="32" height="18" rx="2" fill="#22223a" stroke="#444466" strokeWidth="0.5" />
        <rect x="6"  y="22" width="32" height="12" rx="2" fill="url(#m2g)" opacity="0.55" />
        <rect x="42" y="22" width="32" height="18" rx="2" fill="#22223a" stroke="#444466" strokeWidth="0.5" />
        <rect x="42" y="22" width="32" height="12" rx="2" fill="#E0115F77" opacity="0.55" />
        <rect x="78" y="22" width="32" height="18" rx="2" fill="#22223a" stroke="#444466" strokeWidth="0.5" />
        <rect x="78" y="22" width="32" height="12" rx="2" fill="#FFD70077" opacity="0.55" />
        <rect x="6"  y="44" width="32" height="18" rx="2" fill="#22223a" stroke="#444466" strokeWidth="0.5" />
        <rect x="6"  y="44" width="32" height="12" rx="2" fill="#E0115F77" opacity="0.55" />
        <rect x="42" y="44" width="32" height="18" rx="2" fill="#22223a" stroke="#444466" strokeWidth="0.5" />
        <rect x="42" y="44" width="32" height="12" rx="2" fill="#FFD70077" opacity="0.55" />
        <rect x="78" y="44" width="32" height="18" rx="2" fill="#22223a" stroke="#444466" strokeWidth="0.5" />
        <rect x="78" y="44" width="32" height="12" rx="2" fill="url(#m2g)" opacity="0.55" />
        {/* play badges */}
        <circle cx="22" cy="58" r="1.2" fill="#FFD700" />
        <circle cx="58" cy="58" r="1.2" fill="#FFD700" />
        <circle cx="94" cy="58" r="1.2" fill="#FFD700" />
      </svg>
    ),
    3: (
      <svg viewBox="0 0 120 70" fill="none">
        <defs>
          <linearGradient id="m3ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF3B7A" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <rect width="120" height="70" rx="8" fill="#0d0d16" />
        {/* Halo */}
        <ellipse cx="60" cy="16" rx="40" ry="14" fill="#FF3B7A" opacity="0.15" />
        {/* Avatar ring (centré, dominant) */}
        <circle cx="60" cy="18" r="11" fill="url(#m3ring)" />
        <circle cx="60" cy="18" r="8.5" fill="#15151f" stroke="#0d0d16" strokeWidth="1.2" />
        <circle cx="60" cy="17" r="3" fill="#9a9ab3" />
        <path d="M54 22 c1.5 -2 4 -3 6 -3 s4.5 1 6 3" stroke="#9a9ab3" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* LIVE dot */}
        <circle cx="60" cy="31" r="1.6" fill="#FF3B7A" />
        {/* Pseudo line */}
        <rect x="44" y="34" width="32" height="3.5" rx="1.5" fill="#ffffff" />
        {/* Socials row (4 chips) */}
        <rect x="18" y="42" width="18" height="6" rx="1.5" fill="#22223a" stroke="#353555" strokeWidth="0.3" />
        <rect x="40" y="42" width="18" height="6" rx="1.5" fill="#22223a" stroke="#353555" strokeWidth="0.3" />
        <rect x="62" y="42" width="18" height="6" rx="1.5" fill="#22223a" stroke="#353555" strokeWidth="0.3" />
        <rect x="84" y="42" width="18" height="6" rx="1.5" fill="#22223a" stroke="#353555" strokeWidth="0.3" />
        {/* Casino recommendation card */}
        <rect x="10" y="52" width="100" height="14" rx="3" fill="#22223a" stroke="#FF3B7A" strokeWidth="0.7" />
        <rect x="16" y="55" width="40" height="3" rx="1.5" fill="#FF3B7A" />
        <rect x="72" y="55" width="32" height="8" rx="2" fill="#FF3B7A" />
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
    6: (
      <svg viewBox="0 0 120 70" fill="none">
        <defs>
          <linearGradient id="m6g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFD700" />
            <stop offset="0.5" stopColor="#E0115F" />
            <stop offset="1" stopColor="#8a2be2" />
          </linearGradient>
        </defs>
        <rect width="120" height="70" rx="8" fill="#080212" />
        <circle cx="20" cy="10" r="22" fill="#FFD700" opacity="0.12" />
        <circle cx="110" cy="26" r="20" fill="#E0115F" opacity="0.15" />
        <rect x="6" y="5" width="108" height="8" rx="4" fill="#150821" stroke="#331A47" />
        <rect x="42" y="17" width="36" height="5" rx="2.5" fill="url(#m6g)" />
        <rect x="34" y="25" width="52" height="4" rx="2" fill="#fff" />
        <rect x="22" y="34" width="76" height="6" rx="3" fill="#150821" stroke="#FFD70055" />
        <rect x="22" y="42" width="76" height="6" rx="3" fill="#150821" stroke="#FFD70055" />
        <rect x="22" y="50" width="76" height="7" rx="3.5" fill="#FFD700" />
        <rect x="4" y="60" width="112" height="8" rx="4" fill="url(#m6g)" opacity="0.85" />
      </svg>
    ),
    7: (
      /* M7 Immersif : fullbleed mesh + overlay CTA */
      <svg viewBox="0 0 120 70" fill="none">
        <defs>
          <radialGradient id="m7r1" cx="0.2" cy="0.3" r="0.6">
            <stop offset="0" stopColor="#FFD700" stopOpacity="0.7" />
            <stop offset="1" stopColor="#FFD700" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="m7r2" cx="0.8" cy="0.7" r="0.6">
            <stop offset="0" stopColor="#E0115F" stopOpacity="0.7" />
            <stop offset="1" stopColor="#E0115F" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="120" height="70" rx="8" fill="#050510" />
        <rect width="120" height="70" fill="url(#m7r1)" />
        <rect width="120" height="70" fill="url(#m7r2)" />
        {/* Glass nav */}
        <rect x="8" y="6" width="104" height="8" rx="4" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" />
        <circle cx="15" cy="10" r="2.5" fill="#FFD700" />
        {/* Hero text */}
        <rect x="32" y="24" width="56" height="6" rx="1.5" fill="#FFD700" opacity="0.95" />
        <rect x="40" y="34" width="40" height="3" rx="1" fill="#fff" opacity="0.8" />
        {/* CTA */}
        <rect x="28" y="44" width="64" height="9" rx="3" fill="#FFD700" />
        <rect x="34" y="47" width="52" height="3" rx="1" fill="#050510" opacity="0.7" />
        {/* Scroll hint */}
        <circle cx="60" cy="63" r="0.8" fill="#fff" opacity="0.4" />
      </svg>
    ),
    9: (
      /* M9 Urgency countdown : image + timer + progress */
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" rx="8" fill="#0a0a14" />
        {/* Image above-fold */}
        <rect x="22" y="5" width="76" height="20" rx="3" fill="#FF3366" opacity="0.3" stroke="#FF3366" strokeWidth="0.8" />
        <rect x="24" y="7" width="10" height="3.5" rx="1" fill="#FF3366" />
        {/* Countdown 4 cells */}
        <rect x="8"  y="30" width="24" height="16" rx="2" fill="#14141e" stroke="#FF3366" strokeWidth="0.4" />
        <rect x="34" y="30" width="24" height="16" rx="2" fill="#14141e" stroke="#FF3366" strokeWidth="0.4" />
        <rect x="60" y="30" width="24" height="16" rx="2" fill="#14141e" stroke="#FF3366" strokeWidth="0.4" />
        <rect x="86" y="30" width="24" height="16" rx="2" fill="#14141e" stroke="#FF3366" strokeWidth="0.4" />
        <rect x="12" y="35" width="14" height="7" rx="1" fill="#FF3366" />
        <rect x="38" y="35" width="14" height="7" rx="1" fill="#FF3366" />
        <rect x="64" y="35" width="14" height="7" rx="1" fill="#FF3366" />
        <rect x="90" y="35" width="14" height="7" rx="1" fill="#FF3366" />
        {/* Progress bar */}
        <rect x="10" y="51" width="100" height="3" rx="1.5" fill="#14141e" />
        <rect x="10" y="51" width="72" height="3" rx="1.5" fill="url(#m9g)" />
        <defs>
          <linearGradient id="m9g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#c11546" />
            <stop offset="1" stopColor="#FF3366" />
          </linearGradient>
        </defs>
        {/* CTA */}
        <rect x="22" y="59" width="76" height="7" rx="3" fill="#FF3366" />
      </svg>
    ),
    10: (
      /* M10 Proof wall : image + grid de cards témoignages */
      <svg viewBox="0 0 120 70" fill="none">
        <rect width="120" height="70" rx="8" fill="#0a0a14" />
        {/* Image avec stars */}
        <rect x="4" y="5" width="56" height="22" rx="2" fill="#14141e" stroke="#FFD700" strokeWidth="0.5" />
        <rect x="6" y="22" width="20" height="3" rx="1" fill="#FFD700" opacity="0.9" />
        {/* Rating block right */}
        <rect x="64" y="5" width="52" height="10" rx="2" fill="#14141e" stroke="#FFD70066" strokeWidth="0.4" />
        <rect x="66" y="8" width="20" height="4" rx="1" fill="#FFD700" />
        <rect x="88" y="8" width="26" height="4" rx="1" fill="#FFD70066" />
        {/* CTA */}
        <rect x="64" y="18" width="52" height="8" rx="2" fill="#FFD700" />
        {/* PROOF WALL 3 cols x 2 rows */}
        <rect x="4"  y="31" width="36" height="16" rx="2" fill="#14141e" stroke="#1DA1F2" strokeWidth="0.4" />
        <circle cx="10" cy="37" r="2" fill="#60A5FA" />
        <rect x="14" y="34" width="16" height="2" rx="0.5" fill="#fff" opacity="0.7" />
        <rect x="14" y="38" width="22" height="1.5" rx="0.5" fill="#fff" opacity="0.4" />
        <rect x="14" y="41" width="18" height="1.5" rx="0.5" fill="#fff" opacity="0.4" />
        <rect x="42" y="31" width="36" height="16" rx="2" fill="#14141e" stroke="#5865F2" strokeWidth="0.4" />
        <circle cx="48" cy="37" r="2" fill="#F472B6" />
        <rect x="52" y="34" width="16" height="2" rx="0.5" fill="#fff" opacity="0.7" />
        <rect x="52" y="38" width="20" height="1.5" rx="0.5" fill="#fff" opacity="0.4" />
        <rect x="52" y="41" width="22" height="1.5" rx="0.5" fill="#fff" opacity="0.4" />
        <rect x="80" y="31" width="36" height="16" rx="2" fill="#14141e" stroke="#FFD70066" strokeWidth="0.4" />
        <circle cx="86" cy="37" r="2" fill="#FFE552" />
        <rect x="90" y="34" width="16" height="2" rx="0.5" fill="#fff" opacity="0.7" />
        <rect x="90" y="38" width="20" height="1.5" rx="0.5" fill="#FFD700" opacity="0.6" />
        <rect x="4"  y="51" width="36" height="16" rx="2" fill="#14141e" stroke="#FFD70066" strokeWidth="0.4" />
        <circle cx="10" cy="57" r="2" fill="#34D399" />
        <rect x="14" y="54" width="16" height="2" rx="0.5" fill="#fff" opacity="0.7" />
        <rect x="14" y="58" width="22" height="1.5" rx="0.5" fill="#fff" opacity="0.4" />
        <rect x="42" y="51" width="36" height="16" rx="2" fill="#14141e" stroke="#1DA1F2" strokeWidth="0.4" />
        <circle cx="48" cy="57" r="2" fill="#FFE552" />
        <rect x="52" y="54" width="16" height="2" rx="0.5" fill="#fff" opacity="0.7" />
        <rect x="52" y="58" width="22" height="1.5" rx="0.5" fill="#fff" opacity="0.4" />
        <rect x="80" y="51" width="36" height="16" rx="2" fill="#14141e" stroke="#5865F2" strokeWidth="0.4" />
        <circle cx="86" cy="57" r="2" fill="#FF3366" />
        <rect x="90" y="54" width="16" height="2" rx="0.5" fill="#fff" opacity="0.7" />
        <rect x="90" y="58" width="22" height="1.5" rx="0.5" fill="#fff" opacity="0.4" />
      </svg>
    ),
    8: (
      /* M8 Ladder : 3 tiers côte à côte */
      <svg viewBox="0 0 120 70" fill="none">
        <defs>
          <linearGradient id="m8acc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFD700" />
            <stop offset="1" stopColor="#E0115F" />
          </linearGradient>
        </defs>
        <rect width="120" height="70" rx="8" fill="#08080f" />
        {/* Hero compact */}
        <rect x="40" y="6" width="40" height="4" rx="1.5" fill="#fff" opacity="0.9" />
        <rect x="30" y="13" width="60" height="2.5" rx="1" fill="#fff" opacity="0.4" />
        {/* 3 tiers */}
        {/* Tier 1 (starter) */}
        <rect x="6"  y="22" width="32" height="42" rx="3" fill="#101020" stroke="#1f1f33" />
        <rect x="12" y="27" width="12" height="3" rx="1" fill="#9a9ab3" />
        <rect x="12" y="36" width="20" height="6" rx="1.5" fill="#FFD700" />
        <rect x="10" y="55" width="24" height="5" rx="1.5" fill="#101020" stroke="#FFD700" strokeWidth="0.5" />
        {/* Tier 2 (featured) — highlighted */}
        <rect x="42" y="20" width="36" height="46" rx="3" fill="#101020" stroke="#FFD700" strokeWidth="1" />
        <rect x="55" y="16" width="18" height="3" rx="1" fill="url(#m8acc)" />
        <rect x="50" y="26" width="14" height="3" rx="1" fill="#FFD700" />
        <rect x="50" y="35" width="22" height="7" rx="1.5" fill="url(#m8acc)" />
        <rect x="46" y="56" width="28" height="6" rx="1.5" fill="url(#m8acc)" />
        {/* Tier 3 (top) */}
        <rect x="82" y="22" width="32" height="42" rx="3" fill="#101020" stroke="#E0115F" strokeWidth="0.5" />
        <rect x="88" y="27" width="14" height="3" rx="1" fill="#9a9ab3" />
        <rect x="88" y="36" width="22" height="6" rx="1.5" fill="#E0115F" />
        <rect x="86" y="55" width="24" height="5" rx="1.5" fill="url(#m8acc)" />
      </svg>
    ),
  };
  return <>{thumbs[n]}</>;
}

/** Pastille couleur compacte 26×26 pour s'aligner à côté d'un TextField.
 *  Si value est vide, affiche un placeholder (case avec ✕). Au clic, ouvre
 *  le color picker natif. Petit ✕ apparaît en hover quand une couleur est
 *  définie pour la reset à vide ("hérite la couleur par défaut du template"). */
function InlineColorChip({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  const has = !!value && /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div style={{ position: "relative", display: "inline-flex" }} title={title || (has ? `Couleur: ${value}` : "Cliquer pour ajouter une couleur")}>
      <input
        type="color"
        value={has ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 26, height: 26, padding: 0, border: "1px solid #2a2a4a",
          borderRadius: 5, background: has ? value : "transparent", cursor: "pointer",
          opacity: has ? 1 : 0.55,
        }}
      />
      {has ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onChange(""); }}
          title="Retirer (revenir au défaut)"
          style={{
            position: "absolute", top: -6, right: -6, width: 14, height: 14,
            borderRadius: "50%", background: "#1a1a30", border: "1px solid #f87171",
            color: "#f87171", fontSize: 9, lineHeight: "12px", cursor: "pointer", padding: 0,
          }}
        >✕</button>
      ) : null}
    </div>
  );
}

/** TextField + InlineColorChip alignés sur la même ligne. La couleur est
 *  optionnelle ; si vide, le rendu utilise la couleur par défaut du template. */
function TextFieldWithColor({
  label, value, onChange, color, onColorChange, placeholder, multiline,
}: {
  label: string; value: string; onChange: (v: string) => void;
  color: string; onColorChange: (v: string) => void;
  placeholder?: string; multiline?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextField label={label} value={value} onChange={onChange} placeholder={placeholder} multiline={multiline} />
      </div>
      <div style={{ paddingBottom: 6 }}>
        <InlineColorChip value={color} onChange={onColorChange} title={`Couleur "${label}"`} />
      </div>
    </div>
  );
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
  // Format URL : <brand>-M<N> (ex: celsius-games-M4) au lieu de l'ancien
  // <brand>-model<N>. Plus court, plus lisible. M5 garde son format Golden
  // Chance dédié avec la variante de couleur.
  return model === 5
    ? `${brandPart}-golden-chest-${variant}`
    : `${brandPart}-M${model}`;
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

// ─── PROFILE IMAGE FIELD (URL + upload + preview rond) ──────────────────────
function ProfileImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const token = (typeof window !== "undefined" ? localStorage.getItem("lunalive_token_v1") : "") || "";

  async function handleFile(file: File) {
    setUploading(true);
    setErr(null);
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
      if (!res.ok || !json?.url) setErr(json?.error || "Erreur upload");
      else onChange(String(json.url));
    } catch {
      setErr("Erreur réseau");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#aaa" }}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: "50%",
            border: "1px solid #2a2a4a", overflow: "hidden",
            background: value ? "#000" : "rgba(255,215,0,.06)",
            display: "grid", placeItems: "center", flexShrink: 0,
            boxShadow: value ? "0 0 0 2px rgba(255,215,0,.18)" : "none",
          }}
        >
          {value ? (
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: 20, opacity: 0.5 }}>👤</span>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://.../avatar.jpg"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 10px", fontSize: "0.82rem",
              background: "#0d0d1a", color: "#eee",
              border: "1px solid #2a2a4a", borderRadius: 6, outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                flex: 1, padding: "5px 10px", fontSize: "0.78rem", fontWeight: 700,
                border: "1px dashed rgba(255,215,0,.35)", borderRadius: 6,
                background: "rgba(255,215,0,.06)", color: "#FFD700",
                cursor: uploading ? "wait" : "pointer",
              }}
            >
              {uploading ? "Upload…" : "📁 Upload image"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                style={{
                  padding: "5px 10px", fontSize: "0.78rem", fontWeight: 700,
                  border: "1px solid rgba(239,68,68,.3)", borderRadius: 6,
                  background: "rgba(239,68,68,.08)", color: "#f87171",
                  cursor: "pointer",
                }}
              >✕ Retirer</button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>
          {err && <div style={{ fontSize: 10, color: "#f87171" }}>✕ {err}</div>}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#888", lineHeight: 1.4 }}>
        Cercle au-dessus du pseudo. L'image est recadrée en cover (s'adapte au cercle quel que soit son ratio).
      </div>
    </div>
  );
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

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!btn.shine}
                  onChange={(e) => onChange({ shine: e.target.checked })}
                />
                ✨ Effet de lumière (shine qui glisse)
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!btn.hoverEffect}
                  onChange={(e) => onChange({ hoverEffect: e.target.checked })}
                />
                🔍 Zoom au survol
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={s.field}>
                  <label style={s.label}>Letter-spacing (em)</label>
                  <input
                    type="number" min={0} max={1} step={0.02}
                    value={btn.letterSpacingEm ?? 0}
                    onChange={(e) => onChange({ letterSpacingEm: Number(e.target.value) || 0 })}
                    style={s.input}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Graisse (400 / 800…)</label>
                  <input
                    type="number" min={100} max={900} step={100}
                    value={btn.fontWeight ?? 800}
                    onChange={(e) => onChange({ fontWeight: Number(e.target.value) || 400 })}
                    style={s.input}
                  />
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>Police</label>
                <select
                  style={s.input}
                  value={
                    BUTTON_FONT_PRESETS.find((p) => p.value === (btn.fontFamily || ""))?.value
                      ?? "__custom__"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__custom__") return; // ne touche pas, l'input custom prend le relais
                    const preset = BUTTON_FONT_PRESETS.find((p) => p.value === v);
                    onChange({
                      fontFamily: v,
                      // Met à jour fontWeight si le preset en a un (sinon laisse inchangé)
                      ...(preset?.weight ? { fontWeight: preset.weight } : {}),
                    });
                  }}
                >
                  {BUTTON_FONT_PRESETS.map((p) => (
                    <option key={p.value || "inherit"} value={p.value}>{p.label}</option>
                  ))}
                  <option value="__custom__">── Personnalisé (tape ci-dessous) ──</option>
                </select>
              </div>
              <TextField
                label="Police custom (CSS font-family)"
                value={btn.fontFamily || ""}
                onChange={(v) => onChange({ fontFamily: v })}
                placeholder="'Bebas Neue', sans-serif"
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

// ─── FAQ editor ───────────────────────────────────────────────────────────────

interface SocialsEditorProps {
  items: SocialLink[];
  onChange: (next: SocialLink[]) => void;
}
function SocialsEditor({ items, onChange }: SocialsEditorProps) {
  function update(i: number, patch: Partial<SocialLink>) {
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add(platform: SocialPlatform = "twitch") {
    onChange([...items, defaultSocialLink(platform)]);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <div>
      {items.length === 0 && (
        <div style={{ padding: "12px 14px", background: T.bg2, border: `1px dashed ${T.bd}`, borderRadius: 8, fontSize: 12, color: T.txtMute, textAlign: "center", marginBottom: 10 }}>
          Aucun réseau. Ajoute-en un ci-dessous.
        </div>
      )}
      {items.map((sc, i) => {
        const meta = SOCIAL_META[sc.platform];
        return (
          <div key={sc.id} style={{
            marginBottom: 8, padding: 10,
            background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                background: meta.brand, border: `1px solid ${T.bd2}`,
              }} />
              <select
                value={sc.platform}
                onChange={(e) => update(i, { platform: e.target.value as SocialPlatform, label: sc.label || SOCIAL_META[e.target.value as SocialPlatform].defaultLabel })}
                style={{ ...s.input, flex: 1, padding: "5px 8px", fontSize: 12 }}
              >
                {(Object.keys(SOCIAL_META) as SocialPlatform[]).map((p) => (
                  <option key={p} value={p}>{SOCIAL_META[p].label}</option>
                ))}
              </select>
              <button
                onClick={() => move(i, -1)} disabled={i === 0}
                style={{ ...s.smallIconBtn, opacity: i === 0 ? 0.35 : 1 }} title="Monter"
              >↑</button>
              <button
                onClick={() => move(i, 1)} disabled={i === items.length - 1}
                style={{ ...s.smallIconBtn, opacity: i === items.length - 1 ? 0.35 : 1 }} title="Descendre"
              >↓</button>
              <button
                onClick={() => remove(i)}
                style={{ ...s.smallIconBtn, color: "#f87171" }} title="Supprimer"
              >✕</button>
            </div>
            <input
              type="text"
              value={sc.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label affiché (ex: Twitch)"
              style={{ ...s.input, marginBottom: 6, fontSize: 12 }}
            />
            <input
              type="url"
              value={sc.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://twitch.tv/moncompte"
              style={{ ...s.input, marginBottom: 6, fontSize: 12 }}
            />
            <input
              type="text"
              value={sc.count}
              onChange={(e) => update(i, { count: e.target.value })}
              placeholder="Compteur affiché (ex: 28K, 1.2M, laisser vide pour masquer)"
              style={{ ...s.input, fontSize: 12 }}
            />
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button onClick={() => add("twitch")} style={{ ...s.addBtn }}>+ Ajouter un réseau</button>
      </div>
    </div>
  );
}

interface FaqEditorProps {
  items: FaqItem[];
  onChange: (next: FaqItem[]) => void;
}
function FaqEditor({ items, onChange }: FaqEditorProps) {
  function update(i: number, patch: Partial<FaqItem>) {
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  function remove(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    // Si on supprime le "open", rouvre le premier
    if (next.length > 0 && !next.some(n => n.open)) next[0] = { ...next[0], open: true };
    onChange(next);
  }
  function add() {
    if (items.length >= MAX_FAQ_ITEMS) return;
    onChange([...items, defaultFaqItem()]);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function setOpen(i: number) {
    // Un seul ouvert à la fois (comportement du template)
    onChange(items.map((it, idx) => ({ ...it, open: idx === i })));
  }
  function resetDefaults() {
    if (!confirm(`Remettre les ${DEFAULT_FAQ_ITEMS.length} questions par défaut ? Tes modifications actuelles seront perdues.`)) return;
    onChange(DEFAULT_FAQ_ITEMS.map(it => ({ ...it, id: makeFaqId() })));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
        Questions / réponses affichées dans la section "TES QUESTIONS" en bas de page.
        Max {MAX_FAQ_ITEMS} items. L'item marqué <b>Ouvert</b> s'affiche déplié par défaut.
      </div>

      {items.length === 0 && (
        <div style={{ padding: "10px 8px", textAlign: "center", color: "#888", fontSize: 11, background: "rgba(0,0,0,0.18)", borderRadius: 8, border: "1px dashed #2a2a4a" }}>
          Aucune question
        </div>
      )}

      {items.map((it, i) => {
        const qCount = it.q.length;
        const aCount = it.a.length;
        const qOver = qCount > MAX_FAQ_QUESTION_LEN;
        const aOver = aCount > MAX_FAQ_ANSWER_LEN;
        return (
          <div key={it.id} style={{ border: "1px solid #2a2a4a", borderRadius: 8, padding: "10px 10px 8px", background: "rgba(0,0,0,0.22)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#aaa", fontWeight: 700 }}>#{i + 1}</span>
              <label style={{ fontSize: 10, color: it.open ? "#FFD700" : "#888", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                <input type="radio" checked={!!it.open} onChange={() => setOpen(i)} style={{ accentColor: "#FFD700" }} />
                Ouvert par défaut
              </label>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Monter"
                style={{ ...iconBtnStyle, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? "not-allowed" : "pointer" }}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Descendre"
                style={{ ...iconBtnStyle, opacity: i === items.length - 1 ? 0.3 : 1, cursor: i === items.length - 1 ? "not-allowed" : "pointer" }}>↓</button>
              <button type="button" onClick={() => remove(i)} title="Supprimer"
                style={{ ...iconBtnStyle, color: "#ff6b6b", borderColor: "rgba(255,107,107,.35)" }}>🗑</button>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Question</label>
                <span style={{ fontSize: 10, color: qOver ? "#ff6b6b" : "#666", fontFamily: "monospace" }}>{qCount}/{MAX_FAQ_QUESTION_LEN}</span>
              </div>
              <input
                type="text"
                value={it.q}
                maxLength={MAX_FAQ_QUESTION_LEN + 10}
                onChange={(e) => update(i, { q: e.target.value.slice(0, MAX_FAQ_QUESTION_LEN) })}
                placeholder="Ex: Le bonus est-il garanti ?"
                style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${qOver ? "#ff6b6b" : "#2a2a4a"}`, background: "#0f0d14", color: "#eee", font: "inherit", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Réponse</label>
                <span style={{ fontSize: 10, color: aOver ? "#ff6b6b" : "#666", fontFamily: "monospace" }}>{aCount}/{MAX_FAQ_ANSWER_LEN}</span>
              </div>
              <textarea
                value={it.a}
                maxLength={MAX_FAQ_ANSWER_LEN + 50}
                rows={3}
                onChange={(e) => update(i, { a: e.target.value.slice(0, MAX_FAQ_ANSWER_LEN) })}
                placeholder="Ex: Oui, dès validation du premier dépôt."
                style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${aOver ? "#ff6b6b" : "#2a2a4a"}`, background: "#0f0d14", color: "#eee", font: "inherit", boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
          </div>
        );
      })}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6 }}>
        <button
          type="button"
          onClick={add}
          disabled={items.length >= MAX_FAQ_ITEMS}
          style={{
            border: "1px dashed rgba(255,215,0,.4)", borderRadius: 8,
            background: items.length >= MAX_FAQ_ITEMS ? "rgba(100,100,100,.1)" : "rgba(255,215,0,.06)",
            color: items.length >= MAX_FAQ_ITEMS ? "#666" : "#FFD700",
            padding: "8px 0",
            cursor: items.length >= MAX_FAQ_ITEMS ? "not-allowed" : "pointer",
            font: "inherit", fontSize: 12, fontWeight: 700,
          }}
          title={items.length >= MAX_FAQ_ITEMS ? `Maximum ${MAX_FAQ_ITEMS} questions` : "Ajouter une question"}
        >
          + Ajouter une question {items.length > 0 && `(${items.length}/${MAX_FAQ_ITEMS})`}
        </button>
        <button
          type="button"
          onClick={resetDefaults}
          title="Remettre les questions par défaut (template d'origine)"
          style={{ border: "1px solid #2a2a4a", borderRadius: 8, background: "transparent", color: "#888", padding: "8px 0", cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 600 }}
        >↻ Défaut</button>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  border: "1px solid #2a2a4a", borderRadius: 6, background: "transparent",
  color: "#bbb", padding: "3px 8px", cursor: "pointer", font: "inherit",
  fontSize: 11, lineHeight: 1,
};

// ─── Iframe button injection (fallback fiable) ────────────────────────────────

/** buttons = AffiButton[] → injecte en mobile uniquement (rétrocompat).
 *  buttons = { mobile, desktop } → injecte les deux avec visibilité scoped par media query. */
export function injectButtonsIntoIframe(
  iframe: HTMLIFrameElement,
  buttons: AffiButton[] | { mobile?: AffiButton[]; desktop?: AffiButton[] }
) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;

  const mobileBtns = Array.isArray(buttons) ? buttons : (buttons.mobile || []);
  const desktopBtns = Array.isArray(buttons) ? [] : (buttons.desktop || []);

  // Nettoie les éventuels boutons précédemment injectés
  const existing = doc.querySelector("[data-affi-buttons-wrap]");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  // Injecte / met à jour le <style> partagé (shine keyframes + hover rules + Bebas Neue font)
  let styleTag = doc.querySelector("style[data-affi-buttons-style]") as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = doc.createElement("style");
    styleTag.setAttribute("data-affi-buttons-style", "");
    (doc.head || doc.body).appendChild(styleTag);
  }
  styleTag.textContent = `
    @import url("${BUTTON_FONT_GOOGLE_IMPORT}");
    /* Visibilité boutons scoped par device */
    @media (max-width: 899px) { [data-affi-btn-device="desktop"] { display: none !important; } }
    @media (min-width: 900px) { [data-affi-btn-device="mobile"]  { display: none !important; } }
    @keyframes affi-btn-shine {
      0%   { transform: translateX(-120%) skewX(-20deg); }
      60%  { transform: translateX(260%)  skewX(-20deg); }
      100% { transform: translateX(260%)  skewX(-20deg); }
    }
    [data-affi-btn-hover="1"] {
      transition: transform 160ms ease, filter 160ms ease !important;
    }
    [data-affi-btn-hover="1"]:hover {
      transform: translateY(-2px) scale(1.03) !important;
      filter: brightness(1.08) !important;
    }
    .affi-btn-shine-overlay {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 45% !important;
      height: 100% !important;
      background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,.55) 50%, transparent 100%) !important;
      animation: affi-btn-shine 3.2s ease-in-out infinite !important;
      pointer-events: none !important;
      z-index: 1 !important;
      mix-blend-mode: screen !important;
    }
  `;

  if (mobileBtns.length === 0 && desktopBtns.length === 0) return;

  const wrap = doc.createElement("div");
  wrap.setAttribute("data-affi-buttons-wrap", "");
  wrap.style.cssText = "display:contents!important;";

  // Combine les deux listes avec tag de device
  const all: Array<{ btn: AffiButton; device: "mobile" | "desktop" }> = [
    ...mobileBtns.map((btn) => ({ btn, device: "mobile" as const })),
    ...desktopBtns.map((btn) => ({ btn, device: "desktop" as const })),
  ];

  for (const { btn: b, device } of all) {
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

    const fontWeight = typeof b.fontWeight === "number" && b.fontWeight > 0 ? b.fontWeight : 800;

    // Attributs pour le CSS partagé (hover + shine) et repositionnement dynamique
    if (b.hoverEffect) el.setAttribute("data-affi-btn-hover", "1");
    if (b.shine) el.setAttribute("data-affi-btn-shine", "1");
    el.setAttribute("data-affi-btn-device", device);
    // yPct stocké en dataset — recalculé en pixels relatifs à scrollHeight du document
    // (pour que la position suive le contenu sur tout device, pas le viewport)
    el.setAttribute("data-affi-btn-ypct", String(yPct));

    el.style.cssText = [
      "position:absolute!important",
      "pointer-events:auto!important",
      `left:${xPct}%!important`,
      // top initial = calcul viewport-based, updateAllPositions() remplacera en px
      `top:${yPct}%!important`,
      `width:${widthPx}px!important`,
      `height:${heightPx}px!important`,
      `background:${backgroundValue}!important`,
      `color:${textColor}!important`,
      `border-radius:${borderRadius}px!important`,
      `font-size:${fontSize}px!important`,
      `font-weight:${fontWeight}!important`,
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

    // Shine overlay — lumière qui glisse
    if (b.shine) {
      const shine = doc.createElement("div");
      shine.className = "affi-btn-shine-overlay";
      el.appendChild(shine);
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

  // ─── Repositionnement dynamique en fonction de la hauteur RÉELLE du document ──
  // yPct = % de la hauteur totale du document (scrollHeight), pas du viewport.
  // Ça garantit que le bouton reste à la même position relative au contenu, peu
  // importe la taille d'écran. Recalcul sur resize + load d'image + mutation DOM.
  const getDocHeight = () => Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    doc.documentElement.clientHeight,
  );
  const updateAllPositions = () => {
    const h = getDocHeight();
    doc.querySelectorAll<HTMLElement>("[data-affi-btn-ypct]").forEach((btn) => {
      const y = parseFloat(btn.getAttribute("data-affi-btn-ypct") || "0");
      const topPx = Math.max(0, (h * y) / 100);
      btn.style.setProperty("top", `${topPx}px`, "important");
    });
  };

  updateAllPositions();
  // Recalcul après chargement des images (scrollHeight grandit quand les images chargent)
  doc.querySelectorAll("img").forEach((img) => {
    if (!(img as HTMLImageElement).complete) {
      img.addEventListener("load", updateAllPositions, { once: true });
      img.addEventListener("error", updateAllPositions, { once: true });
    }
  });
  // Recalcul sur redimensionnement de la fenêtre de l'iframe
  const win = iframe.contentWindow;
  if (win) {
    // Supprime un éventuel listener précédent avant de réinscrire
    const prev = (win as any).__affiBtnResize;
    if (prev) win.removeEventListener("resize", prev);
    (win as any).__affiBtnResize = updateAllPositions;
    win.addEventListener("resize", updateAllPositions);
  }
  // ResizeObserver sur body pour capter les reflow (chargement fonts, etc.)
  try {
    const RO = (win as any)?.ResizeObserver || (typeof ResizeObserver !== "undefined" ? ResizeObserver : null);
    if (RO) {
      const ro = new RO(updateAllPositions);
      ro.observe(doc.body);
    }
  } catch {}
  // Plusieurs recalculs décalés pour rattraper les layouts différés
  setTimeout(updateAllPositions, 250);
  setTimeout(updateAllPositions, 1000);
  setTimeout(updateAllPositions, 2500);

  console.log(`[AffiEditor] Injected ${mobileBtns.length} mobile + ${desktopBtns.length} desktop button(s)`);
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
  const [viewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [device, setDevice] = useState<DeviceKey>("iphone-15-pro");
  const [deviceRotated, setDeviceRotated] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100); // %
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showQR, setShowQR] = useState(false);
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
  // ── UI state (nouveau rework) ──
  const [m6Style, setM6Style] = useState<"premium" | "arcade" | "salon">("premium");
  const [leftTab, setLeftTab] = useState<"pages" | "models">("pages");
  const [pageSearch, setPageSearch] = useState("");
  const [renamingPageId, setRenamingPageId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpenForPageId, setMenuOpenForPageId] = useState<number | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
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
    () => {
      // ✅ Si la page actuelle a un brandName custom (rename manuel), on
      // l'utilise dans la signature au lieu du brandName auto-généré.
      // Évite que le badge "modifs non enregistrées" reste allumé en
      // permanence après un rename.
      let effBrand = draftPayload.brandName;
      if (selectedPage && selectedPage.brandName) {
        const autoBrand = buildPublishedBrandName(currentModel, cfg);
        if (selectedPage.brandName.trim() !== autoBrand.trim()) {
          effBrand = selectedPage.brandName;
        }
      }
      return buildPageSignature({
        model: draftPayload.model,
        variant: draftPayload.variant,
        brandName: effBrand,
        title: draftPayload.title,
        config: draftPayload.config,
      });
    },
    [draftPayload, selectedPage, currentModel, cfg]
  );
  const hasUnsavedChanges = Boolean(selectedPage && draftSignature !== selectedPageSignature);
  // ── Load templates ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const loaded: Record<number, string> = {};
      try {
        // Cache-bust avec le buildtime pour éviter d'anciens templates en cache navigateur
        const bust = `?v=${Date.now()}`;
        for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          const r = await fetch(`/affi_templates/model${i}.html${bust}`);
          if (!r.ok) throw new Error(`model${i}.html HTTP ${r.status}`);
          loaded[i] = await r.text();
        }
        // Variantes de style pour M6 (arcade + salon = anciens M7/M8)
        try {
          const rArc = await fetch(`/affi_templates/model6-arcade.html${bust}`);
          if (rArc.ok) (loaded as any)["6-arcade"] = await rArc.text();
          const rSal = await fetch(`/affi_templates/model6-salon.html${bust}`);
          if (rSal.ok) (loaded as any)["6-salon"] = await rSal.text();
        } catch {}
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

    // ✅ Préserve le rename manuel : si l'user a renommé la page (brandName
    // en DB différent de ce que buildPublishedBrandName retournerait depuis
    // cfg), on garde son nom custom au lieu de le regénérer à chaque save.
    // Idem pour le slug — il est dérivé du brandName, donc on le préserve.
    const payload = { ...draftPayload };
    if (selectedPage && selectedPage.brandName) {
      const autoBrand = buildPublishedBrandName(currentModel, cfg);
      if (selectedPage.brandName.trim() !== autoBrand.trim()) {
        payload.brandName = selectedPage.brandName;
        if (selectedPage.slug) payload.slug = selectedPage.slug;
      }
    }

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
    const buttonsMobile = parseAffiButtons(c.customButtonsJson);
    const buttonsDesktop = parseAffiButtons(c.customButtonsJsonDesktop);
    iframe.onload = () => {
      try {
        injectButtonsIntoIframe(iframe, { mobile: buttonsMobile, desktop: buttonsDesktop });
      } catch (err) {
        console.error("[AffiEditor] inject buttons failed:", err);
      }
    };

    iframe.src = blobUrlRef.current;
  }

  // Immédiat quand on change de modèle / variante / templates chargés
  useEffect(() => {
    // Pour M6 : sélectionne la variante de style (premium/arcade/salon)
    const tmpl = (currentModel === 6 && m6Style !== "premium")
      ? (templates as any)[`6-${m6Style}`] || templates[currentModel]
      : templates[currentModel];
    if (!tmpl) return;
    pushPreview(tmpl, cfg, currentModel, goldenVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModel, goldenVariant, templates, m6Style]);

  // Debounced pour l'édition live des champs
  useEffect(() => {
    const tmpl = (currentModel === 6 && m6Style !== "premium")
      ? (templates as any)[`6-${m6Style}`] || templates[currentModel]
      : templates[currentModel];
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

  // ── Iframe dimensions from device preset ──────────────────────────────────
  const devicePreset = DEVICE_PRESETS[device];
  const iframeBaseW = deviceRotated ? devicePreset.h : devicePreset.w;
  const iframeBaseH = deviceRotated ? devicePreset.w : devicePreset.h;
  const iframeWidth =
    device === "desktop-full"
      ? "100%"
      : `${iframeBaseW}px`;
  const iframeHeight =
    device === "desktop-full"
      ? "100%"
      : `${iframeBaseH}px`;
  // Zoom applies as CSS transform scale
  const zoomScale = previewZoom / 100;

  // ── History stack (undo/redo) ─────────────────────────────────────────────
  const historyRef = useRef<Config[]>([cfg]);
  const historyIndexRef = useRef(0);
  const skipHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Push new state to history each time cfg changes (except when restoring via undo/redo)
  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const tid = setTimeout(() => {
      // Debounced push pour regrouper les frappes rapides
      const idx = historyIndexRef.current;
      historyRef.current = [...historyRef.current.slice(0, idx + 1), cfg].slice(-50);
      historyIndexRef.current = historyRef.current.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
    }, 300);
    return () => clearTimeout(tid);
  }, [cfg]);

  function undoCfg() {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    historyIndexRef.current = idx - 1;
    skipHistoryRef.current = true;
    setCfg(historyRef.current[idx - 1]);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);
  }
  function redoCfg() {
    const idx = historyIndexRef.current;
    if (idx >= historyRef.current.length - 1) return;
    historyIndexRef.current = idx + 1;
    skipHistoryRef.current = true;
    setCfg(historyRef.current[idx + 1]);
    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }

  // ── Auto-save brouillon (localStorage) ─────────────────────────────────────
  const DRAFT_KEY = "lunalive_affi_draft_v1";
  // Restore au montage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.cfg && !selectedPageId) {
        skipHistoryRef.current = true;
        setCfg((prev) => ({ ...prev, ...parsed.cfg }));
        if (typeof parsed.currentModel === "number") setCurrentModel(parsed.currentModel);
        if (parsed.goldenVariant) setGoldenVariant(parsed.goldenVariant);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Persist on change (sauf quand une page est sélectionnée — on garde ça pour les brouillons purs)
  useEffect(() => {
    if (selectedPageId) return;
    const tid = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ cfg, currentModel, goldenVariant }));
      } catch {}
    }, 500);
    return () => clearTimeout(tid);
  }, [cfg, currentModel, goldenVariant, selectedPageId]);

  // ── Pages filtrées par recherche ───────────────────────────────────────────
  const filteredPages = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    if (!q) return savedPages;
    return savedPages.filter((p) =>
      (p.brandName || "").toLowerCase().includes(q) ||
      (p.slug || "").toLowerCase().includes(q) ||
      (p.title || "").toLowerCase().includes(q) ||
      String(p.model || "").includes(q)
    );
  }, [savedPages, pageSearch]);

  // ── Rename ────────────────────────────────────────────────────────────────
  async function renamePage(page: FsbAffiPage, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === page.brandName) {
      setRenamingPageId(null);
      return;
    }
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour renommer.");
      setRenamingPageId(null);
      return;
    }
    setPageAction("update");
    setPageError(null);
    try {
      await updateFsbAffiPage(token, page.id, {
        slug: page.slug,
        model: page.model,
        variant: page.variant,
        brandName: trimmed,
        title: page.title,
        config: page.config,
      });
      await refreshPublishedPages(selectedPageId);
      setPageNotice(`Renommé : ${trimmed}`);
    } catch (e: any) {
      setPageError(String(e?.message || "Impossible de renommer."));
    } finally {
      setPageAction(null);
      setRenamingPageId(null);
    }
  }

  // ── Duplicate depuis la card (sans charger en éditeur) ────────────────────
  async function duplicatePageDirect(page: FsbAffiPage) {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise pour dupliquer.");
      return;
    }
    setPageAction("create");
    setPageError(null);
    try {
      const response = await createFsbAffiPage(token, {
        slug: page.slug,
        model: page.model,
        variant: page.variant,
        brandName: `${page.brandName || "Copie"} (copie)`,
        title: page.title,
        config: page.config,
      });
      await refreshPublishedPages(response.item.id);
      setPageNotice(`Dupliquée : ${response.item.brandName}`);
    } catch (e: any) {
      setPageError(String(e?.message || "Impossible de dupliquer."));
    } finally {
      setPageAction(null);
    }
  }

  // ── Copy URL publique ─────────────────────────────────────────────────────
  async function copyPublicUrl(slug: string) {
    const url = `${PUBLIC_SITE}/r/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1500);
    } catch {
      // Fallback : select textarea trick
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setUrlCopied(true); setTimeout(() => setUrlCopied(false), 1500); } catch {}
      document.body.removeChild(ta);
    }
  }

  // ── Fermer les menus popup au clic extérieur ──────────────────────────────
  useEffect(() => {
    if (menuOpenForPageId === null && !showDeviceMenu) return;
    const handler = () => {
      setMenuOpenForPageId(null);
      setShowDeviceMenu(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpenForPageId, showDeviceMenu]);

  // ── Raccourcis clavier ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";
      // Ctrl/Cmd+S
      if (cmd && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canManagePublishedPages && pageAction === null) void publishCurrentPage();
        return;
      }
      // Ctrl/Cmd+Z (undo)
      if (cmd && !e.shiftKey && e.key.toLowerCase() === "z" && !inInput) {
        e.preventDefault();
        undoCfg();
        return;
      }
      // Ctrl/Cmd+Shift+Z ou Ctrl+Y (redo)
      if ((cmd && e.shiftKey && e.key.toLowerCase() === "z") || (cmd && e.key.toLowerCase() === "y" && !inInput)) {
        e.preventDefault();
        redoCfg();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManagePublishedPages, pageAction, selectedPageId, draftPayload]);

  // ── Dupliquer dans toutes les 8 variantes (M5+) ──────────────────────────
  async function duplicateInAllVariants() {
    if (!token || !canManagePublishedPages) {
      setPageError("Connexion FSB requise.");
      return;
    }
    if (currentModel < 5) {
      setPageError("Disponible uniquement pour les modèles M5+.");
      return;
    }
    const variants: GoldenChanceVariant[] = ["gold", "ruby", "emerald", "sapphire", "amethyst", "obsidian", "rose", "jade"];
    setPageAction("create");
    setPageError(null);
    setPageNotice(null);
    let lastId: number | null = null;
    try {
      for (const v of variants) {
        const payload = buildPublishedPayload(currentModel, cfg, v);
        const response = await createFsbAffiPage(token, payload);
        lastId = response.item.id;
      }
      await refreshPublishedPages(lastId);
      setPageNotice(`8 variantes créées pour M${currentModel}`);
    } catch (e: any) {
      setPageError(String(e?.message || "Impossible de créer toutes les variantes."));
    } finally {
      setPageAction(null);
    }
  }

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

      {/* ═══════════════  TOP BAR  ═══════════════════════════════════════════ */}
      <header style={s.topBar}>
        <div style={s.brand}>
          <div style={s.brandMark}>A</div>
          <span style={s.brandText}>Affi<b>Studio</b></span>
        </div>

        <div style={s.topBarSep} />

        <div style={s.crumb}>
          <span style={s.crumbChip}>
            M{currentModel}{currentModel >= 5 ? ` · ${goldenVariant}` : ""}
          </span>
          <span style={s.crumbSlash}>/</span>
          <span style={s.crumbName}>
            {selectedPage ? (selectedPage.brandName || "(sans nom)") : "Nouveau brouillon"}
          </span>
          {selectedPage && (
            <span style={s.crumbSlug}>/r/{selectedPage.slug}</span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          ...s.statusChip,
          ...(hasUnsavedChanges ? s.statusChipWarn : selectedPage ? s.statusChipOk : s.statusChipDraft),
        }}>
          <span style={{
            ...s.statusDot,
            background: hasUnsavedChanges ? "#f59e0b" : selectedPage ? "#10b981" : "#64748b",
          }} />
          {pageAction === "create" || pageAction === "update" ? "Enregistrement…"
            : hasUnsavedChanges ? "Non enregistré"
            : selectedPage ? "Enregistré"
            : "Brouillon"}
        </div>

        <div style={s.topBarSep} />

        <button style={s.topBtnGhost} onClick={() => navigate(returnTo)} title="Retour au FSB Board">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Retour
        </button>
        <button style={s.topBtnGhost} onClick={resetDraft} title="Réinitialiser le brouillon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button
          style={s.topBtnGhost}
          onClick={() => copyPublicUrl(selectedPage?.slug || publishedSlugPreview)}
          title={urlCopied ? "Copié !" : "Copier l'URL publique"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          {urlCopied ? "Copié" : "URL"}
        </button>
        <button style={{ ...s.topBtnIcon, opacity: canUndo ? 1 : 0.35 }} onClick={undoCfg} disabled={!canUndo} title="Annuler (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button style={{ ...s.topBtnIcon, opacity: canRedo ? 1 : 0.35 }} onClick={redoCfg} disabled={!canRedo} title="Rétablir (Ctrl+Shift+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 7v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button style={s.topBtnGhost} onClick={() => setShowQR(!showQR)} title="QR Code pour scanner sur mobile">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/><path d="M14 14h2v2M20 14v3M14 17v2h2M14 21h2M18 19v2M20 19h1M20 21h1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          QR
        </button>
        <button style={s.topBtnGhost} onClick={exportHtml} title="Exporter le HTML autonome">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Export
        </button>

        {selectedPageId && hasUnsavedChanges && (
          <button
            style={s.topBtnSecondary}
            onClick={saveCurrentPageAsVariant}
            disabled={!canManagePublishedPages || pageAction !== null}
            title="Créer une nouvelle page à partir de cette version modifiée"
          >
            + Variante
          </button>
        )}

        <button
          style={{ ...s.topBtnPrimary, opacity: canManagePublishedPages && pageAction === null ? 1 : 0.55 }}
          onClick={publishCurrentPage}
          disabled={!canManagePublishedPages || pageAction !== null}
          title={canManagePublishedPages ? `${selectedPageId ? "Enregistrer" : "Publier"} (Ctrl+S)` : "Accès FSB requis"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h7l-1 8 10-12h-7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
          {selectedPageId ? "Enregistrer" : "Publier"}
        </button>
      </header>

      {/* ═══════════════  BODY  ══════════════════════════════════════════════ */}
      <div style={s.body}>

        {/* ═══  LEFT SIDEBAR  ═══════════════════════════════════════════════ */}
        {!leftCollapsed && (
        <aside style={s.sidebar}>

          {/* Sidebar tabs */}
          <div style={s.sideTabs}>
            <button
              style={{ ...s.sideTab, ...(leftTab === "pages" ? s.sideTabActive : {}) }}
              onClick={() => setLeftTab("pages")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Pages
              {savedPages.length > 0 && <span style={s.sideTabCount}>{savedPages.length}</span>}
            </button>
            <button
              style={{ ...s.sideTab, ...(leftTab === "models" ? s.sideTabActive : {}) }}
              onClick={() => setLeftTab("models")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/></svg>
              Templates
            </button>
          </div>

          {/* Alerts */}
          {(pageError || pageNotice || loadError || !canManagePublishedPages) && (
            <div style={{ padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
              {loadError && <div style={s.alertError}>⚠ Templates introuvables dans /affi_templates/</div>}
              {pageError && <div style={s.alertError}>{pageError}</div>}
              {pageNotice && <div style={s.alertOk}>{pageNotice}</div>}
              {!canManagePublishedPages && <div style={s.alertWarn}>Accès FSB requis pour publier</div>}
            </div>
          )}

          {/* ═══ PAGES tab ═══ */}
          {leftTab === "pages" && (
            <div style={s.sideScroll}>
              <div style={{ padding: "12px 12px 8px" }}>
                <div style={s.searchBar}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={s.searchIcon}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  <input
                    type="text"
                    value={pageSearch}
                    onChange={(e) => setPageSearch(e.target.value)}
                    placeholder="Rechercher une page…"
                    style={s.searchInput}
                  />
                  {pageSearch && (
                    <button onClick={() => setPageSearch("")} style={s.searchClear} title="Effacer">✕</button>
                  )}
                </div>
              </div>

              <button style={s.newPageCard} onClick={resetDraft}>
                <span style={s.newPageCardPlus}>+</span>
                <div>
                  <div style={s.newPageCardTitle}>Nouvelle page</div>
                  <div style={s.newPageCardSub}>Démarrer un brouillon vierge</div>
                </div>
              </button>

              <div style={s.pageList}>
                {loadingPages ? (
                  <div style={s.emptyState}>
                    <div style={s.emptyIcon}>⏳</div>
                    <div>Chargement…</div>
                  </div>
                ) : filteredPages.length === 0 ? (
                  <div style={s.emptyState}>
                    <div style={s.emptyIcon}>{pageSearch ? "🔍" : "📭"}</div>
                    <div>{pageSearch ? `Aucun résultat pour "${pageSearch}"` : "Aucune page publiée"}</div>
                    {!pageSearch && <div style={s.emptySub}>Clique sur « Nouvelle page » pour commencer</div>}
                  </div>
                ) : (
                  filteredPages.map((page) => {
                    const isActive = page.id === selectedPageId;
                    const isRenaming = renamingPageId === page.id;
                    const isMenuOpen = menuOpenForPageId === page.id;
                    return (
                      <div
                        key={page.id}
                        style={{ ...s.pageCard, ...(isActive ? s.pageCardActive : {}) }}
                      >
                        <div
                          style={s.pageCardMain}
                          onClick={() => { if (!isRenaming) loadPublishedPageInEditor(page); }}
                        >
                          <div style={s.pageCardThumb}><ModelThumb n={page.model || 1} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isRenaming ? (
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => renamePage(page, renameValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.currentTarget.blur(); }
                                  if (e.key === "Escape") { setRenamingPageId(null); }
                                }}
                                style={s.renameInput}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div style={s.pageCardName}>{page.brandName || "(sans nom)"}</div>
                            )}
                            <div style={s.pageCardRow}>
                              <span style={s.pageCardBadge}>M{page.model}{page.variant ? `·${page.variant}` : ""}</span>
                              <span style={s.pageCardSlug}>/r/{page.slug}</span>
                            </div>
                          </div>
                          <button
                            style={s.pageCardMenuBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenForPageId(isMenuOpen ? null : page.id);
                            }}
                            title="Plus d'actions"
                          >⋯</button>
                        </div>
                        {isMenuOpen && (
                          <div style={s.menu} onClick={(e) => e.stopPropagation()}>
                            <button style={s.menuItem} onClick={() => {
                              window.open(`${PUBLIC_SITE}/r/${page.slug}`, "_blank", "noopener,noreferrer");
                              setMenuOpenForPageId(null);
                            }}>
                              <span style={s.menuIco}>↗</span>Ouvrir publique
                            </button>
                            <button style={s.menuItem} onClick={() => { copyPublicUrl(page.slug); setMenuOpenForPageId(null); }}>
                              <span style={s.menuIco}>🔗</span>Copier l'URL
                            </button>
                            <button style={s.menuItem} onClick={() => {
                              setRenamingPageId(page.id);
                              setRenameValue(page.brandName || "");
                              setMenuOpenForPageId(null);
                            }}>
                              <span style={s.menuIco}>✎</span>Renommer
                            </button>
                            <button
                              style={s.menuItem}
                              disabled={!canManagePublishedPages}
                              onClick={() => { duplicatePageDirect(page); setMenuOpenForPageId(null); }}
                            >
                              <span style={s.menuIco}>⎘</span>Dupliquer
                            </button>
                            <div style={s.menuDivider} />
                            <button
                              style={{ ...s.menuItem, color: "#fca5a5" }}
                              disabled={!canManagePublishedPages || pageAction === "delete"}
                              onClick={() => { removePublishedPage(page); setMenuOpenForPageId(null); }}
                            >
                              <span style={s.menuIco}>🗑</span>Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ═══ MODELS tab ═══ */}
          {leftTab === "models" && (
            <div style={s.sideScroll}>
              <div style={s.sideLabel}>Template</div>
              <div style={s.modelGrid}>
                {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((n) => (
                  <button
                    key={n}
                    style={{ ...s.modelCardV2, ...(currentModel === n ? s.modelCardV2Active : {}) }}
                    onClick={() => setCurrentModel(n)}
                  >
                    <div style={s.modelThumbV2}><ModelThumb n={n} /></div>
                    <div style={s.modelCardV2Name}>M{n}</div>
                    <div style={s.modelCardV2Desc}>
                      {n === 1 ? "Side" : n === 2 ? "Monopage" : n === 3 ? "Streamer" : n === 4 ? "2 cartes" : n === 5 ? "Golden" : n === 6 ? "Premium" : n === 7 ? "Immersif" : n === 8 ? "Split" : n === 9 ? "Urgency" : "Avis"}
                    </div>
                  </button>
                ))}
              </div>

              {currentModel === 6 && (
                <>
                  <div style={{ ...s.sideLabel, marginTop: 12 }}>Style M6</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: "0 12px 10px" }}>
                    {(["premium", "arcade", "salon"] as const).map((st) => (
                      <button
                        key={st}
                        style={{ ...s.variantBtn, ...(m6Style === st ? s.variantBtnActive : {}), padding: "8px 6px", justifyContent: "center", fontSize: 11 }}
                        onClick={() => setM6Style(st)}
                      >
                        {st === "premium" ? "💎 Premium" : st === "arcade" ? "🎮 Arcade" : "🎭 Salon"}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {currentModel >= 5 && (
                <>
                  <div style={{ ...s.sideLabel, marginTop: 12 }}>Thème couleur</div>
                  <div style={{ padding: "0 12px 12px" }}>
                    <VariantPicker value={goldenVariant} onChange={setGoldenVariant} />
                  </div>
                  <div style={{ padding: "0 12px 16px" }}>
                    <button
                      style={s.generateAllBtn}
                      onClick={duplicateInAllVariants}
                      disabled={!canManagePublishedPages || pageAction !== null}
                      title="Crée 8 pages simultanément, une par couleur (gold, ruby, emerald…)"
                    >
                      <span style={{ fontSize: 15 }}>✨</span>
                      <span>Générer les 8 variantes</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
        )}

        {/* Left rail collapse toggle */}
        <button
          style={{ ...s.collapseBtn, left: leftCollapsed ? 6 : 272 }}
          onClick={() => setLeftCollapsed(!leftCollapsed)}
          title={leftCollapsed ? "Ouvrir la barre latérale" : "Réduire la barre latérale"}
        >
          {leftCollapsed ? "›" : "‹"}
        </button>

        {/* ═══  CENTER PREVIEW  ═════════════════════════════════════════════ */}
        <main style={s.preview}>
          <div style={s.previewBar}>
            <div style={s.previewCrumb}>
              <span style={s.previewCrumbChip}>M{currentModel}</span>
              {currentModel >= 5 && <span style={s.previewCrumbChip}>{goldenVariant}</span>}
              {hasUnsavedChanges && <span style={s.previewDirty}>● modifié</span>}
            </div>

            <div style={{ flex: 1 }} />

            {/* Device picker dropdown */}
            <div style={{ position: "relative" }}>
              <button
                style={s.deviceBtnTop}
                onClick={(e) => { e.stopPropagation(); setShowDeviceMenu(!showDeviceMenu); }}
                title="Choisir un appareil"
              >
                <span>{devicePreset.icon}</span>
                <span style={{ fontWeight: 700 }}>{devicePreset.label}</span>
                {device !== "desktop-full" && (
                  <span style={s.deviceBtnDim}>
                    · {iframeBaseW}×{iframeBaseH}
                  </span>
                )}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {showDeviceMenu && (
                <div style={s.deviceMenu} onClick={(e) => e.stopPropagation()}>
                  {(["phone", "tablet", "desktop"] as const).map((group) => (
                    <Fragment key={group}>
                      <div style={s.deviceMenuGroup}>
                        {group === "phone" ? "📱 Téléphones" : group === "tablet" ? "🖼 Tablettes" : "🖥 Desktop"}
                      </div>
                      {(Object.entries(DEVICE_PRESETS) as [DeviceKey, typeof DEVICE_PRESETS[DeviceKey]][])
                        .filter(([, d]) => d.group === group)
                        .map(([k, d]) => (
                          <button
                            key={k}
                            style={{ ...s.deviceMenuItem, ...(device === k ? s.deviceMenuItemActive : {}) }}
                            onClick={() => { setDevice(k); setShowDeviceMenu(false); }}
                          >
                            <span style={{ marginRight: 8 }}>{d.icon}</span>
                            <span style={{ flex: 1, textAlign: "left" }}>{d.label}</span>
                            {d.w > 0 && <span style={s.deviceMenuDim}>{d.w}×{d.h}</span>}
                          </button>
                        ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Rotation */}
            {device !== "desktop-full" && (
              <button
                style={{ ...s.topBtnIcon, ...(deviceRotated ? { background: T.primarySoft, color: T.primaryHover, borderColor: T.primary } : {}) }}
                onClick={() => setDeviceRotated(!deviceRotated)}
                title={deviceRotated ? "Passer en portrait" : "Passer en paysage"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ transform: deviceRotated ? "rotate(90deg)" : "none", transition: "transform 0.25s" }}><rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>
              </button>
            )}

            {/* Zoom */}
            <div style={s.zoomWrap}>
              <button style={s.zoomBtn} onClick={() => setPreviewZoom(Math.max(25, previewZoom - 25))} title="Dézoomer">−</button>
              <button style={s.zoomLabel} onClick={() => setPreviewZoom(100)} title="Réinitialiser (100%)">{previewZoom}%</button>
              <button style={s.zoomBtn} onClick={() => setPreviewZoom(Math.min(200, previewZoom + 25))} title="Zoomer">+</button>
            </div>
          </div>

          {/* QR panel */}
          {showQR && (
            <div style={s.qrPanel}>
              <div style={s.qrInner}>
                <div style={s.qrTitle}>Scanner avec ton téléphone</div>
                <div style={s.qrSub}>{selectedPage ? `${PUBLIC_SITE}/r/${selectedPage.slug}` : `Preview locale (publier pour URL définitive)`}</div>
                <img
                  alt="QR code"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&color=f3f3f8&bgcolor=11111c&data=${encodeURIComponent(selectedPage ? `${PUBLIC_SITE}/r/${selectedPage.slug}` : publishedUrlPreview)}`}
                  style={s.qrImg}
                />
                <button style={s.qrClose} onClick={() => setShowQR(false)}>Fermer ✕</button>
              </div>
            </div>
          )}

          <div style={s.previewCanvas}>
            <div style={{
              width: device === "desktop-full" ? "100%" : `${iframeBaseW * zoomScale}px`,
              height: device === "desktop-full" ? "100%" : `${iframeBaseH * zoomScale}px`,
              minHeight: 400,
              flex: "none",
              position: "relative",
              transition: "width 0.25s, height 0.25s",
            }}>
              <iframe
                ref={iframeRef}
                style={{
                  ...s.iframe,
                  width: iframeWidth,
                  height: device === "desktop-full" ? "100%" : iframeHeight,
                  transform: `scale(${zoomScale})`,
                  transformOrigin: "top left",
                  border: `1px solid ${T.bd}`,
                  borderRadius: 14,
                  boxShadow: T.shadowLg,
                }}
                title="preview"
              />
            </div>
          </div>
        </main>

        {/* Right dock collapse toggle */}
        <button
          style={{ ...s.collapseBtn, right: rightCollapsed ? 6 : 372 }}
          onClick={() => setRightCollapsed(!rightCollapsed)}
          title={rightCollapsed ? "Ouvrir le panneau propriétés" : "Réduire le panneau propriétés"}
        >
          {rightCollapsed ? "‹" : "›"}
        </button>

        {/* ═══  RIGHT DOCK  ══════════════════════════════════════════════════ */}
        {!rightCollapsed && (
        <aside style={s.rightDock}>
          <div style={s.rightTabs}>
            {([
              ["content", "Contenu"],
              ["style", "Design"],
              ["layout", "Layout"],
            ] as const).map(([t, lbl]) => (
              <button
                key={t}
                style={{ ...s.rightTab, ...(rightTab === t ? s.rightTabActive : {}) }}
                onClick={() => setRightTab(t)}
              >
                {lbl}
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

              {/* ═══ M3 — Streamer Profile (sections dédiées) ═══ */}
              {currentModel === 3 && (
                <>
                  <Section title="👤 Profil streamer">
                    <TextField label="Pseudo" value={cfg.streamerPseudo} onChange={set("streamerPseudo")} placeholder="LeStreamer" />
                    <TextField label="Handle" value={cfg.streamerHandle} onChange={set("streamerHandle")} placeholder="@lestreamer" />
                    <TextField label="Tagline" value={cfg.streamerTagline} onChange={set("streamerTagline")} placeholder="casino & entertainment" />
                    <TextField label="Statut (tag live)" value={cfg.streamerStatus} onChange={set("streamerStatus")} placeholder="En stream maintenant" />
                    <ImagePicker label="Avatar" value={cfg.imgUrl} onChange={set("imgUrl")} />
                  </Section>

                  <Section title="📊 Statistiques affichées" defaultOpen={false}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <TextField label="Abonnés" value={cfg.streamerStatFollowers} onChange={set("streamerStatFollowers")} placeholder="28.4K" />
                      <TextField label="Inscrits/jour" value={cfg.streamerStatToday} onChange={set("streamerStatToday")} placeholder="214" />
                      <TextField label="Note" value={cfg.streamerStatRating} onChange={set("streamerStatRating")} placeholder="4.9" />
                    </div>
                    <div style={{ fontSize: 11, color: T.txtMute, marginTop: 4, lineHeight: 1.5 }}>
                      Les stats créent de la confiance chez le viewer qui arrive depuis TikTok/IG.
                    </div>
                  </Section>

                  <Section title="💬 Message perso">
                    <TextField
                      label="Message (affiché entre guillemets)"
                      value={cfg.streamerMessage}
                      onChange={set("streamerMessage")}
                      placeholder="Hey, j'ai testé pas mal de casinos…"
                      multiline
                    />
                    <TextField label="Signature" value={cfg.streamerSign} onChange={set("streamerSign")} placeholder="— Le Streamer" />
                  </Section>

                  <Section title="🔗 Réseaux sociaux">
                    <div style={{ fontSize: 11, color: T.txtMute, marginBottom: 8, lineHeight: 1.5 }}>
                      Ajoute tes comptes pour rassurer le viewer. Les liens ouvrent en nouvel onglet. Le compteur est optionnel.
                    </div>
                    <SocialsEditor
                      items={parseSocialLinks(cfg.streamerSocialsJson)}
                      onChange={(next) => set("streamerSocialsJson")(stringifySocialLinks(next))}
                    />
                  </Section>

                  <Section title="🎰 Offre casino">
                    <TextField label="Nom du casino" value={cfg.casinoName} onChange={set("casinoName")} placeholder="Celsius Games" />
                    <ImagePicker label="Logo du casino (optionnel)" value={cfg.casinoLogoUrl} onChange={set("casinoLogoUrl")} />
                    <TextField label="Titre de l'offre" value={cfg.offerTitle} onChange={set("offerTitle")} placeholder="Offre de Bienvenue Communauté" />
                    <TextField label="Texte dépôt" value={cfg.depositText} onChange={set("depositText")} placeholder="Dépose 10€" />
                    <TextField label="Texte bonus" value={cfg.receiveText} onChange={set("receiveText")} placeholder="Reçois 20€" />
                    <TextField label="Lien d'affiliation" value={cfg.affiLink} onChange={set("affiLink")} placeholder="https://casino.com/ref/..." type="url" />
                    <TextField label="Texte CTA" value={cfg.btnText} onChange={set("btnText")} placeholder="Activer via mon lien" />
                    <TextField label="Balise title (SEO)" value={cfg.pageTitle} onChange={set("pageTitle")} />
                  </Section>
                </>
              )}

              {currentModel !== 5 && currentModel !== 3 && (
                <>
                  <Section title="Couleurs">
                    <ColorField label="Fond page" value={cfg.bgPage} onChange={set("bgPage")} />
                    <ColorField label="Fond carte" value={cfg.bgCard} onChange={set("bgCard")} />
                    <ColorField label="Or" value={cfg.brandGold} onChange={set("brandGold")} />
                    <ColorField label="Ruby" value={cfg.brandRuby} onChange={set("brandRuby")} />
                    <ColorField label="Vert" value={cfg.casinoGreen} onChange={set("casinoGreen")} />
                    <ColorField label="Bordure" value={cfg.borderColor} onChange={set("borderColor")} />
                    {currentModel === 4 && (
                      <ColorField
                        label="Texte avis (section reviews)"
                        value={cfg.colorReviewText || "#9aa1b1"}
                        onChange={set("colorReviewText")}
                      />
                    )}
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
                    <div style={s.field}>
                      <label style={s.label}>Cadrage de l'image</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {([
                          ["cover",   "🖼 Remplir",    "Image recadrée pour remplir le cadre"],
                          ["contain", "◱ Voir tout",   "Image entière visible (bandes possibles)"],
                          ["fill",    "⤢ Étirer",      "Déforme l'image pour remplir"],
                          ["native",  "📐 Adapter",    "Cadre adapté au ratio de l'image"],
                        ] as const).map(([val, lbl, tip]) => (
                          <button
                            key={val}
                            title={tip}
                            style={{ ...s.variantBtn, ...(cfg.imgFit === val ? s.variantBtnActive : {}), padding: "8px 10px" }}
                            onClick={() => set("imgFit")(val)}
                          >
                            <span style={{ fontSize: 12 }}>{lbl}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <TextField label="Lien d'affiliation" value={cfg.affiLink} onChange={set("affiLink")} placeholder="https://casino.com/ref/..." type="url" />
                  </Section>

                  <Section title="📊 Tracking UTM" defaultOpen={false}>
                    <div style={{ fontSize: 11, color: T.txtMute, marginBottom: 8, lineHeight: 1.5 }}>
                      Paramètres ajoutés automatiquement à ton lien d'affiliation pour tracker la source du clic.
                    </div>
                    <TextField label="utm_source" value={cfg.utmSource} onChange={set("utmSource")} placeholder="ex: instagram, telegram, twitter" />
                    <TextField label="utm_medium" value={cfg.utmMedium} onChange={set("utmMedium")} placeholder="ex: story, post, bio" />
                    <TextField label="utm_campaign" value={cfg.utmCampaign} onChange={set("utmCampaign")} placeholder="ex: bonus-noel-2026" />
                    {(cfg.utmSource || cfg.utmMedium || cfg.utmCampaign) && (
                      <div style={{ ...s.urlPreview, marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: T.txtMute, marginBottom: 4 }}>Aperçu du lien final :</div>
                        {(() => {
                          const u: string[] = [];
                          if (cfg.utmSource)   u.push(`utm_source=${encodeURIComponent(cfg.utmSource)}`);
                          if (cfg.utmMedium)   u.push(`utm_medium=${encodeURIComponent(cfg.utmMedium)}`);
                          if (cfg.utmCampaign) u.push(`utm_campaign=${encodeURIComponent(cfg.utmCampaign)}`);
                          const sep = (cfg.affiLink || "").includes("?") ? "&" : "?";
                          return (cfg.affiLink || "https://…") + (u.length ? sep + u.join("&") : "");
                        })()}
                      </div>
                    )}
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
                    <TextFieldWithColor
                      label="Badge VIP"
                      value={cfg.badgeText}
                      onChange={set("badgeText")}
                      color={cfg.colorBadge || ""}
                      onColorChange={set("colorBadge")}
                    />
                    <div style={{ fontSize: 10.5, color: T.txtMute, marginTop: -4, marginBottom: 10 }}>
                      💡 Vide ce champ → le badge disparaît complètement.
                    </div>
                    <TextFieldWithColor
                      label="H1 — texte principal"
                      value={cfg.heroTitleBefore}
                      onChange={set("heroTitleBefore")}
                      color={cfg.colorTitleMain || ""}
                      onColorChange={set("colorTitleMain")}
                    />
                    <TextFieldWithColor
                      label="H1 — texte en or"
                      value={cfg.heroTitleSpan}
                      onChange={set("heroTitleSpan")}
                      color={cfg.colorTitleSpan || ""}
                      onColorChange={set("colorTitleSpan")}
                    />
                    {currentModel === 4 && (
                      <TextFieldWithColor
                        label="H1 — 3e ligne (sous le texte en or)"
                        value={cfg.heroTitleAfter || ""}
                        onChange={set("heroTitleAfter")}
                        color={cfg.colorTitleAfter || ""}
                        onColorChange={set("colorTitleAfter")}
                      />
                    )}
                    {currentModel === 4 && (
                      <div style={{
                        marginTop: 8, padding: "10px 12px", borderRadius: 8,
                        border: "1px solid rgba(255,215,0,.18)",
                        background: "rgba(255,215,0,.03)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#FFD700", marginBottom: 8, letterSpacing: ".06em", textTransform: "uppercase" }}>
                          ✨ Style du H1
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: "0.82rem", color: "#ddd" }}>
                          <input
                            type="checkbox"
                            checked={cfg.m4TitleMainGold === "1"}
                            onChange={(e) => set("m4TitleMainGold")(e.target.checked ? "1" : "")}
                          />
                          <span>Texte principal en doré</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: "0.82rem", color: "#ddd" }}>
                          <input
                            type="checkbox"
                            checked={cfg.m4TitleSpanGold !== "" && cfg.m4TitleSpanGold !== "0"}
                            onChange={(e) => set("m4TitleSpanGold")(e.target.checked ? "1" : "")}
                          />
                          <span>Texte en or (span) en doré</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: "0.82rem", color: "#ddd" }}>
                          <input
                            type="checkbox"
                            checked={cfg.m4TitleStacked === "1"}
                            onChange={(e) => set("m4TitleStacked")(e.target.checked ? "1" : "")}
                          />
                          <span>Empiler les 2 lignes (l'une sous l'autre)</span>
                        </label>
                        <div style={{ fontSize: 10, color: T.txtMute, marginTop: 4, lineHeight: 1.4 }}>
                          Par défaut le span suit le texte principal sur la même ligne s'il y a la place.
                          Coche "Empiler" pour forcer le passage à la ligne (texte principal / span).
                        </div>
                      </div>
                    )}
                    <TextFieldWithColor
                      label="Sous-titre"
                      value={cfg.heroSubtitle}
                      onChange={set("heroSubtitle")}
                      color={cfg.colorSubtitle || ""}
                      onColorChange={set("colorSubtitle")}
                      multiline
                    />
                    <TextFieldWithColor
                      label="Texte bouton"
                      value={cfg.btnText}
                      onChange={set("btnText")}
                      color={cfg.colorBtn || ""}
                      onColorChange={set("colorBtn")}
                    />
                    <TextFieldWithColor
                      label="Sticky CTA"
                      value={cfg.stickyText}
                      onChange={set("stickyText")}
                      color={cfg.colorSticky || ""}
                      onColorChange={set("colorSticky")}
                    />
                    <TextField label="Nom du casino" value={cfg.casinoName} onChange={set("casinoName")} />
                    <ImagePicker label="Logo du casino (optionnel)" value={cfg.casinoLogoUrl} onChange={set("casinoLogoUrl")} />
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

                  <Section title="🎯 Bouton RÉCLAME (hero + sticky mobile)">
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4, lineHeight: 1.4 }}>
                      Texte personnalisé du bouton principal (celui sous le coffre) ET du bouton sticky qui suit le scroll sur mobile. Laisse vide pour garder le texte auto "RÉCLAME TES {'{'}bonus{'}'}€ OFFERTS".
                    </div>
                    <TextField
                      label="Texte du bouton"
                      value={cfg.goldenHeroCtaText}
                      onChange={set("goldenHeroCtaText")}
                      placeholder={`RÉCLAME TES ${cfg.goldenBonusAmount || "20"}€ OFFERTS`}
                    />
                  </Section>

                  <Section title="⚙️ Affichage">
                    <div style={{ fontSize: 11, color: T.txtMute, marginBottom: 10, lineHeight: 1.5 }}>
                      Contrôle les sections visibles de la landing. Utile si tu veux une page ultra-compacte pour TikTok/IG.
                    </div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8, cursor: "pointer", marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={cfg.goldenHideName === "1"}
                        onChange={(e) => set("goldenHideName")(e.target.checked ? "1" : "0")}
                        style={{ marginTop: 2, accentColor: T.primary }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.txt }}>Masquer le pseudo</div>
                        <div style={{ fontSize: 11, color: T.txtMute, marginTop: 2, lineHeight: 1.4 }}>Enlève le nom et les 2 lignes qui l'encadrent en haut du hero.</div>
                      </div>
                    </label>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={cfg.goldenLandingOnly === "1"}
                        onChange={(e) => set("goldenLandingOnly")(e.target.checked ? "1" : "0")}
                        style={{ marginTop: 2, accentColor: T.primary }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.txt }}>Landing only (mode court)</div>
                        <div style={{ fontSize: 11, color: T.txtMute, marginTop: 2, lineHeight: 1.4 }}>Masque tout ce qui est sous le hero (gains / avis / FAQ / footer). La page tient dans l'écran d'arrivée.</div>
                      </div>
                    </label>
                  </Section>

                  <Section title="Hero" defaultOpen={false}>
                    <TextField label="Pseudo / marque" value={cfg.goldenBrandMain} onChange={set("goldenBrandMain")} />
                    <div style={{ fontSize: 10.5, color: T.txtMute, marginTop: -4, marginBottom: 10 }}>
                      💡 Laisser vide masque automatiquement le pseudo et les lignes qui l'encadrent.
                    </div>
                    <TextField label="Sous-ligne logo" value={cfg.goldenBrandSub} onChange={set("goldenBrandSub")} />
                    <TextField label="Titre ligne 1" value={cfg.goldenHeroTitleBefore} onChange={set("goldenHeroTitleBefore")} />
                    <TextField label="Titre ligne 2" value={cfg.goldenHeroTitleSpan} onChange={set("goldenHeroTitleSpan")} />
                    <TextField label="Sous-titre" value={cfg.goldenHeroSubtitle} onChange={set("goldenHeroSubtitle")} multiline />

                    {/* Customisation rapide du H1 (taille / police / couleur / position).
                        Pour réglages avancés mobile/desktop séparés, voir l'onglet "Style". */}
                    <div style={{
                      marginTop: 10, padding: "10px 12px", borderRadius: 8,
                      border: "1px solid rgba(255,215,0,.18)",
                      background: "rgba(255,215,0,.03)",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#FFD700", marginBottom: 8, letterSpacing: ".06em", textTransform: "uppercase" }}>
                        ✨ Style du titre H1
                      </div>
                      <StyleControl
                        label="Taille de police"
                        value={cfg.t_titleFs}
                        onChange={set("t_titleFs")}
                        type="text"
                        placeholder="ex: 4rem"
                      />
                      <StyleControl
                        label="Police"
                        value={cfg.t_titleFf}
                        onChange={set("t_titleFf")}
                        type="select"
                        options={FONT_NAMES}
                      />
                      <StyleControl
                        label="Couleur"
                        value={cfg.t_titleColor}
                        onChange={set("t_titleColor")}
                        type="color"
                      />
                      <StyleControl
                        label="Letter spacing"
                        value={cfg.t_titleLs}
                        onChange={set("t_titleLs")}
                        type="text"
                        placeholder="ex: 0.04em"
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <OffsetControl label="Position X (titre + sous-titre)" value={cfg.p_offerX} onChange={set("p_offerX")} />
                        <OffsetControl label="Position Y (titre + sous-titre)" value={cfg.p_offerY} onChange={set("p_offerY")} />
                      </div>
                      <div style={{ fontSize: 10, color: T.txtMute, marginTop: 6, lineHeight: 1.4 }}>
                        Pour des overrides mobile/desktop séparés, ouvre l'onglet <b>Style</b> à droite.
                      </div>
                    </div>
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
                    <ImagePicker label="Image du coffre (optionnelle)" value={cfg.goldenChestUrl} onChange={set("goldenChestUrl")} />
                    <ImagePicker label="Image jeux (optionnelle)" value={cfg.goldenGameImageUrl} onChange={set("goldenGameImageUrl")} />
                    <ImagePicker label="Image de fond (optionnelle)" value={cfg.goldenBackgroundUrl} onChange={set("goldenBackgroundUrl")} />
                    <ProfileImageField
                      label="Photo de profil (cercle au-dessus du pseudo)"
                      value={cfg.goldenProfileImageUrl}
                      onChange={set("goldenProfileImageUrl")}
                    />
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
                  <Section title="❓ Questions / Réponses" defaultOpen={false}>
                    <FaqEditor
                      items={parseFaqItems(cfg.faqItemsJson)}
                      onChange={(next) => set("faqItemsJson")(stringifyFaqItems(next))}
                    />
                  </Section>
                </>
              )}

              {/* Boutons custom — par device (desktop ≠ mobile/tablette) */}
              <Section
                title={viewport === "desktop" ? "🖥️ Boutons custom (Desktop)" : "📱 Boutons custom (Mobile/Tablette)"}
                defaultOpen={false}
              >
                <div style={{ fontSize: 11, color: "#888", marginBottom: 6, lineHeight: 1.4 }}>
                  {viewport === "desktop"
                    ? "Tu édites les boutons pour l'affichage desktop uniquement. Passe en mobile pour éditer les boutons mobile."
                    : "Tu édites les boutons pour mobile/tablette. Passe en desktop pour éditer les boutons desktop."}
                </div>
                {viewport === "desktop" ? (
                  <ButtonsEditor
                    key="desktop"
                    buttons={parseAffiButtons(cfg.customButtonsJsonDesktop)}
                    onChange={(next) => set("customButtonsJsonDesktop")(stringifyAffiButtons(next))}
                    bonusAmount={cfg.goldenBonusAmount}
                    affiLink={cfg.affiLink}
                    variant={goldenVariant}
                  />
                ) : (
                  <ButtonsEditor
                    key="mobile"
                    buttons={parseAffiButtons(cfg.customButtonsJson)}
                    onChange={(next) => set("customButtonsJson")(stringifyAffiButtons(next))}
                    bonusAmount={cfg.goldenBonusAmount}
                    affiLink={cfg.affiLink}
                    variant={goldenVariant}
                  />
                )}
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
        </aside>
        )}

      </div>{/* .body */}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
// Design tokens
const T = {
  bg0: "#0a0a12",        // app background
  bg1: "#11111c",        // panels
  bg2: "#181826",        // cards
  bg3: "#1f1f30",        // hover
  bd:  "#262638",        // borders
  bd2: "#2f2f44",        // borders stronger
  txt: "#f3f3f8",
  txtDim: "#a8a8be",
  txtMute: "#6b6b82",
  primary: "#6366f1",    // indigo
  primaryHover: "#818cf8",
  primarySoft: "rgba(99,102,241,0.14)",
  success: "#10b981",
  warn: "#f59e0b",
  danger: "#ef4444",
  gold: "#f4c430",
  shadowSm: "0 1px 2px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.12)",
  shadowMd: "0 4px 10px -2px rgba(0,0,0,0.35), 0 2px 4px -1px rgba(0,0,0,0.18)",
  shadowLg: "0 20px 40px -10px rgba(0,0,0,0.5), 0 8px 16px -4px rgba(0,0,0,0.3)",
};

const s: Record<string, React.CSSProperties> = {
  // ══════ SHELL ══════
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    background: T.bg0,
    color: T.txt,
    position: "fixed",
    top: 0, left: 0,
    zIndex: 9999,
    fontSize: 14,
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },

  // ══════ TOP BAR ══════
  topBar: {
    height: 56,
    background: T.bg1,
    borderBottom: `1px solid ${T.bd}`,
    display: "flex",
    alignItems: "center",
    padding: "0 14px",
    gap: 10,
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingRight: 4,
  },
  brandMark: {
    width: 30, height: 30,
    borderRadius: 8,
    background: `linear-gradient(135deg, ${T.primary} 0%, #d946ef 100%)`,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 800, fontSize: 14,
    boxShadow: `0 4px 12px -2px ${T.primarySoft}`,
  },
  brandText: {
    fontSize: 14, fontWeight: 600, color: T.txt, letterSpacing: "-0.01em",
  },
  topBarSep: { width: 1, height: 22, background: T.bd, flexShrink: 0 },
  crumb: {
    display: "flex", alignItems: "center", gap: 8,
    minWidth: 0, flex: "0 1 auto",
    overflow: "hidden",
  },
  crumbChip: {
    padding: "3px 8px", borderRadius: 5,
    background: T.primarySoft, color: T.primaryHover,
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
    border: `1px solid ${T.primarySoft}`,
  },
  crumbSlash: { color: T.txtMute, fontSize: 14 },
  crumbName: {
    fontSize: 14, fontWeight: 600, color: T.txt,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240,
  },
  crumbSlug: {
    fontSize: 11, color: T.txtMute, fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  statusChip: {
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "5px 12px", borderRadius: 999,
    fontSize: 12, fontWeight: 600,
    whiteSpace: "nowrap",
    border: `1px solid ${T.bd}`,
  },
  statusChipOk:    { color: "#6ee7b7", background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.22)" },
  statusChipWarn:  { color: "#fcd34d", background: "rgba(245,158,11,0.09)", borderColor: "rgba(245,158,11,0.25)" },
  statusChipDraft: { color: T.txtDim, background: T.bg2, borderColor: T.bd },
  statusDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },

  topBtnGhost: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 12px", borderRadius: 7,
    background: "transparent",
    border: `1px solid ${T.bd}`,
    color: T.txtDim,
    fontSize: 12.5, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap",
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
  },
  topBtnSecondary: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 14px", borderRadius: 7,
    background: T.bg3,
    border: `1px solid ${T.bd2}`,
    color: T.txt,
    fontSize: 12.5, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap",
  },
  topBtnIcon: {
    width: 30, height: 30, flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    padding: 0,
    background: "transparent",
    border: `1px solid ${T.bd}`, borderRadius: 7,
    color: T.txtDim, cursor: "pointer",
  },
  topBtnPrimary: {
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "8px 16px", borderRadius: 7,
    background: `linear-gradient(135deg, ${T.primary} 0%, #d946ef 100%)`,
    border: "1px solid transparent",
    color: "#fff",
    fontSize: 12.5, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap",
    boxShadow: `0 6px 18px -6px ${T.primary}`,
  },

  // legacy "btn" compat (if any remaining references)
  btn: { padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", whiteSpace: "nowrap" },
  btnPrimary: { background: T.primary, color: "#fff" },
  btnSuccess: { background: T.success, color: "#041a0f" },
  btnVariant: { background: "#2a2348", color: "#f2e7ff", border: "1px solid rgba(194, 146, 255, 0.36)" },
  btnSecondary: { background: T.bg3, color: T.txt, border: `1px solid ${T.bd}` },

  // ══════ SIDEBAR (left) ══════
  sidebar: {
    width: 272,
    background: T.bg1,
    borderRight: `1px solid ${T.bd}`,
    display: "flex", flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
  },
  sideTabs: {
    display: "flex",
    borderBottom: `1px solid ${T.bd}`,
    padding: "10px 10px 0",
    gap: 4,
    flexShrink: 0,
  },
  sideTab: {
    flex: 1,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: T.txtMute,
    fontSize: 12.5, fontWeight: 600,
    cursor: "pointer",
    marginBottom: -1,
    transition: "color 0.15s, border-color 0.15s",
  },
  sideTabActive: {
    color: T.txt,
    borderBottomColor: T.primary,
  },
  sideTabCount: {
    padding: "1px 6px",
    borderRadius: 999,
    fontSize: 10, fontWeight: 800,
    background: T.primarySoft,
    color: T.primaryHover,
  },
  sideScroll: {
    flex: 1,
    overflowY: "auto",
    paddingBottom: 20,
  },
  sideLabel: {
    padding: "14px 14px 6px",
    fontSize: 10.5, fontWeight: 800, textTransform: "uppercase",
    letterSpacing: ".12em",
    color: T.txtMute,
  },
  searchBar: {
    position: "relative",
    display: "flex", alignItems: "center",
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: 8,
    padding: "0 10px",
    transition: "border-color 0.15s",
  },
  searchIcon: { color: T.txtMute, flexShrink: 0 },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: 0, outline: "none",
    color: T.txt,
    padding: "9px 8px",
    fontSize: 13,
    fontFamily: "inherit",
  },
  searchClear: {
    background: T.bg3, border: 0, color: T.txtDim,
    width: 20, height: 20, borderRadius: 999,
    cursor: "pointer", fontSize: 11, fontWeight: 700,
    flexShrink: 0,
  },
  newPageCard: {
    display: "flex", alignItems: "center", gap: 12,
    width: "calc(100% - 24px)",
    margin: "0 12px 10px",
    padding: "12px 14px",
    background: `linear-gradient(135deg, ${T.primarySoft} 0%, rgba(217,70,239,0.06) 100%)`,
    border: `1px dashed ${T.primary}`,
    borderRadius: 10,
    color: T.txt,
    cursor: "pointer",
    textAlign: "left",
    transition: "background 0.15s, border-color 0.15s",
  },
  newPageCardPlus: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 32, borderRadius: 8,
    background: T.primary,
    color: "#fff", fontSize: 18, fontWeight: 700,
    flexShrink: 0,
  },
  newPageCardTitle: { fontSize: 13, fontWeight: 700, color: T.txt, lineHeight: 1.2 },
  newPageCardSub: { fontSize: 11, color: T.txtDim, marginTop: 2 },

  pageList: {
    display: "flex", flexDirection: "column", gap: 6,
    padding: "0 8px 8px",
  },
  pageCard: {
    position: "relative",
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: 10,
    overflow: "visible",
    transition: "border-color 0.15s, background 0.15s",
  },
  pageCardActive: {
    borderColor: T.primary,
    background: T.primarySoft,
    boxShadow: `inset 0 0 0 1px ${T.primary}`,
  },
  pageCardMain: {
    display: "flex", alignItems: "center", gap: 10,
    padding: 10,
    cursor: "pointer",
  },
  pageCardThumb: {
    width: 44, height: 28,
    borderRadius: 5,
    overflow: "hidden",
    background: "#000",
    flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  pageCardName: {
    fontSize: 13, fontWeight: 700, color: T.txt,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    lineHeight: 1.25,
  },
  pageCardRow: {
    display: "flex", alignItems: "center", gap: 6, marginTop: 4,
  },
  pageCardBadge: {
    padding: "1px 6px", borderRadius: 4,
    background: T.bg3, color: T.txtDim,
    fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  pageCardSlug: {
    fontSize: 10.5, color: T.txtMute,
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
  },
  pageCardMenuBtn: {
    width: 26, height: 26, flexShrink: 0,
    background: "transparent",
    border: 0, borderRadius: 6,
    color: T.txtDim, cursor: "pointer",
    fontSize: 17, fontWeight: 700, lineHeight: 1,
    transition: "background 0.15s",
  },
  menu: {
    position: "absolute",
    right: 10, top: 44,
    zIndex: 50,
    minWidth: 180,
    background: T.bg2,
    border: `1px solid ${T.bd2}`,
    borderRadius: 10,
    boxShadow: T.shadowLg,
    padding: 6,
    display: "flex", flexDirection: "column", gap: 2,
  },
  menuItem: {
    display: "flex", alignItems: "center", gap: 10,
    width: "100%",
    padding: "7px 10px",
    background: "transparent",
    border: 0, borderRadius: 6,
    color: T.txt,
    fontSize: 12.5, fontWeight: 500,
    cursor: "pointer", textAlign: "left",
    transition: "background 0.15s",
  },
  menuIco: { width: 14, textAlign: "center", fontSize: 12, color: T.txtDim },
  menuDivider: { height: 1, background: T.bd, margin: "4px 0" },

  renameInput: {
    width: "100%",
    background: T.bg3,
    border: `1px solid ${T.primary}`,
    borderRadius: 4,
    color: T.txt,
    padding: "4px 8px",
    fontSize: 13, fontWeight: 700,
    fontFamily: "inherit",
    outline: "none",
  },

  emptyState: {
    margin: "24px 16px",
    padding: "28px 16px",
    textAlign: "center",
    border: `1px dashed ${T.bd}`,
    borderRadius: 10,
    background: T.bg2,
    color: T.txtDim,
    fontSize: 12.5,
  },
  emptyIcon: { fontSize: 28, marginBottom: 8, opacity: 0.8 },
  emptySub: { fontSize: 11, color: T.txtMute, marginTop: 6 },

  // Alert chips
  alertError: { padding: "9px 11px", background: "rgba(239,68,68,0.09)", border: "1px solid rgba(239,68,68,0.32)", borderRadius: 8, color: "#fca5a5", fontSize: 12, lineHeight: 1.45 },
  alertOk:    { padding: "9px 11px", background: "rgba(16,185,129,0.09)", border: "1px solid rgba(16,185,129,0.28)", borderRadius: 8, color: "#6ee7b7", fontSize: 12, lineHeight: 1.45 },
  alertWarn:  { padding: "9px 11px", background: "rgba(245,158,11,0.09)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: 8, color: "#fcd34d", fontSize: 12, lineHeight: 1.45 },

  // Model grid (templates tab)
  modelGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
    padding: "0 12px 12px",
  },
  modelCardV2: {
    background: T.bg2,
    border: `1.5px solid ${T.bd}`,
    borderRadius: 10,
    padding: "8px 8px 10px",
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color 0.2s, background 0.2s",
  },
  modelCardV2Active: {
    borderColor: T.primary,
    background: T.primarySoft,
    boxShadow: `0 0 0 1px ${T.primary}`,
  },
  modelThumbV2: {
    width: "100%",
    aspectRatio: "12/7",
    borderRadius: 6,
    marginBottom: 8,
    overflow: "hidden",
    background: "#000",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modelCardV2Name: { fontSize: 11.5, fontWeight: 800, color: T.txt, letterSpacing: "0.02em" },
  modelCardV2Desc: { fontSize: 10, color: T.txtMute, marginTop: 2 },
  smallIconBtn: {
    width: 26, height: 26, flexShrink: 0,
    background: T.bg3, border: `1px solid ${T.bd}`, borderRadius: 5,
    color: T.txtDim, cursor: "pointer",
    fontSize: 12, fontWeight: 700,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  },
  addBtn: {
    flex: 1,
    padding: "8px 12px",
    background: T.primarySoft, border: `1px dashed ${T.primary}`,
    borderRadius: 7,
    color: T.primaryHover,
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  generateAllBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%",
    padding: "10px 14px",
    background: `linear-gradient(135deg, ${T.primarySoft} 0%, rgba(217,70,239,0.12) 100%)`,
    border: `1px dashed ${T.primary}`,
    borderRadius: 8,
    color: T.primaryHover,
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  },

  // ══════ COLLAPSE BTN ══════
  collapseBtn: {
    position: "absolute",
    top: 12,
    width: 22, height: 48,
    zIndex: 40,
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    color: T.txtDim,
    cursor: "pointer",
    borderRadius: 6,
    fontSize: 16, fontWeight: 700, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "left 0.25s, right 0.25s, background 0.15s",
  },

  // ══════ PREVIEW (center) ══════
  preview: {
    flex: 1,
    display: "flex", flexDirection: "column",
    overflow: "hidden",
    background: T.bg0,
    minWidth: 0,
  },
  previewBar: {
    height: 44,
    background: T.bg1,
    borderBottom: `1px solid ${T.bd}`,
    display: "flex", alignItems: "center",
    padding: "0 14px",
    gap: 10,
    flexShrink: 0,
  },
  previewCrumb: { display: "flex", alignItems: "center", gap: 6 },
  previewCrumbChip: {
    padding: "3px 9px", borderRadius: 5,
    background: T.bg3, color: T.txtDim,
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
  },
  previewDirty: {
    padding: "3px 9px", borderRadius: 5,
    background: "rgba(245,158,11,0.1)", color: "#fcd34d",
    fontSize: 11, fontWeight: 600,
    border: "1px solid rgba(245,158,11,0.28)",
  },
  viewportSwitch: {
    display: "inline-flex", gap: 2,
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: 8,
    padding: 3,
  },
  viewportBtn: {
    padding: "5px 10px",
    background: "transparent",
    border: 0, borderRadius: 5,
    color: T.txtDim,
    fontSize: 12, fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 5,
    transition: "background 0.15s, color 0.15s",
  },
  viewportBtnActive: {
    background: T.bg3,
    color: T.txt,
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
  },
  // Device picker in preview bar
  deviceBtnTop: {
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "6px 12px",
    background: T.bg2,
    border: `1px solid ${T.bd}`, borderRadius: 8,
    color: T.txt,
    fontSize: 12.5, cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "border-color 0.15s, background 0.15s",
  },
  deviceBtnDim: { color: T.txtMute, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  deviceMenu: {
    position: "absolute",
    top: "calc(100% + 6px)", right: 0,
    zIndex: 60,
    minWidth: 240,
    background: T.bg2,
    border: `1px solid ${T.bd2}`,
    borderRadius: 10,
    boxShadow: T.shadowLg,
    padding: 6,
    display: "flex", flexDirection: "column", gap: 1,
    maxHeight: 480,
    overflowY: "auto",
  },
  deviceMenuGroup: {
    padding: "9px 10px 5px",
    fontSize: 10.5, fontWeight: 800, textTransform: "uppercase",
    letterSpacing: ".1em", color: T.txtMute,
  },
  deviceMenuItem: {
    display: "flex", alignItems: "center",
    padding: "7px 10px",
    background: "transparent",
    border: 0, borderRadius: 6,
    color: T.txt,
    fontSize: 12.5,
    cursor: "pointer",
  },
  deviceMenuItemActive: {
    background: T.primarySoft,
    color: T.primaryHover,
  },
  deviceMenuDim: { color: T.txtMute, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },

  // Zoom
  zoomWrap: {
    display: "inline-flex", alignItems: "center",
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: 8, overflow: "hidden",
  },
  zoomBtn: {
    width: 28, height: 28,
    background: "transparent", border: 0,
    color: T.txtDim, cursor: "pointer",
    fontSize: 15, fontWeight: 700, lineHeight: 1,
  },
  zoomLabel: {
    padding: "0 10px", minWidth: 46,
    background: "transparent", border: 0,
    color: T.txt,
    fontSize: 11.5, fontWeight: 700, cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },

  // QR panel
  qrPanel: {
    position: "absolute",
    top: 56, right: 14,
    zIndex: 70,
    background: T.bg1,
    border: `1px solid ${T.bd2}`,
    borderRadius: 14,
    boxShadow: T.shadowLg,
    padding: 20,
  },
  qrInner: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10 },
  qrTitle: { fontSize: 14, fontWeight: 700, color: T.txt },
  qrSub: { fontSize: 11, color: T.txtMute, fontFamily: "'JetBrains Mono', monospace", maxWidth: 240, textAlign: "center", wordBreak: "break-all" },
  qrImg: { width: 240, height: 240, borderRadius: 10, background: T.bg2 },
  qrClose: {
    marginTop: 4,
    padding: "7px 14px",
    background: T.bg3, border: `1px solid ${T.bd}`, borderRadius: 7,
    color: T.txtDim, fontSize: 12, fontWeight: 600, cursor: "pointer",
  },

  previewCanvas: {
    flex: 1,
    overflow: "auto",
    display: "flex", justifyContent: "center", alignItems: "flex-start",
    background: `
      radial-gradient(1000px 500px at 50% 0%, rgba(99,102,241,0.05), transparent 60%),
      ${T.bg0}
    `,
    padding: "18px 18px 28px",
  },
  previewFrame: {
    background: "#fff",
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: T.shadowLg,
    border: `1px solid ${T.bd}`,
    transition: "width 0.25s, max-width 0.25s",
    height: "100%",
    minHeight: 500,
  },
  iframe: {
    border: `1px solid ${T.bd}`,
    background: "white",
    height: "100%",
    minHeight: 560,
    display: "block",
    borderRadius: 12,
    boxShadow: T.shadowLg,
    transition: "width 0.2s, max-width 0.2s",
  },

  // ══════ RIGHT DOCK ══════
  rightDock: {
    width: 360,
    background: T.bg1,
    borderLeft: `1px solid ${T.bd}`,
    display: "flex", flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
  },
  rightTabs: {
    display: "flex",
    borderBottom: `1px solid ${T.bd}`,
    padding: "10px 10px 0",
    gap: 4,
    flexShrink: 0,
  },
  rightTab: {
    flex: 1,
    padding: "8px 10px",
    background: "transparent",
    border: 0,
    borderBottom: "2px solid transparent",
    color: T.txtMute,
    fontSize: 12.5, fontWeight: 600,
    cursor: "pointer",
    marginBottom: -1,
  },
  rightTabActive: {
    color: T.txt,
    borderBottomColor: T.primary,
  },

  // Legacy tab content (keeps existing Content/Style/Layout JSX alive)
  tabContent: {
    flex: 1,
    overflowY: "auto",
    paddingBottom: 24,
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
    borderBottom: `1px solid ${T.bd}`,
    overflow: "hidden",
  },
  sectionHeader: {
    width: "100%",
    padding: "13px 16px",
    fontSize: 11.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ".08em",
    color: T.txtDim,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "none",
    border: "none",
  } as React.CSSProperties,
  sectionBody: {
    padding: "2px 16px 16px",
  },
  field: {
    marginBottom: 12,
  },
  label: {
    display: "block",
    fontSize: 11,
    color: T.txtDim,
    marginBottom: 5,
    fontWeight: 600,
    letterSpacing: "0.01em",
  },
  input: {
    width: "100%",
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: 7,
    color: T.txt,
    padding: "8px 11px",
    fontSize: 12.5,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s, background 0.15s",
  },
  colorPicker: {
    width: 34,
    height: 30,
    border: `1px solid ${T.bd}`,
    borderRadius: 6,
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
    padding: "9px 12px",
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: 8,
    color: T.txt,
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 600,
    textAlign: "left",
    transition: "border-color 0.15s, background 0.15s",
  },
  variantBtnActive: {
    borderColor: T.primary,
    background: T.primarySoft,
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
    marginBottom: 12,
    padding: "10px 12px",
    background: T.bg2,
    border: `1px solid ${T.bd}`,
    borderRadius: 8,
    color: T.primaryHover,
    fontSize: 11.5,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.5,
    wordBreak: "break-all",
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
    gap: 6,
    padding: "0 6px",
    overflowY: "auto" as const,
    maxHeight: 320,
  },
  sidebarPageEmpty: {
    padding: "10px 4px",
    color: "#888",
    fontSize: "0.75rem",
    textAlign: "center" as const,
  },
  sidebarPageCard: {
    border: "1px solid #2a2a46",
    borderRadius: 8,
    background: "#17172c",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 64,
  },
  sidebarPageCardActive: {
    borderColor: "#FFD700",
    background: "rgba(255,215,0,0.07)",
  },
  sidebarPageBtn: {
    display: "block",
    width: "100%",
    padding: "10px 10px 8px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  sidebarPageName: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "#f4f0df",
    lineHeight: 1.25,
    // Autorise 2 lignes puis ellipsis au lieu de couper brutalement sur la 1ère
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
    wordBreak: "break-word" as const,
  },
  sidebarPageMeta: {
    fontSize: "0.68rem",
    color: "#9999bb",
    marginTop: 4,
    fontFamily: "monospace",
  },
  sidebarPageActions: {
    display: "flex",
    borderTop: "1px solid #2a2a46",
  },
  sidebarIconBtn: {
    flex: 1,
    padding: "7px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#aaa",
    fontSize: "0.72rem",
    fontWeight: 600,
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
};
