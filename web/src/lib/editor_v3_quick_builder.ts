// ─────────────────────────────────────────────────────────────────────────────
// Editor V3 — Quick wizard → V2Page builder
//
// La V3 réutilise 100 % la pipeline V2 (zones + blocks + RenderV2Page +
// /r/<slug>). On construit un V2Page (modèle M4V2) en partant du starter M4V2
// et en remplaçant la zone "aboveCards" + en personnalisant les 2 cards.
//
// Contrainte produit : la page rendue doit être pixel-identique à la M4 V1
// SAUF la zone hero qui est remplacée par
//   [image de profil ronde] + [pseudo encadré] + [Déposez X€] + [Jouer à Y€]
//
// Les controls de style "rapide" (couleur/police/taille) sont appliqués par
// ligne via V2TextStyle.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type V2Page, type V2TextBlock, type V2ImageBlock, type V2ContainerBlock,
  type V2FsnCardM4Block, type V2TextStyle,
  makeV2BlockId,
} from "./editor_v2_types";
import { buildM4V2Starter } from "./editor_v2_starters";
import type { M5V1Variant } from "./m5_v1_apply";
import type { M1ThemeKey } from "./m1_themes";
import { getM1Theme } from "./m1_themes";
import { getPenaltyThemeColors, type V3PenaltyTeamKey } from "./v3_penalty_teams";

// ─── Presets style "rapide" ─────────────────────────────────────────────────

export const V3_FONT_PRESETS = [
  { key: "poppins",   label: "Poppins",     family: "Poppins" },
  { key: "inter",     label: "Inter",       family: "Inter" },
  { key: "bebas",     label: "Bebas Neue",  family: "Bebas Neue" },
  { key: "anton",     label: "Anton",       family: "Anton" },
  { key: "montser",   label: "Montserrat",  family: "Montserrat" },
] as const;

export const V3_COLOR_PRESETS = [
  { key: "white",  label: "Blanc",  value: "#ffffff" },
  { key: "gold",   label: "Or",     value: "#FFD700" },
  { key: "ruby",   label: "Rubis",  value: "#E0115F" },
  { key: "green",  label: "Vert",   value: "#00E676" },
  { key: "muted",  label: "Gris",   value: "#AAA4B0" },
] as const;

export const V3_SIZE_SCALE = [
  { key: "xs",  label: "XS",  fontSize: "0.95rem",                         fontSizeMobile: "0.9rem" },
  { key: "s",   label: "S",   fontSize: "1.15rem",                         fontSizeMobile: "1.05rem" },
  { key: "m",   label: "M",   fontSize: "1.5rem",                          fontSizeMobile: "1.3rem" },
  { key: "l",   label: "L",   fontSize: "clamp(1.6rem, 4vw, 2.4rem)",      fontSizeMobile: "1.6rem" },
  { key: "xl",  label: "XL",  fontSize: "clamp(2rem, 5vw, 3rem)",          fontSizeMobile: "2rem" },
  { key: "xxl", label: "XXL", fontSize: "clamp(2.4rem, 6vw, 3.6rem)",      fontSizeMobile: "2.4rem" },
] as const;

export const V3_WEIGHT_PRESETS = [
  { key: "regular",  label: "Normal",  value: 500 },
  { key: "bold",     label: "Bold",    value: 700 },
  { key: "black",    label: "Black",   value: 900 },
] as const;

export type V3SizeKey = typeof V3_SIZE_SCALE[number]["key"];
export type V3WeightKey = typeof V3_WEIGHT_PRESETS[number]["key"];

export interface V3LineStyle {
  font?: string;          // family direct (ex "Inter")
  color?: string;         // hex
  size?: V3SizeKey;
  weight?: V3WeightKey;
  glow?: boolean;         // applique un textShadow doux de la couleur
}

// ─── Catalogue d'images jeu ─────────────────────────────────────────────────

export const V3_GAME_IMAGES = [
  {
    key: "penalty",
    label: "Penalty",
    url: "https://cdn.phototourl.com/member/2026-04-09-240bb1e8-d188-4130-81ae-8e3f88143efc.png",
  },
  {
    key: "mines",
    label: "Mines",
    url: "https://cdn.phototourl.com/free/2026-04-09-c5dee0f7-cdad-427c-bd2e-bcbb6f4b24a6.png",
  },
  {
    key: "tower",
    label: "Tower",
    url: "https://cdn.phototourl.com/member/2026-04-10-ec62e857-165d-4a93-9cec-a314c7636d9c.jpg",
  },
  {
    key: "chicken",
    label: "Chicken",
    url: "https://cdn.phototourl.com/member/2026-04-10-af97004c-818f-40d3-b081-404c3ad3dfa7.png",
  },
] as const;

export type V3GameKey = typeof V3_GAME_IMAGES[number]["key"];

// ─── Aspect ratio + fit presets ────────────────────────────────────────────

export const V3_ASPECT_PRESETS = [
  { key: "16/9",  label: "16:9 (large)" },
  { key: "4/3",   label: "4:3" },
  { key: "1/1",   label: "1:1 (carré)" },
  { key: "21/9",  label: "21:9 (cinéma)" },
  { key: "3/4",   label: "3:4 (portrait)" },
] as const;

export type V3AspectKey = typeof V3_ASPECT_PRESETS[number]["key"];
export type V3ObjectFit = "cover" | "contain";

// ─── Inputs du wizard rapide ────────────────────────────────────────────────

export interface V3QuickInputs {
  /** Modèle utilisé :
   *   - M1 = duplication M4 V1 (cards + reviews)
   *   - M2 = duplication M5 V1 (golden chance, 8 variants)
   *   - M3 = Spinning Wheel (mini-jeu interactif)
   *   - M4 = Mystery Boxes (3 coffres, choisis-en 1)
   *   - M5 = Slot Machine (3 reels jackpot)
   *   - M6 = Mines (grille 3x3 diamants/bombe)
   *   - M7 = Plinko (bille à travers les pegs)
   *   - M8 = Penalty (tir au but, vise une zone) */
  modelKind: "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "M8" | "M9" | "M10";
  /** Variant M5 (uniquement utilisé quand modelKind === "M2"). */
  m5Variant?: M5V1Variant;
  /** URL du coffre custom (M2). Vide → garde le default variant-spécifique. */
  m5ChestUrl?: string;
  /** URL image jeux custom (M2, si visualMode=jeux). */
  m5JeuxUrl?: string;
  /** Mode visuel M2 : chest (default) / jeux / none. */
  m5VisualMode?: "chest" | "jeux" | "none";
  /** Background hero custom (M2). */
  m5BackgroundUrl?: string;
  /** M1 — applique un thème global (default true). Quand actif, la couleur
   *  individuelle de chaque ligne (pseudo / Recevez Y€) est IGNORÉE et
   *  remplacée par la couleur accent du thème. La graisse / la taille / la
   *  police restent éditables. Décocher → re-active la color picker par ligne. */
  m1UseTheme?: boolean;
  /** Thème M1 sélectionné (parmi 8 variants). */
  m1Theme?: M1ThemeKey;
  /** Override custom pour le bg-page (toujours appliqué, indépendant du thème). */
  m1CustomBgPage?: string;
  pseudo?: string;                 // optionnel
  affiLink: string;                // requis
  /** X (en €) — null = champ vidé : on cache la ligne « Déposez X€ ». */
  depositAmount: number | null;
  /** Y (en €) — null = champ vidé : on cache la ligne « Jouer à Y€ ». */
  bonusAmount: number | null;
  profileImageUrl?: string;        // ronde + bordure si fournie
  /** 2 images parmi penalty/mines/tower/chicken/custom URL. */
  card1Image: { kind: V3GameKey | "custom"; url: string };
  card2Image: { kind: V3GameKey | "custom"; url: string };
  /** Aspect ratio + fit appliqués aux 2 cards (uniformes pour cohérence visuelle). */
  cardAspect: V3AspectKey;
  cardObjectFit: V3ObjectFit;
  /** Styles par ligne (par défaut conservent les valeurs M4 V1). */
  pseudoStyle?: V3LineStyle;
  depositLineStyle?: V3LineStyle;
  bonusLineStyle?: V3LineStyle;
  /** M8 seulement: palette d'équipe appliquée au stade, au gardien et au CTA. */
  penaltyTeam?: V3PenaltyTeamKey;
  /** M10 seulement (landing Cyclope). */
  pseudoSub?: string;
  followersCount?: string;
  socialHandle?: string;
  gameImageUrl?: string;
  gameLabel?: string;
  gameBonusPct?: string;
}

export function defaultV3QuickInputs(modelKind: "M1" | "M2" = "M1"): V3QuickInputs {
  return {
    modelKind,
    pseudo: "",
    affiLink: "",
    depositAmount: modelKind === "M2" ? 20 : 10,
    bonusAmount: 20,
    profileImageUrl: "",
    card1Image: { kind: "penalty", url: V3_GAME_IMAGES[0].url },
    card2Image: { kind: "mines",   url: V3_GAME_IMAGES[1].url },
    cardAspect: "1/1",
    cardObjectFit: "cover",
    pseudoStyle:      { font: "Inter", color: "#FFD700", size: "xxl", weight: "black", glow: true },
    depositLineStyle: { font: "Inter", color: "#ffffff", size: "xl",  weight: "black" },
    bonusLineStyle:   { font: "Inter", color: "#FFD700", size: "xl",  weight: "black", glow: true },
    // M2 defaults
    m5Variant: "gold",
    m5VisualMode: "chest",
    m5ChestUrl: "",
    m5JeuxUrl: "",
    m5BackgroundUrl: "",
    // M1 theme defaults
    m1UseTheme: true,
    m1Theme: "gold",
    m1CustomBgPage: "",
    penaltyTeam: "france",
    // M10 defaults (Cyclope) — vides pour que l'editeur impose ses propres images/textes
    pseudoSub: "",
    followersCount: "",
    socialHandle: "",
    gameImageUrl: "",
    gameLabel: "",
    gameBonusPct: "",
  };
}

// ─── Style helper ───────────────────────────────────────────────────────────

function lineStyleToV2(s: V3LineStyle | undefined, fallbackColor = "#ffffff"): V2TextStyle {
  const sizeEntry = V3_SIZE_SCALE.find((x) => x.key === (s?.size || "l"))!;
  const weightEntry = V3_WEIGHT_PRESETS.find((x) => x.key === (s?.weight || "black"))!;
  const color = s?.color || fallbackColor;
  return {
    fontFamily:     s?.font || "Inter",
    fontSize:       sizeEntry.fontSize,
    fontSizeMobile: sizeEntry.fontSizeMobile,
    fontWeight:     weightEntry.value,
    color,
    letterSpacing:  "-0.5px",
    lineHeight:     "1.1",
    textShadow:     s?.glow ? `0 0 16px ${color}66` : undefined,
  };
}

// ─── Builder principal ──────────────────────────────────────────────────────

export function buildV3PageFromQuickInputs(inputs: V3QuickInputs): V2Page {
  // 1) Partir du starter M4V2 fidèle V1 (cards/reviews/faq/footer déjà OK).
  const page = buildM4V2Starter();

  // Résolution du theme M1 : si m1UseTheme=true on construit un objet theme
  // qui sera propagé sur toutes les blocs M4V1Card + le bloc lower sections,
  // ET utilisé pour overrider les couleurs de pseudo / Recevez Y€ ainsi que
  // le pseudoBox bg/border et le profile image border.
  const useTheme = inputs.m1UseTheme !== false;  // default true
  const theme = useTheme ? getM1Theme(inputs.m1Theme) : null;
  const themeColors = theme ? {
    accent: theme.accent,
    accentLight: theme.accentLight,
    accentGlow: theme.accentGlow,
    accentSoft: theme.accentSoft,
    accentBorder: theme.accentBorder,
    bgPage: theme.bgPage,
    bgCard: theme.bgCard,
    borderColor: theme.borderColor,
  } : undefined;

  // 2) Hero zone : remplacer les 3 blocs par défaut par notre composition V3.
  const aboveCards: V2Page["zones"]["aboveCards"] = [];

  // 2a) Image de profil ronde (si fournie)
  if (inputs.profileImageUrl && inputs.profileImageUrl.trim()) {
    const profileBlock: V2ImageBlock = {
      id: makeV2BlockId("image"),
      type: "image",
      name: "Image de profil",
      src: inputs.profileImageUrl.trim(),
      alt: inputs.pseudo || "Profil",
      width: "120px",
      height: "120px",
      objectFit: "cover",
      borderRadius: "50%",
      border: `3px solid ${theme?.accent || "#FFD700"}`,
      shadow: "0 8px 24px rgba(0,0,0,.45)",
      glow: theme?.accentGlow || "rgba(255,215,0,.45)",
      align: "center",
      marginTop: "0",
      marginBottom: "8px",
    };
    const wrap: V2ContainerBlock = {
      id: makeV2BlockId("container"),
      type: "container",
      name: "Wrapper image profil",
      layout: "stack",
      children: [profileBlock],
      justify: "center",
      itemsAlign: "center",
      marginTop: "8px",   // près du haut
      marginBottom: "4px",
    };
    aboveCards.push(wrap);
  }

  // 2b) Pseudo encadré (si fourni)
  if (inputs.pseudo && inputs.pseudo.trim()) {
    // Si theme actif → on force la couleur sur theme.accent (override style)
    const baseStyle = useTheme && theme
      ? { ...inputs.pseudoStyle, color: theme.accent, glow: true }
      : inputs.pseudoStyle;
    const pseudoStyle = lineStyleToV2(baseStyle, theme?.accent || "#FFD700");
    const pseudoText: V2TextBlock = {
      id: makeV2BlockId("text"),
      type: "text",
      name: "Pseudo",
      tag: "span",
      content: inputs.pseudo.trim(),
      align: "center",
      style: pseudoStyle,
    };
    const pseudoBox: V2ContainerBlock = {
      id: makeV2BlockId("container"),
      type: "container",
      name: "Cadre pseudo",
      layout: "stack",
      children: [pseudoText],
      justify: "center",
      itemsAlign: "center",
      bg: theme?.accentSoft || "rgba(255,214,0,.08)",
      border: `1px solid ${theme?.accentBorder || "rgba(255,214,0,.35)"}`,
      borderRadius: "999px",
      paddingX: "18px",
      paddingTop: "6px",
      paddingBottom: "6px",
      marginTop: inputs.profileImageUrl ? "0px" : "8px",  // pseudo près du haut
      marginBottom: "12px",   // ↑ petite séparation pseudo/offre
      maxWidth: "fit-content",
    };
    aboveCards.push(pseudoBox);
  }

  // 2c) "Déposez X€" — caché si X null
  if (inputs.depositAmount != null) {
    aboveCards.push({
      id: makeV2BlockId("text"),
      type: "text",
      name: "Ligne — Déposez X€",
      tag: "h1",
      content: `Déposez ${inputs.depositAmount}€`,
      align: "center",
      style: lineStyleToV2(inputs.depositLineStyle, "#ffffff"),
      marginBottom: "4px",
    });
  }

  // 2d) "Recevez Y€" — caché si Y null. Theme actif → couleur = theme.accent.
  if (inputs.bonusAmount != null) {
    const baseStyle = useTheme && theme
      ? { ...inputs.bonusLineStyle, color: theme.accent, glow: true }
      : inputs.bonusLineStyle;
    aboveCards.push({
      id: makeV2BlockId("text"),
      type: "text",
      name: "Ligne — Recevez Y€",
      tag: "h1",
      content: `Recevez ${inputs.bonusAmount}€`,
      align: "center",
      style: lineStyleToV2(baseStyle, theme?.accent || "#FFD700"),
      // marginBottom set below par règle "dernier visible".
    });
  }

  // En mode compactSpacing, les sections n'ont AUCUNE padding → le
  // dernier bloc impose directement la distance avec les cartes.
  // 20px = ~12px visible quand le float -8px atteint son pic, équivalent
  // à pseudo.marginBottom (12px) + buffer pour l'animation.
  const last = aboveCards[aboveCards.length - 1] as any;
  if (last) last.marginBottom = "20px";

  page.zones.aboveCards = aboveCards;
  page.compactSpacing = true;

  // Sections du bas : remplacer reviews + faq + footer par le bloc preset V1
  // (rend exactement le HTML/CSS de model4.html). Le sticky CTA est inclus.
  page.zones.reviews = [];
  page.zones.faq = [];
  page.zones.belowCards = [];
  page.zones.footer = [
    {
      id: makeV2BlockId("m4V1LowerSections"),
      type: "m4V1LowerSections",
      affiLink: inputs.affiLink,
      brandName: inputs.pseudo?.trim() || "",
      theme: themeColors,
    } as any,
  ];

  // 3) Cards : appliquer images, montants, lien d'affi.
  const cardsContainer = page.zones.cards[0] as V2ContainerBlock | undefined;
  if (cardsContainer && cardsContainer.type === "container") {
    const [c1, c2] = cardsContainer.children as V2FsnCardM4Block[];
    // Si null, on passe une string vide → M4V1Card masque la info-box.
    const dep = inputs.depositAmount != null ? `${inputs.depositAmount}€` : "";
    const bon = inputs.bonusAmount != null ? `${inputs.bonusAmount}€` : "";
    if (c1 && c1.type === "fsnCardM4") {
      c1.imgSrc = inputs.card1Image.url || c1.imgSrc;
      c1.imgAlt = inputs.card1Image.kind;
      c1.depositAmount = dep;
      c1.bonusAmount = bon;
      c1.href = inputs.affiLink;
      c1.imageAspectRatio = inputs.cardAspect;
      c1.imageObjectFit = inputs.cardObjectFit;
      c1.theme = themeColors;
    }
    if (c2 && c2.type === "fsnCardM4") {
      c2.imgSrc = inputs.card2Image.url || c2.imgSrc;
      c2.imgAlt = inputs.card2Image.kind;
      c2.depositAmount = dep;
      c2.bonusAmount = bon;
      c2.href = inputs.affiLink;
      c2.imageAspectRatio = inputs.cardAspect;
      c2.imageObjectFit = inputs.cardObjectFit;
      c2.theme = themeColors;
    }
  }

  // 4) Affi link / code → slug.
  page.affiLink = inputs.affiLink;
  try {
    const u = new URL(inputs.affiLink);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    page.affiCode = last.replace(/[^A-Za-z0-9_-]/g, "");
  } catch {
    page.affiCode = "";
  }
  // V3 : slug = <code>V3 (différencie des slugs V2 <code>M4 / <code>M5)
  page.slug = page.affiCode ? `${page.affiCode}V3` : "";
  page.casinoName = inputs.pseudo?.trim() || page.affiCode || "Page V3";
  page.pageTitle = page.casinoName;

  // 5) Globals : bg-page (theme ou override custom), accent, etc.
  page.globals = {
    ...page.globals,
    bgPage: inputs.m1CustomBgPage?.trim() || theme?.bgPage || page.globals.bgPage,
    bgCard: theme?.bgCard || page.globals.bgCard,
    brandGold: theme?.accent || page.globals.brandGold,
    borderColor: theme?.borderColor || page.globals.borderColor,
  };

  return page;
}

// ─── Builder M3-M6 — pages mini-jeux ────────────────────────────────────────
//
// Pour M3-M6, la page = un seul bloc preset full-page (V2V3GameModelBlock)
// qui rend l'intégralité de la landing (hero + mini-jeu + CTA). Architecture
// très simple : un V2Page minimaliste avec une seule zone (cards) contenant
// ce bloc.
export function buildV3GameModelPage(inputs: V3QuickInputs): V2Page {
  const kind = inputs.modelKind as "M3" | "M4" | "M5" | "M6" | "M7" | "M8" | "M9" | "M10";
  const useTheme = inputs.m1UseTheme !== false;
  const theme = useTheme ? getM1Theme(inputs.m1Theme) : null;
  const baseThemeColors = theme ? {
    accent: theme.accent,
    accentLight: theme.accentLight,
    accentGlow: theme.accentGlow,
    accentSoft: theme.accentSoft,
    accentBorder: theme.accentBorder,
    bgPage: inputs.m1CustomBgPage?.trim() || theme.bgPage,
    bgCard: theme.bgCard,
    borderColor: theme.borderColor,
  } : (inputs.m1CustomBgPage?.trim() ? { bgPage: inputs.m1CustomBgPage.trim() } : undefined);
  const penaltyThemeColors = kind === "M8" ? getPenaltyThemeColors(inputs.penaltyTeam) : undefined;
  const themeColors = penaltyThemeColors || baseThemeColors;

  // Si thème actif → la couleur du pseudo suit le thème (override sur le
  // pseudoStyle, preserve font/size/weight/glow user). Si thème off, on
  // garde la couleur custom choisie par l'user dans le LineStylePicker.
  const pseudoAccent = themeColors?.accent || (useTheme && theme ? theme.accent : undefined);
  const pseudoStyleResolved = pseudoAccent
    ? { ...inputs.pseudoStyle, color: pseudoAccent, glow: true }
    : inputs.pseudoStyle;

  // V2Page minimal : zones quasi vides, juste un bloc full-page dans `cards`
  // + le bloc preset M4V1LowerSections en footer pour les sections reviews/
  // FAQ/footer/sticky CTA (identique à M1, conversion-driver important).
  const page: V2Page = {
    modelKind: "M4V2",  // pour le typing renderer; ne sert qu'au routing zone
    affiCode: "",
    affiLink: inputs.affiLink,
    casinoName: inputs.pseudo?.trim() || kind,
    slug: "",
    pageTitle: inputs.pseudo?.trim() || kind,
    compactSpacing: true,
    zones: {
      aboveCards: [],
      cards: [
        {
          id: makeV2BlockId("v3GameModel"),
          type: "v3GameModel",
          gameKind: kind,
          pseudo: inputs.pseudo,
          profileImageUrl: inputs.profileImageUrl,
          depositAmount: inputs.depositAmount,
          bonusAmount: inputs.bonusAmount,
          affiLink: inputs.affiLink,
          theme: themeColors,
          penaltyTeam: inputs.penaltyTeam,
          // M10 (Cyclope) — passe les champs uniquement quand pertinent
          pseudoSub: inputs.pseudoSub,
          followersCount: inputs.followersCount,
          socialHandle: inputs.socialHandle,
          gameImageUrl: inputs.gameImageUrl,
          gameLabel: inputs.gameLabel,
          gameBonusPct: inputs.gameBonusPct,
          pseudoStyle: pseudoStyleResolved,
        } as any,
      ],
      belowCards: [],
      reviews: [],
      faq: [],
      footer: [
        {
          id: makeV2BlockId("m4V1LowerSections"),
          type: "m4V1LowerSections",
          affiLink: inputs.affiLink,
          brandName: inputs.pseudo?.trim() || "",
          theme: themeColors,
        } as any,
      ],
    },
    globals: {
      bgPage: themeColors?.bgPage || inputs.m1CustomBgPage?.trim() || theme?.bgPage || "#080212",
      brandGold: themeColors?.accent || "#FFD700",
    },
  };

  // Slug
  try {
    const u = new URL(inputs.affiLink);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    page.affiCode = last.replace(/[^A-Za-z0-9_-]/g, "");
  } catch { page.affiCode = ""; }
  page.slug = page.affiCode ? `${page.affiCode}V3` : "";

  return page;
}

/** Dispatch principal : route vers le bon builder selon modelKind. */
export function buildV3PageDispatch(inputs: V3QuickInputs): V2Page | null {
  if (inputs.modelKind === "M1") return buildV3PageFromQuickInputs(inputs);
  if (inputs.modelKind === "M2") return null;  // M2 utilise V1 pipeline (pas V2Page)
  return buildV3GameModelPage(inputs);
}
